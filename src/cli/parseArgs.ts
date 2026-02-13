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

export interface SocialArgs {
  command: "social";
  jobDir: string;
  platforms: string[];
  all: boolean;
}

export type ParsedArgs = RunArgs | ValidateArgs | SocialArgs;

// --- Constants ---

const VALID_LAYOUTS: Layout[] = ["side-by-side", "stacked"];

// --- CLI Parsing ---

function printUsage(): void {
  console.error("Usage:");
  console.error("  workshot run <job_dir> [--layout side-by-side|stacked]");
  console.error("  workshot validate <job_dir>");
  console.error("  workshot social <job_dir> --platform <name> [--platform <name>] [--all]");
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

  // Canonical: social <job_dir> --platform <name> [--platform <name>] [--all]
  if (firstArg === "social") {
    if (args.length < 2 || args[1].startsWith("--")) {
      console.error("Error: 'social' requires a job directory path.");
      console.error("Usage: workshot social <job_dir> --platform <name> [--all]");
      process.exit(1);
    }
    const jobDir = path.resolve(args[1]);
    const platforms: string[] = [];
    let all = false;

    for (let i = 2; i < args.length; i++) {
      if (args[i] === "--platform") {
        if (i + 1 >= args.length || args[i + 1].startsWith("--")) {
          console.error("Error: --platform requires a value");
          process.exit(1);
        }
        platforms.push(args[++i]);
      } else if (args[i] === "--all") {
        all = true;
      } else {
        console.error(`Error: Unknown argument "${args[i]}"`);
        process.exit(1);
      }
    }

    if (!all && platforms.length === 0) {
      console.error("Error: 'social' requires at least one --platform or --all.");
      console.error("Usage: workshot social <job_dir> --platform <name> [--all]");
      process.exit(1);
    }

    return { command: "social", jobDir, platforms, all };
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
