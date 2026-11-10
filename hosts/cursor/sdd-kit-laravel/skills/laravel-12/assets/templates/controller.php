<?php
/**
 * Laravel Controller Template
 *
 * Replace placeholders:
 * - {{Module}} = Module name (e.g., User, Order, Payment)
 * - {{Entity}} = Entity name (e.g., User, Order)
 * - {{entity}} = Entity name lowercase (e.g., user, order)
 * - {{entities}} = Entity name plural lowercase (e.g., users, orders)
 * - {{Action}} = Action name (e.g., Create, Update, Delete, List)
 * - {{HttpMethod}} = HTTP method (e.g., POST, PUT, DELETE, GET)
 * - {{StatusCode}} = HTTP status code (e.g., HTTP_CREATED, HTTP_OK)
 */

declare(strict_types=1);

namespace App\Http\Controllers\{{Module}};

use App\DTOs\{{Action}}{{Entity}}DTO;
use App\Http\Controllers\Controller;
use App\Http\Resources\{{Entity}}Resource;
use App\Http\Traits\JsonResponseTrait;
use App\Models\{{Entity}};
use App\Services\{{Entity}}Service;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * @group {{Entity}} Management
 *
 * APIs for managing {{entities}}
 */
final class {{Action}}{{Entity}}Controller extends Controller
{
    use JsonResponseTrait;

    public function __construct(
        private readonly {{Entity}}Service ${{entity}}Service
    ) {}

    /**
     * {{Action}} {{entity}}
     *
     * {{ActionDescription}}
     *
     * @authenticated
     * @bodyParam field string required Field description. Example: "value"
     *
     * @response {{StatusCode}} {
     *   "success": true,
     *   "status": {{StatusCodeNumber}},
     *   "message": "{{Entity}} {{action}}d successfully",
     *   "data": {
     *     "id": "550e8400-e29b-41d4-a716-446655440000"
     *   }
     * }
     */
    public function __invoke(Request $request): JsonResponse
    {
        // Authorization check
        $this->authorize('{{action}}', {{Entity}}::class);

        try {
            // DTO validation
            $dto = {{Action}}{{Entity}}DTO::validateAndCreate($request->all());

            // Service layer call
            $result = $this->{{entity}}Service->{{action}}($dto);

            // Return response using JsonResponseTrait
            return $this->resource(
                new {{Entity}}Resource($result),
                '{{Entity}} {{action}}d successfully',
                Response::{{StatusCode}}
            );
        } catch (\Illuminate\Validation\ValidationException $e) {
            throw $e; // Let Laravel handle 422 response
        } catch (\App\Exceptions\{{Entity}}Exception $e) {
            return $this->error($e->getMessage(), Response::HTTP_BAD_REQUEST);
        }
    }
}

/*
 * USAGE EXAMPLES:
 *
 * 1. Create Controller:
 *    - {{Action}} = Create
 *    - {{StatusCode}} = HTTP_CREATED
 *    - {{action}} = create
 *
 * 2. Update Controller:
 *    - {{Action}} = Update
 *    - {{StatusCode}} = HTTP_OK
 *    - {{action}} = update
 *    - Add route model binding: __invoke(Request $request, {{Entity}} ${{entity}})
 *
 * 3. Delete Controller:
 *    - {{Action}} = Delete
 *    - {{StatusCode}} = HTTP_NO_CONTENT
 *    - {{action}} = delete
 *    - Add route model binding: __invoke({{Entity}} ${{entity}})
 *
 * 4. List Controller:
 *    - {{Action}} = List
 *    - {{StatusCode}} = HTTP_OK
 *    - Use resourceCollection() instead of resource()
 *    - Use Spatie Query Builder for filtering
 *
 * 5. Show Controller:
 *    - {{Action}} = Show
 *    - {{StatusCode}} = HTTP_OK
 *    - Add route model binding: __invoke({{Entity}} ${{entity}})
 */
