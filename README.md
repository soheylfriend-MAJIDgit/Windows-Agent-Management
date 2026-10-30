# Windows Agent Management

کنترل‌پلین فارسی و راست‌به‌چپ برای مدیریت Windows Agent، کاتالوگ اتوماسیون‌ها، صف فرمان، گزارش‌ها و اسکرین‌شات‌ها.

## معماری فعلی

- **میزبانی:** Vercel + Next.js 16
- **داده ساخت‌یافته:** PostgreSQL از طریق Prisma
- **بایت تصاویر:** Vercel Blob
- **خواندن GitHub:** آرشیو ZIP از `codeload.github.com`
- **نوشتن GitHub:** Contents API با `GITHUB_TOKEN` فقط در سرور
- **تاریخ نمایشی:** جلالی، منطقه زمانی تهران و ارقام فارسی
- **ذخیره‌سازی بازنشسته:** Google Drive برای Screenshot و Report جدید استفاده نمی‌شود.

کد پایه‌ی Mother (`Windows-Agent/app.py`) فقط با تأیید جداگانه انسان تغییر می‌کند. این سایت به‌طور خودکار در مخزن Mother کامیت نمی‌کند.

## امکانات اصلی

- کشف و پایش Agentها با Heartbeat اینترنتی
- Agent Key با Scopeهای صریح و قابل لغو
- صف فرمان، تأیید انسانی، توقف، timeout و Timeline تشخیصی
- کاتالوگ نسخه‌دار اتوماسیون‌ها در PostgreSQL
- گالری تصاویر با مشاهده دقیق، حذف، مصرف فضا و لینک عمومی تصادفی/قابل لغو
- ثبت بایت تصویر در Blob و فراداده آن در PostgreSQL
- UI فارسی responsive بدون اسکرول افقی موبایل

## راه‌اندازی محلی

پیش‌نیاز: Node.js 22+ و یک PostgreSQL قابل دسترس.

```bash
npm install
cp .env.example .env.local
# DATABASE_URL را تکمیل کنید؛ برای Blob محلی از vercel dev/env pull استفاده کنید.
npm run db:migrate
npm run dev
```

آدرس محلی: `http://localhost:3000`

فرمان‌های بررسی:

```bash
npm run typecheck
npm run build
npm run db:status
npm run lint:job -- --dir .
```

## استقرار در Vercel

1. مخزن GitHub را به یک Vercel Project متصل کنید.
2. در تب **Storage** یک PostgreSQL سازگار (Prisma Postgres یا Neon) بسازید/متصل کنید.
3. متغیر `DATABASE_URL` را برای Production و Preview تنظیم کنید.
4. در **Storage → Blob** یک Blob Store عمومی بسازید و به Project متصل کنید؛ Vercel متغیر `BLOB_STORE_ID` و دسترسی OIDC را فراهم می‌کند.
5. `MANAGER_PASSCODE` و یک `AUTH_SECRET` تصادفی و طولانی را در Environment Variables ثبت کنید.
6. در صورت نیاز به نوشتن در GitHub، `GITHUB_TOKEN` را فقط به‌عنوان Server Secret ثبت کنید.
7. Redeploy کنید. اسکریپت `vercel-build` ابتدا migrationهای Prisma را اجرا و سپس Next.js را Build می‌کند.
8. `/api/health?deep=1`، صفحه `/database` و سپس Upload یک تصویر آزمایشی را بررسی کنید.

راهنمای مرحله‌به‌مرحله Storage در [`docs/vercel-storage-setup-fa.md`](docs/vercel-storage-setup-fa.md) است. برای انتقال رکوردهای قدیمی D1، [`docs/d1-to-postgres-data-migration-fa.md`](docs/d1-to-postgres-data-migration-fa.md) را دنبال کنید.

## متغیرهای محیطی

| نام | وضعیت | کاربرد |
| --- | --- | --- |
| `DATABASE_URL` | الزامی | اتصال PostgreSQL برای Prisma و migrationها |
| `BLOB_STORE_ID` | خودکار در Vercel | شناسه Blob Store؛ احراز هویت نوشتن با OIDC انجام می‌شود |
| `BLOB_READ_WRITE_TOKEN` | فقط توسعه محلی قدیمی | جایگزین اختیاری OIDC برای اجرای خارج Vercel |
| `MANAGER_PASSCODE` | اختیاری | اگر خالی باشد سایت بدون صفحه ورود باز است |
| `AUTH_SECRET` | فقط همراه Passcode | امضای نشست مدیریتی |
| `GITHUB_TOKEN` | برای عملیات نوشتن | Contents: Read/Write روی مخزن مجاز |
| `COLLAB_OWNER/REPO/BRANCH` | اختیاری | مقصد پیش‌فرض مخزن همکار |
| `MOTHER_OWNER/REPO/BRANCH` | اختیاری | مرجع خواندنی Mother |

هیچ متغیر حساس نباید با پیشوند `NEXT_PUBLIC_` تعریف شود.

## قرارداد Screenshot Agent

Endpoint ثابت است:

```text
POST /api/agent/screenshots
Authorization: Bearer <AGENT_KEY>
Content-Type: multipart/form-data
```

- Scope لازم: `artifacts:write`
- فرمت: PNG/JPEG/WebP
- حداکثر اندازه: **۴ MiB** (کمتر از سقف درخواست Vercel Function)
- مشاهده Agent: `artifacts:read`
- حذف Agent: `artifacts:delete`
- مدیر واردشده می‌تواند مشاهده، اشتراک‌گذاری و حذف کند.
- لینک عمومی تصادفی، قابل لغو و بدون نام حساس فایل است.

جزئیات Mother در [`docs/windows-agent-mother-vercel-screenshots.md`](docs/windows-agent-mother-vercel-screenshots.md) آمده است.

## Prisma و Schema

- Schema تعریف اتصال: `prisma/schema.prisma`
- Migration پایه: `prisma/migrations/20261031000000_init/migration.sql`
- helperهای پایدار برنامه: `src/lib/db.ts`
- Queryهای قدیمی با placeholder `?` در adapter داخلی به placeholderهای PostgreSQL تبدیل می‌شوند.
- `ensureSchema()` فقط bootstrap دفاعی و idempotent است؛ مسیر استاندارد Production، `prisma migrate deploy` است.

## امنیت و محدودیت‌ها

- Blob token، Database URL، GitHub token و کلیدهای ورود فقط سمت سرور هستند.
- Blob Store عمومی است؛ URL خام در فهرست API منتشر نمی‌شود، ولی هرکس URL مستقیم Blob را داشته باشد می‌تواند فایل را ببیند.
- Blob objectها نام تصادفی دارند. لینک اشتراک از `/s/<token>` قابل لغو است.
- فایل تازه Screenshot/Report به Google Drive ارسال نمی‌شود.
- موفقیت اجرای Windows فقط با متن گزارش اثبات نمی‌شود؛ تصویر واقعی باید بررسی شود.
- عملیات خودکار Arena و عملیات دستی از هم جدا باقی می‌مانند.
