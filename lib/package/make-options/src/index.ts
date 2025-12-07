import type {IsNonEmptyRecord} from 'lib/package/make-options/src/types/IsNonEmptyRecord.ts'
import type {SchemaAndKeys} from 'lib/package/make-options/src/types/SchemaAndKeys.ts'
import type {ReadonlyArrayable} from 'lib/package/make-options/src/types/StringsToUnion.ts'
import type {Dict, MergeThree} from 'more-types'
import type {Exact, Merge, SetOptional, Simplify, UnionToTuple} from 'type-fest'

import * as lodash from 'lodash-es'

import {RequiredOptionsError} from 'lib/package/make-options/src/RequiredOptionsError.ts'

export type InputOptions<SetupGeneric extends InputOptions.Setup = {}, MakerOptionsGeneric extends MakerOptions.Static = {}> = {
  defaults: Merge<MakerOptionsGeneric['defaultOptions'], SetupGeneric['defaults']>
  merged: ToMerged<SetupGeneric, MakerOptionsGeneric>
  normalizations: IsNonEmptyRecord.Then<SetupGeneric['normalizations'], SetupGeneric['normalizations'], {}>
  normalized: IsNonEmptyRecord.Then<SetupGeneric['normalizations'], ToNormalized<SetupGeneric, MakerOptionsGeneric>, ToMerged<SetupGeneric, MakerOptionsGeneric>>
  optional: ToOptional<SetupGeneric>
  parameter: ToParameter<SetupGeneric, MakerOptionsGeneric>
  required: ToRequired<SetupGeneric, MakerOptionsGeneric>
}

namespace InputOptions {
  export type Setup = {
    defaults?: Dict
    normalizations?: Dict
    optional?: Dict
    optionalKeys?: ReadonlyArray<string> | string
    required?: Dict
    requiredKeys?: ReadonlyArray<string> | string
  }
  export namespace Setup {
    export type Coerce<InputOptionsGeneric extends InputOptions | Setup> = InputOptionsGeneric extends InputOptions<infer Setup> ? Setup : InputOptionsGeneric extends Setup ? InputOptionsGeneric : never
  }
  export type Static = {
    defaults: Dict
    merged: Dict
    normalizations?: Dict
    normalized?: Dict
    optional: Dict
    parameter: Dict | undefined
    required: Dict
  }
  export type ApplyMakerOptions<InputOptionsGeneric extends InputOptions, MakerOptionsGeneric extends MakerOptions<InputOptionsGeneric>> = InputOptions<Setup.Coerce<InputOptionsGeneric>, MakerOptionsGeneric>
  export type From<InputOptionsGeneric extends InputOptions | Setup> = InputOptionsGeneric extends InputOptions ? InputOptionsGeneric : InputOptionsGeneric extends Setup ? InputOptions<InputOptionsGeneric> : never
}

export type MakerOptions<InputOptionsGeneric extends InputOptions.Static | undefined = undefined> = IsNonEmptyRecord.Then<InputOptionsGeneric, IsNonEmptyRecord.Then<NonNullable<InputOptionsGeneric>['required'], {
  requiredKeys: Readonly<UnionToTuple<keyof NonNullable<InputOptionsGeneric>['required']>>
}, {}> & IsNonEmptyRecord.Then<NonNullable<InputOptionsGeneric>['defaults'], {
  defaultOptions: NonNullable<InputOptionsGeneric>['defaults']
}, {}> & IsNonEmptyRecord.Then<NonNullable<InputOptionsGeneric>['normalizations'], {
  normalize: Record<keyof NonNullable<InputOptionsGeneric>['normalizations'], (value: NonNullable<InputOptionsGeneric>['merged'][keyof NonNullable<InputOptionsGeneric>['normalizations']]) => NonNullable<InputOptionsGeneric>['normalizations'][keyof NonNullable<InputOptionsGeneric>['normalizations']]>
}, {}>, MakerOptions.Static>

type ToRequired<SetupGeneric extends InputOptions.Setup, MakerOptionsGeneric extends MakerOptions.Static = {}> = Simplify<Omit<SchemaAndKeys<SchemaAndKeys<SetupGeneric['required'], MakerOptionsGeneric['requiredKeys']>, SetupGeneric['requiredKeys']>, keyof Merge<SetupGeneric['defaults'], MakerOptionsGeneric['defaultOptions']>>>

type ToOptional<SetupGeneric extends InputOptions.Setup> = Partial<SchemaAndKeys<SetupGeneric['optional'], SetupGeneric['optionalKeys']>>

type ToMerged<SetupGeneric extends InputOptions.Setup, MakerOptionsGeneric extends MakerOptions.Static = {}> = MergeThree<SetupGeneric['defaults'], ToOptional<SetupGeneric>, ToRequired<SetupGeneric, MakerOptionsGeneric>>

type ToNormalized<SetupGeneric extends InputOptions.Setup, MakerOptionsGeneric extends MakerOptions.Static = {}> = Merge<MergeThree<SetupGeneric['defaults'], ToOptional<SetupGeneric>, ToRequired<SetupGeneric, MakerOptionsGeneric>>, SetupGeneric['normalizations']>

type ToParameter<SetupGeneric extends InputOptions.Setup, MakerOptionsGeneric extends MakerOptions.Static = {}> = Exact<MergeThree<Partial<SetupGeneric['defaults']>, ToOptional<SetupGeneric>, ToRequired<SetupGeneric, MakerOptionsGeneric>>, {}> | undefined

export namespace MakerOptions {
  export type Static = {
    defaultOptions?: Dict
    normalize?: Record<string, (value: unknown) => unknown>
    requiredKeys?: ReadonlyArrayable<string>
  }
}

export const makeOptions = <InputOptionsGeneric extends InputOptions.Static>(input: InputOptionsGeneric['parameter'], makerOptions?: MakerOptions<InputOptionsGeneric>) => {
  type RuntimeInputOptions = InputOptions<InputOptions.Setup.Coerce<InputOptionsGeneric>, MakerOptions<InputOptionsGeneric>>
  const output = {
    // @ts-expect-error TS2339
    ...makerOptions?.defaultOptions,
    ...input as Dict,
  } as RuntimeInputOptions['merged']
  // @ts-expect-error TS2339
  if (makerOptions?.requiredKeys) {
    const givenKeys = Object.keys(output)
    // @ts-expect-error TS2339
    // eslint-disable-next-line typescript/no-unsafe-argument
    const requiredKeys = lodash.castArray<string>(makerOptions.requiredKeys)
    for (const key of requiredKeys) {
      if (!(key in output)) {
        throw new RequiredOptionsError(givenKeys, requiredKeys)
      }
    }
  }
  // @ts-expect-error TS2339
  if (makerOptions?.normalize) {
    const givenKeys = Object.keys(output)
    // @ts-expect-error TS2339
    // eslint-disable-next-line typescript/no-unsafe-argument
    for (const [key, normalize] of Object.entries(makerOptions.normalize)) {
      if (!givenKeys.includes(key)) {
        continue
      }
      // @ts-expect-error TS2339
      // eslint-disable-next-line typescript/no-unsafe-assignment
      output[key] = normalize(output[key])
    }
  }
  return output as RuntimeInputOptions['normalized']
}
