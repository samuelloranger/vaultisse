/**
 * =============================================================================
 * BnfUnimarc
 * =============================================================================
 * The Bibliothèque nationale de France's SRU catalogue, as a metadata source
 * for `POST /book/isbn/:isbn`.
 *
 * ### Why it exists
 *
 * Google Books and Open Library are both weak on French trade publishing.
 * Measured on three French ISBNs: Open Library returns `numFound: 0` for all
 * three, and Google - once it has an API key at all - returns a *partial*
 * record: title, authors, language, description and a cover, but no
 * publisher, no categories, and `pageCount: 0`. The BnF has all three books
 * with complete data, because French publishers are legally required to
 * deposit them. It is free and needs no API key.
 *
 * So this is a gap-filler, not a third fallback - see `BookMetadata.ts` for
 * where it sits in the chain.
 *
 * ### Why UNIMARC and not Dublin Core
 *
 * The same endpoint serves `recordSchema=dublincore`, which is smaller but
 * glues the cataloguing statement of responsibility onto everything:
 * `title` comes back as `"Le boyfriend / Freida McFadden ; traduit de
 * l'anglais par Karine Xaragai"` and `creator` as `"McFadden, Freida
 * (1980-....). Auteur du texte"`. Recovering a clean title and author from
 * those needs string surgery that breaks on the next record shape. UNIMARC
 * hands the same data already separated into subfields - `200$a` is the
 * title and nothing else - so the parsing below is field lookup, not
 * guesswork.
 *
 * ### Why no XML dependency
 *
 * `server/package.json` has no XML parser and this adds none. The payload is
 * machine-generated marcxchange: a flat `datafield` / `subfield` list, no
 * nesting, no CDATA, no mixed content, no attributes beyond `tag`, `ind1`,
 * `ind2` and `code`. A real parser buys nothing here, and it buys it at the
 * cost of a runtime dependency in a self-hosted image for a single call site.
 * The scanner below also *cannot* throw on malformed input - it simply
 * matches less - which is exactly the degradation this path needs, whereas a
 * strict parser would raise on a truncated response and have to be wrapped in
 * a try/catch anyway.
 *
 * Everything in this file except `fetchBnfMetadata` is pure and is tested
 * against recorded real SRU responses in `test/fixtures/bnf/`.
 */
import {IBookMetadata, emptyBookMetadata} from "../types/book/IBookMetadata";
import {ExternalHttpError} from "./ExternalHttpError";

/** BnF SRU endpoint. HTTPS: the plain-HTTP form the docs show also works, but there is no reason to use it. */
const BNF_SRU_ENDPOINT = "https://catalogue.bnf.fr/api/SRU";

/**
 * Measured round-trip is ~400ms warm. 8s leaves generous headroom for a slow
 * day without letting one scan stall a Scan-mode queue that fires these
 * back-to-back - deliberately a second under the 9s the other providers get,
 * because BnF is only ever consulted after one of them already answered.
 */
export const BNF_TIMEOUT_MS = 8000;

/**
 * UNIMARC relator codes (`7XX$4`) that mean "wrote this book".
 *
 * An allowlist, not a blocklist, because the failure that matters is
 * importing someone who is not the author: `730` is the translator and
 * `340` the scholarly editor, and both sit in `702` right next to the real
 * author. Codes outside this set are treated as contributors and dropped.
 */
const AUTHOR_ROLE_CODES = new Set(["070"]);

/** One `<datafield>`: its tag, its two indicators, and its subfields in document order. */
interface IUnimarcField {
    tag: string;
    ind2: string;
    subfields: Array<{code: string; value: string}>;
}

/**
 * Build the SRU query URL for an ISBN.
 *
 * `bib.isbn all "..."` matches the hyphenated form stored in `010$a` against
 * the bare digits we hold, which is why the ISBN is not reformatted first.
 */
export function bnfSruUrl(isbn: string): string {
    const url = new URL(BNF_SRU_ENDPOINT);
    url.searchParams.set("version", "1.2");
    url.searchParams.set("operation", "searchRetrieve");
    url.searchParams.set("query", `bib.isbn all "${isbn}"`);
    url.searchParams.set("recordSchema", "unimarcxchange");
    url.searchParams.set("maximumRecords", "1");
    return url.toString();
}

/**
 * Look this ISBN up in the BnF catalogue.
 *
 * Returns `null` for "the catalogue has no such record", including a body
 * that is not parseable as a record at all. Throws `ExternalHttpError` on a
 * non-2xx, and lets a network error or timeout propagate, so the caller can
 * tell a genuine data gap from a failed request - `lookupBookMetadata`
 * catches both and degrades to whatever the other providers produced.
 */
export async function fetchBnfMetadata(isbn: string): Promise<IBookMetadata | null> {
    const response = await fetch(bnfSruUrl(isbn), {
        signal: AbortSignal.timeout(BNF_TIMEOUT_MS),
        headers: {"User-Agent": "vaultisse-server/1.0"},
    });

    if (!response.ok) {
        throw new ExternalHttpError(response.status, "BnF");
    }

    return parseBnfUnimarc(await response.text());
}

/**
 * Turn one SRU `searchRetrieveResponse` into metadata, or `null` if it holds
 * no record. Never throws.
 */
export function parseBnfUnimarc(xml: string): IBookMetadata | null {
    const fields = __parseFirstRecord(xml);

    if (!fields) {
        return null;
    }

    const metadata = emptyBookMetadata();

    // 200$a is the title proper. $b is the general material designation
    // ("Texte imprimé") and $e the subtitle; neither belongs in books.name,
    // which mirrors what Google Books puts in `title`.
    metadata.title = __firstSubfield(fields, "200", "a");

    metadata.authors = __extractAuthors(fields);

    // 330$a is the publisher's blurb. Google has one for most titles and Open
    // Library's search endpoint has none at all, so this is often the only
    // description a French book gets.
    metadata.description = __firstSubfield(fields, "330", "a");

    // 606 is the RAMEAU subject heading (a real name, "Sexisme"). 686 is a
    // classification *number* ("803") and is deliberately not read.
    metadata.categories = fields
        .filter(field => field.tag === "606")
        .flatMap(field => field.subfields.filter(sub => sub.code === "a").map(sub => sub.value))
        .filter(value => value.length > 0);

    const publication = __publicationField(fields);
    metadata.publisher = publication ? __subfield(publication, "c") : null;
    metadata.publishedDate = parseUnimarcYear(publication ? __subfield(publication, "d") : null);

    metadata.pageCount = parseUnimarcPageCount(__firstSubfield(fields, "215", "a"));

    // 101$a is the language of the text (ISO 639-2/B, three letters). $c is
    // the language of the *original* and must not be taken: on a French
    // translation of an English novel it reads "eng".
    metadata.language = __firstSubfield(fields, "101", "a");

    // The BnF serves no cover through this API. 856$u carries an internal
    // image id, not a URL - covers keep coming from Open Library's covers
    // endpoint, and for French trade titles that often means none at all.
    metadata.imageUrl = null;

    return metadata.title ? metadata : null;
}

/**
 * Pull a page count out of `215$a`, which is free text a cataloguer typed:
 * `"1 vol. (391 p.)"`, `"1 volume 362 p"`, `"1 vol. (28-272 p.)"`,
 * `"2 vol. (823, 846 p.)"`, `"1 vol."`, `"1 ressource dématérialisée..."`.
 *
 * Returns `null` rather than a wrong number whenever the string does not
 * pin down a single figure:
 *  - more than one volume - `"2 vol. (823, 846 p.)"` is two books' worth and
 *    the total is not stated;
 *  - an explicit "non paginé" / "pagination multiple";
 *  - two or more page figures;
 *  - no page figure at all, or one outside a sane range.
 *
 * `"1 vol. (28-272 p.)"` is the one range it does resolve: only `272` is
 * followed by `p.`, the `28` being the roman-numbered front matter.
 */
export function parseUnimarcPageCount(extent: string | null | undefined): number | null {
    if (!extent) return null;

    const text = extent.toLowerCase();

    if (/non\s+pagin|pagination\s+multiple/.test(text)) {
        return null;
    }

    const volumes = /(\d+)\s*(?:vol\b|volumes?\b)/.exec(text);
    if (volumes && Number(volumes[1]) > 1) {
        return null;
    }

    // `pp?` covers "p", "p." and "pp."; the trailing group stops "Party" and
    // other p-words from reading as a pagination.
    const figures = [...text.matchAll(/(\d+)\s*pp?(?:\.|ages?|\b)/g)];
    if (figures.length !== 1) {
        return null;
    }

    const pages = Number(figures[0][1]);
    return Number.isInteger(pages) && pages > 0 && pages <= 20000 ? pages : null;
}

/**
 * Pull the year out of a UNIMARC date of publication (`210$d` / `214$d`).
 *
 * That subfield is not a date, it is the *dépôt légal* statement as printed:
 * `"DL 2025"`, `"2026"`, `"cop. 1998"`, `"impr. 2011"`. Handing any of those
 * to `formatPublishedDate`'s `new Date(...)` yields `Invalid Date` and the
 * published date is silently lost, so the year is extracted here instead.
 */
export function parseUnimarcYear(date: string | null | undefined): string | null {
    if (!date) return null;
    const year = /(1[0-9]{3}|20[0-9]{2})/.exec(date);
    return year ? year[1] : null;
}

/**
 * Authors, and only authors, out of the `700`/`701`/`702` name fields.
 *
 * Three shapes turn up in real records, in this order of trust:
 *  1. `$4` relator code - `070` is the author, `730` the translator, `340`
 *     the editor, `205` the collaborator. Decisive when present.
 *  2. `$c` role as free text ("Traducteur") on records that predate or skip
 *     the coded form.
 *  3. Neither, in which case the tag decides: `700`/`701` are the primary
 *     and co-authors, `702` is "secondary intellectual responsibility" - a
 *     bucket that holds translators and illustrators as readily as authors.
 *
 * `702` with no role at all is therefore only accepted when nothing else in
 * the record qualified. That is not hypothetical: the BnF record for
 * *L'intruse* files Freida McFadden under `702` with no `$4` and no `$c`,
 * next to a `702` translator marked `$c Traducteur`. Taking the unqualified
 * one only as a last resort keeps her and drops the translator.
 */
function __extractAuthors(fields: IUnimarcField[]): string[] {
    const confirmed: string[] = [];
    const unqualified: string[] = [];

    for (const field of fields) {
        if (field.tag !== "700" && field.tag !== "701" && field.tag !== "702") {
            continue;
        }

        const name = __personName(field);
        if (!name) continue;

        const roleCodes = field.subfields.filter(sub => sub.code === "4").map(sub => sub.value.trim());
        if (roleCodes.length > 0) {
            if (roleCodes.some(code => AUTHOR_ROLE_CODES.has(code))) {
                confirmed.push(name);
            }
            continue;
        }

        const roleText = field.subfields.find(sub => sub.code === "c")?.value;
        if (roleText) {
            if (/auteur/i.test(roleText)) {
                confirmed.push(name);
            }
            continue;
        }

        if (field.tag === "702") {
            unqualified.push(name);
        } else {
            confirmed.push(name);
        }
    }

    return __unique(confirmed.length > 0 ? confirmed : unqualified);
}

/** `$b $a` - forename then surname, the order Google Books uses ("Freida McFadden"). */
function __personName(field: IUnimarcField): string | null {
    const surname = __subfield(field, "a");
    const forename = __subfield(field, "b");
    const name = [forename, surname].filter(Boolean).join(" ").trim();
    return name.length > 0 ? name : null;
}

/**
 * The publication statement, out of the possibly several `210`/`214` fields.
 *
 * `214` (current) and `210` (older records) are the same statement; which one
 * a record uses depends on when it was catalogued. A record can carry more
 * than one, distinguished by the second indicator - *Le boyfriend* has
 * `214 ind2="0"` for "City roman" and `214 ind2="3"` for the printer,
 * "Impr. Laballery". Taking the first field blindly gets the printer on any
 * record that happens to list it first, so `0` (publication) is preferred and
 * `3` (printing) and `4` (copyright) are excluded outright.
 */
function __publicationField(fields: IUnimarcField[]): IUnimarcField | null {
    const candidates = fields.filter(
        field => (field.tag === "214" || field.tag === "210") && field.ind2 !== "3" && field.ind2 !== "4"
    );

    return candidates.find(field => field.ind2 === "0") ?? candidates[0] ?? null;
}

/**
 * The datafields of the first record in an SRU response, or `null` when the
 * response holds none.
 *
 * Anchored on `recordData`, which wraps exactly one record: a lazy match from
 * its opening tag to its closing one is the first record and nothing else.
 * An empty result set (`<srw:records/>`), a diagnostics-only response, a body
 * that is not XML at all, and a response truncated mid-record all miss here
 * and come back `null` rather than half a book.
 *
 * Namespace prefixes are matched loosely (`(?:[\w.-]+:)?`) rather than
 * hard-coded to `mxc:`/`srw:`: SRU servers are free to choose their own, and
 * the prefix carries no meaning worth depending on.
 */
function __parseFirstRecord(xml: string): IUnimarcField[] | null {
    if (!xml) return null;

    const recordData = /<(?:[\w.-]+:)?recordData\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?recordData>/.exec(xml);
    if (!recordData) {
        return null;
    }

    const fields: IUnimarcField[] = [];
    const datafield = /<(?:[\w.-]+:)?datafield\b([^>]*)>([\s\S]*?)<\/(?:[\w.-]+:)?datafield>/g;

    for (const match of recordData[1].matchAll(datafield)) {
        const tag = /\btag="([^"]*)"/.exec(match[1])?.[1];
        if (!tag) continue;

        const subfields: Array<{code: string; value: string}> = [];
        const subfield = /<(?:[\w.-]+:)?subfield\b[^>]*\bcode="([^"]*)"[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?subfield>/g;

        for (const sub of match[2].matchAll(subfield)) {
            subfields.push({code: sub[1], value: __decodeXmlText(sub[2])});
        }

        fields.push({tag, ind2: /\bind2="([^"]*)"/.exec(match[1])?.[1] ?? " ", subfields});
    }

    return fields.length > 0 ? fields : null;
}

/** First `$code` of the first `tag` field, trimmed, or null. */
function __firstSubfield(fields: IUnimarcField[], tag: string, code: string): string | null {
    const field = fields.find(candidate => candidate.tag === tag);
    return field ? __subfield(field, code) : null;
}

/** First `$code` of this field, trimmed, or null when absent or blank. */
function __subfield(field: IUnimarcField, code: string): string | null {
    const value = field.subfields.find(sub => sub.code === code)?.value.trim();
    return value ? value : null;
}

function __unique(values: string[]): string[] {
    return [...new Set(values)];
}

/**
 * The five predefined XML entities plus numeric character references.
 *
 * Hand-rolled because the scanner above never builds a DOM. `&amp;` is
 * replaced last so `&amp;lt;` decodes to the literal `&lt;` rather than `<`.
 */
function __decodeXmlText(text: string): string {
    return text
        .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
        .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, "&");
}
