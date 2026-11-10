# Vitest + React Testing Library for Next.js 15

Setup and patterns for component, hook, Server Action, Route Handler and middleware tests. MSW details (handlers, Laravel envelopes) are in `mocking-laravel-api.md`.

## Install

```bash
<pm> add -D vitest @vitejs/plugin-react vite-tsconfig-paths jsdom \
  @testing-library/react @testing-library/dom @testing-library/user-event @testing-library/jest-dom \
  @vitest/coverage-v8 msw
```

`<pm>` is the repo's package manager per the `verification-gates` package-manager rule (`npm install`, `pnpm add`, `yarn add`, `bun add`). Replace it when you run the command. A second lockfile is a finding.

`@testing-library/react` 16+ declares `@testing-library/dom` as a peer dependency. Install it explicitly or queries fail to import.

## vitest.config.ts

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./test/setup.ts'],
    // *.spec.ts belongs to Playwright; keep the runners apart.
    include: ['**/*.test.{ts,tsx}'],
    exclude: ['node_modules/**', '.next/**', 'e2e/**'],
    // Client Components fetch relative /api/proxy/* URLs; MSW resolves them against this origin.
    environmentOptions: { jsdom: { url: 'http://localhost:3000' } },
    env: {
      API_URL: 'http://api.test',
      NEXT_PUBLIC_API_URL: 'http://api.test',
    },
    allowOnly: !process.env.CI,
    clearMocks: true,
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      include: ['app/**', 'components/**', 'lib/**', 'hooks/**'],
      exclude: ['**/*.test.{ts,tsx}', '**/*.d.ts', 'app/**/layout.tsx', 'app/**/loading.tsx'],
      thresholds: { lines: 80, functions: 80, statements: 80, branches: 75 },
    },
  },
});
```

- `globals: true` lets the snippets in this skill use `describe`/`it`/`vi` without imports, and turns on RTL's automatic `cleanup()`. Add `"types": ["vitest/globals", "@testing-library/jest-dom"]` to `tsconfig.json` `compilerOptions`.
- `env` pins the API base URL so MSW handlers and the real API client agree. Read it through one helper (`apiUrl()` in `mocking-laravel-api.md`), never hard-code hosts in tests.
- `environmentOptions.jsdom.url` fixes the page origin. Client Components call the Next.js proxy with relative URLs (`/api/proxy/api/v1/orders`), and the `proxyUrl()` helper builds handler URLs on the same origin.
- `clearMocks: true` clears every mock's call history before each test, so `toHaveBeenCalledWith` in one test never sees calls from another. `restoreMocks: true` puts the original implementation back on anything wrapped with `vi.spyOn`. Neither removes an implementation given to `vi.fn(impl)` or a `vi.mock` factory, which is what keeps the module mocks below working; a test that overrides one with `mockReturnValueOnce`/`mockImplementationOnce` stays contained.
- Coverage thresholds make the Vitest gate in `verification-gates` (gate 10, run with `--coverage` when frontend business logic changed) fail on its own when coverage drops. Exclude only files with no logic. Don't exclude code just to hit the number.
- If the project uses a `src/` directory, prefix the coverage `include` globs with `src/`.

## test/setup.ts

```ts
import '@testing-library/jest-dom/vitest';
import { server } from './msw/server';

vi.mock('server-only', () => ({}));

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

`server-only` throws when imported outside a React Server environment. Mocking it lets Vitest import server modules (API clients, actions) without stripping the guard from production code.

## Choosing the environment per file

The default is `jsdom`. Server-side code (Server Actions, Route Handlers, middleware, server API clients) should run in `node`, so `document` doesn't hide accidental browser dependencies. Put this docblock on the first line:

```ts
// @vitest-environment node
```

## Client Components

Under the kit's auth model (`nextjs-auth`: token in an HttpOnly cookie), a Client Component can't read the token, so it never calls Laravel directly. It calls the Next.js proxy route (`/api/proxy/...`), and the proxy adds `Authorization: Bearer ...` on the server from `cookies()`. Component tests therefore run against the **proxy contract**: handlers built with `proxyUrl()`, the same Laravel envelope, no token check. The proxy route itself is a Route Handler, tested separately against `apiUrl()` with the token check on (see Route Handlers below).

```tsx
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse, delay } from 'msw';
import { server } from '@/test/msw/server';
import { proxyUrl, laravelError, laravelPaginated } from '@/test/msw/laravel';
import { OrderTable } from './order-table';

describe('OrderTable', () => {
  it('AC-1: lists the customer orders returned by the API', async () => {
    render(<OrderTable />);

    const rows = await screen.findAllByRole('row');
    expect(rows).toHaveLength(1 + 3); // header + default proxy handler's 3 orders
    expect(within(rows[1]).getByText('#501')).toBeInTheDocument();
  });

  it('shows a loading state, then the empty state', async () => {
    server.use(
      http.get(proxyUrl('/api/v1/orders'), async () => {
        await delay(50);
        return HttpResponse.json(laravelPaginated([]));
      }),
    );
    render(<OrderTable />);

    expect(screen.getByRole('status')).toHaveTextContent(/loading/i);
    expect(await screen.findByText(/no orders yet/i)).toBeInTheDocument();
  });

  it('shows a retryable error when the API fails', async () => {
    // { once: true }: only the first request fails, so the retry deterministically gets the default handler.
    server.use(http.get(proxyUrl('/api/v1/orders'), () => laravelError(500, 'Server error'), { once: true }));
    const user = userEvent.setup();
    render(<OrderTable />);

    await user.click(await screen.findByRole('button', { name: /try again/i }));
    expect(await screen.findAllByRole('row')).toHaveLength(4);
  });
});
```

Patterns:
- Client Component handlers use `proxyUrl()`. An `apiUrl()` handler in a component test means the component is calling Laravel directly from the browser, which only works if the project deliberately exposes a bearer token to client code.
- Call `userEvent.setup()` before `render`, once per test. Await every `user.*` call.
- `findBy*` waits for async UI. `queryBy*` is only for asserting absence (`expect(queryByRole(...)).not.toBeInTheDocument()`).
- For "is hidden" criteria, assert absence after the data has loaded. Otherwise the test passes while the component is still loading.
- Use `within(row)` to scope assertions instead of indexing into `getAllByText`.

### Components that need providers

Wrap once in a `renderWithProviders` helper (`test/render.tsx`) for React Query, theme, or session context. Don't repeat wrapper setup in every test.

```tsx
export function renderWithProviders(ui: React.ReactElement, { session = testSession } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <SessionProvider session={session}>
      <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
    </SessionProvider>,
  );
}
```

Turn off query retries in tests. Otherwise an error-state test waits through the retry backoff and then times out.

### Components using next/navigation

```tsx
const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/orders',
  useSearchParams: () => new URLSearchParams('status=paid'),
}));
```

Assert navigation by checking `push` was called with the expected URL. Don't assert on internal router state.

### Forms with useActionState

A Client Component form whose action is a Server Action: test the form with the action mocked at the module boundary. Test the action itself separately (below). This is the one place where mocking your own module is right, because the real action can't run in jsdom.

```tsx
vi.mock('@/app/actions/orders', () => ({
  createOrder: vi.fn(async () => ({ errors: { product_id: ['The selected product is unavailable.'] } })),
}));

it('AC-4: renders field errors returned by the action', async () => {
  const user = userEvent.setup();
  render(<CreateOrderForm />);
  await user.click(screen.getByRole('button', { name: /place order/i }));
  expect(await screen.findByText('The selected product is unavailable.')).toBeInTheDocument();
});
```

## Hooks

```tsx
import { renderHook, waitFor } from '@testing-library/react';

it('exposes the 403 as a permission error', async () => {
  server.use(http.get(proxyUrl('/api/v1/reports'), () => laravelError(403, 'This action is unauthorized.')));
  const { result } = renderHook(() => useReports(), { wrapper: Providers });

  await waitFor(() => expect(result.current.error?.status).toBe(403));
});
```

## Server Components

- **Synchronous** Server Components are plain functions that return JSX. `render(<OrderSummary order={order} />)` works.
- **Async** Server Components and pages are not supported by Vitest's renderer. The Next.js docs recommend E2E for them. Put the decisions in plain functions (`lib/orders/get-orders.ts`, `lib/orders/to-view-model.ts`), unit-test those, and keep the async component as thin glue.
- For a leaf async page with no async children, `render(await Page({ params: Promise.resolve({ id: '7' }) }))` works. Stop using it when the tree gains a nested async component or Suspense boundary.

## Server Actions

```ts
// @vitest-environment node
import { http, HttpResponse } from 'msw';
import { revalidatePath } from 'next/cache';
import { server } from '@/test/msw/server';
import { apiUrl, laravelValidationError, laravelError } from '@/test/msw/laravel';
import { createOrder } from './orders';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => { throw new Error(`NEXT_REDIRECT:${url}`); }),
}));
const cookieStore = { get: vi.fn(() => ({ value: 'test-token' })), set: vi.fn(), delete: vi.fn() };
vi.mock('next/headers', () => ({ cookies: vi.fn(async () => cookieStore) }));

function formOf(fields: Record<string, string>) {
  const fd = new FormData();
  Object.entries(fields).forEach(([k, v]) => fd.set(k, v));
  return fd;
}

describe('createOrder', () => {
  it('AC-1: sends the bearer token and payload to Laravel, then redirects', async () => {
    let seen: { auth: string | null; body: unknown } | undefined;
    server.use(
      http.post(apiUrl('/api/v1/orders'), async ({ request }) => {
        seen = { auth: request.headers.get('Authorization'), body: await request.json() };
        return HttpResponse.json(
          { success: true, status: 201, message: 'Order created', data: { id: 501 } },
          { status: 201 },
        );
      }),
    );

    await expect(createOrder(null, formOf({ product_id: '12' }))).rejects.toThrow('NEXT_REDIRECT:/orders/501');
    expect(seen).toEqual({ auth: 'Bearer test-token', body: { product_id: 12 } });
    expect(revalidatePath).toHaveBeenCalledWith('/orders');
  });

  it('maps a Laravel 422 to field errors without redirecting', async () => {
    server.use(http.post(apiUrl('/api/v1/orders'), () =>
      laravelValidationError({ product_id: ['The selected product is unavailable.'] })));

    const state = await createOrder(null, formOf({ product_id: '12' }));
    expect(state).toEqual({ errors: { product_id: ['The selected product is unavailable.'] } });
  });

  it('redirects to login when Laravel answers 401', async () => {
    server.use(http.post(apiUrl('/api/v1/orders'), () => laravelError(401, 'Unauthenticated.')));
    await expect(createOrder(null, formOf({ product_id: '12' }))).rejects.toThrow('NEXT_REDIRECT:/login');
  });

  it('rejects invalid input before calling Laravel', async () => {
    const state = await createOrder(null, formOf({ product_id: '' }));
    expect(state.errors?.product_id).toBeDefined();
    // onUnhandledRequest: 'error' would fail the test if a request had been sent.
  });
});
```

- Make the `redirect`/`notFound` mocks throw. The real ones throw, so code after them never runs. A no-op mock hides bugs where the action keeps going after redirecting.
- If the action wraps its Laravel call in `try/catch`, check that the catch rethrows Next.js control-flow errors (call `unstable_rethrow(error)` from `next/navigation` first thing in the `catch`). A test whose redirect assertion fails because the catch swallowed it has found a real bug.
- Assert what was sent to Laravel (headers, JSON body, types after coercion), not only what came back.

## Route Handlers

The proxy route that Client Components call (`app/api/proxy/[...path]/route.ts`) is where the Bearer token gets attached, so its tests run against the Laravel handlers with the token check on.

```ts
// @vitest-environment node
import { http } from 'msw';
import { NextRequest } from 'next/server';
import { server } from '@/test/msw/server';
import { apiUrl, laravelError } from '@/test/msw/laravel';
import { GET } from './route';

const cookieStore = { get: vi.fn(() => ({ value: 'test-token' })) };
vi.mock('next/headers', () => ({ cookies: vi.fn(async () => cookieStore) }));

const proxied = (path: string[], query = '') =>
  GET(new NextRequest(`http://localhost/api/proxy/${path.join('/')}${query}`), {
    params: Promise.resolve({ path }),
  });

it('proxies the paginated list with the cookie token and keeps the Laravel status', async () => {
  const res = await proxied(['api', 'v1', 'orders'], '?page=2');

  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ data: expect.any(Array), meta: { current_page: 2 } });
});

it('passes a Laravel 403 through unchanged', async () => {
  server.use(http.get(apiUrl('/api/v1/orders'), () => laravelError(403, 'This action is unauthorized.')));
  const res = await proxied(['api', 'v1', 'orders']);
  expect(res.status).toBe(403);
});

it('answers 401 without a session cookie', async () => {
  cookieStore.get.mockReturnValueOnce(undefined as never);
  const res = await proxied(['api', 'v1', 'orders']);
  expect(res.status).toBe(401);
});
```

The default Laravel handlers return 401 when the `Authorization` header is missing, so the first test only passes if the route really forwards the cookie token.

For handlers that set auth cookies (login proxy), assert on `res.cookies.get('access_token')`: value present, `httpOnly: true`, `secure` in production, and `sameSite`.

## Middleware

```ts
// @vitest-environment node
import { NextRequest } from 'next/server';
import { middleware } from '@/middleware';

it('redirects anonymous users from /dashboard to /login with a return path', async () => {
  const res = await middleware(new NextRequest('http://localhost/dashboard/orders'));
  expect(res?.headers.get('location')).toBe('http://localhost/login?next=%2Fdashboard%2Forders');
});

it('lets requests with a session cookie through', async () => {
  const req = new NextRequest('http://localhost/dashboard', { headers: { cookie: 'access_token=abc' } });
  const res = await middleware(req);
  expect(res?.headers.get('x-middleware-next')).toBe('1');
});
```

## Accessibility in component tests

For forms, dialogs and navigation, add an axe check (`vitest-axe` or `jest-axe` with `expect.extend`). This is the "component-level" check of the accessibility gate (12) in `verification-gates`. Rules and patterns are in the `accessibility` skill.

## Anti-patterns

| Don't | Do |
|-------|-----|
| `vi.spyOn(global, 'fetch')` / mock the API client module | MSW handler, so the real client, headers and parsing run |
| `getByTestId('submit')` | `getByRole('button', { name: /submit/i })` |
| `await new Promise(r => setTimeout(r, 500))` | `await screen.findBy...` / `waitFor` |
| `fireEvent.change(input, ...)` | `await user.type(input, ...)` |
| `expect(container).toMatchSnapshot()` for a page | Assert the specific text, roles and states the criterion names |
| Asserting component state or hook internals | Assert what the user sees or what was sent to the API |
| One giant test per component | One behaviour per test, named after the criterion or edge case |
