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

export function isTerminalRoomSessionError(error: unknown): error is ApiError {
  return error instanceof ApiError
    && ["ROOM_NOT_FOUND", "ROOM_EXPIRED", "INVALID_SESSION"].includes(error.code);
}

export async function createRoom(displayName: string): Promise<RoomSessionResponse> {
  return requestSession("/api/rooms", displayName);
}

export async function joinRoom(roomCode: string, displayName: string): Promise<RoomSessionResponse> {
  return requestSession(`/api/rooms/${encodeURIComponent(roomCode)}/join`, displayName);
}

export async function validateRoomSession(roomCode: string, sessionToken: string): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`/api/rooms/${encodeURIComponent(roomCode)}/session`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionToken })
    });
  } catch {
    throw new ApiError("We could not reach the arcade. Check your connection and try again.", "NETWORK_ERROR");
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as ApiErrorBody;
    throw new ApiError(body.error?.message ?? "This session could not be restored.", body.error?.code);
  }
}

export async function uploadShirtFightDrawing(roomCode: string, sessionToken: string, image: Blob): Promise<{ drawingId: string }> {
  let response: Response;
  try {
    response = await fetch(`/api/rooms/${encodeURIComponent(roomCode)}/shirt-fight/drawings`, {
      method: "POST",
      headers: { "content-type": "image/webp", authorization: `Bearer ${sessionToken}` },
      body: image
    });
  } catch {
    throw new ApiError("The drawing could not reach the arcade. Try again.", "NETWORK_ERROR");
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as ApiErrorBody;
    throw new ApiError(body.error?.message ?? "The drawing could not be saved.", body.error?.code);
  }
  return response.json() as Promise<{ drawingId: string }>;
}

export async function fetchShirtFightDrawing(roomCode: string, sessionToken: string, drawingId: string): Promise<Blob> {
  const response = await fetch(`/api/rooms/${encodeURIComponent(roomCode)}/shirt-fight/assets/${encodeURIComponent(drawingId)}`, {
    headers: { authorization: `Bearer ${sessionToken}` },
    cache: "no-store"
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as ApiErrorBody;
    throw new ApiError(body.error?.message ?? "That drawing is unavailable.", body.error?.code);
  }
  return response.blob();
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
