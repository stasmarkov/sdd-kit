---
name: design-ui
description: "Design UI/UX for a feature: user flows, component hierarchy, state management, data fetching, and accessibility, producing a UI design document for Next.js. Use when planning a new page, component, or user flow before implementation, or when reviewing existing frontend component patterns."
argument-hint: "[feature-name] | --component=[name] | --page=[name]"
allowed-tools: Read, Write, Edit, Grep, Glob
metadata:
  mcp-tools: "context7"
  version: "1.1"
  subagents: "ui-ux-advisor"
---

# /design-ui

Design frontend architecture, component patterns, and user experience flows.

## Usage

```bash
# Design UI for feature
/design-ui "checkout flow"

# Design component
/design-ui --component=ProductCard

# Design page layout
/design-ui --page=Dashboard

# Review component patterns
/design-ui --review
```

## Design Process

### Step 1: User Flow Analysis
```
Checkout Flow:
  1. Cart Review → 2. Shipping → 3. Payment → 4. Confirmation

User Actions:
  - Review items
  - Update quantities
  - Enter shipping address
  - Select payment method
  - Confirm order
```

### Step 2: Component Architecture
```
pages/
├── checkout/
│   ├── page.tsx          # Main checkout page
│   ├── layout.tsx        # Checkout layout
│   └── components/
│       ├── CartSummary.tsx
│       ├── ShippingForm.tsx
│       ├── PaymentForm.tsx
│       └── OrderConfirmation.tsx

components/
├── ui/
│   ├── Button.tsx
│   ├── Input.tsx
│   └── Card.tsx
└── forms/
    ├── AddressForm.tsx
    └── CreditCardForm.tsx
```

### Step 3: Component Design

#### Server Component (Data Fetching)
```tsx
// app/checkout/page.tsx
import { getCart } from '@/lib/api/cart';
import { CartSummary } from './components/CartSummary';
import { CheckoutForm } from './components/CheckoutForm';

export default async function CheckoutPage() {
  const cart = await getCart();

  return (
    <div className="container mx-auto py-8">
      <h1 className="text-2xl font-bold mb-6">Checkout</h1>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <CheckoutForm />
        <CartSummary cart={cart} />
      </div>
    </div>
  );
}
```

#### Client Component (Interactivity)
```tsx
'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { checkoutSchema, type CheckoutData } from '@/lib/validations/checkout';

export function CheckoutForm() {
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<CheckoutData>({
    resolver: zodResolver(checkoutSchema),
  });

  async function onSubmit(data: CheckoutData) {
    setIsLoading(true);
    try {
      await submitOrder(data);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)}>
      {/* Form fields */}
    </form>
  );
}
```

### Step 4: State Management
```tsx
// For complex state, use React Query or Zustand

// React Query for server state
const { data: cart, isLoading } = useQuery({
  queryKey: ['cart'],
  queryFn: fetchCart,
});

// Zustand for client state
const useCartStore = create<CartStore>((set) => ({
  items: [],
  addItem: (item) => set((state) => ({
    items: [...state.items, item]
  })),
}));
```

### Step 5: API Integration
```tsx
// lib/api/types.ts
export interface CartItem {
  id: string;
  name: string;
  quantity: number;
  price: number;
}

export interface Cart {
  items: CartItem[];
  total: number;
}

// lib/api/cart.ts
export async function getCart(): Promise<Cart> {
  const response = await fetch('/api/cart', {
    headers: {
      Authorization: `Bearer ${getToken()}`,
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch cart');
  }

  return response.json();
}
```

## Component Patterns

### Composition Pattern
```tsx
<Card>
  <Card.Header>
    <Card.Title>Order Summary</Card.Title>
  </Card.Header>
  <Card.Content>
    {/* Content */}
  </Card.Content>
  <Card.Footer>
    <Button>Place Order</Button>
  </Card.Footer>
</Card>
```

### Render Props Pattern
```tsx
<DataTable
  data={orders}
  columns={columns}
  renderRow={(row) => (
    <TableRow key={row.id}>
      <TableCell>{row.id}</TableCell>
      <TableCell>{row.status}</TableCell>
    </TableRow>
  )}
/>
```

## Output: UI Design Document

```markdown
# Checkout Flow UI Design

## User Flow
1. Cart Review → 2. Shipping → 3. Payment → 4. Confirmation

## Components Required

### Pages
- /checkout (main checkout page)
- /checkout/confirmation (success page)

### Components
| Component | Type | Props |
|-----------|------|-------|
| CartSummary | Server | cart: Cart |
| CheckoutForm | Client | onSubmit: fn |
| ShippingForm | Client | control: Control |
| PaymentForm | Client | control: Control |

### State Management
- Server State: React Query (cart, orders)
- Client State: Form state (react-hook-form)

### API Endpoints
- GET /api/cart
- POST /api/orders
- GET /api/orders/{id}

## Accessibility
- Form labels and aria attributes
- Keyboard navigation
- Error announcements
- Loading states
```

**Source verification**: follow the `source-verification` skill.

