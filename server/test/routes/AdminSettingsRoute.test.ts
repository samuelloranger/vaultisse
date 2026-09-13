/**
 * /api/rest/admin/settings - the single-row `app_settings` table.
 *
 * The first test in this file is the reason the route exists. Lending used to
 * be `PATCH /user/leasing` behind `requireAuth`, so any member of the instance
 * could add or remove the Loans and Customers nav entries for everybody else.
 * Hiding the card in the client would not have fixed that; only the server can.
 *
 * NOTE ON SHARED STATE: every test file runs serially against one database (see
 * test/setup/preload.ts) and `app_settings` has exactly one row, so these tests
 * write a setting and assert on it in the same test rather than assuming what
 * it was on arrival. The registration-defaults test restores what it found,
 * because POST /register in every *other* file reads this same row.
 */
import request from "supertest";
import { setupTestApp } from "../helpers/testApp";
import { createAuthenticatedUser, ITestUser } from "../helpers/auth";
import { appService } from "../../src/AppService";

const app = setupTestApp();

const SETTINGS = "/api/rest/admin/settings";

async function idOf(user: ITestUser): Promise<number> {
    const { rows } = await appService.getDatabasePool().query("SELECT id FROM users WHERE code = $1", [user.userCode]);
    return rows[0].id;
}

/** A logged-in admin: a normal registered account, promoted afterwards. */
async function createAdmin(): Promise<ITestUser & { id: number }> {
    const user = await createAuthenticatedUser(app, "Settings Admin");
    const id = await idOf(user);
    await appService.getDatabasePool().query("UPDATE users SET role = 'admin' WHERE id = $1", [id]);
    return { ...user, id };
}

async function settingsRow(): Promise<Record<string, any>> {
    const { rows } = await appService.getDatabasePool().query("SELECT * FROM app_settings");
    expect(rows).toHaveLength(1);
    return rows[0];
}

describe("instance settings access control", () => {
    it("refuses an authenticated non-admin with 403 on read and write", async () => {
        const plain = await createAuthenticatedUser(app);

        expect((await plain.agent.get(SETTINGS)).status).toBe(403);

        const write = await plain.agent.patch(SETTINGS).send({ leasingEnabled: true });
        expect(write.status).toBe(403);
        // A refusal that still wrote would be the whole bug, restated.
        expect(write.body.sessionExpired).toBeUndefined();
    });

    it("does not let a non-admin change what everyone else sees", async () => {
        const admin = await createAdmin();
        const plain = await createAuthenticatedUser(app);

        await admin.agent.patch(SETTINGS).send({ leasingEnabled: false });
        await plain.agent.patch(SETTINGS).send({ leasingEnabled: true });

        expect((await settingsRow()).leasing_enabled).toBe(false);
        // ...and the nav the non-admin was trying to move is still where the
        // admin left it, for the non-admin too.
        expect((await plain.agent.get("/api/rest/app/policy")).body.user.leasingEnabled).toBe(false);
    });

    it("answers 401 rather than 403 with no session at all", async () => {
        const res = await request(app).get(SETTINGS);

        expect(res.status).toBe(401);
        expect(res.body).toMatchObject({ sessionExpired: true });
    });
});

describe("GET /admin/settings", () => {
    it("reports the row plus where the approval flag is coming from", async () => {
        const admin = await createAdmin();
        const res = await admin.agent.get(SETTINGS);

        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({
            leasingEnabled: expect.any(Boolean),
            registrationRequiresApproval: expect.any(Boolean),
            registrationApprovalFromEnv: expect.any(Boolean),
            defaultLanguage: expect.any(String),
            defaultRegion: expect.any(String),
            defaultTheme: expect.any(String),
        });
    });
});

describe("PATCH /admin/settings", () => {
    it("is an instance setting - one admin's toggle moves every account's policy", async () => {
        const admin = await createAdmin();
        const plain = await createAuthenticatedUser(app);

        await admin.agent.patch(SETTINGS).send({ leasingEnabled: true });
        expect((await plain.agent.get("/api/rest/app/policy")).body.user.leasingEnabled).toBe(true);

        await admin.agent.patch(SETTINGS).send({ leasingEnabled: false });
        expect((await plain.agent.get("/api/rest/app/policy")).body.user.leasingEnabled).toBe(false);

        // ...and it really is the one app_settings row behind it.
        expect((await settingsRow()).leasing_enabled).toBe(false);

        await admin.agent.patch(SETTINGS).send({ leasingEnabled: true });
    });

    it("rejects an empty body and every invalid value", async () => {
        const admin = await createAdmin();

        expect((await admin.agent.patch(SETTINGS).send({})).status).toBe(400);
        expect((await admin.agent.patch(SETTINGS).send({ leasingEnabled: "yes" })).status).toBe(400);
        expect((await admin.agent.patch(SETTINGS).send({ registrationRequiresApproval: 1 })).status).toBe(400);
        // Not a row in app_languages - the column carries a FK to it, so this
        // has to be a 400 rather than a constraint violation surfacing as 500.
        expect((await admin.agent.patch(SETTINGS).send({ defaultLanguage: "zz" })).status).toBe(400);
        expect((await admin.agent.patch(SETTINGS).send({ defaultRegion: "canada" })).status).toBe(400);
        expect((await admin.agent.patch(SETTINGS).send({ defaultTheme: "midnight" })).status).toBe(400);
    });

    it("records who changed what", async () => {
        const admin = await createAdmin();
        await admin.agent.patch(SETTINGS).send({ defaultRegion: "CA" });

        const { rows } = await appService.getDatabasePool().query(
            `SELECT actor_id, action, entity_type, entity_id, metadata
               FROM activity_log
              WHERE entity_type = 'app_settings' AND actor_id = $1
              ORDER BY id DESC
              LIMIT 1`,
            [admin.id]
        );

        expect(rows[0]).toMatchObject({
            action: "instance_settings_changed",
            entity_id: 1,
        });
        expect(rows[0].metadata).toMatchObject({ defaultRegion: "CA" });

        await admin.agent.patch(SETTINGS).send({ defaultRegion: "US" });
    });

    /**
     * The point of moving these out of .env: a new account's starting language,
     * region and theme are what the instance says they are, not what the
     * `users` column defaults say.
     */
    it("hands the registration defaults to the next account that registers", async () => {
        const admin = await createAdmin();
        const before = await settingsRow();

        const res = await admin.agent.patch(SETTINGS).send({
            defaultLanguage: "es",
            defaultRegion: "CA",
            defaultTheme: "library",
        });
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({
            defaultLanguage: "es",
            defaultRegion: "CA",
            defaultTheme: "library",
        });

        const newcomer = await createAuthenticatedUser(app);
        expect((await newcomer.agent.get("/api/rest/app/policy")).body.user).toMatchObject({
            language: "es",
            region: "CA",
            theme: "library",
        });

        // An existing account keeps what it had. A default describes the next
        // account to arrive, never the ones already here.
        expect((await admin.agent.get("/api/rest/app/policy")).body.user).toMatchObject({
            language: before.default_language,
            region: before.default_region,
        });

        // Put the row back: every other file's registrations read it too.
        await admin.agent.patch(SETTINGS).send({
            defaultLanguage: before.default_language,
            defaultRegion: before.default_region,
            defaultTheme: before.default_theme,
        });
    });

    /**
     * Writing the toggle takes the decision away from the environment variable
     * for good - `registration_requires_approval` stops being NULL, and
     * `registrationApprovalFromEnv` says so.
     */
    it("takes registration approval away from the env var once it is set", async () => {
        const admin = await createAdmin();
        const before = await settingsRow();

        const off = await admin.agent.patch(SETTINGS).send({ registrationRequiresApproval: false });
        expect(off.body).toMatchObject({
            registrationRequiresApproval: false,
            registrationApprovalFromEnv: false,
        });
        expect((await settingsRow()).registration_requires_approval).toBe(false);

        const on = await admin.agent.patch(SETTINGS).send({ registrationRequiresApproval: true });
        expect(on.body).toMatchObject({ registrationRequiresApproval: true });

        // A registration now arrives disabled, without anybody restarting
        // anything - which is the entire reason this left .env.
        const held = await createAuthenticatedUser(app).catch((err: Error) => err);
        expect(held).toBeInstanceOf(Error);

        await admin.agent
            .patch(SETTINGS)
            .send({ registrationRequiresApproval: before.registration_requires_approval ?? false });
    });
});
