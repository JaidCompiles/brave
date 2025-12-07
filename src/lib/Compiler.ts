import type {InputOptions} from 'lib/package/make-options/src/index.ts'
import type {Dict, SecondParameter} from 'more-types'
import type {Arrayable} from 'type-fest'

import AdmZip from 'adm-zip'
import * as path from 'forward-slash-path'
import fs from 'fs-extra'
import * as lodash from 'lodash-es'

import {makeOptions} from 'lib/package/make-options/src/index.ts'

export type RunCommandOptions = Omit<NonNullable<SecondParameter<typeof Bun['spawn']>>, 'cmd' | 'cwd'> & {
  cwdExtra?: string
}

type Options = InputOptions<{
  defaults: typeof defaultOptions
  optional: {
    clones: Arrayable<string>
  }
  required: {
    folder: string
  }
}>

const defaultOptions = {
  gitOptions: {
    'core.longpaths': 'true',
  } as Dict<string>,
  cloneMethod: 'ssh' as 'direct' | 'https' | 'ssh',
  cacheClones: false,
  cacheFolder: path.fromTemp('node_compiler') as string,
}

export class Compiler {
  options: Options['normalized']
  constructor(options: Options['parameter']) {
    this.options = makeOptions<Options>(options)
    console.dir({options: this.options}, {depth: null})
  }

  async addEnvironmentVariable(environmentPath: string, key: string, value: string) {
    await fs.ensureFile(environmentPath)
    const current = await fs.readFile(environmentPath, 'utf8')
    const line = `${key}=${value}`
    const pattern = new RegExp(`^${key}=.*$`, 'm')
    const next = pattern.test(current) ? current.replace(pattern, line) : `${current.trimEnd()}\n${line}\n`
    await fs.writeFile(environmentPath, next)
  }

  async applyPatch(filePath: string, search: RegExp | string, replace: string) {
    if (!await this.hasFile(filePath)) {
      return
    }
    const content = await Bun.file(filePath).text()
    const rewritten = content.replace(search, replace)
    if (rewritten !== content) {
      await fs.writeFile(filePath, rewritten)
    }
  }

  /**
   * Will put a GitHub repo's contents into {folder}/git/{owner}/{repo}
   *
   * If cache is enabled, will also keep an untouched copy in $TEMP/node_compiler/git/{owner}/{repo}
   */
  async cloneGithubRepo(slug: string, method?: 'direct' | 'https' | 'ssh') {
    const cacheGitFolder = path.join(this.options.cacheFolder, 'git')
    const realGitFolder = this.fromHere('git')
    const parentFolder = this.options.cacheClones ? cacheGitFolder : realGitFolder
    const targetFolder = path.join(parentFolder, slug.split('/')[1])
    if (this.options.cacheClones) {
      const exists = await fs.pathExists(this.fromHere(`git_cache/${slug.split('/')[1]}`))
      if (exists) {
        await fs.copy(this.fromHere(`git_cache/${slug.split('/')[1]}`), this.fromHere(`git/${slug.split('/')[1]}`))
        console.log(`Used cached clone for ${slug}`)
        return
      }
    }
    await fs.emptyDir(targetFolder)
    if (method === 'ssh') {
      await this.runCommand(['git', 'clone', `ssh://git@github.com/${slug}.git`], {
        cwdExtra: 'git',
      })
    } else if (method === 'https') {
      await this.runCommand(['git', 'clone', `https://github.com/${slug}.git`], {
        cwdExtra: 'git',
      })
    } else {
      const url = `https://github.com/${slug}/archive/HEAD.zip`
      const response = await fetch(url)
      if (!response.ok) {
        throw new Error(`Failed to download repo from ${url}: ${response.statusText}`)
      }
      const buffer = await response.arrayBuffer()
      const zip = new AdmZip(Buffer.from(buffer))
      const temporaryFolder = path.join(parentFolder, `temp-${Date.now()}`)
      zip.extractAllTo(temporaryFolder, true)
      const entries = await fs.readdir(temporaryFolder)
      if (entries.length === 1) {
        const rootPath = path.join(temporaryFolder, entries[0])
        const rootStats = await fs.stat(rootPath)
        if (rootStats.isDirectory()) {
          await fs.copy(rootPath, targetFolder)
          await fs.remove(temporaryFolder)
          return
        }
      }
      await fs.copy(temporaryFolder, targetFolder)
      await fs.remove(temporaryFolder)
    }
    if (this.options.cacheClones) {
      await fs.copy(this.fromHere(`git_cache/${slug.split('/')[1]}`), this.fromHere(`git/${slug.split('/')[1]}`))
    }
  }

  fromHere(...pathRelative: Array<string>) {
    return path.join(this.options.folder, ...pathRelative)
  }

  async hasFile(pathRelative: string) {
    return fs.pathExists(this.fromHere(pathRelative))
  }

  async init() {
    await fs.emptyDir(this.options.folder)
    if (this.options.clones) {
      const gitFolder = this.fromHere('git')
      await fs.emptyDir(gitFolder)
      for (const [key, value] of Object.entries(this.options.gitOptions)) {
        await this.runCommand(['git', 'config', '--local', key, value], {cwdExtra: 'git'})
      }
      const clones = lodash.castArray(this.options.clones)
      for (const slug of clones) {
        await this.cloneGithubRepo(slug)
      }
    }
  }

  async readFile(pathRelative: string) {
    return Bun.file(this.fromHere(pathRelative)).text()
  }

  async runCommand(command: Arrayable<string>, options: RunCommandOptions = {}) {
    const cwd = options.cwdExtra ? this.fromHere(options.cwdExtra) : this.options.folder
    const commandWithArgs = lodash.castArray(command)
    const subprocess = Bun.spawn({
      cmd: commandWithArgs,
      cwd,
      stdout: 'inherit',
      stderr: 'inherit',
      ...options,
    })
    const exitCode = await subprocess.exited
    if (exitCode !== 0) {
      throw new Error(`Command failed (${exitCode}): ${commandWithArgs.join(' ')}`)
    }
  }
}
