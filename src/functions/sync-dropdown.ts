import type { HubSpotClient } from "../hubspot/client.ts";
import type { Row } from "../utils/csv.ts";
import { CliError, messages } from "../utils/errors.ts";

export interface Option {
  label: string;
  value: string;
  hidden?: boolean;
  displayOrder?: number;
  description?: string;
}

export interface Plan {
  options: Option[];
  added: string[];
  unhidden: string[];
  hidden: string[];
  unchanged: string[];
}

export interface SyncDropdownInput {
  /** Object type, e.g. "contacts", "companies", "deals" or a custom object. */
  objectType: string;
  /** Property internal name (not the label). */
  property: string;
  /** Desired options. Anything not listed is hidden, never deleted. */
  rows: Row[];
  /**
   * Optional hook called with the plan and the current options when there are
   * changes, before writing.
   * Return false to abort. When used, the property is re-read right before the
   * write and the call fails if it changed in the meantime.
   */
  confirm?: (plan: Plan, current: Option[]) => boolean | Promise<boolean>;
}

export interface SyncDropdownResult {
  status: "unchanged" | "aborted" | "applied";
  property: { name: string; label: string; existingOptions: number };
  plan: Plan;
  /** The property's options as they were before this call. */
  before: Option[];
}

export interface Property {
  name: string;
  label: string;
  type: string;
  options?: Option[];
}

/** Object types and property internal names: letters, numbers, underscores, hyphens (e.g. "contacts", "0-1", "lead_source"). */
export const isValidName = (name: string) => /^[\w-]+$/.test(name);

function propertyPath(objectType: string, property: string): string {
  // Reject "..", "/", "?" etc.: they would change which HubSpot endpoint is called.
  if (!isValidName(objectType)) throw new CliError(messages.invalidName("object type", objectType));
  if (!isValidName(property)) throw new CliError(messages.invalidName("property name", property));
  return `/crm/v3/properties/${objectType}/${property}`;
}

/**
 * Fetch a property and make sure it is a dropdown (enumeration).
 * Throws ApiError (404/400) if it does not exist, CliError if it is not a dropdown.
 */
export async function getDropdownProperty(
  client: HubSpotClient,
  objectType: string,
  property: string,
): Promise<Property> {
  const prop = await client.get<Property>(propertyPath(objectType, property));
  if (prop.type !== "enumeration") {
    throw new CliError(messages.notDropdown(prop.name, prop.type));
  }
  return prop;
}

/**
 * Update a dropdown (enumeration) property's options in HubSpot.
 * Reads the property, plans the change, and PATCHes the full option list.
 * No prompts, no printing: it returns what it did.
 */
export async function syncDropdown(
  client: HubSpotClient,
  input: SyncDropdownInput,
): Promise<SyncDropdownResult> {
  const path = propertyPath(input.objectType, input.property);
  const prop = await getDropdownProperty(client, input.objectType, input.property);
  const existing = prop.options ?? [];
  const plan = planOptions(existing, input.rows);
  const info = { name: prop.name, label: prop.label, existingOptions: existing.length };

  if (!hasChanges(plan, existing)) return { status: "unchanged", property: info, plan, before: existing };

  let finalPlan = plan;
  if (input.confirm) {
    if ((await input.confirm(plan, existing)) !== true) return { status: "aborted", property: info, plan, before: existing };
    // Time passed while the caller reviewed: write only exactly what was reviewed.
    // (HubSpot has no ETag, so a change made between this read and the PATCH cannot be detected.)
    const fresh = (await client.get<Property>(path)).options ?? [];
    finalPlan = planOptions(fresh, input.rows);
    if (JSON.stringify(finalPlan.options) !== JSON.stringify(plan.options)) {
      throw new CliError(messages.propertyChanged);
    }
  }

  await client.patch(path, { options: finalPlan.options });
  return { status: "applied", property: info, plan: finalPlan, before: existing };
}

// ---- Planning: pure logic, no HubSpot calls ----

const norm = (s: string) => s.trim().toLowerCase();

/**
 * Build the full option list to send to HubSpot.
 * - CSV rows come first, in CSV order. A row matching an existing option (by
 *   internal value, else by label) reuses that option's value; otherwise it is new.
 * - Existing options missing from the CSV are kept but hidden (never deleted).
 * - Throws if two options would end up with the same internal value, because
 *   HubSpot would reject (or mangle) the list.
 */
function planOptions(existing: Option[], rows: Row[]): Plan {
  const byValue = new Map(existing.map((o) => [o.value, o]));
  const byLabel = new Map(existing.map((o) => [norm(o.label), o]));
  const used = new Set<Option>();
  const takenValues = new Set(existing.map((o) => o.value));
  const plan: Plan = { options: [], added: [], unhidden: [], hidden: [], unchanged: [] };

  for (const row of rows) {
    const match =
      (row.value !== undefined ? byValue.get(row.value) : undefined) ??
      byLabel.get(norm(row.label));
    if (match) {
      if (used.has(match)) throw new CliError(messages.duplicateValue(match.value));
      used.add(match);
      (match.hidden ? plan.unhidden : plan.unchanged).push(match.label);
      plan.options.push({ ...match, label: row.label, hidden: false });
    } else {
      const value = row.value ?? row.label;
      if (takenValues.has(value)) throw new CliError(messages.duplicateValue(value));
      takenValues.add(value);
      plan.added.push(row.label);
      plan.options.push({ label: row.label, value, hidden: false });
    }
  }

  for (const o of existing) {
    if (used.has(o)) continue;
    if (!o.hidden) plan.hidden.push(o.label);
    plan.options.push({ ...o, hidden: true });
  }

  plan.options.forEach((o, i) => (o.displayOrder = i));
  return plan;
}

function hasChanges(p: Plan, existing: Option[]): boolean {
  if (p.added.length || p.unhidden.length || p.hidden.length) return true;
  // Same set, but label text or order might differ.
  return p.options.some(
    (o, i) => existing[i]?.value !== o.value || existing[i]?.label !== o.label,
  );
}
