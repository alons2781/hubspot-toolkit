// Public API: import these to use the toolkit from your own code.
export { clientFromEnv, createClient, type HubSpotClient } from "./hubspot/client.ts";
export { parseCsv, type Row } from "./utils/csv.ts";
export { ApiError, CliError } from "./utils/errors.ts";
export {
  getDropdownProperty,
  syncDropdown,
  type Option,
  type Plan,
  type SyncDropdownInput,
  type SyncDropdownResult,
} from "./functions/sync-dropdown.ts";
