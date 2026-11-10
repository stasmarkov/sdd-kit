// How-to content for the interactive guide. Lists of skills, agents, and
// workflow phases come from catalog.js, and the worked example comes from
// example-data.js (both generated); keep this file to what a generator cannot
// know: intent, order, examples, and troubleshooting. Every string is plain
// text: renderers set it with textContent.
window.GUIDE = {
  product: 'SDD Kit',
  version: '4.0.0',
  repo: 'https://github.com/stasmarkov/sdd-kit',
  tagline: 'One front door, fixed pipelines, verified outcomes.',
  promise: 'Write down what "done" means, let the agent build it through gates, and approve the result as a human.',

  primer: {
    what: 'Claude Code is an AI coding agent that runs in your terminal (and in IDEs and a desktop app). It reads your project, edits files and runs commands, and asks your permission before it acts. SDD Kit adds a process on top: a written spec that a human approves, fixed pipelines with quality gates, and hooks that block risky actions.',
    install: [
      { label: 'macOS, Linux, WSL', code: 'curl -fsSL https://claude.ai/install.sh | bash' },
      { label: 'Windows PowerShell', code: 'irm https://claude.ai/install.ps1 | iex' },
      { label: 'Homebrew', code: 'brew install --cask claude-code' },
      { label: 'WinGet', code: 'winget install Anthropic.ClaudeCode' },
      { label: 'Check the install', code: 'claude --version' },
      { label: 'Start and sign in', code: 'claude' },
    ],
    installNote: 'Open a new terminal after installing. The first start opens the browser to sign in; you need a Claude account that includes Claude Code, or an API provider. Other install options and requirements are on the official setup page.',
    firstSession: [
      { do: 'Start in your project', how: 'cd into the project root and run claude. Claude Code works on the folder you start it in.' },
      { do: 'Ask in plain English', how: 'Describe what you want. Claude reads the code, proposes edits and runs commands to check them.' },
      { do: 'Find commands', how: 'Type / to list built-in commands and installed skills, the kit\'s /sdd among them. Keep typing to filter.' },
      { do: 'Answer permission prompts', how: 'Before it edits a file or runs a command, Claude asks. Allow it once, allow it for the rest of the session, or decline and say what to do instead.' },
      { do: 'Interrupt', how: 'Press Esc to stop the current response and redirect. The work done so far is kept.' },
      { do: 'Switch permission mode', how: 'Shift+Tab cycles the modes: the default asks before acting, accept-edits lets file edits through, and plan mode reads and plans without changing anything.' },
      { do: 'Start fresh', how: '/clear empties the conversation when you switch tasks. Files and specs on disk stay.' },
      { do: 'Get help', how: '/help lists the commands and shortcuts.' },
    ],
    glossary: [
      { term: 'Skill', meaning: 'A packaged set of instructions. Claude loads it when the task matches, or you start it by typing /name.', kitExample: '/sdd' },
      { term: 'Subagent', meaning: 'A separate Claude with its own context and tools that does one job and returns a summary.', kitExample: 'code-explorer' },
      { term: 'Workflow', meaning: 'A background script that runs many subagents through fixed phases. Watch it with /workflows.', kitExample: 'ship-feature' },
      { term: 'Hook', meaning: 'A script Claude Code runs on an event, such as before a shell command. It can block the action.', kitExample: 'block-dangerous' },
      { term: 'MCP server', meaning: 'A connector that gives Claude extra tools.', kitExample: 'Playwright MCP (browser), context7 (library docs)' },
      { term: 'Plugin', meaning: 'A bundle of skills, agents, hooks and MCP servers you install in one step.', kitExample: 'sdd-kit' },
      { term: 'CLAUDE.md', meaning: 'Project instructions Claude loads at the start of every session.', kitExample: 'src/CLAUDE.template.md' },
      { term: 'Spec', meaning: 'A kit term: a folder that says what "done" means, which a human approves before anything is built.', kitExample: '.ai/specs/spec-PROJ-123-<slug>/' },
    ],
    docsHref: 'https://code.claude.com/docs/en/overview',
    docs: [
      { label: 'Quickstart', href: 'https://code.claude.com/docs/en/quickstart' },
      { label: 'Setup and install', href: 'https://code.claude.com/docs/en/setup' },
      { label: 'Interactive mode and shortcuts', href: 'https://code.claude.com/docs/en/interactive-mode' },
    ],
    next: 'Then install the kit, run /framework-doctor, and start a small ticket with /sdd.',
  },

  install: {
    plugin: {
      label: 'Plugin (recommended for teams)',
      steps: [
        { text: 'Add the marketplace', code: '/plugin marketplace add stasmarkov/sdd-kit' },
        { text: 'Install the core plus the Laravel, Next.js and devenv add-ons (preset)', code: '/plugin install sdd-kit-laravel-nextjs@sdd-kit' },
        { text: 'Or pick your stack add-on and any optional ones', code: '/plugin install sdd-kit-laravel@sdd-kit' },
      ],
      note: 'You need Claude Code, git, jq, Node 18+ and Google Chrome (or Chromium selected with --browser chromium, see the README\'s MCP servers section). Without jq the guardrail hooks cannot read their input; without a browser, browser checks report "not run". In plugin mode skills are namespaced: /sdd-kit:sdd, /sdd-kit-ops:deploy. Playwright setup for plugin mode: see the INSTALLATION guide, section "Playwright in plugin mode".',
    },
    fileCopy: {
      label: 'File copy (into a project or ~/.claude)',
      steps: [
        { text: 'Clone the kit once, anywhere', code: 'git clone https://github.com/stasmarkov/sdd-kit.git' },
        { text: 'From your project root, preview what will change', code: '/path/to/sdd-kit/install.sh --project --full --dry-run' },
        { text: 'Install into this project', code: '/path/to/sdd-kit/install.sh --project --full' },
        { text: 'Pick stacks, or add optional add-ons', code: '/path/to/sdd-kit/install.sh --project --full --stack=laravel,nextjs --with=ops' },
        { text: 'Or install for all projects', code: '/path/to/sdd-kit/install.sh --user --full' },
      ],
      note: 'You need Claude Code, git, jq, Node 18+ and Google Chrome (or Chromium selected with --browser chromium, see the README\'s MCP servers section). Without jq the guardrail hooks cannot read their input; without a browser, browser checks report "not run". Run the installer from your project root: it installs into the .claude/ of the directory you run it from, so running it inside the kit clone installs the kit into itself. The installer merges into .claude/, never touches files it does not own, merges hooks into your settings.json (backup first), adds context7 and Playwright MCP to .mcp.json without overwriting your servers, and shows added / updated / removed files on every run. ',
    },
    npx: {
      label: 'Without cloning (npx)',
      steps: [
        { text: 'Preview from your project root', code: 'npx github:stasmarkov/sdd-kit install --project --dry-run' },
        { text: 'Install', code: 'npx github:stasmarkov/sdd-kit install --project' },
      ],
      note: 'You need Claude Code, git, jq, Node 18+ and Google Chrome (or Chromium selected with --browser chromium, see the README\'s MCP servers section). Without jq the guardrail hooks cannot read their input; without a browser, browser checks report "not run". Run it from your project root; it uses the same install.sh as a clone, so every flag works, and also needs bash. Add #v4.0.0 after the repo name to pin a release. The package is not published to npm.',
    },
    flags: [
      { flag: '--project | --user', meaning: 'Install into ./.claude or ~/.claude' },
      { flag: '--minimal | --full', meaning: 'Spec-driven core only, or everything in core (default)' },
      { flag: '--stack=laravel,nextjs', meaning: 'Stack add-ons (default on a fresh install); none for core only' },
      { flag: '--with=devenv,ops,design', meaning: 'Optional add-ons; a fresh install without --stack also adds devenv' },
      { flag: '--prune', meaning: 'On an upgrade from 2.x, make the installed add-ons exactly the selection (backed up)' },
      { flag: '--third-party', meaning: 'Pinned third-party skills from docs/third-party.md' },
      { flag: '--dry-run', meaning: 'Show changes, write nothing' },
      { flag: '--yes', meaning: 'No confirmation prompt' },
    ],
  },

  quickstart: [
    { title: 'Add the marketplace', claudeOnly: true, text: 'Inside Claude Code, register the kit\'s plugin marketplace. Prefer files in your repo? Use the file-copy installer instead (see install).', code: '/plugin marketplace add stasmarkov/sdd-kit' },
    { title: 'Install the plugin', claudeOnly: true, text: 'Install the preset: the core plus the Laravel, Next.js and devenv add-ons. For another stack, pick add-ons from the install section. Takes a minute.', code: '/plugin install sdd-kit-laravel-nextjs@sdd-kit' },
    { title: 'Check the install', hostAware: true, text: 'The doctor checks the install, the hook wiring and the MCP servers, and prints a fix for each problem. In plugin mode, confirm the hooks are listed under /hooks.', hostText: 'The doctor checks the install, the hook wiring and the MCP servers, and prints a fix for each problem. If your host asks you to trust hooks, approve the kit\'s hooks first.', code: '/framework-doctor' },
    { title: 'Give Claude project context', hostAware: true, text: 'In your Laravel + Next.js project, generate the business rules and architecture docs Claude reads before every task. Starting a new product? Run /product-brief instead.', hostTitle: 'Give the agent project context', hostText: 'In your project, generate the business rules and architecture docs the agent reads before every task. Starting a new product? Use the product-brief skill instead.', code: '/write-docs --type=all' },
    { title: 'Describe the work', hostAware: true, text: 'A ticket key or a sentence. /sdd proposes a route; you confirm.', hostText: 'A ticket key or a sentence. The sdd skill proposes a route; you confirm.', code: '/sdd PROJ-123' },
    { title: 'Approve the spec', text: 'For features, read spec-lite.md (one page) and choose Approve and build, Approve only (build it yourself later with /execute-task), Request changes, or Stop here.', hostText: 'For features, read spec-lite.md (one page) and choose Approve and build, Approve only (build it yourself later with the execute-task skill), Request changes, or Stop here.', code: '.ai/specs/spec-PROJ-123-<slug>/spec-lite.md' },
    { title: 'Let the pipeline ship', claudeOnly: true, text: 'Build, gates, converge, adversarial review, a browser acceptance walk, docs. Watch it in /workflows.', code: '/workflows' },
  ],

  afterSdd: {
    intro: '/sdd starts the work; these continue, check and finish it.',
    groups: [
      {
        id: 'continue', label: 'Continue',
        items: [
          { cmd: '/execute-task --spec=<id> --continue', when: 'Resume an approved spec task by task after /clear, a new day, or a switch to the other repo.' },
          { cmd: '/investigate "<question>"', when: 'Get a sourced answer and a recommendation before you decide.' },
        ],
      },
      {
        id: 'check', label: 'Check',
        items: [
          { cmd: '/run-tests', when: 'Run the project\'s test suite with the stack\'s runner; --frontend runs the frontend tests and --e2e runs the browser journeys.' },
          { cmd: '/deep-review', when: 'Get a blocking verdict before merge from a reviewer that never saw your prompt.' },
          { cmd: '/progress', when: 'Where was I: task progress per spec and the next task. --health adds a project health snapshot.' },
          { cmd: '/spec-board', when: 'See every spec by status, with approval and open-question warnings and AC coverage.' },
        ],
      },
      {
        id: 'finish', label: 'Finish',
        items: [
          { cmd: '/open-pr --spec=<id> --report=<report>', when: 'Open spec-traced PRs, one per repo, backend first and cross-linked.' },
          { cmd: '/learn "<finding>"', when: 'Turn a review finding, bug class or CI failure into a durable guard, so the mistake cannot recur.' },
        ],
      },
    ],
  },

  browser: 'Every workflow drives its browser steps (Reproduce, Visual and Acceptance) through the Playwright MCP server the kit ships: a pinned version that runs headless with an isolated profile. Checks assert on the page\'s accessibility snapshot, and console errors and failed network requests are checked on every page. When Playwright MCP is unavailable, Claude in Chrome is the fallback; when neither is, the step is reported as "not run", never as a pass. With a playwright.config in the frontend, ship-feature turns the acceptance walk into an e2e/<spec>.spec.ts test, so the check keeps running as a regression test.',

  specBoard: {
    what: 'A read-only Kanban of your specs: columns by status (draft, approved, in progress, done), backlog slices that have no spec yet, warnings for missing approval and open questions, and acceptance-criteria coverage per spec. It reads the spec files themselves, so it cannot drift from them.',
    commands: [
      { label: 'In a session', code: '/spec-board' },
      { label: 'Without Claude', code: 'npx github:stasmarkov/sdd-kit spec-board --serve' },
      { label: 'Snapshot', code: 'npx github:stasmarkov/sdd-kit spec-board --out /tmp/spec-board.html' },
      { label: 'Split repos', code: 'npx github:stasmarkov/sdd-kit spec-board api/.ai/specs web/.ai/specs --serve' },
    ],
    note: 'The npx form needs Node 18+ and git, and works in any repo that has .ai/specs. Add #v4.0.0 after the repo name to pin a release. The package is not published to npm.',
    exampleHref: 'example-board.html',
  },

  stackTrust: {
    text: 'A stack is data in a stack.json manifest. /new-stack drafts one for your own stack; a third-party manifest runs only after you, the user, approve it with /stack-trust. Approvals are kept in ~/.claude/sdd-kit/trusted-stacks.json.',
    label: 'Stack manifest reference',
    href: 'reference/stack-manifest.html',
  },

  stacks: {
    now: 'Laravel API + Next.js',
    roadmap: 'Symfony and Java as first-class stacks, and Drupal and Swift beyond their early previews; add your own with /new-stack',
    href: 'https://github.com/stasmarkov/sdd-kit/blob/v4.0.0/README.md',
  },

  routes: [
    {
      id: 'trivial', label: 'Trivial change', icon: '·',
      when: 'Clear change, about three files or fewer, no design choice: copy fix, config tweak, rename.',
      example: '/sdd Rename the "Bill" button to "Invoice" on the billing page',
      launches: 'simple-task skill', spec: 'none',
      outputs: ['Diff', 'Gate results'],
      done: 'Gates are green.',
    },
    {
      id: 'bug', label: 'Bug', icon: '!',
      when: 'Existing behavior is wrong: a symptom, an error, a regression, "it used to work".',
      example: '/sdd On every invoices page the last invoice is missing — 10 per page shows 9',
      launches: 'fix-bug workflow', spec: 'none — the bug pipeline is the spec',
      outputs: ['Root cause with evidence', 'Regression test (red → green)', 'Minimal fix', 'Manual test steps'],
      done: 'Verdict FIXED: the regression test went red → green, gates are green, and the original report was re-walked end to end.',
    },
    {
      id: 'decision', label: 'Technology decision', icon: '?',
      when: 'A choice between technologies or approaches must be made before building.',
      example: '/sdd Should invoice exports run on Horizon queues or a scheduled batch job?',
      launches: 'tech-research workflow', spec: 'ADR instead of a spec',
      outputs: ['Weighted criteria', 'Sourced research per option', 'Architecture decision record'],
      done: 'The ADR is written and signed off by a human.',
    },
    {
      id: 'feature', label: 'Feature', icon: '+',
      when: 'Anything else that adds or changes behavior.',
      example: '/sdd PROJ-123: Export invoices as CSV',
      launches: 'write-spec → your approval → ship-feature workflow', spec: 'sized XS / S / M / L',
      outputs: ['Spec folder (spec-lite.md, tasks.md, …)', 'Implemented tasks', 'Adversarial review findings', 'Updated docs', 'Manual test plan'],
      done: 'Gates green, no confirmed blocking review findings, and acceptance re-walks the ticket\'s scenario.',
      gate: 'ship-feature never starts on a spec you have not approved in the current conversation. Choose Approve only to build it yourself with /execute-task instead.',
    },
    {
      id: 'audit', label: 'Security audit', icon: '§',
      when: 'Existing code needs a deep security audit with coverage tracking and verified leads, not a quick checklist.',
      example: '/sdd Audit the security of the payments module',
      launches: 'security-audit workflow', spec: 'none — the audit pipeline is the spec',
      outputs: ['Validated coverage ledger', 'findings.json with verified leads', 'Report files and a summary in .ai/reports/'],
      done: 'Both validators pass and every retained finding was verified; otherwise the run is incomplete and says why.',
    },
    {
      id: 'shipped', label: 'Already shipped', icon: '✓',
      when: 'Code exists and needs a QA plan or documentation, not changes.',
      example: '/sdd Write the QA plan and docs for the invoice export we shipped last sprint',
      launches: 'qa-and-docs workflow', spec: 'uses an existing spec, paths, or a git range',
      outputs: ['Traceable QA plan', 'User and developer docs'],
      done: 'The grader passes coverage and phantom-link checks.',
    },
    {
      id: 'newapp', label: 'New app', icon: '◇',
      when: 'Little or no code exists yet for the target. Start from the idea with /product-brief; /sdd offers it when there is no brief.',
      example: '/product-brief "Customer portal for the billing API"  →  /sdd <the first slice\'s Run line>',
      launches: '/product-brief (brief + sliced backlog) → greenfield-build workflow', spec: 'product brief + architecture decision + one vertical slice',
      outputs: ['product-brief.md: roles, MVP scope, draft business rules, metrics', 'backlog.md: sized slices, each with its /sdd line', 'Scaffold + CI', 'One end-to-end vertical slice', 'Handoff docs'],
      done: 'The slice passes gates and acceptance, and it is marked shipped in backlog.md.',
    },
  ],

  pipeline: [
    { id: 'intake', title: 'Intake', who: 'agent + you', text: '/sdd routes the request; /write-spec sizes it, investigates the code, researches, and asks clarifying questions. A fresh agent then lists hidden assumptions.' },
    { id: 'approve', title: 'Human review', who: 'you', text: 'Read the one-page spec-lite.md against the code, business rules, and edge cases. The most important fifteen minutes of the feature. Spec lint runs before approval, and the spec stays draft while blockers remain.', accent: true, href: 'reference/stack-manifest.html' },
    { id: 'execute', title: 'Execute', who: 'agent', text: 'One task at a time, each with its own verification. Session state survives /clear, a new day, or a switch to the other repo.' },
    { id: 'gates', title: 'Gates', who: 'tools', text: 'Formatter, static analysis, debug-call scan, tests (Pest, Vitest, and Playwright e2e journeys on web stacks), type-check, production build. "Tool unreachable" is never a pass. When CI goes red later, /fix-ci restores the gates without weakening them.' },
    { id: 'converge', title: 'Converge', who: 'agent', text: 'Compare the code with the spec; append tasks for gaps instead of patching silently, then build and gate again.' },
    { id: 'review', title: 'Independent review', who: 'fresh agent', text: 'An adversarial reviewer in a fresh context tries to refute each finding; only survivors are reported.' },
    { id: 'acceptance', title: 'Acceptance', who: 'agent', text: 'Re-walk the original request end to end: in the browser through the built-in Playwright MCP (headless, Claude in Chrome as fallback), over HTTP for APIs, or in the simulator. Green tests are not done, and a browser that could not run is reported as "not run". ship-feature saves the walk as an e2e test traced to the AC ids.' },
    { id: 'docs', title: 'Docs & knowledge', who: 'agent', text: 'Update gotchas, invariants, contracts, and decisions so the next session starts smarter.' },
  ],

  spec: {
    folder: '.ai/specs/spec-PROJ-123-invoice-csv-export/',
    naming: 'Named by ticket key, or spec-YYYYMMDD-HHMM-<slug> without a ticket. Created atomically, so parallel sessions never collide. Legacy numeric ids still resolve.',
    sizes: [
      { size: 'XS', artifacts: 'No spec — use the bug route or simple-task' },
      { size: 'S', artifacts: 'spec-lite.md + tasks.md' },
      { size: 'M / L', artifacts: 'Full set: + business rules, decisions, references, manual test — only when needed' },
    ],
    frontmatter: [
      { key: 'status', meaning: 'draft → approved → in-progress → done' },
      { key: 'ticket', meaning: 'Tracker key, e.g. PROJ-123' },
      { key: 'stakeholders', meaning: 'Who must be able to read and approve it' },
      { key: 'approved_by / approved_at', meaning: 'Set by /sdd when you approve' },
      { key: 'size', meaning: 'XS / S / M / L — decides which files exist' },
    ],
    sections: [
      { name: 'Scope', meaning: 'In scope and, explicitly, out of scope',
        example: 'In: "Download CSV" on the invoices list, current filters applied. Out: PDF export, scheduled emails.' },
      { name: 'Must NOT change', meaning: 'Existing behavior that stays identical — a regression guard',
        example: 'The invoices list page size, sorting, and the existing JSON API response.' },
      { name: 'Acceptance criteria', meaning: 'AC-1… as WHEN … THE SYSTEM SHALL … or Given / When / Then, each mapped to a test or manual step',
        example: 'AC-1 WHEN a customer exports with the "unpaid" filter THE SYSTEM SHALL return only that customer\'s unpaid invoices. → feature test' },
      { name: 'Boundaries', meaning: 'Always / Ask first / Never',
        example: 'Always stream the file. Ask first before adding a queue. Never include other customers\' invoices.' },
      { name: 'Open questions', meaning: 'Must be empty or accepted before status: approved',
        example: 'Which timezone applies to the date-range filter? (answered: the customer\'s account timezone)' },
    ],
    example: 'WHEN a customer requests a CSV export with the "unpaid" filter THE SYSTEM SHALL return only that customer\'s unpaid invoices, newest first.',
  },

  hooks: [
    { event: 'PreToolUse · Bash', does: 'Block destructive commands (rm -rf /, force-push to main, DROP DATABASE); enforce Conventional Commits' },
    { event: 'PreToolUse · Read/Grep/Glob/Bash', does: 'Always block find /; when context usage is above the threshold, also block unbounded reads of huge files and repo-wide searches' },
    { event: 'PreToolUse · Write/Edit', does: 'Test-first: block edits to core code that has no test (opt out with CLAUDE_SKIP_TEST_FIRST=1)' },
    { event: 'PostToolUse · Write/Edit', does: 'Lint changed files; scan for secrets' },
    { event: 'PostToolUse · Bash/WebFetch/MCP', does: 'Scan external content for prompt injection' },
    { event: 'UserPromptSubmit', does: 'Flag dangerous verbs; hint which spec files to load' },
    { event: 'Stop · SubagentStop', does: 'Check tests and saved state before finishing' },
    { event: 'SessionStart', does: 'Load project context and the active spec at the start of every session' },
    { event: 'PreCompact · SessionStart (compact)', does: 'Save and re-inject session state across compaction' },
    { event: 'SessionEnd', does: 'Write a session summary to .ai/session/' },
    { event: 'Notification', does: 'Desktop notification when Claude needs you' },
  ],

  invokeModes: {
    both: 'You can type /name, and Claude may also use it on its own when the task matches.',
    manual: 'Only you can start it by typing /name — reserved for side effects such as deploys, rollbacks, migrations, and dependency upgrades.',
    auto: 'Reference material Claude loads by itself when relevant; it has no slash command.',
  },

  workflowsDirect: {
    text: 'Every workflow can also be started without /sdd — by name as a slash command, or with explicit arguments. /sdd is still recommended: it confirms the route and collects inputs first.',
    examples: [
      { label: 'By name', code: '/fix-bug "On every invoices page the last invoice is missing"' },
      { label: 'Build an approved spec', code: 'Workflow({ name: "ship-feature", args: { spec: "PROJ-123" } })' },
      { label: 'Split repos', code: 'Workflow({ name: "fix-bug", args: { bug: "…", repos: { backend: "../api", frontend: "../web" } } })' },
    ],
  },

  addons: [
    { name: 'sdd-kit-laravel-nextjs', install: { plugin: '/plugin install sdd-kit-laravel-nextjs@sdd-kit', fileCopy: 'cd /path/to/your-project && /path/to/sdd-kit/install.sh --project --full --stack=laravel,nextjs' }, what: 'Preset: the core plus the Laravel, Next.js and devenv add-ons. Installing the core alone gives no stack knowledge', skills: [] },
    { name: 'sdd-kit-laravel', install: { plugin: '/plugin install sdd-kit-laravel@sdd-kit', fileCopy: 'cd /path/to/your-project && /path/to/sdd-kit/install.sh --project --full --stack=laravel' }, what: 'Laravel API development: Laravel 12, Pest, DTO-first and service-repository skills and the laravel-backend-dev agent', skills: ['laravel-12', 'pest-3', 'dto-first', 'service-repository'] },
    { name: 'sdd-kit-nextjs', install: { plugin: '/plugin install sdd-kit-nextjs@sdd-kit', fileCopy: 'cd /path/to/your-project && /path/to/sdd-kit/install.sh --project --full --stack=nextjs' }, what: 'Next.js frontend development: Next.js 15, TypeScript, Tailwind, testing and auth skills and the nextjs-frontend-dev agent', skills: ['nextjs-15', 'typescript', 'tailwind-4', 'nextjs-testing'] },
    { name: 'sdd-kit-devenv', install: { plugin: '/plugin install sdd-kit-devenv@sdd-kit', fileCopy: 'cd /path/to/your-project && /path/to/sdd-kit/install.sh --project --full --with=devenv' }, what: 'Local development environment: ddev and docker skills', skills: ['ddev', 'docker'] },
    { name: 'sdd-kit-ops', install: { plugin: '/plugin install sdd-kit-ops@sdd-kit', fileCopy: 'cd /path/to/your-project && /path/to/sdd-kit/install.sh --project --full --with=ops' }, what: 'Deploy, rollback, feature flags, health checks, incident response, ops analysis', skills: ['deploy', 'rollback', 'feature-flag', 'health-check', 'incident'] },
    { name: 'sdd-kit-ios', install: { plugin: '/plugin install sdd-kit-ios@sdd-kit', fileCopy: 'cd /path/to/your-project && /path/to/sdd-kit/install.sh --project --full --stack=ios' }, what: 'Early preview. iOS / Swift: SwiftUI and Swift Testing skills, ios-mobile-dev agent, templates', skills: ['ios-native', 'swift-testing'] },
    { name: 'sdd-kit-drupal', install: { plugin: '/plugin install sdd-kit-drupal@sdd-kit', fileCopy: 'cd /path/to/your-project && /path/to/sdd-kit/install.sh --project --full --stack=drupal' }, what: 'Early preview. Drupal 11 module development', skills: ['drupal-11'] },
    { name: 'sdd-kit-design', install: { plugin: '/plugin install sdd-kit-design@sdd-kit', fileCopy: 'cd /path/to/your-project && /path/to/sdd-kit/install.sh --project --full --with=design' }, what: 'UI/UX design skill and advisor agent', skills: ['design-ui'] },
  ],

  addonsNote: 'These commands add an add-on to a project. On a fresh install, --with also brings the default stacks (laravel, nextjs) and devenv; add --stack=none for core plus that add-on only.',

  everydayIntro: 'More commands for situations outside the /sdd flow. /sdd starts the work and the after-/sdd set continues, checks and finishes it; these cover the rest.',
  everyday: [
    { task: 'Small change without ceremony', code: '/simple-task "add a created_at column to the export"' },
    { task: 'Start an approved spec task by task', code: '/execute-task --spec=PROJ-123' },
    { task: 'CI is red on a PR', code: '/fix-ci 482' },
    { task: 'Fold feedback into the backlog', code: '/product-brief --intake "<sprint review notes>"' },
    { task: 'Frontend and journey tests', code: '/run-tests --frontend   ·   /run-tests --e2e "AC-2:"' },
    { task: 'Review a branch like CI does', code: '/deep-review --depth=standard --branch=<branch> --base=main' },
    { task: 'Project health snapshot', code: '/progress --health' },
    { task: 'Board snapshot to attach to a ticket', code: '/spec-board --out spec-board.html' },
    { task: 'Pin models for a reproducible team run (current IDs: docs/effort-guidelines.md)', code: 'args: { models: { deep: "<full model id>" } }' },
  ],

  troubleshooting: [
    { problem: 'Hooks never block anything', fix: 'Run /framework-doctor. Plugin mode: the hooks come from the plugin, so check jq --version (without jq they fail open) and confirm they are listed under /hooks. File copy: re-run the installer from your project root (it merges the hooks into settings.json), then check /hooks in a new session.' },
    { problem: 'A skill is "not found"', fix: 'File-copy skills must be flat: .claude/skills/<name>/SKILL.md. In plugin mode use the namespace: /sdd-kit:<name>.' },
    { problem: 'Old command like /upstream:create-spec', fix: 'The 1.x names (here: /write-spec) still redirect in 3.x and go in a later release; see the migration table in INSTALLATION.md.' },
    { problem: 'Installer stops with "jq is required"', fix: 'Install jq (brew install jq / apt-get install jq); the hook scripts need it too.' },
    { problem: 'Browser checks report "not run"', fix: 'Run claude mcp list and check that playwright is connected. It starts through npx, so Node must be on your PATH, and the first start downloads the package. Setup differs per install mode: see the Playwright sections of the INSTALLATION guide. Claude in Chrome works as a fallback.' },
    { problem: 'Spec board finds no specs', fix: 'It reads ./.ai/specs, so run it from the repo root, or pass the folders: /spec-board api/.ai/specs web/.ai/specs.' },
    { problem: 'A workflow ran on the wrong model', fix: 'Phases use tiers (deep / standard / light). Pin full model IDs per run with args.models; current IDs are in docs/effort-guidelines.md.' },
    { problem: 'Spec ID collisions', fix: 'Use a ticket key (spec-PROJ-123-…) or let the timestamp id apply; never number specs by hand.' },
  ],

  roles: [
    { role: 'New to Claude Code', focus: 'Read the primer, install the kit, run /write-docs --type=all in your Laravel + Next.js project (new product: /product-brief), then run /sdd on a small ticket, then read Hireboard chapter 04 to see a whole feature go through the kit.' },
    { role: 'Developer', focus: 'Start every piece of work with /sdd; keep CLAUDE.md short; promote repeated mistakes into rules, skills, or hooks with /learn.' },
    { role: 'Tech lead', focus: 'Pin the plugin version, review specs before implementation, keep CI gates identical to local gates, rerun evals on upgrades.' },
    { role: 'PM / client', focus: 'Read and approve spec-lite.md — one page in plain language. Open the spec board to see what awaits approval. Ask for the stakeholder output style for summaries.' },
    { role: 'QA', focus: 'qa-and-docs turns shipped code and acceptance criteria into a traceable test plan.' },
  ],

  links: [
    { label: 'Getting started', href: 'reference/getting-started.html' },
    { label: 'Installation & upgrade', href: 'reference/installation.html' },
    { label: 'Playwright in plugin mode', href: 'reference/installation.html#playwright-in-plugin-mode' },
    { label: 'Stack manifest', href: 'reference/stack-manifest.html' },
    { label: 'Usage examples', href: 'reference/usage-examples.html' },
    { label: 'Worked example: Hireboard', href: 'examples/job-board/README.html' },
    { label: 'Example spec board', href: 'example-board.html' },
    { label: 'Spec board skill', href: 'https://github.com/stasmarkov/sdd-kit/blob/v4.0.0/plugins/sdd-kit/skills/spec-board/SKILL.md' },
    { label: 'Plugin mode', href: 'reference/plugin-mode.html' },
    { label: 'Multi-repo', href: 'reference/multi-repo.html' },
    { label: 'Model tiers', href: 'reference/effort-guidelines.html' },
    { label: 'Third-party components', href: 'reference/third-party.html' },
  ],
};
