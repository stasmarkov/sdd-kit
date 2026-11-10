---
name: rubric-ui
description: Outcomes rubric for UI components (rendering model, mutations, accessibility, tests).
domain: ui
threshold: 80
---

# UI Component Rubric

## Critical (any fail → BLOCKED)

- `ui.security.xss`: No `dangerouslySetInnerHTML` without a sanitizer; user content never injected into href/src without validation.
- `ui.security.secrets`: No API keys, tokens, or non-public env vars referenced from client components (no publicly exposed environment variable for secrets).
- `ui.auth.gating`: Protected routes call the auth check server-side; client-only auth checks are not the sole gate.

## Important (≥ threshold% pass required)

- `ui.rendering.server-default`: Component is a Server Component unless interactivity demands `"use client"`. If client, justified by hooks or event handlers.
- `ui.rendering.suspense`: Async server components wrap data fetches with appropriate `loading.tsx` or `<Suspense>` boundary.
- `ui.state.no-unnecessary-client`: No `useState`/`useEffect` for data that could be server-fetched.
- `ui.forms.server-action`: Mutations go through a server action or API route; no client-side fetch to mutate when SA is available.
- `ui.forms.validation`: Server-side validation via Zod schema before any DB or external call.
- `ui.a11y.semantic`: Uses semantic elements (`button`, `nav`, `main`, `label for`); aria-* only where semantics aren't enough.
- `ui.a11y.keyboard`: All interactive elements reachable and operable by keyboard; focus visible.
- `ui.types.no-any`: No `any`, `as any`, or `@ts-ignore` in the diff.
- `ui.style.tailwind-tokens`: Uses design tokens / theme classes rather than arbitrary values (`bg-[#ff0000]`) where a token exists.
- `ui.tests.unit`: Component has at least one unit test covering primary render path.
- `ui.tests.run`: The project's test command for the target passes.
- `ui.lint`: The project's lint command passes on the changed files with no warnings introduced.
- `ui.types.check`: The project's type-check command passes (no new type errors).

## Nice-to-have (informational)

- `ui.perf.image`: Uses the framework's optimized image component for static images.
- `ui.perf.bundle`: No large unused imports; tree-shakable barrel files avoided.
- `ui.i18n`: User-visible strings sourced from i18n catalog when one exists.
