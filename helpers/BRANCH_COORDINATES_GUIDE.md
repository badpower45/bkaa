# Branch Coordinates Extraction Guide
# دليل استخراج إحداثيات الفروع

## المشكلة
الفروع عندها روابط Google Maps بس مفيش coordinates محفوظة في الداتابيز، وده بيأثر على:
- حساب المسافات بين الفرع والعميل
- اختيار أقرب فرع تلقائياً
- تحديد تكلفة التوصيل

## الحل

عندك 3 طرق لاستخراج وحفظ الإحداثيات:

---

## الطريقة 1: باستخدام Node.js Script (الأسهل) ⭐

### الخطوات:

1. **تأكد إن الفروع عندها روابط Google Maps**
   ```sql
   -- في Supabase SQL Editor
   SELECT id, name, maps_link FROM branches;
   ```

2. **شغّل الـ script**
   ```bash
   cd backend
   node helpers/update_branch_coordinates.js
   ```

3. **الـ script هيعمل:**
   - يقرأ كل الفروع
   - يحل الروابط القصيرة (goo.gl)
   - يستخرج الإحداثيات
   - يحفظها في الداتابيز
   - يطبع تقرير بالنتائج

### مثال للنتيجة:
```
🗺️  Starting coordinate extraction...

📍 Processing: الفرع الرئيسي (ID: 1)
   🔗 Short link detected, resolving...
   ✅ Resolved to: https://www.google.com/maps/@30.0444196,31.2357116,15z
   📌 Coordinates found: 30.0444196, 31.2357116
   ✅ Updated successfully!

📊 Summary:
   ✅ Updated: 3
   ❌ Failed: 0
   ⚠️  Skipped: 1
```

---

## الطريقة 2: باستخدام Supabase Function

1. **افتح Supabase SQL Editor**

2. **شغّل الملف:**
   ```sql
   -- انسخ محتوى ملف helpers/extract_coordinates_from_maps.sql
   -- والصقه في SQL Editor واضغط Run
   ```

3. **هتشوف النتائج:**
   ```
   id | name          | location_lat | location_lng | status
   ---|---------------|--------------|--------------|--------
   1  | الفرع الرئيسي | 30.0444196   | 31.2357116   | ✅ Coordinates extracted
   2  | فرع المعادي   | NULL         | NULL         | ⚠️ No maps link
   ```

---

## الطريقة 3: Manual Update (يدوياً)

إذا فشلت الطرق التلقائية:

### خطوة 1: استخراج الإحداثيات من رابط Google Maps

#### لو الرابط كامل:
```
https://www.google.com/maps/@30.0444196,31.2357116,15z
                              ↑         ↑
                             lat       lng
```

#### لو الرابط قصير (goo.gl):
1. افتح الرابط في المتصفح
2. انسخ الرابط الكامل من شريط العنوان
3. استخرج الإحداثيات زي الأول

### خطوة 2: تحديث الداتابيز

```sql
-- Update by branch ID
UPDATE branches 
SET 
    location_lat = 30.0444196,
    location_lng = 31.2357116
WHERE id = 1;

-- أو Update by name
UPDATE branches 
SET 
    location_lat = 30.0444196,
    location_lng = 31.2357116,
    maps_link = 'https://www.google.com/maps/@30.0444196,31.2357116,15z'
WHERE name = 'الفرع الرئيسي';
```

---

## أنواع روابط Google Maps المدعومة

```javascript
// ✅ Type 1: Query parameter
https://www.google.com/maps?q=30.0444,31.2357

// ✅ Type 2: @ symbol
https://www.google.com/maps/@30.0444,31.2357,15z

// ✅ Type 3: Place URL
https://www.google.com/maps/place/Cairo/@30.0444,31.2357,12z

// ⚠️ Type 4: Short link (needs resolution first)
https://maps.app.goo.gl/abc123
https://goo.gl/maps/xyz789
```

---

## التحقق من النتائج

```sql
-- عرض كل الفروع مع الإحداثيات
SELECT 
    id,
    name,
    location_lat,
    location_lng,
    coverage_radius_km,
    maps_link,
    CASE 
        WHEN location_lat IS NOT NULL AND location_lng IS NOT NULL THEN '✅ Ready'
        ELSE '❌ Missing coordinates'
    END as status
FROM branches
ORDER BY id;
```

---

## استخدام الإحداثيات

بعد ما تحفظ الإحداثيات، تقدر تستخدمها في:

### 1. حساب المسافة بين نقطتين:
```sql
CREATE OR REPLACE FUNCTION calculate_distance(
    lat1 DECIMAL, lng1 DECIMAL,
    lat2 DECIMAL, lng2 DECIMAL
) RETURNS DECIMAL AS $$
DECLARE
    distance DECIMAL;
BEGIN
    -- Haversine formula
    distance := 6371 * ACOS(
        COS(RADIANS(lat1)) * COS(RADIANS(lat2)) *
        COS(RADIANS(lng2) - RADIANS(lng1)) +
        SIN(RADIANS(lat1)) * SIN(RADIANS(lat2))
    );
    RETURN distance;
END;
$$ LANGUAGE plpgsql;
```

### 2. إيجاد أقرب فرع:
```sql
SELECT 
    id,
    name,
    calculate_distance(
        30.0444, 31.2357,  -- موقع العميل
        location_lat, location_lng
    ) as distance_km
FROM branches
WHERE is_active = true
ORDER BY distance_km
LIMIT 1;
```

### 3. الفروع اللي بتغطي موقع معين:
```sql
SELECT 
    id,
    name,
    coverage_radius_km,
    calculate_distance(
        30.0444, 31.2357,  -- موقع العميل
        location_lat, location_lng
    ) as distance_km
FROM branches
WHERE is_active = true
  AND calculate_distance(
      30.0444, 31.2357,
      location_lat, location_lng
  ) <= coverage_radius_km
ORDER BY distance_km;
```

---

## مشاكل محتملة وحلولها

### المشكلة: "Failed to extract coordinates"
**الحل:**
- تأكد إن رابط Google Maps صحيح
- لو رابط قصير، حله الأول
- أو استخدم التحديث اليدوي

### المشكلة: "No maps link found"
**الحل:**
```sql
UPDATE branches 
SET maps_link = 'YOUR_GOOGLE_MAPS_URL'
WHERE id = X;
```
ثم شغّل الـ script تاني

### المشكلة: "Coordinates already exist"
**الحل:** الـ script بيحدث الإحداثيات الموجودة. لو عايز تخطي الفروع اللي عندها coordinates، عدّل الـ script.

---

## ملاحظات مهمة

1. **الروابط القصيرة:** ممكن تاخد وقت أطول عشان بنحلها الأول
2. **Accuracy:** الإحداثيات دقتها 8 خانات عشرية (~1 متر)
3. **Coverage Radius:** افتراضياً 5 كم، ممكن تعدلها حسب احتياجك
4. **Rate Limiting:** لو عندك فروع كتير، ممكن Google يحد الطلبات

---

## الخطوات التالية

بعد ما تحفظ الإحداثيات:

1. ✅ اختبر دالة حساب المسافات
2. ✅ عدّل الـ frontend عشان يختار أقرب فرع تلقائياً
3. ✅ أضف تكلفة توصيل بناءً على المسافة
4. ✅ أضف خريطة تفاعلية للفروع

---

## المساعدة

لو واجهتك أي مشكلة، تواصل مع الدعم الفني أو:
- شوف الـ logs في الـ console
- تأكد من الـ database connection
- جرب التحديث اليدوي للفرع الواحد الأول
