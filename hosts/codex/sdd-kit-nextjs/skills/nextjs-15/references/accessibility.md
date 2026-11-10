# Accessibility: React and Next.js

Framework examples for the core `accessibility` skill.

## Patterns

```tsx
// Accessible icon button — name comes from aria-label, icon hidden from AT
<button aria-label="Close dialog" onClick={onClose}>
  <XIcon aria-hidden="true" />
</button>

// Field with error wired to the input
<label htmlFor="email">Email</label>
<input id="email" type="email" aria-invalid={!!error}
       aria-describedby={error ? "email-err" : undefined} />
{error && <p id="email-err" role="alert">{error}</p>}
```

- Modals: render in a portal, set `role="dialog"` + `aria-modal="true"`, trap focus, `Esc` closes, restore focus to trigger.
- Prefer Radix UI / React Aria primitives over hand-rolled widgets — they ship correct ARIA + keyboard behavior.
- Server Components: a11y is markup-level, unaffected by RSC/Client split — same rules apply.

## Automated gate

```bash
npm i -D jest-axe @axe-core/playwright
```

```ts
import { axe } from 'jest-axe'
expect(await axe(container)).toHaveNoViolations()
```

```bash
npx lighthouse <url> --only-categories=accessibility --quiet
```
