import * as path from 'forward-slash-path'
import fs from 'fs-extra'

import {Compiler} from './Compiler.ts'

export class BraveCompiler extends Compiler {
  buildConfig = 'Release'
  gitEnvironment = process.env
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

  get braveCoreFolder() {
    return path.join(this.targetRepoPath, 'src', 'brave')
  }

  get outputFile() {
    return this.fromHere('..', 'out', 'brave.exe')
  }

  get targetRepoPath() {
    const [owner, name] = this.repo.split('/')
    return path.join(this.fromHere('git'), owner, name)
  }

  async copyBuiltExecutable() {
    const candidates = [
      path.join(this.braveCoreFolder, '..', 'out', this.buildConfig, 'brave.exe'),
      path.join(this.braveCoreFolder, '..', 'out', `${this.buildConfig}_${this.targetArch}`, 'brave.exe'),
      path.join(this.braveCoreFolder, '..', 'out', `${this.targetOs}_${this.buildConfig}`, 'brave.exe'),
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

  async patchAiChatFeature() {
    const featuresFile = path.join(this.braveCoreFolder, 'components', 'ai_chat', 'core', 'common', 'features.cc')
    await this.applyPatch(featuresFile, /BASE_FEATURE\(\s*kAIChat\s*,\s*base::FEATURE_ENABLED_BY_DEFAULT\s*\);/, 'BASE_FEATURE(kAIChat, base::FEATURE_DISABLED_BY_DEFAULT);')
  }

  async run() {
    await this.init()
    await this.runCommand(['C:/portable/node/24.5.0/npm.cmd', 'install'], {
      cwdExtra: this.targetRepoPath,
      env: this.gitEnvironment,
    })
    await this.runCommand(['C:/portable/node/24.5.0/npm.cmd', 'run', 'init', '--', `--target_os=${this.targetOs}`, `--target_arch=${this.targetArch}`], {
      cwdExtra: this.targetRepoPath,
      env: this.gitEnvironment,
    })
    await this.disableBraveLeo()
    const gnArgs = [
      'enable_ai_chat=false',
      'enable_brave_ai_chat_agent_profile=false',
      'extra_cflags=["-march=native"]',
      'extra_cflags_cxx=["-march=native"]',
      'extra_ldflags=["-march=native"]',
    ]
    await this.runCommand([
      'node',
      './build/commands/scripts/commands.js',
      'build',
      this.buildConfig,
      `--target_os=${this.targetOs}`,
      `--target_arch=${this.targetArch}`,
      ...gnArgs.flatMap(argument => ['--gn', argument]),
    ], {cwdExtra: this.braveCoreFolder})
    await this.copyBuiltExecutable()
  }
}
