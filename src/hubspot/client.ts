import { ApiError, CliError, messages } from "../utils/errors.ts";

const BASE_URL = "https://api.hubapi.com";
const MAX_ATTEMPTS = 4;
const TIMEOUT_MS = 30_000; // per attempt
const MAX_RETRY_DELAY_MS = 30_000;
const MAX_ERROR_BODY = 500;

export interface HubSpotClient {
  get<T = unknown>(path: string): Promise<T>;
  patch<T = unknown>(path: string, body: unknown): Promise<T>;
}

/** Remove the token from any text before it can reach output (then cap its length). */
function redact(text: string, token: string): string {
  const clean = token ? text.split(token).join("[redacted]") : text;
  return clean.length > MAX_ERROR_BODY ? `${clean.slice(0, MAX_ERROR_BODY)}…` : clean;
}

/** Build a client from HUBSPOT_ACCESS_TOKEN (env var or ./.env, which Bun loads). */
export function clientFromEnv(): HubSpotClient {
  const token = process.env.HUBSPOT_ACCESS_TOKEN?.trim();
  if (!token) throw new CliError(messages.tokenNotSet, 2);
  return createClient(token);
}

export function createClient(
  token: string,
  fetchImpl: typeof fetch = fetch,
): HubSpotClient {
  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    for (let attempt = 1; ; attempt++) {
      let res: Response;
      try {
        res = await fetchImpl(BASE_URL + path, {
          method,
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
            ...(body !== undefined && { "Content-Type": "application/json" }),
          },
          body: body === undefined ? undefined : JSON.stringify(body),
          redirect: "error", // never follow a redirect with the token attached
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
      } catch (err) {
        if (err instanceof Error && err.name === "TimeoutError") {
          throw new CliError(messages.requestTimeout(method, path, TIMEOUT_MS / 1000));
        }
        throw new CliError(messages.networkError(method, path, redact(err instanceof Error ? err.message : String(err), token)));
      }

      const retryable = res.status === 429 || res.status >= 500;
      if (retryable && attempt < MAX_ATTEMPTS) {
        const retryAfter = Number(res.headers.get("retry-after"));
        const delay = Math.min(retryAfter > 0 ? retryAfter * 1000 : 500 * 2 ** (attempt - 1), MAX_RETRY_DELAY_MS);
        await res.body?.cancel(); // release the connection before waiting
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      const text = await res.text();
      if (res.status === 401) {
        throw new ApiError(messages.tokenRejected, 401);
      }
      if (res.status === 403) {
        const detail = redact(text, token);
        throw new ApiError(messages.scopeMissing(detail), 403);
      }
      if (!res.ok) {
        throw new ApiError(messages.requestFailed(method, path, res.status, redact(text, token)), res.status);
      }
      try {
        return (text ? JSON.parse(text) : undefined) as T;
      } catch {
        throw new ApiError(messages.badResponse(method, path, res.status), res.status);
      }
    }
  }

  return {
    get: (path) => request("GET", path),
    patch: (path, body) => request("PATCH", path, body),
  };
}
