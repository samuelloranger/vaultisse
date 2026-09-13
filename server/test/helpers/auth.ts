/**
 * Creates a fresh, real user account (via the actual POST /register + POST
 * /login flow - not a DB shortcut) and returns a `supertest` agent that
 * carries its session cookie on every subsequent request, the same way a
 * logged-in browser tab would.
 *
 * POST /login and /register share one rate limiter (5 requests / 5 minutes
 * per IP - see `authLimiter` in AuthRoute.ts). Since TRUST_PROXY=true in
 * tests (see test/setup/testEnv.js), each call here spoofs its own
 * `X-Forwarded-For` IP so many tests can each register+log in without ever
 * sharing - and so tripping - that limiter's bucket.
 */
import request from "supertest";
import { Express } from "express";

let ipCounter = 0;

/**
 * A fresh, unique fake source IP each call - exported so tests that exercise
 * `/register` or `/login` directly (rather than through
 * `createAuthenticatedUser` below) can still give each attempt its own
 * `authLimiter` bucket via `X-Forwarded-For`.
 */
export function nextFakeIp(): string {
    ipCounter += 1;
    return `10.${(ipCounter >> 16) & 255}.${(ipCounter >> 8) & 255}.${ipCounter & 255}`;
}

export interface ITestUser {
    /** Carries the session cookie automatically on every request made with it. */
    agent: ReturnType<typeof request.agent>;
    userCode: string;
    email: string;
    password: string;
    name: string;
}

/** A password meeting AuthRoute's register rules (8+ chars, uppercase, digit, special char). */
export const TEST_PASSWORD = "Test1234!";

export async function createAuthenticatedUser(app: Express, name = "Test User"): Promise<ITestUser> {
    const ip = nextFakeIp();
    const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const userCode = `test_${suffix}`;
    const email = `${userCode}@example.com`;
    const password = TEST_PASSWORD;

    const agent = request.agent(app);

    const registerRes = await agent
        .post("/register")
        .set("X-Forwarded-For", ip)
        .send({ userName: userCode, email, name, password });

    if (registerRes.status !== 201 && registerRes.status !== 200) {
        throw new Error(`Failed to register test user: ${registerRes.status} ${JSON.stringify(registerRes.body)}`);
    }

    const loginRes = await agent.post("/login").set("X-Forwarded-For", ip).send({ username: userCode, password });

    if (loginRes.status !== 200 || !loginRes.body.success) {
        throw new Error(`Failed to log in test user: ${loginRes.status} ${JSON.stringify(loginRes.body)}`);
    }

    return { agent, userCode, email, password, name };
}
