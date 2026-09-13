/**
 * =============================================================================
 * BookMetadata
 * =============================================================================
 * The ISBN metadata lookup behind `POST /book/isbn/:isbn`: three providers,
 * one normalized shape, and a field-by-field merge between them.
 *
 * ### Why a merge and not a fallback chain
 *
 * It used to be a chain - Google Books, and on any failure Open Library -
 * where the first source to answer won outright. That is the wrong shape for
 * what actually comes back. Measured on `9782824627151` (*Le boyfriend*,
 * City roman, 2025) with a working Google key:
 *
 * | field         | Google Books | Open Library | BnF                 |
 * |---------------|--------------|--------------|---------------------|
 * | title         | yes          | -            | yes                 |
 * | authors       | yes          | -            | yes                 |
 * | description   | yes          | never any    | yes (French blurb)  |
 * | cover         | yes          | -            | never any           |
 * | language      | yes          | -            | yes (`fre`)         |
 * | publisher     | **missing**  | -            | `City roman`        |
 * | categories    | **missing**  | -            | sometimes           |
 * | pageCount     | **`0`**      | -            | `391`               |
 *
 * Open Library has nothing at all for it (`numFound: 0`), and its French
 * trade coverage is poor in general rather than transient. Google answers but
 * incompletely. So the only way to get a whole book out of this is to take
 * what Google gave and fill the holes from the BnF - which is what
 * `mergeBookMetadata` does, first writer wins.
 *
 * ### Order
 *
 * Google Books, then (French ISBNs) BnF, then Open Library.
 *
 * Google leads even for French books despite being the weakest of the three
 * on them, because it is the only one of the three that returns a **cover**,
 * and it answers in ~200ms. Leading with the BnF would mean either stopping
 * there and losing the cover, or calling Google straight afterwards anyway -
 * no request saved, and a worse result.
 *
 * The BnF is consulted second for an ISBN in the French-language group, where
 * it is strong and Open Library is empty, and last otherwise. For a non-French
 * ISBN it is skipped altogether unless nothing was found at all: its
 * `bib.isbn` index is built from French legal deposit and returns zero
 * records for 978-0 and 978-3 ISBNs, so spending a round trip on one is
 * latency for nothing - and Scan mode fires these back-to-back.
 *
 * A provider is skipped entirely once `isBookMetadataComplete` holds, so a
 * lookup that already has everything makes no further request.
 */
import { IBookMetadata, emptyBookMetadata } from "../types/book/IBookMetadata";
import { ExternalHttpError } from "./ExternalHttpError";
import { fetchBnfMetadata } from "./BnfUnimarc";
import { validatedRegion } from "./Regions";

export type MetadataSourceId = "google-books" | "open-library" | "bnf";

/**
 * Which provider supplied each field of the merged record.
 *
 * The merge is first-writer-wins, so exactly one provider owns each field and
 * "which one" is knowable - it just used to be thrown away. `sources` says
 * *that* the BnF contributed; this says the BnF is where the `391` came from,
 * which is what the refresh flow shows the user field by field
 * ("Pages - 391, from the BnF"). A field no provider had is simply absent.
 */
export type BookMetadataProvenance = Partial<Record<keyof IBookMetadata, MetadataSourceId>>;

/** Outcome of one lookup, with enough detail for the route to say *why* it found nothing. */
export interface IBookLookupResult {
    /** The merged record, or null when no provider had this ISBN. */
    metadata: IBookMetadata | null;
    /** Providers that contributed at least one field, in the order they ran. */
    sources: MetadataSourceId[];
    /** Which provider each field of `metadata` came from. See {@link BookMetadataProvenance}. */
    provenance: BookMetadataProvenance;
    /** Providers that could not run because the deployment has not configured them. */
    unconfigured: MetadataSourceId[];
    /** Providers that were called and failed (non-2xx, timeout, network error). */
    failed: MetadataSourceId[];
}

/**
 * ISO 639-2/B (bibliographic) to ISO 639-1, for the three-letter codes both
 * the BnF (`101$a`) and Open Library (`language: ["eng"]`) hand back.
 *
 * 639-2/B is the trap here: it is the *bibliographic* variant, whose codes
 * are derived from the English or French name of the language rather than
 * from the language's own name - so French is `fre` (not `fra`), German is
 * `ger` (not `deu`) and Dutch is `dut` (not `nld`). Both spellings are
 * mapped, since a record may carry either.
 */
const ISO_639_2_TO_1: Record<string, string> = {
    alb: "sq",
    sqi: "sq",
    ara: "ar",
    arm: "hy",
    hye: "hy",
    baq: "eu",
    eus: "eu",
    bul: "bg",
    cat: "ca",
    chi: "zh",
    zho: "zh",
    cze: "cs",
    ces: "cs",
    dan: "da",
    dut: "nl",
    nld: "nl",
    eng: "en",
    est: "et",
    fin: "fi",
    fre: "fr",
    fra: "fr",
    ger: "de",
    deu: "de",
    gre: "el",
    ell: "el",
    heb: "he",
    hin: "hi",
    hun: "hu",
    ice: "is",
    isl: "is",
    ind: "id",
    gle: "ga",
    ita: "it",
    jpn: "ja",
    kor: "ko",
    lat: "la",
    lav: "lv",
    lit: "lt",
    nor: "no",
    per: "fa",
    fas: "fa",
    pol: "pl",
    por: "pt",
    rum: "ro",
    ron: "ro",
    rus: "ru",
    slo: "sk",
    slk: "sk",
    slv: "sl",
    spa: "es",
    swe: "sv",
    tur: "tr",
    ukr: "uk",
    vie: "vi",
    wel: "cy",
    cym: "cy",
};

/**
 * `languages.code` / `books.language_code` are CHAR(2), so a value has to
 * come out as a clean two-letter ISO 639-1 code or not at all.
 *
 * Three-letter codes used to be dropped here, which quietly cost every book
 * its language: the BnF only ever emits them, and Open Library's search
 * endpoint answers `language: ["eng"]`. They are mapped now; anything still
 * unrecognised ("unknown", `mul`, a language with no 639-1 code) is dropped
 * rather than overflowing the column.
 */
export function normalizeLanguageCode(language: string | null | undefined): string | null {
    if (!language) return null;

    const code = language.trim().toLowerCase();

    if (/^[a-z]{2}$/.test(code)) {
        return code;
    }

    return ISO_639_2_TO_1[code] ?? null;
}

/**
 * Is this ISBN in the French-language registration group?
 *
 * `978-2` is the group for French *as a language* - France, Belgium, French
 * Canada and French-speaking Switzerland all register in it - and `979-10` is
 * the newer France-only prefix. In the 10-digit form the group is the leading
 * `2`. A cheap, exact signal for "the BnF is likely to hold this", with no
 * request needed to find out.
 */
export function isFrenchLanguageIsbn(isbn: string): boolean {
    const digits = isbn.replace(/[^0-9X]/gi, "");

    if (digits.length === 13) {
        return digits.startsWith("9782") || digits.startsWith("97910");
    }

    return digits.length === 10 && digits.startsWith("2");
}

/**
 * Fold `incoming` into `base`, field by field: whatever `base` already has
 * wins, and every hole `incoming` can fill gets filled. Arrays are all-or-
 * nothing (a non-empty list is not merged with another source's list, which
 * would interleave two different cataloguing vocabularies).
 *
 * `pageCount` is a plain `??` and stays correct only because every provider
 * normalizes Google's `pageCount: 0` to `null` on the way in - see
 * `IBookMetadata`.
 */
export function mergeBookMetadata(base: IBookMetadata, incoming: IBookMetadata): IBookMetadata {
    return {
        title: base.title ?? incoming.title,
        authors: base.authors.length > 0 ? base.authors : incoming.authors,
        description: base.description ?? incoming.description,
        categories: base.categories.length > 0 ? base.categories : incoming.categories,
        publisher: base.publisher ?? incoming.publisher,
        publishedDate: base.publishedDate ?? incoming.publishedDate,
        pageCount: base.pageCount ?? incoming.pageCount,
        language: base.language ?? incoming.language,
        imageUrl: base.imageUrl ?? incoming.imageUrl,
    };
}

/**
 * Is there anything left for another provider to add?
 *
 * `categories` and `imageUrl` are deliberately **not** required. The BnF
 * never returns a cover and only carries subject headings for non-fiction,
 * and Open Library's metadata call returns neither - so demanding them would
 * mean every lookup ran the whole chain and still came up "incomplete",
 * which is the opposite of not paying for what you do not need. The cover has
 * its own fallback (`fetchOpenLibraryCover`) and an uncategorised book is a
 * normal thing to have.
 */
export function isBookMetadataComplete(metadata: IBookMetadata): boolean {
    return Boolean(
        metadata.title &&
            metadata.authors.length > 0 &&
            metadata.description &&
            metadata.publisher &&
            metadata.publishedDate &&
            metadata.pageCount &&
            metadata.language
    );
}

/**
 * Look `isbn` up across every configured provider and return one merged
 * record, plus what happened - which sources contributed, which were not
 * configured, and which failed.
 *
 * Never throws: a provider that fails is recorded in `failed` and the others
 * carry on. `metadata` is null only when no provider had the book.
 */
export async function lookupBookMetadata(
    isbn: string,
    googleApiKey: string | undefined,
    region = "US"
): Promise<IBookLookupResult> {
    const country = validatedRegion(region);
    const french = isFrenchLanguageIsbn(isbn);
    const order: MetadataSourceId[] = french
        ? ["google-books", "bnf", "open-library"]
        : ["google-books", "open-library", "bnf"];

    const result: IBookLookupResult = {
        metadata: null,
        sources: [],
        provenance: {},
        unconfigured: [],
        failed: [],
    };
    let merged = emptyBookMetadata();
    let found = false;

    for (const source of order) {
        if (found && isBookMetadataComplete(merged)) {
            break;
        }

        if (source === "google-books" && !googleApiKey) {
            result.unconfigured.push(source);
            continue;
        }

        // The BnF indexes French legal deposit and holds essentially nothing
        // under a foreign ISBN, so it only earns a round trip on a non-French
        // ISBN when everything else came up empty.
        if (source === "bnf" && !french && found) {
            continue;
        }

        let answer: IBookMetadata | null;

        try {
            answer = await __callProvider(source, isbn, googleApiKey, country);
        } catch (error) {
            console.warn(`Metadata provider ${source} failed:`, error);
            result.failed.push(source);
            continue;
        }

        if (!answer) {
            continue;
        }

        const before = merged;
        merged = mergeBookMetadata(merged, answer);
        found = true;

        const filled = __fieldsFilled(before, merged);

        if (filled.length > 0) {
            result.sources.push(source);

            for (const field of filled) {
                result.provenance[field] = source;
            }
        }
    }

    result.metadata = found ? merged : null;
    return result;
}

function __callProvider(
    source: MetadataSourceId,
    isbn: string,
    googleApiKey: string | undefined,
    region: string
): Promise<IBookMetadata | null> {
    switch (source) {
        case "google-books":
            return __fetchGoogleBooks(isbn, String(googleApiKey), 3, region);
        case "open-library":
            return __fetchOpenLibrary(isbn);
        case "bnf":
            return fetchBnfMetadata(isbn);
    }
}

/**
 * Which fields this provider filled that were empty before it ran - so both
 * "did it contribute at all" and "which of these values are its" come out of
 * one comparison.
 *
 * The merge is first-writer-wins, so a field can only ever go from empty to
 * filled here; a provider that merely repeated a value we already had changes
 * nothing and returns an empty list.
 */
function __fieldsFilled(before: IBookMetadata, after: IBookMetadata): (keyof IBookMetadata)[] {
    const filled: (keyof IBookMetadata)[] = [];

    if (before.title !== after.title) filled.push("title");
    if (before.authors.length !== after.authors.length) filled.push("authors");
    if (before.description !== after.description) filled.push("description");
    if (before.categories.length !== after.categories.length) filled.push("categories");
    if (before.publisher !== after.publisher) filled.push("publisher");
    if (before.publishedDate !== after.publishedDate) filled.push("publishedDate");
    if (before.pageCount !== after.pageCount) filled.push("pageCount");
    if (before.language !== after.language) filled.push("language");
    if (before.imageUrl !== after.imageUrl) filled.push("imageUrl");

    return filled;
}

/**
 * =========================================================
 * PROVIDER: GOOGLE BOOKS (with retry + backoff)
 * =========================================================
 * Retries a rate-limit (429) and a transient server error (5xx), which are
 * the two answers worth asking again for - Google returns `503 Service
 * temporarily unavailable` often enough to matter (two calls in six, in one
 * measured run) and a 503 used to fall straight through to the fallback,
 * turning a book Google has into a book nobody has.
 *
 * Bounded at three attempts either way. A 429 backs off in whole seconds
 * because the quota needs time to refill; a 5xx backs off in 300ms steps
 * because it does not, and Scan mode is waiting.
 */
async function __fetchGoogleBooks(
    isbn: string,
    apiKey: string,
    retries = 3,
    region = "US"
): Promise<IBookMetadata | null> {
    try {
        const url = new URL("https://www.googleapis.com/books/v1/volumes");
        url.searchParams.set("q", `isbn:${isbn}`);
        url.searchParams.set("key", apiKey);
        url.searchParams.set("country", region);

        const response = await fetch(url, {
            signal: AbortSignal.timeout(9000),
            headers: { "User-Agent": "vaultisse-server/1.0" },
        });

        // `fetch` resolves on 4xx/5xx where axios rejected, so the status has
        // to be turned back into a throw - the retry below and the caller's
        // failure accounting both depend on it.
        if (!response.ok) {
            throw new ExternalHttpError(response.status, "Google Books");
        }

        const data = (await response.json()) as any;
        const volume = data?.items?.[0]?.volumeInfo;

        return volume ? __fromGoogleVolumeInfo(volume) : null;
    } catch (error: unknown) {
        const retryable = error instanceof ExternalHttpError && (error.status === 429 || error.status >= 500);

        if (retryable && retries > 0) {
            const step = 4 - retries;
            const delay = (error as ExternalHttpError).status === 429 ? step * 1000 : step * 300;

            await new Promise((r) => setTimeout(r, delay));

            return __fetchGoogleBooks(isbn, apiKey, retries - 1, region);
        }

        throw error;
    }
}

/** Google's `volumeInfo`, normalized. */
function __fromGoogleVolumeInfo(volume: any): IBookMetadata {
    return {
        title: volume.title ?? null,
        authors: Array.isArray(volume.authors) ? volume.authors : [],
        description: volume.description ?? null,
        categories: Array.isArray(volume.categories) ? volume.categories : [],
        publisher: volume.publisher ?? null,
        publishedDate: volume.publishedDate ?? null,
        // `pageCount: 0` means "we don't know", not "a book with no pages".
        // Left as 0 it survives every `??` downstream and lands in books.pages
        // as a zero, and no other source ever gets asked.
        pageCount: typeof volume.pageCount === "number" && volume.pageCount > 0 ? volume.pageCount : null,
        language: volume.language ?? null,
        imageUrl: volume.imageLinks?.thumbnail ?? null,
    };
}

/**
 * =========================================================
 * PROVIDER: OPEN LIBRARY
 * =========================================================
 */
async function __fetchOpenLibrary(isbn: string): Promise<IBookMetadata | null> {
    const response = await fetch(`https://openlibrary.org/search.json?isbn=${encodeURIComponent(isbn)}`, {
        signal: AbortSignal.timeout(9000),
    });

    // A non-2xx is a failed lookup, not an empty one.
    if (!response.ok) {
        throw new ExternalHttpError(response.status, "Open Library");
    }

    const data = (await response.json()) as any;

    // The search endpoint returns matches under `docs`, not on the top-level object.
    const doc = data?.docs?.[0];

    if (!doc) {
        return null;
    }

    return {
        title: doc.title ?? null,
        authors: Array.isArray(doc.author_name) ? doc.author_name : [],
        // `search.json` carries no description at all - not an omission here.
        description: null,
        categories: Array.isArray(doc.subject) ? doc.subject : [],
        publisher: doc.publisher?.[0] ?? null,
        publishedDate: doc.first_publish_year ? String(doc.first_publish_year) : null,
        pageCount:
            typeof doc.number_of_pages_median === "number" && doc.number_of_pages_median > 0
                ? doc.number_of_pages_median
                : null,
        // Three-letter ISO 639-2/B, same as the BnF - normalizeLanguageCode maps it.
        language: doc.language?.[0] ?? null,
        // The covers API is a separate call, see fetchOpenLibraryCover.
        imageUrl: null,
    };
}

/**
 * =========================================================
 * OPEN LIBRARY COVER
 * =========================================================
 * The cover of last resort, used when no provider handed back an image URL.
 * Neither the BnF nor Open Library's metadata call returns one, so for a
 * French trade title this is often the only shot at a cover - and it often
 * misses, which is why the client lets you upload one.
 */
export async function fetchOpenLibraryCover(isbn: string): Promise<string | null> {
    try {
        const url = `https://covers.openlibrary.org/b/isbn/${encodeURIComponent(isbn)}-M.jpg`;

        // A missing cover answers 404 here, which `fetch` resolves rather
        // than throwing - hence the explicit status check. The body is never
        // read (only its existence and type matter), so it is cancelled.
        const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
        await response.body?.cancel();

        const contentType = String(response.headers.get("content-type") ?? "");

        if (response.status === 200 && contentType.startsWith("image/")) {
            return url;
        }

        return null;
    } catch {
        return null;
    }
}
