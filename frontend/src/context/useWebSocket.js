import { useEffect, useRef, useCallback } from "react";

const WS_URL = `ws://${window.location.host}`;

export const useWebSocket = (onMessage) => {
  const wsRef    = useRef(null);
  const timerRef = useRef(null);
  const mountedRef = useRef(true);

  const connect = useCallback(() => {
    if (!mountedRef.current) return;
    try {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;
      ws.onopen    = () => console.log("🔌 WebSocket connected");
      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.type !== "CONNECTED") onMessage?.(data);
        } catch {}
      };
      ws.onerror = () => {};
      ws.onclose = () => {
        if (mountedRef.current) timerRef.current = setTimeout(connect, 3000);
      };
    } catch {}
  }, [onMessage]);

  useEffect(() => {
    mountedRef.current = true;
    connect();
    return () => {
      mountedRef.current = false;
      clearTimeout(timerRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return wsRef;
};
