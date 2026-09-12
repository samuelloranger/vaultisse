import { describe, expect, it } from 'vitest'
import { Route } from './customers'

describe('Borrowers route', () => {
  it('uses Borrowers in the document title', () => {
    expect(Route.options.staticData).toEqual({ title: 'Borrowers' })
  })
})
