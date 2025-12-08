import Joi from 'joi';

/**
 * Validation Middleware Factory
 * Creates middleware that validates request body/params/query against Joi schema
 */
export const validate = (schema, property = 'body') => {
    return (req, res, next) => {
        const dataToValidate = req[property];
        
        const { error, value } = schema.validate(dataToValidate, {
            abortEarly: false, // Return all errors, not just first one
            stripUnknown: true, // Remove unknown keys
            convert: true // Auto-convert types where possible
        });
        
        if (error) {
            const errorMessages = error.details.map(detail => ({
                field: detail.path.join('.'),
                message: detail.message,
                type: detail.type
            }));
            
            return res.status(400).json({
                error: 'Validation failed',
                details: errorMessages
            });
        }
        
        // Replace with sanitized data
        req[property] = value;
        next();
    };
};

// ==========================================
// Common Validation Schemas
// ==========================================

// Password requirements (can be stricter in production)
const isProduction = process.env.NODE_ENV === 'production';

// User Registration Schema
export const registerSchema = Joi.object({
    name: Joi.string()
        .min(2)
        .max(100)
        .trim()
        .required()
        .messages({
            'string.min': 'الاسم يجب أن يكون على الأقل حرفين',
            'string.max': 'الاسم يجب أن لا يتجاوز 100 حرف',
            'any.required': 'الاسم مطلوب'
        }),
    email: Joi.string()
        .email()
        .lowercase()
        .trim()
        .required()
        .messages({
            'string.email': 'البريد الإلكتروني غير صالح',
            'any.required': 'البريد الإلكتروني مطلوب'
        }),
    password: Joi.string()
        .min(isProduction ? 8 : 6)
        .max(100)
        .required()
        .messages({
            'string.min': `كلمة المرور يجب أن تكون ${isProduction ? 8 : 6} أحرف على الأقل`,
            'any.required': 'كلمة المرور مطلوبة'
        }),
    phone: Joi.string()
        .pattern(/^[0-9+]{10,15}$/)
        .optional()
        .allow(null, '')
        .messages({
            'string.pattern.base': 'رقم الهاتف غير صالح'
        })
});

// User Login Schema
export const loginSchema = Joi.object({
    email: Joi.string()
        .email()
        .lowercase()
        .trim()
        .required()
        .messages({
            'string.email': 'البريد الإلكتروني غير صالح',
            'any.required': 'البريد الإلكتروني مطلوب'
        }),
    password: Joi.string()
        .required()
        .messages({
            'any.required': 'كلمة المرور مطلوبة'
        })
});

// Product Schema
export const productSchema = Joi.object({
    name: Joi.string()
        .min(2)
        .max(200)
        .trim()
        .required()
        .messages({
            'any.required': 'اسم المنتج مطلوب'
        }),
    category: Joi.string()
        .max(100)
        .trim()
        .default('Uncategorized'),
    subcategory: Joi.string()
        .max(100)
        .trim()
        .allow(null, ''),
    description: Joi.string()
        .max(2000)
        .trim()
        .allow(null, ''),
    image: Joi.string()
        .uri()
        .allow(null, ''),
    weight: Joi.string()
        .max(50)
        .allow(null, ''),
    barcode: Joi.string()
        .max(50)
        .allow(null, ''),
    isOrganic: Joi.boolean().default(false),
    isNew: Joi.boolean().default(false)
});

// Order Item Schema
const orderItemSchema = Joi.object({
    id: Joi.alternatives().try(Joi.string(), Joi.number()).required(),
    productId: Joi.alternatives().try(Joi.string(), Joi.number()),
    name: Joi.string().max(200).required(),
    price: Joi.number().min(0).required(),
    quantity: Joi.number().integer().min(1).max(100).required(),
    image: Joi.string().allow(null, ''),
    substitutionPreference: Joi.string()
        .valid('none', 'similar', 'refund', 'contact')
        .default('none')
});

// Order Schema
export const orderSchema = Joi.object({
    userId: Joi.alternatives()
        .try(
            Joi.number().integer().positive(),
            Joi.string().pattern(/^guest-/)
        )
        .required()
        .messages({
            'any.required': 'معرف المستخدم مطلوب'
        }),
    total: Joi.number()
        .positive()
        .max(1000000) // Maximum order value
        .required()
        .messages({
            'number.positive': 'المبلغ الإجمالي يجب أن يكون موجباً',
            'any.required': 'المبلغ الإجمالي مطلوب'
        }),
    items: Joi.array()
        .items(orderItemSchema)
        .min(1)
        .max(50) // Max 50 different products per order
        .required()
        .messages({
            'array.min': 'يجب إضافة منتج واحد على الأقل',
            'any.required': 'عناصر الطلب مطلوبة'
        }),
    branchId: Joi.number()
        .integer()
        .positive()
        .allow(null),
    deliverySlotId: Joi.number()
        .integer()
        .positive()
        .allow(null),
    paymentMethod: Joi.string()
        .valid('cod', 'card', 'wallet', 'installment')
        .default('cod'),
    shippingDetails: Joi.object({
        firstName: Joi.string().max(50),
        lastName: Joi.string().max(50),
        phone: Joi.string().pattern(/^[0-9+]{10,15}$/),
        address: Joi.string().max(500),
        city: Joi.string().max(100),
        area: Joi.string().max(100),
        notes: Joi.string().max(500).allow(null, '')
    }).allow(null),
    deliveryAddress: Joi.string().max(500).allow(null, ''),
    couponId: Joi.number().integer().positive().allow(null),
    couponCode: Joi.string().max(50).allow(null, ''),
    couponDiscount: Joi.number().min(0).max(1000000).allow(null)
});

// Cart Item Schema
export const cartItemSchema = Joi.object({
    productId: Joi.alternatives()
        .try(Joi.string(), Joi.number())
        .required()
        .messages({
            'any.required': 'معرف المنتج مطلوب'
        }),
    quantity: Joi.number()
        .integer()
        .min(1)
        .max(100)
        .default(1)
        .messages({
            'number.min': 'الكمية يجب أن تكون 1 على الأقل',
            'number.max': 'الكمية لا يمكن أن تتجاوز 100'
        }),
    substitutionPreference: Joi.string()
        .valid('none', 'similar', 'refund', 'contact')
        .default('none')
});

// Cart Update Schema
export const cartUpdateSchema = Joi.object({
    productId: Joi.alternatives()
        .try(Joi.string(), Joi.number())
        .required(),
    quantity: Joi.number()
        .integer()
        .min(0) // 0 means remove
        .max(100),
    substitutionPreference: Joi.string()
        .valid('none', 'similar', 'refund', 'contact')
});

// Branch Product Schema (for pricing)
export const branchProductSchema = Joi.object({
    productId: Joi.alternatives()
        .try(Joi.string(), Joi.number())
        .required(),
    branchId: Joi.number()
        .integer()
        .positive()
        .required(),
    price: Joi.number()
        .min(0)
        .max(1000000)
        .required()
        .messages({
            'number.min': 'السعر لا يمكن أن يكون سالباً'
        }),
    discountPrice: Joi.number()
        .min(0)
        .max(Joi.ref('price'))
        .allow(null)
        .messages({
            'number.max': 'سعر الخصم يجب أن يكون أقل من السعر الأصلي'
        }),
    stockQuantity: Joi.number()
        .integer()
        .min(0)
        .default(0)
});

// Coupon Schema
export const couponSchema = Joi.object({
    code: Joi.string()
        .min(3)
        .max(30)
        .uppercase()
        .trim()
        .required(),
    discountType: Joi.string()
        .valid('percentage', 'fixed')
        .required(),
    discountValue: Joi.number()
        .positive()
        .required()
        .when('discountType', {
            is: 'percentage',
            then: Joi.number().max(100)
        }),
    minOrderAmount: Joi.number()
        .min(0)
        .default(0),
    maxDiscount: Joi.number()
        .positive()
        .allow(null),
    usageLimit: Joi.number()
        .integer()
        .positive()
        .allow(null),
    expiresAt: Joi.date()
        .iso()
        .greater('now')
        .allow(null),
    isActive: Joi.boolean()
        .default(true)
});

// Message Schema (Chat)
export const messageSchema = Joi.object({
    conversationId: Joi.number()
        .integer()
        .positive()
        .required(),
    message: Joi.string()
        .min(1)
        .max(2000)
        .trim()
        .required()
        .messages({
            'string.max': 'الرسالة طويلة جداً',
            'any.required': 'الرسالة مطلوبة'
        })
});

// ID Parameter Schema
export const idParamSchema = Joi.object({
    id: Joi.alternatives()
        .try(
            Joi.number().integer().positive(),
            Joi.string().pattern(/^[a-zA-Z0-9_-]+$/)
        )
        .required()
});

// Pagination Query Schema
export const paginationSchema = Joi.object({
    page: Joi.number()
        .integer()
        .min(1)
        .default(1),
    limit: Joi.number()
        .integer()
        .min(1)
        .max(100)
        .default(20),
    sortBy: Joi.string()
        .max(50)
        .default('id'),
    sortOrder: Joi.string()
        .valid('asc', 'desc', 'ASC', 'DESC')
        .default('desc')
});

// Search Query Schema
export const searchSchema = Joi.object({
    q: Joi.string()
        .max(200)
        .trim(),
    category: Joi.string()
        .max(100),
    subcategory: Joi.string()
        .max(100),
    minPrice: Joi.number()
        .min(0),
    maxPrice: Joi.number()
        .min(Joi.ref('minPrice')),
    branchId: Joi.number()
        .integer()
        .positive(),
    isOrganic: Joi.boolean(),
    isNew: Joi.boolean(),
    inStock: Joi.boolean()
}).concat(paginationSchema);

export default {
    validate,
    registerSchema,
    loginSchema,
    productSchema,
    orderSchema,
    cartItemSchema,
    cartUpdateSchema,
    branchProductSchema,
    couponSchema,
    messageSchema,
    idParamSchema,
    paginationSchema,
    searchSchema
};
