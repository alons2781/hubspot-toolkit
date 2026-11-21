# hubspot-toolkit

A **test command-line tool for HubSpot**, built with [Bun](https://bun.sh). It is a prototype for trying out ideas against a HubSpot account, not a finished product.

> Unofficial. Not affiliated with or endorsed by HubSpot.

## Status

- **Prototype.** It currently has one command, `update-property`, which updates a dropdown property's options from a CSV. More commands may come, or not.
- **It writes to a real HubSpot account** when you confirm a change. Try it on a test property or a sandbox account first.
- **No automated tests.** The only check is `bun run typecheck`. `tests/` holds a runnable example of using the code from your own script, not a test suite.
- **Expect changes.** Names, options and behavior can change without notice.

## Run it

Needs [Bun](https://bun.sh). It runs the TypeScript sources directly, no build step, and loads `.env` automatically.

```bash
bun install
cp .env.example .env            # put your HubSpot token in HUBSPOT_ACCESS_TOKEN
bun src/cli.ts --help
bun src/cli.ts update-property
```

`bun link` installs the `hubspot-toolkit` command globally on your machine.

### Token

Set `HUBSPOT_ACCESS_TOKEN` (in `.env` or the environment) to a HubSpot private app or service key token. Each command lists the scopes it needs. The token is not checked up front: if HubSpot rejects it, the command stops at the first call that fails and says whether the token is invalid or missing a scope.

## Commands

| Command | What it does |
| --- | --- |
| `update-property` | Updates a dropdown property's options from a CSV. |

### update-property

Updates the options of a dropdown property from a CSV. It is fully interactive: there are no flags to remember.

**Needs** the `crm.schemas.<object>.read` and `crm.schemas.<object>.write` scopes (for example `crm.schemas.contacts.write`).

**The CSV** goes in the `csv/` folder (a demo is included: `csv/dymamic_properties_test.csv`; your own CSVs are git-ignored). The first row must be a header with a `label` column and, optionally, a `value` column (the internal value). Columns are found by name, in any order; other columns are ignored.

```csv
label,value
Website,website
Referral,referral
Event
```

**What it asks, in order:**
1. The object type (contacts, companies, deals, tickets, or type a custom one).
2. The property's internal name (not its label). It checks right away that the property exists and asks again if not.
3. Which CSV in `csv/` to use (always asked, even if there is only one).

It then shows the old and new values and only writes after you confirm. Declining changes nothing.

**Rules**
- Options missing from the CSV are **hidden, never deleted**.
- Hidden options that are listed in the CSV come back.
- The CSV order becomes the display order.
- Only dropdown (enumeration) properties are accepted.

## Use it from your own code

The HubSpot logic is a plain function with no prompts and no printing, so you can call it from any script (Bun, since the package ships TypeScript).

```ts
import { clientFromEnv, parseCsv, syncDropdown } from "hubspot-toolkit";

const client = clientFromEnv(); // or createClient("<token>")
const result = await syncDropdown(client, {
  objectType: "contacts",
  property: "lead_source",
  rows: parseCsv("label\nWebsite\nReferral"), // or [{ label: "Website" }, ...]
  confirm: (plan) => {
    console.log(plan); // review before anything is written
    return true; // return false to abort
  },
});
console.log(result.status); // "unchanged" | "aborted" | "applied"
```

Without `confirm`, `syncDropdown` writes straight away. With it, the property is re-read right before the write, and the call fails (writing nothing) if the options changed while you were reviewing. HubSpot has no way to lock a property, so a change made in the instant between that re-read and the write cannot be detected. `src/index.ts` is the public entry point.

A runnable version of this is in [`tests/update-property-test.ts`](tests/update-property-test.ts), which imports from `"hubspot-toolkit"` the way your own code would. Edit its constants (object, property, CSV) and run `bun tests/update-property-test.ts`. It only prints the plan until you set `WRITE = true`.

## Layout

```
src/
  cli.ts          CLI entry: registers the commands with yargs
  index.ts        library entry (public API)
  commands/       one file per CLI command: its yargs definition and its prompts (update-property.ts)
  ui/             terminal interaction shared by commands (prompt.ts, plus pick.ts: one reusable `pick` for any list of options)
  functions/      reusable logic, no prompts or console output (sync-dropdown.ts)
  hubspot/        the HubSpot API client (client.ts)
  utils/          generic helpers (csv.ts; errors.ts holds the error classes and every error message)
tests/            runnable examples that use the library without the CLI (update-property-test.ts)
csv/              your input files (a demo is included)
```

Dependencies point one way: `commands` -> `ui` + `functions` -> `hubspot` + `utils`. `functions/` never imports from `commands/` or `ui/`, so it is safe to call from any script or cron job.

## License

MIT, see [LICENSE](LICENSE).
