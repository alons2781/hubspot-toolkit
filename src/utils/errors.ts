/** An error whose message is safe and useful to show the user as-is. */
export class CliError extends Error {
  readonly exitCode: number;
  constructor(message: string, exitCode = 1) {
    super(message);
    this.name = "CliError";
    this.exitCode = exitCode;
  }
}

/** A failed HubSpot API call. `status` is the HTTP status code. */
export class ApiError extends CliError {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/**
 * Every error message shown to the user lives here, so they can be reworded in
 * one place. Plain strings are fixed texts; functions take the details to fill in.
 */
export const messages = {
  // -- HubSpot / credentials --
  tokenNotSet: "HUBSPOT_ACCESS_TOKEN is not set (env var or ./.env).",
  tokenRejected:
    "HubSpot rejected the token (401 Unauthorized). Check that HUBSPOT_ACCESS_TOKEN is correct, has not expired or been revoked, and belongs to the right account.",
  scopeMissing: (hubspotSaid: string) =>
    `HubSpot refused the request (403): the token is missing a required scope. Add it under your private app's Scopes, then run again.\nHubSpot said: ${hubspotSaid}`,
  requestFailed: (method: string, path: string, status: number, body: string) =>
    `HubSpot ${method} ${path} failed: ${status} ${body}`,
  badResponse: (method: string, path: string, status: number) =>
    `HubSpot ${method} ${path} returned ${status} with a body that is not valid JSON.`,
  requestTimeout: (method: string, path: string, seconds: number) =>
    `HubSpot ${method} ${path} did not answer within ${seconds} seconds. Nothing was confirmed; check HubSpot before running again.`,
  networkError: (method: string, path: string, reason: string) =>
    `Could not reach HubSpot (${method} ${path}): ${reason}`,

  // -- user input --
  cancelled: "Cancelled. Nothing was changed.",

  // -- CSV files --
  nothingToPick: "There is nothing to choose from.",
  noCsvFiles: (dir: string) => `No .csv files found in ./${dir}/`,
  csvNotFound: (path: string) => `File not found: ${path}`,
  csvUnreadable: (path: string, reason: string) => `Cannot read ${path}: ${reason}`,
  csvNoLabelColumn: `The CSV needs a header row with a "label" column (and optionally a "value" column), e.g. label,value.`,
  csvNoValues: "The CSV has no values.",
  csvDuplicateLabel: (label: string) => `Duplicate label in CSV: "${label}"`,

  // -- dropdown properties (update-property) --
  notDropdown: (name: string, type: string) => `"${name}" is a ${type} property, not a dropdown (enumeration).`,
  propertyChanged: "The property changed in HubSpot while you were reviewing. Nothing was written. Run it again.",
  duplicateValue: (value: string) =>
    `The internal value "${value}" would be used by more than one option. Give the CSV row its own value column entry, or use the label of the existing option it should match. Nothing was written.`,
  invalidName: (kind: string, value: string) =>
    `"${value}" is not a valid ${kind}. Use only letters, numbers, underscores and hyphens (the internal name, not the label).`,
  propertyNotFound: (object: string, property: string) =>
    `"${property}" was not found on ${object}. Use the property's internal name (not its label) and check the object type.`,
};
