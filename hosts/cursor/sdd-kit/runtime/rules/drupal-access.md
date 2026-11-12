---
paths:
  - "**/*.routing.yml"
  - "**/*.permissions.yml"
  - "**/src/Access/**"
---

# Access and security (Drupal)

## Routes

- Every route declares an access requirement: `_permission`, `_entity_access`, `_custom_access` or a tagged access checker.
- `_access: 'TRUE'` is allowed only on routes that are public by design (a login page, a public webhook that verifies its own signature). Say why in a comment next to the route.
- Admin routes use `_admin_route: TRUE` and a restrictive permission. Permissions that grant control over the site set `restrict access: true`.

## Access checkers

- An access checker returns an `AccessResult` with cacheability: `AccessResult::allowedIfHasPermission()`, or `->cachePerUser()`, `->cachePerPermissions()` and `->addCacheableDependency()` on a custom result.
- Entity queries for user-facing lists call `->accessCheck(TRUE)`. Use `->accessCheck(FALSE)` only for system work, and say why.

## Data handling

- Database queries use the entity API or the database service with placeholders (`:name`). Never build SQL by concatenating input.
- Output goes through render arrays and Twig, which escape by default. Use `Xss::filter()` or `Html::escape()` when you build markup by hand, and never mark user input as safe.
- Forms validate in `validateForm()` and rely on the Form API's CSRF token. Routes that change state through GET use `_csrf_token: 'TRUE'`.
