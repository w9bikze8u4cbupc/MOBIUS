function shutdown(signal) {
  console.log(`[${signal}] shutting down...`);
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
  // Force close lingering sockets after 10s
  setTimeout(() => {
    for (const c of connections) c.destroy();
    process.exit(1);
  }, 10_000).unref();
}

['SIGINT', 'SIGTERM'].forEach((sig) => process.on(sig, () => shutdown(sig)));
