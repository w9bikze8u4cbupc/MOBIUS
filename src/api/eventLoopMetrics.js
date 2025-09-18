// Event Loop Metrics Shim
import { monitorEventLoopDelay } from 'perf_hooks';

// Create event loop delay histogram
const eventLoopDelay = monitorEventLoopDelay({ resolution: 20 });
eventLoopDelay.enable();

// Function to get event loop delay in milliseconds
function getEventLoopDelayMs() {
  return eventLoopDelay.mean / 1e6; // Convert from nanoseconds to milliseconds
}

// Function to get resource usage
function getResourceUsage() {
  const usage = process.resourceUsage();
  return {
    userCpuTime: usage.userCPUTime / 1000, // Convert microseconds to milliseconds
    systemCpuTime: usage.systemCPUTime / 1000, // Convert microseconds to milliseconds
    rss: usage.maxRSS / 1024 / 1024, // Convert bytes to MB
  };
}

// Function to get memory usage
function getMemoryUsage() {
  const mem = process.memoryUsage();
  return {
    rssMB: Math.round(mem.rss / 1024 / 1024 * 100) / 100,
    heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024 * 100) / 100,
    heapTotalMB: Math.round(mem.heapTotal / 1024 / 1024 * 100) / 100,
  };
}

export {
  getEventLoopDelayMs,
  getResourceUsage,
  getMemoryUsage
};