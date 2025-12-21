# 🚨 Critical Database Connection Error

The "500 Internal Server Error" you are seeing is caused by the backend failing to connect to the database.

## ❌ The Error
```
FATAL: password authentication failed for user "postgres"
```

## 🛠️ How to Fix

1. **Find your correct Supabase Database Password.**
   - This is the password you set when you created the project.
   - If you forgot it, you can reset it in the Supabase Dashboard: `Project Settings` -> `Database` -> `Reset Database Password`.

2. **Update `backend/.env`**
   - Open `backend/.env`.
   - Find the `DATABASE_URL` line.
   - Replace the password part (currently `13572468bodeAa`) with your **correct password**.

   ```env
   DATABASE_URL=postgresql://postgres.jsrqjmovbuhuhbmxyqsh:YOUR_NEW_PASSWORD@aws-1-eu-west-3.pooler.supabase.com:6543/postgres
   ```

3. **Restart the Backend**
   - If running locally, stop the server (Ctrl+C) and run `npm run dev` or `node index.js` again.
   - If on Vercel, you must update the Environment Variables in the Vercel Dashboard and redeploy.

## ⚠️ Important Note
The migration to add "Brand" to the database (`run_brand_migration.js`) **failed** because of this connection error. Once you fix the password, please run:

```bash
node backend/run_brand_migration.js
```
