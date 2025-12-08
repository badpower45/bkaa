/**
 * Product Service
 * Handles all product-related business logic
 */
import { query } from '../database.js';

/**
 * Get products with optional filtering and pagination
 */
export const getProducts = async (options = {}) => {
    const {
        page = 1,
        limit = 20,
        category,
        subcategory,
        branchId,
        search,
        isOrganic,
        isNew,
        inStock,
        sortBy = 'name',
        sortOrder = 'asc'
    } = options;

    const offset = (page - 1) * limit;
    const conditions = [];
    const values = [];
    let paramIndex = 1;

    // Build WHERE conditions
    if (category) {
        conditions.push(`p.category = $${paramIndex}`);
        values.push(category);
        paramIndex++;
    }

    if (subcategory) {
        conditions.push(`p.subcategory = $${paramIndex}`);
        values.push(subcategory);
        paramIndex++;
    }

    if (search) {
        conditions.push(`(p.name ILIKE $${paramIndex} OR p.barcode = $${paramIndex + 1})`);
        values.push(`%${search}%`, search);
        paramIndex += 2;
    }

    if (typeof isOrganic === 'boolean') {
        conditions.push(`p.is_organic = $${paramIndex}`);
        values.push(isOrganic);
        paramIndex++;
    }

    if (typeof isNew === 'boolean') {
        conditions.push(`p.is_new = $${paramIndex}`);
        values.push(isNew);
        paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Validate sort column to prevent SQL injection
    const validSortColumns = ['name', 'category', 'price', 'rating', 'created_at'];
    const safeSortBy = validSortColumns.includes(sortBy) ? sortBy : 'name';
    const safeSortOrder = sortOrder.toLowerCase() === 'desc' ? 'DESC' : 'ASC';

    // Base query with branch pricing if branchId provided
    let sql;
    if (branchId) {
        values.push(branchId);
        const branchParam = paramIndex;
        paramIndex++;

        sql = `
            SELECT p.*, 
                   bp.price, bp.discount_price, bp.stock_quantity,
                   COALESCE(bp.stock_quantity, 0) > 0 as in_stock
            FROM products p
            LEFT JOIN branch_products bp ON p.id::text = bp.product_id::text AND bp.branch_id = $${branchParam}
            ${whereClause}
            ${inStock ? 'AND COALESCE(bp.stock_quantity, 0) > 0' : ''}
            ORDER BY ${safeSortBy === 'price' ? 'bp.price' : `p.${safeSortBy}`} ${safeSortOrder}
            LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
        `;
    } else {
        sql = `
            SELECT p.*
            FROM products p
            ${whereClause}
            ORDER BY p.${safeSortBy} ${safeSortOrder}
            LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
        `;
    }

    values.push(limit, offset);

    const { rows } = await query(sql, values);

    // Get total count for pagination
    const countSql = `
        SELECT COUNT(*) as total 
        FROM products p 
        ${branchId ? `LEFT JOIN branch_products bp ON p.id::text = bp.product_id::text AND bp.branch_id = $${conditions.length + 1}` : ''}
        ${whereClause}
    `;
    
    const countValues = branchId ? [...values.slice(0, -2), branchId] : values.slice(0, -2);
    const { rows: countRows } = await query(
        branchId ? countSql : `SELECT COUNT(*) as total FROM products p ${whereClause}`,
        countValues.length > 0 ? countValues : undefined
    );

    const total = parseInt(countRows[0]?.total || 0);

    return {
        products: rows,
        pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit)
        }
    };
};

/**
 * Get single product by ID
 */
export const getProductById = async (productId, branchId = null) => {
    let sql;
    let values;

    if (branchId) {
        sql = `
            SELECT p.*, 
                   bp.price, bp.discount_price, bp.stock_quantity
            FROM products p
            LEFT JOIN branch_products bp ON p.id::text = bp.product_id::text AND bp.branch_id = $2
            WHERE p.id = $1
        `;
        values = [productId, branchId];
    } else {
        sql = 'SELECT * FROM products WHERE id = $1';
        values = [productId];
    }

    const { rows } = await query(sql, values);
    return rows[0] || null;
};

/**
 * Get product by barcode
 */
export const getProductByBarcode = async (barcode, branchId = null) => {
    let sql;
    let values;

    if (branchId) {
        sql = `
            SELECT p.*, 
                   bp.price, bp.discount_price, bp.stock_quantity
            FROM products p
            LEFT JOIN branch_products bp ON p.id::text = bp.product_id::text AND bp.branch_id = $2
            WHERE p.barcode = $1
        `;
        values = [barcode, branchId];
    } else {
        sql = 'SELECT * FROM products WHERE barcode = $1';
        values = [barcode];
    }

    const { rows } = await query(sql, values);
    return rows[0] || null;
};

/**
 * Create a new product
 */
export const createProduct = async (productData) => {
    const {
        id,
        name,
        category = 'Uncategorized',
        subcategory,
        description,
        image,
        weight,
        barcode,
        isOrganic = false,
        isNew = false
    } = productData;

    const productId = id || `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const { rows } = await query(
        `INSERT INTO products (id, name, category, subcategory, description, image, weight, barcode, is_organic, is_new)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [productId, name, category, subcategory, description, image, weight, barcode, isOrganic, isNew]
    );

    return rows[0];
};

/**
 * Update a product
 */
export const updateProduct = async (productId, updates) => {
    const allowedFields = ['name', 'category', 'subcategory', 'description', 'image', 'weight', 'barcode', 'is_organic', 'is_new'];
    
    const setClauses = [];
    const values = [productId];
    let paramIndex = 2;

    for (const [key, value] of Object.entries(updates)) {
        // Convert camelCase to snake_case
        const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
        
        if (allowedFields.includes(snakeKey) && value !== undefined) {
            setClauses.push(`${snakeKey} = $${paramIndex}`);
            values.push(value);
            paramIndex++;
        }
    }

    if (setClauses.length === 0) {
        throw new Error('No valid fields to update');
    }

    const { rows } = await query(
        `UPDATE products SET ${setClauses.join(', ')} WHERE id = $1 RETURNING *`,
        values
    );

    return rows[0];
};

/**
 * Delete a product
 */
export const deleteProduct = async (productId) => {
    const result = await query('DELETE FROM products WHERE id = $1', [productId]);
    return result.rowCount > 0;
};

/**
 * Get all categories
 */
export const getCategories = async () => {
    const { rows } = await query(
        `SELECT DISTINCT category, COUNT(*) as product_count 
         FROM products 
         WHERE category IS NOT NULL 
         GROUP BY category 
         ORDER BY category`
    );
    return rows;
};

/**
 * Get subcategories for a category
 */
export const getSubcategories = async (category) => {
    const { rows } = await query(
        `SELECT DISTINCT subcategory, COUNT(*) as product_count 
         FROM products 
         WHERE category = $1 AND subcategory IS NOT NULL 
         GROUP BY subcategory 
         ORDER BY subcategory`,
        [category]
    );
    return rows;
};

/**
 * Bulk import products
 */
export const bulkImportProducts = async (products) => {
    let successCount = 0;
    let errorCount = 0;
    const errors = [];

    await query('BEGIN');

    try {
        for (const p of products) {
            try {
                if (!p.name) {
                    errorCount++;
                    errors.push({ product: p, error: 'Missing name' });
                    continue;
                }

                const productId = p.id?.toString() || `${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;

                await query(
                    `INSERT INTO products (id, name, category, subcategory, image, weight, is_organic, is_new, barcode)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                     ON CONFLICT (id) DO UPDATE SET
                         name = EXCLUDED.name,
                         category = EXCLUDED.category,
                         subcategory = EXCLUDED.subcategory,
                         image = EXCLUDED.image,
                         weight = EXCLUDED.weight,
                         is_organic = EXCLUDED.is_organic,
                         is_new = EXCLUDED.is_new,
                         barcode = EXCLUDED.barcode`,
                    [
                        productId,
                        p.name,
                        p.category || 'Uncategorized',
                        p.subcategory || null,
                        p.image || '',
                        p.weight || '',
                        p.isOrganic === true || p.isOrganic === 'true' || p.isOrganic === 1,
                        p.isNew === true || p.isNew === 'true' || p.isNew === 1,
                        p.barcode || null
                    ]
                );

                successCount++;
            } catch (err) {
                errorCount++;
                errors.push({ product: p, error: err.message });
            }
        }

        await query('COMMIT');
    } catch (err) {
        await query('ROLLBACK');
        throw err;
    }

    return { successCount, errorCount, errors };
};

export default {
    getProducts,
    getProductById,
    getProductByBarcode,
    createProduct,
    updateProduct,
    deleteProduct,
    getCategories,
    getSubcategories,
    bulkImportProducts
};
