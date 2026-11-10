# Exploration recipes: Next.js

Glob and Grep patterns the `code-explorer` agent uses in a Next.js repo. Every finding cites `file:line`.

## Frontend

| Looking for | Glob | Grep |
|-------------|------|------|
| Routes and pages | `app/**/page.tsx`, `app/**/layout.tsx`, `src/app/**` | the URL segment as a folder name |
| Route handlers | `app/**/route.ts` | `export async function (GET\|POST\|PUT\|PATCH\|DELETE)` |
| Server Actions | `app/**/actions.ts`, `**/*.ts` | `'use server'` |
| Client components | `components/**/*.tsx`, `app/**/*.tsx` | `'use client'`, `useState`, `useForm` |
| API client | `lib/api*.ts`, `lib/**/client.ts`, `services/**/*.ts` | `fetch(`, `process.env.NEXT_PUBLIC_API`, the backend path |
| Auth and middleware | `middleware.ts`, `auth.ts`, `lib/auth*` | `getServerSession\|auth()\|cookies()` |
| Types shared with the API | `types/**/*.ts`, `lib/**/types.ts` | the resource name |

## Tests

| Looking for | Glob | Grep |
|-------------|------|------|
| Vitest | `**/*.test.ts`, `**/*.test.tsx` | `describe(`, the component name |
| Playwright | `e2e/**/*.spec.ts`, `tests/e2e/**` | `test(`, the page path |
