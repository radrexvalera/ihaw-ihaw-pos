// Emits /sw.js at build time with the exact list of built files to precache.
// Small and dependency-free (instead of a PWA framework).
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import type { Plugin, ResolvedConfig } from 'vite'

const SKIP = [/\.map$/, /^sw\.js$/, /^_headers$/, /^_redirects$/]

function listFiles(dir: string, root = dir): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    return statSync(full).isDirectory() ? listFiles(full, root) : [relative(root, full).replaceAll('\\', '/')]
  })
}

export function serviceWorker(templatePath: string): Plugin {
  let config: ResolvedConfig
  return {
    name: 'ihaw-service-worker',
    apply: 'build',
    enforce: 'post',
    configResolved(c) {
      config = c
    },
    generateBundle(_options, bundle) {
      const publicFiles = config.publicDir ? listFiles(config.publicDir) : []
      const files = [...new Set([...Object.keys(bundle), ...publicFiles])]
        .filter((f) => !SKIP.some((re) => re.test(f)))
        .sort()
      const urls = files.map((f) => `/${f}`)
      // Content-addressed: any change to any built file produces a new version.
      const hash = createHash('sha256')
      for (const f of files) {
        const item = bundle[f]
        hash.update(f)
        if (item?.type === 'chunk') hash.update(item.code)
        else if (item?.type === 'asset') hash.update(typeof item.source === 'string' ? item.source : Buffer.from(item.source))
        else hash.update(readFileSync(join(config.publicDir, f)))
      }
      const version = hash.digest('hex').slice(0, 12)
      const template = readFileSync(templatePath, 'utf8')
      if (!template.includes("const VERSION = '__VERSION__'") || !template.includes('const PRECACHE = __PRECACHE__')) {
        throw new Error('Service worker template is missing its VERSION / PRECACHE placeholders')
      }
      const source = template
        .replace("const VERSION = '__VERSION__'", `const VERSION = ${JSON.stringify(version)}`)
        .replace('const PRECACHE = __PRECACHE__', `const PRECACHE = ${JSON.stringify(urls, null, 2)}`)
      this.emitFile({ type: 'asset', fileName: 'sw.js', source })
    },
  }
}
