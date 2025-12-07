import type {Arrayable} from 'type-fest'

import * as lodash from 'lodash-es'

export class RequiredOptionsError extends Error {
  static getMessage(missingKeys: Array<string>) {
    if (missingKeys.length === 1) {
      return `Missing required option: ${missingKeys[0]}`
    }
    return `Missing required options: ${missingKeys.join(', ')}`
  }
  givenKeys: Array<string>
  missingKeys: Array<string>
  requiredKeys: Array<string>
  constructor(givenKeys: Array<string>, requiredKeys: Arrayable<string>) {
    const requiredKeysArray = lodash.castArray<string>(requiredKeys)
    const missingKeys = lodash.difference(requiredKeysArray, givenKeys)
    const message = RequiredOptionsError.getMessage(missingKeys)
    super(message)
    this.name = 'RequiredOptionsError'
    this.givenKeys = givenKeys
    this.requiredKeys = requiredKeysArray
    this.missingKeys = missingKeys
  }
}
