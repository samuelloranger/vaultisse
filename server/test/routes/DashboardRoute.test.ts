import request from "supertest";
import {setupTestApp} from "../helpers/testApp";
import {createAuthenticatedUser} from "../helpers/auth";

const app = setupTestApp();

describe("GET /dashboard", () => {
    it("requires auth", async () => {
        const {agent: unauth} = await createAuthenticatedUser(app);
        // sanity: an authenticated agent works, then compare against no auth at all.
        const authedRes = await unauth.get("/api/rest/dashboard");
        expect(authedRes.status).toBe(200);

        const noAuthRes = await request(app).get("/api/rest/dashboard");
        expect(noAuthRes.status).toBe(302);
    });

    // The dashboard now describes the whole shared library, so its totals are
    // not "this account's books" any more - they can't be asserted as an
    // absolute. Assert the delta instead: adding one book moves totalBooks by
    // exactly one, whoever added it.
    it("aggregates real counts across the shared library", async () => {
        const user = await createAuthenticatedUser(app);

        const before = await user.agent.get("/api/rest/dashboard");
        expect(before.status).toBe(200);
        expect(typeof before.body.totalBooks).toBe("number");

        await user.agent.post("/api/rest/book").field("name", "Dashboard Book");

        const res = await user.agent.get("/api/rest/dashboard");
        expect(res.status).toBe(200);
        expect(res.body.totalBooks).toBe(before.body.totalBooks + 1);
        expect(Array.isArray(res.body.lastBooks)).toBe(true);
        expect(res.body.lastBooks.some((b: any) => b.name === "Dashboard Book")).toBe(true);
    });

    // A book someone else added counts toward everyone's dashboard - the
    // household has one collection, not one per account.
    it("counts a book another account added", async () => {
        const contributor = await createAuthenticatedUser(app);
        const viewer = await createAuthenticatedUser(app);

        const before = await viewer.agent.get("/api/rest/dashboard");
        await contributor.agent.post("/api/rest/book").field("name", "Added By Someone Else");

        const after = await viewer.agent.get("/api/rest/dashboard");
        expect(after.body.totalBooks).toBe(before.body.totalBooks + 1);
        expect(after.body.lastBooks.some((b: any) => b.name === "Added By Someone Else")).toBe(true);
    });
});
