import type { CbrClient } from "./client";
import { MockCbrClient, MOCK_CANDIDATES } from "./mock";
import { RealCbrClient } from "./real";

export function getCbrClient(): CbrClient {
  return process.env.CBR_MODE === "cbr" ? new RealCbrClient() : new MockCbrClient();
}

export const isMock = () => process.env.CBR_MODE !== "cbr";

/** Voorlopig mock-leerlingen; later uit de eigen database. */
export async function listCandidates() {
  return MOCK_CANDIDATES;
}
