# TypeScript Utility Types

## Built-in Utility Types

```typescript
// Partial - all properties optional
type PartialUser = Partial<User>;

// Required - all properties required
type RequiredUser = Required<User>;

// Pick - select specific properties
type UserPreview = Pick<User, 'id' | 'name' | 'email'>;

// Omit - exclude specific properties
type UserWithoutDates = Omit<User, 'created_at' | 'updated_at'>;

// Record - key-value mapping
type UserMap = Record<string, User>;

// Extract / Exclude
type ActiveStatus = Extract<Status, 'active' | 'inactive'>;
type NonActiveStatus = Exclude<Status, 'active'>;

// NonNullable
type DefinitelyUser = NonNullable<User | null | undefined>;

// ReturnType / Parameters
type FetchUserResult = ReturnType<typeof fetchUser>;
type FetchUserParams = Parameters<typeof fetchUser>;
```

## Custom Utility Types

```typescript
type WithRequired<T, K extends keyof T> = T & { [P in K]-?: T[P] };
type WithOptional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;
type DeepPartial<T> = { [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P] };
type Nullable<T> = T | null;

// Usage
type UserWithRequiredName = WithRequired<User, 'name'>;
type UserWithOptionalEmail = WithOptional<User, 'email'>;
```

## Type Guards

```typescript
function isUser(value: unknown): value is User {
  return typeof value === 'object' && value !== null && 'id' in value && 'email' in value;
}

// Discriminated union
interface SuccessResponse<T> { success: true; data: T; }
interface ErrorResponse { success: false; error: string; }
type Response<T> = SuccessResponse<T> | ErrorResponse;

function isSuccess<T>(response: Response<T>): response is SuccessResponse<T> {
  return response.success === true;
}

const response: Response<User> = await fetchUser(id);
if (isSuccess(response)) {
  console.log(response.data.email);
} else {
  console.log(response.error);
}
```