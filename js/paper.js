import { BRAND_HOVER_COLORS } from "./config.js";

export function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function hexToRgb(hex) {
  const clean = String(hex || "#ffe082").replace("#", "").trim();
  const full = clean.length === 3
    ? clean.split("").map((c) => c + c).join("")
    : clean.padEnd(6, "0").slice(0, 6);
  const num = parseInt(full, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255
  };
}

export function isDarkPaper(hex) {
  const { r, g, b } = hexToRgb(hex);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance < 0.52;
}

export function getPaperInk(hex) {
  return isDarkPaper(hex) ? "#f8fafc" : "#111827";
}

export function formatTimeAgo(isoString) {
  const date = new Date(isoString);
  const diffSec = Math.max(1, Math.floor((Date.now() - date.getTime()) / 1000));
  if (diffSec < 60) return "just now";
  const mins = Math.floor(diffSec / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function formatFullDate(isoString) {
  const date = new Date(isoString);
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function isSpotlightActive(letter) {
  if (!letter?.spotlight_expires_at) return false;
  return new Date(letter.spotlight_expires_at).getTime() > Date.now();
}

export function renderWordmarkHTML(brandName = "SelfNote.", size = "xl") {
  const chars = Array.from(brandName || "SelfNote.");
  return `<span class="wordmark wordmark-${escapeHtml(size)}" data-wordmark="true">${chars
    .map(
      (ch, idx) =>
        `<span class="wordmark-char" style="animation-delay:${(idx * 0.1).toFixed(1)}s">${
          ch === " " ? "&nbsp;" : escapeHtml(ch)
        }</span>`
    )
    .join("")}</span>`;
}

export function bindWordmarkHover(root = document) {
  root.querySelectorAll("[data-wordmark='true']").forEach((el) => {
    if (el.dataset.bound === "true") return;
    el.dataset.bound = "true";
    el.querySelectorAll(".wordmark-char").forEach((span) => {
      span.addEventListener("mouseenter", () => {
        const current = span.style.color;
        let next = BRAND_HOVER_COLORS[Math.floor(Math.random() * BRAND_HOVER_COLORS.length)];
        if (next === current) {
          next = BRAND_HOVER_COLORS[(BRAND_HOVER_COLORS.indexOf(next) + 1) % BRAND_HOVER_COLORS.length];
        }
        span.style.color = next;
      });
      span.addEventListener("mouseleave", () => {
        span.style.color = "";
      });
    });
  });
}

export function paintStationeryCanvases(root = document) {
  root.querySelectorAll("canvas[data-stationery]").forEach((canvas) => {
    const tpl = canvas.getAttribute("data-stationery");
    if (!tpl) return;
    const rect = canvas.parentElement?.getBoundingClientRect();
    const w = Math.max(180, Math.floor(rect?.width || 320));
    const h = Math.max(180, Math.floor(rect?.height || 260));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    const dark = canvas.getAttribute("data-dark") === "true";

    if (tpl === "love") {
      const color = dark ? "rgba(255, 182, 210, 0.28)" : "rgba(219, 39, 119, 0.18)";
      ctx.fillStyle = color;
      const pts = [
        [22, 26, 7],
        [w - 26, 36, 8],
        [18, h - 38, 8],
        [w - 24, h - 28, 7],
        [w - 48, h * 0.48, 5]
      ];
      pts.forEach(([x, y, s]) => drawMiniHeart(ctx, x, y, s));
    } else if (tpl === "celebration") {
      const palette = dark
        ? ["rgba(253,224,71,0.32)", "rgba(110,231,183,0.3)", "rgba(147,197,253,0.3)"]
        : ["rgba(234,88,12,0.22)", "rgba(37,99,235,0.2)", "rgba(16,185,129,0.24)"];
      const sparks = [
        [20, 24], [w - 22, 28], [26, h - 26], [w - 28, h - 24],
        [w * 0.85, h * 0.52], [22, h * 0.5]
      ];
      sparks.forEach(([x, y], i) => {
        ctx.strokeStyle = palette[i % palette.length];
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(x - 5, y);
        ctx.lineTo(x + 5, y);
        ctx.moveTo(x, y - 5);
        ctx.lineTo(x, y + 5);
        ctx.stroke();
      });
    }
  });
}

function drawMiniHeart(ctx, x, y, size) {
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  ctx.moveTo(0, size * 0.35);
  ctx.bezierCurveTo(-size, -size * 0.4, -size * 0.5, -size, 0, -size * 0.35);
  ctx.bezierCurveTo(size * 0.5, -size, size, -size * 0.4, 0, size * 0.35);
  ctx.fill();
  ctx.restore();
}

export function spawnHeartBubbles(anchorEl) {
  if (!anchorEl) return;
  const rect = anchorEl.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;

  for (let i = 0; i < 4; i++) {
    const bubble = document.createElement("div");
    bubble.className = "heart-bubble";
    const dx1 = (Math.random() * 28 - 14).toFixed(1) + "px";
    const dx2 = (Math.random() * 54 - 27).toFixed(1) + "px";
    const rot = (Math.random() * 34 - 17).toFixed(1) + "deg";
    bubble.style.left = `${cx}px`;
    bubble.style.top = `${cy}px`;
    bubble.style.setProperty("--dx1", dx1);
    bubble.style.setProperty("--dx2", dx2);
    bubble.style.setProperty("--rot", rot);
    bubble.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5"/></svg>`;
    document.body.appendChild(bubble);
    setTimeout(() => bubble.remove(), 1300);
  }
}

export function renderLetterCardHTML(letter, { liked = false, clamped = true, showSpaceBadge = false } = {}) {
  const color = letter.color_hex || "#ffe082";
  const dark = isDarkPaper(color);
  const ink = getPaperInk(color);
  const seedNum = Number(String(letter.id).replace(/\D/g, "")) || 7;
  const bgPos = `${(seedNum * 87) % 400}px ${(seedNum * 131) % 400}px`;
  const spotlight = isSpotlightActive(letter);

  return `
    <article
      class="paper-card paper-card-interactive ${spotlight ? "spotlight-card" : ""}"
      data-letter-id="${escapeHtml(letter.id)}"
      data-dark-paper="${dark}"
      style="background-color:${escapeHtml(color)};color:${ink}"
    >
      <div class="paper-texture-overlay" style="background-position:${bgPos}"></div>
      ${
        letter.template_id
          ? `<canvas class="stationery-canvas" data-stationery="${escapeHtml(letter.template_id)}" data-dark="${dark}" aria-hidden="true"></canvas>`
          : ""
      }
      <div class="paper-card-content">
        <div class="paper-card-header">
          <div class="paper-to-line">
            <span class="paper-to-prefix">To:</span><span>${escapeHtml(letter.recipient)}</span>
          </div>
          <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
            ${spotlight ? `<span class="spotlight-badge" title="Pinned in Spotlight">★ Pin</span>` : ""}
            ${
              showSpaceBadge
                ? `<span class="spotlight-badge" style="background:rgba(0,0,0,0.08);border-color:currentColor">${escapeHtml(letter.space)}</span>`
                : `<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.78" aria-hidden="true"><path d="m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7"/><rect x="2" y="4" width="20" height="16" rx="2"/></svg>`
            }
          </div>
        </div>
        <div class="paper-divider"></div>
        <div class="paper-card-body">
          <p class="paper-message ${clamped ? "paper-message-clamped" : ""}">${escapeHtml(letter.message)}</p>
        </div>
        <div class="paper-divider"></div>
        <div class="paper-card-footer">
          <button
            type="button"
            class="like-btn ${liked ? "is-liked" : ""}"
            data-like-id="${escapeHtml(letter.id)}"
            aria-label="Like note"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="${liked ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5"></path>
            </svg>
            <span data-like-count="${escapeHtml(letter.id)}">${Number(letter.hearts_count || 0)}</span>
          </button>
          <span style="opacity:0.78;font-weight:600">${escapeHtml(formatTimeAgo(letter.created_at))}</span>
        </div>
      </div>
    </article>
  `;
}
