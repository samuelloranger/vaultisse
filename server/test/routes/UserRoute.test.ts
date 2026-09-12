import {generate} from "otplib";
import request from "supertest";
import {setupTestApp} from "../helpers/testApp";
import {createAuthenticatedUser, nextFakeIp, TEST_PASSWORD} from "../helpers/auth";
import {appService} from "../../src/AppService";

const app = setupTestApp();

describe("PUT /user", () => {
    it("updates the current user's profile fields", async () => {
        const user = await createAuthenticatedUser(app);

        const res = await user.agent.put("/api/rest/user").send({
            name: "Updated Name",
            email: user.email,
            language: "es",
            region: "US",
        });
        expect(res.status).toBe(200);

        const policyRes = await user.agent.get("/api/rest/app/policy");
        expect(policyRes.body.user).toMatchObject({name: "Updated Name", language: "es"});
    });
});

describe("PATCH /user/theme", () => {
    it("accepts a valid theme", async () => {
        const user = await createAuthenticatedUser(app);
        const res = await user.agent.patch("/api/rest/user/theme").send({theme: "library"});
        expect(res.status).toBe(200);
    });

    it("rejects an invalid theme", async () => {
        const user = await createAuthenticatedUser(app);
        const res = await user.agent.patch("/api/rest/user/theme").send({theme: "not-a-theme"});
        expect(res.status).toBe(400);
    });
});

describe("PATCH /user/sidebar-rail", () => {
    it("accepts a boolean", async () => {
        const user = await createAuthenticatedUser(app);
        const res = await user.agent.patch("/api/rest/user/sidebar-rail").send({sidebarRail: true});
        expect(res.status).toBe(200);
    });

    it("rejects a non-boolean", async () => {
        const user = await createAuthenticatedUser(app);
        const res = await user.agent.patch("/api/rest/user/sidebar-rail").send({sidebarRail: "yes"});
        expect(res.status).toBe(400);
    });
});

/**
 * The leasing toggle used to live here, as `PATCH /user/leasing` behind
 * `requireAuth`. It is an instance setting - `app_settings.leasing_enabled`,
 * one row, which decides whether Loans and Customers exist in the nav for
 * *every* account - so it moved to `PATCH /api/rest/admin/settings` behind
 * `requireAdmin`. Its coverage moved with it, to AdminSettingsRoute.test.ts.
 *
 * This is what stays behind: proof that the un-gated route is actually gone
 * rather than still answering alongside the gated one. A "moved" endpoint that
 * kept working would leave the hole open while looking closed.
 */
describe("PATCH /user/leasing (moved to the admin surface)", () => {
    it("no longer exists under /user", async () => {
        const user = await createAuthenticatedUser(app);
        const res = await user.agent.patch("/api/rest/user/leasing").send({leasingEnabled: true});
        expect(res.status).toBe(404);
    });
});

describe("POST /user/password", () => {
    it("changes the password and keeps the current session valid", async () => {
        const user = await createAuthenticatedUser(app);
        const ip = nextFakeIp();

        const res = await user.agent
            .post("/api/rest/user/password")
            .set("X-Forwarded-For", ip)
            .send({currentPassword: TEST_PASSWORD, newPassword: "NewPass123!"});

        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({success: true});

        // The old password no longer works...
        const oldLoginRes = await user.agent
            .post("/login")
            .set("X-Forwarded-For", ip)
            .send({username: user.userCode, password: TEST_PASSWORD});
        expect(oldLoginRes.status).toBe(401);

        // ...but the new one does.
        const newLoginRes = await user.agent
            .post("/login")
            .set("X-Forwarded-For", ip)
            .send({username: user.userCode, password: "NewPass123!"});
        expect(newLoginRes.status).toBe(200);
    });

    it("rejects the wrong current password", async () => {
        const user = await createAuthenticatedUser(app);

        const res = await user.agent
            .post("/api/rest/user/password")
            .set("X-Forwarded-For", nextFakeIp())
            .send({currentPassword: "WrongCurrent1!", newPassword: "NewPass123!"});

        expect(res.status).toBe(401);
    });

    it("rejects a weak new password", async () => {
        const user = await createAuthenticatedUser(app);

        const res = await user.agent
            .post("/api/rest/user/password")
            .set("X-Forwarded-For", nextFakeIp())
            .send({currentPassword: TEST_PASSWORD, newPassword: "weak"});

        expect(res.status).toBe(400);
        expect(res.body.missing.length).toBeGreaterThan(0);
    });
});

describe("GET /user/sessions and DELETE /user/sessions/:id", () => {
    it("lists the current session and can revoke it", async () => {
        const user = await createAuthenticatedUser(app);

        const listRes = await user.agent.get("/api/rest/user/sessions");
        expect(listRes.status).toBe(200);
        expect(listRes.body.length).toBeGreaterThan(0);
        const current = listRes.body.find((s: any) => s.isCurrent);
        expect(current).toBeDefined();

        const deleteRes = await user.agent.delete(`/api/rest/user/sessions/${current.id}`);
        expect(deleteRes.status).toBe(200);

        // The revoked session's own cookie no longer authenticates.
        const afterRes = await user.agent.get("/api/rest/app/policy");
        expect(afterRes.status).toBe(302);
    });
});

describe("GET /user/activity", () => {
    it("records a login event", async () => {
        const user = await createAuthenticatedUser(app);
        const res = await user.agent.get("/api/rest/user/activity");
        expect(res.status).toBe(200);
        expect(res.body.some((a: any) => a.action === "login")).toBe(true);
    });
});

describe("Two-factor authentication", () => {
    it("supports the full setup -> enable -> gated login -> disable round trip", async () => {
        const user = await createAuthenticatedUser(app);

        const setupRes = await user.agent.post("/api/rest/user/2fa/setup");
        expect(setupRes.status).toBe(200);
        const {secret} = setupRes.body;
        expect(typeof secret).toBe("string");

        const enableRes = await user.agent
            .post("/api/rest/user/2fa/enable")
            .set("X-Forwarded-For", nextFakeIp())
            .send({code: await generate({secret})});
        expect(enableRes.status).toBe(200);
        expect(enableRes.body.success).toBe(true);
        expect(enableRes.body.backupCodes.length).toBeGreaterThan(0);

        // A fresh login now stops at the password step.
        const freshAgent = request.agent(app);
        const loginIp = nextFakeIp();
        const loginRes = await freshAgent
            .post("/login")
            .set("X-Forwarded-For", loginIp)
            .send({username: user.userCode, password: TEST_PASSWORD});
        expect(loginRes.body).toMatchObject({success: true, twoFactorRequired: true});

        const twoFaRes = await freshAgent
            .post("/login/2fa")
            .set("X-Forwarded-For", loginIp)
            .send({code: await generate({secret})});
        expect(twoFaRes.status).toBe(200);
        expect(twoFaRes.body).toMatchObject({success: true, redirectUrl: "/app"});

        const disableRes = await user.agent
            .post("/api/rest/user/2fa/disable")
            .set("X-Forwarded-For", nextFakeIp())
            .send({password: TEST_PASSWORD});
        expect(disableRes.status).toBe(200);
    });

    it("rejects enabling with an invalid code", async () => {
        const user = await createAuthenticatedUser(app);
        await user.agent.post("/api/rest/user/2fa/setup");

        const res = await user.agent
            .post("/api/rest/user/2fa/enable")
            .set("X-Forwarded-For", nextFakeIp())
            .send({code: "000000"});
        expect(res.status).toBe(401);
    });
});

describe("DELETE /user (account deletion)", () => {
    it("rejects the wrong password", async () => {
        const user = await createAuthenticatedUser(app);
        const res = await user.agent
            .delete("/api/rest/user")
            .set("X-Forwarded-For", nextFakeIp())
            .send({password: "WrongPassword1!"});
        expect(res.status).toBe(401);
    });

    it("deletes the account with the correct password", async () => {
        const user = await createAuthenticatedUser(app);
        const res = await user.agent
            .delete("/api/rest/user")
            .set("X-Forwarded-For", nextFakeIp())
            .send({password: TEST_PASSWORD});
        expect(res.status).toBe(302);

        const loginRes = await user.agent
            .post("/login")
            .set("X-Forwarded-For", nextFakeIp())
            .send({username: user.userCode, password: TEST_PASSWORD});
        expect(loginRes.status).toBe(401);
    });

    /**
     * THE CASCADE TRAP - the regression this whole change exists to prevent.
     *
     * Upstream's ten library-data foreign keys are ON DELETE CASCADE, which is
     * correct when a row belongs to one person. Under a shared library it means
     * deleting any account silently deletes every book that person ever
     * contributed - plus its stocks, files and loan history - out of the
     * collection everyone else is still using. Removing a member must not empty
     * the household's shelves.
     *
     * So `created_by` is nullable with ON DELETE SET NULL: the rows survive and
     * render as "added by a removed account".
     */
    it("leaves the departing account's contributions in the shared library", async () => {
        const leaver = await createAuthenticatedUser(app);
        const stayer = await createAuthenticatedUser(app);
        const stamp = Date.now();

        const bookId = (await leaver.agent.post("/api/rest/book").field("name", `Contributed Book ${stamp}`)).body;
        const locationId = (await leaver.agent.post("/api/rest/location").send({name: `Contributed Shelf ${stamp}`, description: ""})).body.id;
        const authorId = (await leaver.agent.post("/api/rest/author").send({name: `Contributed Author ${stamp}`})).body.id;
        const categoryId = (await leaver.agent.post("/api/rest/category").send({name: `Contributed Category ${stamp}`})).body.id;
        const customerId = (await leaver.agent.post("/api/rest/customer").send({name: `Contributed Customer ${stamp}`})).body.id;
        const groupId = (await leaver.agent.post("/api/rest/customer/group").send({name: `Contributed Group ${stamp}`})).body.id;

        const stockCode = (await leaver.agent
            .post(`/api/rest/book/${bookId}/stock`)
            .send({status: 0, location_id: locationId})).body.code;
        // A loan, so loan_history carries a row created by the leaving account too.
        await leaver.agent.post(`/api/rest/customer/${customerId}/add/books`).send({books: [stockCode]});
        await leaver.agent.put(`/api/rest/book/${bookId}`).send({name: `Contributed Book ${stamp}`, authors: [authorId]});

        const deleteRes = await leaver.agent
            .delete("/api/rest/user")
            .set("X-Forwarded-For", nextFakeIp())
            .send({password: TEST_PASSWORD});
        expect(deleteRes.status).toBe(302);

        // Everything is still there, and still reachable by the account that stayed.
        const bookRes = await stayer.agent.get(`/api/rest/book/${bookId}`);
        expect(bookRes.status).toBe(200);
        expect(bookRes.body).toMatchObject({id: bookId, name: `Contributed Book ${stamp}`});
        expect(bookRes.body.stocks.some((s: any) => s.code === stockCode)).toBe(true);
        expect(bookRes.body.authors).toEqual([{id: authorId, name: `Contributed Author ${stamp}`}]);

        expect((await stayer.agent.get("/api/rest/location")).body.some((l: any) => l.id === locationId)).toBe(true);
        expect((await stayer.agent.get("/api/rest/author")).body.some((a: any) => a.id === authorId)).toBe(true);
        expect((await stayer.agent.get("/api/rest/category")).body.some((c: any) => c.id === categoryId)).toBe(true);
        expect((await stayer.agent.get("/api/rest/customer")).body.customers.some((c: any) => c.id === customerId)).toBe(true);
        expect((await stayer.agent.get("/api/rest/customer/group")).body.some((g: any) => g.id === groupId)).toBe(true);

        // The rows survived with their attribution cleared, rather than the FK
        // having quietly been left as CASCADE and the account not really gone.
        const pool = appService.getDatabasePool();
        const {rows: userRows} = await pool.query("SELECT 1 FROM users WHERE code = $1", [leaver.userCode]);
        expect(userRows).toHaveLength(0);

        for (const [table, column, value] of [
            ["books", "id", bookId],
            ["locations", "id", locationId],
            ["authors", "id", authorId],
            ["categories", "id", categoryId],
            ["customers", "id", customerId],
            ["customer_groups", "id", groupId],
            ["book_stocks", "code", stockCode],
            ["book_authors", "book_id", bookId],
            ["loan_history", "stock_code", stockCode],
        ] as [string, string, any][]) {
            const {rows} = await pool.query(`SELECT created_by FROM ${table} WHERE ${column} = $1`, [value]);
            expect({table, rows: rows.length}).toEqual({table, rows: expect.any(Number)});
            expect(rows.length).toBeGreaterThan(0);
            for (const r of rows as any[]) {
                expect(r.created_by).toBeNull();
            }
        }
    });
});
