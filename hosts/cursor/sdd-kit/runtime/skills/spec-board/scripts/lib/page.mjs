import { createHash } from 'node:crypto';

/**
 * Escapes a value for use in HTML text and attribute values.
 * null and undefined become an empty string.
 */
export function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Serializes a value for a <script type="application/json"> block. Escaping
 * < > & and the JS line separators keeps "</script" and "<!--" out of the
 * block while JSON.parse still restores the exact original strings.
 */
export function embedJson(value) {
  const json = JSON.stringify(value === undefined ? null : value);
  return json
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/**
 * Renders a safe subset of Markdown to HTML. Every piece of source text is
 * HTML-escaped before markup is added; raw HTML is shown as text, images are
 * never loaded, and only http(s), mailto, #anchor and relative links survive.
 *
 * The function is serialized into the page with toString(), so it must not
 * reference anything outside its own body.
 *
 * @param {string} md - Markdown source.
 * @param {{ files?: string[], inline?: boolean }} opts - files: sibling file
 *   paths that become in-app file links; inline: render a single line of
 *   inline markup without block elements.
 * @returns {string} HTML.
 */
export function renderMarkdown(md, opts = {}) {
  const options = opts && typeof opts === 'object' ? opts : {};
  const files = new Set((Array.isArray(options.files) ? options.files : []).map((f) => String(f)));
  const usedSlugs = new Map();
  const MAX_QUOTE_DEPTH = 5;
  const MAX_DEPTH = 40;
  const MAX_SOURCE = 200000;

  const FENCE = /^( {0,3})(`{3,}|~{3,})(.*)$/;
  const HEADING = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/;
  const HR = /^ {0,3}(?:(?:-[ \t]*){3,}|(?:\*[ \t]*){3,}|(?:_[ \t]*){3,})$/;
  const LIST_ITEM = /^( *)([-*+]|\d{1,9}[.)])(?:[ \t]+(.*)|[ \t]*$)/;
  const QUOTE = /^ {0,3}> ?(.*)$/;
  const TABLE_SEP = /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?\s*$/;

  function esc(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function expandIndent(line) {
    return line.replace(/^[ \t]+/, (ws) => ws.replace(/\t/g, '    '));
  }

  function indentOf(line) {
    return line.length - line.replace(/^ +/, '').length;
  }

  function slugify(text) {
    const plain = text.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1').toLowerCase();
    const base = plain.replace(/[^a-z0-9 -]/g, '').trim().replace(/ /g, '-') || 'section';
    const seen = usedSlugs.get(base) || 0;
    usedSlugs.set(base, seen + 1);
    return seen === 0 ? base : `${base}-${seen + 1}`;
  }

  function codePoint(n) {
    return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '';
  }

  function decodeEntities(value) {
    const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", colon: ':', tab: '\t', newline: '\n', nbsp: ' ', sol: '/', lpar: '(', rpar: ')', period: '.', num: '#' };
    let out = value;
    for (let pass = 0; pass < 3; pass += 1) {
      const next = out
        .replace(/&#x([0-9a-f]+);?/gi, (m, hex) => codePoint(parseInt(hex, 16)))
        .replace(/&#(\d+);?/g, (m, dec) => codePoint(parseInt(dec, 10)))
        .replace(/&([a-z]+);/gi, (m, name) => (Object.prototype.hasOwnProperty.call(named, name.toLowerCase()) ? named[name.toLowerCase()] : m));
      if (next === out) break;
      out = next;
    }
    return out;
  }

  function unescapeMarkdown(value) {
    return value.replace(/\\([!-/:-@[-`{-~])/g, '$1');
  }

  // Classifies a link target. Anything that is not clearly http(s), mailto,
  // an in-page anchor or a relative path is rejected and rendered as text.
  function classifyUrl(raw) {
    let url = raw.trim();
    if (url.startsWith('<') && url.endsWith('>')) url = url.slice(1, -1);
    url = unescapeMarkdown(url);
    const decoded = decodeEntities(url);
    const compact = decoded.replace(/[\u0000- \u007f-\u009f\s]/g, '').toLowerCase();
    if (!compact) return null;
    if (compact.startsWith('#')) return { kind: 'anchor', href: url.replace(/\s/g, ''), anchor: decoded.trim().slice(1) };
    const scheme = /^([a-z][a-z0-9+.-]*):/.exec(compact);
    if (scheme) {
      if (scheme[1] === 'http' || scheme[1] === 'https' || scheme[1] === 'mailto') {
        return { kind: 'external', href: url.replace(/[\u0000-\u001f\u007f]/g, '').replace(/ /g, '%20'), mail: scheme[1] === 'mailto' };
      }
      return null;
    }
    if (compact.startsWith('//') || compact.startsWith('\\\\') || compact.startsWith('/\\')) return null;
    return { kind: 'relative', path: decoded.trim() };
  }

  function fileRef(target) {
    if (!files.size) return null;
    let path = String(target).trim();
    while (path.startsWith('./')) path = path.slice(2);
    const hash = path.indexOf('#');
    const anchor = hash >= 0 ? path.slice(hash + 1) : '';
    if (hash >= 0) path = path.slice(0, hash);
    return path && files.has(path) ? { path, anchor } : null;
  }

  // Attribute values never carry a placeholder token: the token is swapped for
  // held HTML that contains its own quotes, which would end the attribute early.
  function attr(value) {
    return esc(String(value).replace(/\u0000/g, ''));
  }

  function fileLink(ref, innerHtml) {
    const anchor = ref.anchor ? ` data-anchor="${attr(ref.anchor.toLowerCase())}"` : '';
    return `<a href="#" class="file-link" data-file="${attr(ref.path)}"${anchor}>${innerHtml}</a>`;
  }

  // Wraps each marker pair in a tag using one left-to-right pass. A closer is
  // valid regardless of which opener it pairs with, so when an opener finds no
  // closer no later opener can either and the pass stops. Unclosed markers
  // therefore cost linear time instead of a rescan per opener.
  function wrapPairs(html, marker, tag, wordBound) {
    const len = marker.length;
    const isWord = (ch) => ch !== undefined && /\w/.test(ch);
    let out = '';
    let last = 0;
    let scan = 0;
    for (;;) {
      const open = html.indexOf(marker, scan);
      if (open === -1) break;
      const after = html[open + len];
      const opens = after !== undefined && !/\s/.test(after) && (!wordBound || open === 0 || !isWord(html[open - 1]));
      if (!opens) {
        scan = open + 1;
        continue;
      }
      let close = -1;
      let from = open + len + 1;
      for (;;) {
        const k = html.indexOf(marker, from);
        if (k === -1) break;
        if (!/\s/.test(html[k - 1]) && (!wordBound || !isWord(html[k + len]))) {
          close = k;
          break;
        }
        from = k + 1;
      }
      if (close === -1) break;
      out += `${html.slice(last, open)}<${tag}>${html.slice(open + len, close)}</${tag}>`;
      last = close + len;
      scan = last;
    }
    return out + html.slice(last);
  }

  function emphasis(html) {
    return wrapPairs(wrapPairs(wrapPairs(html, '~~', 'del', false), '**', 'strong', false), '__', 'strong', true)
      .replace(/\*(?=[^\s*])([^*]*?[^\s*])\*/g, '<em>$1</em>')
      .replace(/(^|[^\w])_(?=[^\s_])([^_]*?[^\s_])_(?!\w)/g, '$1<em>$2</em>');
  }

  // A code span closes at the next backtick run of the same length. Runs are
  // paired in one pass so unmatched runs of many lengths stay linear.
  function codeSpans(src, render) {
    const runs = [];
    const re = /`+/g;
    let m;
    while ((m = re.exec(src)) !== null) runs.push({ at: m.index, len: m[0].length });
    const next = new Array(runs.length).fill(-1);
    const latest = new Map();
    for (let i = runs.length - 1; i >= 0; i -= 1) {
      next[i] = latest.has(runs[i].len) ? latest.get(runs[i].len) : -1;
      latest.set(runs[i].len, i);
    }
    let out = '';
    let last = 0;
    for (let i = 0; i < runs.length; i += 1) {
      const j = next[i];
      if (j === -1) continue;
      out += src.slice(last, runs[i].at) + render(src.slice(runs[i].at + runs[i].len, runs[j].at));
      last = runs[j].at + runs[j].len;
      i = j;
    }
    return out + src.slice(last);
  }

  function inline(text) {
    const tokens = [];
    const hold = (html) => `\u0000${tokens.push(html) - 1}\u0000`;
    const plain = (raw) => emphasis(esc(raw.replace(/\\([\\`*_{}[\]()#+\-.!~|>])/g, (m, ch) => hold(esc(ch)))));
    let s = String(text).replace(/\u0000/g, '\uFFFD');

    s = codeSpans(s, (body) => {
      let code = body.replace(/\n/g, ' ');
      if (/^ [\s\S]* $/.test(code) && code.trim()) code = code.slice(1, -1);
      const ref = fileRef(code);
      const html = `<code>${esc(code)}</code>`;
      return hold(ref ? fileLink(ref, html) : html);
    });

    s = s.replace(/<(https?:\/\/[^\s<>]+)>/gi, (m, url) => {
      if (url.indexOf('\u0000') !== -1) return m;
      const target = classifyUrl(url);
      if (!target || target.kind !== 'external') return m;
      return hold(`<a href="${attr(target.href)}" target="_blank" rel="noopener noreferrer">${esc(url)}</a>`);
    });

    s = s.replace(
      /(!?)\[((?:[^[\]\\]|\\.)*)\]\(\s*(<[^<>\n]*>|(?:[^\s()\\]|\\.|\([^\s()]*\))*)(?:\s+(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\((?:[^()\\]|\\.)*\)))?\s*\)/g,
      (m, bang, label, url) => {
        const labelHtml = plain(label);
        if (bang) return hold(`<span class="img-alt" title="Image not loaded">${labelHtml || 'image'}</span>`);
        // A destination that contains a code span or autolink placeholder is shown as text.
        if (url.indexOf('\u0000') !== -1) return m;
        const target = classifyUrl(url);
        const shown = labelHtml || esc(url);
        if (!target) return hold(`<span class="ref ref-blocked" title="Link removed: unsupported address">${shown}</span>`);
        if (target.kind === 'external') {
          const extra = target.mail ? '' : ' target="_blank" rel="noopener noreferrer"';
          return hold(`<a href="${attr(target.href)}"${extra}>${shown}</a>`);
        }
        if (target.kind === 'anchor') {
          return hold(`<a href="${attr(target.href)}" data-anchor="${attr(target.anchor.toLowerCase())}">${shown}</a>`);
        }
        const ref = fileRef(target.path);
        if (ref) return hold(fileLink(ref, shown));
        return hold(`<span class="ref" title="${attr(target.path)}">${shown}</span>`);
      },
    );

    let html = plain(s);
    for (let pass = 0; pass < 6 && html.indexOf('\u0000') !== -1; pass += 1) {
      html = html.replace(/\u0000(\d+)\u0000/g, (m, n) => (tokens[Number(n)] !== undefined ? tokens[Number(n)] : ''));
    }
    return html.replace(/\u0000/g, '');
  }

  function paragraphHtml(lines) {
    const last = lines.length - 1;
    const joined = lines.map((l, i) => (i < last ? l.replace(/^\s+/, '') : l.trim())).join('\n');
    return inline(joined).replace(/(?: {2,}|\\)\n/g, '<br>\n');
  }

  function isFence(line) {
    const m = FENCE.exec(line);
    return Boolean(m) && !(m[2][0] === '`' && m[3].includes('`'));
  }

  function isTableStart(lines, i) {
    return i + 1 < lines.length && lines[i].includes('|') && lines[i + 1].includes('|') && lines[i + 1].includes('-') && TABLE_SEP.test(lines[i + 1]);
  }

  function startsBlock(lines, i) {
    const line = lines[i];
    return isFence(line) || HEADING.test(line) || HR.test(line) || QUOTE.test(line) || LIST_ITEM.test(line) || isTableStart(lines, i);
  }

  function splitRow(row) {
    let s = row.trim();
    if (s.startsWith('|')) s = s.slice(1);
    if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
    const cells = [];
    let cur = '';
    let inCode = false;
    for (let k = 0; k < s.length; k += 1) {
      const ch = s[k];
      if (ch === '\\' && s[k + 1] === '|') {
        cur += '|';
        k += 1;
        continue;
      }
      if (ch === '`') inCode = !inCode;
      if (ch === '|' && !inCode) {
        cells.push(cur.trim());
        cur = '';
        continue;
      }
      cur += ch;
    }
    cells.push(cur.trim());
    return cells;
  }

  function table(lines, start) {
    const header = splitRow(lines[start]);
    const aligns = splitRow(lines[start + 1]).map((c) => {
      const left = c.startsWith(':');
      const right = c.endsWith(':');
      if (left && right) return 'c';
      if (right) return 'r';
      return left ? 'l' : '';
    });
    const cls = (k) => (aligns[k] ? ` class="al-${aligns[k]}"` : '');
    let i = start + 2;
    const rows = [];
    while (i < lines.length && lines[i].trim() && lines[i].includes('|') && !isFence(lines[i])) {
      rows.push(splitRow(lines[i]));
      i += 1;
    }
    const head = header.map((c, k) => `<th${cls(k)}>${inline(c)}</th>`).join('');
    const body = rows
      .map((r) => `<tr>${header.map((_, k) => `<td${cls(k)}>${inline(r[k] || '')}</td>`).join('')}</tr>`)
      .join('');
    return { html: `<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`, next: i };
  }

  function listItem(body, depth, quoteDepth) {
    let text = body[0];
    let task = null;
    const t = /^\[([ xX])\](?:[ \t]+(.*)|[ \t]*$)/.exec(text);
    if (t) {
      task = t[1] !== ' ';
      text = t[2] || '';
    }
    const lead = [text];
    let k = 1;
    while (k < body.length && body[k].trim() && !startsBlock(body, k)) {
      lead.push(body[k]);
      k += 1;
    }
    let html = task === null ? '' : `<input type="checkbox" disabled${task ? ' checked' : ''}> `;
    html += paragraphHtml(lead);
    const rest = body.slice(k);
    if (rest.some((l) => l.trim())) html += blocks(rest, depth + 1, quoteDepth);
    return `<li${task === null ? '' : ' class="task"'}>${html}</li>`;
  }

  function list(lines, start, depth, quoteDepth) {
    const first = LIST_ITEM.exec(lines[start]);
    const baseIndent = first[1].length;
    const ordered = /\d/.test(first[2]);
    const startNum = ordered ? parseInt(first[2], 10) : 1;
    const items = [];
    let i = start;
    while (i < lines.length) {
      const m = LIST_ITEM.exec(lines[i]);
      if (!m) break;
      const indent = m[1].length;
      if (indent < baseIndent || indent > baseIndent + 1 || /\d/.test(m[2]) !== ordered) break;
      const contentIndent = indent + m[2].length + 1;
      const body = [m[3] || ''];
      i += 1;
      while (i < lines.length) {
        const line = lines[i];
        if (!line.trim()) {
          let j = i + 1;
          while (j < lines.length && !lines[j].trim()) j += 1;
          if (j < lines.length && indentOf(lines[j]) > indent) {
            while (i < j) {
              body.push('');
              i += 1;
            }
            continue;
          }
          break;
        }
        const ind = indentOf(line);
        if (ind <= indent) break;
        body.push(line.slice(Math.min(ind, contentIndent)));
        i += 1;
      }
      items.push(depth < MAX_DEPTH ? listItem(body, depth, quoteDepth) : `<li>${paragraphHtml(body.filter((l) => l.trim()))}</li>`);
      let j = i;
      while (j < lines.length && !lines[j].trim()) j += 1;
      if (j !== i && j < lines.length) {
        const n = LIST_ITEM.exec(lines[j]);
        if (n && n[1].length >= baseIndent && n[1].length <= baseIndent + 1 && /\d/.test(n[2]) === ordered) i = j;
      }
    }
    const tag = ordered ? 'ol' : 'ul';
    const startAttr = ordered && startNum !== 1 ? ` start="${startNum}"` : '';
    const cls = items.some((it) => it.startsWith('<li class="task"')) ? ' class="contains-task-list"' : '';
    return { html: `<${tag}${startAttr}${cls}>${items.join('')}</${tag}>`, next: i };
  }

  function blocks(lines, depth, quoteDepth) {
    const out = [];
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (!line.trim()) {
        i += 1;
        continue;
      }
      let m = FENCE.exec(line);
      if (m && isFence(line)) {
        const fenceIndent = m[1].length;
        const marker = m[2];
        const lang = (m[3].trim().split(/\s+/)[0] || '').toLowerCase().replace(/[^a-z0-9+#-]/g, '');
        const close = new RegExp(`^ {0,3}${marker[0] === '`' ? '`' : '~'}{${marker.length},}[ \\t]*$`);
        const body = [];
        i += 1;
        while (i < lines.length && !close.test(lines[i])) {
          body.push(lines[i].slice(Math.min(fenceIndent, indentOf(lines[i]))));
          i += 1;
        }
        i += 1;
        const cls = lang ? ` class="language-${esc(lang)}"` : '';
        out.push(`<pre><code${cls}>${esc(body.join('\n'))}</code></pre>`);
        continue;
      }
      m = HEADING.exec(line);
      if (m) {
        const level = Math.min(m[1].length + 1, 6);
        const text = (m[2] || '').trim();
        out.push(`<h${level} id="md-${esc(slugify(text))}">${inline(text)}</h${level}>`);
        i += 1;
        continue;
      }
      if (HR.test(line)) {
        out.push('<hr>');
        i += 1;
        continue;
      }
      if (QUOTE.test(line)) {
        const inner = [];
        while (i < lines.length && (m = QUOTE.exec(lines[i]))) {
          inner.push(m[1]);
          i += 1;
        }
        out.push(
          quoteDepth < MAX_QUOTE_DEPTH
            ? `<blockquote>${blocks(inner, depth + 1, quoteDepth + 1)}</blockquote>`
            : `<blockquote><p>${paragraphHtml(inner.filter((l) => l.trim()))}</p></blockquote>`,
        );
        continue;
      }
      if (isTableStart(lines, i)) {
        const t = table(lines, i);
        out.push(t.html);
        i = t.next;
        continue;
      }
      if (LIST_ITEM.test(line)) {
        const l = list(lines, i, depth, quoteDepth);
        out.push(l.html);
        i = l.next;
        continue;
      }
      const para = [line];
      i += 1;
      while (i < lines.length && lines[i].trim() && !startsBlock(lines, i)) {
        para.push(lines[i]);
        i += 1;
      }
      out.push(`<p>${paragraphHtml(para)}</p>`);
    }
    return out.join('\n');
  }

  let src = md === null || md === undefined ? '' : String(md);
  src = src
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .replace(/\x3c!--[\s\S]*?--\x3e/g, '');

  // Rendering is not free on adversarial or accidental input (a pasted log, a
  // minified blob), so only the first MAX_SOURCE characters are rendered.
  let truncated = false;
  if (src.length > MAX_SOURCE) {
    const cut = src.lastIndexOf('\n', MAX_SOURCE);
    src = src.slice(0, cut > 0 ? cut : MAX_SOURCE);
    truncated = true;
  }

  if (options.inline) return inline(src.replace(/\s*\n\s*/g, ' ').trim());
  const html = blocks(src.split('\n').map(expandIndent), 0, 0);
  return truncated
    ? `${html}\n<p class="md-truncated muted">Truncated: only the first 200 KB is shown. Open the file in your editor to read the rest.</p>`
    : html;
}

const STYLE = `
:root{color-scheme:light dark;
--bg:#f6f7f9;--surface:#fff;--surface-2:#eef0f3;--col:#f0f2f5;--border:#dfe3e8;--border-strong:#c3c9d1;--control-border:#8a919c;
--text:#16181d;--text-2:#3b414b;--muted:#59606c;--accent:#2954c8;--accent-soft:#e6ecfb;--focus:#2954c8;
--shadow:0 1px 2px rgba(16,24,40,.06);--shadow-lg:0 12px 40px rgba(16,24,40,.2);--scrim:rgba(15,17,21,.38);
--s-draft:#59606c;--s-draft-bg:#eceef1;--s-approved:#1d4fd8;--s-approved-bg:#e3ebfd;--s-progress:#9a5108;--s-progress-bg:#fdf0dc;
--s-done:#17733d;--s-done-bg:#dff3e6;--s-unknown:#b42318;--s-unknown-bg:#fde8e7;
--warn:#9c4309;--warn-bg:#fff2e8;--warn-border:#f1c29a;--danger:#b42318;--danger-bg:#fde8e7;
--mono:ui-monospace,SFMono-Regular,Menlo,monospace;--sans:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
@media (prefers-color-scheme:dark){:root{
--bg:#0f1115;--surface:#181b21;--surface-2:#22262d;--col:#14171c;--border:#2a2f37;--border-strong:#414854;--control-border:#6b7380;
--text:#e7e9ee;--text-2:#c5c9d1;--muted:#9da4af;--accent:#93b3ff;--accent-soft:#1c2a4a;--focus:#93b3ff;
--shadow:0 1px 2px rgba(0,0,0,.4);--shadow-lg:0 12px 40px rgba(0,0,0,.6);--scrim:rgba(0,0,0,.55);
--s-draft:#adb4bf;--s-draft-bg:#262b33;--s-approved:#93b3ff;--s-approved-bg:#1a2747;--s-progress:#f2b660;--s-progress-bg:#3a2a12;
--s-done:#72d69d;--s-done-bg:#13321f;--s-unknown:#ff8f86;--s-unknown-bg:#3d1715;
--warn:#f6b670;--warn-bg:#33220f;--warn-border:#6b4317;--danger:#ff8f86;--danger-bg:#3d1715}}
*,*::before,*::after{box-sizing:border-box}
[hidden]{display:none!important}
html{-webkit-text-size-adjust:100%}
html.drawer-open,html.drawer-open body{overflow:hidden}
body{margin:0;background:var(--bg);color:var(--text);font:14px/1.45 var(--sans)}
a{color:var(--accent)}
button,input,select{font:inherit;color:inherit}
:focus-visible{outline:2px solid var(--focus);outline-offset:2px}
.sr-only{position:absolute!important;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
.skip{position:absolute;left:8px;top:-48px;z-index:50;background:var(--surface);color:var(--text);padding:8px 12px;border-radius:6px;border:1px solid var(--border-strong)}
.skip:focus{top:8px}
.page{padding:14px 20px 40px;max-width:1800px;margin:0 auto}
.top{display:flex;flex-wrap:wrap;align-items:flex-start;justify-content:space-between;gap:8px 16px}
.top h1{font-size:18px;font-weight:650;margin:0;letter-spacing:-.01em}
.sub{display:flex;flex-wrap:wrap;gap:2px 16px;margin:2px 0 0;color:var(--muted);font-size:12.5px;overflow-wrap:anywhere}
.mode{display:inline-flex;align-items:center;gap:6px;margin:0;font-size:12px;color:var(--muted);border:1px solid var(--border);background:var(--surface);border-radius:999px;padding:2px 10px;min-height:24px}
.mode::before{content:"";width:7px;height:7px;border-radius:50%;background:var(--s-draft)}
.mode[data-state="live"]::before{background:var(--s-done)}
.mode[data-state="reconnecting"]::before{background:var(--s-progress)}
.issues{margin-top:8px;font-size:12.5px}
.issues summary{cursor:pointer;color:var(--warn);font-weight:550;min-height:24px;display:inline-flex;align-items:center}
.issues ul{margin:6px 0 0;padding-left:18px}
.issues li{margin:4px 0}
.issues .hint{display:block;color:var(--muted)}
.banner{display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;margin-top:10px;padding:8px 12px;border-radius:8px;background:var(--warn-bg);border:1px solid var(--warn-border)}
.banner p{margin:0;flex:1;min-width:200px}
.toolbar{display:flex;flex-wrap:wrap;align-items:flex-end;gap:8px 10px;padding:12px 0;margin-top:10px;border-bottom:1px solid var(--border)}
.field{display:flex;flex-direction:column;gap:2px;min-width:0}
.field label{font-size:11.5px;font-weight:550;color:var(--muted)}
.field input[type="search"],.field select{height:30px;border:1px solid var(--control-border);border-radius:6px;background:var(--surface);padding:0 8px;font-size:13px;max-width:100%}
.field input[type="search"]{width:clamp(180px,26vw,340px)}
.check{display:inline-flex;align-items:center;gap:6px;min-height:30px;font-size:13px;cursor:pointer}
.check input{width:16px;height:16px;margin:0}
.btn{display:inline-flex;align-items:center;justify-content:center;min-height:30px;padding:0 10px;border:1px solid var(--control-border);border-radius:6px;background:var(--surface);cursor:pointer;font-size:13px;white-space:nowrap}
.btn:hover{background:var(--surface-2)}
.f-toggle{display:none}
.f-panel{display:contents}
.f-sort{order:1}
.f-clear{order:2}
.count{order:3;margin:0 0 0 auto;align-self:center;color:var(--muted);font-size:12.5px}
.columns{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(200px,1fr);gap:12px;align-items:start;padding:14px 0 4px;overflow-x:auto}
.col{--c:var(--s-draft);--c-bg:var(--s-draft-bg);background:var(--col);border:1px solid var(--border);border-top:3px solid var(--c);border-radius:10px;padding:8px;min-width:0}
.col-approved{--c:var(--s-approved);--c-bg:var(--s-approved-bg)}
.col-in-progress{--c:var(--s-progress);--c-bg:var(--s-progress-bg)}
.col-done{--c:var(--s-done);--c-bg:var(--s-done-bg)}
.col-unknown{--c:var(--s-unknown);--c-bg:var(--s-unknown-bg);border:2px solid var(--s-unknown);border-top-width:3px}
.col-backlog{--c:var(--muted);--c-bg:var(--surface-2);border-style:dashed;border-top-style:solid}
.card.slice{border-style:dashed}
.run{display:block;margin-top:8px;padding:4px 6px;border-radius:4px;background:var(--surface-2);font-family:var(--mono);font-size:11px;line-height:1.4;color:var(--text-2);overflow-wrap:anywhere;-webkit-user-select:all;user-select:all}
.deps{margin-top:6px;font-size:11.5px;color:var(--muted)}
.col h2{display:flex;align-items:center;gap:7px;margin:2px 4px 8px;font-size:12.5px;font-weight:650;text-transform:uppercase;letter-spacing:.04em;color:var(--text-2)}
.dot{width:8px;height:8px;border-radius:50%;background:var(--c);flex:none}
.col h2 .n{font-weight:600;color:var(--muted);background:var(--surface);border:1px solid var(--border);border-radius:999px;padding:0 7px;font-size:11.5px;letter-spacing:0}
.cards{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:minmax(0,1fr);gap:8px}
.none{margin:0;padding:6px 4px 4px;color:var(--muted);font-size:12.5px}
.card{display:block;text-decoration:none;color:inherit;background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:9px 11px 10px;box-shadow:var(--shadow);transition:border-color .12s}
.card:hover{border-color:var(--border-strong)}
.board[data-stale] .card{border-style:dashed}
.card-top{display:flex;flex-wrap:wrap;align-items:center;gap:2px 6px;min-height:20px;font-size:12px}
.sid{font-family:var(--mono);font-size:11.5px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.card-title{margin:3px 0 7px;font-size:13.5px;font-weight:600;line-height:1.35;display:-webkit-box;-webkit-line-clamp:2;line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere}
.chips{display:flex;flex-wrap:wrap;gap:4px}
.chip{display:inline-flex;align-items:center;font-size:11.5px;line-height:18px;padding:0 6px;border:1px solid var(--border);border-radius:4px;background:var(--surface-2);color:var(--text-2);white-space:nowrap;min-width:0;max-width:100%;overflow:hidden;text-overflow:ellipsis}
.chip.repo{background:var(--accent-soft);color:var(--accent);border-color:transparent;font-weight:550}
.chip.legacy{border-style:dashed;color:var(--muted);background:transparent}
.chip.prio-hi{background:var(--danger-bg);color:var(--danger);border-color:transparent;font-weight:650}
.chip.mono,.chip.id{font-family:var(--mono);font-size:11px}
.prog{display:flex;flex-wrap:wrap;align-items:center;gap:2px 8px;margin-top:9px;font-size:11.5px;color:var(--muted)}
.prog span{white-space:nowrap}
.prog .upd{margin-left:auto}
.prog .upd.stale{color:var(--warn);font-weight:550}
progress{-webkit-appearance:none;appearance:none;flex:1;min-width:40px;height:6px;border:0;border-radius:3px;background:var(--surface-2);overflow:hidden;color:var(--c,var(--accent))}
progress::-webkit-progress-bar{background:var(--surface-2);border-radius:3px}
progress::-webkit-progress-value{background:var(--c,var(--accent));border-radius:3px}
progress::-moz-progress-bar{background:var(--c,var(--accent));border-radius:3px}
.badges{display:flex;flex-wrap:wrap;gap:4px;margin-top:8px}
.badge{display:inline-flex;align-items:center;font-size:11.5px;line-height:18px;padding:0 6px;border-radius:4px;background:var(--warn-bg);color:var(--warn);border:1px solid var(--warn-border);font-weight:550;white-space:nowrap}
.badge.note{background:var(--accent-soft);color:var(--accent);border-color:transparent}
.empty{max-width:640px;margin:36px auto;padding:28px 24px;text-align:center;background:var(--surface);border:1px dashed var(--border-strong);border-radius:10px}
.empty h2{margin:0 0 8px;font-size:16px}
.empty p{margin:0 0 10px;color:var(--text-2)}
.empty code{font-family:var(--mono);font-size:12.5px;background:var(--surface-2);padding:1px 5px;border-radius:4px;overflow-wrap:anywhere}
.pill{display:inline-flex;align-items:center;gap:5px;font-size:11.5px;font-weight:600;line-height:20px;padding:0 8px;border-radius:999px;background:var(--c-bg);color:var(--c)}
.pill::before{content:"";width:6px;height:6px;border-radius:50%;background:currentColor}
.st-draft{--c:var(--s-draft);--c-bg:var(--s-draft-bg)}
.st-approved{--c:var(--s-approved);--c-bg:var(--s-approved-bg)}
.st-in-progress{--c:var(--s-progress);--c-bg:var(--s-progress-bg)}
.st-done{--c:var(--s-done);--c-bg:var(--s-done-bg)}
.st-unknown{--c:var(--s-unknown);--c-bg:var(--s-unknown-bg)}
.backdrop{position:fixed;inset:0;background:var(--scrim);z-index:20}
.drawer{position:fixed;top:0;right:0;bottom:0;width:min(760px,100vw);z-index:21;display:flex;flex-direction:column;background:var(--surface);border-left:1px solid var(--border);box-shadow:var(--shadow-lg);animation:slide-in .18s ease-out}
@keyframes slide-in{from{transform:translateX(28px);opacity:.5}to{transform:none;opacity:1}}
.drawer-top{display:flex;align-items:flex-start;gap:12px;padding:16px 20px 12px}
.drawer-head{flex:1;min-width:0}
.dh-meta{display:flex;flex-wrap:wrap;align-items:center;gap:6px;font-size:12px}
.drawer-head h2{margin:6px 0 4px;font-size:18px;line-height:1.3;font-weight:650;overflow-wrap:anywhere}
.drawer-head h2:focus{outline:none}
.drawer-head h2:focus-visible{outline:2px solid var(--focus);outline-offset:2px}
.folder{margin:0;font-family:var(--mono);font-size:12px;color:var(--muted);-webkit-user-select:all;user-select:all;overflow-wrap:anywhere}
.tabs{display:flex;gap:2px;padding:0 14px;border-bottom:1px solid var(--border);overflow-x:auto}
.tab{background:none;border:0;border-bottom:2px solid transparent;padding:8px 10px;min-height:36px;font-size:13px;font-weight:550;color:var(--muted);cursor:pointer;white-space:nowrap}
.tab:hover{color:var(--text)}
.tab[aria-selected="true"]{color:var(--text);border-bottom-color:var(--accent)}
.tab .tn{margin-left:5px;font-size:11.5px;color:var(--muted);font-weight:500}
.drawer-panel{flex:1;overflow:auto;padding:16px 20px 48px;overscroll-behavior:contain}
.drawer-panel:focus-visible{outline-offset:-2px}
.sec+.sec{margin-top:22px}
.sec>h3,.phase{margin:0 0 8px;font-size:12px;font-weight:650;text-transform:uppercase;letter-spacing:.05em;color:var(--muted)}
.plain{list-style:none;margin:0;padding:0}
.warnings li{display:flex;gap:8px;align-items:baseline;padding:6px 10px;margin-bottom:6px;border-radius:6px;background:var(--warn-bg);border:1px solid var(--warn-border)}
.warnings li.lvl-info{background:var(--surface-2);border-color:var(--border)}
.lvl{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--warn);flex:none}
.lvl-info .lvl{color:var(--muted)}
.box{background:var(--accent-soft);border-radius:8px;padding:10px 12px}
.kv{display:grid;grid-template-columns:minmax(110px,150px) 1fr;gap:4px 12px;margin:0;font-size:13px}
.kv dt{color:var(--muted)}
.kv dd{margin:0;overflow-wrap:anywhere}
.details{width:100%;border-collapse:collapse;font-size:13px}
.details th{width:150px;text-align:left;font-weight:500;color:var(--muted);padding:5px 12px 5px 0;vertical-align:top;border-bottom:1px solid var(--border)}
.details td{padding:5px 0;border-bottom:1px solid var(--border);overflow-wrap:anywhere}
.errors li{color:var(--danger);font-family:var(--mono);font-size:12px;padding:2px 0}
.oq li{padding:4px 0}
.oq label{display:flex;gap:8px;align-items:flex-start}
.oq input,.task-row input,.subs input{margin:3px 0 0;width:15px;height:15px;flex:none}
input[type="checkbox"]:disabled{-webkit-appearance:none;appearance:none;position:relative;display:inline-block;width:15px;height:15px;flex:none;border:2px solid var(--control-border);border-radius:3px;background:var(--surface);opacity:1}
input[type="checkbox"]:disabled:checked{background:var(--s-done);border-color:var(--s-done)}
input[type="checkbox"]:disabled:checked::after{content:"";position:absolute;left:3px;top:-1px;width:4px;height:8px;border:solid var(--surface);border-width:0 2px 2px 0;transform:rotate(45deg)}
@media (forced-colors:active){input[type="checkbox"]:disabled:checked{background:Highlight;border-color:Highlight}input[type="checkbox"]:disabled:checked::after{border-color:HighlightText}}
.crit li{padding:9px 0;border-bottom:1px solid var(--border)}
.crit-head{display:flex;align-items:flex-start;gap:8px}
.crit-text{flex:1;min-width:0;overflow-wrap:anywhere}
.crit-meta{margin:4px 0 0;font-size:12px;color:var(--muted)}
.crit-meta span+span::before{content:" · "}
.summary-line{display:flex;align-items:center;gap:10px;margin:0 0 14px;font-size:13px;color:var(--text-2)}
.summary-line progress{max-width:220px}
.task-list{list-style:none;margin:0 0 16px;padding:0}
.task-list>li{padding:8px 0;border-bottom:1px solid var(--border)}
.task-row{display:flex;align-items:flex-start;gap:8px}
.task-title{flex:1;min-width:0;overflow-wrap:anywhere}
.t-num{font-family:var(--mono);font-size:12px;color:var(--muted);margin-right:2px}
.task-tags{display:flex;flex-wrap:wrap;gap:4px;margin:5px 0 0 23px}
.cover{min-height:24px;font-family:var(--mono);font-size:11px;padding:0 7px;border-radius:4px;border:1px solid var(--accent);background:var(--accent-soft);color:var(--accent);cursor:pointer}
.cover:hover{background:var(--surface)}
.cover-missing{border-style:dashed;border-color:var(--warn);background:var(--warn-bg);color:var(--warn)}
.subs{margin:6px 0 0 23px}
.subs summary{cursor:pointer;font-size:12px;color:var(--muted);min-height:24px;display:list-item}
.subs ul{list-style:none;margin:4px 0 0;padding:0}
.subs li{display:flex;gap:7px;align-items:flex-start;font-size:12.5px;padding:3px 0 3px 6px;border-left:2px solid transparent}
.subs li.is-verify{border-left-color:var(--accent)}
.table-wrap{overflow-x:auto;margin:0 0 12px}
.table-wrap table{width:100%;border-collapse:collapse;font-size:12.5px}
.table-wrap th,.table-wrap td{border:1px solid var(--border);padding:6px 8px;text-align:left;vertical-align:top;overflow-wrap:break-word}
.table-wrap td code{white-space:normal;overflow-wrap:anywhere;word-break:break-word}
.table-wrap td:first-child{white-space:nowrap}
.trace th:nth-child(1),.trace th:nth-child(4),.trace th:nth-child(5),.trace td:nth-child(4),.trace td:nth-child(5){white-space:nowrap}
.trace th:nth-child(2),.trace td:nth-child(2){min-width:12rem}
.trace th:nth-child(3),.trace td:nth-child(3){min-width:10rem}
.table-wrap th{background:var(--surface-2);font-weight:600}
.al-l{text-align:left!important}.al-c{text-align:center!important}.al-r{text-align:right!important}
.flash,.flash td{animation:flash 1.8s ease-out}
@keyframes flash{0%,30%{background:var(--accent-soft)}100%{background:transparent}}
.muted{color:var(--muted)}
.warn-text{color:var(--warn)}
.file-list{list-style:none;margin:0;padding:0;border-top:1px solid var(--border)}
.file-row{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;min-height:38px;padding:7px 10px;text-align:left;background:none;border:0;border-bottom:1px solid var(--border);cursor:pointer}
.file-row:hover{background:var(--surface-2)}
.file-row .path{font-family:var(--mono);font-size:12.5px;overflow-wrap:anywhere}
.file-row .fmeta{font-size:12px;color:var(--muted);white-space:nowrap}
.viewer-head{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin-bottom:12px}
.viewer-head h3{margin:0;font-family:var(--mono);font-size:13px;font-weight:600;overflow-wrap:anywhere}
.viewer-head h3:focus{outline:none}
pre.text{margin:0;padding:12px;background:var(--surface-2);border-radius:6px;overflow:auto;font:12.5px/1.5 var(--mono)}
.md{font-size:14px;line-height:1.6;overflow-wrap:anywhere}
.md>:first-child{margin-top:0}
.md h2,.md h3,.md h4,.md h5,.md h6{line-height:1.3;margin:1.3em 0 .5em;font-weight:650}
.md h2{font-size:17px;padding-bottom:4px;border-bottom:1px solid var(--border)}
.md h3{font-size:15px}.md h4{font-size:14px}.md h5{font-size:13px}.md h6{font-size:12.5px;color:var(--muted)}
.md p{margin:0 0 .8em}
.md ul,.md ol{margin:0 0 .8em;padding-left:1.5em}
.md li>ul,.md li>ol{margin:.2em 0}
.md li.task{list-style:none;margin-left:-1.3em}
.md li.task>input{margin:0 .45em 0 0;vertical-align:-2px}
.md code{font-family:var(--mono);font-size:.9em;background:var(--surface-2);padding:.1em .35em;border-radius:4px}
.md pre{margin:0 0 1em;padding:12px;background:var(--surface-2);border-radius:6px;overflow:auto}
.md pre code{background:none;padding:0;font-size:12.5px;line-height:1.5}
.md blockquote{margin:0 0 1em;padding:.1em 1em;border-left:3px solid var(--border-strong);color:var(--text-2)}
.md hr{border:0;border-top:1px solid var(--border);margin:1.2em 0}
.md del{color:var(--muted)}
.ref{border-bottom:1px dotted var(--muted);cursor:help}
.ref-blocked{color:var(--muted)}
.img-alt{color:var(--muted);font-style:italic}
@media (max-width:1100px){
.columns{grid-auto-flow:row;grid-auto-columns:auto;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));overflow-x:visible}
}
@media (max-width:640px){
.page{padding:12px 12px 32px}
.columns{grid-template-columns:minmax(0,1fr)}
.toolbar{gap:8px}
.field,.field input[type="search"],.field select{width:100%}
.f-search{flex:1 1 100%}
.f-sort{order:0;flex:1 1 0}
.f-toggle{display:inline-flex;flex:1 1 0}
.f-panel{display:none;order:0;flex:1 1 100%;grid-template-columns:1fr 1fr;gap:8px}
.f-panel.open{display:grid}
.f-panel .check,.f-panel .f-clear{grid-column:1/-1}
.f-clear{order:0}
.count{order:0;margin:0}
.col-empty{padding:4px 8px}
.col-empty h2{margin-bottom:2px}
.col-empty .none{display:none}
.drawer-top{padding:12px 14px 10px}
.drawer-panel{padding:14px 14px 40px}
.kv{grid-template-columns:1fr}
.details th{width:110px}
}
@media (min-width:900px) and (min-height:640px){.toolbar{position:sticky;top:0;z-index:10;background:var(--bg)}}
@media (prefers-reduced-motion:reduce){.drawer,.flash,.flash td{animation:none}.card{transition:none}}
@media print{
.toolbar,.drawer,.backdrop,.banner,.skip,.issues{display:none!important}
body{background:#fff;color:#000}
.columns{display:block}
.col{break-inside:avoid;margin-bottom:12px;border-color:#999}
.card{break-inside:avoid;box-shadow:none}
}
`;

/* Browser app. Serialized with toString(); receives the live-mode module
   (or null for snapshots) and uses the page-level renderMarkdown. */
function clientApp(startLive) {
  const STATUSES = [
    { id: 'draft', label: 'Draft' },
    { id: 'approved', label: 'Approved' },
    { id: 'in-progress', label: 'In progress' },
    { id: 'done', label: 'Done' },
    { id: 'unknown', label: 'Unknown' },
  ];
  const STATUS_LABEL = Object.fromEntries(STATUSES.map((s) => [s.id, s.label]));
  const STALE_DAYS = 14;
  const SIZE_ORDER = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const KNOWN_KEYS = ['id', 'title', 'type', 'size', 'priority', 'status', 'ticket', 'stakeholders', 'approved_by', 'approved_at', 'created', 'stacks'];
  const BADGE_LABELS = {
    'open-questions': (w, s) => `${s.openQuestionCount || ''} open Q${s.openQuestionCount === 1 ? '' : 's'}`.trim(),
    'awaiting-approval': (w) => (/ready for approval/i.test(w.message) ? 'Ready to approve' : 'Needs approval'),
    'approval-missing': () => 'No approver',
    'parse-error': () => 'Parse error',
    'unknown-status': () => 'Unknown status',
    'missing-spec-lite': () => 'No spec-lite.md',
    'no-frontmatter': () => 'No frontmatter',
    'ac-unparsed': () => 'No criteria found',
    'status-drift': (w) => (/^status is done/i.test(w.message) ? 'Done, tasks open' : 'Status behind tasks'),
  };
  const badgeLabel = (w, spec) => {
    if (BADGE_LABELS[w.code]) return BADGE_LABELS[w.code](w, spec);
    const words = str(w.code).replace(/-/g, ' ').trim();
    return words.charAt(0).toUpperCase() + words.slice(1);
  };
  const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const $ = (id) => document.getElementById(id);
  const els = {
    mode: $('mode'), roots: $('roots'), issues: $('issues'), banner: $('banner'), offline: $('offline'),
    toolbar: $('toolbar'), q: $('q'), type: $('f-type'), size: $('f-size'), status: $('f-status'),
    repo: $('f-repo'), repoField: $('f-repo-field'), stack: $('f-stack'), warn: $('f-warn'), hideDone: $('f-hide-done'), sort: $('f-sort'),
    clear: $('f-clear'), toggle: $('f-toggle'), filterPanel: $('f-panel'), count: $('count'), board: $('board'), backdrop: $('backdrop'), drawer: $('drawer'),
    drawerHead: $('drawer-head'), drawerClose: $('drawer-close'), tabs: $('drawer-tabs'), panel: $('drawer-panel'),
    announcer: $('announcer'),
  };

  const arr = (v) => (Array.isArray(v) ? v : []);
  const str = (v) => (v === null || v === undefined ? '' : String(v));
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const pad = (n) => String(n).padStart(2, '0');

  function readConfig() {
    try {
      const parsed = JSON.parse($('spec-board-data').textContent);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (e) {
      return {};
    }
  }

  function normalizeBoard(b) {
    const src = b && typeof b === 'object' ? b : {};
    return {
      ...src,
      etag: str(src.etag),
      roots: arr(src.roots).filter((r) => r && typeof r === 'object'),
      specs: arr(src.specs).filter((s) => s && typeof s === 'object' && s.key),
      backlog: arr(src.backlog).filter((b) => b && typeof b === 'object' && b.key),
      backlogFiles: arr(src.backlogFiles).filter((f) => f && typeof f === 'object'),
    };
  }

  const config = readConfig();
  let board = normalizeBoard(config.board);
  let lastUpdate = new Date();
  let dismissedIssues = null;

  const state = { q: '', type: '', size: '', status: '', repo: '', stack: '', warn: false, hideDone: false, sort: 'priority' };
  const ui = { open: false, key: null, missing: null, etag: null, tab: 'overview', file: null, returnKey: null, returnEl: null, pushed: false };

  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    if (props) {
      for (const [k, v] of Object.entries(props)) {
        if (v === null || v === undefined || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'text') el.textContent = v;
        else if (k === 'md') el.innerHTML = v;
        else el.setAttribute(k, v === true ? '' : String(v));
      }
    }
    for (const kid of kids.flat(Infinity)) {
      if (kid === null || kid === undefined || kid === false) continue;
      el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
    }
    return el;
  }

  function fmtDateTime(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return str(iso);
    return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function fmtTime(d) {
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

  function fmtBytes(n) {
    const b = Number(n) || 0;
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${Math.round(b / 1024)} KB`;
    return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  }

  function ts(v) {
    const t = Date.parse(str(v));
    return Number.isNaN(t) ? null : t;
  }

  function md(text, inline) {
    return renderMarkdown(str(text), { files: currentFiles, inline: Boolean(inline) });
  }
  let currentFiles = [];

  function statusOf(spec) {
    return STATUS_LABEL[spec.status] && spec.status !== 'unknown' ? spec.status : 'unknown';
  }

  function specLiteSkipped(spec) {
    return arr(spec.files).some((f) => f && f.path === 'spec-lite.md' && f.kind === 'skipped');
  }

  // 'Legacy' means the folder has no frontmatter; a spec-lite.md that exists
  // but was refused by the scanner is a different situation.
  function formatChip(spec) {
    if (spec.format === 'malformed') return 'Malformed frontmatter';
    if (spec.format !== 'legacy') return null;
    return specLiteSkipped(spec) ? 'spec-lite.md unreadable' : 'Legacy';
  }

  function sessionBadge(spec) {
    const session = spec.session && typeof spec.session === 'object' ? spec.session : null;
    if (!session) return null;
    const p = progress(spec);
    const finished = statusOf(spec) === 'done' || (p.total > 0 && p.done >= p.total);
    if (finished) return null;
    const current = session.currentTask;
    if (!Number.isFinite(current)) return h('span', { class: 'badge note', title: session.resumeHint ? str(session.resumeHint) : null }, 'Session saved');
    if (arr(session.completedTasks).includes(current)) return null;
    return h('span', { class: 'badge note', title: session.resumeHint ? str(session.resumeHint) : null }, `Resume at task ${current}`);
  }

  function warnList(spec) {
    return arr(spec.warnings).filter((w) => w && w.level === 'warn');
  }

  function isMultiRepo() {
    return new Set(board.roots.map((r) => r.repo)).size > 1;
  }

  let idCounts = { board: null, map: new Map() };
  function idCount(id) {
    if (idCounts.board !== board) {
      const map = new Map();
      for (const s of board.specs) map.set(s.id, (map.get(s.id) || 0) + 1);
      idCounts = { board, map };
    }
    return idCounts.map.get(id) || 0;
  }

  function hashFor(spec) {
    if (idCount(spec.id) > 1) {
      return `#spec/${encodeURIComponent(str(spec.repo))}/${encodeURIComponent(str(spec.folder))}`;
    }
    return `#spec/${encodeURIComponent(str(spec.id))}`;
  }

  // Returns every spec matched by the first lookup tier that hits, so the
  // caller can tell a unique match from an ambiguous id, ticket or short id.
  function matchSpecs(raw) {
    const specs = board.specs;
    const lower = raw.toLowerCase();
    const slash = raw.indexOf('/');
    const repo = slash > 0 ? raw.slice(0, slash) : null;
    const rest = slash > 0 ? raw.slice(slash + 1).toLowerCase() : '';
    const sameText = (v) => v !== null && v !== undefined && str(v).toLowerCase() === rest;
    const tiers = [
      (s) => s.key === raw,
      (s) => `${s.repo}/${s.id}` === raw,
      (s) => repo !== null && s.repo === repo && (sameText(s.id) || sameText(s.folder)),
      (s) => repo !== null && s.repo === repo && (sameText(s.ticket) || sameText(s.shortId)),
      (s) => s.id === raw,
      (s) => s.folder === raw,
      (s) => s.ticket && str(s.ticket).toLowerCase() === lower,
      (s) => s.shortId && str(s.shortId).toLowerCase() === lower,
    ];
    for (const test of tiers) {
      const hits = specs.filter(test);
      if (hits.length) return hits;
    }
    return [];
  }

  function resolveSpec(raw) {
    const hits = matchSpecs(raw);
    return hits.length === 1 ? hits[0] : null;
  }

  /* ---------- filtering and sorting ---------- */

  const searchCache = new Map();
  function haystack(spec) {
    const cached = searchCache.get(spec.key);
    if (cached && cached.etag === spec.etag && spec.etag) return cached.text;
    const tasks = spec.tasks && typeof spec.tasks === 'object' ? spec.tasks : {};
    const parts = [
      spec.id, spec.shortId, spec.ticket, spec.title, spec.repo, spec.type, spec.size, spec.priority, spec.approvedBy,
      ...arr(spec.stacks), ...arr(spec.stakeholders),
      ...arr(spec.acceptance).map((a) => `${str(a.id)} ${str(a.text)}`),
      ...arr(spec.mustNotChange).map((a) => `${str(a.id)} ${str(a.text)}`),
      ...arr(spec.nfrs).map((a) => `${str(a.id)} ${str(a.text)}`),
      ...arr(tasks.items).map((t) => str(t && t.title)),
    ];
    const text = parts.filter((p) => p !== null && p !== undefined).join('\n').toLowerCase();
    searchCache.set(spec.key, { etag: spec.etag, text });
    return text;
  }

  function filterSpecs() {
    const terms = state.q.toLowerCase().split(/\s+/).filter(Boolean);
    return board.specs.filter((s) =>
      (!state.type || s.type === state.type) &&
      (!state.size || s.size === state.size) &&
      (!state.status || statusOf(s) === state.status) &&
      (!state.repo || s.repo === state.repo) &&
      (!state.stack || arr(s.stacks).includes(state.stack)) &&
      (!state.warn || warnList(s).length > 0) &&
      (!state.hideDone || statusOf(s) !== 'done') &&
      terms.every((t) => haystack(s).includes(t)));
  }

  function byText(a, b) {
    return str(a).localeCompare(str(b), undefined, { numeric: true, sensitivity: 'base' });
  }

  function descNullLast(a, b) {
    if (a === null && b === null) return 0;
    if (a === null) return 1;
    if (b === null) return -1;
    return b - a;
  }

  function priorityRank(p) {
    const m = /^P([0-3])$/.exec(str(p));
    if (m) return Number(m[1]);
    return p ? 4 : 5;
  }

  // Ages in a snapshot are measured from when it was generated, so a shared file
  // reads the same later (or on a reader with a different clock) as it did then.
  function refNow() {
    if (config.live !== true) {
      const generated = ts(board.generatedAt);
      if (generated !== null) return generated;
    }
    return Date.now();
  }

  function idleDays(spec) {
    const t = ts(spec.updatedAt);
    return t === null ? null : Math.max(0, Math.floor((refNow() - t) / 86400000));
  }

  // Compact relative age such as "5m ago" or "3d ago"; empty when the date is unknown.
  function ago(iso) {
    const t = ts(iso);
    if (t === null) return '';
    // A few minutes of clock skew reads as "just now"; anything further ahead is
    // a mistyped approved_at or session timestamp and should look wrong.
    const now = refNow();
    if (t - now > 300000) return 'in the future';
    const sec = Math.max(0, (now - t) / 1000);
    if (sec < 60) return 'just now';
    const units = [['m', 60], ['h', 3600], ['d', 86400], ['w', 604800], ['mo', 2592000], ['y', 31536000]];
    let label = 'm';
    let size = 60;
    for (const [name, secs] of units) {
      if (sec >= secs) {
        label = name;
        size = secs;
      }
    }
    return `${Math.floor(sec / size)}${label} ago`;
  }

  function progress(spec) {
    const t = spec.tasks || {};
    return { done: Number(t.done) || 0, total: Number(t.total) || 0 };
  }

  function byRecent(a, b) {
    return descNullLast(ts(a.updatedAt), ts(b.updatedAt)) || byText(a.id, b.id);
  }

  function sortSpecs(list) {
    const tie = byRecent;
    const cmp = {
      priority: (a, b) => priorityRank(a.priority) - priorityRank(b.priority) || tie(a, b),
      updated: tie,
      created: (a, b) => descNullLast(ts(a.created), ts(b.created)) || tie(a, b),
      progress: (a, b) => {
        const pa = progress(a);
        const pb = progress(b);
        const ra = pa.total ? pa.done / pa.total : -1;
        const rb = pb.total ? pb.done / pb.total : -1;
        return rb - ra || pb.done - pa.done || tie(a, b);
      },
      title: (a, b) => byText(a.title, b.title) || byText(a.id, b.id),
      id: (a, b) => byText(a.shortId || a.id, b.shortId || b.id) || byText(a.repo, b.repo),
    }[state.sort] || tie;
    return list.slice().sort(cmp);
  }

  /* ---------- header, issues, toolbar ---------- */

  let lastMode = null;
  function setMode(kind) {
    // The pill is visual only; its timestamp changes on every refresh. Only
    // connection transitions are announced, through the throttled announcer.
    if (lastMode && lastMode !== kind && lastMode !== 'static') {
      announce(kind === 'live' ? 'Live updates restored' : 'Live updates interrupted, reconnecting');
    }
    lastMode = kind;
    els.mode.dataset.state = kind;
    if (kind === 'static') els.mode.textContent = `Snapshot · generated ${fmtDateTime(board.generatedAt)}`;
    else if (kind === 'live') els.mode.textContent = `Live · updated ${fmtTime(lastUpdate)}`;
    else els.mode.textContent = `Reconnecting… · data from ${fmtTime(lastUpdate)}`;
    trackOutage(kind === 'reconnecting');
  }

  // A quietly stale board is worse than an obvious one: after a short grace
  // period the outage gets a banner that says how to bring the server back.
  const OUTAGE_GRACE_MS = 10000;
  let outageSince = null;
  let outageTimer = null;

  function trackOutage(down) {
    if (!down) {
      clearTimeout(outageTimer);
      outageTimer = null;
      outageSince = null;
      els.offline.textContent = '';
      els.offline.hidden = true;
      els.board.removeAttribute('data-stale');
      return;
    }
    if (outageSince) return;
    outageSince = new Date();
    outageTimer = setTimeout(showOutage, OUTAGE_GRACE_MS);
  }

  function shellQuote(value) {
    return /^[\w@%+=:,./-]+$/.test(value) ? value : `'${value.replace(/'/g, `'\\''`)}'`;
  }

  function showOutage() {
    if (!outageSince) return;
    const dirs = board.roots.map((r) => shellQuote(str(r.displayDir))).join(' ');
    const port = location.port || '4477';
    const command = `node scripts/spec-board.mjs${dirs ? ` ${dirs}` : ''} --serve --port ${port}`;
    els.offline.replaceChildren(
      h('p', null, `Live server not reachable since ${pad(outageSince.getHours())}:${pad(outageSince.getMinutes())}; the data below may be out of date. Restart it with: `, h('code', null, command)));
    els.offline.hidden = false;
    els.board.setAttribute('data-stale', 'true');
  }

  function problemHint(text) {
    if (/invalid JSON/i.test(text)) return 'Fix or delete the session file; /execute-task writes a new one on its next run.';
    if (/symlink/i.test(text)) return 'Symlinks must point inside the spec directory.';
    if (/truncat|first \d+|max/i.test(text)) return 'Only the first entries are shown.';
    return null;
  }

  function issueItems() {
    const items = [];
    for (const r of board.roots) {
      if (r.status !== 'ok') {
        items.push({ text: r.message || `${str(r.displayDir)}: ${str(r.status)}`, hint: r.status === 'missing' ? 'Create a spec there with /sdd <ticket>, or pass the right path.' : null, blocking: true });
      }
      for (const p of arr(r.problems)) {
        // Only a spec folder that failed to load makes the board partial; session
        // files and truncation notes leave every spec visible.
        const blocking = /broken symlink|symlink points outside/i.test(str(p)) && !/^session/i.test(str(p));
        items.push({ text: `${str(r.displayDir)}: ${str(p)}`, hint: problemHint(str(p)), blocking });
      }
      const ignored = arr(r.ignored);
      if (ignored.length) {
        items.push({
          text: `${str(r.displayDir)}: ${plural(ignored.length, 'folder', 'folders')} without spec-lite.md or tasks.md ignored (${ignored.join(', ')})`,
          hint: 'Add a spec-lite.md or tasks.md to make it a spec, or prefix the folder name with _ to hide it.',
          blocking: false,
        });
      }
    }
    for (const f of board.backlogFiles) {
      for (const p of arr(f.problems)) {
        items.push({ text: `${str(f.path)}: ${str(p)}`, hint: 'The backlog is written by /product-brief; fix the slice in backlog.md.', blocking: false });
      }
    }
    return items;
  }

  function renderHeader() {
    els.roots.replaceChildren(...board.roots.map((r) => h('span', { class: 'root' },
      r.status === 'ok' ? `${str(r.displayDir)} · ${plural(Number(r.specCount) || 0, 'spec', 'specs')}` : `${str(r.displayDir)} · ${str(r.status)}`)));

    const items = issueItems();
    els.issues.textContent = '';
    els.issues.hidden = items.length === 0;
    if (items.length) {
      els.issues.append(
        h('summary', null, plural(items.length, 'issue', 'issues')),
        h('ul', null, items.map((it) => h('li', null, it.text, it.hint ? h('span', { class: 'hint' }, it.hint) : null))),
      );
    }

    const okCount = board.roots.filter((r) => r.status === 'ok').length;
    const blocking = items.filter((it) => it.blocking);
    const signature = blocking.map((it) => it.text).join('\n');
    els.banner.textContent = '';
    const showBanner = okCount > 0 && blocking.length > 0 && dismissedIssues !== signature;
    els.banner.hidden = !showBanner;
    if (showBanner) {
      const missing = board.roots.filter((r) => r.status !== 'ok').length;
      const parts = [];
      if (missing) parts.push(`${plural(missing, 'spec folder', 'spec folders')} could not be read`);
      const problems = blocking.length - missing;
      if (problems > 0) parts.push(plural(problems, 'problem', 'problems'));
      const details = h('button', { type: 'button', class: 'btn' }, 'Show details');
      details.addEventListener('click', () => {
        els.issues.open = true;
        const summary = els.issues.querySelector('summary');
        if (summary) {
          summary.focus();
          summary.scrollIntoView({ block: 'nearest' });
        }
      });
      const dismiss = h('button', { type: 'button', class: 'btn' }, 'Dismiss');
      dismiss.addEventListener('click', () => {
        dismissedIssues = signature;
        els.banner.hidden = true;
        els.q.focus();
      });
      els.banner.append(h('p', null, `Partial board: ${parts.join(', ')}.`), details, dismiss);
    }
  }

  function countValues(pick) {
    const counts = new Map();
    for (const s of board.specs) {
      for (const v of pick(s)) {
        if (v === null || v === undefined || v === '') continue;
        counts.set(v, (counts.get(v) || 0) + 1);
      }
    }
    return counts;
  }

  function fillSelect(select, counts, order, labelOf) {
    const current = select.value;
    const values = Array.from(counts.keys()).sort(order || byText);
    select.textContent = '';
    select.append(h('option', { value: '' }, 'All'));
    for (const v of values) select.append(h('option', { value: v }, `${labelOf ? labelOf(v) : v} (${counts.get(v)})`));
    if (current && !counts.has(current)) select.append(h('option', { value: current }, `${labelOf ? labelOf(current) : current} (0)`));
    select.value = current;
  }

  function renderToolbar() {
    const sizeRank = (v) => {
      const i = SIZE_ORDER.indexOf(v);
      return i === -1 ? SIZE_ORDER.length : i;
    };
    const statusRank = (v) => STATUSES.findIndex((s) => s.id === v);
    fillSelect(els.type, countValues((s) => [s.type]));
    fillSelect(els.size, countValues((s) => [s.size]), (a, b) => sizeRank(a) - sizeRank(b) || byText(a, b));
    fillSelect(els.status, countValues((s) => [statusOf(s)]), (a, b) => statusRank(a) - statusRank(b), (v) => STATUS_LABEL[v] || v);
    fillSelect(els.repo, countValues((s) => [s.repo]));
    fillSelect(els.stack, countValues((s) => arr(s.stacks)));
    els.repoField.hidden = !isMultiRepo();
    els.toolbar.hidden = board.specs.length === 0;
  }

  function activeFilterCount() {
    return ['type', 'size', 'status', 'repo', 'stack'].filter((k) => state[k]).length + (state.warn ? 1 : 0) + (state.hideDone ? 1 : 0);
  }

  function updateFilterToggle() {
    const n = activeFilterCount();
    els.toggle.textContent = n ? `Filters (${n} active)` : 'Filters';
  }

  function clearFilters() {
    Object.assign(state, { q: '', type: '', size: '', status: '', repo: '', stack: '', warn: false, hideDone: false });
    els.q.value = '';
    for (const key of ['type', 'size', 'status', 'repo', 'stack']) els[key].value = '';
    els.warn.checked = false;
    els.hideDone.checked = false;
    renderBoard(true);
    els.q.focus();
  }

  els.toggle.addEventListener('click', () => {
    const open = els.toggle.getAttribute('aria-expanded') !== 'true';
    els.toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    els.filterPanel.classList.toggle('open', open);
  });

  /* ---------- board ---------- */

  function emptyPanel(title, lines, action) {
    return h('div', { class: 'empty', role: 'note' }, h('h2', null, title), lines.map((l) => h('p', null, l)), action || null);
  }

  // Relative age label for a card. Recomputed on a timer so a board left open
  // keeps its "updated ..." text and stale marker honest.
  function ageInfo(spec) {
    const stamp = ago(spec.updatedAt);
    if (!stamp) return null;
    const idle = idleDays(spec);
    const stale = statusOf(spec) === 'in-progress' && idle !== null && idle >= STALE_DAYS;
    return {
      text: `updated ${stamp}`,
      cls: stale ? 'upd stale' : 'upd',
      title: stale ? `No file changes for ${idle} days (${fmtDateTime(spec.updatedAt)})` : fmtDateTime(spec.updatedAt),
    };
  }

  function refreshAges() {
    if (document.hidden) return;
    const byKey = new Map(board.specs.map((s) => [s.key, s]));
    for (const el of els.board.querySelectorAll('.upd[data-key]')) {
      const spec = byKey.get(el.dataset.key);
      const info = spec && ageInfo(spec);
      if (!info) continue;
      if (el.textContent !== info.text) el.textContent = info.text;
      if (el.className !== info.cls) el.className = info.cls;
      if (el.title !== info.title) el.title = info.title;
    }
  }

  let cardSeq = 0;

  function card(spec, multiRepo) {
    const p = progress(spec);
    const n = cardSeq++;
    const top = h('div', { class: 'card-top', id: `cm-${n}` },
      h('span', { class: 'sid' }, str(spec.shortId || spec.id)),
      multiRepo ? h('span', { class: 'chip repo' }, str(spec.repo)) : null,
      formatChip(spec) ? h('span', { class: 'chip legacy' }, formatChip(spec)) : null);
    const title = h('div', { class: 'card-title', id: `ct-${n}`, title: str(spec.title) }, str(spec.title || spec.folder));
    const chips = [];
    if (spec.type) chips.push(h('span', { class: 'chip' }, str(spec.type)));
    if (spec.size) chips.push(h('span', { class: 'chip' }, h('span', { class: 'sr-only' }, 'Size '), str(spec.size)));
    if (spec.priority) chips.push(h('span', { class: /^P[01]$/.test(spec.priority) ? 'chip prio-hi' : 'chip' }, h('span', { class: 'sr-only' }, 'Priority '), str(spec.priority)));
    for (const st of arr(spec.stacks)) chips.push(h('span', { class: 'chip mono' }, str(st)));
    const prog = h('div', { class: 'prog', id: `cp-${n}` });
    if (p.total > 0) {
      // A link's name ignores the progress element's own label, so the readable text carries the meaning.
      prog.append(
        h('progress', { value: p.done, max: p.total, 'aria-hidden': 'true' }),
        h('span', null, `${p.done}/${p.total} tasks`, h('span', { class: 'sr-only' }, ' done')),
      );
    } else {
      prog.append(h('span', null, 'No tasks'));
    }
    const age = ageInfo(spec);
    if (age) prog.append(h('span', { class: age.cls, title: age.title, 'data-key': spec.key }, age.text));
    // Sighted users get the short label; assistive tech gets the full message once.
    const badges = warnList(spec).map((w) =>
      h('span', { class: 'badge', title: str(w.message) },
        h('span', { 'aria-hidden': 'true' }, badgeLabel(w, spec)),
        h('span', { class: 'sr-only' }, str(w.message))));
    const resume = sessionBadge(spec);
    if (resume) badges.push(resume);
    const details = [`cm-${n}`];
    if (chips.length) details.push(`cc-${n}`);
    details.push(`cp-${n}`);
    if (badges.length) details.push(`cb-${n}`);
    // The title and status are the link's name; chips, progress and warnings are its description.
    const link = h('a', {
      class: 'card', href: hashFor(spec), 'data-key': spec.key,
      'aria-labelledby': `ct-${n} cs-${n}`, 'aria-describedby': details.join(' '),
    },
      top, title,
      h('span', { class: 'sr-only', id: `cs-${n}` }, `Status: ${STATUS_LABEL[statusOf(spec)]}.`),
      chips.length ? h('div', { class: 'chips', id: `cc-${n}` }, chips) : null,
      prog,
      badges.length ? h('div', { class: 'badges', id: `cb-${n}` }, badges) : null);
    return h('li', null, link);
  }

  // Backlog slices come from backlog.md and have no spec folder yet, so they
  // carry no status, repo, stack or warnings: only search and size filter them.
  function filterBacklog() {
    if (state.type || state.status || state.repo || state.stack || state.warn) return [];
    const terms = state.q.toLowerCase().split(/\s+/).filter(Boolean);
    return board.backlog.filter((b) => {
      if (state.size && b.size !== state.size) return false;
      if (!terms.length) return true;
      const text = [b.id, b.title, b.outcome, b.entryPoint, b.ticket, b.status, b.run, ...arr(b.brs)]
        .map(str).join('\n').toLowerCase();
      return terms.every((term) => text.includes(term));
    });
  }

  function sliceCard(slice) {
    const n = cardSeq++;
    const chips = [];
    if (slice.size) chips.push(h('span', { class: 'chip' }, h('span', { class: 'sr-only' }, 'Size '), str(slice.size)));
    for (const br of arr(slice.brs)) chips.push(h('span', { class: 'chip mono' }, str(br)));
    if (slice.status) chips.push(h('span', { class: 'chip legacy' }, str(slice.status)));
    const deps = arr(slice.dependsOn);
    return h('li', null, h('div', {
      class: 'card slice', tabindex: '0', 'aria-labelledby': `ct-${n}`, 'data-key': slice.key,
      title: slice.outcome ? str(slice.outcome) : null,
    },
      h('div', { class: 'card-top' },
        h('span', { class: 'sid' }, str(slice.id)),
        slice.ticket ? h('span', { class: 'chip mono' }, str(slice.ticket)) : null),
      h('div', { class: 'card-title', id: `ct-${n}` }, str(slice.title || slice.id)),
      chips.length ? h('div', { class: 'chips' }, chips) : null,
      deps.length ? h('div', { class: 'deps' }, `After ${deps.map(str).join(', ')}`) : null,
      slice.blockedBy ? h('div', { class: 'badges' }, h('span', { class: 'badge', title: str(slice.blockedBy) }, 'Blocked',
        h('span', { class: 'sr-only' }, `: ${str(slice.blockedBy)}`))) : null,
      slice.run
        ? h('code', { class: 'run', title: 'Start this slice with /sdd' }, str(slice.run))
        : h('p', { class: 'none' }, 'No /sdd line in backlog.md')));
  }

  function backlogColumn(slices) {
    return h('section', { class: 'col col-backlog', 'aria-labelledby': 'col-backlog' },
      h('h2', { id: 'col-backlog' }, h('span', { class: 'dot', 'aria-hidden': 'true' }), 'Backlog', ' ',
        h('span', { class: 'n' }, h('span', { class: 'sr-only' }, '('), String(slices.length), h('span', { class: 'sr-only' }, ')'))),
      h('ul', { class: 'cards', role: 'list' }, slices.map(sliceCard)));
  }

  // Only a change the user caused is announced; background refreshes already
  // go through the throttled "Board updated" message.
  function renderBoard(userChange) {
    const all = board.specs;
    const list = sortSpecs(filterSpecs());
    const slices = filterBacklog();
    cardSeq = 0;
    updateFilterToggle();
    const hiddenDone = state.hideDone ? all.filter((s) => statusOf(s) === 'done').length : 0;
    const countText = `${list.length} of ${plural(all.length, 'spec', 'specs')}${hiddenDone ? ` · ${hiddenDone} done hidden` : ''}`
      + (board.backlog.length ? ` · ${slices.length} of ${plural(board.backlog.length, 'backlog slice', 'backlog slices')}` : '');
    if (els.count.textContent !== countText) {
      els.count.textContent = countText;
      if (userChange === true) announce(countText);
    }
    const okRoots = board.roots.filter((r) => r.status === 'ok');
    let content;
    if (!okRoots.length) {
      const where = board.roots.map((r) => str(r.displayDir)).join(', ') || './.ai/specs';
      content = emptyPanel(`No spec folder found at ${where}`, [
        'Run from a repo root, or pass paths: node scripts/spec-board.mjs api/.ai/specs web/.ai/specs.',
        'Create a spec with /sdd <ticket> or /write-spec.',
      ]);
    } else if (!all.length && !board.backlog.length) {
      content = emptyPanel(`No specs yet in ${okRoots.map((r) => str(r.displayDir)).join(', ')}`, ['Start one with /sdd <ticket or description>, or plan a product with /product-brief.']);
    } else if (!list.length && !slices.length) {
      const button = h('button', { type: 'button', class: 'btn' }, 'Clear filters');
      button.addEventListener('click', clearFilters);
      content = emptyPanel(state.q.trim() ? `No specs match "${state.q.trim()}" with the current filters.` : 'No specs match the current filters.', [], button);
    } else {
      const multiRepo = isMultiRepo();
      const showUnknown = all.some((s) => statusOf(s) === 'unknown');
      // Unknown holds the broken specs, so it leads the board rather than trailing off-screen.
      const columns = STATUSES.filter((s) => (s.id !== 'unknown' || showUnknown) && (!state.status || state.status === s.id))
        .sort((a, b) => (b.id === 'unknown') - (a.id === 'unknown'));
      const specColumns = columns.map((col) => {
        let specs = list.filter((s) => statusOf(s) === col.id);
        // Finished work reads best newest first, whatever the global sort is.
        if (col.id === 'done') specs = specs.slice().sort(byRecent);
        const headingId = `col-${col.id}`;
        return h('section', { class: `col col-${col.id}${specs.length ? '' : ' col-empty'}`, 'aria-labelledby': headingId },
          h('h2', { id: headingId }, h('span', { class: 'dot', 'aria-hidden': 'true' }), col.label, ' ',
            h('span', { class: 'n' }, h('span', { class: 'sr-only' }, '('), String(specs.length), h('span', { class: 'sr-only' }, ')'))),
          specs.length
            ? h('ul', { class: 'cards', role: 'list' }, specs.map((s) => card(s, multiRepo)))
            : h('p', { class: 'none' }, 'None'));
      });
      // Backlog slices precede drafts: they are the work that has no spec yet.
      if (slices.length) {
        const at = columns.findIndex((col) => col.id !== 'unknown');
        specColumns.splice(at === -1 ? specColumns.length : at, 0, backlogColumn(slices));
      }
      content = h('div', { class: 'columns' }, specColumns);
    }
    els.board.replaceChildren(content);
  }

  function findCard(key) {
    for (const el of els.board.querySelectorAll('a.card')) if (el.dataset.key === key) return el;
    return null;
  }

  /* ---------- drawer ---------- */

  function currentSpec() {
    return ui.key ? board.specs.find((s) => s.key === ui.key) || null : null;
  }

  function hashTarget() {
    const hash = location.hash;
    if (!hash.startsWith('#spec/')) return null;
    const raw = hash.slice('#spec/'.length);
    try {
      return decodeURIComponent(raw);
    } catch (e) {
      return raw;
    }
  }

  function openFromHash() {
    const raw = hashTarget();
    if (raw === null) {
      if (ui.open) closeDrawer(false);
      return;
    }
    const spec = resolveSpec(raw);
    if (!ui.open || !spec || spec.key !== ui.key) {
      ui.tab = 'overview';
      ui.file = null;
    }
    ui.key = spec ? spec.key : null;
    ui.missing = spec ? null : raw;
    if (!ui.open) {
      ui.open = true;
      if (!ui.returnKey && document.activeElement && document.activeElement !== document.body) ui.returnEl = document.activeElement;
      els.drawer.hidden = false;
      els.backdrop.hidden = false;
      document.documentElement.classList.add('drawer-open');
    }
    renderDrawer();
    els.panel.scrollTop = 0;
    focusDrawerTitle();
  }

  function focusDrawerTitle() {
    const title = $('drawer-title');
    if (title) title.focus({ preventScroll: true });
  }

  function closeDrawer(updateHistory) {
    if (!ui.open) return;
    if (updateHistory && location.hash) {
      const y = window.scrollY;
      try {
        // A drawer opened from a card owns the history entry it pushed, so closing
        // steps back over it. A deep link has no earlier in-page entry to return to.
        if (ui.pushed) history.back();
        else history.replaceState(null, '', location.pathname + location.search);
      } catch (e) {
        location.hash = '';
        window.scrollTo(0, y);
      }
    }
    ui.open = false;
    els.drawer.hidden = true;
    els.backdrop.hidden = true;
    document.documentElement.classList.remove('drawer-open');
    const target = (ui.returnKey && findCard(ui.returnKey)) || (ui.returnEl && ui.returnEl.isConnected ? ui.returnEl : null) || (ui.key && findCard(ui.key));
    ui.key = null;
    ui.missing = null;
    ui.etag = null;
    ui.returnKey = null;
    ui.returnEl = null;
    ui.pushed = false;
    if (target) target.focus({ preventScroll: false });
  }

  function statusPill(spec) {
    const st = statusOf(spec);
    const label = STATUS_LABEL[st] + (spec.statusSource === 'inferred' ? ' (inferred)' : '');
    return h('span', { class: `pill st-${st}` }, h('span', { class: 'sr-only' }, 'Status: '), label);
  }

  function renderDrawer() {
    const spec = currentSpec();
    els.drawerHead.textContent = '';
    if (!spec) {
      const message = ui.missing !== null ? `No spec matches '${ui.missing}'` : 'This spec was removed or renamed';
      const choices = ui.missing !== null ? matchSpecs(ui.missing) : [];
      if (choices.length > 1) {
        els.drawerHead.append(h('h2', { id: 'drawer-title', tabindex: '-1' }, `${choices.length} specs match '${ui.missing}'`));
        els.tabs.hidden = true;
        els.panel.replaceChildren(
          h('p', { class: 'muted' }, 'Pick one:'),
          h('ul', { role: 'list' }, choices.map((c) =>
            h('li', null, h('a', { href: hashFor(c) }, `${str(c.repo)}/${str(c.folder)}: ${str(c.title || c.folder)}`)))));
        ui.etag = null;
        currentFiles = [];
        return;
      }
      els.drawerHead.append(h('h2', { id: 'drawer-title', tabindex: '-1' }, message));
      els.tabs.hidden = true;
      els.panel.replaceChildren(h('p', { class: 'muted' }, 'Close this panel and pick a card on the board.'));
      ui.etag = null;
      currentFiles = [];
      return;
    }
    ui.etag = spec.etag;
    currentFiles = arr(spec.files).map((f) => str(f.path));
    els.drawerHead.append(
      h('div', { class: 'dh-meta' },
        h('span', { class: 'sid' }, str(spec.shortId || spec.id)),
        statusPill(spec),
        isMultiRepo() ? h('span', { class: 'chip repo' }, str(spec.repo)) : null,
        formatChip(spec) ? h('span', { class: 'chip legacy' }, formatChip(spec)) : null),
      h('h2', { id: 'drawer-title', tabindex: '-1' }, str(spec.title || spec.folder)),
      h('p', { class: 'folder' }, h('span', { class: 'sr-only' }, 'Folder: '), str(spec.folder)),
    );
    els.tabs.hidden = false;
    const tasks = spec.tasks || {};
    const counts = {
      tasks: tasks.present && Number(tasks.total) ? [`${tasks.done}/${tasks.total}`, ' tasks done'] : null,
      files: arr(spec.files).length ? [String(arr(spec.files).length), arr(spec.files).length === 1 ? ' file' : ' files'] : null,
    };
    for (const tab of els.tabs.querySelectorAll('[role="tab"]')) {
      const name = tab.dataset.tab;
      const selected = name === ui.tab;
      tab.setAttribute('aria-selected', selected ? 'true' : 'false');
      tab.tabIndex = selected ? 0 : -1;
      const n = tab.querySelector('.tn');
      const count = counts[name];
      if (n) n.replaceChildren(...(count ? [h('span', { class: 'sr-only' }, ', '), count[0], h('span', { class: 'sr-only' }, count[1])] : []));
      if (selected) els.panel.setAttribute('aria-labelledby', tab.id);
    }
    renderPanel(spec);
  }

  function renderPanel(spec) {
    const builders = { overview: overviewPanel, spec: specPanel, tasks: tasksPanel, files: filesPanel };
    const build = builders[ui.tab] || overviewPanel;
    els.panel.replaceChildren(build(spec));
  }

  function section(title, ...kids) {
    return h('section', { class: 'sec' }, h('h3', null, title), kids);
  }

  function display(value) {
    if (Array.isArray(value)) return value.length ? value.map(str).join(', ') : '-';
    if (value === null || value === undefined || value === '') return '-';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  }

  function detailRows(spec) {
    const fm = spec.frontmatter && typeof spec.frontmatter === 'object' && !Array.isArray(spec.frontmatter) ? spec.frontmatter : null;
    if (spec.format !== 'frontmatter' || !fm) {
      let format = 'legacy (no frontmatter)';
      if (spec.format === 'malformed') format = 'malformed (frontmatter is not closed)';
      else if (specLiteSkipped(spec)) format = 'spec-lite.md exists but could not be read';
      return [
        ['Folder', spec.folder],
        ['Format', format],
        ['Title', spec.title],
        ['Status', `${STATUS_LABEL[statusOf(spec)]} (${spec.statusSource === 'legacy-body' ? 'from the Status line' : 'inferred from tasks'})`],
        ['Ticket', spec.ticket ? `${spec.ticket} (from folder name)` : null],
        ['Created', spec.created ? `${spec.created} (from folder name)` : null],
      ];
    }
    const fallback = {
      id: spec.id, title: spec.title, type: spec.type, size: spec.size, priority: spec.priority,
      status: spec.statusSource === 'inferred' ? `${STATUS_LABEL[statusOf(spec)]} (inferred from tasks)` : spec.status,
      ticket: spec.ticket, stakeholders: spec.stakeholders, approved_by: spec.approvedBy, approved_at: spec.approvedAt,
      created: spec.created, stacks: spec.stacks,
    };
    const has = (k) => Object.prototype.hasOwnProperty.call(fm, k);
    const written = (k) => has(k) && fm[k] !== null && fm[k] !== '' && !(Array.isArray(fm[k]) && !fm[k].length);
    // Values the scanner filled in are labelled so a missing frontmatter field stays visible.
    const derived = { id: 'from folder name', title: 'from first heading', ticket: 'from folder name', created: 'from folder name' };
    const rows = KNOWN_KEYS.map((k) => {
      if (written(k)) return [k, fm[k]];
      if (derived[k] && fallback[k]) return [k, `${fallback[k]} (${derived[k]})`];
      if (k === 'status') return [k, fallback[k]];
      return [k, has(k) ? fm[k] : fallback[k]];
    });
    for (const k of Object.keys(fm)) if (!KNOWN_KEYS.includes(k)) rows.push([k, fm[k]]);
    return rows;
  }

  function coverMap(spec) {
    const map = new Map();
    arr(spec.tasks && spec.tasks.items).forEach((t, i) => {
      const n = t.number === null || t.number === undefined ? i + 1 : t.number;
      for (const id of arr(t.covers)) {
        if (!map.has(id)) map.set(id, []);
        map.get(id).push(n);
      }
    });
    return map;
  }

  function criteriaList(spec, items, covers, trace) {
    const uncovered = new Set(arr(spec.uncovered));
    return h('ul', { class: 'plain crit' }, items.map((c) => {
      const id = str(c.id);
      const taskNums = covers.get(id) || [];
      const row = trace.get(id);
      const meta = [];
      meta.push(h('span', null, taskNums.length ? `Covered by ${taskNums.length === 1 ? 'task' : 'tasks'} ${taskNums.join(', ')}` : 'Not covered by any task'));
      if (row && row.verifiedBy) meta.push(h('span', null, 'Verified by ', h('span', { md: md(row.verifiedBy, true) })));
      return h('li', null,
        h('div', { class: 'crit-head' },
          h('span', { class: 'chip id' }, id),
          h('div', { class: 'crit-text', md: md(c.text, true) }),
          uncovered.has(id) ? h('span', { class: 'badge', title: 'Missing from the traceability table in tasks.md' }, 'Uncovered') : null),
        h('p', { class: 'crit-meta' }, meta));
    }));
  }

  function overviewPanel(spec) {
    const wrap = h('div');
    const warnings = arr(spec.warnings);
    const ordered = warnings.filter((w) => w.level === 'warn').concat(warnings.filter((w) => w.level !== 'warn'));
    if (ordered.length) {
      wrap.append(section('Warnings', h('ul', { class: 'plain warnings' }, ordered.map((w) =>
        h('li', { class: w.level === 'warn' ? 'lvl-warn' : 'lvl-info' },
          h('span', { class: 'lvl' }, w.level === 'warn' ? 'Warning' : 'Note'),
          h('span', null, str(w.message)))))));
    }

    const session = spec.session && typeof spec.session === 'object' ? spec.session : null;
    if (session) {
      const current = Number.isFinite(session.currentTask)
        ? `${session.currentTask}${Number.isFinite(session.totalTasks) ? ` of ${session.totalTasks}` : ''}`
        : '-';
      const done = arr(session.completedTasks);
      wrap.append(section('Session', h('div', { class: 'box' }, h('dl', { class: 'kv' },
        h('dt', null, 'Resume hint'), h('dd', null, session.resumeHint ? str(session.resumeHint) : '-'),
        h('dt', null, 'Current task'), h('dd', null, current),
        h('dt', null, 'Completed tasks'), h('dd', null, done.length ? done.join(', ') : 'None'),
        h('dt', null, 'Last updated'), h('dd', null, session.lastUpdated ? fmtDateTime(session.lastUpdated) : '-'),
        h('dt', null, 'State file'), h('dd', null, str(session.file) || '-')))));
    }

    wrap.append(section('Details', h('table', { class: 'details' }, h('tbody', null,
      detailRows(spec).concat(spec.updatedAt ? [['Updated', ago(spec.updatedAt) ? `${fmtDateTime(spec.updatedAt)} (${ago(spec.updatedAt)})` : fmtDateTime(spec.updatedAt)]] : [])
        .map(([k, v]) => h('tr', null, h('th', { scope: 'row' }, k), h('td', null, display(v))))))));

    const errors = arr(spec.errors);
    if (errors.length) wrap.append(section('Problems reading this spec', h('ul', { class: 'plain errors' }, errors.map((e) => h('li', null, str(e))))));

    const questions = arr(spec.openQuestions);
    if (questions.length) {
      wrap.append(section(`Open questions (${Number(spec.openQuestionCount) || 0} open)`, h('ul', { class: 'plain oq' }, questions.map((q) =>
        h('li', null, h('label', null,
          h('input', { type: 'checkbox', disabled: true, checked: Boolean(q.checked) }),
          h('span', { md: md(q.text, true) })))))));
    }

    const covers = coverMap(spec);
    const trace = new Map(arr(spec.tasks && spec.tasks.traceability).map((r) => [str(r.id), r]));
    const acceptance = arr(spec.acceptance);
    const mnc = arr(spec.mustNotChange);
    if (acceptance.length) wrap.append(section('Acceptance criteria', criteriaList(spec, acceptance, covers, trace)));
    if (mnc.length) wrap.append(section('Must not change', criteriaList(spec, mnc, covers, trace)));
    const nfrs = arr(spec.nfrs);
    if (nfrs.length) wrap.append(section('Quality attributes', criteriaList(spec, nfrs, covers, trace)));
    if (!acceptance.length && !mnc.length && spec.format === 'frontmatter') {
      wrap.append(section('Acceptance criteria', h('p', { class: 'muted' }, 'No AC-n items found in spec-lite.md.')));
    }
    return wrap;
  }

  function specPanel(spec) {
    if (spec.body === null || spec.body === undefined) return h('p', { class: 'muted' }, 'No spec-lite.md in this folder.');
    return h('article', { class: 'md', md: md(spec.body) });
  }

  function tasksPanel(spec) {
    const t = spec.tasks && typeof spec.tasks === 'object' ? spec.tasks : {};
    if (!t.present) return h('p', { class: 'muted' }, 'No tasks.md in this folder.');
    const wrap = h('div');
    const total = Number(t.total) || 0;
    const done = Number(t.done) || 0;
    const summary = h('p', { class: 'summary-line' });
    if (total) {
      summary.append(h('progress', { value: done, max: total, 'aria-hidden': 'true' }), `${done} of ${plural(total, 'task', 'tasks')} done`);
      if (Number(t.subtotal)) summary.append(h('span', { class: 'muted' }, `· ${t.subdone}/${t.subtotal} subtasks`));
    } else {
      summary.append('tasks.md has no checkbox tasks.');
    }
    wrap.append(summary);

    const items = arr(t.items);
    const traceRows = arr(t.traceability);
    const traceIds = new Set(traceRows.map((r) => str(r.id)));
    const hasPhases = items.some((it) => it.phase);
    let group = null;
    let lastPhase;
    items.forEach((task, index) => {
      const phase = task.phase || null;
      if (!group || phase !== lastPhase) {
        lastPhase = phase;
        if (hasPhases) wrap.append(h('h3', { class: 'phase' }, phase || 'Tasks'));
        group = h('ul', { class: 'task-list' });
        wrap.append(group);
      }
      const titleId = `task-title-${index}`;
      const number = task.number === null || task.number === undefined ? null : task.number;
      const row = h('div', { class: 'task-row' },
        h('input', { type: 'checkbox', disabled: true, checked: Boolean(task.checked), 'aria-labelledby': titleId }),
        h('span', { class: 'task-title', id: titleId },
          number !== null ? h('span', { class: 't-num' }, `${number}.`) : null, ' ',
          h('span', { md: md(task.title, true) })));
      const tags = [];
      if (task.stack) tags.push(h('span', { class: 'chip mono' }, str(task.stack)));
      for (const id of arr(task.covers)) {
        const known = traceIds.has(str(id));
        tags.push(h('button', {
          type: 'button',
          class: known ? 'cover' : 'cover cover-missing',
          'data-ref': str(id),
          title: known ? `Show ${str(id)} in the traceability table` : `${str(id)} is not in the traceability table`,
        }, str(id), known ? null : h('span', { class: 'sr-only' }, ' (not in the traceability table)')));
      }
      if (!arr(task.covers).length && task.coversText) tags.push(h('span', { class: 'muted' }, `Covers: ${str(task.coversText)}`));
      const li = h('li', null, row, tags.length ? h('div', { class: 'task-tags' }, tags) : null);
      const subs = arr(task.subtasks);
      if (subs.length) {
        const subDone = subs.filter((s) => s.checked).length;
        const details = h('details', { class: 'subs', open: !task.checked },
          h('summary', null, `Subtasks ${subDone}/${subs.length}`),
          h('ul', null, subs.map((s, k) => {
            const id = `sub-${index}-${k}`;
            return h('li', { class: s.verify ? 'is-verify' : null },
              h('input', { type: 'checkbox', disabled: true, checked: Boolean(s.checked), 'aria-labelledby': id }),
              h('span', { id }, h('span', { class: 't-num' }, str(s.number)), ' ', h('span', { md: md(s.text, true) })));
          })));
        li.append(details);
      }
      group.append(li);
    });

    const trace = arr(t.traceability);
    const sec = h('section', { class: 'sec', 'data-trace-section': '1' }, h('h3', null, 'Traceability'));
    if (trace.length) {
      sec.append(h('div', { class: 'table-wrap' }, h('table', { class: 'trace' },
        h('thead', null, h('tr', null, ['ID', 'Criterion', 'Verified by', 'Kind', 'Task'].map((c) => h('th', { scope: 'col' }, c)))),
        h('tbody', null, trace.map((r) => h('tr', { 'data-ref': str(r.id), tabindex: '-1' },
          h('td', null, h('span', { class: 'chip id' }, str(r.id))),
          h('td', { md: md(r.criterion, true) }),
          h('td', { md: md(r.verifiedBy, true) }),
          h('td', { md: md(r.kind, true) }),
          h('td', { md: md(r.task, true) })))))));
    } else {
      sec.append(h('p', { class: 'muted' }, 'No traceability table in tasks.md.'));
    }
    const uncovered = arr(spec.uncovered);
    if (uncovered.length) sec.append(h('p', { class: 'warn-text' }, `Not in the traceability table: ${uncovered.join(', ')}`));
    const missingCovers = Array.from(new Set(items.flatMap((it) => arr(it.covers).map(str)))).filter((id) => !traceIds.has(id));
    if (trace.length && missingCovers.length) {
      sec.append(h('p', { class: 'warn-text', 'data-trace-note': '1', tabindex: '-1' }, `Covered by tasks but missing from this table: ${missingCovers.join(', ')}`));
    }
    wrap.append(sec);
    return wrap;
  }

  function filesPanel(spec) {
    const files = arr(spec.files);
    if (ui.file) {
      const file = files.find((f) => f.path === ui.file);
      if (file) return fileViewer(file);
      ui.file = null;
    }
    if (!files.length) return h('p', { class: 'muted' }, 'No files found in this folder.');
    return h('ul', { class: 'file-list' }, files.map((f) => {
      const meta = [str(f.kind), fmtBytes(f.bytes)];
      if (f.note) meta.push(str(f.note));
      return h('li', null, h('button', { type: 'button', class: 'file-row', 'data-path': str(f.path) },
        h('span', { class: 'path' }, str(f.path)),
        h('span', { class: 'fmeta' }, meta.join(' · '))));
    }));
  }

  function fileViewer(file) {
    const back = h('button', { type: 'button', class: 'btn', 'data-action': 'back' }, 'Back to files');
    const wrap = h('div', null, h('div', { class: 'viewer-head' }, back, h('h3', { id: 'viewer-title', tabindex: '-1' }, str(file.path))));
    const hasContent = typeof file.content === 'string';
    if (file.kind === 'markdown' && hasContent) wrap.append(h('article', { class: 'md', md: md(file.content) }));
    else if (file.kind === 'text' && hasContent) wrap.append(h('pre', { class: 'text' }, file.content));
    else {
      const reason = file.note ? str(file.note) : file.kind === 'other' ? 'not a text file' : 'no content';
      wrap.append(h('p', { class: 'muted' }, `Not previewable: ${reason}, ${fmtBytes(file.bytes)}`));
    }
    return wrap;
  }

  function setTab(name, focusTab) {
    ui.tab = name;
    const spec = currentSpec();
    if (!spec) return;
    renderDrawer();
    els.panel.scrollTop = 0;
    if (focusTab) {
      const tab = els.tabs.querySelector(`[data-tab="${name}"]`);
      if (tab) tab.focus();
    }
  }

  function scrollToAnchor(anchor) {
    if (!anchor) return;
    const wanted = `md-${String(anchor).toLowerCase()}`;
    let target = null;
    for (const el of els.panel.querySelectorAll('[id^="md-"]')) {
      if (el.id === wanted) {
        target = el;
        break;
      }
      if (!target && el.id.startsWith(`${wanted}-`)) target = el;
    }
    if (!target) return;
    target.scrollIntoView({ block: 'start', behavior: reducedMotion ? 'auto' : 'smooth' });
    flash(target);
  }

  function flash(el) {
    el.classList.remove('flash');
    void el.offsetWidth;
    el.classList.add('flash');
    setTimeout(() => el.classList.remove('flash'), 2000);
  }

  function openFile(path, anchor) {
    const spec = currentSpec();
    if (!spec) return;
    const file = arr(spec.files).find((f) => f.path === path);
    if (path === 'spec-lite.md' || (file && file.view === 'spec')) {
      setTab('spec', false);
      if (anchor) scrollToAnchor(anchor);
      else els.panel.focus({ preventScroll: true });
      return;
    }
    ui.tab = 'files';
    ui.file = path;
    renderDrawer();
    els.panel.scrollTop = 0;
    const title = $('viewer-title');
    if (title) title.focus({ preventScroll: true });
    if (anchor) scrollToAnchor(anchor);
  }

  function focusables() {
    return Array.from(els.drawer.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), summary, [tabindex]:not([tabindex="-1"])'))
      .filter((el) => el.offsetParent !== null || el === document.activeElement);
  }

  function trapTab(e) {
    const items = focusables();
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (!els.drawer.contains(active)) {
      e.preventDefault();
      first.focus();
    } else if (e.shiftKey && (active === first || !items.includes(active))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }

  /* ---------- live updates ---------- */

  let lastAnnounce = 0;
  let pendingAnnounce = null;
  let announceTimer = null;

  function say(message) {
    lastAnnounce = Date.now();
    els.announcer.textContent = message;
  }

  function announce(message) {
    const wait = 5000 - (Date.now() - lastAnnounce);
    if (wait <= 0 && !announceTimer) {
      say(message);
      return;
    }
    pendingAnnounce = message;
    if (!announceTimer) {
      announceTimer = setTimeout(() => {
        announceTimer = null;
        if (pendingAnnounce) say(pendingAnnounce);
        pendingAnnounce = null;
      }, Math.max(wait, 0));
    }
  }

  function describeFocus() {
    const active = document.activeElement;
    if (!active || active === document.body) return null;
    if (active.matches('a.card')) return { card: active.dataset.key };
    if (els.drawer.contains(active)) {
      if (active.id) return { id: active.id };
      if (active.dataset.path) return { path: active.dataset.path };
      if (active.dataset.ref) return { ref: active.dataset.ref };
      return { panel: true };
    }
    return null;
  }

  function restoreFocus(desc) {
    if (!desc || (document.activeElement && document.activeElement !== document.body && document.activeElement.isConnected)) return;
    let el = null;
    if (desc.card) el = findCard(desc.card);
    else if (desc.id) el = document.getElementById(desc.id);
    else if (desc.path) el = Array.from(els.panel.querySelectorAll('[data-path]')).find((n) => n.dataset.path === desc.path) || null;
    else if (desc.ref) el = Array.from(els.panel.querySelectorAll('button[data-ref]')).find((n) => n.dataset.ref === desc.ref) || null;
    if (!el && ui.open) el = els.panel;
    if (!el) return;
    el.focus({ preventScroll: true });
    if (desc.card) revealHorizontally(el);
  }

  // Keeps a refocused card visible inside the horizontally scrolling columns
  // without moving the page vertically.
  function revealHorizontally(el) {
    const scroller = el.closest('.columns');
    if (!scroller) return;
    const box = el.getBoundingClientRect();
    const view = scroller.getBoundingClientRect();
    if (box.left < view.left || box.right > view.right) el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  function applyBoard(next) {
    const incoming = normalizeBoard(next);
    lastUpdate = new Date();
    if (incoming.etag && incoming.etag === board.etag) {
      setMode('live');
      refreshAges();
      return;
    }
    const before = new Map(board.specs.map((s) => [s.key, s.etag]));
    let changed = 0;
    const seen = new Set();
    for (const s of incoming.specs) {
      seen.add(s.key);
      if (before.get(s.key) !== s.etag) changed += 1;
    }
    for (const key of before.keys()) if (!seen.has(key)) changed += 1;

    const focus = describeFocus();
    const scrollY = window.scrollY;
    const panelScroll = els.panel.scrollTop;
    const columnsBefore = els.board.querySelector('.columns');
    const scrollX = columnsBefore ? columnsBefore.scrollLeft : 0;
    board = incoming;
    searchCache.clear();
    renderHeader();
    renderToolbar();
    renderBoard();
    const columnsAfter = els.board.querySelector('.columns');
    if (columnsAfter) columnsAfter.scrollLeft = scrollX;
    window.scrollTo(0, scrollY);

    if (ui.open) {
      if (ui.missing !== null) {
        const found = resolveSpec(ui.missing);
        if (found) {
          ui.key = found.key;
          ui.missing = null;
        }
        renderDrawer();
      } else {
        let spec = currentSpec();
        let rebound = false;
        if (!spec && ui.key) {
          // A renamed folder changes the key but not the id in the URL, so the
          // hash can still find the spec before it is declared gone.
          const raw = hashTarget();
          const found = raw === null ? null : resolveSpec(raw);
          if (found) {
            if (ui.returnKey === ui.key) ui.returnKey = found.key;
            ui.key = found.key;
            spec = found;
            rebound = true;
          }
        }
        if (rebound || !spec || spec.etag !== ui.etag) {
          renderDrawer();
          els.panel.scrollTop = panelScroll;
        }
      }
    }
    restoreFocus(focus);
    setMode('live');
    if (changed) announce(`Board updated: ${plural(changed, 'spec', 'specs')} changed`);
  }

  /* ---------- events ---------- */

  let searchTimer = null;
  els.q.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.q = els.q.value;
      renderBoard(true);
    }, 100);
  });
  for (const key of ['type', 'size', 'status', 'repo', 'stack']) {
    els[key].addEventListener('change', () => {
      state[key] = els[key].value;
      renderBoard(true);
    });
  }
  els.warn.addEventListener('change', () => {
    state.warn = els.warn.checked;
    renderBoard(true);
  });
  els.hideDone.addEventListener('change', () => {
    state.hideDone = els.hideDone.checked;
    renderBoard(true);
  });
  els.sort.addEventListener('change', () => {
    state.sort = els.sort.value;
    renderBoard(true);
  });
  els.clear.addEventListener('click', clearFilters);

  els.board.addEventListener('click', (e) => {
    const link = e.target.closest('a.card');
    if (link) {
      ui.returnKey = link.dataset.key;
      ui.pushed = e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
    }
  });

  els.board.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    const current = e.target.closest ? e.target.closest('a.card') : null;
    if (!current) return;
    const columns = Array.from(els.board.querySelectorAll('.col'))
      .map((col) => Array.from(col.querySelectorAll('a.card')))
      .filter((cards) => cards.length);
    const c = columns.findIndex((cards) => cards.includes(current));
    if (c === -1) return;
    const r = columns[c].indexOf(current);
    let next = null;
    if (e.key === 'ArrowDown') next = columns[c][r + 1];
    else if (e.key === 'ArrowUp') next = columns[c][r - 1];
    else {
      const side = columns[c + (e.key === 'ArrowRight' ? 1 : -1)];
      if (side) next = side[Math.min(r, side.length - 1)];
    }
    if (!next) return;
    e.preventDefault();
    next.focus();
  });

  const skip = document.querySelector('.skip');
  if (skip) {
    skip.addEventListener('click', (e) => {
      e.preventDefault();
      const first = els.board.querySelector('a.card');
      (first || els.board).focus();
    });
  }

  els.drawerClose.addEventListener('click', () => closeDrawer(true));
  els.backdrop.addEventListener('click', () => closeDrawer(true));

  els.tabs.addEventListener('click', (e) => {
    const tab = e.target.closest('[role="tab"]');
    if (tab) setTab(tab.dataset.tab, true);
  });
  els.tabs.addEventListener('keydown', (e) => {
    const tabs = Array.from(els.tabs.querySelectorAll('[role="tab"]'));
    const index = tabs.indexOf(document.activeElement);
    if (index === -1) return;
    let next = null;
    if (e.key === 'ArrowRight') next = (index + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = tabs.length - 1;
    if (next === null) return;
    e.preventDefault();
    setTab(tabs[next].dataset.tab, true);
  });

  els.drawer.addEventListener('click', (e) => {
    const fileLink = e.target.closest('a[data-file]');
    if (fileLink) {
      e.preventDefault();
      openFile(fileLink.dataset.file, fileLink.dataset.anchor || '');
      return;
    }
    const anchorLink = e.target.closest('a[data-anchor]');
    if (anchorLink) {
      e.preventDefault();
      scrollToAnchor(anchorLink.dataset.anchor);
      return;
    }
    const cover = e.target.closest('button.cover');
    if (cover) {
      const row = Array.from(els.panel.querySelectorAll('tr[data-ref]')).find((r) => r.dataset.ref === cover.dataset.ref);
      if (row) {
        row.scrollIntoView({ block: 'center', behavior: reducedMotion ? 'auto' : 'smooth' });
        row.focus({ preventScroll: true });
        flash(row);
      } else {
        const target = els.panel.querySelector('[data-trace-note]') || els.panel.querySelector('[data-trace-section]');
        if (target) {
          target.scrollIntoView({ block: 'center', behavior: reducedMotion ? 'auto' : 'smooth' });
          flash(target);
        }
        announce(`${cover.dataset.ref} is not in the traceability table`);
      }
      return;
    }
    const fileRow = e.target.closest('button.file-row');
    if (fileRow) {
      openFile(fileRow.dataset.path, '');
      return;
    }
    const back = e.target.closest('[data-action="back"]');
    if (back) {
      const previous = ui.file;
      ui.file = null;
      renderDrawer();
      const row = Array.from(els.panel.querySelectorAll('button.file-row')).find((r) => r.dataset.path === previous);
      (row || els.panel).focus();
    }
  });

  document.addEventListener('keydown', (e) => {
    const target = e.target;
    const typing = target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
    if (e.key === '/' && !typing && !ui.open && !e.ctrlKey && !e.metaKey && !e.altKey && !els.toolbar.hidden) {
      e.preventDefault();
      els.q.focus();
      els.q.select();
      return;
    }
    if (e.key === 'Escape') {
      if (document.activeElement === els.q && els.q.value) {
        e.preventDefault();
        els.q.value = '';
        state.q = '';
        renderBoard(true);
        return;
      }
      if (ui.open) {
        e.preventDefault();
        closeDrawer(true);
      }
      return;
    }
    if (e.key === 'Tab' && ui.open) trapTab(e);
  });

  document.addEventListener('focusin', (e) => {
    if (ui.open && !els.drawer.contains(e.target)) focusDrawerTitle();
  });

  window.addEventListener('hashchange', openFromHash);
  setInterval(refreshAges, 60000);
  document.addEventListener('visibilitychange', refreshAges);

  /* ---------- start ---------- */

  renderHeader();
  renderToolbar();
  renderBoard();
  setMode(config.live === true ? 'live' : 'static');
  if (location.hash.startsWith('#spec/')) {
    openFromHash();
    const spec = currentSpec();
    if (spec) ui.returnKey = spec.key;
  }
  if (config.live === true && typeof startLive === 'function') startLive({ applyBoard, setMode });
}

/* Live-mode transport, included only in pages served by --serve. */
function liveClient(api) {
  const resync = () => fetch('/api/board', { cache: 'no-store' })
    .then((res) => (res.ok ? res.json() : null))
    .then((next) => {
      if (!next) return false;
      api.applyBoard(next);
      return true;
    })
    .catch(() => false);

  if (typeof EventSource === 'function') {
    let lost = false;
    const source = new EventSource('/api/events');
    source.addEventListener('board', (ev) => {
      try {
        api.applyBoard(JSON.parse(ev.data));
      } catch (e) {
        /* a malformed message is dropped; the next one resyncs */
      }
    });
    source.addEventListener('open', () => {
      if (lost) {
        lost = false;
        resync();
      }
      api.setMode('live');
    });
    source.addEventListener('error', () => {
      lost = true;
      api.setMode('reconnecting');
    });
    return;
  }

  setInterval(() => {
    resync().then((ok) => {
      if (!ok) api.setMode('reconnecting');
    });
  }, 3000);
}

function buildClientScript(live) {
  const script = `(() => {
'use strict';
const renderMarkdown = ${renderMarkdown.toString()};
(${clientApp.toString()})(${live ? liveClient.toString() : 'null'});
})();
`;
  // An inline script cannot contain these sequences without breaking out of
  // (or confusing the parser about the end of) the <script> element.
  if (/<\/script|<!--/i.test(script)) throw new Error('spec-board client script contains a forbidden sequence');
  return script;
}

const CLIENT_SCRIPTS = { static: buildClientScript(false), live: buildClientScript(true) };

if (/<\/style/i.test(STYLE)) throw new Error('spec-board stylesheet contains a forbidden sequence');

function cspHash(text) {
  return `'sha256-${createHash('sha256').update(text, 'utf8').digest('base64')}'`;
}

const SORT_OPTIONS = [
  ['priority', 'Priority'],
  ['updated', 'Recently updated'],
  ['created', 'Created (newest)'],
  ['progress', 'Progress (most done first)'],
  ['title', 'Title A-Z'],
  ['id', 'ID'],
];

/**
 * Renders the complete board page: one self-contained HTML document with an
 * inline stylesheet, the app script and the board embedded as JSON. The CSP
 * meta tag allows exactly those two inline blocks by hash.
 *
 * @param {{ board: object, live?: boolean, title?: string }} params
 * @returns {string} HTML document.
 */
export function renderPage({ board, live = false, title = 'Spec board' } = {}) {
  const isLive = live === true;
  const pageTitle = title === null || title === undefined || String(title).trim() === '' ? 'Spec board' : String(title);
  const script = isLive ? CLIENT_SCRIPTS.live : CLIENT_SCRIPTS.static;
  const data = embedJson({ board: board === undefined ? null : board, live: isLive, title: pageTitle });
  const csp = [
    "default-src 'none'",
    `script-src ${cspHash(script)}`,
    `style-src ${cspHash(STYLE)}`,
    'img-src data:',
    "connect-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
  const t = escapeHtml(pageTitle);
  const sortOptions = SORT_OPTIONS.map(([value, label]) => `<option value="${value}">${escapeHtml(label)}</option>`).join('');
  const select = (id, label) =>
    `<div class="field"${id === 'f-repo' ? ' id="f-repo-field"' : ''}><label for="${id}">${label}</label><select id="${id}"><option value="">All</option></select></div>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${escapeHtml(csp)}">
<meta name="referrer" content="no-referrer">
<meta name="color-scheme" content="light dark">
<title>${t}</title>
<link rel="icon" href="data:,">
<style>${STYLE}</style>
</head>
<body>
<a class="skip" href="#board">Skip to board</a>
<div class="page">
<header class="top">
<div>
<h1>${t}</h1>
<p class="sub" id="roots"></p>
</div>
<p class="mode" id="mode"></p>
</header>
<details class="issues" id="issues" hidden></details>
<div class="banner" id="banner" role="region" aria-label="Board issues" hidden></div>
<div class="banner" id="offline" role="region" aria-label="Live server connection" hidden></div>
<div class="toolbar" id="toolbar" role="search" aria-label="Filter specs">
<div class="field f-search"><label for="q">Search</label><input id="q" type="search" placeholder="Search title, id, ticket, criteria…" autocomplete="off" spellcheck="false"></div>
<div class="field f-sort"><label for="f-sort">Sort</label><select id="f-sort">${sortOptions}</select></div>
<button class="btn f-toggle" id="f-toggle" type="button" aria-expanded="false" aria-controls="f-panel">Filters</button>
<div class="f-panel" id="f-panel">
${select('f-type', 'Type')}
${select('f-size', 'Size')}
${select('f-status', 'Status')}
${select('f-repo', 'Repo')}
${select('f-stack', 'Stack')}
<label class="check" for="f-warn"><input id="f-warn" type="checkbox">Has warnings</label>
<label class="check" for="f-hide-done"><input id="f-hide-done" type="checkbox">Hide done</label>
<button class="btn f-clear" id="f-clear" type="button">Clear filters</button>
</div>
<p class="count" id="count"></p>
</div>
<main id="board" class="board" tabindex="-1" aria-label="Spec board"></main>
</div>
<div class="backdrop" id="backdrop" hidden></div>
<aside class="drawer" id="drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title" hidden>
<div class="drawer-top"><div class="drawer-head" id="drawer-head"></div><button class="btn" id="drawer-close" type="button">Close</button></div>
<div class="tabs" id="drawer-tabs" role="tablist" aria-label="Spec sections">
<button class="tab" type="button" role="tab" id="tab-overview" data-tab="overview" aria-controls="drawer-panel" aria-selected="true">Overview<span class="tn"></span></button>
<button class="tab" type="button" role="tab" id="tab-spec" data-tab="spec" aria-controls="drawer-panel" aria-selected="false" tabindex="-1">Spec<span class="tn"></span></button>
<button class="tab" type="button" role="tab" id="tab-tasks" data-tab="tasks" aria-controls="drawer-panel" aria-selected="false" tabindex="-1">Tasks<span class="tn"></span></button>
<button class="tab" type="button" role="tab" id="tab-files" data-tab="files" aria-controls="drawer-panel" aria-selected="false" tabindex="-1">Files<span class="tn"></span></button>
</div>
<div class="drawer-panel" id="drawer-panel" role="tabpanel" aria-labelledby="tab-overview" tabindex="0"></div>
</aside>
<div class="sr-only" id="announcer" aria-live="polite"></div>
<noscript><p class="empty">This board needs JavaScript. For a text view run: node scripts/spec-board.mjs --json</p></noscript>
<script type="application/json" id="spec-board-data">${data}</script>
<script>${script}</script>
</body>
</html>
`;
}
