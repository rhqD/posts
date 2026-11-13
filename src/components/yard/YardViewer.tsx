"use client";

import { useEffect, useRef } from "react";
import styles from "./yard.module.css";

const VIEWS = [
  { key: "landscape", label: "园景" },
  { key: "waterside", label: "山水" },
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

      <aside className={styles.tools} aria-label="预览设置">
        <button id="rotate" className={styles.pill} aria-pressed="false">自动旋转</button>
        <button id="wireframe" className={styles.pill} aria-pressed="false">线框</button>
      </aside>

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
