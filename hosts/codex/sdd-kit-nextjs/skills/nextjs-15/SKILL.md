---
name: nextjs-15
description: Next.js 15 App Router patterns. Use for pages, components, server actions, and frontend architecture.
allowed-tools: Read, Grep, Glob, Edit, Write, Bash
paths:
  - "**/*.tsx"
  - "**/*.jsx"
  - "app/**"
  - "components/**"
---

# Next.js 15 Development Patterns

Apply these patterns when building Next.js frontends with App Router.

## Quick Reference

| Task | Pattern |
|------|---------|
| Data fetching | Server Components (async) |
| Interactivity | Client Components ('use client') |
| Form mutations | Server Actions ('use server') |
| Caching | `cache`, `revalidate` options |
| Auth protection | Layout-level redirects |
| API endpoints | Route Handlers (route.ts) |

## When to Load References

| Task | Load |
|------|------|
| Server vs Client decisions | `references/server-components.md` |
| Data fetching patterns | `references/data-fetching.md` |
| Form handling/mutations | `references/server-actions.md` |
| Typed API client | `references/api-client.md` |
| Error boundaries and error handling | `references/error-handling.md` |
| Next.js CI pipeline | `references/ci-pipeline.md` |
| Next.js 16 (proxy.ts, ESLint CLI, Turbopack) | `references/nextjs-16.md` |

## Code Templates

Use templates from `assets/templates/` for scaffolding:

| Template | Purpose |
|----------|---------|
| `page.tsx` | Page with data fetching |
| `component.tsx` | List, Form, Detail components |
| `api-route.ts` | Route handlers |
| `hook.ts` | Custom React hooks |

## App Router Structure

```
app/
├── layout.tsx              # Root layout
├── page.tsx                # Home page
├── loading.tsx             # Loading UI
├── error.tsx               # Error boundary
├── not-found.tsx           # 404 page
│
├── (auth)/                 # Route group (no URL segment)
│   ├── login/page.tsx
│   └── register/page.tsx
│
├── dashboard/
│   ├── layout.tsx          # Dashboard layout
│   ├── page.tsx            # /dashboard
│   └── settings/page.tsx   # /dashboard/settings
│
├── api/v1/
│   └── users/route.ts      # API route
│
└── components/             # Shared components
```

## Core Patterns

### 1. Server vs Client Components

```tsx
// Server Component (default) - async, no hooks
export default async function Page() {
  const data = await fetchData();
  return <ClientComponent data={data} />;
}

// Client Component - hooks, interactivity
'use client';
export function ClientComponent({ data }) {
  const [state, setState] = useState(data);
  return <button onClick={() => setState(...)}>...</button>;
}
```

### 2. Server Actions

```tsx
// app/actions/users.ts
'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

export async function createUser(formData: FormData) {
  const validated = schema.safeParse(Object.fromEntries(formData));
  if (!validated.success) {
    return { errors: validated.error.flatten().fieldErrors };
  }
  await db.user.create({ data: validated.data });
  revalidatePath('/users');
}
```

### 3. API Routes

```tsx
// app/api/v1/users/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const users = await getUsers();
  return NextResponse.json({ success: true, data: users });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const user = await createUser(body);
  return NextResponse.json({ success: true, data: user }, { status: 201 });
}
```

### 4. Protected Routes

```tsx
// app/(protected)/layout.tsx
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';

export default async function ProtectedLayout({ children }) {
  const session = await getSession();
  if (!session) redirect('/login');
  return <>{children}</>;
}
```

### 5. Loading & Error States

```tsx
// app/users/loading.tsx
export default function Loading() {
  return <div className="animate-pulse">Loading...</div>;
}

// app/users/error.tsx
'use client';
export default function Error({ error, reset }) {
  return (
    <div>
      <p>Error: {error.message}</p>
      <button onClick={reset}>Try again</button>
    </div>
  );
}
```

## TypeScript Types

```tsx
// types/api.ts
export interface ApiResponse<T> {
  success: boolean;
  status: number;
  message: string;
  data: T;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  meta: {
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
  };
}
```

---