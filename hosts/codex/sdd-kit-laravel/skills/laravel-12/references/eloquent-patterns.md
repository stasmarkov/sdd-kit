# Eloquent Best Practices

Detailed patterns for Eloquent models in Laravel 12.

## Model Definition

```php
<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class Order extends Model
{
    use HasUuids, HasFactory, SoftDeletes;

    protected $table = 'orders';
    protected $keyType = 'string';
    public $incrementing = false;

    protected $fillable = [
        'user_id',
        'total_amount',
        'currency',
        'status',
        'metadata',
    ];

    protected function casts(): array
    {
        return [
            'status' => OrderStatusEnum::class,
            'metadata' => 'array',
            'total_amount' => 'integer',
        ];
    }

    // Relationships
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function items(): HasMany
    {
        return $this->hasMany(OrderItem::class);
    }

    // Scopes
    public function scopeCompleted(Builder $query): Builder
    {
        return $query->where('status', OrderStatusEnum::COMPLETED);
    }

    // Accessors
    protected function formattedTotal(): Attribute
    {
        return Attribute::make(
            get: fn () => number_format($this->total_amount / 100, 2) . ' ' . $this->currency
        );
    }
}
```

## Key Laravel 12 Changes

### Model Casts
Use `casts()` method instead of `$casts` property:

```php
// Laravel 12 way
protected function casts(): array
{
    return [
        'status' => StatusEnum::class,
        'metadata' => 'array',
        'verified_at' => 'datetime',
    ];
}
```

## Eager Loading

```php
// Prevent N+1 queries
$orders = Order::with(['user', 'items'])
    ->where('status', 'completed')
    ->get();

// Nested eager loading
$orders = Order::with([
    'user.profile',
    'items.product',
])->get();

// Constrained eager loading
$orders = Order::with(['items' => fn($query) => $query->latest()->limit(5)])
    ->get();
```

## Query Builder Best Practices

```php
// Use query() for clarity
$users = User::query()
    ->where('status', 'active')
    ->orderBy('created_at', 'desc')
    ->paginate(15);

// Prefer Model:: over DB::
User::where('email', $email)->first();  // Good
DB::table('users')->where('email', $email)->first();  // Avoid
```

## UUID Primary Keys

Always use UUIDs for public-facing IDs:

```php
use Illuminate\Database\Eloquent\Concerns\HasUuids;

class Order extends Model
{
    use HasUuids;

    protected $keyType = 'string';
    public $incrementing = false;
}
```

## Soft Deletes

```php
use Illuminate\Database\Eloquent\SoftDeletes;

class Order extends Model
{
    use SoftDeletes;
}

// Querying
Order::withTrashed()->get();
Order::onlyTrashed()->get();
$order->restore();
$order->forceDelete();
```

## Model Events

Prefer observers for complex logic:

```php
// app/Observers/OrderObserver.php
class OrderObserver
{
    public function created(Order $order): void
    {
        // Handle creation
    }

    public function updating(Order $order): void
    {
        // Validate before update
    }
}

// Register in AppServiceProvider
Order::observe(OrderObserver::class);
```
