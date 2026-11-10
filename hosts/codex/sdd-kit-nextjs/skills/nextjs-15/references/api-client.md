# TypeScript API Client

## Typed API Client

```typescript
type ApiResponse<T> = {
  success: boolean;
  status: number;
  message: string;
  data: T;
};

type PaginatedResponse<T> = ApiResponse<T[]> & {
  meta: {
    current_page: number;
    per_page: number;
    total: number;
    last_page: number;
  };
};

class ApiClient {
  private baseUrl: string;
  private token: string | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  setToken(token: string) {
    this.token = token;
  }

  private async request<T>(
    method: string,
    path: string,
    data?: unknown
  ): Promise<ApiResponse<T>> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: data ? JSON.stringify(data) : undefined,
    });

    const json = await response.json();

    if (!response.ok) {
      throw new ApiError(json.message, response.status, json.errors);
    }

    return json;
  }

  async get<T>(path: string): Promise<ApiResponse<T>> {
    return this.request<T>('GET', path);
  }

  async post<T>(path: string, data: unknown): Promise<ApiResponse<T>> {
    return this.request<T>('POST', path, data);
  }

  async patch<T>(path: string, data: unknown): Promise<ApiResponse<T>> {
    return this.request<T>('PATCH', path, data);
  }

  async delete<T>(path: string): Promise<ApiResponse<T>> {
    return this.request<T>('DELETE', path);
  }
}

export const api = new ApiClient(process.env.NEXT_PUBLIC_API_URL!);
```

## SWR Hooks

```typescript
import useSWR from 'swr';
import { api } from '@/lib/api/client';

type User = {
  id: string;
  type: 'user';
  attributes: {
    name: string;
    email: string;
    created_at: string;
    updated_at: string;
  };
};

export function useUsers(page = 1) {
  return useSWR<PaginatedResponse<User>>(
    `/api/v1/users?page=${page}`,
    () => api.get(`/api/v1/users?page=${page}`)
  );
}

export function useUser(id: string) {
  return useSWR<ApiResponse<User>>(
    id ? `/api/v1/users/${id}` : null,
    () => api.get(`/api/v1/users/${id}`)
  );
}
```
