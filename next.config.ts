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

function gitBranch(): string {
  try {
    const branch = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return branch === "HEAD" ? "" : branch;
  } catch {
    return "";
  }
}

const buildCommitSha = process.env.CF_PAGES_COMMIT_SHA || process.env.GITHUB_SHA || gitValue("%H");
const buildCommitDate = process.env.BUILD_COMMIT_DATE || gitValue("%cI");
const buildRepository = process.env.GITHUB_REPOSITORY || "soheylfriend-MAJIDgit/Windows-Agent-Management";
const buildBranch = process.env.BUILD_BRANCH
  || process.env.CF_PAGES_BRANCH
  || process.env.GITHUB_HEAD_REF
  || process.env.GITHUB_REF_NAME
  || gitBranch()
  || "arena/0133f1f3-windows-agent-management";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_BUILD_COMMIT_SHA: buildCommitSha,
    NEXT_PUBLIC_BUILD_COMMIT_DATE: buildCommitDate,
    NEXT_PUBLIC_BUILD_REPOSITORY: buildRepository,
    NEXT_PUBLIC_BUILD_BRANCH: buildBranch,
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
