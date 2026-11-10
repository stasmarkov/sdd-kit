# API Patterns

REST and JSON:API patterns for Drupal 11.

## JSON:API (Core)

Drupal core includes JSON:API. Enable with `drush en jsonapi`.

### Default Endpoints

All content entities automatically get JSON:API endpoints:

```
GET    /jsonapi/node/article              # List articles
GET    /jsonapi/node/article/{uuid}       # Get single article
POST   /jsonapi/node/article              # Create article
PATCH  /jsonapi/node/article/{uuid}       # Update article
DELETE /jsonapi/node/article/{uuid}       # Delete article
```

### Filtering

```
GET /jsonapi/node/article?filter[status]=1
GET /jsonapi/node/article?filter[field_category.id]=TERM_UUID
GET /jsonapi/node/article?filter[created][condition][path]=created&filter[created][condition][operator]=%3E&filter[created][condition][value]=2024-01-01

# Shorthand for common filters
GET /jsonapi/node/article?filter[title][operator]=CONTAINS&filter[title][value]=drupal
```

### Including Relationships

```
GET /jsonapi/node/article?include=field_category,uid
GET /jsonapi/node/article?include=field_image.field_media_image
```

### Sparse Fieldsets

```
GET /jsonapi/node/article?fields[node--article]=title,body,created&fields[user--user]=display_name
```

### Sorting & Pagination

```
GET /jsonapi/node/article?sort=-created
GET /jsonapi/node/article?sort=field_category.name,-created
GET /jsonapi/node/article?page[limit]=10&page[offset]=20
```

## Custom REST Resource

```php
<?php

declare(strict_types=1);

namespace Drupal\my_module\Plugin\rest\resource;

use Drupal\Core\StringTranslation\TranslatableMarkup;
use Drupal\my_module\Service\OrderManager;
use Drupal\rest\Attribute\RestResource;
use Drupal\rest\Plugin\ResourceBase;
use Drupal\rest\ResourceResponse;
use Psr\Log\LoggerInterface;
use Symfony\Component\DependencyInjection\ContainerInterface;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpKernel\Exception\BadRequestHttpException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

#[RestResource(
  id: 'order_resource',
  label: new TranslatableMarkup('Order Resource'),
  uri_paths: [
    'canonical' => '/api/v1/orders/{id}',
    'create' => '/api/v1/orders',
  ],
)]
final class OrderResource extends ResourceBase {

  public function __construct(
    array $configuration,
    $plugin_id,
    $plugin_definition,
    array $serializer_formats,
    LoggerInterface $logger,
    private readonly OrderManager $orderManager,
  ) {
    parent::__construct($configuration, $plugin_id, $plugin_definition, $serializer_formats, $logger);
  }

  public static function create(ContainerInterface $container, array $configuration, $plugin_id, $plugin_definition): static {
    return new static(
      $configuration,
      $plugin_id,
      $plugin_definition,
      $container->getParameter('serializer.formats'),
      $container->get('logger.factory')->get('rest'),
      $container->get('my_module.order_manager'),
    );
  }

  public function get(string $id): ResourceResponse {
    $order = $this->orderManager->load($id);
    if (!$order) {
      throw new NotFoundHttpException("Order $id not found.");
    }

    $response = new ResourceResponse($this->normalize($order));
    $response->addCacheableDependency($order);
    return $response;
  }

  public function post(Request $request): ResourceResponse {
    $data = json_decode($request->getContent(), TRUE);
    if (empty($data['title'])) {
      throw new BadRequestHttpException('Title is required.');
    }

    $order = $this->orderManager->createOrder($data);

    return new ResourceResponse($this->normalize($order), 201);
  }

  public function patch(string $id, Request $request): ResourceResponse {
    $order = $this->orderManager->load($id);
    if (!$order) {
      throw new NotFoundHttpException("Order $id not found.");
    }

    $data = json_decode($request->getContent(), TRUE);
    $order = $this->orderManager->updateOrder($order, $data);

    return new ResourceResponse($this->normalize($order));
  }

  public function delete(string $id): ResourceResponse {
    $order = $this->orderManager->load($id);
    if (!$order) {
      throw new NotFoundHttpException("Order $id not found.");
    }

    $this->orderManager->deleteOrder($order);
    return new ResourceResponse(NULL, 204);
  }

  private function normalize($order): array {
    return [
      'id' => $order->id(),
      'uuid' => $order->uuid(),
      'title' => $order->label(),
      'status' => $order->get('status')->value,
      'total_amount' => $order->get('total_amount')->value,
      'created' => date('c', $order->get('created')->value),
    ];
  }

}
```

### REST Resource Configuration

```yaml
# config/install/rest.resource.order_resource.yml
id: order_resource
plugin_id: order_resource
granularity: method
configuration:
  GET:
    supported_formats: [json]
    supported_auth: [cookie, basic_auth, oauth2]
  POST:
    supported_formats: [json]
    supported_auth: [cookie, oauth2]
  PATCH:
    supported_formats: [json]
    supported_auth: [cookie, oauth2]
  DELETE:
    supported_formats: [json]
    supported_auth: [cookie, oauth2]
```

## Custom Route Controller (Non-REST)

For simpler API endpoints without the REST framework:

```yaml
# my_module.routing.yml
my_module.api.orders:
  path: '/api/v1/orders'
  defaults:
    _controller: '\Drupal\my_module\Controller\ApiController::listOrders'
  methods: [GET]
  requirements:
    _permission: 'access content'
    _format: json
```

```php
<?php

declare(strict_types=1);

namespace Drupal\my_module\Controller;

use Drupal\Core\Controller\ControllerBase;
use Drupal\my_module\Service\OrderManager;
use Symfony\Component\DependencyInjection\ContainerInterface;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;

final class ApiController extends ControllerBase {

  public function __construct(
    private readonly OrderManager $orderManager,
  ) {}

  public static function create(ContainerInterface $container): static {
    return new static(
      $container->get('my_module.order_manager'),
    );
  }

  public function listOrders(Request $request): JsonResponse {
    $page = (int) $request->query->get('page', 0);
    $limit = min((int) $request->query->get('limit', 20), 100);
    $status = $request->query->get('status');

    $result = $this->orderManager->list(
      status: $status,
      offset: $page * $limit,
      limit: $limit,
    );

    return new JsonResponse([
      'data' => $result['items'],
      'meta' => [
        'total' => $result['total'],
        'page' => $page,
        'limit' => $limit,
      ],
    ]);
  }

}
```

## Authentication

### Cookie Authentication (Default)

Built-in for browser-based requests. Include CSRF token:

```javascript
// Get CSRF token
const token = await fetch('/session/token').then(r => r.text());

// Use in requests
fetch('/api/v1/orders', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-CSRF-Token': token,
  },
  body: JSON.stringify(data),
});
```

### Basic Auth

Enable `basic_auth` module:
```bash
drush en basic_auth
```

```bash
curl -u username:password https://example.com/api/v1/orders
```

### OAuth2 (Simple OAuth)

```bash
composer require drupal/simple_oauth
drush en simple_oauth
```

```bash
# Get token
curl -X POST https://example.com/oauth/token \
  -d "grant_type=password&client_id=CLIENT_ID&client_secret=SECRET&username=USER&password=PASS"

# Use token
curl -H "Authorization: Bearer ACCESS_TOKEN" https://example.com/jsonapi/node/article
```

## CORS Configuration

```yaml
# sites/default/services.yml
cors.config:
  enabled: true
  allowedHeaders:
    - content-type
    - authorization
    - x-csrf-token
  allowedMethods:
    - GET
    - POST
    - PATCH
    - DELETE
    - OPTIONS
  allowedOrigins:
    - 'https://frontend.example.com'
  exposedHeaders: false
  maxAge: 3600
  supportsCredentials: true
```

## Best Practices

### Do's
- Use JSON:API for standard CRUD — it's built into core
- Use custom REST resources for complex business operations
- Always declare authentication methods per-resource
- Use cache metadata (`addCacheableDependency`) on responses
- Validate input and return appropriate HTTP status codes

### Don'ts
- Don't build custom endpoints for standard entity CRUD — use JSON:API
- Don't expose internal entity structure in API responses
- Don't skip CORS configuration for decoupled setups
- Don't use cookie auth for machine-to-machine communication
- Don't return Drupal render arrays from API endpoints
