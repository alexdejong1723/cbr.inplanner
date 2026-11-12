import { test } from "node:test";
import assert from "node:assert/strict";
import { canCancel, canMove } from "./rules.ts";
import type { Reservation } from "./types.ts";

const base: Reservation = {
  id: "r1",
  candidateId: "c1",
  product: "B_PRAKTIJK",
  locationId: "l1",
  startsAt: "2027-06-30T08:00:00Z",
  purchasedAt: "2027-04-10T08:00:00Z",
  status: "gereserveerd",
};

test("annuleren binnen 48 uur na aankoop mag altijd", () => {
  const r = { ...base, startsAt: "2027-04-20T08:00:00Z" };
  assert.deepEqual(canCancel(r, new Date("2027-04-11T08:00:00Z")), {
    allowed: true,
    reason: "binnen-48-uur",
  });
});

test("annuleren >28 dagen voor het examen mag", () => {
  assert.equal(canCancel(base, new Date("2027-05-20T08:00:00Z")).allowed, true);
});

test("annuleren <28 dagen voor het examen na 48 uur mag niet", () => {
  assert.deepEqual(canCancel(base, new Date("2027-06-10T08:00:00Z")), {
    allowed: false,
    reason: "te-laat",
  });
});

test("verplaatsen kan niet meer voor B-producten na 1 april 2027", () => {
  assert.equal(canMove(base, new Date("2027-05-01T00:00:00Z")), false);
  assert.equal(canMove(base, new Date("2027-03-01T00:00:00Z")), true);
});
