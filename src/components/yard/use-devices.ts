"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchDevices, subscribeDeviceStates, type DeviceView } from "./yard-api";

export type DeviceTable = Record<string, DeviceView>;

/**
 * The page's device state table: everything this visitor may see, fetched on
 * mount and patched by the live stream.
 *
 * Nothing here knows about lamps or the 3D scene — rendering is one consumer of
 * this table, and a device list UI would be another. The rule is the same for
 * any device: on load, sync everything; on change, update the entry.
 */
export function useDevices(): DeviceTable {
  const [devices, setDevices] = useState<DeviceTable>({});

  const reload = useCallback(() => {
    fetchDevices()
      .then(setDevices)
      .catch(() => {
        // Staying with the last known table is better than blanking the page.
      });
  }, []);

  useEffect(() => {
    reload();

    const off = subscribeDeviceStates((states) => {
      setDevices((prev) => {
        let next: DeviceTable | null = null;
        for (const [key, state] of Object.entries(states)) {
          const known = prev[key];
          // A device the client has not seen yet shows up on the next reload;
          // inventing permissions for it here would be a guess.
          if (!known) continue;
          next ??= { ...prev };
          next[key] = { ...known, state };
        }
        return next ?? prev;
      });
    });

    // Signing in changes what this visitor may see, so refetch the whole table.
    window.addEventListener("auth-change", reload);
    return () => {
      off();
      window.removeEventListener("auth-change", reload);
    };
  }, [reload]);

  return devices;
}
