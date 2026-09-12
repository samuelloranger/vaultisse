import fs from "fs";
import path from "path";
import {alwaysJson, imageResponse, jsonResponse, mockedFetch, useMockedFetch} from "../helpers/fetchMock";
import {setupTestApp} from "../helpers/testApp";
import {createAuthenticatedUser, ITestUser} from "../helpers/auth";
import {appService, normalizeGoogleApiKey} from "../../src/AppService";

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

        const {rows} = await appService.getDatabasePool().query(
            "SELECT u.code FROM books b JOIN users u ON u.id = b.created_by WHERE b.id = $1",
            [res.body]
        );
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
        expect(res.body).toMatchObject({id, name: "The Hobbit"});
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
        expect(res.body).toMatchObject({id, name: "Shared Book"});

        const updateRes = await otherUser.agent.put(`/api/rest/book/${id}`).send({
            name: "Edited By Someone Else", authors: [],
        });
        expect(updateRes.status).toBe(200);

        // The edit lands on the one shared row, not a private copy.
        const ownerRes = await user.agent.get(`/api/rest/book/${id}`);
        expect(ownerRes.body).toMatchObject({id, name: "Edited By Someone Else"});

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

        const authorRes = await user.agent.post("/api/rest/author").send({name: "Jane Author"});
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
        expect(getRes.body).toMatchObject({name: "Final Title", description: "A great book.", publisher: "Acme"});
        expect(getRes.body.authors).toEqual([{id: authorId, name: "Jane Author"}]);
    });

    it("404s updating a book that doesn't exist", async () => {
        const res = await user.agent.put("/api/rest/book/999999999").send({name: "X"});
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
        const res = await user.agent.get("/api/rest/book/search").query({query: "great gatsby"});
        expect(res.status).toBe(200);
        expect(res.body.books.some((b: any) => b.name === "The Great Gatsby")).toBe(true);
    });

    // Inverted from upstream's "only returns the caller's own books".
    it("returns books added by any account", async () => {
        const otherUser = await createAuthenticatedUser(app);
        const created = await otherUser.agent.post("/api/rest/book").field("name", "Added By Someone Else");

        const res = await user.agent.get("/api/rest/book/search").query({query: "Added By Someone Else"});
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
        const categoryRes = await user.agent.post("/api/rest/category").send({name: `Precedence ${Date.now()}`});
        const categoryId = categoryRes.body.id;

        const isbn = freshIsbn();
        // Carries the searched-for ISBN but is NOT in the filtered category.
        const outsider = await user.agent
            .post("/api/rest/book").field("name", "Outside The Category").field("isbn", isbn);

        const res = await user.agent.get("/api/rest/book/search").query({query: isbn, category_id: categoryId});
        expect(res.status).toBe(200);
        expect(res.body.books.some((b: any) => b.id === outsider.body)).toBe(false);
        expect(res.body.total).toBe(0);
    });

    it("filters by category_id", async () => {
        const categoryRes = await user.agent.post("/api/rest/category").send({name: "Sci-Fi Search Test"});
        const categoryId = categoryRes.body.id;

        const createRes = await user.agent.post("/api/rest/book").field("name", "Categorized Book");
        await user.agent.put(`/api/rest/book/${createRes.body}`).send({
            name: "Categorized Book", category_id: categoryId, authors: [],
        });

        const res = await user.agent.get("/api/rest/book/search").query({category_id: categoryId});
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
    function mockOpenLibraryMetadata(overrides: {title?: string; authorName?: string[]; pages?: number} = {}) {
        mockedFetch.mockImplementation((input: string | URL) => {
            const url = String(input);
            if (url.includes("openlibrary.org/search.json")) {
                return Promise.resolve(jsonResponse({
                    docs: [{
                        title: overrides.title ?? "Mocked Book Title",
                        author_name: overrides.authorName ?? ["Mock Author"],
                        subject: ["Fiction"],
                        publisher: ["Mock Publisher"],
                        first_publish_year: 1999,
                        number_of_pages_median: overrides.pages ?? 123,
                        language: ["eng"],
                    }],
                }));
            }
            if (url.includes("covers.openlibrary.org")) {
                return Promise.resolve(imageResponse());
            }
            return Promise.resolve(jsonResponse({}));
        });
    }

    it("creates a book from a mocked Open Library response", async () => {
        mockOpenLibraryMetadata();

        const res = await user.agent.post(`/api/rest/book/isbn/${freshIsbn()}`);
        expect(res.status).toBe(200);
        const id = res.body;

        const getRes = await user.agent.get(`/api/rest/book/${id}`);
        expect(getRes.body).toMatchObject({name: "Mocked Book Title", publisher: "Mock Publisher", pages: 123});
        expect(getRes.body.authors).toEqual([{id: expect.any(Number), name: "Mock Author"}]);
    });

    it("reuses the existing book on a second lookup of the same ISBN (find-or-create)", async () => {
        mockOpenLibraryMetadata({title: "Repeatable Book"});
        const isbn = freshIsbn();

        const first = await user.agent.post(`/api/rest/book/isbn/${isbn}`);
        const second = await user.agent.post(`/api/rest/book/isbn/${isbn}`);
        expect(second.text).toBe(first.text);
    });

    // Find-or-create is keyed on books_isbn_unique, which is instance-wide now:
    // a second member scanning the same barcode lands on the existing book
    // rather than creating a duplicate entry for the same physical title.
    it("reuses a book another account created when they scan the same ISBN", async () => {
        mockOpenLibraryMetadata({title: "Scanned By Two People"});
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
            alwaysJson({docs: []});

            const res = await user.agent.post(`/api/rest/book/isbn/${freshIsbn()}`);

            expect(res.status).toBe(404);
            expect(res.body).toMatchObject({error: "no_metadata", unconfiguredSources: []});
        });
    });

    it("502s when every source was reachable-but-broken rather than empty", async () => {
        alwaysJson({error: "boom"}, 500);

        const res = await user.agent.post(`/api/rest/book/isbn/${freshIsbn()}`);

        expect(res.status).toBe(502);
        expect(res.body).toMatchObject({error: "source_unavailable"});
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
                    imageLinks: {thumbnail: "https://books.google.com/books/content?id=abc"},
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
            expect(book.body.authors).toEqual([{id: expect.any(Number), name: "Freida McFadden"}]);
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
        expect(book.body).toMatchObject({name: "La prof", pages: 388, language_code: "fr"});
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
                                          imageLinks: {thumbnail: "https://books.google.com/books/content?id=xyz"},
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
            expect(urls.some(url => url.includes("catalogue.bnf.fr"))).toBe(false);
            expect(urls.some(url => url.includes("openlibrary.org"))).toBe(false);

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
        const res = await agent.post("/api/rest/location").send({name, description: ""});
        return res.body.id;
    }

    it("adds, updates (loans) and removes a stock", async () => {
        const bookRes = await user.agent.post("/api/rest/book").field("name", "Stocked Book");
        const bookId = bookRes.body;
        const locationId = await createLocation(user.agent, "Main Shelf");

        const addRes = await user.agent.post(`/api/rest/book/${bookId}/stock`).send({status: 0, location_id: locationId});
        expect(addRes.status).toBe(200);
        const stockId = addRes.body.id;
        expect(addRes.body.status).toBe(0);

        // Can't create a stock as already-booked.
        const bookedCreateRes = await user.agent.post(`/api/rest/book/${bookId}/stock`).send({status: 2, location_id: locationId});
        expect(bookedCreateRes.status).toBe(406);

        const updateRes = await user.agent
            .put(`/api/rest/book/${bookId}/stock/${stockId}`)
            .send({status: 0, location_id: locationId, customer_id: null});
        expect(updateRes.status).toBe(200);

        const deleteRes = await user.agent.delete(`/api/rest/book/${bookId}/stock/${stockId}`);
        expect(deleteRes.status).toBe(200);
        expect(deleteRes.body).toBe(true);
    });

    it("loans a stock to a customer and returns it, recording loan history both times", async () => {
        const bookRes = await user.agent.post("/api/rest/book").field("name", "Loanable Book");
        const bookId = bookRes.body;
        const locationId = await createLocation(user.agent, "Loan Shelf");
        const customerRes = await user.agent.post("/api/rest/customer").send({name: "Jane Borrower"});
        const customerId = customerRes.body.id;

        const stockRes = await user.agent.post(`/api/rest/book/${bookId}/stock`).send({status: 0, location_id: locationId});
        const stockId = stockRes.body.id;

        // Transition into "booked" (2) - this exact statement used to crash
        // with a Postgres 500 (42P08, "inconsistent types deduced for
        // parameter $1") before the $1::smallint cast fix in BooksRoute.ts.
        const loanRes = await user.agent
            .put(`/api/rest/book/${bookId}/stock/${stockId}`)
            .send({status: 2, location_id: locationId, customer_id: customerId});
        expect(loanRes.status).toBe(200);
        expect(loanRes.body).toMatchObject({status: 2, customer_id: customerId});

        // Find this stock by id rather than taking stocks[0]: with one shared
        // library, POST /book auto-places a copy whenever the library happens
        // to have exactly one location (__automaticallyAddBookToLocation), so
        // the book can carry a second stock this test never created.
        const afterLoanRes = await user.agent.get(`/api/rest/book/${bookId}`);
        const loanedStock = afterLoanRes.body.stocks.find((s: any) => s.id === stockId);
        expect(loanedStock).toMatchObject({status: 2, customer_id: customerId});

        const returnRes = await user.agent
            .put(`/api/rest/book/${bookId}/stock/${stockId}`)
            .send({status: 0, location_id: locationId, customer_id: null});
        expect(returnRes.status).toBe(200);
        expect(returnRes.body.customer_id).toBeNull();

        const today = new Date().toISOString().slice(0, 10);
        const reportRes = await user.agent
            .get("/api/rest/loans/report")
            .query({date_from: today, date_to: today});
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

        const res = await user.agent.post(`/api/rest/book/${bookRes.body}/stock`).send({status: 0, location_id: otherLocationId});
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({location_id: otherLocationId, status: 0});
    });

    // Still 404 - not because of ownership, but because the id names nothing.
    it("404s adding a stock at a location that doesn't exist", async () => {
        const bookRes = await user.agent.post("/api/rest/book").field("name", "Unplaceable Book");
        const res = await user.agent.post(`/api/rest/book/${bookRes.body}/stock`).send({status: 0, location_id: 999999999});
        expect(res.status).toBe(404);
    });

    // Upstream never checks that :id names a real book before inserting the
    // stock row (see the spec's upstream security report).
    it("404s adding a stock to a book that doesn't exist", async () => {
        const locationId = await createLocation(user.agent, `Orphan Shelf ${Date.now()}`);
        const res = await user.agent.post(`/api/rest/book/999999999/stock`).send({status: 0, location_id: locationId});
        expect(res.status).toBe(404);
    });
});
