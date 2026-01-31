/* charts.js (v1.2)
   Simple canvas charts (no libs):
   - bar chart
   - line chart
   - donut chart
*/

const RRSA_CHARTS = (() => {
  function _ctx(canvas) {
    const c = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(10, Math.floor(rect.width));
    const h = Math.max(10, Math.floor(rect.height));
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { c, w, h };
  }

  function _colors() {
    const css = getComputedStyle(document.documentElement);
    const text = css.getPropertyValue("--text").trim() || "#e6ebf2";
    const muted = css.getPropertyValue("--text-muted").trim() || "#9aa7bd";
    const border = css.getPropertyValue("--border").trim() || "#242f44";
    const accent = css.getPropertyValue("--accent").trim() || "#4da3ff";
    const success = css.getPropertyValue("--success").trim() || "#4cd37d";
    const warning = css.getPropertyValue("--warning").trim() || "#f4c152";
    const danger = css.getPropertyValue("--danger").trim() || "#ff6b6b";
    const info = css.getPropertyValue("--info").trim() || "#6fa8ff";
    return { text, muted, border, accent, success, warning, danger, info };
  }

  function clear(canvas) {
    const { c, w, h } = _ctx(canvas);
    c.clearRect(0, 0, w, h);
  }

  function bar(canvas, labels, values, opts = {}) {
    const { c, w, h } = _ctx(canvas);
    const col = _colors();
    const pad = 28;
    const max = Math.max(1, ...values.map(v => Number(v) || 0));
    const n = Math.max(1, values.length);
    const innerW = w - pad * 2;
    const innerH = h - pad * 2;

    c.clearRect(0, 0, w, h);

    // axes
    c.strokeStyle = col.border;
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(pad, pad);
    c.lineTo(pad, h - pad);
    c.lineTo(w - pad, h - pad);
    c.stroke();

    const gap = innerW / n;
    const barW = Math.max(10, gap * 0.55);

    c.fillStyle = col.accent;
    values.forEach((v, i) => {
      const val = Math.max(0, Number(v) || 0);
      const x = pad + i * gap + (gap - barW) / 2;
      const bh = (val / max) * (innerH - 6);
      const y = (h - pad) - bh;
      c.fillRect(x, y, barW, bh);
    });

    // labels
    c.fillStyle = col.muted;
    c.font = "12px system-ui";
    labels.forEach((t, i) => {
      const x = pad + i * gap + gap / 2;
      c.textAlign = "center";
      c.fillText(String(t).slice(0, 10), x, h - 8);
    });

    if (opts.title) {
      c.fillStyle = col.text;
      c.font = "700 13px system-ui";
      c.textAlign = "left";
      c.fillText(String(opts.title), pad, 18);
    }
  }

  function line(canvas, labels, values, opts = {}) {
    const { c, w, h } = _ctx(canvas);
    const col = _colors();
    const pad = 28;
    const max = Math.max(1, ...values.map(v => Number(v) || 0));
    const min = Math.min(0, ...values.map(v => Number(v) || 0));
    const range = Math.max(1, max - min);

    c.clearRect(0, 0, w, h);

    // axes
    c.strokeStyle = col.border;
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(pad, pad);
    c.lineTo(pad, h - pad);
    c.lineTo(w - pad, h - pad);
    c.stroke();

    const n = Math.max(1, values.length);
    const innerW = w - pad * 2;
    const innerH = h - pad * 2;
    const stepX = innerW / Math.max(1, n - 1);

    // path
    c.strokeStyle = col.accent;
    c.lineWidth = 2;
    c.beginPath();
    values.forEach((v, i) => {
      const val = Number(v) || 0;
      const x = pad + i * stepX;
      const y = pad + (1 - (val - min) / range) * (innerH - 6);
      if (i === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    });
    c.stroke();

    // points
    c.fillStyle = col.accent;
    values.forEach((v, i) => {
      const val = Number(v) || 0;
      const x = pad + i * stepX;
      const y = pad + (1 - (val - min) / range) * (innerH - 6);
      c.beginPath();
      c.arc(x, y, 3.2, 0, Math.PI * 2);
      c.fill();
    });

    // labels (sparse)
    c.fillStyle = col.muted;
    c.font = "12px system-ui";
    c.textAlign = "center";
    const stride = Math.ceil(n / 6);
    labels.forEach((t, i) => {
      if (i % stride !== 0 && i !== n - 1) return;
      const x = pad + i * stepX;
      c.fillText(String(t).slice(0, 10), x, h - 8);
    });

    if (opts.title) {
      c.fillStyle = col.text;
      c.font = "700 13px system-ui";
      c.textAlign = "left";
      c.fillText(String(opts.title), pad, 18);
    }
  }

  function donut(canvas, segments, opts = {}) {
    // segments: [{ label, value, colorKey }]
    const { c, w, h } = _ctx(canvas);
    const col = _colors();

    const cx = w / 2, cy = h / 2;
    const r = Math.min(w, h) * 0.33;
    const ring = Math.max(10, r * 0.45);

    const total = segments.reduce((a, s) => a + Math.max(0, Number(s.value) || 0), 0) || 1;
    let a0 = -Math.PI / 2;

    c.clearRect(0, 0, w, h);

    segments.forEach(seg => {
      const v = Math.max(0, Number(seg.value) || 0);
      const a1 = a0 + (v / total) * Math.PI * 2;
      const color = col[seg.colorKey] || col.accent;

      c.strokeStyle = color;
      c.lineWidth = ring;
      c.beginPath();
      c.arc(cx, cy, r, a0, a1);
      c.stroke();
      a0 = a1;
    });

    // center label
    c.fillStyle = col.text;
    c.font = "900 16px system-ui";
    c.textAlign = "center";
    c.fillText(opts.centerText || "", cx, cy + 6);

    // legend
    c.font = "12px system-ui";
    c.textAlign = "left";
    c.fillStyle = col.muted;

    const lx = 14, ly = 22;
    if (opts.title) {
      c.fillStyle = col.text;
      c.font = "700 13px system-ui";
      c.fillText(String(opts.title), lx, 18);
      c.fillStyle = col.muted;
      c.font = "12px system-ui";
    }

    let y = ly + (opts.title ? 12 : 0);
    segments.forEach(seg => {
      const color = col[seg.colorKey] || col.accent;
      c.fillStyle = color;
      c.fillRect(lx, y - 9, 10, 10);
      c.fillStyle = col.muted;
      const pct = Math.round((Math.max(0, Number(seg.value) || 0) / total) * 100);
      c.fillText(`${seg.label}: ${seg.value} (${pct}%)`, lx + 14, y);
      y += 16;
    });
  }

  return { clear, bar, line, donut };
})();
