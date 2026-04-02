# Changelog

All notable changes to `canton-fee-estimator` are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

- Python SDK (`pip install canton-fee-estimator`) — planned for Milestone 2
- PostgreSQL-backed historical fee database — planned for Milestone 2
- Anomaly alerting webhook integration — planned for Milestone 3
- Self-hosting Docker Compose bundle — planned for Milestone 3

---

## [0.3.0] — 2026-04-02

### Added
- `tests/analyzer.test.ts` — unit test suite for the analyser against known Canton fee
  profiles; covers p50/p75/p95 confidence bands and edge cases for zero-observer contracts
- `scripts/estimate.sh` — one-command convenience wrapper that compiles the TypeScript CLI,
  resolves project configuration, and runs the full estimation pipeline with formatted output
- `CHANGELOG.md` — this file; full project history from initial scaffold to v0.3.0

### Changed
- `cli/analyzer.ts` — pagination cost calculation updated to account for large observer sets
  using the `feePerObserverDistribution` model; previously observer fan-out was under-counted
  for participant counts above 20

---

## [0.2.0] — 2026-03-28

### Added
- `.github/workflows/ci.yml` — CI pipeline: TypeScript build, lint, and analyser validation
  against a suite of sample Canton contracts on every push and pull request
- `docs/FEE_MODEL.md` — comprehensive explanation of the Canton traffic fee model including
  base cost, submission payload cost, broadcast cost, and confirmation cost components
- `docs/OPTIMISATION.md` — fee optimisation patterns: observer minimisation, payload trimming,
  participant co-location, and key-based pull vs. broadcast push patterns

### Fixed
- `cli/analyzer.ts` — corrected observer pagination cost to handle the sequencer fan-out
  boundary condition where participant count crosses the domain-sequencer page threshold

---

## [0.1.0] — 2026-03-18

### Added
- `README.md` — project overview, quickstart guide, CLI and web usage, configuration reference
- `.gitignore` — standard ignores for Node.js, TypeScript build output, and Daml `.dar`
  artifacts
- `cli/main.ts` — CLI entry point; parses `--config`, `--output`, `--format`, and `--verbose`
  flags; wires analyser → simulator → reporter pipeline
- `cli/analyzer.ts` — contract analyser estimating per-transaction cost using the Canton cost
  model (`baseTransactionFee`, `feePerKb`, `feePerParticipant`, `feePerObserverDistribution`);
  generates `TemplateAnalysisResult` with create cost, per-choice cost, and optimisation tips
- `cli/simulator.ts` — load simulator replaying configurable transaction patterns against a
  local Canton DevNet; emits `SimulationMetrics` (TPS, p50/p75/p95 latency, total cost)
- `cli/reporter.ts` — ANSI-coloured console reporter and JSON/SARIF output generator; renders
  cost breakdown tables, simulation results, and ranked optimisation suggestions
- `web/src/EstimatorForm.tsx` — React form accepting DAR path, network endpoint, and
  transaction pattern definitions; validates inputs before dispatching estimation request
- `web/src/CostBreakdown.tsx` — cost breakdown table with per-choice and monthly total
  columns; colour-coded by cost tier (green / amber / red)
- `web/src/App.tsx` — web portal composing the estimator form and cost breakdown; includes
  network selector (TestNet / MainNet / local DevNet) and export-to-JSON button

---

## Version Notes

- **Milestone 1 scope** (v0.1.0 – v0.3.0): Estimation engine, TypeScript SDK scaffolding,
  web calculator, CI pipeline, documentation
- **Milestone 2 scope** (v0.4.0 – v0.6.0): Python SDK, historical fee database, percentile
  API, OpenAPI specification
- **Milestone 3 scope** (v0.7.0 – v1.0.0): Anomaly alerting, production hardening,
  self-hosting, Docker Compose bundle

[Unreleased]: https://github.com/jalajnagar88-stack/canton-fee-estimator/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/jalajnagar88-stack/canton-fee-estimator/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/jalajnagar88-stack/canton-fee-estimator/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/jalajnagar88-stack/canton-fee-estimator/releases/tag/v0.1.0
