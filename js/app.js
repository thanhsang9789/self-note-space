import { PAPER_SWATCHES, STATIONERY_TEMPLATES } from "./config.js";
import {
  bindWordmarkHover,
  escapeHtml,
  formatFullDate,
  getPaperInk,
  isDarkPaper,
  isSpotlightActive,
  paintStationeryCanvases,
  renderLetterCardHTML,
  renderWordmarkHTML,
  spawnHeartBubbles
} from "./paper.js";
import { mountOutboxAirplane } from "./airplane.js";
import { storage } from "./storage.js";

// ============================================================================
// Base-Path-Aware Router (Works at "/" and "/<github-repo-name>/")
// ============================================================================
const APP_BASE = new URL("..", import.meta.url).pathname.replace(/\/$/, "");

function toHref(routePath) {
  const clean = routePath.startsWith("/") ? routePath : `/${routePath}`;
  return `${APP_BASE}${clean}` || "/";
}

function getCurrentRoute() {
  let fullPath = window.location.pathname || "/";
  if (APP_BASE && fullPath.startsWith(APP_BASE)) {
    fullPath = fullPath.slice(APP_BASE.length) || "/";
  }
  return fullPath;
}

// Restore clean URL if redirected via 404.html (?__route=...)
(function restoreDeepLink() {
  const params = new URLSearchParams(window.location.search);
  const encodedRoute = params.get("__route");
  if (encodedRoute) {
    const target = encodedRoute.startsWith("/") ? encodedRoute : `/${encodedRoute}`;
    window.history.replaceState(null, "", `${APP_BASE}${target}`);
  }
})();

// ============================================================================
// Global UI Helpers (Progress Bar, Theme, Toasts, Modals, PWA Install)
// ============================================================================
const appEl = document.getElementById("app");
const modalRoot = document.getElementById("modal-root");
const toastRoot = document.getElementById("toast-root");
const navBar = document.getElementById("nav-progress-bar");

let activeCleanup = null;
let deferredInstallPrompt = null;

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
});

function startProgress() {
  if (!navBar) return;
  navBar.style.opacity = "1";
  navBar.style.width = "38%";
  setTimeout(() => {
    if (navBar.style.opacity === "1") navBar.style.width = "78%";
  }, 90);
}

function finishProgress() {
  if (!navBar) return;
  navBar.style.width = "100%";
  setTimeout(() => {
    navBar.style.opacity = "0";
    setTimeout(() => {
      navBar.style.width = "0%";
    }, 180);
  }, 140);
}

export function showToast(message, durationMs = 3400) {
  if (!toastRoot) return;
  const el = document.createElement("div");
  el.className = "toast-item";
  el.textContent = message;
  toastRoot.appendChild(el);
  setTimeout(() => {
    el.style.opacity = "0";
    el.style.transition = "opacity 0.2s ease";
    setTimeout(() => el.remove(), 220);
  }, durationMs);
}

function closeModal() {
  if (modalRoot) modalRoot.innerHTML = "";
}

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && modalRoot?.innerHTML) {
    closeModal();
  }
});

// Theme Mode Management
function getActiveMode() {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

function setThemeMode(mode) {
  try {
    localStorage.setItem("unsaid_mode", mode);
  } catch {}
  document.documentElement.setAttribute("data-mode", mode);
  document.documentElement.classList.toggle("dark", mode === "dark");
  updateThemeButtonIcon();
}

function updateThemeButtonIcon() {
  const iconWrap = document.getElementById("theme-toggle-icon");
  if (!iconWrap) return;
  const dark = getActiveMode() === "dark";
  iconWrap.innerHTML = dark
    ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>`
    : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>`;
}

function updateSyncStatusIndicator() {
  const dot = document.getElementById("sync-status-dot");
  if (!dot) return;
  const synced = storage.isCloudAuthenticated();
  dot.classList.toggle("is-synced", synced);
  dot.title = synced
    ? `Cloud Sync active (${storage.user?.email || "signed in"})`
    : storage.isCloudConfigured()
    ? "Supabase connected (Sign in via Email OTP to sync private notes)"
    : "Stored on this device (Tap to configure Cloud Sync or Backup)";
}

// ============================================================================
// Navigation Dispatcher
// ============================================================================
export async function navigate(routePath, { replace = false } = {}) {
  startProgress();
  const targetUrl = toHref(routePath);
  if (replace) {
    window.history.replaceState(null, "", targetUrl);
  } else if (window.location.pathname + window.location.search !== targetUrl) {
    window.history.pushState(null, "", targetUrl);
  }
  await renderRoute();
  window.scrollTo({ top: 0, behavior: "instant" });
  finishProgress();
}

window.addEventListener("popstate", () => {
  renderRoute();
});

document.addEventListener("click", (e) => {
  const link = e.target.closest("a[data-link]");
  if (!link) return;
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  e.preventDefault();
  const route = link.getAttribute("data-route") || link.getAttribute("href");
  if (route) navigate(route);
});

async function renderRoute() {
  if (typeof activeCleanup === "function") {
    activeCleanup();
    activeCleanup = null;
  }
  closeModal();

  const brand = storage.getBrandConfig();
  document.title = brand.appName || "SelfNote.";

  const path = getCurrentRoute();
  const params = new URLSearchParams(window.location.search);

  if (path === "/" || path === "/index.html") {
    if (storage.isOnboarded() && !params.has("onboarding")) {
      return navigate("/space", { replace: true });
    }
    return renderWelcomeView(brand);
  }

  if (path === "/space" || path === "/space/") {
    storage.markOnboarded();
    return renderSpaceHubView(brand);
  }

  if (path.startsWith("/feed/")) {
    const space = decodeURIComponent(path.slice("/feed/".length).replace(/\/$/, "")) || "Global";
    return renderFeedView(space, brand);
  }

  if (path.startsWith("/write/")) {
    const space = decodeURIComponent(path.slice("/write/".length).replace(/\/$/, "")) || "Personal";
    const editId = params.get("edit");
    return renderWriteView(space, brand, editId);
  }

  if (path === "/search" || path === "/search/") {
    const preVerify = params.get("verify");
    return renderSearchView(brand, preVerify);
  }

  if (path === "/outbox" || path === "/outbox/") {
    return renderOutboxView(brand);
  }

  if (path.startsWith("/letter/")) {
    const letterId = decodeURIComponent(path.slice("/letter/".length).replace(/\/$/, ""));
    return renderSingleLetterView(letterId, brand);
  }

  if (path === "/terms" || path === "/terms/") {
    return renderTermsView(brand);
  }

  return navigate("/space", { replace: true });
}

// ============================================================================
// 1. Welcome / Onboarding Hero View (/)
// ============================================================================
function renderWelcomeView(brand) {
  const sampleNote = {
    id: 99,
    recipient: "Future Me",
    message: "Write the things you don't want to forget — private notes to yourself, quiet reminders, or anonymous letters set free into the world.",
    space: "Personal",
    color_hex: "#ffe082",
    template_id: null,
    hearts_count: 24,
    created_at: new Date().toISOString()
  };

  appEl.innerHTML = `
    <div class="welcome-hero">
      <header style="display:flex;align-items:center;justify-content:space-between">
        <a href="${escapeHtml(toHref("/space"))}" data-link data-route="/space">
          ${renderWordmarkHTML(brand.appName, "lg")}
        </a>
        <span class="welcome-eyebrow">Zero Noise · Tactile Paper</span>
      </header>

      <div class="welcome-scene">
        <div class="welcome-copy">
          <span class="welcome-eyebrow">Personal Sanctuary & Anonymous Spaces</span>
          <h1>Keep your own notes, or leave unsaid words on paper.</h1>
          <p>
            Store personal notes across 36 tactile paper shades right from your cellphone or laptop, create custom spaces, or read & write anonymous letters in Global and Campus spaces.
          </p>
          <button id="enter-spaces-btn" type="button" class="ink-cta-btn">
            <span>Choose a Space</span>
            <span aria-hidden="true">→</span>
          </button>
        </div>

        <div class="welcome-stack">
          <div class="welcome-stack-back" aria-hidden="true"></div>
          <div class="welcome-stack-mid" aria-hidden="true"></div>
          ${renderLetterCardHTML(sampleNote, { liked: true, clamped: false })}
        </div>
      </div>

      <footer style="font-size:12px;color:var(--text-gray);display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px">
        <span>Works offline & syncs across devices</span>
        <a href="${escapeHtml(toHref("/terms"))}" data-link data-route="/terms" style="text-decoration:underline">Privacy & Guidelines</a>
      </footer>
    </div>
  `;

  bindWordmarkHover(appEl);
  document.getElementById("enter-spaces-btn")?.addEventListener("click", () => {
    storage.markOnboarded();
    navigate("/space");
  });
}

// ============================================================================
// 2. Choose a Space Hub (/space) — Exact unsaid.live/space Aesthetic + Custom Spaces
// ============================================================================
async function renderSpaceHubView(brand) {
  const customSpaces = await storage.fetchCustomSpaces();
  const verifiedCampuses = storage.getVerifiedCampuses();

  appEl.innerHTML = `
    <div class="space-shell">
      <div id="airplane-mount"></div>

      <header class="space-header">
        <h1>${renderWordmarkHTML(brand.appName, "xl")}</h1>
      </header>

      <div class="space-spacer-top" aria-hidden="true"></div>

      <main class="space-main">
        <!-- Hand-drawn Postal Globe, Route & Envelope Sketch -->
        <svg class="space-postal-sketch" viewBox="0 0 1000 760" preserveAspectRatio="xMidYMin meet" fill="none" aria-hidden="true">
          <g class="postal-globe" transform="rotate(-18 112 236)" stroke="currentColor" stroke-width="1.8">
            <circle cx="112" cy="236" r="94"></circle>
            <ellipse cx="112" cy="236" rx="42" ry="94"></ellipse>
            <ellipse cx="112" cy="236" rx="94" ry="34"></ellipse>
            <path d="M18 236h188m-94-94v188M34 184q78 42 156 0M34 288q78-42 156 0"></path>
            <path d="M33 158q-33 24-38 60m173 99 14 12m-24-7 12 18" stroke-width="3"></path>
          </g>
          <path class="postal-route" d="M47 360c-74 129 79 200 161 113 64-69-25-112-57-61-52 85 184 161 345 122s331-202 416-113c62 66-10 141-95 149" stroke="currentColor" stroke-width="2" stroke-dasharray="3 11" stroke-linecap="round"></path>
          <g class="postal-envelope" transform="rotate(17 884 503)">
            <path d="m799 445 172-9 8 122-172 9Z" fill="var(--paper-white, #ffffff)" stroke="currentColor" stroke-width="2"></path>
            <path d="m800 447 91 58 79-67m-162 127 59-78m111 68-65-66" stroke="currentColor" stroke-width="2" stroke-linejoin="round"></path>
            <path d="m930 452 25-1 1 27-25 1Z" fill="#ff611f" opacity=".85"></path>
            <path d="m938 458 10 13m-10 0 10-13" stroke="var(--paper-white, #ffffff)" stroke-width="1.5"></path>
          </g>
          <g class="postal-marks" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="m861 359 6 20m10-31-1 21m16-11-7 16M57 590l18-4m-10-8 2 20"></path>
            <path d="M770 644h132m-118 9h90m-100 9h127" opacity=".4"></path>
          </g>
        </svg>

        <h2 class="space-title">Choose a Space</h2>
        <p class="space-subtitle">${escapeHtml(brand.subtitle || "Where do you want to speak?")}</p>

        <!-- 01: Personal Notes Sanctuary -->
        <a
          href="${escapeHtml(toHref("/feed/Personal"))}"
          data-link
          data-route="/feed/Personal"
          class="space-card space-card-personal rotate-left"
        >
          <div class="space-card-kicker-row">
            <span class="space-card-kicker">01 / JUST FOR ME</span>
            <span class="space-card-arrow" aria-hidden="true">↗</span>
          </div>
          <div class="space-card-body">
            <div class="space-card-icon">
              <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20"/>
              </svg>
            </div>
            <div>
              <h3>My Personal Notes</h3>
              <p>Your private paper notebook. Store, pin & sync notes from your phone.</p>
            </div>
          </div>
        </a>

        <!-- 02: Global Feed -->
        <a
          href="${escapeHtml(toHref("/feed/Global"))}"
          data-link
          data-route="/feed/Global"
          class="space-card space-card-global rotate-right"
        >
          <div class="space-card-kicker-row">
            <span class="space-card-kicker">02 / EVERYWHERE</span>
            <span class="space-card-arrow" aria-hidden="true">↗</span>
          </div>
          <div class="space-card-body">
            <div class="space-card-icon">
              <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"></path>
                <path d="M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
              </svg>
            </div>
            <div>
              <h3>Global Feed</h3>
              <p>The world's archive. Read & write anonymous letters from everywhere.</p>
            </div>
          </div>
        </a>

        <!-- 03: College Feed -->
        <a
          href="${escapeHtml(toHref("/search"))}"
          data-link
          data-route="/search"
          class="space-card space-card-college rotate-left"
        >
          <div class="space-card-kicker-row">
            <span class="space-card-kicker">03 / CLOSE TO HOME</span>
            <span class="space-card-arrow" aria-hidden="true">↗</span>
          </div>
          <div class="space-card-body">
            <div class="space-card-icon">
              <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path>
                <circle cx="12" cy="7" r="4"></circle>
              </svg>
            </div>
            <div>
              <h3>College Feed</h3>
              <p>Anonymous confessions. Exclusive to your verified campus.</p>
            </div>
          </div>
        </a>

        <!-- Custom Note Spaces & Verified Campuses Pills -->
        <section class="custom-spaces-section" aria-label="Custom Note Spaces">
          <div class="custom-spaces-label">
            <span>Your Note Spaces & Folders</span>
            <button id="quick-write-btn" type="button" style="border:none;background:none;color:var(--cobalt);font-size:11px;font-weight:700;padding:0">
              + Quick Note
            </button>
          </div>
          <div class="space-pills-wrap">
            ${customSpaces
              .map(
                (sp) => `
              <a
                href="${escapeHtml(toHref(`/feed/${encodeURIComponent(sp.slug)}`))}"
                data-link
                data-route="/feed/${encodeURIComponent(sp.slug)}"
                class="space-pill"
              >
                <span>${escapeHtml(sp.emoji || "📝")}</span>
                <span>${escapeHtml(sp.name)}</span>
              </a>`
              )
              .join("")}
            ${verifiedCampuses
              .map(
                (dom) => `
              <a
                href="${escapeHtml(toHref(`/feed/${encodeURIComponent(dom)}`))}"
                data-link
                data-route="/feed/${encodeURIComponent(dom)}"
                class="space-pill space-pill-campus"
              >
                <span>🎓</span>
                <span>${escapeHtml(dom)}</span>
              </a>`
              )
              .join("")}
            <button id="create-space-btn" type="button" class="space-pill space-pill-add">
              <span>+ New Space</span>
            </button>
          </div>
        </section>
      </main>

      <div class="space-spacer-bottom" aria-hidden="true"></div>

      <footer class="space-footer">
        <button id="pwa-install-btn" type="button" class="pwa-install-ticket" aria-label="Install on Cellphone or Open Outbox">
          <svg width="26" height="24" viewBox="0 0 24 24" fill="none" stroke="#2445ff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <rect width="14" height="20" x="5" y="2" rx="2" ry="2"/>
            <path d="M12 18h.01"/>
          </svg>
          <span class="pwa-ticket-copy">
            <span>Cellphone Ready</span>
            <strong>Add to Home Screen</strong>
          </span>
        </button>
      </footer>

      ${
        brand.instagramUrl
          ? `<a href="${escapeHtml(brand.instagramUrl)}" target="_blank" rel="noopener noreferrer" class="floating-ig-btn" aria-label="Follow on Instagram">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#e1306c" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="20" x="2" y="2" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/></svg>
            </a>`
          : ""
      }
    </div>
  `;

  bindWordmarkHover(appEl);

  const cleanupPlane = mountOutboxAirplane(document.getElementById("airplane-mount"), {
    hasUnvisitedOutbox: storage.hasUnvisitedOutbox(),
    onOpenOutbox: () => {
      storage.clearUnvisitedOutbox();
      navigate("/outbox");
    }
  });
  activeCleanup = cleanupPlane;

  document.getElementById("create-space-btn")?.addEventListener("click", openCreateSpaceModal);
  document.getElementById("quick-write-btn")?.addEventListener("click", () => navigate("/write/Personal"));
  document.getElementById("pwa-install-btn")?.addEventListener("click", async () => {
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = null;
    } else {
      openMobileInstallGuideModal();
    }
  });
}

// ============================================================================
// 3. Space Feed & Personal Note Board (/feed/:space)
// ============================================================================
async function renderFeedView(space, brand) {
  if (storage.isCampusSpace(space) && !storage.isCampusVerified(space)) {
    showToast(`Verify your @${space} academic email to open this campus space.`);
    return navigate(`/search?verify=${encodeURIComponent(space)}`, { replace: true });
  }

  const isPriv = storage.isPrivateSpace(space);
  const customSpaceMeta = storage
    .getCustomSpaces()
    .find((s) => s.slug.toLowerCase() === space.toLowerCase());
  const displaySpaceTitle = customSpaceMeta
    ? `${customSpaceMeta.emoji || "📝"} ${customSpaceMeta.name}`
    : space === "Global"
    ? "🌍 Global"
    : `🎓 ${space}`;

  let state = {
    sort: "new",
    timeframe: "all",
    query: "",
    searchOpen: isPriv
  };

  appEl.innerHTML = `
    <div>
      <header class="masthead">
        <div class="masthead-inner">
          <div class="masthead-left">
            <a href="${escapeHtml(toHref("/space"))}" data-link data-route="/space" class="masthead-back" aria-label="Back to Spaces">
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>
              <span>Spaces</span>
            </a>
            <span class="masthead-space-badge" title="${escapeHtml(space)}">${escapeHtml(displaySpaceTitle)}</span>
            ${
              customSpaceMeta && customSpaceMeta.slug !== "Personal"
                ? `<button id="delete-space-btn" type="button" class="icon-action-btn" title="Delete custom space" aria-label="Delete custom space" style="width:28px;height:28px;opacity:0.65">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
                  </button>`
                : ""
            }
          </div>

          <div class="masthead-center">
            <a href="${escapeHtml(toHref("/space"))}" data-link data-route="/space">
              ${renderWordmarkHTML(brand.appName, "md")}
            </a>
          </div>

          <div class="masthead-right">
            <div class="sort-switch" role="group" aria-label="Sort notes">
              <button type="button" class="sort-btn is-active" data-sort="new">New</button>
              <span style="opacity:0.35;font-size:12px">/</span>
              <button type="button" class="sort-btn" data-sort="top">Top</button>
            </div>
            <button id="toggle-search-btn" type="button" class="icon-action-btn" aria-label="Search in space">
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21 21-4.34-4.34"/><circle cx="11" cy="11" r="8"/></svg>
            </button>
          </div>
        </div>
      </header>

      <div id="feed-subbar-wrap"></div>
      <main id="feed-list-mount" class="feed-container"></main>

      <a
        href="${escapeHtml(toHref(`/write/${encodeURIComponent(space)}`))}"
        data-link
        data-route="/write/${encodeURIComponent(space)}"
        class="compose-fab"
        aria-label="${isPriv ? "Write a Note" : "Write a Letter"}"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" style="transform:rotate(-28deg)">
          <path d="M12.67 19a2 2 0 0 0 1.416-.588l6.154-6.172a6 6 0 0 0-8.49-8.49L5.586 9.914A2 2 0 0 0 5 11.328V18a1 1 0 0 0 1 1z"/>
          <path d="M16 8 2 22"/>
          <path d="M17.5 15H9"/>
        </svg>
        <span>${isPriv ? "New Note" : "Write a Letter"}</span>
      </a>
    </div>
  `;

  bindWordmarkHover(appEl);

  const subbarWrap = document.getElementById("feed-subbar-wrap");
  const listMount = document.getElementById("feed-list-mount");

  const renderSubbar = () => {
    if (!state.searchOpen && state.sort !== "top") {
      subbarWrap.innerHTML = "";
      return;
    }
    subbarWrap.innerHTML = `
      <div class="feed-subbar">
        ${
          state.searchOpen
            ? `<div class="feed-search-box">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="opacity:0.55"><path d="m21 21-4.34-4.34"/><circle cx="11" cy="11" r="8"/></svg>
                <input id="feed-search-input" type="search" placeholder="Search recipient, title, or note text…" value="${escapeHtml(state.query)}" />
              </div>`
            : `<div></div>`
        }
        ${
          state.sort === "top"
            ? `<div class="timeframe-pills">
                ${["24h", "7d", "30d", "all"]
                  .map(
                    (tf) =>
                      `<button type="button" class="timeframe-pill ${state.timeframe === tf ? "is-active" : ""}" data-tf="${tf}">${tf === "all" ? "All Time" : tf}</button>`
                  )
                  .join("")}
              </div>`
            : ""
        }
      </div>
    `;

    const input = document.getElementById("feed-search-input");
    if (input) {
      input.addEventListener("input", (e) => {
        state.query = e.target.value;
        refreshLetters();
      });
    }
    subbarWrap.querySelectorAll("[data-tf]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.timeframe = btn.dataset.tf;
        renderSubbar();
        refreshLetters();
      });
    });
  };

  let currentLetters = [];

  const refreshLetters = async () => {
    currentLetters = await storage.listLetters({
      space,
      sort: state.sort,
      timeframe: state.timeframe,
      query: state.query
    });

    if (currentLetters.length === 0) {
      listMount.innerHTML = `
        <div class="empty-state">
          <div style="font-size:2rem">${isPriv ? "📓" : "✉️"}</div>
          <h3>${state.query ? "No matching notes found" : "Fresh blank paper"}</h3>
          <p>${
            state.query
              ? "Try a different keyword or clear the search filter."
              : isPriv
              ? `Save your first personal note in ${displaySpaceTitle}.`
              : `Be the first to leave an anonymous letter in ${space}.`
          }</p>
          <a href="${escapeHtml(toHref(`/write/${encodeURIComponent(space)}`))}" data-link data-route="/write/${encodeURIComponent(space)}" class="ink-cta-btn">
            <span>${isPriv ? "Write First Note" : "Write First Letter"}</span>
          </a>
        </div>
      `;
      return;
    }

    listMount.innerHTML = buildMasonryHTML(currentLetters);
    paintStationeryCanvases(listMount);
    bindCardListEvents(listMount, currentLetters, () => refreshLetters());
  };

  appEl.querySelectorAll("[data-sort]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.sort = btn.dataset.sort;
      appEl.querySelectorAll("[data-sort]").forEach((b) =>
        b.classList.toggle("is-active", b.dataset.sort === state.sort)
      );
      renderSubbar();
      refreshLetters();
    });
  });

  document.getElementById("toggle-search-btn")?.addEventListener("click", () => {
    state.searchOpen = !state.searchOpen;
    if (!state.searchOpen) state.query = "";
    renderSubbar();
    document.getElementById("feed-search-input")?.focus();
    refreshLetters();
  });

  document.getElementById("delete-space-btn")?.addEventListener("click", async () => {
    if (!confirm(`Delete the space "${customSpaceMeta.name}"? (Notes inside will stay in Your Outbox.)`)) return;
    await storage.deleteCustomSpace(customSpaceMeta.slug);
    showToast(`Removed space "${customSpaceMeta.name}"`);
    navigate("/space");
  });

  renderSubbar();
  await refreshLetters();
}

function buildMasonryHTML(letters, { showSpaceBadge = false } = {}) {
  const w = window.innerWidth;
  const colCount = w <= 600 ? 1 : w <= 960 ? 2 : 3;
  const cols = Array.from({ length: colCount }, () => []);
  letters.forEach((letter, idx) => {
    cols[idx % colCount].push(letter);
  });

  return `
    <div class="masonry-grid" style="grid-template-columns:repeat(${colCount}, minmax(0, 1fr))">
      ${cols
        .map(
          (colItems) => `
        <div class="masonry-col">
          ${colItems
            .map((item) =>
              renderLetterCardHTML(item, {
                liked: storage.isLiked(item.id),
                clamped: true,
                showSpaceBadge
              })
            )
            .join("")}
        </div>`
        )
        .join("")}
    </div>
  `;
}

function bindCardListEvents(container, lettersList, onChanged) {
  container.querySelectorAll("[data-like-id]").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const id = btn.getAttribute("data-like-id");
      const res = await storage.toggleLike(id);
      btn.classList.toggle("is-liked", res.liked);
      btn.classList.remove("animate-heart-pop");
      void btn.offsetWidth;
      btn.classList.add("animate-heart-pop");
      const svg = btn.querySelector("svg");
      if (svg) svg.setAttribute("fill", res.liked ? "currentColor" : "none");
      const countEl = container.querySelector(`[data-like-count="${CSS.escape(String(id))}"]`);
      if (countEl) countEl.textContent = String(res.hearts_count);
      if (res.liked) spawnHeartBubbles(btn);

      const target = lettersList.find((l) => String(l.id) === String(id));
      if (target) target.hearts_count = res.hearts_count;
    });
  });

  container.querySelectorAll("[data-letter-id]").forEach((card) => {
    card.addEventListener("click", () => {
      const id = card.getAttribute("data-letter-id");
      const letter = lettersList.find((l) => String(l.id) === String(id));
      if (letter) openLetterUnfoldModal(letter, onChanged);
    });
  });
}

// ============================================================================
// 4. Write / Edit Studio (/write/:space) — 36 Swatches, Stationery, Pin, Notify
// ============================================================================
async function renderWriteView(space, brand, editId = null) {
  if (storage.isCampusSpace(space) && !storage.isCampusVerified(space)) {
    return navigate(`/search?verify=${encodeURIComponent(space)}`, { replace: true });
  }

  const editingNote = editId ? await storage.getLetterById(editId) : null;
  const isPriv = storage.isPrivateSpace(space);
  const maxChars = isPriv ? 2000 : 500;

  let draft = {
    recipient: editingNote?.recipient || (isPriv ? "Myself" : ""),
    message: editingNote?.message || "",
    colorHex: editingNote?.color_hex || "#ffe082",
    templateId: editingNote?.template_id || null,
    spotlight: editingNote ? isSpotlightActive(editingNote) : false,
    notifyEmail: "",
    agreed: isPriv || Boolean(editingNote),
    activeShelfTab: "colour"
  };

  appEl.innerHTML = `
    <div>
      <header class="masthead">
        <div class="masthead-inner">
          <div class="masthead-left">
            <a href="${escapeHtml(toHref(`/feed/${encodeURIComponent(space)}`))}" data-link data-route="/feed/${encodeURIComponent(space)}" class="masthead-back">
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>
              <span>Back</span>
            </a>
            <span class="masthead-space-badge">${escapeHtml(space)}</span>
          </div>
          <div class="masthead-center">
            <a href="${escapeHtml(toHref("/space"))}" data-link data-route="/space">
              ${renderWordmarkHTML(brand.appName, "md")}
            </a>
          </div>
          <div class="masthead-right"></div>
        </div>
      </header>

      <main class="write-container">
        <div class="write-intro">
          <h1>${editingNote ? "Refine your note." : isPriv ? "Save it on paper." : "Leave it on paper."}</h1>
          <p>${isPriv ? "Stored in your personal space — accessible from phone & desktop." : "No perfect words needed. Just yours."}</p>
        </div>

        <div class="write-layout">
          <div class="write-left">
            <div id="live-paper-card" class="paper-card" style="background-color:${escapeHtml(draft.colorHex)};color:${getPaperInk(draft.colorHex)}" data-dark-paper="${isDarkPaper(draft.colorHex)}">
              <div class="paper-texture-overlay" style="background-position:240px 160px"></div>
              <canvas id="live-stationery-canvas" class="stationery-canvas" aria-hidden="true"></canvas>

              <div class="paper-card-content">
                <div class="write-recipient-row">
                  <label for="write-recipient" class="write-recipient-label">To:</label>
                  <input
                    id="write-recipient"
                    type="text"
                    maxlength="60"
                    placeholder="${isPriv ? "Note title or Myself…" : "Enter Name"}"
                    class="write-recipient-input"
                    value="${escapeHtml(draft.recipient)}"
                    autocomplete="off"
                  />
                  <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="opacity:0.75;flex-shrink:0"><path d="m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7"/><rect x="2" y="4" width="20" height="16" rx="2"/></svg>
                </div>

                <div class="paper-divider"></div>

                <textarea
                  id="write-message"
                  maxlength="${maxChars}"
                  placeholder="${isPriv ? "Jot down your note, idea, checklist, or letter to self…" : "Type Your Message Here…"}"
                  class="write-textarea"
                >${escapeHtml(draft.message)}</textarea>

                <div class="paper-divider"></div>

                <div class="write-card-bar">
                  <span id="char-count" class="char-counter">${draft.message.length} / ${maxChars}</span>
                  <span style="font-family:var(--font-serif);font-style:italic;opacity:0.82">${escapeHtml(brand.hashtag || "#selfnote")}</span>
                  <span style="text-align:right;opacity:0.75">${isPriv ? "PRIVATE" : "ANONYMOUS"}</span>
                </div>
              </div>
            </div>

            <!-- Spotlight / Pin Option -->
            <div class="spotlight-option">
              <div>
                <span class="option-kicker">${isPriv ? "Pin to top" : "24 hours in the light"}</span>
                <span class="option-title">${isPriv ? "Pin Important Note" : "Spotlight Letter"}</span>
                <p>${isPriv ? "Keep this note highlighted with a golden border at the top of your space." : "Pin your letter near the top of the feed for 24 hours."}</p>
              </div>
              <button id="spotlight-toggle" type="button" role="switch" aria-checked="${draft.spotlight}" class="spotlight-switch">
                <span class="spotlight-switch-knob"></span>
                <span id="spotlight-word">${draft.spotlight ? "On" : "Off"}</span>
              </button>
            </div>

            <!-- Secret Email Notification Option -->
            ${
              !editingNote
                ? `<div class="notification-option">
                    <span class="option-kicker">A quiet little nudge · Optional</span>
                    <label for="notify-email" class="option-title">Notify them secretly</label>
                    <p>Send a gentle email link to this note without revealing your identity.</p>
                    <input id="notify-email" type="email" inputmode="email" placeholder="Their email address (optional)" class="notification-input" />
                  </div>`
                : ""
            }

            ${
              !isPriv
                ? `<label style="display:flex;align-items:flex-start;gap:8px;margin-top:1rem;font-size:12.5px;color:var(--text-gray)">
                    <input id="agree-checkbox" type="checkbox" ${draft.agreed ? "checked" : ""} style="margin-top:2px" />
                    <span>I agree to the Community Guidelines (<a href="${escapeHtml(toHref("/terms"))}" data-link data-route="/terms" style="text-decoration:underline">Read Terms</a>)</span>
                  </label>`
                : ""
            }

            <button id="submit-letter-btn" type="button" class="submit-letter-btn">
              ${editingNote ? "Save Changes" : isPriv ? "Save Note to Space" : "Post Letter"}
            </button>
          </div>

          <!-- Paper Drawer (36 Swatches + Stationery) -->
          <aside class="write-right" aria-label="The paper drawer">
            <section class="stationery-shelf">
              <div class="shelf-heading">
                <span class="eyebrow">The paper drawer</span>
                <span style="color:var(--cobalt);font-weight:700">↙</span>
              </div>
              <h2>Make it yours.</h2>
              <div class="shelf-tabs">
                <button type="button" class="shelf-tab is-active" data-shelf-tab="colour">Colour (36)</button>
                <button type="button" class="shelf-tab" data-shelf-tab="stationery">Stationery</button>
              </div>
              <div id="shelf-panel-mount"></div>
            </section>
          </aside>
        </div>
      </main>
    </div>
  `;

  bindWordmarkHover(appEl);

  const liveCard = document.getElementById("live-paper-card");
  const liveCanvas = document.getElementById("live-stationery-canvas");
  const recipientEl = document.getElementById("write-recipient");
  const messageEl = document.getElementById("write-message");
  const charCountEl = document.getElementById("char-count");
  const submitBtn = document.getElementById("submit-letter-btn");
  const shelfMount = document.getElementById("shelf-panel-mount");

  const syncCardVisuals = () => {
    const dark = isDarkPaper(draft.colorHex);
    liveCard.style.backgroundColor = draft.colorHex;
    liveCard.style.color = getPaperInk(draft.colorHex);
    liveCard.setAttribute("data-dark-paper", String(dark));
    liveCard.classList.toggle("spotlight-card", draft.spotlight);

    if (draft.templateId) {
      liveCanvas.setAttribute("data-stationery", draft.templateId);
      liveCanvas.setAttribute("data-dark", String(dark));
      paintStationeryCanvases(liveCard);
    } else {
      liveCanvas.removeAttribute("data-stationery");
      const ctx = liveCanvas.getContext("2d");
      if (ctx) ctx.clearRect(0, 0, liveCanvas.width, liveCanvas.height);
    }

    const valid = draft.recipient.trim().length >= 1 && draft.message.trim().length >= 2 && draft.agreed;
    submitBtn.disabled = !valid;
  };

  const renderShelfPanel = () => {
    if (draft.activeShelfTab === "colour") {
      shelfMount.innerHTML = `
        <div class="paper-swatches">
          ${PAPER_SWATCHES.map((hex) => {
            const selected = hex.toLowerCase() === draft.colorHex.toLowerCase();
            const checkInk = getPaperInk(hex);
            return `
              <button
                type="button"
                class="paper-swatch ${selected ? "is-selected" : ""}"
                data-swatch="${hex}"
                title="${hex}"
                aria-label="Paper colour ${hex}"
                style="background-color:${hex};color:${checkInk}"
              >
                ${
                  selected
                    ? `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>`
                    : ""
                }
              </button>`;
          }).join("")}
        </div>
        <p style="font-size:11px;color:var(--text-gray);margin:0.85rem 0 0">36 shades to express or organize your thoughts.</p>
      `;

      shelfMount.querySelectorAll("[data-swatch]").forEach((btn) => {
        btn.addEventListener("click", () => {
          draft.colorHex = btn.getAttribute("data-swatch");
          renderShelfPanel();
          syncCardVisuals();
        });
      });
    } else {
      shelfMount.innerHTML = `
        <div class="stationery-options">
          ${STATIONERY_TEMPLATES.map((tpl) => {
            const selected = (draft.templateId || null) === tpl.id;
            return `
              <button type="button" class="stationery-option ${selected ? "is-selected" : ""}" data-tpl="${tpl.id || ""}">
                <span class="stationery-thumb" style="background:${tpl.bg};color:${tpl.ink}">
                  <span>To you,<br/><i>with feeling.</i></span>
                </span>
                <span class="stationery-option-label">${escapeHtml(tpl.label)}</span>
              </button>`;
          }).join("")}
        </div>
        <p style="font-size:11px;color:var(--text-gray);margin:0.85rem 0 0">Subtle margin details painted onto your paper.</p>
      `;

      shelfMount.querySelectorAll("[data-tpl]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const val = btn.getAttribute("data-tpl");
          draft.templateId = val || null;
          if (val === "love") draft.colorHex = "#f8bbd0";
          if (val === "celebration") draft.colorHex = "#cddc39";
          renderShelfPanel();
          syncCardVisuals();
        });
      });
    }
  };

  recipientEl.addEventListener("input", (e) => {
    draft.recipient = e.target.value;
    syncCardVisuals();
  });

  messageEl.addEventListener("input", (e) => {
    draft.message = e.target.value;
    charCountEl.textContent = `${draft.message.length} / ${maxChars}`;
    syncCardVisuals();
  });

  document.getElementById("spotlight-toggle")?.addEventListener("click", (e) => {
    draft.spotlight = !draft.spotlight;
    e.currentTarget.setAttribute("aria-checked", String(draft.spotlight));
    document.getElementById("spotlight-word").textContent = draft.spotlight ? "On" : "Off";
    syncCardVisuals();
  });

  document.getElementById("agree-checkbox")?.addEventListener("change", (e) => {
    draft.agreed = e.target.checked;
    syncCardVisuals();
  });

  appEl.querySelectorAll("[data-shelf-tab]").forEach((tab) => {
    tab.addEventListener("click", () => {
      draft.activeShelfTab = tab.dataset.shelfTab;
      appEl.querySelectorAll("[data-shelf-tab]").forEach((t) =>
        t.classList.toggle("is-active", t.dataset.shelfTab === draft.activeShelfTab)
      );
      renderShelfPanel();
    });
  });

  submitBtn.addEventListener("click", async () => {
    try {
      submitBtn.disabled = true;
      submitBtn.textContent = "Saving…";
      const notifyEmail = document.getElementById("notify-email")?.value || "";

      if (editingNote) {
        await storage.updateLetter(editingNote.id, {
          recipient: draft.recipient,
          message: draft.message,
          colorHex: draft.colorHex,
          templateId: draft.templateId,
          spotlight: draft.spotlight
        });
        showToast("Note updated!");
      } else {
        const { notifyStatus } = await storage.createLetter({
          recipient: draft.recipient,
          message: draft.message,
          space,
          colorHex: draft.colorHex,
          templateId: draft.templateId,
          spotlight: draft.spotlight,
          notifyEmail
        });
        if (notifyStatus === "sent") {
          showToast("Saved & secret email nudge sent!");
        } else if (notifyStatus === "queued-preview") {
          showToast("Saved! (Configure EmailJS in Settings to dispatch live nudges.)");
        } else {
          showToast(isPriv ? "Saved to your space!" : "Letter posted!");
        }
      }

      navigate(`/feed/${encodeURIComponent(space)}`);
    } catch (err) {
      showToast(err.message || "Could not save note.");
      syncCardVisuals();
      submitBtn.textContent = editingNote ? "Save Changes" : isPriv ? "Save Note to Space" : "Post Letter";
    }
  });

  renderShelfPanel();
  syncCardVisuals();
}

// ============================================================================
// 5. Campus Directory & Email OTP Verification (/search)
// ============================================================================
function renderSearchView(brand, preVerifyDomain = null) {
  let query = "";

  appEl.innerHTML = `
    <div>
      <header class="masthead">
        <div class="masthead-inner">
          <div class="masthead-left">
            <a href="${escapeHtml(toHref("/space"))}" data-link data-route="/space" class="masthead-back">
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>
              <span>Campus directory</span>
            </a>
          </div>
          <div class="masthead-center">
            <a href="${escapeHtml(toHref("/space"))}" data-link data-route="/space">
              ${renderWordmarkHTML(brand.appName, "md")}
            </a>
          </div>
          <div class="masthead-right"></div>
        </div>
      </header>

      <main class="directory-main">
        <div class="directory-intro">
          <h1>Find your campus.</h1>
          <p>Read and write anonymous letters exclusive to your university via zero-profile academic email OTP.</p>
        </div>

        <div class="directory-search-field">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m21 21-4.34-4.34"/><circle cx="11" cy="11" r="8"/></svg>
          <input id="campus-search-input" type="search" placeholder="Search university name or enter domain (e.g. mit.edu)" autocomplete="off" />
        </div>

        <div id="campus-results-mount"></div>
      </main>
    </div>
  `;

  bindWordmarkHover(appEl);

  const resultsMount = document.getElementById("campus-results-mount");
  const searchInput = document.getElementById("campus-search-input");

  const renderLedger = () => {
    const items = storage.searchCampuses(query);
    const cleanDomainCandidate = query.trim().toLowerCase();
    const looksLikeDomain =
      cleanDomainCandidate.includes(".") &&
      !cleanDomainCandidate.includes(" ") &&
      !items.some((i) => i.domain === cleanDomainCandidate);

    resultsMount.innerHTML = `
      <div style="font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:var(--text-gray);margin-bottom:0.6rem">
        ${query ? "Matching Campuses" : "Popular Campuses"}
      </div>
      <div class="campus-ledger">
        ${
          looksLikeDomain
            ? `<button type="button" class="campus-row" data-campus-domain="${escapeHtml(cleanDomainCandidate)}" data-campus-name="${escapeHtml(cleanDomainCandidate)}">
                <span class="campus-num">+</span>
                <span class="campus-info">
                  <strong>Enter ${escapeHtml(cleanDomainCandidate)}</strong>
                  <small>Verify academic email @${escapeHtml(cleanDomainCandidate)}</small>
                </span>
                <span class="campus-meta"><span>Verify ↗</span></span>
              </button>`
            : ""
        }
        ${items
          .map((c, idx) => {
            const verified = storage.isCampusVerified(c.domain);
            return `
              <button type="button" class="campus-row" data-campus-domain="${escapeHtml(c.domain)}" data-campus-name="${escapeHtml(c.name)}">
                <span class="campus-num">${String(idx + 1).padStart(2, "0")}</span>
                <span class="campus-info">
                  <strong>${escapeHtml(c.name)}</strong>
                  <small>${escapeHtml(c.domain)} ${verified ? "· ✓ Verified" : ""}</small>
                </span>
                <span class="campus-meta">
                  <span>${c.letterCount} letters</span>
                  <span>↗</span>
                </span>
              </button>`;
          })
          .join("")}
      </div>
    `;

    resultsMount.querySelectorAll("[data-campus-domain]").forEach((row) => {
      row.addEventListener("click", () => {
        const dom = row.getAttribute("data-campus-domain");
        const name = row.getAttribute("data-campus-name");
        if (storage.isCampusVerified(dom)) {
          navigate(`/feed/${encodeURIComponent(dom)}`);
        } else {
          openCampusOtpModal(dom, name);
        }
      });
    });
  };

  searchInput.addEventListener("input", (e) => {
    query = e.target.value;
    renderLedger();
  });

  renderLedger();

  if (preVerifyDomain) {
    openCampusOtpModal(preVerifyDomain, preVerifyDomain);
  }
}

// ============================================================================
// 6. Your Outbox (/outbox) — All Saved Personal Notes & Sent Letters
// ============================================================================
async function renderOutboxView(brand) {
  storage.clearUnvisitedOutbox();
  const letters = await storage.getOutboxLetters();

  appEl.innerHTML = `
    <div>
      <header class="masthead">
        <div class="masthead-inner">
          <div class="masthead-left">
            <a href="${escapeHtml(toHref("/space"))}" data-link data-route="/space" class="masthead-back">
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>
              <span>Spaces</span>
            </a>
          </div>
          <div class="masthead-center">
            <a href="${escapeHtml(toHref("/space"))}" data-link data-route="/space">
              ${renderWordmarkHTML(brand.appName, "md")}
            </a>
          </div>
          <div class="masthead-right">
            <button id="outbox-export-btn" type="button" class="btn-secondary" style="padding:0.35rem 0.75rem;font-size:11.5px">
              Export Backup
            </button>
          </div>
        </div>
      </header>

      <div class="outbox-header">
        <div class="outbox-kicker">
          <span class="pulse-dot"></span>
          <span>A record of your thoughts & letters</span>
        </div>
        <h2>Your Outbox</h2>
        <p style="color:var(--text-gray);font-size:0.9rem;margin:0">
          Every personal note you've stored and every anonymous letter you've set free (${letters.length}).
        </p>
      </div>

      <main id="outbox-list-mount" class="feed-container"></main>
    </div>
  `;

  bindWordmarkHover(appEl);

  document.getElementById("outbox-export-btn")?.addEventListener("click", triggerBackupDownload);

  const listMount = document.getElementById("outbox-list-mount");
  if (letters.length === 0) {
    listMount.innerHTML = `
      <div class="empty-state">
        <h3>Your Outbox is empty</h3>
        <p>Notes you save in Personal Spaces or post to feeds will appear right here.</p>
        <a href="${escapeHtml(toHref("/write/Personal"))}" data-link data-route="/write/Personal" class="ink-cta-btn">Write a Note</a>
      </div>
    `;
    return;
  }

  listMount.innerHTML = buildMasonryHTML(letters, { showSpaceBadge: true });
  paintStationeryCanvases(listMount);
  bindCardListEvents(listMount, letters, () => renderOutboxView(brand));
}

// ============================================================================
// 7. Standalone Letter Permalink (/letter/:id) & Terms (/terms)
// ============================================================================
async function renderSingleLetterView(letterId, brand) {
  const letter = await storage.getLetterById(letterId);
  if (!letter) {
    appEl.innerHTML = `
      <div class="empty-state" style="margin-top:5rem">
        <h3>Note not found</h3>
        <p>This note may be private on another device or was deleted.</p>
        <a href="${escapeHtml(toHref("/space"))}" data-link data-route="/space" class="ink-cta-btn">Back to Spaces</a>
      </div>
    `;
    return;
  }

  appEl.innerHTML = `
    <div>
      <header class="masthead">
        <div class="masthead-inner">
          <div class="masthead-left">
            <a href="${escapeHtml(toHref(`/feed/${encodeURIComponent(letter.space)}`))}" data-link data-route="/feed/${encodeURIComponent(letter.space)}" class="masthead-back">
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>
              <span>${escapeHtml(letter.space)}</span>
            </a>
          </div>
          <div class="masthead-center">
            <a href="${escapeHtml(toHref("/space"))}" data-link data-route="/space">${renderWordmarkHTML(brand.appName, "md")}</a>
          </div>
          <div class="masthead-right"></div>
        </div>
      </header>

      <main style="max-width:34rem;margin:2rem auto;padding:0 1rem 6rem">
        <div id="single-card-wrap">
          ${renderLetterCardHTML(letter, { liked: storage.isLiked(letter.id), clamped: false, showSpaceBadge: true })}
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:0.75rem;justify-content:center;margin-top:1.5rem">
          <a href="${escapeHtml(toHref(`/write/${encodeURIComponent(letter.space)}`))}" data-link data-route="/write/${encodeURIComponent(letter.space)}" class="btn-primary" style="padding:0.75rem 1.3rem">
            Write in ${escapeHtml(letter.space)}
          </a>
          <a href="${escapeHtml(toHref(`/feed/${encodeURIComponent(letter.space)}`))}" data-link data-route="/feed/${encodeURIComponent(letter.space)}" class="btn-secondary" style="padding:0.75rem 1.3rem">
            View All in ${escapeHtml(letter.space)}
          </a>
        </div>
      </main>
    </div>
  `;

  bindWordmarkHover(appEl);
  paintStationeryCanvases(appEl);
  bindCardListEvents(document.getElementById("single-card-wrap"), [letter], () =>
    renderSingleLetterView(letterId, brand)
  );
}

function renderTermsView(brand) {
  appEl.innerHTML = `
    <div>
      <header class="masthead">
        <div class="masthead-inner">
          <div class="masthead-left">
            <a href="${escapeHtml(toHref("/space"))}" data-link data-route="/space" class="masthead-back">
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>
              <span>Spaces</span>
            </a>
          </div>
          <div class="masthead-center">
            <a href="${escapeHtml(toHref("/space"))}" data-link data-route="/space">${renderWordmarkHTML(brand.appName, "md")}</a>
          </div>
          <div class="masthead-right"></div>
        </div>
      </header>

      <main class="directory-main">
        <div class="directory-intro">
          <h1>Privacy & Guidelines</h1>
          <p>Built for quiet reflection, personal note-keeping, and respectful anonymous expression.</p>
        </div>
        <div style="line-height:1.75;font-size:0.95rem;display:flex;flex-direction:column;gap:1rem">
          <p><strong>1. Personal Spaces are Yours:</strong> Notes written in <em>My Personal Notes</em> or your custom private spaces stay on your device by default, and when Cloud Sync (Supabase Email OTP) is connected, are protected by Row-Level Security so only your verified account can read or edit them.</p>
          <p><strong>2. Zero-Profile Public Feeds:</strong> Letters posted to Global or Campus spaces never display usernames or email addresses.</p>
          <p><strong>3. Be Kind & Respectful:</strong> Do not post harassment, private personal data (doxxing), or threats in shared spaces.</p>
        </div>
      </main>
    </div>
  `;
  bindWordmarkHover(appEl);
}

// ============================================================================
// Modals: 3D Paper Unfold, Create Space, Campus OTP, Cloud Sync & Branding
// ============================================================================
function openLetterUnfoldModal(letter, onChanged) {
  const canManage = storage.canManageLetter(letter);
  const shareUrl = `${window.location.origin}${toHref(`/letter/${encodeURIComponent(letter.id)}`)}`;

  modalRoot.innerHTML = `
    <div class="modal-backdrop" id="unfold-backdrop">
      <div class="modal-paper-wrap" onclick="event.stopPropagation()">
        <div id="unfold-card-mount">
          ${renderLetterCardHTML(letter, { liked: storage.isLiked(letter.id), clamped: false, showSpaceBadge: true })}
        </div>

        <div style="margin-top:0.85rem;background:var(--sheet);border:2px solid var(--ink-charcoal);border-radius:1.1rem;padding:0.75rem 1rem;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:0.5rem">
          <span style="font-size:11.5px;color:var(--text-gray)">${escapeHtml(formatFullDate(letter.created_at))}</span>
          <div style="display:flex;flex-wrap:wrap;gap:0.45rem">
            ${
              canManage
                ? `<button id="modal-edit-btn" type="button" class="btn-secondary" style="padding:0.4rem 0.75rem;font-size:12px">Edit</button>
                   <button id="modal-pin-btn" type="button" class="btn-secondary" style="padding:0.4rem 0.75rem;font-size:12px">${isSpotlightActive(letter) ? "Unpin" : "★ Pin"}</button>
                   <button id="modal-del-btn" type="button" class="btn-danger" style="padding:0.4rem 0.75rem;font-size:12px">Delete</button>`
                : `<button id="modal-report-btn" type="button" class="btn-danger" style="padding:0.4rem 0.75rem;font-size:12px">Report</button>`
            }
            <button id="modal-copy-btn" type="button" class="btn-secondary" style="padding:0.4rem 0.75rem;font-size:12px">Copy Text</button>
            <button id="modal-close-btn" type="button" class="btn-primary" style="padding:0.4rem 0.85rem;font-size:12px">Close</button>
          </div>
        </div>
      </div>
    </div>
  `;

  paintStationeryCanvases(modalRoot);

  const cardEl = modalRoot.querySelector(".paper-card-interactive");
  if (cardEl) cardEl.classList.remove("paper-card-interactive");

  modalRoot.querySelector("[data-like-id]")?.addEventListener("click", async (e) => {
    e.stopPropagation();
    const res = await storage.toggleLike(letter.id);
    letter.hearts_count = res.hearts_count;
    onChanged?.();
    openLetterUnfoldModal(letter, onChanged);
  });

  document.getElementById("unfold-backdrop")?.addEventListener("click", closeModal);
  document.getElementById("modal-close-btn")?.addEventListener("click", closeModal);

  document.getElementById("modal-copy-btn")?.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(`To: ${letter.recipient}\n\n${letter.message}`);
      showToast("Copied note text to clipboard!");
    } catch {
      showToast(shareUrl);
    }
  });

  document.getElementById("modal-edit-btn")?.addEventListener("click", () => {
    closeModal();
    navigate(`/write/${encodeURIComponent(letter.space)}?edit=${encodeURIComponent(letter.id)}`);
  });

  document.getElementById("modal-pin-btn")?.addEventListener("click", async () => {
    const nextPin = !isSpotlightActive(letter);
    const updated = await storage.updateLetter(letter.id, { spotlight: nextPin });
    showToast(nextPin ? "Pinned to top!" : "Unpinned note");
    onChanged?.();
    if (updated) openLetterUnfoldModal(updated, onChanged);
    else closeModal();
  });

  document.getElementById("modal-del-btn")?.addEventListener("click", async () => {
    if (!confirm("Delete this note permanently?")) return;
    await storage.deleteLetter(letter.id);
    closeModal();
    showToast("Note deleted.");
    onChanged?.();
  });

  document.getElementById("modal-report-btn")?.addEventListener("click", async () => {
    await storage.reportLetter(letter.id);
    closeModal();
    showToast("Reported letter. Thank you for keeping the space safe.");
    onChanged?.();
  });
}

function openCreateSpaceModal() {
  const emojis = ["📝", "📓", "💡", "⏳", "🌙", "🎯", "💌", "🌿"];
  let chosenEmoji = "📝";

  modalRoot.innerHTML = `
    <div class="modal-backdrop" id="create-space-backdrop">
      <div class="modal-sheet" onclick="event.stopPropagation()">
        <h3>Create a Note Space</h3>
        <p style="font-size:0.86rem;color:var(--text-gray);margin:0">
          Organize your personal notes by mood, project, or recipient.
        </p>

        <div class="form-field">
          <label>Choose an Icon</label>
          <div style="display:flex;gap:6px;flex-wrap:wrap" id="emoji-picker-row">
            ${emojis
              .map(
                (em, idx) =>
                  `<button type="button" data-emoji="${em}" class="btn-secondary" style="padding:0.4rem 0.65rem;font-size:1.1rem;${idx === 0 ? "border-color:var(--cobalt);background:rgba(36,69,255,0.1)" : ""}">${em}</button>`
              )
              .join("")}
          </div>
        </div>

        <div class="form-field">
          <label for="new-space-name">Space Name</label>
          <input id="new-space-name" type="text" maxlength="32" placeholder="e.g. Daily Journal, Book Notes, Work…" class="form-input" />
        </div>

        <div class="btn-row">
          <button id="cancel-space-btn" type="button" class="btn-secondary">Cancel</button>
          <button id="save-space-btn" type="button" class="btn-primary">Create Space</button>
        </div>
      </div>
    </div>
  `;

  modalRoot.querySelectorAll("[data-emoji]").forEach((btn) => {
    btn.addEventListener("click", () => {
      chosenEmoji = btn.getAttribute("data-emoji");
      modalRoot.querySelectorAll("[data-emoji]").forEach((b) => {
        const active = b.getAttribute("data-emoji") === chosenEmoji;
        b.style.borderColor = active ? "var(--cobalt)" : "";
        b.style.background = active ? "rgba(36,69,255,0.1)" : "";
      });
    });
  });

  document.getElementById("create-space-backdrop")?.addEventListener("click", closeModal);
  document.getElementById("cancel-space-btn")?.addEventListener("click", closeModal);
  document.getElementById("new-space-name")?.focus();

  document.getElementById("save-space-btn")?.addEventListener("click", async () => {
    try {
      const name = document.getElementById("new-space-name")?.value || "";
      const created = await storage.createCustomSpace({ name, emoji: chosenEmoji, isPrivate: true });
      closeModal();
      showToast(`Created space "${created.emoji} ${created.name}"`);
      navigate(`/feed/${encodeURIComponent(created.slug)}`);
    } catch (err) {
      showToast(err.message);
    }
  });
}

function openCampusOtpModal(domain, campusName) {
  let step = "email";
  let targetEmail = "";

  const renderStep = (demoHint = "") => {
    modalRoot.innerHTML = `
      <div class="modal-backdrop" id="otp-backdrop">
        <div class="modal-sheet" onclick="event.stopPropagation()">
          <span class="welcome-eyebrow">Zero-Profile Campus Verification</span>
          <h3 style="margin-top:4px">${escapeHtml(campusName)}</h3>
          <p style="font-size:0.85rem;color:var(--text-gray);margin:0">
            ${
              step === "email"
                ? `Enter your @${escapeHtml(domain)} email to receive a 6-digit verification code. Your email is never shown on posts.`
                : `Enter the 6-digit code sent to ${escapeHtml(targetEmail)}.`
            }
          </p>
          ${
            demoHint
              ? `<div style="margin-top:0.75rem;padding:0.6rem 0.8rem;border-radius:0.75rem;background:rgba(16,185,129,0.14);font-size:12.5px;font-weight:700">
                  Local Preview Code: <span style="letter-spacing:0.12em;color:var(--cobalt)">${escapeHtml(demoHint)}</span>
                </div>`
              : ""
          }

          ${
            step === "email"
              ? `<div class="form-field">
                  <label for="campus-email-input">Academic Email</label>
                  <input id="campus-email-input" type="email" inputmode="email" placeholder="you@${escapeHtml(domain)}" class="form-input" value="${escapeHtml(targetEmail)}" />
                </div>`
              : `<div class="form-field">
                  <label for="campus-otp-input">6-Digit Verification Code</label>
                  <input id="campus-otp-input" type="text" inputmode="numeric" maxlength="6" placeholder="123456" class="form-input" style="letter-spacing:0.25em;font-size:1.15rem;font-weight:700;text-align:center" />
                </div>`
          }

          <div class="btn-row">
            <button id="otp-cancel-btn" type="button" class="btn-secondary">Cancel</button>
            <button id="otp-submit-btn" type="button" class="btn-primary">
              ${step === "email" ? "Send 6-Digit Code" : "Verify & Open Space"}
            </button>
          </div>
        </div>
      </div>
    `;

    document.getElementById("otp-backdrop")?.addEventListener("click", closeModal);
    document.getElementById("otp-cancel-btn")?.addEventListener("click", closeModal);

    document.getElementById("otp-submit-btn")?.addEventListener("click", async () => {
      try {
        if (step === "email") {
          targetEmail = document.getElementById("campus-email-input")?.value || "";
          const res = await storage.requestEmailOtp(targetEmail, { requireAcademicDomain: domain });
          step = "code";
          renderStep(res.demoCode || "");
        } else {
          const code = document.getElementById("campus-otp-input")?.value || "";
          await storage.verifyEmailOtp(targetEmail, code, { unlockCampusDomain: domain });
          closeModal();
          showToast(`Verified @${domain}! Welcome in.`);
          navigate(`/feed/${encodeURIComponent(domain)}`);
        }
      } catch (err) {
        showToast(err.message);
      }
    });
  };

  renderStep();
}

function openMobileInstallGuideModal() {
  modalRoot.innerHTML = `
    <div class="modal-backdrop" id="pwa-guide-backdrop">
      <div class="modal-sheet" onclick="event.stopPropagation()">
        <h3>Use on Your Cellphone</h3>
        <p style="font-size:0.88rem;color:var(--text-gray);line-height:1.6">
          Once pushed to <strong>GitHub Pages</strong>, open your GitHub Pages link on your phone to save & read notes anytime:
        </p>
        <ul style="font-size:0.86rem;line-height:1.7;padding-left:1.2rem;margin:0.5rem 0 1rem">
          <li><strong>iPhone (Safari):</strong> Tap the <strong>Share</strong> icon at the bottom → tap <strong>Add to Home Screen</strong>.</li>
          <li><strong>Android (Chrome):</strong> Tap the <strong>⋮ Menu</strong> → tap <strong>Add to Home screen / Install app</strong>.</li>
          <li><strong>Cross-Device Sync:</strong> Tap the cloud icon in the bottom-left corner to connect free Supabase Cloud Sync or export/import backups!</li>
        </ul>
        <div class="btn-row">
          <button id="open-sync-from-guide" type="button" class="btn-secondary">Cloud Sync Settings</button>
          <button id="close-guide-btn" type="button" class="btn-primary">Got it</button>
        </div>
      </div>
    </div>
  `;
  document.getElementById("pwa-guide-backdrop")?.addEventListener("click", closeModal);
  document.getElementById("close-guide-btn")?.addEventListener("click", closeModal);
  document.getElementById("open-sync-from-guide")?.addEventListener("click", () => {
    closeModal();
    openSettingsModal();
  });
}

function triggerBackupDownload() {
  const json = storage.exportBackupJSON();
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `selfnote-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast("Downloaded JSON notes backup!");
}

function openSettingsModal() {
  const cfg = storage.getBrandConfig();
  let otpSentTo = "";

  const renderModal = () => {
    const signedInUser = storage.user;
    modalRoot.innerHTML = `
      <div class="modal-backdrop" id="settings-backdrop">
        <div class="modal-sheet" onclick="event.stopPropagation()">
          <h3>Cloud Sync, Backup & Branding</h3>
          <p style="font-size:0.84rem;color:var(--text-gray);margin:0 0 0.75rem">
            Sync notes between your cellphone and computer, back up to JSON, or customize your brand name.
          </p>

          <!-- 1. Quick Backup Export/Import -->
          <div style="padding:0.85rem;border-radius:1rem;background:rgba(36,69,255,0.07);border:1px solid var(--rule)">
            <div style="font-size:11.5px;font-weight:800;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:0.45rem">
              Instant JSON Backup (Offline Phone ↔ PC)
            </div>
            <div style="display:flex;gap:0.5rem;flex-wrap:wrap">
              <button id="settings-export-btn" type="button" class="btn-secondary" style="font-size:12px;padding:0.45rem 0.8rem">Download Backup (.json)</button>
              <label class="btn-secondary" style="font-size:12px;padding:0.45rem 0.8rem;display:inline-block">
                Restore Backup (.json)
                <input id="settings-import-input" type="file" accept="application/json,.json" style="display:none" />
              </label>
            </div>
          </div>

          <!-- 2. Custom Branding -->
          <div class="form-field">
            <label for="cfg-app-name">Custom Brand Name</label>
            <input id="cfg-app-name" type="text" maxlength="24" class="form-input" value="${escapeHtml(cfg.appName)}" placeholder="SelfNote." />
          </div>
          <div class="form-field">
            <label for="cfg-subtitle">Space Hub Subtitle</label>
            <input id="cfg-subtitle" type="text" maxlength="80" class="form-input" value="${escapeHtml(cfg.subtitle)}" />
          </div>
          <div class="form-field">
            <label for="cfg-hashtag">Paper Card Signature / Hashtag</label>
            <input id="cfg-hashtag" type="text" maxlength="24" class="form-input" value="${escapeHtml(cfg.hashtag)}" placeholder="#selfnote" />
          </div>

          <!-- 3. Supabase Cloud Sync & Email OTP -->
          <hr style="border:none;border-top:1px solid var(--rule);margin:1.1rem 0" />
          <div style="font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:0.06em">
            Supabase Cloud Sync + Email OTP (Optional)
          </div>
          <p style="font-size:12px;color:var(--text-gray);margin:4px 0 8px">
            Paste your free Supabase Project URL & Publishable Anon Key (run <code>supabase/schema.sql</code> once) to sync across phone & PC automatically.
          </p>

          <div class="form-field" style="margin-top:0.5rem">
            <label for="cfg-supa-url">Supabase Project URL</label>
            <input id="cfg-supa-url" type="url" class="form-input" placeholder="https://xxxx.supabase.co" value="${escapeHtml(cfg.supabaseUrl)}" />
          </div>
          <div class="form-field">
            <label for="cfg-supa-key">Supabase Anon Public Key</label>
            <input id="cfg-supa-key" type="text" class="form-input" placeholder="eyJhbGciOi..." value="${escapeHtml(cfg.supabaseAnonKey)}" />
          </div>

          ${
            signedInUser
              ? `<div style="margin-top:0.85rem;padding:0.7rem;border-radius:0.8rem;background:rgba(16,185,129,0.14);display:flex;align-items:center;justify-content:space-between;gap:8px">
                  <span style="font-size:12.5px;font-weight:700">✓ Syncing as ${escapeHtml(signedInUser.email)}</span>
                  <button id="cloud-signout-btn" type="button" class="btn-danger" style="padding:0.35rem 0.65rem;font-size:11.5px">Sign Out</button>
                </div>`
              : storage.isCloudConfigured()
              ? `<div style="margin-top:0.85rem;padding:0.8rem;border-radius:0.8rem;border:1px solid var(--rule)">
                  <label style="display:block;font-size:11px;font-weight:700;text-transform:uppercase;margin-bottom:6px">
                    Sign in via Email OTP to Sync Private Notes
                  </label>
                  ${
                    !otpSentTo
                      ? `<div style="display:flex;gap:6px">
                          <input id="cloud-login-email" type="email" placeholder="your@email.com" class="form-input" />
                          <button id="cloud-send-otp-btn" type="button" class="btn-primary" style="white-space:nowrap">Send OTP</button>
                        </div>`
                      : `<div style="display:flex;gap:6px">
                          <input id="cloud-verify-code" type="text" inputmode="numeric" maxlength="6" placeholder="6-digit code" class="form-input" />
                          <button id="cloud-verify-otp-btn" type="button" class="btn-primary" style="white-space:nowrap">Verify</button>
                        </div>`
                  }
                </div>`
              : ""
          }

          <div class="btn-row">
            <button id="settings-cancel-btn" type="button" class="btn-secondary">Close</button>
            <button id="settings-save-btn" type="button" class="btn-primary">Save Settings</button>
          </div>
        </div>
      </div>
    `;

    document.getElementById("settings-backdrop")?.addEventListener("click", closeModal);
    document.getElementById("settings-cancel-btn")?.addEventListener("click", closeModal);
    document.getElementById("settings-export-btn")?.addEventListener("click", triggerBackupDownload);

    document.getElementById("settings-import-input")?.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const count = storage.importBackupJSON(text);
        closeModal();
        showToast(`Restored ${count} notes from backup!`);
        renderRoute();
      } catch (err) {
        showToast(err.message || "Failed to import backup file.");
      }
    });

    document.getElementById("settings-save-btn")?.addEventListener("click", async () => {
      cfg.appName = document.getElementById("cfg-app-name")?.value.trim() || "SelfNote.";
      cfg.subtitle = document.getElementById("cfg-subtitle")?.value.trim() || "Where do you want to speak?";
      cfg.hashtag = document.getElementById("cfg-hashtag")?.value.trim() || "#selfnote";
      cfg.supabaseUrl = document.getElementById("cfg-supa-url")?.value.trim() || "";
      cfg.supabaseAnonKey = document.getElementById("cfg-supa-key")?.value.trim() || "";

      storage.saveBrandConfig(cfg);
      await storage.initCloud();
      updateSyncStatusIndicator();
      showToast("Settings saved!");
      if (cfg.supabaseUrl && cfg.supabaseAnonKey && !storage.user) {
        renderModal();
      } else {
        closeModal();
        renderRoute();
      }
    });

    document.getElementById("cloud-send-otp-btn")?.addEventListener("click", async () => {
      try {
        const email = document.getElementById("cloud-login-email")?.value || "";
        await storage.requestEmailOtp(email);
        otpSentTo = email.trim();
        showToast(`Sent 6-digit login code to ${otpSentTo}`);
        renderModal();
      } catch (err) {
        showToast(err.message);
      }
    });

    document.getElementById("cloud-verify-otp-btn")?.addEventListener("click", async () => {
      try {
        const code = document.getElementById("cloud-verify-code")?.value || "";
        await storage.verifyEmailOtp(otpSentTo, code);
        updateSyncStatusIndicator();
        closeModal();
        showToast("Cloud Sync active! Your notes now sync across devices.");
        renderRoute();
      } catch (err) {
        showToast(err.message);
      }
    });

    document.getElementById("cloud-signout-btn")?.addEventListener("click", async () => {
      await storage.signOutCloud();
      updateSyncStatusIndicator();
      showToast("Signed out of Cloud Sync.");
      renderModal();
    });
  };

  renderModal();
}

// ============================================================================
// Bootstrap App
// ============================================================================
(async function bootstrap() {
  updateThemeButtonIcon();

  document.getElementById("theme-toggle-btn")?.addEventListener("click", () => {
    setThemeMode(getActiveMode() === "dark" ? "light" : "dark");
  });

  document.getElementById("settings-open-btn")?.addEventListener("click", openSettingsModal);

  storage.onAuthChange(() => updateSyncStatusIndicator());
  await storage.initCloud();
  updateSyncStatusIndicator();

  await renderRoute();

  // Register Service Worker on HTTPS (GitHub Pages) for mobile PWA offline support
  if (
    "serviceWorker" in navigator &&
    window.location.protocol === "https:" &&
    window.location.hostname !== "localhost"
  ) {
    navigator.serviceWorker.register(`${APP_BASE}/sw.js`).catch(() => {});
  }
})();
