# 🚀 دليل رفع Backend على Vercel

## الخطوات:

### 1️⃣ اعمل حساب Vercel
- روح على [vercel.com](https://vercel.com)
- سجل بـ GitHub أو Email

### 2️⃣ ارفع السيرفر على GitHub
```bash
cd server
git init
git add .
git commit -m "Backend for Vercel"
git remote add origin https://github.com/YOUR_USERNAME/allosh-backend.git
git push -u origin main
```

### 3️⃣ اربط المشروع بـ Vercel
1. من Dashboard اضغط **"Add New" → "Project"**
2. اختار الـ Repository بتاع السيرفر
3. **Root Directory**: اسيبه فاضي (أو اكتب `.`)
4. اضغط **Deploy**

### 4️⃣ أضف Environment Variables ⚠️ مهم جداً

من Settings → Environment Variables أضف:

| Variable | Value |
|----------|-------|
| `DATABASE_URL` | `postgresql://postgres.jsrqjmovbuhuhbmxyqsh:13572468bodeAa@aws-1-eu-west-3.pooler.supabase.com:5432/postgres` |
| `JWT_SECRET` | `4d8209bb6b394f8161f3500d4d3342acaedb63a75ccc3b462b29306380fc4cb34b3be2878d9cc719647607630f179bee06dc8e746d6dd12ad501b81fee9e063c` |
| `FRONTEND_URL` | `https://allosh-eg.com` |
| `NODE_ENV` | `production` |

### 5️⃣ بعد ما يخلص Deploy

هيديك URL زي كده:
```
https://allosh-backend.vercel.app
```

### 6️⃣ جرب الـ API

```bash
# Health Check
curl https://YOUR-APP.vercel.app/api/health

# Get Products
curl https://YOUR-APP.vercel.app/api/products
```

---

## 🔧 تعديل Frontend

بعد ما تاخد الـ URL من Vercel، حدث الـ Frontend:

### في ملف `services/api.ts`:
```typescript
const API_URL = 'https://YOUR-APP.vercel.app/api';
```

---

## 📁 هيكل الملفات على Vercel

```
server/
├── api/
│   ├── index.js      ← السيرفر الرئيسي (كل الـ routes)
│   └── package.json  ← Dependencies
└── vercel.json       ← إعدادات Vercel
```

---

## ✅ الـ Endpoints المتاحة

| Method | Endpoint | الوظيفة |
|--------|----------|---------|
| GET | `/api/health` | Health check |
| POST | `/api/auth/register` | تسجيل مستخدم |
| POST | `/api/auth/login` | تسجيل دخول |
| GET | `/api/auth/me` | بيانات المستخدم |
| GET | `/api/products` | كل المنتجات |
| GET | `/api/products/:id` | منتج واحد |
| POST | `/api/orders` | إنشاء طلب |
| GET | `/api/orders/track/:code` | تتبع طلب |
| GET | `/api/branches` | الفروع |
| GET | `/api/categories` | التصنيفات |
| GET | `/api/search?q=` | البحث |

---

## ⚡ مميزات Vercel

- ✅ مجاني حتى 100GB bandwidth/شهر
- ✅ HTTPS تلقائي
- ✅ Deploy تلقائي من GitHub
- ✅ Serverless (مش محتاج VPS)
- ✅ سريع جداً

---

## 🔴 لو في Error

1. روح **Deployments** → اضغط على آخر deployment
2. اضغط **Functions** → شوف الـ Logs
3. أو اضغط **Runtime Logs**

---

## 🎯 الخطوة الأخيرة

بعد ما كل حاجة تشتغل:
1. Frontend على cPanel: `https://allosh-eg.com`
2. Backend على Vercel: `https://YOUR-APP.vercel.app`

حدث `API_URL` في الـ Frontend وارفعه على cPanel!
