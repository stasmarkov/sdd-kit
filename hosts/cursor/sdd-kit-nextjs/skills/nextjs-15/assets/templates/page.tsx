/**
 * Next.js Page Template (App Router)
 *
 * Replace placeholders:
 * - {{Entity}} = Entity name PascalCase (e.g., User, Order)
 * - {{entity}} = Entity name camelCase (e.g., user, order)
 * - {{entities}} = Entity name plural camelCase (e.g., users, orders)
 * - {{path}} = URL path (e.g., /users, /orders)
 */

// ===========================================================================
// SERVER COMPONENT PAGE (Default) - app/{{entities}}/page.tsx
// ===========================================================================

import { Suspense } from 'react';
import { getSession } from '@/lib/auth/session';
import { get{{Entity}}s } from '@/lib/api/{{entities}}';
import { {{Entity}}List } from './components/{{Entity}}List';
import { {{Entity}}ListSkeleton } from './components/{{Entity}}ListSkeleton';
import { redirect } from 'next/navigation';

interface {{Entity}}sPageProps {
  searchParams: { [key: string]: string | string[] | undefined };
}

export const metadata = {
  title: '{{Entity}}s',
  description: 'View and manage {{entities}}',
};

export default async function {{Entity}}sPage({ searchParams }: {{Entity}}sPageProps) {
  // Server-side auth check
  const session = await getSession();
  if (!session) {
    redirect('/login?callbackUrl={{path}}');
  }

  // Parse filters from URL
  const filters = {
    search: searchParams.search as string | undefined,
    status: searchParams.status as string | undefined,
    page: searchParams.page ? parseInt(searchParams.page as string) : 1,
  };

  return (
    <div className="container mx-auto py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          {{Entity}}s
        </h1>
        <a
          href="{{path}}/new"
          className="rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
        >
          Create {{Entity}}
        </a>
      </div>

      {/* Filters */}
      <{{Entity}}Filters filters={filters} />

      {/* List with loading state */}
      <Suspense fallback={<{{Entity}}ListSkeleton />}>
        <{{Entity}}ListWrapper filters={filters} />
      </Suspense>
    </div>
  );
}

// Async wrapper component for data fetching
async function {{Entity}}ListWrapper({
  filters,
}: {
  filters: { search?: string; status?: string; page: number };
}) {
  const data = await get{{Entity}}s(filters);

  return (
    <{{Entity}}List
      {{entities}}={data.data}
      meta={data.meta}
    />
  );
}

// ===========================================================================
// SERVER COMPONENT - Detail Page - app/{{entities}}/[id]/page.tsx
// ===========================================================================

import { notFound } from 'next/navigation';
import { get{{Entity}} } from '@/lib/api/{{entities}}';
import { {{Entity}}Detail } from './components/{{Entity}}Detail';

interface {{Entity}}PageProps {
  params: { id: string };
}

export async function generateMetadata({ params }: {{Entity}}PageProps) {
  const {{entity}} = await get{{Entity}}(params.id);

  if (!{{entity}}) {
    return { title: '{{Entity}} Not Found' };
  }

  return {
    title: {{entity}}.name,
    description: {{entity}}.description,
  };
}

export default async function {{Entity}}Page({ params }: {{Entity}}PageProps) {
  const session = await getSession();
  if (!session) {
    redirect(`/login?callbackUrl={{path}}/${params.id}`);
  }

  const {{entity}} = await get{{Entity}}(params.id);

  if (!{{entity}}) {
    notFound();
  }

  return (
    <div className="container mx-auto py-8">
      <{{Entity}}Detail {{entity}}={{{entity}}} />
    </div>
  );
}

// ===========================================================================
// CLIENT COMPONENT - Create/Edit Form Page - app/{{entities}}/new/page.tsx
// ===========================================================================

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { {{Entity}}Form } from '../components/{{Entity}}Form';
import { create{{Entity}} } from '@/lib/api/{{entities}}';

export default function New{{Entity}}Page() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(data: Create{{Entity}}Request) {
    setError(null);
    setIsSubmitting(true);

    try {
      const {{entity}} = await create{{Entity}}(data);
      router.push(`{{path}}/${{{entity}}.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create {{entity}}');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="container mx-auto py-8 max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
        Create {{Entity}}
      </h1>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-4 text-red-700">
          {error}
        </div>
      )}

      <{{Entity}}Form
        onSubmit={handleSubmit}
        isSubmitting={isSubmitting}
      />
    </div>
  );
}

// ===========================================================================
// LOADING STATE - app/{{entities}}/loading.tsx
// ===========================================================================

export default function Loading() {
  return (
    <div className="container mx-auto py-8">
      <div className="animate-pulse">
        <div className="h-8 w-32 rounded bg-gray-200 mb-6" />
        <div className="space-y-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-20 rounded bg-gray-200" />
          ))}
        </div>
      </div>
    </div>
  );
}

// ===========================================================================
// NOT FOUND - app/{{entities}}/[id]/not-found.tsx
// ===========================================================================

import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="container mx-auto py-8 text-center">
      <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
        {{Entity}} Not Found
      </h2>
      <p className="text-gray-600 dark:text-gray-400 mb-6">
        The {{entity}} you're looking for doesn't exist.
      </p>
      <Link
        href="{{path}}"
        className="text-primary-600 hover:text-primary-700"
      >
        ← Back to {{Entity}}s
      </Link>
    </div>
  );
}

// ===========================================================================
// ERROR BOUNDARY - app/{{entities}}/error.tsx
// ===========================================================================

'use client';

import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="container mx-auto py-8 text-center">
      <h2 className="text-2xl font-bold text-red-600 mb-4">
        Something went wrong!
      </h2>
      <p className="text-gray-600 mb-6">
        {error.message || 'An error occurred while loading {{entities}}.'}
      </p>
      <button
        onClick={reset}
        className="rounded-md bg-primary-600 px-4 py-2 text-white hover:bg-primary-700"
      >
        Try again
      </button>
    </div>
  );
}
