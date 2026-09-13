/**
 * Parses Vaultisse's own hand-fillable CSV format - for someone who doesn't
 * have a Goodreads (or other) export to convert, and instead wants to build
 * a spreadsheet of their books from scratch. `GET /import/template/vaultisse`
 * (see `ImportRoute.ts`) hands out `VAULTISSE_CSV_TEMPLATE` below as a
 * starting point, with the exact headers this parser expects.
 *
 * Unlike `GoodreadsCsvParser.ts`, this format is ours to define, so it's
 * kept deliberately simple: one column per `IImportedBook` field, plain
 * values, no origin-specific quirks to work around.
 */
import { parse } from "csv-parse/sync";
import { IImportedBook } from "./IImportedBook";
import { normalizeAndValidateIsbn } from "../../../utils/IsbnVerification";

export const VAULTISSE_CSV_HEADERS = [
    "Title",
    "Authors",
    "ISBN",
    "Publisher",
    "Published Year",
    "Pages",
    "Format",
    "Category",
    "Description",
    "Language",
    "Cover",
];

/** Wraps every field in quotes (escaping internal ones) - always valid CSV, no need to reason about which fields happen to contain a comma. */
function toCsvRow(values: string[]): string {
    return values.map((value) => `"${value.replace(/"/g, '""')}"`).join(",");
}

/** Handed out by `GET /import/template/vaultisse` - the header row plus one filled-in example row to copy/replace. */
export const VAULTISSE_CSV_TEMPLATE =
    [
        toCsvRow(VAULTISSE_CSV_HEADERS),
        toCsvRow([
            "The Hobbit",
            "J.R.R. Tolkien",
            "9780261102217",
            "HarperCollins",
            "1937",
            "310",
            "Paperback",
            "Fantasy",
            "A hobbit's unexpected journey.",
            "en",
            "https://covers.openlibrary.org/b/isbn/9780261102217-M.jpg",
        ]),
    ].join("\r\n") + "\r\n";

/** Multiple authors are semicolon-separated (`;`) - unlike Goodreads' comma-separated column, a name itself may contain a comma ("Lastname, Firstname"). */
function toAuthors(value: string | undefined): string[] {
    if (!value) return [];
    return value
        .split(";")
        .map((name) => name.trim())
        .filter(Boolean);
}

function toPages(value: string | undefined): number | null {
    const pages = parseInt(value ?? "", 10);
    return Number.isFinite(pages) && pages > 0 ? pages : null;
}

function toPublishedDate(value: string | undefined): string | null {
    const year = value?.trim();
    return year && /^\d{4}$/.test(year) ? `${year}-01-01` : null;
}

/** `languages.code` is `CHAR(2)` - anything else (missing, "unknown", a 3-letter code) is dropped rather than stored. */
function toLanguageCode(value: string | undefined): string | null {
    const code = value?.trim().toLowerCase();
    return code && /^[a-z]{2}$/.test(code) ? code : null;
}

export function parseVaultisseCsv(csvText: string): IImportedBook[] {
    const rows: Record<string, string>[] = parse(csvText, {
        columns: true,
        skip_empty_lines: true,
        relax_column_count: true,
        bom: true,
    });

    return rows.map((row, index) => ({
        row: index + 1,
        name: row.Title?.trim() ?? "",
        isbn: normalizeAndValidateIsbn(row.ISBN ?? ""),
        authors: toAuthors(row.Authors),
        publisher: row.Publisher?.trim() || null,
        publishedDate: toPublishedDate(row["Published Year"]),
        pages: toPages(row.Pages),
        formatName: row.Format?.trim() || null,
        categoryName: row.Category?.trim() || null,
        description: row.Description?.trim() || null,
        languageCode: toLanguageCode(row.Language),
        // A data:image/png|jpeg;base64,... URI or a URL from an allowed host
        // (see isAllowedImageUrl() in BooksRoute.ts) - validated in
        // ImportRoute.ts, not here. Falls back to an ISBN cover lookup if
        // absent or rejected.
        imageUrl: row.Cover?.trim() || null,
    }));
}
