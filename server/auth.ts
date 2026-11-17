/**
 * Accounts are a name and a four-digit PIN. There is no email and no reset:
 * a forgotten PIN is a new captain.
 *
 * Ten thousand PINs is nothing to a script, so the hash only keeps PINs out
 * of a leaked table; what actually stops guessing is the lockout. Five wrong
 * in a row closes the account for a quarter of an hour.
 */

export const USERNAME = /^[A-Za-z0-9_]{3,16}$/
export const PIN = /^\d{4}$/
const MAX_FAILED = 5
const LOCK_MS = 15 * 60 * 1000
/** The most Workers allows for PBKDF2. */
const ITERATIONS = 100_000

export interface User { id: number; username: string }

export class AuthError extends Error {
  constructor(readonly status: number, message: string) { super(message) }
}

const hex = (bytes: ArrayBuffer | Uint8Array) =>
  [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('')
const unhex = (s: string) => new Uint8Array(s.match(/../g)!.map((h) => parseInt(h, 16)))

async function hashPin(pin: string, salt: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS }, key, 256,
  )
  return new Uint8Array(bits)
}

function randomToken(): string {
  return hex(crypto.getRandomValues(new Uint8Array(32)))
}

async function newSession(db: D1Database, userId: number): Promise<string> {
  const token = randomToken()
  await db.prepare('INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)')
    .bind(token, userId, Date.now()).run()
  return token
}

function validate(username: unknown, pin: unknown): { username: string; pin: string } {
  if (typeof username !== 'string' || !USERNAME.test(username)) {
    throw new AuthError(400, 'A name is 3 to 16 letters, numbers or underscores.')
  }
  if (typeof pin !== 'string' || !PIN.test(pin)) throw new AuthError(400, 'The PIN is four digits.')
  return { username, pin }
}

export async function register(db: D1Database, body: { username?: unknown; pin?: unknown }) {
  const { username, pin } = validate(body.username, body.pin)
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const hash = await hashPin(pin, salt)
  const result = await db.prepare(
    `INSERT INTO users (username, username_lc, pin_hash, salt, created_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(username_lc) DO NOTHING RETURNING id`,
  ).bind(username, username.toLowerCase(), hex(hash), hex(salt), Date.now()).first<{ id: number }>()
  if (!result) throw new AuthError(409, 'That name is taken.')
  return { token: await newSession(db, result.id), user: { id: result.id, username } satisfies User }
}

export async function login(db: D1Database, body: { username?: unknown; pin?: unknown }) {
  const { username, pin } = validate(body.username, body.pin)
  const row = await db.prepare(
    'SELECT id, username, pin_hash, salt, failed, locked_until FROM users WHERE username_lc = ?',
  ).bind(username.toLowerCase()).first<{
    id: number; username: string; pin_hash: string; salt: string; failed: number; locked_until: number
  }>()
  if (!row) throw new AuthError(401, 'No captain by that name, or the PIN is wrong.')

  const now = Date.now()
  if (row.locked_until > now) {
    const minutes = Math.ceil((row.locked_until - now) / 60000)
    throw new AuthError(429, `Too many wrong PINs. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`)
  }

  const hash = await hashPin(pin, unhex(row.salt))
  const expected = unhex(row.pin_hash)
  const ok = hash.byteLength === expected.byteLength && crypto.subtle.timingSafeEqual(hash, expected)
  if (!ok) {
    const failed = row.failed + 1
    const locked = failed >= MAX_FAILED
    await db.prepare('UPDATE users SET failed = ?, locked_until = ? WHERE id = ?')
      .bind(locked ? 0 : failed, locked ? now + LOCK_MS : 0, row.id).run()
    throw new AuthError(locked ? 429 : 401, locked
      ? 'Too many wrong PINs. That name is locked for 15 minutes.'
      : 'No captain by that name, or the PIN is wrong.')
  }

  if (row.failed > 0) await db.prepare('UPDATE users SET failed = 0 WHERE id = ?').bind(row.id).run()
  return { token: await newSession(db, row.id), user: { id: row.id, username: row.username } satisfies User }
}

export async function userForToken(db: D1Database, token: string | null): Promise<User | null> {
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return null
  return db.prepare(
    'SELECT users.id AS id, users.username AS username FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token = ?',
  ).bind(token).first<User>()
}

export async function logout(db: D1Database, token: string | null) {
  if (token) await db.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run()
}

export function bearer(request: Request): string | null {
  const header = request.headers.get('Authorization') ?? ''
  return header.startsWith('Bearer ') ? header.slice(7) : null
}
