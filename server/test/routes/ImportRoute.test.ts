import axios from "axios";
import {setupTestApp} from "../helpers/testApp";
import {createAuthenticatedUser, ITestUser} from "../helpers/auth";

jest.mock("axios");
const mockedAxios = axios as jest.Mocked<typeof axios>;

const app = setupTestApp();

let user: ITestUser;

beforeEach(async () => {
    user = await createAuthenticatedUser(app);
    mockedAxios.get.mockReset();
    // Default: every cover lookup "succeeds" with a plausible image response,
    // unless a specific test overrides this to simulate a miss.
    mockedAxios.get.mockResolvedValue({status: 200, headers: {"content-type": "image/jpeg"}});
});

const GOODREADS_CSV = [
    "Book Id,Title,Author,Author l-f,Additional Authors,ISBN,ISBN13,My Rating,Publisher,Binding,Number of Pages,Year Published,Original Publication Year,Date Read,Date Added,Bookshelves,Bookshelves with positions,Exclusive Shelf,My Review,Spoiler,Private Notes,Read Count,Owned Copies",
    `1,Steve Jobs,Walter Isaacson,"Isaacson, Walter",,"=""1451648537""","=""9781451648539""",0,Simon & Schuster,Hardcover,630,2011,2011,,2026/09/11,"to-read","to-read (#1)",to-read,,,,0,0`,
    `2,No ISBN Book,Anne Frank,"Frank, Anne",,"=""""","=""""",2.0,Bantam Books,Mass Market Paperback,256,1994,1947,,2026/09/11,to-read,"to-read (#2)",to-read,,,,0,0`,
].join("\n");

/**
 * A fresh, checksum-valid ISBN-13 per call. `books_isbn_unique` is
 * instance-wide now, so an ISBN reused between tests in this file would make
 * the second import skip the row as a duplicate - a false failure unrelated to
 * what's being asserted. The checksum matters: `VaultisseCsvParser` runs every
 * ISBN through `normalizeAndValidateIsbn` and silently drops a malformed one,
 * which would take the cover-lookup branch with it.
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

describe("GET /import/template/:origin", () => {
    it("downloads the vaultisse template as a CSV attachment", async () => {
        const res = await user.agent.get("/api/rest/import/template/vaultisse");
        expect(res.status).toBe(200);
        expect(res.headers["content-type"]).toMatch(/text\/csv/);
        expect(res.headers["content-disposition"]).toMatch(/attachment/);
        expect(res.text.split("\n")[0]).toContain("Title");
        expect(res.text.split("\n")[0]).toContain("Cover");
    });

    it("404s for an origin with no template (e.g. goodreads)", async () => {
        const res = await user.agent.get("/api/rest/import/template/goodreads");
        expect(res.status).toBe(404);
    });
});

describe("POST /import/library - validation", () => {
    it("400s with no file", async () => {
        const res = await user.agent.post("/api/rest/import/library").field("origin", "goodreads");
        expect(res.status).toBe(400);
    });

    it("400s with no origin", async () => {
        const res = await user.agent.post("/api/rest/import/library").attach("file", Buffer.from(GOODREADS_CSV), "lib.csv");
        expect(res.status).toBe(400);
    });

    it("400s for an unsupported origin", async () => {
        const res = await user.agent
            .post("/api/rest/import/library")
            .field("origin", "calibre")
            .attach("file", Buffer.from(GOODREADS_CSV), "lib.csv");
        expect(res.status).toBe(400);
    });

    it("400s for a non-.csv file", async () => {
        const res = await user.agent
            .post("/api/rest/import/library")
            .field("origin", "goodreads")
            .attach("file", Buffer.from(GOODREADS_CSV), "lib.txt");
        expect(res.status).toBe(400);
    });
});

describe("POST /import/library - goodreads origin", () => {
    it("imports rows, unwraps the Excel-escaped ISBN, and skips a cover lookup with no ISBN", async () => {
        const res = await user.agent
            .post("/api/rest/import/library")
            .field("origin", "goodreads")
            .attach("file", Buffer.from(GOODREADS_CSV), "lib.csv");

        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({imported: 2, skipped: 0, failed: 0});

        const searchRes = await user.agent.get("/api/rest/book/search").query({query: "Steve Jobs"});
        const book = searchRes.body.books.find((b: any) => b.name === "Steve Jobs");
        expect(book).toBeDefined();
        expect(book.isbn).toBe("9781451648539");
        expect(book.image_url).toBeTruthy(); // ISBN present -> cover lookup attempted (mocked as a hit).

        const noIsbnRes = await user.agent.get("/api/rest/book/search").query({query: "No ISBN Book"});
        const noIsbnBook = noIsbnRes.body.books.find((b: any) => b.name === "No ISBN Book");
        expect(noIsbnBook.isbn).toBeNull();
        expect(noIsbnBook.image_url).toBeFalsy(); // no ISBN -> no cover lookup possible.
    });

    it("skips re-importing the same file as duplicates", async () => {
        await user.agent
            .post("/api/rest/import/library")
            .field("origin", "goodreads")
            .attach("file", Buffer.from(GOODREADS_CSV), "lib.csv");

        const res = await user.agent
            .post("/api/rest/import/library")
            .field("origin", "goodreads")
            .attach("file", Buffer.from(GOODREADS_CSV), "lib.csv");

        expect(res.body).toMatchObject({imported: 0, skipped: 2, failed: 0});
    });

    it("reports a row with no title as failed without aborting the rest of the file", async () => {
        const csv = [
            "Title,Author,ISBN,ISBN13,Publisher,Binding,Number of Pages,Year Published,Original Publication Year,Exclusive Shelf",
            ',Someone,"=""""","=""""",Pub,Paperback,100,2000,2000,to-read',
            'Valid Book,Someone,"=""""","=""""",Pub,Paperback,100,2000,2000,to-read',
        ].join("\n");

        const res = await user.agent
            .post("/api/rest/import/library")
            .field("origin", "goodreads")
            .attach("file", Buffer.from(csv), "lib.csv");

        expect(res.body.imported).toBe(1);
        expect(res.body.failed).toBe(1);
        expect(res.body.errors[0]).toMatchObject({reason: "Missing title"});
    });
});

const VAULTISSE_CSV_HEADER = "Title,Authors,ISBN,Publisher,Published Year,Pages,Format,Category,Description,Language,Cover";

describe("POST /import/library - vaultisse origin", () => {
    it("imports authors (semicolon-separated), category, description, language and format", async () => {
        const csv = [
            VAULTISSE_CSV_HEADER,
            'Good Omens,"Terry Pratchett;Neil Gaiman",,Gollancz,1990,288,Paperback,Fantasy,"Angel and demon team up.",en,',
        ].join("\n");

        const res = await user.agent
            .post("/api/rest/import/library")
            .field("origin", "vaultisse")
            .attach("file", Buffer.from(csv), "lib.csv");

        expect(res.body).toMatchObject({imported: 1, skipped: 0, failed: 0});

        const bookRes = await user.agent.get("/api/rest/book/search").query({query: "Good Omens"});
        const bookId = bookRes.body.books[0].id;
        const detailRes = await user.agent.get(`/api/rest/book/${bookId}`);

        expect(detailRes.body).toMatchObject({name: "Good Omens", description: "Angel and demon team up.", language_code: "en"});
        expect(detailRes.body.authors.map((a: any) => a.name).sort()).toEqual(["Neil Gaiman", "Terry Pratchett"]);

        const categoriesRes = await user.agent.get("/api/rest/category");
        expect(categoriesRes.body.some((c: any) => c.name === "Fantasy" && c.id === detailRes.body.category_id)).toBe(true);
    });

    it("uses an explicit base64 cover as-is, without an ISBN lookup", async () => {
        const cover = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
        const csv = [VAULTISSE_CSV_HEADER, `Base64 Cover Book,Someone,,,,,,,,,"${cover}"`].join("\n");

        const res = await user.agent
            .post("/api/rest/import/library")
            .field("origin", "vaultisse")
            .attach("file", Buffer.from(csv), "lib.csv");
        expect(res.body.imported).toBe(1);

        const bookRes = await user.agent.get("/api/rest/book/search").query({query: "Base64 Cover Book"});
        expect(bookRes.body.books[0].image_url).toBe(cover);
        expect(mockedAxios.get).not.toHaveBeenCalled();
    });

    it("rejects a disallowed cover host and falls back to an ISBN lookup instead", async () => {
        const csv = [
            VAULTISSE_CSV_HEADER,
            `Disallowed Cover Book,Someone,${freshIsbn()},,,,,,,,https://evil.example.com/tracker.png`,
        ].join("\n");

        const res = await user.agent
            .post("/api/rest/import/library")
            .field("origin", "vaultisse")
            .attach("file", Buffer.from(csv), "lib.csv");
        expect(res.body.imported).toBe(1);

        const bookRes = await user.agent.get("/api/rest/book/search").query({query: "Disallowed Cover Book"});
        expect(bookRes.body.books[0].image_url).toContain("covers.openlibrary.org");
        expect(mockedAxios.get).toHaveBeenCalledWith(
            expect.stringContaining("covers.openlibrary.org"),
            expect.anything()
        );
    });

    it("leaves the cover empty when the ISBN fallback lookup finds nothing", async () => {
        mockedAxios.get.mockResolvedValue({status: 404, headers: {}});
        const csv = [VAULTISSE_CSV_HEADER, `No Cover Book,Someone,${freshIsbn()},,,,,,,,`].join("\n");

        const res = await user.agent
            .post("/api/rest/import/library")
            .field("origin", "vaultisse")
            .attach("file", Buffer.from(csv), "lib.csv");
        expect(res.body.imported).toBe(1);

        const bookRes = await user.agent.get("/api/rest/book/search").query({query: "No Cover Book"});
        expect(bookRes.body.books[0].image_url).toBeFalsy();
    });

    // The duplicate check is instance-wide now: an import that overlaps with
    // what another member already added skips those rows instead of building a
    // second copy of the same titles in the shared library.
    it("skips a row another account already imported, and shares what it does import", async () => {
        const isbn = freshIsbn();
        const csv = [VAULTISSE_CSV_HEADER, `Cross Account Import,Someone,${isbn},,,,,,,,`].join("\n");

        const first = await user.agent
            .post("/api/rest/import/library")
            .field("origin", "vaultisse")
            .attach("file", Buffer.from(csv), "lib.csv");
        expect(first.body.imported).toBe(1);

        const otherUser = await createAuthenticatedUser(app);
        const second = await otherUser.agent
            .post("/api/rest/import/library")
            .field("origin", "vaultisse")
            .attach("file", Buffer.from(csv), "lib.csv");
        expect(second.body.imported).toBe(0);
        expect(second.body.skipped).toBe(1);

        // The one imported copy is visible to the account that didn't import it.
        const theirSearch = await otherUser.agent.get("/api/rest/book/search").query({query: "Cross Account Import"});
        expect(theirSearch.body.books.some((b: any) => b.isbn === isbn)).toBe(true);
    });
});
