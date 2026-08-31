import ApiError from '../utils/ApiError.js';

/**
 * Validates request body/params/query using a Joi schema
 * Usage: validate(schema, 'body' | 'params' | 'query')
 */
export const validate = (schema, source = 'body') =>
    (req, res, next) => {
        const { error, value } = schema.validate(req[source], { abortEarly: false, stripUnknown: true });
        if (error) {
            const errorMessages = error.details
                .map((d) => d.message.replace(/['"]/g, ''))
                .join('; ');
            const errors = error.details.map((d) => ({
                field: d.path.join('.'),
                message: d.message,
            }));
            return next(new ApiError(400, `Validation failed: ${errorMessages}`, errors));
        }
        req[source] = value; // replace with sanitized value
        next();
    };
