let runtime: Promise<typeof import("mermaid")["default"]> | undefined;

function loadMermaid() {
  runtime ??= import("mermaid").then(({ default: mermaid }) => {
    mermaid.initialize({ startOnLoad: false, theme: "default", securityLevel: "strict" });
    return mermaid;
  }).catch((error) => {
    runtime = undefined;
    throw error;
  });
  return runtime;
}

// Diagram source is text, including when it contains HTML examples. Never
// parse it as HTML before Mermaid's own parser and sanitizer see it.
export async function renderMermaid(container: HTMLElement, code: string, active = () => true) {
  try {
    const mermaid = await loadMermaid();
    if (!active()) return;
    const node = document.createElement("pre");
    node.className = "mermaid";
    node.textContent = code;
    container.replaceChildren(node);
    await mermaid.run({ nodes: [node] });
  } catch {
    if (!active()) return;
    const fallback = document.createElement("pre");
    fallback.textContent = code;
    container.replaceChildren(fallback);
  }
}
