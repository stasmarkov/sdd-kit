#!/usr/bin/env node
/**
 * Deterministic spec lint.
 *
 * Reads a spec folder (spec-lite.md, tasks.md, optionally manual-test.md) and reports
 * structural problems. It uses only node: built-ins and makes no network or model call.
 *
 * Usage: node spec-lint.mjs [--warn] [--verified] [--root <dir>] <spec-dir> [<spec-dir> ...]
 *        node spec-lint.mjs --gates <spec-dir> [<spec-dir> ...]
 *
 * Output, one line per finding: `<file>:<line> <error|warning> <problem>. Fix: <fix>`.
 * With no findings for a folder: `spec-lint: <dir> OK`.
 * Exit codes: 1 when a blocker is found, 0 otherwise (always 0 with --warn), 2 on a usage error,
 * 3 from --gates when tasks.md has an unchecked gate task.
 *
 * --verified  also checks every Traceability "Verified by" item against the repo root.
 * --warn      reports every finding as a warning and exits 0.
 * --root      repo root for --verified (default: nearest ancestor holding .git, else cwd).
 * --gates     gate check instead of lint. A gate is a task whose title text after `N. ` starts
 *             with `Gate:` (case-sensitive); only the owner checks it, and the first unchecked gate
 *             blocks every task after it. Prints `build: <id>. <title>` for each unchecked non-gate
 *             task before that gate (every unchecked task when there is none), then
 *             `awaiting owner: <title>` for the gate and exits 3; with no unchecked gate it ends
 *             with `gates: clear` and exits 0. An unchecked gate is also a lint warning.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/** Closed list of terms an acceptance criterion may not use outside backticks or double quotes. */
export const VAGUE_TERMS = [
  'fast', 'quick', 'quickly', 'robust', 'scalable', 'user-friendly', 'intuitive',
  'appropriate', 'appropriately', 'as needed', 'as appropriate', 'reasonable', 'reasonably',
  'properly', 'efficient', 'efficiently', 'seamless', 'seamlessly', 'easy', 'easily',
  'simple', 'simply', 'flexible', 'adequate', 'sufficient', 'optimal', 'graceful', 'gracefully',
];

const NAMED_CHECKS = ['gen-indexes --check', 'gen-stacks --check', 'gen-guide-example --check', 'gen-retired-hashes --check'];
const ID_BULLET = /^\s*[-*]\s+\*\*(AC|MNC|NFR)-(\d+)\*\*/;
const TERM_RE = new RegExp(
  `(?<![\\w-])(${VAGUE_TERMS.map((t) => t.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&').replace(/ /g, '\\s+')).join('|')})(?![\\w-])`,
  'gi',
);

/** Replaces backtick spans and double-quoted spans with spaces, keeping offsets. */
function maskQuoted(line) {
  return line
    .replace(/`[^`]*`/g, (m) => ' '.repeat(m.length))
    .replace(/"[^"]*"/g, (m) => ' '.repeat(m.length));
}

/** Blanks HTML comments while keeping line numbers. */
function stripComments(text) {
  return text.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ' '));
}

function parseFrontmatter(lines) {
  const fm = {};
  if (lines[0] !== '---') return { fm, end: 0 };
  let i = 1;
  let key = null;
  for (; i < lines.length && lines[i] !== '---'; i++) {
    const m = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(lines[i]);
    if (m) {
      key = m[1];
      fm[key] = m[2].trim();
    } else if (key && /^\s+-\s+\S/.test(lines[i])) {
      fm[key] = `${fm[key]} ${lines[i].trim()}`.trim();
    }
  }
  return { fm, end: i };
}

function isEmptyValue(v) {
  if (v === undefined) return true;
  return /^(\[\s*(["']{2})?\s*\]|["']{2}|~|null)?$/.test(v.trim());
}

/** Returns sections as {title, level, start, end} where start/end are 0-based line indexes of the body. */
function findSections(lines, from) {
  const heads = [];
  let fence = false;
  for (let i = from; i < lines.length; i++) {
    if (/^\s*```/.test(lines[i])) fence = !fence;
    if (fence) continue;
    const m = /^(#{1,6})\s+(.*?)\s*$/.exec(lines[i]);
    if (m) heads.push({ title: m[2], level: m[1].length, line: i });
  }
  return heads.map((h, idx) => {
    let end = lines.length;
    for (let j = idx + 1; j < heads.length; j++) {
      if (heads[j].level <= h.level) { end = heads[j].line; break; }
    }
    return { ...h, start: h.line + 1, end };
  });
}

function findSection(sections, re) {
  return sections.find((s) => re.test(s.title));
}

function bodyIsEmpty(lines, sec) {
  for (let i = sec.start; i < sec.end; i++) {
    if (lines[i].trim() !== '') return false;
  }
  return true;
}

/** Definitions of AC, MNC and NFR ids: {id, kind, line, body: [{line, text}]} (line is 1-based). */
function collectDefinitions(lines, from) {
  const defs = [];
  let cur = null;
  let fence = false;
  for (let i = from; i < lines.length; i++) {
    if (/^\s*```/.test(lines[i])) fence = !fence;
    const m = fence ? null : ID_BULLET.exec(lines[i]);
    if (m) {
      cur = { id: `${m[1]}-${m[2]}`, kind: m[1], line: i + 1, body: [] };
      defs.push(cur);
    } else if (/^#{1,6}\s/.test(lines[i]) || /^[-*]\s/.test(lines[i])) {
      cur = null;
    }
    if (cur) cur.body.push({ line: i + 1, text: lines[i] });
  }
  return defs;
}

/** Classifies one Verified by item: 'named', 'manual', 'path', 'title' or null when it matches no form. */
export function classifyItem(item) {
  const t = item.trim();
  if (t === '') return null;
  if (t.startsWith('verify ') || NAMED_CHECKS.includes(t)) return { form: 'named' };
  const man = /^manual-test\.md#step-([A-Za-z0-9]+)$/.exec(t);
  if (man) return { form: 'manual', step: man[1] };
  const idx = t.indexOf('::');
  if (idx !== -1) {
    const p = t.slice(0, idx);
    const title = t.slice(idx + 2);
    if (/^\S+$/.test(p) && title.trim() !== '' && !title.includes('::')) return { form: 'title', path: p, title: title.trim() };
    return null;
  }
  if (/^\S+$/.test(t)) return { form: 'path', path: t };
  return null;
}

function splitRow(line) {
  const t = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return t.split('|').map((c) => c.trim());
}

const TASK_LINE = /^- \[([ xX])\]\s+(\d+)\.\s+(.*)$/;

/**
 * Splits the unchecked tasks of a tasks.md at the first unchecked gate task.
 * @param {string} tasksText contents of tasks.md
 * @returns {{build: {line: number, id: number, title: string}[], gate: ({line: number, id: number, title: string}|null)}}
 *   build = unchecked non-gate tasks before the gate, in file order; gate = the first unchecked gate, or null
 * @example gatePlan('- [ ] 1. A\n- [ ] 2. Gate: owner signs off\n- [ ] 3. B') // build [1], gate 2
 */
export function gatePlan(tasksText) {
  const build = [];
  const lines = stripComments(tasksText).split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = TASK_LINE.exec(lines[i].replace(/\r$/, ''));
    if (!m || m[1] !== ' ') continue;
    const task = { line: i + 1, id: Number(m[2]), title: m[3].trim() };
    if (task.title.startsWith('Gate:')) return { build, gate: task };
    build.push(task);
  }
  return { build, gate: null };
}

/** Parses the Traceability table of tasks.md into rows: {line, id, verified}. Returns null when absent. */
function parseTraceability(lines) {
  const sections = findSections(lines, 0);
  const sec = findSection(sections, /traceability/i);
  if (!sec) return null;
  const rows = [];
  let verifiedCol = -1;
  let idCol = 0;
  let seenHeader = false;
  for (let i = sec.start; i < sec.end; i++) {
    const l = lines[i];
    if (!/^\s*\|/.test(l)) continue;
    const cells = splitRow(l);
    if (cells.every((c) => /^:?-{2,}:?$/.test(c))) continue;
    if (!seenHeader) {
      seenHeader = true;
      verifiedCol = cells.findIndex((c) => /verified\s*by/i.test(c));
      const id = cells.findIndex((c) => /^id$/i.test(c));
      if (id !== -1) idCol = id;
      continue;
    }
    rows.push({ line: i + 1, id: cells[idCol] || '', verified: verifiedCol === -1 ? '' : cells[verifiedCol] || '' });
  }
  return seenHeader ? rows : null;
}

function findRepoRoot(start) {
  let dir = path.resolve(start);
  for (;;) {
    if (fs.existsSync(path.join(dir, '.git'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return process.cwd();
    dir = parent;
  }
}

/**
 * Lints one spec folder.
 * @param {string} dir spec folder
 * @param {{verified?: boolean, root?: string}} [opts]
 * @returns {{file: string, line: number, severity: 'error'|'warning', problem: string, fix: string}[]}
 */
export function lintSpec(dir, opts = {}) {
  const findings = [];
  const specFile = path.join(dir, 'spec-lite.md');
  const tasksFile = path.join(dir, 'tasks.md');
  const add = (file, line, severity, problem, fix) => findings.push({ file, line, severity, problem, fix });

  if (!fs.existsSync(specFile)) {
    add(specFile, 1, 'error', 'spec-lite.md not found', 'create spec-lite.md in the spec folder (see the spec format)');
    return findings;
  }
  const lines = stripComments(fs.readFileSync(specFile, 'utf8')).split('\n');
  const { fm, end } = parseFrontmatter(lines);
  const sections = findSections(lines, end + 1);

  // Owner
  if (isEmptyValue(fm.stakeholders) && isEmptyValue(fm.approved_by)) {
    add(specFile, 1, 'error', 'stakeholders and approved_by are both empty',
      'add the owner to stakeholders in the frontmatter');
  }

  // Acceptance criteria
  const ac = findSection(sections, /^acceptance criteria$/i);
  if (!ac || bodyIsEmpty(lines, ac)) {
    add(specFile, ac ? ac.line + 1 : 1, 'error', 'Acceptance criteria section is missing or empty',
      'add a "## Acceptance criteria" section with AC-n items written as WHEN ... THE SYSTEM SHALL ...');
  }
  const defs = collectDefinitions(lines, end + 1);
  if (ac) {
    for (const d of defs.filter((x) => x.kind === 'AC' && x.line > ac.start && x.line <= ac.end)) {
      const text = d.body.map((b) => maskQuoted(b.text)).join('\n');
      if (!/\bSHALL\b/.test(text) && !/\bTHEN\b/.test(text)) {
        add(specFile, d.line, 'error', `${d.id} has no observable outcome (no SHALL and no THEN)`,
          'state the outcome as "THE SYSTEM SHALL ..." or "THEN ..."');
      }
      for (const b of d.body) {
        const masked = maskQuoted(b.text);
        TERM_RE.lastIndex = 0;
        let m;
        while ((m = TERM_RE.exec(masked)) !== null) {
          add(specFile, b.line, 'error', `${d.id} uses the vague term "${m[1].toLowerCase().replace(/\s+/g, ' ')}"`,
            'replace it with a measurable value or an observable outcome');
        }
      }
    }
  }

  // Must NOT change
  if (['bug', 'improvement', 'refactor'].includes((fm.type || '').replace(/["']/g, ''))) {
    const mnc = findSection(sections, /^must not change$/i);
    if (!mnc || bodyIsEmpty(lines, mnc)) {
      add(specFile, mnc ? mnc.line + 1 : 1, 'error', `Must NOT change section is missing or empty for type ${fm.type}`,
        'add a "## Must NOT change" section with MNC-n items');
    }
  }

  // Out of scope
  const oos = findSection(sections, /^out of scope$/i);
  if (!oos || bodyIsEmpty(lines, oos)) {
    add(specFile, oos ? oos.line + 1 : 1, 'error', 'Out of scope section is missing or empty',
      'add an "Out of scope" section listing what this spec will not do');
  }

  // Open questions on an approved spec
  if ((fm.status || '').replace(/["']/g, '') === 'approved') {
    const oq = findSection(sections, /^open questions$/i);
    if (oq) {
      for (let i = oq.start; i < oq.end; i++) {
        if (/^\s*[-*]\s+\[ \]/.test(lines[i])) {
          add(specFile, i + 1, 'error', 'unchecked open question on an approved spec',
            'answer it and check the box, or accept it as an assumption');
        }
      }
    }
  }

  // Traceability coverage
  const tasksText = fs.existsSync(tasksFile) ? stripComments(fs.readFileSync(tasksFile, 'utf8')) : null;
  const tLines = tasksText === null ? null : tasksText.split('\n');
  const rows = tLines ? parseTraceability(tLines) : null;
  const traced = new Set((rows || []).map((r) => r.id));
  for (const d of defs) {
    if (!traced.has(d.id)) {
      add(specFile, d.line, 'error',
        `${d.id} is not in the tasks.md Traceability table${tLines === null ? ' (tasks.md is missing)' : rows === null ? ' (no Traceability table)' : ''}`,
        'add a row for it to the Traceability table in tasks.md');
    }
  }

  if (tLines) {
    // Tasks without Covers
    const tasks = [];
    tLines.forEach((l, i) => { if (/^- \[[ xX]\]\s+\d+\.\s/.test(l)) tasks.push(i); });
    tasks.forEach((start, k) => {
      const stop = k + 1 < tasks.length ? tasks[k + 1] : tLines.length;
      let has = false;
      for (let i = start + 1; i < stop; i++) {
        if (/^\s+Covers:/.test(tLines[i])) { has = true; break; }
        if (/^#{1,6}\s/.test(tLines[i])) break;
      }
      if (!has) {
        add(tasksFile, start + 1, 'warning', 'task has no Covers: line', 'add "Covers: AC-n, MNC-n" under the task');
      }
    });

    tasks.forEach((start) => {
      const m = TASK_LINE.exec(tLines[start]);
      if (m && m[1] === ' ' && m[3].startsWith('Gate:')) {
        add(tasksFile, start + 1, 'warning', `unchecked gate task "${m[3].trim()}"`,
          'the owner checks a gate task; no task after it runs until then');
      }
    });

    // Verified by grammar
    for (const r of rows || []) {
      const items = r.verified.split(';').map((s) => s.trim()).filter((s) => s !== '');
      if (items.length === 0) {
        add(tasksFile, r.line, 'warning', `${r.id || 'row'} has an empty Verified by cell`,
          'name a test as path::exact test title, a manual-test.md#step-N, or a named check');
        continue;
      }
      for (const it of items) {
        if (classifyItem(it) === null) {
          add(tasksFile, r.line, 'warning', `${r.id || 'row'} Verified by item "${it}" matches no allowed form`,
            'use path, path::exact test title, manual-test.md#step-N, or a named check starting with "verify "');
        }
      }
    }

    // --verified
    if (opts.verified) {
      const root = opts.root ? path.resolve(opts.root) : findRepoRoot(dir);
      const manualFile = path.join(dir, 'manual-test.md');
      const manual = fs.existsSync(manualFile) ? fs.readFileSync(manualFile, 'utf8') : null;
      const cache = new Map();
      for (const r of rows || []) {
        for (const raw of r.verified.split(';')) {
          const c = classifyItem(raw);
          if (!c || c.form === 'named') continue;
          if (c.form === 'manual') {
            const re = new RegExp(`^###\\s+Step\\s+${c.step}:`, 'm');
            if (manual === null || !re.test(manual)) {
              add(tasksFile, r.line, 'error', `${r.id}: manual-test.md has no "### Step ${c.step}:" heading`,
                `add the "### Step ${c.step}:" heading to manual-test.md or correct the reference`);
            }
            continue;
          }
          const abs = path.resolve(root, c.path);
          if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
            add(tasksFile, r.line, 'error', `${r.id}: ${c.path} does not exist`,
              'create the file or correct the path (relative to the repo root)');
            continue;
          }
          if (c.form === 'title') {
            if (!cache.has(abs)) cache.set(abs, fs.readFileSync(abs, 'utf8'));
            if (!cache.get(abs).includes(c.title)) {
              add(tasksFile, r.line, 'error', `${r.id}: title "${c.title}" not found in ${c.path}`,
                'use the exact test title from the file');
            }
          }
        }
      }
    }
  }

  return findings;
}

function usage(msg) {
  process.stderr.write(`${msg ? `${msg}\n` : ''}Usage: spec-lint [--warn] [--verified] [--gates] [--root <dir>] <spec-dir> [<spec-dir> ...]\n`);
  return 2;
}

/**
 * CLI entry point.
 * @param {string[]} argv arguments after the script name
 * @returns {number} exit code
 */
export function main(argv) {
  let warn = false;
  let verified = false;
  let gates = false;
  let root;
  const dirs = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--warn') warn = true;
    else if (a === '--verified') verified = true;
    else if (a === '--gates') gates = true;
    else if (a === '--root') {
      root = argv[++i];
      if (!root) return usage('--root needs a directory');
    } else if (a.startsWith('-')) return usage(`unknown option ${a}`);
    else dirs.push(a);
  }
  if (dirs.length === 0) return usage('missing <spec-dir>');
  for (const d of dirs) {
    if (!fs.existsSync(d) || !fs.statSync(d).isDirectory()) return usage(`not a directory: ${d}`);
  }
  if (gates) {
    let blocked = false;
    for (const d of dirs) {
      const tasksFile = path.join(d, 'tasks.md');
      if (!fs.existsSync(tasksFile)) return usage(`no tasks.md in ${d}; pass the spec folder that holds it`);
      const plan = gatePlan(fs.readFileSync(tasksFile, 'utf8'));
      for (const t of plan.build) process.stdout.write(`build: ${t.id}. ${t.title}\n`);
      if (plan.gate) {
        blocked = true;
        process.stdout.write(`awaiting owner: ${plan.gate.title}\n`);
      }
    }
    if (!blocked) process.stdout.write('gates: clear\n');
    return blocked ? 3 : 0;
  }
  let blockers = 0;
  for (const d of dirs) {
    const findings = lintSpec(d, { verified, root });
    for (const f of findings) {
      const sev = warn ? 'warning' : f.severity;
      if (sev === 'error') blockers++;
      process.stdout.write(`${f.file}:${f.line} ${sev} ${f.problem}. Fix: ${f.fix}\n`);
    }
    if (findings.length === 0) process.stdout.write(`spec-lint: ${d} OK\n`);
  }
  return blockers > 0 ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exitCode = main(process.argv.slice(2));
}
