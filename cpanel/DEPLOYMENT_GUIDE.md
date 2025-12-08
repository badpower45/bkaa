# 🚀 دليل رفع السيرفر على cPanel مع Supabase

## المتطلبات

1. **حساب cPanel** مع دعم Node.js (Node.js Selector)
2. **حساب Supabase** (مجاني) للـ Database
3. **دومين أو subdomain** للـ API

---

## الخطوة 1: إعداد Supabase

### 1.1 إنشاء مشروع جديد
1. اذهب إلى [supabase.com](https://supabase.com) وسجل دخول
2. اضغط "New Project"
3. اختر اسم للمشروع وكلمة سر قوية للـ database
4. اختر أقرب region (eu-central-1 لأوروبا/الشرق الأوسط)

### 1.2 الحصول على Connection String
1. اذهب إلى **Settings > Database**
2. انسخ الـ **Connection string (URI)** من قسم "Connection Pooling"
3. استبدل `[YOUR-PASSWORD]` بكلمة السر اللي حطيتها

```
postgresql://postgres.xxxxx:YOUR_PASSWORD@aws-0-eu-central-1.pooler.supabase.com:6543/postgres
```

### 1.3 تشغيل الـ Schema
1. اذهب إلى **SQL Editor** في Supabase
2. انسخ محتوى ملف `schema.sql` وشغله
3. تأكد إن كل الـ tables اتعملت

---

## الخطوة 2: إعداد cPanel

### 2.1 إنشاء Node.js Application
1. ادخل cPanel
2. اذهب إلى **Setup Node.js App** (أو Node.js Selector)
3. اضغط **Create Application**
4. اختر:
   - **Node.js version**: 18.x أو أعلى
   - **Application mode**: Production
   - **Application root**: `public_html/api` (أو أي مسار تفضله)
   - **Application URL**: `api.yourdomain.com` أو `yourdomain.com/api`
   - **Application startup file**: `app.js`

### 2.2 رفع الملفات
1. اذهب إلى **File Manager** في cPanel
2. انتقل للمسار اللي حددته (مثلاً `public_html/api`)
3. ارفع كل محتويات مجلد `cpanel`:
   ```
   app.js
   database.js
   package.json
   .htaccess
   .env (أنشئه من .env.example)
   middleware/
   routes/
   ```

### 2.3 إعداد ملف .env
أنشئ ملف `.env` في نفس المسار:

```env
# Supabase Database
DATABASE_URL=postgresql://postgres.xxxxx:password@aws-0-eu-central-1.pooler.supabase.com:6543/postgres

# JWT Secret (اعمل كلمة سر قوية عشوائية)
JWT_SECRET=your_very_long_random_secret_key_minimum_32_characters_here

# Server
PORT=3001
NODE_ENV=production

# Frontend URL (للـ CORS)
FRONTEND_URL=https://your-frontend.com
CPANEL_DOMAIN=https://api.your-domain.com
```

### 2.4 تثبيت Dependencies
1. في صفحة Node.js Selector، اضغط على تطبيقك
2. اضغط **Run NPM Install**
3. أو من Terminal:
   ```bash
   cd ~/public_html/api
   npm install
   ```

### 2.5 تشغيل التطبيق
1. اضغط **Start App** أو **Restart**
2. تأكد إن الـ Status أصبح "Running"

---

## الخطوة 3: اختبار الـ API

### 3.1 Health Check
```bash
curl https://api.your-domain.com/api/health
```

يجب أن يرجع:
```json
{
  "status": "ok",
  "timestamp": "2024-...",
  "environment": "production"
}
```

### 3.2 اختبار الـ Database
```bash
curl https://api.your-domain.com/api/products
```

---

## الخطوة 4: ربط الـ Frontend

### 4.1 تحديث متغيرات البيئة في Frontend
في ملف `.env` للـ frontend:
```env
VITE_API_URL=https://api.your-domain.com
```

### 4.2 رفع الـ Frontend على cPanel
1. شغل `npm run build` في مشروع الـ frontend
2. ارفع محتويات مجلد `dist` إلى `public_html`

---

## Supabase Edge Functions (اختياري)

### للـ Real-time notifications:

1. **تثبيت Supabase CLI:**
   ```bash
   npm install -g supabase
   ```

2. **إنشاء Edge Function:**
   ```bash
   supabase functions new order-notification
   ```

3. **مثال على Edge Function للإشعارات:**
   ```typescript
   // supabase/functions/order-notification/index.ts
   import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
   
   serve(async (req) => {
     const { orderId, status, userId } = await req.json()
     
     // Send notification logic here
     // Can integrate with FCM, OneSignal, etc.
     
     return new Response(
       JSON.stringify({ success: true }),
       { headers: { "Content-Type": "application/json" } }
     )
   })
   ```

4. **Deploy:**
   ```bash
   supabase functions deploy order-notification
   ```

---

## حل المشاكل الشائعة

### مشكلة: Application Not Starting
- تأكد من صحة الـ `DATABASE_URL`
- تأكد من وجود `JWT_SECRET`
- راجع الـ logs في cPanel

### مشكلة: CORS Errors
- أضف domain الـ frontend في `.env`:
  ```env
  FRONTEND_URL=https://your-frontend.com
  ```

### مشكلة: Database Connection Failed
- تأكد من الـ Connection String
- تأكد إن IP الـ cPanel مسموح في Supabase (Database > Settings > Network)

### مشكلة: 502 Bad Gateway
- تأكد إن التطبيق شغال
- تأكد من الـ port في `.htaccess` مطابق للـ PORT في `.env`

---

## 📞 الدعم

إذا واجهت مشاكل:
1. راجع الـ Error Logs في cPanel
2. تأكد من كل الـ environment variables
3. جرب تشغيل `node app.js` من Terminal لمعرفة الأخطاء

---

**✅ بكده السيرفر جاهز للعمل على cPanel مع Supabase!**
