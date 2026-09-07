import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Immagini ufficiali BCE servite dal package @euro-coins/source
    // + bandiere dei paesi (flagcdn.com, vedi CountryFlag).
    remotePatterns: [
      { protocol: "https", hostname: "www.ecb.europa.eu" },
      { protocol: "https", hostname: "flagcdn.com" },
    ],
  },
};

export default nextConfig;
