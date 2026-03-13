const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
  analyzerMode: 'json',
  openAnalyzer: false,
});

module.exports = withBundleAnalyzer({
  output: 'standalone',
});
