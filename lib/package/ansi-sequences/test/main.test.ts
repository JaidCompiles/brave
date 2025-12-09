import {describe, expect, test} from 'bun:test'

import * as ansi from '../src/index.ts'

describe('ansi-sequences', () => {
  test('has formatting functions', () => {
    expect(ansi.file).toBeFunction()
    expect(ansi.folder).toBeFunction()
    expect(ansi.integer).toBeFunction()
    expect(ansi.string).toBeFunction()
    expect(ansi.bytes).toBeFunction()
    expect(ansi.percent).toBeFunction()
    expect(ansi.seconds).toBeFunction()
    expect(ansi.ms).toBeFunction()
  })
  test('integer formats number', () => {
    const result = ansi.integer(1000)
    expect(result).toBeString()
  })
  test('string formats string', () => {
    const result = ansi.string('test')
    expect(result).toBeString()
  })
})
