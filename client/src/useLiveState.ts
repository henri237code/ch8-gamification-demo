import { useEffect, useState, useRef, useCallback } from "react";
import { io } from "socket.io-client";
import type { SharedState } from "../../server/src/runtime.js";
export function useLiveState() {
  const [state, setState] = useState<SharedState | null>(null),
    [connection, setConnection] = useState<
      "loading" | "live" | "offline" | "stale"
    >("loading");
  const receiver = useRef<
    | ((next: SharedState, source: "socket" | "http" | "command") => void)
    | undefined
  >(undefined);
  const acceptSnapshot = useCallback(
    (next: SharedState) => receiver.current?.(next, "command"),
    [],
  );
  useEffect(() => {
    let alive = true,
      last: SharedState["synchronization"] | undefined,
      pinned: string | undefined,
      hasSocketState = false;
    const socket = io({ autoConnect: false });
    const accept = (
      next: SharedState,
      source: "socket" | "http" | "command",
    ) => {
      if (!alive || !next?.synchronization) return;
      const stamp = next.synchronization;
      if (source === "http" && hasSocketState) return;
      if (source === "command" && (!socket.connected || !pinned || stamp.serverInstanceId !== pinned))
        return;
      if (source === "socket") {
        if (pinned && stamp.serverInstanceId !== pinned) return;
        pinned = stamp.serverInstanceId;
        hasSocketState = true;
      }
      if (
        last?.serverInstanceId === stamp.serverInstanceId &&
        stamp.sequence <= last.sequence
      )
        return;
      last = stamp;
      setState(next);
      setConnection(source === "http" ? "loading" : "live");
    };
    receiver.current = accept;
    socket.on("connect", () => {
      pinned = undefined;
      setConnection("loading");
    });
    socket.on("state", (s: SharedState) => accept(s, "socket"));
    socket.on("disconnect", () => setConnection("offline"));
    socket.on("connect_error", () => setConnection("offline"));
    socket.on("state-error", () => setConnection("stale"));
    const abort = new AbortController();
    fetch("/api/state", { cache: "no-store", signal: abort.signal })
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((s) => accept(s, "http"))
      .catch(() => {
        if (alive && !hasSocketState) setConnection("offline");
      });
    socket.connect();
    return () => {
      alive = false;
      receiver.current = undefined;
      abort.abort();
      socket.disconnect();
    };
  }, []);
  return { state, connection, acceptSnapshot };
}
