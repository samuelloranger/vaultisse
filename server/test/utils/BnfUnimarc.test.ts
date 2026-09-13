/**
 * The BnF UNIMARC parser, against **recorded real SRU responses**.
 *
 * Every fixture in `test/fixtures/bnf/` is a verbatim capture of
 * `catalogue.bnf.fr/api/SRU?...&recordSchema=unimarcxchange`, saved with
 * `curl` and checked in unmodified (the one exception, `truncated-mid-record`,
 * is a real response cut short with `head -c`, which is what a dropped
 * connection actually delivers). Hand-written XML would only prove the parser
 * can read fiction the same person invented; these prove it reads what the
 * BnF sends, including the shapes nobody would think to invent - a record
 * with no `700` at all, a translator with a role in `$c` instead of `$4`, a
 * printer filed under the same tag as the publisher.
 *
 * No test here touches the network.
 */
import { describe, expect, it } from "bun:test";
import fs from "fs";
import path from "path";
import { parseBnfUnimarc, parseUnimarcPageCount, parseUnimarcYear, bnfSruUrl } from "../../src/utils/BnfUnimarc";

function fixture(name: string): string {
    return fs.readFileSync(path.join(__dirname, "..", "fixtures", "bnf", `${name}.xml`), "utf-8");
}

describe("parseBnfUnimarc - a complete record", () => {
    // 9782824627151, one of the three ISBNs that failed in production.
    const book = parseBnfUnimarc(fixture("le-boyfriend-9782824627151"));

    it("reads every field Google Books left empty for this ISBN", () => {
        expect(book).toMatchObject({
            title: "Le boyfriend",
            publisher: "City roman",
            publishedDate: "2025",
            pageCount: 391,
            language: "fre",
        });
    });

    it("takes the title from 200$a without the statement of responsibility", () => {
        // Dublin Core would have handed back
        // "Le boyfriend / Freida McFadden ; traduit de l'anglais par Karine
        // Xaragai" - $f and $g are separate subfields here and stay out.
        expect(book?.title).toBe("Le boyfriend");
    });

    it("keeps the author and drops the translator", () => {
        // 700$4=070 (author) vs 702$4=730 (translator), both personal names.
        expect(book?.authors).toEqual(["Freida McFadden"]);
    });

    it("reads the publisher's blurb from 330$a", () => {
        expect(book?.description).toContain("Sydney");
    });

    it("takes the publisher, not the printer, from the two 214 fields", () => {
        // 214 ind2="0" is "City roman"; 214 ind2="3" is "Impr. Laballery".
        expect(book?.publisher).toBe("City roman");
    });

    it("takes the language of the text, not of the original", () => {
        // 101$a "fre", 101$c "eng" - it is a translation from English.
        expect(book?.language).toBe("fre");
    });

    it("returns no cover: this API does not serve one", () => {
        expect(book?.imageUrl).toBeNull();
    });
});

describe("parseBnfUnimarc - the other two production failures", () => {
    it("parses La prof", () => {
        expect(parseBnfUnimarc(fixture("la-prof-9782824629094"))).toMatchObject({
            title: "La prof",
            authors: ["Freida McFadden"],
            publisher: "City",
            publishedDate: "2025",
            pageCount: 388,
            language: "fre",
        });
    });

    /**
     * L'intruse is the record that defeats a tag-only rule. It has no `700`
     * at all: the author sits in `702` with neither a `$4` role code nor a
     * `$c` role, right beside a `702` translator whose role is the free text
     * "Traducteur". Trusting `702` wholesale imports the translator as an
     * author; distrusting it wholesale loses the author entirely.
     */
    it("parses L'intruse, whose author is filed under 702 with no role code", () => {
        expect(parseBnfUnimarc(fixture("l-intruse-9782824625256"))).toMatchObject({
            title: "L'intruse",
            authors: ["Freida McFadden"],
            publisher: "City",
            publishedDate: "2026",
            // "1 volume 362 p" - no parentheses, no full stop after the p.
            pageCount: 362,
            language: "fre",
        });
    });
});

describe("parseBnfUnimarc - record shapes that are not the happy one", () => {
    it("reads a record catalogued with 210 instead of 214, and its subject heading", () => {
        expect(parseBnfUnimarc(fixture("gendarme-9782213700632"))).toMatchObject({
            title: "Je voulais juste être gendarme",
            // 700$4=070. The 702 beside it is $4=205, a collaborator.
            authors: ["Seaade Besbiss"],
            publisher: "Fayard",
            // 210$d is "DL 2016", not a date.
            publishedDate: "2016",
            pageCount: 147,
            // 606$a, a RAMEAU heading. 676 (Dewey) and 686 (a bare "803") are ignored.
            categories: ["Sexisme"],
        });
    });

    it("maps nothing itself: 101$a comes back as the three letters the record holds", () => {
        // The 639-2/B -> 639-1 mapping is normalizeLanguageCode's job, tested
        // in BookMetadata.test.ts. This only has to not invent a value.
        expect(parseBnfUnimarc(fixture("christian-arts-in-china-9787508519913"))).toMatchObject({
            title: "Christian arts in China",
            language: "eng",
            publisher: "China intercontinental press",
            publishedDate: "2006",
            pageCount: 170,
        });
    });

    it("refuses to guess a page count for a two-volume set, and imports no editors as authors", () => {
        // 215$a "2 vol. (823, 846 p.)" - 846 is volume two, not the total.
        // Every 7XX here is a 702 with $4=340 (scholarly editor) or 651.
        expect(parseBnfUnimarc(fixture("tragiques-grecs-multivolume"))).toMatchObject({
            title: "Les tragiques grecs",
            authors: [],
            pageCount: null,
            publisher: "le Grand livre du mois",
            publishedDate: "2001",
        });
    });

    it("handles a record with no 215 field at all", () => {
        // A karaoke disc: no pagination, a 200$e subtitle that must not be
        // glued onto the title, a 214 ind2="2" (distribution) as the only
        // publication statement, and a 700 whose $4=590 is not an author.
        expect(parseBnfUnimarc(fixture("party-tyme-no-pagination"))).toMatchObject({
            title: "Portuguese Hits 2024-1 - Party Tyme Karaoke",
            pageCount: null,
            authors: [],
            publisher: "Universal Music France",
            publishedDate: "2024",
            language: "por",
        });
    });
});

describe("parseBnfUnimarc - nothing to parse", () => {
    it("returns null for an empty result set", () => {
        // <srw:numberOfRecords>0</srw:numberOfRecords><srw:records/>
        expect(parseBnfUnimarc(fixture("no-match-9789999999999"))).toBeNull();
    });

    it("returns null for a response truncated mid-record instead of half a book", () => {
        expect(parseBnfUnimarc(fixture("truncated-mid-record"))).toBeNull();
    });

    it("returns null, not a throw, for a body that is not XML", () => {
        expect(parseBnfUnimarc("<html><body>502 Bad Gateway</body></html>")).toBeNull();
        expect(parseBnfUnimarc('{"error":"nope"}')).toBeNull();
        expect(parseBnfUnimarc("")).toBeNull();
    });

    it("returns null for a record with no title, since books.name is NOT NULL", () => {
        const titleless = fixture("le-boyfriend-9782824627151").replace(/tag="200"/, 'tag="299"');
        expect(parseBnfUnimarc(titleless)).toBeNull();
    });
});

/**
 * 215$a is free text a cataloguer typed, and the shapes below are all taken
 * from real BnF records (the last two from a `bib.title` sweep rather than an
 * ISBN lookup, which is why they are asserted here rather than as fixtures).
 */
describe("parseUnimarcPageCount", () => {
    it("reads the usual shapes", () => {
        expect(parseUnimarcPageCount("1 vol. (391 p.)")).toBe(391);
        expect(parseUnimarcPageCount("1 volume 362 p")).toBe(362);
        expect(parseUnimarcPageCount("1 vol. (170 p.)")).toBe(170);
    });

    it("takes the body, not the front matter, from a range", () => {
        // "28-272 p." is 28 pages of prelims then 272 of text; only the 272
        // is the one followed by "p.".
        expect(parseUnimarcPageCount("1 vol. (28-272 p.)")).toBe(272);
    });

    it("gives up rather than guess", () => {
        expect(parseUnimarcPageCount("2 vol. (823, 846 p.)")).toBeNull();
        expect(parseUnimarcPageCount("1 vol.")).toBeNull();
        expect(parseUnimarcPageCount("vol.")).toBeNull();
        expect(parseUnimarcPageCount("1 vol. (non paginé)")).toBeNull();
        expect(parseUnimarcPageCount("1 vol. (pagination multiple)")).toBeNull();
        expect(parseUnimarcPageCount("1 ressource dématérialisée 150 03 h 41 min 26 s")).toBeNull();
        expect(parseUnimarcPageCount(null)).toBeNull();
        expect(parseUnimarcPageCount("")).toBeNull();
    });

    it("is not fooled by other p-words or absurd figures", () => {
        expect(parseUnimarcPageCount("1 partition")).toBeNull();
        expect(parseUnimarcPageCount("1 vol. (0 p.)")).toBeNull();
        expect(parseUnimarcPageCount("1 vol. (999999 p.)")).toBeNull();
    });
});

describe("parseUnimarcYear", () => {
    it("digs the year out of a dépôt légal statement", () => {
        expect(parseUnimarcYear("DL 2025")).toBe("2025");
        expect(parseUnimarcYear("2026")).toBe("2026");
        expect(parseUnimarcYear("cop. 1998")).toBe("1998");
        expect(parseUnimarcYear("impr. 2011")).toBe("2011");
    });

    it("returns null when there is no year to find", () => {
        expect(parseUnimarcYear("[s.d.]")).toBeNull();
        expect(parseUnimarcYear(null)).toBeNull();
    });
});

describe("bnfSruUrl", () => {
    it("builds a UNIMARC single-record ISBN query", () => {
        const url = new URL(bnfSruUrl("9782824627151"));
        expect(url.origin + url.pathname).toBe("https://catalogue.bnf.fr/api/SRU");
        expect(url.searchParams.get("query")).toBe('bib.isbn all "9782824627151"');
        expect(url.searchParams.get("recordSchema")).toBe("unimarcxchange");
        expect(url.searchParams.get("maximumRecords")).toBe("1");
    });
});
