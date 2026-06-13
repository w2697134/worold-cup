"use client";

import { FormEvent, useState } from "react";
import type { AuthUser } from "@/lib/client-state";
import { AUTH_SESSION_STORAGE_KEY, AUTH_USERS_STORAGE_KEY } from "@/lib/client-state";
import { appPath } from "@/lib/base-path";

interface StoredUser extends AuthUser {
  salt: string;
  passwordHash: string;
  createdAt: string;
}

type Mode = "login" | "register";

export function LoginScreen({ onLogin }: { onLogin: (user: AuthUser) => void }) {
  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const displayName = name.trim();
    const pass = password.trim();
    if (!displayName || !pass) {
      setError("请输入账号和密码。");
      return;
    }

    setBusy(true);
    setError("");
    try {
      const serverUser = await tryServerAuth(mode, displayName, pass);
      if (serverUser) {
        persistSession(serverUser);
        onLogin(serverUser);
        return;
      }

      const users = readUsers();
      const id = userIdFromName(displayName);
      const existing = users[id];

      if (mode === "register") {
        if (existing) {
          setError("这个账号已经存在。");
          return;
        }
        const salt = createSalt();
        const user: StoredUser = {
          id,
          name: displayName,
          salt,
          passwordHash: await hashPassword(pass, salt),
          createdAt: new Date().toISOString(),
        };
        users[id] = user;
        writeUsers(users);
        persistSession(user);
        onLogin({ id: user.id, name: user.name });
        return;
      }

      if (!existing) {
        setError("账号不存在。");
        return;
      }
      const nextHash = await hashPassword(pass, existing.salt);
      if (nextHash !== existing.passwordHash) {
        setError("密码不对。");
        return;
      }
      persistSession(existing);
      onLogin({ id: existing.id, name: existing.name });
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "登录失败，请重试。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-10">
      <section className="w-full max-w-sm rounded-lg border border-white/10 bg-ink-800/90 p-6 shadow-card">
        <div>
          <p className="text-xs font-semibold text-emerald-300/75">世界杯 2026</p>
          <h1 className="mt-2 text-2xl font-extrabold tracking-normal text-white">
            {mode === "login" ? "登录" : "创建账号"}
          </h1>
        </div>

        <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
          <label className="flex flex-col gap-2 text-sm font-semibold text-white/72">
            账号
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoComplete="username"
              className="rounded-lg border border-white/10 bg-white/[0.055] px-3 py-2.5 text-base text-white outline-none transition placeholder:text-white/25 focus:border-emerald-300/70"
              placeholder="输入账号"
            />
          </label>

          <label className="flex flex-col gap-2 text-sm font-semibold text-white/72">
            密码
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              className="rounded-lg border border-white/10 bg-white/[0.055] px-3 py-2.5 text-base text-white outline-none transition placeholder:text-white/25 focus:border-emerald-300/70"
              placeholder="输入密码"
            />
          </label>

          {error && (
            <p className="rounded-lg border border-rose-400/25 bg-rose-400/10 px-3 py-2 text-sm text-rose-200">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="mt-1 rounded-lg bg-emerald-500 px-4 py-3 text-base font-extrabold text-ink-900 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-55"
          >
            {busy ? "处理中..." : mode === "login" ? "登录" : "创建并登录"}
          </button>
        </form>

        <button
          type="button"
          onClick={() => {
            setMode((current) => (current === "login" ? "register" : "login"));
            setError("");
          }}
          className="mt-4 text-sm font-semibold text-white/55 transition hover:text-white"
        >
          {mode === "login" ? "没有账号？创建一个" : "已有账号？去登录"}
        </button>
      </section>
    </main>
  );
}

function readUsers(): Record<string, StoredUser> {
  try {
    const raw = localStorage.getItem(AUTH_USERS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, StoredUser>)
      : {};
  } catch {
    return {};
  }
}

function writeUsers(users: Record<string, StoredUser>) {
  localStorage.setItem(AUTH_USERS_STORAGE_KEY, JSON.stringify(users));
}

function persistSession(user: AuthUser) {
  localStorage.setItem(
    AUTH_SESSION_STORAGE_KEY,
    JSON.stringify({ id: user.id, name: user.name, token: user.token }),
  );
}

async function tryServerAuth(
  mode: Mode,
  name: string,
  password: string,
): Promise<AuthUser | null> {
  const response = await fetch(appPath("/api/auth"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode, name, password }),
  }).catch(() => null);

  if (!response || response.status === 503) return null;
  const data = (await response.json().catch(() => ({}))) as { user?: AuthUser; error?: string };
  if (!response.ok || !data.user) {
    throw new Error(data.error ?? "登录失败，请重试。");
  }
  return data.user;
}

function userIdFromName(value: string): string {
  return value.trim().toLowerCase();
}

function createSalt(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

async function hashPassword(password: string, salt: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${salt}:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return bytesToHex(new Uint8Array(digest));
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
