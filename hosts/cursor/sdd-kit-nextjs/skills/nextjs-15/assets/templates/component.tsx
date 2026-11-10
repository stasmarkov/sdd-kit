/**
 * Next.js Component Templates
 *
 * Replace placeholders:
 * - {{Entity}} = Entity name PascalCase (e.g., User, Order)
 * - {{entity}} = Entity name camelCase (e.g., user, order)
 * - {{entities}} = Entity name plural camelCase (e.g., users, orders)
 */

// ===========================================================================
// TYPE DEFINITIONS - types/{{entity}}.ts
// ===========================================================================

export interface {{Entity}} {
  id: string;
  name: string;
  description: string | null;
  status: '{{entity}}_status_active' | '{{entity}}_status_pending' | '{{entity}}_status_inactive';
  created_at: string;
  updated_at: string;
}

export interface Create{{Entity}}Request {
  name: string;
  description?: string;
}

export interface Update{{Entity}}Request {
  name?: string;
  description?: string;
  status?: {{Entity}}['status'];
}

export interface {{Entity}}Filters {
  search?: string;
  status?: {{Entity}}['status'];
  page?: number;
  per_page?: number;
}

// ===========================================================================
// LIST COMPONENT - components/{{Entity}}List.tsx
// ===========================================================================

'use client';

import Link from 'next/link';
import { {{Entity}} } from '@/types/{{entity}}';
import { {{Entity}}StatusBadge } from './{{Entity}}StatusBadge';

interface {{Entity}}ListProps {
  {{entities}}: {{Entity}}[];
  meta: {
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
  };
}

export function {{Entity}}List({ {{entities}}, meta }: {{Entity}}ListProps) {
  if ({{entities}}.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">No {{entities}} found.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-800">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Name
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Created
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-900">
            {{{entities}}.map(({{entity}}) => (
              <tr key={{{entity}}.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                <td className="px-6 py-4">
                  <Link
                    href={`/{{entities}}/${{{entity}}.id}`}
                    className="font-medium text-gray-900 hover:text-primary-600 dark:text-white"
                  >
                    {{{entity}}.name}
                  </Link>
                  {{{entity}}.description && (
                    <p className="mt-1 text-sm text-gray-500 line-clamp-1">
                      {{{entity}}.description}
                    </p>
                  )}
                </td>
                <td className="px-6 py-4">
                  <{{Entity}}StatusBadge status={{{entity}}.status} />
                </td>
                <td className="px-6 py-4 text-sm text-gray-500">
                  {new Date({{entity}}.created_at).toLocaleDateString()}
                </td>
                <td className="px-6 py-4 text-right">
                  <Link
                    href={`/{{entities}}/${{{entity}}.id}/edit`}
                    className="text-primary-600 hover:text-primary-700"
                  >
                    Edit
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="mt-4 flex items-center justify-between">
        <p className="text-sm text-gray-700 dark:text-gray-300">
          Showing {(meta.current_page - 1) * meta.per_page + 1} to{' '}
          {Math.min(meta.current_page * meta.per_page, meta.total)} of {meta.total} results
        </p>
        <div className="flex gap-2">
          {meta.current_page > 1 && (
            <Link
              href={`?page=${meta.current_page - 1}`}
              className="rounded-md border px-3 py-1 text-sm hover:bg-gray-50"
            >
              Previous
            </Link>
          )}
          {meta.current_page < meta.last_page && (
            <Link
              href={`?page=${meta.current_page + 1}`}
              className="rounded-md border px-3 py-1 text-sm hover:bg-gray-50"
            >
              Next
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

// ===========================================================================
// FORM COMPONENT - components/{{Entity}}Form.tsx
// ===========================================================================

'use client';

import { useState } from 'react';
import { {{Entity}}, Create{{Entity}}Request, Update{{Entity}}Request } from '@/types/{{entity}}';

interface {{Entity}}FormProps {
  {{entity}}?: {{Entity}};
  onSubmit: (data: Create{{Entity}}Request | Update{{Entity}}Request) => Promise<void>;
  isSubmitting?: boolean;
}

export function {{Entity}}Form({ {{entity}}, onSubmit, isSubmitting }: {{Entity}}FormProps) {
  const [name, setName] = useState({{entity}}?.name ?? '');
  const [description, setDescription] = useState({{entity}}?.description ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});

  function validate(): boolean {
    const newErrors: Record<string, string> = {};

    if (!name.trim()) {
      newErrors.name = 'Name is required';
    } else if (name.length > 255) {
      newErrors.name = 'Name cannot exceed 255 characters';
    }

    if (description && description.length > 1000) {
      newErrors.description = 'Description cannot exceed 1000 characters';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!validate()) return;

    await onSubmit({
      name: name.trim(),
      description: description.trim() || undefined,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Name Field */}
      <div>
        <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          Name <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={`mt-1 block w-full rounded-md border px-3 py-2 shadow-sm focus:outline-none focus:ring-1 ${
            errors.name
              ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
              : 'border-gray-300 focus:border-primary-500 focus:ring-primary-500'
          }`}
          placeholder="Enter {{entity}} name"
        />
        {errors.name && (
          <p className="mt-1 text-sm text-red-600">{errors.name}</p>
        )}
      </div>

      {/* Description Field */}
      <div>
        <label htmlFor="description" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          Description
        </label>
        <textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          className={`mt-1 block w-full rounded-md border px-3 py-2 shadow-sm focus:outline-none focus:ring-1 ${
            errors.description
              ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
              : 'border-gray-300 focus:border-primary-500 focus:ring-primary-500'
          }`}
          placeholder="Enter description (optional)"
        />
        {errors.description && (
          <p className="mt-1 text-sm text-red-600">{errors.description}</p>
        )}
      </div>

      {/* Submit Button */}
      <div className="flex gap-4">
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting ? 'Saving...' : {{entity}} ? 'Update {{Entity}}' : 'Create {{Entity}}'}
        </button>
        <a
          href="/{{entities}}"
          className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Cancel
        </a>
      </div>
    </form>
  );
}

// ===========================================================================
// DETAIL COMPONENT - components/{{Entity}}Detail.tsx
// ===========================================================================

import { {{Entity}} } from '@/types/{{entity}}';
import { {{Entity}}StatusBadge } from './{{Entity}}StatusBadge';

interface {{Entity}}DetailProps {
  {{entity}}: {{Entity}};
}

export function {{Entity}}Detail({ {{entity}} }: {{Entity}}DetailProps) {
  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            {{{entity}}.name}
          </h2>
          <{{Entity}}StatusBadge status={{{entity}}.status} />
        </div>
      </div>

      <div className="px-6 py-4 space-y-4">
        {{{entity}}.description && (
          <div>
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">
              Description
            </h3>
            <p className="mt-1 text-gray-900 dark:text-white">
              {{{entity}}.description}
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">
              Created
            </h3>
            <p className="mt-1 text-gray-900 dark:text-white">
              {new Date({{entity}}.created_at).toLocaleString()}
            </p>
          </div>
          <div>
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">
              Last Updated
            </h3>
            <p className="mt-1 text-gray-900 dark:text-white">
              {new Date({{entity}}.updated_at).toLocaleString()}
            </p>
          </div>
        </div>
      </div>

      <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex gap-4">
        <a
          href={`/{{entities}}/${{{entity}}.id}/edit`}
          className="rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
        >
          Edit
        </a>
        <a
          href="/{{entities}}"
          className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Back to List
        </a>
      </div>
    </div>
  );
}

// ===========================================================================
// STATUS BADGE - components/{{Entity}}StatusBadge.tsx
// ===========================================================================

interface {{Entity}}StatusBadgeProps {
  status: string;
}

const statusStyles: Record<string, string> = {
  active: 'bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100',
  pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-800 dark:text-yellow-100',
  inactive: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
};

export function {{Entity}}StatusBadge({ status }: {{Entity}}StatusBadgeProps) {
  const style = statusStyles[status] || statusStyles.inactive;

  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${style}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

// ===========================================================================
// SKELETON LOADER - components/{{Entity}}ListSkeleton.tsx
// ===========================================================================

export function {{Entity}}ListSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="overflow-hidden rounded-lg border border-gray-200">
        <div className="bg-gray-50 px-6 py-3">
          <div className="flex gap-4">
            <div className="h-4 w-24 bg-gray-200 rounded" />
            <div className="h-4 w-16 bg-gray-200 rounded" />
            <div className="h-4 w-20 bg-gray-200 rounded" />
          </div>
        </div>
        <div className="divide-y divide-gray-200">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="px-6 py-4 flex gap-4">
              <div className="flex-1">
                <div className="h-4 w-48 bg-gray-200 rounded mb-2" />
                <div className="h-3 w-32 bg-gray-200 rounded" />
              </div>
              <div className="h-6 w-16 bg-gray-200 rounded" />
              <div className="h-4 w-24 bg-gray-200 rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
