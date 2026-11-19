import type { DeviceView } from "./yard-api";

export const CLIMATE_LABEL = "202 卧室空调";
export const CLIMATE_MODEL = "2F_AC_Mijia_202";
export const CLIMATE_MODES: Record<number, string> = { 2: "制冷", 3: "除湿", 4: "送风", 5: "制热" };

export type ClimateState = {
  on?: boolean;
  targetTemperature?: number;
  temperature?: number;
  humidity?: number;
  mode?: number;
  fanLevel?: number;
  verticalSwing?: boolean;
  indicator?: boolean;
  online?: boolean;
  fresh?: boolean;
};

export function climateState(device?: DeviceView): ClimateState {
  if (!device?.permissions?.read && !device?.permissions?.control) return {};
  const s = device.state ?? {};
  const number = (key: string, min: number, max: number, step?: number) => {
    const value = s[key];
    if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) return undefined;
    if (step && Math.abs((value - min) / step - Math.round((value - min) / step)) > 1e-6) return undefined;
    return value;
  };
  return {
    on: typeof s.switch === "boolean" ? s.switch : undefined,
    // The cloud's temperature is ROOM temperature; only targetTemperature is
    // the setpoint shown on the appliance display and temperature controls.
    targetTemperature: number("targetTemperature", 16, 31, .5),
    temperature: number("temperature", -50, 150),
    humidity: number("humidity", 0, 100),
    mode: number("mode", 2, 5, 1),
    fanLevel: number("fanLevel", 0, 8, 1),
    verticalSwing: typeof s.verticalSwing === "boolean" ? s.verticalSwing : undefined,
    indicator: typeof s.indicator === "boolean" ? s.indicator : undefined,
    online: typeof s.online === "boolean" ? s.online : device.online,
    fresh: typeof s.stateFresh === "boolean" ? s.stateFresh : undefined,
  };
}

export function climateStatus(state: ClimateState, connected: boolean): string {
  if (state.on === undefined) return "等待设备状态";
  if (state.online === false) return "离线 · 上次状态";
  if (state.fresh === false) return "设备连接恢复中";
  return connected && state.fresh ? "在线 · 实时同步" : "状态快照";
}
