import type {IsStringsToUnionCompatible, StringsToUnion} from 'lib/package/make-options/src/types/StringsToUnion.ts'
import type {Dict} from 'more-types'
import type {Merge} from 'type-fest'

export type SchemaAndKeys<Schema extends Dict | undefined = undefined, Keys extends Array<string> | ReadonlyArray<string> | string | undefined = undefined> = IsStringsToUnionCompatible<Keys> extends true ? Merge<Record<StringsToUnion<NonNullable<Keys>>, unknown>, Schema> : Schema extends Dict ? Schema : {}
