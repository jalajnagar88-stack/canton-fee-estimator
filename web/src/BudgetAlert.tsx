import React from 'react';

/**
 * A simple utility for formatting currency.
 * In a production application, this might be handled by a more robust i18n library.
 * @param amount The numeric amount.
 * @param currency The currency code (e.g., 'USD').
 * @returns A formatted currency string.
 */
const formatCurrency = (amount: number, currency: string): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

interface BudgetAlertProps {
  /** The total projected monthly fee based on current transaction patterns. */
  projectedMonthlyFee: number;

  /** The user-defined monthly budget limit. If this is zero or less, the alert will not be shown. */
  monthlyBudget: number;

  /** The currency for displaying fees and budget (e.g., 'USD', 'CC'). Defaults to 'USD'. */
  currency?: string;
}

/**
 * A warning card component that appears when the projected monthly Canton traffic fees
 * are on track to exceed the configured budget. It provides a clear summary of the
 * projected cost, the budget, and the overage amount.
 */
export const BudgetAlert: React.FC<BudgetAlertProps> = ({
  projectedMonthlyFee,
  monthlyBudget,
  currency = 'USD',
}) => {
  const isOverBudget = monthlyBudget > 0 && projectedMonthlyFee > monthlyBudget;
  const overageAmount = projectedMonthlyFee - monthlyBudget;

  if (!isOverBudget) {
    // Don't render anything if we are within budget or no budget is set.
    return null;
  }

  return (
    <div className="bg-orange-50 border-l-4 border-orange-400 p-4 rounded-lg my-6 shadow-md" role="alert">
      <div className="flex">
        <div className="flex-shrink-0">
          {/* Icon: Exclamation Triangle from Heroicons */}
          <svg
            className="h-6 w-6 text-orange-400 mt-0.5"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>
        <div className="ml-3">
          <h3 className="text-lg font-medium text-orange-800">
            Monthly Budget Alert
          </h3>
          <div className="mt-2 text-sm text-orange-700">
            <p>
              Your projected monthly fee of{' '}
              <strong className="font-semibold text-orange-900">{formatCurrency(projectedMonthlyFee, currency)}</strong>{' '}
              is set to exceed your budget of{' '}
              <strong className="font-semibold text-orange-900">{formatCurrency(monthlyBudget, currency)}</strong>.
            </p>
            <p className="mt-1">
              Projected overage: <strong className="font-semibold text-orange-900">{formatCurrency(overageAmount, currency)}</strong>
            </p>
          </div>
          <div className="mt-4">
            <p className="text-xs text-orange-600">
              <strong>Recommendation:</strong> Consider optimizing your Daml contracts (e.g., reducing contract size, minimizing observers) or adjust your monthly budget to avoid unexpected costs.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BudgetAlert;