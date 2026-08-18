// Gráfico de barras minimalista, sin ninguna librería externa: es SVG plano
// construido a mano. No agrega ninguna lectura de Firebase (se dibuja con
// datos que la pantalla de Reportes ya trajo para el CSV) ni ningún costo —
// es HTML/CSS/JS que ya vive en el propio repositorio, igual que el resto
// del proyecto.
function escapeXml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]));
}

/**
 * @param {Object} opts
 * @param {string[]} opts.labels
 * @param {number[]} opts.values
 * @param {number} [opts.height]
 * @param {string} [opts.color] — cualquier color CSS válido, incluye var(--...)
 */
export function barChart({ labels, values, height = 150, color = "var(--color-primary)" }) {
  const width = 320;
  const padTop = 20;
  const padBottom = 24;
  const chartH = height - padTop - padBottom;
  const n = Math.max(values.length, 1);
  const slot = width / n;
  const barW = Math.max(4, slot * 0.6);
  const max = Math.max(...values, 1);

  let bars = "";
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    const barH = (v / max) * chartH;
    const x = i * slot + (slot - barW) / 2;
    const y = padTop + (chartH - barH);
    bars += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(barH, 0).toFixed(1)}" rx="3" fill="${color}"></rect>`;
    bars += `<text x="${(x + barW / 2).toFixed(1)}" y="${Math.max(y - 5, 10).toFixed(1)}" text-anchor="middle" font-size="11" font-weight="700" fill="currentColor">${escapeXml(v)}</text>`;
    bars += `<text x="${(x + barW / 2).toFixed(1)}" y="${height - 6}" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.65">${escapeXml(labels[i])}</text>`;
  }

  const wrap = document.createElement("div");
  wrap.className = "card";
  wrap.style.color = "var(--color-text)";
  wrap.innerHTML = values.length
    ? `<svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" role="img" aria-label="Gráfico de barras">${bars}</svg>`
    : `<div class="empty-state">Sin datos suficientes para graficar.</div>`;
  return wrap;
}

/**
 * Agrupa filas por día (a partir de un Timestamp/Date de Firestore) y
 * devuelve los últimos `maxBuckets` días con datos, ordenados de más viejo a
 * más nuevo — pensado para alimentar barChart() directo.
 */
export function bucketByDay(rows, dateField, maxBuckets = 14) {
  const counts = new Map();
  for (const row of rows) {
    const raw = row[dateField];
    const ms = raw && typeof raw.toMillis === "function" ? raw.toMillis() : raw instanceof Date ? raw.getTime() : null;
    if (!ms) continue;
    const d = new Date(ms);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const sortedKeys = Array.from(counts.keys()).sort();
  const lastKeys = sortedKeys.slice(-maxBuckets);
  return {
    labels: lastKeys.map((k) => {
      const [, m, d] = k.split("-");
      return `${d}/${m}`;
    }),
    values: lastKeys.map((k) => counts.get(k)),
  };
}
