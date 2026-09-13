import request from "supertest";
import { setupTestApp } from "../helpers/testApp";
import { createAuthenticatedUser, ITestUser } from "../helpers/auth";

const app = setupTestApp();

let user: ITestUser;

beforeAll(async () => {
    user = await createAuthenticatedUser(app);
});

/**
 * Category names are unique across the whole instance now
 * (`unique_category_name`), and every test file shares one database - so a
 * plain literal like "Fantasy" collides with whatever another file's import
 * fixture happens to create. Each name below gets a run-unique suffix.
 */
const suffix = `${Date.now()}`;

describe("category CRUD", () => {
    it("requires auth", async () => {
        const res = await request(app).get("/api/rest/category");
        expect(res.status).toBe(302);
    });

    // NOT "starts empty": every test file shares one database and the library
    // is now instance-wide, so a fresh account inherits whatever anyone else
    // already added. Assert on the shape, and on this file's own rows below.
    it("lists the shared library's categories for a fresh account", async () => {
        const res = await user.agent.get("/api/rest/category");
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        res.body.forEach((c: any) => {
            expect(typeof c.id).toBe("number");
            expect(typeof c.name).toBe("string");
        });
    });

    it("creates, lists, renames and deletes a category", async () => {
        const name = `Fantasy ${suffix}`;
        const createRes = await user.agent.post("/api/rest/category").send({ name });
        expect(createRes.status).toBe(200);
        expect(createRes.body).toMatchObject({ name });
        const id = createRes.body.id;
        expect(typeof id).toBe("number");

        const listRes = await user.agent.get("/api/rest/category");
        expect(listRes.body).toEqual(expect.arrayContaining([{ id, name }]));

        const renamed = `Sci-Fi ${suffix}`;
        const renameRes = await user.agent.put(`/api/rest/category/${id}`).send({ name: renamed });
        expect(renameRes.status).toBe(200);
        expect(renameRes.body).toMatchObject({ id, name: renamed });

        const deleteRes = await user.agent.delete(`/api/rest/category/${id}`);
        expect(deleteRes.status).toBe(200);

        const finalListRes = await user.agent.get("/api/rest/category");
        expect(finalListRes.body).not.toEqual(expect.arrayContaining([expect.objectContaining({ id })]));
    });

    it("404s deleting a category that doesn't exist", async () => {
        const res = await user.agent.delete("/api/rest/category/999999999");
        expect(res.status).toBe(404);
    });

    // Inverted from upstream's "keeps categories private to the user who
    // created them". One shared library: a category one member adds is a
    // category the whole household can see, rename and delete.
    it("shares a category with every other account, editable by all of them", async () => {
        const otherUser = await createAuthenticatedUser(app);

        const name = `Shared Across Accounts ${suffix}`;
        const createRes = await user.agent.post("/api/rest/category").send({ name });
        const id = createRes.body.id;

        const otherListRes = await otherUser.agent.get("/api/rest/category");
        expect(otherListRes.body).toEqual(expect.arrayContaining([{ id, name }]));

        const renamed = `Renamed By Someone Else ${suffix}`;
        const otherRenameRes = await otherUser.agent.put(`/api/rest/category/${id}`).send({ name: renamed });
        expect(otherRenameRes.status).toBe(200);
        expect(otherRenameRes.body).toMatchObject({ id, name: renamed });

        // ...and the rename is visible to the original author, not a private copy.
        const ownerListRes = await user.agent.get("/api/rest/category");
        expect(ownerListRes.body).toEqual(expect.arrayContaining([{ id, name: renamed }]));

        const otherDeleteRes = await otherUser.agent.delete(`/api/rest/category/${id}`);
        expect(otherDeleteRes.status).toBe(200);
    });

    // The re-keyed constraint (unique_category_name) is instance-wide now, so a
    // second account adding a name that already exists collides instead of
    // silently creating a parallel row the books then split across.
    it("rejects a duplicate category name added by a different account", async () => {
        const otherUser = await createAuthenticatedUser(app);
        const name = `Duplicate Category ${Date.now()}`;

        const first = await user.agent.post("/api/rest/category").send({ name });
        expect(first.status).toBe(200);

        const second = await otherUser.agent.post("/api/rest/category").send({ name });
        expect(second.status).toBe(500);

        await user.agent.delete(`/api/rest/category/${first.body.id}`);
    });
});
