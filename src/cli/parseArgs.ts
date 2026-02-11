import * as path from "path";
import type { Layout } from "../contracts";

// --- CLI Arg Types ---

export interface RunArgs {
  command: "run";
  jobDir: string;
  layout: Layout;
}

export interface ValidateArgs {
  command: "validate";
  jobDir: string;
}

export type ParsedArgs = RunArgs | ValidateArgs;

// --- Constants ---

const VALID_LAYOUTS: Layout[] = ["side-by-side", "stacked"];

// --- CLI Parsing ---

function printUsage(): void {
  console.error("Usage:");
  console.error("  workshot run <job_dir> [--layout side-by-side|stacked]");
  console.error("  workshot validate <job_dir>");
}

export function parseArgs(argv: string[]): ParsedArgs {
  const args = argv.slice(2);

  if (args.length === 0) {
    console.error("Error: No command or arguments provided.");
    printUsage();
    process.exit(1);
  }

  const firstArg = args[0];

  // Canonical: run <job_dir> [--layout ...]
  if (firstArg === "run") {
    if (args.length < 2 || args[1].startsWith("--")) {
      console.error("Error: 'run' requires a job directory path.");
      console.error("Usage: workshot run <job_dir> [--layout side-by-side|stacked]");
      process.exit(1);
    }
    const jobDir = path.resolve(args[1]);
    let layout: Layout = "side-by-side";

    for (let i = 2; i < args.length; i++) {
      if (args[i] === "--layout") {
        if (i + 1 >= args.length || args[i + 1].startsWith("--")) {
          console.error("Error: --layout requires a value");
          process.exit(1);
        }
        const val = args[++i];
        if (!VALID_LAYOUTS.includes(val as Layout)) {
          console.error(`Error: --layout must be one of: ${VALID_LAYOUTS.join(", ")}`);
          process.exit(1);
        }
        layout = val as Layout;
      } else {
        console.error(`Error: Unknown argument "${args[i]}"`);
        process.exit(1);
      }
    }

    return { command: "run", jobDir, layout };
  }

  // Canonical: validate <job_dir>
  if (firstArg === "validate") {
    if (args.length < 2 || args[1].startsWith("--")) {
      console.error("Error: 'validate' requires a job directory path.");
      console.error("Usage: workshot validate <job_dir>");
      process.exit(1);
    }
    const jobDir = path.resolve(args[1]);

    if (args.length > 2) {
      console.error(`Error: 'validate' does not accept additional arguments.`);
      process.exit(1);
    }

    return { command: "validate", jobDir };
  }

  // Unknown
  if (firstArg.startsWith("--")) {
    console.error(`Error: Unknown flag "${firstArg}"`);
  } else {
    console.error(`Error: Unknown command "${firstArg}"`);
  }
  printUsage();
  process.exit(1);
}
