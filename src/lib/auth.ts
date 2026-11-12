import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import * as repo from "./repo";
import type { Role, User } from "./repo";

const COOKIE = "session";
const SESSION_DAYS = 7;

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(password, Buffer.from(saltHex, "hex"), expected.length);
  return timingSafeEqual(actual, expected);
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export function startSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  repo.insertSession(sha256(token), userId, expires);
  cookies().set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires,
  });
}

export function endSession() {
  const token = cookies().get(COOKIE)?.value;
  if (token) repo.deleteSession(sha256(token));
  cookies().delete(COOKIE);
}

/** De ingelogde gebruiker, of undefined. Tenant komt hieruit (user.tenantId). */
export function getUser(): User | undefined {
  const token = cookies().get(COOKIE)?.value;
  return token ? repo.userForSession(sha256(token)) : undefined;
}

export function requireUser(role?: Role): User {
  const user = getUser();
  if (!user) redirect("/inloggen");
  if (role && user.role !== role) redirect("/?fout=geen-rechten");
  return user;
}

// Eenvoudige rem op wachtwoord raden: max 5 fouten per e-mail per 15 min (per proces).
const g = globalThis as unknown as { __attempts?: Map<string, number[]> };
const attempts: Map<string, number[]> = (g.__attempts ??= new Map<string, number[]>());
const WINDOW = 15 * 60_000;
export function loginThrottled(email: string): boolean {
  const recent = (attempts.get(email.toLowerCase()) ?? []).filter((t) => Date.now() - t < WINDOW);
  attempts.set(email.toLowerCase(), recent);
  return recent.length >= 5;
}
export function recordFailedLogin(email: string) {
  const k = email.toLowerCase();
  attempts.set(k, [...(attempts.get(k) ?? []), Date.now()]);
}
