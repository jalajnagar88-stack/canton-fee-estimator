import React from 'react';

/**
 * Represents the cost analysis for a single choice in a Daml contract.
 */
export interface ChoiceCost {
  choiceName: string;
  transactionFee: number; // Estimated fee for one transaction of this choice
  monthlyVolume: number;  // Projected number of exercises per month
  monthlyCost: number;    // The total estimated monthly cost (transactionFee * monthlyVolume)
}

/**
 * Represents the complete analysis result for a Daml model.
 */
export interface AnalysisResult {
  totalMonthlyCost: number;
  choices: ChoiceCost[];
}

/**
 * Props for the CostBreakdown component.
 */
interface CostBreakdownProps {
  result: AnalysisResult | null;
  isLoading: boolean;
}

/**
 * Formats a number as a currency string (e.g., USD).
 * @param value The numeric value to format.
 * @param precision The number of decimal places to show.
 * @returns A formatted currency string.
 */
const formatCurrency = (value: number, precision: number = 2): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  }).format(value);
};

/**
 * Formats a number with thousands separators.
 * @param value The number to format.
 * @returns A formatted number string.
 */
const formatNumber = (value: number): string => {
  return new Intl.NumberFormat('en-US').format(value);
};

/**
 * A React component that displays the cost breakdown in a table.
 * It handles loading and empty states gracefully.
 */
const CostBreakdown: React.FC<CostBreakdownProps> = ({ result, isLoading }) => {
  if (isLoading) {
    return (
      <div className="cost-breakdown-card loading-state">
        <h3>Analyzing Costs...</h3>
        <p>Simulating transaction patterns against the Canton DevNet. This may take a moment.</p>
        <div className="spinner" />
      </div>
    );
  }

  if (!result || result.choices.length === 0) {
    return (
      <div className="cost-breakdown-card empty-state">
        <h3>Cost Breakdown</h3>
        <p>Submit your Daml model and transaction profile to see the estimated Canton hosting fees.</p>
      </div>
    );
  }

  return (
    <div className="cost-breakdown-card">
      <h2>Cost Estimation Results</h2>
      <p className="summary">
        Based on the provided transaction profile, the estimated total monthly cost is
        <strong> {formatCurrency(result.totalMonthlyCost)}</strong>.
      </p>
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Choice</th>
              <th>Fee per Tx (Est.)</th>
              <th>Monthly Volume</th>
              <th>Monthly Cost (Est.)</th>
            </tr>
          </thead>
          <tbody>
            {result.choices.map((choice) => (
              <tr key={choice.choiceName}>
                <td data-label="Choice">{choice.choiceName}</td>
                <td data-label="Fee per Tx">{formatCurrency(choice.transactionFee, 4)}</td>
                <td data-label="Monthly Volume">{formatNumber(choice.monthlyVolume)}</td>
                <td data-label="Monthly Cost">{formatCurrency(choice.monthlyCost)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3} className="total-label">Total Estimated Monthly Cost</td>
              <td className="total-value" data-label="Total">{formatCurrency(result.totalMonthlyCost)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <div className="disclaimer">
        <p>
          <strong>Disclaimer:</strong> This is an estimate based on a simplified cost model and the provided
          transaction profile. Actual costs on a production Canton network may vary depending on network topology,
          participant node configuration, transaction complexity, and the operator's specific pricing model.
        </p>
      </div>
    </div>
  );
};

export default CostBreakdown;