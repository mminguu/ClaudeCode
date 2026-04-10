// @vitest-environment node
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { SignJWT, jwtVerify, decodeProtectedHeader } from "jose";

// `server-only` throws when imported outside an RSC/server bundle. Stub it.
vi.mock("server-only", () => ({}));

// In-memory cookie jar shared by the mocked `next/headers` module.
type CookieEntry = { name: string; value: string; options?: Record<string, unknown> };
const cookieJar = new Map<string, CookieEntry>();

const cookieStoreMock = {
  get: vi.fn((name: string) => {
    const entry = cookieJar.get(name);
    return entry ? { name: entry.name, value: entry.value } : undefined;
  }),
  set: vi.fn((name: string, value: string, options?: Record<string, unknown>) => {
    cookieJar.set(name, { name, value, options });
  }),
  delete: vi.fn((name: string) => {
    cookieJar.delete(name);
  }),
};

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => cookieStoreMock),
}));

// Import under test AFTER mocks are registered.
import {
  createSession,
  deleteSession,
  getSession,
  verifySession,
} from "@/lib/auth";
import type { NextRequest } from "next/server";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "development-secret-key"
);

function makeRequest(token?: string): NextRequest {
  // Minimal stub that matches the narrow surface auth.ts uses.
  return {
    cookies: {
      get: (name: string) =>
        token && name === "auth-token" ? { name, value: token } : undefined,
    },
  } as unknown as NextRequest;
}

beforeEach(() => {
  cookieJar.clear();
  cookieStoreMock.get.mockClear();
  cookieStoreMock.set.mockClear();
  cookieStoreMock.delete.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createSession", () => {
  test("stores a signed JWT in the auth-token cookie", async () => {
    await createSession("user-1", "alice@example.com");

    expect(cookieStoreMock.set).toHaveBeenCalledTimes(1);
    const [name, value, options] = cookieStoreMock.set.mock.calls[0];

    expect(name).toBe("auth-token");
    expect(typeof value).toBe("string");
    // JWT has three dot-separated segments.
    expect(value.split(".")).toHaveLength(3);

    expect(options).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    });
    expect(options?.expires).toBeInstanceOf(Date);
  });

  test("sets an expiry roughly 7 days in the future", async () => {
    vi.useFakeTimers();
    const now = new Date("2026-04-10T12:00:00Z");
    vi.setSystemTime(now);

    await createSession("user-2", "bob@example.com");

    const options = cookieStoreMock.set.mock.calls[0][2] as { expires: Date };
    const expected = now.getTime() + 7 * 24 * 60 * 60 * 1000;
    expect(options.expires.getTime()).toBe(expected);
  });

  test("marks the cookie secure only in production", async () => {
    const original = process.env.NODE_ENV;

    // Non-production: secure should be false.
    vi.stubEnv("NODE_ENV", "development");
    await createSession("user-3", "dev@example.com");
    expect(cookieStoreMock.set.mock.calls[0][2]).toMatchObject({ secure: false });

    cookieStoreMock.set.mockClear();
    cookieJar.clear();

    // Production: secure should be true.
    vi.stubEnv("NODE_ENV", "production");
    await createSession("user-3", "prod@example.com");
    expect(cookieStoreMock.set.mock.calls[0][2]).toMatchObject({ secure: true });

    vi.stubEnv("NODE_ENV", original ?? "test");
    vi.unstubAllEnvs();
  });

  test("round-trips through getSession", async () => {
    await createSession("user-4", "carol@example.com");
    const session = await getSession();

    expect(session).not.toBeNull();
    expect(session?.userId).toBe("user-4");
    expect(session?.email).toBe("carol@example.com");
  });

  test("signs the JWT with HS256", async () => {
    await createSession("user-5", "dave@example.com");

    const token = cookieStoreMock.set.mock.calls[0][1] as string;
    const header = decodeProtectedHeader(token);

    expect(header.alg).toBe("HS256");
  });

  test("embeds userId and email in the JWT payload", async () => {
    await createSession("user-6", "eve@example.com");

    const token = cookieStoreMock.set.mock.calls[0][1] as string;
    const { payload } = await jwtVerify(token, JWT_SECRET);

    expect(payload.userId).toBe("user-6");
    expect(payload.email).toBe("eve@example.com");
  });

  test("sets iat and exp claims ~7 days apart", async () => {
    await createSession("user-7", "frank@example.com");

    const token = cookieStoreMock.set.mock.calls[0][1] as string;
    const { payload } = await jwtVerify(token, JWT_SECRET);

    expect(typeof payload.iat).toBe("number");
    expect(typeof payload.exp).toBe("number");
    // 7 days in seconds, allow 5s drift for test execution time.
    expect((payload.exp as number) - (payload.iat as number)).toBeGreaterThanOrEqual(
      7 * 24 * 60 * 60 - 5
    );
    expect((payload.exp as number) - (payload.iat as number)).toBeLessThanOrEqual(
      7 * 24 * 60 * 60 + 5
    );
  });

  test("each of the cookie options is set correctly", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await createSession("user-8", "grace@example.com");

    const options = cookieStoreMock.set.mock.calls[0][2] as Record<string, unknown>;

    expect(options.httpOnly).toBe(true);
    expect(options.secure).toBe(true);
    expect(options.sameSite).toBe("lax");
    expect(options.path).toBe("/");
    expect(options.expires).toBeInstanceOf(Date);

    vi.unstubAllEnvs();
  });

  test("issues a distinct token on each call", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-10T12:00:00Z"));
    await createSession("user-9", "heidi@example.com");

    // Advance time so `iat` differs between signings.
    vi.setSystemTime(new Date("2026-04-10T12:00:05Z"));
    await createSession("user-9", "heidi@example.com");

    const first = cookieStoreMock.set.mock.calls[0][1] as string;
    const second = cookieStoreMock.set.mock.calls[1][1] as string;
    expect(first).not.toBe(second);
  });

  test("persists the new token in the cookie jar under auth-token", async () => {
    await createSession("user-10", "ivan@example.com");

    const stored = cookieJar.get("auth-token");
    expect(stored).toBeDefined();
    expect(stored?.value).toBe(cookieStoreMock.set.mock.calls[0][1]);
  });

  test("overwrites any existing auth-token cookie", async () => {
    cookieJar.set("auth-token", {
      name: "auth-token",
      value: "stale-token",
    });

    await createSession("user-11", "judy@example.com");

    const stored = cookieJar.get("auth-token");
    expect(stored?.value).not.toBe("stale-token");
    const { payload } = await jwtVerify(stored!.value, JWT_SECRET);
    expect(payload.userId).toBe("user-11");
  });

  test("produces a token that getSession and verifySession both accept", async () => {
    await createSession("user-12", "ken@example.com");

    const fromGet = await getSession();
    expect(fromGet?.userId).toBe("user-12");

    const token = cookieStoreMock.set.mock.calls[0][1] as string;
    const req = {
      cookies: {
        get: (name: string) =>
          name === "auth-token" ? { name, value: token } : undefined,
      },
    } as unknown as import("next/server").NextRequest;

    const fromVerify = await verifySession(req);
    expect(fromVerify?.userId).toBe("user-12");
    expect(fromVerify?.email).toBe("ken@example.com");
  });
});

describe("getSession", () => {
  test("returns null when no cookie is set", async () => {
    const session = await getSession();
    expect(session).toBeNull();
  });

  test("returns null when the token is malformed", async () => {
    cookieJar.set("auth-token", { name: "auth-token", value: "not-a-jwt" });
    const session = await getSession();
    expect(session).toBeNull();
  });

  test("returns null when the token is signed with the wrong secret", async () => {
    const badToken = await new SignJWT({ userId: "x", email: "x@example.com" })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("7d")
      .setIssuedAt()
      .sign(new TextEncoder().encode("wrong-secret"));

    cookieJar.set("auth-token", { name: "auth-token", value: badToken });
    expect(await getSession()).toBeNull();
  });

  test("returns null when the token is expired", async () => {
    const expired = await new SignJWT({ userId: "x", email: "x@example.com" })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .setIssuedAt(Math.floor(Date.now() / 1000) - 120)
      .sign(JWT_SECRET);

    cookieJar.set("auth-token", { name: "auth-token", value: expired });
    expect(await getSession()).toBeNull();
  });

  test("returns the payload for a valid token", async () => {
    const token = await new SignJWT({
      userId: "user-42",
      email: "meaning@example.com",
    })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("7d")
      .setIssuedAt()
      .sign(JWT_SECRET);

    cookieJar.set("auth-token", { name: "auth-token", value: token });
    const session = await getSession();

    expect(session?.userId).toBe("user-42");
    expect(session?.email).toBe("meaning@example.com");
  });

  test("reads from the auth-token cookie specifically", async () => {
    // Put a valid token under a different name; getSession must not pick it up.
    const token = await new SignJWT({
      userId: "user-wrong-slot",
      email: "wrong@example.com",
    })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("7d")
      .setIssuedAt()
      .sign(JWT_SECRET);

    cookieJar.set("session", { name: "session", value: token });
    expect(await getSession()).toBeNull();
    expect(cookieStoreMock.get).toHaveBeenCalledWith("auth-token");
  });

  test("awaits cookies() before reading", async () => {
    const { cookies } = await import("next/headers");
    (cookies as unknown as ReturnType<typeof vi.fn>).mockClear();

    await getSession();

    expect(cookies).toHaveBeenCalledTimes(1);
  });

  test("returns null for an empty-string cookie value", async () => {
    cookieJar.set("auth-token", { name: "auth-token", value: "" });
    expect(await getSession()).toBeNull();
  });

  test("returns null for a token with a tampered payload", async () => {
    const token = await new SignJWT({ userId: "u", email: "u@example.com" })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("7d")
      .setIssuedAt()
      .sign(JWT_SECRET);

    // Flip one character in the payload segment; signature no longer matches.
    const [header, payload, signature] = token.split(".");
    const tamperedPayload =
      payload.slice(0, -1) + (payload.slice(-1) === "A" ? "B" : "A");
    const tampered = `${header}.${tamperedPayload}.${signature}`;

    cookieJar.set("auth-token", { name: "auth-token", value: tampered });
    expect(await getSession()).toBeNull();
  });

  test("returns null for an alg:none token (rejects algorithm downgrade)", async () => {
    // Hand-craft an unsigned token with alg "none".
    const b64 = (obj: unknown) =>
      Buffer.from(JSON.stringify(obj))
        .toString("base64")
        .replace(/=+$/, "")
        .replace(/\+/g, "-")
        .replace(/\//g, "_");
    const header = b64({ alg: "none", typ: "JWT" });
    const payload = b64({
      userId: "attacker",
      email: "attacker@example.com",
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    const unsigned = `${header}.${payload}.`;

    cookieJar.set("auth-token", { name: "auth-token", value: unsigned });
    expect(await getSession()).toBeNull();
  });

  test("does not throw on verification errors", async () => {
    cookieJar.set("auth-token", { name: "auth-token", value: "totally.invalid.jwt" });
    await expect(getSession()).resolves.toBeNull();
  });

  test("returns a payload whose expiresAt survives the round-trip", async () => {
    // createSession stores `expiresAt` as a Date in the payload. After JSON
    // serialization it comes back as a string, which documents the actual
    // getSession contract (caller should not trust expiresAt to be a Date).
    await createSession("user-ts", "ts@example.com");
    const session = await getSession();

    expect(session).not.toBeNull();
    expect(session?.userId).toBe("user-ts");
    expect(session?.email).toBe("ts@example.com");
    // expiresAt is present but serialized as a string by JWT encoding.
    expect(session?.expiresAt).toBeDefined();
  });

  test("returns null when the token uses a different algorithm family", async () => {
    // jwtVerify without options still checks that the signature validates.
    // A token signed with a different key of the same alg already tested;
    // here we use a valid HS256 token but with a key of the wrong length.
    const shortKey = new TextEncoder().encode("x");
    const weird = await new SignJWT({ userId: "x", email: "x@example.com" })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("7d")
      .setIssuedAt()
      .sign(shortKey);

    cookieJar.set("auth-token", { name: "auth-token", value: weird });
    expect(await getSession()).toBeNull();
  });

  test("is independent across sequential calls", async () => {
    expect(await getSession()).toBeNull();

    const token = await new SignJWT({ userId: "a", email: "a@example.com" })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("7d")
      .setIssuedAt()
      .sign(JWT_SECRET);
    cookieJar.set("auth-token", { name: "auth-token", value: token });
    expect((await getSession())?.userId).toBe("a");

    cookieJar.delete("auth-token");
    expect(await getSession()).toBeNull();
  });
});

describe("deleteSession", () => {
  test("removes the auth-token cookie", async () => {
    cookieJar.set("auth-token", { name: "auth-token", value: "whatever" });

    await deleteSession();

    expect(cookieStoreMock.delete).toHaveBeenCalledWith("auth-token");
    expect(cookieJar.has("auth-token")).toBe(false);
  });
});

describe("verifySession", () => {
  test("returns null when the request has no auth-token cookie", async () => {
    const result = await verifySession(makeRequest());
    expect(result).toBeNull();
  });

  test("returns null for a malformed token", async () => {
    const result = await verifySession(makeRequest("garbage"));
    expect(result).toBeNull();
  });

  test("returns null for a token signed with a different secret", async () => {
    const badToken = await new SignJWT({ userId: "x", email: "x@example.com" })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("7d")
      .setIssuedAt()
      .sign(new TextEncoder().encode("not-the-real-secret"));

    expect(await verifySession(makeRequest(badToken))).toBeNull();
  });

  test("returns the payload for a valid token", async () => {
    const token = await new SignJWT({
      userId: "user-7",
      email: "seven@example.com",
    })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("7d")
      .setIssuedAt()
      .sign(JWT_SECRET);

    const session = await verifySession(makeRequest(token));

    expect(session?.userId).toBe("user-7");
    expect(session?.email).toBe("seven@example.com");
  });
});
