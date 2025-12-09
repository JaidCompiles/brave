import type {SecondParameter} from 'more-types'
import type {MaybeArray} from 'rollup'

import {pathToFileURL} from 'url'

import chalk from 'chalk'
import * as path from 'forward-slash-path'
import fs from 'fs-extra'
import * as lodash from 'lodash-es'
import prettyBytes from 'pretty-bytes'
import prettyMs from 'pretty-ms'
import createTerminalLink from 'terminal-link'

// See https://www.hackitu.de/termcolor256
export const fileStyle = chalk.ansi256(214)
export const folderStyle = chalk.ansi256(213)
export const numberStyle = chalk.ansi256(45)
export const stringStyle = chalk.ansi256(40)
export const deleteLine = '\u001B[2K\r'

export const bytesShort = (inputBytes: number, options?: SecondParameter<typeof prettyBytes>) => {
  const string = prettyBytes(inputBytes, options)
  const segment = string.replaceAll(/([\d,.]+)(\s+)?(\w+)/g, (_match, number, space, unit) => {
    const numberSegment = numberStyle(number)
    return `${numberSegment}${space}${unit}`
  })
  return segment
}

export const link = (text: string, url?: string) => {
  return createTerminalLink(text, url ?? text, {fallback: false})
}

export const fileLink = (inputFile: string, text?: string) => {
  return link(text || fileStyle(path.cleanPath(inputFile)), pathToFileURL(inputFile).href)
}

export const folderLink = (inputFolder: string, text?: string) => {
  return link(text || folderStyle(path.cleanPath(inputFolder)), pathToFileURL(inputFolder).href)
}

export const fileOrFolderLink = async (inputPath: string, text?: string) => {
  const stats = await fs.stat(inputPath)
  if (stats.isDirectory()) {
    return folderLink(inputPath, text)
  }
  return fileLink(inputPath, text)
}

export const folder = (inputFolder: string) => {
  const folderCleaned = path.cleanPath(inputFolder)
  return folderStyle(folderCleaned)
}

export const linkedFolder = (inputFolder: string) => {
  return link(folder(inputFolder), pathToFileURL(inputFolder).href)
}

export const fileName = (inputFile: string) => {
  const fileCleaned = path.basename(inputFile)
  return fileStyle(fileCleaned)
}

export const linkedFileName = (inputFile: string) => {
  return link(fileName(inputFile), pathToFileURL(inputFile).href)
}

export const file = (inputFile: string) => {
  const fileCleaned = path.cleanPath(inputFile)
  const indexBeforeName = path.indexBeforeName(fileCleaned)
  if (indexBeforeName === 0) {
    return fileStyle(fileCleaned)
  }
  const folderSegment = folderStyle(fileCleaned.slice(0, indexBeforeName))
  const fileSegment = fileStyle(fileCleaned.slice(indexBeforeName))
  return folderSegment + fileSegment
}

export const linkedFile = (inputFile: string) => {
  const fileCleaned = path.cleanPath(inputFile)
  const indexBeforeName = path.indexBeforeName(fileCleaned)
  if (indexBeforeName === 0) {
    return fileLink(fileCleaned)
  }
  const indexAfterParent = path.indexAfterParent(inputFile)
  const folderText = fileCleaned.slice(0, indexAfterParent! - 1)
  const folderSegment = folderLink(folderText)
  const connectionText = fileCleaned.slice(indexAfterParent! - 1, indexBeforeName)
  const connectionSegment = folderStyle(connectionText)
  const fileNameText = fileCleaned.slice(indexBeforeName)
  const fileNameSegment = linkedFileName(fileCleaned)
  return folderSegment + connectionSegment + fileNameSegment
}

export const folderName = (inputFolder: string) => {
  const folderCleaned = path.basename(inputFolder)
  return folderStyle(folderCleaned)
}

export const linkedFolderName = (inputFolder: string) => {
  return link(folderName(inputFolder), pathToFileURL(inputFolder).href)
}

export function fileWithSize(inputFile: string): Promise<string>
export function fileWithSize(inputFile: string, size: number): string
export function fileWithSize(inputFile: string, size?: number): Promise<string> | string {
  if (size === undefined) {
    return fs.stat(inputFile).then(stats => { // eslint-disable-line promise/prefer-await-to-then
      return fileWithSize(inputFile, stats.size)
    })
  }
  const sizeSegment = bytesShort(size)
  const fileSegment = file(inputFile)
  return `${sizeSegment} ${fileSegment}`
}

export function linkedFileWithSize(inputFile: string): Promise<string>
export function linkedFileWithSize(inputFile: string, size: number): string
export function linkedFileWithSize(inputFile: string, size?: number): Promise<string> | string {
  if (size === undefined) {
    return fs.stat(inputFile).then(stats => { // eslint-disable-line promise/prefer-await-to-then
      return linkedFileWithSize(inputFile, stats.size)
    })
  }
  const sizeSegment = bytesShort(size)
  const fileSegment = linkedFile(inputFile)
  return `${sizeSegment} ${fileSegment}`
}

export const integer = (inputNumber: number) => {
  const numberString = Math.trunc(inputNumber).toLocaleString('en', {
    useGrouping: inputNumber >= 10_000,
  })
  return numberStyle(numberString)
}

export const string = (inputString: string) => {
  return stringStyle(inputString)
}

export const bytes = (inputBytes: number) => {
  const segment = integer(inputBytes)
  return `${segment}b`
}

export const numeric = (inputNumber: number, fractionPlaces: true | number = true) => {
  let numberString: string
  if (fractionPlaces === 0) {
    return integer(inputNumber)
  } else if (fractionPlaces !== true) {
    numberString = inputNumber.toLocaleString(undefined, {maximumFractionDigits: fractionPlaces})
  } else {
    numberString = inputNumber.toLocaleString()
  }
  return numberStyle(numberString)
}

export const percent = (inputNumber: number, fractionPlaces: true | number = true) => {
  const segment = numeric(inputNumber * 100, fractionPlaces)
  return `${segment}%`
}

export const seconds = (inputMs: number, fractionPlaces: true | number = true) => {
  const segment = numeric(inputMs / 1000, fractionPlaces)
  return `${segment}s`
}

export const ms = (inputMs: number) => {
  const string = prettyMs(inputMs)
  const segment = string.replaceAll(/([\d,.]+)(\s+)?(\w+)/g, (_match, number, _space, unit) => {
    let numberSegment = integer(Number(number))
    if (number === '0' && unit === 'ms' && inputMs > 0 && inputMs < 1) {
      numberSegment = `>${numberSegment}`
    }
    return `${numberSegment}${unit}`
  })
  return segment
}

type EscapeFunction = (argument: string, index?: number) => string

const bashEscape: EscapeFunction = (argument, _index) => {
  const forbiddenChars = /[\s$&\\]/
  if (forbiddenChars.test(argument)) {
    const hasSingleQuotes = argument.includes('\'')
    if (!hasSingleQuotes) {
      return `'${argument}'`
    }
    const hasDoubleQuotes = argument.includes('"')
    if (!hasDoubleQuotes) {
      return `"${argument}"`
    }
    const innerText = argument.replaceAll('\'', '\'"\'"\'')
    return `'${innerText}'`
  }
  return argument
}
const powershellEscape: EscapeFunction = (argument, index) => {
  const forbiddenChars = /\s/g
  if (index === 0) {
    return argument.replaceAll(forbiddenChars, '`$&').replaceAll('`', '``')
  }
  return bashEscape(argument, index).replaceAll('`', '``')
}

export const command = (inputCommand: MaybeArray<string>, replacer: EscapeFunction | undefined = powershellEscape) => {
  const input = lodash.castArray(inputCommand).flat()
  const segments = input.map(String).map((argument, index) => {
    const text = replacer ? replacer(argument, index) : argument
    if (index === 0) {
      return fileStyle(path.cleanPath(text))
    }
    if (text.startsWith('-')) {
      return chalk.ansi256(8)(text)
    }
    return text
  })
  return segments.join(' ')
}

export const make = (staticStrings: TemplateStringsArray, ...values: Array<unknown>) => {
  return staticStrings.reduce((result, staticString, i) => {
    if (i >= values.length) {
      return result + staticString
    }
    let value = values[i]
    if (typeof value === 'number') {
      if (Number.isInteger(value)) {
        value = integer(value)
      } else {
        value = numeric(value)
      }
    } else if (typeof value === 'string') {
      value = string(value)
    } else {
      value = String(value)
    }
    return result + staticString + value
  }, '')
}
