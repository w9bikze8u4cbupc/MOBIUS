# Developer Network Guide

How to use the network diagnostic tools and reproduce connectivity issues locally.

## Quick start
1. Run quick probe:
   ./scripts/network-probe.sh
2. If there is a failure, generate a full diagnostics report:
   ./scripts/network-diagnostics.sh > /tmp/network-diagnostics.txt
3. Use the reproduce tool (requires sudo) to simulate blocked endpoints:
   sudo ./scripts/reproduce-blocked-endpoints.sh --block-all
   # Start your app and observe the failure
   sudo ./scripts/reproduce-blocked-endpoints.sh --restore

## Environment variables
- EXTRA_NETWORK_HOSTS - space-separated extra hosts to probe
  Example:
    EXTRA_NETWORK_HOSTS="images.example.com another.host" ./scripts/network-probe.sh

## Running in CI (recommended)
- The CI workflow contains a `network-probe` step that executes:
  ./scripts/network-probe.sh
  - The step is configured continue-on-error so it will not cause false failures.
  - Probe logs are uploaded as artifacts for infra triage.

## Proxy / corporate networks
- If you are behind a corporate proxy, set:
  export HTTP_PROXY="http://proxy.company:3128"
  export HTTPS_PROXY="http://proxy.company:3128"
  export NO_PROXY="localhost,127.0.0.1,<internal-hosts>"
- If TLS is re-signed by proxy, ensure your runner trusts the proxy CA:
  - Add CA to system or Node trust store as required by your environment.

## How to provide a good support ticket
- Attach:
  - /tmp/network-probe-<ts>.log
  - /tmp/network-diagnostics-<ts>.txt
  - CI job logs (with timestamps)
  - If applicable, describe the runner environment (GitHub-hosted, self-hosted, Docker image)
- Suggested commands for infra to run on the affected host:
  - nslookup api.openai.com
  - dig +short api.openai.com
  - traceroute -m 30 api.openai.com
  - curl -v --max-time 15 https://api.openai.com/v1/models