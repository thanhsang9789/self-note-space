// ============================================================================
// Flying Paper Airplane Outbox Banner Controller (/space)
// ============================================================================

export function mountOutboxAirplane(containerEl, { hasUnvisitedOutbox = false, onOpenOutbox }) {
  if (!containerEl) return () => {};

  const isDark = () => document.documentElement.classList.contains("dark");

  containerEl.innerHTML = `
    <div class="airplane-layer" aria-hidden="false">
      <div
        class="airplane-actor"
        role="button"
        tabindex="0"
        aria-label="View Your Outbox"
        title="Your Outbox — Sent Letters & Saved Notes"
        style="transform:translate3d(-320px, -320px, 0);opacity:0"
      >
        <div class="airplane-inner">
          <svg width="38" height="22" viewBox="0 0 38 22" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter:drop-shadow(0 2px 6px rgba(0,0,0,0.32))">
            <path data-wing-top d="M36 11 L6 3 L12 11 Z" fill="#F8FAFC" stroke="#334155" stroke-width="1.2" stroke-linejoin="round"></path>
            <path data-wing-bot d="M36 11 L12 11 L6 19 Z" fill="#E2E8F0" stroke="#334155" stroke-width="1.2" stroke-linejoin="round"></path>
            <line x1="36" y1="11" x2="12" y2="11" stroke="rgba(0,0,0,0.22)" stroke-width="1"></line>
          </svg>
          <div class="airplane-trail">
            <span style="width:4px;height:4px;border-radius:999px;background:currentColor;opacity:0.6"></span>
            <span style="width:6px;height:6px;border-radius:999px;background:currentColor;opacity:0.4"></span>
          </div>
          <div class="airplane-banner-wrap">
            <div class="airplane-banner-clip ${hasUnvisitedOutbox ? "is-open" : ""}">
              <div class="airplane-banner-card">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#f43f5e" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7"></path>
                  <rect x="2" y="4" width="20" height="16" rx="2"></rect>
                </svg>
                <span>Your Outbox</span>
                <span style="color:#6b7280;font-size:11px">→</span>
              </div>
            </div>
            <svg width="18" height="26" viewBox="0 0 18 26" fill="none" class="airplane-tether ${hasUnvisitedOutbox ? "is-open" : ""}">
              <line x1="0" y1="5" x2="18" y2="13" stroke="currentColor" stroke-width="1.2" stroke-dasharray="2.5 1.5" opacity="0.65"></line>
              <line x1="0" y1="21" x2="18" y2="13" stroke="currentColor" stroke-width="1.2" stroke-dasharray="2.5 1.5" opacity="0.65"></line>
            </svg>
          </div>
        </div>
      </div>
    </div>
  `;

  const actor = containerEl.querySelector(".airplane-actor");
  const bannerClip = containerEl.querySelector(".airplane-banner-clip");
  const tether = containerEl.querySelector(".airplane-tether");
  const wingTop = containerEl.querySelector("[data-wing-top]");
  const wingBot = containerEl.querySelector("[data-wing-bot]");

  let hovered = false;
  let bannerPinned = Boolean(hasUnvisitedOutbox);

  const syncAppearance = () => {
    const dark = isDark();
    if (wingTop && wingBot) {
      wingTop.setAttribute("fill", dark ? "#FFFFFF" : "#F8FAFC");
      wingTop.setAttribute("stroke", dark ? "rgba(255,255,255,0.88)" : "#334155");
      wingBot.setAttribute("fill", dark ? "#CBD5E1" : "#E2E8F0");
      wingBot.setAttribute("stroke", dark ? "rgba(255,255,255,0.88)" : "#334155");
    }
    const open = hovered || bannerPinned;
    bannerClip?.classList.toggle("is-open", open);
    tether?.classList.toggle("is-open", open);
  };

  syncAppearance();

  const onEnter = () => {
    hovered = true;
    syncAppearance();
  };
  const onLeave = () => {
    hovered = false;
    syncAppearance();
  };
  const handleTrigger = (e) => {
    e.preventDefault();
    e.stopPropagation();
    bannerPinned = false;
    onOpenOutbox?.();
  };

  actor.addEventListener("pointerenter", onEnter);
  actor.addEventListener("pointerleave", onLeave);
  actor.addEventListener("click", handleTrigger);
  actor.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") handleTrigger(e);
  });

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reducedMotion) {
    const x = Math.min(window.innerWidth - 210, window.innerWidth * 0.72);
    const y = Math.max(82, window.innerHeight * 0.14);
    actor.style.transform = `translate3d(${x}px, ${y}px, 0) rotate(0.04rad)`;
    actor.style.opacity = "1";
    return () => {
      containerEl.innerHTML = "";
    };
  }

  let rafId = null;
  let lastTime = performance.now();
  let x = Math.max(90, window.innerWidth * 0.28);
  let waitingRespawn = false;
  let respawnStart = 0;

  const tick = (now) => {
    if (document.hidden) {
      rafId = null;
      return;
    }
    const dt = Math.min(3, (now - lastTime) / 16.666);
    lastTime = now;

    const w = window.innerWidth || 390;
    const h = window.innerHeight || 800;
    const bannerVisible = hovered || bannerPinned;

    if (waitingRespawn) {
      if (now - respawnStart >= 950) {
        waitingRespawn = false;
        x = -(bannerVisible ? 200 : 60);
      }
    } else {
      const baseSpeed = w <= 640 ? 0.45 : 1.02;
      const speed = hovered ? baseSpeed * 0.28 : baseSpeed;
      x += speed * dt;
      const maxRight = bannerVisible ? w + 200 : w + 55;
      if (x > maxRight) {
        waitingRespawn = true;
        respawnStart = now;
      }
    }

    const amp = w <= 640 ? 15 : 26;
    const freq = (w <= 640 ? 1.75 : 2.2) * Math.PI;
    const phase = (x / Math.max(1, w)) * freq;
    const y = Math.max(74, h * 0.14) + Math.sin(phase) * amp;
    const angle = Math.atan2(Math.cos(phase) * amp * (freq / Math.max(1, w)), 1);

    actor.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) rotate(${angle.toFixed(3)}rad)`;
    actor.style.opacity = "1";
    syncAppearance();

    rafId = requestAnimationFrame(tick);
  };

  const onVisChange = () => {
    if (!document.hidden && rafId === null) {
      lastTime = performance.now();
      rafId = requestAnimationFrame(tick);
    }
  };

  document.addEventListener("visibilitychange", onVisChange);
  rafId = requestAnimationFrame(tick);

  return () => {
    if (rafId !== null) cancelAnimationFrame(rafId);
    document.removeEventListener("visibilitychange", onVisChange);
    containerEl.innerHTML = "";
  };
}
