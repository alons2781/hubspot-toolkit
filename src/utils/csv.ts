import { readdir, readFile } from "node:fs/promises";
import { CliError, messages } from "./errors.ts";

export interface Row {
  label: string;
  value?: string;
}

/** Split one CSV line, supporting "quoted, fields" and "" escapes. */
function splitLine(line: string): string[] {
  const cells: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { cells.push(cur); cur = ""; }
    else cur += ch;
  }
  cells.push(cur);
  return cells.map((c) => c.trim());
}

/**
 * The first row must be a header with a `label` column and, optionally, a `value`
 * column (the internal value). Columns are found by name, in any order; other
 * columns are ignored.
 */
export function parseCsv(text: string): Row[] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.trim() !== "");
  const [header, ...rows] = lines.map(splitLine);
  if (!header) throw new CliError(messages.csvNoValues);

  const names = header.map((h) => h.toLowerCase());
  const labelCol = names.indexOf("label");
  if (labelCol === -1) throw new CliError(messages.csvNoLabelColumn);
  const valueCol = names.indexOf("value");

  const out: Row[] = [];
  const seen = new Set<string>();
  for (const cells of rows) {
    const label = cells[labelCol];
    if (!label) continue;
    const value = valueCol === -1 ? undefined : cells[valueCol];
    const key = label.toLowerCase();
    if (seen.has(key)) throw new CliError(messages.csvDuplicateLabel(label));
    seen.add(key);
    out.push(value ? { label, value } : { label });
  }
  if (out.length === 0) throw new CliError(messages.csvNoValues);
  return out;
}

/** Names of the .csv files in `dir` (case-insensitive), sorted. Empty if `dir` does not exist. */
export async function listCsvFiles(dir: string): Promise<string[]> {
  try {
    return (await readdir(dir)).filter((f) => f.toLowerCase().endsWith(".csv")).sort();
  } catch {
    return [];
  }
}

/** Read a CSV file as text, with a readable error if it is missing or unreadable. */
export async function readCsvFile(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    throw new CliError(code === "ENOENT" ? messages.csvNotFound(path) : messages.csvUnreadable(path, String(code ?? err)));
  }
}
