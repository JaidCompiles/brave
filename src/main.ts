import {BraveCompiler} from './lib/BraveCompiler.ts'

export const run = async () => {
  const compiler = new BraveCompiler({
    folder: 'C:/temp/brave',
  })
  await compiler.run()
}

if (import.meta.main) {
  await run()
}
