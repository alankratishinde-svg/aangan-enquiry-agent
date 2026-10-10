import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The agent reads prompts/ and knowledge/ from disk at runtime, so ship them with every server function.
  outputFileTracingIncludes: {
    "/**": ["./prompts/**/*", "./knowledge/**/*"],
  },
  serverExternalPackages: ["pg"],
};

export default nextConfig;
