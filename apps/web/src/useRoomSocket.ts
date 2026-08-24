import { useCallback, useEffect, useRef, useState } from "react";
import type { ClientMessage, RoomView, ServerMessage, TypedGameViewerState } from "@team-arcade/shared";

export type ConnectionStatus = "connecting" | "connected" | "reconnecting" | "offline" | "error";

interface RoomSocketState {
  room: RoomView | null;
  game: TypedGameViewerState | null;
  status: ConnectionStatus;
  message: string | null;
  commandPending: boolean;
  send: (message: ClientMessage) => boolean;
}

export function useRoomSocket(roomCode: string, sessionToken: string): RoomSocketState {
  const [room, setRoom] = useState<RoomView | null>(null);
  const [game, setGame] = useState<TypedGameViewerState | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [message, setMessage] = useState<string | null>(null);
  const [commandPending, setCommandPending] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);
  const pendingRequestIdsRef = useRef(new Set<string>());

  const finishRequest = useCallback((requestId: string | undefined) => {
    if (!requestId) return;
    pendingRequestIdsRef.current.delete(requestId);
    setCommandPending(pendingRequestIdsRef.current.size > 0);
  }, []);

  useEffect(() => {
    let disposed = false;
    let reconnectTimer: number | undefined;
    let heartbeatTimer: number | undefined;
    let attempt = 0;
    let fatal = false;

    const connect = () => {
      if (disposed) return;
      if (!navigator.onLine) {
        setStatus("offline");
        return;
      }
      setStatus(attempt === 0 ? "connecting" : "reconnecting");
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const socket = new WebSocket(`${protocol}//${window.location.host}/api/rooms/${encodeURIComponent(roomCode)}/socket`);
      socketRef.current = socket;

      socket.addEventListener("open", () => {
        if (disposed) return;
        socket.send(JSON.stringify({
          type: "room.reconnect",
          requestId: crypto.randomUUID(),
          payload: { sessionToken }
        } satisfies ClientMessage));
      });

      socket.addEventListener("message", (event: MessageEvent<string>) => {
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
            setStatus("error");
          }
        }
      });

      socket.addEventListener("close", () => {
        if (disposed || fatal) return;
        pendingRequestIdsRef.current.clear();
        setCommandPending(false);
        window.clearInterval(heartbeatTimer);
        attempt += 1;
        setStatus(navigator.onLine ? "reconnecting" : "offline");
        const baseDelay = Math.min(10_000, 500 * 2 ** Math.min(attempt, 5));
        const delay = baseDelay * (0.75 + Math.random() * 0.5);
        reconnectTimer = window.setTimeout(connect, delay);
      });

      heartbeatTimer = window.setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({
            type: "ping",
            requestId: crypto.randomUUID(),
            payload: { clientTime: Date.now() }
          } satisfies ClientMessage));
        }
      }, 25_000);
    };

    const handleOffline = () => {
      setStatus("offline");
      socketRef.current?.close();
    };
    const handleOnline = () => {
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
      window.clearInterval(heartbeatTimer);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [finishRequest, roomCode, sessionToken]);

  const send = useCallback((clientMessage: ClientMessage): boolean => {
    if (socketRef.current?.readyState !== WebSocket.OPEN) {
      setMessage("Wait for the arcade to reconnect, then try again.");
      return false;
    }
    if (clientMessage.type !== "ping" && clientMessage.type !== "room.reconnect") {
      pendingRequestIdsRef.current.add(clientMessage.requestId);
      setCommandPending(true);
      setMessage(null);
    }
    socketRef.current.send(JSON.stringify(clientMessage));
    return true;
  }, []);

  return { room, game, status, message, commandPending, send };
}
