# Component Patterns

Detailed Tailwind CSS v4 component patterns with full code examples.

## Cards

```html
<div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
  <h3 class="text-lg font-semibold text-gray-900">Card Title</h3>
  <p class="mt-2 text-gray-600">Card description text.</p>
  <div class="mt-4">
    <button class="text-primary-600 hover:text-primary-700">
      Learn more
    </button>
  </div>
</div>

<!-- Hover effect card -->
<div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md">
  Content
</div>
```

## Buttons

```html
<!-- Primary button -->
<button class="rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed">
  Primary Button
</button>

<!-- Secondary button -->
<button class="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2">
  Secondary Button
</button>

<!-- Icon button -->
<button class="rounded-full p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-500">
  <svg class="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
    <!-- icon path -->
  </svg>
</button>

<!-- Button group -->
<div class="inline-flex rounded-md shadow-sm">
  <button class="rounded-l-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
    Left
  </button>
  <button class="-ml-px border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
    Middle
  </button>
  <button class="-ml-px rounded-r-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
    Right
  </button>
</div>
```

## Forms

```html
<!-- Input field -->
<div>
  <label for="email" class="block text-sm font-medium text-gray-700">
    Email
  </label>
  <input
    type="email"
    id="email"
    class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
    placeholder="you@example.com"
  />
</div>

<!-- Input with error -->
<div>
  <label for="email" class="block text-sm font-medium text-gray-700">
    Email
  </label>
  <input
    type="email"
    id="email"
    class="mt-1 block w-full rounded-md border border-red-300 px-3 py-2 text-red-900 placeholder-red-300 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
  />
  <p class="mt-1 text-sm text-red-600">Please enter a valid email address.</p>
</div>

<!-- Select -->
<select class="block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500">
  <option>Option 1</option>
  <option>Option 2</option>
</select>

<!-- Checkbox -->
<div class="flex items-center">
  <input
    type="checkbox"
    id="remember"
    class="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
  />
  <label for="remember" class="ml-2 text-sm text-gray-700">
    Remember me
  </label>
</div>
```

## Navigation

```html
<!-- Horizontal nav -->
<nav class="flex space-x-8">
  <a href="#" class="border-b-2 border-primary-500 px-1 py-4 text-sm font-medium text-primary-600">
    Dashboard
  </a>
  <a href="#" class="border-b-2 border-transparent px-1 py-4 text-sm font-medium text-gray-500 hover:border-gray-300 hover:text-gray-700">
    Settings
  </a>
</nav>

<!-- Mobile menu -->
<div class="md:hidden">
  <button class="inline-flex items-center justify-center rounded-md p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-500">
    <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  </button>
</div>
```
