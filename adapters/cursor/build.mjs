// Builds the Cursor plugin packages (team marketplaces) from the Claude sources: a core package (skills,
// agents, rules, runtime, bridge MCP registration, hooks) and one package per first-party add-on, plus the
// marketplace file. The file-copy installer (install.mjs) installs from the same output.
//
// Usage: node build.mjs --out <dir>
//   <dir>/.cursor-plugin/marketplace.json
//   <dir>/hosts/cursor/<plugin>/{plugin.json, .cursor-plugin/plugin.json, skills/, agents/*.md, rules/*.mdc}
//   <dir>/hosts/cursor/sdd-kit/{mcp.json, hooks/hooks.json, runtime/}   (core package only)
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { convertText, parseFrontmatter } from '../shared/tokens.mjs'
import { hostHookPlan } from '../hooks/registrations.mjs'
import { GUARD_SCRIPTS } from '../hooks/dispatch.mjs'
import {
  SKILL_LIST_LIMIT, buildSkills, buildRuntime, skillListSize, skillDirs, interfaceBlock, playwrightArgs, write, read, readJson, sortedNames, subdirs,
} from '../shared/build.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(HERE, '..', '..', '..')
const HOST = 'cursor'
const CORE = 'sdd-kit'
// Claude events whose hooks run before the action and can stop it; their Cursor counterparts are the only
// events where failClosed changes anything (an after-event such as afterFileEdit reports, it cannot undo).
const BLOCKING_EVENTS = new Set(['PreToolUse', 'UserPromptSubmit'])
const TOOL_EVENTS = new Set(['PreToolUse', 'PostToolUse'])

/** Cursor event names that a hosts.json `hookEvents` map derives from the named Claude events (plain or `Event:Tool` keys). */
const hostEventsOf = (hookEvents, claudeEvents) => new Set(Object.entries(hookEvents)
  .filter(([key, name]) => name && claudeEvents.has(key.split(':')[0]))
  .map(([, name]) => name))
// Marker the installer replaces with the absolute or $CURSOR_PROJECT_DIR-based runtime root.
export const RUNTIME_PREFIX = './runtime'

/**
 * Cursor hooks.json content with the core hooks plus those of the named add-ons. Commands start at
 * `./runtime`, which a plugin resolves against its install directory and the file-copy installer rewrites.
 * @param {string[]} plugins add-on keys whose hooks are included
 * @param {string} repo source tree root
 * @returns {{ version: number, hooks: Record<string, object[]> }}
 */
export function hooksJson(plugins, repo) {
  const hostsFile = path.join(repo, 'src/adapters/hosts.json')
  const { hookEvents } = readJson(hostsFile).hosts[HOST]
  // A plain `PreToolUse` key names the tool event; `PreToolUse:Bash` routes to beforeShellExecution, which is not one.
  const toolEvents = new Set(Object.entries(hookEvents).filter(([key, name]) => name && TOOL_EVENTS.has(key)).map(([, name]) => name))
  const blocking = hostEventsOf(hookEvents, BLOCKING_EVENTS)
  const { entries } = hostHookPlan(HOST, { plugins, registry: readJson(path.join(repo, 'src/workflows/lib/stacks.json')), hostsFile })
  const hooks = {}
  for (const e of entries) {
    const entry = { command: `node ${RUNTIME_PREFIX}/hooks/dispatch.mjs ${e.event} --host ${HOST} --hook ${e.script}` }
    // Only the tool events filter by tool name; on beforeShellExecution the matcher is a regex over the command
    // and the other events take none, so the dispatcher alone decides which script applies.
    if (e.matcher && toolEvents.has(e.event)) entry.matcher = e.matcher
    if (e.timeout) entry.timeout = e.timeout
    if (GUARD_SCRIPTS.has(e.script) && blocking.has(e.event)) entry.failClosed = true
    ;(hooks[e.event] ||= []).push(entry)
  }
  return { version: 1, hooks }
}

/**
 * Cursor subagent file for an agent source: name, description and `model: inherit`, body mapped to Cursor paths.
 * @returns {{ text: string, errors: string[] }}
 */
function agentFile({ text, file, fallbackName, hostConfig, allowlist }) {
  const { meta, body } = parseFrontmatter(text)
  const { text: description, errors: e1 } = convertText({ text: meta.description || '', file, host: HOST, hostConfig, allowlist })
  const { text: mappedBody, errors: e2 } = convertText({ text: body.trim(), file, host: HOST, hostConfig, allowlist, rootProblem: 'agent bodies cannot use the plugin root; use a runtime-relative instruction' })
  return {
    text: `---\nname: ${meta.name || fallbackName}\ndescription: ${JSON.stringify(description)}\nmodel: inherit\n---\n\n${mappedBody}\n`,
    errors: [...e1, ...e2],
  }
}

/** Frontmatter `paths:` globs of a rule source. */
function ruleGlobs(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)
  if (!m) return []
  const globs = []
  let inPaths = false
  for (const line of m[1].split(/\r?\n/)) {
    if (/^paths:\s*$/.test(line)) { inPaths = true; continue }
    const item = inPaths && /^\s+-\s*(.+?)\s*$/.exec(line)
    if (item) globs.push(item[1].replace(/^["']|["']$/g, ''))
    else if (inPaths) inPaths = false
  }
  return globs
}

/**
 * Cursor rule (.mdc) for a rule source: `paths:` become `globs`, the first heading the description. A rule
 * without `paths:` applies everywhere (`alwaysApply: true`).
 * @param {{ text: string, file: string, hostConfig: object, allowlist: object[] }} opts file is the source path the errors cite
 * @returns {{ text: string, errors: string[] }}
 */
export function ruleFile({ text, file, hostConfig, allowlist }) {
  const { body } = parseFrontmatter(text)
  const { text: mapped, errors } = convertText({ text: body.replace(/^\s+/, ''), file, host: HOST, hostConfig, allowlist })
  const title = /^#\s+(.+)$/m.exec(mapped)?.[1] || path.basename(file, '.md')
  const globs = ruleGlobs(text)
  const head = [`description: ${JSON.stringify(title)}`, ...(globs.length ? [`globs: ${globs.join(',')}`] : []), `alwaysApply: ${globs.length ? 'false' : 'true'}`]
  return { text: `---\n${head.join('\n')}\n---\n\n${mapped}`, errors }
}

/** Writes the agents and rules of one package from their source directories. */
function buildAgentsAndRules({ pkgDir, agentDirs, ruleDirs, repo, hostConfig, allowlist }) {
  const errors = []
  for (const dir of agentDirs) {
    for (const f of sortedNames(dir, (e) => e.isFile() && e.name.endsWith('.md'))) {
      const rel = path.relative(repo, path.join(dir, f))
      const res = agentFile({ text: read(path.join(dir, f)), file: rel, fallbackName: f.slice(0, -3), hostConfig, allowlist })
      errors.push(...res.errors)
      write(path.join(pkgDir, 'agents', f), res.text)
    }
  }
  for (const dir of ruleDirs) {
    for (const f of sortedNames(dir, (e) => e.isFile() && e.name.endsWith('.md'))) {
      const rel = path.relative(repo, path.join(dir, f))
      const res = ruleFile({ text: read(path.join(dir, f)), file: rel, hostConfig, allowlist })
      errors.push(...res.errors)
      write(path.join(pkgDir, 'rules', `${f.slice(0, -3)}.mdc`), res.text)
    }
  }
  return errors
}

/**
 * Builds the Cursor packages and the marketplace file.
 * @param {{ outDir: string, repo?: string, log?: (line: string) => void, runtimeRoot?: string }} opts `runtimeRoot` is an absolute
 *   runtime-root path that replaces the package-relative value of `${CLAUDE_PLUGIN_ROOT}` (file-copy installs, AC-22)
 * @returns {{ packages: {name: string, dir: string, skills: number, implicit: number, listChars: number, overBudget: boolean}[] }}
 * @throws {Error} listing every `file:line message` when a token cannot be mapped
 */
export function buildCursor({ outDir, repo = REPO, log = () => {}, runtimeRoot }) {
  const hostConfig = readJson(path.join(repo, 'src/adapters/hosts.json')).hosts[HOST]
  const allowlist = readJson(path.join(repo, 'src/adapters/token-allowlist.json'))
  const src = path.join(repo, 'src')
  const overlayDir = path.join(src, 'adapters/cursor/skill-overlays')
  const core = readJson(path.join(repo, '.claude-plugin/plugin.json'))
  const addons = subdirs(path.join(src, 'plugins')).filter((p) => fs.existsSync(path.join(src, 'plugins', p, '.claude-plugin/plugin.json')))
  const hooksPlugins = Object.keys(readJson(path.join(src, 'workflows/lib/stacks.json')).hooks.addons || {})
  const errors = []

  fs.rmSync(path.join(outDir, 'hosts', HOST), { recursive: true, force: true })
  const packages = []
  const marketplace = []
  const specs = [
    { id: CORE, manifest: core, sources: skillDirs(path.join(src, 'skills')), isCore: true, agentDirs: [path.join(src, 'agents')], ruleDirs: [path.join(src, 'templates/rules')] },
    ...addons.map((a) => ({
      id: a,
      manifest: readJson(path.join(src, 'plugins', a, '.claude-plugin/plugin.json')),
      sources: skillDirs(path.join(src, 'plugins', a, 'skills')),
      isCore: false,
      agentDirs: [path.join(src, 'plugins', a, 'agents')],
      ruleDirs: [path.join(src, 'plugins', a, 'rules')],
    })),
  ]
  for (const spec of specs) {
    const name = spec.manifest.name
    const pkgRel = `hosts/${HOST}/${name}`
    const pkgDir = path.join(outDir, pkgRel)
    fs.mkdirSync(pkgDir, { recursive: true })
    const { skills, errors: errs } = buildSkills({ sources: spec.sources, overlayDir, pkgDir, pkgRel, isCore: spec.isCore, host: HOST, hostConfig, allowlist, runtimeRoot })
    errors.push(...errs)
    errors.push(...buildAgentsAndRules({ pkgDir, agentDirs: spec.agentDirs, ruleDirs: spec.ruleDirs, repo, hostConfig, allowlist }))

    const portable = { name, version: spec.manifest.version, description: spec.manifest.description }
    write(path.join(pkgDir, 'plugin.json'), `${JSON.stringify(portable, null, 2)}\n`)
    const iface = interfaceBlock(repo, name === CORE ? 'SDD Kit' : `SDD Kit ${name.replace(/^sdd-kit-/, '')}`, portable.description, spec.manifest.author?.name || core.author?.name || '')
    write(path.join(pkgDir, '.cursor-plugin/plugin.json'), `${JSON.stringify({
      ...portable,
      displayName: iface.displayName,
      author: { name: iface.developerName },
      homepage: iface.websiteURL,
      keywords: ['sdd', 'spec-driven-development'],
      skills: './skills/',
      ...(fs.existsSync(path.join(pkgDir, 'agents')) ? { agents: './agents/' } : {}),
      ...(fs.existsSync(path.join(pkgDir, 'rules')) ? { rules: './rules/' } : {}),
      ...(spec.isCore ? { hooks: './hooks/hooks.json', mcpServers: './mcp.json' } : {}),
    }, null, 2)}\n`)
    if (spec.isCore) {
      write(path.join(pkgDir, 'mcp.json'), `${JSON.stringify({
        mcpServers: {
          'sdd-kit': { command: 'node', args: ['${CURSOR_PLUGIN_ROOT}/runtime/bridge/server.mjs', '--host', HOST] },
          playwright: { command: 'npx', args: playwrightArgs(repo) },
        },
      }, null, 2)}\n`)
      write(path.join(pkgDir, 'hooks/hooks.json'), `${JSON.stringify(hooksJson(hooksPlugins, repo), null, 2)}\n`)
      errors.push(...buildRuntime(path.join(pkgDir, 'runtime'), repo, hostConfig, allowlist, HOST))
    }
    const listChars = skillListSize(skills)
    const result = { name, dir: pkgRel, skills: skills.length, implicit: skills.filter((s) => s.implicit).length, listChars, overBudget: listChars > SKILL_LIST_LIMIT }
    packages.push(result)
    log(`${name}: ${result.implicit} implicit skills, estimated skill list ${listChars} characters${result.overBudget ? ` (warning: above ${SKILL_LIST_LIMIT}; mark more skills disable-model-invocation or shorten descriptions)` : ''}`)
    marketplace.push({ name, source: pkgRel, description: portable.description })
  }
  if (errors.length) throw new Error(`Cursor build failed:\n${errors.join('\n')}`)
  write(path.join(outDir, '.cursor-plugin/marketplace.json'), `${JSON.stringify({
    name: 'sdd-kit',
    owner: { name: core.author?.name || '' },
    metadata: { description: 'SDD Kit: spec-driven development skills, agents and workflows' },
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
    buildCursor({ outDir: path.resolve(argv[i + 1]), log: (line) => process.stdout.write(`${line}\n`) })
    return 0
  } catch (err) {
    process.stderr.write(`${err.message}\n`)
    return 1
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) process.exitCode = main(process.argv)
