/**
 * Example: how to import the toolkit's functions and use them in your own code.
 * It makes the same change as `bun src/cli.ts update-property`, with no CLI and no prompts.
 *
 * In your own project, import from the package exactly like this (the package is
 * linked with `bun link hubspot-toolkit`, or added as a dependency). Inside this
 * repo the same import works because the package can import itself.
 *
 *   1. Put your token in .env (HUBSPOT_ACCESS_TOKEN), as for the CLI.
 *   2. Edit the constants below.
 *   3. bun tests/update-property-test.ts
 *
 * By default it only shows what WOULD change. Set WRITE = true to apply it.
 */
import { readFile } from "node:fs/promises";
import { ApiError, CliError, clientFromEnv, parseCsv, syncDropdown, type Plan } from "hubspot-toolkit";

const OBJECT_TYPE = "contacts"; // contacts, companies, deals, tickets, or a custom object
const PROPERTY = "dynamic_property"; // the property's internal name (not its label)
const CSV_FILE = new URL("../csv/dymamic_properties_test.csv", import.meta.url);
const WRITE = false; // false = review only, true = write to HubSpot

const list = (title: string, items: string[]) => (items.length ? [`  ${title} (${items.length}): ${items.join(", ")}`] : []);

function show(plan: Plan): void {
  console.log(
    [
      `Plan for ${OBJECT_TYPE}.${PROPERTY}:`,
      ...list("add", plan.added),
      ...list("unhide", plan.unhidden),
      ...list("hide", plan.hidden),
      ...list("keep", plan.unchanged),
    ].join("\n"),
  );
}

try {
  const client = clientFromEnv();
  const rows = parseCsv(await readFile(CSV_FILE, "utf8")); // header row with a "label" column, optional "value"

  const result = await syncDropdown(client, {
    objectType: OBJECT_TYPE,
    property: PROPERTY,
    rows,
    // Called with the plan before anything is written. Return true to write, false to stop.
    confirm: (plan) => {
      show(plan);
      return WRITE;
    },
  });

  switch (result.status) {
    case "unchanged":
      console.log("Nothing to change.");
      break;
    case "aborted":
      console.log("Nothing was written. Set WRITE = true to apply the plan above.");
      break;
    case "applied":
      console.log(`Done: ${result.property.label} (${result.property.name}) updated.`);
      break;
  }
} catch (err) {
  // CliError / ApiError messages are written for the user; anything else is a bug worth the stack trace.
  if (err instanceof CliError || err instanceof ApiError) {
    console.error(err.message);
    process.exitCode = err.exitCode;
  } else {
    throw err;
  }
}
