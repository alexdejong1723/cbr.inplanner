import type { CbrClient } from "./client";
import { MockCbrClient } from "./mock";
import { RealCbrClient } from "./real";

/**
 * Eén client per rijschool (tenant). De echte client gebruikt straks de
 * CBR-gegevens van die specifieke rijschool.
 */
export function getCbrClient(tenantId: string): CbrClient {
  return process.env.CBR_MODE === "cbr" ? new RealCbrClient() : new MockCbrClient(tenantId);
}

export const isMock = () => process.env.CBR_MODE !== "cbr";
