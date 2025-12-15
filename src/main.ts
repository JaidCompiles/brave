import * as path from 'forward-slash-path'

import {BraveCompiler} from './lib/BraveCompiler.ts'

const compiler = new BraveCompiler({
  folder: path.join('C:', 'temp', path.parentName(import.meta.dir)!),
  nodeInstallationFolder: 'C:/portable/node/24.11.1',
  arch: 'x64',
  os: 'win',
  /**
   * This option can be used for skipping all customizations and compiling vanilla Brave instead.
   * This is useful for determining whether the compilation setup at its core cause a breakage or the customizations do.
   */
  flavor: (process.env.FLAVOR as 'brave' | 'jave' | undefined) ?? 'brave',
  buildTarget: 'Release',
  lowMemory: ((process.env.LOW_MEMORY as '0' | '1' | undefined) ?? '0') === '1',
})
await compiler.run()
