# Canton Network Fee Optimisation Guide

This document provides practical patterns and strategies for designing cost-effective Daml smart contracts on the Canton Network. The Canton fee model is influenced by factors like transaction payload size, the number of stakeholders, and the complexity of the transaction graph. By optimising your Daml code, you can significantly reduce the operational costs of your application.

## Core Principles of Fee Optimisation

1.  **Minimize Payload Size:** Smaller contracts and choices result in smaller transactions, which are cheaper to process, distribute, and store.
2.  **Minimize Stakeholder Count:** Every signatory and observer adds to the cost of a transaction, as data must be securely distributed to them. Be deliberate about who needs to see what data.
3.  **Simplify Transaction Graphs:** A single choice that creates, archives, and exercises many other contracts results in a complex transaction that is more expensive than several simpler, independent transactions.
4.  **Batch Operations:** Where possible, consolidate multiple logical business events into a single, well-structured ledger transaction to reduce per-transaction overhead.

---

## Common Daml Patterns and Optimisations

### 1. Master Agreements & Role Contracts

**Problem:** Many workflows involve repeated interactions between the same set of parties under a common legal agreement (e.g., an ISDA Master Agreement for derivatives trading). Creating a full contract with all the terms and parties for every single trade is highly inefficient and costly.

**Optimisation:** Use a long-lived `MasterAgreement` or `Role` contract to represent the overarching relationship. Individual `Trade` contracts then only need to contain the specific economic details of the trade and a `ContractId MasterAgreement` to link back to the common terms.

**Example:**

```daml
-- Inefficient: All terms are duplicated in every contract
template Trade_Inefficient
  with
    tradeId: Text
    buyer: Party
    seller: Party
    masterAgreementTerms: Text -- Large text field
    legalEntityBuyer: Text
    legalEntitySeller: Text
    product: ...
  where
    signatory buyer, seller

-- Efficient: Common terms are referenced via ContractId
template MasterAgreement
  with
    partyA: Party
    partyB: Party
    masterAgreementTerms: Text -- Large text field
    legalEntityA: Text
    legalEntityB: Text
  where
    signatory partyA, partyB

template Trade_Efficient
  with
    tradeId: Text
    buyer: Party
    seller: Party
    masterAgreementCid: ContractId MasterAgreement
    product: ...
  where
    signatory buyer, seller
```

**Impact:**
*   **Reduced Payload:** Each `Trade` contract is significantly smaller.
*   **Simplified Logic:** Validation can be delegated to the `MasterAgreement` contract.

---

### 2. Off-Ledger Data Storage

**Problem:** Storing large data blobs, such as legal documents, images, or detailed reports, directly on the ledger is extremely expensive. It dramatically increases the payload size of every transaction involving that contract.

**Optimisation:** Store the large data file in an external, content-addressable storage system (like IPFS or a private S3 bucket). The Daml contract should only store a cryptographic hash of the file (e.g., SHA-256) and a URI pointing to its location. This maintains the integrity and non-repudiation benefits of the ledger without incurring the cost of storing the data itself.

**Example:**

```daml
-- Inefficient: Storing the full document on-ledger
template DocumentContract_Inefficient
  with
    author: Party
    reviewer: Party
    documentContent: Text -- Can be megabytes in size
  where
    signatory author, reviewer

-- Efficient: Storing a hash and link on-ledger
template DocumentContract_Efficient
  with
    author: Party
    reviewer: Party
    documentUri: Text      -- e.g., "s3://my-bucket/doc123.pdf"
    documentHash: Text     -- e.g., "0a4d55a8d778e5022fab701977c5d840bbc486d0" (SHA1)
    hashAlgorithm: Text    -- "SHA-1"
  where
    signatory author, reviewer
```

**Impact:**
*   **Drastically Reduced Payload:** Contract size is reduced from megabytes to bytes.
*   **Improved Performance:** Smaller transactions are processed faster across the network.

---

### 3. Granular Choices vs. Monolithic Choices

**Problem:** A single, complex choice that performs many actions (e.g., calculates payments, updates statuses, creates new obligations, and archives itself) generates a large and complex transaction graph. This complexity translates directly to higher fees.

**Optimisation:** Decompose complex business processes into a series of smaller, more focused choices. This allows participants to execute only the necessary steps, creating simpler, cheaper transactions at each stage of the workflow.

**Example:**

```daml
template Invoice
  with
    issuer: Party
    debtor: Party
    amount: Decimal
    isSettled: Bool
    isClosed: Bool
  where
    signatory issuer, debtor

    -- Inefficient: Monolithic choice
    choice SettleAndClose: ContractId Invoice
      with
        paymentId: Text
      controller debtor
      do
        -- Logic to verify payment...
        -- Logic to log settlement...
        create this with isSettled = True, isClosed = True

    -- Efficient: Granular choices
    choice Settle: ContractId Invoice
      with
        paymentId: Text
      controller debtor
      do
        assertMsg "Invoice is already settled" (not isSettled)
        -- Logic to verify payment...
        create this with isSettled = True

    nonconsuming choice Close: ()
      with
        reason: Text
      controller issuer
      do
        assertMsg "Invoice must be settled before closing" isSettled
        archive self
```
**Impact:**
*   **Reduced Transaction Complexity:** Each step is a simpler transaction.
*   **Increased Flexibility:** The workflow is more adaptable as parties can choose when to execute each step.

---

### 4. Judicious Use of Observers

**Problem:** Every party listed as an `observer` on a contract must receive and process the transaction data, increasing distribution costs. Often, parties are added as observers "just in case" they need the information later.

**Optimisation:** Be strict with who is an observer. An observer should be a party that is *required* for the contract's workflow (e.g., a regulator or a clearing house that must see every state change). For parties that only need occasional visibility, use the following patterns:
*   **Choice Controllers:** Give a party controller rights on a non-consuming choice that allows them to `fetch` the contract data when needed.
*   **Explicit Divulgence:** Use the underlying Canton ledger API to divulge contract instances to specific parties on a need-to-know basis without making them permanent observers.

**Example:**

```daml
template FinancialInstrument
  with
    owner: Party
    issuer: Party
    custodian: Party
    regulator: Party       -- Required observer for compliance
    -- auditor: Party      -- Inefficient: Auditor doesn't need real-time access
    isin: Text
  where
    signatory owner, issuer
    observer custodian, regulator

    nonconsuming choice GetAuditData : FinancialInstrument
      with
        auditor: Party -- The party requesting the data
      controller auditor
      do
        -- The choice succeeding gives the auditor visibility of the contract state
        -- at this point in time, without making them a permanent observer.
        pure self
```

**Impact:**
*   **Reduced Distribution Cost:** Fewer parties are involved in the consensus and validation of each transaction.
*   **Improved Privacy:** Limits the visibility of contract data to only essential parties.

---

## Summary of Optimisation Patterns

| Problem Area              | Inefficient Pattern                                     | Optimised Pattern                                                               | Primary Benefit               |
| ------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------- | ----------------------------- |
| **Repeated Agreements**   | Duplicating all terms in every contract.                | Reference a single `MasterAgreement` contract via `ContractId`.                 | Payload Size Reduction        |
| **Large Data Payloads**   | Storing large documents or files on-ledger.             | Store a hash and URI on-ledger; keep the file in external storage.              | Drastic Payload Size Reduction|
| **Workflow Complexity**   | One monolithic choice for a multi-step process.         | Multiple, granular choices for each distinct step in the process.               | Transaction Complexity        |
| **Data Visibility**       | Adding many non-essential parties as `observers`.       | Limit observers to essential parties; use non-consuming choices for ad-hoc access. | Distribution Cost Reduction   |
| **High-Frequency Events** | Creating one contract/transaction per event.            | Aggregate events into a summary contract and process in batches.                | Reduced Transaction Count     |