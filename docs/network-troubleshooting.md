# Network troubleshooting — quick guide

## Quick local checks
```bash
# DNS
dig +short api.openai.com

# TCP reachability
nc -vz api.openai.com 443

# HTTP verbose
curl -v --max-time 10 https://api.openai.com/v1/models

# TLS handshake
openssl s_client -connect api.openai.com:443 -servername api.openai.com

# Traceroute
traceroute -n api.openai.com  # macOS / Linux
tracert api.openai.com        # Windows
```

## Mock mode (dev / CI)
```bash
# Use environment flags to run locally without reaching external APIs
export MOCK_OPENAI=true
export MOCK_ELEVENLABS=true
export MOCK_BGG=true
export MOCK_EXTRACT_PICS=true
npm start
```

## Interpreting network-diagnostics.json
Required top-level fields:
- `timestamp`: ISO8601
- `results`: array of `{ name, endpoint: {host,port}, overall_status, tests: {dns,tcp,http,tls,path} }`
- `summary`: `{ passed, failed, warnings }`

If `overall_status` is "failed" and `tests.dns.status == "failed"` → start with DNS resolver checks.
If TCP fails but DNS passes → check firewall/eips/NAT egress rules.
If TLS fails but TCP passes → check TLS inspection / CA trust stores.

## CI tips
- Run `npm run network:probe` as the first workflow step.
- Upload artifacts and retain for at least 7 days.
- Gate external-dependent jobs to skip/neutral when probe fails and surface an informative message to the PR.

## Common failure modes

### Timeout / no SYN reply → egress blocked (firewall/NAT)
**Symptoms:** Connection timeouts, no response to TCP SYN packets
**Diagnosis:**
```bash
# Check if packets are leaving your network
tcpdump -i any host api.openai.com
# Check routing
ip route get api.openai.com  # Linux
route get api.openai.com     # macOS
```
**Resolution:** Check cloud/on-prem egress rules (VPC, NAT, security groups, corporate firewall/proxy).

### Connection refused → reachable but actively rejecting
**Symptoms:** "Connection refused" errors, TCP RST packets
**Diagnosis:**
```bash
# Verify the service is actually listening on that port
nmap -p 443 api.openai.com
# Check if it's a regional restriction
curl -v --max-time 10 https://api.openai.com/ --header "X-Forwarded-For: 8.8.8.8"
```
**Resolution:** Possible provider ACL or IP blacklist. Contact the service provider or try from a different IP range.

### DNS NXDOMAIN → resolver or conditional DNS problem
**Symptoms:** "Name or service not known", "NXDOMAIN" responses
**Diagnosis:**
```bash
# Test different DNS servers
dig @8.8.8.8 api.openai.com
dig @1.1.1.1 api.openai.com
# Check current resolver configuration
cat /etc/resolv.conf  # Linux
scutil --dns           # macOS
```
**Resolution:** Fix DNS resolver configuration or conditional DNS rules.

### TLS handshake failures → TLS interception or CA issues
**Symptoms:** SSL/TLS certificate errors, handshake failures
**Diagnosis:**
```bash
# Get detailed TLS info
openssl s_client -connect api.openai.com:443 -showcerts
# Check certificate chain
curl -v --max-time 10 https://api.openai.com/ 2>&1 | grep -i cert
# Test with ignore cert errors
curl -v --max-time 10 -k https://api.openai.com/
```
**Resolution:** If TLS errors appear, verify TLS inspection (corporate proxy) and update CA trust if required.

## Escalation process

When network probe failures occur:

1. **Immediate actions:**
   - Download probe artifacts from the CI run
   - Run the diagnostic commands shown above from the failing environment
   - Check if the failures are consistent across multiple runs/environments

2. **Gather information:**
   - Attach probe artifacts (`network-probe.log`, `network-diagnostics.json`, `traceroute.log`, `dig.log`, `openssl.log`) to the CI run
   - Document the specific error messages and symptoms
   - Note the timing (intermittent vs. persistent failures)

3. **Escalate to network/infrastructure team:**
   - Provide all diagnostic artifacts
   - Include specific endpoints that are failing
   - Mention any recent network/infrastructure changes
   - Request review of egress rules, proxy settings, and DNS configuration

## Testing the network probe locally

```bash
# Run the network probe script locally
./scripts/network-probe.sh test-artifacts

# Check the results
cat test-artifacts/network-probe.log
cat test-artifacts/network-diagnostics.json

# Clean up test artifacts
rm -rf test-artifacts
```