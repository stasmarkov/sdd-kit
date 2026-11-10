// Builds the Codex plugin packages from the Claude sources: a core package (skills, runtime, bridge MCP
// registration, hooks) and one skills-only package per first-party add-on, plus the marketplace file.
//
// Usage: node build.mjs --out <dir>
//   <dir>/.agents/plugins/marketplace.json
//   <dir>/hosts/codex/<plugin>/{plugin.json, .codex-plugin/plugin.json, skills/, ...}
//   <dir>/hosts/codex/sdd-kit/{mcp.json, hooks/hooks.json, runtime/}   (core package only)
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { hostHookPlan } from '../hooks/registrations.mjs'
import { SKILL_LIST_LIMIT, buildSkills, buildRuntime, skillListSize, skillDirs, interfaceBlock, playwrightArgs, write, readJson, subdirs } from '../shared/build.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(HERE, '..', '..', '..')
const HOST = 'codex'
const CORE = 'sdd-kit'
const SESSION_END_MAX_SECONDS = 3
// The file Codex reads to keep a skill out of implicit invocation (AC-21).
const MANUAL_FILES = { 'agents/openai.yaml': 'policy:\n  allow_implicit_invocation: false\n' }

/** Codex hooks.json content with the core hooks plus those of the named add-ons. */
export function hooksJson(plugins, repo) {
  const { entries } = hostHookPlan(HOST, { plugins, registry: readJson(path.join(repo, 'src/workflows/lib/stacks.json')), hostsFile: path.join(repo, 'src/adapters/hosts.json') })
  const hooks = {}
  for (const e of entries) {
    const handler = { type: 'command', command: `node "\${PLUGIN_ROOT}/runtime/hooks/dispatch.mjs" ${e.event} --host ${HOST} --hook ${e.script}` }
    let timeout = e.timeout
    if (e.event === 'SessionEnd') timeout = Math.min(timeout || SESSION_END_MAX_SECONDS, SESSION_END_MAX_SECONDS)
    if (timeout) handler.timeout = timeout
    const groups = (hooks[e.event] ||= [])
    let group = groups.find((g) => (g.matcher || '') === (e.matcher || ''))
    if (!group) {
      group = { ...(e.matcher ? { matcher: e.matcher } : {}), hooks: [] }
      groups.push(group)
    }
    group.hooks.push(handler)
  }
  return { description: 'SDD Kit lifecycle hooks', hooks }
}

/**
 * Builds the Codex packages and the marketplace file.
 * @param {{ outDir: string, repo?: string, log?: (line: string) => void, runtimeRoot?: string }} opts `runtimeRoot` is an absolute
 *   runtime-root path that replaces the package-relative value of `${CLAUDE_PLUGIN_ROOT}` (file-copy installs, AC-22)
 * @returns {{ packages: {name: string, dir: string, skills: number, implicit: number, listChars: number, overBudget: boolean}[] }}
 * @throws {Error} listing every `file:line message` when a token cannot be mapped
 */
export function buildCodex({ outDir, repo = REPO, log = () => {}, runtimeRoot }) {
  const hosts = readJson(path.join(repo, 'src/adapters/hosts.json')).hosts
  const hostConfig = hosts[HOST]
  const allowlist = readJson(path.join(repo, 'src/adapters/token-allowlist.json'))
  const src = path.join(repo, 'src')
  const overlayDir = path.join(src, 'adapters/codex/skill-overlays')
  const core = readJson(path.join(repo, '.claude-plugin/plugin.json'))
  const addons = subdirs(path.join(src, 'plugins')).filter((p) => fs.existsSync(path.join(src, 'plugins', p, '.claude-plugin/plugin.json')))
  const hooksPlugins = Object.keys(readJson(path.join(src, 'workflows/lib/stacks.json')).hooks.addons || {})
  const errors = []

  fs.rmSync(path.join(outDir, 'hosts', HOST), { recursive: true, force: true })
  const packages = []
  const marketplace = []
  const specs = [
    { id: CORE, manifest: core, sources: skillDirs(path.join(src, 'skills')), isCore: true },
    ...addons.map((a) => ({ id: a, manifest: readJson(path.join(src, 'plugins', a, '.claude-plugin/plugin.json')), sources: skillDirs(path.join(src, 'plugins', a, 'skills')), isCore: false })),
  ]
  for (const spec of specs) {
    const name = spec.manifest.name
    const pkgRel = `hosts/${HOST}/${name}`
    const pkgDir = path.join(outDir, pkgRel)
    fs.mkdirSync(pkgDir, { recursive: true })
    const { skills, errors: errs } = buildSkills({ sources: spec.sources, overlayDir, pkgDir, pkgRel, isCore: spec.isCore, host: HOST, hostConfig, allowlist, runtimeRoot, manualFiles: MANUAL_FILES })
    errors.push(...errs)

    const portable = { name, version: spec.manifest.version, description: spec.manifest.description }
    write(path.join(pkgDir, 'plugin.json'), `${JSON.stringify(portable, null, 2)}\n`)
    const displayName = name === CORE ? 'SDD Kit' : `SDD Kit ${name.replace(/^sdd-kit-/, '')}`
    write(path.join(pkgDir, '.codex-plugin/plugin.json'), `${JSON.stringify({
      ...portable,
      skills: './skills/',
      requires_local_executor: true,
      interface: interfaceBlock(repo, displayName, portable.description, spec.manifest.author?.name || core.author?.name || ''),
    }, null, 2)}\n`)
    if (spec.isCore) {
      write(path.join(pkgDir, 'mcp.json'), `${JSON.stringify({
        mcpServers: {
          'sdd-kit': { type: 'stdio', command: 'node', args: ['${PLUGIN_ROOT}/runtime/bridge/server.mjs'] },
          playwright: { type: 'stdio', command: 'npx', args: playwrightArgs(repo) },
        },
      }, null, 2)}\n`)
      write(path.join(pkgDir, 'hooks/hooks.json'), `${JSON.stringify(hooksJson(hooksPlugins, repo), null, 2)}\n`)
      errors.push(...buildRuntime(path.join(pkgDir, 'runtime'), repo, hostConfig, allowlist, HOST))
    }
    const listChars = skillListSize(skills)
    const result = { name, dir: pkgRel, skills: skills.length, implicit: skills.filter((s) => s.implicit).length, listChars, overBudget: listChars > SKILL_LIST_LIMIT }
    packages.push(result)
    log(`${name}: ${result.implicit} implicit skills, estimated skill list ${listChars} characters${result.overBudget ? ` (warning: above ${SKILL_LIST_LIMIT}; mark more skills disable-model-invocation or shorten descriptions)` : ''}`)
    marketplace.push({
      name,
      source: { source: 'local', path: `./${pkgRel}` },
      policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' },
      category: 'Developer Tools',
    })
  }
  if (errors.length) throw new Error(`Codex build failed:\n${errors.join('\n')}`)
  write(path.join(outDir, '.agents/plugins/marketplace.json'), `${JSON.stringify({
    name: 'sdd-kit',
    interface: { displayName: 'SDD Kit' },
    plugins: marketplace,
  }, null, 2)}\n`)
  return { packages }
}

function main(argv) {
  const i = argv.indexOf('--out')
  if (i === -1 || !argv[i + 1]) {
    process.stderr.write('usage: node build.mjs --out <dir>\n')
    return 2
  }
  try {
    buildCodex({ outDir: path.resolve(argv[i + 1]), log: (line) => process.stdout.write(`${line}\n`) })
    return 0
  } catch (err) {
    process.stderr.write(`${err.message}\n`)
    return 1
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) process.exitCode = main(process.argv)
