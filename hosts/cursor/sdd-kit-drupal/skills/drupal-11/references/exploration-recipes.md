# Exploration recipes: Drupal

Glob and Grep patterns the `code-explorer` agent uses in a Drupal repo. Custom code lives under the manifest's source directories (`web/modules/custom/`, `web/themes/custom/`, `modules/`); search there first and treat `web/core/` and `web/modules/contrib/` as read-only reference. Every finding cites `file:line`.

## Backend

| Looking for | Glob | Grep |
|-------------|------|------|
| Routes | `**/*.routing.yml` | `path:`, `_controller:`, `_form:`, `_entity_form:`, `_permission:`, `_custom_access:`, `_role:` |
| Controllers | `**/src/Controller/**/*.php` | the class and method named by `_controller`, `extends ControllerBase` |
| Forms and validation | `**/src/Form/**/*.php` | `function buildForm`, `function validateForm`, `function submitForm`, `extends (FormBase\|ConfigFormBase)` |
| Services and dependency injection | `**/*.services.yml`, `**/src/**/*.php` | `class:`, `arguments:`, `tags:`, `function create(ContainerInterface`, `__construct(` |
| Hooks | `**/*.module`, `**/*.install`, `**/*.theme`, `**/src/Hook/**/*.php` | `function <module>_` (procedural), `#[Hook(` (attribute classes), `hook_update_N` as `function <module>_update_` |
| Permissions and access | `**/*.permissions.yml`, `**/src/Access/**/*.php` | `title:`, `restrict access:`, `function access(`, `AccessResult::` |
| Configuration | `**/config/schema/*.yml`, `**/config/install/*.yml`, `**/config/optional/*.yml`, `config/sync/*.yml` | the config name, `type: config_object`, `mapping:` |
| Entities | `**/src/Entity/**/*.php` | `#[ContentEntityType(`, `#[ConfigEntityType(`, `@ContentEntityType`, `@ConfigEntityType`, `function baseFieldDefinitions` |
| Plugins | `**/src/Plugin/**/*.php` | `#[Block(`, `#[FieldType(`, `#[QueueWorker(`, the annotation form `@Block`, `@FieldType` |
| Event subscribers | `**/src/EventSubscriber/**/*.php`, `**/*.services.yml` | `implements EventSubscriberInterface`, `function getSubscribedEvents`, `event_subscriber` tag |
| JSON:API and REST | `config/sync/core.extension.yml`, `**/config/install/rest.resource.*.yml`, `**/src/Plugin/rest/resource/**/*.php` | `jsonapi:`, `rest:`, `#[RestResource(`, `@RestResource` |
| Schema and update hooks | `**/*.install` | `function <module>_schema`, `function <module>_update_` |

## Tests

| Looking for | Glob | Grep |
|-------------|------|------|
| Unit tests | `**/tests/src/Unit/**/*Test.php` | `extends UnitTestCase`, the class under test |
| Kernel tests | `**/tests/src/Kernel/**/*Test.php` | `extends KernelTestBase`, `protected static $modules` |
| Functional tests | `**/tests/src/Functional/**/*Test.php`, `**/tests/src/FunctionalJavascript/**/*Test.php` | `extends BrowserTestBase`, `extends WebDriverTestBase`, the route path |
| Test groups | `**/tests/src/**/*Test.php` | `@group <module>`, `#[Group(` |
