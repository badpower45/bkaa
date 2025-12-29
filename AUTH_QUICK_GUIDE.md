# 🚀 نظام المصادقة - دليل سريع

## ✅ التحديثات المكتملة

### 1. Google OAuth
```javascript
POST /api/auth/google
Body: {
  googleId, email, name, picture,
  givenName, familyName,  // ✅ الاسم الكامل
  phone, birthday          // ✅ الرقم وتاريخ الميلاد
}
Response: {
  auth: true,
  token: "...",
  needsCompletion: false,  // ✅ إذا true، اعرض Complete Profile Modal
  user: { ... }
}
```

### 2. Facebook OAuth
```javascript
POST /api/auth/facebook
Body: {
  facebookId, email, name, picture,
  firstName, lastName,
  phone, birthday
}
Response: {
  auth: true,
  needsCompletion: true,  // ✅ عادة true لأن Facebook لا يعطي كل البيانات
  user: { ... }
}
```

### 3. Complete Profile
```javascript
POST /api/auth/complete-profile
Headers: { Authorization: "Bearer <token>" }
Body: {
  phone: "01234567890",      // ✅ Required
  birthDate: "1990-01-15",
  firstName: "أحمد",
  lastName: "محمد",
  email: "user@example.com"  // Required إذا من Facebook
}
```

### 4. Email Verification
```javascript
// عند التسجيل العادي
POST /api/auth/register
Response: {
  emailVerificationRequired: true,  // ✅ يجب التحقق من الإيميل
  message: "تم إرسال رابط التحقق..."
}

// التحقق من الإيميل
GET /api/auth/verify-email?token=abc123...

// إعادة إرسال رابط التحقق
POST /api/auth/resend-verification
Body: { email: "user@example.com" }
```

### 5. تحديث البيانات
```javascript
PUT /api/users/profile
Headers: { Authorization: "Bearer <token>" }
Body: {
  firstName: "أحمد",
  lastName: "محمد",
  phone: "01234567890",
  birthDate: "1990-01-15",
  avatar: "https://..."
}
```

---

## 📊 الحقول الجديدة في جدول users

```sql
-- تم إضافتها يدوياً على Supabase ✅
first_name TEXT
last_name TEXT
phone TEXT
birth_date DATE
avatar TEXT
google_id TEXT UNIQUE
facebook_id TEXT UNIQUE
profile_completed BOOLEAN DEFAULT FALSE
email_verified BOOLEAN DEFAULT FALSE
email_verification_token TEXT
reset_token TEXT
reset_token_expiry TIMESTAMP
created_at TIMESTAMP
updated_at TIMESTAMP
```

---

## 🔧 Frontend Integration

### Complete Profile Modal
اعرضه إذا `needsCompletion === true`:
```tsx
if (response.needsCompletion) {
  showCompleteProfileModal({
    requiredFields: ['phone'],  // Required
    optionalFields: ['birthDate', 'email']  // Optional
  });
}
```

### Email Verification Page
صفحة `/verify-email`:
```tsx
const token = searchParams.get('token');
await api.auth.verifyEmail(token);
```

### Google OAuth Scopes
```javascript
scope: [
  'email',
  'profile',
  'https://www.googleapis.com/auth/user.birthday.read',
  'https://www.googleapis.com/auth/user.phonenumbers.read'
].join(' ')
```

---

## 🐛 الأخطاء الشائعة

### "مينفعش نحدث البيانات"
✅ **تم إصلاحها!** في `/backend/routes/users.js`

### دخول الأدمن
تأكد من:
1. Migration تم تنفيذه ✅
2. جدول `users` يحتوي على جميع الحقول ✅
3. الـ token صحيح

---

## 📝 TODO

- [ ] إرسال Emails فعلي (حالياً في console فقط)
- [ ] إضافة Unit Tests
- [ ] تحديث Frontend للاستفادة من البيانات الجديدة

---

**تاريخ**: 29 ديسمبر 2024  
**الحالة**: ✅ جاهز للاستخدام
