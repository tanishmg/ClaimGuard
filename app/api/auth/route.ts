import { NextResponse } from "next/server";
import {
  clearSessionCookie,
  createAccount,
  createSession,
  deleteSession,
  getAccountByEmail,
  getAuthUser,
  seedDeveloperAccount,
  sessionCookie,
  verifyPassword,
} from "@/lib/auth";

function validEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const action = String(body.action ?? "login");
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    const role = body.role === "developer" ? "developer" : "user";

    if (!validEmail(email) || password.length < 8 || password.length > 256) {
      return NextResponse.json(
        { error: "Enter a valid email and a password with at least 8 characters." },
        { status: 400 }
      );
    }

    if (action === "register") {
      if (role !== "user") {
        return NextResponse.json(
          { error: "Developer accounts are provisioned by the administrator." },
          { status: 403 }
        );
      }
      try {
        const accountId = await createAccount(email, password);
        const token = await createSession(accountId);
        const response = NextResponse.json({ user: { email, role } }, { status: 201 });
        response.headers.append("Set-Cookie", sessionCookie(token));
        return response;
      } catch (error) {
        if (typeof error === "object" && error !== null && "code" in error && error.code === "ER_DUP_ENTRY") {
          return NextResponse.json({ error: "An account with this email already exists. Sign in instead." }, { status: 409 });
        }
        throw error;
      }
    }

    if (action !== "login") {
      return NextResponse.json({ error: "Unsupported authentication action." }, { status: 400 });
    }

    if (role === "developer") {
      const seeded = await seedDeveloperAccount();
      if (!seeded) {
        return NextResponse.json(
          { error: "Developer login is not configured. Set CLAIMGUARD_DEV_EMAIL and CLAIMGUARD_DEV_PASSWORD on the server." },
          { status: 503 }
        );
      }
    }

    const account = await getAccountByEmail(email);
    if (
      !account ||
      account.role !== role ||
      !(await verifyPassword(password, account.password_hash ?? ""))
    ) {
      return NextResponse.json({ error: "Email or password is incorrect." }, { status: 401 });
    }

    const token = await createSession(Number(account.account_id));
    const response = NextResponse.json({ user: { email: account.email, role: account.role } });
    response.headers.append("Set-Cookie", sessionCookie(token));
    return response;
  } catch (error) {
    console.error("Authentication request failed:", error);
    return NextResponse.json({ error: "Could not complete authentication. Check the database connection." }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const user = await getAuthUser(request);
    return NextResponse.json({ user: user ? { email: user.email, role: user.role } : null });
  } catch (error) {
    console.error("Could not read authentication session:", error);
    return NextResponse.json({ error: "Could not check the login session." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    await deleteSession(request);
    const response = NextResponse.json({ success: true });
    response.headers.append("Set-Cookie", clearSessionCookie());
    return response;
  } catch (error) {
    console.error("Could not end authentication session:", error);
    return NextResponse.json({ error: "Could not sign out." }, { status: 500 });
  }
}
