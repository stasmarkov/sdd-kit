# Schema-First Implementation Examples

Detailed code examples showing how to go from schema documentation to working Laravel code.

---

## Example: Users Schema

```markdown
# Schema: users

## Purpose
Stores user account information and authentication data.

## Fields

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | uuid | No | auto | Primary key |
| email | string(255) | No | - | User email address (unique) |
| password | string(255) | No | - | Hashed password |
| name | string(100) | Yes | null | Display name |
| status | enum | No | pending | Account status |
| email_verified_at | timestamp | Yes | null | Email verification time |
| remember_token | string(100) | Yes | null | Session remember token |
| created_at | timestamp | No | now() | Record creation time |
| updated_at | timestamp | No | now() | Record update time |
| deleted_at | timestamp | Yes | null | Soft delete timestamp |

## Relationships
- has_one: wallet (foreign_key: user_id)
- has_many: orders (foreign_key: user_id)
- has_many: tokens (foreign_key: user_id)

## Indexes
- PRIMARY: id
- UNIQUE: email
- INDEX: status (filter active users)
- INDEX: created_at (sorting)

## Constraints
- email: Must be valid email format
- password: Minimum 8 characters (validated at app level)
- status: Must be valid enum value

## Enums
```php
enum UserStatusEnum: string {
    case PENDING = 'pending';
    case ACTIVE = 'active';
    case INACTIVE = 'inactive';
    case SUSPENDED = 'suspended';
}
```

## Notes
- Soft deletes enabled for audit trail
- Password hashing handled by Laravel
- Email verification required for activation
```

---

## Migration from Schema

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('users', function (Blueprint $table) {
            // Primary Key
            $table->uuid('id')->primary();

            // Fields
            $table->string('email', 255)->unique();
            $table->string('password', 255);
            $table->string('name', 100)->nullable();
            $table->enum('status', ['pending', 'active', 'inactive', 'suspended'])
                  ->default('pending');
            $table->timestamp('email_verified_at')->nullable();
            $table->rememberToken();

            // Timestamps
            $table->timestamps();
            $table->softDeletes();

            // Indexes
            $table->index('status');
            $table->index('created_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('users');
    }
};
```

---

## Model Implementation from Schema

```php
<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\UserStatusEnum;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Laravel\Passport\HasApiTokens;

class User extends Authenticatable
{
    use HasApiTokens, HasFactory, HasUuids, SoftDeletes;

    protected $keyType = 'string';
    public $incrementing = false;

    protected $fillable = [
        'email',
        'password',
        'name',
        'status',
        'email_verified_at',
    ];

    protected $hidden = [
        'password',
        'remember_token',
    ];

    protected function casts(): array
    {
        return [
            'status' => UserStatusEnum::class,
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
        ];
    }

    public function wallet(): HasOne
    {
        return $this->hasOne(Wallet::class);
    }

    public function orders(): HasMany
    {
        return $this->hasMany(Order::class);
    }
}
```

---

## DTO from Schema

```php
<?php

declare(strict_types=1);

namespace App\DTOs;

use App\Enums\UserStatusEnum;
use Carbon\Carbon;
use Spatie\LaravelData\Data;

class UserDTO extends Data
{
    public function __construct(
        public readonly string $id,
        public readonly string $email,
        public readonly ?string $name,
        public readonly UserStatusEnum $status,
        public readonly ?Carbon $email_verified_at,
        public readonly Carbon $created_at,
        public readonly Carbon $updated_at,
    ) {}
}
```
