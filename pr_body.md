# PR: Add network diagnostics & CI probe

Summary
-------
Adds a suite of network diagnostic scripts, documentation, and CI integration to help diagnose and reproduce connectivity problems to external APIs (OpenAI, ElevenLabs, image hosts). This enables faster triage of firewall/egress/DNS issues in CI and staging environments.

Files added
-----------
- scripts/network-probe.sh
- scripts/network-diagnostics.sh
- scripts/reproduce-blocked-endpoints.sh
- docs/network-troubleshooting.md
- docs/developer-network-guide.md
- Updated .github/workflows/ci.yml (adds network probe + log artifact)
- pr_body.md (this file)

Why
---
CI/staging runners have intermittently failed to reach api.openai.com and api.elevenlabs.io due to firewall/egress restrictions. These failures are cryptic and time-consuming to debug without standardized diagnostics and a clear infra remediation checklist.

What this provides
------------------
- Quick probes to detect connectivity issues early in CI
- Detailed diagnostics for infra teams (DNS, TLS, traceroute, system network config)
- A safe local replicate tool to simulate blocked endpoints (hosts-file based)
- Documentation and clear commands for infra to run when triaging
- CI step that uploads probe logs as artifacts for developer/infra review

How to use
----------
Developer:
- Quick check: ./scripts/network-probe.sh
- Detailed report: ./scripts/network-diagnostics.sh > /tmp/network-diagnostics.txt
- Reproduce: sudo ./scripts/reproduce-blocked-endpoints.sh --block-all
  (restore with --restore)

Infra checklist (when investigating)
- From the affected runner:
  - nslookup api.openai.com
  - dig +short api.openai.com
  - traceroute -m 30 api.openai.com
  - curl -v --max-time 15 https://api.openai.com/v1/models
- Verify egress rules for:
  - api.openai.com:443
  - api.elevenlabs.io:443

Notes
-----
- Scripts try to be cross-platform (Linux/macOS/WSL). Some utilities (dig/traceroute/openssl) may be missing and are skipped gracefully.
- The reproduce tool modifies /etc/hosts (requires sudo). It creates a backup in /tmp before changes.

Request to Infra
----------------
Please validate that the staging/CI runners can reach:
- api.openai.com
- api.elevenlabs.io
If blocked, please whitelist these hosts on the relevant runners or provide self-hosted runners with required egress.