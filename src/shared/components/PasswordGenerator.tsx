import { useState } from 'react';

interface Props {
  onGenerate: (password: string) => void;
}

/**
 * Client-side strong-password generator.
 *
 * Use case:
 *   Rendered inside the "Add credential" form so users don't have to think
 *   up a password for each site. The generated string is pushed up to the
 *   parent via `onGenerate` so the form's password input updates in place.
 *
 * Security notes (why the implementation looks this way):
 *
 * 1. `window.crypto.getRandomValues(Uint32Array)` — CSPRNG:
 *    Passwords generated with `Math.random()` are trivial to predict because
 *    V8's Math.random is a non-cryptographic PRNG. `getRandomValues` is
 *    backed by the OS entropy pool and is the correct primitive here.
 *
 * 2. Modulo bias:
 *    `randomVals[i] % chars.length` introduces a small bias because 2^32 is
 *    not an exact multiple of `chars.length` (currently 94). A cryptographer
 *    would use rejection sampling to eliminate that bias. For a
 *    16-character password the bias is statistically insignificant —
 *    a few bits of entropy out of ~105 — but it's a known approximation
 *    worth flagging here. See: https://en.wikipedia.org/wiki/Modulo_bias
 *
 * 3. Character set:
 *    Includes punctuation to maximise entropy per character. Some sites
 *    reject certain specials (notorious: banks) — users can regenerate
 *    until they get one that sticks. A future enhancement would be a
 *    "alphanumeric only" toggle.
 *
 * Length slider:
 *   8 to 32 covers the practical range. <8 is never acceptable; >32 rarely
 *   accepted by websites' max-length fields.
 */
export function PasswordGenerator({ onGenerate }: Props) {
  const [length, setLength] = useState(16);

  const generate = () => {
    const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+~`|}{[]:;?><,./-=";
    let pwd = "";
    const randomVals = new Uint32Array(length);
    window.crypto.getRandomValues(randomVals);

    for (let i = 0; i < length; i++) {
        pwd += chars[randomVals[i] % chars.length];
    }

    onGenerate(pwd);
  };

  return (
    <div className="password-generator">
      <div className="generator-header">
         <label>Length: {length}</label>
         <input
            type="range"
            min="8"
            max="32"
            value={length}
            onChange={(e) => setLength(Number(e.target.value))}
         />
      </div>
      <button type="button" onClick={generate} className="auth-button secondary generator-btn">
          Generate Strong Password
      </button>
    </div>
  );
}
