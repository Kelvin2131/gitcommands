import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The desk is opened at http://127.0.0.1. Without this, dev mode blocks
  // the page scripts and a barcode scanner cannot submit with Enter.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  serverExternalPackages: ["@prisma/client", "bcryptjs", "pdf-lib"],
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
