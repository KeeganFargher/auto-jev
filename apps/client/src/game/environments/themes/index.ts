import type { EnvironmentTheme } from "../environment.js";
import { bazaarTheme } from "./bazaar.js";
import { coveTheme } from "./cove.js";
import { frostTheme } from "./frost.js";
import { ruinsTheme } from "./ruins.js";

export const ENVIRONMENT_THEMES: readonly EnvironmentTheme[] = [coveTheme, ruinsTheme, frostTheme, bazaarTheme];
