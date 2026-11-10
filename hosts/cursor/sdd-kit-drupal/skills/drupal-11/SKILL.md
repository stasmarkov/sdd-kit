---
name: drupal-11
description: Drupal 11 module development patterns. Use for entities, services, plugins, hooks, and backend architecture decisions.
allowed-tools: Read, Grep, Glob, Edit, Write, Bash
paths:
  - "**/*.module"
  - "web/modules/**"
  - "**/*.php"
---

# Drupal 11 Development Patterns

Apply these patterns when building Drupal 11 modules and sites.

## Quick Reference

| Task | Pattern |
|------|---------|
| Module structure | `.info.yml` + `.module` + `.services.yml` + `.routing.yml` |
| Content entities | `baseFieldDefinitions()` with PHP attributes |
| Services & DI | `services.yml` + constructor injection |
| Hooks | `hook_form_alter`, `hook_entity_presave`, prefer event subscribers |
| Routing | `.routing.yml` + controller classes |
| Forms | Extend `FormBase` or `ConfigFormBase` |
| Config management | `config/install/` + `config/schema/` |
| Plugins | PHP attributes (`#[Block]`, `#[FieldType]`) |
| Render API | Render arrays with `#theme`, `#type` |
| Caching | Cache tags, contexts, max-age |
| Drush | `drush cr`, `drush cex`, `drush cim`, `drush updb` |

## When to Load References

| Task | Load |
|------|------|
| Defining content/config entities | `references/entity-patterns.md` |
| Building custom modules | `references/module-development.md` |
| Creating plugins (blocks, fields, etc.) | `references/plugin-system.md` |
| Working with Form API | `references/form-patterns.md` |
| Theming and Twig templates | `references/theming-patterns.md` |
| Building REST/JSON:API endpoints | `references/api-patterns.md` |

## Code Templates

Use templates from `assets/templates/` for scaffolding:

| Template | Purpose |
|----------|---------|
| `module.info.yml.template` | Module metadata |
| `module.module.template` | Hook implementations |
| `module.services.yml.template` | Service definitions |
| `module.routing.yml.template` | Route definitions |
| `controller.php.template` | Route controller |
| `service.php.template` | Service class |
| `entity.php.template` | Content entity |
| `form.php.template` | Form class |
| `plugin-block.php.template` | Block plugin |
| `event-subscriber.php.template` | Event subscriber |

## Drupal 11 Module Structure

```
modules/custom/my_module/
├── my_module.info.yml          # Module metadata
├── my_module.module            # Hook implementations
├── my_module.services.yml      # Service definitions
├── my_module.routing.yml       # Route definitions
├── my_module.permissions.yml   # Permission definitions
├── my_module.links.menu.yml    # Menu link definitions
├── my_module.libraries.yml     # CSS/JS asset libraries
├── config/
│   ├── install/                # Default config on install
│   └── schema/                 # Config schema definitions
├── src/
│   ├── Controller/             # Route controllers
│   ├── Entity/                 # Content & config entities
│   ├── Form/                   # Form classes
│   ├── Plugin/
│   │   ├── Block/              # Block plugins
│   │   ├── Field/              # Field type/widget/formatter plugins
│   │   └── rest/resource/      # REST resource plugins
│   ├── EventSubscriber/        # Event subscribers
│   └── Service/                # Service classes (custom namespace)
├── templates/                  # Twig templates
└── tests/
    ├── src/Unit/               # Unit tests
    ├── src/Kernel/             # Kernel tests
    └── src/Functional/         # Functional (browser) tests
```

## Core Patterns

### 1. Module Info File

```yaml
# my_module.info.yml
name: 'My Module'
type: module
description: 'Provides custom functionality.'
core_version_requirement: ^11
package: Custom
dependencies:
  - drupal:node
  - drupal:user
```

### 2. Services & Dependency Injection

```yaml
# my_module.services.yml
services:
  my_module.order_service:
    class: Drupal\my_module\Service\OrderService
    arguments: ['@entity_type.manager', '@current_user', '@logger.factory']

  my_module.event_subscriber:
    class: Drupal\my_module\EventSubscriber\OrderEventSubscriber
    arguments: ['@my_module.order_service']
    tags:
      - { name: event_subscriber }
```

```php
<?php

declare(strict_types=1);

namespace Drupal\my_module\Service;

use Drupal\Core\Entity\EntityTypeManagerInterface;
use Drupal\Core\Session\AccountProxyInterface;
use Psr\Log\LoggerInterface;

final class OrderService {

  public function __construct(
    private readonly EntityTypeManagerInterface $entityTypeManager,
    private readonly AccountProxyInterface $currentUser,
    private readonly LoggerInterface $logger,
  ) {}

  public function getOrdersForCurrentUser(): array {
    $storage = $this->entityTypeManager->getStorage('node');
    return $storage->loadByProperties([
      'type' => 'order',
      'uid' => $this->currentUser->id(),
    ]);
  }

}
```

### 3. Routing & Controllers

```yaml
# my_module.routing.yml
my_module.orders:
  path: '/orders'
  defaults:
    _controller: '\Drupal\my_module\Controller\OrderController::list'
    _title: 'Orders'
  requirements:
    _permission: 'access content'

my_module.order_view:
  path: '/order/{node}'
  defaults:
    _controller: '\Drupal\my_module\Controller\OrderController::view'
  requirements:
    _entity_access: 'node.view'
  options:
    parameters:
      node:
        type: entity:node
```

```php
<?php

declare(strict_types=1);

namespace Drupal\my_module\Controller;

use Drupal\Core\Controller\ControllerBase;
use Drupal\my_module\Service\OrderService;
use Drupal\node\NodeInterface;
use Symfony\Component\DependencyInjection\ContainerInterface;

final class OrderController extends ControllerBase {

  public function __construct(
    private readonly OrderService $orderService,
  ) {}

  public static function create(ContainerInterface $container): static {
    return new static(
      $container->get('my_module.order_service'),
    );
  }

  public function list(): array {
    $orders = $this->orderService->getOrdersForCurrentUser();
    return [
      '#theme' => 'order_list',
      '#orders' => $orders,
      '#cache' => [
        'contexts' => ['user'],
        'tags' => ['node_list:order'],
      ],
    ];
  }

  public function view(NodeInterface $node): array {
    $builder = $this->entityTypeManager()->getViewBuilder('node');
    return $builder->view($node, 'full');
  }

}
```

### 4. Architecture Flow

```
Request → Routing → Controller → Service → EntityTypeManager → Database
              ↓          ↓           ↓
           Access     Render      Business
           Check      Array       Logic
```

### 5. Hooks vs Event Subscribers

Prefer event subscribers over hooks when possible:

```php
// Prefer: Event subscriber (OOP, testable)
final class OrderEventSubscriber implements EventSubscriberInterface {
  public static function getSubscribedEvents(): array {
    return [EntityHookEvents::ENTITY_PRESAVE => 'onEntityPresave'];
  }
}

// Legacy: Hook implementation (still needed for some integrations)
function my_module_form_alter(&$form, FormStateInterface $form_state, $form_id) {
  // Form alterations
}
```

### 6. Caching

Always declare cache metadata on render arrays:

```php
return [
  '#theme' => 'my_template',
  '#data' => $data,
  '#cache' => [
    'contexts' => ['user', 'url.query_args'],
    'tags' => ['node:' . $node->id(), 'config:my_module.settings'],
    'max-age' => 3600,
  ],
];
```

### 7. Configuration

```php
// Always use config API, never hardcode values
$config = \Drupal::config('my_module.settings');
$value = $config->get('api_key');

// Editable config (for saving)
$config = \Drupal::service('config.factory')->getEditable('my_module.settings');
$config->set('api_key', $newValue)->save();
```

### 8. Entity Queries

```php
$query = \Drupal::entityQuery('node')
  ->condition('type', 'article')
  ->condition('status', 1)
  ->condition('field_category', $termId)
  ->sort('created', 'DESC')
  ->range(0, 10)
  ->accessCheck(TRUE);

$nids = $query->execute();
$nodes = \Drupal::entityTypeManager()->getStorage('node')->loadMultiple($nids);
```

## Scaffolding

```bash
# Generate module boilerplate (requires drush + drupal/core-dev)
drush generate module
drush generate controller
drush generate service
drush generate plugin:block
drush generate form:config
drush generate entity:content

# Common drush commands
drush cr              # Cache rebuild
drush cex -y          # Config export
drush cim -y          # Config import
drush updb -y         # Run update hooks
drush en my_module    # Enable module
drush pmu my_module   # Uninstall module
```

---