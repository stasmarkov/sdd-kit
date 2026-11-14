// Package build helpers shared by every host adapter: file copying, skill conversion (token mapping, the
// sdd-runtime and relative-path lines, overlays), the skill-list budget, the runtime root and the marketplace
// interface block. Everything host-specific comes in as data: the host key and its hosts.json entry, the overlay
// directory, and the extra files a manual-only skill gets.
import fs from 'node:fs'
import path from 'node:path'
import { convertText, leftoverTokens, parseFrontmatter, relativeTo } from './tokens.mjs'

export const SKILL_LIST_LIMIT = 8000
const ENTRY_OVERHEAD = 4
const AGENT_NOTE = 'On this host, run Workflow and Agent through the sdd-runtime skill.'
const PATH_NOTE = 'Relative paths in this skill (scripts/..., ../other-skill/..., ../../runtime/...) are relative to the directory that holds this SKILL.md, not to the project directory; resolve them against it before running a command.'
const SKILL_TEXT = /\.(md|mdc|template)$/
// Skill files copied without token mapping: they name the files a project has on disk (CLAUDE.md as a convention
// source, .claude/** as an ignored folder), which stay the same on every host. The token check still runs on them,
// so each Claude token they keep needs a token-allowlist.json entry.
export const UNMAPPED_SKILL_FILES = new Set(['skills/doc-hygiene/SKILL.md', 'skills/doc-hygiene/references/default-convention.md'])
export const read = (file) => fs.readFileSync(file, 'utf8')
export const readJson = (file) => JSON.parse(read(file))
export const sortedNames = (dir, filter = () => true) => {
  try {
    return fs.readdirSync(dir, { withFileTypes: true }).filter(filter).map((e) => e.name).sort()
  } catch {
    return []
  }
}
export const subdirs = (dir) => sortedNames(dir, (e) => e.isDirectory())

/** `text` as one POSIX shell word. */
const shellQuote = (text) => `'${text.replace(/'/g, `'\\''`)}'`

export function write(file, text, mode) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, text)
  if (mode) fs.chmodSync(file, mode)
}

export function copyFile(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true })
  fs.copyFileSync(from, to)
}

/** Copies a directory tree; `skip(relativePath, isDir)` leaves entries out. */
export function copyTree(from, to, skip = () => false, rel = '') {
  for (const e of fs.readdirSync(from, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const r = rel ? `${rel}/${e.name}` : e.name
    if (skip(r, e.isDirectory())) continue
    if (e.isDirectory()) copyTree(path.join(from, e.name), path.join(to, e.name), skip, r)
    else if (e.isFile()) copyFile(path.join(from, e.name), path.join(to, e.name))
  }
}

/** Every file below `dir` as a relative posix path, sorted. */
export function walkFiles(dir, rel = '') {
  return sortedNames(path.join(dir, rel), () => true).flatMap((name) => {
    const r = rel ? `${rel}/${name}` : name
    return fs.statSync(path.join(dir, r)).isDirectory() ? walkFiles(dir, r) : [r]
  })
}

/** Skill folders of one source tree: name to directory. */
export function skillDirs(dir) {
  return Object.fromEntries(subdirs(dir).filter((n) => fs.existsSync(path.join(dir, n, 'SKILL.md'))).map((n) => [n, path.join(dir, n)]))
}

/** True when a skill body calls Workflow( or Agent( and so needs the sdd-runtime pointer line. */
const callsRuntime = (body) => /\b(?:Workflow|Agent)\(/.test(body)

/** True when mapping turns a variable of `text` into a path relative to the skill directory. */
const usesRelativePaths = (text, runtimeRoot) => text.includes('CLAUDE_SKILL_DIR') || (!runtimeRoot && text.includes('${CLAUDE_PLUGIN_ROOT'))

/** Puts `line` on its own line right after the frontmatter. */
function withTopLine(text, line) {
  const { bodyOffset } = parseFrontmatter(text)
  return `${text.slice(0, bodyOffset)}${line}\n\n${text.slice(bodyOffset)}`
}

/**
 * Builds the skills of one package.
 * @param {{ sources: Record<string, string>, overlayDir: string, pkgDir: string, pkgRel: string, isCore: boolean,
 *   host: string, hostConfig: object, allowlist: object[], runtimeRoot?: string, manualFiles?: Record<string, string> }} opts
 *   sources maps skill names to source folders; overlayDir holds the host's replacement skills (core package only);
 *   manualFiles are extra files, by path relative to the skill folder, written into every skill marked
 *   disable-model-invocation (a host's own way of keeping a skill out of implicit invocation)
 * @returns {{ skills: {name: string, description: string, implicit: boolean}[], errors: string[] }}
 */
export function buildSkills({ sources, overlayDir, pkgDir, pkgRel, isCore, host, hostConfig, allowlist, runtimeRoot, manualFiles = {} }) {
  const errors = []
  const skills = []
  const names = new Set(Object.keys(sources))
  if (isCore) subdirs(overlayDir).forEach((n) => names.add(n))
  for (const name of [...names].sort()) {
    const src = sources[name]
    const overlay = isCore && fs.existsSync(path.join(overlayDir, name, 'SKILL.md')) ? path.join(overlayDir, name) : null
    const out = path.join(pkgDir, 'skills', name)
    // Paths are relative to the package root, so allowlist entries and messages match in every install form.
    const outRel = `skills/${name}`
    const pluginRoot = (file) => (isCore ? runtimeRoot || relativeTo(file, 'runtime') : null)

    if (src) {
      // new-stack runs from the runtime root, where its registry and templates sit three levels above the script.
      const skip = (r, isDir) => (isDir ? r === 'test' || r.endsWith('/test') || (isCore && name === 'new-stack' && r === 'scripts') : false)
      copyTree(src, out, skip)
    }
    const textFiles = []
    if (src) {
      const walk = (dir, rel) => {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
          const r = rel ? `${rel}/${e.name}` : e.name
          if (e.isDirectory()) { if (e.name !== 'scripts' && e.name !== 'test') walk(path.join(dir, e.name), r) } else if (SKILL_TEXT.test(e.name)) textFiles.push(r)
        }
      }
      walk(src, '')
    }
    if (overlay) {
      // An overlay replaces SKILL.md and any source file it names; its text is already host text.
      const replaced = new Set(walkFiles(overlay))
      copyTree(overlay, out)
      if (runtimeRoot && name === 'new-stack') {
        // Commands get the script path as one quoted shell word, so a runtime root with spaces still runs.
        const skillFile = path.join(out, 'SKILL.md')
        const text = read(skillFile).replace(/node \.\.\/\.\.\/runtime(\/\S*)/g, (_, rest) => `node ${shellQuote(`${runtimeRoot}${rest}`)}`)
        fs.writeFileSync(skillFile, text.replaceAll('../../runtime', runtimeRoot))
      }
      for (let i = textFiles.length - 1; i >= 0; i--) if (replaced.has(textFiles[i])) textFiles.splice(i, 1)
      for (const r of replaced) {
        if (!SKILL_TEXT.test(r)) continue
        const { errors: errs } = convertText({ text: read(path.join(out, r)), file: `${outRel}/${r}`, host, hostConfig: { tokens: {} }, allowlist, pluginRoot: null })
        errors.push(...errs)
      }
    }
    for (const r of textFiles) {
      const file = path.join(out, r)
      const text = read(file)
      const rel = `${outRel}/${r}`
      if (UNMAPPED_SKILL_FILES.has(rel)) {
        errors.push(...leftoverTokens(text, rel, host, allowlist).map(({ line, token }) => `${rel}:${line}: unmapped token ${token}; the file is copied as is, so list it in src/adapters/token-allowlist.json with a reason or drop the token`))
        continue
      }
      const { text: mapped, errors: errs } = convertText({
        text, file: rel, host, hostConfig, allowlist, pluginRoot: pluginRoot(rel),
      })
      errors.push(...errs)
      let final = mapped
      if (r === 'SKILL.md' && usesRelativePaths(text, runtimeRoot)) final = withTopLine(final, PATH_NOTE)
      if (r === 'SKILL.md' && callsRuntime(parseFrontmatter(text).body)) final = withTopLine(final, AGENT_NOTE)
      fs.writeFileSync(file, final)
    }
    const { meta } = parseFrontmatter(read(path.join(out, 'SKILL.md')))
    const manual = meta['disable-model-invocation'] === 'true'
    if (manual) for (const [r, text] of Object.entries(manualFiles)) write(path.join(out, r), text)
    skills.push({ name: meta.name || name, description: meta.description || '', implicit: !manual })
  }
  return { skills, errors }
}

/** Estimated size of the initial skill list: name + description + 4 per skill that allows implicit invocation (AC-24). */
export const skillListSize = (skills) => skills.filter((s) => s.implicit).reduce((n, s) => n + s.name.length + s.description.length + ENTRY_OVERHEAD, 0)

export function playwrightArgs(repo) {
  return readJson(path.join(repo, '.mcp.json')).mcpServers.playwright.args
}

/** Fills `<pkg>/runtime` with everything the bridge and the dispatcher need at run time (AC-55). */
export function buildRuntime(runtimeDir, repo, hostConfig, allowlist, host) {
  const errors = []
  const mapped = (from, rel) => {
    const { text, errors: errs } = convertText({ text: read(from), file: rel, host, hostConfig, allowlist, pluginRoot: null })
    errors.push(...errs)
    write(path.join(runtimeDir, rel), text)
  }
  const src = path.join(repo, 'src')
  const plugins = subdirs(path.join(src, 'plugins'))
  const mjs = (r, isDir) => !isDir && !r.endsWith('.mjs')
  copyTree(path.join(src, 'adapters/bridge'), path.join(runtimeDir, 'bridge'), mjs)
  copyTree(path.join(src, 'adapters/lib'), path.join(runtimeDir, 'lib'), mjs)
  copyTree(path.join(src, 'adapters/hooks'), path.join(runtimeDir, 'hooks'), mjs)
  copyTree(path.join(src, 'workflows'), path.join(runtimeDir, 'workflows'), (r, isDir) => isDir || !r.endsWith('.js'))
  for (const f of sortedNames(path.join(src, 'agents'), (e) => e.isFile() && e.name.endsWith('.md'))) mapped(path.join(src, 'agents', f), `agents/${f}`)
  for (const p of plugins) {
    for (const f of sortedNames(path.join(src, 'plugins', p, 'agents'), (e) => e.isFile() && e.name.endsWith('.md'))) mapped(path.join(src, 'plugins', p, 'agents', f), `agents/${f}`)
    for (const f of sortedNames(path.join(src, 'plugins', p, 'rules'), (e) => e.isFile())) (f.endsWith('.md') ? mapped(path.join(src, 'plugins', p, 'rules', f), `rules/${f}`) : copyFile(path.join(src, 'plugins', p, 'rules', f), path.join(runtimeDir, 'rules', f)))
    if (fs.existsSync(path.join(src, 'plugins', p, 'scripts'))) copyTree(path.join(src, 'plugins', p, 'scripts'), path.join(runtimeDir, 'addons', p, 'scripts'))
  }
  copyTree(path.join(repo, 'scripts'), path.join(runtimeDir, 'scripts'))
  for (const n of subdirs(path.join(src, 'skills'))) {
    if (fs.existsSync(path.join(src, 'skills', n, 'scripts'))) copyTree(path.join(src, 'skills', n, 'scripts'), path.join(runtimeDir, 'skills', n, 'scripts'))
  }
  copyFile(path.join(src, 'workflows/lib/stacks.js'), path.join(runtimeDir, 'workflows/lib/stacks.js'))
  // The rubrics, doc templates and core rule that skills cite through `.claude/templates/` and `.claude/rules/`.
  for (const dir of ['templates/reviews', 'templates/docs']) {
    for (const f of walkFiles(path.join(src, dir))) mapped(path.join(src, dir, f), `${dir}/${f}`)
  }
  for (const f of sortedNames(path.join(src, 'templates/rules'), (e) => e.isFile() && e.name.endsWith('.md'))) mapped(path.join(src, 'templates/rules', f), `rules/${f}`)
  // The new-stack scaffold renders a Claude add-on, so its text is copied unmapped; the token check still runs and
  // every Claude token it keeps needs a token-allowlist.json entry.
  for (const f of walkFiles(path.join(src, 'templates/stack-addon'))) {
    const rel = `templates/stack-addon/${f}`
    const from = path.join(src, 'templates/stack-addon', f)
    errors.push(...leftoverTokens(read(from), rel, host, allowlist).map(({ line, token }) => `${rel}:${line}: unmapped token ${token}; the scaffold is copied as is, so list it in src/adapters/token-allowlist.json with a reason or drop the token`))
    copyFile(from, path.join(runtimeDir, rel))
  }
  copyFile(path.join(src, 'workflows/lib/stacks.json'), path.join(runtimeDir, 'stacks.json'))
  copyFile(path.join(src, 'workflows/lib/stacks.json'), path.join(runtimeDir, 'workflows/lib/stacks.json'))
  copyFile(path.join(src, 'adapters/hosts.json'), path.join(runtimeDir, 'hosts.json'))
  copyFile(path.join(repo, 'VERSION'), path.join(runtimeDir, 'VERSION'))
  return errors
}

export function interfaceBlock(repo, displayName, description, developerName) {
  // A dist tree carries no tools/; its core manifest holds the stamped repository URL instead.
  const configFile = path.join(repo, 'tools/dist/config.json')
  const site = fs.existsSync(configFile)
    ? `https://github.com/${readJson(configFile).distRepo}`
    : readJson(path.join(repo, '.claude-plugin/plugin.json')).repository
  return {
    displayName,
    shortDescription: description.length > 120 ? `${description.slice(0, 117).trimEnd()}...` : description,
    developerName,
    category: 'Developer Tools',
    websiteURL: site,
    supportURL: `${site}/issues`,
  }
}

