import { join } from "node:path";
import type { CommandModule } from "yargs";
import { clientFromEnv, type HubSpotClient } from "../hubspot/client.ts";
import { listCsvFiles, parseCsv, readCsvFile } from "../utils/csv.ts";
import { ApiError, messages } from "../utils/errors.ts";
import { pick } from "../ui/pick.ts";
import { clack, createPrompter, type Prompter } from "../ui/prompt.ts";
import {
  getDropdownProperty,
  isValidName,
  syncDropdown,
  type Option,
  type Plan,
} from "../functions/sync-dropdown.ts";

const CSV_DIR = "csv";
const OBJECTS = ["contacts", "companies", "deals", "tickets"];

/** Old values, new values and a one-line summary, for review before writing. */
function describe(plan: Plan, before: Option[]): string {
  const name = (o: Option) => (o.hidden ? `${o.label} (hidden)` : o.label);
  const added = new Set(plan.added);
  const nowHidden = new Set(plan.hidden);
  const after = plan.options.map((o) => {
    const mark = added.has(o.label) ? "+" : nowHidden.has(o.label) ? "-" : " ";
    return `  ${mark} ${name(o)}`;
  });
  const summary = (title: string, items: string[]) =>
    items.length ? `${title} (${items.length}): ${items.join(", ")}` : "";

  return [
    `Old values (${before.length}):`,
    ...before.map((o) => `    ${name(o)}`),
    "",
    `New values (${plan.options.length}):   + added   - hidden`,
    ...after,
    "",
    [summary("add", plan.added), summary("unhide", plan.unhidden), summary("hide", plan.hidden), summary("keep", plan.unchanged)]
      .filter(Boolean)
      .join("\n"),
  ].join("\n");
}

/** Let the user pick one of the .csv files in `dir`. */
async function pickCsv(ui: Prompter, dir: string): Promise<string> {
  const files = await listCsvFiles(dir);
  const name = await pick(ui, { message: "Which CSV?", choices: files, emptyError: messages.noCsvFiles(dir) });
  return join(dir, name);
}

/** Interactive wrapper: asks the questions, then calls syncDropdown. */
export async function updateProperty(client: HubSpotClient, ui: Prompter): Promise<void> {
  // Ask for the object and property, and check right away that the property exists;
  // if it does not, say so and ask for the property again. Any other HubSpot error
  // (for example a 400 for an unknown object type) stops the command with HubSpot's message.
  let objectType: string;
  for (;;) {
    objectType = await pick(ui, {
      message: "Object type",
      choices: OBJECTS,
      other: { message: "Object type name", placeholder: "e.g. p12345_pets" },
    });
    if (isValidName(objectType)) break;
    ui.note("Invalid object type", messages.invalidName("object type", objectType));
  }

  let property: string;
  for (;;) {
    property = await ui.text("Property internal name", "e.g. lead_source");
    if (!isValidName(property)) {
      ui.note("Invalid property name", messages.invalidName("property name", property));
      continue;
    }
    try {
      await getDropdownProperty(client, objectType, property);
      break;
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 404)) throw err;
      ui.note("Property not found", messages.propertyNotFound(objectType, property));
    }
  }

  const file = await pickCsv(ui, CSV_DIR);
  const rows = parseCsv(await readCsvFile(file));

  const result = await syncDropdown(client, {
    objectType,
    property,
    rows,
    confirm: async (plan, current) => {
      ui.note("Review changes", describe(plan, current));
      return ui.confirm("Apply to HubSpot?");
    },
  });

  const title = `${result.property.label} (${result.property.name}) · ${result.property.existingOptions} existing options`;
  switch (result.status) {
    case "unchanged":
      ui.note(title, "Nothing to change.");
      break;
    case "aborted":
      ui.note("Aborted", "Nothing was changed.");
      break;
    case "applied":
      ui.note("Done", "Property updated.");
      break;
  }
}

// ---- CLI definition (registered in src/cli.ts) ----

export const updatePropertyCommand: CommandModule = {
  command: "update-property",
  describe: "Update a dropdown property's options from a CSV (interactive)",
  builder: (y) =>
    y.epilog(
      [
        'CSV: first row is a header with a "label" column and an optional "value" column.',
        "Needs HUBSPOT_ACCESS_TOKEN with the crm.schemas.<object>.read and .write scopes.",
      ].join("\n"),
    ),
  handler: async () => {
    const client = clientFromEnv();
    clack.intro("update-property");
    await updateProperty(client, createPrompter());
    clack.outro("Finished");
  },
};
