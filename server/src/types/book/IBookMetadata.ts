/**
 * The one shape every external metadata provider is normalized into before
 * `POST /book/isbn/:isbn` touches the database.
 *
 * Before this existed, `fetchBookData` returned Google Books' own
 * `volumeInfo` object and the Open Library fallback hand-rolled a lookalike -
 * two conventions in one function, and no way to merge one source's answer
 * into another's. Every provider now converts into this instead, so merging
 * is a field-by-field operation rather than a `??` chain between two
 * differently-shaped objects.
 *
 * Absent means `null` (or `[]`), never `undefined` and never `0`: Google
 * answers `pageCount: 0` for books it has no pagination for, which a `??`
 * merge would happily keep. `fromGoogleVolumeInfo` collapses that to `null`
 * at the edge so nothing downstream has to remember it.
 */
export interface IBookMetadata {
    /** Title only - no subtitle, no statement of responsibility. */
    title: string | null;
    /** Display names ("Freida McFadden"), authors only - no translators or editors. */
    authors: string[];
    description: string | null;
    /** Subject headings, most specific first. Only the first is used today. */
    categories: string[];
    publisher: string | null;
    /** Whatever the provider gave: "2025", "2025-10-08"... `formatPublishedDate` normalizes it. */
    publishedDate: string | null;
    /** Positive page count, or null. Never 0 - see the note above. */
    pageCount: number | null;
    /** Raw provider language code, ISO 639-1 *or* 639-2/B. `normalizeLanguageCode` maps it. */
    language: string | null;
    /** A cover URL the provider handed us directly, if any. */
    imageUrl: string | null;
}

/** An empty record to merge into. */
export function emptyBookMetadata(): IBookMetadata {
    return {
        title: null,
        authors: [],
        description: null,
        categories: [],
        publisher: null,
        publishedDate: null,
        pageCount: null,
        language: null,
        imageUrl: null,
    };
}
