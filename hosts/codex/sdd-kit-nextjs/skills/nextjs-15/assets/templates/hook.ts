/**
 * Next.js React Hook Templates
 *
 * Replace placeholders:
 * - {{Entity}} = Entity name PascalCase (e.g., User, Order)
 * - {{entity}} = Entity name camelCase (e.g., user, order)
 * - {{entities}} = Entity name plural camelCase (e.g., users, orders)
 */

// ===========================================================================
// REACT QUERY HOOKS - hooks/use{{Entity}}.ts
// ===========================================================================

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  get{{Entity}}s,
  get{{Entity}},
  create{{Entity}},
  update{{Entity}},
  delete{{Entity}},
} from '@/lib/api/{{entities}}';
import {
  {{Entity}},
  Create{{Entity}}Request,
  Update{{Entity}}Request,
  {{Entity}}Filters,
} from '@/types/{{entity}}';

// Query keys for cache management
export const {{entity}}Keys = {
  all: ['{{entities}}'] as const,
  lists: () => [...{{entity}}Keys.all, 'list'] as const,
  list: (filters: {{Entity}}Filters) => [...{{entity}}Keys.lists(), filters] as const,
  details: () => [...{{entity}}Keys.all, 'detail'] as const,
  detail: (id: string) => [...{{entity}}Keys.details(), id] as const,
};

/**
 * Hook for fetching {{entities}} list with filtering and pagination
 */
export function use{{Entity}}s(filters?: {{Entity}}Filters) {
  return useQuery({
    queryKey: {{entity}}Keys.list(filters || {}),
    queryFn: () => get{{Entity}}s(filters),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

/**
 * Hook for fetching a single {{entity}} by ID
 */
export function use{{Entity}}(id: string | undefined) {
  return useQuery({
    queryKey: {{entity}}Keys.detail(id || ''),
    queryFn: () => get{{Entity}}(id!),
    enabled: !!id,
    staleTime: 1000 * 60 * 5,
  });
}

/**
 * Hook for creating a new {{entity}}
 */
export function useCreate{{Entity}}() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Create{{Entity}}Request) => create{{Entity}}(data),
    onSuccess: () => {
      // Invalidate list queries to refetch
      queryClient.invalidateQueries({ queryKey: {{entity}}Keys.lists() });
    },
  });
}

/**
 * Hook for updating an existing {{entity}}
 */
export function useUpdate{{Entity}}() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Update{{Entity}}Request }) =>
      update{{Entity}}(id, data),
    onSuccess: (updated{{Entity}}, { id }) => {
      // Update the specific {{entity}} in cache
      queryClient.setQueryData({{entity}}Keys.detail(id), updated{{Entity}});
      // Invalidate lists to refetch
      queryClient.invalidateQueries({ queryKey: {{entity}}Keys.lists() });
    },
  });
}

/**
 * Hook for deleting a {{entity}}
 */
export function useDelete{{Entity}}() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => delete{{Entity}}(id),
    onSuccess: (_, id) => {
      // Remove from cache
      queryClient.removeQueries({ queryKey: {{entity}}Keys.detail(id) });
      // Invalidate lists
      queryClient.invalidateQueries({ queryKey: {{entity}}Keys.lists() });
    },
  });
}

// ===========================================================================
// CUSTOM STATE HOOKS - hooks/use{{Entity}}State.ts
// ===========================================================================

import { useState, useCallback } from 'react';

interface Use{{Entity}}FormState {
  name: string;
  description: string;
  setName: (name: string) => void;
  setDescription: (description: string) => void;
  reset: () => void;
  toRequest: () => Create{{Entity}}Request;
}

/**
 * Hook for managing {{entity}} form state
 */
export function use{{Entity}}Form(initial?: Partial<{{Entity}}>): Use{{Entity}}FormState {
  const [name, setName] = useState(initial?.name || '');
  const [description, setDescription] = useState(initial?.description || '');

  const reset = useCallback(() => {
    setName(initial?.name || '');
    setDescription(initial?.description || '');
  }, [initial]);

  const toRequest = useCallback((): Create{{Entity}}Request => ({
    name: name.trim(),
    description: description.trim() || undefined,
  }), [name, description]);

  return {
    name,
    description,
    setName,
    setDescription,
    reset,
    toRequest,
  };
}

// ===========================================================================
// FILTER HOOKS - hooks/use{{Entity}}Filters.ts
// ===========================================================================

import { useCallback } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';

interface Use{{Entity}}FiltersResult {
  filters: {{Entity}}Filters;
  setFilter: (key: keyof {{Entity}}Filters, value: string | number | undefined) => void;
  clearFilters: () => void;
}

/**
 * Hook for managing {{entity}} list filters via URL query params
 */
export function use{{Entity}}Filters(): Use{{Entity}}FiltersResult {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const filters: {{Entity}}Filters = {
    search: searchParams.get('search') || undefined,
    status: (searchParams.get('status') as {{Entity}}Filters['status']) || undefined,
    page: searchParams.get('page') ? parseInt(searchParams.get('page')!) : undefined,
    per_page: searchParams.get('per_page') ? parseInt(searchParams.get('per_page')!) : undefined,
  };

  const setFilter = useCallback(
    (key: keyof {{Entity}}Filters, value: string | number | undefined) => {
      const params = new URLSearchParams(searchParams.toString());

      if (value === undefined || value === '') {
        params.delete(key);
      } else {
        params.set(key, String(value));
      }

      // Reset to page 1 when filters change (except when changing page itself)
      if (key !== 'page') {
        params.delete('page');
      }

      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams]
  );

  const clearFilters = useCallback(() => {
    router.push(pathname);
  }, [router, pathname]);

  return {
    filters,
    setFilter,
    clearFilters,
  };
}

// ===========================================================================
// DEBOUNCE HOOK - hooks/useDebounce.ts
// ===========================================================================

import { useState, useEffect } from 'react';

/**
 * Hook for debouncing a value (useful for search inputs)
 */
export function useDebounce<T>(value: T, delay: number = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);

  return debouncedValue;
}

// ===========================================================================
// OPTIMISTIC UPDATE EXAMPLE
// ===========================================================================

/**
 * Hook with optimistic updates for better UX
 */
export function useOptimisticUpdate{{Entity}}() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Update{{Entity}}Request }) =>
      update{{Entity}}(id, data),

    // Optimistically update before request completes
    onMutate: async ({ id, data }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: {{entity}}Keys.detail(id) });

      // Snapshot current value
      const previous{{Entity}} = queryClient.getQueryData({{entity}}Keys.detail(id));

      // Optimistically update
      queryClient.setQueryData({{entity}}Keys.detail(id), (old: {{Entity}} | undefined) =>
        old ? { ...old, ...data } : old
      );

      return { previous{{Entity}} };
    },

    // Rollback on error
    onError: (err, { id }, context) => {
      if (context?.previous{{Entity}}) {
        queryClient.setQueryData({{entity}}Keys.detail(id), context.previous{{Entity}});
      }
    },

    // Always refetch after error or success
    onSettled: (_, __, { id }) => {
      queryClient.invalidateQueries({ queryKey: {{entity}}Keys.detail(id) });
    },
  });
}

// ===========================================================================
// USAGE EXAMPLES
// ===========================================================================

/*
// In a component:

function {{Entity}}sPage() {
  // Fetch list with filters
  const { filters, setFilter } = use{{Entity}}Filters();
  const { data, isLoading, error } = use{{Entity}}s(filters);

  // Debounced search
  const [searchInput, setSearchInput] = useState('');
  const debouncedSearch = useDebounce(searchInput, 300);

  useEffect(() => {
    setFilter('search', debouncedSearch || undefined);
  }, [debouncedSearch, setFilter]);

  // Create mutation
  const createMutation = useCreate{{Entity}}();

  async function handleCreate(data: Create{{Entity}}Request) {
    await createMutation.mutateAsync(data);
  }

  // Update mutation
  const updateMutation = useUpdate{{Entity}}();

  async function handleUpdate(id: string, data: Update{{Entity}}Request) {
    await updateMutation.mutateAsync({ id, data });
  }

  // Delete mutation
  const deleteMutation = useDelete{{Entity}}();

  async function handleDelete(id: string) {
    if (confirm('Are you sure?')) {
      await deleteMutation.mutateAsync(id);
    }
  }

  if (isLoading) return <Loading />;
  if (error) return <Error error={error} />;

  return (
    <div>
      <input
        value={searchInput}
        onChange={(e) => setSearchInput(e.target.value)}
        placeholder="Search..."
      />
      <{{Entity}}List
        {{entities}}={data.data}
        onDelete={handleDelete}
      />
    </div>
  );
}
*/
