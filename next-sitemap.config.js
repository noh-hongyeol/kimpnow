/** @type {import('next-sitemap').IConfig} */
module.exports = {
    siteUrl: 'https://kimpnow.com',
    generateRobotsTxt: true,
    sitemapSize: 5000,
    outDir: './public',      // ✅ 이 줄 중요!
  };
  