import crypto from "node:crypto";
import { Pool } from "pg";
import type { CompiledKnowledge, KnowledgeItem, Prediction } from "./types";

export interface StoredKnowledgeState {
  items?: KnowledgeItem[];
  compiled?: CompiledKnowledge | null;
  compiledScopeKey?: string | null;
}

export interface StoredPredictionState {
  activeMatchId?: string | null;
  predictionCache?: Record<string, Prediction>;
}

export interface StoredUser {
  id: string;
  name: string;
}

let pool: Pool | null = null;
let schemaReady: Promise<void> | null = null;

export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL || process.env.PGHOST);
}

function getPool(): Pool {
  if (!isDatabaseConfigured()) throw new Error("DATABASE_URL or PGHOST is not configured");
  if (!pool) {
    pool = new Pool(
      process.env.DATABASE_URL
        ? { connectionString: process.env.DATABASE_URL, ssl: sslConfig() }
        : {
            host: process.env.PGHOST,
            port: Number(process.env.PGPORT || 5432),
            database: process.env.PGDATABASE,
            user: process.env.PGUSER,
            password: process.env.PGPASSWORD,
            ssl: sslConfig(),
          },
    );
  }
  return pool;
}

function sslConfig() {
  const mode = (process.env.PGSSLMODE || "").toLowerCase();
  if (!mode || mode === "disable") return undefined;
  return { rejectUnauthorized: false };
}

export async function ensureWorldcupSchema() {
  if (!schemaReady) {
    schemaReady = getPool().query(`
      CREATE TABLE IF NOT EXISTS worldcup_users (
        id text PRIMARY KEY,
        name text NOT NULL,
        password_hash text NOT NULL,
        salt text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS worldcup_sessions (
        token_hash text PRIMARY KEY,
        user_id text NOT NULL REFERENCES worldcup_users(id) ON DELETE CASCADE,
        created_at timestamptz NOT NULL DEFAULT now(),
        last_seen_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS worldcup_knowledge (
        user_id text PRIMARY KEY REFERENCES worldcup_users(id) ON DELETE CASCADE,
        state jsonb NOT NULL DEFAULT '{}'::jsonb,
        updated_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS worldcup_user_state (
        user_id text PRIMARY KEY REFERENCES worldcup_users(id) ON DELETE CASCADE,
        active_match_id text,
        prediction_cache jsonb NOT NULL DEFAULT '{}'::jsonb,
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `).then(() => undefined);
  }
  return schemaReady;
}

export async function registerUser(name: string, password: string) {
  await ensureWorldcupSchema();
  const id = userIdFromName(name);
  const salt = crypto.randomBytes(16).toString("hex");
  const passwordHash = hashPassword(password, salt);
  try {
    await getPool().query(
      `INSERT INTO worldcup_users (id, name, password_hash, salt) VALUES ($1, $2, $3, $4)`,
      [id, name.trim(), passwordHash, salt],
    );
  } catch (error: unknown) {
    if (isUniqueViolation(error)) throw new Error("USER_EXISTS");
    throw error;
  }
  return createSession({ id, name: name.trim() });
}

export async function loginUser(name: string, password: string) {
  await ensureWorldcupSchema();
  const id = userIdFromName(name);
  const result = await getPool().query<{
    id: string;
    name: string;
    password_hash: string;
    salt: string;
  }>(
    `SELECT id, name, password_hash, salt FROM worldcup_users WHERE id = $1`,
    [id],
  );
  const row = result.rows[0];
  if (!row) throw new Error("USER_NOT_FOUND");
  if (hashPassword(password, row.salt) !== row.password_hash) {
    throw new Error("BAD_PASSWORD");
  }
  return createSession({ id: row.id, name: row.name });
}

export async function authenticateToken(token: string): Promise<StoredUser> {
  await ensureWorldcupSchema();
  const tokenHash = hashToken(token);
  const result = await getPool().query<{ id: string; name: string }>(
    `
      UPDATE worldcup_sessions s
      SET last_seen_at = now()
      FROM worldcup_users u
      WHERE s.user_id = u.id AND s.token_hash = $1
      RETURNING u.id, u.name
    `,
    [tokenHash],
  );
  const user = result.rows[0];
  if (!user) throw new Error("UNAUTHORIZED");
  return user;
}

export async function readKnowledgeState(userId: string): Promise<StoredKnowledgeState> {
  await ensureWorldcupSchema();
  const result = await getPool().query<{ state: StoredKnowledgeState }>(
    `SELECT state FROM worldcup_knowledge WHERE user_id = $1`,
    [userId],
  );
  return result.rows[0]?.state ?? { items: [], compiled: null, compiledScopeKey: null };
}

export async function writeKnowledgeState(userId: string, state: StoredKnowledgeState) {
  await ensureWorldcupSchema();
  await getPool().query(
    `
      INSERT INTO worldcup_knowledge (user_id, state, updated_at)
      VALUES ($1, $2::jsonb, now())
      ON CONFLICT (user_id)
      DO UPDATE SET state = EXCLUDED.state, updated_at = now()
    `,
    [userId, JSON.stringify(state)],
  );
}

export async function readPredictionState(userId: string): Promise<StoredPredictionState> {
  await ensureWorldcupSchema();
  const result = await getPool().query<{
    active_match_id: string | null;
    prediction_cache: Record<string, Prediction>;
  }>(
    `SELECT active_match_id, prediction_cache FROM worldcup_user_state WHERE user_id = $1`,
    [userId],
  );
  const row = result.rows[0];
  return {
    activeMatchId: row?.active_match_id ?? null,
    predictionCache: row?.prediction_cache ?? {},
  };
}

export async function writePredictionState(userId: string, state: StoredPredictionState) {
  await ensureWorldcupSchema();
  await getPool().query(
    `
      INSERT INTO worldcup_user_state (user_id, active_match_id, prediction_cache, updated_at)
      VALUES ($1, $2, $3::jsonb, now())
      ON CONFLICT (user_id)
      DO UPDATE SET
        active_match_id = EXCLUDED.active_match_id,
        prediction_cache = EXCLUDED.prediction_cache,
        updated_at = now()
    `,
    [
      userId,
      state.activeMatchId ?? null,
      JSON.stringify(state.predictionCache ?? {}),
    ],
  );
}

async function createSession(user: StoredUser): Promise<StoredUser & { token: string }> {
  const token = crypto.randomBytes(32).toString("base64url");
  await getPool().query(
    `INSERT INTO worldcup_sessions (token_hash, user_id) VALUES ($1, $2)`,
    [hashToken(token), user.id],
  );
  return { ...user, token };
}

function userIdFromName(value: string): string {
  return value.trim().toLowerCase();
}

function hashPassword(password: string, salt: string): string {
  return crypto.pbkdf2Sync(password, salt, 210000, 32, "sha256").toString("hex");
}

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "23505",
  );
}
