# Branch Location System - نظام تحديد الفرع بالموقع

## التحديثات الجديدة 🎉

تم إصلاح وتحسين نظام تحديد الفرع بناءً على موقع المستخدم بشكل كامل.

---

## ما تم إصلاحه ✅

### 1. Backend API Endpoints

#### تم تعديل:
- **GET /api/branches** - يرجع `latitude` و `longitude` بدلاً من `location_lat` و `location_lng`
- **GET /api/branches/:id** - يرجع الإحداثيات بشكل صحيح
- **GET /api/branches/nearby** - يبحث عن الفروع القريبة بناءً على الإحداثيات

#### تم إضافة:
- **GET /api/branches/location/nearest?lat=X&lng=Y** - **جديد!** 
  - يجيب أقرب فرع للمستخدم
  - يستخدم Haversine formula لحساب المسافة بدقة
  - يرجع معلومات الفرع + المسافة بالكيلومتر
  - Fallback تلقائي لأول فرع نشط لو مفيش إحداثيات

#### مثال الاستخدام:
```bash
# Get nearest branch
curl "https://bkaa.vercel.app/api/branches/location/nearest?lat=30.0444&lng=31.2357"

# Response:
{
  "message": "success",
  "data": {
    "id": 1,
    "name": "الفرع الرئيسي",
    "latitude": 30.0444196,
    "longitude": 31.2357116,
    "address": "القاهرة - المعادي",
    "phone": "01012345678",
    ...
  },
  "distance_km": 0.5
}
```

---

### 2. Frontend Components

#### BranchContext.tsx
- ✅ تم تحديث `autoSelectByLocation()` لاستخدام الـ endpoint الجديد
- ✅ يستخدم `/branches/location/nearest` بدلاً من Supabase RPC
- ✅ Fallback ذكي: لو فشل الـ API، يحسب أقرب فرع محلياً
- ✅ Console logs واضحة للـ debugging

#### BranchSelector.tsx
- ✅ زرار "تحديد الفرع تلقائياً" يستخدم الـ API الجديد
- ✅ يعرض المسافة بالكيلومتر في التنبيه
- ✅ Loading state أثناء تحديد الموقع
- ✅ Error handling محسّن

---

## كيفية الاستخدام 🚀

### 1. تحديد الموقع التلقائي

عند فتح التطبيق:
1. المستخدم يضغط على أيقونة الفرع في الـ header
2. يفتح modal الفروع
3. يضغط على "تحديد الفرع تلقائياً"
4. يطلب منه السماح بالوصول للموقع
5. يتم اختيار أقرب فرع تلقائياً ✨

### 2. من الكود

```typescript
import { useBranch } from '../context/BranchContext';

const MyComponent = () => {
  const { autoSelectByLocation } = useBranch();

  const handleGetLocation = async () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(async (pos) => {
        const branch = await autoSelectByLocation(
          pos.coords.latitude,
          pos.coords.longitude
        );
        console.log('Selected branch:', branch);
      });
    }
  };

  return <button onClick={handleGetLocation}>حدد موقعي</button>;
};
```

---

## متطلبات التشغيل 📋

### الفروع يجب أن يكون عندها إحداثيات!

#### الطريقة 1: استخدام Helper Script
```bash
cd backend
node helpers/update_branch_coordinates.js
```

#### الطريقة 2: SQL مباشرة
```sql
-- Update specific branch
UPDATE branches 
SET location_lat = 30.0444196, location_lng = 31.2357116
WHERE id = 1;
```

#### الطريقة 3: Seed Development Data
```bash
# Using the dev seed endpoint
curl -X POST https://bkaa.vercel.app/api/branches/dev/seed
```

راجع: [`backend/helpers/BRANCH_COORDINATES_GUIDE.md`](../backend/helpers/BRANCH_COORDINATES_GUIDE.md)

---

## الفروق المهمة ⚠️

### قبل التحديث:
- ❌ الـ API كان يرجع `location_lat` و `location_lng`
- ❌ الفرونت إند كان يتوقع `latitude` و `longitude`
- ❌ Mismatch في أسماء الـ fields
- ❌ ما كانش في endpoint مخصص لأقرب فرع

### بعد التحديث:
- ✅ الـ API يرجع `latitude` و `longitude` (unified naming)
- ✅ endpoint مخصص `/branches/location/nearest`
- ✅ حسابات دقيقة باستخدام Haversine formula
- ✅ Error handling و fallbacks محسّنة
- ✅ Console logging للـ debugging

---

## التحسينات 🎯

1. **دقة أفضل**: Haversine formula للحسابات الجغرافية الدقيقة
2. **Performance**: server-side calculation بدلاً من client-side
3. **Fallback ذكي**: لو مفيش coordinates، يرجع لأول فرع نشط
4. **UX محسّن**: رسائل واضحة + loading states
5. **Debugging سهل**: console logs مفصلة في كل خطوة

---

## API Reference

### GET /branches/location/nearest

**Parameters:**
- `lat` (required): Latitude
- `lng` (required): Longitude

**Response:**
```json
{
  "message": "success",
  "data": {
    "id": 1,
    "name": "الفرع الرئيسي",
    "name_ar": "الفرع الرئيسي",
    "address": "القاهرة - المعادي",
    "phone": "01012345678",
    "latitude": 30.0444196,
    "longitude": 31.2357116,
    "coverage_radius_km": 5.0,
    "is_active": true,
    "distance_km": 0.5
  },
  "distance_km": 0.5
}
```

**Error Response:**
```json
{
  "error": "Latitude and longitude required"
}
```

---

## Testing 🧪

### Manual Testing:

1. افتح التطبيق في المتصفح
2. افتح Developer Tools (F12)
3. اضغط على أيقونة الفرع
4. اضغط "تحديد الفرع تلقائياً"
5. اسمح بالوصول للموقع
6. شوف الـ console logs:
   ```
   📍 Finding nearest branch for location: 30.0444, 31.2357
   ✅ Nearest branch found: الفرع الرئيسي (0.5 km)
   ```

### API Testing:

```bash
# Test nearest branch
curl "https://bkaa.vercel.app/api/branches/location/nearest?lat=30.0444&lng=31.2357"

# Test all branches (check latitude/longitude fields)
curl "https://bkaa.vercel.app/api/branches"

# Test nearby branches (within 10km)
curl "https://bkaa.vercel.app/api/branches/nearby?lat=30.0444&lng=31.2357&radius=10"
```

---

## Troubleshooting 🔧

### المشكلة: "لم يتم العثور على فرع مناسب"
**الحل:** تأكد إن الفروع عندها `location_lat` و `location_lng` في الداتابيز.

### المشكلة: "تعذر تحديد الموقع"
**الحل:** 
- تأكد إن المتصفح يدعم Geolocation
- تأكد إن الموقع HTTPS (required للـ geolocation)
- اسمح بالوصول للموقع في إعدادات المتصفح

### المشكلة: الفرع المختار مش قريب
**الحل:** 
- شغّل script تحديث الإحداثيات: `node helpers/update_branch_coordinates.js`
- تأكد من دقة الإحداثيات في Google Maps

---

## Commits

- **Backend:** `15a542e` - fix: update branches endpoints to return latitude/longitude
- **Frontend:** `5918c98` - fix: update branch location selection to use server-side nearest branch

---

## Next Steps 🚀

- [ ] إضافة caching للفروع القريبة
- [ ] تحسين UI لعرض كل الفروع على خريطة
- [ ] إضافة radius filter في الـ UI
- [ ] حفظ آخر موقع للمستخدم في localStorage
- [ ] إضافة تنبيه إذا المستخدم بعيد عن كل الفروع

---

تم! النظام شغال دلوقتي بشكل صحيح 100% ✨
