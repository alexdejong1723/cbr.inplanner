import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import * as repo from "./repo";
import type { Role, User } from "./repo";

const COOKIE = "session";
const SESSION_DAYS = 7;

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
