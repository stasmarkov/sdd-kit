# Exploration recipes: Laravel

Glob and Grep patterns the `code-explorer` agent uses in a Laravel repo. Every finding cites `file:line`.

## Backend

| Looking for | Glob | Grep |
|-------------|------|------|
| Routes | `routes/api.php`, `routes/web.php`, `routes/*.php` | `Route::(get\|post\|put\|patch\|delete\|apiResource)` and the URI segment |
| Controllers | `app/Http/Controllers/**/*.php` | `function __invoke`, class name from the route |
| Form requests and policies | `app/Http/Requests/**/*.php`, `app/Policies/*.php` | `function rules`, `function authorize`, `Gate::define` |
| Services | `app/Services/**/*.php` | the controller's injected service class |
| DTOs | `app/DTOs/**/*.php`, `app/Data/**/*.php` | `extends Data`, `::from(` |
| Repositories | `app/Repositories/**/*.php` | `interface .*Repository`, `->bind(` in providers |
| Models and relationships | `app/Models/*.php` | `hasMany\|belongsTo\|belongsToMany\|morph`, `$casts`, `$fillable` |
| Migrations | `database/migrations/*.php` | `Schema::create('<table>'`, `Schema::table('<table>'` |
| Events, jobs, listeners | `app/Events`, `app/Jobs`, `app/Listeners` | `dispatch(`, `event(`, `implements ShouldQueue` |
| Modules (modular monolith) | `app/Modules/*/`, `modules/*/` | `ServiceProvider`, module route files |

## Tests

| Looking for | Glob | Grep |
|-------------|------|------|
| Pest tests | `tests/Feature/**/*.php`, `tests/Unit/**/*.php` | `it('`, `test('`, the route URI or class name |
| Factories | `database/factories/*.php` | `extends Factory` |
