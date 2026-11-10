# Typed API Client

Language-neutral rules for the client a frontend uses to call the API. The stack add-on's skill carries the typed implementation for its language.

## Structure

- One request function owns the base URL, auth header, JSON encoding and timeout; every endpoint helper calls it.
- One response type per endpoint, copied from the API contract, never inferred from a sample payload.
- Endpoint helpers are thin: build the path, pass the typed input, return the typed output.

## Errors

- Normalize failures into one error type carrying the status code, the machine-readable error code and the field errors of a 422.
- Map 401 to the session-expired flow in one place, not in each caller.
- Never swallow a network failure: surface it as the same error type with a `network` code.

## Pagination and lists

- Return the cursor or page metadata together with the items.
- Keep list helpers generic over the item type so every resource shares one implementation.

## Testing

- Mock at the request function, with payloads taken from the API contract.
- A contract change must fail a type check or a contract test before it fails in the browser.
