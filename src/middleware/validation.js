import Joi from 'joi';

/**
 * Email validation schema
 */
const emailSchema = Joi.string()
  .email()
  .lowercase()
  .trim()
  .max(255)
  .required();

/**
 * Password validation schema
 * - Min 8 chars, max 128
 * - Can contain any characters (user's choice)
 */
const passwordSchema = Joi.string()
  .min(8)
  .max(128)
  .required();

/**
 * Signup validation schema
 */
export const signupSchema = Joi.object({
  email: emailSchema,
  password: passwordSchema,
  firstName: Joi.string()
    .max(100)
    .trim()
    .optional(),
  lastName: Joi.string()
    .max(100)
    .trim()
    .optional(),
  company: Joi.string()
    .max(100)
    .trim()
    .optional(),
});

/**
 * Login validation schema
 */
export const loginSchema = Joi.object({
  email: emailSchema,
  password: Joi.string().required(),
});

/**
 * Email verification schema
 */
export const verifyEmailSchema = Joi.object({
  email: emailSchema,
});

/**
 * Forgot password schema
 */
export const forgotPasswordSchema = Joi.object({
  email: emailSchema,
});

/**
 * Reset password schema
 */
export const resetPasswordSchema = Joi.object({
  token: Joi.string().required(),
  newPassword: passwordSchema,
  confirmPassword: Joi.string()
    .valid(Joi.ref('newPassword'))
    .required(),
});

/**
 * Change password schema (for logged-in users)
 */
export const changePasswordSchema = Joi.object({
  currentPassword: Joi.string().required(),
  newPassword: passwordSchema,
  confirmPassword: Joi.string()
    .valid(Joi.ref('newPassword'))
    .required(),
});

/**
 * File upload validation schema
 */
export const fileUploadSchema = Joi.object({
  fileSize: Joi.number()
    .max(50 * 1024 * 1024) // 50MB max
    .required(),
  fileName: Joi.string()
    .max(255)
    .required(),
  mimeType: Joi.string()
    .valid(
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
      'application/msword', // .doc
    )
    .required(),
});

/**
 * Generic request body validation middleware
 */
export function validateRequest(schema, source = 'body') {
  return (req, res, next) => {
    const data = req[source];
    const { error, value } = schema.validate(data, {
      abortEarly: false, // Return all errors
      stripUnknown: true, // Remove unknown fields
      escapeHtml: true, // HTML-escape values
    });

    if (error) {
      const messages = error.details.map(detail => detail.message);
      console.log(`[VALIDATE] ✗ ${source.toUpperCase()} validation error:`, messages.join('; '));
      return res.status(400).json({
        error: 'Validation failed',
        details: messages,
      });
    }

    // Replace original with sanitized values
    req[source] = value;
    next();
  };
}

/**
 * Validate query parameters
 */
export function validateQuery(schema) {
  return validateRequest(schema, 'query');
}

/**
 * Validate route parameters
 */
export function validateParams(schema) {
  return validateRequest(schema, 'params');
}

/**
 * Email field validation only
 */
export const emailFieldSchema = Joi.object({
  email: emailSchema,
});
