---
name: drupal-11
description: Drupal 10.3+ and 11 module development patterns. Use for entities, services, plugins, hooks, tests, and backend architecture decisions.
allowed-tools: Read, Grep, Glob, Edit, Write, Bash
paths:
  - "**/*.module"
  - "web/modules/**"
  - "docroot/modules/**"
  - "**/*.php"
---

# Drupal 10.3+ and 11 Development Patterns

Apply these patterns when building Drupal 10.3+ and 11 modules and sites.

## Quick Reference

| Task | Pattern |
|------|---------|
| Module structure | `.info.yml` + `.module` + `.services.yml` + `.routing.yml` |
| Content entities | `baseFieldDefinitions()` with PHP attributes |
| Services & DI | `services.yml` + constructor injection |
| Hooks | Procedural in `.module`; `#[Hook]` classes only for modules requiring `^11.1` |
| Routing | `.routing.yml` + controller classes |
| Forms | Extend `FormBase` or `ConfigFormBase` |
| Config management | `config/install/` + `config/schema/` |
| Plugins | PHP attributes (`#[Block]`, `#[FieldType]`) |
| Render API | Render arrays with `#theme`, `#type` |
| Caching | Cache tags, contexts, max-age |
| Tests | Unit, Kernel, Functional under `tests/src/`, `@group <module>` |
| Drush | `drush cr`, `drush cex`, `drush cim`, `drush updb` (in DDEV: `ddev drush ...`) |

## When to Load References

| Task | Load |
|------|------|
| Defining content/config entities | `references/entity-patterns.md` |
| Building custom modules | `references/module-development.md` |
| Creating plugins (blocks, fields, etc.) | `references/plugin-system.md` |
| Working with Form API | `references/form-patterns.md` |
| Theming and Twig templates | `references/theming-patterns.md` |
| Building REST/JSON:API endpoints | `references/api-patterns.md` |
| Writing tests | `references/testing-patterns.md` |
| Exploring the codebase (where routes, handlers, data access and tests live) | `references/exploration-recipes.md` |

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

## Module Structure

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
core_version_requirement: ^10.3 || ^11
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

Which form a hook takes depends on the module's core floor:

| Module supports | Hooks go in |
|-----------------|-------------|
| `^10.3 \|\| ^11` (default) | Procedural functions in `my_module.module` |
| `^11.1` only | `#[Hook]` methods on classes in `src/Hook/` (autowired services) |

```php
// my_module.module: works on 10.3 and 11
/**
 * Implements hook_entity_presave().
 */
function my_module_entity_presave(EntityInterface $entity): void {
  \Drupal::service('my_module.order_service')->stamp($entity);
}
```

```php
// src/Hook/OrderHooks.php: Drupal 11.1+ only
final class OrderHooks {

  public function __construct(
    #[Autowire(service: 'my_module.order_service')]
    private readonly OrderService $orderService,
  ) {}

  #[Hook('entity_presave')]
  public function entityPresave(EntityInterface $entity): void {
    $this->orderService->stamp($entity);
  }

}
```

Keep procedural hooks thin: delegate to a service so the logic is testable. Use event subscribers for real Symfony and core events (`KernelEvents`, `RoutingEvents`, `ConfigEvents`, migrate events). Core dispatches no entity save or delete events, so entity reactions stay hooks.

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

### 9. Testing

Write the failing test first. Pick the cheapest type that exercises the behaviour:

| Code under test | Base class | Folder |
|-----------------|------------|--------|
| Pure logic with mocked collaborators | `UnitTestCase` | `tests/src/Unit/` |
| Services, entities, config, subscribers, plugins | `KernelTestBase` | `tests/src/Kernel/` |
| Routes, controllers, forms, access | `BrowserTestBase` (`$defaultTheme = 'stark'`) | `tests/src/Functional/` |

```php
<?php

declare(strict_types=1);

namespace Drupal\Tests\my_module\Kernel;

use Drupal\KernelTests\KernelTestBase;
use Drupal\my_module\Service\OrderService;

/**
 * @group my_module
 */
final class OrderServiceTest extends KernelTestBase {

  protected static $modules = ['system', 'user', 'node', 'my_module'];

  public function testServiceIsRegistered(): void {
    $this->assertInstanceOf(OrderService::class, $this->container->get('my_module.order_service'));
  }

}
```

Use the `@group` annotation: PHPUnit 9.6 on Drupal 10.3 ignores the `#[Group]` attribute. List every module the test needs in `$modules`. The add-on's test-first hook blocks edits to Controller, Form, Service(s), Access and EventSubscriber classes until a test under the module's `tests/src` is named after the class or names it; Plugin and Entity classes only get a warning (`CLAUDE_SKIP_TEST_FIRST=1` bypasses it). Base classes, environment variables and run commands: `references/testing-patterns.md`.

## Gate setup

The workflow gates run only when the project has what they need; a missing piece is reported as a skip, never a failure. A skip names only the requirements that are missing. Custom code lives in `<docroot>/modules/custom`, where `<docroot>` is `docroot` in `.ddev/config.yaml`, else `extra.drupal-scaffold.locations.web-root` in `composer.json`. The default PHPCS and PHPUnit gates have a `web/` and a `docroot/` variant, chosen by where Drupal core is (`web/core/lib/Drupal.php` or `docroot/core/lib/Drupal.php`), so a stray `web/modules/custom` folder does not switch off the `docroot/` gates; when `web` links to `docroot`, only the `web/` variant runs. Other web roots (`public_html`, `html`) get no default PHPCS or PHPUnit gate: add a `phpcs.xml.dist` and a `phpunit.xml.dist` at the repo root, so the project-ruleset and project-config gates run. In a DDEV project the gates run as `ddev exec <command>` and need the project running (`ddev start`). Inside DDEV, also run Composer and Drush as `ddev composer` and `ddev drush`, because the host may have no PHP (see the `ddev` skill).

1. Allow the Composer plugins before the require, in `composer.json` under `config.allow-plugins`: `dealerdirect/phpcodesniffer-composer-installer` and `phpstan/extension-installer`.
2. `composer require --dev drupal/core-dev` and `drush/drush` (in DDEV: `ddev composer require --dev ...`). This brings coder, PHPStan with phpstan-drupal, and PHPUnit. On a Drupal 10 site, pin core-dev to the installed core: `composer require --dev "drupal/core-dev:^<core major>.<minor>" -W` (for example `^10.5`).
3. Add a `phpstan.neon` at the repo root. Do not set `drupal_root`; phpstan-drupal finds it.
4. Optional: a root `phpunit.xml` for project-specific test settings.
5. For Kernel and Functional tests, set the environment once and restart: `ddev config --web-environment-add="SIMPLETEST_DB=mysql://db:db@db/db,SIMPLETEST_BASE_URL=http://web"`, then `ddev restart`.

| Gate | Skip text | Setup that clears it |
|------|-----------|----------------------|
| PHPCS | `skipped — <ruleset file> present` | Intended: the project ruleset gate runs instead |
| PHPCS, PHPCS (docroot) | `not run (requires <missing entries>)`, from vendor/drupal/coder; vendor/squizlabs/php_codesniffer/CodeSniffer.conf; `<docroot>/modules/custom` | Steps 1 and 2 for the vendor entries. A missing `<docroot>/modules/custom` of the other layout is expected: that variant does not apply |
| PHPCS (docroot) | `skipped — web/core/lib/Drupal.php present` | Intended: Drupal core is under `web/` (or `web` links to `docroot/`), so the `web/` variant runs |
| PHPCS (project ruleset) | `not run (requires one of phpcs.xml, phpcs.xml.dist, .phpcs.xml, .phpcs.xml.dist; vendor/bin/phpcs)` | Add a ruleset file, or ignore: the default PHPCS gate covers the project |
| PHPStan | `not run (requires one of phpstan.neon, phpstan.neon.dist, phpstan.dist.neon; vendor/bin/phpstan)` | Steps 2 and 3 |
| PHPUnit | `skipped — <config file> present` | Intended: the project config gate runs instead |
| PHPUnit, PHPUnit (docroot) | `not run (requires <missing entries>)`, from vendor/bin/phpunit; `<docroot>/core/phpunit.xml.dist`; `<docroot>/modules/custom` | Step 2 for vendor/bin/phpunit. Missing paths of the other layout are expected: that variant does not apply |
| PHPUnit (docroot) | `skipped — web/core/lib/Drupal.php present` | Intended: the `web/` variant runs |
| PHPUnit (project config) | `not run (requires one of phpunit.xml, phpunit.xml.dist; vendor/bin/phpunit)` | Step 4, or ignore: the default PHPUnit gate covers the project |
| any | `not run (ddev not running)` | `ddev start`, then re-run |

## Scaffolding

In a DDEV project, prefix each command with `ddev`, for example `ddev drush generate module` or `ddev drush cr`.

```bash
# Generate module boilerplate (requires drush + drupal/core-dev; in DDEV: ddev drush generate ...)
drush generate module
drush generate controller
drush generate service
drush generate plugin:block
drush generate form:config
drush generate entity:content

# Common drush commands (in DDEV: ddev drush cr, ddev drush cim -y, ...)
drush cr              # Cache rebuild
drush cex -y          # Config export
drush cim -y          # Config import
drush updb -y         # Run update hooks
drush en my_module    # Enable module
drush pmu my_module   # Uninstall module
```

---