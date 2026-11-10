# Mocking the Laravel API with MSW

Frontend tests mock Laravel at the network boundary with MSW 2, using payloads taken from the API contract. The real API client still runs, along with its headers, envelope unwrapping and error mapping. Only the HTTP hop to Laravel is replaced.

## Where MSW applies

| Test | Laravel is | Why |
|------|------------|-----|
| Vitest, server-side code (Server Actions, Route Handlers, server API client) | MSW on the Laravel URL (`apiUrl()`), token required | Fast, deterministic, every status code reachable. Proves the Bearer token from `cookies()` is sent |
| Vitest, Client Components and hooks | MSW on the Next.js proxy URL (`proxyUrl()`), no token check | With HttpOnly-cookie auth the browser can't attach a token. It calls `/api/proxy/*`, and the proxy adds the token server-side |
| Playwright E2E | The real Laravel app on a seeded test DB (`playwright-e2e.md`) | E2E exists to prove the two halves work together. Server-side `fetch` in the Next.js process can't be intercepted by `page.route` anyway |
| Playwright, third-party browser calls (Stripe.js, analytics, maps) | `page.route()` stubs | Never call third parties from tests |

## Source of truth for payloads

Copy shapes from the contract, in this order of preference:

1. The OpenAPI document produced by `/design-api --openapi` (generate TS types from it with `openapi-typescript`).
2. `docs/api/api-contracts.md` from `/write-docs`, which cites the JsonResource with `file:line`.
3. The Laravel `JsonResource` class plus the Pest test that asserts its `assertJsonStructure`.
4. The API section of the spec (`.ai/specs/<spec>/spec-lite.md`) for endpoints that don't exist yet.

If none of these name a field, don't invent it. Raise it as an open question in the spec. A fixture with a guessed field gives a green test against an API that doesn't exist.

## Laravel envelope helpers

The kit's Laravel APIs answer with the envelope from the `api-design` skill (`JsonResponseTrait`). Centralise it so a contract change is a one-file edit.

```ts
// test/msw/laravel.ts
import { HttpResponse } from 'msw';

const API = process.env.API_URL ?? 'http://api.test';
// jsdom origin, pinned by environmentOptions.jsdom.url in vitest.config.ts
const WEB = 'http://localhost:3000';

/** Laravel URL, as called by server-side code (Server Actions, Route Handlers). */
export const apiUrl = (path: string) => `${API}${path}`;

/** Next.js proxy URL, as called by Client Components: `/api/proxy` + the Laravel path. */
export const proxyUrl = (path: string) => `${WEB}/api/proxy${path}`;

export const laravelOk = <T>(data: T, message = 'Success', status = 200) =>
  HttpResponse.json({ success: true, status, message, data }, { status });

export const laravelCreated = <T>(data: T, message = 'Created') => laravelOk(data, message, 201);

export function laravelPaginated<T>(
  items: T[],
  { path = '/api/v1/orders', page = 1, perPage = 15, total = items.length } = {},
) {
  const lastPage = Math.max(1, Math.ceil(total / perPage));
  const url = (p: number) => apiUrl(`${path}?page=${p}`);
  return {
    success: true,
    status: 200,
    message: 'Success',
    data: items,
    meta: { current_page: page, per_page: perPage, total, last_page: lastPage },
    links: {
      first: url(1),
      last: url(lastPage),
      prev: page > 1 ? url(page - 1) : null,
      next: page < lastPage ? url(page + 1) : null,
    },
  };
}

export const laravelError = (status: number, message: string) =>
  HttpResponse.json({ success: false, status, message }, { status });

export function laravelValidationError(errors: Record<string, string[]>) {
  const [first] = Object.values(errors).flat();
  const extra = Object.values(errors).flat().length - 1;
  const message = extra > 0 ? `${first} (and ${extra} more ${extra === 1 ? 'error' : 'errors'})` : first;
  return HttpResponse.json({ success: false, status: 422, message, errors }, { status: 422 });
}
```

If the project's API uses Laravel's default shapes instead (plain `JsonResource` with `data`, or the framework's `{ message, errors }` 422), change these helpers to match. Read one real response or the contract first. Don't assume.

## Fixture factories

```ts
// test/fixtures/orders.ts
import type { components } from '@/lib/api/schema'; // generated from OpenAPI, if available

type Order = components['schemas']['Order'];

let seq = 500;
export function orderFactory(overrides: Partial<Order> = {}): Order {
  seq += 1;
  return {
    id: seq,
    number: `#${seq}`,
    status: 'paid',
    type: 'card',
    total_cents: 4999,
    currency: 'EUR',
    created_at: '2026-10-19T10:00:00.000000Z',
    ...overrides,
  };
}

export const topUpOrder = (o: Partial<Order> = {}) => orderFactory({ type: 'top_up', ...o });
```

Laravel details to reproduce faithfully:
- **Dates** serialize as ISO 8601 UTC with microseconds (`2026-10-19T10:00:00.000000Z`). Use that exact format so date parsing is exercised.
- **Money** is integers in minor units (`total_cents`), never floats. Same rule as the backend tests.
- **IDs** may be UUID strings if the models use `HasUuids`. Match the real key type, because `id: 1` vs `id: "9d2f..."` breaks URL building and comparisons.
- **Optional relations** come from `whenLoaded()`, so the key is absent rather than `null`. Write fixtures for both shapes when the UI handles both.
- **Nested validation keys** use dot notation (`items.0.quantity`). The UI's error mapping must handle them, so include one in a 422 fixture for array forms.
- **Enums** are backed-enum string values (`'top_up'`). Copy them from the PHP enum, not from UI labels.

Define the fixture types once: OpenAPI-generated types, or the zod schemas the API client already uses (`z.infer<typeof OrderSchema>`). Then a renamed field fails `tsc` instead of silently passing.

## Default handlers: happy path, auth enforced where the token lives

Each endpoint gets two handlers built from the same resolver:

- **Laravel URL** (`apiUrl()`), hit by server-side code. It requires `Authorization: Bearer ...`, because Server Actions and Route Handlers (including the proxy) must add it from `cookies()`.
- **Proxy URL** (`proxyUrl()`), hit by Client Components through `apiClient()` (`nextjs-auth`). It doesn't check for a token: the browser sends only the HttpOnly cookie, and the proxy route's own tests prove the token is forwarded.

```ts
// test/msw/handlers.ts
import { http, type HttpResponseResolver } from 'msw';
import { apiUrl, proxyUrl, laravelOk, laravelCreated, laravelError, laravelPaginated } from './laravel';
import { orderFactory } from '../fixtures/orders';

const requireToken = (request: Request) =>
  request.headers.get('Authorization')?.startsWith('Bearer ') ? null : laravelError(401, 'Unauthenticated.');

const withToken =
  (resolver: HttpResponseResolver): HttpResponseResolver =>
  (info) =>
    requireToken(info.request) ?? resolver(info);

const listOrders: HttpResponseResolver = ({ request }) => {
  const page = Number(new URL(request.url).searchParams.get('page') ?? 1);
  return Response.json(laravelPaginated([orderFactory(), orderFactory(), orderFactory()], { page, total: 3 }));
};
const showOrder: HttpResponseResolver = ({ params }) => laravelOk(orderFactory({ id: Number(params.id) }));
const storeOrder: HttpResponseResolver = () => laravelCreated({ id: 501 }, 'Order created');

export const handlers = [
  // Server-side callers: Laravel directly, token required.
  http.get(apiUrl('/api/v1/orders'), withToken(listOrders)),
  http.get(apiUrl('/api/v1/orders/:id'), withToken(showOrder)),
  http.post(apiUrl('/api/v1/orders'), withToken(storeOrder)),

  // Client Components: the Next.js proxy contract, cookie auth handled by the proxy.
  http.get(proxyUrl('/api/v1/orders'), listOrders),
  http.get(proxyUrl('/api/v1/orders/:id'), showOrder),
  http.post(proxyUrl('/api/v1/orders'), storeOrder),
];
```

```ts
// test/msw/server.ts
import { setupServer } from 'msw/node';
import { handlers } from './handlers';

export const server = setupServer(...handlers);
```

Laravel-URL handlers return success only when the request is authenticated. A Server Action or proxy route that forgets the `Authorization` header gets a 401 and the test fails, instead of a mock that accepts anything. A Client Component test that hits `apiUrl()` instead of `proxyUrl()` fails with an unhandled request or a 401, which is the right outcome: under cookie auth the browser can't call Laravel with a token.

## Per-test overrides: the status matrix

The backend has four required Pest cases per endpoint (happy, 422, 401, 403; see the project's `.cursor/rules/tests.mdc`). The frontend has a matching set: for each endpoint a component calls, test what the user sees for each response the UI handles.

| Response | Override | UI must |
|----------|----------|---------|
| 200 / 201 | default handler | Render data / confirm and navigate |
| Empty list | `Response.json(laravelPaginated([]))` | Show the empty state, not a blank table |
| 422 | `laravelValidationError({ field: ['msg'] })` | Show the message next to the field, set `aria-invalid`, keep user input |
| 401 | `laravelError(401, 'Unauthenticated.')` | Redirect to login (Server Action / middleware) or show the session-expired prompt |
| 403 | `laravelError(403, 'This action is unauthorized.')` | Show a permission message. Never render the data |
| 404 | `laravelError(404, 'Not found.')` | `notFound()` / not-found UI |
| 409 | `laravelError(409, '...')` | Show the business-rule message from Laravel |
| 429 | `laravelError(429, 'Too Many Attempts.')` | Back off, tell the user to retry later |
| 500 | `laravelError(500, 'Server Error')` | Generic error with retry. Don't leak details |
| Network failure | `HttpResponse.error()` | Same as 500, and no unhandled promise rejection |
| Slow response | `await delay(100)` before returning | Loading state visible, submit disabled (no double submit) |

```ts
// Client Component test: override the proxy URL. Server Action / Route Handler test: override apiUrl().
server.use(http.delete(proxyUrl('/api/v1/orders/:id'), () => laravelError(403, 'This action is unauthorized.')));
```

`server.use()` overrides last until `resetHandlers()` in `afterEach`. Use `http.get(url, resolver, { once: true })` when a test needs one failure followed by success (retry flows).

## Asserting the request

A UI can render correctly while sending the wrong thing. Capture the request when the criterion is about what gets sent:

```ts
let sent: URLSearchParams | undefined;
server.use(
  http.get(proxyUrl('/api/v1/orders'), ({ request }) => {
    sent = new URL(request.url).searchParams;
    return Response.json(laravelPaginated([]));
  }),
);

await user.selectOptions(screen.getByLabelText(/status/i), 'refunded');

await waitFor(() => expect(sent?.get('filter[status]')).toBe('refunded'));
```

Check query-parameter names against the Laravel side (`filter[status]` for Spatie Query Builder, `status` for a hand-written FormRequest). Check JSON body keys too: snake_case on the wire even when the UI uses camelCase.

## Guarding against contract drift

MSW fixtures can go stale when Laravel changes. Use at least one guard:

1. **Typed fixtures**: fixtures typed from OpenAPI-generated types or the client's zod schemas. A renamed or removed field fails `tsc --noEmit`.
2. **Schema-parse test**: one unit test runs every factory through the API client's zod schema (`OrderSchema.parse(orderFactory())`). This catches nullable vs required mismatches that types miss.
3. **Backend-emitted samples** (monorepo or shared artifact): a Pest test writes real `JsonResource` output for key endpoints to `contracts/samples/*.json`. The frontend schema-parse test reads the same files. If the backend changes the shape, the frontend test fails in the same CI run.

When a field changes in the Laravel contract, update the helper or factory once. Don't patch individual tests.

## Rules

- `onUnhandledRequest: 'error'` stays on. An unmocked request means a missing handler or an unexpected call, and both are bugs.
- One handler file per API resource once `handlers.ts` grows past a few hundred lines (`test/msw/handlers/orders.ts`).
- Handlers use `apiUrl()` (server-side callers) or `proxyUrl()` (Client Components). A hard-coded `localhost:8000` breaks as soon as the environment changes.
- Don't put assertions inside resolvers. A failing `expect` there becomes a 500 response, so the test fails later with a misleading error, or passes if the UI handles 500s. Capture the request and assert in the test.
- Don't use MSW in E2E to hide a broken backend. If the real Laravel endpoint doesn't work, the E2E test should fail.
