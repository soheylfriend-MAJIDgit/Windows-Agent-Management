# نامه اجرایی به ایجنت مادر Windows Agent — هماهنگ‌سازی با Vercel

**مخاطب:** ایجنت مادر مخزن `soheylfriend-MAJIDgit/Windows-Agent`  
**فرستنده:** ایجنت مدیریت Windows Agent Management  
**وضعیت درخواست:** مجاز به پیاده‌سازی پس از بررسی قرارداد و حفظ مرزهای ایمنی  
**تاریخ:** ۱۴۰۵/۰۸/۰۹ — منطقه زمانی تهران

## خلاصه تصمیم

زیرساخت سایت مدیریت با موفقیت از Cloudflare به Vercel منتقل و در Production فعال شده است:

- آدرس رسمی جدید: `https://windows-agent-management.vercel.app`
- Hosting و API: Vercel + Next.js
- داده ساخت‌یافته: Prisma Postgres
- بایت Screenshot: Vercel Blob عمومی با Object name تصادفی
- دسترسی نوشتن Blob: OIDC سمت سرور Vercel؛ Windows Agent هیچ Blob token یا Database URL دریافت نمی‌کند.
- Google Drive برای Screenshot، Report و Artifact تازه بازنشسته است.
- D1 و R2 دیگر بخشی از مسیر Production نیستند.
- سایت طبق تصمیم مالک بدون `MANAGER_PASSCODE` باز است؛ این موضوع هیچ تغییری در احراز هویت Agent ایجاد نمی‌کند. تمام endpointهای Agent همچنان Bearer Agent Key و Scope صریح می‌خواهند.

Production و migration پایه PostgreSQL با موفقیت Deploy شده‌اند. از ایجنت مادر می‌خواهیم کد پایه Windows Agent و `manager_client.py` را با قرارداد زیر هماهنگ کند.

## مجوز و مرز مسئولیت

این نامه مجوز مالک برای آماده‌سازی و اعمال تغییرات لازم در Windows Agent است. با این حال:

1. فقط ایجنت مادر مجاز به تغییر `app.py`، `run.bat` و کد پایه Windows Agent است.
2. ایجنت مدیریت مستقیماً در مخزن Mother کد نمی‌نویسد.
3. اجرای فرمان آزاد، shell آزاد، خودبه‌روزرسانی بدون تأیید و افشای Secret همچنان ممنوع است.
4. سرویس دستی و سرویس خودکار Arena باید جدا بمانند.
5. هر اجرای Windows باید قابل توقف، دارای stage و timestamp، و همراه با ثبت anomaly باشد.
6. موفقیت اجرای بصری فقط با متن پذیرفته نیست؛ Screenshot واقعی مرحله باید قابل بررسی باشد.

## تغییر اول — آدرس Control Plane

مقدار `base_url` ذخیره‌شده با DPAPI باید به آدرس زیر تغییر کند:

```text
https://windows-agent-management.vercel.app/api/agent
```

نمونه تنظیم رمزنگاری‌شده پیش از DPAPI:

```json
{
  "base_url": "https://windows-agent-management.vercel.app/api/agent",
  "agent_key": "wam_agent_..."
}
```

الزامات:

- URL قدیمی `workers.dev` فقط برای تشخیص و پیام مهاجرت قابل خواندن است و نباید مقصد درخواست تازه باشد.
- مهاجرت URL باید یک‌بار، شفاف و با log بدون Secret انجام شود.
- Agent Key فعلی فقط در صورت معتبر بودن قابل نگه‌داری است؛ در غیر این صورت مالک از صفحه «کلید ایجنت» کلید تازه می‌سازد.
- Bearer key، Cookie، Authorization و URLهای دارای Secret هرگز log نشوند.

## تغییر دوم — Scopeهای لازم Agent

کلید Windows Agent اصلی باید حداقل Scopeهای زیر را داشته باشد:

```text
heartbeat:write
commands:read
events:write
results:write
artifacts:write
automations:read
```

- `artifacts:read` فقط برای Agentی لازم است که باید گالری را بخواند.
- `artifacts:delete` فقط برای Agent مدیریتی مجاز به حذف داده شود؛ به همه Agentها داده نشود.
- HTTP 401 یعنی کلید نامعتبر/لغوشده/منقضی؛ retry سریع ممنوع و وضعیت محلی باید «کلید نامعتبر» شود.
- HTTP 403 یعنی Scope ناکافی؛ نام عملیات و Scope لازم بدون چاپ کلید log شود.

## تغییر سوم — Heartbeat و Capability

چرخه Heartbeat و Command Plane قبلی حفظ شود، اما capability و state ذخیره‌سازی به شکل زیر گزارش شوند:

```json
{
  "capabilities": {
    "command_plane": true,
    "vercel_blob_screenshot_upload": true,
    "google_drive_artifacts": false
  },
  "state": {
    "manager_base": "vercel",
    "drive": false
  }
}
```

- `r2_screenshot_upload` دیگر capability فعال نیست؛ در صورت نیاز فقط برای خواندن state قدیمی شناخته شود.
- `d1_automations` در نسخه بعدی به نام خنثی `database_automations` گزارش شود. در دوره گذار می‌توان هر دو نام را ارسال کرد تا سازگاری حفظ شود.
- timestampها در انتقال UTC/ISO و نمایش UI محلی جلالی/تهران بماند.

## تغییر چهارم — Upload مستقیم Screenshot به API مدیریت

Windows Agent نباید مستقیم با Vercel Blob صحبت کند. تنها مسیر مجاز:

```http
POST https://windows-agent-management.vercel.app/api/agent/screenshots
Authorization: Bearer <AGENT_KEY>
Content-Type: multipart/form-data; boundary=...
Accept: application/json
```

فیلدها:

| فیلد | وضعیت | توضیح |
| --- | --- | --- |
| `file` | الزامی | PNG، JPEG یا WebP؛ حداکثر ۴ MiB |
| `commandId` | برای اجرای فرمان الزامی | باید متعلق به همان Agent Key باشد |
| `executionId` | توصیه‌شده | شناسه پایدار اجرای محلی |
| `agentId` | توصیه‌شده | شناسه پایدار Windows Agent |
| `stage` | الزامی برای پایش | نام دقیق مرحله |
| `name` | توصیه‌شده | نام امن فایل؛ نام حساس استفاده نشود |
| `occurredAt` | توصیه‌شده | UTC/ISO |
| `width`, `height` | اختیاری | اعداد صحیح مثبت |

پاسخ موفق HTTP 201:

```json
{
  "ok": true,
  "screenshot": {
    "id": "shot_...",
    "commandId": "cmd_...",
    "stage": "prompt_submitted",
    "contentUrl": "/api/screenshots/shot_.../content"
  }
}
```

نکات قطعی:

1. سقف ۴ MiB مربوط به محدودیت Server Upload در Vercel است. تصویر پیش از Upload با حفظ خوانایی فشرده/resize شود.
2. موفقیت فقط با HTTP 201 و JSON معتبر پذیرفته شود.
3. deduplication سرور بر اساس Agent، command، stage و SHA-256 انجام می‌شود؛ client نیز Upload موفق را idempotent نگه دارد.
4. `contentUrl` نسبی است و برای log مرجع مناسب است؛ Agent نباید URL داخلی Blob را استخراج یا ذخیره کند.
5. Blob Store عمومی است، اما نام Object تصادفی است. Agent حق انتشار URL خام Blob را ندارد.

## صف Upload و رفتار هنگام قطعی

1. تصویر ابتدا در پوشه محلی متعلق به همان execution نوشته و فایل کامل بسته شود.
2. Upload در نخ شبکه جدا از UI و process monitor انجام شود.
3. در خطای موقت، صف پایدار محلی با backoff نگه‌داری شود: ۵، ۱۵، ۳۰ و سپس ۶۰ ثانیه.
4. retry نباید تعامل Arena را تکرار کند یا Screenshot جدیدِ تکراری بگیرد.
5. خطای موقت Upload به‌تنهایی اجرای اصلی را fail نکند، ولی event سطح `warning` با stage و attempt ثبت شود.
6. خطای 401/403 retry کور نشود.
7. خطای 413 باعث retry همان فایل نشود؛ تصویر یک‌بار با کیفیت قابل قبول کوچک و سپس دوباره ارسال شود.
8. بعد از Upload موفق، `screenshot.id` در event مرحله ثبت و فایل محلی طبق retention پاک شود.
9. هنگام shutdown، صف و state بدون خراب‌شدن فایل ذخیره شوند؛ Secret داخل صف نوشته نشود.

## گزارش‌ها و Artifactها — Google Drive ممنوع

از این نسخه هیچ Screenshot، Report، فایل کنترل یا Artifact تازه‌ای نباید به Google Drive برود.

- stage، log محدود و anomaly از `/commands/{commandId}/events` ارسال شوند.
- وضعیت و نتیجه نهایی از `/commands/{commandId}` ارسال شوند.
- Screenshot فقط از `/screenshots` Upload شود.
- endpoint قدیمی `/commands/{commandId}/artifacts` فقط برای metadata سازگارِ Artifactهای غیرتصویری موجود قابل استفاده است؛ `driveFileId` و `driveUrl` تازه تولید نشوند.
- گزارش متنی بزرگ طبق پروتکل chunk موجود Agent Report ارسال شود؛ در payload نتیجه نهایی یا event بزرگ جاسازی نشود.
- `googleapiclient`، Service Account، Folder ID، sync پوشه و retry مربوط به Drive از مسیر فعال Screenshot/Report حذف شوند.
- داده تاریخی Drive می‌تواند فقط خواندنی باقی بماند؛ مسیر نوشتن جدید ممنوع است.

## Command Plane که نباید شکسته شود

مهاجرت Storage نباید این رفتارها را تغییر دهد:

- Claim فرمان فقط از allowlist.
- بررسی `requiresConfirmation` طبق حالت دستی/خودکار محلی.
- eventهای دارای `seq` صعودی.
- Poll لغو هنگام انتظار و اجرا.
- اجرای subprocess با process group مستقل و توقف کامل tree با `taskkill /T /F`.
- timeout، no-progress و fatal anomaly مستقل از اتصال شبکه.
- عدم تکرار prompt هنگام جست‌وجوی composer.
- موفقیت بصری فقط بعد از مشاهده Screenshot مرحله و نتیجه واقعی.

برای هر مرحله قابل مشاهده، ابتدا Screenshot واقعی گرفته و سپس همان فایل با `commandId` و `stage` صحیح Upload شود. ثبت متن «تصویر گرفته شد» بدون Upload موفق یا امکان مشاهده تصویر، موفقیت محسوب نمی‌شود.

## پاک‌سازی تنظیمات قدیمی

ایجنت مادر باید موارد زیر را پیدا، غیرفعال و در صورت بی‌استفاده‌بودن حذف کند:

- URLهای `workers.dev` مربوط به سایت مدیریت قدیمی
- نام‌های Cloudflare D1/R2 در پیام‌ها و capability فعال
- Drive uploader و Drive sync برای داده تازه
- `GOOGLE_SERVICE_ACCOUNT_JSON*`
- `GOOGLE_DRIVE_*_FOLDER_ID`
- ساخت `driveFileId` و `driveUrl` تازه
- هر مسیر fallback که پس از شکست API دوباره به Drive بنویسد

Fallback مجاز فقط صف محلی امن است، نه Google Drive.

## لاگ‌ها و خطاهای قابل اقدام

حداقل stageهای زیر با timestamp و outcome ثبت شوند:

```text
screenshot_captured
screenshot_normalized
screenshot_upload_queued
screenshot_upload_started
screenshot_upload_succeeded
screenshot_upload_retry_scheduled
screenshot_upload_failed_permanent
```

در log موفق: `commandId`, `executionId`, `stage`, اندازه، SHA-256 کوتاه، attempt و `screenshot.id`.  
در log خطا: HTTP status، error code فارسی سرور، retryability و زمان retry.  
ممنوع: Agent Key، Authorization، Database URL، Blob credential، Cookie و محتوای حساس تصویر.

## برنامه آزمون پذیرش الزامی

ایجنت مادر پس از پیاده‌سازی باید این نتایج را با timestamp گزارش کند:

1. Heartbeat به Production جدید و نمایش Online در سایت.
2. تست رفت‌وبرگشت «سلام ایجنت مدیریت.»
3. Claim یک فرمان آزمایشی و ثبت stageها.
4. Upload یک PNG واقعی کمتر از ۴ MiB با `commandId` صحیح.
5. بازکردن همان Screenshot از گالری و تأیید چشمی اینکه تصویر دقیقاً متعلق به همان stage است.
6. Upload دوباره همان فایل و اثبات عدم ایجاد duplicate ناخواسته.
7. قطع اینترنت، تشکیل صف، وصل مجدد و Upload دقیقاً یک‌باره.
8. آزمون فایل بالای ۴ MiB و resize کنترل‌شده بدون loop.
9. آزمون 401 و 403 بدون retry سریع و بدون چاپ Secret.
10. لغو فرمان هنگام Upload/retry و توقف process tree در زمان مقرر.
11. حذف Screenshot از سایت و کاهش مصرف Blob.
12. بررسی Google Drive و اثبات اینکه هیچ فایل تازه‌ای ساخته نشده است.
13. restart برنامه در میانه صف و بازیابی امن بدون تکرار اجرای Arena.

## خروجی مورد انتظار از ایجنت مادر

لطفاً پاسخ نهایی شامل این موارد باشد:

- فایل‌ها و توابع تغییرکرده
- commit و branch مربوط به مخزن Mother
- روش migration تنظیم DPAPI به URL جدید
- Scopeهای کلید آزمایش‌شده
- جدول نتایج ۱۳ آزمون بالا
- Screenshot IDهای آزمون و stage متناظر
- anomalyها و تصمیم هرکدام
- تأیید صریح: «هیچ Screenshot یا Report تازه‌ای به Google Drive نوشته نشد.»

تا وقتی آزمون‌های Heartbeat، فرمان، Screenshot واقعی و عدم نوشتن Drive کامل نشده‌اند، کار «تمام‌شده» اعلام نشود.
