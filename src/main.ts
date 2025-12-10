import * as path from 'forward-slash-path'

import {BraveCompiler} from './lib/BraveCompiler.ts'

const compiler = new BraveCompiler({
  folder: path.join('C:', 'temp', path.parentName(import.meta.dir)!),
})
await compiler.run()
