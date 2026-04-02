# TestNet Learnings — Canton Fee Estimator

This document records what was discovered running the estimation engine and its underlying
assumptions against Canton TestNet during the development of Milestone 1.

---

## Environment

- **Network**: Canton TestNet (Global Synchronizer, public)
- **SDK version tested**: `3.1.0`
- **Participant**: Self-hosted on a standard 4-vCPU / 8 GB RAM VPS
- **Testing period**: February – March 2026
- **Total transactions sampled**: 1,847 across 6 contract patterns

---

## Finding 1 — Broadcast cost dominates; base fee is noise

**Hypothesis**: The base transaction fee would account for 20–30% of total cost on a typical
DeFi operation.

**Result**: On a 3-party IOU transfer (Alice → Bob, witnessed by Clearing), the breakdown was:

| Component          | Measured cost (TU) | % of total |
|--------------------|-------------------|-----------|
| Base fee           | 0.0001            | 0.6%      |
| Submission payload | 0.0031            | 19.4%     |
| Broadcast          | 0.0114            | 71.3%     |
| Confirmations      | 0.0014            | 8.7%      |
| **Total**          | **0.0160**        | 100%      |

**Impact on estimator**: Initial prototypes weighted base fee at 25%. Revised to < 1%.
The `feePerObserverDistribution` parameter now carries the dominant weight in the cost model.

---

## Finding 2 — Observer count creates a non-linear cost cliff above 8 participants

**Hypothesis**: Cost scales linearly with observer count.

**Result**: Linear up to ~8 unique participants on separate nodes. Above 8, sequencer
batching breaks down and per-additional-participant cost jumped roughly 1.4×.

```
Participants │  Measured TU  │  Linear model  │  Delta
─────────────┼───────────────┼────────────────┼────────
     2        │     0.0032    │     0.0032     │   0%
     4        │     0.0064    │     0.0064     │   0%
     8        │     0.0129    │     0.0128     │  +0.8%
    12        │     0.0241    │     0.0192     │ +25.5%
    20        │     0.0512    │     0.0320     │ +60.0%
```

**Impact on estimator**: The analyser now applies a `1.4×` multiplier above the 8-participant
threshold and surfaces a `[High Impact]` warning in the optimisation report.

---

## Finding 3 — `fetchByKey` is free in terms of broadcast cost

**Hypothesis**: Key-based lookups would incur a small broadcast cost for the lookup result.

**Result**: `fetchByKey` does not generate a new broadcast event — it reads from the
participant's local ACS projection. Cost = confirmation overhead only (~0.0002 TU).

**Impact on estimator**: `fetchByKey` operations are now modelled at the confirmation-floor
rate, not at broadcast rate. Switching a high-frequency read from `fetch` (broadcast) to
`fetchByKey` (local) shows ~85% cost reduction in estimator output.

---

## Finding 4 — Payload compression is not applied below 512 bytes

**Hypothesis**: Canton compresses all event payloads before broadcast.

**Result**: Compression only kicks in for payloads > 512 bytes. Sub-512-byte contracts
(the majority of simple DeFi contracts) are broadcast uncompressed.

**Impact on estimator**: The `feePerKb` model now uses a two-tier approach:
- Payloads ≤ 512 bytes: full byte cost, no compression factor
- Payloads > 512 bytes: 40% compression factor applied (empirically derived)

---

## Finding 5 — CI/CD cost regression is real and measurable

**Hypothesis**: Fee changes between Canton versions would be < 5% and not worth gating CI on.

**Result**: Canton `2.9.x` → `3.0.0` increased broadcast cost for multi-party settlements
by **31%** due to changes in the confirmation protocol. Three production applications had
to re-tune their fee buffers after upgrading with no automated alert.

**Impact on tool**: This directly validates the proposal's CI integration use case. The
`--assert-max-cost` flag was added to the CLI specifically to gate CI pipelines on cost
regression thresholds.

---

## Known Gaps for Milestone 2

- **Historical percentile database**: Current estimates use a static cost model. Milestone 2
  will add a background worker ingesting real transaction fees from public Scan API endpoints,
  replacing static rates with live p50/p75/p95 distributions.
- **Multi-domain scenarios**: All TestNet tests ran against a single synchroniser domain.
  Cross-domain transaction cost is not yet modelled.
- **Sequencer-specific fee policies**: NaaS operators can configure custom fee schedules.
  Milestone 2 will add a `--fee-profile` flag to override defaults.

---

## Acknowledgements

TestNet access and early feedback from the Canton developer community.
Specific thanks to participants in the Canton Developers Discord (`#fee-model` channel)
who shared their own empirical cost observations for cross-validation.
