import type { ActivityEntry, UserSession } from '@/api/user'

/**
 * Turning what the server stored into something a person can recognise.
 *
 * `user_sessions` keeps the raw `User-Agent` and the raw IP, and `activity_log`
 * keeps an action enum. None of that is readable on its own, and the entire
 * point of both lists is that somebody can look at them and notice something
 * wrong — a device they do not own, a failed login they did not attempt. A list
 * nobody can read is a security feature that does not work.
 *
 * Ported from `client/src/utils/DeviceInfo.ts`, which is deliberately a handful
 * of regexes rather than a UA-parsing dependency: the answer only has to be
 * good enough to say "Chrome on iPhone", and being wrong is survivable because
 * the raw string is still one line below.
 */

const OS_PATTERNS: [RegExp, string][] = [
  [/iPad/, 'iPad'],
  [/iPhone/, 'iPhone'],
  [/Android/, 'Android'],
  [/Macintosh|Mac OS X/, 'macOS'],
  [/CrOS/, 'ChromeOS'],
  [/Windows/, 'Windows'],
  [/Linux/, 'Linux'],
]

// Order matters: Chrome, Edge and Opera all carry "Safari/" in their own UA, so
// Safari can only be concluded once the others have been ruled out.
const BROWSER_PATTERNS: [RegExp, string][] = [
  [/Edg\//, 'Edge'],
  [/OPR\/|Opera/, 'Opera'],
  [/Firefox\//, 'Firefox'],
  [/CriOS\//, 'Chrome'],
  [/Chrome\//, 'Chrome'],
  [/Safari\//, 'Safari'],
]

/** "Chrome · iPhone", or as much of it as the string supports. */
export function describeDevice(userAgent: string | null | undefined): string {
  if (!userAgent) return 'Unknown device'
  const os = OS_PATTERNS.find(([pattern]) => pattern.test(userAgent))?.[1] ?? null
  const browser =
    BROWSER_PATTERNS.find(([pattern]) => pattern.test(userAgent))?.[1] ?? null
  if (browser && os) return `${browser} · ${os}`
  return browser ?? os ?? 'Unknown device'
}

/** A session's second line: where it signed in from and when it was last seen. */
export function describeSession(session: UserSession): string {
  const parts = [
    session.ipAddress ?? 'unknown address',
    formatWhen(session.lastSeenDate),
  ]
  return parts.join(' · ')
}

/**
 * Absolute date and time, in the viewer's own locale.
 *
 * Not "3 hours ago". A relative label is friendlier for a feed and worse for an
 * audit: "was that me?" is answered by a clock time, and a login three hours
 * ago reads identically whether it happened at 2pm or at 3am.
 */
export function formatWhen(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

/** Human wording for an `activity_log.action`. */
export function describeActivity(entry: ActivityEntry): string {
  switch (entry.action) {
    case 'login':
      return 'Signed in'
    case 'login_failed':
      return 'Failed sign-in attempt'
    case 'logout':
      return 'Signed out'
    case 'password_changed':
      return 'Password changed'
    default:
      return entry.action
  }
}

/**
 * A failed sign-in is the one row in this list that is *about* somebody else.
 *
 * It is called out rather than styled like the rest because it is the reason
 * the list exists: a wrong password attempted against this account from
 * somewhere else is attributed here on purpose.
 */
export function isActivityAlarming(entry: ActivityEntry): boolean {
  return entry.action === 'login_failed'
}

/**
 * Copy text, reporting whether it worked.
 *
 * `navigator.clipboard` is unavailable on an insecure origin and can be refused
 * outright by the browser, and the one place this is used — backup codes shown
 * exactly once — is the worst possible place to assume it succeeded. The caller
 * shows the codes either way; this only decides which sentence appears under
 * them.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}
