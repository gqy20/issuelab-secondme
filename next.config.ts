import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep Agent SDK as external package so its runtime CLI assets are present in serverless.
  serverExternalPackages: ["@anthropic-ai/claude-agent-sdk"],
};

export default nextConfig;
