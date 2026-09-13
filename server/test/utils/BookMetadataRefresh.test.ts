import { IBookMetadataSnapshot, planMetadataRefresh } from "../../src/utils/BookMetadataRefresh";
import { BookMetadataProvenance } from "../../src/utils/BookMetadata";

/**
 * The planner is where every "did the refresh just destroy my typing" question
 * is settled, so it is tested here without a database or a network: each case
 * is one book, one provider answer and one assertion about what may be
 * written.
 *
 * The production damage this feature exists for is the fixture: a French
 * paperback with a title, a cover and `pages = 0`, and nothing else.
 */

function snapshot(overrides: Partial<IBookMetadataSnapshot> = {}): IBookMetadataSnapshot {
    return {
        name: null,
        description: null,
        imageUrl: null,
        categoryName: null,
        publisher: null,
        publishedDate: null,
        pages: null,
        languageCode: null,
        authors: [],
        ...overrides,
    };
}

/** A book as production actually holds it: catalogued by the Google-only path, with the zero. */
const damagedBook = snapshot({
    name: "Le boyfriend",
    description: "Comme beaucoup de femmes célibataires de New York...",
    imageUrl: "https://books.google.com/books/content?id=abc",
    pages: 0,
    languageCode: "fr",
    authors: ["Freida McFadden"],
});

/** What the chain returns for it today: Google's fields plus the BnF's publisher and pagination. */
const fullAnswer = snapshot({
    name: "Le boyfriend",
    description: "Comme beaucoup de femmes célibataires de New York...",
    imageUrl: "https://books.google.com/books/content?id=abc",
    publisher: "City roman",
    publishedDate: "2025-10-08",
    pages: 391,
    languageCode: "fr",
    authors: ["Freida McFadden"],
});

const provenance: BookMetadataProvenance = {
    title: "google-books",
    description: "google-books",
    imageUrl: "google-books",
    language: "google-books",
    authors: "google-books",
    publisher: "bnf",
    publishedDate: "bnf",
    pageCount: "bnf",
};

describe("planMetadataRefresh - fill mode", () => {
    it("fills the publisher and page count a pre-merge book is missing, and says where each came from", () => {
        const plan = planMetadataRefresh(damagedBook, fullAnswer, provenance, "fill");

        expect(plan.changes).toEqual([
            { field: "publisher", from: null, to: "City roman", source: "bnf" },
            { field: "published_date", from: null, to: "2025-10-08", source: "bnf" },
            { field: "pages", from: 0, to: 391, source: "bnf" },
        ]);
    });

    // The whole reason `0` cannot be treated as a value: it is the residue of
    // the bug this feature exists to repair, so the books that most need
    // fixing would be the ones a naive "only write nulls" rule refused.
    it("treats pages = 0 as missing, not as a value worth keeping", () => {
        const plan = planMetadataRefresh(
            snapshot({ name: "L'intruse", pages: 0 }),
            snapshot({ name: "L'intruse", pages: 362 }),
            { pageCount: "bnf" },
            "fill"
        );

        expect(plan.changes).toEqual([{ field: "pages", from: 0, to: 362, source: "bnf" }]);
    });

    it("treats an empty string as missing too", () => {
        const plan = planMetadataRefresh(
            snapshot({ name: "A book", publisher: "   " }),
            snapshot({ name: "A book", publisher: "City" }),
            { publisher: "bnf" },
            "fill"
        );

        expect(plan.changes).toEqual([{ field: "publisher", from: null, to: "City", source: "bnf" }]);
    });

    it("leaves every hand-edited field alone", () => {
        const edited = snapshot({
            name: "A title someone fixed by hand",
            description: "A description someone wrote themselves.",
            imageUrl: "data:image/png;base64,AAAA",
            publisher: "The publisher they typed",
            pages: 400,
            languageCode: "fr",
            categoryName: "Thriller",
            authors: ["Freida McFadden"],
        });

        const plan = planMetadataRefresh(edited, fullAnswer, provenance, "fill");

        expect(plan.changes).toEqual([{ field: "published_date", from: null, to: "2025-10-08", source: "bnf" }]);
    });

    it("changes nothing at all on a book that is already complete", () => {
        const plan = planMetadataRefresh(fullAnswer, fullAnswer, provenance, "fill");

        expect(plan.changes).toEqual([]);
        expect(plan.authorsToLink).toEqual([]);
    });
});

describe("planMetadataRefresh - nothing is invented", () => {
    // The owner's four books, measured: Google returns `categories: None` and
    // the BnF records carry no 606 subject heading. No source has a category
    // for French genre fiction, and the answer to that is to say so.
    it("leaves a category no source has empty, and reports it as still missing", () => {
        const plan = planMetadataRefresh(damagedBook, fullAnswer, provenance, "fill");

        expect(plan.changes.some((change) => change.field === "category")).toBe(false);
        expect(plan.stillMissing).toContain("category");
    });

    it("reports every unfillable empty field rather than writing a placeholder", () => {
        const plan = planMetadataRefresh(
            snapshot({ name: "A bare record" }),
            snapshot({ name: "A bare record" }),
            { title: "bnf" },
            "fill"
        );

        expect(plan.changes).toEqual([]);
        expect(plan.stillMissing.sort()).toEqual([
            "authors",
            "category",
            "description",
            "image_url",
            "language",
            "pages",
            "published_date",
            "publisher",
        ]);
    });

    it("does not null out a field the book has and the sources do not", () => {
        const plan = planMetadataRefresh(
            snapshot({ name: "A book", publisher: "City", pages: 391 }),
            snapshot({ name: "A book" }),
            { title: "google-books" },
            "overwrite"
        );

        expect(plan.changes).toEqual([]);
        expect(plan.stillMissing).not.toContain("publisher");
    });
});

describe("planMetadataRefresh - overwrite mode", () => {
    it("replaces a filled field, naming what it replaces", () => {
        const plan = planMetadataRefresh(
            snapshot({ name: "Le boyfriend", publisher: "City", pages: 12 }),
            snapshot({ name: "Le boyfriend", publisher: "City roman", pages: 391 }),
            { publisher: "bnf", pageCount: "bnf" },
            "overwrite"
        );

        expect(plan.changes).toEqual([
            { field: "publisher", from: "City", to: "City roman", source: "bnf" },
            { field: "pages", from: 12, to: 391, source: "bnf" },
        ]);
    });

    // The one field with its own upload endpoint. A cover somebody
    // photographed is unambiguously a human edit, and no catalogue thumbnail
    // is worth trading it for.
    it("never replaces a cover, even when asked to overwrite", () => {
        const plan = planMetadataRefresh(
            snapshot({ name: "A book", imageUrl: "data:image/png;base64,AAAA" }),
            snapshot({ name: "A book", imageUrl: "https://books.google.com/thumb" }),
            { imageUrl: "google-books" },
            "overwrite"
        );

        expect(plan.changes).toEqual([]);
    });

    it("fills a missing cover in either mode", () => {
        for (const mode of ["fill", "overwrite"] as const) {
            const plan = planMetadataRefresh(
                snapshot({ name: "A book" }),
                snapshot({ name: "A book", imageUrl: "https://covers.openlibrary.org/x-M.jpg" }),
                { imageUrl: "open-library" },
                mode
            );

            expect(plan.changes).toEqual([
                {
                    field: "image_url",
                    from: null,
                    to: "https://covers.openlibrary.org/x-M.jpg",
                    source: "open-library",
                },
            ]);
        }
    });
});

describe("planMetadataRefresh - authors", () => {
    it("links the source's authors when the book has none", () => {
        const plan = planMetadataRefresh(
            snapshot({ name: "L'intruse" }),
            snapshot({ name: "L'intruse", authors: ["Freida McFadden"] }),
            { authors: "bnf" },
            "fill"
        );

        expect(plan.authorsToLink).toEqual(["Freida McFadden"]);
        expect(plan.changes).toEqual([{ field: "authors", from: null, to: "Freida McFadden", source: "bnf" }]);
    });

    it("leaves an author list the book already has completely alone in fill mode", () => {
        const plan = planMetadataRefresh(
            snapshot({ name: "L'intruse", authors: ["F. McFadden"] }),
            snapshot({ name: "L'intruse", authors: ["Freida McFadden", "Karine Xaragai"] }),
            { authors: "bnf" },
            "fill"
        );

        expect(plan.authorsToLink).toEqual([]);
        expect(plan.changes).toEqual([]);
    });

    it("adds unknown authors in overwrite mode without unlinking the known ones", () => {
        const plan = planMetadataRefresh(
            snapshot({ name: "A book", authors: ["Ann Author"] }),
            snapshot({ name: "A book", authors: ["ann author", "Bee Writer"] }),
            { authors: "google-books" },
            "overwrite"
        );

        // Matched case-insensitively, so re-adding "Ann Author" is not a change.
        expect(plan.authorsToLink).toEqual(["Bee Writer"]);
        expect(plan.changes).toEqual([
            { field: "authors", from: "Ann Author", to: "Ann Author, Bee Writer", source: "google-books" },
        ]);
    });

    it("adds nothing on a second overwrite run", () => {
        const plan = planMetadataRefresh(
            snapshot({ name: "A book", authors: ["Ann Author", "Bee Writer"] }),
            snapshot({ name: "A book", authors: ["Ann Author", "Bee Writer"] }),
            { authors: "google-books" },
            "overwrite"
        );

        expect(plan.authorsToLink).toEqual([]);
        expect(plan.changes).toEqual([]);
    });
});
