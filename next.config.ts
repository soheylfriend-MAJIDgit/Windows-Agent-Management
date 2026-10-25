import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
import { execFileSync } from "node:child_process";

function gitValue(format: string): string {
  try {
    return execFileSync("git", ["show", "-s", `--format=${format}`, "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

const buildCommitSha = process.env.CF_PAGES_COMMIT_SHA || process.env.GITHUB_SHA || gitValue("%H");
const buildCommitDate = process.env.BUILD_COMMIT_DATE || gitValue("%cI");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_BUILD_COMMIT_SHA: buildCommitSha,
    NEXT_PUBLIC_BUILD_COMMIT_DATE: buildCommitDate,
  },
  poweredByHeader: false,
  // میزبان پیش‌نمایش داخل مرورگر (Arena) و شبکه محلی
  allowedDevOrigins: ["*.e2b.app", "localhost", "127.0.0.1"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

// در حالت توسعه، bindingهای wrangler (از جمله D1) در دسترس قرار می‌گیرند.
initOpenNextCloudflareForDev();

export default nextConfig;
