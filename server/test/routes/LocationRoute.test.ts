import { setupTestApp } from "../helpers/testApp";
import { createAuthenticatedUser, ITestUser } from "../helpers/auth";

const app = setupTestApp();

let user: ITestUser;

beforeAll(async () => {
    user = await createAuthenticatedUser(app);
});

describe("location CRUD and book placement", () => {
    it("creates, lists, renames and deletes a location", async () => {
        const createRes = await user.agent
            .post("/api/rest/location")
            .send({ name: "Main Shelf", description: "Front room" });
        expect(createRes.status).toBe(200);
        expect(createRes.body).toMatchObject({ name: "Main Shelf", description: "Front room", total_books: "0" });
        const id = createRes.body.id;

        const listRes = await user.agent.get("/api/rest/location");
        expect(listRes.body.some((l: any) => l.id === id)).toBe(true);

        const renameRes = await user.agent
            .put(`/api/rest/location/${id}`)
            .send({ name: "Back Shelf", description: "" });
        expect(renameRes.status).toBe(200);
        expect(renameRes.body.name).toBe("Back Shelf");

        const deleteRes = await user.agent.delete(`/api/rest/location/${id}`);
        expect(deleteRes.status).toBe(200);
    });

    it("404s deleting a location that doesn't exist", async () => {
        const res = await user.agent.delete("/api/rest/location/999999999");
        expect(res.status).toBe(404);
    });

    it("moves a book stock into a location by scanning its code", async () => {
        const locationA = (await user.agent.post("/api/rest/location").send({ name: "Shelf A", description: "" })).body
            .id;
        const locationB = (await user.agent.post("/api/rest/location").send({ name: "Shelf B", description: "" })).body
            .id;

        const bookId = (await user.agent.post("/api/rest/book").field("name", "Moveable Book")).body;
        const stockRes = await user.agent
            .post(`/api/rest/book/${bookId}/stock`)
            .send({ status: 0, location_id: locationA });
        const stockCode = stockRes.body.code;

        const moveRes = await user.agent.post(`/api/rest/location/${locationB}/add/books`).send({ books: [stockCode] });
        expect(moveRes.status).toBe(200);
        expect(moveRes.body.some((b: any) => b.code === stockCode)).toBe(true);

        const shelfABooks = await user.agent.get(`/api/rest/location/${locationA}/books`);
        expect(shelfABooks.body.some((b: any) => b.code === stockCode)).toBe(false);
    });

    // Inverted from upstream's "404s moving books into a location that doesn't
    // belong to the user". One shared library means one set of physical
    // shelves - any member can move a copy onto any of them, and the shelf
    // another member created shows up in everyone's list.
    it("moves a book onto a shelf another account created", async () => {
        const otherUser = await createAuthenticatedUser(app);
        const theirShelf = (
            await otherUser.agent.post("/api/rest/location").send({ name: `Theirs ${Date.now()}`, description: "" })
        ).body.id;

        const listRes = await user.agent.get("/api/rest/location");
        expect(listRes.body.some((l: any) => l.id === theirShelf)).toBe(true);

        const myShelf = (
            await user.agent.post("/api/rest/location").send({ name: `Mine ${Date.now()}`, description: "" })
        ).body.id;
        const bookId = (await user.agent.post("/api/rest/book").field("name", "Relocatable Book")).body;
        const stockCode = (
            await user.agent.post(`/api/rest/book/${bookId}/stock`).send({ status: 0, location_id: myShelf })
        ).body.code;

        const res = await user.agent.post(`/api/rest/location/${theirShelf}/add/books`).send({ books: [stockCode] });
        expect(res.status).toBe(200);
        expect(res.body.some((b: any) => b.code === stockCode)).toBe(true);

        // ...and the owner of that shelf sees the book that landed on it.
        const theirBooks = await otherUser.agent.get(`/api/rest/location/${theirShelf}/books`);
        expect(theirBooks.body.some((b: any) => b.code === stockCode)).toBe(true);
    });

    // Still 404 - not ownership, just a location id that names nothing.
    it("404s moving books into a location that doesn't exist", async () => {
        const res = await user.agent.post(`/api/rest/location/999999999/add/books`).send({ books: ["whatever"] });
        expect(res.status).toBe(404);
    });
});
