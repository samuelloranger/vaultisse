/**
 * =============================================================================
 * BookMetadataRefresh
 * =============================================================================
 * The decision half of `POST /book/:id/refresh`: given what a book already
 * holds and what the provider chain just returned, work out which columns may
 * be written and which must be left alone.
 *
 * It is deliberately pure - no database, no `fetch`, no clock. The route does
 * the I/O (read the row, run `lookupBookMetadata`, apply the plan in one
 * transaction); everything that could quietly destroy somebody's typing is
 * decided here, where it can be tested exhaustively without a network.
 *
 * ### Two rules, and they are the whole feature
 *
 * **1. A human edit is never clobbered.** The default mode is `"fill"`: a
 * field is written only when the book has nothing there. Someone who fixed a
 * title by hand, wrote their own description or uploaded a cover keeps all
 * three, however confidently a catalogue disagrees. `"overwrite"` exists, but
 * it is a separate, explicitly-labelled choice that the client has to ask for
 * by name - and even then it never *empties* a field: a source with nothing
 * to say about `publisher` leaves the publisher alone rather than nulling it.
 *
 * **2. Nothing is invented.** A field absent from every source stays absent
 * and is reported in `stillMissing`. There is no placeholder category, no
 * "Uncategorised" default, no author reconstructed from a statement of
 * responsibility, no publisher guessed from an imprint. A refresh that fills
 * nothing is a correct, honest outcome, and the plan says so by coming back
 * with no changes rather than by writing something in.
 *
 * ### `0` is missing, not a value
 *
 * `pages = 0` is the residue of a bug, not something a source ever asserted:
 * Google answers `pageCount: 0` for books it has no pagination for, and until
 * `370a3b6` that zero went into the column verbatim. Treating it as a real
 * value would make the books that most need this feature the ones it refuses
 * to touch - so a `0` (and a blank string, and whitespace) counts as empty
 * everywhere below.
 *
 * ### The cover is fill-only, in both modes
 *
 * `image_url` is the one field with its own upload endpoint, and a cover
 * somebody photographed and uploaded by hand is unambiguously a human edit -
 * there is no "the catalogue's version is better" case for it. Overwrite mode
 * therefore skips it rather than trading a real cover for a thumbnail.
 *
 * ### Authors are added, never unlinked
 *
 * `book_authors` is a link table shared with the author screens, and a source
 * that files a translator under an unqualified relator code would otherwise
 * be able to delete a correct author. In `"fill"` a book that already has any
 * author is left alone entirely; in `"overwrite"` unknown names are added to
 * the existing ones. Nothing here ever removes a link.
 */
import { IBookMetadata } from "../types/book/IBookMetadata";
import { BookMetadataProvenance, MetadataSourceId } from "./BookMetadata";

/**
 * A field of a book as this feature names it on the wire.
 *
 * Column names where they exist (`pages`, `publisher`, `published_date`), the
 * *relationship* name where the column is a foreign key (`category`,
 * `language`, `authors`), because "category_id: 7" is not something to show a
 * person.
 */
export type BookMetadataField =
    | "name"
    | "description"
    | "image_url"
    | "category"
    | "publisher"
    | "published_date"
    | "pages"
    | "language"
    | "authors";

/** `"fill"` writes only empty fields; `"overwrite"` also replaces filled ones. See the file header. */
export type RefreshMode = "fill" | "overwrite";

/**
 * A book's metadata flattened to the shape the planner compares.
 *
 * Both sides of the comparison use it: the route builds one from the `books`
 * row (plus the category's *name* and the author names, so the plan can talk
 * about values rather than ids) and one from the merged provider record, run
 * through exactly the same truncation/date/language normalisation the create
 * path uses. Comparing a normalised value against a raw one is how an
 * "always changed" field is born.
 */
export interface IBookMetadataSnapshot {
    name: string | null;
    description: string | null;
    imageUrl: string | null;
    /** The category's *name*, not its id - the planner never sees a `categories` row. */
    categoryName: string | null;
    publisher: string | null;
    /** `YYYY-MM-DD`, already normalised. */
    publishedDate: string | null;
    pages: number | null;
    /** Two-letter ISO 639-1, already normalised. */
    languageCode: string | null;
    /** Display names, in no particular order. */
    authors: string[];
}

/** One field the refresh would change, with where the new value came from. */
export interface IBookFieldChange {
    field: BookMetadataField;
    /** What the book holds today. `null` when empty; `0` for the page-count bug. */
    from: string | number | null;
    to: string | number;
    /** The provider that supplied `to`, or `null` if it is not attributable (see the cover fallback). */
    source: MetadataSourceId | null;
}

/** What a refresh would do. Apply it, or show it - it is the same object either way. */
export interface IBookMetadataRefreshPlan {
    changes: IBookFieldChange[];
    /**
     * Fields that are empty on the book and that no source could fill. The
     * honest half of the answer: this is what tells the owner that *nobody*
     * has a category for their French genre fiction, rather than leaving them
     * to wonder whether the button worked.
     */
    stillMissing: BookMetadataField[];
    /** Author names to link, already filtered against the ones the book has. Empty unless `changes` names `authors`. */
    authorsToLink: string[];
}

/** Empty means: absent, or a string with nothing in it. */
function isBlank(value: string | null | undefined): boolean {
    return value === null || value === undefined || value.trim() === "";
}

/** Empty means: absent, or Google's `0`. See the file header. */
function isBlankPageCount(pages: number | null | undefined): boolean {
    return pages === null || pages === undefined || pages <= 0;
}

/** Which field of the provider record backs each field of a book. */
const PROVENANCE_KEY: Record<BookMetadataField, keyof IBookMetadata> = {
    name: "title",
    description: "description",
    image_url: "imageUrl",
    category: "categories",
    publisher: "publisher",
    published_date: "publishedDate",
    pages: "pageCount",
    language: "language",
    authors: "authors",
};

/**
 * Work out what a refresh of `current` from `incoming` would change.
 *
 * @param current    The book as it stands. Author names and the category name,
 *                   not ids.
 * @param incoming   The merged provider record, normalised the same way.
 * @param provenance Which provider supplied each field of `incoming`.
 * @param mode       `"fill"` (default everywhere) or `"overwrite"`.
 */
export function planMetadataRefresh(
    current: IBookMetadataSnapshot,
    incoming: IBookMetadataSnapshot,
    provenance: BookMetadataProvenance,
    mode: RefreshMode
): IBookMetadataRefreshPlan {
    const changes: IBookFieldChange[] = [];
    const stillMissing: BookMetadataField[] = [];

    const sourceOf = (field: BookMetadataField): MetadataSourceId | null => provenance[PROVENANCE_KEY[field]] ?? null;

    /**
     * @param fillOnly Never replace a value that is already there, whatever
     *                 the mode - see the cover note in the file header.
     */
    const considerText = (
        field: BookMetadataField,
        currentValue: string | null,
        incomingValue: string | null,
        fillOnly = false
    ) => {
        if (isBlank(incomingValue)) {
            // No source has one. Say so; do not make one up.
            if (isBlank(currentValue)) stillMissing.push(field);
            return;
        }

        const next = incomingValue as string;

        if (isBlank(currentValue)) {
            changes.push({ field, from: null, to: next, source: sourceOf(field) });
            return;
        }

        if (mode === "overwrite" && !fillOnly && (currentValue as string).trim() !== next.trim()) {
            changes.push({ field, from: currentValue, to: next, source: sourceOf(field) });
        }
    };

    considerText("name", current.name, incoming.name);
    considerText("description", current.description, incoming.description);
    // The cover never loses to a catalogue thumbnail. Fill-only in both modes.
    considerText("image_url", current.imageUrl, incoming.imageUrl, true);
    considerText("category", current.categoryName, incoming.categoryName);
    considerText("publisher", current.publisher, incoming.publisher);
    considerText("published_date", current.publishedDate, incoming.publishedDate);
    considerText("language", current.languageCode, incoming.languageCode);

    // Pages, where the `0` rule lives.
    if (isBlankPageCount(incoming.pages)) {
        if (isBlankPageCount(current.pages)) stillMissing.push("pages");
    } else if (isBlankPageCount(current.pages)) {
        // `from` is reported as-is (`0` or `null`) rather than normalised: the
        // owner should see the bogus zero being replaced.
        changes.push({
            field: "pages",
            from: current.pages,
            to: incoming.pages as number,
            source: sourceOf("pages"),
        });
    } else if (mode === "overwrite" && current.pages !== incoming.pages) {
        changes.push({
            field: "pages",
            from: current.pages,
            to: incoming.pages as number,
            source: sourceOf("pages"),
        });
    }

    // Authors: add-only, and only when the book has none unless overwriting.
    const incomingAuthors = incoming.authors.filter((name) => !isBlank(name));
    const currentAuthors = current.authors.filter((name) => !isBlank(name));
    const held = new Set(currentAuthors.map((name) => name.trim().toLowerCase()));
    const unknown = incomingAuthors.filter((name) => !held.has(name.trim().toLowerCase()));

    const authorsToLink =
        incomingAuthors.length === 0
            ? []
            : currentAuthors.length === 0
              ? incomingAuthors
              : mode === "overwrite"
                ? unknown
                : [];

    if (incomingAuthors.length === 0 && currentAuthors.length === 0) {
        stillMissing.push("authors");
    }

    if (authorsToLink.length > 0) {
        changes.push({
            field: "authors",
            from: currentAuthors.length > 0 ? currentAuthors.join(", ") : null,
            to: [...currentAuthors, ...authorsToLink].join(", "),
            source: sourceOf("authors"),
        });
    }

    return { changes, stillMissing, authorsToLink };
}
