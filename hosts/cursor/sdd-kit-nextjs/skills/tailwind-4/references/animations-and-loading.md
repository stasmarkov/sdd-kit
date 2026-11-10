# Animations and Loading Patterns

Tailwind CSS v4 transition, animation, and skeleton loading patterns.

## Transitions

```html
<!-- Hover transition -->
<button class="bg-primary-600 transition-colors duration-200 hover:bg-primary-700">
  Smooth hover
</button>

<!-- Transform transition -->
<div class="transition-transform duration-200 hover:scale-105">
  Zoom on hover
</div>

<!-- Multiple transitions -->
<div class="transition-all duration-200 hover:shadow-lg hover:-translate-y-1">
  Card hover effect
</div>
```

## Animations

```html
<!-- Spin -->
<svg class="animate-spin h-5 w-5 text-primary-600">
  <!-- loading spinner -->
</svg>

<!-- Pulse -->
<div class="animate-pulse">
  <div class="h-4 bg-gray-200 rounded w-3/4"></div>
</div>

<!-- Bounce -->
<div class="animate-bounce">Down Arrow</div>
```

## Skeleton Loading

```html
<div class="animate-pulse">
  <div class="flex space-x-4">
    <div class="h-12 w-12 rounded-full bg-gray-200"></div>
    <div class="flex-1 space-y-4 py-1">
      <div class="h-4 w-3/4 rounded bg-gray-200"></div>
      <div class="space-y-2">
        <div class="h-4 rounded bg-gray-200"></div>
        <div class="h-4 w-5/6 rounded bg-gray-200"></div>
      </div>
    </div>
  </div>
</div>
```
