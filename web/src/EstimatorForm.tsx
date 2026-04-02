import React, { useState, useCallback, ChangeEvent, FormEvent } from 'react';

// Define the structure for the estimation results
interface EstimationResult {
  fileName: string;
  totalMonthlyCost: number;
  costBreakdown: {
    creates: {
      count: number;
      costPerTx: number;
      totalCost: number;
    };
    exercises: {
      count: number;
      costPerTx: number;
      totalCost: number;
    };
  };
  optimizationSuggestions: string[];
}

// Mock API function to simulate backend processing. In a real application,
// this would be an actual fetch/axios call to the backend service.
const runEstimationApi = async (
  file: File,
  createsPerMonth: number,
  exercisesPerMonth: number
): Promise<EstimationResult> => {
  console.log(`Simulating estimation for ${file.name} with ${createsPerMonth} creates/mo and ${exercisesPerMonth} exercises/mo.`);

  // Simulate network delay and processing
  await new Promise(resolve => setTimeout(resolve, 1500));

  // Simulate some logic based on inputs
  if (file.name.includes("error")) {
    throw new Error("Failed to parse Daml contract. Please check the syntax.");
  }

  // Generate realistic-looking mock data
  const costPerCreate = 0.0015; // Simulated cost per create
  const costPerExercise = 0.0021; // Simulated cost per exercise
  const createTotal = createsPerMonth * costPerCreate;
  const exerciseTotal = exercisesPerMonth * costPerExercise;
  const totalCost = createTotal + exerciseTotal;

  const suggestions: string[] = [];
  if (exercisesPerMonth > 100000) {
    suggestions.push("High exercise volume detected. Consider batching operations where possible to reduce transaction overhead.");
  }
  if (file.size > 5000) { // Arbitrary size check
    suggestions.push("Large contract file size. Review for complex logic or large data structures that could increase transaction size and cost.");
  }
  if (totalCost > 1000) {
      suggestions.push("Projected monthly cost is significant. Ensure all signatories and observers are necessary for each transaction.");
  }
  suggestions.push("Review data dependencies between contracts. Fetching multiple contracts within a choice can increase transaction complexity and cost.");


  return {
    fileName: file.name,
    totalMonthlyCost: parseFloat(totalCost.toFixed(2)),
    costBreakdown: {
      creates: {
        count: createsPerMonth,
        costPerTx: costPerCreate,
        totalCost: parseFloat(createTotal.toFixed(2)),
      },
      exercises: {
        count: exercisesPerMonth,
        costPerTx: costPerExercise,
        totalCost: parseFloat(exerciseTotal.toFixed(2)),
      },
    },
    optimizationSuggestions: suggestions,
  };
};


const EstimatorForm: React.FC = () => {
  const [damlFile, setDamlFile] = useState<File | null>(null);
  const [createsPerMonth, setCreatesPerMonth] = useState<string>('10000');
  const [exercisesPerMonth, setExercisesPerMonth] = useState<string>('50000');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<EstimationResult | null>(null);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setDamlFile(e.target.files[0]);
      setError(null);
      setResult(null);
    }
  };

  const handleSubmit = useCallback(async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!damlFile) {
      setError("Please upload a Daml contract file.");
      return;
    }

    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const creates = parseInt(createsPerMonth, 10);
      const exercises = parseInt(exercisesPerMonth, 10);

      if (isNaN(creates) || isNaN(exercises) || creates < 0 || exercises < 0) {
        throw new Error("Please enter valid, non-negative numbers for transaction volumes.");
      }

      const estimationResult = await runEstimationApi(damlFile, creates, exercises);
      setResult(estimationResult);
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred.");
    } finally {
      setIsLoading(false);
    }
  }, [damlFile, createsPerMonth, exercisesPerMonth]);

  const buttonStyle = isLoading || !damlFile 
    ? { ...styles.button, ...styles.buttonDisabled }
    : styles.button;

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>Canton Fee Estimator</h1>
        <p style={styles.subtitle}>Upload your Daml contract and estimate your monthly transaction costs on Canton.</p>
        
        <form onSubmit={handleSubmit}>
          <div style={styles.formGroup}>
            <label htmlFor="damlFile" style={styles.label}>1. Upload Daml Contract (.daml)</label>
            <input
              type="file"
              id="damlFile"
              accept=".daml"
              onChange={handleFileChange}
              style={styles.fileInput}
              disabled={isLoading}
            />
            {damlFile && <p style={styles.fileName}>{damlFile.name}</p>}
          </div>

          <div style={styles.formGroup}>
            <label htmlFor="creates" style={styles.label}>2. Estimated Monthly `create` Operations</label>
            <input
              type="number"
              id="creates"
              value={createsPerMonth}
              onChange={(e) => setCreatesPerMonth(e.target.value)}
              style={styles.numberInput}
              placeholder="e.g., 10000"
              min="0"
              disabled={isLoading}
            />
          </div>

          <div style={styles.formGroup}>
            <label htmlFor="exercises" style={styles.label}>3. Estimated Monthly `exercise` Operations</label>
            <input
              type="number"
              id="exercises"
              value={exercisesPerMonth}
              onChange={(e) => setExercisesPerMonth(e.target.value)}
              style={styles.numberInput}
              placeholder="e.g., 50000"
              min="0"
              disabled={isLoading}
            />
          </div>

          <button type="submit" style={buttonStyle} disabled={isLoading || !damlFile}>
            {isLoading ? 'Estimating...' : 'Run Estimation'}
          </button>
        </form>

        {error && <div style={styles.errorBox}>{error}</div>}
      </div>

      {result && (
        <div style={{...styles.card, ...styles.resultsCard}}>
          <h2 style={styles.resultsTitle}>Estimation Results for <span style={{fontFamily: 'monospace'}}>{result.fileName}</span></h2>
          <div style={styles.totalCostContainer}>
            <span style={styles.totalCostLabel}>Estimated Total Monthly Cost</span>
            <span style={styles.totalCostValue}>${result.totalMonthlyCost.toLocaleString()}</span>
          </div>

          <div style={styles.breakdownContainer}>
            <div style={styles.breakdownItem}>
              <h3 style={styles.breakdownTitle}>`create` Operations</h3>
              <p>Count: {result.costBreakdown.creates.count.toLocaleString()}</p>
              <p>Est. Cost/Tx: ${result.costBreakdown.creates.costPerTx}</p>
              <p>Subtotal: <strong>${result.costBreakdown.creates.totalCost.toLocaleString()}</strong></p>
            </div>
            <div style={styles.breakdownItem}>
              <h3 style={styles.breakdownTitle}>`exercise` Operations</h3>
              <p>Count: {result.costBreakdown.exercises.count.toLocaleString()}</p>
              <p>Est. Cost/Tx: ${result.costBreakdown.exercises.costPerTx}</p>
              <p>Subtotal: <strong>${result.costBreakdown.exercises.totalCost.toLocaleString()}</strong></p>
            </div>
          </div>
          
          <div style={styles.optimizations}>
            <h3 style={styles.optimizationsTitle}>Optimization Suggestions</h3>
            <ul>
              {result.optimizationSuggestions.map((suggestion, index) => (
                <li key={index} style={styles.suggestionItem}>{suggestion}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};

// Basic styling to make the component usable without an external CSS file
const styles: { [key: string]: React.CSSProperties } = {
  container: {
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    maxWidth: '700px',
    margin: '40px auto',
    padding: '20px',
    color: '#333',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: '8px',
    padding: '30px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
    marginBottom: '20px',
  },
  title: {
    fontSize: '28px',
    fontWeight: 700,
    margin: '0 0 10px 0',
    color: '#1a202c',
  },
  subtitle: {
    fontSize: '16px',
    color: '#718096',
    marginBottom: '30px',
  },
  formGroup: {
    marginBottom: '20px',
  },
  label: {
    display: 'block',
    fontWeight: 600,
    marginBottom: '8px',
    fontSize: '14px',
  },
  fileInput: {
    width: '100%',
    padding: '10px',
    border: '1px solid #cbd5e0',
    borderRadius: '4px',
    fontSize: '14px',
  },
  fileName: {
    fontSize: '12px',
    color: '#4a5568',
    marginTop: '5px',
    fontFamily: 'monospace',
  },
  numberInput: {
    width: '100%',
    boxSizing: 'border-box',
    padding: '12px',
    border: '1px solid #cbd5e0',
    borderRadius: '4px',
    fontSize: '16px',
  },
  button: {
    width: '100%',
    padding: '15px',
    fontSize: '16px',
    fontWeight: 700,
    color: '#fff',
    backgroundColor: '#007bff',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  },
  buttonDisabled: {
    backgroundColor: '#a0aec0',
    cursor: 'not-allowed',
  },
  errorBox: {
    marginTop: '20px',
    padding: '15px',
    backgroundColor: '#fef2f2',
    color: '#991b1b',
    border: '1px solid #fecaca',
    borderRadius: '4px',
  },
  resultsCard: {
    backgroundColor: '#f7fafc',
    border: '1px solid #e2e8f0',
  },
  resultsTitle: {
    fontSize: '22px',
    borderBottom: '1px solid #e2e8f0',
    paddingBottom: '15px',
    marginBottom: '20px',
  },
  totalCostContainer: {
    backgroundColor: '#e6f7ff',
    border: '1px solid #91d5ff',
    borderRadius: '8px',
    padding: '20px',
    textAlign: 'center',
    marginBottom: '20px',
  },
  totalCostLabel: {
    display: 'block',
    fontSize: '16px',
    color: '#0050b3',
    marginBottom: '5px',
  },
  totalCostValue: {
    display: 'block',
    fontSize: '36px',
    fontWeight: 700,
    color: '#003a8c',
  },
  breakdownContainer: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '20px',
    marginBottom: '20px',
  },
  breakdownItem: {
    flex: 1,
    padding: '15px',
    backgroundColor: '#fff',
    border: '1px solid #e2e8f0',
    borderRadius: '4px',
  },
  breakdownTitle: {
    margin: '0 0 10px 0',
    fontSize: '16px',
  },
  optimizations: {
    marginTop: '20px',
  },
  optimizationsTitle: {
    fontSize: '18px',
    marginBottom: '10px',
  },
  suggestionItem: {
    backgroundColor: '#fff',
    padding: '10px',
    borderRadius: '4px',
    border: '1px solid #e2e8f0',
    marginBottom: '8px',
    fontSize: '14px',
    listStyleType: 'none'
  },
};

export default EstimatorForm;