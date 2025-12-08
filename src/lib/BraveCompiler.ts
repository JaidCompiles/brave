import os from 'os'

import * as path from 'forward-slash-path'
import fs from 'fs-extra'
import {replaceInFile} from 'replace-in-file'

import {Compiler} from './Compiler.ts'

export class BraveCompiler extends Compiler {
  static gnOptions = {
    enable_ai_chat: false,
    enable_brave_ai_chat_agent_profile: false,
    service_key_aichat: 'dummy',
    service_key_stt: 'dummy',
    updater_dev_endpoint: 'dummy',
    updater_prod_endpoint: 'dummy',
    brave_services_key_id: 'dummy',
    brave_stats_updater_url: 'dummy',
    brave_variations_server_url: 'dummy',
    bitflyer_production_client_id: 'dummy',
    bitflyer_production_client_secret: 'dummy',
    bitflyer_production_fee_address: 'dummy',
    bitflyer_production_url: 'dummy',
    gemini_production_api_url: 'dummy',
    gemini_production_client_id: 'dummy',
    gemini_production_client_secret: 'dummy',
    gemini_production_fee_address: 'dummy',
    gemini_production_oauth_url: 'dummy',
    uphold_production_api_url: 'dummy',
    uphold_production_client_id: 'dummy',
    uphold_production_client_secret: 'dummy',
    uphold_production_fee_address: 'dummy',
    uphold_production_oauth_url: 'dummy',
    zebpay_production_api_url: 'dummy',
    zebpay_production_client_id: 'dummy',
    zebpay_production_client_secret: 'dummy',
    zebpay_production_oauth_url: 'dummy',
    rewards_grant_dev_endpoint: 'dummy',
    rewards_grant_staging_endpoint: 'dummy',
    rewards_grant_prod_endpoint: 'dummy',
    extra_cflags: ['-march=native'],
    extra_cflags_cxx: ['-march=native'],
    extra_ldflags: ['-march=native'],
  }
  braveCoreCacheFolder = path.join(os.tmpdir(), 'node_compiler', 'git', 'brave', 'brave-core')
  buildConfig = 'Release'
  repo = 'brave/brave-browser'
  targetArch = 'x64'
  targetOs = 'win'
  npmScriptFile = 'C:/portable/node/24.11.1/node_modules/npm/bin/npm-cli.js'
  constructor(options?: ConstructorParameters<typeof Compiler>[0]) {
    super({
      cloneMethod: 'direct',
      folder: path.join(import.meta.dir, '..', '..', 'temp', 'brave'),
      cacheClones: true,
      ...options,
      clones: ['brave/brave-browser'],
    })
    this.environmentVariables.set('NODE', 'C:/portable/node/24.11.1/node.exe')
    this.environmentVariables.set('npm_node_execpath', 'C:/portable/node/24.11.1/node.exe')
    this.environmentVariables.set('npm_execpath', this.npmScriptFile)
    this.environmentVariables.set('NODE_PATH', 'C:/portable/node/24.11.1/node_modules')
    this.environmentVariables.set('ENABLE_AI_CHAT', false)
    this.environmentVariables.set('ENABLE_BRAVE_AI_CHAT_AGENT_PROFILE', false)
    this.environmentVariables.addPathItem('C:/portable/node/24.11.1')
    this.environmentVariables.addPathItem('C:/portable/node/24.11.1/node_modules/npm/bin')
    console.dir({compiler: this, env: this.environmentVariables.toFinalObject()}, {depth: null})
  }

  get braveBrowserFolder() {
    return this.fromHere('git', 'brave', 'brave-browser')
  }

  get braveCoreFolder() {
    return this.fromHere('git', 'brave', 'brave-browser', 'src', 'brave')
  }

  get outputFile() {
    return this.fromHere('..', 'out', 'brave.exe')
  }

  async copyBuiltExecutable() {
    // It is seemingly always the first one, so we may be able to remove this complexity later
    const candidates = [
      this.fromChromiumFolder('out', this.buildConfig, 'brave.exe'),
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
    await this.patchAiChatFeature()
  }

  fromBraveBrowserFolder(...fileRelative: Array<string>) {
    return this.fromHere('git', 'brave', 'brave-browser', ...fileRelative)
  }

  fromBraveCoreFolder(...fileRelative: Array<string>) {
    return this.fromHere('git', 'brave', 'brave-browser', 'src', 'brave', ...fileRelative)
  }

  fromChromiumFolder(...fileRelative: Array<string>) {
    return this.fromHere('git', 'brave', 'brave-browser', 'src', ...fileRelative)
  }

  async patchAiChatFeature() {
    const file = path.join(this.braveCoreFolder, 'components', 'ai_chat', 'core', 'common', 'features.cc')
    const from = /BASE_FEATURE\(\s*kAIChat\s*,\s*base::FEATURE_ENABLED_BY_DEFAULT\s*\);/
    const to = 'BASE_FEATURE(kAIChat, base::FEATURE_DISABLED_BY_DEFAULT);'
    await this.applyPatch(file, from, to)
  }

  async run() {
    await this.init()
    await this.applyPatch(this.fromBraveBrowserFolder('scripts', 'init.js'), "util.run(npmCommand, ['install'], { cwd: braveCoreDir })", "process.exit(0); // util.run(npmCommand, ['install'], { cwd: braveCoreDir })")
    const cacheFolderExists = await fs.pathExists(this.braveCoreCacheFolder)
    if (cacheFolderExists) {
      const file = this.fromBraveBrowserFolder('package.json')
      const from = /https:\/\/github\.com\/brave\/brave-core\.git/g
      const to = `file://${this.braveCoreCacheFolder}`
      await this.applyPatch(file, from, to)
    }
    await this.runCommand(['node', this.npmScriptFile, 'install'], {
      cwdExtra: this.braveBrowserFolder,
    })
    await this.runCommand(['node', this.npmScriptFile, 'run', 'init', '--', `--target_os=${this.targetOs}`, `--target_arch=${this.targetArch}`], {
      cwdExtra: this.braveBrowserFolder,
    })
    await this.runCommand(['node', this.npmScriptFile, 'install'], {
      cwdExtra: this.braveCoreFolder,
    })
    await this.runCommand(['node', this.npmScriptFile, 'run', 'sync', '--', '--init', `--target_os=${this.targetOs}`, `--target_arch=${this.targetArch}`], {
      cwdExtra: this.braveBrowserFolder,
    })
    await this.patchEnvFile(this.fromBraveCoreFolder('.env'))
    await this.disableBraveLeo()
    const gnArgs = Object.entries(BraveCompiler.gnOptions).flatMap(([key, value]) => {
      const optionKey = key
      const optionValue = JSON.stringify(value)
      return ['--gn', `${optionKey}:${optionValue}`]
    })
    await this.runCommand(['node', this.npmScriptFile, 'run', 'build', '--', this.buildConfig, `--target_os=${this.targetOs}`, `--target_arch=${this.targetArch}`, ...gnArgs], {
      cwdExtra: this.braveCoreFolder,
    })
    await this.copyBuiltExecutable()
  }
}
