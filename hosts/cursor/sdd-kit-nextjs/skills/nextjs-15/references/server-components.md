# Server & Client Components

Understanding when to use Server vs Client components in Next.js 15.

## Decision Matrix

| Need | Use |
|------|-----|
| Fetch data | Server Component |
| Access backend resources | Server Component |
| Keep sensitive info on server | Server Component |
| Use browser APIs | Client Component |
| Add interactivity (onClick, onChange) | Client Component |
| Use React hooks (useState, useEffect) | Client Component |

## Server Components (Default)

```tsx
// app/users/page.tsx
// No 'use client' = Server Component

import { getUsers } from '@/lib/api/users';
import { UserList } from './components/UserList';

export default async function UsersPage() {
  // Direct database/API access
  const users = await getUsers();

  return (
    <div className="container mx-auto py-8">
      <h1 className="text-2xl font-bold mb-6">Users</h1>
      <UserList users={users} />
    </div>
  );
}
```

## Client Components

```tsx
'use client';

// Must be at the top of the file
import { useState, useTransition } from 'react';

interface UserSearchProps {
  onSearch: (query: string) => void;
}

export function UserSearch({ onSearch }: UserSearchProps) {
  const [query, setQuery] = useState('');
  const [isPending, startTransition] = useTransition();

  function handleSearch() {
    startTransition(() => {
      onSearch(query);
    });
  }

  return (
    <div className="flex gap-2">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="border rounded px-3 py-2"
      />
      <button onClick={handleSearch} disabled={isPending}>
        {isPending ? 'Searching...' : 'Search'}
      </button>
    </div>
  );
}
```

## Composition Pattern

Server Components can import Client Components, but not vice versa:

```tsx
// app/dashboard/page.tsx (Server Component)
import { DashboardStats } from './DashboardStats'; // Server
import { InteractiveChart } from './InteractiveChart'; // Client

export default async function DashboardPage() {
  const stats = await getStats(); // Fetch on server

  return (
    <div>
      <DashboardStats stats={stats} />
      <InteractiveChart data={stats.chartData} />
    </div>
  );
}
```

## Passing Data to Client Components

```tsx
// Server Component
async function ParentPage() {
  const data = await fetchData();

  // Data is serialized and sent to client
  return <ClientComponent initialData={data} />;
}

// Client Component
'use client';

function ClientComponent({ initialData }) {
  const [data, setData] = useState(initialData);
  // Can now use hooks and interactivity
}
```

## Common Mistakes

### Wrong: Using hooks in Server Components
```tsx
// This will error - no 'use client'
import { useState } from 'react';

export default function Page() {
  const [count, setCount] = useState(0); // Error!
}
```

### Wrong: Async Client Components
```tsx
'use client';

// Client components cannot be async
export default async function ClientPage() { // Error!
  const data = await fetch(...);
}
```

### Right: Fetch in Server, Interact in Client
```tsx
// page.tsx (Server)
export default async function Page() {
  const data = await fetchData();
  return <InteractiveList data={data} />;
}

// InteractiveList.tsx (Client)
'use client';
export function InteractiveList({ data }) {
  const [selected, setSelected] = useState(null);
  // ...
}
```
