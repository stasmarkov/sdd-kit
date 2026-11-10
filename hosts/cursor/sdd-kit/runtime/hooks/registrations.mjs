import fs from 'node:fs';
import { locateRuntime } from './dispatch.mjs';

const TOOL_EVENTS = new Set(['PreToolUse', 'PostToolUse']);
const SHELL_TOOLS = new Set(['Bash']);

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

/**
 * Host event name for a Claude event, preferring a tool-specific mapping
 * ("PreToolUse:Bash") over the plain one. Returns null when the host has no such event.
 */
function hostEvent(table, event, kind) {
  const specific = kind ? `${event}:${kind}` : null;
  if (specific && Object.hasOwn(table, specific)) return table[specific];
  return Object.hasOwn(table, event) ? table[event] : null;
}

/** Splits one tool-event hook into host registrations, one per host event and tool group. */
function expand(hook, cfg) {
  if (!TOOL_EVENTS.has(hook.event) || !hook.matcher) {
    const event = hostEvent(cfg.hookEvents, hook.event, null);
    return event ? [{ ...hook, event }] : [];
  }
  const groups = new Map();
  for (const token of hook.matcher.split('|')) {
    const kind = SHELL_TOOLS.has(token) ? 'Bash' : token === 'Write' || token === 'Edit' ? 'Write' : null;
    const event = hostEvent(cfg.hookEvents, hook.event, kind);
    if (!event) continue;
    const tool = kind && Object.hasOwn(cfg.hookTools, token) ? cfg.hookTools[token] : token;
    const tools = groups.get(event) || [];
    if (!tools.includes(tool)) tools.push(tool);
    groups.set(event, tools);
  }
  return [...groups].map(([event, tools]) => ({ ...hook, event, matcher: tools.join('|') }));
}

/**
 * Hook registrations a host should emit, and the hooks it cannot carry. Core hooks, the selected
 * add-ons' hooks and the host's guard hooks get host event names and tool matchers and are
 * deduplicated. Prompt-type hooks are skipped (the host runs no prompt hooks); a command hook whose
 * event or tools the host lacks, wholly or for some tools, is listed under `dropped`.
 *
 * The host table and stacks.json come from the runtime root (or the source checkout), as the
 * dispatcher reads them; the registry's own `hosts` section wins over hosts.json.
 *
 * @param {string} host Host key in the host table (claude, codex, cursor).
 * @param {{plugins?: string[], registry?: object, hostsFile?: string}} [opts] plugins are add-on
 *   keys under hooks.addons; registry is the parsed stacks.json (read from the runtime when omitted).
 * @returns {{entries: {event: string, matcher?: string, script: string, timeout?: number, async?: boolean}[],
 *   dropped: {event: string, matcher?: string, script: string}[]}}
 * @throws {Error} for a host the table does not list
 */
export function hostHookPlan(host, { plugins = [], registry, hostsFile } = {}) {
  const rt = locateRuntime();
  const reg = registry || readJson(rt.stacksJson);
  const hosts = reg.hosts || readJson(hostsFile || rt.hostsFile).hosts;
  if (!Object.hasOwn(hosts, host)) throw new Error(`unknown host "${host}"; use one of: ${Object.keys(hosts).join(', ')}`);
  const cfg = hosts[host];
  const addons = reg.hooks.addons || {};
  const source = [
    ...reg.hooks.core,
    ...plugins.filter((p) => Object.hasOwn(addons, p)).flatMap((p) => addons[p].hooks || [])
  ];
  const seen = new Set();
  const entries = [];
  const dropped = [];
  const add = (entry) => {
    const key = `${entry.event}\u0000${entry.matcher || ''}\u0000${entry.script}`;
    if (seen.has(key)) return;
    seen.add(key);
    entries.push(entry);
  };
  for (const hook of source) {
    if (hook.type === 'prompt') continue;
    const expanded = expand(hook, cfg);
    const carried = expanded.flatMap((e) => (e.matcher ? e.matcher.split('|') : []));
    const tokens = hook.matcher && TOOL_EVENTS.has(hook.event) ? hook.matcher.split('|') : [];
    const lost = tokens.filter((t) => {
      const kind = SHELL_TOOLS.has(t) ? 'Bash' : t === 'Write' || t === 'Edit' ? 'Write' : null;
      const mapped = kind && Object.hasOwn(cfg.hookTools, t) ? cfg.hookTools[t] : t;
      return !carried.includes(mapped);
    });
    if (!expanded.length) dropped.push({ event: hook.event, ...(hook.matcher ? { matcher: hook.matcher } : {}), script: hook.script });
    else if (lost.length) dropped.push({ event: hook.event, matcher: lost.join('|'), script: hook.script });
    expanded.forEach(add);
  }
  (cfg.guardHooks || []).forEach((g) => add({ ...g }));
  return { entries, dropped };
}

/**
 * The registrations of {@link hostHookPlan} alone.
 * @param {string} host Host key in the host table.
 * @param {{plugins?: string[], registry?: object, hostsFile?: string}} [opts] as for hostHookPlan
 * @returns {{event: string, matcher?: string, script: string, timeout?: number, async?: boolean}[]}
 */
export function hostHookEntries(host, opts = {}) {
  return hostHookPlan(host, opts).entries;
}
