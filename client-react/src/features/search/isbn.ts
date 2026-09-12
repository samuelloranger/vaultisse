/**
 * ISBN-10 / ISBN-13 checksum validation, client-side.
 *
 * The server validates too (`server/src/utils/IsbnVerification.ts`, called by
 * `POST /book/isbn/:isbn`), so this is not a security control — it is there so
 * a mistyped or misread barcode is caught before it costs a round trip to
 * Google Books, which is rate-limited and retried three times before the
 * server gives up on it.
 */

/** Strip separators and upcase the ISBN-10 check character. */
function normalise(input: string): string {
  return input.replace(/[^0-9Xx]/g, '').toUpperCase()
}

function isValidIsbn10(isbn: string): boolean {
  let sum = 0
  for (let i = 0; i < 9; i++) {
    const digit = Number(isbn[i])
    if (Number.isNaN(digit)) return false
    sum += digit * (10 - i)
  }
  const check = isbn[9] === 'X' ? 10 : Number(isbn[9])
  if (Number.isNaN(check)) return false
  return (sum + check) % 11 === 0
}

function isValidIsbn13(isbn: string): boolean {
  let sum = 0
  for (let i = 0; i < 13; i++) {
    const digit = Number(isbn[i])
    if (Number.isNaN(digit)) return false
    sum += i % 2 === 0 ? digit : digit * 3
  }
  return sum % 10 === 0
}

/** Whether `input` is a well-formed ISBN-10 or ISBN-13, separators allowed. */
export function isValidIsbn(input: string): boolean {
  const isbn = normalise(input)
  if (isbn.length === 10) return isValidIsbn10(isbn)
  if (isbn.length === 13) return isValidIsbn13(isbn)
  return false
}

/** The digits-only form the API is given. */
export function normaliseIsbn(input: string): string {
  return normalise(input)
}
