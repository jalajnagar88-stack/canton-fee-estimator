/**
 * cli/reporter.ts
 *
 * This module is responsible for generating and formatting the final human-readable
 * report based on the cost analysis and simulation data.
 */

// --- Type Definitions ---

/**
 * Represents the cost metrics for a single type of DAML operation.
 * e.g., "create MyModule:MyTemplate"
 */
export interface OperationCost {
  operation: string;
  count: number;
  averageCost: number;
  totalCost: number;
}

/**
 * Aggregated data from analyzing a set of transactions (e.g., from a script).
 */
export interface AnalysisReportData {
  operationCosts: OperationCost[];
  totalTransactions: number;
  totalCost: number;
  estimatedMonthlyCost: number;
}

/**
 * Performance and cost metrics gathered from a load simulation run.
 */
export interface SimulationMetrics {
  durationSeconds: number;
  totalTransactions: number;
  transactionsPerSecond: number;
  totalCost: number;
  averageCostPerTx: number;
}

/**
 * A structured suggestion for optimizing DAML contracts for lower fees.
 */
export interface OptimizationSuggestion {
  title: string;
  description: string;
  severity: 'High' | 'Medium' | 'Low';
}

// --- ANSI Colors for Console Output ---

const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  yellow: "\x1b[33m",
  green: "\x1b[32m",
  magenta: "\x1b[35m",
  red: "\x1b[31m",
};

// --- Helper Functions ---

const printHeader = (title: string) => {
  console.log(`\n${colors.bright}${colors.cyan}===== ${title.toUpperCase()} =====${colors.reset}`);
};

const formatCost = (cost: number) => cost.toFixed(6);

// --- Core Reporter Logic ---

/**
 * Generates and prints a detailed cost analysis report to the console.
 *
 * @param analysisData - The analyzed cost data from DAML scripts or transaction logs.
 * @param simulationMetrics - Optional metrics from a load simulation run.
 * @param suggestions - Optional list of optimization suggestions.
 */
export function generateReport(
  analysisData: AnalysisReportData,
  simulationMetrics?: SimulationMetrics,
  suggestions?: OptimizationSuggestion[]
): void {
  printHeader("Canton Fee Estimator Report");

  // --- Summary Section ---
  console.log(`${colors.bright}Summary:${colors.reset}`);
  console.log(`  - ${colors.yellow}Estimated Monthly Cost:${colors.reset} ${formatCost(analysisData.estimatedMonthlyCost)}`);
  console.log(`  - Total Transactions Analyzed: ${analysisData.totalTransactions}`);
  console.log(`  - Total Cost of Analyzed Transactions: ${formatCost(analysisData.totalCost)}`);
  if (analysisData.totalTransactions > 0) {
      console.log(`  - Average Cost per Transaction: ${formatCost(analysisData.totalCost / analysisData.totalTransactions)}`);
  }

  // --- Cost Breakdown Section ---
  printHeader("Cost Breakdown by Operation");
  if (analysisData.operationCosts.length > 0) {
    const header = [
      "Operation".padEnd(60),
      "Count".padStart(10),
      "Avg Cost".padStart(15),
      "Total Cost".padStart(15),
      "% of Total".padStart(12)
    ].join(" | ");
    console.log(`${colors.bright}${header}${colors.reset}`);
    console.log("-".repeat(header.length));

    const sortedOperations = [...analysisData.operationCosts].sort((a, b) => b.totalCost - a.totalCost);

    sortedOperations.forEach(op => {
      const percentage = analysisData.totalCost > 0 ? ((op.totalCost / analysisData.totalCost) * 100).toFixed(2) : "0.00";
      const row = [
        op.operation.padEnd(60),
        op.count.toString().padStart(10),
        formatCost(op.averageCost).padStart(15),
        formatCost(op.totalCost).padStart(15),
        `${percentage}%`.padStart(12)
      ].join(" | ");
      console.log(row);
    });
  } else {
    console.log("No operation cost data available to display.");
  }

  // --- Simulation Results Section ---
  if (simulationMetrics) {
    printHeader("Load Simulation Results");
    console.log(`  - Simulation Duration: ${simulationMetrics.durationSeconds.toFixed(2)} seconds`);
    console.log(`  - Total Transactions Executed: ${simulationMetrics.totalTransactions}`);
    console.log(`  - ${colors.green}Throughput (TPS):${colors.reset} ${simulationMetrics.transactionsPerSecond.toFixed(2)}`);
    console.log(`  - Total Cost During Simulation: ${formatCost(simulationMetrics.totalCost)}`);
    console.log(`  - Average Cost per Transaction (Real): ${formatCost(simulationMetrics.averageCostPerTx)}`);
  }

  // --- Optimization Suggestions Section ---
  if (suggestions && suggestions.length > 0) {
    printHeader("Optimization Suggestions");
    suggestions.forEach(suggestion => {
        let severityColor = colors.reset;
        switch (suggestion.severity) {
            case 'High': severityColor = colors.red; break;
            case 'Medium': severityColor = colors.yellow; break;
            case 'Low': severityColor = colors.magenta; break;
        }

        console.log(`  - ${severityColor}${colors.bright}[${suggestion.severity}] ${suggestion.title}${colors.reset}`);
        console.log(`    ${colors.dim}${suggestion.description}${colors.reset}`);
    });
  }

  console.log(`\n${colors.bright}${colors.green}✔ Report generated successfully.${colors.reset}\n`);
}

/**
 * Generates mock data for testing the reporter's output.
 * This can be imported and used in other parts of the CLI for development.
 */
export function generateMockData(): { analysisData: AnalysisReportData, simulationMetrics: SimulationMetrics, suggestions: OptimizationSuggestion[] } {
    const operationCosts: OperationCost[] = [
        { operation: 'create Iou.Iou:Iou', count: 50, averageCost: 0.0012, totalCost: 0.06 },
        { operation: 'exercise Iou.Iou:Iou:Transfer', count: 200, averageCost: 0.0025, totalCost: 0.50 },
        { operation: 'exercise Iou.Iou:Iou:Archive', count: 45, averageCost: 0.0008, totalCost: 0.036 },
        { operation: 'fetchByKey Iou.Iou:Iou', count: 500, averageCost: 0.0001, totalCost: 0.05 },
    ];

    const totalCost = operationCosts.reduce((sum, op) => sum + op.totalCost, 0);
    const totalTransactions = operationCosts.reduce((sum, op) => sum + op.count, 0);

    const analysisData: AnalysisReportData = {
        operationCosts,
        totalTransactions,
        totalCost,
        estimatedMonthlyCost: totalCost * 30 * 24 * 60, // Dummy calculation
    };

    const simulationMetrics: SimulationMetrics = {
        durationSeconds: 60.5,
        totalTransactions: 795,
        transactionsPerSecond: 13.14,
        totalCost: 0.646,
        averageCostPerTx: 0.0008125,
    };

    const suggestions: OptimizationSuggestion[] = [
        {
            title: "High usage of 'exercise Iou.Iou:Iou:Transfer'",
            description: "This is your most expensive operation. Review the choice logic to see if any fetches can be replaced with key-based lookups or if the stakeholder set can be reduced.",
            severity: 'High'
        },
        {
            title: "Frequent Key-based Fetches",
            description: "The 'fetchByKey' operation is highly efficient. Consider converting other `fetch` operations to `fetchByKey` where primary keys are available and known.",
            severity: 'Low'
        }
    ];

    return { analysisData, simulationMetrics, suggestions };
}