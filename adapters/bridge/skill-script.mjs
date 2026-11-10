// Loads a kit skill's script from either layout: `<root>/skills/<skill>/scripts/` in an installed runtime
// root, or `src/skills/<skill>/scripts/` in a source checkout.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { installedRoot } from '../lib/locate.mjs'

const BRIDGE_DIR = path.dirname(fileURLToPath(import.meta.url))

/**
 * Imports a script that lives in a skill directory. An installed root reads `<root>/skills` only; a source
 * checkout reads `src/skills`. The project's own `.codex/skills` or `.cursor/skills` is never searched.
 * @param {string} skill skill directory name
 * @param {string} file script file name under the skill's scripts/ folder
 * @param {string} [bridgeDir] directory of this file, for tests
 * @returns {Promise<object>} the script's module namespace
 * @throws {Error} when the script is missing from the detected layout; the message carries its fix
 */
export async function loadSkillScript(skill, file, bridgeDir = BRIDGE_DIR) {
  const base = installedRoot(bridgeDir) ? path.join(path.dirname(bridgeDir), 'skills') : path.join(path.dirname(path.dirname(bridgeDir)), 'skills')
  const target = path.join(base, skill, 'scripts', file)
  if (fs.existsSync(target)) return import(pathToFileURL(target).href)
  throw new Error(`Skill script ${skill}/scripts/${file} not found. Fix: reinstall the kit so skills/${skill}/scripts/ sits in the runtime root`)
}
