import {setupTestApp} from "../helpers/testApp";
import {createAuthenticatedUser, ITestUser} from "../helpers/auth";

const app = setupTestApp();

let user: ITestUser;

beforeAll(async () => {
    user = await createAuthenticatedUser(app);
});

describe("author CRUD and search", () => {
    it("creates, lists, searches, renames and deletes an author", async () => {
        const createRes = await user.agent.post("/api/rest/author").send({name: "J.R.R. Tolkien"});
        expect(createRes.status).toBe(200);
        const id = createRes.body.id;

        const listRes = await user.agent.get("/api/rest/author");
        expect(listRes.body).toEqual(expect.arrayContaining([{id, name: "J.R.R. Tolkien"}]));

        const searchRes = await user.agent.post("/api/rest/author/search").send({query: "tolk"});
        expect(searchRes.body).toEqual(expect.arrayContaining([{id, name: "J.R.R. Tolkien"}]));

        const renameRes = await user.agent.put(`/api/rest/author/${id}`).send({name: "Tolkien"});
        expect(renameRes.status).toBe(200);
        expect(renameRes.body).toMatchObject({name: "Tolkien"});

        const deleteRes = await user.agent.delete(`/api/rest/author/${id}`);
        expect(deleteRes.status).toBe(200);
    });

    it("404s deleting an author that doesn't exist", async () => {
        const res = await user.agent.delete("/api/rest/author/999999999");
        expect(res.status).toBe(404);
    });

    // Inverted from upstream's "keeps authors private to the user who created
    // them". One shared library: an author one member adds is on the shared
    // shelf, and the search that backs the author picker finds it too - which
    // is what stops the second member creating a duplicate row.
    it("shares an author with every other account, including in search", async () => {
        const otherUser = await createAuthenticatedUser(app);
        const createRes = await user.agent.post("/api/rest/author").send({name: "Shared Author"});
        const id = createRes.body.id;

        const otherListRes = await otherUser.agent.get("/api/rest/author");
        expect(otherListRes.body).toEqual(expect.arrayContaining([{id, name: "Shared Author"}]));

        const otherSearchRes = await otherUser.agent.post("/api/rest/author/search").send({query: "shared author"});
        expect(otherSearchRes.body).toEqual(expect.arrayContaining([{id, name: "Shared Author"}]));

        const otherRenameRes = await otherUser.agent.put(`/api/rest/author/${id}`).send({name: "Renamed By Someone Else"});
        expect(otherRenameRes.status).toBe(200);

        const otherDeleteRes = await otherUser.agent.delete(`/api/rest/author/${id}`);
        expect(otherDeleteRes.status).toBe(200);
    });

    // unique_author_name is instance-wide now: two members each typing
    // "Ursula K. Le Guin" must not produce two author rows with their books
    // split across them.
    it("rejects a duplicate author name added by a different account", async () => {
        const otherUser = await createAuthenticatedUser(app);
        const name = `Duplicate Author ${Date.now()}`;

        const first = await user.agent.post("/api/rest/author").send({name});
        expect(first.status).toBe(200);

        const second = await otherUser.agent.post("/api/rest/author").send({name});
        expect(second.status).toBe(500);

        await user.agent.delete(`/api/rest/author/${first.body.id}`);
    });
});
