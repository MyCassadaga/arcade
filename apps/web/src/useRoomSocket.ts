import { useCallback, useEffect, useRef, useState } from "react";
import type { ClientMessage, RoomView, ServerMessage, TypedGameViewerState } from "@team-arcade/shared";
import { ApiError, isTerminalRoomSessionError, validateRoomSession } from "./api";

export type ConnectionStatus = "connecting" | "connected" | "reconnecting" | "offline" | "inactive" | "error";

export const PLAYER_INACTIVITY_MS = 15 * 60 * 1_000;
export const PLAYER_INACTIVITY_CLOSE_CODE = 4000;
export const PLAYER_INACTIVITY_CLOSE_REASON = "Player inactive";

interface RoomSocketState {
  room: RoomView | null;
  game: TypedGameViewerState | null;
  status: ConnectionStatus;
  message: string | null;
  fatalSession: boolean;
  commandPending: boolean;
  send: (message: ClientMessage) => boolean;
  recordActivity: () => void;
  reconnect: () => void;
}

export function useRoomSocket(
  roomCode: string,
  sessionToken: string,
  revalidateOpaqueFailures = false
): RoomSocketState {
  const [room, setRoom] = useState<RoomView | null>(null);
  const [game, setGame] = useState<TypedGameViewerState | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [message, setMessage] = useState<string | null>(null);
  const [fatalSession, setFatalSession] = useState(false);
  const [commandPending, setCommandPending] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);
  const pendingRequestIdsRef = useRef(new Set<string>());
  const inactivityTimerRef = useRef<number | undefined>(undefined);
  const resetInactivityDeadlineRef = useRef<() => void>(() => undefined);
  const inactiveRef = useRef(false);
  const [connectionGeneration, setConnectionGeneration] = useState(0);

  const finishRequest = useCallback((requestId: string | undefined) => {
    if (!requestId) return;
    pendingRequestIdsRef.current.delete(requestId);
    setCommandPending(pendingRequestIdsRef.current.size > 0);
  }, []);

  useEffect(() => {
    let disposed = false;
    let reconnectTimer: number | undefined;
    let attempt = 0;
    let fatal = false;

    inactiveRef.current = false;

    const clearInactivityTimer = () => {
      window.clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = undefined;
    };

    const becomeInactive = (socket: WebSocket) => {
      if (disposed || socketRef.current !== socket) return;
      inactiveRef.current = true;
      socketRef.current = null;
      window.clearTimeout(reconnectTimer);
      clearInactivityTimer();
      pendingRequestIdsRef.current.clear();
      setCommandPending(false);
      setStatus("inactive");
      setMessage("Disconnected after 15 minutes without player activity. Your seat is still saved.");
      socket.close(PLAYER_INACTIVITY_CLOSE_CODE, PLAYER_INACTIVITY_CLOSE_REASON);
    };

    const resetInactivityDeadline = (socket: WebSocket) => {
      clearInactivityTimer();
      inactivityTimerRef.current = window.setTimeout(() => becomeInactive(socket), PLAYER_INACTIVITY_MS);
    };
    resetInactivityDeadlineRef.current = () => {
      const socket = socketRef.current;
      if (socket?.readyState === WebSocket.OPEN) resetInactivityDeadline(socket);
    };

    const connect = () => {
      if (disposed || inactiveRef.current) return;
      if (!navigator.onLine) {
        setStatus("offline");
        return;
      }
      const current = socketRef.current;
      if (current && (current.readyState === WebSocket.OPEN || current.readyState === WebSocket.CONNECTING)) return;
      window.clearTimeout(reconnectTimer);
      setStatus(attempt === 0 ? "connecting" : "reconnecting");
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const socket = new WebSocket(`${protocol}//${window.location.host}/api/rooms/${encodeURIComponent(roomCode)}/socket`);
      socketRef.current = socket;

      socket.addEventListener("open", () => {
        if (disposed || socketRef.current !== socket) return;
        socket.send(JSON.stringify({
          type: "room.reconnect",
          requestId: crypto.randomUUID(),
          payload: { sessionToken }
        } satisfies ClientMessage));
        resetInactivityDeadline(socket);
      });

      socket.addEventListener("message", (event: MessageEvent<string>) => {
        if (disposed || socketRef.current !== socket) return;
        let serverMessage: ServerMessage;
        try {
          serverMessage = JSON.parse(event.data) as ServerMessage;
        } catch {
          setMessage("The arcade sent an unreadable update. Reconnecting may help.");
          return;
        }
        if (serverMessage.type === "room.snapshot" || serverMessage.type === "room.presence") {
          setRoom(serverMessage.payload);
          if (serverMessage.payload.roomPhase === "lobby") setGame(null);
          setStatus("connected");
          setMessage(null);
          setFatalSession(false);
          attempt = 0;
        } else if (serverMessage.type === "game.state") {
          setGame(serverMessage.payload as TypedGameViewerState);
        } else if (serverMessage.type === "command.ack") {
          finishRequest(serverMessage.requestId);
        } else if (serverMessage.type === "error") {
          finishRequest(serverMessage.requestId);
          setMessage(serverMessage.payload.message);
          if (["INVALID_SESSION", "ROOM_EXPIRED", "ROOM_NOT_FOUND"].includes(serverMessage.payload.code)) {
            fatal = true;
            setFatalSession(true);
            setStatus("error");
          }
        }
      });

      const handleClose = async (event: CloseEvent) => {
        if (disposed || fatal || socketRef.current !== socket) return;
        socketRef.current = null;
        pendingRequestIdsRef.current.clear();
        setCommandPending(false);
        clearInactivityTimer();
        if (isInactivityClose(event.code, event.reason)) {
          inactiveRef.current = true;
          window.clearTimeout(reconnectTimer);
          setStatus("inactive");
          setMessage("Disconnected after 15 minutes without player activity. Your seat is still saved.");
          return;
        }
        if (isTerminalSessionClose(event.code, event.reason)) {
          fatal = true;
          setMessage("This session is no longer available.");
          setFatalSession(true);
          setStatus("error");
          return;
        }
        setStatus(navigator.onLine ? "reconnecting" : "offline");
        if (revalidateOpaqueFailures && event.code === 1006 && navigator.onLine) {
          try {
            await validateRoomSession(roomCode, sessionToken);
          } catch (caught) {
            if (disposed || fatal) return;
            if (isTerminalRoomSessionError(caught)) {
              fatal = true;
              setMessage(caught.message);
              setFatalSession(true);
              setStatus("error");
              return;
            }
            if (caught instanceof ApiError) setMessage(caught.message);
          }
        }
        if (disposed || fatal) return;
        attempt += 1;
        const baseDelay = Math.min(10_000, 500 * 2 ** Math.min(attempt, 5));
        const delay = baseDelay * (0.75 + Math.random() * 0.5);
        reconnectTimer = window.setTimeout(connect, delay);
      };

      socket.addEventListener("close", (event: CloseEvent) => {
        void handleClose(event);
      });
    };

    const handleOffline = () => {
      if (inactiveRef.current) return;
      setStatus("offline");
      socketRef.current?.close();
    };
    const handleOnline = () => {
      if (inactiveRef.current) return;
      window.clearTimeout(reconnectTimer);
      attempt = Math.max(attempt, 1);
      connect();
    };

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    connect();

    return () => {
      disposed = true;
      window.clearTimeout(reconnectTimer);
      clearInactivityTimer();
      resetInactivityDeadlineRef.current = () => undefined;
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
      const socket = socketRef.current;
      socketRef.current = null;
      socket?.close();
    };
  }, [connectionGeneration, finishRequest, revalidateOpaqueFailures, roomCode, sessionToken]);

  const send = useCallback((clientMessage: ClientMessage): boolean => {
    if (socketRef.current?.readyState !== WebSocket.OPEN) {
      setMessage("Wait for the arcade to reconnect, then try again.");
      return false;
    }
    pendingRequestIdsRef.current.add(clientMessage.requestId);
    setCommandPending(true);
    setMessage(null);
    socketRef.current.send(JSON.stringify(clientMessage));
    resetInactivityDeadlineRef.current();
    return true;
  }, []);

  const recordActivity = useCallback(() => {
    resetInactivityDeadlineRef.current();
  }, []);

  const reconnect = useCallback(() => {
    if (!inactiveRef.current) return;
    inactiveRef.current = false;
    setMessage(null);
    setFatalSession(false);
    setStatus("connecting");
    setConnectionGeneration((generation) => generation + 1);
  }, []);

  return { room, game, status, message, fatalSession, commandPending, send, recordActivity, reconnect };
}

export function isTerminalSessionClose(code: number, reason: string): boolean {
  return (code === 1008 && ["Room unavailable", "Invalid session"].includes(reason))
    || (code === 1001 && reason === "Room expired");
}

export function isInactivityClose(code: number, reason: string): boolean {
  return code === PLAYER_INACTIVITY_CLOSE_CODE && reason === PLAYER_INACTIVITY_CLOSE_REASON;
}
