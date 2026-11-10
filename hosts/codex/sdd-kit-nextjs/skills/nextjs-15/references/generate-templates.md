# Generate templates: Next.js

The `/generate` skill takes its templates from this skill's `assets/templates/`. Paths are relative to the kit's skills directory (`.agents/skills/` in file-copy installs, `skills/` in the plugin).

## Template sources

| Artifact | Template | Namespace / path |
|----------|----------|------------------|
| Page (App Router) | `nextjs-15/assets/templates/page.tsx` | `app/<route>/page.tsx` |
| Components and types | `nextjs-15/assets/templates/component.tsx` | `components/`, `types/` |
| Data hooks | `nextjs-15/assets/templates/hook.ts` | `hooks/` |
| Route handlers (BFF to the backend API) | `nextjs-15/assets/templates/api-route.ts` | `app/api/<resource>/route.ts` |

Gates after generating: ESLint and `tsc --noEmit`.

## CRUD set (frontend part)

```
Next.js (with --nextjs, or when a frontend repo is present)
  types/order.ts
  lib/api/orders.ts (or the project's API client)
  app/orders/page.tsx, app/orders/[id]/page.tsx
  components/orders/OrderCard.tsx
```
