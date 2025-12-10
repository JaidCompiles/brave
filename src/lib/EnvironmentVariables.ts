import type {Arrayable} from 'type-fest'

export class EnvironmentVariables extends Map<string, boolean | number | string> {
  static pathKey = Object.keys(process.env).find(key => key.toLowerCase() === 'path') ?? 'PATH'
  static pathSplitter = process.platform === 'win32' ? ';' : ':'
  static fromEnvContents(contents: Buffer | string) {
    const text = typeof contents === 'string' ? contents : contents.toString('utf8')
    const environmentVariables = new EnvironmentVariables
    for (const line of text.split(/\r?\n/u)) {
      const keyLength = line.indexOf('=')
      if (keyLength === -1) {
        continue
      }
      const key = line.slice(0, keyLength)
      const value = line.slice(keyLength + 1)
      if (!value.startsWith('"')) {
        environmentVariables.set(key, EnvironmentVariables.parseValue(value))
        continue
      }
      const extractedValue = JSON.parse(value) as string
      environmentVariables.set(key, EnvironmentVariables.parseValue(extractedValue))
    }
    return environmentVariables
  }
  static async fromEnvFile(file: string) {
    const {default: fs} = await import('fs-extra')
    const fileExists = await fs.pathExists(file)
    if (!fileExists) {
      return new EnvironmentVariables
    }
    const contents = await fs.readFile(file)
    return EnvironmentVariables.fromEnvContents(contents)
  }
  static fromObject(object: Record<string, boolean | number | string | undefined>) {
    const environmentVariables = new EnvironmentVariables
    for (const [key, value] of Object.entries(object)) {
      if (value === undefined) {
        continue
      }
      environmentVariables.set(key, value)
    }
    return environmentVariables
  }
  static fromProcess() {
    const environmentVariables = new EnvironmentVariables
    for (const [key, value] of Object.entries(process.env)) {
      if (value === undefined) {
        continue
      }
      environmentVariables.set(key, EnvironmentVariables.parseValue(value))
    }
    return environmentVariables
  }
  static joinPaths(paths: Arrayable<string>, splitter = EnvironmentVariables.pathSplitter) {
    return Array.isArray(paths) ? paths.join(splitter) : paths
  }
  static merge(...environmentVariables: Array<EnvironmentVariables>) {
    const result = new EnvironmentVariables
    for (const environmentVariablesItem of environmentVariables) {
      for (const [key, value] of environmentVariablesItem.entries()) {
        result.set(key, value)
      }
    }
    return result
  }
  static parseValue(value: string) {
    const lowerValue = value.toLowerCase()
    if (lowerValue === 'true') {
      return true
    }
    if (lowerValue === 'false') {
      return false
    }
    if (/^-?\d+$/u.test(value)) {
      try {
        const proposedNumber = Number(value)
        if (Number.isSafeInteger(proposedNumber)) {
          return proposedNumber
        }
      } catch {}
    }
    return value
  }
  static splitPaths(value: string, splitter = EnvironmentVariables.pathSplitter) {
    return value.split(splitter)
  }
  addPathItem(item: Arrayable<string>, splitter = EnvironmentVariables.pathSplitter) {
    const currentPath = this.getPath(splitter)
    const isEmpty = currentPath.length === 0
    if (isEmpty) {
      this.setPath(item, splitter)
      return
    }
    currentPath.push(...Array.isArray(item) ? item : [item])
    this.setPath(currentPath, splitter)
  }
  getPath(splitter = EnvironmentVariables.pathSplitter) {
    const value = this.get(EnvironmentVariables.pathKey)
    if (typeof value === 'string') {
      return EnvironmentVariables.splitPaths(value, splitter)
    }
    const environmentValue = process.env[EnvironmentVariables.pathKey]
    if (typeof environmentValue === 'string') {
      return EnvironmentVariables.splitPaths(environmentValue, splitter)
    }
    return []
  }
  prependPathItem(item: Arrayable<string>, splitter = EnvironmentVariables.pathSplitter) {
    const currentPath = this.getPath(splitter)
    const isEmpty = currentPath.length === 0
    if (isEmpty) {
      this.setPath(item, splitter)
      return
    }
    currentPath.unshift(...Array.isArray(item) ? item : [item])
    this.setPath(currentPath, splitter)
  }
  setPath(value: Arrayable<string>, splitter = EnvironmentVariables.pathSplitter) {
    this.set(EnvironmentVariables.pathKey, Array.isArray(value) ? value.join(splitter) : value)
  }
  toEnvContents() {
    const lines = this.entries().map(([key, value]) => {
      return `${key}=${value}`
    }).toArray()
    return lines.join('\n')
  }
  toFinalObject() {
    return EnvironmentVariables.merge(EnvironmentVariables.fromProcess(), this).toObject()
  }
  toFinalStringObject() {
    return EnvironmentVariables.merge(EnvironmentVariables.fromProcess(), this).toStringObject()
  }
  toObject() {
    const object: Record<string, boolean | number | string> = {}
    for (const [key, value] of this) {
      object[key] = value
    }
    return object
  }
  toSorted(collator: Intl.Collator = new Intl.Collator('en')) {
    const sorted = new EnvironmentVariables
    const keys = this.keys().toArray().toSorted((a, b) => collator.compare(a, b))
    for (const key of keys) {
      const value = this.get(key)!
      sorted.set(key, value)
    }
    return sorted
  }
  toStringObject() {
    const object: Record<string, string> = {}
    for (const [key, value] of this) {
      object[key] = String(value)
    }
    return object
  }
}
