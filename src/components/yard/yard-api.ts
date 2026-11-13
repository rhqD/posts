"use client";

// Bridge between the 3D viewer and the control service.
//
// The viewer talks about devices, not lamps: it reads the device list, checks
// what this visitor may control, and sends generic commands. Which 3D lamp maps
// onto which device lives in device-map.ts, on the client.
//
// When NEXT_PUBLIC_YARD_API is unset every call is a no-op, so a plain static
// deployment keeps its original behaviour with no control plane behind it.

import { CONTROL_BASE as BASE } from "../../lib/control";

export type DeviceView = {
  key: string;
  actions: Record<string, unknown>;
  state: Record<string, unknown>;
  permissions: { read: boolean; control: boolean };
};

/** Devices this visitor may see, keyed by device key. */
export async function fetchDevices(signal?: AbortSignal): Promise<Record<string, DeviceView>> {
  if (!BASE) return {};
  try {
    const res = await fetch(BASE + "/devices", {
      credentials: "include",
      signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return {};
    const data = (await res.json()) as { devices?: DeviceView[] };
    const out: Record<string, DeviceView> = {};
    for (const device of data.devices ?? []) out[device.key] = device;
    return out;
  } catch {
    // Offline, blocked, or no control plane: everything stays virtual.
    return {};
  }
}

/** Throws when the device refused; the caller reverts the optimistic state. */
export async function sendCommand(device: string, action: string, value: unknown): Promise<void> {
  if (!BASE) return;
  const res = await fetch(BASE + "/devices/" + encodeURIComponent(device) + "/commands", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, params: { value } }),
  });
  if (!res.ok) throw new Error(device + " " + action + " -> " + res.status);
}

/** Best-effort "is this on" across the shapes vendors report. */
export function isOn(state: Record<string, unknown> | undefined): boolean {
  if (!state) return false;
  const sw = state.switch;
  if (sw === "on") return true;
  if (sw === true) return true;
  return state.power === true;
}
