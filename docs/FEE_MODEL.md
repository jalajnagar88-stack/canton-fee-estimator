# Understanding the Canton Network Traffic Fee Model

This document explains the cost model for transactions on a Canton network. Canton Sequencers charge fees for the traffic they process to ensure fair resource allocation and prevent network abuse. Understanding this model is crucial for designing cost-effective and scalable Daml applications.

The `canton-fee-estimator` tool uses this model to provide cost projections for your Daml contracts and workflows.

## Core Concepts

- **Participant Node**: Your application's gateway to the Canton network. It submits commands and receives events. Each participant is responsible for paying traffic fees to the sequencer for the activity it generates.
- **Sequencer**: The network component responsible for ordering transactions and securely broadcasting events to the relevant participants. The sequencer is the entity that charges the fees.
- **Transaction**: A single, atomic Daml ledger update, which may consist of multiple actions (e.g., creates, exercises, fetches).
- **Traffic Unit (TU)**: The abstract unit of cost. All operations are measured in TUs. The final monetary cost is `Total TUs * PricePerTU`, where `PricePerTU` is set by the network operator.

## Key Cost Drivers

The total cost of a transaction is the sum of several components. The primary driver is the amount of data that needs to be broadcast across the network and the number of participants who need to receive it.

The simplified formula for a transaction's cost is:

`TotalCost (in TUs) = BaseCost + SubmissionCost + BroadcastCost + ConfirmationCost`

Let's break down each component.

### 1. Base Transaction Cost (`BaseCost`)

Every transaction submitted to the sequencer incurs a small, fixed base fee. This covers the fundamental overhead of receiving, validating, and sequencing the transaction, regardless of its size or complexity.

### 2. Submission Payload Cost (`SubmissionCost`)

This cost is proportional to the size of the command you submit from your participant node to the sequencer. It's a one-time cost for the data transfer *to* the sequencer.

- **Formula**: `SubmissionCost = SizeOf(SubmittedCommand) * CostPerByte`
- **What's included**: The serialized Daml command, including choice arguments, contract IDs, and metadata.
- **Impact**: Generally a minor component of the total cost unless you are submitting commands with extremely large arguments.

### 3. Broadcast Payload Cost (`BroadcastCost`)

**This is typically the most significant cost driver.** After a transaction is sequenced, the resulting events (e.g., `CreateEvent`, `ArchiveEvent`) must be broadcast to all stakeholders. The cost is calculated based on the size of the event payload multiplied by the number of participant nodes that need to receive it.

- **Formula**: `BroadcastCost = SizeOf(EventPayload) * NumRecipientParticipants * CostPerByte`
- **What's included in `EventPayload`**:
    - For a `create`: The full contract payload (template ID, arguments).
    - For an `exercise`: The choice arguments, consequences (e.g., archived contracts, created contracts), and event metadata.
- **`NumRecipientParticipants`**: The number of unique participant nodes that host at least one stakeholder (signatory or observer) of the event.

**Crucial Insight**: If a contract has a signatory Alice and an observer Bob, the broadcast cost is:
- **Low** if Alice and Bob are hosted on the *same participant node* (`NumRecipientParticipants = 1`).
- **Doubled** if Alice and Bob are hosted on *two different participant nodes* (`NumRecipientParticipants = 2`).

### 4. Confirmation Cost (`ConfirmationCost`)

After receiving a broadcast event, each involved participant node must send a confirmation receipt back to the sequencer. This incurs a small cost for each participant.

- **Formula**: `ConfirmationCost = NumConfirmingParticipants * CostPerConfirmation`
- **Impact**: A minor cost component, but it scales linearly with the number of involved participant nodes.

## Practical Examples & Optimization Strategies

Let's see how these drivers affect common Daml patterns.

### Example 1: `create` an IOU Contract

```daml
template Iou
  with
    issuer: Party
    owner: Party
    amount: Decimal
  where
    signatory issuer
    observer owner
```

- **Scenario A: Low Cost**
  - `issuer` and `owner` are both hosted on `participant1`.
  - When the IOU is created, the `CreateEvent` is sent only to `participant1`.
  - `NumRecipientParticipants = 1`.
  - `BroadcastCost` is minimal.

- **Scenario B: High Cost**
  - `issuer` is on `participant1`, `owner` is on `participant2`.
  - The `CreateEvent` must be sent to both `participant1` and `participant2`.
  - `NumRecipientParticipants = 2`.
  - `BroadcastCost` is roughly double that of Scenario A.

**Optimization**: For parties that interact frequently, co-locating them on the same participant node can dramatically reduce costs. This is an operational decision informed by your application's interaction patterns.

### Example 2: Large Contract Payloads

```daml
template Document
  with
    author: Party
    approvers: [Party]
    content: Text -- A very large string, e.g., 500 KB
  where
    signatory author
    observer approvers
```

- Creating this `Document` contract will be expensive.
- `SizeOf(EventPayload)` is large due to the `content` field.
- The `BroadcastCost` will be `(Size of 500KB payload) * (Num approver participants) * CostPerByte`. This can add up quickly.

**Optimization**: Avoid storing large data blobs directly on the ledger.
- **Store Off-Ledger**: Store the document in an external system (like IPFS or S3).
- **Store On-Ledger**: Store only a reference, such as a URL and a hash of the content.

```daml
template DocumentReference
  with
    author: Party
    approvers: [Party]
    contentUrl: Text
    contentHash: Text -- SHA-256 hash of the off-ledger content
  where
    signatory author
    observer approvers
```
This version has a tiny payload, making its on-ledger operations much cheaper.

### Example 3: The Proliferating `observer` Set

A contract with many observers distributed across many participants is the most expensive pattern.

```daml
template MasterAgreement
  with
    operator: Party
    subscribers: [Party] -- 50 subscribers, each on a different participant
  where
    signatory operator
    observer subscribers
```

- Any action on this contract (e.g., an `exercise` that updates a field) generates an event.
- This event must be broadcast to all 51 participant nodes (operator + 50 subscribers).
- `BroadcastCost = SizeOf(EventPayload) * 51 * CostPerByte`.

**Optimization**: Re-evaluate the need for observation.
- **Is `observer` necessary?**: Does every subscriber need real-time, cryptographic proof of every single change? Often, the answer is no.
- **Use `key` and `fetchByKey`**: Instead of making parties observers, give them the ability to look up the contract by its key when they need the data. This "pull" model avoids the massive broadcast cost of the "push" (observer) model.
- **Role-based Access**: A party can be a `controller` on a choice without being a signatory or observer. This allows them to act on the contract without incurring the observation overhead.

## Summary of Cost Optimization Techniques

1.  **Minimize Payload Size**:
    - Keep contract data lean and focused on business logic state.
    - Store large blobs (files, images, detailed logs) off-ledger and store only their references/hashes on-ledger.

2.  **Control Stakeholder Scope**:
    - Be judicious with the `observer` party set. It is the single biggest multiplier for broadcast costs.
    - Prefer on-demand data access (`fetchByKey`) over universal data broadcast (`observer`).
    - Use controller-only choices to grant action rights without observation rights.

3.  **Analyze Participant Topology**:
    - For high-frequency workflows between a known set of parties, deploying them to the same participant node drastically cuts broadcast costs.
    - For workflows involving many disparate parties, focus heavily on minimizing payload size and observer scope.

Use the `canton-fee-estimator` simulator to run your specific workflows against a local Canton network. This will provide the most accurate measure of your application's traffic costs and help you identify optimization opportunities before deploying to production.