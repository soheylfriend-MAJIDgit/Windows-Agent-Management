"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { ApiRequestError } from "@/hooks/useApi";
import { Icon, type IconName } from "./icons";
import { useToast } from "./ToastProvider";

export function PageHeader({
  title,
  subtitle,
  eyebrow,
  actions,
}: {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="page-head">
      <div className="page-title-wrap">
        {eyebrow ? (
          <span className="eyebrow">
            <Icon name="layers" size={12} />
            {eyebrow}
          </span>
        ) : null}
        <h1>{title}</h1>
        {subtitle ? <p className="page-sub">{subtitle}</p> : null}
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </div>
  );
}

const STATUS_MAP: Record<string, { cls: string; label: string }> = {
  success: { cls: "is-ok", label: "اجرا شده" },
  error: { cls: "is-danger", label: "خطا" },
  timeout: { cls: "is-danger", label: "زمان اجرا تمام شد" },
  pending: { cls: "is-warn", label: "در انتظار" },
  running: { cls: "is-due", label: "در حال اجرا" },
  neutral: { cls: "is-neutral", label: "خنثی" },
};

export function StatusChip({ status, label, note }: { status: string; label?: string; note?: string }) {
  const meta = STATUS_MAP[status] ?? STATUS_MAP.neutral;
  return (
    <span className={`status-chip ${meta.cls}`} title={note}>
      <span className="dot" aria-hidden="true" />
      {label ?? meta.label}
    </span>
  );
}

export function Banner({
  tone = "info",
  icon,
  title,
  children,
  actions,
}: {
  tone?: "info" | "warn" | "danger" | "ok";
  icon?: IconName;
  title?: string;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  const defaultIcon: IconName = tone === "danger" ? "alert" : tone === "warn" ? "alert" : tone === "ok" ? "check-circle" : "info";
  return (
    <div className={`banner is-${tone}`} role={tone === "danger" ? "alert" : undefined}>
      <span className="banner-icon">
        <Icon name={icon ?? defaultIcon} size={17} />
      </span>
      <div className="banner-body">
        {title ? <div className="banner-title">{title}</div> : null}
        {children}
        {actions ? <div className="banner-actions">{actions}</div> : null}
      </div>
    </div>
  );
}

export function ErrorBanner({ error, onRetry }: { error: ApiRequestError | null; onRetry?: () => void }) {
  if (!error) return null;
  const isAuth = error.status === 401;
  const isSetup = error.code === "db_binding_missing" || error.code === "db_schema_failed";
  return (
    <Banner
      tone={isAuth ? "warn" : "danger"}
      title={isAuth ? "نشست منقضی شده است" : isSetup ? "پایگاه داده آماده نیست" : "اتصال برقرار نشد"}
      actions={
        <>
          {isAuth ? (
            <a className="btn btn-small" href="/">
              ورود دوباره
            </a>
          ) : onRetry ? (
            <button type="button" className="btn btn-small" onClick={onRetry}>
              <Icon name="refresh" size={14} />
              تلاش دوباره
            </button>
          ) : null}
        </>
      }
    >
      <div>{error.message}</div>
      {error.hint ? <div className="field-helper" style={{ marginTop: 3 }}>{error.hint}</div> : null}
    </Banner>
  );
}

export function EmptyState({
  icon = "inbox",
  title,
  text,
  actions,
}: {
  icon?: IconName;
  title: string;
  text?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Icon name={icon} size={22} />
      </span>
      <div className="empty-title">{title}</div>
      {text ? <p className="empty-text">{text}</p> : null}
      {actions ? <div className="empty-actions">{actions}</div> : null}
    </div>
  );
}

export function SkeletonLines({ count = 3 }: { count?: number }) {
  return (
    <div aria-hidden="true">
      <span className="skeleton skeleton-title" />
      {Array.from({ length: count }).map((_, i) => (
        <span key={i} className="skeleton skeleton-line" style={{ width: `${92 - i * 12}%` }} />
      ))}
    </div>
  );
}

export function LoadingState({ label = "در حال بارگذاری…" }: { label?: string }) {
  return (
    <div className="empty-state" aria-busy="true">
      <span className="loading-line">
        <span className="spinner" />
        {label}
      </span>
    </div>
  );
}

export function CopyButton({
  text,
  label = "کپی",
  small = true,
  className = "btn btn-small btn-ghost",
}: {
  text: string;
  label?: string;
  small?: boolean;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const notify = useToast();

  async function copy() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const area = document.createElement("textarea");
        area.value = text;
        document.body.appendChild(area);
        area.select();
        document.execCommand("copy");
        area.remove();
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
      notify.ok("در کلیپ‌بورد کپی شد.");
    } catch {
      notify.error("کپی ممکن نشد.");
    }
  }

  return (
    <button type="button" onClick={copy} className={className} data-small={small}>
      <Icon name={copied ? "check" : "copy"} size={small ? 13 : 15} />
      {copied ? "کپی شد" : label}
    </button>
  );
}

export function FieldError({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return <p className="field-error">{children}</p>;
}

export function IssueList({ issues }: { issues: Array<{ code: string; message: string; line?: number; hint?: string; severity: string }> }) {
  if (!issues.length) return null;
  return (
    <ul className="issue-list">
      {issues.map((issue, index) => (
        <li key={`${issue.code}-${index}`} className={`issue ${issue.severity === "error" ? "is-error" : "is-warning"}`}>
          <span className="issue-icon">
            <Icon name={issue.severity === "error" ? "x-circle" : "alert"} size={15} />
          </span>
          <div className="issue-body">
            <span>{issue.message}</span>
            {issue.line ? <span className="issue-line"> خط {issue.line}</span> : null}
            {issue.hint ? <span className="issue-hint">{issue.hint}</span> : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

export function InlineLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="btn btn-small btn-ghost">
      {children}
      <Icon name="arrow-left" size={13} />
    </Link>
  );
}
