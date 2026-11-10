# Generate templates: Laravel

The `/generate` skill takes its templates from this skill's `assets/templates/`. Paths are relative to the kit's skills directory (`.agents/skills/` in file-copy installs, `skills/` in the plugin).

## Template sources

| Artifact | Template | Namespace / path |
|----------|----------|------------------|
| Invokable controller | `laravel-12/assets/templates/controller.php` | `App\Http\Controllers\{Module}` |
| Service | `laravel-12/assets/templates/service.php` | `App\Services` |
| DTOs (entity, create, update, filter) | `laravel-12/assets/templates/dto.php` | `App\DTOs` |
| Repository interface, Eloquent implementation, binding | `laravel-12/assets/templates/repository.php` | `App\Contracts`, `App\Repositories`, `App\Providers\RepositoryServiceProvider` |
| Pest test | `laravel-12/assets/templates/test.php` | `tests/Feature`, `tests/Unit` |

Module layouts (`app/Modules/<Module>/...`) are in `module-scaffolding.md`. Wiring: bind the repository interface in a service provider, register routes in `routes/api.php` under the API version prefix, add the policy check in each controller. `php artisan make:model Order -mf`, `make:policy OrderPolicy --model=Order` and `make:resource OrderResource` add wiring; then replace the generated bodies with the template's. Gates after generating: Pint, PHPStan and the generated tests.

## CRUD set (`--crud=Order`)

```
  app/Models/Order.php                                   (make:model -mf)
  database/migrations/xxxx_create_orders_table.php
  database/factories/OrderFactory.php
  app/DTOs/OrderDTO.php, CreateOrderDTO.php, UpdateOrderDTO.php, OrderFilterDTO.php
  app/Contracts/OrderRepositoryInterface.php
  app/Repositories/EloquentOrderRepository.php
  app/Services/OrderService.php
  app/Http/Controllers/Order/{List,Show,Create,Update,Delete}OrderController.php
  app/Http/Resources/OrderResource.php
  app/Policies/OrderPolicy.php
  tests/Feature/Order/*Test.php
```
