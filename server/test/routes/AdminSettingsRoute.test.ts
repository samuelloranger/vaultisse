/**
 * /api/rest/admin/settings - the single-row `app_settings` table.
 *
 * The first tests in this file are the reason the route exists. Lending used to
 * be `PATCH /user/leasing` behind `requireAuth`, so any member of the instance
 * could add or remove the Loans and Customers nav entries for everybody else.
 * Hiding the card in the client would not have fixed that; only the server can.
 *
 * NOTE ON SHARED STATE: every test file runs serially against one database (see
 * test/setup/preload.ts) and `app_settings` has exactly one row, so these tests
 * write a setting and assert on it in the same test rather than assuming what
 * it was on arrival.
 */
import request from "supertest";
import {setupTestApp} from "../helpers/testApp";
import {createAuthenticatedUser, ITestUser} from "../helpers/auth";
import {appService} from "../../src/AppService";

const app = setupTestApp();

const SETTINGS = "/api/rest/admin/settings";

async function idOf(user: ITestUser): Promise<number> {
    const {rows} = await appService.getDatabasePool().query("SELECT id FROM users WHERE code = $1", [user.userCode]);
    return rows[0].id;
}

/** A logged-in admin: a normal registered account, promoted afterwards. */
async function createAdmin(): Promise<ITestUser & {id: number}> {
    const user = await createAuthenticatedUser(app, "Settings Admin");
    const id = await idOf(user);
    await appService.getDatabasePool().query("UPDATE users SET role = 'admin' WHERE id = $1", [id]);
    return {...user, id};
}

async function settingsRow(): Promise<Record<string, any>> {
    const {rows} = await appService.getDatabasePool().query("SELECT * FROM app_settings");
    expect(rows).toHaveLength(1);
    return rows[0];
}

describe("instance settings access control", () => {
    it("refuses an authenticated non-admin with 403 on read and write", async () => {
        const plain = await createAuthenticatedUser(app);

        expect((await plain.agent.get(SETTINGS)).status).toBe(403);

        const write = await plain.agent.patch(SETTINGS).send({leasingEnabled: true});
        expect(write.status).toBe(403);
        // Not a session problem: logging back in would not help, so the client
        // must not be told to.
        expect(write.body.sessionExpired).toBeUndefined();
    });

    it("does not let a non-admin change what everyone else sees", async () => {
        const admin = await createAdmin();
        const plain = await createAuthenticatedUser(app);

        await admin.agent.patch(SETTINGS).send({leasingEnabled: false});
        await plain.agent.patch(SETTINGS).send({leasingEnabled: true});

        expect((await settingsRow()).leasing_enabled).toBe(false);
        // ...and the nav the non-admin was trying to move is still where the
        // admin left it, for the non-admin too.
        expect((await plain.agent.get("/api/rest/app/policy")).body.user.leasingEnabled).toBe(false);
    });

    it("answers 401 rather than 403 with no session at all", async () => {
        const res = await request(app).get(SETTINGS);

        expect(res.status).toBe(401);
        expect(res.body).toMatchObject({sessionExpired: true});
    });
});

describe("GET /admin/settings", () => {
    it("reports the row", async () => {
        const admin = await createAdmin();
        const res = await admin.agent.get(SETTINGS);

        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({leasingEnabled: expect.any(Boolean)});
    });
});

describe("PATCH /admin/settings", () => {
    it("is an instance setting - one admin's toggle moves every account's policy", async () => {
        const admin = await createAdmin();
        const plain = await createAuthenticatedUser(app);

        await admin.agent.patch(SETTINGS).send({leasingEnabled: true});
        expect((await plain.agent.get("/api/rest/app/policy")).body.user.leasingEnabled).toBe(true);

        await admin.agent.patch(SETTINGS).send({leasingEnabled: false});
        expect((await plain.agent.get("/api/rest/app/policy")).body.user.leasingEnabled).toBe(false);

        // ...and it really is the one app_settings row behind it.
        expect((await settingsRow()).leasing_enabled).toBe(false);

        await admin.agent.patch(SETTINGS).send({leasingEnabled: true});
    });

    it("rejects an empty body and an invalid value", async () => {
        const admin = await createAdmin();

        expect((await admin.agent.patch(SETTINGS).send({})).status).toBe(400);
        expect((await admin.agent.patch(SETTINGS).send({leasingEnabled: "yes"})).status).toBe(400);
    });

    it("records who changed what", async () => {
        const admin = await createAdmin();
        await admin.agent.patch(SETTINGS).send({leasingEnabled: true});

        const {rows} = await appService.getDatabasePool().query(
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
        expect(rows[0].metadata).toMatchObject({leasingEnabled: true});
    });
});
