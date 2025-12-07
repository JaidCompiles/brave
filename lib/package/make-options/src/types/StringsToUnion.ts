import type {ArrayValues} from 'type-fest'

export type Strings = Array<string> | ReadonlyArray<string> | string

export type ReadonlyArrayable<Generic> = Generic | ReadonlyArray<Generic>

export type StringsToUnion<InputGeneric extends Strings> = InputGeneric extends ReadonlyArray<string> ? ArrayValues<InputGeneric> : InputGeneric extends Array<string> ? ArrayValues<InputGeneric> : InputGeneric

export type IsStringsToUnionCompatible<InputGeneric> = InputGeneric extends Strings ? true : false
