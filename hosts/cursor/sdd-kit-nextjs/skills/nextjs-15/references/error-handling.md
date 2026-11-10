# Frontend Error Handling (Next.js)

## ApiError Class

```typescript
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly errorCode: string,
    public readonly errors?: ValidationError[],
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  static fromResponse(response: ErrorResponse): ApiError {
    return new ApiError(
      response.message,
      response.status,
      response.error_code,
      response.errors,
      response.context,
    );
  }

  isValidation(): boolean { return this.status === 422; }
  isUnauthorized(): boolean { return this.status === 401; }
  isNotFound(): boolean { return this.status === 404; }
}
```

## useApiMutation Hook

```typescript
import { useState, useCallback } from 'react';

type MutationState<T> = {
  data: T | null;
  error: ApiError | null;
  isLoading: boolean;
};

export function useApiMutation<TInput, TOutput>(
  mutationFn: (input: TInput) => Promise<TOutput>,
) {
  const [state, setState] = useState<MutationState<TOutput>>({
    data: null,
    error: null,
    isLoading: false,
  });

  const mutate = useCallback(async (input: TInput) => {
    setState({ data: null, error: null, isLoading: true });

    try {
      const data = await mutationFn(input);
      setState({ data, error: null, isLoading: false });
      return { success: true as const, data };
    } catch (e) {
      const error = e instanceof ApiError ? e : new ApiError(
        'An unexpected error occurred', 500, 'UNKNOWN_ERROR',
      );
      setState({ data: null, error, isLoading: false });
      return { success: false as const, error };
    }
  }, [mutationFn]);

  return { ...state, mutate };
}
```

## Component Usage

```typescript
export function PaymentForm() {
  const { mutate, isLoading, error } = useApiMutation(
    (data: PaymentInput) => api.post<Payment>('/api/v1/payments', data)
  );

  const handleSubmit = async (data: PaymentInput) => {
    const result = await mutate(data);
    if (result.success) {
      router.push(`/payments/${result.data.id}`);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      {error?.isValidation() && (
        <ValidationErrors errors={error.errors} />
      )}
      {error && !error.isValidation() && (
        <Alert variant="error">
          {error.message}
          {error.errorCode === 'PAYMENT.INSUFFICIENT_FUNDS' && (
            <p>Please add funds to your account.</p>
          )}
        </Alert>
      )}
      {/* Form fields */}
    </form>
  );
}
```