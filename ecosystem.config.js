module.exports = {
  apps: [
    {
      name: 'mobius-api',
      script: './start-server.js',
      instances: 'max', // Use all CPU cores
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'development',
        PORT: 3000,
        USE_PDFJS_LEGACY: 1,
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
        USE_PDFJS_LEGACY: 1,
      },
      // Log rotation configuration
      max_memory_restart: '1G',
      error_file: './logs/err.log',
      out_file: './logs/out.log',
      log_file: './logs/combined.log',
      time: true,
      // Graceful reload
      wait_ready: true,
      listen_timeout: 10000,
      kill_timeout: 5000,
    },
  ],
};
