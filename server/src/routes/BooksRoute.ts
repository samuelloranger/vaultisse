/**
 * =============================================================================
 * BooksRoute
 * =============================================================================
 * Mounted at `/api/rest/book` (see server/src/routes/Routes.ts).
 *
 * Owns everything related to a user's book catalog:
 *  - searching/listing/reading/updating/deleting `books`
 *  - creating books either manually or automatically from an ISBN lookup
 *    (Google Books + the BnF catalogue + Open Library, merged - see
 *    server/src/utils/BookMetadata.ts)
 *  - managing physical copies of a book ("book stocks": add/update/remove,
 *    and bulk "return" of loaned/sold copies)
 *
 * Every route in this file (except the small pure helper functions at the
 * bottom) requires a valid session - see `requireAuth` in
 * server/src/middlewares/AuthMiddleware.ts. Nothing is scoped beyond that:
 * this is one shared library that every account co-manages, so any member can
 * read and modify any book. `created_by` is stamped on insert as attribution
 * ("added by Camille") and is never filtered on.
 */
import { Router, Request, Response } from "express";
import crypto from "crypto";
import { appService } from "../AppService";
import { requireAuth } from "../middlewares/AuthMiddleware";
import multer from "multer";
import { IBookAddMd } from "../types/book/IBookAddMd";
import { IBookFile } from "../types/book/IBookFile";
import { Pool, PoolClient } from "pg";
import { SearchFilter } from "../types/search/SearchFilter";
import { SortType } from "../types/search/SortType";
import { normalizeAndValidateIsbn } from "../utils/IsbnVerification";
import {
    BookMetadataProvenance,
    IBookLookupResult,
    fetchOpenLibraryCover,
    lookupBookMetadata,
    normalizeLanguageCode,
} from "../utils/BookMetadata";
import { IBookMetadata } from "../types/book/IBookMetadata";
import {
    BookMetadataField,
    IBookMetadataRefreshPlan,
    IBookMetadataSnapshot,
    RefreshMode,
    planMetadataRefresh,
} from "../utils/BookMetadataRefresh";
import { requireAdmin } from "../middlewares/AdminMiddleware";
import { ActivityAction, recordActivity } from "../utils/ActivityLog";
import { isValidEpub, isValidMobi, isValidPdf } from "../utils/FileSignature";
import { recordLoan, recordReturn } from "../utils/LoanHistory";
import { handleUploadError } from "../middlewares/UploadErrorMiddleware";
import { validatedRegion } from "../utils/Regions";
// @ts-ignore
const router: Router = Router();

// Multer setup - store in memory
const storage = multer.memoryStorage();
const maxCoverImageSizeMb = 4;
const upload = multer({
    storage,
    limits: { fileSize: maxCoverImageSizeMb * 1024 * 1024 },
    fileFilter: (req: Request, file: Express.Multer.File, cb: (error: any, acceptFile: boolean) => void) => {
        // @ts-ignore
        if (file.mimetype !== "image/png" && file.mimetype !== "image/jpeg") {
            return cb(new Error("Only PNG or JPG images are allowed"), false);
        }
        cb(null, true);
    },
});

// Max size for the ebook-file backups, configurable via MAX_EBOOK_FILE_SIZE_MB
// so deployers can raise (or lower) the limit without a code change.
// Defaults to 10MB when unset or not a valid positive number.
const parsedMaxEbookFileSizeMb = Number(process.env.MAX_EBOOK_FILE_SIZE_MB);
const maxEbookFileSizeMb =
    Number.isFinite(parsedMaxEbookFileSizeMb) && parsedMaxEbookFileSizeMb > 0 ? parsedMaxEbookFileSizeMb : 10;

// Multer setup for the book ebook-file backups (epub/pdf/Kindle) - also stored
// in memory, validated by extension since browsers report inconsistent
// mimetypes for .epub/.mobi/.azw3.
const fileUpload = multer({
    storage,
    limits: { fileSize: maxEbookFileSizeMb * 1024 * 1024 },
    fileFilter: (req: Request, file: Express.Multer.File, cb: (error: any, acceptFile: boolean) => void) => {
        const name = file.originalname.toLowerCase();
        if (!name.endsWith(".epub") && !name.endsWith(".pdf") && !name.endsWith(".mobi") && !name.endsWith(".azw3")) {
            return cb(new Error("Only EPUB, PDF or Kindle files are allowed"), false);
        }
        cb(null, true);
    },
});

/**
 * GET /book/search
 * -----------------
 * Paginated, filterable search over the shared library's books.
 *
 * Auth: required (session cookie).
 *
 * Query params (all optional):
 *  - query        {string} Case-insensitive match against book name OR isbn.
 *  - category_id  {number | number[] | "1,2,3"} Restrict to one or more category ids.
 *  - page         {number} Zero-based page index. 50 results per page.
 *  - filters      {string} Comma-separated list of `SearchFilter` values,
 *                 e.g. "NO_STOCK", "HAS_STOCK", "ON_LOAN" or "RECENT"
 *                 (see types/search/SearchFilter.ts).
 *  - date_from    {string} Restrict to books added on/after this date (YYYY-MM-DD).
 *  - date_to      {string} Restrict to books added on/before this date (YYYY-MM-DD).
 *  - sort         {string} A `SortType` value - "NAME_ASC" (default), "NAME_DESC",
 *                 "DATE_NEWEST" or "DATE_OLDEST" (see types/search/SortType.ts).
 *
 * Example request:
 *  GET /api/rest/book/search?query=hobbit&category_id=3&page=0&filters=HAS_STOCK&sort=DATE_NEWEST
 *
 * Example response (200):
 *  {
 *    "total": 1,
 *    "limit": 50,
 *    "books": [
 *      {
 *        "id": 12,
 *        "name": "The Hobbit",
 *        "image_url": "https://books.google.com/...",
 *        "isbn": "9780261102217",
 *        "category_id": 3,
 *        "language_code": "en",
 *        "authors": [{ "id": 4, "name": "J.R.R. Tolkien" }]
 *      }
 *    ]
 *  }
 */
// @ts-ignore
router.get("/search", requireAuth, async (req: Request, res: Response) => {
    // Params
    const query = req.query.query ? String(req.query.query) : undefined;
    // Array of categories
    const category_id = req.query.category_id;
    const page = Math.max(0, Number(req.query.page)) || 0;
    const filters: SearchFilter[] = req.query.filters ? (String(req.query.filters).split(",") as SearchFilter[]) : [];
    const dateFrom = req.query.date_from ? String(req.query.date_from) : undefined;
    const dateTo = req.query.date_to ? String(req.query.date_to) : undefined;
    const sort = Object.values(SortType).includes(req.query.sort as SortType)
        ? (req.query.sort as SortType)
        : SortType.NAME_ASC;

    const pool = appService.getDatabasePool();
    const client = await pool.connect();
    try {
        const MAX_ROWS = 50;
        const skip = MAX_ROWS * page;

        const params: any[] = [];
        const conditions: string[] = [];

        let sqlStatement = `
            SELECT books.id,
                   books.name,
                   books.image_url,
                   books.isbn,
                   books.category_id,
                   books.language_code,
                   COALESCE(
                           json_agg(
                                   json_build_object(
                                           'id', authors.id,
                                           'name', authors.name
                                   )
                           ) FILTER(WHERE authors.id IS NOT NULL),
                           '[]'
                   ) AS authors
            FROM books
                     LEFT JOIN book_authors ON books.id = book_authors.book_id
                     LEFT JOIN authors ON book_authors.author_id = authors.id
        `;

        if (query) {
            // Parenthesised on purpose. `conditions` is joined with ' AND ',
            // and AND binds tighter than OR - so an unwrapped
            // `a ILIKE $1 OR b ILIKE $2` here would re-associate as
            // `(... AND a ILIKE $1) OR (b ILIKE $2)`, letting the ISBN branch
            // escape every other filter in the list. Upstream ships exactly
            // that bug, where the escaped predicate was the ownership check
            // (see the spec's "Upstream security report"); there is no
            // ownership check left to escape here, but category/date/stock
            // filters would still be silently ignored for any ISBN match.
            conditions.push(
                `(LOWER(books.name) ILIKE $${params.push(`%${query.toLocaleLowerCase()}%`)} OR LOWER(books.isbn) ILIKE $${params.push(`%${query.toLocaleLowerCase()}%`)})`
            );
        }

        if (category_id) {
            const ids = Array.isArray(category_id)
                ? category_id.map(Number)
                : String(category_id).split(",").map(Number);

            conditions.push(`category_id = ANY($${params.length + 1})`);
            params.push(ids);
        }

        if (filters.length > 0) {
            filters.forEach((filter) => {
                switch (filter) {
                    case SearchFilter.NO_STOCK: {
                        conditions.push(`books.id NOT IN (SELECT book_id FROM book_stocks)`);
                        break;
                    }
                    case SearchFilter.HAS_STOCK: {
                        conditions.push(`books.id IN (SELECT book_id FROM book_stocks)`);
                        break;
                    }
                    case SearchFilter.ON_LOAN: {
                        conditions.push(`books.id IN (SELECT book_id FROM book_stocks WHERE status = 2)`);
                        break;
                    }
                    case SearchFilter.RECENT: {
                        conditions.push(`books.date_created >= NOW() - INTERVAL '30 days'`);
                        break;
                    }
                }
            });
        }

        if (dateFrom) {
            conditions.push(`books.date_created >= $${params.push(dateFrom)}`);
        }

        if (dateTo) {
            conditions.push(`books.date_created < $${params.push(dateTo)}::date + INTERVAL '1 day'`);
        }

        if (conditions.length > 0) {
            sqlStatement += ` WHERE ${conditions.join(" AND ")}`;
        }

        /**
         * Total results
         */
        let totalQuery = "SELECT COUNT(*) FROM books";
        if (conditions.length > 0) {
            totalQuery += ` WHERE ${conditions.join(" AND ")}`;
        }
        appService.getLogger().debug(`execute total results query: ${totalQuery}`);
        const totalResults = await client.query(totalQuery, params);

        /**
         * Results
         */
        const ORDER_BY_CLAUSES: Record<SortType, string> = {
            [SortType.NAME_ASC]: "books.name ASC",
            [SortType.NAME_DESC]: "books.name DESC",
            [SortType.DATE_NEWEST]: "books.date_created DESC",
            [SortType.DATE_OLDEST]: "books.date_created ASC",
        };

        sqlStatement += `
            GROUP BY
                books.id,
                books.name,
                books.image_url,
                books.isbn,
                books.category_id,
                books.language_code,
                books.date_created
            ORDER BY ${ORDER_BY_CLAUSES[sort]}
            LIMIT ${MAX_ROWS} OFFSET ${skip};
        `;

        // Use a prepared statement to fetch items by name
        appService.getLogger().debug(`executing query: ${sqlStatement}`);
        const result = await client.query(sqlStatement, params);

        // Return the result (found rows)
        res.status(200).json({
            total: totalResults.rows[0] ? Number(totalResults.rows[0].count) : -1,
            limit: MAX_ROWS,
            books: result.rows,
        });
    } catch (err: any) {
        console.error("Error executing query", err.stack);
        res.status(500).send("Internal Server Error");
    } finally {
        client.release();
    }
});

/**
 * GET /book/counters
 * --------------------
 * Lightweight counters for the shared library, powering the
 * "Library" section of the left nav (see `AppMenu.vue`) and its quick
 * filters - cheap enough to fetch on every page load, unlike a full search.
 *
 * Auth: required.
 *
 * Example response (200):
 *  { "total": 42, "recent": 3, "onLoan": 5, "noStock": 10 }
 */
// @ts-ignore
router.get("/counters", requireAuth, async (req: Request, res: Response) => {
    const pool = appService.getDatabasePool();

    try {
        const [total, recent, onLoan, noStock] = await Promise.all([
            pool.query(`SELECT COUNT(*) FROM books`),
            pool.query(`SELECT COUNT(*) FROM books WHERE date_created >= NOW() - INTERVAL '30 days'`),
            pool.query(`SELECT COUNT(*) FROM books WHERE id IN (SELECT book_id FROM book_stocks WHERE status = 2)`),
            pool.query(`SELECT COUNT(*) FROM books WHERE id NOT IN (SELECT book_id FROM book_stocks)`),
        ]);

        res.status(200).json({
            total: Number(total.rows[0].count),
            recent: Number(recent.rows[0].count),
            onLoan: Number(onLoan.rows[0].count),
            noStock: Number(noStock.rows[0].count),
        });
    } catch (err: any) {
        console.error("Error executing query", err.stack);
        res.status(500).send("Internal Server Error");
    }
});

/**
 * GET /book/:id
 * -------------
 * Fetch full detail for a single book, including its physical stocks
 * (with resolved location/customer names), its authors, and its backed-up
 * ebook files.
 *
 * Auth: required. Path param `id` {number} - book id.
 *
 * Example request:  GET /api/rest/book/12
 *
 * Example response (200):
 *  {
 *    "id": 12,
 *    "name": "The Hobbit",
 *    "description": "...",
 *    "image_url": "https://...",
 *    "isbn": "9780261102217",
 *    "category_id": 3,
 *    "language_code": "en",
 *    "publisher": "HarperCollins",
 *    "published_date": "1937-09-21",
 *    "pages": 310,
 *    "format_id": 1,
 *    "stocks": [
 *      { "id": 1, "code": "a1b2c3d4e5", "status": 0, "location_id": 2,
 *        "location_name": "Main shelf", "customer_id": null, "customer_name": null }
 *    ],
 *    "authors": [{ "id": 4, "name": "J.R.R. Tolkien" }],
 *    "files": [
 *      { "id": 3, "file_type": "epub", "file_name": "hobbit.epub", "file_size": 512000, "date_created": "..." }
 *    ]
 *  }
 *
 * Response (404): "Book not found" - when no book with that id exists.
 */
// @ts-ignore
router.get("/:id", requireAuth, async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    appService.getLogger().debug(`Get book, id: ${id}`);
    const pool = appService.getDatabasePool();
    const client = await pool.connect();
    try {
        const result = await client.query(
            `
            SELECT books.id,
                   books.name,
                   books.description,
                   books.image_url,
                   books.isbn,
                   books.category_id,
                   books.language_code,
                   books.publisher,
                   books.published_date,
                   books.date_created,
                   books.date_updated,
                   books.pages,
                   books.format_id,
                   COALESCE(
                           json_agg(
                               DISTINCT jsonb_build_object(
                   'id', book_files.id,
                   'file_type', book_files.file_type,
                   'file_name', book_files.file_name,
                   'file_size', book_files.file_size,
                   'date_created', book_files.date_created
               )
           ) FILTER(WHERE book_files.id IS NOT NULL), '[]'
                   )                                                                    AS files,
                   COALESCE(
                           json_agg(
                               DISTINCT jsonb_build_object(
                   'id', book_stocks.id,
                   'code', book_stocks.code,
                   'status', book_stocks.status,
                   'location_id', locations.id,  -- Using correct column from locations table
                   'location_name', locations.name,
                   'customer_id', customers.id,
                   'customer_name', customers.name
               )
           ) FILTER(WHERE book_stocks.id IS NOT NULL), '[]'
                   )                                                                    AS stocks,
                   COALESCE(
                           json_agg(
                               DISTINCT jsonb_build_object(
                   'id', authors.id,
                   'name', authors.name
               )
           ) FILTER(WHERE authors.id IS NOT NULL), '[]') AS authors
            -- Every join here is on the foreign key alone. Upstream scopes
            -- exactly one of these six (customers) to the session user and
            -- leaves the other five open, which is incoherent either way:
            -- under the old per-user model it was an isolation hole in five
            -- joins, and the one scoped join would blank out a customer name
            -- on a row the caller could already see. One shared library makes
            -- the FK the whole truth.
            FROM books
                     LEFT JOIN book_stocks ON books.id = book_stocks.book_id
                     LEFT JOIN locations ON book_stocks.location_id = locations.id
                     LEFT JOIN customers ON book_stocks.customer_id = customers.id
                     LEFT JOIN book_authors ON books.id = book_authors.book_id
                     LEFT JOIN authors ON book_authors.author_id = authors.id
                     LEFT JOIN book_files ON books.id = book_files.book_id
            WHERE books.id = $1
            GROUP BY books.id,
                     books.name,
                     books.description,
                     books.image_url,
                     books.isbn,
                     books.category_id,
                     books.language_code,
                     books.publisher,
                     books.published_date,
                     books.date_created,
                     books.date_updated,
                     books.pages,
                     books.format_id;
        `,
            [id]
        );

        if (result.rows.length !== 1) {
            res.status(404).send("Book not found");
        } else {
            res.status(200).json(result.rows[0]);
        }
    } catch (err: any) {
        console.error("Error executing query", err.stack);
        res.status(500).send("Internal Server Error");
    } finally {
        client.release();
    }
});

/**
 * PUT /book/:id
 * -------------
 * Update a book's metadata and reconcile its author list.
 *
 * Auth: required. Path param `id` {number} - book id.
 *
 * Body (JSON):
 *  {
 *    "name": "The Hobbit",
 *    "description": "A hobbit's unexpected journey.",
 *    "image_url": "data:image/png;base64,..." | "https://books.google.com/...",
 *    "isbn": "9780261102217",
 *    "category_id": 3,
 *    "language_code": "en",
 *    "authors": [4, 7],            // full desired list of author ids; diffed against
 *                                  // existing book_authors rows (added/removed accordingly)
 *    "publisher": "HarperCollins",
 *    "published_date": "1937-09-21",
 *    "pages": 310,
 *    "format_id": 1
 *  }
 *
 * Notes:
 *  - `image_url` is validated by `isAllowedImageUrl()` - only our own
 *    data: URIs or the whitelisted Google Books / Open Library hosts are accepted.
 *  - The whole update (books row + book_authors diff) runs in one transaction.
 *
 * Responses: 200 {"message": "Book updated successfully"} |
 *            400 {"error": "Invalid image URL"} |
 *            404 {"error": "Book not found"} | 500 on failure (rolls back).
 */
// @ts-ignore
router.put("/:id", requireAuth, async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    appService.getLogger().debug(`Update book, id: ${id}`);

    // Body params
    const {
        name,
        image_url,
        isbn,
        category_id,
        language_code,
        authors,
        description,
        publisher,
        published_date,
        pages,
        format_id,
    } = req.body;

    if (image_url && !isAllowedImageUrl(image_url)) {
        return res.status(400).send({ error: "Invalid image URL" });
    }

    // Database connection
    const pool = appService.getDatabasePool();
    const client = await pool.connect();

    try {
        // Validate the existence of the book
        const bookCheck = await client.query("SELECT id FROM books WHERE id = $1", [id]);
        if (bookCheck.rowCount === 0) {
            return res.status(404).send({ error: "Book not found" });
        }

        // Start transaction
        await client.query("BEGIN");

        // Update the books table
        const updateQuery = `
            UPDATE books
            SET name           = $1,
                description    = $2,
                image_url      = $3,
                isbn           = $4,
                category_id    = $5,
                format_id      = $6,
                publisher      = $7,
                published_date = $8,
                language_code  = $9,
                pages          = $10,
                date_updated   = CURRENT_TIMESTAMP
            WHERE id = $11
        `;
        const updateValues = [
            name,
            description,
            image_url,
            isbn,
            category_id,
            format_id,
            publisher,
            published_date,
            language_code,
            pages,
            id,
        ];
        await client.query(updateQuery, updateValues);

        // Handle authors relationship in the book_authors table
        if (authors && Array.isArray(authors)) {
            // Fetch existing authors associated with the book
            const existingAuthorsResult = await client.query("SELECT author_id FROM book_authors WHERE book_id = $1", [
                id,
            ]);
            const existingAuthors = existingAuthorsResult.rows.map((row) => row.author_id);

            // Determine authors to remove (present in the database but not in the new list)
            const authorsToRemove = existingAuthors.filter((authorId) => !authors.includes(authorId));

            // Determine authors to add (present in the new list but not in the database)
            const authorsToAdd = authors.filter((authorId) => !existingAuthors.includes(authorId));

            // Remove authors no longer associated with the book
            for (const authorId of authorsToRemove) {
                await client.query("DELETE FROM book_authors WHERE book_id = $1 AND author_id = $2", [id, authorId]);
            }

            // Add new authors to the book
            for (const authorId of authorsToAdd) {
                // Ensure the author exists in the authors table
                const authorCheck = await client.query("SELECT id FROM authors WHERE id = $1", [authorId]);
                if (authorCheck.rowCount !== 0) {
                    // Associate the author with the book
                    await client.query(
                        "INSERT INTO book_authors (book_id, author_id, created_by) VALUES ($1, $2, $3)",
                        [id, authorId, appService.getSessionUser(req)]
                    );
                } else {
                    console.warn(`Author with ID ${authorId} not found, skipping association.`);
                }
            }
        }

        // Commit transaction
        await client.query("COMMIT");
        res.send({ message: "Book updated successfully" });
    } catch (e) {
        // Rollback transaction in case of error
        await client.query("ROLLBACK");
        console.error("Error while updating book", e);
        res.status(500).send("Internal Server Error");
    } finally {
        client.release();
    }
});

/**
 * DELETE /book/:id
 * ----------------
 * Permanently delete a book (and, via DB foreign keys, its stocks/author links).
 *
 * Auth: required. Path param `id` {number} - book id.
 *
 * Example request: DELETE /api/rest/book/12
 *
 * Responses: 200 {"message": "Book deleted successfully"} |
 *            404 {"error": "Book not found"} | 500 on failure.
 */
// @ts-ignore
router.delete("/:id", requireAuth, async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    appService.getLogger().debug(`Delete book, id: ${id}`);

    // Database connection
    const pool = appService.getDatabasePool();
    const client = await pool.connect();

    try {
        // Validate the existence of the book
        const bookCheck = await client.query("SELECT id FROM books WHERE id = $1", [id]);
        if (bookCheck.rowCount === 0) {
            return res.status(404).send({ error: "Book not found" });
        }

        await client.query("DELETE FROM books WHERE id = $1", [id]);

        res.send({ message: "Book deleted successfully" });
    } catch (e) {
        console.error("Error while deleting book", e);
        res.status(500).send("Internal Server Error");
    } finally {
        client.release();
    }
});

/**
 * POST /book/:id/image
 * ---------------------
 * Replace a book's cover image with an uploaded file.
 *
 * Auth: required. Path param `id` {number} - book id.
 * Body: multipart/form-data with a single field `image` (PNG or JPEG, max 4MB -
 * enforced by the `multer` config above). The file is stored inline as a
 * base64 data: URI in `books.image_url` (no external file storage/CDN).
 *
 * Example request (curl):
 *   curl -X POST /api/rest/book/12/image -F "image=@cover.jpg"
 *
 * Response (200): number of rows updated (0 or 1), e.g. `1`.
 */
router.post(
    "/:id/image",
    requireAuth,
    upload.single("image"),
    handleUploadError(maxCoverImageSizeMb),
    async (req: Request, res: Response) => {
        const id = Number(req.params.id);
        let imageUrl = "";

        if (req.file) {
            const base64 = req.file.buffer.toString("base64");
            imageUrl = `data:${req.file.mimetype};base64,${base64}`;
        }

        const pool = appService.getDatabasePool();

        try {
            const updatedBook = await pool.query("UPDATE books SET image_url = $1 WHERE id = $2", [imageUrl, id]);

            res.status(200).json(updatedBook.rowCount);
        } catch (error) {
            // Rollback on error
            console.error("Transaction error:", error);
            res.status(500).send("Error adding book");
        }
    }
);

/** @param fileName Original uploaded file name. @returns The `book_files.file_type` its extension maps to. */
function fileTypeFromName(fileName: string): "epub" | "pdf" | "mobi" {
    const name = fileName.toLowerCase();
    if (name.endsWith(".epub")) return "epub";
    if (name.endsWith(".pdf")) return "pdf";
    return "mobi"; // .mobi or .azw3 - already enforced by fileFilter above.
}

/**
 * POST /book/:id/file
 * --------------------
 * Upload (or replace) one of a book's backup ebook files - a personal copy
 * kept in case the user only has the file itself on an e-reader. A book can
 * have up to one file per type (epub/pdf/mobi); uploading a file replaces
 * any existing file of that same type, leaving files of other types alone.
 *
 * Auth: required. Path param `id` {number} - book id.
 * Body: multipart/form-data with a single field `file` (.epub, .pdf, .mobi
 * or .azw3, max size configurable via MAX_EBOOK_FILE_SIZE_MB, default 10MB -
 * enforced by the `fileUpload` config above). Stored
 * as raw bytes in `book_files.file_data`. `.mobi` and `.azw3` are both
 * stored under the `mobi` file_type - they share the same MOBI/KF8
 * container - so uploading one replaces the other.
 *
 * The file name's extension only gets it past `fileFilter` - the actual
 * bytes are then checked against the real PDF/EPUB/MOBI signature (see
 * `utils/FileSignature.ts`) before anything is persisted, so a renamed
 * unrelated file is rejected rather than stored.
 *
 * Example request (curl):
 *   curl -X POST /api/rest/book/12/file -F "file=@book.epub"
 *
 * Response (200): the file's metadata (no bytes), e.g.
 *   {"id": 3, "file_type": "epub", "file_name": "book.epub", "file_size": 512000, "date_created": "..."}
 * Response (400): "No file provided" | "File content does not match a valid EPUB, PDF or Kindle file" | "Only EPUB, PDF or Kindle files are allowed" (from fileFilter, via `handleUploadError`).
 * Response (413): "File exceeds the maximum allowed upload size of {N}MB" - when the file is larger than MAX_EBOOK_FILE_SIZE_MB.
 */
router.post(
    "/:id/file",
    requireAuth,
    fileUpload.single("file"),
    handleUploadError(maxEbookFileSizeMb),
    async (req: Request, res: Response) => {
        const id = Number(req.params.id);

        if (!req.file) {
            return res.status(400).send("No file provided");
        }

        const fileType = fileTypeFromName(req.file.originalname);

        // Trust the actual bytes, not just the file name (which fileFilter above only
        // checked by extension - trivially spoofed by renaming any file to .pdf/.epub/.mobi/.azw3).
        const isValidContent =
            fileType === "epub"
                ? isValidEpub(req.file.buffer)
                : fileType === "pdf"
                  ? isValidPdf(req.file.buffer)
                  : isValidMobi(req.file.buffer);
        if (!isValidContent) {
            return res.status(400).send("File content does not match a valid EPUB, PDF or Kindle file");
        }

        const pool = appService.getDatabasePool();
        const userId = appService.getSessionUser(req);

        try {
            const book = await pool.query("SELECT id FROM books WHERE id = $1", [id]);
            if (book.rowCount !== 1) {
                return res.status(404).send("Book not found");
            }

            const result = await pool.query(
                `INSERT INTO book_files (book_id, created_by, file_type, file_name, file_size, file_data)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (book_id, file_type) DO UPDATE
                 SET file_name    = EXCLUDED.file_name,
                     file_size    = EXCLUDED.file_size,
                     file_data    = EXCLUDED.file_data,
                     date_created = CURRENT_TIMESTAMP
             RETURNING id, file_type, file_name, file_size, date_created`,
                [id, userId, fileType, req.file.originalname, req.file.size, req.file.buffer]
            );

            const file: IBookFile = result.rows[0];
            res.status(200).json(file);
        } catch (error) {
            console.error("Error uploading book file:", error);
            res.status(500).send("Error uploading book file");
        }
    }
);

/**
 * GET /book/:id/file/:fileId/download
 * -------------------------------------
 * Download one of the book's backed-up ebook files.
 *
 * Auth: required. Path params: `id` {number} - book id; `fileId` {number} - `book_files.id`.
 *
 * Response (200): the raw file bytes, with `Content-Type` and
 * `Content-Disposition: attachment` set from the stored file's name/type.
 * Response (404): "File not found" - when no such backed-up file exists for this book.
 */
router.get("/:id/file/:fileId/download", requireAuth, async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const fileId = Number(req.params.fileId);
    const pool = appService.getDatabasePool();

    try {
        const result = await pool.query(
            "SELECT file_data, file_name, file_type FROM book_files WHERE id = $1 AND book_id = $2",
            [fileId, id]
        );

        if (result.rowCount !== 1) {
            return res.status(404).send("File not found");
        }

        const { file_data, file_name, file_type } = result.rows[0];
        const contentType =
            file_type === "epub"
                ? "application/epub+zip"
                : file_type === "pdf"
                  ? "application/pdf"
                  : "application/x-mobipocket-ebook";
        res.setHeader("Content-Type", contentType);
        const asciiName = file_name.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "");
        res.setHeader(
            "Content-Disposition",
            `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(file_name)}`
        );
        res.status(200).send(file_data);
    } catch (error) {
        console.error("Error downloading book file:", error);
        res.status(500).send("Error downloading book file");
    }
});

/**
 * DELETE /book/:id/file/:fileId
 * -------------------------------
 * Remove one of the book's backed-up ebook files.
 *
 * Auth: required. Path params: `id` {number} - book id; `fileId` {number} - `book_files.id`.
 *
 * Response (200): whether a file was actually deleted, e.g. `true` | `false`.
 */
router.delete("/:id/file/:fileId", requireAuth, async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const fileId = Number(req.params.fileId);
    const pool = appService.getDatabasePool();

    try {
        const result = await pool.query("DELETE FROM book_files WHERE id = $1 AND book_id = $2", [fileId, id]);

        res.status(200).json(result.rowCount === 1);
    } catch (error) {
        console.error("Error deleting book file:", error);
        res.status(500).send("Error deleting book file");
    }
});

/**
 * POST /book
 * ----------
 * Create a book by hand (as opposed to the ISBN auto-lookup below).
 *
 * Auth: required.
 * Body: multipart/form-data
 *  - name        {string} required (books.name is NOT NULL)
 *  - description {string} optional
 *  - isbn        {string} optional - rejected with 404 if it's already in the library
 *  - image       {file}   optional, PNG/JPEG, stored as base64 data: URI
 *
 * Side effect: if the library has exactly one location, the new book
 * automatically gets one stock entry there (see `__automaticallyAddBookToLocation`).
 *
 * Example request (curl):
 *   curl -X POST /api/rest/book -F "name=The Hobbit" -F "isbn=9780261102217" -F "image=@cover.jpg"
 *
 * Response (200): the new book's id, e.g. `42`.
 */
// @ts-ignore
router.post(
    "",
    requireAuth,
    upload.single("image"),
    handleUploadError(maxCoverImageSizeMb),
    async (req: Request, res: Response) => {
        const name = req.body.name;
        const description = req.body.description;
        const isbn = req.body.isbn;
        let imageUrl = "";

        if (req.file) {
            const base64 = req.file.buffer.toString("base64");
            imageUrl = `data:${req.file.mimetype};base64,${base64}`;
        }

        const pool = appService.getDatabasePool();
        const userId = appService.getSessionUser(req);

        try {
            // If the user give us a isbn code, check if exist
            if (isbn) {
                const existIsbn = await pool.query("SELECT id FROM books WHERE isbn = $1", [isbn]);
                if (existIsbn.rowCount === 1) {
                    return res.status(404).send("Book with provided ISBN code already exist");
                }
            }

            const insertBook = await pool.query(
                "INSERT INTO books (name, description, image_url, isbn, created_by) VALUES ($1, $2, $3, $4, $5) RETURNING id",
                [name, description, imageUrl, isbn, userId]
            );

            const bookId = insertBook.rows[0].id;

            /************************************************************
             * LOCATION
             * Try to add the book to a location
             * *********************************************************/
            await __automaticallyAddBookToLocation(pool, bookId, userId);

            res.status(200).json(bookId);
        } catch (error) {
            // Rollback on error
            console.error("Transaction error:", error);
            res.status(500).send("Error adding book");
        }
    }
);

/**
 * POST /book/isbn/:isbn
 * ---------------------
 * Create a book automatically by looking up its metadata from an ISBN,
 * instead of typing everything in by hand.
 *
 * Metadata comes from `lookupBookMetadata` (server/src/utils/BookMetadata.ts):
 * Google Books, the BnF catalogue and Open Library, merged field by field
 * rather than chained, so a source that answers with holes in it gets them
 * filled by the next one. Covers still come from Google or, failing that,
 * Open Library's covers API. Categories/authors/language rows are created on
 * the fly if they don't already exist in the shared library
 * (`__ensureCategory`, `__ensureAuthors`, `ensureLanguage`).
 *
 * Auth: required.
 * Path param: `isbn` {string} - required.
 * Body (optional): { "location": "3" }  // location id to place the new stock in;
 *   if omitted, falls back to the "exactly one location" auto-assign rule.
 *
 * Example request:
 *   POST /api/rest/book/isbn/9780261102217
 *   { "location": "2" }
 *
 * Response (200): the new (or already-existing, matched by isbn) book's id, e.g. `42`.
 * Response (400): "No ISBN code provided" (malformed ISBN).
 * Response (404): a JSON body naming which sources were asked and why none of
 *   them produced a book - see `__respondWithoutMetadata`.
 * Response (502): the same body, when every source that ran failed outright.
 */
// @ts-ignore
router.post("/isbn/:isbn", requireAuth, async (req: Request, res: Response) => {
    const isbnCode = normalizeAndValidateIsbn(req.params.isbn);
    if (!isbnCode) {
        return res.status(400).send("No ISBN code provided");
    }

    const locationId: string | null = req.body.location;
    const userId = appService.getSessionUser(req);

    try {
        /**
         * =========================
         * FETCH BOOK (Google + BnF + OpenLibrary, merged)
         * =========================
         */
        const region = await __requestingUserRegion(userId);
        const lookup = await lookupBookMetadata(isbnCode, appService.getGoogleApiKey(), region);
        const metadata = lookup.metadata;

        // books.name is NOT NULL - without a title there's nothing to insert.
        if (!metadata?.title) {
            return __respondWithoutMetadata(res, isbnCode, lookup);
        }

        /**
         * IMAGE (whatever a provider handed back → OpenLibrary Covers fallback)
         */
        const imageUrl: string | null = metadata.imageUrl ?? (await fetchOpenLibraryCover(isbnCode));

        // The same normalisation the refresh flow uses - truncation to the
        // VARCHAR widths, YYYY-MM-DD, two-letter language code - so a book
        // created by a scan and the same book refreshed later land on
        // identical values instead of differing by a trailing space.
        const {
            name,
            description,
            categoryName,
            publisher,
            publishedDate: formattedPublishedDate,
            pages,
            languageCode,
            authors,
        } = __snapshotFromMetadata(metadata, imageUrl);

        /**
         * =========================
         * DATABASE TRANSACTION ONLY
         * =========================
         */
        const pool = appService.getDatabasePool();
        const client = await pool.connect();

        try {
            await client.query("BEGIN");

            /**
             * LANGUAGE
             */
            await ensureLanguage(client, languageCode);

            /**
             * CATEGORY
             */
            const categoryId = await __ensureCategory(client, categoryName, userId);

            /**
             * BOOK
             */
            const bookId = await __getOrCreateBook(
                client,
                {
                    name,
                    description,
                    imageUrl,
                    isbnCode,
                    categoryId,
                    publisher,
                    formattedPublishedDate,
                    languageCode,
                    pages,
                },
                userId
            );

            /**
             * AUTHORS
             */
            if (authors.length) {
                await __ensureAuthors(client, bookId, authors, userId);
            }

            /**
             * LOCATION
             */
            if (locationId) {
                await __addBookToLocation(client, bookId, locationId, userId);
            } else {
                await __automaticallyAddBookToLocation(client, bookId, userId);
            }

            await client.query("COMMIT");
            res.status(200).json(bookId);
        } catch (dbError) {
            await client.query("ROLLBACK");
            console.error("DB transaction error:", dbError);
            return res.status(500).send("Error processing book in database");
        } finally {
            client.release();
        }
    } catch (error: unknown) {
        // `lookupBookMetadata` never throws - a provider that fails comes
        // back in `lookup.failed` and is answered with a 502 by
        // `__respondWithoutMetadata`. Anything reaching here is ours.
        console.error("Error fetching book details:", error);

        return res.status(500).send("Unexpected server error");
    }
});

/**
 * The answer when a lookup produced no usable book.
 *
 * A missing API key and a genuine data gap used to be indistinguishable: both
 * came back as a bare `404 "Book not found"`, so an operator who had simply
 * never set `GOOGLE_BOOKS_API_KEY` saw "no metadata found for this ISBN" and
 * had no way to learn that the strongest source had never been asked. The
 * body now names what was asked and what was not:
 *
 *   `error`: "no_metadata"            - every configured source was asked and
 *                                       none of them has this ISBN.
 *            "source_not_configured"  - nothing was found, *and* a source was
 *                                       skipped for want of configuration.
 *                                       An operator problem, not a data gap.
 *            "source_unavailable"     - every source that ran failed. 502,
 *                                       because trying again may well work.
 *
 * `sourcesTried` / `unconfiguredSources` / `failedSources` carry the detail.
 *
 * The status codes are unchanged (404, or 502 for a total failure) and the
 * client keys on those alone today - so this is additive. To use it, the
 * client would read `ApiError.body.error` and, on "source_not_configured",
 * say so ("Google Books is not configured on this server") instead of the
 * current "No metadata found for this ISBN. Add it manually instead.".
 */
function __respondWithoutMetadata(res: Response, isbn: string, lookup: IBookLookupResult) {
    const unavailable = lookup.failed.length > 0 && lookup.sources.length === 0;

    const error = unavailable
        ? "source_unavailable"
        : lookup.unconfigured.length > 0
          ? "source_not_configured"
          : "no_metadata";

    const message = unavailable
        ? "Every metadata source failed to answer"
        : lookup.unconfigured.length > 0
          ? `No metadata found, and these sources are not configured: ${lookup.unconfigured.join(", ")}`
          : "No metadata source has this ISBN";

    return res.status(unavailable ? 502 : 404).json({
        error,
        message,
        isbn,
        sourcesTried: lookup.sources,
        unconfiguredSources: lookup.unconfigured,
        failedSources: lookup.failed,
    });
}

/**
 * =========================================================
 * RE-FETCHING METADATA FOR A BOOK THAT ALREADY EXISTS
 * =========================================================
 * `POST /book/isbn/:isbn` only ever fills in a book on the way *in*. Every
 * title catalogued before the three-source merge landed (`370a3b6`) therefore
 * still carries whatever the Google-only path produced at the time - which,
 * on a deployment whose `GOOGLE_BOOKS_API_KEY` was empty, was nothing at all,
 * and on one where it was set was a book with no publisher and `pages = 0`.
 *
 * These two routes run the *same* chain against a book that is already in the
 * library and write back only what is genuinely missing. They share
 * `__refreshBookMetadata` below; the chain itself is not forked, reimplemented
 * or special-cased - it is `lookupBookMetadata`, exactly as the scan uses it.
 */

/**
 * POST /book/:id/refresh
 * ----------------------
 * Re-fetch one book's metadata from every source and fill in what it is
 * missing. Intended for books catalogued before the merge existed.
 *
 * Auth: required - any member. It is one lookup for one book, no more
 * expensive than the ISBN scan every member can already run. (The *bulk*
 * route below is admin-only; see its own note.)
 *
 * Path param: `id` {number} - book id.
 * Body (optional):
 *  { "overwrite": false }   // default. Writes only fields the book has nothing in.
 *  { "overwrite": true }    // also replaces fields that already have a value -
 *                           // except the cover, which is never replaced.
 *
 * Nothing outside the book's own bibliographic columns is touched: copies,
 * loans and `created_by` are not this lookup's business.
 *
 * Example response (200):
 *  {
 *    "bookId": 4,
 *    "isbn": "9782824627151",
 *    "mode": "fill",
 *    "changed": [
 *      { "field": "publisher", "from": null, "to": "City roman", "source": "bnf" },
 *      { "field": "pages", "from": 0, "to": 391, "source": "bnf" }
 *    ],
 *    "stillMissing": ["category"],
 *    "sourcesTried": ["google-books", "bnf"],
 *    "unconfiguredSources": [],
 *    "failedSources": []
 *  }
 *
 * `changed: []` is a normal, successful answer: every source was asked and
 * none of them had anything this book does not already have. `stillMissing`
 * names the fields that are empty *and* unfillable - no source has them - so
 * the answer can say that out loud instead of inventing a value.
 *
 * Responses: 404 "Book not found" | 400 `{error: "no_isbn"}` when the book has
 *   no (or a malformed) ISBN - the whole chain is ISBN-keyed, so there is
 *   nothing to ask | 404/502 with the `__respondWithoutMetadata` body when no
 *   source has the ISBN | 500 on failure (rolls back).
 */
// @ts-ignore
router.post("/:id/refresh", requireAuth, async (req: Request, res: Response) => {
    const id = Number(req.params.id);

    if (!Number.isInteger(id)) {
        return res.status(400).send("No book ID provided");
    }

    const mode: RefreshMode = req.body?.overwrite === true ? "overwrite" : "fill";
    const userId = appService.getSessionUser(req);

    let outcome: IRefreshOutcome;

    try {
        outcome = await __refreshBookMetadata(id, mode, userId, await __requestingUserRegion(userId));
    } catch (error) {
        console.error("Error refreshing book metadata:", error);
        return res.status(500).send("Error refreshing book metadata");
    }

    switch (outcome.status) {
        case "isbn_changed":
            return res.status(409).json({
                error: "isbn_changed",
                message: "The ISBN changed during the lookup. Refresh again to use the current ISBN.",
                bookId: id,
            });
        case "not_found":
            return res.status(404).send("Book not found");
        case "no_isbn":
            return res.status(400).json({
                error: "no_isbn",
                message: "This book has no usable ISBN, and every metadata source is keyed on one.",
                bookId: id,
            });
        case "no_metadata":
            return __respondWithoutMetadata(res, outcome.isbn, outcome.lookup);
        case "ok":
            return res.status(200).json({
                bookId: id,
                isbn: outcome.isbn,
                mode,
                changed: outcome.plan.changes,
                stillMissing: outcome.plan.stillMissing,
                sourcesTried: outcome.lookup.sources,
                unconfiguredSources: outcome.lookup.unconfigured,
                failedSources: outcome.lookup.failed,
            });
    }
});

/**
 * Courtesy gap between two lookups in a bulk run, matching the client's own
 * `DELAY_BETWEEN_LOOKUPS_MS` in `AddBookIsbnDialog` and `useScanQueue`. Three
 * rate-limited public catalogues are being asked, under one deployment's
 * single Google key; hammering them is how a key gets throttled for everybody.
 */
const DELAY_BETWEEN_LOOKUPS_MS = 1500;

/** Most books one bulk call will take. Past this the request is long enough to be a job, not a request. */
const MAX_BULK_REFRESH = 50;

/**
 * POST /book/refresh
 * ------------------
 * Refresh several books in one call, serialised.
 *
 * **Admin-only, deliberately.** A single refresh is one member spending one
 * lookup on one book they are looking at - the same cost as the scan they can
 * already run. This is N external calls to three rate-limited services, made
 * under the instance's single `GOOGLE_BOOKS_API_KEY`, on books belonging to
 * everybody: one member could otherwise burn the shared quota (and rewrite
 * fifty other people's records) from one button. That is the same reasoning
 * that moved the lending toggle behind `requireAdmin` - a shared library needs
 * the instance-wide actions gated even though every member can read and edit
 * any single book.
 *
 * Body:
 *  {
 *    "ids": [2, 3, 4, 5],   // required, 1..50 book ids. No "refresh everything"
 *                           // mode: the caller names the books, so a run is
 *                           // always bounded and always finishes.
 *    "overwrite": false     // as for the single route
 *  }
 *
 * Books are processed **one at a time** with `DELAY_BETWEEN_LOOKUPS_MS`
 * between them. A book that fails does not stop the run - it comes back with
 * its own `status` - so one dead ISBN cannot cost the other forty-nine.
 *
 * Example response (200):
 *  {
 *    "mode": "fill",
 *    "results": [
 *      { "bookId": 2, "name": "La Femme De Ménage", "status": "ok",
 *        "changed": ["publisher", "pages"], "stillMissing": ["category"] },
 *      { "bookId": 9, "name": "A book with no barcode", "status": "no_isbn",
 *        "changed": [], "stillMissing": [] }
 *    ]
 *  }
 *
 * Per-book field *names* only, not a field-level diff: a diff of fifty books
 * is noise, and the single route is there for the one book you care about.
 *
 * Responses: 400 when `ids` is missing, empty or longer than 50 |
 *            401/403 from `requireAdmin` | 500 on failure.
 */
// @ts-ignore
router.post("/refresh", requireAdmin, async (req: Request, res: Response) => {
    const raw = Array.isArray(req.body?.ids) ? req.body.ids : null;

    if (!raw || raw.length === 0) {
        return res.status(400).json({
            error: "no_ids",
            message: 'Name the books to refresh in "ids".',
        });
    }

    if (raw.length > MAX_BULK_REFRESH) {
        return res.status(400).json({
            error: "too_many_ids",
            message: `At most ${MAX_BULK_REFRESH} books per call.`,
        });
    }

    if (raw.some((id: unknown) => typeof id !== "number" || !Number.isSafeInteger(id) || id <= 0)) {
        return res.status(400).json({
            error: "invalid_ids",
            message: "Every book ID must be a positive integer number.",
        });
    }

    const ids = [...new Set<number>(raw)];
    const mode: RefreshMode = req.body?.overwrite === true ? "overwrite" : "fill";
    const userId = appService.getSessionUser(req);
    const region = await __requestingUserRegion(userId);

    const results: {
        bookId: number;
        name: string | null;
        status: IRefreshOutcome["status"] | "error";
        changed: BookMetadataField[];
        stillMissing: BookMetadataField[];
    }[] = [];

    try {
        for (const [index, id] of ids.entries()) {
            if (index > 0) {
                await new Promise((resolve) => setTimeout(resolve, DELAY_BETWEEN_LOOKUPS_MS));
            }

            let outcome: IRefreshOutcome;

            try {
                outcome = await __refreshBookMetadata(id, mode, userId, region);
            } catch (error) {
                console.error(`Error refreshing book ${id}:`, error);
                results.push({ bookId: id, name: null, status: "error", changed: [], stillMissing: [] });
                continue;
            }

            results.push({
                bookId: id,
                name: outcome.status === "not_found" ? null : outcome.name,
                status: outcome.status,
                changed: outcome.status === "ok" ? outcome.plan.changes.map((change) => change.field) : [],
                stillMissing: outcome.status === "ok" ? outcome.plan.stillMissing : [],
            });
        }

        // Logged for the same reason an instance-settings change is: one admin
        // spent the shared API quota and rewrote rows the whole household
        // reads. The single-book route is *not* logged - no other per-book
        // write (create, edit, delete) is either, and logging one of the four
        // would be worse than logging none.
        await recordActivity(appService.getDatabasePool(), userId, ActivityAction.BOOKS_METADATA_REFRESHED, {
            entityType: "book",
            metadata: {
                mode,
                requested: ids.length,
                changed: results.filter((result) => result.changed.length > 0).length,
                bookIds: ids,
            },
        });

        return res.status(200).json({ mode, results });
    } catch (error) {
        console.error("Error refreshing books:", error);
        return res.status(500).send("Error refreshing books");
    }
});

/** What `__refreshBookMetadata` found. `name` is carried so the bulk answer can say which book it means. */
type IRefreshOutcome =
    | { status: "not_found" }
    | { status: "isbn_changed"; name: string }
    | { status: "no_isbn"; name: string }
    | { status: "no_metadata"; name: string; isbn: string; lookup: IBookLookupResult }
    | { status: "ok"; name: string; isbn: string; lookup: IBookLookupResult; plan: IBookMetadataRefreshPlan };

/**
 * Re-run the provider chain for one existing book and apply what it is allowed
 * to apply. The single and bulk routes above are both this function plus a
 * response shape.
 *
 * What it will not do, and why:
 *  - **No stocks, no loans, no `created_by`.** This is bibliographic metadata.
 *    Who owns a copy, who borrowed it and who catalogued it are nobody's
 *    business here.
 *  - **No invention.** A field no source returned stays empty and comes back
 *    in `plan.stillMissing`. There is no fallback category, no placeholder
 *    author, no publisher inferred from an imprint.
 *  - **No write at all when nothing changed**, so `date_updated` does not move
 *    on a second identical run - which is also what makes this idempotent.
 */
async function __refreshBookMetadata(
    bookId: number,
    mode: RefreshMode,
    userId: number,
    region: string
): Promise<IRefreshOutcome> {
    const pool = appService.getDatabasePool();

    const selectBook = `SELECT books.id,
                books.name,
                books.description,
                books.image_url,
                books.isbn,
                books.publisher,
                books.published_date,
                books.language_code,
                books.pages,
                categories.name                                                     AS category_name,
                COALESCE(
                    array_agg(authors.name) FILTER (WHERE authors.name IS NOT NULL),
                    '{}'
                )                                                                   AS author_names
         FROM books
                  LEFT JOIN categories ON categories.id = books.category_id
                  LEFT JOIN book_authors ON book_authors.book_id = books.id
                  LEFT JOIN authors ON authors.id = book_authors.author_id
         WHERE books.id = $1
         GROUP BY books.id, categories.name`;
    const existing = await pool.query(selectBook, [bookId]);

    if (existing.rowCount !== 1) {
        return { status: "not_found" };
    }

    const book = existing.rows[0];
    const isbnCode = normalizeAndValidateIsbn(book.isbn ?? "");

    if (!isbnCode) {
        return { status: "no_isbn", name: book.name };
    }

    const lookup = await lookupBookMetadata(isbnCode, appService.getGoogleApiKey(), region);

    // The cover of last resort costs a round trip, so it is only worth asking
    // for when the book has no cover *and* no provider handed one back. A
    // provenance entry is added by hand because that call is outside the
    // chain - and this is a cover URL the book did not have, so saying where
    // it came from is the same courtesy the other fields get.
    const provenance: BookMetadataProvenance = { ...lookup.provenance };
    let imageUrl = lookup.metadata?.imageUrl ?? null;

    if (lookup.metadata && !imageUrl && !book.image_url?.trim()) {
        imageUrl = await fetchOpenLibraryCover(isbnCode);

        if (imageUrl) {
            provenance.imageUrl = "open-library";
        }
    }

    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        // No locks during provider I/O. Lock first, then read the complete
        // current snapshot in a fresh statement: an edit may have committed
        // while the catalogues were answering or while this lock was waiting.
        const locked = await client.query("SELECT id FROM books WHERE id = $1 FOR UPDATE", [bookId]);
        if (locked.rowCount !== 1) {
            await client.query("COMMIT");
            return { status: "not_found" };
        }
        const {
            rows: [latest],
        } = await client.query(selectBook, [bookId]);
        if (normalizeAndValidateIsbn(latest.isbn ?? "") !== isbnCode) {
            await client.query("COMMIT");
            return { status: "isbn_changed", name: latest.name };
        }
        // A source gap is about this ISBN only while the current row still
        // has it. All lookup outcomes share the same existence/ISBN recheck.
        if (!lookup.metadata) {
            await client.query("COMMIT");
            return { status: "no_metadata", name: latest.name, isbn: isbnCode, lookup };
        }
        const incoming = __snapshotFromMetadata(lookup.metadata, imageUrl);
        const current: IBookMetadataSnapshot = {
            name: latest.name,
            description: latest.description,
            imageUrl: latest.image_url,
            categoryName: latest.category_name,
            publisher: latest.publisher,
            publishedDate: formatPublishedDate(latest.published_date),
            pages: latest.pages,
            languageCode: latest.language_code ? String(latest.language_code).trim() : null,
            authors: latest.author_names ?? [],
        };
        const plan = planMetadataRefresh(current, incoming, provenance, mode);
        if (plan.changes.length === 0) {
            await client.query("COMMIT");
            return { status: "ok", name: latest.name, isbn: isbnCode, lookup, plan };
        }

        const columns: string[] = [];
        const values: unknown[] = [];

        const set = (column: string, value: unknown) => {
            values.push(value);
            columns.push(`${column} = $${values.length}`);
        };

        for (const change of plan.changes) {
            switch (change.field) {
                case "name":
                    set("name", change.to);
                    break;
                case "description":
                    set("description", change.to);
                    break;
                case "image_url":
                    set("image_url", change.to);
                    break;
                case "publisher":
                    set("publisher", change.to);
                    break;
                case "published_date":
                    set("published_date", change.to);
                    break;
                case "pages":
                    set("pages", change.to);
                    break;
                case "language":
                    await ensureLanguage(client, String(change.to));
                    set("language_code", change.to);
                    break;
                case "category":
                    // Find-or-create, exactly as a scan does: a category
                    // another member already made is reused, not duplicated.
                    set("category_id", await __ensureCategory(client, String(change.to), userId));
                    break;
                case "authors":
                    // Handled below - it is a link table, not a column.
                    break;
            }
        }

        if (columns.length > 0) {
            values.push(bookId);
            await client.query(
                `UPDATE books SET ${columns.join(", ")}, date_updated = CURRENT_TIMESTAMP WHERE id = $${values.length}`,
                values
            );
        }

        if (plan.authorsToLink.length > 0) {
            // Additive and ON CONFLICT DO NOTHING, so a second run links nothing twice.
            await __ensureAuthors(client, bookId, plan.authorsToLink, userId);
        }

        await client.query("COMMIT");
        return { status: "ok", name: latest.name, isbn: isbnCode, lookup, plan };
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}

/**
 * A provider record, normalised to what the `books` columns can actually hold:
 * VARCHAR widths clipped, the published date reduced to `YYYY-MM-DD`, the
 * language to a two-letter code, and only the first (most specific) category
 * kept - `books.category_id` is a single foreign key.
 *
 * Used by both the create path and the refresh path on purpose. When the two
 * normalised separately, a book created by a scan and the same book refreshed
 * afterwards could differ by a truncation or a date format, and the refresh
 * would report a "change" that was nothing of the sort.
 */
function __snapshotFromMetadata(metadata: IBookMetadata, imageUrl: string | null): IBookMetadataSnapshot {
    return {
        name: truncate(metadata.title, 255),
        description: metadata.description,
        imageUrl,
        categoryName: truncate(metadata.categories?.[0] ?? null, 100),
        publisher: truncate(metadata.publisher, 100),
        publishedDate: formatPublishedDate(metadata.publishedDate),
        pages: metadata.pageCount,
        languageCode: normalizeLanguageCode(metadata.language),
        authors: (metadata.authors ?? []).map((author) => truncate(author, 100) ?? author),
    };
}

/** Read the caller's validated two-letter country for Google Books. */
async function __requestingUserRegion(userId: number): Promise<string> {
    const result = await appService.getDatabasePool().query("SELECT region FROM users WHERE id = $1", [userId]);
    return validatedRegion(result.rows[0]?.region);
}

/**
 * =========================================================
 * DB HELPERS
 * =========================================================
 */
/**
 * Truncates a string to fit a VARCHAR(maxLen) column instead of letting
 * Postgres reject the whole insert with "value too long for type character varying".
 */
function truncate(value: string | null | undefined, maxLen: number): string | null {
    if (value === null || value === undefined) return null;
    return value.length > maxLen ? value.substring(0, maxLen) : value;
}

/**
 * Insert a `languages` row for `code` if one doesn't exist yet (name defaults
 * to the code itself, e.g. "en" - can be renamed later via the settings UI).
 */
async function ensureLanguage(client: any, code: string | null) {
    if (!code) return;

    const result = await client.query("SELECT code FROM languages WHERE code = $1", [code]);

    if (result.rowCount === 0) {
        await client.query("INSERT INTO languages (code, name) VALUES ($1, $2)", [code, code]);
    }
}

/**
 * Find-or-create a category by name in the shared library. Returns `null` if
 * `name` is falsy (a book without a detected category is left uncategorized).
 * The lookup key matches `unique_category_name UNIQUE (name)`, so a category
 * someone else already created is reused rather than duplicated.
 */
async function __ensureCategory(client: any, name: string | null, userId: number): Promise<number | null> {
    if (!name) return null;

    const result = await client.query("SELECT id FROM categories WHERE name = $1", [name]);

    if (result.rowCount > 0) {
        return result.rows[0].id;
    }

    const insert = await client.query("INSERT INTO categories (name, created_by) VALUES ($1, $2) RETURNING id", [
        name,
        userId,
    ]);

    return insert.rows[0].id;
}

/**
 * Find-or-create a book by ISBN in the shared library, so re-scanning the same
 * ISBN never creates a duplicate - including when the person scanning isn't the
 * person who first added the title. The lookup key matches
 * `books_isbn_unique UNIQUE (isbn)`. Returns the book id either way.
 */
async function __getOrCreateBook(client: any, book: any, userId: number) {
    const existing = await client.query("SELECT id FROM books WHERE isbn = $1", [book.isbnCode]);

    if (existing.rowCount > 0) {
        return existing.rows[0].id;
    }

    const insert = await client.query(
        `INSERT INTO books (
            name, description, image_url, isbn, category_id,
            publisher, published_date, language_code, pages, created_by
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        RETURNING id`,
        [
            book.name,
            book.description,
            book.imageUrl,
            book.isbnCode,
            book.categoryId,
            book.publisher,
            book.formattedPublishedDate,
            book.languageCode,
            book.pages,
            userId,
        ]
    );

    return insert.rows[0].id;
}

/**
 * Find-or-create each author by name in the shared library, then link them all
 * to `bookId` in `book_authors` (idempotent via ON CONFLICT DO NOTHING). The
 * lookup key matches `unique_author_name UNIQUE (name)`, so two members each
 * adding "Ursula K. Le Guin" land on one author row and their books don't split
 * across two.
 */
async function __ensureAuthors(client: any, bookId: number, authors: string[], userId: number) {
    for (const author of authors) {
        const result = await client.query("SELECT id FROM authors WHERE name = $1", [author]);

        let authorId: number;

        if (result.rowCount === 0) {
            const insert = await client.query("INSERT INTO authors (name, created_by) VALUES ($1,$2) RETURNING id", [
                author,
                userId,
            ]);
            authorId = insert.rows[0].id;
        } else {
            authorId = result.rows[0].id;
        }

        await client.query(
            `INSERT INTO book_authors (book_id, author_id, created_by)
             VALUES ($1,$2,$3)
             ON CONFLICT DO NOTHING`,
            [bookId, authorId, userId]
        );
    }
}

/**
 * Create a single "available" (status 0) stock entry for `bookId` at
 * `locationId`, silently doing nothing if no such location exists. Used by the
 * ISBN auto-create flow when a location is supplied.
 */
async function __addBookToLocation(client: any, bookId: number, locationId: string, userId: number) {
    const exist = await client.query("SELECT id FROM locations WHERE id = $1", [locationId]);

    if (exist.rowCount !== 1) return;

    const code = await generateBookStockCode();

    await client.query(
        `INSERT INTO book_stocks
         (book_id, code, status, location_id, customer_id, created_by)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [bookId, code, 0, locationId, null, userId]
    );
}

/**
 * POST /book/:id/stock
 * ---------------------
 * Add a new physical copy (stock) of a book at a location.
 *
 * Auth: required. Path param `id` {number} - book id.
 * Body:
 *  {
 *    "status": 0,            // 0 = available, 1 = sold/loaned, 2 = booked (not allowed here - use PUT stock instead)
 *    "location_id": 2,       // required, must exist in the shared library
 *    "customer_id": null     // optional, sets the copy as already held by a customer
 *  }
 *
 * A unique 10-character stock `code` is generated server-side (see `generateBookStockCode`).
 *
 * Example request: POST /api/rest/book/12/stock  { "status": 0, "location_id": 2 }
 *
 * Example response (200):
 *  { "id": 5, "code": "a1b2c3d4e5", "status": 0, "location_id": 2,
 *    "location_name": "Main shelf", "customer_id": null, "customer_name": null }
 *
 * Responses: 404 "Book not found" | 404 "Location not found" |
 *            406 if status is "booked" (2) | 500 on failure.
 */
// @ts-ignore
router.post("/:id/stock", requireAuth, async (req: Request, res: Response) => {
    const bookId = req.params.id;
    const status = req.body.status;
    const customerId = req.body.customer_id;
    const locationId = req.body.location_id;
    if (!bookId) {
        return res.status(400).send("No book ID provided");
    }

    const BOOKED_STATUS = 2;
    if (status === BOOKED_STATUS) {
        return res.status(406).send('Status "booked" not allowed in add stock action');
    }

    const pool = appService.getDatabasePool();
    const client = await pool.connect();

    const userId = appService.getSessionUser(req);

    try {
        // Upstream never checks that :id names a real book at all, so a stock
        // row could be hung off a nonexistent (there, someone else's) book id.
        // Sharing the library removes the cross-account half of that, not the
        // dangling-id half - so check it.
        const existBook = await pool.query("SELECT id FROM books WHERE id = $1", [bookId]);
        if (existBook.rowCount !== 1) {
            return res.status(404).send("Book not found");
        }

        const existLocation = await pool.query("SELECT id FROM locations WHERE id = $1", [locationId]);
        if (existLocation.rowCount !== 1) {
            return res.status(404).send("Location not found");
        }

        if (customerId) {
            const existCustomer = await pool.query("SELECT id FROM customers WHERE id = $1", [customerId]);
            if (existCustomer.rowCount !== 1) {
                return res.status(404).send("Customer not found");
            }
        }

        appService.getLogger().debug(`Adding book stock with status ${status} in book id: ${bookId}`);
        await client.query("BEGIN");

        const code = await generateBookStockCode();

        const insertStock = await client.query(
            "INSERT INTO book_stocks (book_id, code, status, location_id, customer_id, created_by) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id",
            [bookId, code, status, locationId, customerId, userId]
        );

        await client.query("COMMIT");

        // fetch new data
        const result = await pool.query(
            `SELECT book_stocks.id,
                    book_stocks.code,
                    book_stocks.status,
                    book_stocks.location_id,
                    locations.name as location_name,
                    customers.id   as customer_id,
                    customers.name as customer_name
             FROM book_stocks
                      LEFT JOIN customers ON book_stocks.customer_id = customers.id
                      LEFT JOIN locations ON book_stocks.location_id = locations.id
             WHERE book_stocks.id = $1
            `,
            [insertStock.rows[0].id]
        );

        res.status(200).json(result.rows[0]);
    } catch (error) {
        // Rollback on error
        await client.query("ROLLBACK");
        console.error("Transaction error:", error);
        res.status(500).send("Error adding the book stock");
    } finally {
        client.release();
    }
});

/**
 * DELETE /book/:id/stock/:stock_id
 * ----------------------------------
 * Remove a single physical copy of a book.
 *
 * Auth: required. Path params: `id` {number} book id, `stock_id` {number} stock id.
 *
 * Example request: DELETE /api/rest/book/12/stock/5
 *
 * Response (200): boolean - `true` if a row was deleted, `false` otherwise.
 */
// @ts-ignore
router.delete("/:id/stock/:stock_id", requireAuth, async (req: Request, res: Response) => {
    const bookId = req.params.id;
    const stockId = req.params.stock_id;
    if (!bookId || !stockId) {
        return res.status(400).send("No book ID or stock ID provided");
    }

    const pool = appService.getDatabasePool();

    try {
        appService.getLogger().debug(`Removing book stock with status ${stockId} and book id: ${bookId}`);

        const deleteQueryResult = await pool.query("DELETE FROM book_stocks WHERE book_id = $1 AND id = $2", [
            bookId,
            stockId,
        ]);

        res.status(200).json(deleteQueryResult.rowCount === 1);
    } catch (error) {
        // Rollback on error
        console.error("Transaction error:", error);
        res.status(500).send("Error deleting the book stock");
    }
});

/**
 * PUT /book/:id/stock/:stock_id
 * -------------------------------
 * Update a physical copy's status, location and/or assigned customer -
 * e.g. moving it to a different shelf, marking it sold/booked, or
 * assigning/clearing the customer it's checked out to.
 *
 * Auth: required. Path params: `id` {number} book id, `stock_id` {number} stock id.
 * Body:
 *  { "status": 2, "location_id": 2, "customer_id": 7 }
 *
 * Example request: PUT /api/rest/book/12/stock/5
 *
 * Example response (200):
 *  { "id": 5, "code": "a1b2c3d4e5", "status": 2, "location_id": 2,
 *    "location_name": "Main shelf", "customer_id": 7, "customer_name": "Jane Doe" }
 *
 * Response (404): "Location not found" if `location_id` doesn't exist.
 */
// @ts-ignore
router.put("/:id/stock/:stock_id", requireAuth, async (req: Request, res: Response) => {
    const bookId = req.params.id;
    const stockId = req.params.stock_id;
    if (!bookId || !stockId) {
        return res.status(400).send("No book ID or stock ID provided");
    }

    // Body params
    const { status, location_id, customer_id } = req.body;

    const pool = appService.getDatabasePool();

    try {
        appService.getLogger().debug(`Updating book stock ${stockId}`);

        const existLocation = await pool.query("SELECT id FROM locations WHERE id = $1", [location_id]);
        if (existLocation.rowCount !== 1) {
            return res.status(404).send("Location not found");
        }

        if (customer_id) {
            const existCustomer = await pool.query("SELECT id FROM customers WHERE id = $1", [customer_id]);
            if (existCustomer.rowCount !== 1) {
                return res.status(404).send("Customer not found");
            }
        }

        // Needed to detect a status transition into/out of "booked" below,
        // since loan_history (unlike loaned_at) can't be updated in the same
        // statement as book_stocks.
        const previousStock = await pool.query("SELECT status FROM book_stocks WHERE id = $1 AND book_id = $2", [
            stockId,
            bookId,
        ]);
        const previousStatus = previousStock.rows[0]?.status;

        // loaned_at is set only on the transition *into* booked (status wasn't
        // already 2) and cleared on any transition out of it, so re-saving an
        // already-booked stock (e.g. just moving its location) doesn't reset
        // its loan date.
        const queryResult = await pool.query(
            // $1::smallint - book_stocks.status is SMALLINT, but $1 is also
            // compared against the bare integer literal `2` below; without
            // an explicit cast, Postgres can't decide which type to infer
            // for $1 and rejects the whole statement (42P08 "inconsistent
            // types deduced for parameter $1: integer versus smallint").
            `UPDATE book_stocks
             SET status = $1::smallint,
                 location_id = $2,
                 customer_id = $3,
                 loaned_at = CASE
                                 WHEN $1 = 2 AND status != 2 THEN NOW()
                                 WHEN $1 != 2 THEN NULL
                                 ELSE loaned_at
                 END
             WHERE book_id = $4 AND id = $5`,
            [status, location_id, customer_id, bookId, stockId]
        );

        if (queryResult.rowCount !== 1) {
            res.status(500).send();
        }

        const stockQueryResult = await pool.query(
            `SELECT book_stocks.id,
                    book_stocks.code,
                    book_stocks.status,
                    book_stocks.location_id,
                    locations.name as location_name,
                    customers.id   as customer_id,
                    customers.name as customer_name
             FROM book_stocks
                      LEFT JOIN customers ON book_stocks.customer_id = customers.id
                      LEFT JOIN locations ON book_stocks.location_id = locations.id
             WHERE book_stocks.id = $1
            `,
            [stockId]
        );

        const updatedStock = stockQueryResult.rows[0];
        const newStatus = Number(status);
        if (updatedStock && Number(previousStatus) !== 2 && newStatus === 2) {
            // getSessionUser here only stamps loan_history.created_by - who
            // lent the copy out - not a scoping predicate.
            await recordLoan(pool, appService.getSessionUser(req), updatedStock.code, Number(customer_id));
        } else if (updatedStock && Number(previousStatus) === 2 && newStatus !== 2) {
            await recordReturn(pool, updatedStock.code);
        }

        res.status(200).json(stockQueryResult.rows[0]);
    } catch (error) {
        // Rollback on error
        console.error("Transaction error:", error);
        res.status(500).send("Error deleting the book stock");
    }
});

/**
 * GET /book/:bookCode/add/md
 * ----------------------------
 * Look up the book + single stock behind a scanned/typed stock code, for the
 * "add to customer" flow (e.g. scanning a barcode when lending/selling a copy).
 *
 * Auth: required. Path param `bookCode` {string} - a book_stocks.code value.
 *
 * Example request: GET /api/rest/book/a1b2c3d4e5/add/md
 *
 * Example response (200), shape `IBookAddMd`:
 *  {
 *    "id": 12, "name": "The Hobbit", "image_url": "https://...", "isbn": "9780261102217",
 *    "stocks": [{ "id": 5, "code": "a1b2c3d4e5", "status": 0 }]
 *  }
 *
 * Response (404): "Book stock not found".
 */
// @ts-ignore
router.get("/:bookCode/add/md", requireAuth, async (req: Request, res: Response) => {
    const bookCode = String(req.params.bookCode).trim();

    const pool = appService.getDatabasePool();

    try {
        // 1. Try to match a stock code
        const stockResult = await pool.query(
            `
                SELECT b.id    AS book_id,
                       b.name,
                       b.image_url,
                       b.isbn,
                       bs.id   AS stock_id,
                       bs.code AS stock_code,
                       bs.status
                FROM book_stocks bs
                         INNER JOIN books b ON b.id = bs.book_id
                WHERE bs.code = $1 LIMIT 1
            `,
            [bookCode]
        );

        if (stockResult.rows.length === 0) {
            return res.status(404).send("Book stock not found");
        }

        const row = stockResult.rows[0];
        const response: IBookAddMd = {
            id: row.book_id,
            name: row.name,
            image_url: row.image_url,
            isbn: row.isbn,
            stocks: [
                {
                    id: row.stock_id,
                    code: row.stock_code,
                    status: row.status,
                },
            ],
        };
        return res.status(200).json(response);
    } catch (error) {
        console.error("Transaction error:", error);
        res.status(500).send("Error retrieving the book data");
    }
});

/**
 * POST /book/return
 * -------------------
 * Bulk-return one or more book stocks: clears their `customer_id` and
 * resets their `status` back to 0 (available). Used e.g. when a customer
 * brings back several borrowed books at once.
 *
 * Auth: required.
 * Body: { "books": ["a1b2c3d4e5", "f6g7h8i9j0"] }  // array of book_stocks.code
 *
 * Example request: POST /api/rest/book/return  { "books": ["a1b2c3d4e5"] }
 *
 * Response: 200 (empty body) on success, 500 on failure.
 */
// @ts-ignore
router.post(
    "/return",
    requireAuth,
    upload.single("image"),
    handleUploadError(maxCoverImageSizeMb),
    async (req: Request, res: Response) => {
        const books: string[] = req.body.books;
        const pool = appService.getDatabasePool();

        try {
            for (const bookStockCode of books) {
                await pool.query(
                    "UPDATE book_stocks SET customer_id = $1, status = $2, loaned_at = NULL WHERE code = $3",
                    [null, 0, bookStockCode]
                );
                await recordReturn(pool, bookStockCode);
            }

            res.status(200).send();
        } catch (error) {
            // Rollback on error
            console.error("Transaction error:", error);
            res.status(500).send("Error returning books");
        }
    }
);

// Helper function to format date to YYYY-MM-DD
// Hosts our ISBN metadata lookups (Google Books, Open Library covers) are
// allowed to point book cover images at.
const ALLOWED_IMAGE_HOSTS = new Set(["books.google.com", "covers.openlibrary.org"]);

/**
 * Only allow images we generated ourselves (data: URIs from the upload
 * endpoints) or ones from the known ISBN metadata providers. Without this,
 * a client could set books.image_url to any external URL, which the app
 * would then load as an <img src> - a tracking-pixel / IP-disclosure vector,
 * and it makes the CSP imgSrc allowlist meaningless.
 *
 * Exported so `ImportRoute.ts` can apply the exact same rule to a
 * user-supplied cover in an import CSV, rather than keeping a second copy of
 * a security-relevant allowlist that could silently drift from this one.
 */
export function isAllowedImageUrl(url: string): boolean {
    if (url.startsWith("data:image/png;base64,") || url.startsWith("data:image/jpeg;base64,")) {
        return true;
    }
    try {
        const parsed = new URL(url);
        return (
            (parsed.protocol === "http:" || parsed.protocol === "https:") && ALLOWED_IMAGE_HOSTS.has(parsed.hostname)
        );
    } catch {
        return false;
    }
}

function formatPublishedDate(date: string | Date | null | undefined): string | null {
    if (!date) return null;

    // `pg` hands a DATE column back as a Date at *local* midnight. Running that
    // through toISOString() shifts it a day backwards anywhere east of UTC,
    // which would make the refresh see a difference that isn't there and
    // rewrite published_date on every run. Local components, then.
    if (date instanceof Date) {
        if (Number.isNaN(date.getTime())) return null;

        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");

        return `${date.getFullYear()}-${month}-${day}`;
    }

    // Attempt to parse the date and format it to YYYY-MM-DD
    const parsedDate = new Date(date);
    if (Number.isNaN(parsedDate.getTime())) {
        return null; // Return null if the date is invalid
    }

    // Return the date in the format YYYY-MM-DD
    return parsedDate.toISOString().split("T")[0];
}

/**
 * Generate a random 10-character alphanumeric code for a new book stock
 * (used as the human-scannable/typeable identifier), retrying until it
 * doesn't collide with an existing `book_stocks.code`.
 */
async function generateBookStockCode(): Promise<string> {
    let code: string = "";
    let isUnique = false;

    const pool = appService.getDatabasePool();

    while (!isUnique) {
        // Generate a random 10-character code
        code = crypto.randomUUID().replace(/-/g, "").substring(0, 10);

        // Check if the code already exists
        const { rowCount } = await pool.query("SELECT 1 FROM book_stocks WHERE code = $1", [code]);

        if (rowCount === 0) {
            isUnique = true;
        }
    }

    return code;
}

/**
 * Try to automatically create a book stock if the shared library has exactly
 * one location - with nowhere else it could go, asking would be busywork.
 * @param client
 * @param bookId
 * @param userId The account adding the book, recorded as the stock's created_by.
 */
async function __automaticallyAddBookToLocation(client: Pool | PoolClient, bookId: number, userId: number) {
    const locations = await client.query(`
        SELECT id
        FROM locations
    `);

    if (locations.rowCount != null && locations.rowCount === 1) {
        const locationId = locations.rows[0].id;

        const code = await generateBookStockCode();

        await client.query("INSERT INTO book_stocks (book_id, code, location_id, created_by) VALUES ($1, $2, $3, $4)", [
            bookId,
            code,
            locationId,
            userId,
        ]);
    }
}

export default router;
