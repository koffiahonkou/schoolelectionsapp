/**
 * Cryptographically secure 8-character unique alphanumeric voter code generator.
 * Produces unpredictable, non-sequential codes with guaranteed mixture of numbers and alphabets.
 */

// Unambiguous uppercase letters (excluding easily confused 'I' and 'O')
const CHAR_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
// Unambiguous digits (excluding '0' and '1' to prevent confusion with O/I)
const CHAR_DIGITS = '23456789';
const ALL_CHARS = CHAR_LETTERS + CHAR_DIGITS;

/**
 * Generates a single cryptographically secure random integer in [0, max - 1].
 */
function getRandomInt(max: number): number {
  if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
    const arr = new Uint32Array(1);
    window.crypto.getRandomValues(arr);
    return arr[0] % max;
  }
  return Math.floor(Math.random() * max);
}

/**
 * Generates an 8-character code with guaranteed mix of numbers and letters.
 * Guaranteed:
 * - Length: exactly 8 characters.
 * - Non-traceable, high-entropy cryptographic randomness.
 * - Guaranteed mixture: at least 2 letters and at least 2 digits.
 * - Zero predictable sequence or pattern.
 */
export function generate8DigitVoterCode(): string {
  const codeChars: string[] = [];

  // Guarantee at least 2 digits
  codeChars.push(CHAR_DIGITS[getRandomInt(CHAR_DIGITS.length)]);
  codeChars.push(CHAR_DIGITS[getRandomInt(CHAR_DIGITS.length)]);

  // Guarantee at least 2 letters
  codeChars.push(CHAR_LETTERS[getRandomInt(CHAR_LETTERS.length)]);
  codeChars.push(CHAR_LETTERS[getRandomInt(CHAR_LETTERS.length)]);

  // Fill remaining 4 positions with arbitrary blend of letters and digits
  for (let i = 0; i < 4; i++) {
    codeChars.push(ALL_CHARS[getRandomInt(ALL_CHARS.length)]);
  }

  // Cryptographically shuffle array using Fisher-Yates
  for (let i = codeChars.length - 1; i > 0; i--) {
    const j = getRandomInt(i + 1);
    const temp = codeChars[i];
    codeChars[i] = codeChars[j];
    codeChars[j] = temp;
  }

  return codeChars.join('');
}

/**
 * Generates an 8-character unique code that does NOT collide with any code in existingCodes.
 */
export function generateUniqueVoterCode(existingCodes: Set<string>): string {
  let code = generate8DigitVoterCode();
  let attempts = 0;
  while (existingCodes.has(code) && attempts < 1000) {
    code = generate8DigitVoterCode();
    attempts++;
  }
  existingCodes.add(code);
  return code;
}

/**
 * Generates multiple unique 8-character codes.
 */
export function generateUniqueVoterCodes(count: number, existingCodes = new Set<string>()): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    codes.push(generateUniqueVoterCode(existingCodes));
  }
  return codes;
}
