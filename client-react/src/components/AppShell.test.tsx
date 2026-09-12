import { describe, expect, it } from 'vitest'
import { makePolicy } from '@/test/fixtures'
import { visibleNavItems } from './AppShell'

/**
 * The nav's gates.
 *
 * `visibleNavItems` rather than the rendered shell on purpose: the rows are
 * `Link`s, so asserting on the DOM would mean standing a router up in a unit
 * test to prove something about an array filter. The rendered path - drawer
 * opens, rows appear, rows disappear when the toggle flips - is the Playwright
 * pass's job.
 */

function labels(policy: ReturnType<typeof makePolicy>): string[] {
  return visibleNavItems(policy).map((item) => item.label)
}

describe('visibleNavItems', () => {
  it('lists Loans and Borrowers while lending is on', () => {
    const policy = makePolicy()
    policy.user.leasingEnabled = true

    expect(labels(policy)).toContain('Loans')
    expect(labels(policy)).toContain('Borrowers')
  })

  it('drops Loans and Borrowers when lending is off', () => {
    const policy = makePolicy()
    policy.user.leasingEnabled = false

    expect(labels(policy)).not.toContain('Loans')
    expect(labels(policy)).not.toContain('Borrowers')
  })

  it('leaves every other row alone when lending is off', () => {
    const policy = makePolicy()
    policy.user.leasingEnabled = false

    // The gate removes a section; it is not an excuse to hide anything else.
    expect(labels(policy)).toEqual([
      'Dashboard',
      'Library',
      'Locations',
      'Categories',
      'Authors',
      'Profile',
      'Admin',
    ])
  })

  it('still hides Admin from a non-administrator, lending or not', () => {
    const policy = makePolicy()
    policy.user.isAdmin = false
    policy.user.leasingEnabled = true

    expect(labels(policy)).not.toContain('Admin')
    expect(labels(policy)).toContain('Loans')
  })
})
