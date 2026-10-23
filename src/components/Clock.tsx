"use client";

import { useEffect, useState } from "react";
import { formatJalaliLong, formatTehranTime, formatWeekday } from "@/lib/jalali";

export function Clock() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="clock" title="ساعت تهران (UTC+03:30)">
      <span className="clock-time">{now ? formatTehranTime(now).slice(0, 5) : "—:—"}</span>
      <span className="clock-date">
        {now ? `${formatWeekday(now)} · ${formatJalaliLong(now)}` : "در حال هم‌زمان‌سازی"}
      </span>
    </div>
  );
}
