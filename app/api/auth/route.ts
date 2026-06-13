import { NextRequest, NextResponse } from "next/server";
import { isDatabaseConfigured, loginUser, registerUser } from "@/lib/server-db";

export const dynamic = "force-dynamic";

interface AuthBody {
  mode?: unknown;
  name?: unknown;
  password?: unknown;
}

export async function POST(req: NextRequest) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "database not configured" }, { status: 503 });
  }

  let body: AuthBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const mode = body.mode === "register" ? "register" : "login";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!name || !password) {
    return NextResponse.json({ error: "请输入账号和密码。" }, { status: 400 });
  }
  if (name.length > 40 || password.length > 120) {
    return NextResponse.json({ error: "账号或密码太长。" }, { status: 400 });
  }

  try {
    const user =
      mode === "register"
        ? await registerUser(name, password)
        : await loginUser(name, password);
    return NextResponse.json({ user });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "USER_EXISTS") {
      return NextResponse.json({ error: "这个账号已经存在。" }, { status: 409 });
    }
    if (code === "USER_NOT_FOUND") {
      return NextResponse.json({ error: "账号不存在。" }, { status: 404 });
    }
    if (code === "BAD_PASSWORD") {
      return NextResponse.json({ error: "密码不对。" }, { status: 401 });
    }
    console.error("[auth] failed:", error);
    return NextResponse.json({ error: "登录失败，请重试。" }, { status: 500 });
  }
}
