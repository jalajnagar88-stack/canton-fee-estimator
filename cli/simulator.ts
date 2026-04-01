import axios, { AxiosInstance } from 'axios';
import chalk from 'chalk';
import { performance } from 'perf_hooks';

// --- Configuration ---
const JSON_API_URL = process.env.JSON_API_URL || 'http://localhost:7575';

// --- Type Definitions ---

/**
 * Represents a single action (create or exercise) in a transaction pattern.
 * Placeholders like '$step0.contractId' can be used to reference outputs
 * from previous steps within the same pattern iteration.
 */
export interface SimulationAction {
  type: 'create' | 'exercise';
  party: string; // The party name (e.g., 'Alice') executing the action
  templateId: string;
  payload?: Record<string, any>; // For 'create'
  contractId?: string; // For 'exercise'. Can use placeholder like '$step0.contractId'
  choice?: string; // For 'exercise'
  argument?: Record<string, any>; // For 'exercise'
  description: string; // User-friendly description for logging
}

/**
 * Defines a sequence of actions that constitutes a single logical transaction flow.
 * This entire sequence will be executed for each iteration of the simulation.
 */
export type TransactionPattern = SimulationAction[];

/**
 * Configuration for the simulation run.
 */
export interface SimulationConfig {
  pattern: TransactionPattern;
  iterations: number;
  concurrency: number; // Number of parallel workers simulating the pattern
  partyTokens: Record<string, string>; // Map of party name to JWT
}

/**
 * Results collected from the simulation run.
 */
export interface SimulationResult {
  totalDurationMs: number;
  totalTransactions: number;
  successfulTransactions: number;
  failedTransactions: number;
  transactionsPerSecond: number;
  averageLatencyMs: number;
  p95LatencyMs: number;
  latencies: number[];
}

// --- API Client ---

/**
 * A client for interacting with the Canton JSON API.
 */
class JsonApiClient {
  private client: AxiosInstance;
  private partyTokens: Record<string, string>;

  constructor(baseURL: string, partyTokens: Record<string, string>) {
    this.client = axios.create({ 
      baseURL,
      timeout: 10000 // 10 second timeout for API requests
    });
    this.partyTokens = partyTokens;
  }

  private getAuthHeader(party: string): { Authorization: string } {
    const token = this.partyTokens[party];
    if (!token) {
      throw new Error(`No JWT found for party "${party}"`);
    }
    return { Authorization: `Bearer ${token}` };
  }

  async create(party: string, templateId: string, payload: Record<string, any>): Promise<any> {
    const response = await this.client.post('/v1/create', {
      templateId,
      payload,
    }, {
      headers: this.getAuthHeader(party),
    });
    return response.data.result;
  }

  async exercise(party: string, templateId: string, contractId: string, choice: string, argument: Record<string, any>): Promise<any> {
    const response = await this.client.post('/v1/exercise', {
      templateId,
      contractId,
      choice,
      argument,
    }, {
      headers: this.getAuthHeader(party),
    });
    return response.data.result;
  }
}

// --- Simulation Logic ---

/**
 * Replaces placeholders in an action's data with results from previous steps.
 * e.g., resolves '$step0.contractId' to the actual contract ID from the first step's result.
 * @param action The action to process.
 * @param context The results from previous steps in the pattern.
 * @returns A new action object with placeholders resolved.
 */
function resolveActionContext(action: SimulationAction, context: any[]): SimulationAction {
  let actionString = JSON.stringify(action);
  context.forEach((stepResult, index) => {
    if (stepResult?.contractId) {
      const placeholder = new RegExp(`"\\$step${index}.contractId"`, 'g');
      actionString = actionString.replace(placeholder, `"${stepResult.contractId}"`);
    }
  });
  return JSON.parse(actionString);
}

/**
 * Executes a single iteration of the transaction pattern.
 * @param apiClient The JSON API client.
 * @param pattern The transaction pattern to execute.
 * @returns The total latency in milliseconds for the iteration.
 */
async function executePatternIteration(apiClient: JsonApiClient, pattern: TransactionPattern): Promise<number> {
  const iterationStartTime = performance.now();
  const context: any[] = []; // Stores results of each step (e.g., created contract)

  for (const rawAction of pattern) {
    // Resolve any placeholders (like contractIds from previous steps)
    const action = resolveActionContext(rawAction, context);
    
    let result: any;
    try {
      switch (action.type) {
        case 'create':
          result = await apiClient.create(action.party, action.templateId, action.payload || {});
          break;
        case 'exercise':
          if (!action.contractId || !action.choice) {
            throw new Error(`Exercise action "${action.description}" is missing contractId or choice`);
          }
          result = await apiClient.exercise(action.party, action.templateId, action.contractId, action.choice, action.argument || {});
          break;
        default:
          throw new Error(`Unknown action type: ${(action as any).type}`);
      }
      context.push(result);
    } catch (error: any) {
      const errorMessage = error.response?.data?.errors?.join(', ') || error.message;
      // Re-throw to mark the entire iteration as failed and be caught by the worker
      throw new Error(`Action "${action.description}" failed: ${errorMessage}`);
    }
  }

  const iterationEndTime = performance.now();
  return iterationEndTime - iterationStartTime;
}


/**
 * Runs the load simulation against the Canton DevNet based on the provided configuration.
 * @param config The simulation configuration.
 * @returns A promise that resolves with the simulation results.
 */
export async function runSimulation(config: SimulationConfig): Promise<SimulationResult> {
  console.log(chalk.cyan('--- Starting Canton Load Simulation ---'));
  console.log(`Target Ledger: ${JSON_API_URL}`);
  console.log(`Total Iterations:  ${config.iterations}`);
  console.log(`Concurrency Level: ${config.concurrency}`);
  console.log(`Pattern contains ${config.pattern.length} action(s) per iteration.`);
  console.log(chalk.cyan('---------------------------------------'));

  const apiClient = new JsonApiClient(JSON_API_URL, config.partyTokens);
  const latencies: number[] = [];
  let successfulTransactions = 0;
  let failedTransactions = 0;

  const workerPromises: Promise<void>[] = [];
  const iterationsPerWorker = Math.ceil(config.iterations / config.concurrency);

  const simulationStartTime = performance.now();

  for (let i = 0; i < config.concurrency; i++) {
    const workerPromise = (async () => {
      for (let j = 0; j < iterationsPerWorker; j++) {
        const iterationIndex = i * iterationsPerWorker + j;
        if (iterationIndex >= config.iterations) break;

        try {
          const latency = await executePatternIteration(apiClient, config.pattern);
          latencies.push(latency);
          successfulTransactions++;
          process.stdout.write(chalk.green('.'));
        } catch (error: any) {
          failedTransactions++;
          process.stdout.write(chalk.red('F'));
          // Optionally log detailed error for debugging, but can be noisy.
          // console.error(chalk.red(`\nIteration ${iterationIndex} failed: ${error.message}`));
        }
      }
    })();
    workerPromises.push(workerPromise);
  }

  await Promise.all(workerPromises);

  const simulationEndTime = performance.now();
  const totalDurationMs = simulationEndTime - simulationStartTime;
  const totalDurationSec = totalDurationMs / 1000;

  // Calculate statistics
  const totalTransactions = successfulTransactions + failedTransactions;
  const transactionsPerSecond = totalDurationSec > 0 ? successfulTransactions / totalDurationSec : 0;
  const averageLatencyMs = latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0;
  
  // Calculate P95 latency
  latencies.sort((a, b) => a - b);
  const p95Index = Math.floor(latencies.length * 0.95);
  const p95LatencyMs = latencies.length > 0 ? latencies[p95Index] : 0;

  console.log(chalk.cyan('\n\n--- Simulation Complete ---'));

  const results: SimulationResult = {
    totalDurationMs,
    totalTransactions,
    successfulTransactions,
    failedTransactions,
    transactionsPerSecond,
    averageLatencyMs,
    p95LatencyMs,
    latencies
  };
  
  printResults(results);

  return results;
}

/**
 * Prints the formatted results of the simulation to the console.
 */
function printResults(results: SimulationResult): void {
  console.log(chalk.bold.whiteBright('Performance Summary:'));
  console.log(`  Total Duration:         ${(results.totalDurationMs / 1000).toFixed(2)}s`);
  console.log(`  Total Iterations:       ${results.totalTransactions}`);
  console.log(chalk.green(`  Successful:             ${results.successfulTransactions}`));
  console.log(chalk.red(`  Failed:                 ${results.failedTransactions}`));
  console.log(chalk.white(`  Throughput (TPS):       ${results.transactionsPerSecond.toFixed(2)}`));
  console.log(chalk.white(`  Average Latency:        ${results.averageLatencyMs.toFixed(2)}ms`));
  console.log(chalk.white(`  P95 Latency:            ${results.p95LatencyMs.toFixed(2)}ms`));
  console.log(chalk.cyan('---------------------------'));
}