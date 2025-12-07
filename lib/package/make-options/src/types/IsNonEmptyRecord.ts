export type IsNonEmptyRecord<InputGeneric> = InputGeneric extends Record<string, any> ? [keyof InputGeneric] extends [never] ? false : true : false

export namespace IsNonEmptyRecord {
  export type Then<InputGeneric, TrueGeneric, FalseGeneric = false> = IsNonEmptyRecord<InputGeneric> extends true ? TrueGeneric : FalseGeneric
}
