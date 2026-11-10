# Quality tools: Next.js

Commands and tool detail behind the core `/lint`, `/run-tests`, `/security-scan`, `/upgrade-deps`, `verification-gates` and the `code-quality` agent in a Next.js repo. The gate list itself comes from the stack manifest (`stack.json`); this file holds the options and examples. `<pm>` and `<pmx>` follow the package-manager rule in `verification-gates`.

## Gates

| Gate | Command | Auto-fix |
|------|---------|----------|
| Lint (ESLint) | `<pm> run lint` | yes, formatter-class rules only: `<pm> run lint -- --fix`, and Prettier when configured |
| Types | `<pmx> tsc --noEmit` | no |
| Build | `<pmx> next build` | no |
| Debug calls | grep changed files for `console.log(`, `debugger` | no |
| Unit and component tests | `<pmx> vitest run` (when Vitest is installed; otherwise `<pm> test`) | no |
| Browser journeys | `<pmx> playwright test` (when `playwright.config.*` exists and the change touches a journey) | no |

Never add `eslint-disable`, `// @ts-expect-error`, `.skip` or lower a coverage threshold to get to green.

## ESLint, TypeScript, Prettier

```bash
<pmx> eslint .
<pmx> eslint . --fix
<pmx> tsc --noEmit
<pmx> tsc --project tsconfig.json --noEmit
<pmx> prettier --check .
<pmx> prettier --write .
```

## Vitest

```bash
<pmx> vitest run                       # all unit and component tests
<pmx> vitest run --coverage            # v8 or istanbul, as configured
<pmx> vitest run src/components/JobCard.test.tsx
```

Test patterns (React Testing Library, MSW mocks built from the backend contract, Server Action tests) are in the `nextjs-testing` skill.

## Playwright

E2E runs in its own environment, never against the dev database. The `nextjs-testing` skill's `references/playwright-e2e.md` is the convention: `playwright.config.ts` `webServer` starts the backend with its own env and database and the Next.js app pointed at it, and the `db` setup project (`e2e/db.setup.ts`) wipes and seeds that database.

```bash
<pmx> playwright test                          # all journeys
<pmx> playwright test e2e/job-posting.spec.ts  # one journey
<pmx> playwright test --grep "AC-3:"           # one acceptance criterion (the colon keeps AC-3 from matching AC-30)
```

With `--url`, the config's `reuseExistingServer` picks up an e2e frontend already running there (local runs only). On failure, read the trace and screenshot paths Playwright prints (`test-results/`).

## Dependencies and security

```bash
npm audit --json          # or: pnpm audit --json / yarn npm audit --json / bun audit
npm outdated --json       # or: pnpm outdated / yarn outdated / bun outdated
<pmx> knip --dependencies # when installed
npm update <packages>     # or pnpm up <packages>
```

Server Actions and Route Handlers: every `'use server'` function and `app/**/route.ts` is a public endpoint. Each must re-verify the session and the caller's role or ownership on the server before it reads or changes data, and must validate its input.

```bash
grep -rln "'use server'\|\"use server\"" app/ src/ 2>/dev/null
find app src -name 'route.ts' -o -name 'route.js' 2>/dev/null
grep -n "auth()\|getServerSession\|cookies()\|verifySession\|redirect('/login')" <file>
grep -rn "dangerouslySetInnerHTML" app/ components/ src/ 2>/dev/null
```

Report an action or handler that changes data without a server-side session and role check as HIGH; one that relies on `middleware.ts` alone as MEDIUM. The rule that prevents this at write time is the project's `.cursor/rules/frontend-pages.mdc`.
