const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: '/robots.txt',
        destination: '/api/robots', // 여기만 바뀜
      },
    ];
  },
};

module.exports = nextConfig;
