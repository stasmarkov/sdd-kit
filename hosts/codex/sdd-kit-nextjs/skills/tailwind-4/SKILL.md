---
name: tailwind-4
description: Tailwind CSS v4 patterns. Use for styling, layouts, responsive design, and dark mode.
user-invocable: false
allowed-tools: Read, Grep, Glob, Edit, Write
paths:
  - "**/*.css"
  - "**/*.tsx"
  - "tailwind.config.*"
---

# Tailwind CSS v4 Patterns

Knowledge module for Tailwind CSS v4 patterns and best practices.

## When to Load References

| Task | Load |
|------|------|
| Building UI components (cards, buttons, forms, nav) | `references/component-patterns.md` |
| Flexbox, grid, or container layouts | `references/layout-patterns.md` |
| Transitions, animations, or skeleton loading | `references/animations-and-loading.md` |

---

## Setup & Configuration

### Installation (v4)
```css
/* app.css */
@import "tailwindcss";
```

```javascript
// vite.config.js
import tailwindcss from '@tailwindcss/vite'

export default {
  plugins: [
    tailwindcss(),
  ],
}
```

### CSS Variables Theme
```css
@import "tailwindcss";

@theme {
  --color-primary-50: oklch(0.97 0.02 240);
  --color-primary-100: oklch(0.94 0.04 240);
  --color-primary-500: oklch(0.55 0.2 240);
  --color-primary-600: oklch(0.45 0.22 240);
  --color-primary-700: oklch(0.35 0.2 240);

  --font-sans: "Inter", system-ui, sans-serif;
  --font-mono: "JetBrains Mono", monospace;

  --spacing-128: 32rem;
  --spacing-144: 36rem;

  --radius-4xl: 2rem;
}
```

---

## Layout Quick Reference

**Flexbox:** `flex gap-4`, `flex flex-col gap-4`, `flex items-center justify-between`
**Centering:** `flex items-center justify-center min-h-screen`
**Grid:** `grid grid-cols-3 gap-4`, responsive: `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6`
**Auto-fit:** `grid grid-cols-[repeat(auto-fit,minmax(250px,1fr))] gap-4`
**Container:** `mx-auto max-w-7xl px-4 sm:px-6 lg:px-8`

---

## Component Quick Reference

**Card:** `rounded-lg border border-gray-200 bg-white p-6 shadow-sm`
**Primary button:** `rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2`
**Secondary button:** `rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50`
**Input:** `block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500`
**Error input:** add `border-red-300 text-red-900 placeholder-red-300 focus:border-red-500 focus:ring-red-500`
**Checkbox:** `h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500`

---

## Responsive Design

### Breakpoints (mobile-first)
```html
<div class="text-sm md:text-base lg:text-lg">Responsive text</div>
<div class="hidden md:block">Desktop only</div>
<div class="md:hidden">Mobile only</div>
<div class="p-4 md:p-6 lg:p-8">Responsive padding</div>
<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
  <div>Item</div>
</div>
```

### Container Queries (v4)
```html
<div class="@container">
  <div class="@md:flex @md:items-center">
    Container query responsive
  </div>
</div>
```

---

## Dark Mode

```html
<div class="bg-white dark:bg-gray-900">
  <h1 class="text-gray-900 dark:text-white">Heading</h1>
  <p class="text-gray-600 dark:text-gray-300">Description</p>
</div>

<!-- Card with dark mode -->
<div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
  <h3 class="text-gray-900 dark:text-white">Title</h3>
</div>

<!-- Button with dark mode -->
<button class="bg-primary-600 text-white hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-400">
  Button
</button>
```

---

## Typography

```html
<h1 class="text-4xl font-bold tracking-tight text-gray-900">Heading 1</h1>
<h2 class="text-3xl font-bold text-gray-900">Heading 2</h2>
<h3 class="text-2xl font-semibold text-gray-900">Heading 3</h3>

<p class="text-base text-gray-600 leading-relaxed">Body text</p>
<p class="text-sm text-gray-500">Small helper text</p>

<p class="truncate">Truncated with ellipsis...</p>
<p class="line-clamp-3">Multi-line truncation after 3 lines...</p>
```

---

## Utility Patterns

### Spacing
```html
<div class="flex gap-4">Use gap instead of margins</div>
<div class="space-y-4">
  <div>Stack spacing</div>
  <div>Between children</div>
</div>
```

### Position & Z-Index
```html
<header class="sticky top-0 z-50 bg-white/80 backdrop-blur-sm">Nav</header>
<footer class="fixed bottom-0 left-0 right-0 z-40">Footer</footer>
<div class="fixed inset-0 z-50 bg-black/50">
  <div class="relative z-10 bg-white">Modal</div>
</div>
```

### Overflow
```html
<div class="h-64 overflow-y-auto">Scrollable</div>
<div class="overflow-hidden rounded-lg">
  <img class="h-full w-full object-cover" />
</div>
```

---

## v4 Specific Changes

### Removed Utilities (Use Replacements)

| Deprecated | Replacement |
|------------|-------------|
| `bg-opacity-50` | `bg-black/50` |
| `text-opacity-75` | `text-black/75` |
| `flex-shrink-0` | `shrink-0` |
| `flex-grow` | `grow` |

### New Features
```html
<div class="transform-3d rotate-x-12">3D transforms</div>
<div class="ps-4 pe-4">Logical properties (start/end)</div>
<div class="ms-auto me-4">Margin logical properties</div>
<div class="@container">
  <div class="@lg:grid-cols-3">Container queries</div>
</div>
```

---