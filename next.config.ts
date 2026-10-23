import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets phones / other devices on your Wi-Fi load the dev server (e.g. http://192.168.1.109:3000).
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "172.*.*.*"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
