---
name: design-api
description: "Design RESTful API architecture: resources, endpoints, request/response contracts, error format, and optional OpenAPI output, producing an API design document. Use when planning new endpoints or resources before implementation, generating an OpenAPI spec, or reviewing an existing API design for consistency."
argument-hint: "[feature-name] | --resource=[name] | --openapi"
allowed-tools: Read, Write, Edit, Grep, Glob
metadata:
  mcp-tools: "context7"
  version: "1.2"
  subagents: "api-architect"
  last_verified: "2026-10-19"
  next_review: "2027-01-19"
---

# /design-api

Design RESTful API architecture, endpoint structures, and API contracts. Conventions (status codes, the response envelope, error and pagination formats, versioning) come from the `api-design` skill and the project's `docs/api/api-contracts.md`; this skill applies them to a feature and writes the design document. Delegate larger designs to the `api-architect` agent.

## Usage

```bash
# Design API for a feature
/design-api "user management"

# Design resource endpoints
/design-api --resource=Order

# Generate OpenAPI spec
/design-api --openapi UserManagement

# Review existing API design
/design-api --review
```

## Design Process

### Step 1: Resource Identification
Identify resources and their relationships:
```
Resources:
  - User (primary)
  - UserProfile (nested)
  - UserRole (nested)

Relationships:
  - User has one Profile
  - User has many Roles
```

### Step 2: Endpoint Structure

Define RESTful endpoints following consistent URL patterns for a predictable API.
```
# RESTful Resource Endpoints
GET    /api/v1/users           # List users
POST   /api/v1/users           # Create user
GET    /api/v1/users/{id}      # Get single user
PUT    /api/v1/users/{id}      # Update user
DELETE /api/v1/users/{id}      # Delete user

# Nested Resources
GET    /api/v1/users/{id}/profile
PUT    /api/v1/users/{id}/profile

# Actions (non-RESTful operations)
POST   /api/v1/users/{id}/activate
POST   /api/v1/users/{id}/deactivate
```

### Step 3: Request/Response Contracts

Define typed contracts so both API consumers and implementers have a clear interface.

#### Request DTOs
> Framework implementation: see the stack add-on's skill references.

#### Response Resources
> Framework implementation: see the stack add-on's skill references.

### Step 4: Status Codes and Response Shapes
Pick the status code and the success, error, and paginated shapes for each endpoint from the `api-design` skill. If the project already has a contract (`docs/api/api-contracts.md`, an existing `JsonResponseTrait` or resource wrapper), match it exactly; consistency with the existing API beats the default.

### Step 5: Authentication & Authorization
> Framework implementation: see the stack add-on's skill references.

## Output: API Design Document

```markdown
# User Management API Design

## Resources
- User: Core user entity
- Profile: User profile details
- Role: User permissions

## Endpoints

### Users
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | /api/v1/users | List users | Admin |
| POST | /api/v1/users | Create user | Admin |
| GET | /api/v1/users/{id} | Get user | User/Admin |
| PUT | /api/v1/users/{id} | Update user | Owner/Admin |
| DELETE | /api/v1/users/{id} | Delete user | Admin |

### Request/Response Examples
[Examples for each endpoint]

### DTOs Required
- CreateUserDTO
- UpdateUserDTO
- UserFilterDTO

### Resources Required
- UserResource
- UserCollection
```

**Source verification**: follow the `source-verification` skill.

