import { CliError, messages } from "../utils/errors.ts";
import type { Prompter } from "./prompt.ts";

/** A choice: a plain string, or a label shown to the user with a different value returned. */
export type Choice = string | { label: string; value: string };

export interface PickOptions {
  /** The question shown to the user. */
  message: string;
  choices: Choice[];
  /** Adds an "other (type it)" entry; if chosen, the user is asked to type a value instead. */
  other?: { message: string; placeholder?: string };
  /** Error shown when there is nothing to pick from (no choices and no `other`). */
  emptyError?: string;
}

const OTHER = "other (type it)";

/**
 * Let the user pick one of `choices` and return its value.
 * Reusable for any list: object types, files, property types, ...
 * Always asks, even when there is only one choice.
 */
export async function pick(ui: Prompter, opts: PickOptions): Promise<string> {
  const choices = opts.choices.map((c) => (typeof c === "string" ? { label: c, value: c } : c));
  if (choices.length === 0 && !opts.other) {
    throw new CliError(opts.emptyError ?? messages.nothingToPick);
  }

  const labels = choices.map((c) => c.label);
  const picked = await ui.select(opts.message, opts.other ? [...labels, OTHER] : labels);
  if (opts.other && picked === OTHER) return ui.text(opts.other.message, opts.other.placeholder);
  return choices.find((c) => c.label === picked)!.value;
}
