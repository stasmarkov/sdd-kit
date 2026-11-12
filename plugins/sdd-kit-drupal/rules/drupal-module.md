---
paths:
  - "**/modules/custom/**/*.php"
  - "**/*.module"
  - "**/*.install"
  - "**/*.services.yml"
  - "**/*.info.yml"
---

# Custom modules (Drupal)

## Versions

- New modules declare `core_version_requirement: ^10.3 || ^11` unless the project pins one major. Keep an existing module's floor unless the task raises it.
- Use only APIs available at the module's floor. The plugin attributes the kit's templates use (`#[Block]`, `#[FieldType]`, `#[QueueWorker]`) are all available from 10.3; `#[Hook]` only from 11.1.

## Services and classes

- Inject dependencies through the constructor: `<module>.services.yml` arguments for services, `create(ContainerInterface $container)` for controllers, forms and plugins.
- No `\Drupal::service()`, `\Drupal::entityTypeManager()` or other `\Drupal::` calls inside classes. They are for procedural code (`.module`, `.install`) that cannot be injected.
- Plugins use PHP attributes, not `@Annotation` docblocks.
- `declare(strict_types=1);`, typed properties, return types, and `final` classes unless a subclass is part of the design.
- Keep controllers, forms and plugins thin: they build the response; services hold the business rules.

## Hooks and events

- On a module that supports 10.3 to 11.0, implement hooks as procedural functions in `<module>.module`, each with an `Implements hook_<name>().` docblock.
- Only a module that requires `^11.1` may put hooks in `#[Hook]` classes under `src/Hook/`.
- Use an event subscriber only for real Symfony or core events (kernel, routing, config, migrate). Entity and form hooks stay hooks: core dispatches no entity save or delete events.

## Rendering

- Every render array that depends on data carries `#cache` metadata: tags for the data it shows, contexts for what varies it (`user`, `url.query_args`), and `max-age` when it expires.
- Never return markup strings from controllers. Use render arrays and Twig templates registered in `hook_theme()`.

## Schema and updates

- Schema and data changes ship as `hook_update_N()` or `hook_post_update_NAME()` in `.install` and `.post_update.php`, never as manual database edits.
- Run updates through `<drush> updb` and the config check through `<drush> config:status`.
