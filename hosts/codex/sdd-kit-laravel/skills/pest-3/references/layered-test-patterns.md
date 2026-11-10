# Layered Test Patterns (DTO-First, Service-Repository)

Reference Pest tests for each architectural layer: feature (HTTP endpoint), unit (service with mocked repository), repository (DTO conversion), and policy authorization.

## Pattern 1: Feature Test (API Endpoint)
```php
<?php

declare(strict_types=1);

use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Passport\Passport;
use App\Models\User;
use App\Domain\DTOs\TransferDTO;
use App\Models\Wallet;
use Symfony\Component\HttpFoundation\Response;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->user = User::factory()->create();
    $this->recipientUser = User::factory()->create();

    $this->senderWallet = Wallet::factory()->create([
        'owner_id' => $this->user->id,
        'owner_type' => 'user',
    ]);

    $this->recipientWallet = Wallet::factory()->create([
        'owner_id' => $this->recipientUser->id,
        'owner_type' => 'user',
    ]);
});

describe('Wallet Transfer API - DTO-First Pattern', function () {

    it('transfers funds between users with DTO validation', function () {
        Passport::actingAs($this->user, [], 'api');

        $transferData = [
            'recipient_email' => $this->recipientUser->email,
            'amount' => 1000,
            'note' => 'Test transfer',
        ];

        $response = $this->postJson('/api/v1/wallet/transfer', $transferData);

        $response->assertStatus(Response::HTTP_OK)
            ->assertJsonStructure([
                'success',
                'status',
                'message',
                'data' => [
                    'transaction_id',
                    'amount',
                    'sender_wallet_id',
                    'recipient_wallet_id',
                    'created_at',
                ],
            ])
            ->assertJson([
                'success' => true,
                'message' => 'Transfer completed successfully',
            ]);

        $this->assertDatabaseHas('wallet_transactions', [
            'sender_wallet_id' => $this->senderWallet->id,
            'recipient_wallet_id' => $this->recipientWallet->id,
            'amount' => 1000,
            'type' => 'transfer',
        ]);
    });

    it('validates insufficient balance', function () {
        Passport::actingAs($this->user, [], 'api');

        $response = $this->postJson('/api/v1/wallet/transfer', [
            'recipient_email' => $this->recipientUser->email,
            'amount' => 999999999,
            'note' => 'Invalid transfer',
        ]);

        $response->assertStatus(Response::HTTP_BAD_REQUEST)
            ->assertJson(['success' => false]);
    });

    it('requires authentication', function () {
        $response = $this->postJson('/api/v1/wallet/transfer', [
            'recipient_email' => $this->recipientUser->email,
            'amount' => 1000,
        ]);

        $response->assertStatus(Response::HTTP_UNAUTHORIZED);
    });

    it('validates DTO constraints', function () {
        Passport::actingAs($this->user, [], 'api');

        $response = $this->postJson('/api/v1/wallet/transfer', [
            'recipient_email' => 'invalid-email',
            'amount' => -100,
        ]);

        $response->assertStatus(Response::HTTP_UNPROCESSABLE_ENTITY)
            ->assertJsonValidationErrors(['recipient_email', 'amount']);
    });
});
```

## Pattern 2: Unit Test (Service Layer)
```php
<?php

declare(strict_types=1);

use App\Domain\DTOs\TransferDTO;
use App\Domain\Services\WalletTransferService;
use App\Domain\Repositories\WalletRepositoryInterface;
use App\Domain\Exceptions\InsufficientBalanceException;

beforeEach(function () {
    $this->walletRepository = Mockery::mock(WalletRepositoryInterface::class);
    $this->transferService = new WalletTransferService($this->walletRepository);
});

describe('WalletTransferService - DTO Business Logic', function () {

    it('processes transfer with DTO validation', function () {
        $transferDTO = new TransferDTO(
            sender_wallet_id: 'sender-uuid',
            recipient_wallet_id: 'recipient-uuid',
            amount: 5000,
            note: 'Service test'
        );

        $this->walletRepository
            ->shouldReceive('findByIdAsDTO')
            ->andReturn(/* wallet DTOs */);

        $this->walletRepository
            ->shouldReceive('createTransaction')
            ->andReturn(/* transaction DTO */);

        $result = $this->transferService->transfer($transferDTO);

        expect($result)->toBeInstanceOf(TransactionDTO::class);
        expect($result->amount)->toBe(5000);
    });

    it('enforces business rule: no negative amounts', function () {
        $invalidDTO = new TransferDTO(
            sender_wallet_id: 'sender-uuid',
            recipient_wallet_id: 'recipient-uuid',
            amount: -100,
            note: 'Invalid'
        );

        expect(fn() => $this->transferService->transfer($invalidDTO))
            ->toThrow(ValidationException::class);
    });

    it('enforces business rule: sufficient balance required', function () {
        $transferDTO = new TransferDTO(
            sender_wallet_id: 'sender-uuid',
            recipient_wallet_id: 'recipient-uuid',
            amount: 999999,
            note: 'Too much'
        );

        $this->walletRepository
            ->shouldReceive('getBalance')
            ->andReturn(1000);

        expect(fn() => $this->transferService->transfer($transferDTO))
            ->toThrow(InsufficientBalanceException::class);
    });
});
```

## Pattern 3: Repository Test (DTO Conversion)
```php
<?php

declare(strict_types=1);

use Illuminate\Foundation\Testing\RefreshDatabase;
use App\Domain\DTOs\ClientDTO;
use App\Domain\DTOs\CreateClientDTO;
use App\Infrastructure\Repositories\EloquentClientRepository;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->repository = new EloquentClientRepository();
});

describe('EloquentClientRepository - DTO-First Pattern', function () {

    it('creates client from DTO and returns DTO', function () {
        $createDTO = new CreateClientDTO(
            name: 'Test Client',
            redirect: 'https://example.com/callback',
            owner_id: User::factory()->create()->id,
            owner_type: 'user'
        );

        $resultDTO = $this->repository->createFromDTO($createDTO);

        expect($resultDTO)->toBeInstanceOf(ClientDTO::class);
        expect($resultDTO->name)->toBe('Test Client');
        expect($resultDTO->id)->toBeString();

        $this->assertDatabaseHas('oauth_clients', [
            'name' => 'Test Client',
            'redirect' => 'https://example.com/callback',
        ]);
    });

    it('finds by ID and returns DTO', function () {
        $client = Client::factory()->create();

        $resultDTO = $this->repository->findByIdAsDTO($client->id);

        expect($resultDTO)->toBeInstanceOf(ClientDTO::class);
        expect($resultDTO->id)->toBe($client->id);
    });

    it('returns null for non-existent client', function () {
        $resultDTO = $this->repository->findByIdAsDTO('non-existent-uuid');

        expect($resultDTO)->toBeNull();
    });
});
```

## Pattern 4: Authorization Test (Policy)
```php
<?php

declare(strict_types=1);

use App\Models\Client;
use App\Policies\ClientPolicy;
use App\Models\User;
use Spatie\Permission\Models\Permission;

beforeEach(function () {
    $this->policy = new ClientPolicy();
    $this->user = User::factory()->create();
    Permission::firstOrCreate(['name' => 'client.view-all', 'guard_name' => 'api']);
});

describe('ClientPolicy - Authorization Rules', function () {

    it('allows viewing own client', function () {
        $client = Client::factory()->create([
            'owner_id' => $this->user->id,
            'owner_type' => 'user',
        ]);

        expect($this->policy->view($this->user, $client))->toBeTrue();
    });

    it('denies viewing other users client', function () {
        $otherUser = User::factory()->create();
        $client = Client::factory()->create([
            'owner_id' => $otherUser->id,
            'owner_type' => 'user',
        ]);

        expect($this->policy->view($this->user, $client))->toBeFalse();
    });

    it('allows viewing any client with permission', function () {
        $this->user->givePermissionTo('client.view-all');
        $otherClient = Client::factory()->create();

        expect($this->policy->view($this->user, $otherClient))->toBeTrue();
    });
});
```
