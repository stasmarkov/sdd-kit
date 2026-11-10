# Theming Patterns

Drupal 11 Twig templates, preprocess functions, and render arrays.

## Theme Hook Registration

```php
/**
 * Implements hook_theme().
 */
function my_module_theme(): array {
  return [
    'order_summary' => [
      'variables' => [
        'order' => NULL,
        'show_details' => FALSE,
        'items' => [],
      ],
    ],
    'order_list' => [
      'variables' => [
        'orders' => [],
        'empty_message' => NULL,
      ],
    ],
    'order_status_badge' => [
      'variables' => [
        'status' => NULL,
        'label' => NULL,
      ],
    ],
  ];
}
```

## Twig Templates

### Template Location & Naming

Templates are placed in `templates/` and named after the theme hook with hyphens:

```
modules/custom/my_module/templates/
├── order-summary.html.twig
├── order-list.html.twig
└── order-status-badge.html.twig
```

### Basic Template

```twig
{# templates/order-summary.html.twig #}
<article{{ attributes.addClass('order-summary') }}>
  <h3>{{ order.label }}</h3>

  <div class="order-summary__meta">
    <span class="order-summary__status">
      {{ include('order-status-badge.html.twig', { status: order.status, label: order.status_label }) }}
    </span>
    <time datetime="{{ order.created|date('Y-m-d') }}">
      {{ order.created|format_date('medium') }}
    </time>
  </div>

  {% if show_details and items is not empty %}
    <table class="order-summary__items">
      <thead>
        <tr>
          <th>{{ 'Product'|t }}</th>
          <th>{{ 'Quantity'|t }}</th>
          <th>{{ 'Price'|t }}</th>
        </tr>
      </thead>
      <tbody>
        {% for item in items %}
          <tr>
            <td>{{ item.name }}</td>
            <td>{{ item.quantity }}</td>
            <td>{{ item.price }}</td>
          </tr>
        {% endfor %}
      </tbody>
    </table>
  {% endif %}
</article>
```

### Twig Filters & Functions

| Filter/Function | Usage |
|----------------|-------|
| `{{ value\|t }}` | Translation |
| `{{ date\|format_date('medium') }}` | Date formatting |
| `{{ text\|check_markup(format) }}` | Safe markup rendering |
| `{{ url('route.name') }}` | Generate URL |
| `{{ path('route.name', {id: 1}) }}` | Generate path |
| `{{ link(text, url) }}` | Render link |
| `{{ file_url(uri) }}` | File URL |
| `{{ attach_library('module/library') }}` | Attach CSS/JS |

### Attributes Object

```twig
{# Add classes conditionally #}
{% set classes = [
  'order',
  'order--' ~ status,
  is_featured ? 'order--featured',
] %}

<div{{ attributes.addClass(classes) }}>
  {{ content }}
</div>

{# Set attributes #}
<div{{ attributes.setAttribute('data-order-id', order_id).addClass('order') }}>
  {{ content }}
</div>
```

## Preprocess Functions

```php
/**
 * Implements template_preprocess_HOOK() for order_summary.
 */
function template_preprocess_order_summary(array &$variables): void {
  $order = $variables['order'];

  $variables['status_label'] = match ($order->get('status')->value) {
    'pending' => t('Pending'),
    'completed' => t('Completed'),
    'cancelled' => t('Cancelled'),
    default => t('Unknown'),
  };

  $variables['attributes'] = new Attribute([
    'class' => ['order-summary', 'order-summary--' . $order->get('status')->value],
    'data-order-id' => $order->id(),
  ]);
}

/**
 * Implements hook_preprocess_node() for article nodes.
 */
function my_module_preprocess_node(array &$variables): void {
  $node = $variables['node'];

  if ($node->bundle() === 'article') {
    $variables['reading_time'] = ceil(str_word_count(strip_tags($node->get('body')->value ?? '')) / 200);
  }
}
```

## Render Arrays

### Common Render Element Types

```php
// Simple markup
$build['message'] = [
  '#markup' => '<p>' . $this->t('Hello, @name!', ['@name' => $name]) . '</p>',
];

// Using a theme hook
$build['order'] = [
  '#theme' => 'order_summary',
  '#order' => $order,
  '#show_details' => TRUE,
  '#items' => $items,
];

// Table
$build['table'] = [
  '#type' => 'table',
  '#header' => [$this->t('Name'), $this->t('Status'), $this->t('Actions')],
  '#rows' => $rows,
  '#empty' => $this->t('No orders found.'),
];

// Container with children
$build['wrapper'] = [
  '#type' => 'container',
  '#attributes' => ['class' => ['order-wrapper']],
  'heading' => ['#markup' => '<h2>' . $this->t('Orders') . '</h2>'],
  'list' => [
    '#theme' => 'item_list',
    '#items' => $items,
  ],
];

// Pager
$build['pager'] = [
  '#type' => 'pager',
];
```

### Attaching Libraries

```php
$build['#attached'] = [
  'library' => [
    'my_module/order-styles',
    'my_module/order-scripts',
  ],
  'drupalSettings' => [
    'myModule' => [
      'apiEndpoint' => '/api/orders',
    ],
  ],
];
```

## Library Definitions

```yaml
# my_module.libraries.yml
order-styles:
  css:
    component:
      css/order.css: {}
  dependencies:
    - core/normalize

order-scripts:
  js:
    js/order.js: {}
  dependencies:
    - core/drupal
    - core/drupalSettings
    - core/once

admin-styles:
  css:
    theme:
      css/admin.css: {}
```

## Single Directory Components (SDC)

Drupal 11 supports Single Directory Components:

```
components/
└── order-card/
    ├── order-card.component.yml
    ├── order-card.twig
    ├── order-card.css
    └── order-card.js
```

```yaml
# order-card.component.yml
name: Order Card
status: stable
props:
  type: object
  properties:
    title:
      type: string
      title: Title
    status:
      type: string
      title: Status
      enum: [pending, completed, cancelled]
    amount:
      type: string
      title: Amount
  required:
    - title
    - status
slots:
  actions:
    title: Action buttons
```

```twig
{# order-card.twig #}
<div class="order-card order-card--{{ status }}">
  <h3 class="order-card__title">{{ title }}</h3>
  {% if amount %}
    <span class="order-card__amount">{{ amount }}</span>
  {% endif %}
  {% if actions %}
    <div class="order-card__actions">
      {{ actions }}
    </div>
  {% endif %}
</div>
```

Usage:

```twig
{% include 'my_module:order-card' with {
  title: order.label,
  status: order.status,
  amount: order.total|number_format(2),
} %}
```

## Theme Suggestions

```php
/**
 * Implements hook_theme_suggestions_HOOK().
 */
function my_module_theme_suggestions_order_summary(array $variables): array {
  $suggestions = [];
  $order = $variables['order'];

  $suggestions[] = 'order_summary__' . $order->get('status')->value;
  $suggestions[] = 'order_summary__' . $order->bundle();

  return $suggestions;
}
```

## Best Practices

### Do's
- Use render arrays, not raw HTML
- Declare `#cache` metadata on every render array
- Use `{{ variable|escape }}` (auto-escaped) in Twig
- Use `#attached` for CSS/JS — never hardcode `<script>` tags
- Use SDC for reusable UI components

### Don'ts
- Don't use `{{ variable|raw }}` unless absolutely necessary
- Don't output user input without sanitization
- Don't put logic in templates — use preprocess functions
- Don't forget to register theme hooks in `hook_theme()`
- Don't use inline styles or scripts
