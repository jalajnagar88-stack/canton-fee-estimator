/**
 * @module analyzer
 * Analyzes Daml template structures to estimate Canton transaction fees,
 * with a focus on costs associated with large observer sets (fan-out/pagination).
 */

// --- Type Definitions ---

/**
 * A simplified representation of a Canton cost model.
 * Values would be determined by the Canton domain operator.
 */
export interface CantonCostModel {
  /** Base fee for any transaction submission. */
  baseTransactionFee: number;
  /** Cost per kilobyte of transaction payload. */
  feePerKb: number;
  /**
   * Additional cost for each distinct participant (signatory, controller, observer)
   * involved in a transaction. This represents the work done by their participant node.
   */
  feePerParticipant: number;
  /**
   * The cost to distribute the contract state to a single observer's domain sequencer.
   * This is the critical factor for large observer sets and is often what's meant
   * by "pagination cost" - the total cost scales linearly with the number of observers.
   */
  feePerObserverDistribution: number;
}

/**
 * Represents a party or a count of parties for analysis purposes.
 */
export type PartySet = {
  type: "count";
  count: number;
} | {
  type: "list";
  parties: string[];
};

/**
 * Simplified structure representing a Daml template for cost analysis.
 */
export interface DamlTemplateAnalysisInfo {
  templateName: string;
  /** Estimated size of the contract payload in kilobytes. */
  payloadSizeKb: number;
  signatories: PartySet;
  observers: PartySet;
  choices: DamlChoiceAnalysisInfo[];
}

/**
 * Simplified structure representing a Daml choice.
 */
export interface DamlChoiceAnalysisInfo {
  choiceName: string;
  controllers: PartySet;
  /** Does this choice add new observers? Specify the number. */
  addsObservers?: PartySet;
  /** Does this choice update the contract payload significantly? */
  updatesPayload: boolean;
}

/**
 * Detailed breakdown of the estimated cost for a single operation.
 */
export interface CostBreakdown {
  totalCost: number;
  baseFee: number;
  payloadFee: number;
  participantFee: number;
  /** The specific cost attributed to fanning out to observers. */
  observerDistributionFee: number;
  notes: string[];
}

/**
 * The final analysis result for a template.
 */
export interface TemplateAnalysisResult {
  templateName: string;
  createCost: CostBreakdown;
  choiceCosts: Record<string, CostBreakdown>;
  optimizationSuggestions: string[];
}


// --- Core Analysis Logic ---

/**
 * Helper to get the number of parties from a PartySet.
 */
const getPartyCount = (partySet: PartySet): number => {
  return partySet.type === "count" ? partySet.count : partySet.parties.length;
};

/**
 * Analyzes the cost of a transaction, factoring in observers.
 * @param participants - The set of all active parties (signatories, controllers).
 * @param observers - The set of observers who need to receive state.
 * @param payloadSizeKb - The size of the data being distributed.
 * @param costModel - The Canton cost model.
 * @returns A detailed cost breakdown.
 */
const calculateTransactionCost = (
  participants: PartySet,
  observers: PartySet,
  payloadSizeKb: number,
  costModel: CantonCostModel
): CostBreakdown => {
  const participantCount = getPartyCount(participants);
  const observerCount = getPartyCount(observers);

  const notes: string[] = [];

  // 1. Base transaction fee
  const baseFee = costModel.baseTransactionFee;

  // 2. Payload size fee
  const payloadFee = payloadSizeKb * costModel.feePerKb;

  // 3. Participant node fee (for active parties)
  const participantFee = participantCount * costModel.feePerParticipant;

  // 4. Observer distribution fee (the "pagination" cost)
  // This is the cost of sending the transaction data to each observer's domain.
  // It scales linearly with the number of observers.
  const observerDistributionFee = observerCount * costModel.feePerObserverDistribution;

  if (observerCount > 20) {
      notes.push(`High observer count (${observerCount}) significantly increases the observer distribution fee.`);
  }

  const totalCost = baseFee + payloadFee + participantFee + observerDistributionFee;

  return {
    totalCost,
    baseFee,
    payloadFee,
    participantFee,
    observerDistributionFee,
    notes,
  };
};

/**
 * Analyzes a full Daml template to estimate costs for its lifecycle events.
 * @param templateInfo - The structured information about the Daml template.
 * @param costModel - The Canton cost model to apply.
 * @returns A comprehensive analysis result.
 */
export function analyzeTemplate(
  templateInfo: DamlTemplateAnalysisInfo,
  costModel: CantonCostModel
): TemplateAnalysisResult {
  // --- Analyze Create Operation ---
  const createCost = calculateTransactionCost(
    templateInfo.signatories,
    templateInfo.observers,
    templateInfo.payloadSizeKb,
    costModel
  );

  // --- Analyze Choices ---
  const choiceCosts: Record<string, CostBreakdown> = {};
  for (const choice of templateInfo.choices) {
    // For a choice, the "active" participants are the controllers.
    // The observers are all existing contract observers PLUS any newly added ones.
    const choiceObserversCount = getPartyCount(templateInfo.observers) + (choice.addsObservers ? getPartyCount(choice.addsObservers) : 0);

    const choicePayloadSizeKb = choice.updatesPayload ? templateInfo.payloadSizeKb : 0.1; // Assume small payload for non-updating choices

    choiceCosts[choice.choiceName] = calculateTransactionCost(
      choice.controllers,
      { type: "count", count: choiceObserversCount },
      choicePayloadSizeKb,
      costModel
    );
  }

  // --- Generate Optimization Suggestions ---
  const optimizationSuggestions: string[] = [];
  const observerCount = getPartyCount(templateInfo.observers);

  if (observerCount > 50) {
    optimizationSuggestions.push(
      `[High Impact] The template '${templateInfo.templateName}' has a large observer set (${observerCount}). This dramatically increases transaction costs due to data fan-out. Consider an alternative design pattern, such as a "Notification" or "Data Stream" contract, where interested parties pull data or are sent specific updates, rather than observing a central contract.`
    );
  } else if (observerCount > 10) {
    optimizationSuggestions.push(
      `[Medium Impact] The observer set (${observerCount}) on '${templateInfo.templateName}' is growing. Monitor this, as costs scale linearly with observers. If this number is expected to grow, evaluate alternative patterns before production.`
    );
  }

  const choicesAddingObservers = templateInfo.choices.filter(c => c.addsObservers && getPartyCount(c.addsObservers) > 0);
  if (choicesAddingObservers.length > 0) {
      optimizationSuggestions.push(
          `[Info] Choices (${choicesAddingObservers.map(c => c.choiceName).join(', ')}) add observers dynamically. Be aware that each addition increases the cost of all subsequent transactions on this contract.`
      );
  }


  return {
    templateName: templateInfo.templateName,
    createCost,
    choiceCosts,
    optimizationSuggestions,
  };
}