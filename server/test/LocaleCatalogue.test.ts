import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dir, "../..");
const schemaPath = resolve(repositoryRoot, "assets/db/databaseSchema.sql");
const migrationPath = resolve(repositoryRoot, "assets/db/upgrade/1.3.0/2.sql");

type LabelRow = { language: string; code: string; text: string };

function readLabelRows(contents: string): LabelRow[] {
    const rows: LabelRow[] = [];
    const rowPattern = /\('([^']*)',\s*'([^']*)',\s*'((?:''|[^'])*)'\)/g;
    for (const match of contents.matchAll(rowPattern)) {
        rows.push({
            language: match[1],
            code: match[2],
            text: match[3].replaceAll("''", "'"),
        });
    }
    return rows;
}

function sourceFiles(directory: string): string[] {
    const files: string[] = [];
    for (const entry of readdirSync(directory)) {
        const path = resolve(directory, entry);
        if (statSync(path).isDirectory()) {
            files.push(...sourceFiles(path));
        } else if (/\.(?:ts|tsx)$/.test(entry) && !/\.test\.(?:ts|tsx)$/.test(entry)) {
            files.push(path);
        }
    }
    return files;
}

function clientCatalogueCodes(): Set<string> {
    const codes = new Set<string>();
    const callPattern = /\b(t|tPlural|translate|label|pluralize)\(\s*(['"])([A-Z][A-Z0-9_.-]*)\2/g;
    for (const path of sourceFiles(resolve(repositoryRoot, "client-react/src"))) {
        const source = readFileSync(path, "utf8");
        for (const match of source.matchAll(callPattern)) {
            const code = match[3];
            codes.add(code);
            if (match[1] === "tPlural" || match[1] === "pluralize") {
                codes.add(`${code}.one`);
                codes.add(`${code}.other`);
            }
        }
    }

    for (const code of [
        "METADATA_FIELD_NAME",
        "METADATA_FIELD_DESCRIPTION",
        "METADATA_FIELD_IMAGE_URL",
        "METADATA_FIELD_CATEGORY",
        "METADATA_FIELD_PUBLISHER",
        "METADATA_FIELD_PUBLISHED_DATE",
        "METADATA_FIELD_PAGES",
        "METADATA_FIELD_LANGUAGE",
        "METADATA_FIELD_AUTHORS",
        "LANGUAGE_OPTION_EN",
        "LANGUAGE_OPTION_FR",
        "LANGUAGE_OPTION_ES",
        "LANGUAGE_OPTION_CA",
        "LANGUAGE_OPTION_IT",
        "LOAN_COPIES_OUT",
        "TREND_BOOKS",
        "METADATA_SOURCES_NOT_CONFIGURED",
        "METADATA_SOURCE_UNAVAILABLE",
        "NO_METADATA_FOR_ISBN_TITLE",
        "ADMIN_METADATA_OK",
        "ADMIN_METADATA_NO_ISBN",
        "ADMIN_METADATA_NO_METADATA",
        "ADMIN_METADATA_NOT_FOUND",
        "ADMIN_METADATA_ERROR",
        "ADMIN_METADATA_ISBN_CHANGED",
        "SCAN_COPY_ADDED",
        "NO_CAMERA_API",
        "CAMERA_NEEDS_HTTPS",
        "CAMERA_ACCESS_REFUSED",
        "NO_CAMERA_ANSWERED",
        "BARCODE_READER_UNSUPPORTED",
        "BARCODE_READER_FAILED",
    ]) {
        codes.add(code);
    }
    for (const region of [
        "AU",
        "BR",
        "CA",
        "CN",
        "FR",
        "DE",
        "IT",
        "JP",
        "MX",
        "PT",
        "RU",
        "SA",
        "ES",
        "TW",
        "GB",
        "US",
    ]) {
        codes.add(`REGION_${region}`);
    }
    for (let count = 2; count <= 10; count += 1) {
        codes.add(`SCAN_${count}_COPY_ADDED`);
    }
    return codes;
}

function placeholders(value: string): string[] {
    return [...value.matchAll(/\{([\w.-]+)\}/g)].map((match) => match[1]).sort();
}

const schema = readFileSync(schemaPath, "utf8");
const migration = readFileSync(migrationPath, "utf8");
const schemaRows = readLabelRows(schema);
const migrationRows = readLabelRows(migration);

describe("1.3.0 locale catalogue", () => {
    it("ships French in the schema and keeps every language/code pair unique", () => {
        expect(schema).toContain("('fr', 'French')");

        const pairs = schemaRows.map((row) => `${row.language}:${row.code}`);
        expect(new Set(pairs).size).toBe(pairs.length);

        const english = schemaRows.filter((row) => row.language === "en");
        const french = schemaRows.filter((row) => row.language === "fr");
        expect(french.length).toBe(english.length);
        expect(new Set(french.map((row) => row.code)).size).toBe(french.length);
    });

    it("covers the complete React catalogue, including generated dynamic codes", () => {
        const frenchCodes = new Set(schemaRows.filter((row) => row.language === "fr").map((row) => row.code));
        for (const code of clientCatalogueCodes()) {
            expect(frenchCodes.has(code), `missing fr label: ${code}`).toBe(true);
        }
    });

    it("keeps French interpolation placeholders aligned with English", () => {
        const byLanguage = new Map<string, Map<string, string>>();
        for (const row of schemaRows) {
            if (!byLanguage.has(row.language)) byLanguage.set(row.language, new Map());
            byLanguage.get(row.language)?.set(row.code, row.text);
        }
        const english = byLanguage.get("en") ?? new Map();
        const french = byLanguage.get("fr") ?? new Map();
        for (const [code, englishText] of english) {
            expect(french.has(code), `missing French row: ${code}`).toBe(true);
            expect(placeholders(french.get(code) ?? []), `placeholder drift: ${code}`).toEqual(
                placeholders(englishText)
            );
            if (code.includes("_")) expect(french.get(code)).not.toBe(code);
        }
    });

    it("fills the Italian rows omitted by the original catalogue", () => {
        const italianCodes = new Set(schemaRows.filter((row) => row.language === "it").map((row) => row.code));
        expect(italianCodes.has("RETURN_BOOKS")).toBe(true);
        expect(italianCodes.has("RETURN")).toBe(true);
    });

    it("guards the manual migration before writes and wraps it in one transaction", () => {
        expect(migration).toMatch(/\nBEGIN;\n/);
        expect(migration).toMatch(/COMMIT;\s*$/);
        expect(migration).toContain("RAISE EXCEPTION");
        expect(migration).not.toContain("ON CONFLICT");

        const guard = migration.indexOf("RAISE EXCEPTION");
        const firstWrite = migration.indexOf("INSERT INTO app_languages");
        expect(guard).toBeGreaterThan(-1);
        expect(firstWrite).toBeGreaterThan(guard);
        const expectedFrenchCount = schemaRows.filter((row) => row.language === "fr").length;
        const migrationFrench = migrationRows.filter((row) => row.language === "fr");
        expect(migrationFrench.length).toBe(expectedFrenchCount);
        expect(new Set(migrationFrench.map((row) => row.code)).size).toBe(expectedFrenchCount);
    });
});
