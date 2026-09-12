/**
 * The three-source ISBN lookup: which providers get called, in what order,
 * and how their answers are merged.
 *
 * The Google Books bodies below are the *measured* answers for these exact
 * ISBNs with a working API key - notably `pageCount: 0` and a missing
 * publisher on the French titles, which is the whole reason the BnF is in the
 * chain. The BnF bodies are the recorded SRU fixtures from
 * `test/fixtures/bnf/`. Nothing here reaches the network.
 */
import {beforeEach, describe, expect, it} from "bun:test";
import fs from "fs";
import path from "path";
import {jsonResponse, mockedFetch, useMockedFetch} from "../helpers/fetchMock";
import {
    isBookMetadataComplete,
    isFrenchLanguageIsbn,
    lookupBookMetadata,
    mergeBookMetadata,
    normalizeLanguageCode,
} from "../../src/utils/BookMetadata";
import {emptyBookMetadata} from "../../src/types/book/IBookMetadata";

useMockedFetch();

beforeEach(() => {
    mockedFetch.mockReset();
});

const LE_BOYFRIEND = "9782824627151";
const ENGLISH_ISBN = "9780261102217";

function fixture(name: string): string {
    return fs.readFileSync(path.join(__dirname, "..", "fixtures", "bnf", `${name}.xml`), "utf-8");
}

/** The measured Google Books answer for 9782824627151: found, but full of holes. */
function googlePartialFrench() {
    return {
        items: [
            {
                volumeInfo: {
                    title: "Le boyfriend",
                    authors: ["Freida McFadden"],
                    publishedDate: "2025-10-08",
                    description: "Comme beaucoup de femmes célibataires de New York...",
                    language: "fr",
                    imageLinks: {thumbnail: "https://books.google.com/books/content?id=abc"},
                    // No `publisher`, no `categories`, and:
                    pageCount: 0,
                },
            },
        ],
    };
}

/** A book Google knows everything about. */
function googleComplete() {
    return {
        items: [
            {
                volumeInfo: {
                    title: "The Lord of the Rings",
                    authors: ["J.R.R. Tolkien"],
                    publisher: "HarperCollins",
                    publishedDate: "1991",
                    description: "One ring to rule them all.",
                    categories: ["Fiction"],
                    pageCount: 1178,
                    language: "en",
                    imageLinks: {thumbnail: "https://books.google.com/books/content?id=xyz"},
                },
            },
        ],
    };
}

/** Every URL the run made, in order. */
function requestedUrls(): string[] {
    return mockedFetch.mock.calls.map((call: unknown[]) => String(call[0]));
}

function called(host: string): boolean {
    return requestedUrls().some(url => url.includes(host));
}

describe("normalizeLanguageCode", () => {
    it("passes a two-letter code through", () => {
        expect(normalizeLanguageCode("fr")).toBe("fr");
        expect(normalizeLanguageCode(" EN ")).toBe("en");
    });

    /**
     * ISO 639-2/B is the *bibliographic* variant: its codes come from the
     * English or French name of the language, not the language's own. So
     * French is `fre`, not `fra`, and German is `ger`, not `deu` - which is
     * exactly the pair a naive "just take the first two letters" would get
     * wrong ("fr" by luck, "ge" by mistake).
     */
    it("maps the three-letter codes the BnF and Open Library emit", () => {
        expect(normalizeLanguageCode("fre")).toBe("fr");
        expect(normalizeLanguageCode("eng")).toBe("en");
        expect(normalizeLanguageCode("ger")).toBe("de");
        expect(normalizeLanguageCode("dut")).toBe("nl");
        expect(normalizeLanguageCode("por")).toBe("pt");
    });

    it("accepts the terminology spellings too", () => {
        expect(normalizeLanguageCode("fra")).toBe("fr");
        expect(normalizeLanguageCode("deu")).toBe("de");
        expect(normalizeLanguageCode("nld")).toBe("nl");
    });

    it("drops anything that is not a language, rather than overflow CHAR(2)", () => {
        expect(normalizeLanguageCode("unknown")).toBeNull();
        // A real 639-2 code with no 639-1 equivalent.
        expect(normalizeLanguageCode("mul")).toBeNull();
        expect(normalizeLanguageCode(null)).toBeNull();
        expect(normalizeLanguageCode("")).toBeNull();
    });
});

describe("isFrenchLanguageIsbn", () => {
    it("recognises the French-language registration group", () => {
        expect(isFrenchLanguageIsbn("9782824627151")).toBe(true);
        expect(isFrenchLanguageIsbn("9791091146142")).toBe(true);
        expect(isFrenchLanguageIsbn("2070360024")).toBe(true);
    });

    it("rejects everything else", () => {
        expect(isFrenchLanguageIsbn("9780261102217")).toBe(false);
        expect(isFrenchLanguageIsbn("9783518188064")).toBe(false);
        expect(isFrenchLanguageIsbn("0261102214")).toBe(false);
    });
});

describe("mergeBookMetadata", () => {
    it("fills holes without overwriting what is already there", () => {
        const base = {...emptyBookMetadata(), title: "Le boyfriend", pageCount: null};
        const incoming = {...emptyBookMetadata(), title: "Something else", publisher: "City roman", pageCount: 391};

        expect(mergeBookMetadata(base, incoming)).toMatchObject({
            title: "Le boyfriend",
            publisher: "City roman",
            pageCount: 391,
        });
    });

    it("treats a non-empty list as filled", () => {
        const base = {...emptyBookMetadata(), authors: ["Freida McFadden"]};
        const incoming = {...emptyBookMetadata(), authors: ["Someone Else"], categories: ["Fiction"]};

        expect(mergeBookMetadata(base, incoming)).toMatchObject({
            authors: ["Freida McFadden"],
            categories: ["Fiction"],
        });
    });
});

describe("isBookMetadataComplete", () => {
    const full = {
        ...emptyBookMetadata(),
        title: "t",
        authors: ["a"],
        description: "d",
        publisher: "p",
        publishedDate: "2020",
        pageCount: 100,
        language: "fr",
    };

    it("holds when nothing is left for another source to add", () => {
        expect(isBookMetadataComplete(full)).toBe(true);
    });

    it("does not hold for a zeroed page count", () => {
        expect(isBookMetadataComplete({...full, pageCount: 0})).toBe(false);
    });

    it("ignores categories and cover, which two of the three sources never have", () => {
        expect(isBookMetadataComplete({...full, categories: [], imageUrl: null})).toBe(true);
    });
});

describe("lookupBookMetadata - chain order and thrift", () => {
    it("passes the requesting region to Google Books", async () => {
        mockedFetch.mockImplementation(() => Promise.resolve(jsonResponse(googleComplete())));

        await lookupBookMetadata(ENGLISH_ISBN, "a-key", "CA");

        const googleUrl = requestedUrls().find(url => url.includes("googleapis.com"));
        expect(googleUrl).toContain("country=CA");
    });

    it("stops after Google when Google has everything", () => {
        mockedFetch.mockImplementation(() => Promise.resolve(jsonResponse(googleComplete())));

        return lookupBookMetadata(ENGLISH_ISBN, "a-key").then(result => {
            expect(result.metadata).toMatchObject({title: "The Lord of the Rings", pageCount: 1178});
            expect(result.sources).toEqual(["google-books"]);
            expect(requestedUrls()).toHaveLength(1);
            expect(called("catalogue.bnf.fr")).toBe(false);
            expect(called("openlibrary.org")).toBe(false);
        });
    });

    /**
     * The point of the whole change: Google *finds* this book, so a chain
     * that only falls back when the primary returns nothing would have
     * stopped here with no publisher and `pages = 0` in the database.
     */
    it("fills Google's holes from the BnF on a French ISBN", async () => {
        mockedFetch.mockImplementation((input: string | URL) => {
            const url = String(input);
            if (url.includes("googleapis.com")) return Promise.resolve(jsonResponse(googlePartialFrench()));
            if (url.includes("catalogue.bnf.fr")) {
                return Promise.resolve(new Response(fixture("le-boyfriend-9782824627151")));
            }
            return Promise.resolve(jsonResponse({}));
        });

        const result = await lookupBookMetadata(LE_BOYFRIEND, "a-key");

        expect(result.metadata).toMatchObject({
            // Google's, kept - it answered first.
            title: "Le boyfriend",
            authors: ["Freida McFadden"],
            language: "fr",
            publishedDate: "2025-10-08",
            imageUrl: "https://books.google.com/books/content?id=abc",
            // The BnF's, filled in.
            publisher: "City roman",
            pageCount: 391,
        });
        expect(result.sources).toEqual(["google-books", "bnf"]);
        // Both sources answered and nothing is left worth a third request.
        expect(called("openlibrary.org")).toBe(false);
    });

    it("does not spend a request on the BnF for a non-French ISBN it found elsewhere", async () => {
        mockedFetch.mockImplementation((input: string | URL) => {
            const url = String(input);
            if (url.includes("googleapis.com")) {
                // Found, but missing a publisher - still no reason to ask a
                // French legal-deposit catalogue about a 978-0 ISBN.
                const body = googleComplete();
                body.items[0].volumeInfo.publisher = undefined as any;
                return Promise.resolve(jsonResponse(body));
            }
            return Promise.resolve(jsonResponse({}));
        });

        const result = await lookupBookMetadata(ENGLISH_ISBN, "a-key");

        expect(result.metadata?.title).toBe("The Lord of the Rings");
        expect(called("openlibrary.org")).toBe(true);
        expect(called("catalogue.bnf.fr")).toBe(false);
    });

    it("still asks the BnF about a non-French ISBN when nothing else has it", async () => {
        mockedFetch.mockImplementation((input: string | URL) => {
            const url = String(input);
            if (url.includes("catalogue.bnf.fr")) {
                return Promise.resolve(new Response(fixture("christian-arts-in-china-9787508519913")));
            }
            return Promise.resolve(jsonResponse({}));
        });

        const result = await lookupBookMetadata("9787508519913", "a-key");

        expect(result.metadata).toMatchObject({title: "Christian arts in China", language: "eng"});
        expect(result.sources).toEqual(["bnf"]);
    });
});

describe("lookupBookMetadata - when a source is missing or broken", () => {
    it("reports Google as unconfigured instead of calling it", async () => {
        mockedFetch.mockImplementation((input: string | URL) =>
            Promise.resolve(
                String(input).includes("catalogue.bnf.fr")
                    ? new Response(fixture("la-prof-9782824629094"))
                    : jsonResponse({})
            )
        );

        const result = await lookupBookMetadata("9782824629094", undefined);

        expect(result.unconfigured).toEqual(["google-books"]);
        expect(called("googleapis.com")).toBe(false);
        expect(result.metadata).toMatchObject({title: "La prof", pageCount: 388});
        expect(result.sources).toEqual(["bnf"]);
    });

    it("retries a Google 503 rather than falling through it", async () => {
        let attempts = 0;
        mockedFetch.mockImplementation((input: string | URL) => {
            if (!String(input).includes("googleapis.com")) return Promise.resolve(jsonResponse({}));
            attempts += 1;
            return Promise.resolve(
                attempts < 3
                    ? jsonResponse({error: "Service temporarily unavailable"}, 503)
                    : jsonResponse(googleComplete())
            );
        });

        const result = await lookupBookMetadata(ENGLISH_ISBN, "a-key");

        expect(attempts).toBe(3);
        expect(result.metadata?.title).toBe("The Lord of the Rings");
        expect(result.failed).toEqual([]);
    });

    it("keeps a working source's answer when the BnF fails", async () => {
        mockedFetch.mockImplementation((input: string | URL) => {
            const url = String(input);
            if (url.includes("googleapis.com")) return Promise.resolve(jsonResponse(googlePartialFrench()));
            if (url.includes("catalogue.bnf.fr")) return Promise.resolve(jsonResponse({}, 500));
            return Promise.resolve(jsonResponse({}));
        });

        const result = await lookupBookMetadata(LE_BOYFRIEND, "a-key");

        // Degraded, not failed: the holes stay holes.
        expect(result.metadata).toMatchObject({title: "Le boyfriend", publisher: null, pageCount: null});
        expect(result.sources).toEqual(["google-books"]);
        expect(result.failed).toEqual(["bnf"]);
    });

    it("reports every source failing, distinctly from every source missing", async () => {
        mockedFetch.mockImplementation(() => Promise.resolve(jsonResponse({}, 500)));

        const result = await lookupBookMetadata(LE_BOYFRIEND, "a-key");

        expect(result.metadata).toBeNull();
        expect(result.failed).toEqual(["google-books", "bnf", "open-library"]);
        expect(result.sources).toEqual([]);
    });

    it("reports a genuine gap with no failures at all", async () => {
        mockedFetch.mockImplementation((input: string | URL) =>
            Promise.resolve(
                String(input).includes("catalogue.bnf.fr")
                    ? new Response(fixture("no-match-9789999999999"))
                    : jsonResponse({docs: []})
            )
        );

        const result = await lookupBookMetadata(LE_BOYFRIEND, "a-key");

        expect(result.metadata).toBeNull();
        expect(result.failed).toEqual([]);
        expect(result.sources).toEqual([]);
    });

    it("survives a network error from a provider", async () => {
        mockedFetch.mockImplementation((input: string | URL) => {
            if (String(input).includes("googleapis.com")) return Promise.reject(new Error("ETIMEDOUT"));
            if (String(input).includes("catalogue.bnf.fr")) {
                return Promise.resolve(new Response(fixture("le-boyfriend-9782824627151")));
            }
            return Promise.resolve(jsonResponse({}));
        });

        const result = await lookupBookMetadata(LE_BOYFRIEND, "a-key");

        expect(result.failed).toEqual(["google-books"]);
        expect(result.metadata).toMatchObject({title: "Le boyfriend", pageCount: 391});
    });
});
