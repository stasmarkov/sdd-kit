# Go-Live Examples

Framework code examples moved out of the core skill.

### 2. Integration Configuration

```php
assert(config('services.{{service}}.url') === 'https://api.{{service}}.com');
assert(config('services.{{service}}.environment') === 'live');
```
