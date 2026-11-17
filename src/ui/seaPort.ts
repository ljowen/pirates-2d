import type { Accounts } from '../net/api'
import type { Link } from '../net/seaClient'
import { ARENA_CLASSES } from '../sim/arena'
import type { ShipClass } from '../sim/shipClasses'
import { shipPortrait } from '../render/shipPortrait'
import { callCss, cardCss, cardHoverCss, cardInk, headingFamily, keyCss, ui } from './theme'

const M = ui().menu
const INK = cardInk('#cfe6f5')
const DIM = cardInk('rgba(207,230,245,0.55)')
const BAD = cardInk('#ff7a6b')

export interface SeaPageDeps {
  accounts: Accounts
  link: () => Link
  sail: (cls: ShipClass) => void
  /** Draw the page again: the account or the connection changed. */
  redraw: () => void
}

/**
 * The port's Open sea page: sign in, then pick a hull and go.
 *
 * Every hull is free here and none carries refits or cards, because a fight
 * between captains is only worth having if it is decided at sea. What a
 * career has bought stays with the voyages.
 */
export function renderSeaPage(body: HTMLElement, deps: SeaPageDeps) {
  const account = deps.accounts.account
  body.appendChild(account ? signedIn(deps) : signIn(deps))
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, css = '', text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  node.style.cssText = css
  if (text !== undefined) node.textContent = text
  return node
}

function signIn(deps: SeaPageDeps): HTMLElement {
  const sheet = el('form', `${cardCss()} color:${INK}; width:min(460px, 100%); box-sizing:border-box; padding:22px 24px`)
  sheet.appendChild(el('div', `font-family:${headingFamily()}; font-size:26px; margin-bottom:6px`, 'The open sea'))
  sheet.appendChild(el('div', `font-size:14px; line-height:1.55; color:${DIM}; margin-bottom:16px`,
    'Every other ship is another captain. Sign in with a name and a four-digit PIN. ' +
    'There is no email and no reset, so keep your PIN.'))

  const field = (label: string, input: HTMLInputElement) => {
    const row = el('label', 'display:flex; flex-direction:column; gap:4px; margin-bottom:12px; font-size:14px')
    row.appendChild(el('span', `color:${ui().rubric}; letter-spacing:1.5px`, label))
    input.style.cssText = `${keyCss()}; color:${ui().panel.ink}; font:inherit; font-size:17px; padding:7px 10px; box-shadow:none`
    row.appendChild(input)
    sheet.appendChild(row)
    return input
  }
  const name = field('NAME', Object.assign(el('input'), {
    autocomplete: 'username', maxLength: 16, spellcheck: false, placeholder: '3 to 16 letters or numbers',
  }))
  const pin = field('PIN', Object.assign(el('input'), {
    type: 'password', inputMode: 'numeric', autocomplete: 'current-password', maxLength: 4, placeholder: '••••',
  }))
  name.pattern = '[A-Za-z0-9_]{3,16}'
  pin.pattern = '\\d{4}'
  name.value = lastName()

  const error = el('div', `color:${BAD}; font-size:14px; min-height:20px; margin:2px 0 10px`)
  sheet.appendChild(error)

  const buttons = el('div', 'display:flex; gap:10px; flex-wrap:wrap')
  const button = (label: string, primary: boolean) => {
    const b = el('button', `${primary ? callCss() : `${cardCss()} color:${INK}`}; font:inherit; font-size:15px;
      font-weight:bold; cursor:pointer; padding:8px 18px; border-radius:5px`, label)
    buttons.appendChild(b)
    return b
  }
  const signInButton = button('Sign in', true)
  const newButton = button('New captain', false)
  newButton.type = 'button'
  sheet.appendChild(buttons)

  const go = async (create: boolean) => {
    error.textContent = ''
    const username = name.value.trim()
    if (!/^[A-Za-z0-9_]{3,16}$/.test(username)) { error.textContent = 'A name is 3 to 16 letters, numbers or underscores.'; return }
    if (!/^\d{4}$/.test(pin.value)) { error.textContent = 'The PIN is four digits.'; return }
    signInButton.disabled = newButton.disabled = true
    try {
      if (create) await deps.accounts.register(username, pin.value)
      else await deps.accounts.login(username, pin.value)
      rememberName(username)
    } catch (err) {
      error.textContent = (err as Error).message
      signInButton.disabled = newButton.disabled = false
    }
  }
  sheet.onsubmit = (e) => { e.preventDefault(); void go(false) }
  newButton.onclick = () => void go(true)
  return sheet
}

function signedIn(deps: SeaPageDeps): HTMLElement {
  const account = deps.accounts.account!
  const page = el('div', 'display:flex; flex-direction:column; align-items:center; gap:16px; width:100%')

  const who = el('div', `font-size:15px; color:${M.text}; text-align:center`)
  who.append('Signed in as ')
  who.appendChild(el('b', `color:${M.gold}`, account.username))
  const link = deps.link()
  if (link !== 'open') {
    who.appendChild(el('span', `color:${M.dim}`, link === 'connecting' ? ' · reaching the open sea…' : ' · not connected'))
  }
  who.append(' · ')
  const out = el('button', `background:none; border:none; font:inherit; color:${M.text}; opacity:0.7;
    cursor:pointer; text-decoration:underline; padding:0`, 'sign out')
  out.onclick = () => void deps.accounts.logout()
  who.appendChild(out)
  page.appendChild(who)
  page.appendChild(el('div', `font-size:14px; color:${M.dim}; text-align:center; max-width:640px; line-height:1.5`,
    'Every hull is yours to take, as she comes from the yard: no refits, no cards. ' +
    'Sink a ship to spill half her hold; you are raised again a few seconds after you go down. ' +
    'Bounties, escorts and raids on the two towns pay plunder and renown: sail into one to join its crew, ' +
    'and its crew are allies until it is done.'))

  const yard = el('div', 'display:flex; gap:12px; flex-wrap:wrap; justify-content:center')
  for (const cls of ARENA_CLASSES) yard.appendChild(hullCard(cls, () => deps.sail(cls), link === 'open'))
  page.appendChild(yard)

  const board = el('div', `${cardCss()} color:${INK}; width:min(520px, 100%); box-sizing:border-box; padding:16px 20px`)
  board.appendChild(el('div', `font-family:${headingFamily()}; font-size:22px; margin-bottom:8px`, 'Most feared'))
  const table = el('div', 'display:grid; grid-template-columns: 1fr auto auto auto auto; gap:4px 16px; font-size:14px')
  table.appendChild(el('div', `color:${DIM}`, 'Loading…'))
  board.appendChild(table)
  page.appendChild(board)
  deps.accounts.leaderboard().then((rows) => {
    table.innerHTML = ''
    if (rows.length === 0) { table.appendChild(el('div', `color:${DIM}`, 'Nobody has sunk anybody yet.')); return }
    for (const head of ['Captain', 'Renown', 'Sunk', 'Lost', 'Best haul']) table.appendChild(el('div', `color:${ui().rubric}; letter-spacing:1px`, head))
    for (const row of rows) {
      table.appendChild(el('div', row.name === account.username ? 'font-weight:bold' : '', row.name))
      table.appendChild(el('div', 'text-align:right; font-weight:bold', String(row.renown ?? 0)))
      table.appendChild(el('div', 'text-align:right', String(row.sinkings)))
      table.appendChild(el('div', 'text-align:right', String(row.deaths)))
      table.appendChild(el('div', 'text-align:right', String(Math.round(row.bestPlunder))))
    }
  }).catch(() => { table.innerHTML = ''; table.appendChild(el('div', `color:${DIM}`, 'The tally could not be fetched.')) })

  return page
}

function hullCard(cls: ShipClass, sail: () => void, live: boolean): HTMLButtonElement {
  const card = el('button', `${cardCss()} color:${INK}; font:inherit; cursor:${live ? 'pointer' : 'default'};
    width:172px; padding:10px; display:flex; flex-direction:column; align-items:center; gap:6px;
    transition: all 0.12s ease; opacity:${live ? 1 : 0.6}`)
  card.disabled = !live
  card.innerHTML = shipPortrait(cls, 150, 70)
  card.appendChild(el('div', `font-family:${headingFamily()}; font-size:20px`, cls.name))
  card.appendChild(el('div', `font-size:13px; color:${DIM}; text-align:center`,
    `${cls.guns >= 1.5 ? 'Heavy guns' : cls.guns >= 1 ? 'Fair guns' : 'Light guns'} · ` +
    `${cls.draught <= 0.8 ? 'shoal draught' : cls.draught >= 1.4 ? 'deep keel' : 'middling draught'}`))
  card.onmouseenter = () => { if (live) card.style.boxShadow = cardHoverCss() }
  card.onmouseleave = () => { card.style.boxShadow = '' ; card.style.cssText += cardCss() }
  card.onclick = () => { if (live) sail() }
  return card
}

const NAME_KEY = 'pirates2d.lastName'
function lastName(): string {
  try { return localStorage.getItem(NAME_KEY) ?? '' } catch { return '' }
}
function rememberName(name: string) {
  try { localStorage.setItem(NAME_KEY, name) } catch { /* fine */ }
}
