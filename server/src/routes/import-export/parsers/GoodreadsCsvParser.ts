/**
 * Parses a Goodreads "Export Library" CSV (My Books -> Import and Export,
 * or directly at goodreads.com/review/import - desktop browser only) into
 * `IImportedBook[]`. Goodreads shut down its public API to new integrations
 * in December 2020, so this CSV export is the only supported way left to get
 * a user's library out of Goodreads and into Vaultisse.
 */
import { parse } from "csv-parse/sync";
import { IImportedBook } from "./IImportedBook";
import { normalizeAndValidateIsbn } from "../../../utils/IsbnVerification";

/**
 * Goodreads wraps ISBN/ISBN13 in an Excel "treat as text" formula
 * (`="1451648537"`, or `=""` when absent) so spreadsheet apps don't mangle
 * leading zeros / drop them as numbers - strip that wrapper before use.
 */
function unwrapExcelFormula(value: string | undefined): string {
    if (!value) return "";
    const match = value.match(/^="(.*)"$/);
    return match ? match[1] : value;
}

/** Common Goodreads `Binding` values that don't literally match a `formats.name` row (see `assets/db/databaseSchema.sql`). */
const BINDING_SYNONYMS: Record<string, string> = {
    "kindle edition": "Electronic",
    ebook: "Electronic",
    "leather bound": "Leatherbound",
};

function normalizeFormatName(binding: string | undefined): string | null {
    const trimmed = binding?.trim();
    if (!trimmed) return null;
    return BINDING_SYNONYMS[trimmed.toLowerCase()] ?? trimmed;
}

/** `Year Published` (falling back to `Original Publication Year`) is all Goodreads gives us - no month/day. */
function yearToDate(row: Record<string, string>): string | null {
    const year = row["Year Published"]?.trim() || row["Original Publication Year"]?.trim();
    return year && /^\d{4}$/.test(year) ? `${year}-01-01` : null;
}

function toPages(value: string | undefined): number | null {
    const pages = parseInt(value ?? "", 10);
    return Number.isFinite(pages) && pages > 0 ? pages : null;
}

function toIsbn(row: Record<string, string>): string | null {
    const isbn13 = unwrapExcelFormula(row.ISBN13);
    const isbn10 = unwrapExcelFormula(row.ISBN);
    return normalizeAndValidateIsbn(isbn13) ?? normalizeAndValidateIsbn(isbn10);
}

function toAuthors(row: Record<string, string>): string[] {
    const additional = row["Additional Authors"] ? row["Additional Authors"].split(",").map((name) => name.trim()) : [];
    return [row.Author, ...additional].map((name) => name?.trim()).filter((name): name is string => !!name);
}

/**
 * @param csvText Raw file contents (already read into memory by multer).
 * @throws If the file isn't parseable CSV at all - a malformed individual
 *         row still comes through as a row with an empty `name`, which
 *         `ImportRoute.ts` skips and reports rather than failing the batch.
 */
export function parseGoodreadsCsv(csvText: string): IImportedBook[] {
    const rows: Record<string, string>[] = parse(csvText, {
        columns: true,
        skip_empty_lines: true,
        relax_column_count: true,
        bom: true,
    });

    return rows.map((row, index) => ({
        row: index + 1,
        name: row.Title?.trim() ?? "",
        isbn: toIsbn(row),
        authors: toAuthors(row),
        publisher: row.Publisher?.trim() || null,
        publishedDate: yearToDate(row),
        pages: toPages(row["Number of Pages"]),
        formatName: normalizeFormatName(row.Binding),
    }));
}
