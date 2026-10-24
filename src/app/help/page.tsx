import Link from "next/link";
import { PageHeader, Banner } from "@/components/ui";
import { Icon } from "@/components/icons";

export default function HelpPage() {
  return (
    <>
      <PageHeader
        eyebrow="راهنما"
        title="چطور این پنل کار می‌کند"
        subtitle="این سایت فقط از راه گیت‌هاب و فایل‌های گزارش با پنل ویندوز حرف می‌زند؛ به سورس برنامه دسترسی ندارد و نباید داشته باشد."
        actions={
          <>
            <Link href="/settings" className="btn btn-small">
              <Icon name="settings" size={14} />
              تنظیمات
            </Link>
            <Link href="/prompt" className="btn btn-small btn-primary">
              <Icon name="send" size={14} />
              ارسال پرامپت
            </Link>
          </>
        }
      />

      <div className="anchor-nav" style={{ marginBottom: 14 }}>
        <a className="chip" href="#actors">بازیگران</a>
        <a className="chip" href="#flow">گردش کار</a>
        <a className="chip" href="#rules">قواعد فایل</a>
        <a className="chip" href="#rerun">اجرای دوباره</a>
        <a className="chip" href="#formats">قالب گزارش‌ها</a>
        <a className="chip" href="#setup">راه‌اندازی</a>
        <a className="chip" href="#test">تست دستی</a>
      </div>

      <section id="actors" className="card help-anchor" style={{ marginBottom: 14 }}>
        <div className="card-head">
          <h2>
            <Icon name="layers" size={17} />
            بازیگران
          </h2>
        </div>
        <div className="actor-grid">
          <div className="actor-card">
            <b>ایجنت مادر</b>
            <span>سورس برنامه ویندوز (app.py و run.bat) را می‌نویسد و نسخه می‌دهد. این پنل فقط می‌خواند و هرگز در آن کامیت نمی‌کند.</span>
          </div>
          <div className="actor-card">
            <b>ایجنت همکار</b>
            <span>کدهای پایتون را در ریشه‌ی مخزن خودش، با نام job_*.py می‌نویسد و پوش می‌کند.</span>
          </div>
          <div className="actor-card">
            <b>پنل ویندوز</b>
            <span>کدها را از گیت‌هاب می‌گیرد، در Desktop\CODES می‌نویسد، اجرا می‌کند و نتیجه را در My Drive\Windows-Agent-DB\logs ذخیره می‌کند.</span>
          </div>
          <div className="actor-card">
            <b>ایجنت مدیریت (این سایت)</b>
            <span>نظارت می‌کند، اجرای دوباره را با یک کامیت کوچک راه می‌اندازد و پرامپت را در مخزن همکار ثبت می‌کند.</span>
          </div>
        </div>
        <div className="callout" style={{ marginTop: 12 }}>
          <strong>قانون ثابت:</strong> برنامه‌ی ویندوز خودش را از گیت‌هاب به‌روز نمی‌کند. به‌روزرسانی فقط با دست انسان و
          GitHub Desktop انجام می‌شود. این پنل هم هیچ تلاشی برای عوض کردن app.py نمی‌کند.
        </div>
      </section>

      <section id="flow" className="card help-anchor" style={{ marginBottom: 14 }}>
        <div className="card-head">
          <h2>
            <Icon name="arrow-left" size={17} />
            گردش کار
          </h2>
          <span className="card-head-sub">از پرامپت تا گزارش</span>
        </div>
        <div className="flow">
          <div className="flow-step">
            <span className="flow-icon"><Icon name="send" size={17} /></span>
            <b>۱. پرامپت اختصاصی Arena</b>
            <span>متن و تنظیم گزارش تلگرام با شناسه‌ی یکتا داخل job_arena.py کامیت می‌شود.</span>
          </div>
          <div className="flow-step">
            <span className="flow-icon"><Icon name="download" size={17} /></span>
            <b>۲. دریافت</b>
            <span>پنل ویندوز زیپ مخزن را می‌گیرد و فایل تازه را در CODES می‌نویسد.</span>
          </div>
          <div className="flow-step">
            <span className="flow-icon"><Icon name="play" size={17} /></span>
            <b>۳. تحویل به Arena</b>
            <span>پایتون ویندوز صفحه‌ی Arena را باز می‌کند و متن PROMPT_TEXT را در کادر گفتگو تایپ و ارسال می‌کند.</span>
          </div>
          <div className="flow-step">
            <span className="flow-icon"><Icon name="report" size={17} /></span>
            <b>۴. گزارش یا اصلاح</b>
            <span>موفقیت گزارش می‌شود؛ در خطای job_arena.py، لاگ و اسکرین‌شات ذخیره و پیام بازنویسی کد تا سه بار به ایجنت همکار برمی‌گردد.</span>
          </div>
        </div>
      </section>

      <div className="help-grid">
        <section id="rules" className="card help-anchor">
          <div className="card-head">
            <h2>
              <Icon name="shield" size={17} />
              قواعد فایل
            </h2>
          </div>
          <ul className="rules-list">
            <li><span className="rule-check"><Icon name="check" size={13} /></span>فقط در ریشه‌ی مخزن، با نام <span className="mono">job_*.py</span>؛ فایل داخل پوشه دیده نمی‌شود.</li>
            <li><span className="rule-check"><Icon name="check" size={13} /></span>یک فایل مستقل؛ بدون import از فایل کمکی همسایه.</li>
            <li><span className="rule-check"><Icon name="check" size={13} /></span>فقط کتابخانه‌ی استاندارد پایتون ۳.۹+؛ هیچ pip install روی سیستم کاربر انجام نمی‌شود.</li>
            <li><span className="rule-check"><Icon name="check" size={13} /></span>بدون <span className="mono">input()</span> و بدون نیاز به کنسول تعاملی.</li>
            <li><span className="rule-check"><Icon name="check" size={13} /></span>حداکثر ۶۰۰ ثانیه؛ بعد از آن پروسه کشته می‌شود.</li>
            <li><span className="rule-check"><Icon name="check" size={13} /></span>بدون مسیر مطلق ویندوزی؛ از Path.home() یا متغیر محیطی استفاده کنید.</li>
            <li><span className="rule-check"><Icon name="check" size={13} /></span>خروجی متنی با print() تا در گزارش دیده شود.</li>
            <li><span className="rule-check"><Icon name="check" size={13} /></span>نام فایل فقط حروف لاتین، عدد و زیرخط.</li>
          </ul>
          <p className="feedback">
            فرم پرامپت، کد را پیش از کامیت با همین قواعد بررسی می‌کند. خطاها مانع کامیت‌اند و هشدارها فقط یادآوری‌اند.
          </p>
        </section>

        <section id="rerun" className="card help-anchor">
          <div className="card-head">
            <h2>
              <Icon name="play" size={17} />
              اجرای دوباره چطور کار می‌کند؟
            </h2>
          </div>
          <p className="prose">
            پنل ویندوز تازگی را از <strong>محتوای فایل</strong> می‌فهمد: اگر فایل در CODES نباشد یا هش sha256 آن با
            نسخه‌ی گیت‌هاب فرق کند، آن را تازه می‌داند. بنابراین دکمه‌ی اجرای دوباره، یک کامیت واقعی می‌زند و یک خط
            نشانه به بالای همان فایل اضافه می‌کند:
          </p>
          <pre className="code-block" style={{ marginTop: 8 }}>
{`# rerun: ۱۴۰۵/۰۸/۰۱ — ۲۳:۵۰:۱۲ تهران — 9f3a1c
# -*- coding: utf-8 -*-
"""job_example.py — ..."""`}
          </pre>
          <p className="prose" style={{ marginTop: 8 }}>
            <strong>version.txt بی‌اثر است.</strong> آن فایل فقط نسخه‌ی خود برنامه است؛ تغییرش هیچ اجرایی را تحریک
            نمی‌کند و کامیت خالی هم چون هش محتوا را عوض نمی‌کند، بی‌فایده است.
          </p>
        </section>

        <section id="formats" className="card help-anchor">
          <div className="card-head">
            <h2>
              <Icon name="terminal" size={17} />
              قالب نتیجه‌ی اجرا
            </h2>
          </div>
          <pre className="code-block">
{`نتیجه اجرای کد Arena
==========================================================
فایل: job_wikipedia.py
شروع: 2 آبان 1405 — 00:36:39 تهران
مدت: 0.0 ثانیه
کد خروج: 0

----- خروجی -----
در حال باز کردن ویکی‌پدیا...
ویکی‌پدیا در مرورگر باز شد

----- خطاها -----
(خالی)`}
          </pre>
          <p className="feedback">خط «کد خروج: 0» موفقیت را مشخص می‌کند؛ هر مقدار دیگر خطا یا Timeout است.</p>
        </section>

        <section className="card help-anchor">
          <div className="card-head">
            <h2>
              <Icon name="alert" size={17} />
              قالب فایل خطا
            </h2>
          </div>
          <pre className="code-block">
{`==============================================================
زمان: 2 آبان 1405 — 02:03:03 تهران
موضوع: دریافت مخزن ایجنت همکار ممکن نشد
نسخه برنامه: 1.6
آدرس: soheylfriend-MAJIDgit/Windows-Agent-hamkar @ arena/...
احتمال: قطع بودن اینترنت، فیلتر بودن گیت‌هاب، یا اشتباه بودن نام مخزن/شاخه.`}
          </pre>
          <p className="feedback">فایل‌ها روزانه‌اند: errors_1405-08-02.txt؛ بلوک‌ها با ۶۲ علامت = جدا می‌شوند.</p>
        </section>

        <section id="setup" className="card help-anchor full">
          <div className="card-head">
            <h2>
              <Icon name="database" size={17} />
              راه‌اندازی روی کلادفلر
            </h2>
            <span className="card-head-sub">کمترین مداخله‌ی دستی</span>
          </div>
          <div className="help-grid" style={{ gap: 12 }}>
            <div>
              <h3 style={{ marginBottom: 4 }}>۱. استقرار</h3>
              <pre className="code-block">{`npm install
npx wrangler login
npm run deploy`}</pre>
              <p className="prose" style={{ marginTop: 6 }}>
                <strong>D1 خودکار ساخته می‌شود.</strong> wrangler نسخه ۴٫۴۵+ دیتابیس را از روی نام می‌سازد و شناسه را
                در wrangler.jsonc می‌نویسد. جدول‌ها هم در اولین درخواست به‌صورت خودکار ساخته می‌شوند
                (CREATE TABLE IF NOT EXISTS).
              </p>
            </div>
            <div>
              <h3 style={{ marginBottom: 4 }}>۲. کلیدها</h3>
              <pre className="code-block">{`wrangler secret put GITHUB_TOKEN
wrangler secret put MANAGER_PASSCODE
# اختیاری — گزارش‌های درایو:
wrangler secret put GOOGLE_SERVICE_ACCOUNT_JSON
wrangler secret put GOOGLE_DRIVE_LOGS_FOLDER_ID`}</pre>
              <p className="prose" style={{ marginTop: 6 }}>
                توکن فقط سمت سرور است و هرگز به مرورگر نمی‌رود. بدون توکن، سایت فقط خواندنی می‌شود.
              </p>
            </div>
            <div>
              <h3 style={{ marginBottom: 4 }}>۳. اجرای محلی</h3>
              <pre className="code-block">{`npm run dev        # D1 محلی + Hot Reload
npm run preview    # اجرای واقعی Worker
npm run self-test  # آزمون پارسرها و قواعد`}</pre>
              <p className="prose" style={{ marginTop: 6 }}>
                برای اجرای محلی، کلیدها را در <span className="mono">.dev.vars</span> بگذارید (این فایل در gitignore است).
              </p>
            </div>
            <div>
              <h3 style={{ marginBottom: 4 }}>۴. درایو</h3>
              <p className="prose">
                پوشه‌ی <span className="mono">Windows-Agent-DB/logs</span> را با ایمیل حساب سرویس (دسترسی بیننده) به
                اشتراک بگذارید. شناسه‌ی پوشه از انتهای آدرس آن گرفته می‌شود. همگام‌سازی خودکار هر چند دقیقه انجام
                می‌شود؛ برای نتیجه‌ی فوری، فایل را دستی در گزارش اجرا وارد کنید.
              </p>
            </div>
          </div>
          <div className="callout" style={{ marginTop: 12 }}>
            کل درخواست‌های گیت‌هاب سمت سرور انجام می‌شود. خواندن فهرست با زیپ <span className="mono">codeload.github.com</span>{" "}
            است (بدون محدودیت نرخ ۶۰ درخواستی API)، و نوشتن با Contents API و توکن سرور.
          </div>
        </section>

        <section id="test" className="card help-anchor full">
          <div className="card-head">
            <h2>
              <Icon name="check-circle" size={17} />
              تست دستی مسیرهای اصلی
            </h2>
          </div>
          <div className="help-grid" style={{ gap: 12 }}>
            <ol className="steps">
              <li>
                <strong>خواندن مخزن</strong>
                صفحه‌ی فهرست کدها را باز کنید؛ باید همان ۵ فایل job_*.py با حجم و تاریخ دیده شوند. اگر گیت‌هاب قطع باشد،
                بنر زرد و داده‌ی ذخیره‌شده نمایش داده می‌شود.
              </li>
              <li>
                <strong>مشاهده کد</strong>
                روی «مشاهده کد» بزنید؛ کد با هایلایت و شماره خط می‌آید و از D1 خوانده می‌شود.
              </li>
              <li>
                <strong>اجرای دوباره</strong>
                تأیید درون‌خطی را بزنید؛ یک کامیت با پیام فارسی و تاریخ جلالی ساخته می‌شود. در گیت‌هاب، خط rerun بالای
                فایل را ببینید. سپس پنل ویندوز (حالت خودکار) آن را اجرا می‌کند.
              </li>
            </ol>
            <ol className="steps" start={4}>
              <li>
                <strong>ارسال پرامپت به Arena</strong>
                متن را بنویسید و نوع گزارش تلگرام را انتخاب کنید؛ پس از ارسال، مقدار PROMPT_TEXT و شناسه‌ی یکتای
                درخواست در job_arena.py کامیت می‌شود و فایل با چیپ «در انتظار» می‌آید.
              </li>
              <li>
                <strong>گزارش</strong>
                یا درایو را همگام کنید، یا متن فایل نتیجه را در «ورود دستی» بچسبانید؛ باید کارت نتیجه با کد خروج ۰ و
                خروجی متنی دیده شود.
              </li>
              <li>
                <strong>خطا</strong>
                یک فایل errors_*.txt را دستی وارد کنید؛ بلوک‌ها در تب خطاها با رنگ قرمز نمایش داده می‌شوند.
              </li>
            </ol>
          </div>
        </section>

        <section className="card full">
          <div className="card-head">
            <h2>
              <Icon name="info" size={17} />
              پرسش‌های پرتکرار
            </h2>
          </div>
          <div className="prose">
            <p>
              <strong>چرا دکمه‌ی اجرای دوباره کامیت می‌زند؟</strong> چون برنامه‌ی ویندوز فقط تغییر محتوا را باور می‌کند؛
              کامیت خالی یا تغییر version.txt، هش فایل را عوض نمی‌کند.
            </p>
            <p>
              <strong>چرا نتیجه فوراً نمی‌آید؟</strong> همگام‌سازی گوگل درایو ۱ تا ۳ دقیقه تأخیر دارد. تا آن زمان
              می‌توانید فایل را دستی وارد کنید.
            </p>
            <p>
              <strong>اگر توکن نباشد چه می‌شود؟</strong> خواندن کدها و گزارش‌ها کار می‌کند، اما «اجرای دوباره» و
              «ارسال پرامپت» غیرفعال است.
            </p>
            <p>
              <strong>آیا سایت به سورس برنامه دسترسی دارد؟</strong> نه. فقط زیپ مخزن همکار و فایل‌های گزارش خوانده
              می‌شوند.
            </p>
          </div>
        </section>
      </div>

      <Banner tone="info" title="یادآوری امنیتی">
        آدرس عمومی این پنل را بدون <span className="mono">MANAGER_PASSCODE</span> رها نکنید. توکن گیت‌هاب فقط در
        secret سمت سرور نگه‌داری می‌شود و در هیچ پاسخی به مرورگر برنمی‌گردد.
      </Banner>
    </>
  );
}
