import ApiError from '../utils/ApiError.js';
import { ERROR_CODES } from '../constants/errorCodes.js';

// Global error handler — must be last middleware in Express
const errorHandler = (err, req, res, next) => {
    let error = err;
    const requestId = req.requestId || req.headers['x-request-id'] || Math.random().toString(36).substring(2, 10);
    const timestamp = new Date().toISOString();

    // Mongoose duplicate key error (11000)
    if (err.code === 11000) {
        const field = err.keyValue ? Object.keys(err.keyValue)[0] : 'Record';
        const fieldName = field ? field.charAt(0).toUpperCase() + field.slice(1) : 'Field';
        error = new ApiError(409, `${fieldName} already exists.`, ERROR_CODES.DUPLICATE_RESOURCE);
    }
    // Mongoose validation error
    else if (err.name === 'ValidationError') {
        const errors = Object.values(err.errors || {}).map((e) => ({
            field: e.path,
            message: e.message,
        }));
        error = new ApiError(400, 'Please review the highlighted fields and try again.', ERROR_CODES.VALIDATION_ERROR, errors);
    }
    // Mongoose cast error (invalid ObjectId)
    else if (err.name === 'CastError') {
        error = new ApiError(404, 'The requested item was not found.', ERROR_CODES.RESOURCE_NOT_FOUND);
    }
    // JsonWebTokenError / TokenExpiredError
    else if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
        error = new ApiError(401, 'Session expired. Please login again.', ERROR_CODES.INVALID_TOKEN);
    }
    // Wrap generic non-ApiError instances
    else if (!(error instanceof ApiError)) {
        const statusCode = error.statusCode || 500;
        const message = statusCode < 500 ? (error.message || 'Bad Request') : 'Something went wrong on our end. Please try again later.';
        const code = statusCode === 401 ? ERROR_CODES.AUTH_REQUIRED :
                     statusCode === 403 ? ERROR_CODES.PERMISSION_DENIED :
                     statusCode === 404 ? ERROR_CODES.RESOURCE_NOT_FOUND :
                     ERROR_CODES.SERVER_ERROR;

        error = new ApiError(statusCode, message, code, error.errors || [], err.stack);
    }

    // Always log unexpected or 500 server errors to console with requestId for developer debugging
    if (error.statusCode >= 500 || process.env.NODE_ENV === 'development') {
        console.error(`[ReqID: ${requestId}] [${req.method} ${req.originalUrl}]`, err);
    }

    // Standardized Enterprise Response Payload
    const response = {
        success: false,
        code: error.code || ERROR_CODES.SERVER_ERROR,
        message: error.statusCode >= 500 ? 'Something went wrong. Please try again later.' : error.message,
        requestId,
        timestamp,
        ...(error.errors?.length > 0 && { errors: error.errors }),
        ...(process.env.NODE_ENV === 'development' && {
            debug: {
                name: err.name,
                rawMessage: err.message,
                stack: err.stack,
            }
        }),
    };

    res.status(error.statusCode || 500).json(response);
};

export default errorHandler;
