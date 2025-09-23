# Network Troubleshooting — Mobius Games Tutorial

This document explains how to use the automated network probe, interpret its results, and remediate common egress/DNS/TLS issues affecting CI and local development.

## Quick start

Run the probe locally and write artifacts to `artifacts/`:

```bash
npm run network:probe
```

or

```bash
./scripts/network-probe.sh artifacts
```

Full mock mode (no external calls):

```bash
FULL_MOCK=true npm run network:test
```

Per-service mock example:

```bash
MOCK_OPENAI=true MOCK_ELEVENLABS=true npm run network:probe
```

Artifacts produced:
- `artifacts/network-probe.log` — human-readable log
- `artifacts/network-diagnostics.json` — structured JSON result
- `artifacts/traceroute.log`, `artifacts/dig.log`, `artifacts/openssl.log` — protocol-specific logs

## Quick diagnostic commands

DNS:

```bash
dig +short api.openai.com
```

or

```bash
nslookup api.openai.com
```

TCP:

```bash
nc -vz api.openai.com 443
```

fallback

```bash
bash -c ">/dev/tcp/api.openai.com/443" && echo OK || echo FAIL
```

HTTP:

```bash
curl -I --max-time 10 https://api.openai.com/
```

TLS:

```bash
openssl s_client -connect api.openai.com:443 -servername api.openai.com
```

Path tracing:

```bash
traceroute -n api.openai.com # Linux/macOS
tracert api.openai.com       # Windows
```

## Interpreting `network-diagnostics.json`

Top-level:
- `timestamp` — when the probe ran
- `platform` — uname result (linux/darwin/etc)
- `results` — array of endpoint results
- `summary` — counts of passed/failed/warnings

Per-endpoint:
- `overall_status`: `passed` | `failed` | `mocked` | `warning` | `skipped`
- `tests`: contains `dns`, `tcp`, `http`, `tls` statuses

Common patterns:
- dns failed -> start with resolver checks (resolv.conf, corporate DNS)
- tcp failed but dns passed -> egress/firewall or blocked port
- tls failed but tcp passed -> TLS inspection / CA trust problems
- http failed but tcp passed -> proxy or application-layer blocking

## Remediation checklist (developer / infra)

1. Gather artifacts: `network-probe.log`, `network-diagnostics.json`, `traceroute.log`, `dig.log`, `openssl.log`.
2. Re-run the failing commands from the runner or similar environment.
3. For DNS issues:
   - Check `/etc/resolv.conf` or resolver config
   - Inspect conditional DNS/split-horizon rules
4. For TCP/egress issues:
   - Check cloud security groups, VPC egress rules, NAT gateways
   - Ensure outbound 443 is allowed to the API host ranges
   - For corporate networks, check proxy or firewall rules and exceptions
5. For TLS errors:
   - Check for TLS-inspecting proxy (corporate)
   - Update CA trust store if proxy uses an enterprise root
6. If provider-side blocking suspected:
   - Contact vendor support with IP / run logs (some APIs block cloud/VPN ranges)
7. Use mock mode while infra remediation is in progress.

## CI integration notes

- The probe runs early in CI and uploads artifacts for post-mortem.
- The probe is intentionally non-blocking; CI should gate external-dependent jobs or mark them skipped when probes fail.
- PR comments with short diagnostics and links to artifacts speed triage.

## Escalation process

1. Developer: collect artifacts and re-run probe locally.
2. Infrastructure: analyze traceroute, firewall logs, VPC/NAT configuration.
3. Vendor: provide trace logs and timestamped probe artifacts; vendor can check if IPs were blocked.

## Adding new endpoints

Update `scripts/network-probe.sh` `ENDPOINTS` array and, if needed, add new mock env variables.

## Troubleshooting the probe itself

- If the probe reports warnings about missing tools: install `bind9-dnsutils` (dig), `netcat`, `curl`, `openssl`, `traceroute`.
- On constrained runners, use the mock mode.

## Contact / ownership

- Add the infra / network team contacts or Slack channel here for your organization.