# Deployment: Next.js

Detail the `devops-engineer` agent defers to for a Next.js app.

- Use `output: 'standalone'` and copy only `.next/standalone`, `.next/static`, and `public` into the production image.
- Pipelines run ESLint, `tsc --noEmit` and the tests before any deploy job; cache the package manager's store keyed on the lockfile.
- Expose `/api/health` for container probes.
