import {BraveCompiler} from './lib/BraveCompiler.ts'

export const run = async () => {
  const compiler = new BraveCompiler
  await compiler.run()
}

if (import.meta.main) {
  await run()
}
