<?php
/**
 * Laravel Repository Templates
 *
 * Replace placeholders:
 * - {{Entity}} = Entity name (e.g., User, Order)
 * - {{entity}} = Entity name lowercase (e.g., user, order)
 * - {{entities}} = Entity name plural lowercase (e.g., users, orders)
 */

declare(strict_types=1);

namespace App\Contracts;

use App\DTOs\Create{{Entity}}DTO;
use App\DTOs\Update{{Entity}}DTO;
use App\DTOs\{{Entity}}DTO;
use App\DTOs\{{Entity}}FilterDTO;
use App\Models\{{Entity}};
use Illuminate\Pagination\LengthAwarePaginator;
use Illuminate\Support\Collection;

/**
 * Repository Interface
 *
 * Defines the contract for data access operations.
 * Primary methods return DTOs, model methods available for special cases.
 */
interface {{Entity}}RepositoryInterface
{
    // DTO Methods (Primary API)

    /**
     * Find {{entity}} by ID and return as DTO
     */
    public function findByIdAsDTO(string $id): ?{{Entity}}DTO;

    /**
     * Create {{entity}} from DTO and return as DTO
     */
    public function createFromDTO(Create{{Entity}}DTO $dto): {{Entity}}DTO;

    /**
     * Update {{entity}} from DTO and return as DTO
     */
    public function updateFromDTO(string $id, Update{{Entity}}DTO $dto): {{Entity}}DTO;

    /**
     * Find {{entities}} with filtering, return as DTO collection
     */
    public function findByFilter({{Entity}}FilterDTO $filter): LengthAwarePaginator;

    // Model Methods (When Eloquent features needed)

    /**
     * Find {{entity}} model by ID (for authorization, relationships)
     */
    public function findModelById(string $id): ?{{Entity}};

    /**
     * Delete {{entity}} by ID
     */
    public function deleteById(string $id): bool;
}

// ===========================================================================
// IMPLEMENTATION
// ===========================================================================

namespace App\Repositories;

use App\Contracts\{{Entity}}RepositoryInterface;
use App\DTOs\Create{{Entity}}DTO;
use App\DTOs\Update{{Entity}}DTO;
use App\DTOs\{{Entity}}DTO;
use App\DTOs\{{Entity}}FilterDTO;
use App\Models\{{Entity}};
use Illuminate\Pagination\LengthAwarePaginator;
use Illuminate\Support\Facades\Cache;

/**
 * Eloquent Repository Implementation
 *
 * Handles all database operations, converting between models and DTOs
 */
class Eloquent{{Entity}}Repository implements {{Entity}}RepositoryInterface
{
    /**
     * Cache TTL in seconds
     */
    private const CACHE_TTL = 3600;

    /**
     * Find {{entity}} by ID and return as DTO
     */
    public function findByIdAsDTO(string $id): ?{{Entity}}DTO
    {
        return Cache::tags(['{{entities}}'])->remember(
            "{{entity}}:{$id}",
            self::CACHE_TTL,
            function () use ($id) {
                ${{entity}} = {{Entity}}::find($id);
                return ${{entity}} ? {{Entity}}DTO::from(${{entity}}) : null;
            }
        );
    }

    /**
     * Create {{entity}} from DTO and return as DTO
     */
    public function createFromDTO(Create{{Entity}}DTO $dto): {{Entity}}DTO
    {
        ${{entity}} = {{Entity}}::create(
            array_merge(
                $dto->toModelArray(),
                ['user_id' => auth()->id()] // If user ownership needed
            )
        );

        // Invalidate list cache
        Cache::tags(['{{entities}}'])->flush();

        return {{Entity}}DTO::from(${{entity}});
    }

    /**
     * Update {{entity}} from DTO and return as DTO
     */
    public function updateFromDTO(string $id, Update{{Entity}}DTO $dto): {{Entity}}DTO
    {
        ${{entity}} = {{Entity}}::findOrFail($id);
        ${{entity}}->update($dto->toModelArray());

        // Invalidate caches
        Cache::tags(['{{entities}}'])->forget("{{entity}}:{$id}");

        return {{Entity}}DTO::from(${{entity}}->fresh());
    }

    /**
     * Find {{entities}} with filtering, return as paginated DTO collection
     */
    public function findByFilter({{Entity}}FilterDTO $filter): LengthAwarePaginator
    {
        $query = {{Entity}}::query()
            ->with(['user']); // Eager load relationships

        // Apply filter DTO to query
        $filter->applyToQuery($query);

        // Paginate and transform to DTOs
        return $query->paginate($filter->per_page)
            ->through(fn ({{Entity}} ${{entity}}) => {{Entity}}DTO::from(${{entity}}));
    }

    /**
     * Find {{entity}} model by ID
     */
    public function findModelById(string $id): ?{{Entity}}
    {
        return {{Entity}}::find($id);
    }

    /**
     * Delete {{entity}} by ID
     */
    public function deleteById(string $id): bool
    {
        $deleted = {{Entity}}::destroy($id) > 0;

        if ($deleted) {
            Cache::tags(['{{entities}}'])->forget("{{entity}}:{$id}");
            Cache::tags(['{{entities}}'])->flush();
        }

        return $deleted;
    }

    // Additional query methods as needed

    /**
     * Find {{entities}} by user ID
     */
    public function findByUserId(string $userId): Collection
    {
        return {{Entity}}::where('user_id', $userId)
            ->latest()
            ->get()
            ->map(fn ({{Entity}} ${{entity}}) => {{Entity}}DTO::from(${{entity}}));
    }

    /**
     * Find {{entities}} by status
     */
    public function findByStatus(string $status): Collection
    {
        return {{Entity}}::where('status', $status)
            ->latest()
            ->get()
            ->map(fn ({{Entity}} ${{entity}}) => {{Entity}}DTO::from(${{entity}}));
    }

    /**
     * Check if {{entity}} exists
     */
    public function exists(string $id): bool
    {
        return {{Entity}}::where('id', $id)->exists();
    }
}

// ===========================================================================
// SERVICE PROVIDER BINDING
// ===========================================================================

namespace App\Providers;

use App\Contracts\{{Entity}}RepositoryInterface;
use App\Repositories\Eloquent{{Entity}}Repository;
use Illuminate\Support\ServiceProvider;

class RepositoryServiceProvider extends ServiceProvider
{
    /**
     * Register repository bindings
     */
    public array $bindings = [
        {{Entity}}RepositoryInterface::class => Eloquent{{Entity}}Repository::class,
    ];
}

/*
 * REPOSITORY PATTERN NOTES:
 *
 * 1. Interface defines contract - enables testing with mocks
 * 2. Primary methods return DTOs for type safety
 * 3. Model methods available for special cases (authorization, relationships)
 * 4. Cache invalidation on mutations
 * 5. Eager loading relationships to prevent N+1
 * 6. Bind interface to implementation in ServiceProvider
 *
 * WHEN TO USE MODEL vs DTO:
 *
 * Use DTO (findByIdAsDTO):
 * - API responses
 * - Event payloads
 * - Cross-module communication
 * - Caching
 *
 * Use Model (findModelById):
 * - Authorization checks (Policies need model context)
 * - Relationship operations
 * - Complex updates with relationships
 * - When you need Eloquent methods
 */
