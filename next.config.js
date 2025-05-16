/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: '/robots.txt',
        destination: '/robots-kimp.txt',
      },
    ];
  },
};

module.exports = nextConfig;
