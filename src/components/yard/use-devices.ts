"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchDevices, subscribeDeviceStates, type DeviceView } from "./yard-api";

export type DeviceTable = Record<string, DeviceView>;

// Shared by the model and control panels. Permission snapshots come only from
// /devices; newer SSE readings must survive an older in-flight HTTP response.
export function useDevices() {
  const [devices, setDevices] = useState<DeviceTable>({});
  const [streamConnected, setStreamConnected] = useState(false);
  const table = useRef<DeviceTable>({});
  const revisions = useRef<Record<string, number>>({});
  const epoch = useRef(0);
  const request = useRef(0);
  const abort = useRef<AbortController | null>(null);
  const invalidate = useCallback(() => { ++epoch.current; }, []);

  const refresh = useCallback(async () => {
    const currentEpoch = epoch.current;
    const currentRequest = ++request.current;
    const before = { ...revisions.current };
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 8_000);
    try {
      const loaded = await fetchDevices(controller.signal);
      if (controller.signal.aborted || currentEpoch !== epoch.current || currentRequest !== request.current) return table.current;
      const next: DeviceTable = {};
      for (const [key, device] of Object.entries(loaded)) {
        const newer = (revisions.current[key] ?? 0) > (before[key] ?? 0);
        next[key] = newer && table.current[key] ? { ...device, state: table.current[key].state, online: table.current[key].online } : device;
      }
      table.current = next;
      setDevices(next);
    } catch {
      // A transport error is not an empty permission snapshot. Auth changes
      // explicitly clear the old table before starting another request.
    } finally {
      window.clearTimeout(timeout);
    }
    return table.current;
  }, []);

  useEffect(() => {
    const connect = () => {
      const connectionEpoch = epoch.current;
      let wasConnected = false;
      return subscribeDeviceStates((states) => {
        if (connectionEpoch !== epoch.current) return;
        const next = { ...table.current };
        for (const [key, state] of Object.entries(states)) {
          if (!next[key]) continue;
          revisions.current[key] = (revisions.current[key] ?? 0) + 1;
          next[key] = { ...next[key], state, online: typeof state.online === "boolean" ? state.online : next[key].online };
        }
        table.current = next;
        setDevices(next);
      }, (connected) => {
        if (connectionEpoch !== epoch.current) return;
        setStreamConnected(connected);
        const recheck = connected || wasConnected;
        wasConnected = connected;
        if (recheck) void refresh();
      });
    };
    void refresh();
    let off = connect();
    const authChanged = () => {
      invalidate();
      abort.current?.abort();
      table.current = {};
      revisions.current = {};
      setDevices({});
      setStreamConnected(false);
      off();
      void refresh();
      off = connect();
    };
    window.addEventListener("auth-change", authChanged);
    return () => {
      invalidate();
      abort.current?.abort();
      off();
      window.removeEventListener("auth-change", authChanged);
    };
  }, [invalidate, refresh]);

  return { devices, refresh, streamConnected };
}
