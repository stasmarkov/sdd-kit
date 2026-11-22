---
name: design-ui
description: "Design UI/UX for a feature: user flows, component hierarchy, state management, data fetching, and accessibility, producing a UI design document for any web UI; framework examples are in references. Use when planning a new page, component, or user flow before implementation, or when reviewing existing frontend component patterns."
argument-hint: "[feature-name] | --component=[name] | --page=[name] | --review"
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
List the pages and the components each page needs. Group shared primitives (button, input, card) apart from feature components, and mark which components fetch data and which are interactive.

### Step 3: Component Design
For each component state its inputs, its states (loading, empty, error, success) and who owns the data. Keep data fetching at the page or container level and interactivity in leaf components.

### Step 4: State Management
Separate server state (fetched, cached, invalidated) from client state (form values, UI toggles). Use the framework's own mechanism first and add a library only when it does not cover the case.

### Step 5: API Integration
Define the request and response types the UI consumes, how authentication reaches the call, and how failures surface to the user.

Framework-specific examples (component layout, server and client components, state libraries, typed API calls, composition patterns) are in `references/framework-examples.md`.

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
| CartSummary | Display | cart |
| CheckoutForm | Interactive | onSubmit |
| ShippingForm | Interactive | form state |
| PaymentForm | Interactive | form state |

### State Management
- Server State: fetched cart and orders
- Client State: form state

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

