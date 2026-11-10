# Core Web Vitals — Targets & Measurement

## Targets (Q1 2026)

Google's CWV "Good" thresholds apply to the **75th percentile** of real-user measurements across all visits, segmented by device class (mobile vs desktop).

| Metric | Good (P75) | Needs improvement | Poor |
|--------|------------|--------------------|------|
| LCP — Largest Contentful Paint | ≤ 2.5s | ≤ 4.0s | > 4.0s |
| INP — Interaction to Next Paint | ≤ 200ms | ≤ 500ms | > 500ms |
| CLS — Cumulative Layout Shift | ≤ 0.1 | ≤ 0.25 | > 0.25 |
| TTFB — Time to First Byte | ≤ 0.8s | ≤ 1.8s | > 1.8s |
| FCP — First Contentful Paint | ≤ 1.8s | ≤ 3.0s | > 3.0s |

Project-internal stretch targets (often used as CI gates):

| Metric | Stretch (P75 mobile) |
|--------|----------------------|
| LCP | ≤ 1.8s |
| INP | ≤ 100ms |
| CLS | ≤ 0.05 |
| TTFB | ≤ 0.4s |

## Measurement Layers

1. **Lab** — Lighthouse in CI. Useful for trend detection, not absolute truth (no real device, no real network conditions).
2. **Synthetic** — WebPageTest, Calibre, k6/Browser. Repeatable conditions; good for regression catching.
3. **Field (RUM)** — `web-vitals` library + `next/web-vitals` API; the only truthful CWV source.

For a real CWV verdict you need field data over a representative time window (28 days is the CrUX standard).

## Field Collection in Next.js 15

```tsx
// app/web-vitals.ts
'use client';
import { useReportWebVitals } from 'next/web-vitals';

export function WebVitals() {
  useReportWebVitals((metric) => {
    fetch('/api/metrics', {
      method: 'POST',
      body: JSON.stringify(metric),
      keepalive: true,
    });
  });
  return null;
}
```

Then include `<WebVitals />` in the root layout. Pipe `/api/metrics` to your analytics backend (Vercel Analytics, Datadog RUM, custom).

## CI Gate Pattern

Run Lighthouse in CI against the production build of the route(s) that matter. Fail the build when scores drop below a configured floor.

```yaml
# .github/workflows/lh.yml (excerpt)
- run: pnpm build && pnpm start &
- run: bash scripts/lighthouse-check.sh http://localhost:3000/
  env:
    LH_MIN_PERFORMANCE: '85'
    LH_MAX_LCP_MS: '2500'
```

The script (`scripts/lighthouse-check.sh`) is bundled in this skill.

## Reading the Numbers Honestly

- **Lab vs Field mismatch is normal.** A Lab LCP of 1.4s with a Field LCP of 3.8s means real users have slow networks or slow devices — the field number wins.
- **CLS is sticky.** A single layout shift during initial paint can dominate the score for the session. Hunt the source with the Performance panel → Experience → Layout Shifts.
- **INP replaced FID.** FID measured only the first interaction; INP measures all interactions. A laggy modal mid-session now hurts the score.
