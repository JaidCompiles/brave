import os from 'os'

import * as path from 'forward-slash-path'
import fs from 'fs-extra'
import {replaceInFile} from 'replace-in-file'

import {Compiler} from './Compiler.ts'

export class BraveCompiler extends Compiler {
  braveCoreCacheFolder = path.join(os.tmpdir(), 'node_compiler', 'git', 'brave', 'brave-core')
  buildConfig = 'Release'
  repo = 'brave/brave-browser'
  targetArch = 'x64'
  targetOs = 'win'
  constructor(options?: ConstructorParameters<typeof Compiler>[0]) {
    super({
      cloneMethod: 'direct',
      folder: path.join(import.meta.dir, '..', '..', 'temp', 'brave'),
      cacheClones: true,
      ...options,
      clones: ['brave/brave-browser'],
    })
    console.dir({options: this.options}, {depth: null})
  }

  get braveBrowserFolder() {
    return this.fromHere(...this.braveBrowserFolderSegments)
  }

  get braveBrowserFolderSegments() {
    return ['git', 'brave', 'brave-browser']
  }

  get braveCoreFolder() {
    return this.fromHere(...this.braveCoreFolderSegments)
  }

  get braveCoreFolderSegments() {
    return ['git', 'brave', 'brave-browser', 'src', 'brave']
  }

  get outputFile() {
    return this.fromHere('..', 'out', 'brave.exe')
  }

  async copyBuiltExecutable() {
    const candidates = [
      this.fromHere('..', 'out', this.buildConfig, 'brave.exe'),
      this.fromHere('..', 'out', `${this.buildConfig}_${this.targetArch}`, 'brave.exe'),
      this.fromHere('..', 'out', `${this.targetOs}_${this.buildConfig}`, 'brave.exe'),
    ]
    const candidateResults = await Promise.all(candidates.map(async file => {
      if (await fs.pathExists(file)) {
        return file
      }
      return null
    }))
    const resolved = candidateResults.find(Boolean)
    if (!resolved) {
      throw new Error('Could not find built brave.exe after the build finished')
    }
    await fs.ensureDir(path.dirname(this.outputFile))
    await fs.copyFile(resolved, this.outputFile)
  }

  async disableBraveLeo() {
    const environmentPath = path.join(this.braveCoreFolder, '.env')
    await this.addEnvironmentVariable(environmentPath, 'ENABLE_AI_CHAT', 'false')
    await this.addEnvironmentVariable(environmentPath, 'ENABLE_BRAVE_AI_CHAT_AGENT_PROFILE', 'false')
    await this.patchAiChatFeature()
  }

  getEnvironment() {
    const pathKey = Object.keys(process.env).find(key => key.toLowerCase() === 'path') ?? 'PATH'
    if (!process.env[pathKey]) {
      throw new Error('PATH environment variable is not set')
    }
    const originalPath = process.env[pathKey].split(';')
    const pathExtra = [
      'C:/portable/node/24.11.1',
      'C:/portable/node/24.11.1/node_modules/npm/bin',
    ]
    return {
      ...process.env,
      [pathKey]: [...pathExtra, ...originalPath].join(';'),
      NODE: 'C:/portable/node/24.11.1/node.exe',
      npm_node_execpath: 'C:/portable/node/24.11.1/node.exe',
      npm_execpath: 'C:/portable/node/24.11.1/node_modules/npm/bin/npm-cli.js',
    }
  }

  async patchAiChatFeature() {
    const featuresFileSegments = [...this.braveCoreFolderSegments, 'components', 'ai_chat', 'core', 'common', 'features.cc']
    await this.applyPatch(featuresFileSegments, /BASE_FEATURE\(\s*kAIChat\s*,\s*base::FEATURE_ENABLED_BY_DEFAULT\s*\);/, 'BASE_FEATURE(kAIChat, base::FEATURE_DISABLED_BY_DEFAULT);')
  }

  async run() {
    await this.init()
    const cacheFolderExists = await fs.pathExists(this.braveCoreCacheFolder)
    if (cacheFolderExists) {
      await replaceInFile({
        files: this.fromHere(...this.braveBrowserFolderSegments, 'package.json'),
        from: /https:\/\/github\.com\/brave\/brave-core\.git/g,
        to: `file://${this.braveCoreCacheFolder}`,
      })
    }
    const environment = this.getEnvironment()
    await this.runCommand(['node', environment.npm_execpath, 'install'], {
      cwdExtra: this.braveBrowserFolderSegments,
      env: environment,
    })
    await this.runCommand(['node', environment.npm_execpath, 'run', 'init', '--', `--target_os=${this.targetOs}`, `--target_arch=${this.targetArch}`], {
      cwdExtra: this.braveBrowserFolderSegments,
      env: environment,
    })
    await this.runCommand(['node', environment.npm_execpath, 'install'], {
      cwdExtra: this.braveCoreFolderSegments,
      env: environment,
    })
    // await this.disableBraveLeo()
    // const gnArgs = [
    //   'enable_ai_chat=false',
    //   'enable_brave_ai_chat_agent_profile=false',
    //   'extra_cflags=["-march=native"]',
    //   'extra_cflags_cxx=["-march=native"]',
    //   'extra_ldflags=["-march=native"]',
    // ]
    await this.runCommand([
      'node',
      './build/commands/scripts/commands.js',
      'build',
      this.buildConfig,
      `--target_os=${this.targetOs}`,
      `--target_arch=${this.targetArch}`,
      // ...gnArgs.flatMap(argument => ['--gn', argument]),
    ], {
      cwdExtra: this.braveCoreFolderSegments,
      env: environment,
    })
    await this.copyBuiltExecutable()
  }
}
