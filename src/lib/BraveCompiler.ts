import type {Dict, FirstParameter, SecondParameter} from 'more-types'

import {pathToFileURL} from 'node:url'
import os from 'os'
import * as util from 'util'

import * as path from 'forward-slash-path'
import fs from 'fs-extra'
import sharp from 'sharp'
import sharpIco from 'sharp-ico'

import {Compiler} from './Compiler.ts'

const debug = util.debuglog('BraveCompiler')
const gnOptions = {
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
  extra_cflags: [],
  extra_cflags_cxx: [],
  extra_ldflags: [],
} as Dict

type InputOptions = ConstructorParameters<typeof Compiler>[0] & {
  arch: 'arm64' | 'x64'
  buildTarget: 'Debug' | 'Release'
  flavor: 'brave' | 'jave'
  lowMemory?: boolean
  nodeInstallationFolder: string
  os: 'linux' | 'win'
  personalArch?: string
}

export class BraveCompiler extends Compiler {
  static gnOptions = gnOptions
  braveBrowserFolder: string
  braveCoreCacheFolder = path.join(os.tmpdir(), 'node_compiler', 'git', 'brave', 'brave-core')
  braveCoreFolder: string
  buildTarget: 'Debug' | 'Release' = 'Release'
  chromiumFolder: string
  flavor: 'brave' | 'jave'
  gnOptions = {...BraveCompiler.gnOptions}
  lowMemory: boolean = false
  nodeExecutableFile: string
  nodeInstallationFolder: string
  npmScriptFile: string
  repo = 'brave/brave-browser'
  shouldCustomize: boolean
  targetArch: 'arm64' | 'x64'
  targetOs: 'linux' | 'win'
  tempFolder: string
  constructor(options: InputOptions) {
    super({
      cloneMethod: 'direct',
      cacheClones: true,
      ...options,
      clones: ['brave/brave-browser'],
    })
    if (options.personalArch) {
      this.gnOptions.extra_cflags = [...(this.gnOptions.extra_cflags as Array<string>), `-march=${options.personalArch}`]
      this.gnOptions.extra_cflags_cxx = [...(this.gnOptions.extra_cflags_cxx as Array<string>), `-march=${options.personalArch}`]
      this.gnOptions.extra_ldflags = [...(this.gnOptions.extra_ldflags as Array<string>), `-march=${options.personalArch}`]
    }
    this.lowMemory = options.lowMemory ?? false
    this.buildTarget = options.buildTarget
    this.flavor = options.flavor
    this.shouldCustomize = this.flavor === 'jave'
    this.targetArch = options.arch
    this.targetOs = options.os
    this.nodeInstallationFolder = options.nodeInstallationFolder
    this.nodeExecutableFile = path.join(this.nodeInstallationFolder, 'node.exe')
    this.npmScriptFile = path.join(this.nodeInstallationFolder, 'node_modules', 'npm', 'bin', 'npm-cli.js')
    this.braveBrowserFolder = this.fromHere('git', 'brave', 'brave-browser')
    this.chromiumFolder = path.join(this.braveBrowserFolder, 'src')
    this.braveCoreFolder = path.join(this.braveBrowserFolder, 'src', 'brave')
    this.environmentVariables.set('npm_node_execpath', this.nodeExecutableFile)
    this.environmentVariables.set('npm_execpath', this.npmScriptFile)
    this.environmentVariables.set('NODE_PATH', path.join(this.nodeInstallationFolder, 'node_modules'))
    this.environmentVariables.set('DEPOT_TOOLS_UPDATE', 0)
    this.environmentVariables.set('DEPOT_TOOLS_WIN_TOOLCHAIN', 0)
    this.environmentVariables.set('GIT_CEILING_DIRECTORIES', this.braveBrowserFolder)
    if (this.shouldCustomize) {
      this.environmentVariables.set('ENABLE_AI_CHAT', false)
      this.environmentVariables.set('ENABLE_BRAVE_AI_CHAT_AGENT_PROFILE', false)
    }
    this.environmentVariables.set('BRAVE_SERVICES_KEY', 'dummy')
    this.environmentVariables.set('GOOGLE_API_KEY', 'dummy')
    this.environmentVariables.set('GOOGLE_DEFAULT_CLIENT_ID', 'dummy')
    this.environmentVariables.set('GOOGLE_DEFAULT_CLIENT_SECRET', 'dummy')
    this.tempFolder = path.join(this.fromHere('temp'))
    this.environmentVariables.set('TEMP', this.tempFolder)
    this.environmentVariables.set('TMP', this.tempFolder)
    this.environmentVariables.set('TMPDIR', this.tempFolder)
    this.environmentVariables.set('VPYTHON_VIRTUALENV_ROOT', path.join(this.braveBrowserFolder, 'vpython_root'))
    this.environmentVariables.set('CIPD_CACHE_DIR', path.join(this.braveBrowserFolder, 'cipd_cache'))
    this.environmentVariables.prependPathItem(path.join(this.braveBrowserFolder, 'depot_tools'))
    this.environmentVariables.prependPathItem(path.join(this.nodeInstallationFolder, 'node_modules', 'npm', 'bin'))
    this.environmentVariables.prependPathItem(this.nodeInstallationFolder)
    debug('%s', {
      compiler: this,
      env: this.environmentVariables.toFinalObject(),
    })
  }

  async applyCustomizations() {
    debug('Disabling Brave Sync')
    await this.applyPatch({
      files: this.fromBraveCoreFolder('components', 'brave_sync', 'features.cc'),
      from: /BASE_FEATURE\(\s*kBraveSync\s*,\s*base::FEATURE_ENABLED_BY_DEFAULT\s*\)/,
      to: 'BASE_FEATURE(kBraveSync, base::FEATURE_DISABLED_BY_DEFAULT)',
    })
    debug('Disabling Memory Saver (High Efficiency Mode)')
    await this.applyPatch({
      files: this.fromChromiumFolder('components', 'performance_manager', 'features.cc'),
      from: /BASE_FEATURE\(\s*kHighEfficiencyModeAvailable\s*,\s*base::FEATURE_ENABLED_BY_DEFAULT\s*\)/,
      to: 'BASE_FEATURE(kHighEfficiencyModeAvailable, base::FEATURE_DISABLED_BY_DEFAULT)',
    })
    debug('Enabling Wide Address Bar by default')
    await this.applyPatch({
      files: this.fromBraveCoreFolder('browser', 'brave_profile_prefs.cc'),
      from: /->RegisterBooleanPref\(kLocationBarIsWide,\s*false\)/,
      to: '->RegisterBooleanPref(kLocationBarIsWide, true)',
    })
    debug('Disabling Background Mode by default')
    await this.applyPatch({
      files: this.fromChromiumFolder('chrome', 'browser', 'background', 'extensions', 'background_mode_manager.cc'),
      from: /->RegisterBooleanPref\(prefs::kBackgroundModeEnabled,\s*true\)/,
      to: '->RegisterBooleanPref(prefs::kBackgroundModeEnabled, false)',
    })
    await this.applyPatch({
      files: this.fromBraveCoreFolder('components', 'ai_chat', 'core', 'common', 'features.cc'),
      from: /BASE_FEATURE\(\s*kAIChat\s*,\s*base::FEATURE_ENABLED_BY_DEFAULT\s*\)/,
      to: 'BASE_FEATURE(kAIChat, base::FEATURE_DISABLED_BY_DEFAULT)',
    })
    debug('Disabling Warn before closing window with multiple tabs')
    await this.applyPatch({
      files: this.fromChromiumFolder('chrome', 'browser', 'ui', 'browser_ui_prefs.cc'),
      from: /registry->RegisterBooleanPref\(prefs::kCloseWindowWithMultipleTabs,\s*true\)/,
      to: 'registry->RegisterBooleanPref(prefs::kCloseWindowWithMultipleTabs, false)',
    })
    debug('Setting On startup to Open the New Tab page')
    await this.applyPatch({
      files: this.fromChromiumFolder('chrome', 'browser', 'prefs', 'session_startup_pref.cc'),
      from: /registry->RegisterIntegerPref\(prefs::kRestoreOnStartup,\s*kPrefValueLast\)/,
      to: 'registry->RegisterIntegerPref(prefs::kRestoreOnStartup, 5 /* kPrefValueNewTab */)',
    })
    debug('Disabling Speedreader')
    await this.applyPatch({
      files: this.fromBraveCoreFolder('components', 'speedreader', 'common', 'features.cc'),
      from: /BASE_FEATURE\(\s*kSpeedreader\s*,\s*base::FEATURE_ENABLED_BY_DEFAULT\s*\)/,
      to: 'BASE_FEATURE(kSpeedreader, base::FEATURE_DISABLED_BY_DEFAULT)',
    })
    debug('Disabling Spell Check')
    await this.applyPatch({
      files: this.fromChromiumFolder('chrome', 'browser', 'spellchecker', 'spellcheck_factory.cc'),
      from: /user_prefs->RegisterBooleanPref\(spellcheck::prefs::kSpellCheckEnable,\s*true,/,
      to: 'user_prefs->RegisterBooleanPref(spellcheck::prefs::kSpellCheckEnable, false,',
    })
    debug('Disabling Brave Translate')
    await this.applyPatch({
      files: this.fromBraveCoreFolder('components', 'translate', 'core', 'common', 'brave_translate_features.cc'),
      from: /BASE_FEATURE\(\s*kBraveTranslate\s*,\s*base::FEATURE_ENABLED_BY_DEFAULT\s*\)/,
      to: 'BASE_FEATURE(kBraveTranslate, base::FEATURE_DISABLED_BY_DEFAULT)',
    })
    debug('Fixing AI Chat Linker Errors')
    await this.applyPatch({
      files: this.fromBraveCoreFolder('browser', 'ui', 'brave_pages.cc'),
      from: /void ShowFullpageChat\(Browser\* browser\) \{\s*if \(!ai_chat::features::IsAIChatHistoryEnabled\(\)\) \{\s*return;\s*\}\s*ShowSingletonTabOverwritingNTP\(browser, GURL\(kAIChatUIURL\)\);\s*\}/,
      to: 'void ShowFullpageChat(Browser* browser) { return; }',
    })
    await this.applyPatch({
      files: this.fromBraveCoreFolder('browser', 'ui', 'side_panel', 'ai_chat', 'ai_chat_side_panel_utils.cc'),
      from: /bool ShouldSidePanelBeGlobal\(Profile\* profile\) \{\s*return profile->IsAIChatAgent\(\) \|\|\s*ai_chat::features::IsAIChatGlobalSidePanelEverywhereEnabled\(\);\s*\}/,
      to: 'bool ShouldSidePanelBeGlobal(Profile* profile) { return profile->IsAIChatAgent(); }',
    })
    debug('Enabling Fluent Overlay Scrollbars')
    await this.applyPatch({
      files: this.fromChromiumFolder('ui', 'native_theme', 'features', 'native_theme_features.cc'),
      from: /BASE_FEATURE\(\s*kFluentOverlayScrollbar\s*,\s*base::FEATURE_DISABLED_BY_DEFAULT\s*\)/,
      to: 'BASE_FEATURE(kFluentOverlayScrollbar, base::FEATURE_ENABLED_BY_DEFAULT)',
    })
    debug('Disabling Brave Rewards')
    await this.applyPatch({
      files: this.fromBraveCoreFolder('components', 'brave_rewards', 'core', 'features.cc'),
      from: /BASE_FEATURE\(\s*kBraveRewards\s*,\s*base::FEATURE_ENABLED_BY_DEFAULT\s*\)/,
      to: 'BASE_FEATURE(kBraveRewards, base::FEATURE_DISABLED_BY_DEFAULT)',
    })
    debug('Renaming executable to jave.exe')
    await this.applyPatch({
      files: this.fromChromiumFolder('chrome', 'BUILD.gn'),
      from: /_chrome_output_name = "initialexe\/chrome"/g,

      to: '_chrome_output_name = "initialexe/jave"',
    })
    await this.applyPatch({
      files: this.fromChromiumFolder('chrome', 'BUILD.gn'),
      from: /_chrome_output_name = "chrome"/g,

      to: '_chrome_output_name = "jave"',
    })
    await this.applyPatch({
      files: this.fromChromiumFolder('chrome', 'BUILD.gn'),
      from: /"\$root_out_dir\/initialexe\/chrome\.exe"/g,
      to: '"$root_out_dir/initialexe/jave.exe"',
    })
    await this.applyPatch({
      files: this.fromChromiumFolder('chrome', 'BUILD.gn'),
      from: /"\$root_out_dir\/initialexe\/chrome\.exe\.pdb"/g,
      to: '"$root_out_dir/initialexe/jave.exe.pdb"',
    })
    await this.applyPatch({
      files: this.fromChromiumFolder('chrome', 'BUILD.gn'),
      from: /"\$root_out_dir\/chrome\.exe"/g,
      to: '"$root_out_dir/jave.exe"',
    })
    await this.applyPatch({
      files: this.fromChromiumFolder('chrome', 'BUILD.gn'),
      from: /"\$root_out_dir\/chrome\.exe\.pdb"/g,
      to: '"$root_out_dir/jave.exe.pdb"',
    })
    await this.applyPatch({
      files: this.fromChromiumFolder('chrome', 'BUILD.gn'),
      from: /output_name = "chrome"/g,
      to: 'output_name = "jave"',
    })
    await this.applyPatch({
      files: this.fromChromiumFolder('chrome', 'BUILD.gn'),
      from: /"\$root_out_dir\/chrome\.dll\.pdb"/g,
      to: '"$root_out_dir/jave.dll.pdb"',
    })
    await this.applyPatch({
      files: this.fromBraveCoreFolder('build', 'win', 'BUILD.gn'),
      from: /"\$root_out_dir\/chrome\.exe"/g,
      to: '"$root_out_dir/jave.exe"',
    })
    await this.applyPatch({
      files: this.fromBraveCoreFolder('build', 'win', 'BUILD.gn'),
      from: /"\$root_out_dir\/chrome\.exe\.pdb"/g,
      to: '"$root_out_dir/jave.exe.pdb"',
    })
    await this.applyPatch({
      files: this.fromChromiumFolder('chrome', 'installer', 'mini_installer', 'BUILD.gn'),
      from: /"\$root_out_dir\/chrome\.exe"/g,
      to: '"$root_out_dir/jave.exe"',
    })
    await this.applyPatch({
      files: this.fromChromiumFolder('chrome', 'installer', 'mini_installer', 'BUILD.gn'),
      from: /"\$root_out_dir\/chrome\.dll"/g,
      to: '"$root_out_dir/jave.dll"',
    })
    await this.applyIconCustomizations()
  }

  async applyIconCustomizations() {
    debug('Applying icon customizations')
    const sourceIcon = path.join(import.meta.dir, '..', '..', 'assets', 'jave.jxl')
    const sourceBuffer = await sharp(sourceIcon)
      .resize({
        width: 256,
        height: 256,
        fit: sharp.fit.contain,
        background: {
          r: 0,
          g: 0,
          b: 0,
          alpha: 0,
        },
      })
      .png()
      .toBuffer()
    const resize = async (size: number) => {
      return sharp(sourceBuffer)
        .resize({
          width: size,
          height: size,
          fit: sharp.fit.contain,
        })
        .toBuffer()
    }
    const pngSizes = [16, 22, 24, 32, 48, 64, 128, 256]
    for (const size of pngSizes) {
      const buffer = await resize(size)
      const targetName = `product_logo_${size}.png`
      const targetPath = this.fromBraveCoreFolder('app', 'theme', 'brave', targetName)
      if (await fs.pathExists(targetPath)) {
        await fs.writeFile(targetPath, buffer)
      }
      for (const variant of ['_beta', '_dev', '_nightly', '_development']) {
        const variantName = `product_logo_${size}${variant}.png`
        const variantPath = this.fromBraveCoreFolder('app', 'theme', 'brave', variantName)
        if (await fs.pathExists(variantPath)) {
          await fs.writeFile(variantPath, buffer)
        }
      }
    }
    const icoSizes = [16, 24, 32, 48, 64, 128, 256]
    const sharps = await Promise.all(icoSizes.map(async size => {
      const buffer = await resize(size)
      return sharp(buffer)
    }))
    const icoTargets = [
      'brave.ico',
      'brave_beta.ico',
      'brave_dev.ico',
      'brave_nightly.ico',
      'brave_development.ico',
      'brave_canary.ico',
    ]
    for (const icoName of icoTargets) {
      const targetPath = this.fromBraveCoreFolder('app', 'theme', 'brave', 'win', icoName)
      if (await fs.pathExists(targetPath)) {
        await sharpIco.sharpsToIco(sharps, targetPath)
      }
    }
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
  async init() {
    await super.init()
    await fs.ensureDir(this.tempFolder)
    await this.writeFile('bin/git.bat', '@echo off\ngit.exe %*')
    this.environmentVariables.prependPathItem(this.fromHere('bin'))
  }
  async run() {
    await this.init()
    await this.applyPatch({
      files: this.fromBraveBrowserFolder('scripts', 'init.js'),
      from: /util\.run\(npmCommand,\s*\['install'\],\s*\{\s*cwd:\s*braveCoreDir\s*\}\)/,
      to: "// util.run(npmCommand, ['install'], { cwd: braveCoreDir })",
    })
    await this.applyPatch({
      files: this.fromBraveBrowserFolder('scripts', 'init.js'),
      from: /util\.run\(npmCommand,\s*\['run',\s*'sync'\s*,'--',\s*'--init'\]\.concat\(process\.argv\.slice\(2\)\),[\s\S]+?\}\)/,
      to: "/* util.run(npmCommand, ['run', 'sync', '--', '--init']...) */",
    })
    const cacheFolderExists = await fs.pathExists(this.braveCoreCacheFolder)
    if (cacheFolderExists) {
      const braveCoreCacheUrl = pathToFileURL(this.braveCoreCacheFolder).href
      await this.applyPatch({
        files: this.fromBraveBrowserFolder('package.json'),
        from: /https:\/\/github\.com\/brave\/brave-core\.git/g,
        to: braveCoreCacheUrl,
      })
    }
    await this.runNpmCommand(['install'], {
      cwdExtra: this.braveBrowserFolder,
    })
    await this.runNpmCommand(['run', 'init', '--', '--target_os', this.targetOs, '--target_arch', this.targetArch], {
      cwdExtra: this.braveBrowserFolder,
    })
    await this.runNpmCommand(['install'], {
      cwdExtra: this.braveCoreFolder,
    })
    await this.runNpmCommand(['run', 'sync', '--', '--init', '--target_os', this.targetOs, '--target_arch', this.targetArch], {
      cwdExtra: this.braveCoreFolder,
    })
    if (this.shouldCustomize) {
      await this.applyCustomizations()
    }
    await this.applyPatch({
      files: this.fromBraveCoreFolder('build', 'commands', 'scripts', 'gn.js'),
      from: /\.allowUnknownOption\(true\)/,
      to: ".option('--gn <gn_arg>', 'GN args', (val, memo) => { memo.push(val); return memo; }, [])\n  .allowUnknownOption(true)",
    })
    await this.patchEnvFile(this.fromBraveCoreFolder('.env'))
    {
      const args = ['run', 'gn', '--', 'gen', this.buildTarget, '--target_os', this.targetOs, '--target_arch', this.targetArch]
      for (const [optionName, optionValueRaw] of Object.entries(this.gnOptions)) {
        const optionValue = JSON.stringify(optionValueRaw)
        args.push('--gn', `${optionName}:${optionValue}`)
      }
      if (this.lowMemory) {
        args.push('--gn', 'jobs:1')
      }
      await this.runNpmCommand(args, {
        cwdExtra: this.braveCoreFolder,
      })
    }
    const executableName = this.flavor === 'jave' ? 'jave.exe' : 'brave.exe'
    const outputFile = this.fromChromiumFolder('out', this.buildTarget, executableName)
    const outputFileExists = await fs.pathExists(outputFile)
    if (!outputFileExists) {
      throw new Error(`Build completed but output file not found: ${outputFile}`)
    }
  }

  async runNpmCommand(args: FirstParameter<typeof this.runCommand>, options?: SecondParameter<typeof this.runCommand>) {
    return this.runCommand([this.nodeExecutableFile, this.npmScriptFile, ...args], options)
  }
}
