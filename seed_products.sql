-- Insert sample products into Supabase
-- Run this in Supabase SQL Editor

-- Insert sample products (using 'image' column not 'image_url')
INSERT INTO products (id, name, description, category, image) VALUES
('1', 'تفاح أحمر', 'تفاح طازج عالي الجودة', 'Fruits', 'https://images.unsplash.com/photo-1560806887-1e4cd0b6cbd6?w=400'),
('2', 'موز', 'موز طازج غني بالبوتاسيوم', 'Fruits', 'https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?w=400'),
('3', 'برتقال', 'برتقال طازج مليء بفيتامين C', 'Fruits', 'https://images.unsplash.com/photo-1547514701-42782101795e?w=400'),
('4', 'طماطم', 'طماطم طازجة للطبخ والسلطات', 'Vegetables', 'https://images.unsplash.com/photo-1546470427-e26264d6eaa0?w=400'),
('5', 'خيار', 'خيار طازج ومقرمش', 'Vegetables', 'https://images.unsplash.com/photo-1604977042946-1eecc30f269e?w=400'),
('6', 'جزر', 'جزر طازج غني بفيتامين A', 'Vegetables', 'https://images.unsplash.com/photo-1598170845058-32b9d6a5da37?w=400'),
('7', 'لبن طازج', 'لبن كامل الدسم طازج', 'Dairy', 'https://images.unsplash.com/photo-1563636619-e9143da7973b?w=400'),
('8', 'جبنة شيدر', 'جبنة شيدر طبيعية', 'Dairy', 'https://images.unsplash.com/photo-1618164436241-4473940d1f5c?w=400'),
('9', 'خبز أبيض', 'خبز طازج يومياً', 'Bakery', 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=400'),
('10', 'كرواسون', 'كرواسون فرنسي بالزبدة', 'Bakery', 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=400')
ON CONFLICT (id) DO NOTHING;

-- Insert branch_products for Branch 1 (using TEXT product_id)
INSERT INTO branch_products (branch_id, product_id, price, stock_quantity, is_available, reserved_quantity) VALUES
(1, '1', 15.00, 100, true, 0),
(1, '2', 12.00, 80, true, 0),
(1, '3', 18.00, 90, true, 0),
(1, '4', 10.00, 120, true, 0),
(1, '5', 8.00, 100, true, 0),
(1, '6', 9.00, 70, true, 0),
(1, '7', 25.00, 50, true, 0),
(1, '8', 45.00, 30, true, 0),
(1, '9', 5.00, 200, true, 0),
(1, '10', 12.00, 60, true, 0)
ON CONFLICT (branch_id, product_id) DO UPDATE SET
    price = EXCLUDED.price,
    stock_quantity = EXCLUDED.stock_quantity,
    is_available = EXCLUDED.is_available;

-- Insert branch_products for Branch 2
INSERT INTO branch_products (branch_id, product_id, price, stock_quantity, is_available, reserved_quantity) VALUES
(2, '1', 16.00, 80, true, 0),
(2, '2', 13.00, 70, true, 0),
(2, '3', 19.00, 60, true, 0),
(2, '4', 11.00, 100, true, 0),
(2, '5', 9.00, 90, true, 0),
(2, '6', 10.00, 50, true, 0),
(2, '7', 26.00, 40, true, 0),
(2, '8', 47.00, 25, true, 0),
(2, '9', 6.00, 150, true, 0),
(2, '10', 13.00, 40, true, 0)
ON CONFLICT (branch_id, product_id) DO UPDATE SET
    price = EXCLUDED.price,
    stock_quantity = EXCLUDED.stock_quantity,
    is_available = EXCLUDED.is_available;

-- Verify the data
SELECT COUNT(*) as product_count FROM products;
SELECT COUNT(*) as branch_products_count FROM branch_products;
SELECT p.name, bp.price, bp.stock_quantity, b.name as branch_name
FROM products p
JOIN branch_products bp ON p.id = bp.product_id
JOIN branches b ON bp.branch_id = b.id
ORDER BY b.id, p.name
LIMIT 20;
