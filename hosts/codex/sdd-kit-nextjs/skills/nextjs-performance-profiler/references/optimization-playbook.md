# Next.js Optimization Playbook

Order patterns by impact. Apply top-down.

## 1. Push `"use client"` Down

**Symptom:** large client bundle for a mostly-static page.

**Fix:** keep the page (`app/.../page.tsx`) a Server Component. Extract the interactive piece into its own file with `"use client"` at the top.

```tsx
// app/products/page.tsx (server)
import { ProductList } from './product-list';
import { FilterBar } from './filter-bar'; // client island

export default async function Page() {
  const products = await getProducts();
  return (
    <>
      <FilterBar />
      <ProductList products={products} />
    </>
  );
}
```

## 2. `next/image` with `sizes` and `priority`

**Symptom:** poor LCP, oversized image variants downloaded.

**Fix:** every static or remote image in the rendered viewport uses `next/image`.

```tsx
import Image from 'next/image';

<Image
  src={hero.src}
  alt={hero.alt}
  width={1200}
  height={600}
  priority           // for above-the-fold
  sizes="(max-width: 768px) 100vw, 1200px"
/>
```

## 3. `next/font` with `display: swap`

**Symptom:** CLS spike at first paint; FOIT (invisible text).

**Fix:**

```tsx
// app/fonts.ts
import { Inter } from 'next/font/google';

export const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

// app/layout.tsx
import { inter } from './fonts';
export default function Layout({ children }) {
  return <html className={inter.variable}><body>{children}</body></html>;
}
```

## 4. `<Suspense>` + `loading.tsx`

**Symptom:** long TTFB; blank screen while data fetches resolve.

**Fix:** wrap async data fetchers in `<Suspense>` so the shell streams immediately.

```tsx
// app/dashboard/page.tsx
import { Suspense } from 'react';
import { Skeleton } from './skeleton';
import { LatencyChart } from './latency-chart';

export default function Page() {
  return (
    <>
      <h1>Dashboard</h1>
      <Suspense fallback={<Skeleton />}>
        <LatencyChart />
      </Suspense>
    </>
  );
}
```

## 5. Cache `fetch()` Explicitly

**Symptom:** repeated database/API hits on every render.

**Fix:** opt in to caching with revalidation.

```ts
const data = await fetch(url, {
  next: { revalidate: 60 },          // ISR-style
  // or
  // next: { tags: ['products'] },   // on-demand invalidate via revalidateTag
});
```

For dynamic per-user data, prefer Server Actions or Route Handlers and cache inside them with `unstable_cache` when appropriate.

## 6. Dynamic Import Heavy Client-Only Components

**Symptom:** large client bundle dominated by one component (chart lib, editor, map).

**Fix:**

```tsx
import dynamic from 'next/dynamic';

const Chart = dynamic(() => import('./chart'), {
  loading: () => <Skeleton />,
  ssr: false,    // only when the component truly cannot SSR
});
```

## 7. Move Filter/Search Work Server-Side

**Symptom:** poor INP on a list page with client-side filter.

**Fix:** route the filter through search params + a Server Component. Use `next/navigation`'s `useRouter().replace()` to update the URL; the server re-renders with the filtered slice.

## 8. Avoid Runtime CSS-in-JS

**Symptom:** large bundle from `styled-components`, `@emotion/styled` runtime.

**Fix:** Tailwind, CSS Modules, or `next/css` (build-time). If you must keep runtime CSS-in-JS, ensure the lib has a Next.js plugin and is configured for SSR.

## 9. Streaming Server Components

**Symptom:** waterfall: A fetches before B fetches before C.

**Fix:** colocate fetches with the components that need them. The runtime parallelizes when possible.

```tsx
async function Page() {
  // These run in parallel because they're sibling awaits:
  const [a, b] = await Promise.all([getA(), getB()]);
  return <Section a={a} b={b} />;
}
```

## 10. Preconnect to Critical Origins

For external assets on the LCP path:

```tsx
// app/layout.tsx
<head>
  <link rel="preconnect" href="https://cdn.example.com" crossOrigin="" />
</head>
```

## Diagnosis Workflow

1. Run `pnpm build` → look at the route summary; flag any First Load JS > 200 KB gzipped.
2. Run `ANALYZE=true pnpm build` → identify dominant deps in the client bundle.
3. Lighthouse on each top route → record P75 against targets.
4. Apply patterns 1–4 first; rerun Lighthouse.
5. Use real-user metrics for the final verdict — Lab is necessary but not sufficient.
