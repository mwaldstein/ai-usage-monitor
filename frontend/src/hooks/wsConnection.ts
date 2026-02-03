import { useEffect, useRef, useState, useCallback } from "react";
import { getWebSocketUrl } from "../services/backendUrls";

const WS_URL = getWebSocketUrl();

export interface WebSocketConnection {
  isConnected: boolean;
  isReconnecting: boolean;
  send: (message: unknown) => void;
  addMessageHandler: (handler: (data: unknown) => void) => () => void;
}

export function useWebSocketConnection(): WebSocketConnection {
  const [isConnected, setIsConnected] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const messageHandlersRef = useRef<Set<(data: unknown) => void>>(new Set());

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("WebSocket connected");
      setIsConnected(true);
      setIsReconnecting(false);
      ws.send(JSON.stringify({ type: "subscribe" }));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        messageHandlersRef.current.forEach((handler) => handler(data));
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

  const send = useCallback((message: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  const addMessageHandler = useCallback((handler: (data: unknown) => void) => {
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
