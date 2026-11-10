<?php
/**
 * Laravel Service Template
 *
 * Replace placeholders:
 * - {{Module}} = Module name (e.g., User, Order, Payment)
 * - {{Entity}} = Entity name (e.g., User, Order)
 * - {{entity}} = Entity name lowercase (e.g., user, order)
 */

declare(strict_types=1);

namespace App\Services;

use App\Contracts\{{Entity}}RepositoryInterface;
use App\DTOs\Create{{Entity}}DTO;
use App\DTOs\Update{{Entity}}DTO;
use App\DTOs\{{Entity}}DTO;
use App\DTOs\{{Entity}}FilterDTO;
use App\Events\{{Entity}}CreatedEvent;
use App\Events\{{Entity}}UpdatedEvent;
use App\Events\{{Entity}}DeletedEvent;
use App\Exceptions\{{Entity}}NotFoundException;
use App\Exceptions\{{Entity}}ValidationException;
use App\Models\{{Entity}};
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

class {{Entity}}Service
{
    public function __construct(
        private readonly {{Entity}}RepositoryInterface $repository
    ) {}

    /**
     * Create a new {{entity}}
     */
    public function create(Create{{Entity}}DTO $dto): {{Entity}}DTO
    {
        // Validate business rules
        $this->validateCreateBusinessRules($dto);

        return DB::transaction(function () use ($dto) {
            // Create via repository
            ${{entity}}DTO = $this->repository->createFromDTO($dto);

            // Dispatch event with DTO (not model)
            event(new {{Entity}}CreatedEvent(${{entity}}DTO, auth()->id()));

            return ${{entity}}DTO;
        });
    }

    /**
     * Update an existing {{entity}}
     */
    public function update(string $id, Update{{Entity}}DTO $dto): {{Entity}}DTO
    {
        // Validate business rules
        $this->validateUpdateBusinessRules($id, $dto);

        return DB::transaction(function () use ($id, $dto) {
            // Get current state for event
            $previousDTO = $this->repository->findByIdAsDTO($id);

            if (!$previousDTO) {
                throw new {{Entity}}NotFoundException("{{Entity}} not found: {$id}");
            }

            // Update via repository
            ${{entity}}DTO = $this->repository->updateFromDTO($id, $dto);

            // Dispatch event
            event(new {{Entity}}UpdatedEvent(${{entity}}DTO, $previousDTO, auth()->id()));

            return ${{entity}}DTO;
        });
    }

    /**
     * Delete a {{entity}}
     */
    public function delete(string $id): bool
    {
        // Validate can be deleted
        $this->validateDeleteBusinessRules($id);

        return DB::transaction(function () use ($id) {
            ${{entity}}DTO = $this->repository->findByIdAsDTO($id);

            if (!${{entity}}DTO) {
                throw new {{Entity}}NotFoundException("{{Entity}} not found: {$id}");
            }

            $deleted = $this->repository->deleteById($id);

            if ($deleted) {
                event(new {{Entity}}DeletedEvent(${{entity}}DTO, auth()->id()));
            }

            return $deleted;
        });
    }

    /**
     * Find {{entity}} by ID
     */
    public function findById(string $id): ?{{Entity}}DTO
    {
        return $this->repository->findByIdAsDTO($id);
    }

    /**
     * Find {{entity}} by ID or fail
     */
    public function findByIdOrFail(string $id): {{Entity}}DTO
    {
        ${{entity}}DTO = $this->repository->findByIdAsDTO($id);

        if (!${{entity}}DTO) {
            throw new {{Entity}}NotFoundException("{{Entity}} not found: {$id}");
        }

        return ${{entity}}DTO;
    }

    /**
     * Get model for authorization or relationship operations
     */
    public function findModelById(string $id): ?{{Entity}}
    {
        return $this->repository->findModelById($id);
    }

    /**
     * Find {{entities}} with filtering
     */
    public function findByFilter({{Entity}}FilterDTO $filterDTO): Collection
    {
        return $this->repository->findByFilter($filterDTO);
    }

    /**
     * Validate business rules for create operation
     */
    private function validateCreateBusinessRules(Create{{Entity}}DTO $dto): void
    {
        // Add business rule validations
        // Example:
        // if ($dto->amount < 1) {
        //     throw new {{Entity}}ValidationException('Amount must be positive');
        // }
    }

    /**
     * Validate business rules for update operation
     */
    private function validateUpdateBusinessRules(string $id, Update{{Entity}}DTO $dto): void
    {
        // Add business rule validations
        // Example: Check if {{entity}} can be modified in current state
    }

    /**
     * Validate business rules for delete operation
     */
    private function validateDeleteBusinessRules(string $id): void
    {
        // Add business rule validations
        // Example: Check if {{entity}} has dependent records
    }
}

/*
 * NOTES:
 *
 * 1. Services accept and return DTOs exclusively
 * 2. Use repository for all data access
 * 3. Dispatch events with DTOs, not Eloquent models
 * 4. Wrap multi-step operations in transactions
 * 5. Business logic validation goes here, not in controllers
 * 6. Use findModelById() only when you need Eloquent features
 *    (relationships, authorization context)
 */
