import fs from "fs";
import path from "path";
import { alwaysJson, imageResponse, jsonResponse, mockedFetch, useMockedFetch } from "../helpers/fetchMock";
import { setupTestApp } from "../helpers/testApp";
import { createAuthenticatedUser, ITestUser } from "../helpers/auth";
import { appService, normalizeGoogleApiKey } from "../../src/AppService";
import { isAllowedImageUrl } from "../../src/routes/BooksRoute";

/**
 * Run `body` with a Google Books key configured on the shared `appService`.
 *
 * `test/setup/preload.ts` forces GOOGLE_BOOKS_API_KEY empty for the whole run
 * so that no test silently depends on a developer's own key, which leaves the
 * *configured* branch of the lookup otherwise unreachable. The field is
 * `readonly` to TypeScript only; this sets it for the duration of one test
 * and always puts it back.
 */
async function withGoogleApiKey<T>(key: string | undefined, body: () => Promise<T>): Promise<T> {
    const previous = appService.getGoogleApiKey();
    (appService as any).m_googleApiKey = key;
    try {
        return await body();
    } finally {
        (appService as any).m_googleApiKey = previous;
    }
}

const app = setupTestApp();
useMockedFetch();

let user: ITestUser;

describe("isAllowedImageUrl", () => {
    it("requires HTTPS for direct Renaud-Bray cover URLs", () => {
        expect(isAllowedImageUrl("https://images.renaud-bray.com/images/PG/4490/4490625-gf.jpg")).toBe(true);
        expect(isAllowedImageUrl("http://images.renaud-bray.com/images/PG/4490/4490625-gf.jpg")).toBe(false);
    });
});

beforeEach(async () => {
    user = await createAuthenticatedUser(app);
    mockedFetch.mockReset();
});

/**
 * A fresh, checksum-valid ISBN-13 per call.
 *
 * Under one shared library `books_isbn_unique` is instance-wide, so a fixed
 * ISBN shared between tests in this file would make the second test to run see
 * the first test's book - a false failure that has nothing to do with what's
 * being asserted. Each test that cares about ISBNs gets its own.
 */
let isbnCounter = 0;
function freshIsbn(): string {
    isbnCounter += 1;
    const body = `978${String(Date.now() % 1e6).padStart(6, "0")}${String(isbnCounter % 1000).padStart(3, "0")}`;
    let sum = 0;
    for (let i = 0; i < 12; i++) {
        sum += (i % 2 === 0 ? 1 : 3) * Number(body[i]);
    }
    return body + String((10 - (sum % 10)) % 10);
}

describe("POST /book (manual create)", () => {
    it("creates a book with just a name", async () => {
        const res = await user.agent.post("/api/rest/book").field("name", "The Hobbit");
        expect(res.status).toBe(200);
        expect(typeof res.body).toBe("number");
    });

    it("rejects a duplicate ISBN", async () => {
        const isbn = freshIsbn();
        await user.agent.post("/api/rest/book").field("name", "Book One").field("isbn", isbn);
        const res = await user.agent.post("/api/rest/book").field("name", "Book Two").field("isbn", isbn);
        expect(res.status).toBe(404);
    });

    // Inverted from upstream's "allows the same ISBN across different users".
    // books_isbn_unique is instance-wide now: the household owns one copy of a
    // title, entered once. A second member scanning the same barcode must be
    // told it's already on the shelf, not silently given a parallel entry.
    it("rejects the same ISBN from a different account", async () => {
        const otherUser = await createAuthenticatedUser(app);
        const isbn = freshIsbn();
        const first = await user.agent.post("/api/rest/book").field("name", "Shared ISBN Book").field("isbn", isbn);
        expect(first.status).toBe(200);

        const res = await otherUser.agent.post("/api/rest/book").field("name", "Shared ISBN Book").field("isbn", isbn);
        expect(res.status).toBe(404);
    });

    it("stamps created_by with the account that added the book", async () => {
        const res = await user.agent.post("/api/rest/book").field("name", "Attributed Book");
        expect(res.status).toBe(200);

        const { rows } = await appService
            .getDatabasePool()
            .query("SELECT u.code FROM books b JOIN users u ON u.id = b.created_by WHERE b.id = $1", [res.body]);
        expect(rows).toHaveLength(1);
        expect(rows[0].code).toBe(user.userCode);
    });
});

describe("GET /book/:id", () => {
    it("fetches a book", async () => {
        const createRes = await user.agent.post("/api/rest/book").field("name", "The Hobbit");
        const id = createRes.body;

        const res = await user.agent.get(`/api/rest/book/${id}`);
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ id, name: "The Hobbit" });
        expect(res.body.authors).toEqual([]);
        expect(res.body.stocks).toEqual([]);
    });

    // Inverted from upstream's "404s for a book belonging to another user".
    // One shared library: a book any member adds is readable - and editable,
    // and deletable - by every other member.
    it("serves a book another account added, and lets them edit it", async () => {
        const createRes = await user.agent.post("/api/rest/book").field("name", "Shared Book");
        const id = createRes.body;

        const otherUser = await createAuthenticatedUser(app);
        const res = await otherUser.agent.get(`/api/rest/book/${id}`);
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ id, name: "Shared Book" });

        const updateRes = await otherUser.agent.put(`/api/rest/book/${id}`).send({
            name: "Edited By Someone Else",
            authors: [],
        });
        expect(updateRes.status).toBe(200);

        // The edit lands on the one shared row, not a private copy.
        const ownerRes = await user.agent.get(`/api/rest/book/${id}`);
        expect(ownerRes.body).toMatchObject({ id, name: "Edited By Someone Else" });

        const deleteRes = await otherUser.agent.delete(`/api/rest/book/${id}`);
        expect(deleteRes.status).toBe(200);
    });

    it("404s for a nonexistent id", async () => {
        const res = await user.agent.get("/api/rest/book/999999999");
        expect(res.status).toBe(404);
    });
});

describe("PUT /book/:id", () => {
    it("updates fields and reconciles the author list", async () => {
        const createRes = await user.agent.post("/api/rest/book").field("name", "Draft Title");
        const id = createRes.body;

        const authorRes = await user.agent.post("/api/rest/author").send({ name: "Jane Author" });
        const authorId = authorRes.body.id;

        const updateRes = await user.agent.put(`/api/rest/book/${id}`).send({
            name: "Final Title",
            description: "A great book.",
            isbn: null,
            category_id: null,
            language_code: null,
            authors: [authorId],
            publisher: "Acme",
            published_date: "2020-01-01",
            pages: 42,
            format_id: null,
        });
        expect(updateRes.status).toBe(200);

        const getRes = await user.agent.get(`/api/rest/book/${id}`);
        expect(getRes.body).toMatchObject({ name: "Final Title", description: "A great book.", publisher: "Acme" });
        expect(getRes.body.authors).toEqual([{ id: authorId, name: "Jane Author" }]);
    });

    it("404s updating a book that doesn't exist", async () => {
        const res = await user.agent.put("/api/rest/book/999999999").send({ name: "X" });
        expect(res.status).toBe(404);
    });
});

describe("DELETE /book/:id", () => {
    it("deletes a book", async () => {
        const createRes = await user.agent.post("/api/rest/book").field("name", "Disposable Book");
        const id = createRes.body;

        const deleteRes = await user.agent.delete(`/api/rest/book/${id}`);
        expect(deleteRes.status).toBe(200);

        const getRes = await user.agent.get(`/api/rest/book/${id}`);
        expect(getRes.status).toBe(404);
    });

    it("404s for a nonexistent book", async () => {
        const res = await user.agent.delete("/api/rest/book/999999999");
        expect(res.status).toBe(404);
    });
});

describe("GET /book/search", () => {
    it("finds a book by (partial, case-insensitive) name", async () => {
        await user.agent.post("/api/rest/book").field("name", "The Great Gatsby");
        const res = await user.agent.get("/api/rest/book/search").query({ query: "great gatsby" });
        expect(res.status).toBe(200);
        expect(res.body.books.some((b: any) => b.name === "The Great Gatsby")).toBe(true);
    });

    // Inverted from upstream's "only returns the caller's own books".
    it("returns books added by any account", async () => {
        const otherUser = await createAuthenticatedUser(app);
        const created = await otherUser.agent.post("/api/rest/book").field("name", "Added By Someone Else");

        const res = await user.agent.get("/api/rest/book/search").query({ query: "Added By Someone Else" });
        expect(res.status).toBe(200);
        expect(res.body.books.some((b: any) => b.id === created.body)).toBe(true);
    });

    /**
     * `conditions` is joined with ' AND ' and the free-text clause contains an
     * OR. Unparenthesised, AND binds tighter and the ISBN branch escapes every
     * other filter in the list - upstream's cross-account leak, and here still
     * a correctness bug: an ISBN match would ignore the category filter.
     */
    it("keeps the free-text OR from escaping the other filters", async () => {
        const categoryRes = await user.agent.post("/api/rest/category").send({ name: `Precedence ${Date.now()}` });
        const categoryId = categoryRes.body.id;

        const isbn = freshIsbn();
        // Carries the searched-for ISBN but is NOT in the filtered category.
        const outsider = await user.agent
            .post("/api/rest/book")
            .field("name", "Outside The Category")
            .field("isbn", isbn);

        const res = await user.agent.get("/api/rest/book/search").query({ query: isbn, category_id: categoryId });
        expect(res.status).toBe(200);
        expect(res.body.books.some((b: any) => b.id === outsider.body)).toBe(false);
        expect(res.body.total).toBe(0);
    });

    it("filters by category_id", async () => {
        const categoryRes = await user.agent.post("/api/rest/category").send({ name: "Sci-Fi Search Test" });
        const categoryId = categoryRes.body.id;

        const createRes = await user.agent.post("/api/rest/book").field("name", "Categorized Book");
        await user.agent.put(`/api/rest/book/${createRes.body}`).send({
            name: "Categorized Book",
            category_id: categoryId,
            authors: [],
        });

        const res = await user.agent.get("/api/rest/book/search").query({ category_id: categoryId });
        expect(res.body.books.some((b: any) => b.id === createRes.body)).toBe(true);
    });
});

describe("GET /book/counters", () => {
    it("counts the shared library's books", async () => {
        const before = await user.agent.get("/api/rest/book/counters");
        expect(before.status).toBe(200);

        await user.agent.post("/api/rest/book").field("name", "Counted Book");

        const res = await user.agent.get("/api/rest/book/counters");
        expect(res.status).toBe(200);
        expect(res.body.total).toBe(before.body.total + 1);
    });

    // Counters describe the collection, not the caller's contributions.
    it("counts a book another account added", async () => {
        const contributor = await createAuthenticatedUser(app);
        const before = await user.agent.get("/api/rest/book/counters");

        await contributor.agent.post("/api/rest/book").field("name", "Counted Someone Else's Book");

        const after = await user.agent.get("/api/rest/book/counters");
        expect(after.body.total).toBe(before.body.total + 1);
    });
});

describe("POST /book/isbn/:isbn (external metadata lookup)", () => {
    /**
     * GOOGLE_BOOKS_API_KEY is forced empty in tests (see test/setup/testEnv.js),
     * so `fetchBookData` always takes the Open Library fallback branch, never
     * the Google Books one - this mocks that branch's two calls (metadata
     * search, then the covers API) by URL, rather than assuming either
     * provider specifically. If a real key is ever configured, this
     * intentionally isn't what would run in production.
     */
    function mockOpenLibraryMetadata(overrides: { title?: string; authorName?: string[]; pages?: number } = {}) {
        mockedFetch.mockImplementation((input: string | URL) => {
            const url = String(input);
            if (url.includes("openlibrary.org/search.json")) {
                return Promise.resolve(
                    jsonResponse({
                        docs: [
                            {
                                title: overrides.title ?? "Mocked Book Title",
                                author_name: overrides.authorName ?? ["Mock Author"],
                                subject: ["Fiction"],
                                publisher: ["Mock Publisher"],
                                first_publish_year: 1999,
                                number_of_pages_median: overrides.pages ?? 123,
                                language: ["eng"],
                            },
                        ],
                    })
                );
            }
            if (url.includes("covers.openlibrary.org")) {
                return Promise.resolve(imageResponse());
            }
            return Promise.resolve(jsonResponse({}));
        });
    }

    it("passes the caller's region to Google Books", async () => {
        await user.agent.put("/api/rest/user").send({
            name: "Region User",
            email: user.email,
            language: "en",
            region: "CA",
        });
        await withGoogleApiKey("a-test-key", async () => {
            mockedFetch.mockImplementation((input: string | URL) =>
                String(input).includes("googleapis.com")
                    ? Promise.resolve(jsonResponse({ items: [{ volumeInfo: googleCompleteForRoute() }] }))
                    : Promise.resolve(jsonResponse({}))
            );
            const res = await user.agent.post(`/api/rest/book/isbn/${freshIsbn()}`);
            expect(res.status).toBe(200);
            const googleUrl = mockedFetch.mock.calls
                .map((call: unknown[]) => String(call[0]))
                .find((url) => url.includes("googleapis.com"));
            expect(googleUrl).toContain("country=CA");
        });
    });

    function googleCompleteForRoute() {
        return {
            title: "A complete Google book",
            authors: ["A Google author"],
            publisher: "A publisher",
            publishedDate: "2020",
            description: "A description",
            categories: ["Fiction"],
            pageCount: 100,
            language: "en",
        };
    }

    it("creates a book from a mocked Open Library response", async () => {
        mockOpenLibraryMetadata();

        const res = await user.agent.post(`/api/rest/book/isbn/${freshIsbn()}`);
        expect(res.status).toBe(200);
        const id = res.body;

        const getRes = await user.agent.get(`/api/rest/book/${id}`);
        expect(getRes.body).toMatchObject({ name: "Mocked Book Title", publisher: "Mock Publisher", pages: 123 });
        expect(getRes.body.authors).toEqual([{ id: expect.any(Number), name: "Mock Author" }]);
    });

    it("reuses the existing book on a second lookup of the same ISBN (find-or-create)", async () => {
        mockOpenLibraryMetadata({ title: "Repeatable Book" });
        const isbn = freshIsbn();

        const first = await user.agent.post(`/api/rest/book/isbn/${isbn}`);
        const second = await user.agent.post(`/api/rest/book/isbn/${isbn}`);
        expect(second.text).toBe(first.text);
    });

    // Find-or-create is keyed on books_isbn_unique, which is instance-wide now:
    // a second member scanning the same barcode lands on the existing book
    // rather than creating a duplicate entry for the same physical title.
    it("reuses a book another account created when they scan the same ISBN", async () => {
        mockOpenLibraryMetadata({ title: "Scanned By Two People" });
        const isbn = freshIsbn();

        const first = await user.agent.post(`/api/rest/book/isbn/${isbn}`);
        expect(first.status).toBe(200);

        const otherUser = await createAuthenticatedUser(app);
        const second = await otherUser.agent.post(`/api/rest/book/isbn/${isbn}`);
        expect(second.status).toBe(200);
        expect(second.body).toBe(first.body);
    });

    it("rejects a malformed ISBN", async () => {
        const res = await user.agent.post("/api/rest/book/isbn/not-an-isbn");
        expect(res.status).toBe(400);
    });

    it("404s when no metadata is found anywhere", async () => {
        alwaysJson({}); // No `docs` in the Open Library response, no record in the BnF one.
        const res = await user.agent.post(`/api/rest/book/isbn/${freshIsbn()}`);
        expect(res.status).toBe(404);
    });

    /**
     * A missing API key and a genuine data gap both used to arrive as a bare
     * `404 "Book not found"`, so an operator who had never set
     * GOOGLE_BOOKS_API_KEY saw "no metadata found for this ISBN" and had no
     * way to learn the strongest source was never asked. The status is
     * unchanged - the client keys on that and nothing else today - but the
     * body now says which it was.
     */
    it("names the unconfigured source in the 404 body", async () => {
        alwaysJson({});

        const res = await user.agent.post(`/api/rest/book/isbn/${freshIsbn()}`);

        expect(res.status).toBe(404);
        expect(res.body).toMatchObject({
            error: "source_not_configured",
            unconfiguredSources: ["google-books"],
            sourcesTried: [],
        });
    });

    it("calls it a data gap, not a misconfiguration, when the key is present", async () => {
        await withGoogleApiKey("a-test-key", async () => {
            alwaysJson({ docs: [] });

            const res = await user.agent.post(`/api/rest/book/isbn/${freshIsbn()}`);

            expect(res.status).toBe(404);
            expect(res.body).toMatchObject({ error: "no_metadata", unconfiguredSources: [] });
        });
    });

    it("502s when every source was reachable-but-broken rather than empty", async () => {
        alwaysJson({ error: "boom" }, 500);

        const res = await user.agent.post(`/api/rest/book/isbn/${freshIsbn()}`);

        expect(res.status).toBe(502);
        expect(res.body).toMatchObject({ error: "source_unavailable" });
    });
});

/**
 * The reason the BnF is in the chain at all, end to end.
 *
 * These use the measured Google Books answers for the ISBNs in question (a
 * real key was configured on production while this was written) and the
 * recorded BnF SRU responses in `test/fixtures/bnf/`.
 */
describe("POST /book/isbn/:isbn (BnF gap-filling)", () => {
    function bnfFixture(name: string): string {
        return fs.readFileSync(path.join(__dirname, "..", "fixtures", "bnf", `${name}.xml`), "utf-8");
    }

    /** A fresh, checksum-valid ISBN-13 in the French-language group (978-2). */
    let frenchCounter = 0;
    function freshFrenchIsbn(): string {
        frenchCounter += 1;
        const body = `9782${String(Date.now() % 1e5).padStart(5, "0")}${String(frenchCounter % 1000).padStart(3, "0")}`;
        let sum = 0;
        for (let i = 0; i < 12; i++) {
            sum += (i % 2 === 0 ? 1 : 3) * Number(body[i]);
        }
        return body + String((10 - (sum % 10)) % 10);
    }

    /**
     * Google's real answer for 9782824627151: it *finds* the book, so the old
     * "fall back only when the primary returns nothing" shape would never
     * have asked anyone else - and would have written `pages = 0` and no
     * publisher into the database.
     */
    const googlePartial = {
        items: [
            {
                volumeInfo: {
                    title: "Le boyfriend",
                    authors: ["Freida McFadden"],
                    publishedDate: "2025-10-08",
                    description: "Comme beaucoup de femmes célibataires de New York...",
                    language: "fr",
                    imageLinks: { thumbnail: "https://books.google.com/books/content?id=abc" },
                    pageCount: 0,
                },
            },
        ],
    };

    it("takes the publisher and page count from the BnF when Google has neither", async () => {
        await withGoogleApiKey("a-test-key", async () => {
            mockedFetch.mockImplementation((input: string | URL) => {
                const url = String(input);
                if (url.includes("googleapis.com")) return Promise.resolve(jsonResponse(googlePartial));
                if (url.includes("catalogue.bnf.fr")) {
                    return Promise.resolve(new Response(bnfFixture("le-boyfriend-9782824627151")));
                }
                return Promise.resolve(jsonResponse({}));
            });

            const res = await user.agent.post(`/api/rest/book/isbn/${freshFrenchIsbn()}`);
            expect(res.status).toBe(200);

            const book = await user.agent.get(`/api/rest/book/${res.body}`);
            expect(book.body).toMatchObject({
                name: "Le boyfriend",
                publisher: "City roman",
                pages: 391,
                // Google's "fr", not the BnF's "fre" - Google answered first.
                language_code: "fr",
            });
            expect(book.body.authors).toEqual([{ id: expect.any(Number), name: "Freida McFadden" }]);
        });
    });

    it("maps the BnF's three-letter language code into the CHAR(2) column", async () => {
        mockedFetch.mockImplementation((input: string | URL) => {
            const url = String(input);
            if (url.includes("catalogue.bnf.fr")) {
                return Promise.resolve(new Response(bnfFixture("la-prof-9782824629094")));
            }
            return Promise.resolve(jsonResponse({}));
        });

        const res = await user.agent.post(`/api/rest/book/isbn/${freshFrenchIsbn()}`);
        expect(res.status).toBe(200);

        const book = await user.agent.get(`/api/rest/book/${res.body}`);
        // 101$a is "fre" in the record.
        expect(book.body).toMatchObject({ name: "La prof", pages: 388, language_code: "fr" });
    });

    it("makes no BnF request for a book Google already has whole", async () => {
        await withGoogleApiKey("a-test-key", async () => {
            mockedFetch.mockImplementation((input: string | URL) =>
                Promise.resolve(
                    String(input).includes("googleapis.com")
                        ? jsonResponse({
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
                                          imageLinks: { thumbnail: "https://books.google.com/books/content?id=xyz" },
                                      },
                                  },
                              ],
                          })
                        : jsonResponse({})
                )
            );

            const res = await user.agent.post(`/api/rest/book/isbn/${freshIsbn()}`);
            expect(res.status).toBe(200);

            const urls = mockedFetch.mock.calls.map((call: unknown[]) => String(call[0]));
            expect(urls.some((url) => url.includes("catalogue.bnf.fr"))).toBe(false);
            expect(urls.some((url) => url.includes("openlibrary.org"))).toBe(false);

            const book = await user.agent.get(`/api/rest/book/${res.body}`);
            expect(book.body).toMatchObject({
                name: "The Lord of the Rings",
                publisher: "HarperCollins",
                pages: 1178,
                language_code: "en",
            });
        });
    });
});

/**
 * `String(process.env.GOOGLE_BOOKS_API_KEY)` turned an *absent* variable into
 * the nine-character string "undefined" - truthy, so it passed every
 * `if (!apiKey)` guard and was sent to Google as `key=undefined`, which 400s.
 * The deployment that had the variable present-but-empty took the honest
 * path; one that simply omitted the line did not.
 */
/**
 * `POST /book/:id/refresh` and `POST /book/refresh`.
 *
 * The production damage these exist for: four French paperbacks catalogued
 * before the merge landed, every one of them with no publisher, no category
 * and `pages = 0`. The fixtures below recreate exactly that - Google finds the
 * book and answers with holes in it, the BnF has the publisher and the
 * pagination, and nobody anywhere has a category.
 */
describe("POST /book/:id/refresh (re-fetch an existing book)", () => {
    function bnfFixture(name: string): string {
        return fs.readFileSync(path.join(__dirname, "..", "fixtures", "bnf", `${name}.xml`), "utf-8");
    }

    let refreshCounter = 0;
    function freshFrenchIsbn(): string {
        refreshCounter += 1;
        const body = `9782${String(Date.now() % 1e5).padStart(5, "0")}${String(refreshCounter % 1000).padStart(3, "0")}`;
        let sum = 0;
        for (let i = 0; i < 12; i++) {
            sum += (i % 2 === 0 ? 1 : 3) * Number(body[i]);
        }
        return body + String((10 - (sum % 10)) % 10);
    }

    /** Google's real answer for 9782824627151: the book, minus publisher, minus categories, with pageCount 0. */
    const googlePartial = {
        items: [
            {
                volumeInfo: {
                    title: "Le boyfriend",
                    authors: ["Freida McFadden"],
                    publishedDate: "2025-10-08",
                    description: "Comme beaucoup de femmes celibataires de New York...",
                    language: "fr",
                    imageLinks: { thumbnail: "https://books.google.com/books/content?id=abc" },
                    pageCount: 0,
                },
            },
        ],
    };

    /** Google answers partially; the BnF fills the publisher and the page count. */
    function mockGoogleThenBnf() {
        mockedFetch.mockImplementation((input: string | URL) => {
            const url = String(input);
            if (url.includes("googleapis.com")) return Promise.resolve(jsonResponse(googlePartial));
            if (url.includes("catalogue.bnf.fr")) {
                return Promise.resolve(new Response(bnfFixture("le-boyfriend-9782824627151")));
            }
            if (url.includes("covers.openlibrary.org")) return Promise.resolve(imageResponse(404, null));
            return Promise.resolve(jsonResponse({}));
        });
    }

    /**
     * A book in the state production left them in: created through the ISBN
     * route while Google was the only source that answered, so it has a title,
     * a cover and `pages = 0`, and nothing else.
     */
    async function createDamagedBook(): Promise<{ id: number; isbn: string }> {
        const isbn = freshFrenchIsbn();

        await withGoogleApiKey("a-test-key", async () => {
            mockedFetch.mockImplementation((input: string | URL) =>
                Promise.resolve(
                    String(input).includes("googleapis.com")
                        ? jsonResponse(googlePartial)
                        : String(input).includes("covers.openlibrary.org")
                          ? imageResponse(404, null)
                          : jsonResponse({})
                )
            );

            const res = await user.agent.post(`/api/rest/book/isbn/${isbn}`);
            expect(res.status).toBe(200);
        });

        const { rows } = await appService.getDatabasePool().query("SELECT id FROM books WHERE isbn = $1", [isbn]);
        // Recreate the exact production residue: the fix at the provider edge
        // stops new zeroes, it does not repair the rows already carrying one.
        await appService
            .getDatabasePool()
            .query("UPDATE books SET pages = 0, publisher = NULL WHERE id = $1", [rows[0].id]);

        return { id: rows[0].id, isbn };
    }

    it("fills the publisher and page count a pre-merge book is missing, naming the source of each", async () => {
        const book = await createDamagedBook();
        mockGoogleThenBnf();

        const res = await withGoogleApiKey("a-test-key", () => user.agent.post(`/api/rest/book/${book.id}/refresh`));

        expect(res.status).toBe(200);
        expect(res.body.mode).toBe("fill");
        expect(res.body.changed).toEqual(
            expect.arrayContaining([
                { field: "publisher", from: null, to: "City roman", source: "bnf" },
                { field: "pages", from: 0, to: 391, source: "bnf" },
            ])
        );

        const after = await user.agent.get(`/api/rest/book/${book.id}`);
        expect(after.body).toMatchObject({ publisher: "City roman", pages: 391 });
    });

    it("preserves hand edits made while catalogue requests are in flight", async () => {
        const book = await createDamagedBook();
        mockedFetch.mockImplementation(async (input: string | URL) => {
            if (String(input).includes("googleapis.com")) {
                await appService
                    .getDatabasePool()
                    .query(
                        "UPDATE books SET publisher = 'Hand edit during lookup', pages = 777, image_url = '/uploaded-cover.jpg' WHERE id = $1",
                        [book.id]
                    );
                return jsonResponse(googlePartial);
            }
            if (String(input).includes("catalogue.bnf.fr")) {
                return new Response(bnfFixture("le-boyfriend-9782824627151"));
            }
            return jsonResponse({});
        });
        const res = await withGoogleApiKey("a-test-key", () => user.agent.post(`/api/rest/book/${book.id}/refresh`));
        expect(res.status).toBe(200);
        const after = await user.agent.get(`/api/rest/book/${book.id}`);
        expect(after.body.publisher).toBe("Hand edit during lookup");
        expect(after.body.pages).toBe(777);
        expect(after.body.image_url).toBe("/uploaded-cover.jpg");
        expect(res.body.changed).toEqual([]);
    });

    it("asks for a retry if the ISBN changes during the lookup", async () => {
        const book = await createDamagedBook();
        mockedFetch.mockImplementation(async (input: string | URL) => {
            if (String(input).includes("googleapis.com")) {
                await appService.getDatabasePool().query("UPDATE books SET isbn = NULL WHERE id = $1", [book.id]);
                return jsonResponse(googlePartial);
            }
            if (String(input).includes("catalogue.bnf.fr"))
                return new Response(bnfFixture("le-boyfriend-9782824627151"));
            return jsonResponse({});
        });
        const res = await withGoogleApiKey("a-test-key", () => user.agent.post(`/api/rest/book/${book.id}/refresh`));
        expect(res.status).toBe(409);
        expect(res.body.error).toBe("isbn_changed");
        const after = await user.agent.get(`/api/rest/book/${book.id}`);
        expect(after.body.publisher).toBeNull();
        expect(after.body.pages).toBe(0);
    });

    it("reports an ISBN change during a no-metadata lookup instead of a stale source gap", async () => {
        const book = await createDamagedBook();
        mockedFetch.mockImplementation(async (input: string | URL) => {
            if (String(input).includes("googleapis.com")) {
                await appService.getDatabasePool().query("UPDATE books SET isbn = NULL WHERE id = $1", [book.id]);
            }
            return jsonResponse({});
        });
        const res = await withGoogleApiKey("a-test-key", () => user.agent.post(`/api/rest/book/${book.id}/refresh`));
        expect(res.status).toBe(409);
        expect(res.body.error).toBe("isbn_changed");
        const after = await user.agent.get(`/api/rest/book/${book.id}`);
        expect(after.body.publisher).toBeNull();
        expect(after.body.pages).toBe(0);
    });

    it("reports deletion during a no-metadata lookup instead of a stale source gap", async () => {
        const book = await createDamagedBook();
        mockedFetch.mockImplementation(async (input: string | URL) => {
            if (String(input).includes("googleapis.com")) {
                await appService.getDatabasePool().query("DELETE FROM books WHERE id = $1", [book.id]);
            }
            return jsonResponse({});
        });
        const res = await withGoogleApiKey("a-test-key", () => user.agent.post(`/api/rest/book/${book.id}/refresh`));
        expect(res.status).toBe(404);
        expect(res.text).toBe("Book not found");
    });

    // The truth the owner has to be told rather than papered over: Google
    // returns no categories for these titles and the BnF record carries no 606
    // subject heading, so there is no category to be had. It stays NULL and
    // the answer says which fields are in that position.
    it("leaves the category empty when no source has one, and says so", async () => {
        const book = await createDamagedBook();
        mockGoogleThenBnf();

        const pool = appService.getDatabasePool();
        const before = await pool.query("SELECT COUNT(*)::int AS n FROM categories");

        const res = await withGoogleApiKey("a-test-key", () => user.agent.post(`/api/rest/book/${book.id}/refresh`));

        expect(res.body.changed.some((change: any) => change.field === "category")).toBe(false);
        expect(res.body.stillMissing).toContain("category");

        const after = await user.agent.get(`/api/rest/book/${book.id}`);
        expect(after.body.category_id).toBeNull();

        // And no placeholder category row was conjured up for it either - not
        // a "Fiction", not an "Uncategorised", not the BnF's 686 class number.
        const afterCount = await pool.query("SELECT COUNT(*)::int AS n FROM categories");
        expect(afterCount.rows[0].n).toBe(before.rows[0].n);
    });

    /**
     * The bug most likely to be in a feature like this one, so it is asserted
     * on three axes at once: the second run reports no changes, links no
     * second copy of the author, and does not move `date_updated`.
     */
    it("is idempotent - a second run changes nothing and duplicates no author", async () => {
        const book = await createDamagedBook();
        mockGoogleThenBnf();

        const first = await withGoogleApiKey("a-test-key", () => user.agent.post(`/api/rest/book/${book.id}/refresh`));
        expect(first.body.changed.length).toBeGreaterThan(0);

        const pool = appService.getDatabasePool();
        const { rows: afterFirst } = await pool.query("SELECT date_updated FROM books WHERE id = $1", [book.id]);

        const second = await withGoogleApiKey("a-test-key", () => user.agent.post(`/api/rest/book/${book.id}/refresh`));

        expect(second.status).toBe(200);
        expect(second.body.changed).toEqual([]);

        const { rows: afterSecond } = await pool.query("SELECT date_updated FROM books WHERE id = $1", [book.id]);
        expect(String(afterSecond[0].date_updated)).toBe(String(afterFirst[0].date_updated));

        const { rows: links } = await pool.query(
            `SELECT authors.name FROM book_authors JOIN authors ON authors.id = book_authors.author_id
             WHERE book_authors.book_id = $1`,
            [book.id]
        );
        expect(links.map((row) => row.name)).toEqual(["Freida McFadden"]);

        const { rows: categories } = await pool.query("SELECT COUNT(*)::int AS n FROM categories");
        expect(categories[0].n).toBeGreaterThanOrEqual(0);
    });

    it("keeps a hand-edited field a source disagrees with", async () => {
        const book = await createDamagedBook();

        await user.agent.put(`/api/rest/book/${book.id}`).send({
            name: "Le boyfriend",
            description: "A description I wrote myself.",
            image_url: null,
            isbn: book.isbn,
            category_id: null,
            language_code: "fr",
            publisher: "My own publisher",
            published_date: null,
            pages: null,
            format_id: null,
        });

        mockGoogleThenBnf();

        const res = await withGoogleApiKey("a-test-key", () => user.agent.post(`/api/rest/book/${book.id}/refresh`));

        expect(res.body.changed.some((change: any) => change.field === "publisher")).toBe(false);
        expect(res.body.changed.some((change: any) => change.field === "description")).toBe(false);

        const after = await user.agent.get(`/api/rest/book/${book.id}`);
        expect(after.body.publisher).toBe("My own publisher");
        expect(after.body.description).toBe("A description I wrote myself.");
        // ...and the page count, which was never touched by hand, is repaired.
        expect(after.body.pages).toBe(391);
    });

    it("replaces a filled field only when overwrite is asked for by name", async () => {
        const book = await createDamagedBook();
        await appService
            .getDatabasePool()
            .query("UPDATE books SET publisher = 'Stale Publisher' WHERE id = $1", [book.id]);

        mockGoogleThenBnf();

        const res = await withGoogleApiKey("a-test-key", () =>
            user.agent.post(`/api/rest/book/${book.id}/refresh`).send({ overwrite: true })
        );

        expect(res.body.mode).toBe("overwrite");
        expect(res.body.changed).toEqual(
            expect.arrayContaining([{ field: "publisher", from: "Stale Publisher", to: "City roman", source: "bnf" }])
        );
    });

    it("leaves stocks and loans alone", async () => {
        const book = await createDamagedBook();
        const location = await user.agent.post("/api/rest/location").send({ name: "Refresh Shelf", description: "" });
        await user.agent.post(`/api/rest/book/${book.id}/stock`).send({ status: 0, location_id: location.body.id });

        const before = await user.agent.get(`/api/rest/book/${book.id}`);
        mockGoogleThenBnf();

        await withGoogleApiKey("a-test-key", () => user.agent.post(`/api/rest/book/${book.id}/refresh`));

        const after = await user.agent.get(`/api/rest/book/${book.id}`);
        expect(after.body.stocks).toEqual(before.body.stocks);
    });

    it("refuses a book with no ISBN rather than pretending to work", async () => {
        const created = await user.agent.post("/api/rest/book").field("name", "A book with no barcode");

        const res = await user.agent.post(`/api/rest/book/${created.body}/refresh`);

        expect(res.status).toBe(400);
        expect(res.body.error).toBe("no_isbn");
    });

    it("404s for a book that does not exist", async () => {
        const res = await user.agent.post("/api/rest/book/99999999/refresh");
        expect(res.status).toBe(404);
    });

    it("answers with the source breakdown when no source has the ISBN", async () => {
        const book = await createDamagedBook();
        alwaysJson({});
        mockedFetch.mockImplementation((input: string | URL) => {
            const url = String(input);
            if (url.includes("catalogue.bnf.fr")) return Promise.resolve(new Response("<records/>"));
            return Promise.resolve(jsonResponse({}));
        });

        const res = await user.agent.post(`/api/rest/book/${book.id}/refresh`);

        expect(res.status).toBe(404);
        expect(res.body.error).toBe("source_not_configured");
    });
});

describe("POST /book/refresh (bulk)", () => {
    async function createAdmin(): Promise<ITestUser> {
        const admin = await createAuthenticatedUser(app, "Refresh Admin");
        await appService.getDatabasePool().query("UPDATE users SET role = 'admin' WHERE code = $1", [admin.userCode]);
        return admin;
    }

    it("refuses a non-admin with 403", async () => {
        const res = await user.agent.post("/api/rest/book/refresh").send({ ids: [1] });

        expect(res.status).toBe(403);
        expect(res.body.sessionExpired).toBeUndefined();
    });

    it("rejects an empty or oversized id list", async () => {
        const admin = await createAdmin();

        expect((await admin.agent.post("/api/rest/book/refresh").send({})).status).toBe(400);
        expect((await admin.agent.post("/api/rest/book/refresh").send({ ids: [] })).status).toBe(400);

        const tooMany = await admin.agent
            .post("/api/rest/book/refresh")
            .send({ ids: Array.from({ length: 51 }, (_, i) => i + 1) });
        expect(tooMany.status).toBe(400);
        expect(tooMany.body.error).toBe("too_many_ids");
    });

    it("rejects every malformed ID without processing the valid subset", async () => {
        const admin = await createAdmin();
        for (const invalid of [null, true, "1", "bad", 0, -1, 1.5, 9007199254740992]) {
            const res = await admin.agent.post("/api/rest/book/refresh").send({ ids: [99999999, invalid] });
            expect(res.status).toBe(400);
            expect(res.body.error).toBe("invalid_ids");
        }
    });

    it("deduplicates explicit IDs before looking up books", async () => {
        const admin = await createAdmin();
        const res = await admin.agent.post("/api/rest/book/refresh").send({ ids: [99999999, 99999999] });
        expect(res.status).toBe(200);
        expect(res.body.results).toHaveLength(1);
        expect(res.body.results[0]).toMatchObject({ bookId: 99999999, status: "not_found" });
    });

    it("marks remaining books timed out when the aggregate cap is reached", async () => {
        const admin = await createAdmin();
        const realNow = Date.now;
        let dateCalls = 0;
        Date.now = () => dateCalls++ < 10 ? 1000 : 121001;
        try {
            const res = await admin.agent.post("/api/rest/book/refresh").send({ ids: [99999998, 99999999] });

            expect(res.status).toBe(200);
            expect(res.body.results).toEqual([
                { bookId: 99999998, name: null, status: "not_found", changed: [], stillMissing: [] },
                { bookId: 99999999, name: null, status: "timeout", changed: [], stillMissing: [] },
            ]);
        } finally {
            Date.now = realNow;
        }
    });

    it("summarises each book by field name and records the run in activity_log", async () => {
        const admin = await createAdmin();
        const noIsbn = await user.agent.post("/api/rest/book").field("name", "Bulk book with no barcode");

        mockedFetch.mockImplementation(() => Promise.resolve(jsonResponse({})));

        const res = await admin.agent.post("/api/rest/book/refresh").send({ ids: [noIsbn.body] });

        expect(res.status).toBe(200);
        expect(res.body.results).toEqual([
            {
                bookId: noIsbn.body,
                name: "Bulk book with no barcode",
                status: "no_isbn",
                changed: [],
                stillMissing: [],
            },
        ]);

        const { rows } = await appService
            .getDatabasePool()
            .query(
                "SELECT metadata FROM activity_log WHERE action = 'books_metadata_refreshed' ORDER BY id DESC LIMIT 1"
            );
        expect(rows[0].metadata).toMatchObject({ mode: "fill", requested: 1 });
    });
});

describe("normalizeGoogleApiKey", () => {
    it("treats an absent, empty or whitespace variable as not configured", () => {
        expect(normalizeGoogleApiKey(undefined)).toBeUndefined();
        expect(normalizeGoogleApiKey("")).toBeUndefined();
        expect(normalizeGoogleApiKey("   ")).toBeUndefined();
    });

    it("treats the literal string 'undefined' as not configured", () => {
        expect(normalizeGoogleApiKey(String(undefined))).toBeUndefined();
    });

    it("keeps a real key, trimmed", () => {
        expect(normalizeGoogleApiKey(" AIzaSyRealLookingKey ")).toBe("AIzaSyRealLookingKey");
    });
});

describe("book stock lifecycle", () => {
    async function createLocation(agent: ITestUser["agent"], name: string) {
        const res = await agent.post("/api/rest/location").send({ name, description: "" });
        return res.body.id;
    }

    it("adds, updates (loans) and removes a stock", async () => {
        const bookRes = await user.agent.post("/api/rest/book").field("name", "Stocked Book");
        const bookId = bookRes.body;
        const locationId = await createLocation(user.agent, "Main Shelf");

        const addRes = await user.agent
            .post(`/api/rest/book/${bookId}/stock`)
            .send({ status: 0, location_id: locationId });
        expect(addRes.status).toBe(200);
        const stockId = addRes.body.id;
        expect(addRes.body.status).toBe(0);

        // Can't create a stock as already-booked.
        const bookedCreateRes = await user.agent
            .post(`/api/rest/book/${bookId}/stock`)
            .send({ status: 2, location_id: locationId });
        expect(bookedCreateRes.status).toBe(406);

        const updateRes = await user.agent
            .put(`/api/rest/book/${bookId}/stock/${stockId}`)
            .send({ status: 0, location_id: locationId, customer_id: null });
        expect(updateRes.status).toBe(200);

        const deleteRes = await user.agent.delete(`/api/rest/book/${bookId}/stock/${stockId}`);
        expect(deleteRes.status).toBe(200);
        expect(deleteRes.body).toBe(true);
    });

    it("loans a stock to a customer and returns it, recording loan history both times", async () => {
        const bookRes = await user.agent.post("/api/rest/book").field("name", "Loanable Book");
        const bookId = bookRes.body;
        const locationId = await createLocation(user.agent, "Loan Shelf");
        const customerRes = await user.agent.post("/api/rest/customer").send({ name: "Jane Borrower" });
        const customerId = customerRes.body.id;

        const stockRes = await user.agent
            .post(`/api/rest/book/${bookId}/stock`)
            .send({ status: 0, location_id: locationId });
        const stockId = stockRes.body.id;

        // Transition into "booked" (2) - this exact statement used to crash
        // with a Postgres 500 (42P08, "inconsistent types deduced for
        // parameter $1") before the $1::smallint cast fix in BooksRoute.ts.
        const loanRes = await user.agent
            .put(`/api/rest/book/${bookId}/stock/${stockId}`)
            .send({ status: 2, location_id: locationId, customer_id: customerId });
        expect(loanRes.status).toBe(200);
        expect(loanRes.body).toMatchObject({ status: 2, customer_id: customerId });

        // Find this stock by id rather than taking stocks[0]: with one shared
        // library, POST /book auto-places a copy whenever the library happens
        // to have exactly one location (__automaticallyAddBookToLocation), so
        // the book can carry a second stock this test never created.
        const afterLoanRes = await user.agent.get(`/api/rest/book/${bookId}`);
        const loanedStock = afterLoanRes.body.stocks.find((s: any) => s.id === stockId);
        expect(loanedStock).toMatchObject({ status: 2, customer_id: customerId });

        const returnRes = await user.agent
            .put(`/api/rest/book/${bookId}/stock/${stockId}`)
            .send({ status: 0, location_id: locationId, customer_id: null });
        expect(returnRes.status).toBe(200);
        expect(returnRes.body.customer_id).toBeNull();

        const today = new Date().toISOString().slice(0, 10);
        const reportRes = await user.agent.get("/api/rest/loans/report").query({ date_from: today, date_to: today });
        expect(reportRes.status).toBe(200);
        const entry = reportRes.body.rows.find((l: any) => l.stockCode === stockRes.body.code);
        expect(entry).toBeDefined();
        expect(entry.returnedAt).not.toBeNull();
    });

    // Inverted from upstream's "404s adding a stock at a location that doesn't
    // belong to the user". There is one set of shelves; any member can place a
    // copy on any of them.
    it("adds a stock at a location another account created", async () => {
        const bookRes = await user.agent.post("/api/rest/book").field("name", "Another Stocked Book");
        const otherUser = await createAuthenticatedUser(app);
        const otherLocationId = await createLocation(otherUser.agent, `Someone Else's Shelf ${Date.now()}`);

        const res = await user.agent
            .post(`/api/rest/book/${bookRes.body}/stock`)
            .send({ status: 0, location_id: otherLocationId });
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ location_id: otherLocationId, status: 0 });
    });

    // Still 404 - not because of ownership, but because the id names nothing.
    it("404s adding a stock at a location that doesn't exist", async () => {
        const bookRes = await user.agent.post("/api/rest/book").field("name", "Unplaceable Book");
        const res = await user.agent
            .post(`/api/rest/book/${bookRes.body}/stock`)
            .send({ status: 0, location_id: 999999999 });
        expect(res.status).toBe(404);
    });

    // Upstream never checks that :id names a real book before inserting the
    // stock row (see the spec's upstream security report).
    it("404s adding a stock to a book that doesn't exist", async () => {
        const locationId = await createLocation(user.agent, `Orphan Shelf ${Date.now()}`);
        const res = await user.agent
            .post(`/api/rest/book/999999999/stock`)
            .send({ status: 0, location_id: locationId });
        expect(res.status).toBe(404);
    });
});
