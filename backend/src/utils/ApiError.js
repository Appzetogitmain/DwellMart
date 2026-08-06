import { ERROR_CODES } from '../constants/errorCodes.js';

export class ApiError extends Error {
    constructor(statusCode, message = 'Something went wrong', code = null, errors = [], stack = '') {
        super(message);
        this.statusCode = statusCode;
        this.success = false;

        // Allow passing errors as 3rd arg if code was omitted for backward compatibility
        if (Array.isArray(code)) {
            this.errors = code;
            code = null;
        } else {
            this.errors = errors;
        }

        // If code wasn't passed directly, derive code from status code
        if (!code) {
            if (statusCode === 401) this.code = ERROR_CODES.AUTH_REQUIRED;
            else if (statusCode === 403) this.code = ERROR_CODES.PERMISSION_DENIED;
            else if (statusCode === 404) this.code = ERROR_CODES.RESOURCE_NOT_FOUND;
            else if (statusCode === 409) this.code = ERROR_CODES.DUPLICATE_RESOURCE;
            else if (statusCode === 400) this.code = ERROR_CODES.VALIDATION_ERROR;
            else if (statusCode === 429) this.code = ERROR_CODES.RATE_LIMITED;
            else this.code = ERROR_CODES.SERVER_ERROR;
        } else {
            this.code = code;
        }

        if (stack) {
            this.stack = stack;
        } else {
            Error.captureStackTrace(this, this.constructor);
        }
    }
}

export default ApiError;
