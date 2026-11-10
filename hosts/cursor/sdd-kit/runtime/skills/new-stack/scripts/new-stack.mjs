#!/usr/bin/env node
/**
 * Scaffolds a stack add-on from the template at templates/stack-addon.
 *
 * Reads a JSON answers file and writes either
 *   --target src/plugins  src/plugins/<name>/ in the SDD Kit source checkout (then regenerates the registry), or
 *   --target project      .claude/stacks/<name>.json plus .claude/stack-addons/sdd-kit-<name>/ in a project
 *                         (the directories of the host named by --host; claude by default).
 *
 * Usage:
 *   new-stack.mjs --answers <file> --target src/plugins|project [--root <dir>] [--interactive] [--templates <dir>] [--host <name>]
 *
 * Answers file (JSON):
 *   name       stack key, lowercase with hyphens (for example "acme")
 *   role       backend | frontend | fullstack | mobile
 *   detect     one line describing how to recognise the stack
 *   paths      glob list of the stack's source files (required)
 *   gates      [{ name, command, kind? }]; kind defaults to "other" unless --interactive asks
 *   markers    optional globs, relative to the project root, that suggest the stack
 *   optional:  title, agent, order, conventions, debugPatterns, acceptance, author
 *
 * Exit codes: 0 done, 1 rejected answers or a failed step, 2 usage error.
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { spawnSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';

const HERE = path.dirname(fs.realpathSync(fileURLToPath(import.meta.url)));
const WORKFLOWS_LIB = path.resolve(HERE, '..', '..', '..', 'workflows', 'lib');
const SCHEMA_URL = 'https://raw.githubusercontent.com/stasmarkov/sdd-kit/main/plugins/sdd-kit/workflows/lib/stack.schema.json';
const ROLES = ['backend', 'frontend', 'fullstack', 'mobile'];
const KINDS = ['format', 'lint', 'types', 'test', 'e2e', 'build', 'other'];
const LINT_KINDS = ['format', 'lint', 'types'];
const NAME_PATTERN = /^[a-z][a-z0-9-]{1,31}$/;
const PROJECT_VERSION = '0.1.0';
const MARKER_FILES = ['VERSION', '.claude-plugin/plugin.json', 'tools/gen-stacks.mjs', 'src/plugins'];

/** Template file to add-on file; {{NAME}} and {{AGENT_NAME}} are filled in the target path. */
export const TEMPLATE_FILES = [
  ['.claude-plugin/plugin.json', '.claude-plugin/plugin.json'],
  ['stack.json', 'stack.json'],
  ['agents/agent.md', 'agents/{{AGENT_NAME}}.md'],
  ['skills/conventions/SKILL.md', 'skills/{{NAME}}/SKILL.md'],
  ['hooks/hooks.json', 'hooks/hooks.json'],
  ['scripts/lint.sh', 'scripts/{{NAME}}-lint.sh'],
];

/** Raised for answers or environments the scaffold refuses; the message already carries its fix. */
export class ScaffoldError extends Error {}

/** Raised for a --host value outside the host table; main() exits 2 for it. */
export class UnknownHostError extends ScaffoldError {}

const fail = (message) => {
  throw new ScaffoldError(message);
};

// ---------------------------------------------------------------- answers

const isString = (v) => typeof v === 'string' && v.trim() !== '';
const isStringList = (v) => Array.isArray(v) && v.every(isString);
// Stack source globs are pasted into a shell `case` pattern and a YAML list, so only path and wildcard characters pass.
const GLOB = /^[A-Za-z0-9_.\/*?-]+$/;
// A hook runs a gate only when every word of its command is made of these characters: nothing the shell expands or chains.
const HOOK_WORD = /^[A-Za-z0-9_.\/@+=:,%-]+$/;

/**
 * Validates and normalizes an answers object.
 * @param {object} raw parsed answers file
 * @param {{ ask?: (question: string) => Promise<string> | null }} [io] prompts for a missing gate kind or markers
 * @returns {Promise<object>} normalized answers
 */
export async function normalizeAnswers(raw, { ask = null } = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('answers: the file must hold one JSON object. Fix: write {"name": ..., "role": ..., "detect": ..., "paths": [...], "gates": [...]}.');
  const need = (key, ok, hint) => {
    if (!ok(raw[key])) fail(`answers: "${key}" is missing or invalid. Fix: ${hint}.`);
  };
  need('name', (v) => isString(v) && NAME_PATTERN.test(v), 'use a lowercase key of 2 to 32 characters (letters, digits, hyphens), for example "acme"');
  need('role', (v) => ROLES.includes(v), `use one of: ${ROLES.join(', ')}`);
  need('detect', (v) => isString(v), 'describe how the stack is recognised, for example "a build file requiring the framework"');
  need('paths', (v) => isStringList(v) && v.length > 0 && v.every((p) => GLOB.test(p.trim())), 'list the stack source globs, for example ["src/**/*.ext"], using only letters, digits and _ . / * ? -');
  need('gates', (v) => Array.isArray(v) && v.length > 0, 'list at least one gate as {"name": ..., "command": ..., "kind": ...}');

  const gates = [];
  for (const [i, g] of raw.gates.entries()) {
    if (!g || !isString(g.name) || !isString(g.command)) fail(`answers: gates[${i}] needs "name" and "command". Fix: write {"name": "Tests", "command": "run-tests"}.`);
    let kind = g.kind;
    if (kind === undefined && ask) kind = (await ask(`Kind of gate "${g.name}" (${KINDS.join('/')}) [other]: `)) || 'other';
    if (kind === undefined) kind = 'other';
    if (!KINDS.includes(kind)) fail(`answers: gates[${i}].kind "${kind}" is not allowed. Fix: use one of: ${KINDS.join(', ')}.`);
    gates.push({ name: g.name.trim(), command: g.command.trim(), kind });
  }

  let markers = raw.markers;
  if (markers === undefined && ask) {
    const line = await ask('Marker globs that suggest this stack, comma separated (optional, Enter to skip): ');
    markers = line ? line.split(',').map((m) => m.trim()).filter(Boolean) : undefined;
  }
  if (markers !== undefined && !isStringList(markers)) fail('answers: "markers" must be a list of globs. Fix: write ["build.file", "config/*.ext"].');

  for (const key of ['conventions', 'debugPatterns']) {
    if (raw[key] !== undefined && !isStringList(raw[key])) fail(`answers: "${key}" must be a list of strings. Fix: write a JSON array of strings.`);
  }
  for (const key of ['title', 'agent', 'acceptance', 'author']) {
    if (raw[key] !== undefined && !isString(raw[key])) fail(`answers: "${key}" must be a non-empty string. Fix: write a string or remove the key.`);
  }
  for (const key of ['title', 'author']) {
    if (raw[key] !== undefined && !/^[^:"\\\r\n{}]+$/.test(raw[key])) fail(`answers: "${key}" must not contain colons, quotes, backslashes or braces. Fix: reword it.`);
  }
  if (raw.agent !== undefined && !/^[a-z][a-z0-9-]*$/.test(raw.agent)) fail('answers: "agent" must be lowercase with hyphens. Fix: for example "acme-dev".');
  if (raw.order !== undefined && !Number.isInteger(raw.order)) fail('answers: "order" must be an integer. Fix: write a number such as 90 or remove the key.');

  const title = raw.title || raw.name.charAt(0).toUpperCase() + raw.name.slice(1);
  return {
    name: raw.name,
    role: raw.role,
    detect: raw.detect.trim(),
    paths: raw.paths.map((p) => p.trim()),
    gates,
    markers,
    title,
    agent: raw.agent || `${raw.name}-dev`,
    order: raw.order,
    conventions: raw.conventions && raw.conventions.length ? raw.conventions : [`follow the existing ${title} code style`],
    debugPatterns: raw.debugPatterns || [],
    acceptance: raw.acceptance || `exercise the ${title} application and run its test gate`,
    author: raw.author || 'SDD Kit contributors',
  };
}

// ---------------------------------------------------------------- lint script

/** First tokens that start a package runner: every stack's packageManagers in the registry, so no tool is named here. */
export function runnerTokens(registry) {
  const tokens = new Set(['npx']);
  for (const extras of Object.values((registry && registry.STACK_EXTRAS) || {})) {
    for (const pm of extras.packageManagers || []) {
      for (const field of [pm.name, pm.run, pm.exec]) if (typeof field === 'string' && field) tokens.add(field.split(/\s+/)[0]);
    }
  }
  return tokens;
}

/**
 * Builds the shell block that runs the lint-like gates behind a presence check.
 * A path command runs only when it is executable, a bare command only when `command -v` finds it.
 * A package runner, an environment prefix or any word with a shell metacharacter (`; & | $ \` ( ) < >`,
 * quotes, globs) leaves the gate out, so the hook never starts a download or runs a chained command.
 * The words that pass are single-quoted, and the message is built with `jq --arg`.
 * @param {Array<{name:string, command:string, kind:string}>} gates
 * @param {Set<string>} runners first tokens that start package runners
 * @returns {string} shell lines
 */
export function gateChecks(gates, runners) {
  const blocks = [];
  for (const gate of gates.filter((g) => LINT_KINDS.includes(g.kind))) {
    const words = gate.command.trim().split(/\s+/);
    const first = words[0];
    const label = gate.name.replace(/[^A-Za-z0-9 ._-]/g, '');
    if (!words.every((w) => HOOK_WORD.test(w)) || first.includes('=') || runners.has(first)) {
      blocks.push(`# Gate "${label}" is not run from this hook: its command starts with a package runner or an environment prefix, or uses shell syntax.`);
      continue;
    }
    let test;
    if (first.startsWith('/')) test = `-x '${first}'`;
    else if (first.includes('/')) test = `-x "$PROJECT_DIR"/'${first.replace(/^\.\//, '')}'`;
    else test = null;
    const cond = test ? `[[ ${test} ]]` : `command -v '${first}' >/dev/null 2>&1`;
    blocks.push([
      `if ${cond}; then`,
      `    (cd "$PROJECT_DIR" && ${words.map((w) => `'${w}'`).join(' ')}) >/dev/null 2>&1 || {`,
      `        jq -cn --arg m "Lint: ${label} reported issues after editing $REL_PATH." '{systemMessage: $m}'`,
      '    }',
      'fi',
    ].join('\n'));
  }
  return blocks.length ? blocks.join('\n\n') : ': # no lint-like gates declared';
}

/** Turns stack source globs into the alternatives of a shell `case` pattern. */
export function pathCases(paths) {
  return paths.map((p) => p.replace(/\*\*\//g, '*').replace(/\*\*/g, '*').replace(/\|/g, '')).join('|');
}

// ---------------------------------------------------------------- rendering

const PLACEHOLDER = /\{\{([A-Z][A-Z0-9_]*)\}\}/g;

function fill(text, values) {
  return text.replace(PLACEHOLDER, (m, key) => (key in values ? values[key] : m));
}

function fillJson(node, values) {
  if (typeof node === 'string') return fill(node, values);
  if (Array.isArray(node)) return node.map((n) => fillJson(n, values));
  if (node && typeof node === 'object') return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, fillJson(v, values)]));
  return node;
}

function assertFilled(rel, text) {
  const left = text.match(PLACEHOLDER);
  if (left) fail(`${rel}: placeholder ${left[0]} was not filled. Fix: add the value to the answers or restore the template.`);
}

/** Builds the stack manifest structurally; the template supplies key order and the schema URL. */
function buildManifest(template, a, { overlay, order }) {
  const base = { ...JSON.parse(template) };
  const manifest = {};
  for (const key of Object.keys(base)) {
    switch (key) {
      case '$schema': manifest[key] = base[key]; break;
      case 'name': manifest.name = a.name; break;
      case 'order': manifest.order = order; break;
      case 'role': manifest.role = a.role; break;
      case 'detect': manifest.detect = a.detect; break;
      case 'agent': manifest.agent = { name: a.agent, plugin: `sdd-kit-${a.name}` }; break;
      case 'conventions': manifest.conventions = a.conventions; break;
      case 'gates': manifest.gates = a.gates; break;
      case 'debugPatterns': manifest.debugPatterns = a.debugPatterns; break;
      case 'acceptance': manifest.acceptance = a.acceptance; break;
      default: manifest[key] = base[key];
    }
  }
  if (a.markers && a.markers.length) manifest.markers = a.markers;
  if (!overlay) manifest.$schema = '../../workflows/lib/stack.schema.json';
  return manifest;
}

/**
 * Renders every add-on file as { rel, content, mode }.
 * @param {string} templateDir the templates/stack-addon directory
 * @param {object} a normalized answers
 * @param {{ version: string, overlay: boolean, order: number, runners: Set<string> }} ctx
 */
export function renderAddon(templateDir, a, ctx) {
  const values = {
    NAME: a.name,
    TITLE: a.title,
    VERSION: ctx.version,
    ROLE: a.role,
    DETECT: a.detect,
    AGENT_NAME: a.agent,
    AUTHOR: a.author,
    PATHS_YAML: a.paths.map((p) => `  - "${p}"`).join('\n'),
    PATH_CASES: pathCases(a.paths),
    GATE_CHECKS: gateChecks(a.gates, ctx.runners),
    CONVENTIONS_LIST: a.conventions.map((c) => `- ${c}`).join('\n'),
  };
  const out = [];
  for (const [from, to] of TEMPLATE_FILES) {
    const raw = fs.readFileSync(path.join(templateDir, from), 'utf8');
    let content;
    if (from === 'stack.json') {
      content = `${JSON.stringify(buildManifest(raw, a, ctx), null, 2)}\n`;
    } else if (from.endsWith('.json')) {
      const json = fillJson(JSON.parse(raw), values);
      if (from === '.claude-plugin/plugin.json') delete json.dependencies;
      content = `${JSON.stringify(json, null, 2)}\n`;
    } else {
      content = fill(raw, values);
    }
    const rel = fill(to, values);
    assertFilled(rel, content);
    out.push({ rel, content, mode: from.endsWith('.sh') ? 0o755 : 0o644 });
  }
  return out;
}

// ---------------------------------------------------------------- environment

function findTemplates(override) {
  const candidates = [
    override,
    path.resolve(HERE, '..', '..', '..', 'templates', 'stack-addon'),
    path.resolve(HERE, '..', '..', '..', '..', '..', 'share', 'templates', 'stack-addon'),
  ].filter(Boolean);
  const found = candidates.find((c) => fs.existsSync(path.join(c, 'stack.json')));
  if (!found) fail(`templates: no stack-addon template found (tried: ${candidates.join(', ')}). Fix: pass --templates <dir> or reinstall the kit.`);
  return found;
}

async function loadRegistry() {
  const quiet = process.emitWarning;
  process.emitWarning = () => {};
  try {
    return await import(pathToFileURL(path.join(WORKFLOWS_LIB, 'stacks.js')).href);
  } catch {
    return null;
  } finally {
    process.emitWarning = quiet;
  }
}

/** Keys inlined in the core registry, plus "other"; an overlay can never use them. */
function firstPartyKeys(registry) {
  const keys = registry && Array.isArray(registry.FIRST_PARTY_KEYS) ? registry.FIRST_PARTY_KEYS : [];
  return [...new Set([...keys, 'other'])];
}

/**
 * The rejection for a project manifest that reuses a first-party key. It names the install that
 * actually provides the key (one add-on can provide several keys; "other" needs none) and suggests a
 * name that passes every project-target check.
 * @param {string} key the rejected first-party key
 * @param {object|null} registry the loaded stacks.js module, or null when it could not be imported
 * @param {string} root project root
 * @returns {string} message with its Fix
 */
function firstPartyKeyMessage(key, registry, root, stacksDir = '.claude/stacks') {
  const taken = new Set(firstPartyKeys(registry));
  const suggestion = ['-app', '-stack', '-project', '-custom', '-2', '-3']
    .map((s) => `${key}${s}`)
    .find((n) => NAME_PATTERN.test(n) && !taken.has(n) && !fs.existsSync(path.join(root, stacksDir, `${n}.json`)));
  const example = suggestion ? `, for example "${suggestion}"` : '';
  const head = `answers: "${key}" is a first-party stack key; workflows ignore a project manifest that reuses it.`;
  const dir = registry && typeof registry.addonFor === 'function' ? registry.addonFor(key).dir : null;
  if (dir) return `${head} Fix: install the first-party add-on instead (install.sh --stack=${dir} or /plugin install sdd-kit-${dir}@sdd-kit), or choose another name${example}.`;
  if (key === 'other') return `${head} Fix: "other" is the built-in catch-all stack and needs no add-on; choose another name${example}.`;
  return `${head} Fix: choose another name${example}.`;
}

function readJsonFile(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function checkoutRoot(root) {
  const missing = MARKER_FILES.filter((m) => !fs.existsSync(path.join(root, m)));
  const core = readJsonFile(path.join(root, '.claude-plugin/plugin.json'));
  if (missing.length || !core || core.name !== 'sdd-kit') {
    fail(`target: ${root} is not the SDD Kit source checkout (missing ${missing.join(', ') || 'the sdd-kit plugin manifest'}). Fix: run from the checkout root, pass --root <checkout>, or use --target project.`);
  }
}

function nextOrder(root) {
  let max = 0;
  const dir = path.join(root, 'src/plugins');
  for (const d of fs.readdirSync(dir)) {
    const m = readJsonFile(path.join(dir, d, 'stack.json'));
    for (const e of Array.isArray(m) ? m : m ? [m] : []) if (Number.isInteger(e.order)) max = Math.max(max, e.order);
  }
  return max + 10;
}

function writeAll(base, files) {
  for (const f of files) {
    const dest = path.join(base, f.rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, f.content);
    fs.chmodSync(dest, f.mode);
  }
}

function runStep(cmd, args, cwd) {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8' });
  return { ok: r.status === 0, out: `${r.stdout || ''}${r.stderr || ''}`.trim() };
}

// ---------------------------------------------------------------- main

/**
 * Runs the scaffold.
 * @param {{ answers: object, target: 'src/plugins'|'project', root: string, templates?: string, ask?: Function, host?: string }} opts
 * @returns {Promise<{ lines: string[], written: string[] }>} next-step lines and the written files (repo-relative)
 */
export async function scaffold({ answers, target, root, templates, ask = null, host = 'claude' }) {
  if (!['src/plugins', 'project'].includes(target)) fail('target: use "src/plugins" or "project". Fix: pass --target src/plugins or --target project.');
  const a = await normalizeAnswers(answers, { ask });
  const registry = await loadRegistry();
  const dirs = hostDirs(registry, host);
  const templateDir = findTemplates(templates);
  const overlay = target === 'project';
  const lines = [];

  if (!overlay) {
    checkoutRoot(root);
    const { scanCandidateKey } = await import(pathToFileURL(path.join(root, 'tools/check-neutrality.mjs')).href);
    const { message } = scanCandidateKey(a.name, { root });
    if (message) fail(message);
    if (fs.existsSync(path.join(root, 'src/plugins', a.name))) fail(`src/plugins/${a.name} already exists. Fix: choose another name or remove the directory.`);
  } else if (firstPartyKeys(registry).includes(a.name)) {
    fail(firstPartyKeyMessage(a.name, registry, root, dirs.stacksDir));
  } else if (fs.existsSync(path.join(root, dirs.stacksDir, `${a.name}.json`))) {
    fail(`${dirs.stacksDir}/${a.name}.json already exists. Fix: choose another name or delete the file.`);
  }

  const version = overlay ? PROJECT_VERSION : fs.readFileSync(path.join(root, 'VERSION'), 'utf8').trim();
  const order = a.order ?? (overlay ? 100 : nextOrder(root));
  const files = renderAddon(templateDir, a, { version, overlay, order, runners: runnerTokens(registry) });

  if (registry && registry.validateStackManifest) {
    const manifest = JSON.parse(files.find((f) => f.rel === 'stack.json').content);
    const problems = registry.validateStackManifest(manifest, { overlay });
    if (problems.length) fail(`stack.json: ${problems.map((p) => `${p.pointer || '/'} ${p.problem}. Fix: ${p.fix}`).join('; ')}`);
  }

  const written = [];
  if (!overlay) {
    const base = path.join(root, 'src/plugins', a.name);
    writeAll(base, files);
    written.push(...files.map((f) => `src/plugins/${a.name}/${f.rel}`));
    updateCategories(root, a);
    written.push('src/categories.json');
    const gen = runStep('node', ['tools/gen-stacks.mjs'], root);
    lines.push(gen.ok ? 'Regenerated the stack registry (node tools/gen-stacks.mjs).' : `node tools/gen-stacks.mjs failed: ${gen.out}`);
    const idx = fs.existsSync(path.join(root, 'tools/gen-indexes.py')) ? runStep('python3', ['tools/gen-indexes.py'], root) : { ok: false, out: 'tools/gen-indexes.py not found' };
    lines.push(idx.ok ? 'Regenerated the skill and agent indexes (python3 tools/gen-indexes.py).' : `python3 tools/gen-indexes.py did not run: ${idx.out}`);
    lines.push(
      '',
      `Created src/plugins/${a.name} (sdd-kit-${a.name}, version ${version}).`,
      'Next:',
      `  1. Review src/plugins/${a.name}/stack.json, the agent and the conventions skill, then fill in real guidance.`,
      '  2. Run ./verify.sh.',
      `  3. Try it with: claude --plugin-dir . --plugin-dir src/plugins/${a.name}`,
    );
  } else {
    const manifestFile = files.find((f) => f.rel === 'stack.json');
    const addonDir = `${dirs.stackAddonsDir}/sdd-kit-${a.name}`;
    writeAll(path.join(root, dirs.stacksDir), [{ ...manifestFile, rel: `${a.name}.json` }]);
    written.push(`${dirs.stacksDir}/${a.name}.json`);
    const addonFiles = files.filter((f) => f.rel !== 'stack.json');
    writeAll(path.join(root, addonDir), addonFiles);
    written.push(...addonFiles.map((f) => `${addonDir}/${f.rel}`));
    lines.push(
      `Created ${dirs.stacksDir}/${a.name}.json and ${addonDir}/ (version ${version}).`,
      'Next:',
      ...dirs.installHint(addonDir),
      `  3. Run ${dirs.trustCommand} to approve the manifest. Its gate commands do not run until you do.`,
    );
  }
  return { lines, written };
}

/**
 * The project directories and next-step text of a host, from the registry's host table.
 * @param {object|null} registry the loaded stacks.js module, or null when it could not be imported
 * @param {string} host host name
 * @returns {{ stacksDir: string, stackAddonsDir: string, trustCommand: string, installHint: (addonDir: string) => string[] }}
 * @throws {UnknownHostError} when the host is not in the table
 */
function hostDirs(registry, host) {
  const table = (registry && registry.HOSTS) || { claude: { stacksDir: '.claude/stacks', stackAddonsDir: '.claude/stack-addons' } };
  const entry = Object.prototype.hasOwnProperty.call(table, host) ? table[host] : null;
  if (!entry) throw new UnknownHostError(`host: unknown host "${host}". Fix: use one of: ${Object.keys(table).join(', ')}.`);
  if (host === 'claude') {
    return {
      ...entry,
      trustCommand: '/stack-trust',
      installHint: (addonDir) => [
        `  1. Plugin mode: start Claude Code with --plugin-dir ${addonDir}. The agent, the conventions skill and the lint hook load only that way.`,
        '  2. File-copy mode: the add-on is not installed by copying; workflows fall back to the default agent and log the fallback.',
      ],
    };
  }
  return {
    ...entry,
    trustCommand: `the stack-trust skill (trust-store.mjs --host ${host})`,
    installHint: (addonDir) => [
      `  1. The agent and the conventions skill in ${addonDir} load only when that directory is installed as a ${host} plugin.`,
      '  2. Without it, workflows fall back to the default agent and log the fallback.',
    ],
  };
}

function updateCategories(root, a) {
  const file = path.join(root, 'src/categories.json');
  const data = readJsonFile(file);
  if (!data) fail('src/categories.json: file is missing or not valid JSON. Fix: restore it, then add the entries by hand.');
  data.agents = { ...data.agents, [a.agent]: 'execution' };
  data.skills = { ...data.skills, [a.name]: 'frameworks' };
  const sort = (o) => Object.fromEntries(Object.entries(o).sort(([x], [y]) => x.localeCompare(y)));
  data.agents = sort(data.agents);
  data.skills = sort(data.skills);
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}

function parseArgs(argv) {
  const opts = { root: process.cwd(), interactive: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = () => argv[++i];
    if (arg === '--answers') opts.answersFile = value();
    else if (arg === '--target') opts.target = value();
    else if (arg === '--root') opts.root = path.resolve(value() || '.');
    else if (arg === '--templates') opts.templates = path.resolve(value() || '.');
    else if (arg === '--host') opts.host = value();
    else if (arg === '--interactive') opts.interactive = true;
    else return { error: `unknown argument ${arg}` };
  }
  if (!opts.answersFile || !opts.target) return { error: 'missing --answers or --target' };
  return { opts };
}

async function main(argv) {
  const { opts, error } = parseArgs(argv);
  if (error) {
    console.error(`new-stack: ${error}. Usage: new-stack.mjs --answers <file> --target src/plugins|project [--root <dir>] [--interactive] [--host <name>]`);
    return 2;
  }
  let rl = null;
  let ask = null;
  if (opts.interactive) {
    rl = readline.createInterface({ input: process.stdin, output: process.stderr });
    ask = (q) => new Promise((resolve) => rl.question(q, (v) => resolve(v.trim())));
  }
  try {
    const answers = JSON.parse(fs.readFileSync(opts.answersFile, 'utf8'));
    const { lines } = await scaffold({ answers, target: opts.target, root: opts.root, templates: opts.templates, ask, host: opts.host });
    for (const l of lines) console.log(l);
    return 0;
  } catch (e) {
    if (e instanceof ScaffoldError) console.error(e.message);
    else console.error(`new-stack: ${e.message}. Fix: check the answers file path and that it holds valid JSON.`);
    return e instanceof UnknownHostError ? 2 : 1;
  } finally {
    if (rl) rl.close();
  }
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = await main(process.argv.slice(2));
