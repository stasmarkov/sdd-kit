# Module Development

Patterns for building custom Drupal 11 modules.

## Module Scaffolding

### Info File

```yaml
# my_module.info.yml
name: 'My Module'
type: module
description: 'Custom module providing order management.'
core_version_requirement: ^11
package: Custom
dependencies:
  - drupal:node
  - drupal:user
  - drupal:views
configure: my_module.settings
```

### Permissions

```yaml
# my_module.permissions.yml
administer orders:
  title: 'Administer orders'
  description: 'Perform administration tasks for orders.'
  restrict access: true

create orders:
  title: 'Create orders'

view orders:
  title: 'View orders'

edit orders:
  title: 'Edit orders'

delete orders:
  title: 'Delete orders'
```

### Menu Links

```yaml
# my_module.links.menu.yml
my_module.admin:
  title: 'Orders'
  route_name: entity.order.collection
  parent: system.admin_content
  weight: 10
```

### Action Links

```yaml
# my_module.links.action.yml
my_module.order_add:
  route_name: entity.order.add_form
  title: 'Add order'
  appears_on:
    - entity.order.collection
```

## Services & Dependency Injection

### Service Definition

```yaml
# my_module.services.yml
services:
  my_module.order_manager:
    class: Drupal\my_module\Service\OrderManager
    arguments:
      - '@entity_type.manager'
      - '@current_user'
      - '@event_dispatcher'
      - '@logger.channel.my_module'

  logger.channel.my_module:
    parent: logger.channel_base
    arguments: ['my_module']
```

### Service Class

```php
<?php

declare(strict_types=1);

namespace Drupal\my_module\Service;

use Drupal\Core\Entity\EntityTypeManagerInterface;
use Drupal\Core\Session\AccountProxyInterface;
use Psr\Log\LoggerInterface;
use Symfony\Contracts\EventDispatcher\EventDispatcherInterface;

final class OrderManager {

  public function __construct(
    private readonly EntityTypeManagerInterface $entityTypeManager,
    private readonly AccountProxyInterface $currentUser,
    private readonly EventDispatcherInterface $eventDispatcher,
    private readonly LoggerInterface $logger,
  ) {}

  public function createOrder(array $values): OrderInterface {
    $storage = $this->entityTypeManager->getStorage('order');
    $order = $storage->create($values + [
      'uid' => $this->currentUser->id(),
      'status' => 'pending',
    ]);
    $order->save();

    $this->logger->info('Order @id created by user @uid.', [
      '@id' => $order->id(),
      '@uid' => $this->currentUser->id(),
    ]);

    return $order;
  }

  public function completeOrder(OrderInterface $order): void {
    $order->set('status', 'completed');
    $order->save();

    $event = new OrderCompletedEvent($order);
    $this->eventDispatcher->dispatch($event, OrderEvents::COMPLETED);
  }

}
```

### Autowiring (Drupal 11+)

Drupal 11 supports autowiring for services. If your service only depends on core services, you can skip `services.yml`:

```yaml
services:
  _defaults:
    autowire: true

  Drupal\my_module\Service\OrderManager: ~
```

## Event Subscribers

```php
<?php

declare(strict_types=1);

namespace Drupal\my_module\EventSubscriber;

use Drupal\Core\Entity\EntityTypeManagerInterface;
use Symfony\Component\EventDispatcher\EventSubscriberInterface;
use Symfony\Component\HttpKernel\Event\RequestEvent;
use Symfony\Component\HttpKernel\KernelEvents;

final class MyModuleSubscriber implements EventSubscriberInterface {

  public function __construct(
    private readonly EntityTypeManagerInterface $entityTypeManager,
  ) {}

  public static function getSubscribedEvents(): array {
    return [
      KernelEvents::REQUEST => ['onRequest', 100],
      OrderEvents::COMPLETED => ['onOrderCompleted'],
    ];
  }

  public function onRequest(RequestEvent $event): void {
    // Handle request event
  }

  public function onOrderCompleted(OrderCompletedEvent $event): void {
    // Handle order completion
  }

}
```

### Custom Events

```php
<?php

declare(strict_types=1);

namespace Drupal\my_module\Event;

use Drupal\Component\EventDispatcher\Event;

final class OrderCompletedEvent extends Event {

  public function __construct(
    public readonly OrderInterface $order,
  ) {}

}

final class OrderEvents {
  const COMPLETED = 'my_module.order.completed';
  const CANCELLED = 'my_module.order.cancelled';
}
```

## Hook Implementations

Common hooks still used in Drupal 11:

```php
<?php

// my_module.module

use Drupal\Core\Form\FormStateInterface;
use Drupal\Core\Entity\EntityInterface;

/**
 * Implements hook_form_alter().
 */
function my_module_form_alter(array &$form, FormStateInterface $form_state, string $form_id): void {
  if ($form_id === 'node_article_edit_form') {
    $form['title']['widget'][0]['value']['#description'] = t('Enter a descriptive title.');
  }
}

/**
 * Implements hook_entity_presave().
 */
function my_module_entity_presave(EntityInterface $entity): void {
  if ($entity->getEntityTypeId() === 'node' && $entity->bundle() === 'article') {
    if ($entity->isNew()) {
      $entity->set('field_submitted_date', date('Y-m-d'));
    }
  }
}

/**
 * Implements hook_cron().
 */
function my_module_cron(): void {
  $service = \Drupal::service('my_module.order_manager');
  $service->processExpiredOrders();
}

/**
 * Implements hook_theme().
 */
function my_module_theme(): array {
  return [
    'order_summary' => [
      'variables' => [
        'order' => NULL,
        'show_details' => FALSE,
      ],
    ],
  ];
}
```

## Update Hooks

```php
/**
 * Add new field to order entity.
 */
function my_module_update_10001(): void {
  $field_storage = BaseFieldDefinition::create('string')
    ->setLabel(t('Tracking Number'))
    ->setSettings(['max_length' => 128]);

  \Drupal::entityDefinitionUpdateManager()
    ->installFieldStorageDefinition('tracking_number', 'order', 'my_module', $field_storage);
}

/**
 * Migrate data from old field to new field.
 */
function my_module_post_update_migrate_tracking_data(&$sandbox): void {
  $storage = \Drupal::entityTypeManager()->getStorage('order');

  if (!isset($sandbox['total'])) {
    $sandbox['total'] = $storage->getQuery()
      ->accessCheck(FALSE)
      ->count()
      ->execute();
    $sandbox['current'] = 0;
  }

  $ids = $storage->getQuery()
    ->accessCheck(FALSE)
    ->range($sandbox['current'], 50)
    ->execute();

  foreach ($storage->loadMultiple($ids) as $order) {
    // Migration logic
    $order->save();
    $sandbox['current']++;
  }

  $sandbox['#finished'] = $sandbox['total'] > 0
    ? $sandbox['current'] / $sandbox['total']
    : 1;
}
```

## Configuration Management

### Config Schema

```yaml
# config/schema/my_module.schema.yml
my_module.settings:
  type: config_object
  label: 'My Module settings'
  mapping:
    api_key:
      type: string
      label: 'API Key'
    max_retries:
      type: integer
      label: 'Maximum retries'
    enabled:
      type: boolean
      label: 'Enabled'
```

### Default Config

```yaml
# config/install/my_module.settings.yml
api_key: ''
max_retries: 3
enabled: true
```

### Config Form

```php
<?php

declare(strict_types=1);

namespace Drupal\my_module\Form;

use Drupal\Core\Form\ConfigFormBase;
use Drupal\Core\Form\FormStateInterface;

final class SettingsForm extends ConfigFormBase {

  protected function getEditableConfigNames(): array {
    return ['my_module.settings'];
  }

  public function getFormId(): string {
    return 'my_module_settings';
  }

  public function buildForm(array $form, FormStateInterface $form_state): array {
    $config = $this->config('my_module.settings');

    $form['api_key'] = [
      '#type' => 'textfield',
      '#title' => $this->t('API Key'),
      '#default_value' => $config->get('api_key'),
      '#required' => TRUE,
    ];

    $form['max_retries'] = [
      '#type' => 'number',
      '#title' => $this->t('Maximum retries'),
      '#default_value' => $config->get('max_retries'),
      '#min' => 1,
      '#max' => 10,
    ];

    return parent::buildForm($form, $form_state);
  }

  public function submitForm(array &$form, FormStateInterface $form_state): void {
    $this->config('my_module.settings')
      ->set('api_key', $form_state->getValue('api_key'))
      ->set('max_retries', $form_state->getValue('max_retries'))
      ->save();

    parent::submitForm($form, $form_state);
  }

}
```

## Best Practices

### Do's
- Use dependency injection via `services.yml`
- Prefer event subscribers over hooks for new code
- Define config schema for all configuration
- Use `final` on service classes
- Use `declare(strict_types=1)` everywhere
- Use PHP attributes for entity/plugin definitions

### Don'ts
- Don't use `\Drupal::service()` in OOP code (use DI)
- Don't put business logic in `.module` files
- Don't skip config schema definitions
- Don't use deprecated hook implementations when event alternatives exist
- Don't call `\Drupal::database()` directly — use entity API
