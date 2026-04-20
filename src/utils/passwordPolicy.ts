/**
 * A *very small* sample of known-weak passwords.
 *
 * Production systems use a full HaveIBeenPwned "Pwned Passwords" k-anonymity
 * lookup against the millions of leaked hashes. That's overkill here — we
 * catch the top offenders locally so users at minimum aren't registering
 * with literally "password" or "123456".
 *
 * Why the list is lowercased:
 *   We compare `.toLowerCase()` against it so `PASSWORD` is rejected too.
 */
const COMMON_PASSWORDS = new Set([
    "password", "password1", "password123", "123456", "12345678", "123456789",
    "qwerty", "qwerty123", "abc123", "letmein", "welcome", "admin", "monkey",
    "iloveyou", "master", "dragon", "football", "baseball", "princess",
    "passw0rd", "p@ssw0rd", "trustno1",
]);

/**
 * Validate a proposed master password.
 *
 * Use case:
 *   Called in Register.tsx before we run PBKDF2. Returns `null` on success
 *   or a user-facing error string on failure (rendered into the form).
 *
 * Why this enforcement is CLIENT-only:
 *   The server never sees the plaintext password — by design — so it
 *   cannot check policy. Any client can bypass this by posting straight
 *   to /auth/register with a weak password, but that client would then
 *   be harming *themselves* (weak key → weak vault). We're not protecting
 *   the server; we're protecting the honest user from their own bad habit.
 *
 * Rules (chosen to be pragmatic, not maximal):
 *   - ≥ 12 chars: NIST SP 800-63B's floor for human-memorised passphrases.
 *   - Must contain at least one letter AND one digit: keeps people from
 *     using pure numeric PINs or pure ASCII words.
 *   - Not in the common-password list (checked case-insensitively).
 *
 * We intentionally do NOT require special characters or mixed case.
 * NIST withdrew those rules because they push users toward predictable
 * substitutions ("Password1!") without adding real entropy.
 */
export function validateMasterPassword(password: string): string | null {
    if (password.length < 12) return "Password must be at least 12 characters.";
    if (COMMON_PASSWORDS.has(password.toLowerCase())) return "That password is too common.";
    if (!/[A-Za-z]/.test(password)) return "Password must contain at least one letter.";
    if (!/\d/.test(password)) return "Password must contain at least one digit.";
    return null;
}
