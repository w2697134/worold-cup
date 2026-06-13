/** @type {import('next').NextConfig} */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

const nextConfig = {
  output: "standalone",
  basePath: basePath || undefined,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "flagcdn.com" },
    ],
  },
};

export default nextConfig;
