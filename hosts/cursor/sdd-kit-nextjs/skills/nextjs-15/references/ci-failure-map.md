# CI failure map: Next.js

Root causes seen most often per gate in a Next.js repo, with the honest fix. Load from `/fix-ci` Step 2 once the failing step is classified. Every "Do not" here is on the protected list in the core SKILL.md and needs explicit user confirmation.

## Cross-cutting rows

| Symptom | Cause | Fix |
|---------|-------|-----|
| `Module not found: Can't resolve '@/components/Button'` only in CI | macOS file systems are case-insensitive by default, Linux runners are not | Make the import match the file. For a filename-only case change use `git mv -f button.tsx Button.tsx` so git records it |
| `npm ci`: `package.json and package-lock.json ... are not in sync` | Manifest changed without the lockfile | `npm install` with CI's Node major, then commit the lockfile |
| `ERR_PNPM_OUTDATED_LOCKFILE` | Same, for pnpm | `pnpm install` locally (no `--frozen-lockfile`), commit `pnpm-lock.yaml` |
| `yarn install --immutable`: lockfile would be modified | Same, for yarn | `yarn install`, commit `yarn.lock` |
| `ERESOLVE unable to resolve dependency tree` | A library whose `peerDependencies` predate React 19 / Next.js 15 | Upgrade that library to a version that supports them, or replace it. `--legacy-peer-deps`, `--force`, and `overrides` are protected |
| Two lockfiles (`package-lock.json` and `pnpm-lock.yaml`) | Mixed package managers | Ask which manager is canonical, then remove the other and set `packageManager` in package.json |
| Audit: `npm audit --audit-level=high` failing on a new advisory | Vulnerable version in the lock | `npm update package` within the constraint; a major bump goes to `/upgrade-deps` |

## ESLint

- ESLint 9 uses flat config (`eslint.config.mjs`). A legacy `.eslintrc*` alongside it, or a plugin without flat-config support, produces config errors rather than lint errors. Fix the config so it loads; do not drop the plugin's rules.
- Next.js 15.5 deprecates `next lint`. When the `lint` script still calls it and the warning breaks a `--max-warnings=0` run, move the script to the ESLint CLI with the same config (`eslint .`) instead of loosening the warning budget.
- `react-hooks/exhaustive-deps` and `@typescript-eslint/no-unused-vars` findings are usually real. Fix the dependency list or remove the dead code.
- Do not: add `eslint-disable*` comments, turn rules off, or downgrade them to `warn`.

## TypeScript (tsc) and `next build`

| Error | Cause | Fix |
|-------|-------|-----|
| `Type '{ params: { id: string } }' does not satisfy the constraint 'PageProps'` | In Next.js 15, `params` and `searchParams` are Promises | Type them as `Promise<{ id: string }>` and `await params` in the Server Component. In Client Components use `React.use(params)` |
| `cookies()` / `headers()` used synchronously | Both are async in Next.js 15 | `const cookieStore = await cookies()` |
| `useSearchParams() should be wrapped in a suspense boundary at page "/x"` | A Client Component reads search params during static prerender | Wrap that component in `<Suspense fallback={…}>` |
| `Error occurred prerendering page "/x"` from a `fetch` | The build tries to call the API, which CI does not run | Make the route dynamic (`export const dynamic = 'force-dynamic'`) or fetch at request time. Do not point builds at production |
| `You're importing a component that needs "server-only"` / hooks in a Server Component | Server/client boundary crossed | Move the hook usage into a `'use client'` leaf, or keep server-only code out of client imports (`nextjs-15` skill, `references/server-components.md`) |
| Build-time `undefined` for `NEXT_PUBLIC_*` | Public env vars are inlined at build time and CI does not set them | Add the variable to the build job's `env:` (devops-engineer). Never commit real values |
| Type errors only in CI | `tsconfig` `include` misses generated `.next/types` locally, or a stale `next-env.d.ts` | Run `<pm> run build` locally, which regenerates route types, and fix what it reports |

Do not: set `typescript.ignoreBuildErrors` or `eslint.ignoreDuringBuilds`, add `@ts-ignore` / `@ts-expect-error`, cast through `any`, or relax `strict`.

## Vitest

Test-writing and config patterns for this layer: `nextjs-testing` skill.

- `ReferenceError: document is not defined` → the test needs `environment: 'jsdom'` (or `happy-dom`) in `vitest.config.*` or a per-file `// @vitest-environment jsdom` directive.
- Snapshot mismatch → decide whether the UI change is intended. Intended → update with `vitest run -u` for that file only and say so in the report. Unintended → it is a regression; hand off to `/sdd` bug.
- Fake-timer leaks between tests → restore with `vi.useRealTimers()` in `afterEach`.

## Playwright

| Symptom | Cause | Fix |
|---------|-------|-----|
| `Executable doesn't exist at …/chromium-…` | Browsers not installed in CI | `<pmx> playwright install --with-deps chromium` in the workflow (devops-engineer; `<pmx>` per the `verification-gates` package-manager rule) |
| `Timed out waiting … from config.webServer` | App fails to start or is slow to build | Run the `webServer.command` locally and fix the startup error; raise the timeout only when the start is healthy but slow |
| Locator not found after a UI change | Selector bound to markup instead of role or text | Use `getByRole` / `getByLabel` / `getByTestId` |
| Passes on retry | Race in the test (no web-first assertion, fixed `waitForTimeout`) | Use `await expect(locator).toBeVisible()` style assertions; remove sleeps |

Do not: raise `retries`, add `test.skip` / `test.fixme`, or delete the spec.
