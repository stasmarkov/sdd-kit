# Next.js 16

Load when the frontend's `next` range resolves to Next.js 16 or later, or when upgrading to it.

## Which major applies

Read `next` from the frontend's `package.json` (`dependencies`, then `devDependencies`) and take the lowest major the range allows: `^16.0.0` is 16, `~15.4.0` is 15, and `^15.0.0 || ^16.0.0` is 15 because a 15.x install satisfies it. Apply the Next 16 rules below only when that major is 16 or later. Use the installed version only when the range is a tag such as `latest`.

## What changes in 16

- **Middleware becomes proxy.** Rename `middleware.ts` to `proxy.ts` and the exported function to `proxy`. It runs on the Node.js runtime only; an `edge` runtime export is not supported. Keep it thin: redirects, rewrites and header checks.
- **`next lint` is removed.** Lint with the ESLint CLI: `eslint .` (flat config in `eslint.config.mjs`). The `lint` script must call `eslint`, never `next lint`, and the lint gate runs that script through the package manager. If a repo still has `"lint": "next lint"`, change the script rather than the gate. Do not add `--fix` to the script: the gate must only report.
- **Turbopack is the default** for `next dev` and `next build`. A custom `webpack` function in `next.config.*` fails the build unless you pass `--webpack`; prefer moving the customisation to Turbopack options.
- **Synchronous request APIs are gone.** `cookies()`, `headers()`, `draftMode()`, `params` and `searchParams` are async only: `await` them.
- **Node 20.9 or later** is required, in CI images and the production container too.

## Upgrade checklist

1. Run the official codemod: `npx @next/codemod@canary upgrade latest`.
2. Rename `middleware.ts` to `proxy.ts`; update tests that import it.
3. Replace the `lint` script and any CI step that calls `next lint`.
4. Build once with Turbopack; fix or drop webpack-only configuration.
5. Check `.nvmrc`, `engines` and the CI Node version.

Source: https://nextjs.org/docs/app/guides/upgrading/version-16
