/** @type {import('next').NextConfig} */
const nextConfig = {
  // pdf-parse uses Node fs — keep it server-side only
  experimental: {
    serverComponentsExternalPackages: ["pdf-parse"],
  },
  webpack: (config) => {
    config.resolve.alias.canvas = false;
    return config;
  },
};

module.exports = nextConfig;
