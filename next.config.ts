import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Immagini ufficiali BCE servite dal package @euro-coins/source
    remotePatterns: [{ protocol: "https", hostname: "www.ecb.europa.eu" }],
  },
};

export default nextConfig;
