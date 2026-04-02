import React, { useState } from 'react';
import EstimatorForm from './EstimatorForm';
import CostBreakdown, { EstimationResult } from './CostBreakdown';
import './App.css';

function App() {
  const [result, setResult] = useState<EstimationResult | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Simulates a backend call to the Canton fee analysis engine.
   * In a real application, this would be an API call:
   *
   * const response = await fetch('/api/estimate', {
   *   method: 'POST',
   *   headers: { 'Content-Type': 'application/json' },
   *   body: JSON.stringify({ damlCode, monthlyTxVolume })
   * });
   * const data = await response.json();
   * setResult(data);
   *
   * For this example, we'll perform a simplified, local analysis.
   */
  const handleEstimate = async (damlCode: string, monthlyTxVolume: number) => {
    setIsLoading(true);
    setResult(null);
    setError(null);

    try {
      // Simulate network delay and processing time
      await new Promise(resolve => setTimeout(resolve, 1200));

      // Simple static analysis of the provided Daml code
      const createCount = (damlCode.match(/create /g) || []).length;
      const archiveCount = (damlCode.match(/archive /g) || []).length;
      const exerciseCount = (damlCode.match(/exercise /g) || []).length - archiveCount; // exercise can be archive
      const fetchCount = (damlCode.match(/fetch /g) || []).length;
      const lookupCount = (damlCode.match(/lookupByKey/g) || []).length;

      const totalActions = createCount + exerciseCount + fetchCount + lookupCount + archiveCount;

      if (totalActions === 0) {
        throw new Error("No recognizable Daml actions (create, exercise, fetch, lookupByKey, archive) found in the provided code snippet.");
      }

      // Dummy cost model - these values are for demonstration purposes only.
      // Real costs depend on transaction size, participant topology, and sequencer pricing.
      const COST_PER_CREATE = 0.0015;
      const COST_PER_EXERCISE = 0.0010;
      const COST_PER_FETCH = 0.0002;
      const COST_PER_LOOKUP = 0.0001;
      const COST_PER_ARCHIVE = 0.0005;

      const feePerWorkflow = (createCount * COST_PER_CREATE) +
                             (exerciseCount * COST_PER_EXERCISE) +
                             (fetchCount * COST_PER_FETCH) +
                             (lookupCount * COST_PER_LOOKUP) +
                             (archiveCount * COST_PER_ARCHIVE);

      const monthlyCost = feePerWorkflow * monthlyTxVolume;

      // Generate optimization suggestions
      const optimizations: string[] = [];
      if (fetchCount > createCount + exerciseCount) {
        optimizations.push("High number of `fetch` calls detected. Consider using contract keys and `lookupByKey` or `fetchByKey` for more efficient contract retrieval.");
      }
      if (createCount > 5) {
        optimizations.push("Multiple `create` actions found. If related, investigate using `createAndExercise` or batching creations in a single choice to reduce transactions.");
      }
      if (!damlCode.includes('key')) {
         optimizations.push("No contract keys found. Using keys allows for efficient `fetchByKey` and `lookupByKey`, reducing query costs and improving performance.");
      } else {
         optimizations.push("Good use of contract keys. Ensure you are leveraging `fetchByKey` and `lookupByKey` where appropriate.");
      }


      const estimatedResult: EstimationResult = {
        feePerTransaction: parseFloat(feePerWorkflow.toFixed(6)),
        monthlyCost: parseFloat(monthlyCost.toFixed(2)),
        totalTransactions: monthlyTxVolume,
        breakdown: {
          create: createCount,
          exercise: exerciseCount,
          archive: archiveCount,
          fetch: fetchCount,
          lookup: lookupCount,
        },
        optimizations,
      };

      setResult(estimatedResult);

    } catch (e: any) {
      setError(e.message || "An unexpected error occurred during estimation.");
    } finally {
      setIsLoading(false);
    }
  };


  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo-container">
          <img src="/canton-logo.svg" className="app-logo" alt="Canton Network Logo" />
          <h1>Canton Fee Estimator</h1>
        </div>
        <p className="subtitle">
          Analyze your Daml contracts to estimate transaction fees and identify optimization opportunities on the Canton Network.
        </p>
      </header>
      <main className="app-main">
        <EstimatorForm onEstimate={handleEstimate} isLoading={isLoading} />
        <div className="results-container">
          {isLoading && (
            <div className="spinner-container">
              <div className="spinner"></div>
              <p>Analyzing Daml code and calculating costs...</p>
            </div>
          )}
          {error && <div className="error-message"><strong>Error:</strong> {error}</div>}
          {result && !isLoading && <CostBreakdown result={result} />}
          {!result && !isLoading && !error && (
            <div className="placeholder">
              <h2>Your cost analysis will appear here.</h2>
              <p>Paste your Daml template code and provide an estimated monthly transaction volume to begin.</p>
            </div>
          )}
        </div>
      </main>
      <footer className="app-footer">
        <p>Disclaimer: This tool provides a pre-production estimate. Actual fees are subject to network configuration, transaction complexity, and final pricing models.</p>
        <p>&copy; 2024 Digital Asset. All Rights Reserved.</p>
      </footer>
    </div>
  );
}

export default App;