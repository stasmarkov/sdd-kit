# Plugin System

Drupal 11 plugin patterns using PHP attributes.

## Block Plugin

```php
<?php

declare(strict_types=1);

namespace Drupal\my_module\Plugin\Block;

use Drupal\Core\Block\Attribute\Block;
use Drupal\Core\Block\BlockBase;
use Drupal\Core\Form\FormStateInterface;
use Drupal\Core\Plugin\ContainerFactoryPluginInterface;
use Drupal\Core\StringTranslation\TranslatableMarkup;
use Drupal\my_module\Service\OrderManager;
use Symfony\Component\DependencyInjection\ContainerInterface;

#[Block(
  id: 'recent_orders',
  admin_label: new TranslatableMarkup('Recent Orders'),
  category: new TranslatableMarkup('Custom'),
)]
final class RecentOrdersBlock extends BlockBase implements ContainerFactoryPluginInterface {

  public function __construct(
    array $configuration,
    $plugin_id,
    $plugin_definition,
    private readonly OrderManager $orderManager,
  ) {
    parent::__construct($configuration, $plugin_id, $plugin_definition);
  }

  public static function create(ContainerInterface $container, array $configuration, $plugin_id, $plugin_definition): static {
    return new static(
      $configuration,
      $plugin_id,
      $plugin_definition,
      $container->get('my_module.order_manager'),
    );
  }

  public function defaultConfiguration(): array {
    return [
      'count' => 5,
    ];
  }

  public function blockForm($form, FormStateInterface $form_state): array {
    $form['count'] = [
      '#type' => 'number',
      '#title' => $this->t('Number of orders'),
      '#default_value' => $this->configuration['count'],
      '#min' => 1,
      '#max' => 20,
    ];
    return $form;
  }

  public function blockSubmit($form, FormStateInterface $form_state): void {
    $this->configuration['count'] = $form_state->getValue('count');
  }

  public function build(): array {
    $orders = $this->orderManager->getRecentOrders($this->configuration['count']);
    return [
      '#theme' => 'order_list',
      '#orders' => $orders,
      '#cache' => [
        'tags' => ['order_list'],
        'contexts' => ['user'],
        'max-age' => 300,
      ],
    ];
  }

}
```

## Field Type Plugin

```php
<?php

declare(strict_types=1);

namespace Drupal\my_module\Plugin\Field\FieldType;

use Drupal\Core\Field\Attribute\FieldType;
use Drupal\Core\Field\FieldItemBase;
use Drupal\Core\Field\FieldStorageDefinitionInterface;
use Drupal\Core\StringTranslation\TranslatableMarkup;
use Drupal\Core\TypedData\DataDefinition;

#[FieldType(
  id: 'money',
  label: new TranslatableMarkup('Money'),
  description: new TranslatableMarkup('Stores a monetary amount with currency.'),
  default_widget: 'money_default',
  default_formatter: 'money_default',
)]
final class MoneyItem extends FieldItemBase {

  public static function propertyDefinitions(FieldStorageDefinitionInterface $field_definition): array {
    $properties['amount'] = DataDefinition::create('string')
      ->setLabel(new TranslatableMarkup('Amount'))
      ->setRequired(TRUE);

    $properties['currency'] = DataDefinition::create('string')
      ->setLabel(new TranslatableMarkup('Currency'))
      ->setRequired(TRUE);

    return $properties;
  }

  public static function schema(FieldStorageDefinitionInterface $field_definition): array {
    return [
      'columns' => [
        'amount' => [
          'type' => 'numeric',
          'precision' => 19,
          'scale' => 2,
        ],
        'currency' => [
          'type' => 'varchar',
          'length' => 3,
        ],
      ],
    ];
  }

  public function isEmpty(): bool {
    $amount = $this->get('amount')->getValue();
    return $amount === NULL || $amount === '';
  }

}
```

## Field Widget Plugin

```php
<?php

declare(strict_types=1);

namespace Drupal\my_module\Plugin\Field\FieldWidget;

use Drupal\Core\Field\Attribute\FieldWidget;
use Drupal\Core\Field\FieldItemListInterface;
use Drupal\Core\Field\WidgetBase;
use Drupal\Core\Form\FormStateInterface;
use Drupal\Core\StringTranslation\TranslatableMarkup;

#[FieldWidget(
  id: 'money_default',
  label: new TranslatableMarkup('Money'),
  field_types: ['money'],
)]
final class MoneyWidget extends WidgetBase {

  public function formElement(FieldItemListInterface $items, $delta, array $element, array &$form, FormStateInterface $form_state): array {
    $element['amount'] = [
      '#type' => 'number',
      '#title' => $this->t('Amount'),
      '#default_value' => $items[$delta]->amount ?? NULL,
      '#step' => '0.01',
    ];

    $element['currency'] = [
      '#type' => 'select',
      '#title' => $this->t('Currency'),
      '#options' => ['USD' => 'USD', 'EUR' => 'EUR', 'GBP' => 'GBP'],
      '#default_value' => $items[$delta]->currency ?? 'USD',
    ];

    return $element;
  }

}
```

## Field Formatter Plugin

```php
<?php

declare(strict_types=1);

namespace Drupal\my_module\Plugin\Field\FieldFormatter;

use Drupal\Core\Field\Attribute\FieldFormatter;
use Drupal\Core\Field\FieldItemListInterface;
use Drupal\Core\Field\FormatterBase;
use Drupal\Core\StringTranslation\TranslatableMarkup;

#[FieldFormatter(
  id: 'money_default',
  label: new TranslatableMarkup('Money'),
  field_types: ['money'],
)]
final class MoneyFormatter extends FormatterBase {

  public function viewElements(FieldItemListInterface $items, $langcode): array {
    $elements = [];
    foreach ($items as $delta => $item) {
      $elements[$delta] = [
        '#markup' => number_format((float) $item->amount, 2) . ' ' . $item->currency,
      ];
    }
    return $elements;
  }

}
```

## Queue Worker Plugin

```php
<?php

declare(strict_types=1);

namespace Drupal\my_module\Plugin\QueueWorker;

use Drupal\Core\Annotation\QueueWorker;
use Drupal\Core\Plugin\ContainerFactoryPluginInterface;
use Drupal\Core\Queue\Attribute\QueueWorker as QueueWorkerAttribute;
use Drupal\Core\Queue\QueueWorkerBase;
use Drupal\Core\StringTranslation\TranslatableMarkup;
use Symfony\Component\DependencyInjection\ContainerInterface;

#[QueueWorkerAttribute(
  id: 'my_module_order_processor',
  title: new TranslatableMarkup('Order processor'),
  cron: ['time' => 60],
)]
final class OrderProcessor extends QueueWorkerBase implements ContainerFactoryPluginInterface {

  public function __construct(
    array $configuration,
    $plugin_id,
    $plugin_definition,
    private readonly OrderManager $orderManager,
  ) {
    parent::__construct($configuration, $plugin_id, $plugin_definition);
  }

  public static function create(ContainerInterface $container, array $configuration, $plugin_id, $plugin_definition): static {
    return new static(
      $configuration,
      $plugin_id,
      $plugin_definition,
      $container->get('my_module.order_manager'),
    );
  }

  public function processItem($data): void {
    $this->orderManager->processOrder($data['order_id']);
  }

}
```

## Custom Plugin Type

### Define Plugin Manager

```yaml
# my_module.services.yml
services:
  plugin.manager.payment_gateway:
    class: Drupal\my_module\PaymentGatewayPluginManager
    parent: default_plugin_manager
```

### Plugin Manager Class

```php
<?php

declare(strict_types=1);

namespace Drupal\my_module;

use Drupal\Core\Cache\CacheBackendInterface;
use Drupal\Core\Extension\ModuleHandlerInterface;
use Drupal\Core\Plugin\DefaultPluginManager;
use Drupal\my_module\Attribute\PaymentGateway;

final class PaymentGatewayPluginManager extends DefaultPluginManager {

  public function __construct(
    \Traversable $namespaces,
    CacheBackendInterface $cache_backend,
    ModuleHandlerInterface $module_handler,
  ) {
    parent::__construct(
      'Plugin/PaymentGateway',
      $namespaces,
      $module_handler,
      'Drupal\my_module\PaymentGatewayInterface',
      PaymentGateway::class,
    );
    $this->setCacheBackend($cache_backend, 'payment_gateway_plugins');
  }

}
```

### Custom Attribute

```php
<?php

declare(strict_types=1);

namespace Drupal\my_module\Attribute;

use Drupal\Component\Plugin\Attribute\Plugin;
use Drupal\Core\StringTranslation\TranslatableMarkup;

#[\Attribute(\Attribute::TARGET_CLASS)]
final class PaymentGateway extends Plugin {

  public function __construct(
    public readonly string $id,
    public readonly TranslatableMarkup $label,
    public readonly ?TranslatableMarkup $description = NULL,
  ) {}

}
```

### Plugin Implementation

```php
<?php

declare(strict_types=1);

namespace Drupal\my_module\Plugin\PaymentGateway;

use Drupal\my_module\Attribute\PaymentGateway;
use Drupal\Core\StringTranslation\TranslatableMarkup;

#[PaymentGateway(
  id: 'stripe',
  label: new TranslatableMarkup('Stripe'),
  description: new TranslatableMarkup('Payment processing via Stripe API.'),
)]
final class StripeGateway implements PaymentGatewayInterface {

  public function processPayment(float $amount, string $currency): PaymentResult {
    // Payment processing logic
  }

}
```

## Best Practices

### Do's
- Use PHP attributes instead of annotations (Drupal 11)
- Implement `ContainerFactoryPluginInterface` for DI
- Keep plugin logic minimal — delegate to services
- Define `defaultConfiguration()` for configurable plugins
- Use `final` on plugin classes

### Don'ts
- Don't use `@Annotation` syntax (deprecated in Drupal 11)
- Don't inject the full container — inject specific services
- Don't put business logic directly in plugins
- Don't forget cache tags on block plugin output
