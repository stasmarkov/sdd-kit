#!/usr/bin/env node
// Stdio JSON-RPC MCP server for the workflow bridge. One JSON message per line.
//
//   node server.mjs [--host codex|cursor]
//
// The host comes from --host or the SDD_HOST environment variable and defaults to codex. No tool awaits
// a job, so every call returns at once. The server exposes no tool that approves a stack manifest.
import fs from 'node:fs'
import readline from 'node:readline'
import { fileURLToPath } from 'node:url'
import { Engine } from './engine.mjs'
import { validate } from './schema.mjs'
import { TOOLS } from './tools.mjs'

const PROTOCOL_VERSION = '2024-11-05'
const SERVER_INFO = { name: 'sdd-kit-workflow-bridge', version: '1.0.0' }

const BY_NAME = new Map(TOOLS.map((t) => [t.name, t]))

/**
 * Handles one JSON-RPC message.
 * @param {Engine} engine workflow engine
 * @param {object} message parsed request or notification
 * @returns {Promise<object|null>} the response, or null for a notification
 */
export async function handleMessage(engine, message) {
  const { id, method, params } = message
  const respond = (result) => ({ jsonrpc: '2.0', id, result })
  const fail = (code, text) => ({ jsonrpc: '2.0', id, error: { code, message: text } })
  if (id === undefined || id === null) return null
  switch (method) {
    case 'initialize':
      return respond({ protocolVersion: PROTOCOL_VERSION, capabilities: { tools: {} }, serverInfo: SERVER_INFO })
    case 'ping':
      return respond({})
    case 'tools/list':
      return respond({ tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) })
    case 'tools/call': {
      const tool = BY_NAME.get(params && params.name)
      if (!tool) return fail(-32602, `Unknown tool ${params && params.name}. Fix: call tools/list`)
      const input = (params && params.arguments) || {}
      const errors = validate(tool.inputSchema, input)
      if (errors.length) {
        const text = `Invalid input for ${tool.name}: ${errors.map((e) => `${e.path || '/'} (${e.keyword})`).join(', ')}`
        return respond({ content: [{ type: 'text', text }], isError: true })
      }
      try {
        const value = await engine[tool.method](input)
        return respond({ content: [{ type: 'text', text: JSON.stringify(value) }], structuredContent: value })
      } catch (e) {
        return respond({ content: [{ type: 'text', text: e.message }], isError: true })
      }
    }
    default:
      return fail(-32601, `Method not found: ${method}`)
  }
}

/**
 * Serves JSON-RPC lines from `input` to `output`, one call at a time.
 * @param {Engine} engine workflow engine
 * @param {NodeJS.ReadableStream} input request stream
 * @param {NodeJS.WritableStream} output response stream
 */
export function serve(engine, input, output) {
  let chain = Promise.resolve()
  const rl = readline.createInterface({ input })
  rl.on('line', (line) => {
    if (!line.trim()) return
    chain = chain.then(async () => {
      let message
      try {
        message = JSON.parse(line)
      } catch {
        output.write(`${JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } })}\n`)
        return
      }
      const response = await handleMessage(engine, message)
      if (response) output.write(`${JSON.stringify(response)}\n`)
    })
  })
  return new Promise((resolve) => rl.on('close', () => chain.then(resolve)))
}

function hostFromArgs(argv, env) {
  const i = argv.indexOf('--host')
  if (i !== -1 && argv[i + 1]) return argv[i + 1]
  return env.SDD_HOST || 'codex'
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
  try {
    const engine = new Engine({ host: hostFromArgs(process.argv.slice(2), process.env) })
    await serve(engine, process.stdin, process.stdout)
  } catch (e) {
    process.stderr.write(`${e.message}\n`)
    process.exit(1)
  }
}
