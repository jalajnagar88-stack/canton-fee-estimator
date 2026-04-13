#!/usr/bin/env node

import { Command } from 'commander';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';

const execAsync = promisify(exec);

// --- Fee Model Constants (Based on docs/FEE_MODEL.md) ---
// This would typically be in a shared library.
const FREE_TIER_BYTES = 5 * 1024; // 5 KB free tier per transaction
const CENTS_PER_MEGABYTE = 200; // $2.00 per MB

/**
 * Calculates the estimated traffic fee for a given transaction size in bytes.
 * @param bytes The size of the transaction payload in bytes.
 * @returns The estimated fee in USD cents.
 */
function calculateFee(bytes: number): number {
  const chargeableBytes = Math.max(0, bytes - FREE_TIER_BYTES);
  const chargeableMegabytes = chargeableBytes / (1024 * 1024);
  return chargeableMegabytes * CENTS_PER_MEGABYTE;
}

// --- DAR Inspector ---

interface DarInfo {
  main_package_id: string;
  packages: {
    [packageId: string]: {
      modules: {
        [moduleName: string]: any;
      };
    };
  };
}

/**
 * Executes `dpm damlc inspect-dar` and returns the parsed JSON output.
 * @param darPath Path to the .dar file.
 * @returns A promise that resolves to the parsed DAR information.
 */
async function inspectDar(darPath: string): Promise<DarInfo> {
  if (!fs.existsSync(darPath)) {
    throw new Error(`DAR file not found: ${darPath}`);
  }
  try {
    const { stdout } = await execAsync(`dpm damlc inspect-dar --json "${darPath}"`);
    return JSON.parse(stdout);
  } catch (error: any) {
    if (error.code === 127 || (error.message && error.message.includes('command not found'))) {
      throw new Error('`dpm` command not found. Please ensure the Canton SDK is installed and in your PATH.');
    }
    throw new Error(`Failed to inspect DAR file ${darPath}: ${error.message}`);
  }
}

// --- Payload Size Estimator ---

/**
 * Traverses the DAR info to find a specific template definition.
 * @param darInfo The parsed DAR information.
 * @param templateId The template ID in the format "Module:TemplateName".
 * @returns The template definition object, or null if not found.
 */
function findTemplateDefinition(darInfo: DarInfo, templateId: string): any | null {
  const [moduleName, templateName] = templateId.split(':');
  if (!moduleName || !templateName) {
    throw new Error(`Invalid template ID format. Expected "Module:TemplateName", got "${templateId}".`);
  }

  const mainPackage = darInfo.packages[darInfo.main_package_id];
  if (!mainPackage) {
    return null;
  }

  const moduleDef = mainPackage.modules[moduleName];
  if (!moduleDef || !moduleDef.templates) {
    return null;
  }

  return moduleDef.templates[templateName] || null;
}

/**
 * Generates a mock value for a given Daml type definition.
 * This helps in creating a realistic JSON payload for size estimation.
 */
function generateMockValue(typeDef: any): any {
  if (!typeDef) return null;

  if (typeDef.prim) {
    const primType = typeDef.prim.prim;
    const args = typeDef.prim.args;
    switch (primType) {
      case 'Text': return "a-sample-string-of-reasonable-length";
      case 'Int64': return 1234567890;
      case 'Decimal': return "12345.6789012345";
      case 'Party': return "Party::12200000000000000000000000000000000000000000000000000000000000000000";
      case 'Date': return "2024-07-15";
      case 'Timestamp': return "2024-07-15T10:30:00.000Z";
      case 'Bool': return true;
      case 'Unit': return {};
      case 'List': return [generateMockValue(args[0])];
      case 'Optional': return generateMockValue(args[0]); // JSON API represents Some(x) as just x
      case 'TextMap': return { "key": generateMockValue(args[0]) };
      default: return `Unsupported(${primType})`;
    }
  }

  if (typeDef.record) {
    const record: { [key: string]: any } = {};
    for (const field of typeDef.record.fields) {
      record[field.field] = generateMockValue(field.ty);
    }
    return record;
  }

  if (typeDef.variant) {
    // Just pick the first constructor for mocking
    const firstConstructor = typeDef.variant.fields[0];
    if(firstConstructor) {
        return { tag: firstConstructor.field, value: generateMockValue(firstConstructor.ty) };
    }
    return {};
  }

  if (typeDef.syn) {
    // Follow type synonym
    return generateMockValue(typeDef.syn.ty);
  }

  // Fallback for complex or unknown types
  return {};
}

/**
 * Estimates the size of a `create` command payload for a given template.
 * @param templateDef The template definition from the DAR info.
 * @returns The estimated size in bytes.
 */
function estimateCreateSize(templateDef: any): number {
  const mockPayload = generateMockValue(templateDef.ty);
  return Buffer.byteLength(JSON.stringify(mockPayload), 'utf-8');
}

/**
 * Estimates the size of an `exercise` command payload for a given choice.
 * @param templateDef The template definition from the DAR info.
 * @param choiceName The name of the choice to exercise.
 * @returns The estimated size in bytes.
 */
function estimateExerciseSize(templateDef: any, choiceName: string): number {
  const choiceDef = templateDef.choices?.[choiceName];
  if (!choiceDef) {
    throw new Error(`Choice "${choiceName}" not found on template.`);
  }

  // The argument payload for an exercise is the argument of the choice.
  // We assume a single argument for simplicity, which is common.
  const argDef = choiceDef.arg_binder?.[0]?.ty;
  if (!argDef) {
    // Choice has no arguments (e.g., Archive)
    return Buffer.byteLength(JSON.stringify({}), 'utf-8');
  }

  const mockPayload = generateMockValue(argDef);
  return Buffer.byteLength(JSON.stringify(mockPayload), 'utf-8');
}


// --- CLI UI and Logic ---

interface ComparisonResult {
  name: string;
  size: number;
  fee: number;
}

function printComparison(before: ComparisonResult, after: ComparisonResult) {
  const sizeDiff = after.size - before.size;
  const feeDiff = after.fee - before.fee;

  const sizeReduction = before.size === 0 ? 0 : ((-sizeDiff / before.size) * 100);
  const feeReduction = before.fee === 0 ? 0 : ((-feeDiff / before.fee) * 100);

  const formatRow = (label: string, beforeVal: string, afterVal: string, diffVal: string, diffColor: (s: string) => string) => {
    console.log(
      `  ${label.padEnd(12)} ${beforeVal.padStart(14)} ${afterVal.padStart(14)} ${diffColor(diffVal.padStart(16))}`
    );
  };

  const colorize = (val: number) => {
    if (val < 0) return chalk.green;
    if (val > 0) return chalk.red;
    return chalk.gray;
  };

  console.log(chalk.bold.underline('\nFee Impact Comparison'));
  console.log(`\n  ${''.padEnd(12)} ${chalk.bold('Before'.padStart(14))} ${chalk.bold('After'.padStart(14))} ${chalk.bold('Change'.padStart(16))}`);
  console.log(`  ${'-'.repeat(12)} ${'-'.repeat(14)} ${'-'.repeat(14)} ${'-'.repeat(16)}`);

  formatRow(
    'Payload Size',
    `${before.size} B`,
    `${after.size} B`,
    `${sizeDiff > 0 ? '+' : ''}${sizeDiff} B (${sizeReduction.toFixed(1)}%)`,
    colorize(sizeDiff)
  );

  formatRow(
    'Est. Fee',
    `¢${before.fee.toFixed(4)}`,
    `¢${after.fee.toFixed(4)}`,
    `${feeDiff > 0 ? '+' : ''}¢${feeDiff.toFixed(4)} (${feeReduction.toFixed(1)}%)`,
    colorize(feeDiff)
  );

  console.log();

  if (sizeReduction > 5) {
    console.log(chalk.green('✔ Well done! This change significantly reduces transaction costs.'));
  } else if (sizeReduction < -5) {
    console.log(chalk.yellow('⚠ Warning: This change appears to increase transaction costs.'));
  } else {
    console.log(chalk.gray('ℹ This change has a negligible impact on transaction costs.'));
  }
  console.log();
}

async function main() {
  const program = new Command();
  program
    .name('canton-fee-compare')
    .description('Compares the estimated Canton traffic fees between two versions of a DAR file.')
    .version('0.1.0')
    .argument('<before-dar>', 'Path to the original .dar file')
    .argument('<after-dar>', 'Path to the optimized .dar file')
    .requiredOption('-t, --template <id>', 'Template ID to analyze (e.g., "Main:Asset")')
    .option('-c, --choice <name>', 'Name of the choice to analyze (if omitted, analyzes `create`)')
    .action(async (beforeDarPath, afterDarPath, options) => {
      try {
        console.log(chalk.blue(`Analyzing DARs...`));
        const [beforeDarInfo, afterDarInfo] = await Promise.all([
          inspectDar(beforeDarPath),
          inspectDar(afterDarPath),
        ]);

        console.log(chalk.blue(`Finding template "${options.template}"...`));
        const beforeTemplateDef = findTemplateDefinition(beforeDarInfo, options.template);
        const afterTemplateDef = findTemplateDefinition(afterDarInfo, options.template);

        if (!beforeTemplateDef) {
          throw new Error(`Template "${options.template}" not found in ${path.basename(beforeDarPath)}`);
        }
        if (!afterTemplateDef) {
          throw new Error(`Template "${options.template}" not found in ${path.basename(afterDarPath)}`);
        }

        let beforeSize: number;
        let afterSize: number;
        const action = options.choice ? `exercise of choice "${options.choice}"` : 'create';

        console.log(chalk.blue(`Estimating payload size for ${action}...`));

        if (options.choice) {
          beforeSize = estimateExerciseSize(beforeTemplateDef, options.choice);
          afterSize = estimateExerciseSize(afterTemplateDef, options.choice);
        } else {
          beforeSize = estimateCreateSize(beforeTemplateDef);
          afterSize = estimateCreateSize(afterTemplateDef);
        }

        const beforeResult: ComparisonResult = {
          name: 'Before',
          size: beforeSize,
          fee: calculateFee(beforeSize),
        };

        const afterResult: ComparisonResult = {
          name: 'After',
          size: afterSize,
          fee: calculateFee(afterSize),
        };

        printComparison(beforeResult, afterResult);

      } catch (error: any) {
        console.error(chalk.red(`\nError: ${error.message}`));
        process.exit(1);
      }
    });

  await program.parseAsync(process.argv);
}

main();