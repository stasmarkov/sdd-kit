# Server Actions

Server Actions for form handling and mutations in Next.js 15.

## Basic Server Action

```tsx
// app/actions/users.ts
'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

const CreateUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2),
  password: z.string().min(8),
});

export async function createUser(formData: FormData) {
  const validatedFields = CreateUserSchema.safeParse({
    email: formData.get('email'),
    name: formData.get('name'),
    password: formData.get('password'),
  });

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
    };
  }

  // Create user in database
  await db.user.create({
    data: validatedFields.data,
  });

  revalidatePath('/users');
  redirect('/users');
}
```

## Using in Forms

### Simple Form
```tsx
// app/users/new/page.tsx
import { createUser } from '@/app/actions/users';

export default function NewUserPage() {
  return (
    <form action={createUser}>
      <input type="email" name="email" required />
      <input type="text" name="name" required />
      <input type="password" name="password" required />
      <button type="submit">Create User</button>
    </form>
  );
}
```

### With useFormState (Validation Feedback)
```tsx
'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { createUser } from '@/app/actions/users';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending}>
      {pending ? 'Creating...' : 'Create User'}
    </button>
  );
}

export function CreateUserForm() {
  const [state, formAction] = useFormState(createUser, null);

  return (
    <form action={formAction}>
      <div>
        <input type="email" name="email" required />
        {state?.errors?.email && (
          <p className="text-red-500">{state.errors.email}</p>
        )}
      </div>

      <div>
        <input type="text" name="name" required />
        {state?.errors?.name && (
          <p className="text-red-500">{state.errors.name}</p>
        )}
      </div>

      <SubmitButton />
    </form>
  );
}
```

## Return Types

```tsx
'use server';

// Type-safe return
type ActionState = {
  success?: boolean;
  message?: string;
  errors?: Record<string, string[]>;
};

export async function updateUser(
  prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const validated = schema.safeParse(Object.fromEntries(formData));

  if (!validated.success) {
    return {
      success: false,
      errors: validated.error.flatten().fieldErrors,
    };
  }

  try {
    await db.user.update({ ... });
    return { success: true, message: 'User updated' };
  } catch (error) {
    return { success: false, message: 'Failed to update user' };
  }
}
```

## Non-Form Usage

```tsx
'use client';

import { deleteUser } from '@/app/actions/users';

export function DeleteButton({ userId }: { userId: string }) {
  async function handleDelete() {
    if (confirm('Are you sure?')) {
      await deleteUser(userId);
    }
  }

  return (
    <button onClick={handleDelete} className="text-red-500">
      Delete
    </button>
  );
}
```

## Optimistic Updates

```tsx
'use client';

import { useOptimistic } from 'react';
import { toggleLike } from '@/app/actions/posts';

export function LikeButton({ post }) {
  const [optimisticLikes, addOptimisticLike] = useOptimistic(
    post.likes,
    (state, newLike) => [...state, newLike]
  );

  async function handleLike() {
    addOptimisticLike({ id: 'temp', userId: 'me' });
    await toggleLike(post.id);
  }

  return (
    <button onClick={handleLike}>
      {optimisticLikes.length} Likes
    </button>
  );
}
```

## Cache Revalidation

```tsx
'use server';

import { revalidatePath, revalidateTag } from 'next/cache';

export async function updatePost(id: string, data: FormData) {
  await db.post.update({ where: { id }, data: {...} });

  // Revalidate specific path
  revalidatePath('/posts');
  revalidatePath(`/posts/${id}`);

  // Or revalidate by tag
  revalidateTag('posts');
}
```

## Best Practices

1. **Always validate input** with Zod or similar
2. **Return errors**, don't throw (for form handling)
3. **Use `revalidatePath`** after mutations
4. **Keep actions focused** - one action per mutation type
5. **Type your return values** for better DX
