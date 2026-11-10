---
name: typescript
description: TypeScript patterns for full-stack apps. Use for type definitions, API clients, and Zod validation.
user-invocable: false
allowed-tools: Read, Grep, Glob, Edit, Write
paths:
  - "**/*.ts"
  - "**/*.tsx"
---

# TypeScript Patterns

Team-specific TypeScript patterns for a Next.js frontend that calls a backend API. The types below use one common envelope; copy field names from your backend's API contract (its resources, `api-contracts.md` or OpenAPI file), never invent them.

## When to Load References

| Task | Load |
|------|------|
| Utility types, type guards | `references/utility-types.md` |

---

## API Response Types

### Standard API Response (matching the backend API's envelope)
```typescript
interface ApiResponse<T> {
  success: boolean;
  status: number;
  message: string;
  data: T;
}

interface PaginatedResponse<T> extends ApiResponse<T[]> {
  meta: {
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
  };
  links: {
    first: string;
    last: string;
    prev: string | null;
    next: string | null;
  };
}

interface ApiError {
  success: false;
  status: number;
  message: string;
  errors?: Record<string, string[]>;
}
```

### Entity Types (matching the backend API's DTOs)
```typescript
interface User {
  id: string;
  email: string;
  name: string | null;
  status: 'active' | 'inactive' | 'pending';
  email_verified_at: string | null;
  created_at: string;
  updated_at: string;
}

interface CreateUserRequest {
  email: string;
  password: string;
  name?: string;
}

interface UpdateUserRequest {
  name?: string;
  status?: 'active' | 'inactive';
}

interface UserFilters {
  search?: string;
  status?: 'active' | 'inactive' | 'pending';
  sort?: 'created_at' | 'name' | 'email';
  direction?: 'asc' | 'desc';
  per_page?: number;
}
```

---

## Next.js Specific Types

### Page Props
```typescript
interface PageProps {
  params: { id: string };
  searchParams: { [key: string]: string | string[] | undefined };
}

export default async function UserPage({ params, searchParams }: PageProps) {
  const user = await getUser(params.id);
  return <UserProfile user={user} />;
}
```

### Server Actions
```typescript
'use server';

import { z } from 'zod';

const CreateUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2).max(100),
  password: z.string().min(8),
});

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; errors: Record<string, string[]> };

export async function createUser(
  prevState: ActionResult<User> | null,
  formData: FormData
): Promise<ActionResult<User>> {
  const validatedFields = CreateUserSchema.safeParse({
    email: formData.get('email'),
    name: formData.get('name'),
    password: formData.get('password'),
  });

  if (!validatedFields.success) {
    return { success: false, errors: validatedFields.error.flatten().fieldErrors };
  }

  const user = await db.user.create({ data: validatedFields.data });
  return { success: true, data: user };
}
```

---

## API Client

### Fetch Wrapper
```typescript
type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

async function apiClient<T>(
  endpoint: string,
  options: { method?: HttpMethod; headers?: Record<string, string>; body?: unknown } = {}
): Promise<ApiResponse<T>> {
  const { method = 'GET', headers = {}, body } = options;

  const response = await fetch(`${process.env.API_URL}${endpoint}`, {
    method,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const error: ApiError = await response.json();
    throw new ApiException(error);
  }

  return response.json();
}
```

### React Query Integration
```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

function useUsers(filters?: UserFilters) {
  return useQuery<PaginatedResponse<User>, ApiError>({
    queryKey: ['users', filters],
    queryFn: () => apiClient<User[]>(`/api/v1/users?${new URLSearchParams(filters)}`),
  });
}

function useCreateUser() {
  const queryClient = useQueryClient();

  return useMutation<ApiResponse<User>, ApiError, CreateUserRequest>({
    mutationFn: (data) => apiClient<User>('/api/v1/users', { method: 'POST', body: data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });
}
```

---

## Zod Schema Integration

```typescript
import { z } from 'zod';

const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string().min(2).max(100).nullable(),
  status: z.enum(['active', 'inactive', 'pending']),
  createdAt: z.string().datetime(),
});

type User = z.infer<typeof UserSchema>;

const CreateUserSchema = UserSchema.omit({ id: true, createdAt: true }).extend({
  password: z.string().min(8),
});

type CreateUserRequest = z.infer<typeof CreateUserSchema>;
```

---

## Best Practices

- Use `strict: true` in tsconfig.json
- Prefer `interface` for objects, `type` for unions/aliases
- Use `const` assertions: `const ROLES = ['admin', 'user'] as const`
- Prefer `unknown` over `any`
- Use explicit return types for public APIs
- Never use non-null assertion (`!`) — handle null properly

---
