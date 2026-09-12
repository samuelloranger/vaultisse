import { describe, expect, it } from "bun:test";
import { appService } from "../../src/AppService";

/**
 * Password hashing, pinned across the bcrypt -> Bun.password swap.
 *
 * The failure this exists to prevent is total: every stored password in every
 * deployment was written by node `bcrypt`. If the replacement cannot read
 * those hashes, nobody can log in again and there is no way back short of a
 * password reset for every account.
 *
 * LEGACY_HASH below was produced by bcrypt@6 at 12 rounds before the swap, and
 * is checked in deliberately. It is not a fixture to be regenerated - the
 * moment it is re-minted with the new implementation it stops testing
 * anything, because it would then only prove the new code can read itself.
 */
describe("password hashing", () => {
    const LEGACY_PLAINTEXT = "legacy-secret-123";
    const LEGACY_HASH = "$2b$12$ju7I.wnlEpbrcSvxjFnBHuPfuLLgGN418tksWW22es6xO.fyKw5X6";

    it("verifies a hash written by the previous node bcrypt implementation", async () => {
        expect(await appService.comparePassword(LEGACY_PLAINTEXT, LEGACY_HASH)).toBe(true);
    });

    it("rejects the wrong password against a legacy hash", async () => {
        expect(await appService.comparePassword("not-the-password", LEGACY_HASH)).toBe(false);
    });

    it("still produces bcrypt hashes, so a rollback can read them", async () => {
        const hash = await appService.hashPassword("DevPass1!");
        // $2b$ = bcrypt, 12 = the cost this deployment has always used.
        expect(hash.startsWith("$2b$12$")).toBe(true);
    });

    it("round-trips a freshly created hash", async () => {
        const hash = await appService.hashPassword("DevPass1!");
        expect(await appService.comparePassword("DevPass1!", hash)).toBe(true);
        expect(await appService.comparePassword("DevPass2!", hash)).toBe(false);
    });

    it("salts, so the same password twice gives different hashes", async () => {
        const a = await appService.hashPassword("DevPass1!");
        const b = await appService.hashPassword("DevPass1!");
        expect(a).not.toBe(b);
        expect(await appService.comparePassword("DevPass1!", b)).toBe(true);
    });
});
