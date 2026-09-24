import { z } from "zod";
import { createTypeSafeProvider, DEFAULT_JEV_MODEL, DEFAULT_REQUEST_TIMEOUT_MILLISECONDS } from "./client.js";
import { CLOUDFLARE_JEV_MODEL, createCloudflareProvider } from "./cloudflare.js";
import { DEFAULT_PROVIDER_CONCURRENCY, limitProvider, type LimitedProvider } from "./limiter.js";
import { createOfflineProvider } from "./offline.js";

const OFFLINE_DELAY_MILLISECONDS = 40;

const setting = z
  .string()
  .optional()
  .transform((value) => {
    const trimmed = value?.trim() ?? "";

    return trimmed === "" ? undefined : trimmed;
  });

const environmentSchema = z.object({
  JEV_PROVIDER: setting.pipe(z.enum(["typesafe", "cloudflare", "offline"]).optional()),
  TYPESAFE_API_KEY: setting,
  CLOUDFLARE_ACCOUNT_ID: setting,
  CLOUDFLARE_API_TOKEN: setting,
  JEV_MODEL: setting,
  JEV_TIMEOUT_MS: setting.pipe(z.coerce.number<string>().int().positive().optional()),
  JEV_CONCURRENCY: setting.pipe(z.coerce.number<string>().int().positive().optional()),
  JEV_OFFLINE_SEED: setting.pipe(z.coerce.number<string>().int().optional()),
});

export type ProviderSelection =
  | { kind: "provider"; provider: LimitedProvider; label: string }
  | { kind: "none"; reason: string };

export function providerFromEnvironment(environment: Readonly<Record<string, string | undefined>>): ProviderSelection {
  const parsed = environmentSchema.safeParse(environment);

  if (!parsed.success) {
    return { kind: "none", reason: `the Jev settings did not validate: ${parsed.error.message}` };
  }

  const settings = parsed.data;
  const concurrency = settings.JEV_CONCURRENCY ?? DEFAULT_PROVIDER_CONCURRENCY;

  if (settings.JEV_PROVIDER === "offline") {
    return {
      kind: "provider",
      provider: limitProvider(createOfflineProvider(settings.JEV_OFFLINE_SEED ?? 1, OFFLINE_DELAY_MILLISECONDS), concurrency),
      label: "Offline stub (not Jev)",
    };
  }

  const timeoutMilliseconds = settings.JEV_TIMEOUT_MS ?? DEFAULT_REQUEST_TIMEOUT_MILLISECONDS;
  const apiKey = settings.TYPESAFE_API_KEY;
  const accountId = settings.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = settings.CLOUDFLARE_API_TOKEN;
  const wantsCloudflare = settings.JEV_PROVIDER === "cloudflare" || (settings.JEV_PROVIDER === undefined && apiKey === undefined);

  if (!wantsCloudflare) {
    if (apiKey === undefined) {
      return { kind: "none", reason: "TYPESAFE_API_KEY is not set" };
    }

    const model = settings.JEV_MODEL ?? DEFAULT_JEV_MODEL;
    const provider = createTypeSafeProvider({ apiKey, model, timeoutMilliseconds, fetch: null });

    return { kind: "provider", provider: limitProvider(provider, concurrency), label: `Jev (${model})` };
  }

  if (accountId === undefined || apiToken === undefined) {
    return { kind: "none", reason: "neither TYPESAFE_API_KEY nor CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN are set" };
  }

  const model = settings.JEV_MODEL ?? CLOUDFLARE_JEV_MODEL;
  const provider = createCloudflareProvider({ accountId, apiToken, model, timeoutMilliseconds, fetch: null });

  return { kind: "provider", provider: limitProvider(provider, concurrency), label: `Jev (${model} via Cloudflare)` };
}
