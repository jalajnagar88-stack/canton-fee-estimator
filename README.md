# Canton Fee Estimator

> **Pre-submission transaction cost intelligence for Canton Network developers.**
> Know what a transaction will cost before you submit it — no surprises in production.

[![CI](https://github.com/jalajnagar88-stack/canton-fee-estimator/actions/workflows/ci.yml/badge.svg)](https://github.com/jalajnagar88-stack/canton-fee-estimator/actions/workflows/ci.yml)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D16-brightgreen)](https://nodejs.org/)

Canton has no native fee estimation primitive. This tool fills that gap with a CLI analyser,
a load simulator, and a web calculator — so teams can profile costs against a local DevNet
before committing to production.

See [`LEARNINGS.md`](LEARNINGS.md) for empirical findings from TestNet testing.

---

## Features

- **CLI fee analyser** — estimate per-transaction cost from a scenario JSON file
- **Load simulator** — replay realistic workloads against a local Canton DevNet
- **Cost reporter** — ranked breakdown by template, choice, and cost driver
- **Optimisation suggestions** — detects large observer sets, payload bloat, and batching candidates
- **Web calculator** — browser UI for interactive estimation without writing code
- **CI integration** — `--assert-max-cost` flag gates pipelines on cost regression

---

## Quickstart

### Prerequisites

- [Node.js](https://nodejs.org/) ≥ 16
- [Daml SDK](https://docs.daml.com/getting-started/installation.html) ≥ 3.1.0 *(required only for simulation against a live DevNet)*
- [Docker](https://www.docker.com/) *(optional — for spinning up a local Canton DevNet)*

### Install

```bash
git clone https://github.com/jalajnagar88-stack/canton-fee-estimator.git
cd canton-fee-estimator
npm install
```

### Run the CLI estimator

```bash
# Quickest path — let the script handle deps and config generation:
./scripts/estimate.sh

# Or call the CLI directly:
npx ts-node cli/main.ts estimate scenario.json --dar path/to/contracts.dar --output text
```

**Scenario file** (`scenario.json`):
```json
{
  "duration": { "value": 60, "unit": "seconds" },
  "transactions": [
    { "template": "Iou:Iou", "choice": "Transfer", "payloadSizeBytes": 256,
      "confirmingParties": ["Alice", "Bob"], "frequencyPerMinute": 120 }
  ]
}
```

Output flags: `--output text` (default) | `--output json` | `--output csv`

### Run tests

```bash
npm test              # jest with coverage
npm run test:watch    # watch mode
```

### Start the web calculator

```bash
cd web
npm install
npm run dev           # Vite dev server at http://localhost:5173
```

For a production build:

```bash
cd web && npm run build   # output in web/dist/
```

---

## CLI Reference

```
Usage: canton-fee-estimator estimate <scenario> [options]

Positional:
  scenario          Path to scenario JSON file

Options:
  -d, --dar         Path to compiled .dar file          [required]
  --host            Canton JSON API hostname             [default: localhost]
  --port            Canton JSON API port                 [default: 7575]
  --token-file      Path to JWT file for authenticated endpoints
  -o, --output      Output format: text | json | csv     [default: text]
  -v, --verbose     Verbose logging
  -h, --help        Show help
```

---

## Cost Model

See [`docs/FEE_MODEL.md`](docs/FEE_MODEL.md) for a full breakdown of how Canton traffic fees
are calculated (base cost, submission payload, broadcast fan-out, confirmation overhead).

Key insight from TestNet: **broadcast fan-out accounts for ~71% of total cost** on a typical
3-party operation. Observer count is the single biggest cost lever — see
[`docs/OPTIMISATION.md`](docs/OPTIMISATION.md) for patterns.

---

## Project Layout

```
.
├── cli/            TypeScript CLI — analyser, simulator, reporter
├── web/            Vite + React web calculator
│   └── src/        EstimatorForm, CostBreakdown, App
├── tests/          Jest unit tests for CLI modules
├── docs/           FEE_MODEL.md, OPTIMISATION.md
├── scripts/        estimate.sh — one-command convenience wrapper
└── LEARNINGS.md    Empirical findings from Canton TestNet
```

---

## Contributing

Pull requests welcome. Please open an issue first for significant changes.

## License

[Apache 2.0](LICENSE) — © 2026 Jalaj Nagar