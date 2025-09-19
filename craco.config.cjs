// craco.config.cjs
module.exports = {
  devServer: (devServerConfig) => {
    // Keep proxy configuration
    devServerConfig.proxy = {
      '/start-extraction': {
        target: 'http://localhost:5001',
        changeOrigin: true,
      },
      '/api': {
        target: 'http://localhost:5001',
        changeOrigin: true,
      }
    };
    
    // Disable the Webpack dev client + HMR to stop WS attempts to "localhostv"
    devServerConfig.client = false;
    devServerConfig.hot = false;
    devServerConfig.liveReload = false;
    return devServerConfig;
  }
};