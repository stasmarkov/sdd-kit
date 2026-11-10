#!/usr/bin/env node
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { isInside, resolveRoots, scanRoots } from './lib/parse.mjs';
import { renderPage } from './lib/page.mjs';

const DEFAULT_PORT = 4477;
const DEFAULT_INTERVAL = 2000;
const MIN_INTERVAL = 250;
const MAX_INTERVAL = 3600000;
const DEFAULT_OUT = 'spec-board.html';
const HOST = '127.0.0.1';
const DEBOUNCE_MS = 200;
const HEARTBEAT_MS = 25000;
const MAX_SSE_CLIENTS = 20;
const MAX_SSE_BUFFER = 8 * 1024 * 1024;

const USAGE_HINT = 'Usage: spec-board.mjs [dirs...] [--serve [--port 4477] | --out [file] | --json]. Run with --help for details.';

const HELP = `Spec board: a Kanban view of the specs under .ai/specs.

Usage:
  node scripts/spec-board.mjs [dirs...] [--serve] [--port <n>] [--interval <ms>]
  node scripts/spec-board.mjs [dirs...] --out [file]
  node scripts/spec-board.mjs [dirs...] --json

Arguments:
  dirs              Spec directories (default ./.ai/specs). A repo root that
                    contains .ai/specs works too. Pass several for a polyrepo:
                    node scripts/spec-board.mjs api/.ai/specs web/.ai/specs

Modes (pick one; --serve is the default):
  --serve           Live board on http://127.0.0.1:<port>/ that refreshes when
                    spec files change. Ctrl+C to stop.
  --out [file]      Write one self-contained HTML file (default spec-board.html)
                    that works offline. Put dirs before --out.
  --json            Print the board data as JSON.

Options:
  --port <n>        Port for --serve, 0-65535 (default 4477; 0 = any free port).
                    The server only listens on 127.0.0.1.
  --interval <ms>   Re-scan interval for --serve (default 2000, minimum 250).
  --title <text>    Page title (default "Spec board").
  -h, --help        Show this help.

Exit codes: 0 success, 1 runtime failure, 2 usage error.
`;

export class UsageError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UsageError';
  }
}

function parseIntStrict(value, name, min, max) {
  if (!/^\d+$/.test(value)) {
    throw new UsageError(`Invalid ${name} "${value}": expected a whole number between ${min} and ${max}.`);
  }
  const n = Number(value);
  if (n < min || n > max) {
    throw new UsageError(`Invalid ${name} "${value}": expected a whole number between ${min} and ${max}.`);
  }
  return n;
}

export function parseArgs(argv) {
  if (!Array.isArray(argv)) throw new TypeError('parseArgs expects an array of strings');
  const result = {
    mode: 'serve',
    dirs: [],
    out: null,
    port: DEFAULT_PORT,
    interval: DEFAULT_INTERVAL,
    title: null,
  };
  const modes = new Set();
  let help = false;
  let optionsEnded = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = String(argv[i]);
    if (optionsEnded || !arg.startsWith('-') || arg === '-') {
      result.dirs.push(arg);
      continue;
    }
    if (arg === '--') {
      optionsEnded = true;
      continue;
    }

    const eq = arg.startsWith('--') ? arg.indexOf('=') : -1;
    const name = eq === -1 ? arg : arg.slice(0, eq);
    const inline = eq === -1 ? null : arg.slice(eq + 1);
    const takeValue = (label) => {
      if (inline !== null) {
        if (inline === '') throw new UsageError(`${name} needs ${label}.`);
        return inline;
      }
      const next = argv[i + 1];
      if (next === undefined || String(next).startsWith('-')) {
        throw new UsageError(`${name} needs ${label}.`);
      }
      i++;
      return String(next);
    };

    switch (name) {
      case '-h':
      case '--help':
        help = true;
        break;
      case '--serve':
        if (inline !== null) throw new UsageError('--serve does not take a value.');
        modes.add('serve');
        break;
      case '--json':
        if (inline !== null) throw new UsageError('--json does not take a value.');
        modes.add('json');
        break;
      case '--out': {
        modes.add('out');
        if (inline !== null) {
          if (inline === '') throw new UsageError('--out= needs a file name.');
          result.out = inline;
        } else {
          const next = argv[i + 1];
          if (next !== undefined && !String(next).startsWith('-')) {
            result.out = String(next);
            i++;
          }
        }
        break;
      }
      case '--port':
        result.port = parseIntStrict(takeValue('a port number'), 'port', 0, 65535);
        break;
      case '--interval':
        result.interval = parseIntStrict(takeValue('a number of milliseconds'), 'interval', MIN_INTERVAL, MAX_INTERVAL);
        break;
      case '--title': {
        const title = takeValue('a value').trim();
        if (!title) throw new UsageError('--title needs a value.');
        result.title = title;
        break;
      }
      default:
        throw new UsageError(`Unknown option ${name}. Run with --help.`);
    }
  }

  if (help) {
    result.mode = 'help';
    return result;
  }
  if (modes.size > 1) {
    throw new UsageError(`Use only one of --serve, --out, --json (got ${[...modes].map((m) => '--' + m).join(', ')}).`);
  }
  if (modes.size === 1) result.mode = [...modes][0];
  if (result.mode === 'out' && !result.out) result.out = DEFAULT_OUT;
  return result;
}

function defaultTitle(roots) {
  const repos = [...new Set(roots.map((r) => r.repo))];
  return repos.length > 1 ? `Spec board · ${repos.join(', ')}` : 'Spec board';
}

// Folder names, state file names and error text come from the scanned repo. Escaping control and
// bidi characters keeps them from injecting terminal escape sequences or forging output lines.
const UNSAFE_TEXT = /[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/g;

export function safeText(value) {
  return String(value).replace(UNSAFE_TEXT, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
}

function plural(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

function lookedFor(dir) {
  if (dir === '.' || dir === '..' || dir.startsWith('./') || dir.startsWith('../') || path.isAbsolute(dir)) return dir;
  return `./${dir}`;
}

function noSpecDirMessage(board) {
  const dirs = board.roots.map((r) => lookedFor(r.displayDir)).join(', ') || './.ai/specs';
  return `no spec directory found (looked for ${dirs}). Run from a repo root or pass paths, e.g. api/.ai/specs web/.ai/specs`;
}

function allRootsUnavailable(board) {
  return board.roots.length === 0 || board.roots.every((r) => r.status !== 'ok');
}

function reportBoard(board, warn) {
  for (const root of board.roots) {
    if (root.status !== 'ok') {
      warn(`warn: ${safeText(root.message || `${root.displayDir}: ${root.status}`)}`);
    }
    for (const problem of root.problems || []) {
      warn(`warn: ${safeText(root.displayDir)}: ${safeText(problem)}`);
    }
  }
  for (const spec of board.specs) {
    const parseError = (spec.warnings || []).find((w) => w.code === 'parse-error' && w.level === 'warn');
    if (parseError) {
      warn(`warn: ${safeText(spec.repo)}/${safeText(spec.folder)}: ${safeText((spec.errors && spec.errors[0]) || parseError.message)}`);
    }
  }
}

export function buildStatic(roots, { title } = {}) {
  const board = scanRoots(roots);
  const html = renderPage({ board, live: false, title: title || defaultTitle(roots) });
  return { html, board };
}

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-store',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Content-Security-Policy': "frame-ancestors 'none'",
};

function send(req, res, status, type, body, extra = {}) {
  const headers = { ...SECURITY_HEADERS, ...extra };
  if (type) headers['Content-Type'] = type;
  if (body !== null && body !== undefined) headers['Content-Length'] = Buffer.byteLength(body);
  res.writeHead(status, headers);
  res.end(req.method === 'HEAD' || body === null || body === undefined ? undefined : body);
}

function listen(server, port) {
  return new Promise((resolve, reject) => {
    const onError = (err) => {
      server.off('listening', onListening);
      reject(err);
    };
    const onListening = () => {
      server.off('error', onError);
      resolve();
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, HOST);
  });
}

function realOrNull(p) {
  try {
    return fs.realpathSync(p);
  } catch {
    return null;
  }
}

// Mirrors the parser's rules for reading session state: a regular directory (never a symlink) that
// stays inside its repo when it sits under .ai. Returns its real path, or null when it must not be watched.
function vettedSessionDir(dir) {
  let st;
  try {
    st = fs.lstatSync(dir);
  } catch {
    return null;
  }
  if (st.isSymbolicLink() || !st.isDirectory()) return null;
  const real = realOrNull(dir);
  if (!real) return null;
  if (path.basename(path.dirname(dir)) === '.ai') {
    const repoReal = realOrNull(path.dirname(path.dirname(dir)));
    if (!repoReal || !isInside(repoReal, real)) return null;
  }
  return real;
}

function boardEvent(board) {
  return `event: board\ndata: ${JSON.stringify(board)}\n\n`;
}

export async function startServer({
  roots,
  port = DEFAULT_PORT,
  interval = DEFAULT_INTERVAL,
  title,
  log = (m) => process.stderr.write(safeText(m) + '\n'),
} = {}) {
  if (!Array.isArray(roots)) throw new TypeError('startServer expects { roots: Root[] }');
  const pageTitle = title || defaultTitle(roots);
  let board = scanRoots(roots);
  let scanning = false;
  let scanFailing = false;
  let closed = false;
  let debounceTimer = null;
  let actualPort = port;
  const clients = new Set();
  const watchers = new Map();

  const allowedHosts = () => new Set([`127.0.0.1:${actualPort}`, `localhost:${actualPort}`]);

  // A page on another site can still reach 127.0.0.1 with a valid Host header; browsers label such
  // requests with Sec-Fetch-Site/Origin, which keeps them from holding the limited SSE slots.
  const isSameSiteRequest = (req) => {
    const site = req.headers['sec-fetch-site'];
    if (site !== undefined && site !== 'same-origin' && site !== 'none') return false;
    const origin = req.headers.origin;
    if (origin !== undefined) {
      const allowed = new Set([`http://127.0.0.1:${actualPort}`, `http://localhost:${actualPort}`]);
      if (!allowed.has(String(origin).toLowerCase())) return false;
    }
    return true;
  };

  const broadcast = () => {
    const message = boardEvent(board);
    for (const res of clients) {
      if (res.writableLength > MAX_SSE_BUFFER) {
        clients.delete(res);
        res.destroy();
        continue;
      }
      res.write(message);
    }
  };

  // Only directories the scan accepted are watched. The parser refuses an .ai/specs or .ai/session
  // that resolves outside its repo, so watching it would follow the link out of the repo.
  const watchDirs = () => {
    const dirs = [];
    for (const root of roots) {
      const info = board.roots.find((r) => r.key === root.key);
      if (!info || info.status !== 'ok') continue;
      const specsReal = realOrNull(root.abs);
      if (specsReal) dirs.push(specsReal);
      const sessionReal = vettedSessionDir(path.join(path.dirname(root.abs), 'session'));
      if (sessionReal) dirs.push(sessionReal);
    }
    return [...new Set(dirs)];
  };

  const ensureWatchers = () => {
    if (closed) return;
    const wanted = new Set(watchDirs());
    for (const [dir, watcher] of watchers) {
      if (wanted.has(dir)) continue;
      try {
        watcher.close();
      } catch {
        // already closed
      }
      watchers.delete(dir);
    }
    for (const dir of wanted) {
      if (watchers.has(dir)) continue;
      let stat;
      try {
        stat = fs.statSync(dir);
      } catch {
        continue;
      }
      if (!stat.isDirectory()) continue;
      let watcher = null;
      try {
        watcher = fs.watch(dir, { recursive: true, persistent: false }, scheduleRescan);
      } catch (err) {
        if (err && err.code === 'ERR_FEATURE_UNAVAILABLE_ON_PLATFORM') {
          try {
            watcher = fs.watch(dir, { persistent: false }, scheduleRescan);
          } catch {
            watcher = null;
          }
        }
      }
      if (!watcher) continue;
      // A watched directory that disappears errors out; dropping it lets a later re-scan re-attach once it exists again.
      watcher.on('error', () => {
        try {
          watcher.close();
        } catch {
          // already closed
        }
        if (watchers.get(dir) === watcher) watchers.delete(dir);
      });
      watchers.set(dir, watcher);
    }
  };

  const rescan = () => {
    if (closed || scanning) return;
    scanning = true;
    try {
      const next = scanRoots(roots);
      scanFailing = false;
      if (next.etag !== board.etag) {
        board = next;
        broadcast();
      }
    } catch (err) {
      if (!scanFailing) {
        log(`warn: re-scan failed, keeping the previous board: ${err && err.message ? err.message : err}`);
        scanFailing = true;
      }
    } finally {
      scanning = false;
    }
    ensureWatchers();
  };

  function scheduleRescan() {
    if (closed) return;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      rescan();
    }, DEBOUNCE_MS);
    debounceTimer.unref();
  }

  const handleEvents = (req, res) => {
    if (req.method === 'HEAD') {
      res.writeHead(200, { ...SECURITY_HEADERS, 'Content-Type': 'text/event-stream; charset=utf-8' });
      res.end();
      return;
    }
    if (clients.size >= MAX_SSE_CLIENTS) {
      send(req, res, 503, 'text/plain; charset=utf-8', 'Too many open boards; close a tab and reload.\n', { 'Retry-After': '10' });
      return;
    }
    req.socket.setTimeout(0);
    req.socket.setNoDelay(true);
    res.writeHead(200, {
      ...SECURITY_HEADERS,
      'Content-Type': 'text/event-stream; charset=utf-8',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write('retry: 2000\n\n');
    res.write(boardEvent(board));
    clients.add(res);
    const drop = () => clients.delete(res);
    req.on('close', drop);
    res.on('close', drop);
    res.on('error', drop);
  };

  const handle = (req, res) => {
    const host = String(req.headers.host || '').toLowerCase();
    if (!allowedHosts().has(host)) {
      send(req, res, 403, 'text/plain; charset=utf-8', 'Forbidden host\n');
      return;
    }
    if (!isSameSiteRequest(req)) {
      send(req, res, 403, 'text/plain; charset=utf-8', 'Forbidden cross-site request\n');
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      send(req, res, 405, 'text/plain; charset=utf-8', 'Method not allowed\n', { Allow: 'GET, HEAD' });
      return;
    }
    const raw = req.url || '';
    let pathname = null;
    if (raw.startsWith('/') && !raw.startsWith('//')) {
      try {
        pathname = new URL(raw, `http://${HOST}`).pathname;
      } catch {
        pathname = null;
      }
    }
    switch (pathname) {
      case '/':
        send(req, res, 200, 'text/html; charset=utf-8', renderPage({ board, live: true, title: pageTitle }));
        return;
      case '/api/board':
        send(req, res, 200, 'application/json; charset=utf-8', JSON.stringify(board));
        return;
      case '/api/events':
        handleEvents(req, res);
        return;
      case '/favicon.ico':
        send(req, res, 204, null, null);
        return;
      default:
        send(req, res, 404, 'text/plain; charset=utf-8', 'Not found\n');
    }
  };

  const server = http.createServer((req, res) => {
    try {
      handle(req, res);
    } catch (err) {
      log(`warn: request failed: ${err && err.message ? err.message : err}`);
      if (!res.headersSent) send(req, res, 500, 'text/plain; charset=utf-8', 'Internal error\n');
      else res.destroy();
    }
  });

  await listen(server, port);
  actualPort = server.address().port;

  ensureWatchers();
  const pollTimer = setInterval(rescan, interval);
  pollTimer.unref();
  const heartbeat = setInterval(() => {
    for (const res of clients) res.write(': ping\n\n');
  }, HEARTBEAT_MS);
  heartbeat.unref();

  let closing = null;
  const close = () => {
    if (closing) return closing;
    closed = true;
    clearInterval(pollTimer);
    clearInterval(heartbeat);
    if (debounceTimer) clearTimeout(debounceTimer);
    for (const watcher of watchers.values()) {
      try {
        watcher.close();
      } catch {
        // already closed
      }
    }
    watchers.clear();
    for (const res of clients) res.end();
    clients.clear();
    closing = new Promise((resolve) => {
      server.close(() => resolve());
      if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
    });
    return closing;
  };

  return {
    server,
    url: `http://${HOST}:${actualPort}/`,
    port: actualPort,
    close,
    getBoard: () => board,
  };
}

// Creates the temp file exclusively and never through a symlink, so a planted path cannot redirect the write.
// The snapshot embeds every spec, so it is private to the current user.
function writeAtomic(file, content) {
  const tmp = `${file}.tmp-${crypto.randomBytes(6).toString('hex')}`;
  const flags = fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY | (fs.constants.O_NOFOLLOW || 0);
  try {
    const fd = fs.openSync(tmp, flags, 0o600);
    try {
      fs.writeFileSync(fd, content);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(tmp, file);
  } catch (err) {
    try {
      fs.unlinkSync(tmp);
    } catch {
      // nothing to clean up
    }
    throw err;
  }
}

// Real path of a file that may not exist yet: resolves the nearest existing ancestor and re-appends the rest.
function realpathLoose(target) {
  const rest = [];
  let current = path.resolve(target);
  for (;;) {
    try {
      return path.join(fs.realpathSync(current), ...rest.reverse());
    } catch {
      const parent = path.dirname(current);
      if (parent === current) return path.resolve(target);
      rest.push(path.basename(current));
      current = parent;
    }
  }
}

// Returns a refusal message when writing the snapshot to `target` could destroy spec data, else null.
function outTargetProblem(target, roots) {
  const real = realpathLoose(target);
  for (const root of roots) {
    const protectedDirs = [root.abs, path.join(path.dirname(root.abs), 'session')];
    for (const dir of protectedDirs) {
      if (isInside(realpathLoose(dir), real)) {
        return 'refusing to write inside a spec directory; use --out spec-board.html or another path outside .ai/specs and .ai/session';
      }
    }
  }
  let existing = null;
  try {
    existing = fs.statSync(real);
  } catch {
    existing = null;
  }
  if (existing && !existing.isDirectory() && !/\.html?$/i.test(real)) {
    return `refusing to overwrite ${path.basename(real)}: only a new file or an existing .html file can be replaced; use --out spec-board.html`;
  }
  return null;
}

function runOut(options, roots, io) {
  const target = path.resolve(process.cwd(), options.out);
  const refusal = outTargetProblem(target, roots);
  if (refusal) {
    io.err(`error: ${refusal}`);
    return 2;
  }
  const { html, board } = buildStatic(roots, { title: options.title });
  reportBoard(board, io.err);
  if (allRootsUnavailable(board)) {
    io.err(`error: ${noSpecDirMessage(board)}`);
    return 1;
  }
  let dirOk = false;
  try {
    dirOk = fs.statSync(path.dirname(target)).isDirectory();
  } catch {
    dirOk = false;
  }
  if (!dirOk) {
    io.err(`error: cannot write ${options.out}: directory does not exist`);
    return 1;
  }
  try {
    writeAtomic(target, html);
  } catch (err) {
    io.err(`error: cannot write ${options.out}: ${err && err.code === 'EISDIR' ? 'it is a directory' : (err && err.message) || err}`);
    return 1;
  }
  const repos = board.roots.filter((r) => r.status === 'ok').length;
  const kb = Math.max(1, Math.round(Buffer.byteLength(html) / 1024));
  const slices = board.backlog && board.backlog.length ? ` and ${plural(board.backlog.length, 'backlog slice')}` : '';
  io.text(`Wrote ${options.out} - ${plural(board.specs.length, 'spec')}${slices} from ${plural(repos, 'repo')} (${kb} KB). Open it in a browser; it works offline.`);
  return 0;
}

function runJson(options, roots, io) {
  const board = scanRoots(roots);
  reportBoard(board, io.err);
  io.out(JSON.stringify(board, null, 2));
  if (allRootsUnavailable(board)) {
    io.err(`error: ${noSpecDirMessage(board)}`);
    return 1;
  }
  return 0;
}

async function runServe(options, roots, io) {
  let handle;
  try {
    handle = await startServer({
      roots,
      port: options.port,
      interval: options.interval,
      title: options.title,
      log: io.err,
    });
  } catch (err) {
    if (err && err.code === 'EADDRINUSE') {
      const next = options.port === 65535 ? 4478 : options.port + 1;
      io.err(`error: port ${options.port} is in use. Try --port ${next}, or --port 0 for any free port.`);
      return 1;
    }
    if (err && err.code === 'EACCES') {
      io.err(`error: cannot listen on port ${options.port}: permission denied. Try a port above 1024, or --port 0.`);
      return 1;
    }
    throw err;
  }

  const board = handle.getBoard();
  const watching = roots.map((r) => r.displayDir).join(', ') || './.ai/specs';
  // Printed before any warning so the URL is always the first line a caller reads.
  io.text(`Spec board: ${handle.url}  (watching ${watching}; Ctrl+C to stop)`);
  reportBoard(board, io.err);
  if (allRootsUnavailable(board)) {
    io.err(`warn: ${noSpecDirMessage(board)}. The board will update once the folder exists.`);
  }

  return new Promise((resolve) => {
    const stop = () => {
      process.off('SIGINT', stop);
      process.off('SIGTERM', stop);
      process.once('SIGINT', () => process.exit(130));
      handle.close().then(() => resolve(0), () => resolve(0));
    };
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
  });
}

export async function main(argv = process.argv.slice(2)) {
  const io = {
    out: (m) => process.stdout.write(m + '\n'),
    text: (m) => process.stdout.write(safeText(m) + '\n'),
    err: (m) => process.stderr.write(safeText(m) + '\n'),
  };
  let options;
  try {
    options = parseArgs(argv);
  } catch (err) {
    if (err instanceof UsageError) {
      io.err(`error: ${err.message}`);
      io.err(USAGE_HINT);
      return 2;
    }
    throw err;
  }
  if (options.mode === 'help') {
    process.stdout.write(HELP);
    return 0;
  }

  const roots = resolveRoots(options.dirs, process.cwd());
  try {
    if (options.mode === 'out') return runOut(options, roots, io);
    if (options.mode === 'json') return runJson(options, roots, io);
    return await runServe(options, roots, io);
  } catch (err) {
    io.err(`error: ${err && err.message ? err.message : err}`);
    return 1;
  }
}

function isDirectRun() {
  if (!process.argv[1]) return false;
  try {
    return pathToFileURL(fs.realpathSync(process.argv[1])).href === import.meta.url;
  } catch {
    return false;
  }
}

if (isDirectRun()) {
  process.stdout.on('error', (err) => {
    if (err && err.code === 'EPIPE') process.exit(process.exitCode || 0);
  });
  main().then(
    (code) => {
      process.exitCode = code;
    },
    (err) => {
      process.stderr.write(`error: ${safeText(err && err.message ? err.message : err)}\n`);
      process.exitCode = 1;
    },
  );
}
