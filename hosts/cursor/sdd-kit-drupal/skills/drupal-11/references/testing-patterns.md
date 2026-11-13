# Testing Patterns

PHPUnit tests for custom modules on Drupal 10.3+ and 11.

## Choosing a test type

| Code under test | Type | Base class | Boots |
|-----------------|------|------------|-------|
| Pure logic, value objects, a service with mocked collaborators | Unit | `Drupal\Tests\UnitTestCase` | Nothing: no database, no container |
| Services with storage, entities, config, event subscribers, plugins, hooks | Kernel | `Drupal\KernelTests\KernelTestBase` | A container and a database with only the listed modules |
| Routes, controllers, forms, access, permissions | Functional | `Drupal\Tests\BrowserTestBase` | A full site and an HTTP client |
| Behaviour that needs JavaScript | FunctionalJavascript | `Drupal\FunctionalJavascriptTests\WebDriverTestBase` | A full site and a browser (WebDriver) |

Pick the cheapest type that exercises the behaviour. Kernel tests are the default for module code: much faster than Functional, and they catch missing schema, services and permissions that Unit tests mock away.

## Layout and namespaces

```
my_module/tests/src/
├── Unit/OrderTotalTest.php               Drupal\Tests\my_module\Unit
├── Kernel/OrderServiceTest.php           Drupal\Tests\my_module\Kernel
├── Functional/OrderPageTest.php          Drupal\Tests\my_module\Functional
└── FunctionalJavascript/CartTest.php     Drupal\Tests\my_module\FunctionalJavascript
```

File names end in `Test.php`. The class name equals the file name.

## Groups: annotation first

Use the `@group` docblock annotation. It works on Drupal 10.3 (PHPUnit 9.6) and Drupal 11 (PHPUnit 10+). PHPUnit 9.6 ignores the `#[Group]` attribute, so use the attribute only in modules that require Drupal 11.

```php
/**
 * @group my_module
 */
final class OrderServiceTest extends KernelTestBase {
```

## Unit test

```php
<?php

declare(strict_types=1);

namespace Drupal\Tests\my_module\Unit;

use Drupal\my_module\Service\PriceCalculator;
use Drupal\my_module\Service\TaxRateProviderInterface;
use Drupal\Tests\UnitTestCase;

/**
 * @group my_module
 */
final class PriceCalculatorTest extends UnitTestCase {

  public function testAddsTax(): void {
    $rates = $this->createMock(TaxRateProviderInterface::class);
    $rates->method('rateFor')->willReturn(20);

    $calculator = new PriceCalculator($rates);

    $this->assertSame(1200, $calculator->gross(1000, 'GB'));
  }

}
```

Mock with PHPUnit's `createMock()`. Do not add Prophecy (`$this->prophesize()`) to new tests.

## Kernel test

```php
<?php

declare(strict_types=1);

namespace Drupal\Tests\my_module\Kernel;

use Drupal\KernelTests\KernelTestBase;
use Drupal\node\Entity\Node;
use Drupal\node\Entity\NodeType;

/**
 * @group my_module
 */
final class OrderServiceTest extends KernelTestBase {

  protected static $modules = ['system', 'user', 'node', 'field', 'text', 'my_module'];

  protected function setUp(): void {
    parent::setUp();
    $this->installEntitySchema('user');
    $this->installEntitySchema('node');
    $this->installConfig(['node', 'my_module']);
    $this->installSchema('node', ['node_access']);
    NodeType::create(['type' => 'order', 'name' => 'Order'])->save();
  }

  public function testCountsOpenOrders(): void {
    Node::create(['type' => 'order', 'title' => 'A', 'status' => 1])->save();

    $service = $this->container->get('my_module.order_service');

    $this->assertSame(1, $service->countOpen());
  }

}
```

- `$modules` lists every module the test needs, dependencies included; Kernel tests do not resolve them.
- `installEntitySchema()` creates entity tables, `installConfig()` imports a module's `config/install`, `installSchema()` creates tables from `hook_schema()`.
- Services come from `$this->container`, so the test also proves the service definition.
- Config without a schema fails a Kernel test (strict config schema checking is on).

## Functional test

```php
<?php

declare(strict_types=1);

namespace Drupal\Tests\my_module\Functional;

use Drupal\Tests\BrowserTestBase;

/**
 * @group my_module
 */
final class OrderPageTest extends BrowserTestBase {

  protected static $modules = ['node', 'my_module'];

  protected $defaultTheme = 'stark';

  public function testAnonymousIsDenied(): void {
    $this->drupalGet('/orders');
    $this->assertSession()->statusCodeEquals(403);
  }

  public function testManagerSeesOrders(): void {
    $this->drupalLogin($this->drupalCreateUser(['view orders']));
    $this->drupalGet('/orders');
    $this->assertSession()->statusCodeEquals(200);
    $this->assertSession()->pageTextContains('Orders');
  }

}
```

- `$defaultTheme` is required; `stark` keeps the markup minimal.
- Cover each route's access: anonymous, a user without the permission, a user with it.
- `drupalCreateUser([...])` takes permission names; `drupalLogin()` logs in through the login form.
- Forms: `$this->submitForm(['field' => 'value'], 'Save')`, then assert the message and the stored result.

## Environment

Kernel and Functional tests need a database and, for Functional, a base URL:

| Variable | Example | Used by |
|----------|---------|---------|
| `SIMPLETEST_DB` | `mysql://db:db@db/db` or `sqlite://localhost//tmp/test.sqlite` | Kernel, Functional |
| `SIMPLETEST_BASE_URL` | `http://web` or `http://localhost:8888` | Functional |
| `BROWSERTEST_OUTPUT_DIRECTORY` | `<docroot>/sites/simpletest/browser_output` | Functional (HTML output of each request) |

SQLite is enough for most Kernel tests and needs no database server. Set the variables in `phpunit.xml` (copied from `<docroot>/core/phpunit.xml.dist`) or in the environment the tests run in.

## Running

```bash
# One module
<phpunit> -c <docroot>/core <docroot>/modules/custom/my_module

# One file
<phpunit> -c <docroot>/core <docroot>/modules/custom/my_module/tests/src/Kernel/OrderServiceTest.php

# One method
<phpunit> -c <docroot>/core --filter testCountsOpenOrders <docroot>/modules/custom/my_module

# One runner option, in a DDEV project
ddev exec ./vendor/bin/phpunit -c <docroot>/core <docroot>/modules/custom/my_module
```

`<phpunit>` is usually `./vendor/bin/phpunit` and `<docroot>` is `web` or `docroot`. The workflow PHPUnit gate and `/run-tests` run the same command for every custom module.

## Test-first hook

The add-on's test-first hook blocks edits to classes under a custom module's `src/Controller`, `src/Form`, `src/Service`, `src/Services`, `src/Access` and `src/EventSubscriber` until its `tests/src` holds `<Class>Test.php` (any depth) or a `*Test.php` that names the class. `src/Plugin` and `src/Entity` classes get a warning only; classes directly under `src/` are not guarded. `CLAUDE_SKIP_TEST_FIRST=1` bypasses it.
