import Link from "next/link";
import { PageHeader, Banner } from "@/components/ui";
import { Icon } from "@/components/icons";

export default function HelpPage() {
  return (
    <>
      <PageHeader
        eyebrow="راهنما"
        title="چطور این پنل کار می‌کند"
        subtitle="چهار ایجنت با مرز مسئولیت روشن: سایت مدیریت از راه PostgreSQL، کلید ایجنت، گیت‌هاب و گزارش‌ها ویندوز را پایش و فرماندهی می‌کند، بدون تغییر خودکار کد پایه."
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
        <a className="chip" href="#manager-link">اتصال مدیریت</a>
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
            <b>۱. ایجنت ویندوز</b>
            <span>برنامه‌ی در حال اجرا روی ویندوز؛ کدها را دریافت و اجرا می‌کند، وضعیت و Heartbeat می‌فرستد و نتیجه، لاگ و مشخصات اسکرین‌شات‌ها را گزارش می‌دهد.</span>
          </div>
          <div className="actor-card">
            <b>۲. ایجنت مادر</b>
            <span>سازنده‌ی اصلی ایجنت ویندوز و تنها مسئول کدهای پایه مانند app.py و run.bat؛ اتصال manager_client.py را با تأیید کاربر به برنامه وصل می‌کند.</span>
          </div>
          <div className="actor-card">
            <b>۳. ایجنت همکار</b>
            <span>کدهای اتوماسیون job_*.py را می‌نویسد، اما به کدهای پایه‌ی برنامه‌ی ویندوز دسترسی ندارد.</span>
          </div>
          <div className="actor-card">
            <b>۴. ایجنت مدیریت (این سایت)</b>
            <span>ویندوز را می‌بیند و پایش می‌کند، از راه PostgreSQL فرمان می‌دهد، گزارش و اتصال را بررسی می‌کند، کدنویسی می‌کند و مخزن ایجنت همکار کاملاً در اختیار اوست؛ ولی کد پایه‌ی ایجنت ویندوز را تغییر نمی‌دهد.</span>
          </div>
        </div>
        <div className="callout" style={{ marginTop: 12 }}>
          <strong>قانون ثابت:</strong> برنامه‌ی ویندوز خودش را از گیت‌هاب به‌روز نمی‌کند. به‌روزرسانی فقط با دست انسان و
          GitHub Desktop انجام می‌شود. این پنل هم هیچ تلاشی برای عوض کردن app.py نمی‌کند.
        </div>
      </section>

      <section id="manager-link" className="card help-anchor" style={{ marginBottom: 14 }}>
        <div className="card-head">
          <h2>
            <Icon name="database" size={17} />
            اتصال مستقیم ایجنت ویندوز به مدیریت
          </h2>
          <Link href="/database" className="btn btn-small btn-primary">
            <Icon name="play" size={13} />
            تست اتصال
          </Link>
        </div>
        <p className="prose">
          ایجنت مادر ماژول مستقل <span className="mono">manager_client.py</span> را به پنل ویندوز وصل می‌کند. این ماژول
          با کلید ساخته‌شده در تب «کلید ایجنت» هر ۳۰ ثانیه Heartbeat می‌فرستد و درخواست تست PostgreSQL را پاسخ می‌دهد. تست موفق
          باید پیام دقیق <strong>«سلام ایجنت مدیریت.»</strong> را از ویندوز به سایت برگرداند.
        </p>
        <div className="callout" style={{ marginTop: 10 }}>
          مشخصات endpointها و DPAPI در <span className="mono">docs/manager-client-contract.md</span> و قرارداد PaddleOCR محلی و قطعی شبکه در{" "}
          <span className="mono">docs/letter-to-mother-agent-paddleocr.md</span> ثبت شده است. نصب قلاب داخل app.py فقط توسط ایجنت مادر و با تأیید مستقیم کاربر انجام می‌شود.
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
          <div className="card-head"><h2><Icon name="database" size={17} />راه‌اندازی روی Vercel</h2><span className="card-head-sub">یک‌بار تنظیم، سپس Deploy خودکار</span></div>
          <div className="help-grid" style={{ gap: 12 }}>
            <div><h3>۱. PostgreSQL</h3><p className="prose">در Storage پروژه، Prisma Postgres یا Neon را متصل و وجود <span className="mono">DATABASE_URL</span> را بررسی کنید.</p></div>
            <div><h3>۲. Blob</h3><p className="prose">یک Vercel Blob Store متصل کنید تا <span className="mono">BLOB_READ_WRITE_TOKEN</span> سمت سرور ساخته شود.</p></div>
            <div><h3>۳. کلیدهای امنیتی</h3><pre className="code-block">{`MANAGER_PASSCODE=…
AUTH_SECRET=…
GITHUB_TOKEN=…`}</pre><p className="prose">آن‌ها را در Project → Settings → Environment Variables ثبت و Redeploy کنید.</p></div>
            <div><h3>۴. اجرای محلی</h3><pre className="code-block">{`cp .env.example .env.local
npm run db:migrate
npm run dev`}</pre></div>
          </div>
          <div className="callout" style={{ marginTop: 12 }}>Agent تصویر را فقط به API مدیریت می‌فرستد؛ بایت در Vercel Blob و فراداده در PostgreSQL ثبت می‌شود. Google Drive در این مسیر بازنشسته است.</div>
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
                <strong>انتقال اولیه</strong>
                در «کدهای اتوماسیون» یک‌بار انتقال از GitHub را اجرا کنید؛ پس از آن PostgreSQL منبع اصلی است و Git برای کار روزمره ایجنت همکار لازم نیست.
              </li>
              <li>
                <strong>نسخه‌بندی PostgreSQL</strong>
                یک کد را باز و نسخه تازه ثبت کنید؛ شماره نسخه و SHA-256 جدید باید در تاریخچه دیده شود.
              </li>
              <li>
                <strong>اجرای دوباره</strong>
                هر اجرای دوباره یک نسخه واقعی تازه در PostgreSQL می‌سازد و فرمان دارای version ID و hash برای Windows Agent ثبت می‌کند.
              </li>
            </ol>
            <ol className="steps" start={4}>
              <li>
                <strong>ارسال پرامپت به Arena</strong>
                متن و گزارش تلگرام را انتخاب کنید؛ نسخه تازه job_arena.py در PostgreSQL فعال و modal پایش فرمان ویندوز باز می‌شود.
              </li>
              <li>
                <strong>گزارش</strong>
                نتیجه Agent باید مستقیماً در PostgreSQL ثبت شود؛ برای داده قدیمی می‌توانید متن فایل را در «ورود دستی» بچسبانید. کارت نتیجه باید کد خروج و خروجی متنی را نشان دهد.
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
              <strong>چرا اجرای دوباره نسخه تازه می‌سازد؟</strong> برای اینکه هر اجرا به محتوای immutable، شماره نسخه و SHA-256 دقیق متصل باشد؛ دیگر Commit یا Push لازم نیست.
            </p>
            <p>
              <strong>چرا نتیجه فوراً نمی‌آید؟</strong> وضعیت Heartbeat و صف فرمان Agent را بررسی کنید. گزارش PostgreSQL و تصویر Blob پس از ارسال Agent بدون همگام‌سازی واسط نمایش داده می‌شوند.
            </p>
            <p>
              <strong>اگر توکن GitHub نباشد چه می‌شود؟</strong> کاتالوگ، ویرایش، پرامپت و اجرای PostgreSQL ادامه دارد؛ فقط انتقال اولیه از مخزن قدیمی و کارهای کد پایه GitHub در دسترس نیست.
            </p>
            <p>
              <strong>آیا ایجنت همکار کد پایه را تغییر می‌دهد؟</strong> نه. API او فقط کدهای اتوماسیون نسخه‌بندی‌شده و فرمان‌های مربوط را مدیریت می‌کند؛ تغییر Next.js و Windows Agent همچنان از مخزن‌های مدیریت و مادر است.
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
