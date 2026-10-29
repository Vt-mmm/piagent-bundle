# piagent-bundle

Release bundle for Piagent company mode: pinned Pi, three packages, manifest hashes, launcher, doctor, Studio contract.

Part of the Piagent company-mode bundle for stock [Pi](https://github.com/earendil-works) (pinned: `@earendil-works/pi-coding-agent` 1.4.0). See `piagent-bundle/docs` for the plan, contracts and runbook.

Status: phase 2.5. `scripts/build-bundle.mjs` builds a bundle (its own Pi 1.4.0 + the three packages at the commits in `bundle.pins.json` + `manifest.json`); `tests/e2e` runs it end to end against a simulated Studio. Not released.

## Development

```bash
npm ci
npm test
```

## Security

See [SECURITY.md](SECURITY.md). Report vulnerabilities privately.
