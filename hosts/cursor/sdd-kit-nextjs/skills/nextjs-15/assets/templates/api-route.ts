/**
 * Next.js API Route Templates (App Router)
 *
 * Replace placeholders:
 * - {{Entity}} = Entity name PascalCase (e.g., User, Order)
 * - {{entity}} = Entity name camelCase (e.g., user, order)
 * - {{entities}} = Entity name plural camelCase (e.g., users, orders)
 * - {{BACKEND_ENDPOINT}} = backend API endpoint (e.g., /api/v1/users)
 */

// ===========================================================================
// LIST ENDPOINT - app/api/{{entities}}/route.ts
// ===========================================================================

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

const API_URL = process.env.API_URL || 'http://localhost:8000';

// GET - List {{entities}}
export async function GET(request: NextRequest) {
  const token = cookies().get('access_token')?.value;

  if (!token) {
    return NextResponse.json(
      { success: false, message: 'Unauthorized' },
      { status: 401 }
    );
  }

  // Forward query params
  const searchParams = request.nextUrl.searchParams.toString();
  const url = `${API_URL}{{BACKEND_ENDPOINT}}${searchParams ? `?${searchParams}` : ''}`;

  try {
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
      },
      cache: 'no-store',
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(data, { status: response.status });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST - Create {{entity}}
export async function POST(request: NextRequest) {
  const token = cookies().get('access_token')?.value;

  if (!token) {
    return NextResponse.json(
      { success: false, message: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    const body = await request.json();

    const response = await fetch(`${API_URL}{{BACKEND_ENDPOINT}}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    );
  }
}

// ===========================================================================
// DETAIL ENDPOINT - app/api/{{entities}}/[id]/route.ts
// ===========================================================================

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

const API_URL = process.env.API_URL || 'http://localhost:8000';

interface RouteParams {
  params: { id: string };
}

// GET - Get single {{entity}}
export async function GET(request: NextRequest, { params }: RouteParams) {
  const token = cookies().get('access_token')?.value;

  if (!token) {
    return NextResponse.json(
      { success: false, message: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    const response = await fetch(`${API_URL}{{BACKEND_ENDPOINT}}/${params.id}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
      },
      cache: 'no-store',
    });

    const data = await response.json();

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PUT - Update {{entity}}
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const token = cookies().get('access_token')?.value;

  if (!token) {
    return NextResponse.json(
      { success: false, message: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    const body = await request.json();

    const response = await fetch(`${API_URL}{{BACKEND_ENDPOINT}}/${params.id}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PATCH - Partial update {{entity}}
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const token = cookies().get('access_token')?.value;

  if (!token) {
    return NextResponse.json(
      { success: false, message: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    const body = await request.json();

    const response = await fetch(`${API_URL}{{BACKEND_ENDPOINT}}/${params.id}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE - Delete {{entity}}
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const token = cookies().get('access_token')?.value;

  if (!token) {
    return NextResponse.json(
      { success: false, message: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    const response = await fetch(`${API_URL}{{BACKEND_ENDPOINT}}/${params.id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
      },
    });

    if (response.status === 204) {
      return new NextResponse(null, { status: 204 });
    }

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    );
  }
}

// ===========================================================================
// API CLIENT FUNCTIONS - lib/api/{{entities}}.ts
// ===========================================================================

import { {{Entity}}, Create{{Entity}}Request, Update{{Entity}}Request, {{Entity}}Filters } from '@/types/{{entity}}';

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
}

// Server-side fetch (uses access token from cookies)
async function serverFetch<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const { cookies } = await import('next/headers');
  const token = cookies().get('access_token')?.value;

  const response = await fetch(`${process.env.API_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...(token && { 'Authorization': `Bearer ${token}` }),
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'API request failed');
  }

  return response.json();
}

// Client-side fetch (proxies through Next.js API routes)
async function clientFetch<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await fetch(`/api${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    credentials: 'include',
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'API request failed');
  }

  return response.json();
}

// Get {{entities}} list
export async function get{{Entity}}s(
  filters?: {{Entity}}Filters
): Promise<PaginatedResponse<{{Entity}}>> {
  const params = new URLSearchParams();

  if (filters?.search) params.set('search', filters.search);
  if (filters?.status) params.set('status', filters.status);
  if (filters?.page) params.set('page', String(filters.page));
  if (filters?.per_page) params.set('per_page', String(filters.per_page));

  const query = params.toString();
  return serverFetch(`{{BACKEND_ENDPOINT}}${query ? `?${query}` : ''}`);
}

// Get single {{entity}}
export async function get{{Entity}}(id: string): Promise<{{Entity}} | null> {
  try {
    const response = await serverFetch<ApiResponse<{{Entity}}>>(`{{BACKEND_ENDPOINT}}/${id}`);
    return response.data;
  } catch {
    return null;
  }
}

// Create {{entity}} (client-side)
export async function create{{Entity}}(
  data: Create{{Entity}}Request
): Promise<{{Entity}}> {
  const response = await clientFetch<ApiResponse<{{Entity}}>>('/{{entities}}', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return response.data;
}

// Update {{entity}} (client-side)
export async function update{{Entity}}(
  id: string,
  data: Update{{Entity}}Request
): Promise<{{Entity}}> {
  const response = await clientFetch<ApiResponse<{{Entity}}>>(`/{{entities}}/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
  return response.data;
}

// Delete {{entity}} (client-side)
export async function delete{{Entity}}(id: string): Promise<void> {
  await clientFetch(`/{{entities}}/${id}`, { method: 'DELETE' });
}
