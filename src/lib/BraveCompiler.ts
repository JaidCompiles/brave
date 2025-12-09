import os from 'os'
import * as util from 'util'

import * as path from 'forward-slash-path'
import fs from 'fs-extra'

import {Compiler} from './Compiler.ts'

const debug = util.debuglog('BraveCompiler')

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
  }
  braveBrowserFolder: string
  braveCoreCacheFolder = path.join(os.tmpdir(), 'node_compiler', 'git', 'brave', 'brave-core')
  braveCoreFolder: string
  buildConfig = 'Release'
  chromiumFolder: string
  nodeInstallationFolder = 'C:/portable/node/24.11.1'
  nodeExecutableFile = path.join(this.nodeInstallationFolder, 'node.exe')
  npmScriptFile = path.join(this.nodeInstallationFolder, 'node_modules', 'npm', 'bin', 'npm-cli.js')
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
    this.braveBrowserFolder = this.fromHere('git', 'brave', 'brave-browser')
    this.chromiumFolder = path.join(this.braveBrowserFolder, 'src')
    this.braveCoreFolder = path.join(this.braveBrowserFolder, 'src', 'brave')
    this.environmentVariables.set(this.nodeExecutableFile, this.nodeExecutableFile)
    this.environmentVariables.set('npm_node_execpath', this.nodeExecutableFile)
    this.environmentVariables.set('npm_execpath', this.npmScriptFile)
    this.environmentVariables.set('NODE_PATH', path.join(this.nodeInstallationFolder, 'node_modules'))
    this.environmentVariables.set('npm_package_engines_node', '>=24.11.1 <25.0.0')
    this.environmentVariables.set('DEPOT_TOOLS_UPDATE', '0')
    this.environmentVariables.set('GIT_CEILING_DIRECTORIES', this.braveBrowserFolder)
    this.environmentVariables.set('ENABLE_AI_CHAT', false)
    this.environmentVariables.set('ENABLE_BRAVE_AI_CHAT_AGENT_PROFILE', false)
    this.environmentVariables.set('BRAVE_SERVICES_KEY', 'dummy')
    this.environmentVariables.set('GOOGLE_API_KEY', 'dummy')
    this.environmentVariables.set('GOOGLE_DEFAULT_CLIENT_ID', 'dummy')
    this.environmentVariables.set('GOOGLE_DEFAULT_CLIENT_SECRET', 'dummy')
    this.environmentVariables.prependPathItem(path.join(this.nodeInstallationFolder, 'node_modules', 'npm', 'bin'))
    this.environmentVariables.prependPathItem(this.nodeInstallationFolder)
    console.dir({
      compiler: this,
      env: this.environmentVariables.toFinalObject(),
    }, {depth: null})
  }

  get outputFile() {
    return this.fromHere('..', 'out', 'brave.exe')
  }

  async applyCustomizations() {
    debug('Disabling Brave Sync')
    await this.applyPatch(this.fromBraveCoreFolder('components', 'brave_sync', 'features.cc'), /BASE_FEATURE\(\s*kBraveSync\s*,\s*base::FEATURE_ENABLED_BY_DEFAULT\s*\);/, 'BASE_FEATURE(kBraveSync, base::FEATURE_DISABLED_BY_DEFAULT);')
    debug('Disabling Memory Saver (High Efficiency Mode)')
    await this.applyPatch(this.fromChromiumFolder('components', 'performance_manager', 'public', 'features.cc'), /BASE_FEATURE\(\s*kHighEfficiencyModeAvailable\s*,\s*base::FEATURE_ENABLED_BY_DEFAULT\s*\);/, 'BASE_FEATURE(kHighEfficiencyModeAvailable, base::FEATURE_DISABLED_BY_DEFAULT);')
    debug('Enabling Wide Address Bar by default')
    await this.applyPatch(this.fromBraveCoreFolder('browser', 'brave_profile_prefs.cc'), /registry->RegisterBooleanPref\(kLocationBarIsWide,\s*false\);/, 'registry→RegisterBooleanPref(kLocationBarIsWide, true);')
  }

  async copyBuiltExecutable() {
    const inputFile = this.fromChromiumFolder('out', this.buildConfig, 'brave.exe')
    const outputFolder = path.dirname(this.outputFile)
    await fs.ensureDir(outputFolder)
    await fs.copyFile(inputFile, this.outputFile)
  }

  async disableBraveLeo() {
    await this.patchAiChatFeature()
  }

  fromBraveBrowserFolder(...fileRelative: Array<string>) {
    return path.join(this.braveBrowserFolder, ...fileRelative)
  }

  fromBraveCoreFolder(...fileRelative: Array<string>) {
    return path.join(this.braveCoreFolder, ...fileRelative)
  }

  fromChromiumFolder(...fileRelative: Array<string>) {
    return path.join(this.chromiumFolder, ...fileRelative)
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
    await this.runCommand([this.nodeExecutableFile, this.npmScriptFile, 'install'], {
      cwdExtra: this.braveBrowserFolder,
    })
    await this.runCommand([this.nodeExecutableFile, this.npmScriptFile, 'run', 'init', '--', `--target_os=${this.targetOs}`, `--target_arch=${this.targetArch}`], {
      cwdExtra: this.braveBrowserFolder,
    })
    await this.runCommand([this.nodeExecutableFile, this.npmScriptFile, 'install'], {
      cwdExtra: this.braveCoreFolder,
    })
    debug('Initializing src as a git repo to satisfy gclient')
    await this.runCommand(['git', 'init'], {cwdExtra: this.fromChromiumFolder()})
    await this.runCommand(['git', 'remote', 'add', 'origin', 'https://github.com/brave/chromium'], {cwdExtra: this.fromChromiumFolder()})
    await this.runCommand(['git', 'commit', '--allow-empty', '-m', 'init'], {cwdExtra: this.fromChromiumFolder()})
    debug('Cloning depot_tools manually and patch git.bat')
    const depotToolsFolder = this.fromBraveCoreFolder('vendor', 'depot_tools')
    await this.runCommand(['git', 'clone', 'https://chromium.googlesource.com/chromium/tools/depot_tools.git', depotToolsFolder])
    await this.runCommand(['cmd.exe', '/c', path.join(depotToolsFolder, 'bootstrap', 'win_tools.bat')])
    await fs.outputFile(path.join(depotToolsFolder, 'git.bat'), '@echo off\ngit.exe %*')
    await this.runCommand([this.nodeExecutableFile, 'src/brave/build/commands/scripts/sync.js', '--', '--init', `--target_os=${this.targetOs}`, `--target_arch=${this.targetArch}`], {
      cwdExtra: this.braveBrowserFolder,
    })
    await this.applyCustomizations()
    await this.patchEnvFile(this.fromBraveCoreFolder('.env'))
    await this.disableBraveLeo()
    const gnArgs = Object.entries(BraveCompiler.gnOptions).flatMap(([key, value]) => {
      const optionKey = key
      const optionValue = JSON.stringify(value)
      return ['--gn', `${optionKey}:${optionValue}`]
    })
    await this.runCommand([this.nodeExecutableFile, this.npmScriptFile, 'run', 'build', '--', this.buildConfig, `--target_os=${this.targetOs}`, `--target_arch=${this.targetArch}`, ...gnArgs, '--ninja', 'j:1'], {
      cwdExtra: this.braveCoreFolder,
    })
    await this.copyBuiltExecutable()
  }
}
