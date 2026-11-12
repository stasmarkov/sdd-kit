// Per-host content for the guide's host selector. Claude Code is the default and its content lives in
// guide-data.js; this file holds the Codex and Cursor variants. Every `code` string below appears
// verbatim in src/docs/INSTALLATION.md or src/docs/GETTING-STARTED.md (tools/test/host-guide.test.mjs).
window.GUIDE_HOSTS = {
  default: 'claude',
  order: ['claude', 'codex', 'cursor'],
  hosts: {
    claude: { label: 'Claude Code', prefix: '/' },
    codex: {
      label: 'Codex',
      prefix: '$',
      install: {
        plugin: {
          label: 'Plugin',
          steps: [
            { text: 'Add the kit marketplace', code: 'codex plugin marketplace add stasmarkov/sdd-kit' },
            { text: 'Install the core plugin', code: 'codex plugin add sdd-kit@sdd-kit' },
          ],
          note: 'Codex support is an unverified preview. You need Codex, git, jq and Node 20+. Codex plugins cannot ship agents, so the plugin reaches the kit\'s agents through the sdd-runtime skill. Invoke skills with $, for example $sdd.',
        },
        fileCopy: {
          label: 'File copy (into a project or ~/.codex)',
          steps: [
            { text: 'From your project root, preview what will change', code: 'bash install.sh --host codex --project --dry-run' },
            { text: 'Install into this project', code: 'bash install.sh --host codex --project' },
          ],
          note: 'Codex support is an unverified preview. You need Codex, git, jq and Node 20+. Skills go to .agents/skills and agents to .codex/agents. Run the installer from your project root. Windows is not supported.',
        },
        npx: {
          label: 'Without cloning (npx)',
          steps: [
            { text: 'Install from your project root', code: 'npx github:stasmarkov/sdd-kit install --host codex --project' },
          ],
          note: 'Codex support is an unverified preview. It runs the same install.sh as a clone, so every Codex flag works, and needs Node 20+. The package is not published to npm.',
        },
      },
      flags: [
        { flag: '--project | --user', meaning: 'Install into this project or into ~/.codex' },
        { flag: '--stack=LIST', meaning: 'Stack add-ons; none for core only' },
        { flag: '--with=LIST', meaning: 'Optional add-ons' },
        { flag: '--prune', meaning: 'On an upgrade, remove installed add-ons that are not selected (backed up)' },
        { flag: '--dry-run', meaning: 'Show changes, write nothing' },
        { flag: '--yes', meaning: 'No confirmation prompt' },
        { flag: '--uninstall', meaning: 'Remove only what the kit recorded' },
      ],
    },
    cursor: {
      label: 'Cursor',
      prefix: '/',
      install: {
        fileCopy: {
          label: 'File copy (into a project or ~/.cursor)',
          steps: [
            { text: 'From your project root, preview what will change', code: 'bash install.sh --host cursor --project --dry-run' },
            { text: 'Install into this project', code: 'bash install.sh --host cursor --project' },
          ],
          note: 'Cursor support is an unverified preview. You need Cursor, git, jq and Node 20+. Skills go to .cursor/skills, agents to .cursor/agents and rules to .cursor/rules. If Cursor\'s Third-Party Imports also loads a Claude install of the kit, turn it off in Settings > Agents > Third-Party Imports so the kit does not load twice. Windows is not supported.',
        },
        npx: {
          label: 'Without cloning (npx)',
          steps: [
            { text: 'Install from your project root', code: 'npx github:stasmarkov/sdd-kit install --host cursor --project' },
          ],
          note: 'Cursor support is an unverified preview. It runs the same install.sh as a clone, so every Cursor flag works, and needs Node 20+. The package is not published to npm.',
        },
      },
      flags: [
        { flag: '--project | --user', meaning: 'Install into this project or into ~/.cursor' },
        { flag: '--stack=LIST', meaning: 'Stack add-ons; none for core only' },
        { flag: '--with=LIST', meaning: 'Optional add-ons' },
        { flag: '--prune', meaning: 'On an upgrade, remove installed add-ons that are not selected (backed up)' },
        { flag: '--dry-run', meaning: 'Show changes, write nothing' },
        { flag: '--yes', meaning: 'No confirmation prompt' },
        { flag: '--uninstall', meaning: 'Remove only what the kit recorded' },
      ],
    },
  },
};
