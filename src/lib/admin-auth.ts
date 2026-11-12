import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import * as repo from "./repo";
import type { Admin } from "./repo";

/**
 * Superadmins staan los van rijschool-gebruikers: eigen tabel, eigen sessie,
 * eigen cookie (alleen onder /admin) en eigen login. Ze horen bij geen enkele tenant.
 */
const COOKIE = "admin_session";
const HOURS = 8;
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export function startAdminSession(adminId: string) {
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + HOURS * 3_600_000);
  repo.insertAdminSession(sha256(token), adminId, expires);
  cookies().set(COOKIE, token, {
    httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production",
    path: "/admin", expires,
  });
}

export function endAdminSession() {
  const token = cookies().get(COOKIE)?.value;
  if (token) repo.deleteAdminSession(sha256(token));
  cookies().delete({ name: COOKIE, path: "/admin" });
}

export function getAdmin(): Admin | undefined {
  const token = cookies().get(COOKIE)?.value;
  return token ? repo.adminForSession(sha256(token)) : undefined;
}

export function requireAdmin(): Admin {
  const admin = getAdmin();
  if (!admin) redirect("/admin/inloggen");
  return admin;
}
