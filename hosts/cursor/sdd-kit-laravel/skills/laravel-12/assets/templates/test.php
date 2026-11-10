<?php
/**
 * Laravel Pest Test Template
 *
 * Replace placeholders:
 * - {{Entity}} = Entity name (e.g., User, Order)
 * - {{entity}} = Entity name lowercase (e.g., user, order)
 * - {{entities}} = Entity name plural lowercase (e.g., users, orders)
 * - {{endpoint}} = API endpoint (e.g., /api/v1/users)
 */

declare(strict_types=1);

use App\Models\User;
use App\Models\{{Entity}};
use Laravel\Passport\Passport;

// ===========================================================================
// FEATURE TEST - API Endpoints
// ===========================================================================

// tests/Feature/{{Entity}}/{{Entity}}ApiTest.php

beforeEach(function () {
    $this->user = User::factory()->create();
    $this->{{entity}} = {{Entity}}::factory()->create([
        'user_id' => $this->user->id,
    ]);
});

describe('{{Entity}} API', function () {

    describe('List {{entities}}', function () {
        it('returns paginated {{entities}} for authenticated user', function () {
            Passport::actingAs($this->user, ['profile'], 'api');

            {{Entity}}::factory()->count(5)->create(['user_id' => $this->user->id]);

            $response = $this->getJson('{{endpoint}}');

            $response->assertOk()
                ->assertJsonStructure([
                    'success',
                    'status',
                    'message',
                    'data' => [
                        '*' => ['id', 'name', 'status', 'created_at', 'updated_at']
                    ],
                    'meta' => ['current_page', 'last_page', 'per_page', 'total'],
                ]);
        });

        it('requires authentication', function () {
            $response = $this->getJson('{{endpoint}}');

            $response->assertUnauthorized();
        });

        it('filters by status', function () {
            Passport::actingAs($this->user, ['profile'], 'api');

            {{Entity}}::factory()->create(['status' => 'active', 'user_id' => $this->user->id]);
            {{Entity}}::factory()->create(['status' => 'pending', 'user_id' => $this->user->id]);

            $response = $this->getJson('{{endpoint}}?status=active');

            $response->assertOk();
            expect($response->json('data'))->each(
                fn (${{entity}}) => ${{entity}}->status->toBe('active')
            );
        });
    });

    describe('Show {{entity}}', function () {
        it('returns {{entity}} details', function () {
            Passport::actingAs($this->user, ['profile'], 'api');

            $response = $this->getJson("{{endpoint}}/{$this->{{entity}}->id}");

            $response->assertOk()
                ->assertJsonPath('data.id', $this->{{entity}}->id)
                ->assertJsonPath('data.name', $this->{{entity}}->name);
        });

        it('returns 404 for non-existent {{entity}}', function () {
            Passport::actingAs($this->user, ['profile'], 'api');

            $response = $this->getJson('{{endpoint}}/non-existent-id');

            $response->assertNotFound();
        });

        it('returns 403 for unauthorized access', function () {
            $otherUser = User::factory()->create();
            Passport::actingAs($otherUser, ['profile'], 'api');

            $response = $this->getJson("{{endpoint}}/{$this->{{entity}}->id}");

            $response->assertForbidden();
        });
    });

    describe('Create {{entity}}', function () {
        it('creates {{entity}} with valid data', function () {
            Passport::actingAs($this->user, ['profile'], 'api');

            $data = [
                'name' => 'Test {{Entity}}',
                'description' => 'Test description',
            ];

            $response = $this->postJson('{{endpoint}}', $data);

            $response->assertCreated()
                ->assertJsonPath('success', true)
                ->assertJsonPath('data.name', 'Test {{Entity}}');

            expect({{Entity}}::where('name', 'Test {{Entity}}')->exists())->toBeTrue();
        });

        it('validates required fields', function () {
            Passport::actingAs($this->user, ['profile'], 'api');

            $response = $this->postJson('{{endpoint}}', []);

            $response->assertUnprocessable()
                ->assertJsonValidationErrors(['name']);
        });

        it('validates field constraints', function () {
            Passport::actingAs($this->user, ['profile'], 'api');

            $response = $this->postJson('{{endpoint}}', [
                'name' => str_repeat('a', 300), // Exceeds max length
            ]);

            $response->assertUnprocessable()
                ->assertJsonValidationErrors(['name']);
        });
    });

    describe('Update {{entity}}', function () {
        it('updates {{entity}} with valid data', function () {
            Passport::actingAs($this->user, ['profile'], 'api');

            $response = $this->putJson("{{endpoint}}/{$this->{{entity}}->id}", [
                'name' => 'Updated Name',
            ]);

            $response->assertOk()
                ->assertJsonPath('data.name', 'Updated Name');

            expect($this->{{entity}}->fresh()->name)->toBe('Updated Name');
        });

        it('allows partial updates', function () {
            Passport::actingAs($this->user, ['profile'], 'api');

            $originalDescription = $this->{{entity}}->description;

            $response = $this->patchJson("{{endpoint}}/{$this->{{entity}}->id}", [
                'name' => 'New Name',
            ]);

            $response->assertOk();
            expect($this->{{entity}}->fresh()->description)->toBe($originalDescription);
        });
    });

    describe('Delete {{entity}}', function () {
        it('deletes {{entity}}', function () {
            Passport::actingAs($this->user, ['profile'], 'api');

            $response = $this->deleteJson("{{endpoint}}/{$this->{{entity}}->id}");

            $response->assertNoContent();
            expect({{Entity}}::find($this->{{entity}}->id))->toBeNull();
        });

        it('returns 403 for unauthorized deletion', function () {
            $otherUser = User::factory()->create();
            Passport::actingAs($otherUser, ['profile'], 'api');

            $response = $this->deleteJson("{{endpoint}}/{$this->{{entity}}->id}");

            $response->assertForbidden();
        });
    });

});

// ===========================================================================
// UNIT TEST - Service Layer
// ===========================================================================

// tests/Unit/Services/{{Entity}}ServiceTest.php

use App\Contracts\{{Entity}}RepositoryInterface;
use App\DTOs\Create{{Entity}}DTO;
use App\DTOs\{{Entity}}DTO;
use App\Events\{{Entity}}CreatedEvent;
use App\Services\{{Entity}}Service;
use Illuminate\Support\Facades\Event;

describe('{{Entity}}Service', function () {

    beforeEach(function () {
        $this->repository = Mockery::mock({{Entity}}RepositoryInterface::class);
        $this->service = new {{Entity}}Service($this->repository);
    });

    it('creates {{entity}} and dispatches event', function () {
        Event::fake([{{Entity}}CreatedEvent::class]);

        $dto = new Create{{Entity}}DTO(
            name: 'Test {{Entity}}',
            description: 'Test description',
        );

        $expectedDTO = new {{Entity}}DTO(
            id: 'test-uuid',
            name: 'Test {{Entity}}',
            description: 'Test description',
            status: 'pending',
            metadata: null,
            created_at: now(),
            updated_at: now(),
        );

        $this->repository->shouldReceive('createFromDTO')
            ->once()
            ->with($dto)
            ->andReturn($expectedDTO);

        $result = $this->service->create($dto);

        expect($result)->toBeInstanceOf({{Entity}}DTO::class);
        expect($result->name)->toBe('Test {{Entity}}');

        Event::assertDispatched({{Entity}}CreatedEvent::class, function ($event) {
            return $event->{{entity}}DTO->name === 'Test {{Entity}}';
        });
    });

    it('throws exception for invalid business rules', function () {
        $dto = new Create{{Entity}}DTO(
            name: '', // Invalid name
        );

        expect(fn() => $this->service->create($dto))
            ->toThrow(\App\Exceptions\{{Entity}}ValidationException::class);
    });

});

// ===========================================================================
// UNIT TEST - DTO Validation
// ===========================================================================

// tests/Unit/DTOs/{{Entity}}DTOTest.php

use App\DTOs\Create{{Entity}}DTO;
use Illuminate\Validation\ValidationException;

describe('Create{{Entity}}DTO', function () {

    it('validates required fields', function () {
        expect(fn() => Create{{Entity}}DTO::validateAndCreate([]))
            ->toThrow(ValidationException::class);
    });

    it('accepts valid data', function () {
        $dto = Create{{Entity}}DTO::validateAndCreate([
            'name' => 'Valid Name',
            'description' => 'Valid description',
        ]);

        expect($dto->name)->toBe('Valid Name');
        expect($dto->description)->toBe('Valid description');
    });

    it('converts to model array', function () {
        $dto = new Create{{Entity}}DTO(
            name: 'Test',
            description: 'Description',
        );

        $array = $dto->toModelArray();

        expect($array)->toHaveKey('name');
        expect($array)->toHaveKey('status');
        expect($array['status'])->toBe('pending');
    });

});

/*
 * TEST STRUCTURE NOTES:
 *
 * 1. Feature Tests (tests/Feature/)
 *    - Test full HTTP request/response cycle
 *    - Test authentication and authorization
 *    - Test validation responses
 *    - Use Passport::actingAs() for auth
 *
 * 2. Unit Tests (tests/Unit/)
 *    - Test service business logic in isolation
 *    - Mock repository dependencies
 *    - Test DTO validation rules
 *    - Test event dispatching
 *
 * 3. Test Organization
 *    - Use describe() blocks for grouping
 *    - Use it() for individual test cases
 *    - Use beforeEach() for setup
 *    - Use expect() for assertions
 *
 * 4. Database
 *    - Use RefreshDatabase trait (in Pest.php)
 *    - Use factories for test data
 *    - Use DatabaseTransactions for speed
 */
