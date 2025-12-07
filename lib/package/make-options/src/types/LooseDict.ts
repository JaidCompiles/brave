export type LooseDict<ValueGeneric = unknown> = Map<string, ValueGeneric> | Record<string, ValueGeneric>

export namespace LooseDict {
  export type LooseDictValue<LooseDictGeneric extends LooseDict> = LooseDictGeneric extends Map<string, infer ValueGeneric> ? ValueGeneric : LooseDictGeneric extends Record<string, infer ValueGeneric> ? ValueGeneric : never

  export type CoerceRecord<LooseDictGeneric extends LooseDict> = Record<string, LooseDictValue<LooseDictGeneric>>

  export type CoerceMap<LooseDictGeneric extends LooseDict> = Map<string, LooseDictValue<LooseDictGeneric>>
}
