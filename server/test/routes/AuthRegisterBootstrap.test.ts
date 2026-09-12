/**
 * POST /register - the first-account bootstrap.
 *
 * The first account to register on an instance becomes `role = 'admin'`;
 * without that, a fresh install has no admin, the admin panel is unreachable
 * for everybody, and the only way to make one is the hand-written UPDATE that
 * the panel exists to replace.
 *
 * WHY THIS FILE HAS ITS OWN DATABASE: "is this the first account?" is a
 * question about an empty `users` table, and the shared test database (see
 * test/setup/globalSetup.js) has accounts in it from whichever files ran
 * before this one - file execution order isn't something a test may assume.
 * So this file creates its own database from the real schema, points a
 * freshly-required `AppService` at it (hence the `require` inside `beforeAll`
 * rather than a top-level import - the singleton reads DB_NAME when the
 * module is first loaded), and drops it again afterwards.
 */
import request from "supertest";
import fs from "fs";
import path from "path";
import {Client} from "pg";
import {nextFakeIp, TEST_PASSWORD} from "../helpers/auth";

const {getTestDbConfig} = require("../setup/testDbConfig");

const config = getTestDbConfig();
const BOOTSTRAP_DB = `${config.database}_bootstrap`;
const SCHEMA_PATH = path.join(__dirname, "..", "..", "..", "assets", "db", "databaseSchema.sql");

let app: any;
let appService: any;
let previousDbName: string | undefined;
let previousApproval: string | undefined;

async function adminClient(): Promise<Client> {
    const client = new Client({...config, database: "postgres"});
    await client.connect();
    return client;
}

/** Registers one account, each attempt from its own IP so the 5/5min limiter never fires. */
function register(suffix: string) {
    return request(app)
        .post("/register")
        .set("X-Forwarded-For", nextFakeIp())
        .send({
            userName: `bootstrap_${suffix}`,
            email: `bootstrap_${suffix}@example.com`,
            name: `Bootstrap ${suffix}`,
            password: TEST_PASSWORD,
        });
}

async function accounts(): Promise<Record<string, any>[]> {
    const {rows} = await appService.getDatabasePool().query(
        "SELECT code, role, disabled FROM users ORDER BY id"
    );
    return rows;
}

beforeAll(async () => {
    const admin = await adminClient();
    await admin.query(`DROP DATABASE IF EXISTS "${BOOTSTRAP_DB}"`);
    await admin.query(`CREATE DATABASE "${BOOTSTRAP_DB}"`);
    await admin.end();

    const db = new Client({...config, database: BOOTSTRAP_DB});
    await db.connect();
    await db.query(fs.readFileSync(SCHEMA_PATH, "utf-8"));
    await db.end();

    previousDbName = process.env.DB_NAME;
    // Deliberately ON for the whole file: the bootstrap account has to be
    // usable even when approval is required, since there is nobody to approve
    // it yet (see the comment on the INSERT in AuthRoute.ts).
    previousApproval = process.env.REGISTRATION_REQUIRES_APPROVAL;
    process.env.DB_NAME = BOOTSTRAP_DB;
    process.env.REGISTRATION_REQUIRES_APPROVAL = "true";

    appService = require("../../src/AppService").appService;
    appService.init();
    app = appService.getApp();
});

afterAll(async () => {
    await new Promise<void>((resolve) => appService.getServer()?.close(() => resolve()));
    await appService.getDatabasePool().end();

    process.env.DB_NAME = previousDbName;
    process.env.REGISTRATION_REQUIRES_APPROVAL = previousApproval;

    const admin = await adminClient();
    await admin.query(
        "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()",
        [BOOTSTRAP_DB]
    );
    await admin.query(`DROP DATABASE IF EXISTS "${BOOTSTRAP_DB}"`);
    await admin.end();
});

describe("POST /register on a brand-new instance", () => {
    it("makes the first account an enabled admin and the second a plain user", async () => {
        const first = await register("first");
        expect(first.status).toBe(201);
        // Not held for approval, even though REGISTRATION_REQUIRES_APPROVAL is
        // on - there is no admin yet who could ever approve it.
        expect(first.body).toMatchObject({success: true, requiresApproval: false});

        const second = await register("second");
        expect(second.status).toBe(201);
        expect(second.body).toMatchObject({success: true, requiresApproval: true});

        expect(await accounts()).toEqual([
            {code: "bootstrap_first", role: "admin", disabled: false},
            {code: "bootstrap_second", role: "user", disabled: true},
        ]);

        // The bootstrap admin can actually log in and use the panel it was
        // created for - the whole point of not disabling it above.
        const agent = request.agent(app);
        const loginRes = await agent
            .post("/login")
            .set("X-Forwarded-For", nextFakeIp())
            .send({username: "bootstrap_first", password: TEST_PASSWORD});
        expect(loginRes.status).toBe(200);
        expect((await agent.get("/api/rest/admin/users")).status).toBe(200);
        expect((await agent.get("/api/rest/app/policy")).body.user).toMatchObject({role: "admin", isAdmin: true});
    });

    it("promotes exactly one of two simultaneous first registrations", async () => {
        await appService.getDatabasePool().query("TRUNCATE users RESTART IDENTITY CASCADE");

        // Both requests are in flight before either commits. Decided in JS -
        // "count the users, then insert" - they would each see an empty table
        // and both come out admin; the advisory lock in AuthRoute.ts is what
        // makes the loser wait and then see the winner's row.
        const [a, b] = await Promise.all([register("race_a"), register("race_b")]);
        expect([a.status, b.status]).toEqual([201, 201]);

        const rows = await accounts();
        expect(rows).toHaveLength(2);
        expect(rows.filter((r) => r.role === "admin")).toHaveLength(1);
        // ...and the one that lost the race is a normal, approval-gated account.
        expect(rows.filter((r) => r.role === "user" && r.disabled === true)).toHaveLength(1);
    });
});
