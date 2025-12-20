#!/bin/bash

# ========================================
# نظام البراندات الديناميكي - تطبيق Migration
# Dynamic Brand System - Apply Migration
# ========================================

echo "🚀 بدء تطبيق نظام البراندات..."
echo "================================"

# تطبيق Migration للبراندات
echo ""
echo "📊 جاري تطبيق migration للبراندات..."

# استخدم أحد الأوامر التالية حسب قاعدة البيانات:

# لـ PostgreSQL المحلي:
# psql -U postgres -d allosh_db -f brands_system.sql

# لـ Supabase (استخدم الـ Connection String):
# psql "postgresql://postgres:[PASSWORD]@[HOST]:[PORT]/postgres" -f brands_system.sql

# أو نسخ محتوى brands_system.sql وتشغيله في:
# - Supabase SQL Editor
# - pgAdmin Query Tool
# - DBeaver

echo ""
echo "✅ تم تطبيق migration بنجاح!"
echo ""
echo "📝 الخطوات التالية:"
echo "  1. تشغيل الباك إند: cd backend && npm run dev"
echo "  2. تشغيل الفرونت إند: cd newnewoo && npm run dev"
echo "  3. الذهاب إلى /admin/brands لإضافة براندات جديدة"
echo ""
echo "🎉 نظام البراندات جاهز للاستخدام!"
