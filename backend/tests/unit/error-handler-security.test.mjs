import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import errorHandler from '../../src/middlewares/errorHandler.js';
import ApiError from '../../src/utils/ApiError.js';
import { ERROR_CODES } from '../../src/constants/errorCodes.js';

// Helper to simulate Express request/response cycle through errorHandler
const runErrorHandler = (err, { env = 'development', method = 'GET', url = '/api/test', headers = {} } = {}) => {
  const originalEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = env;

  const req = {
    method,
    originalUrl: url,
    headers,
  };

  let statusCode = 200;
  let responseBody = null;

  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(payload) {
      responseBody = payload;
      return this;
    },
  };

  try {
    errorHandler(err, req, res, () => {});
    return { statusCode, responseBody, serialized: JSON.stringify(responseBody) };
  } finally {
    process.env.NODE_ENV = originalEnv;
  }
};

describe('Phase 14 — P2-SEC-03 Error Handler Security & Stack Leak Prevention', () => {

  describe('1. Development Environment 500 Errors (Leak Elimination)', () => {
    const sensitiveError = new Error('Connection failed to mongodb+srv://admin:pass@cluster0.fg2wgjg.mongodb.net:27017/dwellmart');
    sensitiveError.name = 'MongoNetworkError';
    sensitiveError.stack = `MongoNetworkError: Connection failed to mongodb+srv://admin:pass@cluster0.fg2wgjg.mongodb.net:27017/dwellmart
    at connectToCluster (C:\\Users\\RCom\\Desktop\\AppZeto\\DWELL\\DwellMart\\backend\\src\\config\\db.js:42:15)
    at Object.connectDB (/home/ubuntu/app/backend/src/server.js:29:11)
    at node:internal/process/task_queues:95:5`;

    test('HTTP status is 500 with standard safe generic error message', () => {
      const { statusCode, responseBody } = runErrorHandler(sensitiveError, { env: 'development' });
      assert.equal(statusCode, 500);
      assert.equal(responseBody.success, false);
      assert.equal(responseBody.code, ERROR_CODES.SERVER_ERROR);
      assert.equal(responseBody.message, 'Something went wrong. Please try again later.');
    });

    test('debug object and stack property are completely absent', () => {
      const { responseBody } = runErrorHandler(sensitiveError, { env: 'development' });
      assert.equal(responseBody.debug, undefined, 'debug property must be undefined');
      assert.equal(responseBody.stack, undefined, 'stack property must be undefined');
    });

    test('serialized response contains no stack trace traces, filenames, or line numbers', () => {
      const { serialized } = runErrorHandler(sensitiveError, { env: 'development' });
      assert.doesNotMatch(serialized, /at connectToCluster/, 'Function names must not be leaked');
      assert.doesNotMatch(serialized, /db\.js:\d+:\d+/, 'Source file and line numbers must not be leaked');
      assert.doesNotMatch(serialized, /node:internal/, 'Runtime internals must not be leaked');
    });

    test('serialized response contains no Windows or Unix absolute filesystem paths', () => {
      const { serialized } = runErrorHandler(sensitiveError, { env: 'development' });
      assert.doesNotMatch(serialized, /[A-Za-z]:\\Users\\/i, 'Windows user directories must not be leaked');
      assert.doesNotMatch(serialized, /[A-Za-z]:\\.*\\backend\\/i, 'Windows backend paths must not be leaked');
      assert.doesNotMatch(serialized, /\/home\/[a-zA-Z0-9_-]+\//, 'Unix home directories must not be leaked');
      assert.doesNotMatch(serialized, /\/app\/backend\//, 'Unix app paths must not be leaked');
    });

    test('serialized response contains no database connection strings, credentials, or hostnames', () => {
      const { serialized } = runErrorHandler(sensitiveError, { env: 'development' });
      assert.doesNotMatch(serialized, /mongodb(?:\+srv)?:\/\//, 'MongoDB connection scheme must not be leaked');
      assert.doesNotMatch(serialized, /cluster0[a-zA-Z0-9._-]*/, 'Cluster hostname must not be leaked');
      assert.doesNotMatch(serialized, /admin:pass/, 'Database credentials must not be leaked');
      assert.doesNotMatch(serialized, /192\.168\.\d+\.\d+/, 'Internal IP addresses must not be leaked');
    });

    test('requestId and timestamp are preserved for request correlation', () => {
      const { responseBody } = runErrorHandler(sensitiveError, { env: 'development', headers: { 'x-request-id': 'req-dev-123' } });
      assert.equal(responseBody.requestId, 'req-dev-123');
      assert.ok(typeof responseBody.timestamp === 'string');
      assert.ok(!isNaN(Date.parse(responseBody.timestamp)));
    });
  });

  describe('2. Production Environment 500 Errors', () => {
    const prodError = new Error('Fatal unhandled crash in checkout pipeline at /var/www/DwellMart/checkout.service.js:88');
    prodError.name = 'FatalServiceCrash';
    prodError.stack = 'FatalServiceCrash: Fatal unhandled crash ... at line 88';

    test('HTTP status is 500 with generic message and no debug payload', () => {
      const { statusCode, responseBody } = runErrorHandler(prodError, { env: 'production' });
      assert.equal(statusCode, 500);
      assert.equal(responseBody.success, false);
      assert.equal(responseBody.code, ERROR_CODES.SERVER_ERROR);
      assert.equal(responseBody.message, 'Something went wrong. Please try again later.');
      assert.equal(responseBody.debug, undefined);
      assert.equal(responseBody.stack, undefined);
    });

    test('serialized response contains zero technical leak patterns', () => {
      const { serialized } = runErrorHandler(prodError, { env: 'production' });
      assert.doesNotMatch(serialized, /FatalServiceCrash/);
      assert.doesNotMatch(serialized, /\/var\/www\//);
      assert.doesNotMatch(serialized, /checkout\.service\.js/);
    });

    test('requestId and timestamp remain present in production', () => {
      const { responseBody } = runErrorHandler(prodError, { env: 'production' });
      assert.ok(typeof responseBody.requestId === 'string' && responseBody.requestId.length > 0);
      assert.ok(typeof responseBody.timestamp === 'string');
    });
  });

  describe('3. Client-Facing Expected 4xx & Business Errors Intact', () => {
    test('404 Not Found returns 404 with clean message and no stack', () => {
      const notFoundErr = new ApiError(404, 'Route not found: /api/unknown-endpoint', ERROR_CODES.RESOURCE_NOT_FOUND);
      const { statusCode, responseBody, serialized } = runErrorHandler(notFoundErr, { env: 'development' });

      assert.equal(statusCode, 404);
      assert.equal(responseBody.success, false);
      assert.equal(responseBody.code, ERROR_CODES.RESOURCE_NOT_FOUND);
      assert.equal(responseBody.message, 'Route not found: /api/unknown-endpoint');
      assert.equal(responseBody.debug, undefined);
      assert.doesNotMatch(serialized, /at notFound/);
    });

    test('400 Validation Error preserves field-level errors array and clean message', () => {
      const validationErr = {
        name: 'ValidationError',
        errors: {
          email: { path: 'email', message: 'Valid email is required.' },
          password: { path: 'password', message: 'Password must be at least 8 characters.' },
        },
      };

      const { statusCode, responseBody, serialized } = runErrorHandler(validationErr, { env: 'development' });

      assert.equal(statusCode, 400);
      assert.equal(responseBody.success, false);
      assert.equal(responseBody.code, ERROR_CODES.VALIDATION_ERROR);
      assert.equal(responseBody.message, 'Please review the highlighted fields and try again.');
      assert.ok(Array.isArray(responseBody.errors));
      assert.equal(responseBody.errors.length, 2);
      assert.deepEqual(responseBody.errors[0], { field: 'email', message: 'Valid email is required.' });
      assert.deepEqual(responseBody.errors[1], { field: 'password', message: 'Password must be at least 8 characters.' });
      assert.equal(responseBody.debug, undefined);
      assert.doesNotMatch(serialized, /stack/i);
    });

    test('409 Duplicate Key error preserves field name and DUPLICATE_RESOURCE code', () => {
      const duplicateErr = {
        code: 11000,
        keyValue: { slug: 'organic-cotton-tshirt' },
      };

      const { statusCode, responseBody } = runErrorHandler(duplicateErr, { env: 'development' });

      assert.equal(statusCode, 409);
      assert.equal(responseBody.success, false);
      assert.equal(responseBody.code, ERROR_CODES.DUPLICATE_RESOURCE);
      assert.equal(responseBody.message, 'Slug already exists.');
      assert.equal(responseBody.debug, undefined);
    });

    test('401 Authentication Error preserves Session Expired message and INVALID_TOKEN code', () => {
      const jwtErr = { name: 'JsonWebTokenError', message: 'jwt malformed' };

      const { statusCode, responseBody } = runErrorHandler(jwtErr, { env: 'development' });

      assert.equal(statusCode, 401);
      assert.equal(responseBody.success, false);
      assert.equal(responseBody.code, ERROR_CODES.INVALID_TOKEN);
      assert.equal(responseBody.message, 'Session expired. Please login again.');
      assert.equal(responseBody.debug, undefined);
    });

    test('403 Authorization Error preserves PERMISSION_DENIED and status 403', () => {
      const authzErr = new ApiError(403, 'Permission denied. Superadmin access required.', ERROR_CODES.PERMISSION_DENIED);

      const { statusCode, responseBody } = runErrorHandler(authzErr, { env: 'development' });

      assert.equal(statusCode, 403);
      assert.equal(responseBody.success, false);
      assert.equal(responseBody.code, ERROR_CODES.PERMISSION_DENIED);
      assert.equal(responseBody.message, 'Permission denied. Superadmin access required.');
      assert.equal(responseBody.debug, undefined);
    });

    test('404 Mongoose CastError preserves RESOURCE_NOT_FOUND code and user message', () => {
      const castErr = { name: 'CastError', path: '_id', value: 'invalid-id' };

      const { statusCode, responseBody } = runErrorHandler(castErr, { env: 'development' });

      assert.equal(statusCode, 404);
      assert.equal(responseBody.success, false);
      assert.equal(responseBody.code, ERROR_CODES.RESOURCE_NOT_FOUND);
      assert.equal(responseBody.message, 'The requested item was not found.');
      assert.equal(responseBody.debug, undefined);
    });
  });

  describe('4. Server-Side Logging & Diagnostics Preservation', () => {
    let originalConsoleError;
    let loggedMessages = [];

    beforeEach(() => {
      originalConsoleError = console.error;
      loggedMessages = [];
      console.error = (...args) => {
        loggedMessages.push(args);
      };
    });

    afterEach(() => {
      console.error = originalConsoleError;
    });

    test('server-side console.error receives requestId, method, url, and full error object with stack', () => {
      const testErr = new Error('Simulated crash for log audit');
      testErr.stack = 'Error: Simulated crash for log audit\n    at testMethod (/src/test.js:10:5)';

      const { responseBody } = runErrorHandler(testErr, {
        env: 'development',
        method: 'POST',
        url: '/api/v1/orders/checkout',
        headers: { 'x-request-id': 'req-audit-999' },
      });

      // Assert server received the log
      assert.ok(loggedMessages.length > 0, 'Server must have logged the error to console.error');
      const [prefix, errorArg] = loggedMessages[0];

      // Prefix contains requestId, method, url
      assert.ok(prefix.includes('[ReqID: req-audit-999]'), 'Log prefix must include requestId');
      assert.ok(prefix.includes('[POST /api/v1/orders/checkout]'), 'Log prefix must include HTTP method and path');

      // Second arg is the real error object with stack trace intact on the server
      assert.equal(errorArg, testErr, 'Server log must receive the original error object');
      assert.ok(errorArg.stack.includes('at testMethod'), 'Server log retains full stack trace');

      // Meanwhile, the client HTTP response is completely clean
      assert.equal(responseBody.debug, undefined);
      assert.equal(responseBody.stack, undefined);
      assert.equal(responseBody.message, 'Something went wrong. Please try again later.');
    });

    test('production 500 errors also log full error with requestId to console.error', () => {
      const prodErr = new Error('Production server-side exception');
      prodErr.stack = 'Error: Production server-side exception\n    at prodMethod (/src/prod.js:20:5)';

      const { responseBody } = runErrorHandler(prodErr, {
        env: 'production',
        method: 'GET',
        url: '/api/products',
        headers: { 'x-request-id': 'req-prod-777' },
      });

      assert.ok(loggedMessages.length > 0);
      const [prefix, errorArg] = loggedMessages[0];
      assert.ok(prefix.includes('[ReqID: req-prod-777]'));
      assert.ok(errorArg.stack.includes('at prodMethod'));
      assert.equal(responseBody.debug, undefined);
    });
  });
});
