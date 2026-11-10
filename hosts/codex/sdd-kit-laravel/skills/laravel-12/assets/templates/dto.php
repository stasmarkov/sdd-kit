<?php
/**
 * Laravel DTO Templates (Spatie Laravel Data)
 *
 * Replace placeholders:
 * - {{Entity}} = Entity name (e.g., User, Order)
 * - {{entity}} = Entity name lowercase (e.g., user, order)
 */

declare(strict_types=1);

namespace App\DTOs;

use App\Enums\{{Entity}}StatusEnum;
use App\Models\{{Entity}};
use Carbon\Carbon;
use Spatie\LaravelData\Attributes\Validation\Email;
use Spatie\LaravelData\Attributes\Validation\In;
use Spatie\LaravelData\Attributes\Validation\IntegerType;
use Spatie\LaravelData\Attributes\Validation\Max;
use Spatie\LaravelData\Attributes\Validation\Min;
use Spatie\LaravelData\Attributes\Validation\Required;
use Spatie\LaravelData\Attributes\Validation\StringType;
use Spatie\LaravelData\Attributes\Validation\Uuid;
use Spatie\LaravelData\Data;
use Spatie\LaravelData\DataCollection;
use Spatie\LaravelData\Optional;

/**
 * Primary Entity DTO - Complete representation for API responses
 */
class {{Entity}}DTO extends Data
{
    public function __construct(
        #[Required, Uuid]
        public readonly string $id,

        #[Required]
        public readonly string $name,

        public readonly ?string $description,

        #[Required]
        public readonly string $status,

        public readonly ?array $metadata,

        public readonly Carbon $created_at,

        public readonly Carbon $updated_at,
    ) {}

    /**
     * Create from Eloquent model
     */
    public static function from({{Entity}} $model): self
    {
        return new self(
            id: $model->id,
            name: $model->name,
            description: $model->description,
            status: $model->status instanceof {{Entity}}StatusEnum
                ? $model->status->value
                : $model->status,
            metadata: $model->metadata,
            created_at: $model->created_at,
            updated_at: $model->updated_at,
        );
    }

    /**
     * Create collection from models
     */
    public static function collect(iterable $models): DataCollection
    {
        return new DataCollection(
            {{Entity}}DTO::class,
            collect($models)->map(fn ($model) => self::from($model))
        );
    }

    /**
     * Convert to API response array
     */
    public function toApiArray(): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'description' => $this->description,
            'status' => $this->status,
            'metadata' => $this->metadata,
            'created_at' => $this->created_at->toISOString(),
            'updated_at' => $this->updated_at->toISOString(),
        ];
    }
}

/**
 * Create DTO - Input validation for creating new entities
 */
class Create{{Entity}}DTO extends Data
{
    public function __construct(
        #[Required, StringType, Max(255)]
        public readonly string $name,

        #[StringType, Max(1000)]
        public readonly ?string $description = null,

        public readonly ?array $metadata = null,
    ) {}

    /**
     * Additional validation rules
     */
    public static function rules(): array
    {
        return [
            // 'name' => ['unique:{{entities}},name'],
        ];
    }

    /**
     * Custom error messages
     */
    public static function messages(): array
    {
        return [
            'name.required' => 'The {{entity}} name is required.',
            'name.max' => 'The {{entity}} name cannot exceed 255 characters.',
        ];
    }

    /**
     * Convert to model creation array
     */
    public function toModelArray(): array
    {
        return [
            'name' => $this->name,
            'description' => $this->description,
            'metadata' => $this->metadata,
            'status' => {{Entity}}StatusEnum::PENDING->value,
        ];
    }
}

/**
 * Update DTO - Input validation for updating entities (partial updates)
 */
class Update{{Entity}}DTO extends Data
{
    public function __construct(
        #[StringType, Max(255)]
        public readonly string|Optional $name = new Optional(),

        #[StringType, Max(1000)]
        public readonly string|Optional|null $description = new Optional(),

        #[StringType]
        public readonly string|Optional $status = new Optional(),

        public readonly array|Optional|null $metadata = new Optional(),
    ) {}

    /**
     * Convert to model update array (only non-optional values)
     */
    public function toModelArray(): array
    {
        $data = [];

        if (!$this->name instanceof Optional) {
            $data['name'] = $this->name;
        }

        if (!$this->description instanceof Optional) {
            $data['description'] = $this->description;
        }

        if (!$this->status instanceof Optional) {
            $data['status'] = $this->status;
        }

        if (!$this->metadata instanceof Optional) {
            $data['metadata'] = $this->metadata;
        }

        return $data;
    }
}

/**
 * Filter DTO - Query parameters for listing/searching
 */
class {{Entity}}FilterDTO extends Data
{
    public function __construct(
        public readonly ?string $search = null,

        #[In(['pending', 'active', 'inactive'])]
        public readonly ?string $status = null,

        public readonly ?string $created_from = null,
        public readonly ?string $created_to = null,

        #[In(['created_at', 'name', 'status'])]
        public readonly ?string $sort = 'created_at',

        #[In(['asc', 'desc'])]
        public readonly ?string $direction = 'desc',

        #[IntegerType, Min(1), Max(100)]
        public readonly ?int $per_page = 15,
    ) {}

    /**
     * Apply filters to query builder
     */
    public function applyToQuery($query): void
    {
        if ($this->search) {
            $query->where(function ($q) {
                $q->where('name', 'like', "%{$this->search}%")
                  ->orWhere('description', 'like', "%{$this->search}%");
            });
        }

        if ($this->status) {
            $query->where('status', $this->status);
        }

        if ($this->created_from) {
            $query->where('created_at', '>=', $this->created_from);
        }

        if ($this->created_to) {
            $query->where('created_at', '<=', $this->created_to);
        }

        $query->orderBy($this->sort, $this->direction);
    }
}

/*
 * DTO TYPES SUMMARY:
 *
 * 1. EntityDTO - Full entity representation
 *    - Use for: API responses, events, cross-module communication
 *    - Methods: from(), collect(), toApiArray()
 *
 * 2. CreateEntityDTO - Creation input validation
 *    - Use for: POST requests, creating new records
 *    - Methods: toModelArray()
 *
 * 3. UpdateEntityDTO - Update input validation
 *    - Use for: PUT/PATCH requests, partial updates
 *    - Uses Optional class for truly optional fields
 *    - Methods: toModelArray() (only includes provided values)
 *
 * 4. FilterDTO - Query parameter validation
 *    - Use for: GET list endpoints, search/filter
 *    - Methods: applyToQuery()
 */
