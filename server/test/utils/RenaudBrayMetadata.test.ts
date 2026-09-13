import { afterEach, describe, expect, it } from "bun:test";
import {
    fetchRenaudBrayMetadata,
    parseRenaudBrayPage,
    renaudBraySearchUrl,
} from "../../src/utils/RenaudBrayMetadata";
import { mockedFetch, useMockedFetch, jsonResponse, imageResponse } from "../helpers/fetchMock";

useMockedFetch();

const isbn = "9781234567897";
const productUrl = `https://www.renaud-bray.com/Livres_Produit.aspx?id=${isbn}`;
const page = (sku: string, cover = "https://images.renaud-bray.com/images/Books/123.jpg") => `
<html><head>
<meta property="og:isbn" content="${sku}">
<script type="application/ld+json">${JSON.stringify({
    "@type": "Product", sku, name: "Un livre", author: { name: "Une autrice" },
    description: "Un résumé", category: "Roman", brand: { name: "Un éditeur" },
    releaseDate: "2024-05-01", numberOfPages: 320, image: cover,
})}</script></head></html>`;

const productPage = (identifiers: Record<string, unknown>, cover = "https://images.renaud-bray.com/images/Books/123.jpg", name: unknown = "Un livre") => `
<script type="application/ld+json">${JSON.stringify({ "@type": "Product", ...identifiers, name, image: cover })}</script>`;

afterEach(() => {
    mockedFetch.mockReset();
    delete process.env.SEARXNG_URL;
    delete process.env.FLARESOLVERR_URL;
});

describe("renaudBraySearchUrl", () => {
    it("quotes the ISBN and restricts search to Renaud-Bray", () => {
        const url = new URL(renaudBraySearchUrl("https://searxng:8080", isbn));
        expect(url.pathname).toBe("/search");
        expect(url.searchParams.get("q")).toBe(`\"${isbn}\" site:renaud-bray.com`);
        expect(url.searchParams.get("format")).toBe("json");
    });
});

describe("parseRenaudBrayPage", () => {
    it("normalizes explicit JSON-LD product fields", () => {
        expect(parseRenaudBrayPage(page(isbn), isbn)).toEqual({
            title: "Un livre", authors: ["Une autrice"], description: "Un résumé",
            categories: ["Roman"], publisher: "Un éditeur", publishedDate: "2024-05-01",
            pageCount: 320, language: null, imageUrl: "https://images.renaud-bray.com/images/Books/123.jpg",
        });
    });

    it("rejects a product whose ISBN does not match", () => {
        expect(parseRenaudBrayPage(page("9780000000000"), isbn)).toBeNull();
    });

    it("accepts og:isbn when JSON-LD sku is present but mismatched", () => {
        const html = productPage({ sku: "9780000000000" })
            .replace("<script", `<meta property="og:isbn" content="${isbn}"><script`);
        expect(parseRenaudBrayPage(html, isbn)).not.toBeNull();
    });

    it("returns a matching cover-only product without a title", () => {
        const result = parseRenaudBrayPage(productPage({ sku: isbn }, undefined, ""), isbn);
        expect(result).toMatchObject({ title: null, imageUrl: "https://images.renaud-bray.com/images/Books/123.jpg" });
    });

    it("does not return the 404RB.gif placeholder cover", () => {
        const result = parseRenaudBrayPage(page(isbn, "https://images.renaud-bray.com/404RB.gif"), isbn);
        expect(result?.imageUrl).toBeNull();
    });

    it("fills absent JSON-LD fields from labelled product fields", () => {
        const html = `<script type="application/ld+json">${JSON.stringify({
            "@type": "Product", sku: isbn, name: "Un livre", description: "Résumé", image: "https://images.renaud-bray.com/cover.jpg",
        })}</script><dl>
            <dt>Auteur</dt><dd>Une autrice</dd><dt>Catégorie</dt><dd>Roman</dd>
            <dt>Éditeur</dt><dd>Un éditeur</dd><dt>Date de parution</dt><dd>2024</dd>
            <dt>Nombre de pages</dt><dd>320 pages</dd>
        </dl>`;
        expect(parseRenaudBrayPage(html, isbn)).toMatchObject({
            authors: ["Une autrice"], categories: ["Roman"], publisher: "Un éditeur",
            publishedDate: "2024", pageCount: 320,
        });
    });

    it("fills absent fields from labelled table cells containing spans", () => {
        const html = `<script type="application/ld+json">${JSON.stringify({
            "@type": "Product", sku: isbn, name: "Un livre", description: "Résumé", image: "https://images.renaud-bray.com/cover.jpg",
        })}</script><table>
            <tr><td><span>Catégorie :</span></td><td><div>Santé</div></td></tr>
            <tr><td><span>Éditeur :</span></td><td><span>Un éditeur</span></td></tr>
            <tr><td><span>Date de parution :</span></td><td><span>2024</span></td></tr>
            <tr><td><span>Nombre de pages :</span></td><td><span>320</span></td></tr>
            <tr><td><span>Auteur :</span></td><td><span>Une autrice</span></td></tr>
        </table>`;
        expect(parseRenaudBrayPage(html, isbn)).toMatchObject({
            authors: ["Une autrice"], categories: ["Santé"], publisher: "Un éditeur",
            publishedDate: "2024", pageCount: 320,
        });
    });
});

describe("fetchRenaudBrayMetadata", () => {
    it("selects only an exact Renaud-Bray product URL and validates its cover", async () => {
        process.env.SEARXNG_URL = "https://searxng:8080";
        process.env.FLARESOLVERR_URL = "https://flaresolverr:8191";
        mockedFetch
            .mockResolvedValueOnce(jsonResponse({ results: [{ url: "https://example.com/wrong" }, { url: productUrl }] }))
            .mockResolvedValueOnce(jsonResponse({ solution: { url: productUrl, response: page(isbn) } }))
            .mockResolvedValueOnce(new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), {
                headers: { "content-type": "image/jpeg" },
            }));
        expect(await fetchRenaudBrayMetadata(isbn)).toMatchObject({ title: "Un livre", imageUrl: expect.any(String) });
        expect(mockedFetch.mock.calls[1][0]).toBe("https://flaresolverr:8191/v1");
    });

    it("rejects HTTP, credentialed, alternate-port, and path-variant product URLs", async () => {
        process.env.SEARXNG_URL = "https://searxng:8080";
        process.env.FLARESOLVERR_URL = "https://flaresolverr:8191";
        const invalid = [
            "http://renaud-bray.com/Livres_Produit.aspx?id=1",
            "https://user:pass@renaud-bray.com/Livres_Produit.aspx?id=1",
            "https://renaud-bray.com:8443/Livres_Produit.aspx?id=1",
            "https://renaud-bray.com/autre.aspx?id=1",
            "https://renaud-bray.com/livres_produit.aspx?id=1",
        ];
        for (const url of invalid) {
            mockedFetch.mockResolvedValueOnce(jsonResponse({ results: [{ url }] }));
            expect(await fetchRenaudBrayMetadata(isbn)).toBeNull();
        }
        expect(mockedFetch).toHaveBeenCalledTimes(invalid.length);
    });

    it("rejects a FlareSolverr redirect to a different product target", async () => {
        process.env.SEARXNG_URL = "https://searxng:8080";
        process.env.FLARESOLVERR_URL = "https://flaresolverr:8191";
        mockedFetch
            .mockResolvedValueOnce(jsonResponse({ results: [{ url: productUrl }] }))
            .mockResolvedValueOnce(jsonResponse({
                solution: { url: "https://www.renaud-bray.com/Recherche.aspx?q=other", response: page(isbn) },
            }));
        expect(await fetchRenaudBrayMetadata(isbn)).toBeNull();
        expect(mockedFetch).toHaveBeenCalledTimes(2);
    });

    it("rejects a mislabeled HTML cover and the GIF placeholder bytes", async () => {
        process.env.SEARXNG_URL = "https://searxng:8080";
        process.env.FLARESOLVERR_URL = "https://flaresolverr:8191";
        mockedFetch
            .mockResolvedValueOnce(jsonResponse({ results: [{ url: productUrl }] }))
            .mockResolvedValueOnce(jsonResponse({ solution: { url: productUrl, response: page(isbn) } }))
            .mockResolvedValueOnce(new Response("<html>not an image</html>", { headers: { "content-type": "image/jpeg" } }));
        expect((await fetchRenaudBrayMetadata(isbn))?.imageUrl).toBeNull();
        mockedFetch
            .mockResolvedValueOnce(jsonResponse({ results: [{ url: productUrl }] }))
            .mockResolvedValueOnce(jsonResponse({ solution: { url: productUrl, response: page(isbn) } }))
            .mockResolvedValueOnce(new Response("GIF89a", { headers: { "content-type": "image/gif" } }));
        expect((await fetchRenaudBrayMetadata(isbn))?.imageUrl).toBeNull();
    });

    it("rejects a cover body larger than 4MB", async () => {
        process.env.SEARXNG_URL = "https://searxng:8080";
        process.env.FLARESOLVERR_URL = "https://flaresolverr:8191";
        mockedFetch
            .mockResolvedValueOnce(jsonResponse({ results: [{ url: productUrl }] }))
            .mockResolvedValueOnce(jsonResponse({ solution: { url: productUrl, response: page(isbn) } }))
            .mockResolvedValueOnce(new Response(new Uint8Array(4 * 1024 * 1024 + 1), { headers: { "content-type": "image/jpeg" } }));
        expect((await fetchRenaudBrayMetadata(isbn))?.imageUrl).toBeNull();
    });

    it("shares one wall-clock deadline across search, browser fetch, and cover", async () => {
        process.env.SEARXNG_URL = "https://searxng:8080";
        process.env.FLARESOLVERR_URL = "https://flaresolverr:8191";
        const realNow = Date.now;
        let now = 1000;
        Date.now = () => now;
        try {
            mockedFetch.mockImplementationOnce(async () => {
                now = 7000;
                return jsonResponse({ results: [{ url: productUrl }] });
            }).mockImplementationOnce(async (_url, init) => {
                now = 8000;
                const request = JSON.parse(String(init?.body));
                expect(request.maxTimeout).toBe(2000);
                return jsonResponse({ solution: { url: productUrl, response: page(isbn) } });
            }).mockResolvedValueOnce(new Response(new Uint8Array([0xff, 0xd8, 0xff]), {
                headers: { "content-type": "image/jpeg" },
            }));
            expect((await fetchRenaudBrayMetadata(isbn))?.imageUrl).toEqual(expect.any(String));
        } finally {
            Date.now = realNow;
        }
    });
});
