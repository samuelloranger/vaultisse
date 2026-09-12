/**
 * /api/rest/admin/users - account administration.
 *
 * The interesting assertions here are the refusals. The admin panel hides the
 * buttons for the things below, but hiding a button is a cosmetic preference;
 * these tests exist to prove the server refuses them on its own, since this
 * resource is the entire access-control model of the instance.
 *
 * NOTE ON SHARED STATE: every test file in this suite runs serially against
 * one database (see test/setup/globalSetup.js), so "is this the last admin on
 * the instance?" is a question about accounts other files created too. Tests
 * that depend on that answer call `makeOnlyAdmin`, which demotes everyone else
 * first. The separate question of who becomes admin on a *brand-new* instance
 * needs a genuinely empty `users` table and so lives in its own file against
 * its own database - see AuthRegisterBootstrap.test.ts.
 */
import request from "supertest";
import {setupTestApp} from "../helpers/testApp";
import {createAuthenticatedUser, ITestUser, nextFakeIp, TEST_PASSWORD} from "../helpers/auth";
import {appService} from "../../src/AppService";

const app = setupTestApp();

const ADMIN_USERS = "/api/rest/admin/users";

/** DB id of a test account, which `createAuthenticatedUser` doesn't expose. */
async function idOf(user: ITestUser): Promise<number> {
    const {rows} = await appService.getDatabasePool().query("SELECT id FROM users WHERE code = $1", [user.userCode]);
    return rows[0].id;
}

async function roleOf(userId: number): Promise<string> {
    const {rows} = await appService.getDatabasePool().query("SELECT role FROM users WHERE id = $1", [userId]);
    return rows[0]?.role;
}

/** Promotes `userId`, leaving any other admins on the instance alone. */
async function promote(userId: number): Promise<void> {
    await appService.getDatabasePool().query("UPDATE users SET role = 'admin' WHERE id = $1", [userId]);
}

/**
 * Makes `userId` the one and only usable admin on the instance - the
 * precondition for every "last admin" guard rail below.
 */
async function makeOnlyAdmin(userId: number): Promise<void> {
    const pool = appService.getDatabasePool();
    await pool.query("UPDATE users SET role = 'user' WHERE id <> $1", [userId]);
    await pool.query("UPDATE users SET role = 'admin' WHERE id = $1", [userId]);
}

/** A logged-in admin: a normal registered account, promoted afterwards. */
async function createAdmin(exclusive = false): Promise<ITestUser & {id: number}> {
    const user = await createAuthenticatedUser(app, "Admin User");
    const id = await idOf(user);
    if (exclusive) {
        await makeOnlyAdmin(id);
    } else {
        await promote(id);
    }
    return {...user, id};
}

/** The `activity_log` rows an admin action left behind for one target account. */
async function activityFor(targetId: number): Promise<Record<string, any>[]> {
    const {rows} = await appService.getDatabasePool().query(
        `SELECT actor_id, action, entity_type, entity_id, metadata
           FROM activity_log
          WHERE entity_type = 'user' AND entity_id = $1
          ORDER BY id`,
        [targetId]
    );
    return rows;
}

describe("admin surface access control", () => {
    it("refuses an authenticated non-admin with 403 on every endpoint", async () => {
        const admin = await createAdmin();
        const plain = await createAuthenticatedUser(app);
        const victimId = await idOf(await createAuthenticatedUser(app));

        const responses = [
            await plain.agent.get(ADMIN_USERS),
            await plain.agent.patch(`${ADMIN_USERS}/${victimId}`).send({disabled: true}),
            await plain.agent.delete(`${ADMIN_USERS}/${victimId}`),
        ];

        for (const res of responses) {
            expect(res.status).toBe(403);
            // Not 401: their session is perfectly valid, so the client must
            // NOT treat this as an expired session and bounce them to /login.
            expect(res.body.sessionExpired).toBeUndefined();
        }

        // ...and nothing happened to the account they aimed at.
        const {rows} = await appService.getDatabasePool().query("SELECT disabled FROM users WHERE id = $1", [victimId]);
        expect(rows[0].disabled).toBe(false);
        expect(admin.id).toBeGreaterThan(0);
    });

    it("refuses an unauthenticated caller with 401 on every endpoint", async () => {
        const responses = [
            await request(app).get(ADMIN_USERS),
            await request(app).patch(`${ADMIN_USERS}/1`).send({disabled: true}),
            await request(app).delete(`${ADMIN_USERS}/1`),
        ];

        for (const res of responses) {
            expect(res.status).toBe(401);
            expect(res.body).toMatchObject({sessionExpired: true});
        }
    });

    it("refuses a session whose account was demoted after it logged in", async () => {
        const admin = await createAdmin();
        expect((await admin.agent.get(ADMIN_USERS)).status).toBe(200);

        // The role is read from the DB per request, not carried in the JWT -
        // a demotion must not wait for the token to expire.
        await appService.getDatabasePool().query("UPDATE users SET role = 'user' WHERE id = $1", [admin.id]);

        expect((await admin.agent.get(ADMIN_USERS)).status).toBe(403);
    });
});

describe("GET /admin/users", () => {
    it("lists accounts without leaking any secret", async () => {
        const admin = await createAdmin();
        const other = await createAuthenticatedUser(app, "Listed User");

        const res = await admin.agent.get(ADMIN_USERS);
        expect(res.status).toBe(200);

        const listed = res.body.find((u: any) => u.code === other.userCode);
        expect(listed).toMatchObject({
            code: other.userCode,
            name: "Listed User",
            email: other.email,
            role: "user",
            disabled: false,
            isSelf: false,
        });
        expect(listed.createdDate).toBeTruthy();
        expect(listed.lastLoginDate).toBeTruthy();

        expect(res.body.find((u: any) => u.code === admin.userCode).isSelf).toBe(true);

        for (const account of res.body) {
            expect(account.password).toBeUndefined();
            expect(account.totp_secret).toBeUndefined();
            expect(account.totpSecret).toBeUndefined();
            expect(account.image).toBeUndefined();
        }
    });
});

describe("PATCH /admin/users/:id", () => {
    it("disables an account and kills its live session on the next request", async () => {
        const admin = await createAdmin();
        const victim = await createAuthenticatedUser(app);
        const victimId = await idOf(victim);

        // Their session works right now.
        expect((await victim.agent.get("/api/rest/app/policy")).status).toBe(200);

        const res = await admin.agent.patch(`${ADMIN_USERS}/${victimId}`).send({disabled: true});
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({id: victimId, disabled: true});

        // Same cookie, very next request: dead.
        const afterRes = await victim.agent.get("/api/rest/app/policy");
        expect(afterRes.status).toBe(401);
        expect(afterRes.body).toMatchObject({sessionExpired: true});

        // And they can't log back in while disabled.
        const loginRes = await victim.agent
            .post("/login")
            .set("X-Forwarded-For", nextFakeIp())
            .send({username: victim.userCode, password: TEST_PASSWORD});
        expect(loginRes.status).toBe(401);

        expect(await activityFor(victimId)).toEqual([
            expect.objectContaining({
                actor_id: admin.id,
                action: "user_disabled",
                entity_type: "user",
                entity_id: victimId,
            }),
        ]);
    });

    it("re-enables an account without resurrecting the sessions it had when disabled", async () => {
        const admin = await createAdmin();
        const victim = await createAuthenticatedUser(app);
        const victimId = await idOf(victim);

        await admin.agent.patch(`${ADMIN_USERS}/${victimId}`).send({disabled: true});
        const enableRes = await admin.agent.patch(`${ADMIN_USERS}/${victimId}`).send({disabled: false});
        expect(enableRes.status).toBe(200);
        expect(enableRes.body).toMatchObject({disabled: false});

        // The old cookie stays dead - token_version moved on. Re-enabling an
        // account must not hand back the tokens it held when it was disabled.
        expect((await victim.agent.get("/api/rest/app/policy")).status).toBe(401);

        // A fresh login works again, which is what "approved" has to mean.
        const loginRes = await victim.agent
            .post("/login")
            .set("X-Forwarded-For", nextFakeIp())
            .send({username: victim.userCode, password: TEST_PASSWORD});
        expect(loginRes.status).toBe(200);
        expect((await victim.agent.get("/api/rest/app/policy")).status).toBe(200);

        expect((await activityFor(victimId)).map((r) => r.action)).toEqual(["user_disabled", "user_enabled"]);
    });

    it("promotes and demotes another account", async () => {
        const admin = await createAdmin();
        const other = await createAuthenticatedUser(app);
        const otherId = await idOf(other);

        const promoteRes = await admin.agent.patch(`${ADMIN_USERS}/${otherId}`).send({role: "admin"});
        expect(promoteRes.status).toBe(200);
        expect(promoteRes.body).toMatchObject({role: "admin"});
        // Live, on their existing session - no re-login needed.
        expect((await other.agent.get(ADMIN_USERS)).status).toBe(200);
        expect((await other.agent.get("/api/rest/app/policy")).body.user).toMatchObject({role: "admin", isAdmin: true});

        const demoteRes = await admin.agent.patch(`${ADMIN_USERS}/${otherId}`).send({role: "user"});
        expect(demoteRes.status).toBe(200);
        expect((await other.agent.get(ADMIN_USERS)).status).toBe(403);

        expect((await activityFor(otherId)).map((r) => r.action))
            .toEqual(["user_role_changed", "user_role_changed"]);
        expect((await activityFor(otherId))[1].metadata).toMatchObject({from: "admin", to: "user"});
    });

    it("refuses to demote yourself", async () => {
        const admin = await createAdmin();
        await createAdmin(); // a second admin, so this isn't the last-admin rule firing

        const res = await admin.agent.patch(`${ADMIN_USERS}/${admin.id}`).send({role: "user"});
        expect(res.status).toBe(403);
        expect(res.body.message).toMatch(/your own role/i);
        expect(await roleOf(admin.id)).toBe("admin");
    });

    it("refuses to disable yourself", async () => {
        const admin = await createAdmin();
        await createAdmin();

        const res = await admin.agent.patch(`${ADMIN_USERS}/${admin.id}`).send({disabled: true});
        expect(res.status).toBe(403);
        expect(res.body.message).toMatch(/your own account/i);
        expect((await admin.agent.get(ADMIN_USERS)).status).toBe(200);
    });

    it("refuses to demote the last admin", async () => {
        const admin = await createAdmin(true);

        const res = await admin.agent.patch(`${ADMIN_USERS}/${admin.id}`).send({role: "user"});
        expect(res.status).toBe(403);
        expect(res.body.message).toMatch(/only administrator/i);
        expect(await roleOf(admin.id)).toBe("admin");
    });

    it("refuses to disable the last admin", async () => {
        const admin = await createAdmin(true);

        const res = await admin.agent.patch(`${ADMIN_USERS}/${admin.id}`).send({disabled: true});
        expect(res.status).toBe(403);
        expect(res.body.message).toMatch(/only administrator/i);
        // Still usable - the refusal didn't half-apply.
        expect((await admin.agent.get(ADMIN_USERS)).status).toBe(200);
    });

    it("validates its input", async () => {
        const admin = await createAdmin();
        const other = await createAuthenticatedUser(app);
        const otherId = await idOf(other);

        expect((await admin.agent.patch(`${ADMIN_USERS}/${otherId}`).send({})).status).toBe(400);
        expect((await admin.agent.patch(`${ADMIN_USERS}/${otherId}`).send({role: "superuser"})).status).toBe(400);
        expect((await admin.agent.patch(`${ADMIN_USERS}/${otherId}`).send({disabled: "yes"})).status).toBe(400);
        expect((await admin.agent.patch(`${ADMIN_USERS}/not-a-number`).send({disabled: true})).status).toBe(400);
        expect((await admin.agent.patch(`${ADMIN_USERS}/999999`).send({disabled: true})).status).toBe(404);
    });
});

describe("DELETE /admin/users/:id", () => {
    it("refuses to delete yourself", async () => {
        const admin = await createAdmin();
        await createAdmin();

        const res = await admin.agent.delete(`${ADMIN_USERS}/${admin.id}`);
        expect(res.status).toBe(403);
        expect(res.body.message).toMatch(/your own account/i);
        expect((await admin.agent.get(ADMIN_USERS)).status).toBe(200);
    });

    it("refuses to delete the last admin", async () => {
        const admin = await createAdmin(true);

        const res = await admin.agent.delete(`${ADMIN_USERS}/${admin.id}`);
        expect(res.status).toBe(403);
        expect(res.body.message).toMatch(/only administrator/i);
        expect(await roleOf(admin.id)).toBe("admin");
    });

    it("rejects an unknown or malformed id", async () => {
        const admin = await createAdmin();
        expect((await admin.agent.delete(`${ADMIN_USERS}/999999`)).status).toBe(404);
        expect((await admin.agent.delete(`${ADMIN_USERS}/not-a-number`)).status).toBe(400);
    });

    /**
     * THE CASCADE TRAP, from the admin side.
     *
     * UserRoute.test.ts already covers an account deleting *itself*; this is
     * the same invariant reached through the admin panel, which is how it will
     * actually happen most of the time. Under a shared library, removing a
     * member must not take the household's books with them - the ten library
     * foreign keys are `created_by ... ON DELETE SET NULL`, so the rows survive
     * with their attribution cleared.
     */
    it("deletes an account, keeps its books, and kills its session", async () => {
        const admin = await createAdmin();
        const leaver = await createAuthenticatedUser(app);
        const leaverId = await idOf(leaver);
        const stamp = Date.now();

        const bookId = (await leaver.agent.post("/api/rest/book").field("name", `Admin Deleted Book ${stamp}`)).body;
        const authorId = (await leaver.agent.post("/api/rest/author").send({name: `Admin Deleted Author ${stamp}`})).body.id;
        await leaver.agent.put(`/api/rest/book/${bookId}`).send({name: `Admin Deleted Book ${stamp}`, authors: [authorId]});

        const res = await admin.agent.delete(`${ADMIN_USERS}/${leaverId}`);
        expect(res.status).toBe(200);

        // Gone...
        const pool = appService.getDatabasePool();
        expect((await pool.query("SELECT 1 FROM users WHERE id = $1", [leaverId])).rowCount).toBe(0);
        // ...and their live session with it, on its very next request.
        const afterRes = await leaver.agent.get("/api/rest/app/policy");
        expect(afterRes.status).toBe(401);
        expect(afterRes.body).toMatchObject({sessionExpired: true});
        expect((await pool.query("SELECT 1 FROM user_sessions WHERE user_id = $1", [leaverId])).rowCount).toBe(0);

        // ...but the shared library keeps everything they contributed.
        const bookRes = await admin.agent.get(`/api/rest/book/${bookId}`);
        expect(bookRes.status).toBe(200);
        expect(bookRes.body).toMatchObject({id: bookId, name: `Admin Deleted Book ${stamp}`});
        expect(bookRes.body.authors).toEqual([{id: authorId, name: `Admin Deleted Author ${stamp}`}]);

        for (const [table, column, value] of [
            ["books", "id", bookId],
            ["authors", "id", authorId],
            ["book_authors", "book_id", bookId],
        ] as [string, string, any][]) {
            const {rows} = await pool.query(`SELECT created_by FROM ${table} WHERE ${column} = $1`, [value]);
            expect(rows.length).toBeGreaterThan(0);
            for (const r of rows as any[]) {
                expect(r.created_by).toBeNull();
            }
        }

        // The audit trail outlives the account it describes: entity_id now
        // points at nothing, so the code in metadata is what keeps it readable.
        expect(await activityFor(leaverId)).toEqual([
            expect.objectContaining({
                actor_id: admin.id,
                action: "user_deleted",
                metadata: expect.objectContaining({targetCode: leaver.userCode}),
            }),
        ]);
    });
});

describe("admin actions and the user's own security feed", () => {
    it("keeps admin actions out of Settings > Recent logins", async () => {
        const admin = await createAdmin();
        const victim = await createAuthenticatedUser(app);
        const victimId = await idOf(victim);

        await admin.agent.patch(`${ADMIN_USERS}/${victimId}`).send({role: "admin"});
        await admin.agent.patch(`${ADMIN_USERS}/${victimId}`).send({role: "user"});

        // The admin's own feed is auth events only, even though they are the
        // actor on the two rows just written.
        const res = await admin.agent.get("/api/rest/user/activity");
        expect(res.status).toBe(200);
        expect(res.body.length).toBeGreaterThan(0);
        for (const entry of res.body) {
            expect(["login", "login_failed", "logout", "password_changed"]).toContain(entry.action);
        }
    });
});
