# درخواست فنی برای ایجنت مادر — کنترل مستقیم اینترنتی بدون وابستگی به Drive Desktop

## علت درخواست

پل فعلی `drive-control` سالم اجرا می‌شود، heartbeat می‌فرستد و فرمان revision 1 را با SHA-256 صحیح اجرا کرده است؛ اما ورودی فرمان را از مسیر محلی زیر می‌خواند:

`C:\Users\alibatel\My Drive\Windows-Agent-DB\Wndows-Agent-Management`

پوشه واقعی در Google Drive زیر `Computers / My Computer` قرار دارد. تغییر `COMMAND.json` و `PAYLOAD.py` در Google Drive وب فوراً به این mirror محلی نمی‌رسد. در آزمون زنده، controller چندین دقیقه همچنان `diag-bootstrap-001` را دید، در حالی که نسخه آنلاین روی revision 3 و `direct-dialog-interaction-003` قرار داشت. بنابراین کنترل فعلی اینترنت‌محور است، اما live و مستقیم نیست و برای تعامل UI قابل اتکا نیست.

## درخواست معماری

لطفاً ابتدا فقط طرح و patch پیشنهادی را ارائه کنید؛ بدون تأیید صریح مالک، `app.py` مادر را تغییر ندهید.

یک transport مستقل برای دریافت مستقیم فایل‌های پوشه خصوصی Google Drive از API آنلاین بسازید؛ Drive Desktop و فایل محلی فقط cache اختیاری باشند، نه منبع فرمان.

### الزامات

1. احراز هویت Google OAuth از نوع Desktop/Installed App فقط روی ویندوز انجام شود.
2. refresh token و هر credential فقط با DPAPI در Windows نگهداری شود؛ هیچ secret در PostgreSQL، GitHub، لاگ، URL، چت یا فایل Drive ذخیره نشود.
3. شناسه پوشه فرمان: `1jOlamQWCNbr38-KgvOmA94CdWQwNg1OC`.
4. فایل‌ها بر اساس ID ثابت خوانده و با `files.get`/download مستقیم دریافت شوند:
   - `COMMAND.json`: `1ypV2HwqTSwXQhTRIYuEAuB080JIu-KaE`
   - `PAYLOAD.py`: `1RFVLgm0p7RJuNhZJ48j8pwPR6WIMeiUs`
   - `CONTROL.txt`: `1B9w519L3nCkAnwjnt1t98TE_ZZOQBvzg`
5. polling آنلاین حداکثر هر 3 تا 5 ثانیه باشد و از version/modifiedTime و خواندن پایدار استفاده کند.
6. هنگام نبود اینترنت یا خطای احراز هویت هیچ payloadی اجرا نشود.
7. کنترل‌های protocolVersion، commandId یکتا، revision صعودی، issuedAt/expiresAt، SHA-256، replay protection، timeout و play/pause/stop حفظ شوند.
8. پاسخ‌ها با `files.update` روی ID ثابت فایل‌های خروجی نوشته شوند تا duplicate ساخته نشود: STATUS، RESULT، STDOUT و STDERR.
9. اجرای UI باید در همان نشست interactive کاربر انجام شود تا MessageBox و پنجره تایپ واقعاً روی دسکتاپ دیده شوند؛ اجرای Session 0 مجاز نیست.
10. هر مرحله در PostgreSQL نیز با agent key موجود و DPAPI ثبت شود، اما شکست گزارش PostgreSQL نباید اجرای محلی معتبر را از بین ببرد.
11. یک command پذیرش بسازید که چهار MessageBox بله/خیر و یک TextBox topmost نمایش دهد و پاسخ‌ها را آنلاین بازگرداند.
12. transport جدید در ماژول جدا پیاده‌سازی و تست شود؛ نوشتن کنار فایل پایه یا تغییر مستقیم `app.py` فقط پس از تأیید جداگانه مالک انجام شود.

## معیار پذیرش

- تغییر revision در Google Drive وب ظرف حداکثر 10 ثانیه روی Windows پذیرفته شود.
- چهار دیالوگ بله/خیر و یک ورودی متنی بدون اجرای دستی فایل روی دسکتاپ ظاهر شوند.
- پاسخ‌ها ظرف حداکثر 10 ثانیه در Google Drive وب و PostgreSQL دیده شوند.
- قطع اینترنت باعث توقف کامل تعامل شود و پس از اتصال، بدون replay ادامه یابد.
- هیچ secret یا token در خروجی تشخیصی آشکار نشود.
