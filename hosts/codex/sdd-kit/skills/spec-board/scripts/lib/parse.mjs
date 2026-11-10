import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const BOARD_VERSION = 1;
export const STATUSES = ['draft', 'approved', 'in-progress', 'done', 'unknown'];

const DEFAULT_MAX_FILE_BYTES = 524288;
const MAX_SPECS_PER_ROOT = 1000;
const MAX_IGNORED = 20;
const MAX_FILES_PER_SPEC = 100;
const MAX_FILES_COLLECTED = 5000;
const MAX_SESSION_FILES = 500;
const MAX_SESSION_BYTES = 262144;
const MAX_SESSION_STRING = 2000;
const MAX_COMPLETED_TASKS = 1000;
const MAX_TITLE = 300;
const MAX_LINE_CHARS = 10000;
const MAX_JOINED_TEXT = 10000;
const DEFAULT_MAX_TOTAL_BYTES = 12 * 1024 * 1024;
const MAX_CACHED_FILES = 5000;
const BINARY_SNIFF_BYTES = 8192;

const MARKDOWN_EXT = new Set(['.md', '.markdown']);
const TEXT_EXT = new Set([
  '.txt', '.json', '.yaml', '.yml', '.csv', '.mmd', '.puml', '.sql',
  '.http', '.feature', '.xml', '.html', '.log',
]);

const MISSING_GUIDANCE = 'Run from the repo root or pass the path, e.g. node spec-board.mjs api/.ai/specs web/.ai/specs';

// Every pattern below is anchored and avoids adjacent overlapping quantifiers, and values are
// captured with [\s\S]* instead of .* (which stops at U+2028 and forces backtracking), so a
// hostile line cannot make matching quadratic.
const LIST_ITEM_RE = /^(\s*)(?:[-*+]|\d+[.)])\s+([\s\S]*)$/;

const KNOWN_STATUSES = new Set(['draft', 'approved', 'in-progress', 'done']);
const STATUS_ALIASES = {
  inprogress: 'in-progress',
  wip: 'in-progress',
  started: 'in-progress',
  'in-review': 'in-progress',
  complete: 'done',
  completed: 'done',
  shipped: 'done',
};

const WARNING_ORDER = [
  'open-questions', 'awaiting-approval', 'approval-missing', 'missing-spec-lite', 'no-frontmatter',
  'parse-error', 'ac-unparsed', 'unknown-status', 'no-tasks', 'traceability-gap', 'status-drift',
  'id-mismatch', 'stale-session', 'legacy',
];

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------

function normalizeText(text) {
  return String(text).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
}

// Structural rules only look at the first MAX_LINE_CHARS of a line; longer lines are never
// valid metadata or list items, and the cap bounds the work any single line can cost.
function splitLines(text) {
  return text.split('\n').map((line) => (line.length > MAX_LINE_CHARS ? line.slice(0, MAX_LINE_CHARS) : line));
}

// Comments become the same number of newlines so line numbers stay meaningful. An unterminated
// comment is left as text. indexOf scanning keeps this linear even for many unclosed openers.
function stripHtmlComments(text) {
  let out = '';
  let pos = 0;
  for (;;) {
    const open = text.indexOf('<!--', pos);
    if (open === -1) break;
    const close = text.indexOf('-->', open + 4);
    if (close === -1) break;
    out += text.slice(pos, open);
    for (let k = text.indexOf('\n', open); k !== -1 && k < close; k = text.indexOf('\n', k + 1)) out += '\n';
    pos = close + 3;
  }
  return out + text.slice(pos);
}

function matchHeading(line) {
  let level = 0;
  while (level < 6 && line[level] === '#') level++;
  if (level === 0 || !/\s/.test(line[level] ?? '')) return null;
  let text = line.slice(level).trim();
  let end = text.length;
  while (end > 0 && text[end - 1] === '#') end--;
  if (end > 0 && end < text.length && /\s/.test(text[end - 1])) text = text.slice(0, end).trimEnd();
  return { level, text };
}

function fenceMask(lines) {
  const mask = new Array(lines.length).fill(false);
  let fence = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (fence) {
      mask[i] = true;
      const close = /^\s*(`{3,}|~{3,})\s*$/.exec(line);
      if (close && close[1][0] === fence.char && close[1].length >= fence.length) fence = null;
      continue;
    }
    const open = /^\s*(`{3,}|~{3,})([\s\S]*)$/.exec(line);
    if (open && !(open[1][0] === '`' && open[2].includes('`'))) {
      fence = { char: open[1][0], length: open[1].length };
      mask[i] = true;
    }
  }
  return mask;
}

function prepareMarkdown(markdown) {
  const lines = splitLines(stripHtmlComments(normalizeText(markdown ?? '')));
  return { lines, mask: fenceMask(lines) };
}

function indentOf(line) {
  return /^[ \t]*/.exec(line)[0].replace(/\t/g, '    ').length;
}

function joinText(a, b) {
  if (!a) return b;
  if (!b || a.length >= MAX_JOINED_TEXT) return a;
  return `${a} ${b}`;
}

function hash12(value) {
  return crypto.createHash('sha1').update(JSON.stringify(value)).digest('hex').slice(0, 12);
}

function compareNatural(a, b) {
  return String(a).localeCompare(String(b), 'en', { numeric: true });
}

function errorCode(err) {
  return (err && err.code) || 'error';
}

// ---------------------------------------------------------------------------
// YAML subset
// ---------------------------------------------------------------------------

function setKey(target, key, value) {
  // defineProperty keeps keys such as "__proto__" as plain own data.
  Object.defineProperty(target, key, { value, enumerable: true, writable: true, configurable: true });
}

function stripInlineComment(raw) {
  let quote = null;
  let tokenStart = true;
  for (let k = 0; k < raw.length; k++) {
    const c = raw[k];
    if (quote === '"') {
      if (c === '\\') k++;
      else if (c === '"') quote = null;
      continue;
    }
    if (quote === "'") {
      if (c === "'") {
        if (raw[k + 1] === "'") k++;
        else quote = null;
      }
      continue;
    }
    if (c === '#' && (k === 0 || /\s/.test(raw[k - 1]))) return raw.slice(0, k);
    if ((c === '"' || c === "'") && tokenStart) {
      quote = c;
      tokenStart = false;
      continue;
    }
    if (c === '[' || c === ',' || c === '{') tokenStart = true;
    else if (!/\s/.test(c)) tokenStart = false;
  }
  return raw;
}

function parseScalar(raw, lineNo, errors) {
  const s = raw.trim();
  if (s === '' || s === '~' || /^null$/i.test(s)) return null;
  if (s[0] === '"') {
    let out = '';
    let k = 1;
    let closed = false;
    while (k < s.length) {
      const c = s[k];
      if (c === '\\') {
        const next = s[k + 1];
        if (next === undefined) break;
        if (next === 'n') out += '\n';
        else if (next === 't') out += '\t';
        else if (next === 'u' && /^[0-9a-fA-F]{4}$/.test(s.slice(k + 2, k + 6))) {
          out += String.fromCharCode(parseInt(s.slice(k + 2, k + 6), 16));
          k += 6;
          continue;
        } else out += next;
        k += 2;
        continue;
      }
      if (c === '"') {
        closed = true;
        k++;
        break;
      }
      out += c;
      k++;
    }
    return finishQuoted(s, out, closed, k, lineNo, errors);
  }
  if (s[0] === "'") {
    let out = '';
    let k = 1;
    let closed = false;
    while (k < s.length) {
      const c = s[k];
      if (c === "'") {
        if (s[k + 1] === "'") {
          out += "'";
          k += 2;
          continue;
        }
        closed = true;
        k++;
        break;
      }
      out += c;
      k++;
    }
    return finishQuoted(s, out, closed, k, lineNo, errors);
  }
  return s;
}

function finishQuoted(raw, value, closed, end, lineNo, errors) {
  if (!closed) {
    errors.push(`line ${lineNo}: unclosed quote; kept as text`);
    return raw;
  }
  if (raw.slice(end).trim() !== '') {
    errors.push(`line ${lineNo}: unexpected text after a quoted value; kept as text`);
    return raw;
  }
  return value === '' ? null : value;
}

// Returns the raw item strings of a flow sequence, or null when it is not closed.
function splitFlowSequence(value) {
  const items = [];
  let current = '';
  let quote = null;
  let itemStart = true;
  for (let k = 1; k < value.length; k++) {
    const c = value[k];
    if (quote) {
      current += c;
      if (quote === '"' && c === '\\') {
        current += value[k + 1] ?? '';
        k++;
      } else if (c === quote) {
        if (quote === "'" && value[k + 1] === "'") {
          current += "'";
          k++;
        } else quote = null;
      }
      continue;
    }
    if (c === ']') {
      if (value.slice(k + 1).trim() !== '') return null;
      if (current.trim() !== '') items.push(current.trim());
      return items;
    }
    if (c === ',') {
      if (current.trim() !== '') items.push(current.trim());
      current = '';
      itemStart = true;
      continue;
    }
    if ((c === '"' || c === "'") && itemStart) quote = c;
    if (!/\s/.test(c)) itemStart = false;
    current += c;
  }
  return null;
}

function dedent(lines) {
  const content = lines.filter((l) => l.trim() !== '');
  if (content.length === 0) return lines.map(() => '');
  const min = Math.min(...content.map(indentOf));
  return lines.map((l) => (l.trim() === '' ? '' : l.replace(/\t/g, '    ').slice(min)));
}

function foldLines(lines) {
  let out = '';
  let afterBreak = true;
  for (const line of lines) {
    if (line.trim() === '') {
      out += '\n';
      afterBreak = true;
      continue;
    }
    out += afterBreak ? line : ` ${line}`;
    afterBreak = false;
  }
  return out;
}

function parseYamlLines(src, lineOffset) {
  const data = {};
  const errors = [];
  const lines = splitLines(normalizeText(src));
  const isSkippable = (l) => l.trim() === '' || l.trim().startsWith('#');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const lineNo = i + 1 + lineOffset;
    if (isSkippable(line)) {
      i++;
      continue;
    }
    if (/^\s/.test(line)) {
      errors.push(`line ${lineNo}: unexpected indentation`);
      i++;
      continue;
    }
    const m = /^([A-Za-z_][\w.-]*)\s*:(?:\s+([\s\S]*))?\s*$/.exec(line);
    if (!m) {
      errors.push(`line ${lineNo}: expected 'key: value'`);
      i++;
      continue;
    }
    const key = m[1];
    const value = stripInlineComment(m[2] || '').trim();
    i++;
    let parsed;

    if (value === '' || /^[|>][+-]?$/.test(value)) {
      const blockScalar = value !== '';
      const start = i;
      let end = i;
      while (end < lines.length) {
        const l = lines[end];
        const isItem = !blockScalar && /^-(\s|$)/.test(l);
        if (l.trim() === '' || /^\s/.test(l) || isItem) end++;
        else break;
      }
      while (end > start && lines[end - 1].trim() === '') end--;
      const block = lines.slice(start, end);
      i = end;

      if (blockScalar) {
        const text = dedent(block);
        parsed = value[0] === '|' ? text.join('\n') : foldLines(text);
      } else {
        const content = [];
        block.forEach((l, k) => {
          if (l.trim() !== '' && !l.trim().startsWith('#')) content.push({ text: l, lineNo: start + k + 1 + lineOffset });
        });
        if (content.length === 0) {
          parsed = null;
        } else if (content.every((c) => /^\s*-(\s|$)/.test(c.text))) {
          parsed = content
            .map((c) => parseScalar(stripInlineComment(c.text.replace(/^\s*-/, '')), c.lineNo, errors))
            .filter((v) => v !== null);
        } else {
          parsed = dedent(block).join('\n');
          errors.push(`line ${lineNo}: nested mappings are not supported; kept as text`);
        }
      }
    } else if (value.startsWith('[')) {
      const items = splitFlowSequence(value);
      if (items === null) {
        parsed = value;
        errors.push(`line ${lineNo}: unclosed '['; kept as text`);
      } else {
        parsed = items.map((item) => parseScalar(item, lineNo, errors)).filter((v) => v !== null);
      }
    } else if (value.startsWith('{')) {
      parsed = value;
      errors.push(`line ${lineNo}: flow mappings are not supported; kept as text`);
    } else {
      parsed = parseScalar(value, lineNo, errors);
    }

    if (Object.prototype.hasOwnProperty.call(data, key)) {
      errors.push(`line ${lineNo}: duplicate key '${key}'`);
    }
    setKey(data, key, parsed);
  }
  return { data, errors };
}

/**
 * Parses the YAML subset used by spec frontmatter: scalars, quoted strings, flow and block
 * sequences, and block scalars. Every scalar stays a string ("0042", "P2", "true"); "", "~"
 * and "null" become null. Problems never throw: they are returned as "line N: ..." strings.
 */
export function parseYamlSubset(src, options = {}) {
  if (typeof src !== 'string') throw new TypeError('parseYamlSubset expects a string');
  return parseYamlLines(src, options.lineOffset || 0);
}

// Index of the first line that is neither blank nor a standalone HTML comment, starting at `from`.
function skipBlanksAndComments(lines, from = 0) {
  let i = from;
  while (i < lines.length) {
    const t = lines[i].trim();
    if (t === '') {
      i++;
      continue;
    }
    if (!t.startsWith('<!--')) break;
    let close = -1;
    let rest = '';
    for (let j = i; j < lines.length; j++) {
      const k = lines[j].indexOf('-->', j === i ? lines[j].indexOf('<!--') + 4 : 0);
      if (k !== -1) {
        close = j;
        rest = lines[j].slice(k + 3).trim();
        break;
      }
    }
    if (close === -1 || rest !== '') break;
    i = close + 1;
  }
  return i;
}

const FRONTMATTER_FENCE_RE = /^\s*(`{3,}|~{3,})\s*(?:markdown|md|yaml|yml)?\s*$/i;
const FENCE_CLOSE_RE = /^\s*(`{3,}|~{3,})\s*$/;

/**
 * Splits spec-lite text into frontmatter and body. Blank lines and HTML comments before the opening
 * "---" are tolerated. A template copied together with its markdown code fence still yields the
 * metadata, with an error asking for the fence to be removed.
 */
export function parseFrontmatter(text) {
  if (typeof text !== 'string') throw new TypeError('parseFrontmatter expects a string');
  const src = normalizeText(text);
  const lines = src.split('\n');
  let open = skipBlanksAndComments(lines);
  let wrapper = null;
  const fence = open < lines.length ? FRONTMATTER_FENCE_RE.exec(lines[open]) : null;
  if (fence) {
    const next = skipBlanksAndComments(lines, open + 1);
    if (next < lines.length && /^---\s*$/.test(lines[next])) {
      wrapper = fence[1][0];
      open = next;
    }
  }
  if (open >= lines.length || !/^---\s*$/.test(lines[open])) {
    return { present: false, data: null, body: src, errors: [] };
  }
  // A heading after a blank line cannot be metadata. Without this stop, a forgotten closing "---"
  // would make the template's footer rule the end of the frontmatter and swallow the whole body.
  let end = -1;
  for (let i = open + 1; i < lines.length; i++) {
    if (/^(---|\.\.\.)\s*$/.test(lines[i])) {
      end = i;
      break;
    }
    if (lines[i - 1].trim() === '' && matchHeading(lines[i])) break;
  }
  if (end === -1) {
    return {
      present: true,
      data: null,
      body: src,
      errors: ["frontmatter is not closed: add a '---' line after the metadata"],
    };
  }
  const { data, errors } = parseYamlLines(lines.slice(open + 1, end).join('\n'), open + 1);
  let bodyLines = lines.slice(end + 1);
  if (wrapper) {
    errors.push("frontmatter sits inside a code fence: remove the ``` lines so the '---' block starts the file");
    let last = bodyLines.length;
    while (last > 0 && bodyLines[last - 1].trim() === '') last--;
    const close = last > 0 ? FENCE_CLOSE_RE.exec(bodyLines[last - 1]) : null;
    if (close && close[1][0] === wrapper) bodyLines = bodyLines.slice(0, last - 1);
  }
  const body = bodyLines.join('\n').replace(/^\n+/, '');
  return { present: true, data, body, errors };
}

// ---------------------------------------------------------------------------
// Folder names and status
// ---------------------------------------------------------------------------

function humanizeSlug(slug) {
  const words = String(slug).replace(/-[2-9]$/, '').replace(/-+/g, ' ').trim();
  return words ? words[0].toUpperCase() + words.slice(1) : String(slug);
}

export function parseFolderName(name) {
  if (typeof name !== 'string') throw new TypeError('parseFolderName expects a string');
  let m = /^spec-(\d{8})-(\d{4})-(.+)$/.exec(name);
  if (m) {
    const d = m[1];
    return {
      pattern: 'timestamp',
      shortId: `${d}-${m[2]}`,
      ticket: null,
      number: null,
      created: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`,
      slug: m[3],
      title: humanizeSlug(m[3]),
    };
  }
  m = /^(?:spec-)?(\d+)-(\d{4}-\d{2}-\d{2})-(.+)$/.exec(name);
  if (m) {
    return { pattern: 'numbered', shortId: m[1], ticket: null, number: m[1], created: m[2], slug: m[3], title: humanizeSlug(m[3]) };
  }
  m = /^spec-([A-Za-z][A-Za-z0-9_]*-\d+)-(.+)$/.exec(name);
  if (m) {
    return { pattern: 'ticket', shortId: m[1], ticket: m[1], number: null, created: null, slug: m[2], title: humanizeSlug(m[2]) };
  }
  return { pattern: 'other', shortId: name, ticket: null, number: null, created: null, slug: name, title: humanizeSlug(name) };
}

export function normalizeStatus(raw) {
  if (raw === null || raw === undefined) return { status: 'unknown', known: false };
  const s = String(raw).toLowerCase().trim().replace(/[_\s]+/g, '-');
  if (KNOWN_STATUSES.has(s)) return { status: s, known: true };
  if (STATUS_ALIASES[s]) return { status: STATUS_ALIASES[s], known: true };
  return { status: 'unknown', known: false };
}

export function inferStatusFromTasks(tasks) {
  const total = (tasks && tasks.total) || 0;
  const done = (tasks && tasks.done) || 0;
  if (total === 0 || done === 0) return 'draft';
  return done < total ? 'in-progress' : 'done';
}

export function isInside(parentReal, childReal) {
  if (typeof parentReal !== 'string' || typeof childReal !== 'string') {
    throw new TypeError('isInside expects two path strings');
  }
  if (childReal === parentReal) return true;
  const prefix = parentReal.endsWith(path.sep) ? parentReal : parentReal + path.sep;
  return childReal.startsWith(prefix);
}

// ---------------------------------------------------------------------------
// Markdown structure: sections, tables, tasks
// ---------------------------------------------------------------------------

function findSection(lines, mask, headingRe) {
  for (let i = 0; i < lines.length; i++) {
    if (mask[i]) continue;
    const h = matchHeading(lines[i]);
    if (!h || !headingRe.test(h.text)) continue;
    const level = h.level;
    let end = lines.length;
    for (let j = i + 1; j < lines.length; j++) {
      if (mask[j]) continue;
      const next = matchHeading(lines[j]);
      if (next && next.level <= level) {
        end = j;
        break;
      }
    }
    return { start: i + 1, end };
  }
  return null;
}

export function extractSection(markdown, headingRe) {
  if (!(headingRe instanceof RegExp)) throw new TypeError('extractSection expects a RegExp');
  const lines = splitLines(normalizeText(markdown ?? ''));
  const range = findSection(lines, fenceMask(lines), headingRe);
  return range ? lines.slice(range.start, range.end).join('\n') : null;
}

// null when the heading does not exist, [] when the section is empty.
function sectionLines(prepared, headingRe) {
  const range = findSection(prepared.lines, prepared.mask, headingRe);
  if (!range) return null;
  const out = [];
  for (let i = range.start; i < range.end; i++) out.push({ text: prepared.lines[i], fenced: prepared.mask[i] });
  return out;
}

function splitTableRow(line, honourBackticks = true) {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  const cells = [];
  let current = '';
  let tick = 0;
  for (let k = 0; k < s.length; k++) {
    const c = s[k];
    if (c === '\\' && s[k + 1] === '|') {
      current += '|';
      k++;
      continue;
    }
    if (c === '`' && honourBackticks) {
      let run = 1;
      while (s[k + run] === '`') run++;
      if (tick === 0) tick = run;
      else if (tick === run) tick = 0;
      current += '`'.repeat(run);
      k += run - 1;
      continue;
    }
    if (c === '|' && tick === 0) {
      cells.push(current.trim());
      current = '';
      continue;
    }
    current += c;
  }
  if (tick !== 0) return splitTableRow(line, false);
  if (current.trim() !== '') cells.push(current.trim());
  return cells;
}

/**
 * Parses GFM table lines. Returns { headers, aligns, rows } with raw cell text, or null when the
 * second row is not a separator. Pipes escaped as \| or inside backticks do not split cells.
 */
export function parseTable(lines) {
  if (!Array.isArray(lines)) throw new TypeError('parseTable expects an array of lines');
  const rows = lines.map((l) => String(l).trim()).filter((l) => l.startsWith('|'));
  if (rows.length < 2) return null;
  const headers = splitTableRow(rows[0]);
  const separator = splitTableRow(rows[1]);
  if (separator.length === 0 || !separator.every((c) => /^:?-+:?$/.test(c.trim()))) return null;
  const aligns = headers.map((_, k) => {
    const cell = (separator[k] || '').trim();
    const left = cell.startsWith(':');
    const right = cell.endsWith(':');
    if (left && right) return 'center';
    if (right) return 'right';
    if (left) return 'left';
    return null;
  });
  const body = rows.slice(2).map((row) => {
    const cells = splitTableRow(row);
    return headers.map((_, k) => cells[k] ?? '');
  });
  return { headers, aligns, rows: body };
}

function emptyTasks() {
  return { present: false, counting: 'none', total: 0, done: 0, subtotal: 0, subdone: 0, phases: [], items: [], extra: [], traceability: [] };
}

// Strips wrapping **, __ or ` markers by index; a global regex with an unanchored alternative is
// quadratic on long marker runs.
function cleanCellId(cell) {
  const s = String(cell).trim();
  const markers = ['**', '__', '`'];
  let start = 0;
  let end = s.length;
  for (let moved = true; moved;) {
    moved = false;
    for (const m of markers) {
      if (start + m.length <= end && s.startsWith(m, start)) {
        start += m.length;
        moved = true;
      }
      if (end - m.length >= start && s.startsWith(m, end - m.length)) {
        end -= m.length;
        moved = true;
      }
    }
  }
  return s.slice(start, end).trim().toUpperCase();
}

function traceabilityRows(table) {
  if (!table) return [];
  const headers = table.headers.map((h) => h.toLowerCase().trim());
  const pick = (re, fallback) => {
    const idx = headers.findIndex((h) => re.test(h));
    return idx === -1 ? fallback : idx;
  };
  const col = {
    id: pick(/^id$/, 0),
    criterion: pick(/criteri|description/, 1),
    verifiedBy: pick(/verified/, 2),
    kind: pick(/^(kind|type)$/, 3),
    task: pick(/^tasks?$/, 4),
  };
  const out = [];
  for (const row of table.rows) {
    const cell = row[col.id] ?? '';
    // One row may name several criteria ("AC-1, AC-2") when a single test covers them.
    const named = parseCovers(cell);
    const ids = named.length > 0 ? named : [cleanCellId(cell)];
    const task = row[col.task] ?? '';
    for (const id of ids) {
      if (!id) continue;
      out.push({
        id,
        criterion: row[col.criterion] ?? '',
        verifiedBy: row[col.verifiedBy] ?? '',
        kind: row[col.kind] ?? '',
        task,
        taskNumbers: (task.match(/\d+/g) || []).map(Number),
      });
    }
  }
  return out;
}

function trimNonWord(token) {
  let start = 0;
  let end = token.length;
  while (start < end && !/\w/.test(token[start])) start++;
  while (end > start && !/\w/.test(token[end - 1])) end--;
  return token.slice(start, end);
}

// Located by position: an unanchored suffix regex is quadratic on long whitespace runs.
function splitStack(rawTitle) {
  const title = rawTitle.trim();
  const open = title.lastIndexOf('(');
  if (open !== -1 && title.endsWith(')') && STACK_INNER_RE.test(title.slice(open + 1, -1))) {
    return { title: title.slice(0, open).trim(), stack: title.slice(open + 1, -1).trim() };
  }
  return { title, stack: null };
}

function parseCovers(raw) {
  const ids = [];
  for (const token of raw.split(/[,\s]+/)) {
    const t = trimNonWord(token);
    if (/^(AC|MNC|NFR)-\d+$/i.test(t)) {
      const id = t.toUpperCase();
      if (!ids.includes(id)) ids.push(id);
    }
  }
  return ids;
}

const TASK_RE = /^ {0,3}[-*+]\s+\[([ xX])\]\s+(\d+)[.)]\s+([\s\S]*)$/;
const ORDERED_TASK_RE = /^ {0,3}(\d+)[.)]\s+\[([ xX])\]\s+([\s\S]*)$/;
const CHECKBOX_RE = /^(\s*)(?:[-*+]|\d+[.)])\s+\[([ xX])\]\s+([\s\S]*)$/;
const SUBTASK_RE = /^\s+[-*+]\s+\[([ xX])\]\s+(\d+(?:\.\d+)+)\.?\s+([\s\S]*)$/;
// The bullet is optional: workflows only ask for a "Covers: AC-x" line under each task.
const COVERS_RE = /^\s*(?:[-*+]\s+)?(?:\*\*)?Covers(?:\*\*)?:(?:\*\*)?\s*([\s\S]*)$/i;
const STACK_INNER_RE = /^[a-z0-9][a-z0-9 ,/+.-]*$/;
// A bold or plain "Traceability" line also opens the section when the writer skipped the heading.
const TRACE_LABEL_RE = /^ {0,3}(?:\*\*|__)?traceability\b[^|]*$/i;
// Anchored so that a phase such as "Phase 2: Order traceability in the admin UI" still holds tasks.
const NON_TASK_SECTION_RE = /^(?:done when|success criteria|definition of done|traceability|verification gates)\b/i;
// Dotted sub-steps written at the task's own indent ("- [x] 1.1 Failing test").
const FLAT_SUBTASK_RE = /^ {0,3}[-*+]\s+\[([ xX])\]\s+(\d+(?:\.\d+)+)\.?\s+([\s\S]*)$/;

function collectTableLines(lines, mask, start, stopAtHeading) {
  const tableLines = [];
  for (let i = start; i < lines.length; i++) {
    if (mask[i]) {
      if (tableLines.length) break;
      continue;
    }
    const t = lines[i].trim();
    if (t.startsWith('|')) {
      tableLines.push(t);
      continue;
    }
    if (tableLines.length || (stopAtHeading && matchHeading(lines[i]))) break;
  }
  return tableLines;
}

// Fallback when no Traceability heading exists: the first table with an ID column and a "Verified by" column.
function findTraceabilityTable(lines, mask) {
  for (let i = 0; i < lines.length; i++) {
    if (mask[i] || !lines[i].trim().startsWith('|')) continue;
    if (i > 0 && !mask[i - 1] && lines[i - 1].trim().startsWith('|')) continue;
    const table = parseTable(collectTableLines(lines, mask, i, false));
    if (!table) continue;
    const headers = table.headers.map((h) => h.toLowerCase().trim());
    if (headers.some((h) => h === 'id') && headers.some((h) => /verified/.test(h))) return traceabilityRows(table);
  }
  return [];
}

const TASKS_FENCE_OPEN_RE = /^\s*(`{3,}|~{3,})\s*(?:markdown|md)?\s*$/i;
const MAX_EXTRA_ITEMS = 200;

// The tasks template is published inside a ```markdown fence, and copying it with the fence turns the
// whole file into a code block. Returns the lines with both fence lines blanked, or null.
function unwrapTasksFence(lines) {
  let first = 0;
  while (first < lines.length && lines[first].trim() === '') first++;
  let last = lines.length - 1;
  while (last > first && lines[last].trim() === '') last--;
  if (first >= last) return null;
  const open = TASKS_FENCE_OPEN_RE.exec(lines[first]);
  const close = FENCE_CLOSE_RE.exec(lines[last]);
  if (!open || !close || close[1][0] !== open[1][0] || close[1].length < open[1].length) return null;
  const out = lines.slice();
  out[first] = '';
  out[last] = '';
  return out;
}

export function parseTasks(markdown) {
  return parseTasksDetailed(markdown).tasks;
}

// parseTasks plus the file-scoped problems the caller reports as spec errors.
function parseTasksDetailed(markdown) {
  if (typeof markdown !== 'string') throw new TypeError('parseTasks expects a string');
  const errors = [];
  let { lines, mask } = prepareMarkdown(markdown);
  const unwrapped = unwrapTasksFence(lines);
  if (unwrapped) {
    lines = unwrapped;
    mask = fenceMask(lines);
    errors.push('tasks.md sits inside a code fence: remove the ``` lines');
  }
  const candidates = [];
  const phases = [];
  let phase = null;
  let task = null;
  let cont = null;
  let excludedLevel = 0;
  let traceStart = -1;

  for (let i = 0; i < lines.length; i++) {
    if (mask[i]) {
      cont = null;
      continue;
    }
    const line = lines[i];
    const h = matchHeading(line);
    if (h) {
      const level = h.level;
      const text = h.text;
      if ((level === 2 || level === 3) && /^Phase\b/i.test(text)) {
        phase = text;
        if (!phases.includes(text)) phases.push(text);
      } else if (level <= 2) {
        phase = null;
      }
      if (excludedLevel && level <= excludedLevel) excludedLevel = 0;
      if (!excludedLevel && !/^Phase\b/i.test(text) && NON_TASK_SECTION_RE.test(text)) excludedLevel = level;
      if (traceStart === -1 && level >= 2 && level <= 4 && /^traceability\b/i.test(text)) traceStart = i + 1;
      task = null;
      cont = null;
      continue;
    }
    if (line.trim() === '') {
      cont = null;
      continue;
    }
    if (traceStart === -1 && TRACE_LABEL_RE.test(line)) {
      traceStart = i + 1;
      task = null;
      cont = null;
      continue;
    }

    let m = SUBTASK_RE.exec(line);
    if (m) {
      if (task) {
        const sub = { number: m[2], text: m[3].trim(), checked: m[1] !== ' ', verify: false };
        task.subtasks.push(sub);
        cont = { target: sub, key: 'text', indent: indentOf(line) };
      } else {
        cont = null;
      }
      continue;
    }

    m = FLAT_SUBTASK_RE.exec(line);
    if (m && task && task.number !== null && Number(m[2].split('.')[0]) === task.number) {
      const sub = { number: m[2], text: m[3].trim(), checked: m[1] !== ' ', verify: false };
      task.subtasks.push(sub);
      cont = { target: sub, key: 'text', indent: indentOf(line) };
      continue;
    }

    m = CHECKBOX_RE.exec(line);
    if (m) {
      const indent = indentOf(line);
      if (task && indent > task.indent) {
        const sub = { number: null, text: m[3].trim(), checked: m[2] !== ' ', verify: false };
        task.subtasks.push(sub);
        cont = { target: sub, key: 'text', indent };
        continue;
      }
      if (indent <= 3) {
        let number = null;
        let title = m[3];
        const numbered = TASK_RE.exec(line);
        if (numbered) {
          number = Number(numbered[2]);
          title = numbered[3];
        } else {
          const ordered = ORDERED_TASK_RE.exec(line);
          if (ordered) {
            number = Number(ordered[1]);
            title = ordered[3];
          }
        }
        // The stack suffix belongs to the task's first line; wrapped text must not hide it.
        const first = splitStack(title);
        task = {
          indent,
          number,
          title: first.title,
          stack: first.stack,
          checked: m[2] !== ' ',
          phase,
          covers: [],
          coversText: null,
          subtasks: [],
          excluded: excludedLevel > 0,
        };
        candidates.push(task);
        cont = { target: task, key: 'title', indent };
        continue;
      }
      cont = null;
      continue;
    }

    m = COVERS_RE.exec(line);
    if (m) {
      if (task) {
        const raw = m[1].trim();
        if (raw) {
          task.coversText = task.coversText ? `${task.coversText}, ${raw}` : raw;
          for (const id of parseCovers(raw)) if (!task.covers.includes(id)) task.covers.push(id);
        }
      }
      cont = null;
      continue;
    }

    if (LIST_ITEM_RE.test(line)) {
      cont = null;
      continue;
    }
    if (cont && indentOf(line) > cont.indent) {
      cont.target[cont.key] = joinText(cont.target[cont.key], line.trim());
      continue;
    }
    cont = null;
  }

  // Excluded sections ("Done when", traceability, ...) never hold tasks. Execution tools find work by
  // "- [ ] N." only, so once a numbered task exists the other top-level checkboxes (rollout lists,
  // risks, manual QA) are reported separately and do not count toward the totals.
  const chosen = candidates.filter((c) => !c.excluded);
  const numbered = chosen.filter((c) => c.number !== null);
  const counted = numbered.length > 0 ? numbered : chosen;
  let counting = 'none';
  if (counted.length > 0) counting = numbered.length > 0 ? 'numbered' : 'checkbox';

  const resolveTitle = (c) => {
    let title = c.title.trim();
    let stack = c.stack;
    if (stack === null) ({ title, stack } = splitStack(title));
    return { title, stack };
  };
  const items = counted.map((c) => ({
    number: c.number,
    ...resolveTitle(c),
    checked: c.checked,
    phase: c.phase,
    covers: c.covers,
    coversText: c.coversText,
    subtasks: c.subtasks.map((sub) => ({ ...sub, verify: /^\*\*verify\*\*/i.test(sub.text) })),
  }));
  const extra = numbered.length > 0
    ? chosen.filter((c) => c.number === null).slice(0, MAX_EXTRA_ITEMS)
      .map((c) => ({ ...resolveTitle(c), checked: c.checked, phase: c.phase }))
    : [];

  let traceability = [];
  if (traceStart !== -1) {
    traceability = traceabilityRows(parseTable(collectTableLines(lines, mask, traceStart, true)));
  }
  if (traceability.length === 0) traceability = findTraceabilityTable(lines, mask);

  const subtasks = items.flatMap((item) => item.subtasks);
  const tasks = {
    present: true,
    counting,
    total: items.length,
    done: items.filter((item) => item.checked).length,
    subtotal: subtasks.length,
    subdone: subtasks.filter((sub) => sub.checked).length,
    phases,
    items,
    extra,
    traceability,
  };
  return { tasks, errors };
}

// ---------------------------------------------------------------------------
// spec-lite sections
// ---------------------------------------------------------------------------

// Bullets, numbered items and checkbox items ("- [ ] AC-1: ...") that start with an id.
const ID_ITEM_RE = /^\s*(?:[-*+]|\d+\.)\s+(?:\[[ xX]\]\s+)?(?:(?:\*\*|__)\s*)?((?:AC|MNC|NFR)-\d+)\s*:?\s*(?:\*\*|__)?\s*:?\s*([\s\S]*)$/i;
// "### AC-1: title" headings; the Given/When/Then lines below them belong to the item.
const ID_HEADING_RE = /^(?:\*\*|__)?\s*((?:AC|MNC|NFR)-\d+)\b\s*[:.)\u2013\u2014-]?\s*(?:\*\*|__)?\s*([\s\S]*)$/i;
const TABLE_SEPARATOR_RE = /^\|?[\s:|-]+\|?$/;
const NO_QUESTIONS_RE = /^(none|n\/a|nothing|no (open )?questions?)\b/i;

// "- None identified.", "- (none)", "- _None_" and "- None - all resolved" all mean the list is empty.
// A bullet that still asks something ("None of these cover X?") stays open.
function isNoQuestionsMarker(content) {
  if (content.includes('?')) return false;
  return NO_QUESTIONS_RE.test(content.replace(/[*_`()[\]]/g, '').trim());
}

function parseIdItems(lines) {
  const out = [];
  const seen = new Set();
  let current = null;
  let prevBlank = false;
  const start = (id, text, heading) => {
    if (seen.has(id)) {
      current = null;
      return;
    }
    seen.add(id);
    current = { id, text: text.trim(), heading };
    out.push(current);
  };
  for (const { text, fenced } of lines) {
    if (fenced) {
      if (!current || !current.heading) current = null;
      continue;
    }
    const trimmed = text.trim();
    if (trimmed === '') {
      prevBlank = true;
      continue;
    }
    const heading = matchHeading(text);
    if (heading) {
      const hm = ID_HEADING_RE.exec(heading.text);
      if (hm) start(hm[1].toUpperCase(), hm[2], true);
      else current = null;
      prevBlank = false;
      continue;
    }
    if (trimmed.startsWith('|')) {
      if (!TABLE_SEPARATOR_RE.test(trimmed)) {
        const cells = splitTableRow(trimmed);
        const id = cleanCellId(cells[0] ?? '');
        if (/^(?:AC|MNC|NFR)-\d+$/.test(id)) {
          start(id, cells.slice(1).filter(Boolean).join(' - '), false);
          current = null;
        } else if (current && current.heading) {
          current.text = joinText(current.text, trimmed);
        } else {
          current = null;
        }
      }
      prevBlank = false;
      continue;
    }
    const m = ID_ITEM_RE.exec(text);
    if (m) {
      start(m[1].toUpperCase(), m[2], false);
    } else if (LIST_ITEM_RE.test(text)) {
      if (current && current.heading) current.text = joinText(current.text, LIST_ITEM_RE.exec(text)[2].trim());
      else current = null;
    } else if (current && (current.heading || /^\s/.test(text) || !prevBlank)) {
      current.text = joinText(current.text, trimmed);
    } else {
      current = null;
    }
    prevBlank = false;
  }
  return out.map(({ id, text }) => ({ id, text }));
}

function parseQuestionItems(lines) {
  const out = [];
  let current = null;
  let base = null;
  let prevBlank = false;
  for (const { text, fenced } of lines) {
    if (fenced) {
      current = null;
      continue;
    }
    if (text.trim() === '') {
      prevBlank = true;
      continue;
    }
    const item = LIST_ITEM_RE.exec(text);
    if (item) {
      const indent = indentOf(text);
      if (base === null) base = indent;
      const content = item[2].trim();
      if (indent <= base + 1) {
        const box = /^\[([ xX])\](?:\s+([\s\S]*))?$/.exec(content);
        if (box) {
          current = { text: (box[2] || '').trim(), checked: box[1] !== ' ' };
          out.push(current);
        } else if (isNoQuestionsMarker(content)) {
          current = null;
        } else {
          current = { text: content, checked: false };
          out.push(current);
        }
      } else if (current) {
        current.text = joinText(current.text, content);
      }
    } else if (current && (/^\s/.test(text) || !prevBlank)) {
      current.text = joinText(current.text, text.trim());
    } else {
      current = null;
    }
    prevBlank = false;
  }
  return out;
}

function firstHeadingOf(prepared, preferTopLevel = true) {
  let any = null;
  for (let i = 0; i < prepared.lines.length; i++) {
    if (prepared.mask[i]) continue;
    const h = matchHeading(prepared.lines[i]);
    if (!h || !h.text) continue;
    if (preferTopLevel && h.level === 1) return h.text;
    if (any === null) any = h.text;
  }
  return any;
}

const LEGACY_STATUS_LINE_RE = /^\s*(?:[-*+]\s+)?(?:\*\*|__)Status:?(?:\*\*|__):?\s*([\s\S]*)$/i;

// Old spec-lite files carry "**Status**: PLANNED | IN PROGRESS | COMPLETED". An unfilled template lists all
// three, which is ambiguous and ignored.
function legacyBodyStatus(body) {
  const { lines, mask } = prepareMarkdown(typeof body === 'string' ? body : '');
  for (let i = 0; i < lines.length; i++) {
    if (mask[i]) continue;
    const m = LEGACY_STATUS_LINE_RE.exec(lines[i]);
    if (!m) continue;
    const text = m[1].toLowerCase();
    const found = new Set();
    if (/in[\s_-]*progress|\bwip\b|\bstarted\b/.test(text)) found.add('in-progress');
    if (/\bcomplete(d)?\b|\bdone\b|\bshipped\b/.test(text)) found.add('done');
    if (/\bplanned\b|\bdraft\b|\bnot started\b|\bto ?do\b/.test(text)) found.add('draft');
    return found.size === 1 ? [...found][0] : null;
  }
  return null;
}

const LEGACY_PRIORITY_LINE_RE = /^\s*(?:[-*+]\s+)?(?:\*\*|__)Priority:?(?:\*\*|__):?\s*([\s\S]*)$/i;

// Old files say "**Priority**: High". The words map onto the P0-P3 scale used by the frontmatter; a
// line that lists several levels (an unfilled template) or none of them is ignored.
function legacyBodyPriority(body) {
  const { lines, mask } = prepareMarkdown(typeof body === 'string' ? body : '');
  for (let i = 0; i < lines.length; i++) {
    if (mask[i]) continue;
    const m = LEGACY_PRIORITY_LINE_RE.exec(lines[i]);
    if (!m) continue;
    const text = m[1].toLowerCase();
    const found = new Set();
    for (const hit of text.matchAll(/\bp([0-3])\b/g)) found.add(`P${hit[1]}`);
    if (/\b(critical|urgent|blocker)\b/.test(text)) found.add('P0');
    if (/\bhigh\b/.test(text)) found.add('P1');
    if (/\b(medium|normal|moderate)\b/.test(text)) found.add('P2');
    if (/\blow\b/.test(text)) found.add('P3');
    return found.size === 1 ? [...found][0] : null;
  }
  return null;
}

const ACCEPTANCE_HEADING_RE = /^acceptance criteria/i;
const MUST_NOT_CHANGE_HEADING_RE = /^must[\s-]+not[\s-]+change/i;
// write-spec's "Quality attributes" section; older specs call it "Non-functional requirements".
const QUALITY_HEADING_RE = /^(?:quality attributes|non[\s-]*functional requirements|nfrs?\b)/i;

function analyzeSpecLite(body) {
  const prepared = prepareMarkdown(typeof body === 'string' ? body : '');
  const acceptanceLines = sectionLines(prepared, ACCEPTANCE_HEADING_RE);
  return {
    acceptance: parseIdItems(acceptanceLines || []),
    mustNotChange: parseIdItems(sectionLines(prepared, MUST_NOT_CHANGE_HEADING_RE) || []),
    nfrs: parseIdItems(sectionLines(prepared, QUALITY_HEADING_RE) || []).filter((item) => item.id.startsWith('NFR-')),
    openQuestions: parseQuestionItems(sectionLines(prepared, /^open questions/i) || []),
    firstHeading: firstHeadingOf(prepared),
    hasAcceptanceSection: acceptanceLines !== null,
  };
}

export function parseSpecLite(body) {
  const { acceptance, mustNotChange, nfrs, openQuestions, firstHeading } = analyzeSpecLite(body);
  return { acceptance, mustNotChange, nfrs, openQuestions, firstHeading };
}

function cleanTitle(raw) {
  const unwrap = (s) => s.replace(/^(\*\*|`)([\s\S]*)\1$/, '$2').trim();
  let t = unwrap(String(raw).trim());
  const suffix = /[-–—:]\s*(?:spec[- ]lite|tasks|implementation tasks|task list|specification)$/i.exec(t);
  if (suffix) t = t.slice(0, suffix.index);
  return unwrap(t.trim());
}

// ---------------------------------------------------------------------------
// Root resolution and scanning
// ---------------------------------------------------------------------------

function isDirectory(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function realOrSelf(p) {
  try {
    return fs.realpathSync(p);
  } catch {
    return p;
  }
}

const REPO_MARKERS = ['.git', '.ai', 'package.json', 'composer.json'];
const MAX_CHILDREN_SNIFFED = 200;

function exists(p) {
  try {
    fs.lstatSync(p);
    return true;
  } catch {
    return false;
  }
}

function hasSpecChildren(dir) {
  let dirents;
  try {
    dirents = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return false;
  }
  let inspected = 0;
  for (const d of dirents) {
    if (!d.isDirectory() && !d.isSymbolicLink()) continue;
    if (d.name.startsWith('.') || d.name.startsWith('_') || d.name === 'node_modules') continue;
    if (++inspected > MAX_CHILDREN_SNIFFED) break;
    if (exists(path.join(dir, d.name, 'spec-lite.md')) || exists(path.join(dir, d.name, 'tasks.md'))) return true;
  }
  return false;
}

// A folder without .ai/specs is a repo root, not a spec folder, unless it is named "specs" or has
// no repo markers and its children look like spec folders. Treating a repo root as the spec folder
// would scan app/, vendor/ and friends for cards.
function isSpecFolder(dir) {
  if (path.basename(dir) === 'specs') return true;
  if (REPO_MARKERS.some((marker) => exists(path.join(dir, marker)))) return false;
  return hasSpecChildren(dir);
}

// A single spec folder: spec-lite.md, or tasks.md in a folder that is not a repo root.
function isSingleSpecFolder(dir) {
  if (exists(path.join(dir, 'spec-lite.md'))) return true;
  return exists(path.join(dir, 'tasks.md')) && !REPO_MARKERS.some((marker) => exists(path.join(dir, marker)));
}

function isAiSpecsPath(abs) {
  return path.basename(abs) === 'specs' && path.basename(path.dirname(abs)) === '.ai';
}

// Paths outside cwd would render as ../../.. (and absolute paths would put the home folder into a
// shared snapshot), so those collapse to <repo>/.ai/specs or a ~-abbreviated path.
function displayPath(abs, cwd) {
  const rel = path.relative(cwd, abs);
  if (rel === '') return '.';
  const outside = rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel);
  if (!outside) return rel.split(path.sep).join('/');
  if (isAiSpecsPath(abs)) {
    const repo = path.basename(path.dirname(path.dirname(abs)));
    if (repo && repo !== path.sep) return `${repo}/.ai/specs`;
  }
  const home = process.env.HOME || process.env.USERPROFILE;
  if (home && isInside(path.resolve(home), abs)) {
    const fromHome = path.relative(path.resolve(home), abs).split(path.sep).join('/');
    return fromHome ? `~/${fromHome}` : '~';
  }
  return abs.split(path.sep).join('/');
}

export function resolveRoots(dirs, cwd = process.cwd()) {
  if (!Array.isArray(dirs)) throw new TypeError('resolveRoots expects an array of directory paths');
  if (typeof cwd !== 'string') throw new TypeError('resolveRoots expects cwd to be a string');
  const args = dirs.length > 0 ? dirs : ['./.ai/specs'];
  const seen = new Map();
  const picked = [];
  for (const arg of args) {
    if (typeof arg !== 'string' || arg === '') throw new TypeError('resolveRoots expects non-empty path strings');
    const p = path.resolve(cwd, arg);
    const nested = path.join(p, '.ai', 'specs');
    const inside = path.join(p, 'specs');
    let abs = p;
    // Naming one spec folder shows that spec alone, inside its parent root.
    let only = null;
    if (isDirectory(nested)) abs = nested;
    else if (path.basename(p) === '.ai' && isDirectory(inside)) abs = inside;
    else if (isDirectory(p) && isSingleSpecFolder(p)) {
      abs = path.dirname(p);
      only = path.basename(p);
    } else if (isDirectory(p) && !isSpecFolder(p)) abs = nested;
    const real = realOrSelf(abs);
    const earlier = seen.get(real);
    if (earlier) {
      // A whole root wins over a single-folder selection of the same root.
      if (earlier.only === null || only === null) earlier.only = null;
      else if (!earlier.only.includes(only)) earlier.only.push(only);
      continue;
    }
    // `shown` echoes a relative argument exactly as typed; absolute ones use the sanitised display path.
    const entry = { abs, only: only === null ? null : [only], shown: abs === p && !path.isAbsolute(arg) ? arg : null };
    seen.set(real, entry);
    picked.push(entry);
  }
  const labels = new Map();
  return picked.map(({ abs, only, shown }, index) => {
    let base;
    if (path.basename(abs) === 'specs' && path.basename(path.dirname(abs)) === '.ai') {
      base = path.basename(path.dirname(path.dirname(abs)));
    } else {
      base = path.basename(abs);
    }
    if (!base || base === path.sep) base = 'root';
    const count = (labels.get(base) || 0) + 1;
    labels.set(base, count);
    const repo = count === 1 ? base : `${base}#${count}`;
    const displayDir = displayPath(abs, cwd);
    const root = { key: `r${index}`, repo, abs, displayDir, shown: shown ?? displayDir };
    if (only) root.only = only;
    return root;
  });
}

const READ_FLAGS = fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0) | (fs.constants.O_NONBLOCK || 0);

function readError(code, message) {
  return Object.assign(new Error(message), { code });
}

/**
 * Opens first and validates the descriptor, so a file swapped for a symlink or another file
 * between the earlier lstat and this read cannot redirect it. O_NOFOLLOW refuses a symlink in the
 * last path component, O_NONBLOCK keeps a swapped-in FIFO from hanging the open, and the
 * dev/ino comparison against the stat taken during validation catches any other substitution.
 * At most maxBytes + 1 bytes are read however large the file has become.
 */
function readBounded(file, expected, maxBytes) {
  const fd = fs.openSync(file, READ_FLAGS);
  try {
    const st = fs.fstatSync(fd);
    if (!st.isFile()) throw readError('ENOTFILE', 'not a regular file');
    if (expected && expected.ino && (st.ino !== expected.ino || st.dev !== expected.dev)) {
      throw readError('ECHANGED', 'file changed while scanning');
    }
    if (st.size > maxBytes) return { tooLarge: true, size: st.size };
    const buf = Buffer.allocUnsafe(Math.min(maxBytes, st.size) + 1);
    let total = 0;
    while (total < buf.length) {
      const n = fs.readSync(fd, buf, total, buf.length - total, null);
      if (n === 0) break;
      total += n;
    }
    if (total > maxBytes) return { tooLarge: true, size: total };
    return { buf: buf.subarray(0, total), size: total, mtimeMs: st.mtimeMs };
  } finally {
    fs.closeSync(fd);
  }
}

// lstat first: a symlink is followed only when its target stays inside rootReal.
function secureStat(abs, rootReal) {
  let lst;
  try {
    lst = fs.lstatSync(abs);
  } catch (err) {
    return { error: err };
  }
  if (!lst.isSymbolicLink()) return { real: abs, stat: lst };
  let real;
  try {
    real = fs.realpathSync(abs);
  } catch (err) {
    return { error: err };
  }
  if (!isInside(rootReal, real)) return { refused: true };
  try {
    return { real, stat: fs.statSync(real) };
  } catch (err) {
    return { error: err };
  }
}

// Reads one session directory. Problems are reported once per directory even when several roots share it.
function readSessionDir(dir) {
  const result = { entries: [], problems: [] };
  let st;
  try {
    st = fs.lstatSync(dir);
  } catch {
    return result;
  }
  if (st.isSymbolicLink()) {
    result.problems.push('session: the session folder is a symlink; not read');
    return result;
  }
  if (!st.isDirectory()) return result;
  // A symlinked .ai would otherwise redirect the whole session lookup outside the repo.
  if (path.basename(path.dirname(dir)) === '.ai' && !isInside(realOrSelf(path.dirname(path.dirname(dir))), realOrSelf(dir))) {
    result.problems.push('session: the session folder points outside the repo; not read');
    return result;
  }
  let names;
  try {
    names = fs.readdirSync(dir).filter((n) => /-state\.json$/.test(n)).sort(compareNatural);
  } catch (err) {
    result.problems.push(`session: cannot read (${errorCode(err)})`);
    return result;
  }
  if (names.length > MAX_SESSION_FILES) {
    result.problems.push(`session: more than ${MAX_SESSION_FILES} state files; only the first ${MAX_SESSION_FILES} are read`);
    names = names.slice(0, MAX_SESSION_FILES);
  }
  for (const file of names) {
    const p = path.join(dir, file);
    let fst;
    try {
      fst = fs.lstatSync(p);
    } catch {
      continue;
    }
    if (!fst.isFile()) continue;
    let read;
    try {
      read = readBounded(p, fst, MAX_SESSION_BYTES);
    } catch (err) {
      result.problems.push(`session/${file}: cannot read (${errorCode(err)})`);
      continue;
    }
    if (read.tooLarge) {
      result.problems.push(`session/${file}: larger than ${MAX_SESSION_BYTES / 1024} KB; skipped`);
      continue;
    }
    let json;
    try {
      json = JSON.parse(normalizeText(read.buf.toString('utf8')));
    } catch {
      result.problems.push(`session/${file}: invalid JSON`);
      continue;
    }
    if (!json || typeof json !== 'object' || Array.isArray(json)) {
      result.problems.push(`session/${file}: expected a JSON object`);
      continue;
    }
    result.entries.push({ file, json, mtimeMs: fst.mtimeMs });
  }
  return result;
}

// State files live in .ai/session next to the spec root; execute-task run from a workspace folder
// (polyrepo) writes them to <cwd>/.ai/session instead, so both places are read.
function readSessions(root, env) {
  const result = { entries: [], problems: [] };
  const sibling = path.join(path.dirname(root.abs), 'session');
  const workspace = path.join(env.cwd, '.ai', 'session');
  const dirs = [{ dir: sibling, origin: 'sibling' }];
  if (path.resolve(workspace) !== path.resolve(sibling) && realOrSelf(workspace) !== realOrSelf(sibling)) {
    dirs.push({ dir: workspace, origin: 'workspace' });
  }
  for (const { dir, origin } of dirs) {
    const key = realOrSelf(dir);
    let loaded = env.sessionDirs.get(key);
    if (!loaded) {
      loaded = { ...readSessionDir(dir), reported: false };
      env.sessionDirs.set(key, loaded);
    }
    if (!loaded.reported) {
      result.problems.push(...loaded.problems);
      loaded.reported = true;
    }
    const base = path.dirname(path.dirname(dir));
    for (const e of loaded.entries) result.entries.push({ ...e, origin, base });
  }
  return result;
}

// spec_path is compared as text only: nothing outside the root is ever opened.
function specPathFolder(entry, root, rootReal, cwd) {
  const sp = entry.json.spec_path;
  if (typeof sp !== 'string' || sp.trim() === '') return null;
  // Relative paths are tried from the folder execute-task ran in, from the session folder's repo,
  // and from the folder that holds the repos (state files written in a sibling "workspace" folder).
  const repoParent = isAiSpecsPath(root.abs) ? path.dirname(path.dirname(path.dirname(root.abs))) : cwd;
  const bases = path.isAbsolute(sp) ? [''] : [cwd, entry.base, repoParent];
  for (const base of bases) {
    const resolved = path.resolve(base, sp);
    for (const rootDir of [root.abs, rootReal]) {
      if (!isInside(rootDir, resolved) || resolved === rootDir) continue;
      return path.relative(rootDir, resolved).split(path.sep)[0];
    }
  }
  return undefined;
}

// The one root whose folder carries this name, or null when it is missing or exists in several roots.
function uniqueFolderRoot(env, folder) {
  if (typeof folder !== 'string' || folder === '' || folder === '.' || folder === '..' || /[\\/]/.test(folder)) return null;
  if (env.folderOwners.has(folder)) return env.folderOwners.get(folder);
  const owners = env.roots.filter((r) => exists(path.join(r.abs, folder)));
  const owner = owners.length === 1 ? owners[0].key : null;
  env.folderOwners.set(folder, owner);
  return owner;
}

// Session files from a workspace folder (cwd/.ai/session) can belong to any repo. Without a spec_path
// they are attached only when they name a folder that exists in exactly one root, because legacy
// numbers and ids repeat across repos. The root's own sibling session folder keeps every rule.
function matchSession(entries, spec, ctx) {
  const { folder, id, folderInfo } = spec;
  const { root, rootReal, cwd, numberCounts, problems, env } = ctx;
  const usable = entries.filter((e) => {
    const pathFolder = specPathFolder(e, root, rootReal, cwd);
    if (pathFolder === undefined) return e.origin === 'sibling';
    if (pathFolder === null) return e.origin === 'sibling' || uniqueFolderRoot(env, e.json.spec_folder) === root.key;
    return pathFolder === folder;
  });
  const own = usable.filter((e) => e.origin === 'sibling');
  // A state file that names another folder belongs to that folder, whatever its file name or id says
  // (a frontmatter id copied from another spec must not inherit that spec's session).
  const namesOther = (e) => typeof e.json.spec_folder === 'string' && e.json.spec_folder !== '' && e.json.spec_folder !== folder;
  const rules = [
    [usable, (e) => e.json.spec_folder === folder],
    [own, (e) => !namesOther(e) && e.file === `${folder}-state.json`],
    [own, (e) => !namesOther(e) && e.json.spec_id === folder],
    [own, (e) => !namesOther(e) && e.json.spec_id === id],
    [usable, (e) => specPathFolder(e, root, rootReal, cwd) === folder],
  ];
  for (const [pool, rule] of rules) {
    const hit = pool.find(rule);
    if (hit) return hit;
  }
  if (folderInfo.pattern === 'numbered') {
    const N = folderInfo.number;
    const n = String(parseInt(N, 10));
    const files = [`spec-${N}-state.json`, `spec-${n}-state.json`];
    const ids = [N, n, `spec-${N}`, `spec-${n}`];
    // Legacy files carry only the number; spec_folder, when present, names the one folder they belong to.
    const hit = own.find((e) => {
      const named = e.json.spec_folder;
      if (typeof named === 'string' && named !== '') return false;
      return files.includes(e.file) || ids.includes(String(e.json.spec_id));
    });
    if (hit) {
      if (numberCounts.get(n) > 1) {
        const note = `session/${hit.file}: several specs share number ${N}; not attached to any of them`;
        if (!problems.includes(note)) problems.push(note);
        return null;
      }
      return hit;
    }
  }
  return null;
}

function extractSession(entry) {
  const j = entry.json;
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const str = (v) => (typeof v === 'string' ? v.slice(0, MAX_SESSION_STRING) : null);
  return {
    file: entry.file,
    currentTask: num(j.current_task),
    totalTasks: num(j.total_tasks),
    completedTasks: Array.isArray(j.completed_tasks)
      ? j.completed_tasks.filter((v) => typeof v === 'number' && Number.isFinite(v)).slice(0, MAX_COMPLETED_TASKS)
      : [],
    lastUpdated: str(j.last_updated),
    resumeHint: str(j.resume_hint),
  };
}

// A state file that disagrees with the checked tasks was written before the last edit to tasks.md.
function assessSession(session, json, tasks, status) {
  session.stale = false;
  session.staleNote = null;
  if (!tasks.present || tasks.total === 0) return;
  const checkedNumbers = new Set(tasks.items.filter((t) => t.checked && t.number !== null).map((t) => t.number));
  const openNumbers = new Set(tasks.items.filter((t) => !t.checked && t.number !== null).map((t) => t.number));
  const allDone = tasks.done === tasks.total;
  let stale = false;
  if (session.currentTask !== null && checkedNumbers.has(session.currentTask)) stale = true;
  if (allDone && session.currentTask !== null && session.currentTask <= tasks.total) stale = true;
  if (status === 'done' && session.currentTask !== null && session.currentTask <= tasks.total) stale = true;
  if (Array.isArray(json.completed_tasks) && json.completed_tasks.every((v) => typeof v === 'number')) {
    const claimed = new Set(session.completedTasks);
    if (tasks.counting === 'numbered') {
      if ([...checkedNumbers].some((n) => !claimed.has(n)) || [...claimed].some((n) => openNumbers.has(n))) stale = true;
    } else if (claimed.size !== tasks.done) {
      stale = true;
    }
  }
  if (stale) {
    session.stale = true;
    session.staleNote = `Session state is older than tasks.md (${tasks.done}/${tasks.total} done)`;
  }
}

function fileKind(name) {
  const ext = path.extname(name).toLowerCase();
  if (MARKDOWN_EXT.has(ext)) return 'markdown';
  if (TEXT_EXT.has(ext)) return 'text';
  return 'other';
}

function rankFile(p) {
  if (p === 'spec-lite.md') return 0;
  if (p === 'tasks.md') return 1;
  return 2;
}

function collectFiles(specReal, rootReal) {
  const found = [];
  const visit = (dirAbs, rel, depth) => {
    let dirents;
    try {
      dirents = fs.readdirSync(dirAbs, { withFileTypes: true });
    } catch {
      return;
    }
    dirents.sort((a, b) => compareNatural(a.name, b.name));
    for (const d of dirents) {
      if (found.length >= MAX_FILES_COLLECTED) return;
      if (d.name.startsWith('.') || d.name === 'node_modules') continue;
      const relPath = rel ? `${rel}/${d.name}` : d.name;
      const res = secureStat(path.join(dirAbs, d.name), rootReal);
      if (res.refused) {
        found.push({ path: relPath, refused: true });
        continue;
      }
      if (res.error) continue;
      if (res.stat.isDirectory()) {
        if (depth < 2) visit(res.real, relPath, depth + 1);
        continue;
      }
      if (res.stat.isFile()) found.push({ path: relPath, real: res.real, stat: res.stat });
    }
  };
  visit(specReal, '', 1);
  found.sort((a, b) => rankFile(a.path) - rankFile(b.path) || compareNatural(a.path, b.path));
  return found;
}

const BUDGET_NOTE = 'too large for the board; open it in your editor';

// Live mode re-scans every couple of seconds. File contents are kept per path and re-read only when the
// file's stat signature changes, so an idle board costs a stat per file instead of a read.
const FILE_CACHE = new Map();

function statSignature(st) {
  return `${st.dev}:${st.ino}:${st.size}:${st.mtimeMs}:${st.ctimeMs}`;
}

function readFileContent(entry, kind, maxFileBytes) {
  const bytes = entry.stat.size;
  let read;
  try {
    read = readBounded(entry.real, entry.stat, maxFileBytes);
  } catch (err) {
    return { cacheable: false, bytes, kind, content: null, note: `cannot read (${errorCode(err)})` };
  }
  if (read.tooLarge) {
    return {
      cacheable: true, bytes: read.size, kind, content: null,
      note: `too large (${Math.round(read.size / 1024)} KB); open it in your editor`,
    };
  }
  if (read.buf.subarray(0, BINARY_SNIFF_BYTES).includes(0)) {
    return { cacheable: true, bytes, kind: 'other', content: null, note: 'binary file' };
  }
  return { cacheable: true, bytes, kind, content: normalizeText(read.buf.toString('utf8')), note: null };
}

function buildFileEntry(entry, maxFileBytes, env) {
  if (entry.refused) {
    return { path: entry.path, bytes: 0, kind: 'skipped', view: null, content: null, note: 'symlink outside the spec directory; not read' };
  }
  const bytes = entry.stat.size;
  const kind = fileKind(entry.path);
  if (entry.path === 'spec-lite.md') {
    return { path: entry.path, bytes, kind: 'markdown', view: 'spec', content: null, note: null };
  }
  if (kind === 'other') return { path: entry.path, bytes, kind, view: null, content: null, note: null };
  if (bytes > maxFileBytes) {
    return {
      path: entry.path, bytes, kind, view: null, content: null,
      note: `too large (${Math.round(bytes / 1024)} KB); open it in your editor`,
    };
  }
  // The budget caps the board as a whole: spec folders holding SQL dumps or logs would otherwise
  // be embedded in every page load and every live update.
  if (bytes > env.budget.remaining) {
    env.budget.exhausted = true;
    return { path: entry.path, bytes, kind, view: null, content: null, note: BUDGET_NOTE };
  }
  const key = `${maxFileBytes}|${entry.real}`;
  const sig = statSignature(entry.stat);
  env.usedCacheKeys.add(key);
  let result;
  const hit = FILE_CACHE.get(key);
  if (hit && hit.sig === sig) {
    result = hit.result;
  } else {
    result = readFileContent(entry, kind, maxFileBytes);
    if (result.cacheable) {
      if (FILE_CACHE.size >= MAX_CACHED_FILES) FILE_CACHE.clear();
      FILE_CACHE.set(key, { sig, result });
    }
  }
  if (result.content !== null) env.budget.remaining -= result.bytes;
  return { path: entry.path, bytes: result.bytes, kind: result.kind, view: null, content: result.content, note: result.note };
}

function readSpecFile(specReal, rootReal, name, maxFileBytes, errors) {
  const abs = path.join(specReal, name);
  let lst;
  try {
    lst = fs.lstatSync(abs);
  } catch (err) {
    if (err.code !== 'ENOENT') errors.push(`${name}: cannot read (${errorCode(err)})`);
    return null;
  }
  const res = secureStat(abs, rootReal);
  if (res.refused) {
    errors.push(`${name}: symlink points outside the spec directory; not read`);
    return null;
  }
  if (res.error) {
    errors.push(`${name}: cannot read (${errorCode(res.error)})`);
    return null;
  }
  if (!res.stat.isFile()) {
    errors.push(`${name}: not a regular file`);
    return null;
  }
  if (res.stat.size > maxFileBytes) {
    errors.push(`${name}: too large (${Math.round(res.stat.size / 1024)} KB); not parsed`);
    return null;
  }
  try {
    const read = readBounded(res.real, res.stat, maxFileBytes);
    if (read.tooLarge) {
      errors.push(`${name}: too large (${Math.round(read.size / 1024)} KB); not parsed`);
      return null;
    }
    return { text: normalizeText(read.buf.toString('utf8')), mtimeMs: read.mtimeMs || lst.mtimeMs };
  } catch (err) {
    errors.push(`${name}: cannot read (${errorCode(err)})`);
    return null;
  }
}

function asString(v) {
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v.join(', ');
  return null;
}

function asNonEmpty(v) {
  const s = asString(v);
  if (s === null) return null;
  const t = s.trim();
  return t === '' ? null : t;
}

const PLACEHOLDER_RE = /^[([<]?\s*(empty|none|blank|n\/a|na|tbd|null|nil|-+|[\u2013\u2014])\s*[)\]>]?$/i;

// Spec writers sometimes put a placeholder such as "(empty)" where the template says to leave the value blank.
function asValue(v) {
  const t = asNonEmpty(v);
  return t === null || PLACEHOLDER_RE.test(t) ? null : t;
}

function asList(v) {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  if (typeof v === 'string') return v.split(',').map((x) => x.trim()).filter(Boolean);
  return [];
}

function plural(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

function computeWarnings(spec, flags) {
  const list = [];
  const add = (code, level, message) => list.push({ code, level, message });
  const { status, tasks } = spec;

  if (spec.openQuestionCount > 0) add('open-questions', 'warn', plural(spec.openQuestionCount, 'open question'));
  const halfApplied = spec.format === 'frontmatter' && status === 'draft' && Boolean(spec.approvedBy || spec.approvedAt);
  if (halfApplied) {
    // /sdd writes status, approved_by and approved_at together, so a draft that carries approval data
    // was edited by hand or only partly applied.
    add('awaiting-approval', 'warn', 'Approval recorded but status is still draft');
  } else if (spec.format === 'frontmatter' && status === 'draft' && !spec.approvedBy) {
    // "Ready" needs real evidence: criteria were parsed and the traceability table exists and covers them.
    const ready = spec.openQuestionCount === 0
      && spec.uncovered.length === 0
      && (spec.acceptance.length > 0 || spec.mustNotChange.length > 0)
      && tasks.traceability.length > 0;
    add('awaiting-approval', ready ? 'info' : 'warn', ready ? `Draft: ready for approval (/sdd ${spec.id})` : 'Draft: not approved yet');
  }
  if (spec.format === 'frontmatter' && ['approved', 'in-progress', 'done'].includes(status) && !spec.approvedBy) {
    // Only /sdd sets "approved", so that status without an approver is a real inconsistency. ship-feature
    // starts specs as in-progress without one, which is expected and only worth a note.
    if (status === 'approved') add('approval-missing', 'warn', 'Status is approved but approved_by is empty');
    else add('approval-missing', 'info', 'Built without /sdd approval');
  }
  if (spec.format === 'frontmatter' && ['approved', 'in-progress', 'done'].includes(status) && spec.approvedBy && !spec.approvedAt) {
    add('approval-missing', 'info', 'approved_by is set but approved_at is empty');
  }
  if (flags.missingSpecLite) {
    add('missing-spec-lite', 'warn', 'No spec-lite.md: the spec text, status and approval cannot be checked');
  }
  if (flags.noFrontmatter) {
    add('no-frontmatter', 'warn', 'spec-lite.md has no frontmatter block: status is inferred from tasks and approval cannot be checked');
  }
  if (spec.errors.length > 0 || (spec.format === 'malformed' && !flags.missingSpecLite && !flags.noFrontmatter)) {
    add('parse-error', 'warn', `${plural(Math.max(spec.errors.length, 1), 'problem')} reading this spec`);
  }
  if (flags.acceptanceUnparsed) {
    add('ac-unparsed', status === 'draft' ? 'warn' : 'info',
      'Acceptance criteria has no AC-n ids, so traceability cannot be checked (write each as "- **AC-1**: ...")');
  }
  if (status === 'unknown') {
    add('unknown-status', 'warn', spec.rawStatus === null
      ? 'No status in frontmatter'
      : `Unknown status "${spec.rawStatus}" (expected draft, approved, in-progress, done)`);
  }
  if (!tasks.present) add('no-tasks', 'info', 'No tasks.md');
  if (spec.uncovered.length > 0) add('traceability-gap', 'info', `Not in the traceability table: ${spec.uncovered.join(', ')}`);
  if ((status === 'draft' || status === 'approved') && tasks.done > 0) {
    add('status-drift', 'warn', `Status is ${status} but ${tasks.done}/${tasks.total} tasks are checked`);
  } else if (status === 'done' && tasks.done < tasks.total) {
    add('status-drift', 'warn', `Status is done but only ${tasks.done}/${tasks.total} tasks are checked`);
  } else if (status === 'in-progress' && tasks.total > 0 && tasks.done === tasks.total) {
    add('status-drift', 'info', `Status is in-progress but all ${tasks.total} tasks are checked`);
  }
  if (spec.frontmatter && asNonEmpty(spec.frontmatter.id) !== null && asNonEmpty(spec.frontmatter.id) !== spec.folder) {
    add('id-mismatch', 'info', 'Frontmatter id differs from the folder name');
  }
  if (spec.session && spec.session.stale) add('stale-session', 'info', spec.session.staleNote);
  if (spec.format === 'legacy') {
    add('legacy', 'info', spec.statusSource === 'legacy-body'
      ? 'Legacy spec: no frontmatter; status read from the Status line'
      : 'Legacy spec: no frontmatter; status inferred from task progress');
  }

  const rank = (w) => (w.level === 'warn' ? 0 : 1) * 100 + WARNING_ORDER.indexOf(w.code);
  return list.sort((a, b) => rank(a) - rank(b));
}

function parseTime(value) {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : t;
}

// File modification times are reset by clone, checkout and pull, so recorded timestamps win when the
// spec has any; mtime is only the fallback and is labelled as such.
function activityTime(session, approvedAt, mtimes) {
  const recorded = [
    { at: parseTime(session && session.lastUpdated), source: 'session' },
    { at: parseTime(approvedAt), source: 'approved' },
  ].filter((c) => c.at !== null);
  if (recorded.length > 0) {
    const best = recorded.reduce((a, b) => (b.at > a.at ? b : a));
    return { updatedAt: new Date(best.at).toISOString(), updatedSource: best.source };
  }
  if (mtimes.length > 0) return { updatedAt: new Date(Math.max(...mtimes)).toISOString(), updatedSource: 'mtime' };
  return { updatedAt: null, updatedSource: null };
}

function charge(budget, text) {
  if (text.length > budget.remaining) {
    budget.exhausted = true;
    return false;
  }
  budget.remaining -= text.length;
  return true;
}

function finalizeSpec(spec) {
  spec.etag = hash12(spec);
  return spec;
}

function buildSpec(ctx) {
  const { root, folder, specReal, rootReal, sessions, maxFileBytes, problems, env } = ctx;
  const errors = [];
  const folderInfo = parseFolderName(folder);
  const mtimes = [];

  const specLite = readSpecFile(specReal, rootReal, 'spec-lite.md', maxFileBytes, errors);
  const tasksFile = readSpecFile(specReal, rootReal, 'tasks.md', maxFileBytes, errors);
  if (specLite) mtimes.push(specLite.mtimeMs);
  if (tasksFile) mtimes.push(tasksFile.mtimeMs);

  // "legacy" is reserved for the old numbered folders. A ticket or timestamp folder was created by the
  // current tooling, so a missing spec-lite.md or frontmatter there is a defect to report, not an old format.
  const modernFolder = folderInfo.pattern === 'ticket' || folderInfo.pattern === 'timestamp';
  const flags = { missingSpecLite: false, noFrontmatter: false, acceptanceUnparsed: false };
  let format = modernFolder ? 'malformed' : 'legacy';
  let data = null;
  let body = null;
  if (specLite) {
    const fm = parseFrontmatter(specLite.text);
    body = fm.body;
    if (fm.present && fm.data === null) {
      format = 'malformed';
      for (const e of fm.errors) errors.push(`spec-lite.md: ${e}`);
    } else if (fm.present) {
      format = 'frontmatter';
      data = fm.data;
      for (const e of fm.errors) errors.push(/^line \d+:/.test(e) ? `spec-lite.md ${e}` : `spec-lite.md: ${e}`);
    } else if (modernFolder) {
      flags.noFrontmatter = true;
    }
  } else if (modernFolder) {
    flags.missingSpecLite = true;
  }

  let tasks = emptyTasks();
  if (tasksFile) {
    const parsed = parseTasksDetailed(tasksFile.text);
    tasks = parsed.tasks;
    errors.push(...parsed.errors);
    if (tasks.total === 0) errors.push('tasks.md: no tasks found; expected lines like "- [ ] 1. Task title"');
  }
  const sections = analyzeSpecLite(body);

  // Embedded text counts against the board-wide budget. Over budget, the parsed metadata and task counts
  // stay but the long text is dropped: a spec body, or the subtask lists of tasks.md.
  const bodyOmitted = body !== null && !charge(env.budget, specLite.text);
  const tasksOmitted = tasksFile !== null && !charge(env.budget, tasksFile.text);

  const inferTitle = () => {
    if (sections.firstHeading) return cleanTitle(sections.firstHeading);
    if (tasksFile) {
      const h = firstHeadingOf(prepareMarkdown(tasksFile.text), false);
      if (h) return cleanTitle(h);
    }
    return folderInfo.title;
  };

  let id = folder;
  let title;
  let type = null;
  let size = null;
  let priority = null;
  let status;
  let statusSource = 'inferred';
  let rawStatus = null;
  let ticket = folderInfo.ticket;
  let stakeholders = [];
  let approvedBy = null;
  let approvedAt = null;
  let created = folderInfo.created;
  let stacks = [];

  if (format === 'frontmatter') {
    id = asNonEmpty(data.id) || folder;
    title = asNonEmpty(data.title) || inferTitle();
    type = asNonEmpty(data.type)?.toLowerCase() ?? null;
    size = asNonEmpty(data.size)?.toUpperCase() ?? null;
    priority = asNonEmpty(data.priority)?.toUpperCase() ?? null;
    ticket = asValue(data.ticket) || folderInfo.ticket || null;
    stakeholders = asList(data.stakeholders);
    stacks = asList(data.stacks).map((s) => s.toLowerCase());
    approvedBy = asValue(data.approved_by);
    approvedAt = asValue(data.approved_at);
    created = asNonEmpty(data.created) || folderInfo.created;
    rawStatus = asNonEmpty(data.status);
    if (rawStatus !== null) {
      status = normalizeStatus(rawStatus).status;
      statusSource = 'frontmatter';
    } else {
      status = inferStatusFromTasks(tasks);
    }
  } else {
    title = inferTitle();
    if (format === 'legacy') priority = legacyBodyPriority(body);
    const bodyStatus = format === 'legacy' ? legacyBodyStatus(body) : null;
    if (bodyStatus) {
      status = bodyStatus;
      statusSource = 'legacy-body';
    } else {
      status = inferStatusFromTasks(tasks);
    }
  }
  title = String(title).slice(0, MAX_TITLE);

  let uncovered = [];
  if (format !== 'legacy') {
    const traced = new Set(tasks.traceability.map((row) => row.id));
    uncovered = [...sections.acceptance, ...sections.mustNotChange, ...sections.nfrs].map((item) => item.id).filter((x) => !traced.has(x));
  }

  const sessionEntry = matchSession(sessions, { folder, id, folderInfo }, ctx);
  const session = sessionEntry ? extractSession(sessionEntry) : null;
  if (session) assessSession(session, sessionEntry.json, tasks, status);
  flags.acceptanceUnparsed = format === 'frontmatter' && sections.hasAcceptanceSection && sections.acceptance.length === 0;

  let fileEntries = collectFiles(specReal, rootReal);
  if (fileEntries.length > MAX_FILES_PER_SPEC) {
    problems.push(`${folder}: more than ${MAX_FILES_PER_SPEC} files; only the first ${MAX_FILES_PER_SPEC} are listed`);
    fileEntries = fileEntries.slice(0, MAX_FILES_PER_SPEC);
  }
  const files = fileEntries.map((entry) => {
    if (!entry.refused) mtimes.push(entry.stat.mtimeMs);
    const built = buildFileEntry(entry, maxFileBytes, env);
    if (entry.path === 'spec-lite.md' && bodyOmitted) built.note = BUDGET_NOTE;
    return built;
  });
  if (tasksOmitted) tasks.items.forEach((item) => { item.subtasks = []; });
  if (env.budget.exhausted && !env.budget.reported) {
    env.budget.reported = true;
    problems.push(`text beyond ${Math.round(env.budget.limit / 1048576)} MB is left out of the board; those files are listed without a preview`);
  }

  const openQuestionCount = sections.openQuestions.filter((q) => !q.checked).length;
  const spec = {
    key: `${root.repo}/${folder}`,
    id,
    folder,
    root: root.key,
    repo: root.repo,
    format,
    folderPattern: folderInfo.pattern,
    shortId: folderInfo.pattern === 'other' && ticket ? ticket : folderInfo.shortId,
    title,
    type,
    size,
    priority,
    status,
    statusSource,
    rawStatus,
    ticket,
    stakeholders,
    approvedBy,
    approvedAt,
    created,
    stacks,
    frontmatter: data,
    body: bodyOmitted ? null : body,
    tasks,
    acceptance: sections.acceptance,
    mustNotChange: sections.mustNotChange,
    nfrs: sections.nfrs,
    openQuestions: sections.openQuestions,
    openQuestionCount,
    uncovered,
    warnings: [],
    errors,
    session,
    files,
    ...activityTime(session, approvedAt, mtimes),
    etag: '',
  };
  spec.warnings = computeWarnings(spec, flags);
  delete spec.etag;
  return finalizeSpec(spec);
}

function fallbackSpec(root, folder, message) {
  const folderInfo = parseFolderName(folder);
  const spec = {
    key: `${root.repo}/${folder}`,
    id: folder,
    folder,
    root: root.key,
    repo: root.repo,
    format: 'malformed',
    folderPattern: folderInfo.pattern,
    shortId: folderInfo.shortId,
    title: folderInfo.title.slice(0, MAX_TITLE),
    type: null,
    size: null,
    priority: null,
    status: 'unknown',
    statusSource: 'inferred',
    rawStatus: null,
    ticket: folderInfo.ticket,
    stakeholders: [],
    approvedBy: null,
    approvedAt: null,
    created: folderInfo.created,
    stacks: [],
    frontmatter: null,
    body: null,
    tasks: emptyTasks(),
    acceptance: [],
    mustNotChange: [],
    nfrs: [],
    openQuestions: [],
    openQuestionCount: 0,
    uncovered: [],
    warnings: [{ code: 'parse-error', level: 'warn', message: '1 problem reading this spec' }],
    errors: [message],
    session: null,
    files: [],
    updatedAt: null,
    updatedSource: null,
  };
  return finalizeSpec(spec);
}

function sanitizeMessage(message, root, rootReal) {
  let out = String(message);
  for (const p of [rootReal, root.abs]) if (p) out = out.split(p).join(root.displayDir);
  return out;
}

function scanRoot(root, maxFileBytes, env) {
  const info = {
    key: root.key,
    repo: root.repo,
    displayDir: root.displayDir,
    status: 'ok',
    message: null,
    specCount: 0,
    ignored: [],
    problems: [],
  };
  const specs = [];
  const shown = root.shown ?? root.displayDir;

  let rootReal;
  try {
    rootReal = fs.realpathSync(root.abs);
    if (!fs.statSync(rootReal).isDirectory()) {
      info.status = 'not-a-directory';
      info.message = `Not a directory: ${shown}. ${MISSING_GUIDANCE}`;
      return { info, specs };
    }
  } catch (err) {
    if (err.code === 'ENOENT' || err.code === 'ENOTDIR') {
      info.status = 'missing';
      info.message = `Directory not found: ${shown}. ${MISSING_GUIDANCE}`;
    } else {
      info.status = 'error';
      info.message = `Cannot read ${shown} (${errorCode(err)}). Check the folder permissions.`;
    }
    return { info, specs };
  }

  // <repo>/.ai/specs may be a symlink (or sit below a symlinked .ai) pointing anywhere. A cloned
  // repo could use that to make the board read and embed files from outside it, so it is refused;
  // passing the real target folder explicitly is the opt-in.
  if (isAiSpecsPath(root.abs) && !isInside(realOrSelf(path.dirname(path.dirname(root.abs))), rootReal)) {
    info.status = 'error';
    info.message = `Refusing ${shown}: it resolves to a folder outside its repository. `
      + 'If that is intended, pass the real folder path instead.';
    return { info, specs };
  }

  let dirents;
  try {
    dirents = fs.readdirSync(rootReal, { withFileTypes: true });
  } catch (err) {
    info.status = 'error';
    info.message = `Cannot read ${shown} (${errorCode(err)}). Check the folder permissions.`;
    return { info, specs };
  }
  dirents.sort((a, b) => compareNatural(a.name, b.name));

  const sessions = readSessions(root, env);
  info.problems.push(...sessions.problems);

  const folders = [];
  for (const d of dirents) {
    const name = d.name;
    if (name.startsWith('.') || name.startsWith('_') || name === 'node_modules') continue;
    const abs = path.join(rootReal, name);
    let specReal = abs;
    if (d.isSymbolicLink()) {
      try {
        specReal = fs.realpathSync(abs);
      } catch {
        info.problems.push(`${name}: broken symlink; skipped`);
        continue;
      }
      if (!isInside(rootReal, specReal)) {
        info.problems.push(`${name}: symlink points outside the spec directory; skipped`);
        continue;
      }
      if (!isDirectory(specReal)) continue;
    } else if (!d.isDirectory()) {
      continue;
    }
    const has = (file) => {
      try {
        fs.lstatSync(path.join(specReal, file));
        return true;
      } catch {
        return false;
      }
    };
    if (root.only && !root.only.includes(name)) continue;
    if (has('spec-lite.md') || has('tasks.md')) {
      folders.push({ name, specReal });
    } else if (info.ignored.length < MAX_IGNORED) {
      info.ignored.push(name);
    }
  }

  if (folders.length > MAX_SPECS_PER_ROOT) {
    info.problems.push(`more than ${MAX_SPECS_PER_ROOT} spec folders; only the first ${MAX_SPECS_PER_ROOT} are shown`);
    folders.length = MAX_SPECS_PER_ROOT;
  }

  const numberCounts = new Map();
  for (const { name } of folders) {
    const f = parseFolderName(name);
    if (f.pattern !== 'numbered') continue;
    const n = String(parseInt(f.number, 10));
    numberCounts.set(n, (numberCounts.get(n) || 0) + 1);
  }

  for (const { name, specReal } of folders) {
    try {
      specs.push(buildSpec({
        root, folder: name, specReal, rootReal, sessions: sessions.entries, maxFileBytes, problems: info.problems,
        cwd: env.cwd, numberCounts, env,
      }));
    } catch (err) {
      specs.push(fallbackSpec(root, name, sanitizeMessage(err && err.message ? err.message : err, root, rootReal)));
    }
  }
  info.specCount = specs.length;
  return { info, specs };
}

// ---------------------------------------------------------------------------
// Backlog (product-brief's backlog.md)
// ---------------------------------------------------------------------------

const MAX_BACKLOG_BYTES = 262144;
const MAX_BACKLOG_SLICES = 500;
const MAX_BACKLOG_FIELD = 2000;
const BACKLOG_FILE = 'backlog.md';
const SLICE_HEADING_RE = /^(SL-\d+)\b\s*(?:[·:|–—-]+\s*)?([\s\S]*)$/i;
const SLICE_FIELD_RE = /^ {0,3}[-*+]\s+(?:\*\*|__)([A-Za-z][A-Za-z ]{0,30}?)\s*:?\s*(?:\*\*|__)\s*:?\s*([\s\S]*)$/;
const SLICE_STATUSES = new Set(['proposed', 'approved', 'specced', 'shipped']);
const SIZES = new Set(['XS', 'S', 'M', 'L', 'XL']);
const NONE_VALUE_RE = /^(?:none|n\/a|na|-+|[–—]|tbd)?$/i;

function fieldText(value) {
  const text = String(value ?? '').trim();
  return text.length > MAX_BACKLOG_FIELD ? text.slice(0, MAX_BACKLOG_FIELD) : text;
}

function noneOr(value) {
  const text = fieldText(value);
  return NONE_VALUE_RE.test(text) ? null : text;
}

function idList(value, re) {
  const text = noneOr(value);
  if (!text) return [];
  return [...new Set((text.match(re) || []).map((id) => id.toUpperCase()))];
}

function unwrapCode(value) {
  const text = fieldText(value);
  const m = /^(`+)([\s\S]*?)\1$/.exec(text);
  return m ? m[2].trim() : text;
}

/**
 * Parses the backlog.md that /product-brief writes: one `### SL-nn · Title` heading per slice
 * under `## Slices`, each followed by `- **Field:** value` lines. Unknown fields are kept out of
 * the result; a heading that is not a slice id ends the current slice.
 */
export function parseBacklog(markdown) {
  if (typeof markdown !== 'string') throw new TypeError('parseBacklog expects a string');
  const { lines, mask } = prepareMarkdown(markdown);
  const slices = [];
  const problems = [];
  const seen = new Set();
  // With a `## Slices` section, only slices inside it count; the intake log and notes below it stay out.
  const isSlicesHeading = (h) => h && h.level === 2 && /^slices\b/i.test(h.text);
  const scoped = lines.some((line, i) => !mask[i] && isSlicesHeading(matchHeading(line)));
  let inSlices = !scoped;
  let current = null;
  for (let i = 0; i < lines.length; i++) {
    if (mask[i]) continue;
    const heading = matchHeading(lines[i]);
    if (heading) {
      current = null;
      if (scoped && heading.level <= 2) inSlices = isSlicesHeading(heading);
      if (heading.level !== 3) continue;
      const m = SLICE_HEADING_RE.exec(heading.text);
      if (!m) continue;
      if (!inSlices) {
        problems.push(`${m[1].toUpperCase()} is outside ## Slices (line ${i + 1}); move it into that section to show it`);
        continue;
      }
      const id = m[1].toUpperCase();
      if (seen.has(id)) {
        problems.push(`${id} appears more than once (line ${i + 1}); only the first is shown`);
        continue;
      }
      if (slices.length >= MAX_BACKLOG_SLICES) {
        problems.push(`more than ${MAX_BACKLOG_SLICES} slices; only the first ${MAX_BACKLOG_SLICES} are shown`);
        break;
      }
      seen.add(id);
      current = { id, title: fieldText(m[2]) || id, line: i + 1, fields: new Map() };
      slices.push(current);
      continue;
    }
    if (!current) continue;
    const f = SLICE_FIELD_RE.exec(lines[i]);
    if (!f) continue;
    const key = f[1].trim().toLowerCase();
    if (!current.fields.has(key)) current.fields.set(key, f[2]);
  }
  return {
    slices: slices.map(({ id, title, line, fields }) => {
      const status = (noneOr(fields.get('status')) || '').toLowerCase();
      const size = (noneOr(fields.get('size')) || '').toUpperCase();
      if (status && !SLICE_STATUSES.has(status)) problems.push(`${id}: unknown status "${fieldText(fields.get('status'))}"`);
      return {
        id,
        title,
        line,
        outcome: noneOr(fields.get('outcome')),
        entryPoint: noneOr(fields.get('entry point')),
        size: SIZES.has(size) ? size : null,
        brs: idList(fields.get('brs') ?? fields.get('br') ?? fields.get('business rules'), /\bBR-\d+\b/gi),
        dependsOn: idList(fields.get('depends on'), /\bSL-\d+\b/gi),
        blockedBy: noneOr(fields.get('blocked by')),
        ticket: noneOr(fields.get('ticket')),
        status: status || null,
        spec: noneOr(fields.get('spec')),
        source: noneOr(fields.get('source')),
        run: noneOr(unwrapCode(fields.get('run'))),
      };
    }),
    problems,
  };
}

// A slice's Spec value hides it only when it names a spec folder: one on the board, or a value
// shaped like a folder name. Other values (greenfield-build's own name for an unfinished first
// slice, a report path) leave an unshipped slice in the Backlog column.
function namesSpecFolder(value, specs) {
  const name = String(value).trim().replace(/\/+$/, '').split('/').pop().toLowerCase();
  if (!name) return false;
  if (specs.some((s) => [s.id, s.folder, s.shortId].some((n) => n && String(n).toLowerCase() === name))) return true;
  return /^(?:spec-|\d)/.test(name) && !/\.md$/.test(name);
}

// Slices that already have a spec are on the board as specs; the BACKLOG column shows the rest.
function needsSpec(slice, specs) {
  if (slice.status === 'specced' || slice.status === 'shipped') return false;
  if (slice.spec && namesSpecFolder(slice.spec, specs)) return false;
  if (slice.ticket) {
    const ticket = slice.ticket.toLowerCase();
    if (specs.some((s) => (s.ticket && String(s.ticket).toLowerCase() === ticket) || (s.shortId && String(s.shortId).toLowerCase() === ticket))) {
      return false;
    }
  }
  return true;
}

// backlog.md sits next to product-brief.md: at the root of a single repo, or at the workspace
// root above api/ and web/. Only that one file name is read, never through a symlink.
function backlogCandidates(roots, cwd) {
  const out = [path.join(cwd, BACKLOG_FILE)];
  for (const root of roots) {
    if (!isAiSpecsPath(root.abs)) continue;
    const repo = path.dirname(path.dirname(root.abs));
    out.push(path.join(repo, BACKLOG_FILE));
    const workspace = path.dirname(repo);
    if (workspace !== repo && exists(path.join(workspace, 'product-brief.md'))) out.push(path.join(workspace, BACKLOG_FILE));
  }
  return out;
}

function readBacklogs(roots, specs, env) {
  const files = [];
  const items = [];
  const seen = new Set();
  for (const file of backlogCandidates(roots, env.cwd)) {
    let lst;
    try {
      lst = fs.lstatSync(file);
    } catch {
      continue;
    }
    const shown = displayPath(file, env.cwd);
    const key = `${lst.dev}:${lst.ino}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const info = { path: shown, sliceCount: 0, shownCount: 0, problems: [] };
    files.push(info);
    if (lst.isSymbolicLink()) {
      info.problems.push('is a symlink; skipped');
      continue;
    }
    if (!lst.isFile()) continue;
    let read;
    try {
      read = readBounded(file, lst, MAX_BACKLOG_BYTES);
    } catch (err) {
      info.problems.push(`cannot be read (${errorCode(err)})`);
      continue;
    }
    if (read.tooLarge) {
      info.problems.push(`larger than ${Math.round(MAX_BACKLOG_BYTES / 1024)} KB; skipped`);
      continue;
    }
    const parsed = parseBacklog(read.buf.toString('utf8'));
    info.problems.push(...parsed.problems);
    info.sliceCount = parsed.slices.length;
    for (const slice of parsed.slices) {
      if (!needsSpec(slice, specs)) continue;
      info.shownCount++;
      items.push({ key: `backlog:${files.length - 1}:${slice.id}`, file: shown, ...slice });
    }
  }
  return { files, items };
}

export function scanRoots(roots, options = {}) {
  if (!Array.isArray(roots)) throw new TypeError('scanRoots expects the array returned by resolveRoots()');
  const maxFileBytes = options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES;
  if (typeof maxFileBytes !== 'number' || !(maxFileBytes >= 0)) {
    throw new TypeError('scanRoots option maxFileBytes must be a non-negative number');
  }
  const maxTotalBytes = options.maxTotalBytes ?? DEFAULT_MAX_TOTAL_BYTES;
  if (typeof maxTotalBytes !== 'number' || !(maxTotalBytes >= 0)) {
    throw new TypeError('scanRoots option maxTotalBytes must be a non-negative number');
  }
  const env = {
    cwd: options.cwd ?? process.cwd(),
    roots,
    sessionDirs: new Map(),
    folderOwners: new Map(),
    usedCacheKeys: new Set(),
    budget: { limit: maxTotalBytes, remaining: maxTotalBytes, exhausted: false, reported: false },
  };
  const rootInfos = [];
  const specs = [];
  for (const root of roots) {
    if (!root || typeof root.abs !== 'string' || typeof root.key !== 'string') {
      throw new TypeError('scanRoots expects Root objects from resolveRoots()');
    }
    const result = scanRoot(root, maxFileBytes, env);
    rootInfos.push(result.info);
    specs.push(...result.specs);
  }
  for (const key of FILE_CACHE.keys()) if (!env.usedCacheKeys.has(key)) FILE_CACHE.delete(key);
  specs.sort((a, b) => compareNatural(a.repo, b.repo) || compareNatural(a.folder, b.folder));
  const byStatus = Object.fromEntries(STATUSES.map((s) => [s, 0]));
  for (const spec of specs) byStatus[spec.status]++;
  const backlog = options.backlog === false ? { files: [], items: [] } : readBacklogs(roots, specs, env);
  return {
    version: BOARD_VERSION,
    generatedAt: new Date().toISOString(),
    etag: hash12({ roots: rootInfos, specs, backlog }),
    roots: rootInfos,
    specs,
    backlog: backlog.items,
    backlogFiles: backlog.files,
    stats: { total: specs.length, byStatus, backlog: backlog.items.length },
  };
}

export function scanDirs(dirs, cwd, options) {
  return scanRoots(resolveRoots(dirs, cwd), { cwd, ...options });
}
