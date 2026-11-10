---
name: nextjs-auth
description: Next.js auth patterns for a separate API backend (token proxy, HttpOnly cookies). Use for token flow, middleware, and protected routes.
user-invocable: false
allowed-tools: Read, Grep, Glob, Edit, Write
paths:
  - "middleware.ts"
  - "app/**/auth/**"
  - "**/*.tsx"
---

# Next.js Authentication Patterns

Patterns for implementing authentication in Next.js applications that call a separate API backend.

## When to Load References

| Task | Load |
|------|------|
| Custom auth (no NextAuth) | `references/custom-auth-implementation.md` |
| Login form, auth guard | `references/client-components.md` |

---

## Authentication Architecture

### Token Flow
```
1. User submits credentials to Next.js API route
2. Next.js API route proxies to the backend API
3. The backend validates and returns tokens
4. Tokens stored in HttpOnly cookies (set by Next.js)
5. Subsequent requests include cookies automatically
6. Next.js middleware validates tokens on protected routes
```

### Token Storage Options
| Method | Security | Use Case |
|--------|----------|----------|
| HttpOnly Cookie | High | Recommended for web apps |
| Session Cookie | High | Server-side sessions |
| Memory Only | Medium | SPAs with short sessions |
| localStorage | Low | NOT recommended |

---

## Auth.js (NextAuth) Integration

### Configuration
```typescript
// app/api/auth/[...nextauth]/route.ts
import NextAuth from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';

const handler = NextAuth({
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const res = await fetch(`${process.env.API_URL}/api/v1/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: credentials?.email,
            password: credentials?.password,
          }),
        });

        if (!res.ok) return null;
        const data = await res.json();

        return {
          id: data.data.user.id,
          email: data.data.user.email,
          name: data.data.user.name,
          accessToken: data.data.access_token,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.accessToken = user.accessToken;
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken;
      session.user.id = token.id;
      return session;
    },
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
});

export { handler as GET, handler as POST };
```

### Type Definitions
```typescript
// types/next-auth.d.ts
import 'next-auth';

declare module 'next-auth' {
  interface User {
    id: string;
    accessToken: string;
  }
  interface Session {
    accessToken: string;
    user: { id: string; email: string; name: string };
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    accessToken: string;
    id: string;
  }
}
```

---

## Middleware Protection

```typescript
// middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const publicPaths = ['/login', '/register', '/forgot-password'];
const authPaths = ['/login', '/register'];

export function middleware(request: NextRequest) {
  const token = request.cookies.get('access_token')?.value;
  const { pathname } = request.nextUrl;

  if (publicPaths.some((path) => pathname.startsWith(path))) {
    if (token && authPaths.some((path) => pathname.startsWith(path))) {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
    return NextResponse.next();
  }

  if (!token) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
```

---

## Server Component Auth

### Getting Session
```typescript
// lib/auth/session.ts
import { cookies } from 'next/headers';

export async function getSession(): Promise<User | null> {
  const token = cookies().get('access_token')?.value;
  if (!token) return null;

  try {
    const res = await fetch(`${process.env.API_URL}/api/v1/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.data;
  } catch {
    return null;
  }
}
```

### Protected Page
```typescript
// app/dashboard/page.tsx
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';

export default async function DashboardPage() {
  const user = await getSession();
  if (!user) redirect('/login');

  return <div><h1>Welcome, {user.name}</h1></div>;
}
```

### Protected Layout
```typescript
// app/(protected)/layout.tsx
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const user = await getSession();
  if (!user) redirect('/login');
  return <>{children}</>;
}
```

---
