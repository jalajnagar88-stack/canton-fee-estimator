#!/usr/bin/env node

import * as fs from 'fs';
import * as path from 'path';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import chalk from 'chalk';
import glob from 'glob';
import Table from 'cli-table3';
import { analyzeDamlSource, AnalysisResult } from '../src/analyzer';
import { FeeModel, CANTON_FEE_PER_BYTE } from '../src/feeModel';

const main = async () => {
  const argv = await yargs(hideBin(process.argv))
    .command(
      '$0 <projectPath>',
      'Batch analyze a Daml project for Canton traffic fee estimation',
      (y) => {
        return y.positional('projectPath', {
          describe: 'Path to the root of the Daml project (containing daml.yaml or multi-package.yaml)',
          type: 'string',
        });
      }
    )
    .option('json', {
      alias: 'j',
      type: 'boolean',
      description: 'Output the report in JSON format',
      default: false,
    })
    .demandCommand(1)
    .help()
    .alias('h', 'help')
    .strict()
    .argv;

  const projectPath = path.resolve(argv.projectPath as string);
  const isJsonOutput = argv.json;

  if (!fs.existsSync(projectPath)) {
    console.error(chalk.red(`Error: Project path not found at '${projectPath}'`));
    process.exit(1);
  }

  if (!isJsonOutput) {
    console.log(chalk.cyan.bold('Canton Fee Estimator - Batch Analysis Report'));
    console.log(chalk.cyan.bold('============================================'));
    console.log(`\nAnalyzing project at: ${chalk.green(projectPath)}\n`);
  }

  try {
    const damlFiles = findDamlFiles(projectPath);

    if (damlFiles.length === 0) {
      console.warn(chalk.yellow('Warning: No .daml files found in the specified project path.'));
      process.exit(0);
    }

    if (!isJsonOutput) {
      console.log(`Found ${chalk.blue(damlFiles.length)} Daml files to analyze...`);
    }

    const allResults: AnalysisResult[] = [];
    for (const file of damlFiles) {
      try {
        const content = fs.readFileSync(file, 'utf-8');
        const results = analyzeDamlSource(content, file);
        allResults.push(...results);
      } catch (error) {
        console.error(chalk.red(`\nError analyzing file ${file}:`), error);
      }
    }

    if (!isJsonOutput) {
      console.log(chalk.green('✓ Analysis complete.\n'));
      printHumanReadableReport(allResults);
    } else {
      printJsonReport(allResults);
    }

  } catch (error) {
    console.error(chalk.red('An unexpected error occurred during analysis:'), error);
    process.exit(1);
  }
};

/**
 * Finds all Daml source files within a project directory.
 * A production-grade tool might parse `daml.yaml` and `multi-package.yaml`
 * to precisely locate source directories, but globbing is sufficient for most cases.
 * @param projectRoot The root directory of the Daml project.
 * @returns An array of absolute paths to .daml files.
 */
const findDamlFiles = (projectRoot: string): string[] => {
    const pattern = path.join(projectRoot, '**/*.daml');
    return glob.sync(pattern, { ignore: ['**/dist/**', '**/.daml/**', '**/node_modules/**'] });
};

/**
 * Prints a formatted, human-readable report to the console.
 * @param results The aggregated analysis results from all Daml files.
 */
const printHumanReadableReport = (results: AnalysisResult[]): void => {
  if (results.length === 0) {
    console.log(chalk.yellow('No Daml templates found to analyze.'));
    return;
  }

  const feeModel = new FeeModel(CANTON_FEE_PER_BYTE);
  const table = new Table({
    head: [
      chalk.bold('Module'),
      chalk.bold('Template / Choice'),
      chalk.bold('Action'),
      chalk.bold('Est. Size (bytes)'),
      chalk.bold('Est. Fee (USD)'),
    ],
    colWidths: [25, 30, 12, 20, 18],
    style: { head: ['cyan'] }
  });

  let totalCreateSize = 0;
  let createCount = 0;
  let totalExerciseSize = 0;
  let exerciseCount = 0;

  results.sort((a, b) => `${a.moduleName}.${a.templateName}`.localeCompare(`${b.moduleName}.${b.templateName}`)).forEach(res => {
    const createFee = feeModel.calculateFee(res.createSize.estimatedBytes);
    table.push([
        res.moduleName,
        res.templateName,
        'Create',
        res.createSize.estimatedBytes.toString(),
        `$${createFee.toFixed(6)}`
    ]);
    totalCreateSize += res.createSize.estimatedBytes;
    createCount++;

    res.choices.sort((a,b) => a.choiceName.localeCompare(b.choiceName)).forEach(choice => {
        const exerciseFee = feeModel.calculateFee(choice.exerciseSize.estimatedBytes);
        table.push([
            '', // Don't repeat module/template for clarity
            chalk.gray(`└─ ${choice.choiceName}`),
            'Exercise',
            choice.exerciseSize.estimatedBytes.toString(),
            `$${exerciseFee.toFixed(6)}`
        ]);
        totalExerciseSize += choice.exerciseSize.estimatedBytes;
        exerciseCount++;
    });
  });

  console.log(table.toString());

  console.log(chalk.bold.underline('\nSummary'));
  console.log(`- Total Templates Analyzed: ${chalk.blue(createCount)}`);
  console.log(`- Total Choices Analyzed:   ${chalk.blue(exerciseCount)}`);

  if (createCount > 0) {
    const avgCreateFee = feeModel.calculateFee(totalCreateSize / createCount);
    console.log(`- Est. Average Create Fee:  ${chalk.green(`$${avgCreateFee.toFixed(6)}`)}`);
  }
  if (exerciseCount > 0) {
    const avgExerciseFee = feeModel.calculateFee(totalExerciseSize / exerciseCount);
    console.log(`- Est. Average Exercise Fee:${chalk.green(`$${avgExerciseFee.toFixed(6)}`)}`);
  }

  console.log(chalk.bold.underline('\nOptimization Suggestions'));
  const largeCreations = results
    .filter(r => r.createSize.estimatedBytes > 2048) // Threshold: 2KB
    .sort((a,b) => b.createSize.estimatedBytes - a.createSize.estimatedBytes)
    .slice(0, 3);

  if (largeCreations.length > 0) {
    largeCreations.forEach(res => {
        console.log(`- ${chalk.yellow(res.moduleName + ':' + res.templateName)} create size is large (${res.createSize.estimatedBytes} bytes). Review its fields for potential simplification.`);
    });
  } else {
    console.log(chalk.gray('- No immediate suggestions. All analyzed contracts are reasonably sized.'));
  }
};

/**
 * Prints a structured JSON report to the console.
 * @param results The aggregated analysis results from all Daml files.
 */
const printJsonReport = (results: AnalysisResult[]): void => {
    const feeModel = new FeeModel(CANTON_FEE_PER_BYTE);
    const report = {
        summary: {
            templatesAnalyzed: results.length,
            choicesAnalyzed: results.reduce((acc, curr) => acc + curr.choices.length, 0),
        },
        details: results.map(res => ({
            module: res.moduleName,
            template: res.templateName,
            create: {
                estimatedBytes: res.createSize.estimatedBytes,
                estimatedFeeUSD: feeModel.calculateFee(res.createSize.estimatedBytes),
                warnings: res.createSize.warnings,
            },
            choices: res.choices.map(choice => ({
                name: choice.choiceName,
                exercise: {
                    estimatedBytes: choice.exerciseSize.estimatedBytes,
                    estimatedFeeUSD: feeModel.calculateFee(choice.exerciseSize.estimatedBytes),
                    warnings: choice.exerciseSize.warnings,
                }
            })),
        }))
    };
    console.log(JSON.stringify(report, null, 2));
};

main().catch(err => {
  console.error(chalk.red('\nAn unrecoverable error occurred during execution:'), err);
  process.exit(1);
});