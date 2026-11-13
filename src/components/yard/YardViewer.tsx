"use client";

import { useEffect, useRef } from "react";
import styles from "./yard.module.css";

const VIEWS = [
  { key: "landscape", label: "园景" },
  { key: "waterside", label: "山水" },
  { key: "wildlife", label: "小动物" },
  { key: "yard", label: "前院" },
  { key: "pond", label: "池塘" },
  { key: "garden", label: "花园" },
  { key: "top", label: "俯视" },
  { key: "attic", label: "三楼阁楼" },
  { key: "all", label: "全景" },
];

export default function YardViewer() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let destroy: (() => void) | undefined;
    let cancelled = false;

    import("./yard-scene")
      .then(async (mod) => {
        if (cancelled || !rootRef.current) return;
        const scene = await mod.createYardScene(rootRef.current, { pillClass: styles.pill });
        if (cancelled) { scene?.destroy(); return; }
        destroy = () => scene?.destroy();
      })
      .catch((err) => console.error("[yard] failed to start", err));

    return () => {
      cancelled = true;
      destroy?.();
    };
  }, []);

  return (
    <div ref={rootRef} className={styles.root}>
      <div id="stage" className={styles.stage} />

      <aside className={styles.settings} aria-label="时间与灯光设置">
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
        <p className={styles.sunHint}>房屋坐标 108.09°E · 34.18°N<br />晴空光照示意</p>
      </section>
      <details className={styles.lighting}>
        <summary className={styles.pill}>灯光设置</summary>
        <div className={styles.dock} aria-label="灯光控制">
        <button
          id="floodlight"
          className={styles.pill}
          role="switch"
          aria-checked="false"
          disabled
        >
          西墙投光灯
        </button>
        <div id="lamp-list" className={styles.lampPills} />
        </div>
      </details>
      </aside>

      <aside className={styles.tools} aria-label="预览设置">
        <button id="rotate" className={styles.pill} aria-pressed="false">自动旋转</button>
        <button id="wireframe" className={styles.pill} aria-pressed="false">线框</button>
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
