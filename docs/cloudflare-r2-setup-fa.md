# راه‌اندازی R2 اسکرین‌شات‌ها در Cloudflare

## اقدام دستی لازم (یک‌بار)

1. وارد Cloudflare Dashboard شوید.
2. از بخش **R2 Object Storage** گزینه Create bucket را بزنید.
3. نام bucket را دقیقاً این مقدار قرار دهید:

   `windows-agent-management-screenshots`

4. bucket را Public نکنید. مشاهده خصوصی و لینک عمومی اختیاری از خود Worker ارائه می‌شود.
5. در Worker Builds مطمئن شوید Deploy از شاخه فعال انجام می‌شود. فایل `wrangler.jsonc` binding زیر را دارد:

   - Variable name: `SCREENSHOTS`
   - Bucket: `windows-agent-management-screenshots`

6. Deploy را اجرا کنید. جدول D1 در نخستین درخواست خودکار ساخته می‌شود و اجرای migration دستی لازم نیست.

## بررسی بعد از Deploy

- تب «اسکرین‌شات‌ها» باید بدون خطای binding باز شود.
- اگر پیام `screenshots_r2_binding_missing` دیده شد، binding بالا در Worker > Settings > Bindings اضافه و Worker دوباره Deploy شود.
- بودجه نمایشی را متناسب با برنامه هزینه خود در تب اسکرین‌شات‌ها تنظیم کنید. این عدد quota رسمی Cloudflare را تغییر نمی‌دهد؛ فقط هشدار و محاسبه داخلی است.

## امنیت

- bucket خصوصی باقی بماند.
- Secret یا S3 credential لازم نیست داخل Agent قرار گیرد؛ Agent فقط API مدیریت را با Agent Key صدا می‌زند.
- لینک‌های عمومی از مسیر `/s/<token>` هستند، قابل لغو بوده و نام bucket را افشا نمی‌کنند.
