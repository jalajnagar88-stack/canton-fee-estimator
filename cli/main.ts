#!/usr/bin/env node

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import fs from 'fs';
import path from 'path';

// Placeholder for the actual simulation and analysis logic.
// In a real application, this would be in a separate module.
import { runAnalysis, AnalysisConfig, Scenario } from './analyzer';

// Define the structure for our command-line arguments
interface CliArgs {
  scenario: string;
  dar: string;
  host: string;
  port: number;
  'token-file'?: string;
  output: 'json' | 'text' | 'csv';
  verbose: boolean;
}

/**
 * Reads a JSON file and validates its structure against the Scenario type.
 * @param filePath The path to the scenario JSON file.
 * @returns A parsed Scenario object.
 */
function readScenarioFile(filePath: string): Scenario {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Scenario file not found: ${filePath}`);
  }
  const fileContent = fs.readFileSync(filePath, 'utf-8');
  const scenario = JSON.parse(fileContent);

  // Basic validation
  if (!scenario.duration || typeof scenario.duration.value !== 'number' || !scenario.duration.unit) {
    throw new Error('Scenario file must contain a valid "duration" object with "unit" and "value".');
  }
  if (!Array.isArray(scenario.transactions)) {
    throw new Error('Scenario file must contain a "transactions" array.');
  }

  return scenario as Scenario;
}

/**
 * Reads the JWT from a file.
 * @param filePath Path to the file containing the JWT.
 * @returns The JWT as a string.
 */
function readTokenFromFile(filePath: string): string {
    if (!fs.existsSync(filePath)) {
        throw new Error(`Token file not found: ${filePath}`);
    }
    return fs.readFileSync(filePath, 'utf-8').trim();
}


/**
 * Main application entry point.
 */
async function main() {
  await yargs(hideBin(process.argv))
    .command<CliArgs>(
      'estimate <scenario>',
      'Estimate Canton transaction fees based on a scenario file',
      (yargs) => {
        return yargs
          .positional('scenario', {
            describe: 'Path to the JSON scenario file describing transaction workload',
            type: 'string',
            normalize: true,
            demandOption: true,
          })
          .option('dar', {
            alias: 'd',
            describe: 'Path to the compiled Daml project DAR file',
            type: 'string',
            normalize: true,
            demandOption: true,
          })
          .option('host', {
            describe: 'Canton participant JSON API hostname',
            type: 'string',
            default: 'localhost',
          })
          .option('port', {
            describe: 'Canton participant JSON API port',
            type: 'number',
            default: 7575,
          })
          .option('token-file', {
            describe: 'Path to a file containing the Canton JSON API JWT',
            type: 'string',
            normalize: true,
          })
          .option('output', {
            alias: 'o',
            describe: 'Output format for the report',
            choices: ['json', 'text', 'csv'] as const,
            default: 'text' as const,
          })
          .option('verbose', {
            alias: 'v',
            describe: 'Enable verbose logging',
            type: 'boolean',
            default: false,
          });
      },
      async (argv) => {
        try {
          console.log('Canton Fee Estimator\n--------------------');

          const scenarioPath = path.resolve(argv.scenario);
          const darPath = path.resolve(argv.dar);

          if (!fs.existsSync(darPath)) {
            throw new Error(`DAR file not found: ${darPath}`);
          }

          const scenario = readScenarioFile(scenarioPath);
          const authToken = argv['token-file'] ? readTokenFromFile(path.resolve(argv['token-file'])) : undefined;
          
          if (argv.verbose) {
            console.log('Configuration:');
            console.log(`  - Scenario File: ${scenarioPath}`);
            console.log(`  - DAR File: ${darPath}`);
            console.log(`  - Canton Host: ${argv.host}:${argv.port}`);
            console.log(`  - Auth Token: ${authToken ? 'Provided' : 'Not provided'}`);
            console.log(`  - Output Format: ${argv.output}\n`);
          }

          const config: AnalysisConfig = {
            darPath,
            scenario,
            ledger: {
              host: argv.host,
              port: argv.port,
              authToken,
            },
            outputFormat: argv.output,
            verbose: argv.verbose,
          };

          // Hand off to the core analysis logic
          await runAnalysis(config);

        } catch (error) {
          console.error('\nError:', error instanceof Error ? error.message : 'An unknown error occurred.');
          process.exit(1);
        }
      }
    )
    .demandCommand(1, 'You must provide the "estimate" command.')
    .strict()
    .help()
    .alias('h', 'help')
    .fail((msg, err) => {
      console.error(msg || err?.message || 'An error occurred.');
      console.error('For help, run: canton-fee-estimator --help');
      process.exit(1);
    }).argv;
}

// Execute the main function
main().catch((err) => {
  console.error("An unexpected fatal error occurred:", err);
  process.exit(1);
});