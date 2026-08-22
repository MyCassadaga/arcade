import {
  createRoomRequestSchema,
  joinRoomRequestSchema,
  roomCodeSchema,
  type ErrorCode
} from "@team-arcade/shared";
import { RoomDurableObject } from "./room-do";
import type { Env } from "./types";

const ROOM_CODE_CHARACTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CREATE_ATTEMPTS = 12;
const MAX_HTTP_BODY_BYTES = 2_048;

export { RoomDurableObject };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const correlationId = request.headers.get("cf-ray") ?? crypto.randomUUID();
    try {
      const response = await route(request, env);
      return withSecurityHeaders(response, correlationId);
    } catch (error) {
      console.error(JSON.stringify({
        event: "request.error",
        correlationId,
        message: error instanceof Error ? error.message : "Unknown error"
      }));
      return withSecurityHeaders(jsonError("SERVER_ERROR", "Something went wrong. Please try again.", 500), correlationId);
    }
  }
} satisfies ExportedHandler<Env>;

async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);

  if (request.method === "POST" && url.pathname === "/api/rooms") {
    const body = await readJson(request);
    if (body === PAYLOAD_TOO_LARGE) return jsonError("INVALID_COMMAND", "Request payload is too large.", 413);
    const parsed = createRoomRequestSchema.safeParse(body);
    if (!parsed.success) return jsonError("INVALID_NAME", parsed.error.issues[0]?.message ?? "Invalid display name.", 400);

    for (let attempt = 0; attempt < CREATE_ATTEMPTS; attempt += 1) {
      const roomCode = generateRoomCode();
      const stub = env.ROOMS.get(env.ROOMS.idFromName(roomCode));
      const response = await stub.fetch("https://room.internal/internal/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ roomCode, displayName: parsed.data.displayName })
      });
      if (response.status !== 409) return response;
    }
    return jsonError("SERVER_ERROR", "Could not allocate a room code. Please try again.", 503);
  }

  const match = url.pathname.match(/^\/api\/rooms\/([^/]+)\/(join|socket)$/u);
  if (match) {
    const parsedCode = roomCodeSchema.safeParse(match[1]);
    if (!parsedCode.success) return jsonError("ROOM_NOT_FOUND", "Room no longer exists.", 404);
    const stub = env.ROOMS.get(env.ROOMS.idFromName(parsedCode.data));

    if (match[2] === "join" && request.method === "POST") {
      const body = await readJson(request);
      if (body === PAYLOAD_TOO_LARGE) return jsonError("INVALID_COMMAND", "Request payload is too large.", 413);
      const parsed = joinRoomRequestSchema.safeParse(body);
      if (!parsed.success) return jsonError("INVALID_NAME", parsed.error.issues[0]?.message ?? "Invalid display name.", 400);
      return stub.fetch("https://room.internal/internal/join", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(parsed.data)
      });
    }

    if (match[2] === "socket" && request.method === "GET") {
      return stub.fetch(new Request("https://room.internal/internal/socket", request));
    }
  }

  if (url.pathname.startsWith("/api/")) return jsonError("ROOM_NOT_FOUND", "Endpoint not found.", 404);
  return env.ASSETS.fetch(request);
}

const PAYLOAD_TOO_LARGE = Symbol("payload-too-large");

async function readJson(request: Request): Promise<unknown> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) return null;
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_HTTP_BODY_BYTES) return PAYLOAD_TOO_LARGE;
  try {
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > MAX_HTTP_BODY_BYTES) return PAYLOAD_TOO_LARGE;
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function generateRoomCode(): string {
  const random = new Uint8Array(5);
  crypto.getRandomValues(random);
  return [...random].map((byte) => ROOM_CODE_CHARACTERS[byte % ROOM_CODE_CHARACTERS.length]).join("");
}

function jsonError(code: ErrorCode, message: string, status: number): Response {
  return Response.json({ error: { code, message } }, { status });
}

function withSecurityHeaders(response: Response, correlationId: string): Response {
  const secured = new Response(response.body, response);
  secured.headers.set("X-Content-Type-Options", "nosniff");
  secured.headers.set("Referrer-Policy", "same-origin");
  secured.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  secured.headers.set("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self' ws: wss:; base-uri 'none'; frame-ancestors 'none'");
  secured.headers.set("X-Request-Id", correlationId);
  return secured;
}
