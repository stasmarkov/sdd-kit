# Data Fetching Patterns

Data fetching strategies for Next.js 15 App Router.

## Server Component Fetching

```tsx
// app/users/page.tsx
async function getUsers() {
  const res = await fetch('https://api.example.com/users', {
    // Cache options
    cache: 'force-cache',  // Static (default)
    // cache: 'no-store',  // Dynamic - no caching
    next: { revalidate: 3600 }, // ISR - revalidate every hour
  });

  if (!res.ok) throw new Error('Failed to fetch users');
  return res.json();
}

export default async function UsersPage() {
  const users = await getUsers();
  return <UserList users={users} />;
}
```

## Cache Options

| Option | Behavior | Use When |
|--------|----------|----------|
| `cache: 'force-cache'` | Cache indefinitely | Static content |
| `cache: 'no-store'` | Never cache | Real-time data |
| `next: { revalidate: N }` | Revalidate after N seconds | ISR pages |

## Parallel Data Fetching

```tsx
export default async function DashboardPage() {
  // Start all fetches in parallel
  const [users, orders, stats] = await Promise.all([
    getUsers(),
    getOrders(),
    getStats(),
  ]);

  return (
    <Dashboard users={users} orders={orders} stats={stats} />
  );
}
```

## React Query (Client-Side)

```tsx
'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getUsers, createUser } from '@/lib/api/users';

export function UserManagement() {
  const queryClient = useQueryClient();

  const { data: users, isLoading, error } = useQuery({
    queryKey: ['users'],
    queryFn: getUsers,
  });

  const createMutation = useMutation({
    mutationFn: createUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <div>
      <UserList users={users} />
      <CreateUserForm onSubmit={createMutation.mutate} />
    </div>
  );
}
```

## API Client Pattern

```tsx
// lib/api/client.ts
const API_URL = process.env.NEXT_PUBLIC_API_URL;

export async function apiClient<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!res.ok) {
    throw new Error(`API Error: ${res.status}`);
  }

  return res.json();
}

// lib/api/users.ts
export function getUsers() {
  return apiClient<User[]>('/api/v1/users');
}

export function createUser(data: CreateUserDTO) {
  return apiClient<User>('/api/v1/users', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}
```

## Streaming with Suspense

```tsx
import { Suspense } from 'react';

export default function DashboardPage() {
  return (
    <div>
      <h1>Dashboard</h1>

      {/* Each section loads independently */}
      <Suspense fallback={<StatsLoading />}>
        <Stats />
      </Suspense>

      <Suspense fallback={<ChartLoading />}>
        <Chart />
      </Suspense>

      <Suspense fallback={<TableLoading />}>
        <RecentOrders />
      </Suspense>
    </div>
  );
}
```

## Error Handling

```tsx
// lib/api/utils.ts
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public data?: unknown
  ) {
    super(message);
  }
}

export async function fetchWithError<T>(
  url: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(url, options);

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new ApiError(
      data?.message || 'Request failed',
      res.status,
      data
    );
  }

  return res.json();
}
```
