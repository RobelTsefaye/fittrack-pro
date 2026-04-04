import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    optimizePackageImports: ["lucide-react", "recharts"],
  },
  // Allow mobile devices on local network during development
  ...(process.env.NODE_ENV === "development" && {
    allowedDevOrigins: ["192.168.2.45"],
  }),
};

export default nextConfig;
