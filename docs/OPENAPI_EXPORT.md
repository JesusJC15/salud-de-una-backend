# Backend OpenAPI Specification Export

## Quick Export

To export the current API specification as OpenAPI JSON:

```bash
# Terminal 1: Start backend with OpenAPI endpoint exposed
NODE_ENV=development npm run start:dev

# Terminal 2: Export the spec (after backend is ready)
curl http://localhost:3000/v1/docs-json > openapi.json

# Or use PowerShell on Windows:
$response = Invoke-WebRequest -Uri "http://localhost:3000/v1/docs-json" -UseBasicParsing
[System.IO.File]::WriteAllText("$PWD/openapi.json", $response.Content)
```

## Automated Export for Frontend

The frontend automatically regenerates API types from the backend's OpenAPI spec on build:

```bash
# Frontend will run this before building:
npm run generate:api-types
```

This reads: `../salud-de-una-backend/openapi.json`

## OpenAPI Configuration

- **Endpoint:** `GET /v1/docs` (Swagger UI)
- **JSON Spec:** `GET /v1/docs-json`
- **Configured in:** `src/main.ts` (lines 181-195)
- **Available:** Only when `NODE_ENV !== 'production'`

## NestJS Swagger Configuration

The OpenAPI specification is built using NestJS Swagger decorators:

```typescript
// main.ts
const swaggerConfig = new DocumentBuilder()
  .setTitle('SaludDeUna API')
  .setDescription('Documentacion OpenAPI de SaludDeUna Backend')
  .setVersion('1.0')
  .addBearerAuth(...)
  .build();
```

## Keeping Spec Updated

### After Adding New Endpoints

1. Add `@Controller()` and endpoint methods with proper decorators
2. Start backend: `NODE_ENV=development npm run start:dev`
3. Verify endpoint appears in `http://localhost:3000/v1/docs`
4. Frontend developers: Run `npm run generate:api-types` in web directory

### Using @nestjs/swagger Decorators

```typescript
import { ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';

@Get(':id')
@ApiOperation({ summary: 'Get item by ID' })
@ApiParam({ name: 'id', description: 'Item ID' })
@ApiResponse({ status: 200, description: 'Item found', type: ItemDto })
async getItem(@Param('id') id: string) {
  // ...
}
```

## Contract Validation

The generated frontend types ensure FE↔BE contract alignment:

```bash
# Frontend validates types on build:
npm run build  # Auto-generates types from backend spec

# Frontend validates no type errors:
npm run check:types
```

## Troubleshooting

### Swagger UI Shows Outdated API?

1. Clear NestJS compilation cache: `rm -rf dist/`
2. Restart backend: `NODE_ENV=development npm run start:dev`
3. Clear browser cache or open in incognito

### Frontend Types Generation Fails?

1. Verify backend is running on port 3000
2. Check `../salud-de-una-backend/openapi.json` exists
3. Validate spec: `npm run generate:api-types` (in frontend dir)

### OpenAPI Spec Missing New Endpoint?

1. Ensure endpoint has NestJS decorators: `@Get()`, `@Post()`, etc.
2. Ensure `DTO` classes have `@nestjs/swagger` decorators if they need documentation
3. Rebuild and restart: `npm run build` then `NODE_ENV=development npm run start:dev`

## Current Export Status

- **File:** `openapi.json` (61 KB)
- **Endpoints:** All v1 API routes included
- **Last Updated:** May 12, 2026
- **Coverage:** Complete with all controllers, DTOs, and response types
