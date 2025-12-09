-- Add banner_image column to categories table
ALTER TABLE categories ADD COLUMN IF NOT EXISTS banner_image TEXT;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS banner_title VARCHAR(200);
ALTER TABLE categories ADD COLUMN IF NOT EXISTS banner_subtitle VARCHAR(200);

-- Add some sample banners for existing categories
UPDATE categories SET 
    banner_image = 'https://images.unsplash.com/photo-1596755389378-c31d21fd1273?w=800',
    banner_title = 'مستحضرات التجميل',
    banner_subtitle = 'منتجات العناية بالبشرة'
WHERE name ILIKE '%cosmetic%';

UPDATE categories SET 
    banner_image = 'https://images.unsplash.com/photo-1559056199-641a0ac8b55e?w=800',
    banner_title = 'منتجات الألبان',
    banner_subtitle = 'طازجة وصحية'
WHERE name ILIKE '%dairy%' OR name ILIKE '%milk%' OR name ILIKE '%ألبان%';

UPDATE categories SET 
    banner_image = 'https://images.unsplash.com/photo-1551024601-bec78aea704b?w=800',
    banner_title = 'الوجبات الخفيفة',
    banner_subtitle = 'لذيذة ومقرمشة'
WHERE name ILIKE '%snack%' OR name ILIKE '%سناكس%';

UPDATE categories SET 
    banner_image = 'https://images.unsplash.com/photo-1610832958506-aa56368176cf?w=800',
    banner_title = 'المشروبات',
    banner_subtitle = 'منعشة وباردة'
WHERE name ILIKE '%drink%' OR name ILIKE '%beverage%' OR name ILIKE '%مشروبات%';
