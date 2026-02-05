import { useEffect, useRef, useState, useCallback } from "react";
import { Schema as S, Either } from "effect";
import { getWebSocketUrl } from "../services/backendUrls";
import { ClientMessage, ServerMessage, SubscribeMessage } from "shared/ws";
import type {
  ClientMessage as ClientMessageType,
  ServerMessage as ServerMessageType,
} from "shared/ws";

const TOKEN_KEY = "aum_auth_token";
const WS_URL = getWebSocketUrl();

export interface WebSocketConnection {
  isConnected: boolean;
  isReconnecting: boolean;
  send: (message: ClientMessageType) => void;
  addMessageHandler: (handler: (data: ServerMessageType) => void) => () => void;
}

export function useWebSocketConnection(): WebSocketConnection {
  const [isConnected, setIsConnected] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const messageHandlersRef = useRef<Set<(data: ServerMessageType) => void>>(new Set());

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    // Append auth token as query param if available
    let wsUrl = WS_URL;
    try {
      const token = localStorage.getItem(TOKEN_KEY);
      if (token) {
        const separator = wsUrl.includes("?") ? "&" : "?";
        wsUrl = `${wsUrl}${separator}token=${encodeURIComponent(token)}`;
      }
    } catch {
      // Storage unavailable
    }

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("WebSocket connected");
      setIsConnected(true);
      setIsReconnecting(false);
      const subscribe = S.encodeSync(SubscribeMessage)({ type: "subscribe" });
      ws.send(JSON.stringify(subscribe));
    };

    ws.onmessage = (event) => {
      try {
        const data: unknown = JSON.parse(event.data);
        const decoded = S.decodeUnknownEither(ServerMessage)(data);
        if (Either.isLeft(decoded)) {
          console.error("Invalid WebSocket message:", decoded.left);
          return;
        }
        messageHandlersRef.current.forEach((handler) => handler(decoded.right));
      } catch (error) {
        console.error("Error parsing WebSocket message:", error);
      }
    };

    ws.onclose = () => {
      console.log("WebSocket disconnected");
      setIsConnected(false);
      setIsReconnecting(true);

      reconnectTimeoutRef.current = setTimeout(() => {
        console.log("Attempting to reconnect...");
        connect();
      }, 5000);
    };

    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
      ws.close();
    };
  }, []);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    wsRef.current?.close();
  }, []);

  useEffect(() => {
    connect();
    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  const send = useCallback((message: ClientMessageType) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      const encoded = S.encodeSync(ClientMessage)(message);
      wsRef.current.send(JSON.stringify(encoded));
    }
  }, []);

  const addMessageHandler = useCallback((handler: (data: ServerMessageType) => void) => {
    messageHandlersRef.current.add(handler);
    return () => {
      messageHandlersRef.current.delete(handler);
    };
  }, []);

  return {
    isConnected,
    isReconnecting,
    send,
    addMessageHandler,
  };
}
