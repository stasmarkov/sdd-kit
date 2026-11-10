# Entity Patterns

Detailed patterns for content and config entities in Drupal 11.

## Content Entity Definition

```php
<?php

declare(strict_types=1);

namespace Drupal\my_module\Entity;

use Drupal\Core\Entity\ContentEntityBase;
use Drupal\Core\Entity\EntityChangedTrait;
use Drupal\Core\Entity\EntityTypeInterface;
use Drupal\Core\Field\BaseFieldDefinition;
use Drupal\user\EntityOwnerTrait;

#[\Drupal\Core\Entity\Attribute\ContentEntityType(
  id: 'order',
  label: new \Drupal\Core\StringTranslation\TranslatableMarkup('Order'),
  label_collection: new \Drupal\Core\StringTranslation\TranslatableMarkup('Orders'),
  label_singular: new \Drupal\Core\StringTranslation\TranslatableMarkup('order'),
  label_plural: new \Drupal\Core\StringTranslation\TranslatableMarkup('orders'),
  handlers: [
    'storage' => \Drupal\Core\Entity\Sql\SqlContentEntityStorage::class,
    'view_builder' => \Drupal\Core\Entity\EntityViewBuilder::class,
    'list_builder' => \Drupal\my_module\Entity\Handler\OrderListBuilder::class,
    'form' => [
      'default' => \Drupal\my_module\Form\OrderForm::class,
      'delete' => \Drupal\Core\Entity\ContentEntityDeleteForm::class,
    ],
    'route_provider' => [
      'html' => \Drupal\Core\Entity\Routing\AdminHtmlRouteProvider::class,
    ],
    'access' => \Drupal\my_module\Entity\Handler\OrderAccessControlHandler::class,
  ],
  base_table: 'order',
  data_table: 'order_field_data',
  translatable: TRUE,
  admin_permission: 'administer orders',
  entity_keys: [
    'id' => 'id',
    'uuid' => 'uuid',
    'label' => 'title',
    'langcode' => 'langcode',
    'owner' => 'uid',
  ],
  links: [
    'canonical' => '/order/{order}',
    'add-form' => '/order/add',
    'edit-form' => '/order/{order}/edit',
    'delete-form' => '/order/{order}/delete',
    'collection' => '/admin/content/orders',
  ],
)]
final class Order extends ContentEntityBase {

  use EntityChangedTrait;
  use EntityOwnerTrait;

  public static function baseFieldDefinitions(EntityTypeInterface $entity_type): array {
    $fields = parent::baseFieldDefinitions($entity_type);
    $fields += static::ownerBaseFieldDefinitions($entity_type);

    $fields['title'] = BaseFieldDefinition::create('string')
      ->setLabel(t('Title'))
      ->setRequired(TRUE)
      ->setTranslatable(TRUE)
      ->setSetting('max_length', 255)
      ->setDisplayOptions('form', [
        'type' => 'string_textfield',
        'weight' => 0,
      ])
      ->setDisplayConfigurable('form', TRUE)
      ->setDisplayConfigurable('view', TRUE);

    $fields['status'] = BaseFieldDefinition::create('list_string')
      ->setLabel(t('Status'))
      ->setRequired(TRUE)
      ->setSetting('allowed_values', [
        'pending' => 'Pending',
        'processing' => 'Processing',
        'completed' => 'Completed',
        'cancelled' => 'Cancelled',
      ])
      ->setDefaultValue('pending')
      ->setDisplayOptions('form', [
        'type' => 'options_select',
        'weight' => 1,
      ])
      ->setDisplayConfigurable('form', TRUE)
      ->setDisplayConfigurable('view', TRUE);

    $fields['total_amount'] = BaseFieldDefinition::create('decimal')
      ->setLabel(t('Total Amount'))
      ->setRequired(TRUE)
      ->setSetting('precision', 10)
      ->setSetting('scale', 2)
      ->setDisplayOptions('form', [
        'type' => 'number',
        'weight' => 2,
      ])
      ->setDisplayConfigurable('form', TRUE)
      ->setDisplayConfigurable('view', TRUE);

    $fields['created'] = BaseFieldDefinition::create('created')
      ->setLabel(t('Created'))
      ->setDescription(t('The time the order was created.'));

    $fields['changed'] = BaseFieldDefinition::create('changed')
      ->setLabel(t('Changed'))
      ->setDescription(t('The time the order was last edited.'));

    return $fields;
  }

}
```

## Config Entity Definition

```php
<?php

declare(strict_types=1);

namespace Drupal\my_module\Entity;

use Drupal\Core\Config\Entity\ConfigEntityBase;

#[\Drupal\Core\Entity\Attribute\ConfigEntityType(
  id: 'order_type',
  label: new \Drupal\Core\StringTranslation\TranslatableMarkup('Order type'),
  handlers: [
    'list_builder' => \Drupal\my_module\Entity\Handler\OrderTypeListBuilder::class,
    'form' => [
      'default' => \Drupal\my_module\Form\OrderTypeForm::class,
      'delete' => \Drupal\Core\Entity\EntityDeleteForm::class,
    ],
    'route_provider' => [
      'html' => \Drupal\Core\Entity\Routing\AdminHtmlRouteProvider::class,
    ],
  ],
  config_prefix: 'order_type',
  admin_permission: 'administer orders',
  entity_keys: [
    'id' => 'id',
    'label' => 'label',
    'uuid' => 'uuid',
  ],
  links: [
    'add-form' => '/admin/structure/order-types/add',
    'edit-form' => '/admin/structure/order-types/{order_type}/edit',
    'delete-form' => '/admin/structure/order-types/{order_type}/delete',
    'collection' => '/admin/structure/order-types',
  ],
  config_export: [
    'id',
    'label',
    'description',
  ],
)]
final class OrderType extends ConfigEntityBase {

  protected string $id;
  protected string $label;
  protected string $description = '';

  public function getDescription(): string {
    return $this->description;
  }

}
```

## Entity Access Control Handler

```php
<?php

declare(strict_types=1);

namespace Drupal\my_module\Entity\Handler;

use Drupal\Core\Access\AccessResult;
use Drupal\Core\Entity\EntityAccessControlHandler;
use Drupal\Core\Entity\EntityInterface;
use Drupal\Core\Session\AccountInterface;

final class OrderAccessControlHandler extends EntityAccessControlHandler {

  protected function checkAccess(EntityInterface $entity, $operation, AccountInterface $account): AccessResult {
    return match ($operation) {
      'view' => AccessResult::allowedIfHasPermission($account, 'view orders')
        ->orIf(AccessResult::allowedIf($entity->getOwnerId() === $account->id())
          ->addCacheableDependency($entity)),
      'update' => AccessResult::allowedIfHasPermission($account, 'edit orders')
        ->orIf(AccessResult::allowedIf($entity->getOwnerId() === $account->id())
          ->addCacheableDependency($entity)),
      'delete' => AccessResult::allowedIfHasPermission($account, 'delete orders'),
      default => AccessResult::neutral(),
    };
  }

  protected function checkCreateAccess(AccountInterface $account, array $context, $entity_bundle = NULL): AccessResult {
    return AccessResult::allowedIfHasPermission($account, 'create orders');
  }

}
```

## Entity List Builder

```php
<?php

declare(strict_types=1);

namespace Drupal\my_module\Entity\Handler;

use Drupal\Core\Entity\EntityInterface;
use Drupal\Core\Entity\EntityListBuilder;

final class OrderListBuilder extends EntityListBuilder {

  public function buildHeader(): array {
    $header['title'] = $this->t('Title');
    $header['status'] = $this->t('Status');
    $header['owner'] = $this->t('Owner');
    $header['created'] = $this->t('Created');
    return $header + parent::buildHeader();
  }

  public function buildRow(EntityInterface $entity): array {
    $row['title'] = $entity->toLink();
    $row['status'] = $entity->get('status')->value;
    $row['owner'] = $entity->getOwner()?->getDisplayName() ?? '';
    $row['created'] = \Drupal::service('date.formatter')
      ->format($entity->get('created')->value, 'short');
    return $row + parent::buildRow($entity);
  }

}
```

## Entity Queries

```php
// Basic entity query
$ids = \Drupal::entityQuery('order')
  ->condition('status', 'completed')
  ->condition('uid', $userId)
  ->sort('created', 'DESC')
  ->range(0, 20)
  ->accessCheck(TRUE)
  ->execute();

// Load entities
$orders = \Drupal::entityTypeManager()
  ->getStorage('order')
  ->loadMultiple($ids);

// Condition groups (OR)
$query = \Drupal::entityQuery('node')
  ->accessCheck(TRUE);
$group = $query->orConditionGroup()
  ->condition('field_category', $term1)
  ->condition('field_category', $term2);
$query->condition($group);
$nids = $query->execute();

// Aggregate queries
$query = \Drupal::entityQueryAggregate('order')
  ->accessCheck(TRUE)
  ->groupBy('status')
  ->aggregate('id', 'COUNT');
$results = $query->execute();
```

## Field Types

| Field Type | Usage | Settings |
|-----------|-------|----------|
| `string` | Short text | `max_length` |
| `string_long` | Long text (no format) | — |
| `text_long` | Formatted text | — |
| `integer` | Integer | `min`, `max` |
| `decimal` | Decimal | `precision`, `scale` |
| `boolean` | Boolean | `on_label`, `off_label` |
| `list_string` | Select list | `allowed_values` |
| `entity_reference` | Reference | `target_type`, `handler_settings` |
| `datetime` | Date/time | `datetime_type` |
| `created` | Auto-set on create | — |
| `changed` | Auto-set on save | — |
| `uri` | URI | — |
| `email` | Email address | — |

## Entity Reference Fields

```php
$fields['customer'] = BaseFieldDefinition::create('entity_reference')
  ->setLabel(t('Customer'))
  ->setSetting('target_type', 'user')
  ->setSetting('handler', 'default')
  ->setDisplayOptions('form', [
    'type' => 'entity_reference_autocomplete',
    'weight' => 3,
  ])
  ->setDisplayConfigurable('form', TRUE)
  ->setDisplayConfigurable('view', TRUE);

$fields['product'] = BaseFieldDefinition::create('entity_reference')
  ->setLabel(t('Product'))
  ->setSetting('target_type', 'node')
  ->setSetting('handler_settings', [
    'target_bundles' => ['product' => 'product'],
  ])
  ->setCardinality(BaseFieldDefinition::CARDINALITY_UNLIMITED)
  ->setDisplayConfigurable('form', TRUE)
  ->setDisplayConfigurable('view', TRUE);
```

## Best Practices

### Do's
- Always call `->accessCheck(TRUE)` on entity queries
- Use `baseFieldDefinitions()` for entity-level fields
- Declare cache tags/contexts on render arrays
- Use PHP attributes for entity type definitions (Drupal 11+)
- Define proper access control handlers

### Don'ts
- Don't bypass the Entity API with direct database queries
- Don't use `->accessCheck(FALSE)` without explicit justification
- Don't hardcode entity IDs or field names
- Don't skip config schema for config entities
