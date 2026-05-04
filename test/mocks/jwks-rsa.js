'use strict';

// CJS mock for jwks-rsa used in Jest unit tests.
// The JWKS endpoint is never called in unit tests — it's an integration concern.
module.exports = {
  passportJwtSecret: jest.fn().mockReturnValue(
    function (_req, _header, done) {
      done(null, 'test-jwks-secret');
    },
  ),
};
