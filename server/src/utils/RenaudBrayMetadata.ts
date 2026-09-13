import { IBookMetadata, emptyBookMetadata } from "../types/book/IBookMetadata";

const LOOKUP_TIMEOUT_MS = 8000;
const MAX_COVER_BYTES = 4 * 1024 * 1024;

function normalizedIsbn(value: unknown): string {
    return String(value ?? "").replace(/[\s-]/g, "").toUpperCase();
}

export function renaudBraySearchUrl(baseUrl: string, isbn: string): string {
    const base = baseUrl.replace(/\/$/, "");
    const url = new URL(`${base}/search`);
    url.searchParams.set("q", `"${normalizedIsbn(isbn)}" site:renaud-bray.com`);
    url.searchParams.set("format", "json");
    return url.toString();
}

function isProductUrl(value: unknown): value is string {
    if (typeof value !== "string") return false;
    try {
        const url = new URL(value);
        return url.protocol === "https:" && !url.username && !url.password && !url.port &&
            (url.hostname === "renaud-bray.com" || url.hostname === "www.renaud-bray.com") &&
            url.pathname === "/Livres_Produit.aspx";
    } catch { return false; }
}

/** Compare only the canonical product target; query strings may be rewritten by the shop. */
function sameProductTarget(candidate: string, finalUrl: unknown): boolean {
    if (!isProductUrl(finalUrl)) return false;
    const expected = new URL(candidate);
    const actual = new URL(finalUrl);
    return actual.protocol === expected.protocol && actual.hostname === expected.hostname &&
        actual.port === expected.port && actual.pathname === expected.pathname;
}

function jsonLdProduct(html: string): Record<string, unknown> | null {
    const scripts = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
    for (const match of scripts) {
        try {
            const parsed = JSON.parse(match[1].trim());
            const values = Array.isArray(parsed) ? parsed : [parsed, ...(Array.isArray(parsed?.["@graph"]) ? parsed["@graph"] : [])];
            const product = values.find((item) => item && typeof item === "object" &&
                (item["@type"] === "Product" || (Array.isArray(item["@type"]) && item["@type"].includes("Product"))));
            if (product) return product;
        } catch { /* malformed structured data: try the next script */ }
    }
    return null;
}

function metaContent(html: string, property: string): string | null {
    const pattern = new RegExp(`<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["']`, "i");
    return html.match(pattern)?.[1]?.trim() ?? null;
}

function text(value: unknown): string | null {
    return typeof value === "string" && value.trim() ? value.trim() : null;
}

function htmlText(value: string): string {
    return value.replace(/<[^>]*>/g, "").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&")
        .replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/\s+/g, " ").trim();
}

/** Read a value from the next simple definition/list element after a label. */
function labelledValue(html: string, labels: string[]): string | null {
    const label = labels.map((value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
    const match = html.match(new RegExp(`<(?:dt|th|label)[^>]*>\\s*(?:${label})\\s*<\\/(?:dt|th|label)>\\s*<(?:dd|td|div|span|p)[^>]*>([\\s\\S]*?)<\\/(?:dd|td|div|span|p)>`, "i"));
    return match ? htmlText(match[1]) || null : null;
}

/** Read the value cell following a table cell whose nested text is a label. */
function labelledCellValue(html: string, labels: string[]): string | null {
    const label = labels.map((value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
    const match = html.match(new RegExp(`<td[^>]*>\\s*(?:<(?:span|strong|b)[^>]*>\\s*)?(?:${label})\\s*:?[\\s\\S]*?<\\/(?:span|strong|b)>\\s*<\\/td>\\s*<td[^>]*>([\\s\\S]*?)<\\/td>`, "i"));
    return match ? htmlText(match[1]) || null : null;
}

function labelled(html: string, labels: string[]): string | null {
    return labelledValue(html, labels) ?? labelledCellValue(html, labels);
}

function authorNames(value: unknown): string[] {
    const values = Array.isArray(value) ? value : [value];
    return values.map((author) => typeof author === "string" ? author : author && typeof author === "object" ? author.name : null)
        .map(text).filter((name): name is string => Boolean(name));
}

function coverUrl(value: unknown): string | null {
    const candidate = Array.isArray(value) ? value[0] : value;
    if (typeof candidate !== "string" || /(?:^|\/)404rb\.gif(?:$|[?#])/i.test(candidate)) return null;
    try {
        const url = new URL(candidate);
        return url.hostname === "images.renaud-bray.com" && url.protocol === "https:" ? url.toString() : null;
    } catch { return null; }
}

export function parseRenaudBrayPage(html: string, isbn: string): IBookMetadata | null {
    const product = jsonLdProduct(html);
    if (!product) return null;
    const requestedIsbn = normalizedIsbn(isbn);
    const identifiers = [product.sku, product.isbn, metaContent(html, "og:isbn")]
        .map(normalizedIsbn).filter(Boolean);
    if (!identifiers.includes(requestedIsbn)) return null;
    const metadata = emptyBookMetadata();
    metadata.title = text(product.name) ?? labelled(html, ["Titre", "Title"]);
    metadata.authors = authorNames(product.author);
    if (!metadata.authors.length) {
        const author = labelled(html, ["Auteur", "Auteurs", "Author", "Authors"]);
        if (author) metadata.authors = [author];
    }
    metadata.description = text(product.description) ?? labelled(html, ["Description", "Résumé", "Summary"]);
    const category = text(product.category) ?? labelled(html, ["Catégorie", "Catégorie(s)", "Category", "Categories"]);
    metadata.categories = category ? [category] : [];
    metadata.publisher = text((product.brand as { name?: unknown } | undefined)?.name) ?? text(product.publisher) ?? labelled(html, ["Éditeur", "Editeur", "Publisher"]);
    metadata.publishedDate = text(product.releaseDate) ?? text(product.datePublished) ?? labelled(html, ["Date de parution", "Date de publication", "Publication date"]);
    const pageText = labelled(html, ["Nombre de pages", "Pages", "Page count"]);
    const pages = Number(product.numberOfPages ?? product.pageCount ?? pageText?.match(/\d+/)?.[0]);
    metadata.pageCount = Number.isInteger(pages) && pages > 0 && pages <= 10000 ? pages : null;
    metadata.imageUrl = coverUrl(product.image) ?? coverUrl(metaContent(html, "og:image"));
    return metadata;
}

function lookupSignal(deadline: number): AbortSignal {
    return AbortSignal.timeout(Math.max(1, deadline - Date.now()));
}

async function validCoverResponse(response: Response): Promise<boolean> {
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (!response.ok || !contentType.startsWith("image/") || !response.body) return false;
    const reader = response.body.getReader();
    let size = 0;
    const bytes: Uint8Array[] = [];
    try {
        while (true) {
            const chunk = await reader.read();
            if (chunk.done) break;
            size += chunk.value.byteLength;
            if (size > MAX_COVER_BYTES) {
                await reader.cancel();
                return false;
            }
            bytes.push(chunk.value);
        }
    } finally {
        reader.releaseLock();
    }
    const data = new Uint8Array(size);
    let offset = 0;
    for (const chunk of bytes) { data.set(chunk, offset); offset += chunk.length; }
    const jpeg = data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
    const png = data.length >= 8 && data.slice(0, 8).every((byte, index) => byte === [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a][index]);
    const webp = data.length >= 12 && String.fromCharCode(...data.slice(0, 4)) === "RIFF" && String.fromCharCode(...data.slice(8, 12)) === "WEBP";
    return jpeg || png || webp;
}

export async function fetchRenaudBrayMetadata(isbn: string): Promise<IBookMetadata | null> {
    const searx = process.env.SEARXNG_URL;
    const flare = process.env.FLARESOLVERR_URL;
    if (!searx || !flare) return null;
    const deadline = Date.now() + LOOKUP_TIMEOUT_MS;
    const searchResponse = await fetch(renaudBraySearchUrl(searx, isbn), { signal: lookupSignal(deadline) });
    if (!searchResponse.ok) throw new Error(`SearXNG returned ${searchResponse.status}`);
    const search = await searchResponse.json() as { results?: Array<{ url?: string }> };
    const candidate = search.results?.map((result) => result.url).find(isProductUrl);
    if (!candidate) return null;
    const flareResponse = await fetch(`${flare.replace(/\/$/, "")}/v1`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ cmd: "request.get", url: candidate, maxTimeout: Math.max(1, deadline - Date.now()) }),
        signal: lookupSignal(deadline),
    });
    if (!flareResponse.ok) throw new Error(`FlareSolverr returned ${flareResponse.status}`);
    const flareBody = await flareResponse.json() as { solution?: { response?: string; url?: string } };
    if (!sameProductTarget(candidate, flareBody.solution?.url)) return null;
    const metadata = parseRenaudBrayPage(flareBody.solution?.response ?? "", isbn);
    if (!metadata || !metadata.imageUrl) return metadata;
    const coverResponse = await fetch(metadata.imageUrl, { signal: lookupSignal(deadline) });
    if (!(await validCoverResponse(coverResponse))) metadata.imageUrl = null;
    return metadata;
}
