#!/usr/bin/env bun
import yargs from "yargs";
import pkg from "../package.json" with { type: "json" };
import { updatePropertyCommand } from "./commands/update-property.ts";
import { CliError } from "./utils/errors.ts";

async function main(argv: string[]): Promise<number> {
  let exitCode = 0;
  try {
    await yargs(argv)
      .scriptName("hubspot-toolkit")
      .usage("$0 <command> [options]\n\nCommand-line tool for a HubSpot account (unofficial, not affiliated with HubSpot).")
      .command(updatePropertyCommand)
      .demandCommand(1, "Choose a command. Run with --help for details.")
      .strict()
      .alias("h", "help")
      .version(pkg.version)
      .alias("v", "version")
      .wrap(Math.min(100, process.stdout.columns ?? 100))
      .exitProcess(false)
      .fail((msg, err) => {
        throw err ?? new CliError(msg, 2);
      })
      .parseAsync();
  } catch (err) {
    exitCode = err instanceof CliError ? err.exitCode : 1;
    const message = err instanceof Error ? err.message : String(err);
    console.error(message);
  }
  return exitCode;
}

process.exitCode = await main(Bun.argv.slice(2));
