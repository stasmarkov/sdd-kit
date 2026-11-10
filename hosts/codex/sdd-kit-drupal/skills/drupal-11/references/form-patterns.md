# Form Patterns

Drupal 11 Form API patterns.

## Basic Form

```php
<?php

declare(strict_types=1);

namespace Drupal\my_module\Form;

use Drupal\Core\Form\FormBase;
use Drupal\Core\Form\FormStateInterface;
use Drupal\my_module\Service\OrderManager;
use Symfony\Component\DependencyInjection\ContainerInterface;

final class OrderFilterForm extends FormBase {

  public function __construct(
    private readonly OrderManager $orderManager,
  ) {}

  public static function create(ContainerInterface $container): static {
    return new static(
      $container->get('my_module.order_manager'),
    );
  }

  public function getFormId(): string {
    return 'my_module_order_filter';
  }

  public function buildForm(array $form, FormStateInterface $form_state): array {
    $form['status'] = [
      '#type' => 'select',
      '#title' => $this->t('Status'),
      '#options' => [
        '' => $this->t('- All -'),
        'pending' => $this->t('Pending'),
        'completed' => $this->t('Completed'),
        'cancelled' => $this->t('Cancelled'),
      ],
    ];

    $form['date_range'] = [
      '#type' => 'fieldset',
      '#title' => $this->t('Date range'),
    ];

    $form['date_range']['from'] = [
      '#type' => 'date',
      '#title' => $this->t('From'),
    ];

    $form['date_range']['to'] = [
      '#type' => 'date',
      '#title' => $this->t('To'),
    ];

    $form['actions'] = [
      '#type' => 'actions',
    ];

    $form['actions']['submit'] = [
      '#type' => 'submit',
      '#value' => $this->t('Filter'),
    ];

    $form['actions']['reset'] = [
      '#type' => 'submit',
      '#value' => $this->t('Reset'),
      '#submit' => ['::resetForm'],
      '#limit_validation_errors' => [],
    ];

    return $form;
  }

  public function validateForm(array &$form, FormStateInterface $form_state): void {
    $from = $form_state->getValue('from');
    $to = $form_state->getValue('to');

    if ($from && $to && $from > $to) {
      $form_state->setErrorByName('from', $this->t('"From" date must be before "To" date.'));
    }
  }

  public function submitForm(array &$form, FormStateInterface $form_state): void {
    $query = [];
    if ($status = $form_state->getValue('status')) {
      $query['status'] = $status;
    }
    $form_state->setRedirect('my_module.orders', [], ['query' => $query]);
  }

  public function resetForm(array &$form, FormStateInterface $form_state): void {
    $form_state->setRedirect('my_module.orders');
  }

}
```

## Config Form

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

    $form['general'] = [
      '#type' => 'details',
      '#title' => $this->t('General settings'),
      '#open' => TRUE,
    ];

    $form['general']['api_key'] = [
      '#type' => 'textfield',
      '#title' => $this->t('API Key'),
      '#default_value' => $config->get('api_key'),
      '#required' => TRUE,
      '#maxlength' => 128,
    ];

    $form['general']['environment'] = [
      '#type' => 'radios',
      '#title' => $this->t('Environment'),
      '#options' => [
        'sandbox' => $this->t('Sandbox'),
        'production' => $this->t('Production'),
      ],
      '#default_value' => $config->get('environment') ?? 'sandbox',
    ];

    $form['notifications'] = [
      '#type' => 'details',
      '#title' => $this->t('Notification settings'),
    ];

    $form['notifications']['email_notifications'] = [
      '#type' => 'checkbox',
      '#title' => $this->t('Enable email notifications'),
      '#default_value' => $config->get('email_notifications'),
    ];

    $form['notifications']['notification_email'] = [
      '#type' => 'email',
      '#title' => $this->t('Notification email'),
      '#default_value' => $config->get('notification_email'),
      '#states' => [
        'visible' => [
          ':input[name="email_notifications"]' => ['checked' => TRUE],
        ],
        'required' => [
          ':input[name="email_notifications"]' => ['checked' => TRUE],
        ],
      ],
    ];

    return parent::buildForm($form, $form_state);
  }

  public function submitForm(array &$form, FormStateInterface $form_state): void {
    $this->config('my_module.settings')
      ->set('api_key', $form_state->getValue('api_key'))
      ->set('environment', $form_state->getValue('environment'))
      ->set('email_notifications', $form_state->getValue('email_notifications'))
      ->set('notification_email', $form_state->getValue('notification_email'))
      ->save();

    parent::submitForm($form, $form_state);
  }

}
```

## Confirm Form

```php
<?php

declare(strict_types=1);

namespace Drupal\my_module\Form;

use Drupal\Core\Form\ConfirmFormBase;
use Drupal\Core\Form\FormStateInterface;
use Drupal\Core\Url;

final class OrderCancelForm extends ConfirmFormBase {

  protected ?OrderInterface $order = NULL;

  public function getFormId(): string {
    return 'my_module_order_cancel';
  }

  public function getQuestion(): TranslatableMarkup {
    return $this->t('Are you sure you want to cancel order @id?', [
      '@id' => $this->order->id(),
    ]);
  }

  public function getCancelUrl(): Url {
    return Url::fromRoute('entity.order.canonical', ['order' => $this->order->id()]);
  }

  public function buildForm(array $form, FormStateInterface $form_state, ?OrderInterface $order = NULL): array {
    $this->order = $order;
    return parent::buildForm($form, $form_state);
  }

  public function submitForm(array &$form, FormStateInterface $form_state): void {
    $this->order->set('status', 'cancelled');
    $this->order->save();

    $this->messenger()->addStatus($this->t('Order @id has been cancelled.', [
      '@id' => $this->order->id(),
    ]));

    $form_state->setRedirectUrl($this->getCancelUrl());
  }

}
```

## AJAX Forms

```php
public function buildForm(array $form, FormStateInterface $form_state): array {
  $form['country'] = [
    '#type' => 'select',
    '#title' => $this->t('Country'),
    '#options' => $this->getCountryOptions(),
    '#ajax' => [
      'callback' => '::updateRegionOptions',
      'wrapper' => 'region-wrapper',
      'event' => 'change',
    ],
  ];

  $country = $form_state->getValue('country');
  $form['region'] = [
    '#type' => 'select',
    '#title' => $this->t('Region'),
    '#prefix' => '<div id="region-wrapper">',
    '#suffix' => '</div>',
    '#options' => $country ? $this->getRegionOptions($country) : [],
    '#validated' => TRUE,
  ];

  return $form;
}

public function updateRegionOptions(array &$form, FormStateInterface $form_state): array {
  return $form['region'];
}
```

## Multi-Step Forms

```php
public function buildForm(array $form, FormStateInterface $form_state): array {
  $step = $form_state->get('step') ?? 1;
  $form_state->set('step', $step);

  return match ($step) {
    1 => $this->buildStep1($form, $form_state),
    2 => $this->buildStep2($form, $form_state),
    3 => $this->buildStep3($form, $form_state),
  };
}

private function buildStep1(array $form, FormStateInterface $form_state): array {
  $form['name'] = [
    '#type' => 'textfield',
    '#title' => $this->t('Name'),
    '#required' => TRUE,
  ];

  $form['actions']['next'] = [
    '#type' => 'submit',
    '#value' => $this->t('Next'),
    '#submit' => ['::nextStep'],
  ];

  return $form;
}

public function nextStep(array &$form, FormStateInterface $form_state): void {
  $step = $form_state->get('step');
  $form_state->set('step', $step + 1);
  $form_state->setRebuild();
}

public function previousStep(array &$form, FormStateInterface $form_state): void {
  $step = $form_state->get('step');
  $form_state->set('step', $step - 1);
  $form_state->setRebuild();
}
```

## Common Form Elements

| Element | `#type` | Key Properties |
|---------|---------|---------------|
| Text field | `textfield` | `#maxlength`, `#size` |
| Textarea | `textarea` | `#rows`, `#cols` |
| Number | `number` | `#min`, `#max`, `#step` |
| Select | `select` | `#options`, `#empty_option` |
| Checkboxes | `checkboxes` | `#options` |
| Radios | `radios` | `#options` |
| Date | `date` | `#date_date_format` |
| File | `managed_file` | `#upload_location`, `#upload_validators` |
| Entity ref | `entity_autocomplete` | `#target_type`, `#selection_settings` |
| Details | `details` | `#open` |
| Fieldset | `fieldset` | — |
| Container | `container` | — |

## Best Practices

### Do's
- Use `ConfigFormBase` for settings forms
- Use `#states` for conditional form elements
- Validate in `validateForm()`, not `submitForm()`
- Use `FormStateInterface::setRedirect()` after submit
- Use AJAX callbacks for dynamic form updates

### Don'ts
- Don't put save logic in `validateForm()`
- Don't forget `#validated => TRUE` on AJAX-rebuilt elements
- Don't bypass Form API with raw HTML forms
- Don't skip `getFormId()` — each form needs a unique ID
