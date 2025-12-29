# 🔐 نظام المصادقة المحسّن - Backend Authentication System

## 📋 نظرة عامة
تم تحديث نظام المصادقة بالكامل لدعم جميع البيانات الأساسية المطلوبة وإضافة Email Verification.

**تاريخ التحديث**: 29 ديسمبر 2024

---

## ✅ المهام المكتملة

### 1️⃣ تحديث Google OAuth
**الملف**: `/backend/routes/auth.js` - `POST /api/auth/google`

#### البيانات المطلوبة:
```javascript
{
  googleId: "...",           // ✅ Required
  email: "user@gmail.com",   // ✅ Required
  name: "أحمد محمد",
  givenName: "أحمد",        // ✅ الاسم الأول
  familyName: "محمد",       // ✅ الاسم الأخير
  picture: "https://...",
  phone: "01234567890",      // ✅ الرقم
  birthday: "1990-01-15",    // ✅ تاريخ الميلاد
  phoneNumbers: [...]        // دعم لمصفوفة أرقام من Google
}
```

#### المميزات:
- ✅ جلب الاسم الكامل من Google
- ✅ جلب الصورة تلقائياً
- ✅ **Email Verification تلقائي** - الإيميلات من Google محققة
- ✅ دعم جلب رقم الهاتف من Google API
- ✅ دعم جلب تاريخ الميلاد من Google API
- ✅ إذا نقصت بيانات، يعود `needsCompletion: true`

#### مثال الاستجابة:
```json
{
  "auth": true,
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "needsCompletion": false,
  "user": {
    "id": 1,
    "firstName": "أحمد",
    "lastName": "محمد",
    "email": "user@gmail.com",
    "phone": "01234567890",
    "birthDate": "1990-01-15",
    "role": "customer",
    "avatar": "https://...",
    "profileCompleted": true,
    "emailVerified": true
  }
}
```

---

### 2️⃣ تحديث Facebook OAuth
**الملف**: `/backend/routes/auth.js` - `POST /api/auth/facebook`

#### البيانات المطلوبة:
```javascript
{
  facebookId: "...",         // ✅ Required
  email: "user@fb.com",      // Optional (قد لا يعطيه Facebook)
  name: "أحمد محمد",
  firstName: "أحمد",         // ✅ الاسم الأول
  lastName: "محمد",          // ✅ الاسم الأخير
  picture: "https://...",
  phone: "01234567890",      // ✅ الرقم
  birthday: "1990-01-15"     // ✅ تاريخ الميلاد
}
```

#### المميزات:
- ✅ دعم حالات عدم وجود email من Facebook
- ✅ جلب الاسم الكامل والصورة
- ✅ Email Verification إذا قدم Facebook الإيميل
- ✅ `needsCompletion: true` إذا نقصت بيانات

#### مثال الاستجابة:
```json
{
  "auth": true,
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "needsCompletion": true,
  "user": {
    "id": 2,
    "firstName": "أحمد",
    "lastName": "محمد",
    "email": null,
    "phone": null,
    "birthDate": null,
    "role": "customer",
    "avatar": "https://...",
    "profileCompleted": false,
    "emailVerified": false
  }
}
```

---

### 3️⃣ Complete Profile System
**الملف**: `/backend/routes/auth.js` - `POST /api/auth/complete-profile`

#### الهدف:
استكمال البيانات الناقصة بعد التسجيل عبر OAuth

#### Headers Required:
```
Authorization: Bearer <token>
```

#### Body:
```json
{
  "phone": "01234567890",      // ✅ Required
  "birthDate": "1990-01-15",   // Optional
  "firstName": "أحمد",          // Optional
  "lastName": "محمد",           // Optional
  "email": "user@example.com"  // Optional (لو مش موجود من Facebook)
}
```

#### الاستجابة:
```json
{
  "success": true,
  "message": "تم استكمال البيانات بنجاح",
  "user": {
    "id": 2,
    "firstName": "أحمد",
    "lastName": "محمد",
    "email": "user@example.com",
    "phone": "01234567890",
    "birthDate": "1990-01-15",
    "avatar": "https://...",
    "role": "customer",
    "profileCompleted": true
  }
}
```

---

### 4️⃣ Email Verification System
**الملفات**: `/backend/routes/auth.js`

#### 4.1 التسجيل العادي - `POST /api/auth/register`
عند التسجيل بإيميل وكلمة مرور:

**التحديثات**:
- ✅ يتم إنشاء `email_verification_token` تلقائياً
- ✅ `email_verified = false` بشكل افتراضي
- ✅ يُطبع رابط التحقق في الـ console
- ✅ رسالة للمستخدم: "تم إرسال رابط التحقق إلى بريدك الإلكتروني"

**مثال الاستجابة**:
```json
{
  "auth": true,
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "emailVerificationRequired": true,
  "message": "تم إرسال رابط التحقق إلى بريدك الإلكتروني",
  "user": {
    "id": 3,
    "firstName": "أحمد",
    "lastName": "محمد",
    "email": "user@example.com",
    "phone": "01234567890",
    "birthDate": "1990-01-15",
    "role": "customer",
    "emailVerified": false
  }
}
```

#### 4.2 التحقق من الإيميل - `GET /api/auth/verify-email?token=...`

**الاستخدام**:
```
GET /api/auth/verify-email?token=abc123...
```

**الاستجابة الناجحة**:
```json
{
  "success": true,
  "message": "تم التحقق من البريد الإلكتروني بنجاح",
  "user": {
    "id": 3,
    "email": "user@example.com",
    "firstName": "أحمد",
    "emailVerified": true
  }
}
```

**الاستجابة الفاشلة**:
```json
{
  "error": "رمز التحقق غير صالح أو تم التحقق من الإيميل بالفعل"
}
```

#### 4.3 إعادة إرسال رابط التحقق - `POST /api/auth/resend-verification`

**Body**:
```json
{
  "email": "user@example.com"
}
```

**الاستجابة**:
```json
{
  "success": true,
  "message": "تم إرسال رابط التحقق إلى بريدك الإلكتروني"
}
```

---

### 5️⃣ تحديث Users Profile API
**الملف**: `/backend/routes/users.js` - `PUT /api/users/profile`

#### الإصلاحات:
- ✅ إصلاح مشكلة "مينفعش نحدث البيانات"
- ✅ دعم جميع الحقول: `firstName`, `lastName`, `name`, `email`, `phone`, `birthDate`, `avatar`
- ✅ التحقق من وجود `userId` في الـ token
- ✅ استجابة محسّنة تشمل جميع البيانات

#### Headers Required:
```
Authorization: Bearer <token>
```

#### Body Example:
```json
{
  "firstName": "أحمد",
  "lastName": "محمد",
  "name": "أحمد محمد",
  "phone": "01234567890",
  "birthDate": "1990-01-15",
  "avatar": "https://cloudinary.com/..."
}
```

#### الاستجابة:
```json
{
  "success": true,
  "message": "تم تحديث البيانات بنجاح",
  "data": {
    "id": 1,
    "firstName": "أحمد",
    "lastName": "محمد",
    "name": "أحمد محمد",
    "email": "user@example.com",
    "phone": "01234567890",
    "birthDate": "1990-01-15",
    "role": "customer",
    "avatar": "https://...",
    "loyaltyPoints": 150,
    "emailVerified": true
  }
}
```

---

### 6️⃣ Database Migration
**الملف**: `/backend/migrations/add_auth_fields_to_users.sql`

#### الحقول المضافة:
```sql
-- Personal Information
first_name TEXT
last_name TEXT
phone TEXT
birth_date DATE
avatar TEXT

-- OAuth Integration
google_id TEXT UNIQUE
facebook_id TEXT UNIQUE

-- Profile Status
profile_completed BOOLEAN DEFAULT FALSE
email_verified BOOLEAN DEFAULT FALSE

-- Email Verification
email_verification_token TEXT

-- Password Reset
reset_token TEXT
reset_token_expiry TIMESTAMP

-- Timestamps
created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
```

#### Indexes المضافة:
```sql
-- Performance indexes
idx_users_google_id
idx_users_facebook_id
idx_users_email_verified
idx_users_email_verification_token
idx_users_reset_token
```

#### Triggers:
```sql
-- Auto-update updated_at on any change
trigger_update_users_updated_at
```

---

## 🚀 كيفية التشغيل

### 1. تشغيل الـ Migration:
```bash
cd /Users/abdelrahmanelezaby/backend
node run_auth_migration.js
```

### 2. التحقق من النتائج:
```sql
-- Check users table structure
\d users

-- Check existing users
SELECT id, first_name, last_name, email, phone, 
       email_verified, profile_completed, 
       google_id, facebook_id
FROM users;
```

---

## 📊 الـ Flow الكامل

### التسجيل العادي:
```
1. User → POST /api/auth/register
   ↓
2. Backend: Create user with email_verified=false
   ↓
3. Backend: Generate email_verification_token
   ↓
4. Backend: Print verification link (TODO: Send email)
   ↓
5. Response: { emailVerificationRequired: true, ... }
   ↓
6. User clicks verification link
   ↓
7. Frontend → GET /api/auth/verify-email?token=...
   ↓
8. Backend: Mark email_verified=true
   ↓
9. Response: { success: true, emailVerified: true }
```

### Google OAuth:
```
1. User → POST /api/auth/google
   ↓
2. Backend: Check if user exists
   ↓
3. Backend: Create/Update user
   ↓
4. Backend: Set email_verified=true (Google emails are verified)
   ↓
5. Backend: Check if phone/birthDate missing
   ↓
6. Response: { needsCompletion: true/false, ... }
   ↓
7. If needsCompletion=true:
   Frontend shows Complete Profile Modal
   ↓
8. User fills missing data
   ↓
9. Frontend → POST /api/auth/complete-profile
   ↓
10. Backend: Update user, set profile_completed=true
   ↓
11. Response: { success: true, user: {...} }
```

### Facebook OAuth:
```
1. User → POST /api/auth/facebook
   ↓
2. Backend: Check if user exists
   ↓
3. Backend: Create/Update user
   ↓
4. Backend: Set email_verified=true if email provided
   ↓
5. Backend: Check if email/phone/birthDate missing
   ↓
6. Response: { needsCompletion: true, ... }
   ↓
7. Frontend shows Complete Profile Modal
   ↓
8. User fills ALL missing data (email, phone, birthDate)
   ↓
9. Frontend → POST /api/auth/complete-profile
   ↓
10. Backend: Update user, set profile_completed=true
   ↓
11. Response: { success: true, user: {...} }
```

---

## 🔧 Frontend Integration

### 1. تحديث Complete Profile Modal
يجب أن يطلب:
- ✅ **Phone** (Required)
- ✅ **Birth Date** (Optional but recommended)
- ✅ **Email** (Required إذا كان من Facebook ومش موجود)

### 2. Email Verification Page
إنشاء صفحة `/verify-email`:
```tsx
// نموذج الكود
const VerifyEmailPage = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  
  useEffect(() => {
    if (token) {
      api.auth.verifyEmail(token)
        .then(res => {
          // Show success message
          navigate('/');
        })
        .catch(err => {
          // Show error
        });
    }
  }, [token]);
  
  return <div>جاري التحقق من الإيميل...</div>;
};
```

### 3. تحديث Google OAuth في Frontend
طلب permissions إضافية:
```javascript
// In supabaseAuth.ts or googleAuth config
scope: [
  'email',
  'profile',
  'https://www.googleapis.com/auth/user.birthday.read',
  'https://www.googleapis.com/auth/user.phonenumbers.read'
].join(' ')
```

---

## 🎯 البيانات الأساسية المطلوبة

| البيان | Required | Source |
|--------|----------|--------|
| **الاسم الأول** (firstName) | ✅ Yes | User/Google/Facebook |
| **الاسم الأخير** (lastName) | ✅ Yes | User/Google/Facebook |
| **الإيميل** (email) | ✅ Yes | User/Google/Facebook |
| **رقم الهاتف** (phone) | ✅ Yes | User/Complete Profile |
| **تاريخ الميلاد** (birthDate) | ⚠️ Recommended | User/Google/Facebook/Complete Profile |
| **الصورة** (avatar) | ❌ No | Google/Facebook/Upload |

---

## 📝 ملاحظات مهمة

### 1. Email Sending (TODO):
حالياً الـ verification links تُطبع في الـ console فقط.
يجب إضافة:
- **Supabase Email** - المفضل
- أو **Nodemailer** مع SMTP

### 2. Google/Facebook API Permissions:
للحصول على رقم الهاتف وتاريخ الميلاد من Google:
```javascript
// في Google OAuth config
scope: 'email profile https://www.googleapis.com/auth/user.birthday.read https://www.googleapis.com/auth/user.phonenumbers.read'
```

### 3. Security:
- ✅ Passwords hashed with bcrypt (12 rounds)
- ✅ JWT tokens expire after 24 hours
- ✅ Email verification tokens are hashed (SHA-256)
- ✅ Reset tokens expire after 1 hour
- ✅ Unique constraints on google_id, facebook_id

---

## 🐛 حل المشاكل

### مشكلة: "مينفعش نحدث البيانات"
**الحل**: تم إصلاحها في `/backend/routes/users.js`
- أضفنا دعم `firstName`, `lastName`, `birthDate`
- تحقق من وجود `userId` في الـ token
- استجابة محسّنة

### مشكلة: دخول الأدمن
**الحل**: 
1. تأكد من تشغيل الـ migration
2. تأكد أن جدول `users` يحتوي على جميع الحقول
3. تحقق من الـ token صحيح

```sql
-- Check admin user
SELECT id, email, role, first_name, last_name, phone, email_verified
FROM users 
WHERE role IN ('admin', 'manager');
```

### مشكلة: الإيميل لم يصل
**السبب**: Email sending غير مفعّل بعد (TODO)
**الحل المؤقت**: استخدم الـ verification link من console logs

---

## ✅ Checklist

- [x] تحديث Google OAuth
- [x] تحديث Facebook OAuth
- [x] Complete Profile System
- [x] Email Verification System
- [x] إصلاح Update Profile
- [x] Database Migration
- [x] Indexes & Triggers
- [x] Documentation
- [ ] إرسال Emails فعلي (TODO)
- [ ] إضافة Unit Tests (TODO)

---

**تاريخ الإكمال**: 29 ديسمبر 2024  
**الحالة**: ✅ جاهز للاختبار والنشر

**ملاحظة**: يجب تشغيل الـ migration قبل النشر!

```bash
node run_auth_migration.js
```
