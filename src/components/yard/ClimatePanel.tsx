"use client";

import { useEffect, useRef } from "react";
import type { DeviceView } from "./yard-api";
import { CLIMATE_LABEL, CLIMATE_MODES, climateState, climateStatus } from "./climate-state";
import styles from "./yard.module.css";

type Props = {
  device?: DeviceView;
  ready: boolean;
  connected: boolean;
  pending: string | null;
  error: string | null;
  onCommand: (action: string, value: number | boolean) => void;
  onClose: () => void;
};

export default function ClimatePanel({ device, ready, connected, pending, error, onCommand, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const state = climateState(device);
  const readable = Boolean(device?.permissions?.read || device?.permissions?.control);
  const canControl = Boolean(device?.permissions?.control);
  const enabled = ready && canControl && !pending && state.online !== false && state.fresh !== false && state.on !== undefined;
  const supports = (action: string) => enabled && action in (device?.actions ?? {});
  const running = state.on === true;
  const setpoint = state.targetTemperature;

  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  return <dialog ref={ref} className={styles.climateDialog} aria-labelledby="climate-title"
    onCancel={event => { event.preventDefault(); onClose(); }}
    onClick={event => {
      if (event.target !== event.currentTarget) return;
      const rect = event.currentTarget.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose();
    }}>
    <div className={styles.climateHeading}>
      <div><p className={styles.climateEyebrow}>米家 · 1.5 匹</p><h2 id="climate-title">{CLIMATE_LABEL}</h2></div>
      <button type="button" className={styles.climateClose} aria-label="关闭空调控制面板" onClick={onClose} autoFocus>×</button>
    </div>
    <p className={styles.climateStatus} aria-live="polite">{!ready ? "空调模型加载中" : !readable ? "登录并获得授权后，可查看和控制设备" : climateStatus(state, connected)}</p>
    <button type="button" className={styles.climatePower} role="switch" aria-label="空调电源" aria-checked={running}
      disabled={!supports("set_switch")} onClick={() => onCommand("set_switch", !running)}>
      <span>电源</span><span>{state.on === undefined ? "未获取状态" : running ? "已开启" : "已关闭"}<span className={styles.climateToggle} aria-hidden="true" /></span>
    </button>
    <div className={styles.climateTemperature}>
      <p>设定温度</p>
      <div className={styles.climateStepper}>
        <button type="button" aria-label="降低设定温度 0.5℃" disabled={!supports("set_targetTemperature") || !running || setpoint === undefined || setpoint <= 16}
          onClick={() => onCommand("set_targetTemperature", (setpoint ?? 16) - .5)}>−</button>
        <output aria-label="空调设定温度">{setpoint ?? "—"}<small>℃</small></output>
        <button type="button" aria-label="升高设定温度 0.5℃" disabled={!supports("set_targetTemperature") || !running || setpoint === undefined || setpoint >= 31}
          onClick={() => onCommand("set_targetTemperature", (setpoint ?? 31) + .5)}>+</button>
      </div>
      <div className={styles.climateReadings}>
        <div><span>当前室温</span><output aria-label="空调当前室温">{state.temperature ?? "—"}<small>℃</small></output></div>
        <div><span>当前湿度</span><output aria-label="空调当前湿度">{state.humidity ?? "—"}<small>%</small></output></div>
      </div>
    </div>
    <fieldset className={styles.climateModes} disabled={!supports("set_mode") || !running}>
      <legend>运行模式</legend>
      <div>{Object.entries(CLIMATE_MODES).map(([value, label]) => <button type="button" key={value}
        aria-pressed={state.mode === Number(value)} onClick={() => onCommand("set_mode", Number(value))}>{label}</button>)}</div>
    </fieldset>
    <label className={styles.climateRow}><span>风速</span><select aria-label="空调风速" value={state.fanLevel ?? ""} disabled={!supports("set_fanLevel") || !running}
      onChange={event => onCommand("set_fanLevel", Number(event.target.value))}>
      {state.fanLevel === undefined && <option value="">—</option>}
      {Array.from({ length: 9 }, (_, level) => <option key={level} value={level}>{level === 0 ? "自动" : level === 8 ? "最大风" : `${level} 档`}</option>)}
    </select></label>
    <label className={styles.climateRow}><span>上下扫风</span><input type="checkbox" role="switch" aria-label="空调上下扫风" checked={state.verticalSwing === true}
      disabled={!supports("set_verticalSwing") || !running || state.verticalSwing === undefined} onChange={event => onCommand("set_verticalSwing", event.target.checked)} /></label>
    <label className={styles.climateRow}><span>机身指示灯</span><input type="checkbox" role="switch" aria-label="空调指示灯" checked={state.indicator === true}
      disabled={!supports("set_indicator") || state.indicator === undefined} onChange={event => onCommand("set_indicator", event.target.checked)} /></label>
    <div className={styles.climateFeedback}>
      {pending ? <p role="status">正在等待设备确认…</p> : error ? <p role="alert">{error}</p> : <p>{!readable ? "设备状态尚未获取" : !canControl ? "当前仅可查看设备状态" : !running ? "开机后可调整温度、模式和风速" : "以设备回报的状态为准"}</p>}
    </div>
  </dialog>;
}
