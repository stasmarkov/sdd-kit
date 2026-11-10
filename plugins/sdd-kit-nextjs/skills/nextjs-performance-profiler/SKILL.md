---
name: nextjs-performance-profiler
description: Profile and optimize Next.js 15 App Router apps for Core Web Vitals (LCP/INP/CLS), bundle size, server-component balance, and image/font delivery. Use when investigating slow page loads, before a release, or when CWV regress. Runs Lighthouse, bundle analysis, and provides targeted fix patterns.
license: Apache-2.0
allowed-tools: Read, Grep, Glob, Bash
metadata:
  category: "frameworks"
  framework: "nextjs"
  framework-version: "15.x"
---

# Next.js Performance Profiler

Establishes a repeatable performance baseline for a Next.js 15 app and provides the fix patterns for the most common regressions: oversized client bundles, missing image/font optimization, unnecessary `"use client"`, and unstreamed data fetches.

Measure first, then set a target, then change one thing at a time: record the baseline (Lighthouse scores, LCP/INP/CLS, bundle sizes, server response time for the page's API calls), agree the target (for example "LCP under 2.5 s on mobile for `/jobs`"), and re-measure after each fix. No optimization without both numbers. For the backend side of a slow page, hand the API calls to the `performance-tester` agent.

## When to Use This Skill

- A page's Lighthouse score dropped in CI.
- LCP, INP, or CLS regressed in production telemetry.
- Bundle size on a route grew unexpectedly.
- A new feature shipped and the team wants a perf gate before merge.
- Audit before a release.

## Core Web Vitals Targets (2026)

| Metric | Good | Needs improvement | Poor |
|--------|------|--------------------|------|
| LCP    | ≤ 2.5s | ≤ 4.0s          | > 4.0s |
| INP    | ≤ 200ms | ≤ 500ms        | > 500ms |
| CLS    | ≤ 0.1 | ≤ 0.25           | > 0.25 |
| TTFB   | ≤ 0.8s | ≤ 1.8s          | > 1.8s |

See `references/cwv-targets.md` for measurement methodology and `references/optimization-playbook.md` for fix patterns.

## Quick Reference

| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| Large initial JS bundle | Client component pulling heavy deps | Convert to Server Component; dynamic-import the client island |
| Slow LCP on hero image | `<img>` not `next/image` | `<Image>` with `priority` and `sizes` |
| CLS spike | Image without width/height; web-font swap | Set intrinsic dimensions; `next/font` with `display: swap` |
| Slow INP on form | Synchronous client work | Defer with `startTransition`; move work to a Server Action |
| Long TTFB | Unstreamed data fetch on the server | Add `<Suspense>` boundaries with `loading.tsx` |
| Repeat fetches | Missing `cache: 'force-cache'` or `revalidate` | Use `fetch(url, { next: { revalidate: 60 } })` |

## When to Load References

| Task | Load |
|------|------|
| Setting CWV targets and measurement | `references/cwv-targets.md` |
| Step-by-step optimization patterns | `references/optimization-playbook.md` |

## Baseline Procedure

1. **Build production locally**: `pnpm build`. Note any "Large page" warnings.
2. **Run Lighthouse** on the production server (`pnpm start`):
   ```bash
   bash scripts/lighthouse-check.sh https://localhost:3000/<route>
   ```
3. **Bundle analysis**:
   ```bash
   ANALYZE=true pnpm build
   # opens .next/analyze/*.html
   ```
4. **Server-component balance**: count `"use client"` directives in the route tree; flag client components > 50 KB gzipped.
5. **Image audit**: `grep -rn "<img" app/ components/` — every `<img>` is a candidate for `next/image`.
6. **Font audit**: confirm `next/font` is used; no `<link rel="stylesheet" href="https://fonts.googleapis.com/...">`.

## Common Pitfalls

- **`"use client"` at top of a page**: cascades the entire tree to client. Push the directive down to the smallest island.
- **Re-rendering an entire list on input**: missing `useMemo` or keying. Move filter logic server-side when possible.
- **`fetch` inside a client component**: defaults to no cache and runs on every mount. Fetch in the parent server component and pass data.
- **Unbounded `Image` without `sizes`**: Next serves the largest variant. Always set `sizes`.
- **CSS-in-JS at scale**: runtime-CSS libs (emotion, styled-components) inflate the bundle. Prefer Tailwind or CSS Modules.

## Related Skills

- **nextjs-15**: framework patterns (Server Components, Server Actions).
- **tailwind-4**: CSS-side performance (purge, variants).
- **typescript**: type-safe data passing between server and client.
