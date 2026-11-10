# Advanced DTO Patterns

## Nested DTOs

```php
class OrderDTO extends Data
{
    public function __construct(
        public readonly string $id,
        public readonly int $total_amount,
        public readonly UserDTO $user,
        /** @var OrderItemDTO[] */
        public readonly array $items,
    ) {}
}
```

## Computed Properties

```php
class OrderDTO extends Data
{
    public function __construct(
        public readonly string $id,
        public readonly int $total_amount,
        public readonly string $currency,
    ) {}

    public function formattedTotal(): string
    {
        return number_format($this->total_amount / 100, 2) . ' ' . $this->currency;
    }
}
```

## Transformations

```php
use Spatie\LaravelData\Attributes\WithTransformer;
use Spatie\LaravelData\Transformers\DateTimeInterfaceTransformer;

class UserDTO extends Data
{
    public function __construct(
        public readonly string $id,

        #[WithTransformer(DateTimeInterfaceTransformer::class, format: 'Y-m-d')]
        public readonly Carbon $created_at,
    ) {}
}
```

## Testing DTOs

```php
use App\DTOs\CreateUserDTO;

describe('CreateUserDTO', function () {
    it('validates required fields', function () {
        expect(fn() => CreateUserDTO::validateAndCreate([]))
            ->toThrow(\Spatie\LaravelData\Exceptions\ValidationException::class);
    });

    it('creates DTO from valid data', function () {
        $dto = CreateUserDTO::validateAndCreate([
            'email' => 'test@example.com',
            'password' => 'password123',
            'name' => 'Test User',
        ]);

        expect($dto->email)->toBe('test@example.com');
        expect($dto->name)->toBe('Test User');
    });

    it('converts to model array', function () {
        $dto = new CreateUserDTO(
            email: 'test@example.com',
            password: 'password123',
            name: 'Test User',
        );

        $array = $dto->toModelArray();
        expect($array)->toHaveKey('email');
        expect($array['status'])->toBe('pending');
    });
});
```