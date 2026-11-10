# Guard ladder: Next.js

Stack patterns for `/learn` Step 3 in a Next.js 15 repo with Vitest and ESLint flat config. The generic ladder is in the core `learn` skill; match the target project's existing files and style over these examples.

## Rung 1: regression test

### Vitest (frontend behavior)

Vitest has no architecture API, so structural frontend rules go to rung 2 (ESLint). Use Vitest for behavior: formatters, mappers, hooks, Server Actions logic. Colocate as `*.test.ts(x)`, matching the project's existing tests (use Jest if that is what the project runs).

```ts
import { describe, expect, it } from 'vitest';
import { formatMoney } from './money';

describe('formatMoney', () => {
  it.each([
    [0, '$0.00'],
    [199, '$1.99'],
    [100000, '$1,000.00'],
  ])('formats %i minor units as %s', (minor, expected) => {
    expect(formatMoney(minor, 'USD')).toBe(expected);
  });
});
```

## Rung 2: static analysis rule

### ESLint flat config (`eslint.config.mjs`)

Next.js 15 projects export an array of config objects. Append one scoped object; do not edit the shared `next/core-web-vitals` entries.

```js
{
  files: ['src/**/*.{ts,tsx}'],
  ignores: ['src/lib/api/**'],
  rules: {
    'no-restricted-imports': ['error', {
      paths: [{ name: 'axios', message: 'Call the backend through the typed client in src/lib/api.' }],
    }],
    'no-restricted-syntax': ['error', {
      selector: "CallExpression[callee.name='parseFloat']",
      message: 'Money is integer minor units end to end. Use formatMoney() for display.',
    }],
  },
},
```

- The `message` is the guard's documentation: say what to do instead, not only what is forbidden.
- Scope with `files` / `ignores` so the rule fires only where the class applies.
