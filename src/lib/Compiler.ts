import type {InputOptions} from 'lib/package/make-options/src/index.ts'
import type {Dict, SecondParameter} from 'more-types'
import type {Arrayable} from 'type-fest'

import os from 'node:os'

import AdmZip from 'adm-zip'
import dedent from 'dedent'
import * as path from 'forward-slash-path'
import fs from 'fs-extra'
import * as lodash from 'lodash-es'
import {renderHandlebars} from 'zeug'

import {EnvironmentVariables} from 'lib/EnvironmentVariables.ts'
import * as ansi from 'lib/package/ansi-sequences/src/index.ts'
import {makeOptions} from 'lib/package/make-options/src/index.ts'

export type RunCommandOptions = Omit<NonNullable<SecondParameter<typeof Bun['spawn']>>, 'cmd' | 'cwd'> & {
  cwdExtra?: Arrayable<string>
}

type Options = InputOptions<{
  defaults: typeof defaultOptions
  optional: {
    clones: Arrayable<string>
    environmentVariables: Dict<string>
  }
  required: {
    folder: string
  }
}>

const defaultOptions = {
  gitOptions: {
    core: {
      longpaths: true,
      autocrlf: false,
      eol: 'lf',
      checkStat: 'minimal',
    },
    fetch: {
      negotiationAlgorithm: 'skipping',
    },
  } as Dict<Dict<boolean | number | string>>,
  cloneMethod: 'ssh' as 'direct' | 'https' | 'ssh',
  cacheClones: false,
  cacheFolder: process.env.GIT_CACHE_PATH ?? path.join(os.tmpdir(), 'node_compiler'),
  inheritEnvironmentVariables: true,
}

export class Compiler {
  environmentVariables = new EnvironmentVariables
  options: Options['normalized']
  constructor(options: Options['parameter']) {
    this.options = makeOptions<Options>(options, {
      requiredKeys: ['folder'],
      defaultOptions,
    })
    for (const [key, value] of Object.entries(this.options.environmentVariables ?? {})) {
      this.environmentVariables.set(key, value)
    }
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

  async applyPatch(fileRelative: Arrayable<string>, search: RegExp | string, replace: string) {
    const file = this.fromHere(...lodash.castArray(fileRelative))
    const exists = await fs.pathExists(file)
    if (!exists) {
      return
    }
    const content = await Bun.file(file).text()
    const rewritten = content.replace(search, replace)
    if (rewritten !== content) {
      await fs.writeFile(file, rewritten)
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
      const args = ['git', ...this.renderGitConfigToArgs(), 'clone', url, downloadTarget]
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
    const gitConfigFile = path.join(downloadTarget, '.gitconfig')
    const gitConfigContent = this.renderGitConfig()
    await fs.outputFile(gitConfigFile, gitConfigContent)
  }

  fromHere(...fileRelative: Array<string>) {
    if (fileRelative.length === 1 && path.isAbsolute(fileRelative[0])) {
      return fileRelative[0]
    }
    return path.join(this.options.folder, ...fileRelative)
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

  async hasFile(fileRelative: string) {
    const file = this.fromHere(fileRelative)
    return fs.pathExists(file)
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

  async outputEnv(fileRelative: string) {
    const file = this.fromHere(fileRelative)
    const content = this.environmentVariables.toEnvContents()
    await fs.outputFile(file, content)
  }

  async outputGitConfig(fileRelative: string) {
    const file = this.fromHere(fileRelative)
    const content = this.renderGitConfig()
    await fs.outputFile(file, content)
  }

  async patchEnvFile(fileRelative: string) {
    return this.patchEnvFileWith(fileRelative, this.environmentVariables)
  }

  async patchEnvFileWith(fileRelative: string, environmentVariables: EnvironmentVariables) {
    const file = this.fromHere(fileRelative)
    const originalContents = await fs.readFile(file, 'utf8')
    const originalEnvironment = EnvironmentVariables.fromEnvContents(originalContents)
    const mergedEnvironment = EnvironmentVariables.merge(originalEnvironment, environmentVariables)
    const newContents = mergedEnvironment.toEnvContents()
    if (newContents !== originalContents) {
      await fs.writeFile(file, newContents)
    }
  }

  async readFile(fileRelative: string) {
    const file = Bun.file(this.fromHere(fileRelative))
    return file.text()
  }

  async readFileBuffer(fileRelative: string) {
    const file = Bun.file(this.fromHere(fileRelative))
    return file.arrayBuffer()
  }

  /**
   * Converts `options.gitOptions` into a Git config file format
   */
  renderGitConfig() {
    const template = dedent`
      {{#each gitOptions}}
      [{{@key}}]
        {{#each this}}
        {{@key}} = {{this}}
        {{/each}}
      {{/each}}
    `
    const compiled = renderHandlebars(template, {gitOptions: this.options.gitOptions})
    return compiled.trim()
  }

  /**
   * Converts `options.gitOptions` into an array like `['-c', 'core.longpaths=true', '-c', 'core.autocrlf=false']`
   */
  renderGitConfigToArgs() {
    const args: Array<string> = []
    for (const [section, values] of Object.entries(this.options.gitOptions)) {
      for (const [key, value] of Object.entries(values)) {
        args.push('-c', `${section}.${key}=${value}`)
      }
    }
    return args
  }

  async runCommand(command: Arrayable<string>, options: RunCommandOptions = {}) {
    const {cwdExtra, ...bunOptions} = options
    const cwd = cwdExtra ? this.fromHere(...lodash.castArray(cwdExtra)) : this.options.folder
    const commandWithArgs = lodash.castArray(command)
    console.log(ansi.command(commandWithArgs))
    const environmentVariables = {
      ...this.environmentVariables.toFinalStringObject(),
      ...bunOptions.env,
    }
    const subprocess = Bun.spawn({
      stdout: 'inherit',
      stderr: 'inherit',
      ...bunOptions,
      env: environmentVariables,
      cwd,
      cmd: commandWithArgs,
    })
    await subprocess.exited
    if (subprocess.exitCode !== 0) {
      console.dir({subprocess}, {depth: null})
      throw new Error(`Command failed with exit code ${subprocess.exitCode}: ${commandWithArgs.join(' ')}`)
    }
    return subprocess
  }
}
