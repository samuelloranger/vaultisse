import request from "supertest";
import {setupTestApp} from "../helpers/testApp";
import {createAuthenticatedUser} from "../helpers/auth";

const app = setupTestApp();

describe("GET /app/version", () => {
    it("responds with a version and uptime, unauthenticated", async () => {
        const res = await request(app).get("/api/rest/app/version");

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty("version");
        expect(typeof res.body.uptime).toBe("number");
    });
});

describe("GET /app/policy", () => {
    it("redirects a request with no session cookie at all", async () => {
        const res = await request(app).get("/api/rest/app/policy");
        expect(res.status).toBe(302);
        expect(res.headers.location).toBe("/login");
    });

    it("rejects a request with an invalid session cookie", async () => {
        const res = await request(app)
            .get("/api/rest/app/policy")
            .set("Cookie", "token=not-a-real-jwt");

        expect(res.status).toBe(401);
        expect(res.body).toMatchObject({sessionExpired: true});
    });

    it("returns the bootstrap payload for a logged-in user", async () => {
        const {agent, name, email} = await createAuthenticatedUser(app);

        const res = await agent.get("/api/rest/app/policy");

        expect(res.status).toBe(200);
        expect(res.body.user).toMatchObject({name, email});
        expect(Array.isArray(res.body.categories)).toBe(true);
        expect(Array.isArray(res.body.languages)).toBe(true);
        expect(Array.isArray(res.body.formats)).toBe(true);
        expect(Array.isArray(res.body.locations)).toBe(true);
        expect(Array.isArray(res.body.customers)).toBe(true);
        // Seeded by databaseSchema.sql - confirms the schema load in
        // globalSetup actually ran, not just that the endpoint responds.
        expect(res.body.formats.length).toBeGreaterThan(0);
        expect(res.body.languages.length).toBeGreaterThan(0);
        // Real value from AppService, not a hardcoded client-side copy -
        // see the MAX_IMPORT_FILE_SIZE_MB feature this guards against drifting.
        expect(res.body.maxImportFileSizeMb).toBe(10);
    });

    /**
     * leasingEnabled / isPublicInstitution moved out of the users row into the
     * single-row `app_settings` table, but stay inside the policy payload's
     * `user` object so the client's router guard and menu gating keep reading
     * them from exactly where they always did.
     */
    it("serves the instance settings inside the user payload", async () => {
        const {agent} = await createAuthenticatedUser(app);
        const res = await agent.get("/api/rest/app/policy");

        expect(res.status).toBe(200);
        expect(typeof res.body.user.leasingEnabled).toBe("boolean");
        expect(typeof res.body.user.isPublicInstitution).toBe("boolean");
    });

    // The reference lists in the payload cover the whole shared library, not
    // the caller's own rows - this is what hydrates everyone's dropdowns.
    it("includes reference rows another account created", async () => {
        const contributor = await createAuthenticatedUser(app);
        const viewer = await createAuthenticatedUser(app);
        const stamp = Date.now();

        const categoryId = (await contributor.agent.post("/api/rest/category").send({name: `Policy Category ${stamp}`})).body.id;
        const locationId = (await contributor.agent.post("/api/rest/location").send({name: `Policy Shelf ${stamp}`, description: ""})).body.id;
        const customerId = (await contributor.agent.post("/api/rest/customer").send({name: `Policy Customer ${stamp}`})).body.id;

        const res = await viewer.agent.get("/api/rest/app/policy");
        expect(res.body.categories.some((c: any) => c.id === categoryId)).toBe(true);
        expect(res.body.locations.some((l: any) => l.id === locationId)).toBe(true);
        expect(res.body.customers.some((c: any) => c.id === customerId)).toBe(true);
    });
});
