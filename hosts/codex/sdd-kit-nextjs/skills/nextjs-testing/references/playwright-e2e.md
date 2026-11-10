# Playwright E2E against Laravel + Next.js

E2E tests drive a real browser through the Next.js app, which calls the real Laravel API on its own seeded database. They are the only tests that prove routing, auth cookies, Server Actions, Laravel and the database work together, so keep them for that.

## What earns an E2E test

- A journey named in the spec that crosses the backend: sign in, place an order, approve a refund, invite a teammate.
- Auth and permission boundaries a user can actually reach (an admin-only page refuses a member).
- Flows where a broken link between pages is the risk (the ship-feature Acceptance phase's "broken links").

Not E2E: validation messages, empty states, formatting, every 4xx. Those are Vitest + MSW tests (`mocking-laravel-api.md`). Aim for one E2E test per journey, not one per criterion.

## Install

```bash
<pm> add -D @playwright/test        # npm: npm i -D @playwright/test
<pmx> playwright install --with-deps chromium
```

`<pm>` / `<pmx>` follow the `verification-gates` package-manager rule (`npx`, `pnpm exec`, `yarn`, `bunx`).

This file is the kit's one E2E convention: `/run-tests --e2e`, `test-writer`, and the ship-feature acceptance test all run `<pmx> playwright test` and let `playwright.config.ts` (`webServer`) and `e2e/db.setup.ts` own the environment. Nobody runs `migrate:fresh` by hand, and E2E never touches the Pest `testing` database: `RefreshDatabase` runs would wipe the E2E baseline mid-run, and `migrate:fresh` would wipe theirs.

Add to `.gitignore`: `playwright/.auth/`, `test-results/`, `playwright-report/`, `blob-report/`.

## Laravel side: an isolated e2e environment

In the Laravel repo, create `.env.e2e` (copy `.env.example`, never `.env`):

```dotenv
APP_ENV=e2e
APP_DEBUG=true
APP_URL=http://127.0.0.1:8100
DB_CONNECTION=pgsql            # same engine as production; SQLite hides real query bugs
DB_DATABASE=app_e2e            # dedicated database, wiped on every run
QUEUE_CONNECTION=sync          # jobs run inline so the UI sees their effects
MAIL_MAILER=array
CACHE_STORE=array
```

- When `APP_ENV=e2e` is set in the process environment, Laravel loads `.env.e2e`. Both `php artisan serve` and `migrate:fresh` below rely on this.
- Don't run `config:cache` in this environment. A cached config ignores `.env.e2e` and points the run at whatever database was cached.
- If the browser calls Laravel directly (not only through Next.js), add the Next.js origin (`http://127.0.0.1:3100`) to `config/cors.php` allowed origins for this environment.

### E2ESeeder: a known baseline, not test data

The project's tests rule (`.codex/sdd-kit/rules/tests.md`) says not to depend on seeders. That rule is for Pest, where factories build each test's data. E2E needs a small fixed baseline because the browser can't call factories:

- One user per role the journeys need (`member@e2e.test`, `admin@e2e.test`), password from `E2E_PASSWORD`.
- Reference data the UI can't create (plans, countries, product catalogue).
- The OAuth client(s) the Next.js app authenticates with. `migrate:fresh` drops `oauth_clients`, so the seeder must recreate them with the id/secret the Next.js e2e env expects (see the `oauth2-passport` skill). `passport:keys` output in `storage/` survives the wipe.

Everything else a test needs, the test creates itself, through the UI or the API, with unique names. Don't put "an order with 3 items" in the seeder. A test that depends on another test's leftovers breaks under sharding and parallel workers.

If creating state through the UI makes a test too slow, a test-only route file (`routes/e2e.php`) that wraps factories is acceptable when **all** of these hold:
- It is registered only inside `if (app()->environment('e2e'))` in the service provider.
- A Pest test asserts the routes are absent when `APP_ENV=production`.
- `security-auditor` / `/deep-review` has seen it.

## playwright.config.ts

```ts
import { defineConfig, devices } from '@playwright/test';

const API_DIR = process.env.E2E_API_DIR ?? '../api'; // Laravel repo/folder (polyrepo or monorepo)
const API_URL = 'http://127.0.0.1:8100';
const WEB_URL = 'http://127.0.0.1:3100';
const CI = !!process.env.CI;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 2 : 0,
  workers: CI ? 2 : undefined,
  reporter: CI ? [['blob'], ['github']] : [['html', { open: 'never' }], ['list']],
  use: {
    baseURL: WEB_URL,
    trace: CI ? 'on-first-retry' : 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'db', testMatch: /db\.setup\.ts/ },
    { name: 'auth', testMatch: /auth\.setup\.ts/, dependencies: ['db'] },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], storageState: 'playwright/.auth/member.json' },
      dependencies: ['auth'],
    },
  ],
  webServer: [
    {
      command: 'php artisan serve --host=127.0.0.1 --port=8100',
      cwd: API_DIR,
      url: `${API_URL}/up`,
      env: { APP_ENV: 'e2e' },
      reuseExistingServer: !CI,
      timeout: 60_000,
    },
    {
      // Production build: `next dev` compiles routes on first hit and causes timeout flakes.
      // <pm>: replaced with the repo's package manager at setup time (verification-gates rule).
      command: CI ? '<pm> run build && <pm> run start -- -p 3100' : '<pm> run dev -- -p 3100',
      url: WEB_URL,
      env: { API_URL, NEXT_PUBLIC_API_URL: API_URL },
      reuseExistingServer: !CI,
      timeout: 180_000,
    },
  ],
});
```

- `/up` is Laravel 11+'s built-in health route (`bootstrap/app.php` `health: '/up'`). Use any cheap GET if it is disabled.
- `<pm>` in `webServer.command` is a placeholder, like in the install line above. Write the detected manager into the file when you create it (`npm`, `pnpm`, `yarn`, `bun`). npm needs the `--` before `-p`; pnpm, yarn and bun pass the flag through without it.
- `NEXT_PUBLIC_*` values are inlined at **build** time. The build in `webServer` must see the e2e API URL. A build reused from another job points the browser at the wrong API.
- Under DDEV or Docker, set `E2E_ARTISAN="ddev artisan"` (or `docker compose exec -T api php artisan`), drop the Laravel `webServer` entry, and point `API_URL` at the container URL. See the `ddev` / `docker` skills.

## e2e/db.setup.ts: wipe and seed

```ts
import { test as setup } from '@playwright/test';
import { execFileSync } from 'node:child_process';

const API_DIR = process.env.E2E_API_DIR ?? '../api';
const [bin, ...prefix] = (process.env.E2E_ARTISAN ?? 'php artisan').split(' ');

setup('reset the e2e database', () => {
  const env = { ...process.env, APP_ENV: 'e2e' };
  const db = execFileSync(
    bin,
    [...prefix, 'tinker', '--execute=echo config("database.connections.".config("database.default").".database");'],
    { cwd: API_DIR, env },
  ).toString().trim();

  // migrate:fresh drops every table; refuse anything that is not clearly a throwaway database.
  if (!/e2e|test/i.test(db)) throw new Error(`Refusing to wipe database "${db}" - expected an e2e/test database.`);

  execFileSync(bin, [...prefix, 'migrate:fresh', '--seed', '--seeder=E2ESeeder', '--no-interaction'], {
    cwd: API_DIR,
    env,
    stdio: 'inherit',
  });
});
```

Never add `--force`. Laravel refuses `migrate:fresh` in production without it, and that refusal is a safety net to keep.

Doing this in a setup project rather than `globalSetup` means it runs after `webServer` is up, shows up in the report and trace, and runs in every shard that needs it (Playwright re-adds dependency projects per shard). Each CI shard therefore needs its **own** database service.

## e2e/auth.setup.ts: log in once per role

```ts
import { test as setup, expect } from '@playwright/test';

const roles = ['member', 'admin'] as const;

for (const role of roles) {
  setup(`authenticate as ${role}`, async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(`${role}@e2e.test`);
    await page.getByLabel('Password').fill(process.env.E2E_PASSWORD ?? 'password');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('navigation')).toContainText(/dashboard/i);
    await page.context().storageState({ path: `playwright/.auth/${role}.json` });
  });
}
```

- Logging in through the real form exercises the Next.js login route and the HttpOnly cookie it sets. A login regression fails here once and clearly, instead of in every test.
- Switch role per file or per `describe`: `test.use({ storageState: 'playwright/.auth/admin.json' })`. For anonymous tests: `test.use({ storageState: { cookies: [], origins: [] } })`.
- Passport access tokens must outlive the run. Check `Passport::tokensExpireIn` in the e2e environment if long suites start failing with 401s halfway through.
- `playwright/.auth/*.json` holds live session cookies. Keep it git-ignored and never upload it as an artifact.

## Writing journeys

```ts
// e2e/refunds.spec.ts
import { test, expect } from '@playwright/test';

test.describe('refunds', () => {
  test.use({ storageState: 'playwright/.auth/admin.json' });

  test('AC-2: admin override creates an audited refund', async ({ page }) => {
    const reason = `override ${test.info().testId}`;

    await page.goto('/orders?type=top_up');
    await page.getByRole('row').filter({ hasText: 'Top-up' }).first().getByRole('link', { name: /view/i }).click();
    await page.getByRole('button', { name: 'Override and refund' }).click();
    await page.getByLabel('Reason').fill(reason);

    const saved = page.waitForResponse((r) => r.url().includes('/refunds') && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Confirm refund' }).click();
    expect((await saved).ok()).toBe(true);

    await expect(page.getByRole('status')).toHaveText(/refund created/i);
    await page.getByRole('link', { name: 'Audit log' }).click();
    await expect(page.getByRole('row').filter({ hasText: reason })).toBeVisible();
  });
});
```

- Title starts with the AC id. Run it with `<pmx> playwright test --grep "AC-2:"`, and it goes into the Traceability table as `e2e/refunds.spec.ts::AC-2: ...`.
- Locators by role and label, the same as RTL. Web-first assertions (`await expect(locator).toBeVisible()`) retry on their own. Never use `page.waitForTimeout`.
- Make data unique per test (`test.info().testId`, `workerIndex`) and assert on that data, not on counts or "the first row", which change under parallel workers.
- `page.waitForResponse` only checks whether the request succeeded. Assert the outcome a user sees, as the criterion describes it.
- Use `page.route()` only to stub third-party browser calls (payment widgets, analytics). Never stub your own Laravel API here.
- Accessibility per page: `@axe-core/playwright` (see the `accessibility` skill).

When the same multi-step interaction appears in several journeys, extract a small helper or fixture in `e2e/support/` (for example `test.extend({ orderPage })`). Avoid deep page-object hierarchies. The test should still read like the journey.

## Running and debugging

```bash
<pmx> playwright test                       # everything
<pmx> playwright test e2e/refunds.spec.ts   # one file
<pmx> playwright test --grep "AC-2:"        # one criterion
<pmx> playwright test --ui                  # watch mode with time-travel
<pmx> playwright show-trace test-results/<test>/trace.zip
<pmx> playwright show-report
```

## Trace-on-failure policy

| Setting | Local | CI | Why |
|---------|-------|----|-----|
| `retries` | 0 | 2 | Locally you want to see a failure immediately |
| `trace` | `retain-on-failure` | `on-first-retry` | Every failure leaves a trace without paying for tracing on green runs |
| `screenshot` | `only-on-failure` | `only-on-failure` | |
| `video` | `retain-on-failure` | `retain-on-failure` | |

- A test reported **flaky** (failed, then passed on retry) is a defect: a race in the app or the test. Fix the race. Don't raise `retries`, add timeouts or sleeps, or loosen the assertion.
- `test.fixme`/`test.skip` to quarantine a test is a skip. Like weakening an assertion, it needs the owner's explicit approval and a linked issue.
- Traces, videos and screenshots contain cookies, tokens and seeded data. Upload them only from CI runs with e2e-only accounts, and keep artifact retention short (7-14 days).

## CI: sharded GitHub Actions job

The job is written for npm. With another lockfile, swap `npm ci` / `npx` for that package manager's install and `<pmx>`.

```yaml
e2e:
  runs-on: ubuntu-latest
  strategy:
    fail-fast: false
    matrix:
      shard: [1, 2, 3, 4]
  services:
    postgres:
      image: postgres:16
      env: { POSTGRES_DB: app_e2e, POSTGRES_USER: app, POSTGRES_PASSWORD: secret }
      ports: ['5432:5432']
      options: --health-cmd pg_isready --health-interval 5s --health-retries 10
  env:
    E2E_API_DIR: api
    E2E_PASSWORD: ${{ secrets.E2E_PASSWORD }}
  steps:
    - uses: actions/checkout@v4
    - uses: shivammathur/setup-php@v2
      with: { php-version: '8.3', extensions: pdo_pgsql }
    - run: composer install --no-interaction --prefer-dist
      working-directory: api
    - run: cp .env.e2e.ci .env.e2e && php artisan passport:keys --no-interaction
      working-directory: api
    - uses: actions/setup-node@v4
      with: { node-version: 22, cache: npm }
    - run: npm ci && npx playwright install --with-deps chromium
    - run: npx playwright test --shard=${{ matrix.shard }}/${{ strategy.job-total }}
    - uses: actions/upload-artifact@v4
      if: ${{ !cancelled() }}
      with:
        name: blob-report-${{ matrix.shard }}
        path: blob-report
        retention-days: 7

e2e-report:
  if: ${{ !cancelled() }}
  needs: e2e
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with: { node-version: 22, cache: npm }
    - run: npm ci
    - uses: actions/download-artifact@v4
      with: { path: all-blob-reports, pattern: blob-report-*, merge-multiple: true }
    - run: npx playwright merge-reports --reporter html ./all-blob-reports
    - uses: actions/upload-artifact@v4
      with: { name: playwright-report, path: playwright-report, retention-days: 14 }
```

- Each shard is its own job with its own Postgres service, so `migrate:fresh` in one shard can't wipe another shard's data.
- `.env.e2e.ci` is a committed, secret-free copy of `.env.e2e` pointing at the service container. Secrets come from `secrets.*`, never from the file.
- The blob reports contain the traces, so the merged HTML report is where you debug a CI failure.
- Start with no sharding. Add shards when the suite takes more than about 10 minutes. Pipeline structure, caching and deployment are covered in the `ci-cd` skill.
