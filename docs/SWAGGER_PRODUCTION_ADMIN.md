# Swagger Documentation - Production Admin Access

## Overview

Swagger documentation is now available in **both development and production environments**, with admin-only access in production.

## Access Swagger in Development

```bash
NODE_ENV=development npm run start:dev
# → Access at http://localhost:3000/v1/docs (no authentication required)
```

## Access Swagger in Production

Swagger documentation is protected by an **admin-only middleware** that validates JWT tokens.

### Requirements

1. Valid JWT token with `ADMIN` role
2. Include token in `Authorization` header as Bearer token

### Example Using cURL

```bash
curl -H "Authorization: Bearer <ADMIN_JWT_TOKEN>" \
  https://api.saluddeuna.com/v1/docs
```

### Example Using Browser (Chrome DevTools)

1. Open DevTools Console
2. Get your ADMIN token from localStorage/sessionStorage
3. Navigate to: `https://api.saluddeuna.com/v1/docs?token=<YOUR_TOKEN>`
   - Or manually add header in Network tab for subsequent requests

### Example Using Swagger UI (In Production)

1. Open `https://api.saluddeuna.com/v1/docs`
2. Get error: `401 Unauthorized`
3. Swagger UI has an "Authorize" button (🔓)
4. Click it and enter: `<YOUR_ADMIN_JWT_TOKEN>`
5. All subsequent requests will include the token

### Example Using Node.js

```javascript
const token = 'your-admin-jwt-token';
const response = await fetch('https://api.saluddeuna.com/v1/docs-json', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});
const spec = await response.json();
```

## How It Works

### Development (NODE_ENV !== 'production')

- Swagger UI is publicly accessible
- No authentication required
- Available at `/v1/docs` and `/v1/docs-json`

### Production (NODE_ENV === 'production')

- Swagger UI requires ADMIN role JWT token
- Middleware: `AdminDocsMiddleware` validates on every request
- Returns:
  - ✅ `200 OK` if token is valid and role is ADMIN
  - ❌ `401 Unauthorized` if token is missing or invalid
  - ❌ `403 Forbidden` if token is valid but role is not ADMIN

### Token Validation Flow

```flow
Request → /v1/docs-json
   ↓
Check Authorization header
   ↓
Extract Bearer token
   ↓
Verify JWT signature (using configured secret)
   ↓
Check decoded.role === 'ADMIN'
   ↓
✅ Proceed or ❌ Return error
```

## Configuration

### When Does Middleware Apply?

Edit `src/app.module.ts` `configure()` method:

```typescript
configure(consumer: MiddlewareConsumer): void {
  const nodeEnv = this.configService.get<string>('NODE_ENV');
  if (nodeEnv === 'production') {
    // Only in production
    consumer.apply(AdminDocsMiddleware).forRoutes('v1/docs', 'v1/docs-json');
  }
}
```

### Protected Routes

- `GET /v1/docs` - Swagger UI HTML
- `GET /v1/docs-json` - OpenAPI specification JSON

## Error Responses

### Missing Authorization Header

```json
{
  "statusCode": 401,
  "message": "Missing authorization header. Use: Authorization: Bearer <token>",
  "error": "Unauthorized"
}
```

### Invalid or Expired Token

```json
{
  "statusCode": 401,
  "message": "Invalid or expired token: jwt expired",
  "error": "Unauthorized"
}
```

### Non-Admin User Attempting Access

```json
{
  "statusCode": 403,
  "message": "Only ADMIN users can access API documentation. Your role: DOCTOR",
  "error": "Forbidden"
}
```

## Security Best Practices

1. **Never Share Tokens**: Keep your JWT tokens secure
2. **Use HTTPS**: Always use HTTPS in production
3. **Short Token Lifetime**: Configure JWT expiration (typically 15-60 minutes)
4. **Refresh Tokens**: Use refresh tokens for long-lived sessions
5. **Audit Logging**: Monitor who accesses documentation (correlation_id included in logs)
6. **Rate Limiting**: Already enabled globally: 20 req/60s per client

## Testing the Middleware

### Test in Development (No Middleware)

```bash
NODE_ENV=development npm run start:dev
curl http://localhost:3000/v1/docs
# → 200 OK (no auth required)
```

### Test in Production (With Middleware)

```bash
NODE_ENV=production npm run start:prod

# Without token
curl http://localhost:3000/v1/docs
# → 401 Unauthorized

# With invalid token
curl -H "Authorization: Bearer invalid-token" http://localhost:3000/v1/docs
# → 401 Unauthorized (jwt malformed)

# With admin token
curl -H "Authorization: Bearer $ADMIN_TOKEN" http://localhost:3000/v1/docs
# → 200 OK (documentation accessible)

# With non-admin token
curl -H "Authorization: Bearer $DOCTOR_TOKEN" http://localhost:3000/v1/docs
# → 403 Forbidden (insufficient privileges)
```

## Files Modified

- `src/main.ts` - Removed NODE_ENV check, now always configures Swagger
- `src/app.module.ts` - Added middleware configuration in `configure()` method, made AppModule implement NestModule
- `src/auth/auth.module.ts` - Exported JwtModule to make JwtService available globally
- `src/common/middleware/admin-docs.middleware.ts` - New middleware for admin validation

## Logging

When admins access Swagger in production, logs show:

```json
{
  "timestamp": "2026-05-12T04:15:30.123Z",
  "level": "info",
  "context": "RequestLoggingInterceptor",
  "endpoint_or_event": "GET /v1/docs",
  "correlation_id": "xyz-123",
  "user_id": "admin-uuid",
  "role": "ADMIN",
  "latency_ms": 45,
  "status_code": 200
}
```

## Troubleshooting

### Swagger Returns 401 in Development

**Cause**: NODE_ENV is set to 'production'
**Solution**: Set NODE_ENV=development before starting

### Swagger Returns 403 with Valid Token

**Cause**: Your token doesn't have ADMIN role
**Solution**: Use a token for an admin user

### Middleware Not Applied in Production

**Cause**: Check if NODE_ENV is actually 'production'
**Solution**: Verify with `echo $NODE_ENV` or in logs

## Future Enhancements

- [ ] API key authentication as alternative to JWT
- [ ] Rate limiting for docs endpoints (currently global 20 req/60s)
- [ ] Request logging dashboard for docs access audit
- [ ] Export docs as PDF for offline access
