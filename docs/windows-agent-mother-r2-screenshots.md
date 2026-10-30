# نامه اجرایی به Windows Agent Mother — مهاجرت کامل تصاویر از Google Drive به R2/D1

## تصمیم قطعی

از این نسخه، Mother نباید هیچ Screenshot، گزارش، فایل کنترل یا Artifact تازه‌ای را به Google Drive بفرستد. مسیر رسمی تصاویر، API مدیریت است؛ مدیریت بایت فایل را در Cloudflare R2 و متادیتا را در D1 نگه می‌دارد.

## قرارداد Upload

`POST {MANAGER_BASE_URL}/api/agent/screenshots`

Headers:

- `Authorization: Bearer <AGENT_KEY>`
- بدنه: `multipart/form-data`

Fields:

- `file` الزامی: PNG/JPEG/WebP، حداکثر ۱۰ MiB
- `commandId` اختیاری ولی برای اجرای فرمان الزامی تلقی شود
- `executionId` شناسه اجرای محلی
- `agentId` شناسه پایدار Agent
- `stage` نام دقیق مرحله
- `name` نام فایل
- `occurredAt` زمان UTC/ISO رخداد
- `width`, `height` ابعاد تصویر

پاسخ موفق `201` شامل `screenshot.id` و `screenshot.contentUrl` است.

## نمونه Python بدون SDK خارجی

```python
import json, mimetypes, os, uuid, urllib.request

def upload_screenshot(base_url, agent_key, path, *, command_id=None,
                      execution_id=None, agent_id=None, stage=None,
                      occurred_at=None, width=None, height=None):
    boundary = "----wam-" + uuid.uuid4().hex
    chunks = []
    def field(name, value):
        if value is None:
            return
        chunks.extend([
            f"--{boundary}\r\n".encode(),
            f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode(),
            str(value).encode("utf-8"), b"\r\n",
        ])
    field("commandId", command_id)
    field("executionId", execution_id)
    field("agentId", agent_id)
    field("stage", stage)
    field("occurredAt", occurred_at)
    field("width", width)
    field("height", height)
    name = os.path.basename(path)
    mime = mimetypes.guess_type(name)[0] or "image/png"
    chunks.extend([
        f"--{boundary}\r\n".encode(),
        f'Content-Disposition: form-data; name="file"; filename="{name}"\r\n'.encode(),
        f"Content-Type: {mime}\r\n\r\n".encode(),
        open(path, "rb").read(), b"\r\n",
        f"--{boundary}--\r\n".encode(),
    ])
    request = urllib.request.Request(
        base_url.rstrip("/") + "/api/agent/screenshots",
        data=b"".join(chunks), method="POST",
        headers={
            "Authorization": "Bearer " + agent_key,
            "Content-Type": "multipart/form-data; boundary=" + boundary,
            "Accept": "application/json",
        },
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.load(response)
```

## رفتار الزامی Mother

1. تصویر ابتدا به‌صورت امن در مسیر محلی اجرای متعلق به همان command نوشته شود.
2. پس از بسته‌شدن فایل، Upload اجرا شود.
3. موفقیت فقط با HTTP 201 و پاسخ JSON معتبر ثبت شود.
4. Upload idempotent محلی باشد؛ مسیر/هش موفق دوباره ارسال نشود.
5. در قطع شبکه، صف Upload با backoff نگه داشته شود؛ اجرای اصلی به‌خاطر خطای موقت Upload شکست نخورد، اما anomaly دقیق گزارش شود.
6. پس از Upload موفق، شناسه و URL مدیریت در log مرحله ثبت شود.
7. فایل محلی طبق retention محلی پاک شود؛ هرگز به Drive منتقل نشود.
8. تمام کدهای `googleapiclient`, Service Account, Folder ID و sync پوشه Drive از مسیر Screenshot و Report حذف شوند.
9. Marker قدیمی `SERVICE_ARTIFACT` فقط برای سازگاری لاگ مجاز است؛ مرجع نهایی فایل، پاسخ Upload مدیریت است.
10. قابلیت Heartbeat جدید گزارش شود: `r2_screenshot_upload: true` و `google_drive_artifacts: false`.

## دسترسی

کلید Mother برای Upload باید `artifacts:write` داشته باشد. Agentهایی که باید گالری همه Agentها را بخوانند به `artifacts:read` و Agentهای مجاز به حذف به `artifacts:delete` نیاز دارند. کلید یا Token در log چاپ نشود. برای اصل حداقل دسترسی، scope حذف فقط به Agentهای مدیریتی داده شود.

## آزمون پذیرش

- تصویر PNG واقعی Upload و در تب «اسکرین‌شات‌ها» دیده شود.
- کلیک Thumbnail دقیقاً همان تصویر را باز کند.
- Command و Stage صحیح باشند.
- قطع/وصل اینترنت باعث Upload تکراری نشود.
- حذف از مدیریت، Object را از R2 حذف و مصرف را کم کند.
- هیچ فایل تازه‌ای در Google Drive ایجاد نشود.
