import { describe, it, expect } from "vitest";
import { bufferToHex, hexToBuffer, generateSalt } from "./crypto";

/**
 * Pure-function crypto helper tests.
 *
 * These exercise the hex encoders and the salt generator — no Web Crypto
 * calls, so they run fast in jsdom without mocking.
 */
describe("hex helpers", () => {
    /**
     * Round-trip invariant: `hexToBuffer(bufferToHex(b)) === b` for every byte.
     *
     * Why this matters:
     *   Vault items travel over the wire as hex. If either encoder had a
     *   bug (missing zero-pad, wrong nibble order) we'd encrypt fine but
     *   decrypt would fail with a cryptic GCM auth-tag error on load.
     *   This test catches the encoding bug before it hits production data.
     *
     * Notable values in the input:
     *   - 0x00: verifies zero-padding (must be "00", not "0").
     *   - 0x0f: verifies single-digit padding ("0f", not "f").
     *   - 0xff: verifies the top byte survives round-tripping.
     */
    it("round-trips a buffer", () => {
        const bytes = new Uint8Array([0x00, 0x0f, 0xa3, 0xff]);
        const hex = bufferToHex(bytes);
        expect(hex).toBe("000fa3ff");
        const back = new Uint8Array(hexToBuffer(hex));
        expect(Array.from(back)).toEqual([0x00, 0x0f, 0xa3, 0xff]);
    });

    /**
     * `generateSalt` always returns 32 lowercase hex chars (= 16 bytes).
     * The server validates the shape with a strict regex; if this test
     * breaks we'd fail registration end-to-end.
     */
    it("generateSalt produces 16 bytes of hex", () => {
        const salt = generateSalt();
        expect(salt).toMatch(/^[0-9a-f]{32}$/);
    });
});
