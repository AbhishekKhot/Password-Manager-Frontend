import { describe, it, expect } from "vitest";
import { validateMasterPassword } from "./passwordPolicy";

/**
 * Master-password policy tests.
 *
 * Each assertion pins one rule in `validateMasterPassword`. If we ever
 * relax a rule (e.g. lower the 12-char minimum) at least one test here
 * must be updated in the same commit, making the change explicit.
 */
describe("validateMasterPassword", () => {
    /**
     * Length floor.
     * The regex `/12/` matches the "12" in the error message so the test
     * doesn't couple to the exact wording.
     */
    it("rejects passwords shorter than 12 characters", () => {
        expect(validateMasterPassword("Short1!")).toMatch(/12/);
    });

    /**
     * Common-password blacklist beats length.
     * "password123" is 11 chars long — but the blacklist check uses the
     * lowercase comparison and wins regardless of length rules.
     */
    it("rejects common passwords even if long enough", () => {
        expect(validateMasterPassword("password123")).toBeTruthy();
    });

    /** 15 digits, no letters → fails the `/[A-Za-z]/` rule. */
    it("requires a letter", () => {
        expect(validateMasterPassword("123456789012345")).toMatch(/letter/);
    });

    /** 12 letters, no digits → fails the `/\d/` rule. */
    it("requires a digit", () => {
        expect(validateMasterPassword("abcdefghijkl")).toMatch(/digit/);
    });

    /**
     * Happy path — 23 chars, has letters and a digit, not common.
     * A `null` return means "policy passed; proceed with registration".
     */
    it("accepts a strong password", () => {
        expect(validateMasterPassword("Correct-Horse-Battery-9")).toBeNull();
    });
});
