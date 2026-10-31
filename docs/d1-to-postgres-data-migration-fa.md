# انتقال داده موجود D1 به PostgreSQL

این مرحله فقط برای حفظ داده‌های قبلی لازم است. فایل Export و JSON ممکن است شامل اطلاعات حساس و Agent Key hash باشد؛ آن‌ها را در Git، چت یا Drive قرار ندهید.

## ۱. Export از D1 قدیمی

در رایانه‌ای که به حساب Cloudflare قدیمی دسترسی دارد اجرا کنید:

```bash
npx wrangler@4 d1 export windows-agent-management-cloudflare-db \
  --remote --output legacy-d1.sql
```

اگر نام Database متفاوت است، آن را از داشبورد قدیمی D1 بردارید. برای Export به R2 یا روش پرداخت نیاز نیست.

## ۲. تبدیل آفلاین به JSON

از ریشه همین مخزن:

```bash
python3 scripts/d1_export_to_json.py legacy-d1.sql legacy-d1.json
```

## ۳. آماده‌سازی PostgreSQL

ابتدا `DATABASE_URL` مقصد را فقط در shell محلی تنظیم و migration را اجرا کنید:

```bash
export DATABASE_URL='postgresql://...'
npm install
npm run db:generate
npm run db:migrate
```

## ۴. Import

```bash
node scripts/import_legacy_json.mjs legacy-d1.json
```

Importer جدول‌ها را به ترتیب وابستگی وارد می‌کند، Conflictها را نادیده می‌گیرد و Sequence شناسه‌های عددی را تنظیم می‌کند؛ بنابراین اجرای دوباره آن idempotent است.

## ۵. بررسی و پاک‌سازی

1. در Vercel صفحه `/database` و تعداد ردیف هر جدول را با D1 مقایسه کنید.
2. چند Agent Key، فرمان، گزارش و Automation را آزمایش کنید.
3. Screenshotهای قدیمی فقط وقتی قابل مشاهده‌اند که بایت متناظر واقعاً به Vercel Blob منتقل شده باشد. چون R2 فعال نشده بود، انتظار بایت قدیمی R2 وجود ندارد.
4. پس از تأیید و داشتن Backup امن، `legacy-d1.sql` و `legacy-d1.json` محلی را حذف کنید.
