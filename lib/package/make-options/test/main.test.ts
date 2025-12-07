import type {InputOptions, MakerOptions} from '../src/index.ts'
import type {Arrayable, NonNegativeInteger} from 'type-fest'

import {describe, test} from 'bun:test'

import {makeOptions} from '../src/index.ts'

describe('makeOptions', () => {
  test('', () => {
    const defaultOptions = {
      path: 'api' as Arrayable<string>,
      host: 'localhost',
    }
    const inputOptions = {
      protocol: 'https',
      a: 2, // TODO This should error in some place of this test file because it's not defined in Options
    }
    type Options = InputOptions<{
      defaults: {
        host: string
        path: Arrayable<string>
      }
      optional: {
        // port: NonNegativeInteger<number>
        port: number
      }
      required: {
        host: string
        protocol: string
      }
    }>
    const makerOptions = {
      defaultOptions,
      requiredKeys: ['protocol'],
    } as const satisfies MakerOptions.Static
    type Options2 = InputOptions<{
      defaults: {
        path: Arrayable<string>
      }
      optional: {
        // port: NonNegativeInteger<number>
        port: number
      }
      required: {
        host: string
        protocol: string
      }
    }, typeof makerOptions>
    const outputOptions = makeOptions<Options2>(inputOptions, makerOptions)
    console.log(outputOptions.protocol)
    console.dir({
      defaultOptions,
      inputOptions,
      outputOptions,
    })
  })
})
