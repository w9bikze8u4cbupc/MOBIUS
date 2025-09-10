// craco.config.cjs
module.exports = {
  devServer: (devServerConfig) => {
    // Disable the Webpack dev client + HMR to stop WS attempts to "localhostv"
    devServerConfig.client = false;
    devServerConfig.hot = false;
    devServerConfig.liveReload = false;
    return devServerConfig;
  }
};