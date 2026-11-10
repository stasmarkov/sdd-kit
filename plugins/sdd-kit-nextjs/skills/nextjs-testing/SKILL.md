---
name: nextjs-testing
description: Testing patterns for the Next.js 15 frontend of an API-backed app - Vitest with React Testing Library component tests, MSW mocks built from the backend's API contract, Server Action and Route Handler tests, and Playwright E2E journeys against an isolated, seeded e2e environment (the references use a Laravel API as the worked backend). Use when writing or fixing *.test.ts(x) or e2e/*.spec.ts files, setting up vitest.config or playwright.config, mocking the backend API in frontend tests, naming frontend tests after spec acceptance criteria (AC-n) for traceability, or deciding which layer a frontend behaviour belongs to.
user-invocable: false
license: Apache-2.0
allowed-tools: Read, Grep, Glob, Edit, Write, Bash
paths:
  - "**/*.test.ts"
  - "**/*.test.tsx"
  - "**/*.spec.ts"
  - "**/*.spec.tsx"
  - "**/e2e/**"
  - "**/test/**"
  - "**/playwright.config.*"
  - "**/vitest.config.*"
metadata:
  category: "frameworks"
  framework: "nextjs"
  framework-version: "15.x"
  last_verified: "2026-10-19"
  next_review: "2027-01-19"
---

# Next.js Testing (Vitest, Testing Library, MSW, Playwright)

How to test the Next.js frontend of an app that calls a separate API. The backend's own test suite owns the API side: the contract, validation, policies and database effects are proven there (for a Laravel API, the `pest-3` skill of the sdd-kit-laravel add-on). The references use a Laravel API as the worked backend; adapt the envelope, URLs and seeding to yours. This skill covers what the frontend adds on top: rendering, interaction, Server Actions, Route Handlers, and a few journeys that run through the real Laravel API in a browser. The project's path-scoped tests rule (`.claude/rules/tests.md`) applies here too. This skill shows how to follow them with frontend tools.

## When to Load References

| Task | Load |
|------|------|
| Installing Vitest, `vitest.config.ts`, setup file, component/hook/Server Action/Route Handler patterns | `references/vitest-rtl.md` |
| MSW handlers, Laravel response envelopes, 401/403/422 cases, fixture factories, contract drift | `references/mocking-laravel-api.md` |
| `playwright.config.ts`, auth `storageState`, seeding the Laravel test DB, CI sharding, traces | `references/playwright-e2e.md` |
| Accessibility assertions (axe in Vitest or Playwright) | `accessibility` skill |
| Backend tests for the endpoint the UI calls | the backend stack's testing skill (Laravel: `pest-3`, in sdd-kit-laravel) |

## Quick Reference

| Task | Pattern |
|------|---------|
| Component test | Vitest + RTL, query by role/label, drive with `userEvent`, mock the API with MSW |
| Server Action test | `// @vitest-environment node`, call the action with `FormData`, MSW for Laravel, mock `next/cache`, `next/navigation`, `next/headers` |
| Route Handler test | Import `GET`/`POST` from `route.ts`, call with `new NextRequest(url)`, assert status + JSON |
| Async Server Component (page) | Move logic into plain functions you can unit-test. Cover the rendered page in E2E |
| Mock Laravel | MSW returning the `{success,status,message,data}` envelope. A Client Component hits the Next.js proxy (`proxyUrl('/api/v1/orders')` = `/api/proxy/api/v1/orders`, no token); Server Actions and Route Handlers hit Laravel (`apiUrl('/api/v1/orders')`) with the Bearer token from `cookies()` |
| Unmocked request | `onUnhandledRequest: 'error'`: a test that hits an unmocked URL fails |
| E2E journey | Playwright in `e2e/*.spec.ts`; `playwright.config` `webServer` starts Laravel with `APP_ENV=e2e`, `db.setup.ts` resets its dedicated DB |
| Logged-in E2E | Setup project logs in once and saves `storageState`. Other projects reuse it |
| Tie a test to a spec | Start the test title with the id: `it('AC-3: ...')`, `test('AC-3: ...')` |
| Run one criterion | `<pmx> vitest run -t "AC-3:"` / `<pmx> playwright test --grep "AC-3:"` (`<pmx>` per the `verification-gates` package-manager rule) |

---

## The Frontend Testing Trophy

Most tests should be integration-style component tests, not unit tests or E2E tests. They give the most confidence per second of runtime.

```
        ▲  E2E (Playwright)           few: critical journeys through real Laravel
       ███ Integration (Vitest+RTL)   most: component + hooks + MSW-mocked API
        █  Unit (Vitest, node)        some: pure logic, zod schemas, mappers
      ▬▬▬▬▬ Static (tsc, ESLint)      always: types catch a whole class of bugs
```

| Layer | Proves | Does not prove |
|-------|--------|----------------|
| Static | Types line up with the API client, no unused/unsafe code | Behaviour |
| Unit | Formatters, permission helpers, zod schemas, response mappers | That the UI uses them correctly |
| Integration | A user can see, fill, submit and recover from errors in a component, given realistic API responses | That Laravel really returns those responses (Pest does), or that pages are wired together |
| E2E | Routing, auth cookies, Server Actions, Laravel and the DB work together for one journey | Every edge case. Each extra E2E test adds minutes and flakiness |

Push each behaviour to the lowest layer that can prove it. A validation message for a 422 is an integration test with an MSW 422 response, not an E2E test.

## File Placement

These locations match the `paths` globs in `.claude/rules/tests.md` (including `test/**` for the shared MSW and setup files), so the rules load whenever these files are edited.

| Kind | Location | Runner |
|------|----------|--------|
| Component / hook / unit | Colocated: `components/orders/refund-button.test.tsx` next to `refund-button.tsx` | Vitest |
| Server Action | `app/actions/orders.test.ts` next to `orders.ts` | Vitest (node env) |
| Route Handler | `app/api/orders/route.test.ts` next to `route.ts` | Vitest (node env) |
| MSW handlers + fixtures | `test/msw/handlers.ts`, `test/msw/server.ts`, `test/fixtures/*.ts` | shared |
| Vitest setup | `test/setup.ts` | Vitest |
| E2E journeys | `e2e/<journey>.spec.ts`, setup in `e2e/*.setup.ts`, helpers in `e2e/support/` | Playwright |

Keep the suffix split strict: `*.test.ts(x)` is Vitest, `*.spec.ts` under `e2e/` is Playwright. Vitest's default include also matches `*.spec.*`, so `vitest.config.ts` must narrow `include` to `**/*.test.{ts,tsx}` and exclude `e2e/**` (see `references/vitest-rtl.md`).

## What to Test at Each Layer

| Next.js artifact | Test with | Must cover |
|------------------|-----------|------------|
| Client Component (`'use client'`) | RTL + `userEvent` + MSW | Renders data, every interactive path, loading, empty, and error states, disabled/pending submit |
| Synchronous Server Component | RTL render (it is just a function returning JSX) | Output for each prop variant |
| Async Server Component / `page.tsx` | Unit-test the extracted fetch + mapping functions. Cover the page in E2E | Vitest cannot render async components with async children. Do not stub React to force it |
| Server Action (`'use server'`) | Vitest node env, call directly | Valid input calls Laravel with the right payload and token. Laravel 422 maps to field errors. 401 redirects to login. `revalidatePath`/`redirect` called |
| Route Handler (`route.ts`) | Vitest node env, call `GET(req)` | Status codes, response body, cookies set/cleared, upstream Laravel errors passed through correctly |
| `middleware.ts` | Vitest node env, call `middleware(new NextRequest(url))` | Redirects unauthenticated users, lets authenticated ones through, `matcher` excludes assets |
| API client / zod schemas | Unit | Parses real contract fixtures, rejects malformed ones, unwraps the envelope |
| Custom hooks | `renderHook` + MSW | State transitions, refetch, error propagation |
| User journey crossing Laravel | Playwright | The spec's journey, end to end, as a real user would click it |

Next.js 15 details that break naive tests:
- `params` and `searchParams` are Promises. Pass `{ params: Promise.resolve({ id: '7' }) }`.
- `cookies()` and `headers()` from `next/headers` are async. Mock them as `async () => store`.
- `redirect()` and `notFound()` work by throwing. Make the mock throw too, so code after the call does not run.
- Files that `import 'server-only'` throw under Vitest. Mock `server-only` to an empty module in the setup file.
- Forms use React 19 `useActionState` (from `react`), not `useFormState`.

## AC-id Naming and Traceability

`execute-task` fills the spec's **Traceability** table with `file::test name`. If the test title starts with the acceptance criterion id, that cell can be written mechanically and checked later with a grep.

```tsx
// components/orders/refund-button.test.tsx
describe('RefundButton', () => {
  it('AC-1: is hidden for top-up orders', async () => { /* ... */ });
  it('MNC-1: still shows for card orders', async () => { /* ... */ });
  it('disables itself while the refund request is pending', async () => { /* ... */ });
});
```

```ts
// e2e/refunds.spec.ts
test('AC-2: admin override creates an audited refund', async ({ page }) => { /* ... */ });
```

| ID | Verified by | Kind |
|----|-------------|------|
| AC-1 | `components/orders/refund-button.test.tsx::AC-1: is hidden for top-up orders` | test |
| AC-2 | `e2e/refunds.spec.ts::AC-2: admin override creates an audited refund` | test |

Rules:
- Put the id in the `it`/`test` title itself, not only in `describe`, so both the filter and the reporter output carry it.
- End the id with a colon and filter on it (`-t "AC-1:"`). Without the colon, `AC-1` also matches `AC-10`.
- One criterion can have several tests (component plus E2E). List the strongest one in the table.
- Tests that cover no criterion are fine (edge cases, regressions). They just do not get an id.

## Core Patterns

### Component test against a mocked Laravel endpoint

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/msw/server';
import { proxyUrl, laravelValidationError } from '@/test/msw/laravel';
import { CreateOrderForm } from './create-order-form';

// Client Component: it posts through the Next.js proxy, so the override targets proxyUrl().
it('AC-4: shows the Laravel validation message next to the field', async () => {
  server.use(
    http.post(proxyUrl('/api/v1/orders'), () =>
      laravelValidationError({ product_id: ['The selected product is unavailable.'] }),
    ),
  );
  const user = userEvent.setup();
  render(<CreateOrderForm />);

  await user.selectOptions(screen.getByLabelText(/product/i), 'Widget');
  await user.click(screen.getByRole('button', { name: /place order/i }));

  expect(await screen.findByText('The selected product is unavailable.')).toBeInTheDocument();
  expect(screen.getByLabelText(/product/i)).toHaveAttribute('aria-invalid', 'true');
});
```

### Server Action test

```ts
// @vitest-environment node
import { revalidatePath } from 'next/cache';
import { createOrder } from './orders';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => { throw new Error(`NEXT_REDIRECT:${url}`); }),
}));
vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({ get: () => ({ value: 'test-token' }) })),
}));

it('AC-1: creates the order and redirects to it', async () => {
  const form = new FormData();
  form.set('product_id', '12');

  await expect(createOrder(null, form)).rejects.toThrow('NEXT_REDIRECT:/orders/501');
  expect(revalidatePath).toHaveBeenCalledWith('/orders');
});
```

The default Laravel-URL MSW handler for `POST /api/v1/orders` returns a 201 with order `501` when the request carries the Bearer token, which the mocked `cookies()` supplies. Override it with `server.use()` to test 422, 401 and 500 paths. Full setup and more patterns are in `references/vitest-rtl.md`.

## Commands and Gates

```jsonc
// package.json scripts
"test": "vitest run",
"test:watch": "vitest",
"test:coverage": "vitest run --coverage",
"test:e2e": "playwright test"
```

- The Vitest gate (10 in `verification-gates`) runs `<pmx> vitest run`, and adds `--coverage` only when the change touches frontend business logic. The 80% threshold lives in `vitest.config.ts`, so that run fails on its own when coverage drops.
- The type-check gate (`<pmx> tsc --noEmit`) must include test files. A test that does not type-check proves nothing.
- E2E (the browser-journey gate, 11) is not part of every task's gates. Run it for tasks that change a journey, before merge, and in CI. Accessibility assertions belong to the accessibility gate (12).
- No `.only`: Vitest `allowOnly: false` in CI and Playwright `forbidOnly: !!process.env.CI`.

## Rules

- Query in this order: `getByRole` > `getByLabelText` > `getByText`. `getByTestId` only for elements with no accessible name, and say why.
- Use `userEvent.setup()`, not `fireEvent`. Use `findBy*`/`waitFor` for async UI, never timers or sleeps.
- Mock the network, not your modules. Don't `vi.mock` your own API client or stub `global.fetch`. MSW exercises the real client, headers and envelope parsing.
- Copy MSW payloads from the Laravel contract (JsonResource output, `api-contracts.md`, or the OpenAPI file). Never invent field names.
- Snapshots are not assertions of behaviour. Allow them only for small, stable serialized output, never for whole pages.
- E2E runs against its own database (`APP_ENV=e2e`), never the dev or shared DB. `migrate:fresh` runs there only.
- A test that passes only on retry is a bug. Fix the race. Don't raise `retries` or add `waitForTimeout`.
- Never delete, skip, or weaken an assertion to go green. If the test is wrong, say so and explain why.

## Checklist

- [ ] Each behaviour sits at the lowest layer that proves it. E2E covers only journeys that cross Laravel
- [ ] Files follow the placement table. Vitest ignores `e2e/**`
- [ ] Every AC/MNC/NFR the task covers has a test whose title starts with `AC-n:` / `MNC-n:` / `NFR-n:`
- [ ] Component tests cover loading, empty, error (401/403/422/500) and success states
- [ ] MSW runs with `onUnhandledRequest: 'error'`. Handlers return the real Laravel envelope
- [ ] Server Actions and Route Handlers are tested in the node environment with Next.js modules mocked to throw like the real ones
- [ ] `vitest run --coverage` meets the threshold. `tsc --noEmit` is clean
- [ ] E2E (when touched): seeded test DB, `storageState` auth, no sleeps, trace on failure
