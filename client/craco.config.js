const path = require('path');

module.exports = {
  devServer: {
    allowedHosts: 'all',
    client: {
      overlay: false
    }
  },
  webpack: {
    configure: (webpackConfig) => {
      // Ensure public path is set correctly
      webpackConfig.resolve.fallback = {
        ...webpackConfig.resolve.fallback,
        "fs": false,
        "path": false,
        "os": false
      };
      return webpackConfig;
    }
  }
};