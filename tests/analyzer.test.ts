import { analyzeTrace, extrapolateMonthlyCost, generateOptimizations, FeeProfile, Transaction, TraceAnalysis, DetailedCost } from '../src/analyzer';

// NOTE: The types below are mirrored from `src/types.ts` or `src/analyzer.ts`
// for test purposes, making this file self-contained.

interface SubAction {
  type: 'create' | 'archive';
  template: string;
  payloadSizeBytes: number;
}

// Re-declaring types here to make the test file standalone and clear
// In a real project, these would be imported from a shared types file.
declare global {
  interface FeeProfile {
    create: number;
    exercise: number;
    fetch: number;
    lookup: number;
    perByteFee: number;
    perConfirmationFee: number;
  }

  interface Transaction {
    id: string;
    type: 'create' | 'exercise' | 'fetch' | 'lookup';
    template: string;
    choice?: string;
    payloadSizeBytes: number;
    confirmingParties: string[];
    subactions: SubAction[];
  }
  
  interface DetailedCost {
    id: string;
    type: 'create' | 'exercise' | 'fetch' | 'lookup';
    template: string;
    cost: number;
    payloadSizeBytes: number;
  }
  
  interface OptimizationSuggestion {
    type: 'LARGE_PAYLOAD' | 'BATCHING_CANDIDATE';
    suggestion: string;
    severity: 'High' | 'Medium' | 'Low';
    relatedTransactionIds: string[];
  }

  interface TraceAnalysis {
    totalCost: number;
    transactionCount: number;
    costByTemplate: { [key: string]: number };
    costByType: { [key: string]: number };
    detailedCosts: DetailedCost[];
    optimizations: OptimizationSuggestion[];
  }
}


const MOCK_FEE_PROFILE: FeeProfile = {
  create: 0.1,
  exercise: 0.15,
  fetch: 0.05,
  lookup: 0.05,
  perByteFee: 0.00001,
  perConfirmationFee: 0.02,
};

describe('analyzeTrace', () => {

  it('should return zero for an empty trace', () => {
    const analysis = analyzeTrace([], MOCK_FEE_PROFILE);
    expect(analysis.totalCost).toBe(0);
    expect(analysis.transactionCount).toBe(0);
    expect(Object.keys(analysis.costByTemplate).length).toBe(0);
    expect(Object.keys(analysis.costByType).length).toBe(0);
  });

  it('should correctly analyze a single create transaction', () => {
    const trace: Transaction[] = [
      {
        id: 'tx-create-iou',
        type: 'create',
        template: 'Iou:Iou',
        payloadSizeBytes: 256,
        confirmingParties: ['Alice', 'Bob'],
        subactions: [],
      },
    ];

    const expectedCost = 
      MOCK_FEE_PROFILE.create +                   // base create fee
      (256 * MOCK_FEE_PROFILE.perByteFee) +       // payload fee
      (2 * MOCK_FEE_PROFILE.perConfirmationFee);  // confirmation fee
      // 0.1 + 0.00256 + 0.04 = 0.14256

    const analysis = analyzeTrace(trace, MOCK_FEE_PROFILE);

    expect(analysis.totalCost).toBeCloseTo(0.14256);
    expect(analysis.transactionCount).toBe(1);
    expect(analysis.costByTemplate['Iou:Iou']).toBeCloseTo(0.14256);
    expect(analysis.costByType.create).toBeCloseTo(0.14256);
    expect(analysis.detailedCosts[0].id).toBe('tx-create-iou');
    expect(analysis.detailedCosts[0].cost).toBeCloseTo(0.14256);
  });

  it('should correctly analyze an exercise transaction that creates another contract', () => {
    const trace: Transaction[] = [
      {
        id: 'tx-exercise-transfer',
        type: 'exercise',
        template: 'Iou:Iou',
        choice: 'Transfer',
        payloadSizeBytes: 128, // args for the Transfer choice
        confirmingParties: ['Alice', 'Bob', 'Charlie'],
        subactions: [
          {
            type: 'create',
            template: 'Iou:TransferProposal',
            payloadSizeBytes: 180,
          }
        ],
      },
    ];

    // The model assumes the cost is driven by the top-level action, summing all payloads.
    const totalPayloadSize = 128 + 180;
    const expectedCost = 
      MOCK_FEE_PROFILE.exercise +                           // base exercise fee
      (totalPayloadSize * MOCK_FEE_PROFILE.perByteFee) +    // combined payload fee
      (3 * MOCK_FEE_PROFILE.perConfirmationFee);            // confirmation fee
      // 0.15 + (308 * 0.00001) + (3 * 0.02) = 0.15 + 0.00308 + 0.06 = 0.21308

    const analysis = analyzeTrace(trace, MOCK_FEE_PROFILE);

    expect(analysis.totalCost).toBeCloseTo(0.21308);
    expect(analysis.transactionCount).toBe(1);
    // Cost is attributed to the template of the top-level action
    expect(analysis.costByTemplate['Iou:Iou']).toBeCloseTo(0.21308);
    expect(analysis.costByType.exercise).toBeCloseTo(0.21308);
  });

  it('should aggregate costs from multiple, mixed transactions', () => {
    const trace: Transaction[] = [
      { id: 'tx1', type: 'create', template: 'Iou:Iou', payloadSizeBytes: 256, confirmingParties: ['A', 'B'], subactions: [] },
      { id: 'tx2', type: 'create', template: 'Asset:Stock', payloadSizeBytes: 512, confirmingParties: ['Bank'], subactions: [] },
      { id: 'tx3', type: 'exercise', template: 'Iou:Iou', choice: 'Archive', payloadSizeBytes: 32, confirmingParties: ['A', 'B'], subactions: [] },
      { id: 'tx4', type: 'fetch', template: 'Asset:Stock', payloadSizeBytes: 0, confirmingParties: ['Bank'], subactions: [] },
    ];

    const costTx1 = 0.1 + (256 * 0.00001) + (2 * 0.02);   // 0.14256
    const costTx2 = 0.1 + (512 * 0.00001) + (1 * 0.02);   // 0.12512
    const costTx3 = 0.15 + (32 * 0.00001) + (2 * 0.02);   // 0.19032
    const costTx4 = 0.05 + (0 * 0.00001) + (1 * 0.02);    // 0.07

    const totalCost = costTx1 + costTx2 + costTx3 + costTx4; // 0.528
    const totalIouCost = costTx1 + costTx3; // 0.33288
    const totalAssetCost = costTx2 + costTx4; // 0.19512
    const totalCreateCost = costTx1 + costTx2; // 0.26768

    const analysis = analyzeTrace(trace, MOCK_FEE_PROFILE);

    expect(analysis.totalCost).toBeCloseTo(totalCost);
    expect(analysis.transactionCount).toBe(4);
    expect(analysis.costByTemplate['Iou:Iou']).toBeCloseTo(totalIouCost);
    expect(analysis.costByTemplate['Asset:Stock']).toBeCloseTo(totalAssetCost);
    expect(analysis.costByType.create).toBeCloseTo(totalCreateCost);
    expect(analysis.costByType.exercise).toBeCloseTo(costTx3);
    expect(analysis.costByType.fetch).toBeCloseTo(costTx4);
  });
});

describe('extrapolateMonthlyCost', () => {
  it('should correctly extrapolate cost based on target monthly transaction volume', () => {
    const traceAnalysis: TraceAnalysis = {
      totalCost: 2.5,
      transactionCount: 20,
      costByTemplate: {}, costByType: {}, detailedCosts: [], optimizations: [],
    };
    
    const monthlyTransactions = 1_000_000;
    
    // Cost per transaction in trace = 2.5 / 20 = 0.125
    // Projected monthly cost = 0.125 * 1,000,000 = 125,000
    const monthlyCost = extrapolateMonthlyCost(traceAnalysis, monthlyTransactions);
    
    expect(monthlyCost).toBe(125000);
  });
  
  it('should return 0 if the base trace has no transactions', () => {
    const traceAnalysis: TraceAnalysis = {
      totalCost: 0,
      transactionCount: 0,
      costByTemplate: {}, costByType: {}, detailedCosts: [], optimizations: [],
    };
    
    const monthlyTransactions = 1_000_000;
    const monthlyCost = extrapolateMonthlyCost(traceAnalysis, monthlyTransactions);
    
    expect(monthlyCost).toBe(0);
  });
});

describe('generateOptimizations', () => {
  it('should suggest reducing payload for transactions over the size threshold', () => {
    const trace: Transaction[] = [{
      id: 'tx-large-payload',
      type: 'create',
      template: 'Data:LargeAttachment',
      payloadSizeBytes: 250 * 1024, // 250 KB
      confirmingParties: ['PartyA'],
      subactions: [],
    }];
    
    // Assume threshold in analyzer is 100KB
    const analysis = analyzeTrace(trace, MOCK_FEE_PROFILE);
    const optimizations = generateOptimizations(analysis);

    expect(optimizations.length).toBe(1);
    expect(optimizations[0].type).toBe('LARGE_PAYLOAD');
    expect(optimizations[0].relatedTransactionIds).toEqual(['tx-large-payload']);
    expect(optimizations[0].suggestion).toContain('has a large payload (250.00 KB)');
    expect(optimizations[0].suggestion).toContain('Consider using reference data or storing the payload off-ledger.');
    expect(optimizations[0].severity).toBe('High');
  });

  it('should suggest batching for high-frequency, similar transactions', () => {
    // This test simulates the output of an analyzer that has already identified a pattern
    const mockAnalysis: TraceAnalysis = {
      totalCost: 5.5,
      transactionCount: 50,
      costByTemplate: { 'Orders:MiniOrder': 5.5 },
      costByType: { 'create': 5.5 },
      detailedCosts: Array.from({ length: 50 }, (_, i) => ({
        id: `tx-order-${i}`,
        type: 'create',
        template: 'Orders:MiniOrder',
        cost: 0.11,
        payloadSizeBytes: 100,
      })),
      optimizations: [],
    };
    
    // Assume batching threshold is > 20 transactions of the same template
    const optimizations = generateOptimizations(mockAnalysis);
    
    expect(optimizations.length).toBe(1);
    expect(optimizations[0].type).toBe('BATCHING_CANDIDATE');
    expect(optimizations[0].suggestion).toContain('Found 50 transactions for template Orders:MiniOrder');
    expect(optimizations[0].suggestion).toContain('Consider implementing a batch processing choice');
    expect(optimizations[0].severity).toBe('Medium');
  });

  it('should not generate suggestions for a well-structured and efficient trace', () => {
    const trace: Transaction[] = [
      { id: 'tx1', type: 'create', template: 'Iou:Iou', payloadSizeBytes: 256, confirmingParties: ['A', 'B'], subactions: [] },
      { id: 'tx2', type: 'exercise', template: 'Iou:Iou', choice: 'Archive', payloadSizeBytes: 32, confirmingParties: ['A', 'B'], subactions: [] },
    ];

    const analysis = analyzeTrace(trace, MOCK_FEE_PROFILE);
    const optimizations = generateOptimizations(analysis);
    
    expect(optimizations.length).toBe(0);
  });
});