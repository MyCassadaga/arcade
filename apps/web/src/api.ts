import type { ErrorCode, RoomSessionResponse } from "@team-arcade/shared";

interface ApiErrorBody {
  error?: { code?: ErrorCode; message?: string };
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly code: ErrorCode | "NETWORK_ERROR" = "SERVER_ERROR"
  ) {
    super(message);
  }
}

export async function createRoom(displayName: string): Promise<RoomSessionResponse> {
  return requestSession("/api/rooms", displayName);
}

export async function joinRoom(roomCode: string, displayName: string): Promise<RoomSessionResponse> {
  return requestSession(`/api/rooms/${encodeURIComponent(roomCode)}/join`, displayName);
}

async function requestSession(path: string, displayName: string): Promise<RoomSessionResponse> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName })
    });
  } catch {
    throw new ApiError("We could not reach the arcade. Check your connection and try again.", "NETWORK_ERROR");
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as ApiErrorBody;
    throw new ApiError(body.error?.message ?? "Something went wrong. Please try again.", body.error?.code);
  }
  return response.json() as Promise<RoomSessionResponse>;
}
