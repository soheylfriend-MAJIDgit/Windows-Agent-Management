# راه‌اندازی Vercel، PostgreSQL و Blob

ابزار خودکار پروژه می‌تواند Vercel Project و Environment Variableها را مدیریت کند، اما ساخت Storeهای Marketplace/Storage باید یک‌بار در داشبورد انجام شود.

## ۱. ساخت PostgreSQL

1. Vercel Dashboard را باز کنید و Project `windows-agent-management` را انتخاب کنید.
2. وارد **Storage** شوید و **Create Database** را بزنید.
3. یکی از این دو را انتخاب کنید:
   - **Prisma Postgres**؛ یا
   - **Neon Postgres** از Marketplace.
4. Region نزدیک به کاربران/Functionها را انتخاب و Database را به همین Project متصل کنید.
5. در **Settings → Environment Variables** بررسی کنید `DATABASE_URL` برای Production و Preview موجود است.
6. اگر Integration نام دیگری ساخته است، مقدار URL اتصال pooled و SSLدار را در متغیر جدید `DATABASE_URL` کپی کنید. مقدار را در چت یا Git قرار ندهید.

## ۲. ساخت Vercel Blob

1. در همان Project وارد **Storage** شوید.
2. **Create → Blob** را انتخاب کنید.
3. Store را بسازید و به همین Project متصل کنید.
4. وجود `BLOB_STORE_ID` را در Environment Variables بررسی کنید.
5. Vercel در زمان اجرا OIDC token کوتاه‌عمر فراهم می‌کند؛ Secret ثابتی داخل Windows Agent قرار نمی‌گیرد.

Store عمومی است و Objectها با نام تصادفی ذخیره می‌شوند. برنامه URL خام را در فهرست نمایش نمی‌دهد، ولی هرکس URL مستقیم Blob را داشته باشد می‌تواند فایل را ببیند. لینک اختیاری برنامه همچنان تصادفی و قابل لغو است.

## ۳. متغیرهای امنیتی

در **Settings → Environment Variables** برای Production و Preview ثبت کنید:

- `MANAGER_PASSCODE`: اختیاری؛ اگر نمی‌خواهید صفحه ورود داشته باشید تعریف نکنید.
- `AUTH_SECRET`: فقط وقتی Passcode فعال است.
- `GITHUB_TOKEN`: فقط اگر نوشتن در مخزن لازم است.

برای Local Development همین کلیدها در `.env.local` قرار می‌گیرند؛ این فایل در Git ذخیره نمی‌شود.

## ۴. Migration و Deploy

بعد از اتصال Database و Blob، از Vercel یک Redeploy بزنید. فرمان `vercel-build` این مراحل را اجرا می‌کند:

```bash
prisma generate
prisma migrate deploy
next build
```

Migration پایه همه جدول‌های برنامه را در PostgreSQL می‌سازد. `ensureSchema()` نیز به‌عنوان bootstrap دفاعی، ساختار را idempotent بررسی می‌کند.

## ۵. آزمون پذیرش

1. صفحه `/api/health?deep=1` باید PostgreSQL و Blob را سالم نشان دهد.
2. صفحه `/database` باید Engine را `PostgreSQL / Prisma` و تمام جدول‌ها را Ready نشان دهد.
3. با Agent Key دارای `artifacts:write` یک PNG واقعی کمتر از ۴ MiB Upload کنید.
4. Thumbnail را بزنید و دقیقاً همان تصویر را بررسی کنید.
5. لینک اشتراک بسازید، در پنجره ناشناس باز کنید، سپس لغو و دوباره آزمون کنید.
6. تصویر را حذف کنید و کاهش مصرف را بررسی کنید.
7. مطمئن شوید هیچ فایل تازه‌ای در Google Drive ایجاد نشده است.

## خطاهای رایج

- `database_url_missing`: Database به Project/Environment جاری متصل نیست.
- `db_schema_failed`: URL، SSL، مجوز ساخت جدول یا migration را بررسی کنید.
- `BLOB_STORE_ID` missing: Blob Store به Project متصل نیست یا Redeploy نشده است.
- HTTP 413: تصویر باید حداکثر ۴ MiB باشد.
