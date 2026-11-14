#!/usr/bin/env node
// Docs convention: loads the default and the project override, checks a
// Markdown path against it and writes docs/conventions.md (--init).
//
//   node convention.mjs check <path> [--json] [--root=<dir>]
//   node convention.mjs --init [--root=<dir>]
//
// No dependencies: the YAML in a convention is a small documented subset.
import { existsSync, lstatSync, readFileSync, readdirSync, writeFileSync, mkdirSync, realpathSync } from 'node:fs';
import { dirname, join, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_FILE = join(HERE, '..', 'references', 'default-convention.md');

const MAP_KEYS = ['folders', 'ordered'];
const LIST_KEYS = ['rootAllowed', 'bannedTokens', 'generated', 'ignore', 'nameExceptions', 'absoluteLinks'];
const KNOWN_KEYS = [...MAP_KEYS, ...LIST_KEYS];

export class ConventionError extends Error {}

// File line of each top-level key, kept beside the parsed object for error messages.
const KEY_LINES = new WeakMap();

// ---- YAML subset ---------------------------------------------------------

function stripComment(line) {
  let quote = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === '"' || c === "'") {
      if (i === 0 || /[\s[,:]/.test(line[i - 1])) quote = c;
    } else if (c === '#' && (i === 0 || /\s/.test(line[i - 1]))) {
      return line.slice(0, i);
    }
  }
  return line;
}

function parseScalar(raw, lineNo) {
  const s = raw.trim();
  if (s === '~' || s === 'null') return null;
  const q = s[0];
  if (q === '"' || q === "'") {
    if (s.length < 2 || s[s.length - 1] !== q) {
      throw new ConventionError(`line ${lineNo}: unterminated quote. Fix: close the quote.`);
    }
    return s.slice(1, -1);
  }
  if (/^[{|>&*!]/.test(s)) {
    throw new ConventionError(`line ${lineNo}: unsupported YAML "${s}". Fix: use plain scalars, quoted strings, block lists or flow lists.`);
  }
  return s;
}

function parseFlowList(raw, lineNo) {
  const s = raw.trim();
  if (!s.endsWith(']')) {
    throw new ConventionError(`line ${lineNo}: flow list must close on the same line. Fix: put the whole [..] list on one line or use a block list.`);
  }
  const inner = s.slice(1, -1);
  const items = [];
  let cur = '';
  let quote = null;
  for (const c of inner) {
    if (quote) {
      cur += c;
      if (c === quote) quote = null;
    } else if (c === '"' || c === "'") {
      quote = c;
      cur += c;
    } else if (c === ',') {
      items.push(cur);
      cur = '';
    } else {
      cur += c;
    }
  }
  if (quote) throw new ConventionError(`line ${lineNo}: unterminated quote. Fix: close the quote.`);
  items.push(cur);
  return items.map((i) => i.trim()).filter((i, idx, all) => i !== '' || idx < all.length - 1).map((i) => parseScalar(i, lineNo));
}

function parseValue(raw, lineNo) {
  const s = raw.trim();
  return s.startsWith('[') ? parseFlowList(s, lineNo) : parseScalar(s, lineNo);
}

function splitKey(text, lineNo) {
  const m = /^([^\s:][^:]*?):(?:\s+(.*))?$/.exec(text.trim());
  if (!m) {
    throw new ConventionError(`line ${lineNo}: expected "key: value". Fix: write the line as key: value.`);
  }
  return [m[1].trim(), m[2] ?? ''];
}

/**
 * Parses the convention YAML subset: block maps one level deep, block lists,
 * flow lists, plain / single- / double-quoted scalars, `#` comments.
 * @param {string} text
 * @param {number} [lineOffset] lines before `text` in its file, for error messages
 * @returns {Record<string, unknown>}
 * @throws {ConventionError} naming the line and the fix
 */
export function parseYamlSubset(text, lineOffset = 0) {
  const rows = [];
  text.split('\n').forEach((line, i) => {
    const lineNo = i + 1 + lineOffset;
    if (/\t/.test(line.match(/^\s*/)[0])) {
      throw new ConventionError(`line ${lineNo}: tab indentation. Fix: indent with spaces.`);
    }
    const body = stripComment(line).replace(/\s+$/, '');
    if (body.trim() === '') return;
    rows.push({ lineNo, indent: body.match(/^ */)[0].length, text: body.trim() });
  });

  const out = {};
  const lines = {};
  KEY_LINES.set(out, lines);
  let i = 0;
  while (i < rows.length) {
    const row = rows[i];
    if (row.indent !== 0) {
      throw new ConventionError(`line ${row.lineNo}: unexpected indentation. Fix: top-level keys start at column 0 and nest one level only.`);
    }
    if (row.text.startsWith('- ')) {
      throw new ConventionError(`line ${row.lineNo}: list item without a key. Fix: put it under a key such as rootAllowed:.`);
    }
    const [key, rest] = splitKey(row.text, row.lineNo);
    if (key in out) throw new ConventionError(`line ${row.lineNo}: duplicate key "${key}". Fix: remove one of them.`);
    lines[key] = row.lineNo;
    i++;
    if (rest !== '') {
      out[key] = parseValue(rest, row.lineNo);
      continue;
    }
    const children = [];
    while (i < rows.length && rows[i].indent > 0) children.push(rows[i++]);
    if (children.length === 0) {
      out[key] = null;
    } else if (children[0].text.startsWith('- ')) {
      out[key] = children.map((c) => {
        if (!c.text.startsWith('- ') || c.indent !== children[0].indent) {
          throw new ConventionError(`line ${c.lineNo}: mixed or nested list. Fix: keep one flat "- item" list per key.`);
        }
        return parseScalar(c.text.slice(2), c.lineNo);
      });
    } else {
      const map = {};
      for (const c of children) {
        if (c.indent !== children[0].indent || c.text.startsWith('- ')) {
          throw new ConventionError(`line ${c.lineNo}: nesting deeper than one level. Fix: keep "type: value" pairs on one indent.`);
        }
        const [k, v] = splitKey(c.text, c.lineNo);
        if (v.startsWith('[')) {
          throw new ConventionError(`line ${c.lineNo}: a list under "${key}". Fix: "${key}" maps a type to one value.`);
        }
        map[k] = parseScalar(v, c.lineNo);
      }
      out[key] = map;
    }
  }
  return out;
}

// ---- sources and merge ---------------------------------------------------

const YAML_BLOCK = /^```yaml[^\n]*\n([\s\S]*?)^```/m;

function extractYaml(md, where) {
  const m = YAML_BLOCK.exec(md);
  if (!m) {
    throw new ConventionError(`${where} has no fenced yaml block. Fix: add a fenced yaml block, or remove the section.`);
  }
  const offset = md.slice(0, m.index).split('\n').length;
  return { text: m[1], offset };
}

function sectionOf(md, heading) {
  const re = new RegExp(`^##\\s+${heading}\\s*$`, 'm');
  const m = re.exec(md);
  if (!m) return null;
  const start = m.index + m[0].length;
  const next = /^##\s/m.exec(md.slice(start));
  const end = next ? start + next.index : md.length;
  return { text: md.slice(start, end), offset: md.slice(0, start).split('\n').length - 1 };
}

const isGlobChar = (s) => /[*?[\]{}]/.test(s);

/** Throws unless `folder` is a plain repo-relative folder: no `..`, no absolute path, no glob. */
function checkFolder(folder, at) {
  const bad = (why) => {
    throw new ConventionError(`${at}: "${folder}" ${why}. Fix: use a repo-relative folder such as docs/archive.`);
  };
  if (typeof folder !== 'string' || folder.trim() === '') bad('is empty');
  const f = folder.replaceAll('\\', '/');
  if (f.startsWith('/') || /^[A-Za-z]:/.test(f) || f.startsWith('~')) bad('is an absolute path');
  if (f.split('/').some((seg) => seg === '..' || seg === '.')) bad('leaves the repo or has a . segment');
  if (f.endsWith('/')) bad('ends in a slash');
  if (isGlobChar(f)) bad('is a glob');
}

function validate(conv, where) {
  const lines = KEY_LINES.get(conv) ?? {};
  const at = (key) => (lines[key] ? `${where}: line ${lines[key]}` : where);
  for (const key of Object.keys(conv)) {
    if (!KNOWN_KEYS.includes(key)) {
      throw new ConventionError(`${at(key)}: unknown key "${key}". Fix: use one of ${KNOWN_KEYS.join(', ')}.`);
    }
  }
  for (const key of MAP_KEYS) {
    const v = conv[key];
    if (v !== undefined && (v === null || typeof v !== 'object' || Array.isArray(v))) {
      throw new ConventionError(`${at(key)}: "${key}" must map a type to a value. Fix: write "type: value" lines under ${key}:.`);
    }
  }
  for (const key of LIST_KEYS) {
    const v = conv[key];
    if (v !== undefined && !Array.isArray(v)) {
      throw new ConventionError(`${at(key)}: "${key}" must be a list. Fix: write [a, b] or "- item" lines.`);
    }
    if (Array.isArray(v) && v.some((item) => typeof item !== 'string' || item === '')) {
      throw new ConventionError(`${at(key)}: "${key}" has an empty item. Fix: remove it or quote the value.`);
    }
  }
  for (const [type, folder] of Object.entries(conv.folders ?? {})) {
    if (folder !== null) checkFolder(folder, `${at('folders')}: folders.${type}`);
  }
  for (const [type, pattern] of Object.entries(conv.ordered ?? {})) {
    if (pattern === null || pattern === 'keep' || pattern === 'spec-folder') continue;
    try {
      patternToRegExp(pattern);
    } catch {
      throw new ConventionError(`${at('ordered')}: ordered.${type} "${pattern}" is not a valid name pattern. Fix: close every [ with ] and use the documented tokens.`);
    }
  }
}

/**
 * Merges an override onto a base convention: top-level keys replace, `folders`
 * and `ordered` merge per type (`~` removes a type), lists replace.
 */
export function mergeConvention(base, override) {
  const out = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (MAP_KEYS.includes(key)) {
      const merged = { ...base[key] };
      for (const [type, v] of Object.entries(value)) {
        if (v === null) delete merged[type];
        else merged[type] = v;
      }
      out[key] = merged;
    } else {
      out[key] = value ?? [];
    }
  }
  return out;
}

export function loadDefault() {
  const md = readFileSync(DEFAULT_FILE, 'utf8');
  const { text, offset } = extractYaml(md, 'references/default-convention.md');
  const conv = parseYamlSubset(text, offset);
  validate(conv, 'references/default-convention.md');
  return conv;
}

/**
 * Resolves the convention for a repo. Sources in order: docs/conventions.md,
 * the "## Docs conventions" section of AGENTS.md, the same section of
 * CLAUDE.md, then the default. The first existing source is the override.
 * @returns {{convention: object, source: string}}
 */
export function resolveConvention(root) {
  const base = loadDefault();
  const candidates = [
    { source: 'docs/conventions.md', section: false },
    { source: 'AGENTS.md', section: true },
    { source: 'CLAUDE.md', section: true },
  ];
  for (const { source, section } of candidates) {
    const file = join(root, source);
    if (!existsSync(file)) continue;
    let md = readFileSync(file, 'utf8');
    let lineBase = 0;
    let where = source;
    if (section) {
      const sec = sectionOf(md, 'Docs conventions');
      if (!sec) continue;
      lineBase = sec.offset;
      md = sec.text;
      where = `${source} "## Docs conventions"`;
    }
    const { text, offset } = extractYaml(md, where);
    let override;
    try {
      override = parseYamlSubset(text, offset + lineBase);
    } catch (e) {
      if (e instanceof ConventionError) throw new ConventionError(`${source}: ${e.message}`);
      throw e;
    }
    validate(override, source);
    return { convention: mergeConvention(base, override), source };
  }
  return { convention: base, source: 'default' };
}

// ---- name rules ----------------------------------------------------------

export function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        if (glob[i + 2] === '/') {
          re += '(?:.*/)?';
          i += 2;
        } else {
          re += '.*';
          i += 1;
        }
      } else {
        re += '[^/]*';
      }
    } else if (c === '?') {
      re += '[^/]';
    } else {
      re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`^${re}$`);
}

export const matchesAny = (path, globs = []) => globs.some((g) => globToRegExp(g).test(path));

const SLUG = '[a-z0-9]+(?:-[a-z0-9]+)*';

/** Compiles an `ordered` name pattern (without `.md`) to a RegExp. */
export function patternToRegExp(pattern) {
  const tokens = [
    ['YYYY-MM-DD', '\\d{4}-\\d{2}-\\d{2}'],
    ['YYYYMMDD', '\\d{8}'],
    ['NNNN', '\\d{4}'],
    ['HHMM', '\\d{4}'],
    ['<slug>', SLUG],
    ['<kind>', SLUG],
    ['<subject>', SLUG],
    ['<n>', '\\d+'],
  ];
  let re = '';
  for (let i = 0; i < pattern.length; ) {
    const hit = tokens.find(([t]) => pattern.startsWith(t, i));
    if (hit) {
      re += hit[1];
      i += hit[0].length;
    } else if (pattern[i] === '[') {
      re += '(?:';
      i++;
    } else if (pattern[i] === ']') {
      re += ')?';
      i++;
    } else {
      re += pattern[i].replace(/[.+*?^${}()|\\]/g, '\\$&');
      i++;
    }
  }
  return new RegExp(`^${re}$`);
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const posix = (p) => p.split(sep).join('/').replace(/^\.\//, '');
export const stem = (name) => name.replace(/\.md$/i, '');
export const tokensOf = (name) => stem(name).split(/[-_.\s]+/).filter(Boolean);
export const lastSegment = (p) => p.split('/').pop();

export function isBanned(token, banned) {
  return banned.some((b) => {
    if (b.endsWith('<N>')) return new RegExp(`^${escapeRe(b.slice(0, -3))}\\d+$`, 'i').test(token);
    return b.toLowerCase() === token.toLowerCase();
  });
}

function typeOf(dir, conv) {
  let best = null;
  for (const [type, folder] of Object.entries(conv.folders)) {
    if ((dir === folder || dir.startsWith(`${folder}/`)) && (!best || folder.length > conv.folders[best].length)) {
      best = type;
    }
  }
  return best;
}

const DATE_TOKEN = /(?:^|[-_.\s])(\d{8}|\d{4}-\d{2}-\d{2})(?:$|[-_.\s])/;

export function cleanName(name, conv) {
  const parts = tokensOf(name)
    .filter((t) => !isBanned(t, conv.bannedTokens))
    .map((t) => t.toLowerCase().replace(/[^a-z0-9]/g, ''))
    .filter(Boolean);
  return parts.join('-');
}

/**
 * Next free four-digit ADR number in `folder`: one above the highest number on disk and
 * the numbers already handed out in this run, so one audit never suggests a number twice.
 */
function nextAdrNumber(root, folder, assigned) {
  const used = assigned?.get(folder) ?? new Set();
  let max = Math.max(0, ...used);
  const dir = join(root, folder);
  if (existsSync(dir)) {
    for (const f of readdirSync(dir)) {
      const m = /^(\d{4})-/.exec(f);
      if (m) max = Math.max(max, Number(m[1]));
    }
  }
  const next = max + 1;
  if (assigned) assigned.set(folder, used.add(next));
  return String(next).padStart(4, '0');
}

function inferTypeFromName(name, conv) {
  const toks = tokensOf(name).map((t) => t.toLowerCase());
  for (const t of toks) {
    for (const [type, folder] of Object.entries(conv.folders)) {
      if (type === 'archive' || type === 'spec') continue;
      if (t === type.toLowerCase() || t === lastSegment(folder).toLowerCase()) return type;
    }
  }
  return null;
}

/**
 * Suggested path for a file that breaks a rule. A placed file keeps its own folder and
 * only gets a new basename; an unplaced one goes to the folder its name suggests, else
 * the guide folder.
 */
function suggest(rel, dir, type, placed, conv, opts) {
  const name = lastSegment(rel);
  let slug = cleanName(name, conv);
  let target = placed && type && type !== 'doc' && type !== 'root' ? type : null;
  if (!target && !placed) target = inferTypeFromName(name, conv);
  const fallback = conv.folders.guide ?? 'docs';
  const folder = placed ? dir : target ? conv.folders[target] : fallback;
  const pattern = target && conv.ordered?.[target];
  if (pattern === 'keep' || pattern === 'spec-folder') return `${folder}/${name}`;
  if (target) slug = slug.replace(/^\d{4,8}-?/, '').replace(/-?\d{8}$/, '');
  if (!slug) slug = target ?? 'doc';
  if (pattern === 'NNNN-<slug>') return `${folder}/${nextAdrNumber(opts.root, folder, opts.assigned)}-${slug}.md`;
  if (pattern === 'YYYY-MM-DD-<slug>') return `${folder}/${opts.today}-${slug}.md`;
  if (pattern?.includes('YYYYMMDD')) return `${folder}/${slug}-${opts.today.replaceAll('-', '')}.md`;
  return `${folder}/${slug}.md`;
}

const LOWERCASE_NAME = /^[a-z0-9][a-z0-9.-]*\.md$/;
const ARCHIVE_GLOB = '**/_archive/**';

/**
 * Checks one repo-relative Markdown path against a convention.
 * @param {string} path repo-relative path of a `.md` file
 * @param {object} conv a resolved convention
 * @param {{root?: string, today?: string, assigned?: Map<string, Set<number>>}} [opts] root: repo root
 *   (ADR numbering, existing targets); today: UTC YYYY-MM-DD; assigned: ADR numbers already suggested
 *   in this run, shared across calls so two files never get the same number
 * @returns {{path: string, ok: boolean, skipped: boolean, problems: {rule: string, message: string}[], warnings: {rule: string, message: string}[], suggestion: string|null}}
 */
export function checkPath(path, conv, opts = {}) {
  const root = opts.root ?? process.cwd();
  const today = opts.today ?? new Date().toISOString().slice(0, 10);
  const rel = posix(path);
  const result = { path: rel, ok: true, skipped: false, problems: [], warnings: [], suggestion: null };

  if (matchesAny(rel, conv.ignore) || matchesAny(rel, conv.generated)) {
    result.skipped = true;
    return result;
  }

  const name = lastSegment(rel);
  // README.md is allowed in every folder; archived files keep their original name.
  if (name === 'README.md' || matchesAny(rel, [ARCHIVE_GLOB])) return result;

  const dir = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '';
  const type = dir === '' ? 'root' : dir === 'docs' ? 'doc' : typeOf(dir, conv);
  const problem = (rule, message) => result.problems.push({ rule, message });
  const rootAllowed = conv.rootAllowed.includes(name);
  // Lowercase rootAllowed names (product-brief.md) are ordinary names below the root.
  const rootOnly = rootAllowed && !LOWERCASE_NAME.test(name);

  const ordered = type && conv.ordered?.[type];
  if (ordered) {
    if (ordered !== 'keep' && ordered !== 'spec-folder' && !patternToRegExp(ordered).test(stem(name))) {
      problem('ordered-name', `${type} names follow ${ordered}.md`);
    }
  } else {
    const exempt = matchesAny(rel, conv.nameExceptions);
    if (type === 'root' && rootAllowed) {
      // allowed as is
    } else if (!exempt) {
      if (rootOnly) {
        problem('root-only', `${name} is only allowed at the repo root`);
      } else {
        if (!LOWERCASE_NAME.test(name)) {
          problem('lowercase-hyphenated', 'use a lowercase hyphenated name without spaces or underscores');
        }
        const banned = tokensOf(name).filter((t) => isBanned(t, conv.bannedTokens));
        if (banned.length) problem('banned-token', `drop ${banned.map((t) => `"${t}"`).join(', ')} from the name`);
        if (type === 'root' && stem(name).toLowerCase() === 'notes') {
          problem('root-notes', 'a notes file at the root; put the content in the doc it belongs to');
        }
        if (DATE_TOKEN.test(stem(name))) {
          result.warnings.push({ rule: 'date-in-name', message: 'date in a non-dated doc' });
        }
      }
    }
    if (type === null || (type === 'root' && !rootAllowed)) {
      problem('unplaced', 'outside the docs folder tree; place it under a folder from the convention');
    }
  }

  result.ok = result.problems.length === 0;
  if (!result.ok) {
    if (result.problems.some((p) => p.rule === 'root-only')) {
      // Moving a nested CHANGELOG.md onto the root one would overwrite it.
      result.suggestion = existsSync(join(root, name)) ? null : name;
    } else {
      const placed = type !== null && type !== 'root';
      const needsMove = result.problems.some((p) => p.rule === 'unplaced' || p.rule === 'root-notes');
      result.suggestion = suggest(rel, dir, type, placed && !needsMove, conv, { root, today, assigned: opts.assigned });
    }
  }
  return result;
}

/**
 * Whether a repo-relative path stays inside the repo once symlinks are resolved: the path
 * itself is not a symlink and its nearest existing folder resolves under the real root.
 * @param {string} root repo root
 * @param {string} rel repo-relative path, existing or not
 * @returns {string|null} null when inside, else the reason
 */
export function outsideReason(root, rel) {
  const rootReal = realpathSync(root);
  const abs = join(root, rel);
  let stat = null;
  try {
    stat = lstatSync(abs);
  } catch {
    // does not exist yet
  }
  if (stat?.isSymbolicLink()) return `${rel} is a symlink`;
  let dir = dirname(abs);
  while (!existsSync(dir)) dir = dirname(dir);
  const real = realpathSync(dir);
  if (real !== rootReal && !real.startsWith(`${rootReal}${sep}`)) return `${rel} resolves outside the repo`;
  return null;
}

// ---- init ----------------------------------------------------------------

/**
 * Writes docs/conventions.md with the full default block.
 * @throws {ConventionError} when the file already exists
 */
export function initConvention(root) {
  const target = join(root, 'docs', 'conventions.md');
  if (existsSync(target)) {
    throw new ConventionError('docs/conventions.md already exists. Fix: edit it, or delete it and re-run --init.');
  }
  const md = readFileSync(DEFAULT_FILE, 'utf8');
  const block = YAML_BLOCK.exec(md)[0];
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(
    target,
    `# Docs conventions\n\nOverrides the kit default for this repo. Set only the keys you change: \`folders\` and \`ordered\` merge per type (\`~\` removes a type), lists replace the default list. Checked by \`/doc-hygiene\`.\n\n${block}\n`,
  );
  return 'docs/conventions.md';
}

// ---- cli -----------------------------------------------------------------

function format(result, source) {
  if (result.skipped) return `ok (ignored by the convention) [source: ${source}]`;
  const lines = [];
  for (const p of result.problems) lines.push(`${result.path}: ${p.message} [${p.rule}]`);
  for (const w of result.warnings) lines.push(`${result.path}: warning: ${w.message} [${w.rule}]`);
  if (result.suggestion) lines.push(`suggested: ${result.suggestion}`);
  if (result.ok && !result.warnings.length) lines.push('ok');
  lines.push(`source: ${source}`);
  return lines.join('\n');
}

function main(argv) {
  const flags = argv.filter((a) => a.startsWith('--'));
  const args = argv.filter((a) => !a.startsWith('--'));
  const rootFlag = flags.find((f) => f.startsWith('--root='));
  const root = resolve(rootFlag ? rootFlag.slice(7) : process.cwd());
  try {
    if (flags.includes('--init')) {
      console.log(`Wrote ${initConvention(root)} with the default convention. Edit it to match this repo.`);
      return 0;
    }
    if (args[0] === 'check' && args[1]) {
      const abs = resolve(root, args[1]);
      const rel = posix(relative(root, abs));
      const { convention, source } = resolveConvention(root);
      const result = checkPath(rel, convention, { root });
      if (flags.includes('--json')) console.log(JSON.stringify({ ...result, source }, null, 2));
      else console.log(format(result, source));
      return result.ok ? 0 : 1;
    }
    console.error('Usage: convention.mjs check <path> [--json] [--root=<dir>] | --init [--root=<dir>]');
    return 2;
  } catch (e) {
    if (e instanceof ConventionError) {
      console.error(e.message);
      return 2;
    }
    throw e;
  }
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  process.exitCode = main(process.argv.slice(2));
}
