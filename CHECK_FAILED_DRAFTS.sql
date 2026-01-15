-- شوف المنتجات اللي فشلت في النشر
SELECT 
    id,
    name,
    barcode,
    price,
    branch_id,
    import_batch_id,
    validation_errors
FROM draft_products
WHERE import_batch_id = '51a9282f-7fa7-4ac9-9bb7-f9922a067c68'
ORDER BY id
LIMIT 10;

-- عدد المنتجات المتبقية
SELECT COUNT(*) as remaining_drafts
FROM draft_products
WHERE import_batch_id = '51a9282f-7fa7-4ac9-9bb7-f9922a067c68';
