import { providerFromEnvironment, type ProviderSelection } from "@jev-game/jev";

let configured: ProviderSelection | null = null;

export function configureJevProvider(selection: ProviderSelection): void {
  configured = selection;
}

export function jevProvider(): ProviderSelection {
  if (configured === null) {
    configured = providerFromEnvironment(process.env);
    console.info(configured.kind === "provider" ? `[jev] bot seats: ${configured.label}` : `[jev] bot seats: baseline bots (${configured.reason})`);
  }

  return configured;
}

export function botSeatLabel(selection: ProviderSelection): string {
  if (selection.kind === "none") {
    return "Bot";
  }

  return selection.provider.source === "jev" ? "Jev" : "Stub";
}
