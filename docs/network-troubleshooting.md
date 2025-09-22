# Network Troubleshooting Guide

This document explains how to diagnose common network/connectivity issues (DNS, firewall, TLS, proxy) that block connections to external APIs such as OpenAI and ElevenLabs.

## Quick checks (developer)
1. Run quick probe:
   ./scripts/network-probe.sh
2. If probes fail, generate a detailed diagnostics report:
   ./scripts/network-diagnostics.sh > /tmp/network-diagnostics.txt
3. For infra reproduction (requires sudo):
   sudo ./scripts/reproduce-blocked-endpoints.sh --block-all
   # Run the app to see failures
   sudo ./scripts/reproduce-blocked-endpoints.sh --restore

## What to attach to a PR or support ticket
- network-probe output (stdout + /tmp/network-probe-<ts>.log)
- network-diagnostics full report (/tmp/network-diagnostics-<ts>.txt)
- CI job log lines showing network errors (time-stamped)
- If available, curl/traceroute/dig outputs:
  - nslookup api.openai.com
  - dig +short api.openai.com
  - traceroute -m 30 api.openai.com
  - curl -v --max-time 15 https://api.openai.com/v1/models

## Interpreting common failures
- DNS resolution fails (no A/AAAA answers):
  - Check DNS servers in /etc/resolv.conf, corporate DNS policies.
  - Try public resolvers: `dig @1.1.1.1 api.openai.com`
- TCP/HTTPS connect failures:
  - Look for timeouts or connection reset in curl output.
  - If traceroute stops early or shows private network hops, this suggests egress firewall blocks.
- TLS handshake or certificate errors:
  - Use openssl to inspect the certificate; verify corporate TLS MITM/proxy.
- Proxy-related issues:
  - Check env vars: HTTP_PROXY, HTTPS_PROXY, NO_PROXY. CI runners sometimes require explicit NO_PROXY entries for internal hosts.

## Suggested infra remediation steps
1. Whitelist outbound HTTPS to:
   - api.openai.com (443)
   - api.elevenlabs.io (443)
   - Any image host domains used in the app
2. If using a corporate proxy that re-signs TLS:
   - Ensure CI runners trust the corporate CA certificate
   - Update Node.js/curl/system CA bundles if necessary
3. If DNS is filtered/redirected:
   - Allow public DNS or configure resolver that provides correct answers

## CI recommendations
- Add network-probe step to CI early in the workflow (already included in this PR).
- Prefer self-hosted runners with known egress if corporate policies restrict public API access.
- Upload probe logs as artifacts on PR to help infra triage.

## Contacting Infra
When opening a ticket or tagging infra, include:
- CI job id or runner hostname
- Timestamped probe logs
- traceroute/dig/curl outputs