# Canton Fee Estimator

## Overview

The Canton Fee Estimator is a tool designed to help developers estimate the costs associated with traffic on a Canton network before deploying their Daml contracts to production. It provides insights into per-transaction fees, projected monthly costs based on transaction volume, and optimization suggestions for reducing fees. The tool includes a load simulator that replays realistic transaction patterns against a local Canton DevNet, allowing you to measure actual costs under simulated production conditions.

## Features

*   **Fee Estimation:** Calculates approximate fees for individual transactions based on network traffic and participant roles.
*   **Cost Projection:** Estimates monthly costs based on projected transaction volumes.
*   **Optimization Suggestions:** Provides recommendations for optimizing Daml contracts and transaction patterns to minimize fees.
*   **Load Simulation:** Replays transaction patterns against a local Canton DevNet to simulate production load and measure actual costs.
*   **CLI Interface:** A command-line interface for running simulations and generating reports.
*   **Web Interface:** A user-friendly web interface for visualizing fee estimates and simulation results.

## Quickstart

### Prerequisites

*   [Daml SDK](https://docs.daml.com/getting-started/installation.html) (version 3.1.0 or later)
*   [Node.js](https://nodejs.org/) (version 16 or later)
*   [Docker](https://www.docker.com/) (optional, for running a local Canton DevNet)

### Installation

1.  **Clone the repository:**

    ```bash
    git clone <repository_url>
    cd canton-fee-estimator
    ```

2.  **Install dependencies:**

    ```bash
    npm install
    ```

3.  **Build the Daml code:**

    ```bash
    daml build
    ```

4.  **Generate the DAR file:**

    ```bash
    daml build
    ```

### Usage (CLI)

1.  **Start a local Canton DevNet (optional):**

    You can use Docker to run a local Canton DevNet for testing.  See [Canton documentation](https://docs.canton.io/) for details.

2.  **Configure the CLI:**

    Create a configuration file (e.g., `config.json`) with the necessary settings, including the Canton endpoint, participant details, and transaction patterns. Example:
    ```json
    {
      "cantonEndpoint": "http://localhost:7575",
      "participantId": "Participant1",
      "darPath": "path/to/your/dar/file.dar",
      "transactionPatterns": [
        {
          "contractName": "YourModule:YourContract",
          "choiceName": "YourChoice",
          "payload": { "field1": "value1", "field2": 123 },
          "frequency": 100 // Transactions per minute
        }
      ]
    }
    ```

3.  **Run the fee estimator:**

    ```bash
    node cli.js --config config.json --output report.json
    ```

    This command will simulate transactions based on the patterns defined in `config.json` and generate a fee report in `report.json`.

### Usage (Web Interface)

1.  **Start the web server:**

    ```bash
    npm run start
    ```

2.  **Open the web interface in your browser:**

    Navigate to `http://localhost:3000` (or the port specified in your configuration).

3.  **Configure the connection:**

    Enter the Canton endpoint and participant details.

4.  **Define transaction patterns:**

    Use the web interface to define the transaction patterns you want to simulate.

5.  **Run the simulation:**

    Click the "Run Simulation" button to start the simulation.

6.  **View the results:**

    The web interface will display the estimated fees, projected costs, and optimization suggestions.

## Configuration

The Canton Fee Estimator can be configured using a configuration file or environment variables.  See the `config.example.json` for example configurations. Key configuration options include:

*   `cantonEndpoint`: The URL of the Canton JSON API endpoint.
*   `participantId`: The ID of the participant executing the transactions.
*   `darPath`: The path to the Daml archive (DAR) file containing the contract definitions.
*   `transactionPatterns`: An array of transaction patterns to simulate.
*   `simulationDuration`: The duration of the simulation in seconds.
*   `feeRates`:  Allows overriding default fee rates (advanced).

## Optimization Suggestions

The Canton Fee Estimator provides the following optimization suggestions:

*   **Reduce Transaction Volume:**  Identify and eliminate unnecessary transactions.
*   **Optimize Data Structures:**  Use efficient data structures to reduce the size of transaction payloads.
*   **Batch Transactions:**  Combine multiple transactions into a single transaction where possible.
*   **Use Observers:**  Use observers instead of signatories for read-only access to contracts.

## Contributing

We welcome contributions to the Canton Fee Estimator.  Please see the [CONTRIBUTING.md](CONTRIBUTING.md) file for details on how to contribute.

## License

This project is licensed under the [Apache 2.0 License](LICENSE).