import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // NEXT_DIST_DIR 讓測試 build 輸出到別的資料夾，不覆蓋正式 Hub 正在用的 .next
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
