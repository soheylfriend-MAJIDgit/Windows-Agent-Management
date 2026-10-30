"use client";

import { useEffect, useState } from "react";
import {
  formatJalaliDateTime,
  formatJalaliLong,
  formatTehranTime,
  formatWeekday,
} from "@/lib/jalali";

const BUILD_COMMIT_DATE = process.env.NEXT_PUBLIC_BUILD_COMMIT_DATE ?? "";
const BUILD_COMMIT_SHA = process.env.NEXT_PUBLIC_BUILD_COMMIT_SHA ?? "";
const BUILD_REPOSITORY = process.env.NEXT_PUBLIC_BUILD_REPOSITORY ?? "نامشخص";
const BUILD_BRANCH = process.env.NEXT_PUBLIC_BUILD_BRANCH ?? "نامشخص";

export function Clock() {
  const [now, setNow] = useState<Date | null>(null);
  const commitDate = BUILD_COMMIT_DATE ? new Date(BUILD_COMMIT_DATE) : null;
  const validCommitDate = commitDate && !Number.isNaN(commitDate.getTime()) ? commitDate : null;
  const shortSha = BUILD_COMMIT_SHA.slice(0, 7);

  useEffect(() => {
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="clock-cluster">
      <div className="build-identity" title={`ریپازیتوری: ${BUILD_REPOSITORY}\nشاخه: ${BUILD_BRANCH}`}>
        <span className="build-identity-row">
          <span className="build-identity-label">ریپازیتوری</span>
          <bdi className="build-identity-value" dir="ltr">{BUILD_REPOSITORY}</bdi>
        </span>
        <span className="build-identity-row">
          <span className="build-identity-label">شاخه</span>
          <bdi className="build-identity-value" dir="ltr">{BUILD_BRANCH}</bdi>
        </span>
      </div>
      <span className="clock-separator" aria-hidden="true" />
      <div
        className="commit-clock"
        title={shortSha ? `آخرین کامیت منتشرشده: ${shortSha}` : "آخرین کامیت منتشرشده"}
      >
        <span className="commit-clock-label">
          آخرین کامیت{shortSha ? ` · ${shortSha}` : ""}
        </span>
        <span className="commit-clock-date">
          {validCommitDate ? formatJalaliDateTime(validCommitDate) : "زمان کامیت نامشخص"}
        </span>
      </div>
      <span className="clock-separator" aria-hidden="true" />
      <div className="clock" title="ساعت تهران (UTC+03:30)">
        <span className="clock-time">{now ? formatTehranTime(now).slice(0, 5) : "—:—"}</span>
        <span className="clock-date">
          {now ? `${formatWeekday(now)} · ${formatJalaliLong(now)}` : "در حال هم‌زمان‌سازی"}
        </span>
      </div>
    </div>
  );
}
