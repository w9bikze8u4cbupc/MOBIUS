// Hardened URL validation helper
import { URL } from 'url';
import dns from 'dns';
import net from 'net';

// Private IP ranges to block
const PRIVATE_IP_RANGES = [
  '10.0.0.0/8',
  '172.16.0.0/12',
  '192.168.0.0/16',
  '127.0.0.0/8',
  '::1/128',
  '169.254.0.0/16', // Link-local
  'fe80::/10'       // IPv6 link-local
];

// Function to check if an IP is in a private range
function isPrivateIp(ip) {
  try {
    const ipAddr = net.isIP(ip);
    if (!ipAddr) return false;
    
    for (const range of PRIVATE_IP_RANGES) {
      if (isIpInRange(ip, range)) {
        return true;
      }
    }
    
    return false;
  } catch (error) {
    return false;
  }
}

// Function to check if an IP is in a CIDR range
function isIpInRange(ip, range) {
  try {
    const [rangeIp, prefix] = range.split('/');
    const ipAddr = net.isIP(ip);
    const rangeAddr = net.isIP(rangeIp);
    
    if (!ipAddr || !rangeAddr || ipAddr !== rangeAddr) {
      return false;
    }
    
    if (ipAddr === 4) {
      // IPv4
      const ipInt = ipToLong(ip);
      const rangeInt = ipToLong(rangeIp);
      const mask = ~((1 << (32 - parseInt(prefix))) - 1);
      
      return (ipInt & mask) === (rangeInt & mask);
    } else {
      // IPv6 - simplified check
      return ip.startsWith(rangeIp.split(':').slice(0, parseInt(prefix)/16).join(':'));
    }
  } catch (error) {
    return false;
  }
}

// Convert IPv4 to long integer
function ipToLong(ip) {
  return ip.split('.')
    .reduce((ipInt, octet) => (ipInt << 8) + parseInt(octet, 10), 0) >>> 0;
}

// Function to resolve hostname to IP addresses
function resolveHostname(hostname) {
  return new Promise((resolve, reject) => {
    dns.resolve4(hostname, (err, addresses) => {
      if (err) {
        dns.resolve6(hostname, (err6, addresses6) => {
          if (err6) {
            reject(err6);
          } else {
            resolve(addresses6);
          }
        });
      } else {
        resolve(addresses);
      }
    });
  });
}

// Main URL validation function
async function validateUrl(urlString, options = {}) {
  const {
    allowHttpsOnly = true,
    allowPrivateIps = false,
    allowList = null
  } = options;
  
  try {
    // Parse URL
    const url = new URL(urlString);
    
    // Check protocol
    if (allowHttpsOnly && url.protocol !== 'https:') {
      return {
        valid: false,
        reason: 'Only HTTPS URLs are allowed'
      };
    }
    
    // Check against allowlist if provided
    if (allowList && Array.isArray(allowList)) {
      const hostname = url.hostname.toLowerCase();
      const allowed = allowList.some(domain => {
        const domainLower = domain.toLowerCase();
        return hostname === domainLower || hostname.endsWith('.' + domainLower);
      });
      
      if (!allowed) {
        return {
          valid: false,
          reason: 'URL not in allowlist'
        };
      }
    }
    
    // Resolve hostname to IP addresses
    const ips = await resolveHostname(url.hostname);
    
    // Check if any resolved IPs are private
    if (!allowPrivateIps) {
      for (const ip of ips) {
        if (isPrivateIp(ip)) {
          return {
            valid: false,
            reason: 'Private IP addresses are not allowed'
          };
        }
      }
    }
    
    // URL is valid
    return {
      valid: true,
      ips: ips,
      hostname: url.hostname
    };
  } catch (error) {
    return {
      valid: false,
      reason: `Invalid URL: ${error.message}`
    };
  }
}

export { validateUrl };