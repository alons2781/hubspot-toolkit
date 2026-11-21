import * as clack from "@clack/prompts";
import { CliError, messages } from "../utils/errors.ts";

/** The questions the commands can ask. Kept small so a fake can stand in for it. */
export interface Prompter {
  text(message: string, placeholder?: string): Promise<string>;
  select(message: string, choices: string[]): Promise<string>;
  confirm(message: string): Promise<boolean>;
  note(title: string, body: string): void;
}

function answer<T>(value: T | symbol): T {
  if (clack.isCancel(value)) throw new CliError(messages.cancelled, 130);
  return value as T;
}

export function createPrompter(): Prompter {
  return {
    async text(message, placeholder) {
      return answer<string>(
        await clack.text({
          message,
          placeholder,
          validate: (v) => (v?.trim() ? undefined : "Required"),
        }),
      ).trim();
    },
    async select(message, choices) {
      return answer<string>(
        await clack.select({
          message,
          options: choices.map((c) => ({ value: c, label: c })),
        }),
      );
    },
    async confirm(message) {
      return answer<boolean>(await clack.confirm({ message, initialValue: false }));
    },
    note: (title, body) => clack.note(body, title),
  };
}

export { clack };
