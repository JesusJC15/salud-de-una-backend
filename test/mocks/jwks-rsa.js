'use strict';

// CJS mock for jwks-rsa — used in both unit and E2E jest configs.
// jwks-rsa pulls in jose (ESM-only in v5+) which Jest cannot parse in CJS mode.
// Since tests use legacy HS256 tokens, the JWKS endpoint is never hit at runtime.

const JwksClient = jest.fn().mockImplementation(() => ({
  getSigningKey: jest.fn().mockResolvedValue({
    getPublicKey: () => 'mock-public-key-e2e',
  }),
}));

module.exports = {
  JwksClient,
  passportJwtSecret: jest.fn().mockReturnValue(
    function (_req, _header, done) {
      done(null, 'test-jwks-secret');
    },
  ),
};
