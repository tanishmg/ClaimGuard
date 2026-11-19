import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { RowDataPacket } from "mysql2";
import { mysqlPool } from "@/lib/mysql";

const scrypt = promisify(scryptCallback);
const SESSION_COOKIE = "claimguard_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
let schemaPromise: Promise<void> | undefined;

export type WorkspaceRole = "user" | "developer";

export interface AuthUser {
  id: number;
  email: string;
  role: WorkspaceRole;
}

interface AuthUserRow extends RowDataPacket {
  account_id: number;
  email: string;
  role: WorkspaceRole;
  password_hash?: string;
}

async function ensureAuthSchema() {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      await mysqlPool.query(`
        CREATE TABLE IF NOT EXISTS claimguard_account (
          account_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
          email VARCHAR(254) NOT NULL UNIQUE,
          password_hash VARCHAR(255) NOT NULL,
          role ENUM('user', 'developer') NOT NULL DEFAULT 'user',
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB
      `);
      await mysqlPool.query(`
        CREATE TABLE IF NOT EXISTS claimguard_session (
          token_hash CHAR(64) NOT NULL PRIMARY KEY,
          account_id BIGINT UNSIGNED NOT NULL,
          expires_at BIGINT UNSIGNED NOT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT fk_claimguard_session_account
            FOREIGN KEY (account_id) REFERENCES claimguard_account(account_id)
            ON DELETE CASCADE,
          INDEX idx_claimguard_session_expiry (expires_at)
        ) ENGINE=InnoDB
      `);
    })().catch((error) => {
      schemaPromise = undefined;
      throw error;
    });
  }
  await schemaPromise;
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt$${salt}$${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, storedHash: string) {
  const [algorithm, salt, hash] = storedHash.split("$");
  if (algorithm !== "scrypt" || !salt || !hash || !/^[0-9a-f]{128}$/i.test(hash)) {
    return false;
  }
  const actual = (await scrypt(password, salt, 64)) as Buffer;
  const expected = Buffer.from(hash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function createAccount(email: string, password: string, role: WorkspaceRole = "user") {
  await ensureAuthSchema();
  const passwordHash = await hashPassword(password);
  const [result] = await mysqlPool.execute(
    `INSERT INTO claimguard_account (email, password_hash, role) VALUES (?, ?, ?)`,
    [email, passwordHash, role]
  );
  return Number((result as { insertId: number }).insertId);
}

export async function getAccountByEmail(email: string) {
  await ensureAuthSchema();
  const [rows] = await mysqlPool.execute<AuthUserRow[]>(
    `SELECT account_id, email, role, password_hash
     FROM claimguard_account WHERE email = ? LIMIT 1`,
    [email]
  );
  return rows[0] ?? null;
}

export async function seedDeveloperAccount() {
  const email = process.env.CLAIMGUARD_DEV_EMAIL?.trim().toLowerCase();
  const password = process.env.CLAIMGUARD_DEV_PASSWORD;
  if (!email || !password || password.length < 8 || password.length > 256) return false;
  await ensureAuthSchema();
  const [rows] = await mysqlPool.execute<AuthUserRow[]>(
    `SELECT account_id FROM claimguard_account WHERE email = ? LIMIT 1`,
    [email]
  );
  if (rows.length === 0) {
    await createAccount(email, password, "developer");
  }
  return true;
}

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(accountId: number) {
  await ensureAuthSchema();
  const token = randomBytes(32).toString("base64url");
  const expiresAt = Date.now() + SESSION_TTL_SECONDS * 1000;
  await mysqlPool.execute(
    `INSERT INTO claimguard_session (token_hash, account_id, expires_at) VALUES (?, ?, ?)`,
    [tokenHash(token), accountId, expiresAt]
  );
  return token;
}

function readCookie(request: Request, name: string) {
  const cookie = request.headers.get("cookie")?.split(";").map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  return cookie ? decodeURIComponent(cookie.slice(name.length + 1)) : null;
}

export async function getAuthUser(request: Request): Promise<AuthUser | null> {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return null;
  await ensureAuthSchema();
  const [rows] = await mysqlPool.execute<AuthUserRow[]>(
    `SELECT a.account_id, a.email, a.role
     FROM claimguard_session AS s
     INNER JOIN claimguard_account AS a ON a.account_id = s.account_id
     WHERE s.token_hash = ? AND s.expires_at > ?
     LIMIT 1`,
    [tokenHash(token), Date.now()]
  );
  const account = rows[0];
  return account ? { id: Number(account.account_id), email: account.email, role: account.role } : null;
}

export async function deleteSession(request: Request) {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return;
  await ensureAuthSchema();
  await mysqlPool.execute(`DELETE FROM claimguard_session WHERE token_hash = ?`, [tokenHash(token)]);
}

export function sessionCookie(token: string) {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_SECONDS}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
}

export function clearSessionCookie() {
  return `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
}
