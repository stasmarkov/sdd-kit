---
paths:
  - "app/**/page.tsx"
  - "app/**/layout.tsx"
  - "app/**/route.ts"
  - "app/**/actions.ts"
  - "src/app/**"
  - "src/components/**"
  - "src/lib/api/**"
---

# Frontend pages (Next.js App Router)

## Server first

- Pages and layouts are Server Components by default. Add `'use client'` only to the smallest leaf that needs state, effects, or browser APIs.
- Fetch data in Server Components or Server Actions, never in `useEffect` on first render.
- Keep secrets and backend base URLs on the server. Only `NEXT_PUBLIC_*` variables reach the browser.
- Mark server-only modules with `import 'server-only'`.

## Talking to the backend

- All backend calls go through the typed API client in `<src/lib/api/>`. No ad-hoc `fetch('/api/...')` in components.
- Response types mirror the backend contract in `<docs/api/api-contracts.md>`. When the backend shape changes, update the type, not a cast.
- Enum values are string literal unions copied exactly from the backend enum. A typo still type-checks and fails at runtime.
- Pick a caching mode for every fetch on purpose (`cache: 'no-store'`, `next: { revalidate: N }`, or tags), and invalidate with `revalidatePath`/`revalidateTag` after mutations.

## Every route segment

- `loading.tsx` for streaming states and `error.tsx` (a client component) for failures. Use `notFound()` for missing records.
- Export `metadata` or `generateMetadata` with a real title.
- Check auth in the layout or middleware for protected segments, never only in client code.
- Server Actions and Route Handlers are public POST endpoints: anyone can call them without the UI. Each one re-checks the session and the caller's role (or ownership of the record) on the server before it reads or changes data, whatever the UI hides. A hidden button and `middleware.ts` alone are not authorization.

```tsx
export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const order = await api.orders.get(id);
  if (!order) notFound();
  return <OrderDetails order={order} />;
}
```

## UI

- Use semantic HTML and labelled form controls. Interactive elements must be keyboard reachable.
- Use `next/image` for images and `next/font` for fonts. No layout shift from late-loading media.
- Run `<pnpm lint && pnpm tsc --noEmit>` before you call it done. Run `<pnpm build>` when routing or config changed.
