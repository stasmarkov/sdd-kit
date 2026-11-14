#!/usr/bin/env node
// Docs audit: scans the Markdown docs of a repo, collects evidence per file
// (inbound links, last commit, dead path citations, unknown commands,
// duplicate titles, placeholder content, link problems) and proposes one
// verdict each. Prints compact JSON with the rows that need attention (--all
// adds the keep rows). It changes no file except its report, and only with
// --write-report.
//
//   node audit.mjs [--path=<dir>] [--root=<dir>] [--today=YYYY-MM-DD] [--write-report] [--all]
//   node audit.mjs changed [--root=<dir>]       names and links of the changed .md files (bare /doc-hygiene)
//   node audit.mjs find "<topic>" [--root=<dir>]
//
// No dependencies.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, relative, posix as pp } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  checkPath,
  cleanName,
  isBanned,
  lastSegment,
  matchesAny,
  outsideReason,
  posix,
  resolveConvention,
  stem,
} from './convention.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const STALE_DAYS = 180;
const LINK_FILES = ['CLAUDE.md', 'AGENTS.md', 'README.md'];
const HARD_IGNORED = /(^|\/)(node_modules|vendor|\.git)\//;
const STOP_WORDS = new Set('a an and are as at be by for from how in is it of on or the to what when where which with'.split(' '));
const KNOWN_EXT = /\.(md|mdx|js|mjs|cjs|ts|tsx|jsx|json|ya?ml|toml|sh|css|scss|html|sql|env|lock|txt|xml)$/i;

// ---- git -----------------------------------------------------------------

function git(root, args) {
  try {
    return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return null;
  }
}

/** True when `root` is inside a git work tree. */
export const isGitRepo = (root) => git(root, ['rev-parse', '--is-inside-work-tree'])?.trim() === 'true';

/** Every tracked path below `root`, repo-relative to `root`, from one `git ls-files`. */
export function trackedSet(root) {
  return new Set((git(root, ['ls-files', '-z']) ?? '').split('\0').filter(Boolean).map(posix));
}

/**
 * Last commit date (YYYY-MM-DD) of every Markdown path below `root`, from one `git log`
 * pass, newest first, so the first date seen for a path is its last commit.
 */
function lastCommitDates(root) {
  const out = git(root, ['-c', 'core.quotePath=false', 'log', '--relative', '--no-renames', '--format=%x01%cs', '--name-only', '--', '*.md', '*.MD']) ?? '';
  const dates = new Map();
  let date = null;
  for (const line of out.split('\n')) {
    if (line.startsWith('\x01')) date = line.slice(1);
    else if (line && date && !dates.has(line)) dates.set(posix(line), date);
  }
  return dates;
}

/** Repo web base ("host/owner/repo") from the origin remote, or null. */
function repoBase(root) {
  const url = git(root, ['remote', 'get-url', 'origin'])?.trim();
  if (!url) return null;
  const m = /^(?:[a-z+]+:\/\/(?:[^@/]+@)?|[^@/]+@)([^/:]+)[/:](.+?)(?:\.git)?\/?$/i.exec(url);
  return m ? `${m[1]}/${m[2]}` : null;
}

// ---- files ---------------------------------------------------------------

/** Folder-level globs (`x/**`) of a convention, so a walk can skip whole trees. */
const folderGlobs = (conv) => [...(conv?.ignore ?? []), ...(conv?.generated ?? [])].filter((g) => g.endsWith('/**'));

function walk(root, dir, out, prune) {
  for (const e of readdirSync(join(root, dir), { withFileTypes: true })) {
    const rel = dir ? `${dir}/${e.name}` : e.name;
    if (e.isDirectory()) {
      if (!HARD_IGNORED.test(`${rel}/`) && !matchesAny(`${rel}/`, prune)) walk(root, rel, out, prune);
    } else if (e.name.toLowerCase().endsWith('.md')) {
      out.push(rel);
    }
  }
}

/**
 * Every Markdown file of the repo (tracked and untracked, minus git-ignored), repo-relative, sorted.
 * Outside git the walk skips vendored folders and the convention's folder-level ignore globs.
 * @param {string} root repo root
 * @param {object} [conv] resolved convention, used to prune the walk outside git
 * @param {boolean} [inGit] whether `root` is in a git work tree (computed when omitted)
 */
export function listMarkdown(root, conv = null, inGit = isGitRepo(root)) {
  let files;
  if (inGit) {
    const out = git(root, ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', '*.md', '*.MD']) ?? '';
    files = out.split('\0').filter(Boolean).filter((f) => existsSync(join(root, f)));
  } else {
    files = [];
    walk(root, '', files, folderGlobs(conv));
  }
  return [...new Set(files.map(posix))].sort();
}

// ---- markdown scanning ---------------------------------------------------

const FENCE = /^\s{0,3}(`{3,}|~{3,})/;
// `<...>` destinations may hold spaces; footnote definitions (`[^1]: text`) are not links.
const INLINE_LINK = /(!?)\[(?:[^\]\\]|\\.)*\]\((?:<([^<>\n]*)>|([^)\s<>]*))(?:\s+(?:"[^"]*"|'[^']*'))?\)/dg;
const REF_LINK = /^\s{0,3}\[(?!\^)[^\]]+\]:\s*(?:<([^<>\n]*)>|(\S+))(?:\s.*)?$/d;
const CODE_SPAN = /(`+)(.+?)\1/g;

/** Visits each line outside fenced code blocks: cb(line, lineNo, lineStartOffset). */
function eachProseLine(text, cb) {
  let offset = 0;
  let fence = null;
  text.split('\n').forEach((line, i) => {
    const start = offset;
    offset += line.length + 1;
    const f = FENCE.exec(line);
    if (fence) {
      if (f && f[1][0] === fence[0] && f[1].length >= fence.length) fence = null;
      return;
    }
    if (f) {
      fence = f[1];
      return;
    }
    cb(line, i + 1, start);
  });
}

const spanRanges = (line) => [...line.matchAll(CODE_SPAN)].map((m) => [m.index, m.index + m[0].length]);
const inside = (ranges, pos) => ranges.some(([a, b]) => pos >= a && pos < b);

/**
 * Finds inline and reference-style link targets outside fenced code and code spans.
 * @param {string} text Markdown source
 * @returns {{line: number, start: number, end: number, target: string, image: boolean, angle: boolean}[]}
 *   offsets index `text`; angle: the destination was written as `<...>`
 */
export function scanLinks(text) {
  const out = [];
  eachProseLine(text, (line, lineNo, base) => {
    const spans = spanRanges(line);
    for (const m of line.matchAll(INLINE_LINK)) {
      if (inside(spans, m.index)) continue;
      const g = m[2] !== undefined ? 2 : 3;
      const [s, e] = m.indices[g];
      out.push({ line: lineNo, start: base + s, end: base + e, target: m[g], image: m[1] === '!', angle: g === 2 });
    }
    const r = REF_LINK.exec(line);
    if (r) {
      const g = r[1] !== undefined ? 1 : 2;
      const [s, e] = r.indices[g];
      out.push({ line: lineNo, start: base + s, end: base + e, target: r[g], image: false, angle: g === 1 });
    }
  });
  return out;
}

/** Inline code span contents outside fenced code blocks. */
export function codeSpans(text) {
  const out = [];
  eachProseLine(text, (line) => {
    for (const m of line.matchAll(CODE_SPAN)) out.push(m[2].trim());
  });
  return out;
}

function splitFrontMatter(text) {
  const m = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/.exec(text);
  return m ? { front: m[0], body: text.slice(m[0].length) } : { front: '', body: text };
}

function titleOf(text) {
  const { front, body } = splitFrontMatter(text);
  const t = /^title:\s*["']?(.+?)["']?\s*$/m.exec(front);
  if (t) return t[1];
  let title = null;
  eachProseLine(body, (line) => {
    if (title === null) {
      const h = /^#\s+(.+?)\s*#*\s*$/.exec(line);
      if (h) title = h[1];
    }
  });
  return title;
}

function headingsOf(text) {
  const out = [];
  eachProseLine(splitFrontMatter(text).body, (line) => {
    const h = /^#{1,2}\s+(.+?)\s*#*\s*$/.exec(line);
    if (h) out.push(h[1]);
  });
  return out;
}

const normTokens = (s, conv) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((t) => t && !isBanned(t, conv.bannedTokens));

/** True when a prose line holds an unfilled template token: `{{x}}` or `<two words>` outside code spans. */
function hasTemplateToken(line) {
  const prose = line.replace(CODE_SPAN, ' ');
  if (/\{\{[^{}\n]*\}\}/.test(prose)) return true;
  for (const m of prose.matchAll(/<([A-Za-z][^<>\n]*)>/g)) if (/[ _-]/.test(m[1])) return true;
  return false;
}

/**
 * D-24: fewer than 3 content lines once front matter, headings, comments, TODO/TBD and
 * template lines are removed. Lines inside fenced code are content.
 */
function isPlaceholder(text) {
  const body = splitFrontMatter(text).body.replace(/<!--[\s\S]*?-->/g, '');
  let n = 0;
  let fence = null;
  for (const line of body.split('\n')) {
    const f = FENCE.exec(line);
    const t = line.trim();
    if (fence) {
      if (f && f[1][0] === fence[0] && f[1].length >= fence.length) fence = null;
      else if (t) n += 1;
      continue;
    }
    if (f) {
      fence = f[1];
      continue;
    }
    if (!t || /^#{1,6}(\s|$)/.test(t) || /^\W*(TODO|TBD)\b/i.test(t) || hasTemplateToken(t)) continue;
    n += 1;
  }
  return n < 3;
}

// ---- link resolution -----------------------------------------------------

function safeDecode(s) {
  try {
    return decodeURI(s);
  } catch {
    return s;
  }
}

/**
 * Resolves a link target to a repo-relative path.
 * @returns {{path: string, absoluteUrl: boolean} | null} null for anchors, external URLs, other schemes
 */
function resolveTarget(target, fromRel, base) {
  if (!target || target.startsWith('#')) return null;
  if (/^https?:\/\//i.test(target)) {
    if (!base) return null;
    const esc = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const m = new RegExp(`^https?://(?:www\\.)?${esc}/(?:-/)?(?:blob|tree|raw)/[^/]+/(.+?)(?:[#?].*)?$`, 'i').exec(target);
    return m ? { path: safeDecode(m[1]), absoluteUrl: true } : null;
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(target)) return null;
  const clean = safeDecode(target.replace(/[#?].*$/, ''));
  if (!clean) return null;
  const path = clean.startsWith('/') ? pp.normalize(clean.slice(1)) : pp.normalize(pp.join(pp.dirname(fromRel), clean));
  return { path: path.replace(/\/$/, ''), absoluteUrl: false };
}

// ---- citations and commands ----------------------------------------------

function looksLikePath(s) {
  if (/\s|:\/\/|[*<>{}$~@|]/.test(s) || !/^[A-Za-z0-9._/-]+$/.test(s)) return false;
  if (/^\/[a-z][a-z0-9-]*$/i.test(s)) return false;
  return s.includes('/') || KNOWN_EXT.test(s);
}

/**
 * The kit registry (`stacks.json`) and where it was found. It is looked up from this
 * script's folder upwards: `workflows/lib/stacks.json` (plugin and file-copy layouts) and
 * `sdd-kit/stacks.json` directly or in a dot-folder (the runtime of other hosts).
 * @returns {{registry: object, file: string} | null}
 */
function loadRegistry() {
  let dir = HERE;
  for (let depth = 0; depth < 6; depth++) {
    dir = dirname(dir);
    const candidates = [join(dir, 'workflows', 'lib', 'stacks.json'), join(dir, 'sdd-kit', 'stacks.json')];
    try {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        if (e.isDirectory() && e.name.startsWith('.') && e.name !== '.git') candidates.push(join(dir, e.name, 'sdd-kit', 'stacks.json'));
      }
    } catch {
      // unreadable folder
    }
    for (const file of candidates) {
      try {
        return { registry: JSON.parse(readFileSync(file, 'utf8')), file };
      } catch {
        // try the next location
      }
    }
  }
  return null;
}

// Built-in commands of the supported hosts. A miss only adds evidence, never a verdict,
// so the list errs on the side of inclusion.
const HOST_BUILTINS = new Set(
  'add-dir agents bug clear code-review compact config context cost doctor exit export goal help hooks ide init install-github-app login logout loop mcp memory model name output-style permissions plugin pr-comments privacy-settings release-notes reload-plugins resume review rewind schedule security-review skill-doctor status statusline terminal-setup todos undo upgrade usage vim'.split(' '),
);

const dirNames = (dir, keep = () => true) => {
  try {
    return readdirSync(dir, { withFileTypes: true }).filter(keep).map((e) => e.name);
  } catch {
    return [];
  }
};

/**
 * Names a slash command may resolve to: skills and commands of the project, the user and the
 * installed plugins, the kit's skills and add-on skills, its workflows, and host built-ins.
 */
function commandNames(root, registryFile) {
  const config = process.env.CLAUDE_CONFIG_DIR || join(process.env.HOME ?? '', '.claude');
  const names = new Set(HOST_BUILTINS);
  const isDir = (e) => e.isDirectory() || e.isSymbolicLink();
  const addSkills = (dir) => dirNames(dir, isDir).forEach((n) => names.add(n));
  const addCommands = (dir) => dirNames(dir, (e) => e.name.endsWith('.md')).forEach((n) => names.add(stem(n)));
  for (const base of [join(root, '.claude'), config, join(root, '.agents'), join(root, '.cursor')]) {
    addSkills(join(base, 'skills'));
    addCommands(join(base, 'commands'));
  }
  addSkills(join(HERE, '..', '..'));
  const cache = join(config, 'plugins', 'cache');
  for (const market of dirNames(cache, isDir)) {
    for (const plugin of dirNames(join(cache, market), isDir)) {
      for (const version of dirNames(join(cache, market, plugin), isDir)) {
        addSkills(join(cache, market, plugin, version, 'skills'));
        addCommands(join(cache, market, plugin, version, 'commands'));
      }
    }
  }
  if (registryFile) {
    const nested = registryFile.endsWith(join('workflows', 'lib', 'stacks.json'));
    const workflows = nested ? dirname(dirname(registryFile)) : join(dirname(registryFile), 'workflows');
    const kit = nested ? dirname(workflows) : dirname(registryFile);
    dirNames(workflows, (e) => e.name.endsWith('.js')).forEach((n) => names.add(n.replace(/\.js$/, '')));
    for (const addon of dirNames(join(kit, 'plugins'), isDir)) addSkills(join(kit, 'plugins', addon, 'skills'));
  }
  return names;
}

function runnerScripts(root, registry) {
  const out = {};
  for (const [runner, spec] of Object.entries(registry?.packageFiles ?? {})) {
    try {
      const pkg = JSON.parse(readFileSync(join(root, spec.file), 'utf8'));
      out[runner] = new Set(Object.keys(pkg.scripts ?? {}));
    } catch {
      // no package file: runner commands are not checked
    }
  }
  return out;
}

// ---- audit ---------------------------------------------------------------

const daysBetween = (a, b) => Math.floor((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000);

function pickTarget(candidates, rows) {
  return [...candidates].sort((a, b) => {
    const ra = rows.get(a);
    const rb = rows.get(b);
    return (
      rb.evidence.inbound - ra.evidence.inbound ||
      (rb.evidence.lastCommit === 'unknown' ? '' : rb.evidence.lastCommit).localeCompare(ra.evidence.lastCommit === 'unknown' ? '' : ra.evidence.lastCommit) ||
      a.length - b.length ||
      a.localeCompare(b)
    );
  })[0];
}

/** Next free `<report folder>/doc-hygiene-YYYYMMDD[-n].md` (D-34). */
export function reportPath(root, today, folder = '.ai/reports') {
  const day = today.replaceAll('-', '');
  let n = 1;
  let name = `${folder}/doc-hygiene-${day}.md`;
  while (existsSync(join(root, name))) {
    n += 1;
    name = `${folder}/doc-hygiene-${day}-${n}.md`;
  }
  return name;
}

/**
 * D-21 link problems of one file: broken targets, absolute URLs to in-repo files (unless the
 * file is under an `absoluteLinks` glob and the target outside it, where an absolute URL is the
 * rule) and relative links that leave an `absoluteLinks` glob.
 * @param {string} from repo-relative path of the linking file
 * @param {string} text its content
 * @param {object} conv resolved convention
 * @param {string|null} base repo web base for absolute URLs
 * @param {(p: string) => boolean} exists whether a repo-relative path exists
 * @returns {{problems: {file: string, line: number, kind: string, target: string}[], targets: string[]}}
 *   targets: the existing repo paths the file links to
 */
function linksOf(from, text, conv, base, exists) {
  const own = (conv.absoluteLinks ?? []).filter((g) => matchesAny(from, [g]));
  const problems = [];
  const targets = [];
  for (const l of scanLinks(text)) {
    if (l.image) continue;
    const r = resolveTarget(l.target, from, base);
    if (!r) continue;
    const problem = (kind) => problems.push({ file: from, line: l.line, kind, target: l.target });
    if (!exists(r.path)) {
      problem('broken');
      continue;
    }
    const leaves = own.length > 0 && !matchesAny(r.path, own);
    if (r.absoluteUrl && !leaves) problem('absolute-in-repo');
    else if (!r.absoluteUrl && leaves) problem('scope-leaving');
    targets.push(r.path);
  }
  return { problems, targets };
}

/** True when a repo path's first segment exists at the root, so a dead citation of it is about this repo. */
function citesThisRepo(path, top) {
  const first = path.replace(/^\//, '').split('/')[0];
  return path.includes('/') && top.has(first);
}

/**
 * Audits the Markdown docs of a repo.
 * @param {string} root repo root
 * @param {{path?: string, today?: string}} [opts] path: limit the rows to a folder; today: UTC YYYY-MM-DD
 * @returns {object} { root, source, git, shallow, today, reportPath, notes, files: [{path, role, verdict, ...}], linkProblems }
 * @throws {ConventionError} when the project convention does not parse
 */
export function audit(root, opts = {}) {
  const today = opts.today ?? new Date().toISOString().slice(0, 10);
  const { convention: conv, source } = resolveConvention(root);
  const inGit = isGitRepo(root);
  const shallow = inGit && git(root, ['rev-parse', '--is-shallow-repository'])?.trim() === 'true';
  const base = inGit ? repoBase(root) : null;
  const tracked = inGit ? trackedSet(root) : new Set();
  const dates = inGit && !shallow ? lastCommitDates(root) : new Map();
  const scopeDir = opts.path ? posix(opts.path).replace(/\/$/, '') : '';
  const notes = [];

  const namingGlobs = [conv.folders.spec, conv.folders.report, conv.folders.archive].filter(Boolean).map((f) => `${f}/**`).concat('**/_archive/**');
  const rows = new Map();
  const sources = [];
  for (const p of listMarkdown(root, conv, inGit)) {
    if (HARD_IGNORED.test(p)) continue;
    const name = lastSegment(p);
    const linkFile = LINK_FILES.includes(name);
    const filtered = matchesAny(p, conv.ignore) || matchesAny(p, conv.generated);
    if (filtered && !linkFile) continue;
    sources.push(p);
    const atRoot = !p.includes('/');
    const sourceOnly = !atRoot && (name === 'CLAUDE.md' || name === 'AGENTS.md' || (name === 'README.md' && !p.startsWith('docs/')));
    if (sourceOnly || filtered) continue;
    const role = matchesAny(p, namingGlobs) ? 'naming' : 'full';
    if (scopeDir && p !== scopeDir && !p.startsWith(`${scopeDir}/`)) continue;
    rows.set(p, {
      path: p,
      role,
      // The active convention file is configuration: it is never a delete, merge or archive candidate.
      exempt: name === 'README.md' || (atRoot && conv.rootAllowed.includes(name)) || p === source,
      verdict: 'keep',
      reasons: [],
      evidence: {
        inbound: 0,
        lastCommit: 'unknown',
        deadCitations: [],
        unknownCommands: [],
        duplicateOf: [],
        placeholder: false,
        supersededBy: null,
      },
    });
  }

  const contents = new Map(sources.map((p) => [p, readFileSync(join(root, p), 'utf8')]));
  const exists = (p) => existsSync(join(root, p));

  // Links: inbound counts and link problems (D-21, D-22).
  const linkProblems = [];
  for (const from of sources) {
    const { problems, targets } = linksOf(from, contents.get(from), conv, base, exists);
    linkProblems.push(...problems);
    for (const t of targets) {
      const row = rows.get(t);
      if (row && t !== from) row.evidence.inbound += 1;
    }
  }

  // Evidence per doc.
  const found = loadRegistry();
  if (!found) notes.push('runner check skipped: the kit registry (stacks.json) was not found, so "<runner> run <script>" commands were not checked');
  const commands = commandNames(root, found?.file);
  const runners = runnerScripts(root, found?.registry);
  const top = new Set(dirNames(root));
  const titles = new Map();
  for (const row of rows.values()) {
    const p = row.path;
    const text = contents.get(p);
    const ev = row.evidence;
    if (tracked.has(p)) ev.lastCommit = dates.get(p) ?? 'unknown';
    row.problems = linkProblems.filter((l) => l.file === p);
    if (row.problems.length) row.reasons.push(`${row.problems.length} link problem(s)`);
    if (row.role === 'naming') continue;

    const live = new Set();
    const dead = new Set();
    const unknown = new Set();
    const consider = (s, isLink) => {
      const span = s.trim();
      if (looksLikePath(span)) {
        const c = span.replace(/[#?].*$/, '');
        const fromDoc = pp.normalize(pp.join(pp.dirname(p), c));
        if (exists(c) || exists(fromDoc) || exists(c.replace(/^\//, ''))) live.add(c);
        else if (!matchesAny(c.replace(/^\//, ''), conv.ignore) && ((isLink && /^\.\.?\//.test(c)) || citesThisRepo(c, top))) dead.add(c);
      }
      const cmd = /^\/([a-z][a-z0-9:-]*)(?:\s|$)/.exec(span);
      if (cmd && !commands.has(cmd[1].split(':').pop())) unknown.add(`/${cmd[1]}`);
      const run = /\b([a-z][\w-]*) run (?:-s |--silent )?([\w:.-]+)/.exec(span);
      if (run && runners[run[1]] && !runners[run[1]].has(run[2])) unknown.add(`${run[1]} run ${run[2]}`);
    };
    codeSpans(text).forEach((span) => consider(span, false));
    for (const l of scanLinks(text)) {
      const t = l.target.replace(/[#?].*$/, '');
      if (t && !/^[a-z][a-z0-9+.-]*:/i.test(t) && !t.startsWith('#')) consider(safeDecode(t), true);
    }
    ev.deadCitations = [...dead].sort();
    ev.unknownCommands = [...unknown].sort();
    ev.citations = live.size + dead.size;
    ev.placeholder = !row.exempt && isPlaceholder(text);
    const title = titleOf(text);
    if (title && !row.exempt) {
      const key = normTokens(title, conv).join(' ');
      if (key) titles.set(key, [...(titles.get(key) ?? []), p]);
    }
    if (!ev.inbound && !row.exempt) row.reasons.push('orphan (no inbound links)');
    if (ev.deadCitations.length) row.reasons.push(`${ev.deadCitations.length} dead path citation(s)`);
    if (ev.unknownCommands.length) row.reasons.push(`unknown command(s): ${ev.unknownCommands.join(', ')}`);
    if (ev.placeholder) row.reasons.push('placeholder content');
  }

  // Leftovers and superseded copies (D-24), duplicates (D-26), stale (D-23).
  const deletes = new Set();
  const mergeTo = new Map();
  const stale = new Set();
  for (const row of rows.values()) {
    if (row.role !== 'full' || row.exempt) continue;
    const p = row.path;
    const name = lastSegment(p);
    const dir = p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '';
    const clean = cleanName(name, conv);
    if (!dir && ['notes', 'plan', 'todo'].includes(clean)) {
      row.reasons.push('leftover: scratch file at the repo root');
      deletes.add(p);
    }
    const superseded = tokensBanned(name, conv);
    const siblingPath = dir ? `${dir}/${clean}.md` : `${clean}.md`;
    if (superseded && clean && siblingPath !== p && rows.has(siblingPath)) {
      row.evidence.supersededBy = siblingPath;
      const have = new Set(contents.get(siblingPath).split('\n').map((l) => l.trim()).filter(Boolean));
      const missing = contents.get(p).split('\n').map((l) => l.trim()).filter((l) => l && !have.has(l));
      if (!missing.length) {
        row.reasons.push(`leftover: fully contained in ${siblingPath}`);
        deletes.add(p);
      } else {
        row.reasons.push(`superseded name; ${missing.length} line(s) missing from ${siblingPath}`);
        mergeTo.set(p, siblingPath);
      }
    }
    if (row.evidence.placeholder) deletes.add(p);

    const ev = row.evidence;
    const half = ev.citations > 0 && ev.deadCitations.length * 2 >= ev.citations;
    const age = ev.lastCommit === 'unknown' ? null : daysBetween(today, ev.lastCommit);
    if (half) {
      row.reasons.push('stale: at least half of the path citations are dead');
      stale.add(p);
    } else if (age !== null && age > STALE_DAYS && !ev.inbound) {
      row.reasons.push(`stale: last commit ${ev.lastCommit} (${age} days) and no inbound links`);
      stale.add(p);
    } else if (ev.deadCitations.length) {
      row.reasons.push(`fix ${ev.deadCitations.length} dead citation(s)`);
    }
    if (ev.lastCommit === 'unknown') row.reasons.push(shallow ? 'age unknown (shallow clone)' : 'age unknown');
  }
  for (const group of titles.values()) {
    if (group.length < 2) continue;
    const free = group.filter((p) => !mergeTo.has(p) && !deletes.has(p));
    const target = free.length ? pickTarget(free, rows) : null;
    for (const p of group) {
      rows.get(p).evidence.duplicateOf = group.filter((o) => o !== p);
      rows.get(p).reasons.push(`duplicate title with ${group.filter((o) => o !== p).join(', ')}`);
      if (target && p !== target && !mergeTo.has(p)) mergeTo.set(p, target);
    }
  }

  // One verdict per doc: delete > merge > archive > rename/move > keep (D-27).
  const assigned = new Map();
  for (const row of rows.values()) {
    const p = row.path;
    const check = checkPath(p, conv, { root, today, assigned });
    const naming = !check.skipped && !check.ok;
    for (const w of check.warnings) row.reasons.push(`warning: ${w.message}`);
    if (naming) {
      for (const pr of check.problems) row.reasons.push(`naming: ${pr.message}`);
      row.suggestion = check.suggestion;
      if (check.suggestion && check.suggestion !== p && exists(check.suggestion)) row.reasons.push(`suggested path ${check.suggestion} already exists`);
      if (!check.suggestion) row.reasons.push('no free path to suggest; rename by hand');
    }
    if (row.role === 'full' && !row.exempt && deletes.has(p)) row.verdict = 'delete';
    else if (row.role === 'full' && !row.exempt && mergeTo.has(p)) {
      row.verdict = 'merge';
      row.mergeInto = mergeTo.get(p);
    } else if (row.role === 'full' && !row.exempt && stale.has(p)) row.verdict = 'archive';
    else if (naming && check.suggestion && check.suggestion !== p) row.verdict = 'rename/move';
  }

  return {
    root,
    source,
    git: inGit,
    shallow,
    today,
    reportPath: reportPath(root, today, conv.folders.report),
    notes,
    files: [...rows.values()].sort((a, b) => a.path.localeCompare(b.path)).map(({ exempt, problems, ...row }) => row),
    linkProblems: scopeDir ? linkProblems.filter((l) => rows.has(l.file)) : linkProblems,
  };
}

/**
 * Bare /doc-hygiene (D-11): name and link checks of the Markdown files in `git status`
 * (added, modified, renamed, untracked, including files in new folders).
 * @param {string} root repo root
 * @returns {{git: boolean, source?: string, message?: string, files: object[]}}
 *   files: [{path, status, ok, problems, warnings, suggestion, links}] for in-scope changed docs
 */
export function changed(root) {
  if (!isGitRepo(root)) {
    return { git: false, files: [], message: 'Not a git repository, so there are no changed docs to check. Fix: run /doc-hygiene --audit to check every doc.' };
  }
  const { convention: conv, source } = resolveConvention(root);
  const base = repoBase(root);
  const prefix = (git(root, ['rev-parse', '--show-prefix']) ?? '').trim();
  const fields = (git(root, ['status', '--porcelain', '-z', '--untracked-files=all']) ?? '').split('\0');
  const entries = [];
  for (let i = 0; i < fields.length; i++) {
    const f = fields[i];
    if (f.length < 4) continue;
    const status = f.slice(0, 2);
    entries.push({ status: status.trim(), path: f.slice(3) });
    if (status[0] === 'R' || status[0] === 'C') i += 1;
  }
  const exists = (p) => existsSync(join(root, p));
  const files = [];
  for (const { status, path: top } of entries) {
    if (prefix && !top.startsWith(prefix)) continue;
    const p = posix(top.slice(prefix.length));
    if (!p.toLowerCase().endsWith('.md') || HARD_IGNORED.test(p) || !exists(p)) continue;
    const check = checkPath(p, conv, { root });
    if (check.skipped) continue;
    const { problems: links } = linksOf(p, readFileSync(join(root, p), 'utf8'), conv, base, exists);
    files.push({ path: p, status, ok: check.ok && !links.length, problems: check.problems, warnings: check.warnings, suggestion: check.suggestion, links });
  }
  return { git: true, source, files: files.sort((a, b) => a.path.localeCompare(b.path)) };
}

/** Rows worth the agent's attention: any verdict but keep, or a keep with link, citation, command or duplicate evidence. */
const actionable = (f) =>
  f.verdict !== 'keep' || f.reasons.some((r) => !/^(age unknown|orphan)/.test(r));

/** The printed form: every row with --all, else the actionable rows plus per-verdict counts. */
export function summarize(result, all = false) {
  const counts = {};
  for (const f of result.files) counts[f.verdict] = (counts[f.verdict] ?? 0) + 1;
  return { ...result, counts, files: all ? result.files : result.files.filter(actionable) };
}

function tokensBanned(name, conv) {
  return stem(name)
    .split(/[-_.\s]+/)
    .some((t) => t && isBanned(t, conv.bannedTokens));
}

/** Markdown table of an audit result, the starting point of the saved report. */
export function renderReport(result) {
  const cell = (s) => String(s).replace(/\|/g, '\\|');
  const lines = [
    `# Docs audit ${result.today}`,
    '',
    `Convention source: ${result.source}. Git: ${result.git ? (result.shallow ? 'shallow clone, ages unknown' : 'yes') : 'no, ages unknown'}.`,
    ...(result.notes ?? []).map((n) => `Note: ${n}.`),
    '',
    '| Doc | Verdict | Reasons | Evidence |',
    '|-----|---------|---------|----------|',
  ];
  for (const f of result.files) {
    const verdict = f.verdict === 'rename/move' ? `rename/move to ${f.suggestion}` : f.verdict === 'merge' ? `merge into ${f.mergeInto}` : f.verdict;
    const ev = `inbound ${f.evidence.inbound}, last commit ${f.evidence.lastCommit}`;
    lines.push(`| ${cell(f.path)} | ${cell(verdict)} | ${cell(f.reasons.join('; ') || '-')} | ${cell(ev)} |`);
  }
  if (result.linkProblems.length) {
    lines.push('', '## Link problems', '');
    for (const l of result.linkProblems) lines.push(`- ${l.file}:${l.line} ${l.kind}: ${l.target}`);
  }
  return `${lines.join('\n')}\n`;
}

// ---- find ----------------------------------------------------------------

/**
 * Ranks in-scope docs by token overlap of title and H1/H2 headings with a topic (D-19).
 * @returns {{path: string, title: string, score: number, headings: string[]}[]} top 5
 */
export function find(root, topic) {
  const { convention: conv } = resolveConvention(root);
  const want = new Set(normTokens(topic, conv).filter((t) => !STOP_WORDS.has(t)));
  const scored = [];
  for (const p of listMarkdown(root)) {
    if (HARD_IGNORED.test(p) || matchesAny(p, conv.ignore) || matchesAny(p, conv.generated)) continue;
    const text = readFileSync(join(root, p), 'utf8');
    const title = titleOf(text) ?? stem(lastSegment(p));
    const overlap = (s) => normTokens(s, conv).filter((t) => want.has(t));
    const headings = headingsOf(text).filter((h) => overlap(h).length);
    const score = new Set([...overlap(title), ...overlap(stem(lastSegment(p)))]).size * 2 + headings.reduce((n, h) => n + overlap(h).length, 0);
    if (score) scored.push({ path: p, title, score, headings });
  }
  return scored.sort((a, b) => b.score - a.score || a.path.length - b.path.length || a.path.localeCompare(b.path)).slice(0, 5);
}

// ---- cli -----------------------------------------------------------------

function main(argv) {
  const flags = argv.filter((a) => a.startsWith('--'));
  const args = argv.filter((a) => !a.startsWith('--'));
  const flag = (k) => flags.find((f) => f.startsWith(`--${k}=`))?.slice(k.length + 3);
  const root = resolve(flag('root') ?? process.cwd());
  try {
    if (args[0] === 'find') {
      if (!args[1]) throw new Error('Usage: audit.mjs find "<topic>" [--root=<dir>]');
      console.log(JSON.stringify({ topic: args[1], matches: find(root, args.slice(1).join(' ')) }));
      return 0;
    }
    if (args[0] === 'changed') {
      const result = changed(root);
      console.log(JSON.stringify(result));
      return result.files.every((f) => f.ok) ? 0 : 1;
    }
    const result = audit(root, { path: flag('path') ? posix(relative(root, resolve(root, flag('path')))) : '', today: flag('today') });
    if (flags.includes('--write-report')) {
      const why = outsideReason(root, result.reportPath);
      if (why) throw new Error(`Cannot write the report: ${why}. Fix: make ${dirname(result.reportPath)} a real folder inside the repo.`);
      mkdirSync(dirname(join(root, result.reportPath)), { recursive: true });
      writeFileSync(join(root, result.reportPath), renderReport(result));
      result.reportWritten = true;
    }
    console.log(JSON.stringify(summarize(result, flags.includes('--all'))));
    return 0;
  } catch (e) {
    console.error(e.message);
    return 2;
  }
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  process.exitCode = main(process.argv.slice(2));
}
