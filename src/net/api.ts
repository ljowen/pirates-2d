/**
 * Accounts, from the browser's side: a name, a four-digit PIN, and a session
 * token kept in this browser. There is nothing to reset — a forgotten PIN is
 * a new captain.
 */

/**
 * Whether this build can reach the open sea at all. The Cloudflare build
 * (`npm run build:sea`) and the dev server can; the GitHub Pages build is a
 * static site with nothing behind it, so it does not offer the tab.
 */
export const SEA_ENABLED = import.meta.env.DEV || import.meta.env.MODE === 'sea'

const TOKEN_KEY = 'pirates2d.token'

export interface Account { id: number; username: string }

export interface LeaderRow { name: string; renown: number; sinkings: number; deaths: number; bestPlunder: number }

function readToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY) } catch { return null }
}

function writeToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    // Private windows may refuse; the session simply lasts this page.
  }
}

async function call<T>(method: string, path: string, body?: unknown, token?: string | null): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  let res: Response
  try {
    res = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  } catch {
    throw new Error('The open sea cannot be reached. Check your connection.')
  }
  const data = await res.json().catch(() => ({})) as T & { error?: string }
  if (!res.ok) throw new Error(data.error ?? `The harbour master said ${res.status}.`)
  return data
}

export class Accounts {
  token: string | null = readToken()
  account: Account | null = null
  /** Called whenever the signed-in captain changes, including on sign out. */
  onChange: () => void = () => {}

  /** Check a stored session is still good. Quietly forgets it if not. */
  async restore(): Promise<Account | null> {
    if (!this.token) return null
    try {
      const { user } = await call<{ user: Account }>('GET', '/api/me', undefined, this.token)
      this.account = user
    } catch {
      this.forget()
    }
    this.onChange()
    return this.account
  }

  async register(username: string, pin: string) {
    this.accept(await call<{ token: string; user: Account }>('POST', '/api/register', { username, pin }))
  }

  async login(username: string, pin: string) {
    this.accept(await call<{ token: string; user: Account }>('POST', '/api/login', { username, pin }))
  }

  async logout() {
    const token = this.token
    this.forget()
    this.onChange()
    if (token) await call('POST', '/api/logout', undefined, token).catch(() => {})
  }

  async leaderboard(): Promise<LeaderRow[]> {
    return (await call<{ rows: LeaderRow[] }>('GET', '/api/leaderboard')).rows
  }

  private accept(result: { token: string; user: Account }) {
    this.token = result.token
    this.account = result.user
    writeToken(result.token)
    this.onChange()
  }

  private forget() {
    this.token = null
    this.account = null
    writeToken(null)
  }
}
