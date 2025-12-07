import type {InputOptions} from 'lib/package/make-options/src/index.ts'
import type {Dict, SecondParameter} from 'more-types'
import type {Arrayable} from 'type-fest'

import os from 'node:os'

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
  cacheFolder: path.join(os.tmpdir(), 'node_compiler'),
}

export class Compiler {
  options: Options['normalized']
  constructor(options: Options['parameter']) {
    this.options = makeOptions<Options>(options, {
      requiredKeys: ['folder'],
      defaultOptions,
    })
  }

  async addEnvironmentVariable(environmentPath: string, key: string, value: string) {
    const fullPath = path.isAbsolute(environmentPath) ? environmentPath : this.fromHere(environmentPath)
    await fs.ensureFile(fullPath)
    const current = await fs.readFile(fullPath, 'utf8')
    const line = `${key}=${value}`
    const safeKey = key.replaceAll(/[$()*+.?[\\\]^{|}]/g, String.raw`\$&`)
    const pattern = new RegExp(`^${safeKey}=.*$`, 'm')
    const next = pattern.test(current) ? current.replace(pattern, line) : `${current.trimEnd()}\n${line}\n`
    await fs.writeFile(fullPath, next)
  }

  async applyPatch(filePath: string, search: RegExp | string, replace: string) {
    if (!await this.hasFile(filePath)) {
      return
    }
    const fullPath = this.fromHere(filePath)
    const content = await Bun.file(fullPath).text()
    const rewritten = content.replace(search, replace)
    if (rewritten !== content) {
      await fs.writeFile(fullPath, rewritten)
    }
  }

  /**
   * Will put a GitHub repo's contents into {folder}/git/{owner}/{repo}
   *
   * If cache is enabled, will also keep an untouched copy in $TEMP/node_compiler/git/{owner}/{repo}
   */
  async cloneGithubRepo(slug: string, method: 'direct' | 'https' | 'ssh' = this.options.cloneMethod) {
    const [owner, repo] = slug.split('/')
    if (!repo) {
      throw new Error(`Invalid slug: ${slug}`)
    }
    const projectTarget = this.getRepoFolder(slug)
    const cacheTarget = this.getRepoFolder(slug, 'cache')
    const downloadTarget = this.options.cacheClones ? cacheTarget : projectTarget
    if (this.options.cacheClones) {
      if (await fs.pathExists(cacheTarget)) {
        await fs.emptyDir(projectTarget)
        await fs.copy(cacheTarget, projectTarget)
        console.log(`Used cached clone for ${slug}`)
        return
      }
    }
    await fs.emptyDir(downloadTarget)
    const useGit = method === 'ssh' || method === 'https'
    if (useGit) {
      const url = method === 'ssh' ? `ssh://git@github.com/${slug}.git` : `https://github.com/${slug}.git`
      const args = ['git', 'clone', url, downloadTarget]
      for (const [key, value] of Object.entries(this.options.gitOptions)) {
        args.push('-c', `${key}=${value}`)
      }
      await this.runCommand(args)
    } else {
      const url = `https://github.com/${slug}/archive/HEAD.zip`
      const response = await fetch(url)
      if (!response.ok) {
        throw new Error(`Failed to download repo from ${url}: ${response.statusText}`)
      }
      const buffer = await response.arrayBuffer()
      const zip = new AdmZip(Buffer.from(buffer))
      const temporaryExtractFolder = path.join(path.dirname(downloadTarget), `temp-${Date.now()}`)
      await fs.ensureDir(temporaryExtractFolder)
      zip.extractAllTo(temporaryExtractFolder, true)
      const entries = await fs.readdir(temporaryExtractFolder)
      if (entries.length === 1) {
        const rootPath = path.join(temporaryExtractFolder, entries[0])
        const rootStats = await fs.stat(rootPath)
        if (rootStats.isDirectory()) {
          await fs.copy(rootPath, downloadTarget)
        } else {
          await fs.copy(temporaryExtractFolder, downloadTarget)
        }
      } else {
        await fs.copy(temporaryExtractFolder, downloadTarget)
      }
      await fs.remove(temporaryExtractFolder)
    }
    if (this.options.cacheClones) {
      await fs.emptyDir(projectTarget)
      await fs.copy(cacheTarget, projectTarget)
    }
  }

  fromHere(...pathRelative: Array<string>) {
    return path.join(this.options.folder, ...pathRelative)
  }

  getRepoFolder(repo: [string, string] | string, role: 'cache' | 'real' = 'real') {
    let owner: string
    let name: string
    if (typeof repo === 'string') {
      [owner, name] = repo.split('/')
    } else {
      [owner, name] = repo
    }
    if (role === 'cache') {
      return path.join(this.options.cacheFolder, 'git', owner, name)
    }
    return this.fromHere('git', owner, name)
  }

  async hasFile(pathRelative: string) {
    return fs.pathExists(this.fromHere(pathRelative))
  }

  async init() {
    await fs.emptyDir(this.options.folder)
    if (this.options.clones) {
      const gitFolder = this.fromHere('git')
      await fs.emptyDir(gitFolder)
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
    const {cwdExtra, ...bunOptions} = options
    const cwd = cwdExtra ? this.fromHere(cwdExtra) : this.options.folder
    await fs.ensureDir(cwd)
    const commandWithArgs = lodash.castArray(command)
    const subprocess = Bun.spawn({
      cmd: commandWithArgs,
      cwd,
      stdout: 'inherit',
      stderr: 'inherit',
      ...bunOptions,
    })
    const exitCode = await subprocess.exited
    if (exitCode !== 0) {
      throw new Error(`Command failed (${exitCode}): ${commandWithArgs.join(' ')}`)
    }
  }
}
