"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./yard.module.css";
import { YARD_SITE } from "./yard-solar";
import { sendCommand, sendDevicePatch, toDeviceState } from "./yard-api";
import { useDevices } from "./use-devices";
import { DEVICE_MAP } from "./device-map";
import ClimatePanel from "./ClimatePanel";
import { CLIMATE_LABEL, CLIMATE_MODES, climateState, type ClimateState } from "./climate-state";

const VIEWS = [
  { key: "all", label: "全景" },
  { key: "landscape", label: "园景" },
  { key: "waterside", label: "山水" },
  { key: "waterfall", label: "瀑布" },
  { key: "yard", label: "前院" },
  { key: "pond", label: "池塘" },
  { key: "garden", label: "花园" },
  { key: "top", label: "俯视" },
  { key: "attic", label: "三楼阁楼" },
];

export default function YardViewer() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [panelOpen, setPanelOpen] = useState(true);
  const [panelReady, setPanelReady] = useState(false);
  const panelRef = useRef<HTMLElement>(null);

  // One table for every device this visitor may see; the scene is a consumer.
  const { devices, refresh, streamConnected } = useDevices();
  const climateDevice = devices[DEVICE_MAP.ac202.device];
  const climate = climateState(climateDevice);
  const [climateOpen, setClimateOpen] = useState(false);
  const [climateReady, setClimateReady] = useState(false);
  const [climatePending, setClimatePending] = useState<string | null>(null);
  const [climateError, setClimateError] = useState<string | null>(null);
  const climateCommand = useRef<AbortController | null>(null);
  const alive = useRef(true);
  const climateReadable = Boolean(climateDevice?.permissions?.read || climateDevice?.permissions?.control);
  const sceneRef = useRef<{
    setDevice(key: string, patch: boolean | Record<string, unknown>): void;
    applyDeviceStates(states: Record<string, unknown>, linkedDeviceKeys: string[]): void;
    setClimateState(state: ClimateState): void;
    focusClimate(): void;
    destroy(): void;
  } | null>(null);
  const [sceneVersion, setSceneVersion] = useState(0);
  // Which scene object each lamp key drives; the click callback reads it.
  const bindingsRef = useRef<Record<string, { device: string; action: string; outlet?: number; type?: string }>>({});

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; climateCommand.current?.abort(); };
  }, []);

  async function controlClimate(action: string, value: boolean | number) {
    if (climateCommand.current || !climateReady || !climateDevice?.permissions?.control ||
      climate.online === false || climate.fresh === false || !(action in climateDevice.actions)) return;
    const field = action.slice(4);
    if (climateDevice.state[field] === value) return;
    const controller = new AbortController();
    climateCommand.current = controller;
    const deadline = window.setTimeout(() => controller.abort(), 12_000);
    setClimatePending(action);
    setClimateError(null);
    try {
      await sendCommand(DEVICE_MAP.ac202.device, action, value, undefined, controller.signal);
      // A successful write alone is not a confirmed physical state change.
      // SSE and these bounded cache reads reconcile the actual device reply.
      for (let attempt = 0; attempt < 6; attempt++) {
        if (controller.signal.aborted) throw new Error("confirmation_timeout");
        const current = (await refresh())[DEVICE_MAP.ac202.device];
        if (!current?.permissions?.control) throw new Error("permission_changed");
        if (current.state[field] === value && current.state.stateFresh !== false) return;
        await new Promise(resolve => window.setTimeout(resolve, 750));
      }
      throw new Error("state_unconfirmed");
    } catch {
      if (alive.current) setClimateError("操作未获设备确认，请查看当前状态后重试。");
    } finally {
      window.clearTimeout(deadline);
      climateCommand.current = null;
      if (alive.current) setClimatePending(null);
    }
  }

  // Small screens start with the panel tucked away; the static export renders
  // it open, so the CSS hides it until this effect has decided.
  useEffect(() => {
    if (!window.matchMedia('(min-width: 700px)').matches) setPanelOpen(false);
    setPanelReady(true);
  }, []);

  // Tapping the scene on a narrow screen dismisses the sheet, like a drawer.
  useEffect(() => {
    if (!panelOpen) return;
    if (!window.matchMedia('(max-width: 699px)').matches) return;
    const dismiss = (event: PointerEvent) => {
      if (panelRef.current?.contains(event.target as Node)) return;
      setPanelOpen(false);
    };
    document.addEventListener('pointerdown', dismiss, true);
    return () => document.removeEventListener('pointerdown', dismiss, true);
  }, [panelOpen]);

  useEffect(() => {
    let cancelled = false;

    import("./yard-scene")
      .then(async (mod) => {
        if (cancelled || !rootRef.current) return;
        const scene = await mod.createYardScene(rootRef.current, {
          pillClass: styles.pill,
          lampClass: styles.lampControl,
          locateClass: styles.locate,
          badgeClass: styles.deviceBadge,
          onClimateOpen: () => setClimateOpen(true),
          onClimateReady: (ready) => { if (!cancelled) setClimateReady(ready); },
          onDeviceChange: (key, patch, previous) => {
            const binding = bindingsRef.current[key];
            if (!binding) {
              sceneRef.current?.setDevice(key, previous);
              return;
            }
            sendDevicePatch(binding.device, binding.action, patch, binding.outlet).catch((error) => {
              console.warn("[yard] command failed", error);
              sceneRef.current?.setDevice(key, previous); // revert the optimistic change
            });
          },
        });
        if (cancelled) {
          scene.destroy();
          return;
        }
        sceneRef.current = scene;
        setSceneVersion((v) => v + 1);
      })
      .catch((err) => console.error("[yard] failed to start", err));

    return () => {
      cancelled = true;
      sceneRef.current?.destroy();
      sceneRef.current = null;
    };
  }, []);

  // Push the table into the scene whenever it changes: initial load, a change
  // pushed by the stream, or a fresh sign-in.
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    const bindings: typeof bindingsRef.current = {};
    const live: Record<string, unknown> = {};
    const linkedDeviceKeys: string[] = [];
    for (const [lamp, binding] of Object.entries(DEVICE_MAP)) {
      if (binding.type === "climate") continue;
      const device = devices[binding.device];
      // Access comes from device permissions, including anonymous grants.
      if (!device?.permissions?.read && !device?.permissions?.control) continue;
      linkedDeviceKeys.push(lamp);
      if (!device.permissions.control) continue;
      const action = binding.action ?? "set_switch";
      if (!(action in (device.actions ?? {}))) continue;
      bindings[lamp] = {
        device: binding.device,
        action,
        outlet: binding.outlet,
        type: binding.type,
      };
      live[lamp] = toDeviceState(device.state, binding.type ?? "light", binding.outlet ?? 0);
    }
    bindingsRef.current = bindings;
    scene.applyDeviceStates(live, linkedDeviceKeys);
    scene.setClimateState(climateState(devices[DEVICE_MAP.ac202.device]));
  }, [devices, sceneVersion]);

  return (
    <div ref={rootRef} className={styles.root} onContextMenu={(event) => {
      if (!(event.target instanceof HTMLInputElement)) event.preventDefault();
    }}>
      <div id="stage" className={styles.stage} />

      <aside ref={panelRef} className={styles.settings} data-open={panelOpen} data-ready={panelReady} aria-label="日照与设备">
      <button type="button" className={styles.panelToggle} aria-expanded={panelOpen} aria-controls="settings-body" onClick={() => setPanelOpen(value => !value)}>
        <span>{panelOpen ? "收起面板" : "日照与设备"}</span>
        <span aria-hidden="true">{panelOpen ? "‹" : "›"}</span>
      </button>
      <div id="settings-body" className={styles.settingsBody}>
      <div className={styles.settingsBodyInner}>
      <section className={styles.sunPanel} aria-label="实时日照">
        <div className={styles.sunHeading}>
          <span>日照时间</span>
          <span id="sun-mode" className={styles.sunMode}>实时跟随</span>
        </div>
        <p className={styles.sunLabel}>北京时间 · UTC+8</p>
        <time id="sun-clock" className={styles.sunClock}>--:--</time>
        <p id="sun-position" className={styles.sunPosition}>正在计算太阳位置…</p>
        <p className={styles.sunHint}>{YARD_SITE.longitude}°E · {YARD_SITE.latitude}°N</p>
      </section>
      <section className={styles.lighting} aria-label="灯光设置">
        <h2 className={styles.lightingTitle}>灯光设置</h2>
        <div className={styles.dock} aria-label="灯光控制">
        <div className={styles.lampControl} role="group" aria-label="西墙投光灯">
        <button
          id="floodlight"
          className={styles.pill}
          role="switch"
          aria-checked="false"
          disabled
        >
          西墙投光灯
        </button>
        <button id="floodlight-view" data-lamp-view="floodlight" className={styles.locate} aria-label="查看灯具：西墙投光灯" title="定位到西墙投光灯" disabled><span aria-hidden="true">↗</span></button>
        </div>
        <div id="lamp-list" className={styles.lampPills} />
        </div>
      </section>
      <section className={styles.climateSection} aria-label="空调控制">
        <h2 className={styles.lightingTitle}>空调</h2>
        <div className={`${styles.lampControl} ${styles.climateCapsule}`} data-on={climate.on === true} data-linked={climateReadable}>
          <button type="button" className={styles.pill} aria-label={`打开${CLIMATE_LABEL}控制面板`} aria-haspopup="dialog"
            disabled={!climateReady} onClick={() => { setClimateError(null); setClimateOpen(true); }}>
            {climateReadable && <span className={styles.deviceBadge} aria-label="已绑定真实设备"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m10 13 4-4m-5 6-1 1a4 4 0 0 1-5.7-5.6l3-3a4 4 0 0 1 5.7 0m2 2 1-1a4 4 0 0 1 5.7 5.6l-3 3a4 4 0 0 1-5.7 0" /></svg></span>}
            <span>{CLIMATE_LABEL}</span>
            <span className={styles.climateCapsuleState}>{climate.online === false ? "离线" : climate.on === undefined ? "未连接" : climate.on ? `${CLIMATE_MODES[climate.mode ?? 0] ?? "运行"} ${climate.targetTemperature ?? "—"}℃` : "关机"}</span>
          </button>
          <button type="button" className={styles.locate} aria-label="查看空调" title="定位到空调" disabled={!climateReady}
            onClick={() => {
              sceneRef.current?.focusClimate();
              if (window.matchMedia("(max-width: 699px)").matches) setPanelOpen(false);
            }}><span aria-hidden="true">↗</span></button>
        </div>
      </section>
      </div>
      </div>
      </aside>

      {climateOpen && <ClimatePanel device={climateDevice} ready={climateReady} connected={streamConnected}
        pending={climatePending} error={climateError} onCommand={controlClimate} onClose={() => setClimateOpen(false)} />}



      <nav className={styles.viewbar} aria-label="预设视角">
        {VIEWS.map((view, i) => (
          <button
            key={view.key}
            className={styles.pill}
            data-view={view.key}
            aria-pressed={i === 0 ? "true" : "false"}
          >
            {view.label}
          </button>
        ))}
        <button id="reset" className={styles.pill} title="重置当前视角" aria-label="重置当前视角">
          ↺
        </button>
      </nav>

      <div id="loading" className={styles.overlay} aria-live="polite">
        <div className={styles.card}>
          <div id="spinner" className={styles.spinner} />
          <h2 id="load-title">正在打开院子</h2>
          <p id="load-message">读取模型与几何数据…</p>
          <div id="progress" className={styles.progress}>
            <div id="progress-fill" className={styles.progressFill} />
          </div>
          <button id="retry" className={styles.retry} hidden>
            重新加载
          </button>
        </div>
      </div>
    </div>
  );
}
