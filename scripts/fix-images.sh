#!/bin/bash

# Apply product image fixes to production database
echo "🔄 Applying product image fixes to database..."

curl -X POST "https://bkaa.vercel.app/api/admin/run-migration" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -d '{
    "migration": "fix_product_images",
    "sql": "UPDATE products SET image = '\''https://images.unsplash.com/photo-1563636619-e9143da7973b?w=400'\'' WHERE image IS NULL OR image = '\'''\'' OR image LIKE '\''%placehold%'\''; UPDATE products SET image = '\''https://images.unsplash.com/photo-1563636619-e9143da7973b?w=400'\'' WHERE name LIKE '\''%لبن%'\'' OR name LIKE '\''%حليب%'\''; UPDATE products SET image = '\''https://images.unsplash.com/photo-1586201375761-83865001e31c?w=400'\'' WHERE name LIKE '\''%أرز%'\'' OR name LIKE '\''%رز%'\''; UPDATE products SET image = '\''https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?w=400'\'' WHERE name LIKE '\''%زيت%'\''; UPDATE products SET image = '\''https://images.unsplash.com/photo-1594362388017-64e3043973dd?w=400'\'' WHERE name LIKE '\''%سكر%'\''; UPDATE products SET image = '\''https://images.unsplash.com/photo-1608686207856-001b95cf60ca?w=400'\'' WHERE name LIKE '\''%شاي%'\'' OR name LIKE '\''%tea%'\''; UPDATE products SET image = '\''https://images.unsplash.com/photo-1559563458-527698bf5295?w=400'\'' WHERE name LIKE '\''%عصير%'\'' OR name LIKE '\''%juice%'\''; UPDATE products SET image = '\''https://images.unsplash.com/photo-1625869016774-3a92be2ae2cd?w=400'\'' WHERE name LIKE '\''%بسكويت%'\'' OR name LIKE '\''%شيبسي%'\''; UPDATE products SET image = '\''https://images.unsplash.com/photo-1566454419290-f127fcf82465?w=400'\'' WHERE name LIKE '\''%معكرونة%'\'' OR name LIKE '\''%pasta%'\''; UPDATE products SET image = '\''https://images.unsplash.com/photo-1587484436805-000259084a93?w=400'\'' WHERE name LIKE '\''%صابون%'\'' OR name LIKE '\''%شامبو%'\''; UPDATE products SET image = '\''https://images.unsplash.com/photo-1584308972272-9e4e7685e80f?w=400'\'' WHERE name LIKE '\''%جبن%'\'' OR name LIKE '\''%cheese%'\''; UPDATE products SET image = '\''https://images.unsplash.com/photo-1588964895597-cfccd6e2dbf9?w=400'\'' WHERE image IS NULL OR image = '\'''\'' OR LENGTH(image) < 10; UPDATE branch_products SET is_available = true WHERE stock_quantity > 0;"
  }'

echo ""
echo "✅ Database update command sent!"
echo "Note: The migration endpoint needs to be created in the backend."
echo ""
echo "Alternative: Run this SQL directly on your database:"
echo "=========================================="
cat ../migrations/fix_product_images.sql
