import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export const MIN_PASSWORD_LENGTH = 12;

export function passwordProblem(password: string): string | undefined {
  return password.length < MIN_PASSWORD_LENGTH
    ? `Wachtwoord moet minimaal ${MIN_PASSWORD_LENGTH} tekens zijn.`
    : undefined;
}

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
