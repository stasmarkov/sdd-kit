#!/usr/bin/env node
// Applies an approved docs-hygiene plan: renames and moves, archives, deletes
// and the link rewriting they need. It executes only what the plan lists;
// merging content stays with the agent.
//
//   node apply.mjs --plan <file.json> [--root=<dir>]
//
// Plan format:
//   {
//     "date": "YYYY-MM-DD",                       optional, UTC date of the archive note
//     "operations": [
//       { "op": "rename", "from": "docs/Setup_Guide.md", "to": "docs/setup-guide.md" },   "move" is the same
//       { "op": "archive", "path": "docs/old-api.md", "reason": "cites only removed paths" },
//       { "op": "delete", "path": "NOTES.md", "redirectTo": "docs/architecture.md" }      redirectTo optional
//     ]
//   }
//
// Refuses outside a git repo. No dependencies.
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, posix as pp } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ConventionError, lastSegment, matchesAny, outsideReason, resolveConvention } from './convention.mjs';
import { isGitRepo, listMarkdown, scanLinks, trackedSet } from './audit.mjs';

export class ApplyError extends Error {}

const NOT_GIT =
  'Not a git repository: changes cannot be reviewed or reverted. Fix: run git init and commit, then re-run /doc-hygiene --audit.';
const LINK_FILES = ['CLAUDE.md', 'AGENTS.md', 'README.md'];
const HARD_IGNORED = /(^|\/)(node_modules|vendor|\.git)\//;

function git(root, args) {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function safeRel(p, what) {
  if (typeof p !== 'string' || !p) throw new ApplyError(`${what}: a repo-relative path is required. Fix: set it in the plan.`);
  const n = pp.normalize(p.replaceAll('\\', '/'));
  if (n.startsWith('..') || n.startsWith('/') || /^[A-Za-z]:/.test(n)) {
    throw new ApplyError(`${what}: ${p} is outside the repo. Fix: use a repo-relative path.`);
  }
  if (!n.toLowerCase().endsWith('.md')) throw new ApplyError(`${what}: ${p} is not a Markdown file.`);
  if (HARD_IGNORED.test(n)) throw new ApplyError(`${what}: ${p} is in a git or vendored folder and is never changed.`);
  return n;
}

const lexists = (abs) => {
  try {
    lstatSync(abs);
    return true;
  } catch {
    return false;
  }
};

function moveFile(root, from, to, tracked) {
  mkdirSync(dirname(join(root, to)), { recursive: true });
  const caseOnly = from !== to && from.toLowerCase() === to.toLowerCase();
  const steps = caseOnly ? [[from, `${to}.case-rename`], [`${to}.case-rename`, to]] : [[from, to]];
  for (const [a, b] of steps) {
    if (tracked) git(root, ['mv', a, b]);
    else renameSync(join(root, a), join(root, b));
  }
}

/** Archive note after the front matter, or at the top when there is none. */
function addArchiveNote(text, date, reason) {
  const note = `> Archived ${date}: ${reason.replace(/\s+/g, ' ').trim()}\n\n`;
  const m = /^---\r?\n[\s\S]*?\r?\n---\r?\n/.exec(text);
  return m ? `${m[0]}\n${note}${text.slice(m[0].length)}` : note + text;
}

const encodeSpaces = (p) => p.replaceAll(' ', '%20');

function safeDecode(s) {
  try {
    return decodeURI(s);
  } catch {
    return s;
  }
}

/**
 * Rewrites the link targets of one file that the plan invalidates: links to a moved,
 * archived or redirected file, and, when the file itself moves, its relative links. Every
 * other link is left byte-identical.
 * @param {string} text file content
 * @param {string} oldPath the file's path before the plan
 * @param {string} newPath the file's path after the plan
 * @param {(p: string) => string} mapPath old repo path -> new repo path
 * @param {(p: string) => boolean} targetExists whether an old repo path exists
 * @returns {{text: string, count: number}}
 */
function rewriteLinks(text, oldPath, newPath, mapPath, targetExists) {
  const edits = [];
  const sourceMoved = oldPath !== newPath;
  for (const l of scanLinks(text)) {
    const raw = l.target;
    if (!raw || raw.startsWith('#') || /^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith('//')) continue;
    const m = /^([^#?]*)([#?].*)?$/.exec(raw);
    const decoded = safeDecode(m[1]);
    if (!decoded) continue;
    const rootRelative = decoded.startsWith('/');
    const oldTarget = (rootRelative ? pp.normalize(decoded.slice(1)) : pp.normalize(pp.join(pp.dirname(oldPath), decoded))).replace(/\/$/, '');
    if (!targetExists(oldTarget)) continue;
    const newTarget = mapPath(oldTarget);
    const targetMoved = newTarget !== oldTarget;
    // A root-relative link survives a move of its own file; a relative one survives only when neither end moves.
    if (!targetMoved && (rootRelative || !sourceMoved)) continue;
    let rel = rootRelative ? `/${newTarget}` : pp.relative(pp.dirname(newPath), newTarget) || '.';
    if (!rootRelative && decoded.startsWith('./') && !rel.startsWith('.')) rel = `./${rel}`;
    if (m[1].endsWith('/') && !rel.endsWith('/')) rel += '/';
    if (!l.angle && (m[1].includes('%20') || rel.includes(' '))) rel = encodeSpaces(rel);
    if (rel !== m[1]) edits.push({ start: l.start, end: l.end, value: rel + (m[2] ?? '') });
  }
  let out = text;
  for (const e of edits.sort((a, b) => b.start - a.start)) out = out.slice(0, e.start) + e.value + out.slice(e.end);
  return { text: out, count: edits.length };
}

/**
 * Executes a plan.
 * @param {string} root repo root
 * @param {{date?: string, operations: object[]}} plan
 * @param {{today?: string}} [opts] today: UTC YYYY-MM-DD for the archive note when the plan has no date
 * @returns {string[]} one summary line per change
 * @throws {ApplyError} on an invalid plan or outside git; nothing is changed in that case
 */
export function applyPlan(root, plan, opts = {}) {
  if (!isGitRepo(root)) throw new ApplyError(NOT_GIT);
  if (!Array.isArray(plan?.operations) || !plan.operations.length) throw new ApplyError('The plan lists no operations. Fix: add "operations": [...].');
  const date = plan.date ?? opts.today ?? new Date().toISOString().slice(0, 10);
  const { convention: conv } = resolveConvention(root);
  const archiveDir = conv.folders.archive ?? 'docs/archive';
  const filtered = (p) => matchesAny(p, conv.ignore) || matchesAny(p, conv.generated);
  const contained = (p, what) => {
    const why = outsideReason(root, p);
    if (why) throw new ApplyError(`${what}: ${why}. Fix: move the real file into the repo by hand, or drop the operation.`);
  };

  // Validate everything before touching a file.
  const moves = new Map(); // old path -> new path
  const archives = new Map(); // new path -> reason
  const deletes = new Map(); // path -> redirect or null
  const taken = new Set();
  const seen = new Set();
  const fresh = (to, what) => {
    if (lexists(join(root, to)) || taken.has(to.toLowerCase())) {
      throw new ApplyError(`${what}: ${to} already exists. Fix: pick another name or remove the operation.`);
    }
    taken.add(to.toLowerCase());
  };
  const destination = (to, what) => {
    if (filtered(to)) throw new ApplyError(`${what}: ${to} is ignored or generated by the convention. Fix: pick a path the convention checks.`);
    contained(to, what);
  };
  plan.operations.forEach((op, i) => {
    const what = `operation ${i + 1} (${op?.op})`;
    const src = safeRel(op?.from ?? op?.path, what);
    if (!lexists(join(root, src))) throw new ApplyError(`${what}: ${src} does not exist. Fix: re-run the audit.`);
    contained(src, what);
    if (seen.has(src)) throw new ApplyError(`${what}: ${src} appears twice in the plan.`);
    seen.add(src);
    if (filtered(src)) throw new ApplyError(`${what}: ${src} is ignored or generated by the convention and is never changed.`);
    if (op.op === 'rename' || op.op === 'move') {
      const to = safeRel(op.to, what);
      if (to !== src) {
        const caseOnly = to.toLowerCase() === src.toLowerCase();
        if (caseOnly) {
          // On a case-sensitive filesystem another file may already have the exact target name.
          if (readdirSync(dirname(join(root, to))).includes(lastSegment(to))) throw new ApplyError(`${what}: ${to} already exists. Fix: pick another name or remove the operation.`);
          taken.add(to.toLowerCase());
        } else {
          fresh(to, what);
        }
        destination(to, what);
        moves.set(src, to);
      }
    } else if (op.op === 'archive') {
      if (src.startsWith(`${archiveDir}/`)) throw new ApplyError(`${what}: ${src} is already archived.`);
      const ext = '.md';
      const name = lastSegment(src);
      let to = `${archiveDir}/${name}`;
      for (let n = 2; lexists(join(root, to)) || taken.has(to.toLowerCase()); n += 1) to = `${archiveDir}/${name.slice(0, -ext.length)}-${n}${ext}`;
      taken.add(to.toLowerCase());
      contained(to, what);
      moves.set(src, to);
      archives.set(to, String(op.reason ?? 'no longer relevant'));
    } else if (op.op === 'delete') {
      const redirect = op.redirectTo ? safeRel(op.redirectTo, what) : null;
      if (redirect && !existsSync(join(root, redirect))) throw new ApplyError(`${what}: redirectTo ${redirect} does not exist.`);
      deletes.set(src, redirect);
    } else {
      throw new ApplyError(`${what}: unknown operation. Fix: use rename, move, archive or delete.`);
    }
  });
  for (const [src, redirect] of deletes) {
    if (redirect && deletes.has(redirect)) {
      throw new ApplyError(`delete ${src}: redirectTo ${redirect} is deleted by the same plan. Fix: redirect to a file that stays.`);
    }
  }

  const changes = [];
  const dirty = git(root, ['status', '--porcelain']).trim();
  if (dirty) changes.push(`note: uncommitted changes before applying:\n${dirty.split('\n').map((l) => `  ${l}`).join('\n')}`);

  // Link sources: every doc the convention does not ignore, plus the link files; never a symlink.
  const tracked = trackedSet(root);
  const linkSources = listMarkdown(root, conv, true).filter((p) => {
    if (HARD_IGNORED.test(p) || outsideReason(root, p)) return false;
    return !filtered(p) || LINK_FILES.includes(lastSegment(p));
  });
  const oldExists = (p) => existsSync(join(root, p)) || moves.has(p);
  // A link to a deleted file follows its redirect, and the redirect target's own move.
  const mapPath = (p) => {
    if (moves.has(p)) return moves.get(p);
    const r = deletes.get(p);
    return r ? (moves.get(r) ?? r) : p;
  };
  const contents = new Map(linkSources.map((p) => [p, readFileSync(join(root, p), 'utf8')]));

  // Rewrite from the old content, then move, so each file is read once at its old path.
  const rewritten = new Map();
  for (const p of linkSources) {
    if (deletes.has(p)) continue;
    const to = moves.get(p) ?? p;
    const r = rewriteLinks(contents.get(p), p, to, mapPath, oldExists);
    if (r.count) rewritten.set(p, r);
  }

  for (const [from, to] of moves) {
    moveFile(root, from, to, tracked.has(from));
    changes.push(`${archives.has(to) ? 'archived' : 'moved'} ${from} -> ${to}`);
  }
  for (const [p, r] of rewritten) {
    const finalPath = moves.get(p) ?? p;
    writeFileSync(join(root, finalPath), r.text);
    changes.push(`rewrote ${r.count} link(s) in ${finalPath}`);
  }
  for (const [to, reason] of archives) {
    const file = join(root, to);
    writeFileSync(file, addArchiveNote(readFileSync(file, 'utf8'), date, reason));
    changes.push(`added the archive note to ${to}`);
  }
  for (const [p] of deletes) {
    if (tracked.has(p)) git(root, ['rm', '-q', '-f', '--', p]);
    else unlinkSync(join(root, p));
    changes.push(`deleted ${p}`);
  }
  const linksTo = (src, text, p) =>
    scanLinks(text).some((l) => {
      if (/^[a-z][a-z0-9+.-]*:/i.test(l.target) || l.target.startsWith('#')) return false;
      const t = safeDecode(l.target.replace(/[#?].*$/, ''));
      return (t.startsWith('/') ? pp.normalize(t.slice(1)) : pp.normalize(pp.join(pp.dirname(src), t))) === p;
    });
  for (const [p, redirect] of deletes) {
    if (redirect) continue;
    for (const [src, text] of contents) {
      if (src !== p && !deletes.has(src) && linksTo(src, text, p)) changes.push(`warning: ${moves.get(src) ?? src} still links to deleted ${p}`);
    }
  }
  return changes;
}

function main(argv) {
  const flag = (k) => argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
  const i = argv.indexOf('--plan');
  const planFile = i >= 0 ? argv[i + 1] : flag('plan');
  const root = resolve(flag('root') ?? process.cwd());
  if (!planFile) {
    console.error('Usage: apply.mjs --plan <file.json> [--root=<dir>]');
    return 2;
  }
  try {
    if (!isGitRepo(root)) throw new ApplyError(NOT_GIT);
    let plan;
    try {
      plan = JSON.parse(readFileSync(resolve(planFile), 'utf8'));
    } catch (e) {
      throw new ApplyError(`Cannot read the plan ${planFile}: ${e.message}. Fix: pass a JSON file with "operations".`);
    }
    const changes = applyPlan(root, plan);
    console.log(`Applied ${plan.operations.length} operation(s):`);
    for (const c of changes) console.log(`- ${c}`);
    return 0;
  } catch (e) {
    if (e instanceof ApplyError || e instanceof ConventionError) {
      console.error(e.message);
      return 1;
    }
    throw e;
  }
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  process.exitCode = main(process.argv.slice(2));
}
