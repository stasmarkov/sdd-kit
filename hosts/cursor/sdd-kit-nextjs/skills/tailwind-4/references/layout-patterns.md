# Layout Patterns

Detailed Tailwind CSS v4 layout patterns for flexbox, grid, and containers.

## Flexbox

```html
<!-- Row layout with gap -->
<div class="flex gap-4">
  <div>Item 1</div>
  <div>Item 2</div>
  <div>Item 3</div>
</div>

<!-- Column layout -->
<div class="flex flex-col gap-4">
  <div>Item 1</div>
  <div>Item 2</div>
</div>

<!-- Centered content -->
<div class="flex items-center justify-center min-h-screen">
  <div>Centered content</div>
</div>

<!-- Space between -->
<div class="flex items-center justify-between">
  <div>Left</div>
  <div>Right</div>
</div>

<!-- Wrap items -->
<div class="flex flex-wrap gap-4">
  <div class="basis-1/3">Item</div>
  <div class="basis-1/3">Item</div>
  <div class="basis-1/3">Item</div>
</div>
```

## Grid

```html
<!-- Basic grid -->
<div class="grid grid-cols-3 gap-4">
  <div>1</div>
  <div>2</div>
  <div>3</div>
</div>

<!-- Responsive grid -->
<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
  <div>Card</div>
  <div>Card</div>
  <div>Card</div>
  <div>Card</div>
</div>

<!-- Auto-fit grid -->
<div class="grid grid-cols-[repeat(auto-fit,minmax(250px,1fr))] gap-4">
  <div>Auto sized</div>
  <div>Auto sized</div>
</div>

<!-- Spanning columns -->
<div class="grid grid-cols-4 gap-4">
  <div class="col-span-2">Wide</div>
  <div>Normal</div>
  <div>Normal</div>
</div>
```

## Container

```html
<!-- Centered container -->
<div class="container mx-auto px-4">
  Content
</div>

<!-- Max-width container -->
<div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
  Content
</div>
```
