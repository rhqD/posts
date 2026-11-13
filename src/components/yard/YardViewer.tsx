"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./yard.module.css";
import { YARD_SITE } from "./yard-solar";
import { fetchDevices, sendDevicePatch, toDeviceState, type DeviceState } from "./yard-api";
import { DEVICE_MAP } from "./device-map";

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
    let destroy: (() => void) | undefined;
    let cancelled = false;
    const controller = new AbortController();
    let sceneApi: { setDevice(key: string, patch: boolean | Record<string, unknown>): void } | undefined;
    // Filled once the device list arrives; the scene callback is created
    // earlier, so it reads through this ref instead of closing over it.
    const bindings: Record<string, { device: string; action: string; outlet?: number; type?: string }> = {};
    let detachAuth: () => void = () => {};

    import("./yard-scene")
      .then(async (mod) => {
        if (cancelled || !rootRef.current) return;
        const scene = await mod.createYardScene(rootRef.current, {
          pillClass: styles.pill,
          lampClass: styles.lampControl,
          locateClass: styles.locate,
          onDeviceChange: (key, patch, previous) => {
            const binding = bindings[key];
            if (!binding) {
              sceneApi?.setDevice(key, previous);
              return;
            }
            sendDevicePatch(binding.device, binding.action, patch, binding.outlet).catch((error) => {
              console.warn("[yard] command failed", error);
              sceneApi?.setDevice(key, previous); // revert the optimistic change
            });
          },
        });
        sceneApi = scene;
        if (cancelled) { scene?.destroy(); return; }
        destroy = () => scene?.destroy();
        // A lamp becomes live only when it is bound *and* this visitor may
        // control the device *and* the device actually offers that action.
        // Everything else keeps its pure-animation behaviour.
        const sync = () => {
          if (cancelled) return;
          fetchDevices(controller.signal).then((devices) => {
            if (cancelled) return;
            for (const key of Object.keys(bindings)) delete bindings[key];
            const live: Record<string, DeviceState> = {};
            for (const [lamp, binding] of Object.entries(DEVICE_MAP)) {
              const device = devices[binding.device];
              if (!device?.permissions.control) continue;
              const action = binding.action ?? "set_switch";
              if (!(action in device.actions)) continue;
              bindings[lamp] = { device: binding.device, action, outlet: binding.outlet, type: binding.type };
              live[lamp] = toDeviceState(device.state, binding.type ?? "light");
            }
            scene.applyDeviceStates(live);
          });
        };
        sync();
        // Logging in from the header must light up the scene without a reload.
        window.addEventListener("auth-change", sync);
        detachAuth = () => window.removeEventListener("auth-change", sync);
      })
      .catch((err) => console.error("[yard] failed to start", err));

    return () => {
      cancelled = true;
      controller.abort();
      detachAuth();
      destroy?.();
    };
  }, []);

  return (
    <div ref={rootRef} className={styles.root} onContextMenu={(event) => {
      if (!(event.target instanceof HTMLInputElement)) event.preventDefault();
    }}>
      <div id="stage" className={styles.stage} />

      <aside ref={panelRef} className={styles.settings} data-open={panelOpen} data-ready={panelReady} aria-label="时间与灯光设置">
      <button type="button" className={styles.panelToggle} aria-expanded={panelOpen} aria-controls="settings-body" onClick={() => setPanelOpen(value => !value)}>
        <span>{panelOpen ? "收起面板" : "时间与灯光"}</span>
        <span aria-hidden="true">{panelOpen ? "‹" : "›"}</span>
      </button>
      <div id="settings-body" className={styles.settingsBody}>
      <div className={styles.settingsBodyInner}>
      <section className={styles.sunPanel} aria-label="日照时间设置">
        <div className={styles.sunHeading}>
          <span>日照时间</span>
          <span id="sun-mode" className={styles.sunMode}>实时跟随</span>
        </div>
        <label className={styles.sunLabel} htmlFor="sun-datetime">北京时间 · UTC+8</label>
        <input id="sun-datetime" className={styles.sunDateTime} type="datetime-local" step="60" min="1900-01-01T00:00" max="2100-12-31T23:59" disabled />
        <label className={styles.sunRangeLabel} htmlFor="sun-time">
          <span>时刻</span><output id="sun-clock" htmlFor="sun-time">--:--</output>
        </label>
        <input id="sun-time" className={styles.sunRange} type="range" min="0" max="1439" step="1" defaultValue="720" aria-valuetext="12:00" disabled />
        <div className={styles.sunTicks} aria-hidden="true"><span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>24:00</span></div>
        <p id="sun-position" className={styles.sunPosition}>正在计算太阳位置…</p>
        <button id="sun-live" className={styles.pill} aria-pressed="true" disabled>跟随实时</button>
        <p className={styles.sunHint}>{YARD_SITE.longitude}°E · {YARD_SITE.latitude}°N</p>
      </section>
      <section className={styles.viewing} aria-label="视图设置">
        <h2 className={styles.lightingTitle}>视图</h2>
        <button id="rotate" className={styles.pill} aria-pressed="false">自动旋转</button>
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
      </div>
      </div>
      </aside>



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
