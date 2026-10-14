import { ensureDemoDataVersion } from "./lib/demoScenario";
// Runs before any store loads so outdated stored demo data is reseeded.
ensureDemoDataVersion();
