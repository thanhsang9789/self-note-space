import {
  CONSUMER_EMAIL_DOMAINS,
  DEFAULT_BRAND,
  DEFAULT_CUSTOM_SPACES,
  POPULAR_CAMPUSES,
  SEED_LETTERS
} from "./config.js";
import { isSpotlightActive } from "./paper.js";

const KEYS = {
  BRAND: "selfnote_brand_v1",
  LETTERS: "selfnote_letters_v1",
  SPACES: "selfnote_custom_spaces_v1",
  LIKES: "selfnote_liked_ids_v1",
  OUTBOX: "selfnote_outbox_v1",
  VERIFIED_CAMPUSES: "selfnote_verified_campuses_v1",
  UNVISITED_OUTBOX: "unsaid_has_unvisited_outbox",
  ONBOARDED: "onboarding_complete",
  DEMO_OTP: "selfnote_pending_otp_v1"
};

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.warn("Storage write failed:", err);
  }
}

class StorageEngine {
  constructor() {
    this.supabase = null;
    this.user = null;
    this.authListeners = new Set();
    this._ensureSeeded();
  }

  _ensureSeeded() {
    if (!localStorage.getItem(KEYS.LETTERS)) {
      writeJson(KEYS.LETTERS, SEED_LETTERS);
    }
    if (!localStorage.getItem(KEYS.SPACES)) {
      writeJson(KEYS.SPACES, DEFAULT_CUSTOM_SPACES);
    }
  }

  getBrandConfig() {
    const saved = readJson(KEYS.BRAND, {});
    return { ...DEFAULT_BRAND, ...saved };
  }

  saveBrandConfig(partial) {
    const merged = { ...this.getBrandConfig(), ...partial };
    writeJson(KEYS.BRAND, merged);
    return merged;
  }

  isOnboarded() {
    return localStorage.getItem(KEYS.ONBOARDED) === "true";
  }

  markOnboarded() {
    try {
      localStorage.setItem(KEYS.ONBOARDED, "true");
    } catch {}
  }

  hasUnvisitedOutbox() {
    return localStorage.getItem(KEYS.UNVISITED_OUTBOX) === "true";
  }

  clearUnvisitedOutbox() {
    try {
      localStorage.removeItem(KEYS.UNVISITED_OUTBOX);
    } catch {}
  }

  // ==========================================================================
  // Supabase Cloud Connection & Real Email OTP Auth
  // ==========================================================================
  isCloudConfigured() {
    const cfg = this.getBrandConfig();
    return Boolean(cfg.supabaseUrl?.trim() && cfg.supabaseAnonKey?.trim());
  }

  isCloudAuthenticated() {
    return Boolean(this.supabase && this.user);
  }

  onAuthChange(fn) {
    this.authListeners.add(fn);
    return () => this.authListeners.delete(fn);
  }

  _emitAuth() {
    for (const fn of this.authListeners) {
      try {
        fn({ configured: this.isCloudConfigured(), user: this.user });
      } catch {}
    }
  }

  async initCloud() {
    const cfg = this.getBrandConfig();
    if (!cfg.supabaseUrl?.trim() || !cfg.supabaseAnonKey?.trim()) {
      this.supabase = null;
      this.user = null;
      this._emitAuth();
      return false;
    }

    try {
      const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.49.1");
      this.supabase = createClient(cfg.supabaseUrl.trim(), cfg.supabaseAnonKey.trim(), {
        auth: {
          persistSession: true,
          autoRefreshToken: true
        }
      });

      const { data } = await this.supabase.auth.getSession();
      this.user = data?.session?.user || null;

      this.supabase.auth.onAuthStateChange(async (_event, session) => {
        this.user = session?.user || null;
        if (this.user) {
          await this.syncLocalPrivateNotesToCloud();
        }
        this._emitAuth();
      });

      if (this.user) {
        await this.syncLocalPrivateNotesToCloud();
      }
      this._emitAuth();
      return true;
    } catch (err) {
      console.warn("Failed to initialize Supabase client:", err);
      this.supabase = null;
      this.user = null;
      this._emitAuth();
      return false;
    }
  }

  async requestEmailOtp(email, { requireAcademicDomain = null } = {}) {
    const cleanEmail = String(email || "").trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes("@")) {
      throw new Error("Please enter a valid email address.");
    }
    const domain = cleanEmail.split("@")[1];
    if (requireAcademicDomain) {
      if (CONSUMER_EMAIL_DOMAINS.includes(domain)) {
        throw new Error(`Please use your academic campus email (@${requireAcademicDomain}), not @${domain}.`);
      }
      if (domain !== requireAcademicDomain && !domain.endsWith("." + requireAcademicDomain)) {
        throw new Error(`Email must match @${requireAcademicDomain}.`);
      }
    }

    if (this.supabase) {
      const { error } = await this.supabase.auth.signInWithOtp({
        email: cleanEmail,
        options: { shouldCreateUser: true }
      });
      if (error) throw new Error(error.message);
      return { mode: "supabase", email: cleanEmail };
    }

    // Local demo fallback when Supabase keys haven't been added yet
    const code = String(Math.floor(100000 + Math.random() * 900000));
    writeJson(KEYS.DEMO_OTP, {
      email: cleanEmail,
      domain,
      code,
      expiresAt: Date.now() + 10 * 60 * 1000
    });
    return { mode: "local-demo", email: cleanEmail, demoCode: code };
  }

  async verifyEmailOtp(email, token, { unlockCampusDomain = null } = {}) {
    const cleanEmail = String(email || "").trim().toLowerCase();
    const cleanCode = String(token || "").trim();
    if (!cleanCode) throw new Error("Please enter the 6-digit verification code.");

    if (this.supabase) {
      const { data, error } = await this.supabase.auth.verifyOtp({
        email: cleanEmail,
        token: cleanCode,
        type: "email"
      });
      if (error) throw new Error(error.message);
      this.user = data?.user || data?.session?.user || null;
      if (unlockCampusDomain) {
        this.addVerifiedCampus(unlockCampusDomain);
      }
      if (this.user) {
        await this.syncLocalPrivateNotesToCloud();
      }
      this._emitAuth();
      return { verified: true, mode: "supabase", user: this.user };
    }

    const pending = readJson(KEYS.DEMO_OTP, null);
    if (!pending || pending.email !== cleanEmail) {
      throw new Error("No active verification request found. Please request a new code.");
    }
    if (Date.now() > pending.expiresAt) {
      throw new Error("Verification code expired. Please request a new one.");
    }
    if (pending.code !== cleanCode) {
      throw new Error("Invalid 6-digit code. Please double-check and try again.");
    }

    localStorage.removeItem(KEYS.DEMO_OTP);
    if (unlockCampusDomain) {
      this.addVerifiedCampus(unlockCampusDomain);
    }
    return { verified: true, mode: "local-demo" };
  }

  async signOutCloud() {
    if (this.supabase) {
      await this.supabase.auth.signOut();
    }
    this.user = null;
    this._emitAuth();
  }

  // ==========================================================================
  // Custom Note Spaces & Verified Campuses
  // ==========================================================================
  getCustomSpaces() {
    return readJson(KEYS.SPACES, DEFAULT_CUSTOM_SPACES);
  }

  isPrivateSpace(spaceSlug) {
    const spaces = this.getCustomSpaces();
    const match = spaces.find((s) => s.slug.toLowerCase() === String(spaceSlug || "").toLowerCase());
    if (match) return Boolean(match.is_private);
    return String(spaceSlug || "") === "Personal";
  }

  async fetchCustomSpaces() {
    const localSpaces = this.getCustomSpaces();
    if (this.supabase && this.user) {
      try {
        const { data, error } = await this.supabase
          .from("custom_spaces")
          .select("slug, name, emoji, is_private")
          .eq("owner_id", this.user.id)
          .order("created_at", { ascending: true });

        if (!error && Array.isArray(data) && data.length > 0) {
          const map = new Map();
          [...localSpaces, ...data].forEach((s) => map.set(s.slug, s));
          const merged = Array.from(map.values());
          writeJson(KEYS.SPACES, merged);
          return merged;
        }
      } catch (err) {
        console.warn("Cloud custom spaces fetch fallback:", err);
      }
    }
    return localSpaces;
  }

  async createCustomSpace({ name, emoji = "📝", isPrivate = true }) {
    const cleanName = String(name || "").trim();
    if (!cleanName) throw new Error("Please enter a space name.");
    const slug = cleanName
      .replace(/[^a-zA-Z0-9\s_-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 32) || `Space-${Date.now()}`;

    const entry = {
      slug,
      name: cleanName.slice(0, 36),
      emoji: (emoji || "📝").trim().slice(0, 4),
      is_private: Boolean(isPrivate)
    };

    const existing = this.getCustomSpaces().filter((s) => s.slug.toLowerCase() !== slug.toLowerCase());
    const next = [...existing, entry];
    writeJson(KEYS.SPACES, next);

    if (this.supabase && this.user) {
      try {
        await this.supabase.from("custom_spaces").upsert(
          {
            owner_id: this.user.id,
            slug: entry.slug,
            name: entry.name,
            emoji: entry.emoji,
            is_private: entry.is_private
          },
          { onConflict: "owner_id,slug" }
        );
      } catch (err) {
        console.warn("Cloud space upsert skipped:", err);
      }
    }

    return entry;
  }

  async deleteCustomSpace(slug) {
    if (slug === "Personal") throw new Error("Personal Notes is your primary space and cannot be deleted.");
    const next = this.getCustomSpaces().filter((s) => s.slug !== slug);
    writeJson(KEYS.SPACES, next);
    if (this.supabase && this.user) {
      try {
        await this.supabase.from("custom_spaces").delete().eq("owner_id", this.user.id).eq("slug", slug);
      } catch {}
    }
  }

  getVerifiedCampuses() {
    return readJson(KEYS.VERIFIED_CAMPUSES, []);
  }

  isCampusSpace(space) {
    if (!space || space === "Global") return false;
    if (this.isPrivateSpace(space)) return false;
    return space.includes(".");
  }

  isCampusVerified(domain) {
    const list = this.getVerifiedCampuses();
    return list.includes(String(domain || "").toLowerCase());
  }

  addVerifiedCampus(domain) {
    const clean = String(domain || "").toLowerCase().trim();
    if (!clean) return;
    const list = this.getVerifiedCampuses().filter((d) => d !== clean);
    writeJson(KEYS.VERIFIED_CAMPUSES, [clean, ...list].slice(0, 15));
  }

  searchCampuses(query = "") {
    const q = String(query || "").trim().toLowerCase();
    const localLetters = readJson(KEYS.LETTERS, SEED_LETTERS);
    const counts = new Map();
    for (const l of localLetters) {
      if (l.space && l.space.includes(".")) {
        counts.set(l.space.toLowerCase(), (counts.get(l.space.toLowerCase()) || 0) + 1);
      }
    }

    const list = POPULAR_CAMPUSES.map((c) => ({
      domain: c.domain,
      name: c.name,
      letterCount: c.baseCount + (counts.get(c.domain) || 0)
    }));

    // Include any custom verified campus domains
    for (const dom of this.getVerifiedCampuses()) {
      if (!list.some((c) => c.domain === dom)) {
        list.unshift({
          domain: dom,
          name: dom.toUpperCase(),
          letterCount: counts.get(dom) || 0
        });
      }
    }

    if (!q) return list;
    return list.filter(
      (c) => c.name.toLowerCase().includes(q) || c.domain.toLowerCase().includes(q)
    );
  }

  // ==========================================================================
  // Letters & Personal Notes CRUD + Sync
  // ==========================================================================
  getLikedIds() {
    return new Set(readJson(KEYS.LIKES, []));
  }

  isLiked(id) {
    return this.getLikedIds().has(String(id));
  }

  getOutboxIds() {
    return new Set(readJson(KEYS.OUTBOX, ["1001", "1002"]));
  }

  canManageLetter(letter) {
    if (!letter) return false;
    if (letter.is_private) return true;
    return this.getOutboxIds().has(String(letter.id));
  }

  async syncLocalPrivateNotesToCloud() {
    if (!this.supabase || !this.user) return;
    const local = readJson(KEYS.LETTERS, []);
    const unsynced = local.filter(
      (l) => l.is_private && !String(l.client_id || "").startsWith("seed-") && !l._synced
    );

    for (const note of unsynced) {
      try {
        const payload = {
          client_id: note.client_id || `local-${note.id}`,
          owner_id: this.user.id,
          is_private: true,
          recipient: note.recipient,
          message: note.message,
          space: note.space,
          color_hex: note.color_hex,
          template_id: note.template_id || null,
          hearts_count: note.hearts_count || 0,
          spotlight_expires_at: note.spotlight_expires_at || null,
          created_at: note.created_at
        };
        const { error } = await this.supabase
          .from("letters")
          .upsert(payload, { onConflict: "client_id" });
        if (!error) {
          note._synced = true;
        }
      } catch {}
    }
    writeJson(KEYS.LETTERS, local);
  }

  async listLetters({ space = "Global", sort = "new", timeframe = "all", query = "" } = {}) {
    const isPriv = this.isPrivateSpace(space);
    let items = [];

    if (this.supabase && (!isPriv || this.user)) {
      try {
        let req = this.supabase
          .from("letters")
          .select("*")
          .eq("space", space)
          .eq("is_hidden", false);

        if (isPriv && this.user) {
          req = req.eq("owner_id", this.user.id).eq("is_private", true);
        } else {
          req = req.eq("is_private", false);
        }

        const { data, error } = await req.order("created_at", { ascending: false }).limit(200);
        if (!error && Array.isArray(data)) {
          items = data;
          // Cache private notes locally for instant mobile offline access
          if (isPriv) {
            const others = readJson(KEYS.LETTERS, []).filter((l) => l.space !== space);
            writeJson(KEYS.LETTERS, [...data.map((d) => ({ ...d, _synced: true })), ...others]);
          }
        } else {
          items = this._readLocalSpace(space);
        }
      } catch {
        items = this._readLocalSpace(space);
      }
    } else {
      items = this._readLocalSpace(space);
    }

    return this._filterAndSort(items, { sort, timeframe, query });
  }

  _readLocalSpace(space) {
    const all = readJson(KEYS.LETTERS, SEED_LETTERS);
    return all.filter(
      (l) => !l.is_hidden && String(l.space).toLowerCase() === String(space).toLowerCase()
    );
  }

  _filterAndSort(items, { sort = "new", timeframe = "all", query = "" }) {
    const q = String(query || "").trim().toLowerCase();
    const now = Date.now();
    const tfMs = {
      "24h": 24 * 3600 * 1000,
      "7d": 7 * 24 * 3600 * 1000,
      "30d": 30 * 24 * 3600 * 1000
    }[timeframe];

    let filtered = items.filter((item) => {
      if (sort === "top" && tfMs) {
        const age = now - new Date(item.created_at).getTime();
        if (age > tfMs) return false;
      }
      if (q) {
        const hay = `${item.recipient || ""} ${item.message || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    filtered.sort((a, b) => {
      const spotA = isSpotlightActive(a) ? 1 : 0;
      const spotB = isSpotlightActive(b) ? 1 : 0;
      if (spotA !== spotB) return spotB - spotA;

      if (sort === "top") {
        const diff = (b.hearts_count || 0) - (a.hearts_count || 0);
        if (diff !== 0) return diff;
      }
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    return filtered;
  }

  async getLetterById(id) {
    const local = readJson(KEYS.LETTERS, SEED_LETTERS);
    const foundLocal = local.find((l) => String(l.id) === String(id));

    if (this.supabase) {
      try {
        const { data, error } = await this.supabase
          .from("letters")
          .select("*")
          .eq("id", id)
          .maybeSingle();
        if (!error && data) return data;
      } catch {}
    }

    return foundLocal || null;
  }

  async getOutboxLetters() {
    const local = readJson(KEYS.LETTERS, SEED_LETTERS);
    const outboxIds = this.getOutboxIds();
    const localMatches = local.filter((l) => l.is_private || outboxIds.has(String(l.id)));

    if (this.supabase && this.user) {
      try {
        const { data, error } = await this.supabase
          .from("letters")
          .select("*")
          .eq("owner_id", this.user.id)
          .order("created_at", { ascending: false });

        if (!error && Array.isArray(data)) {
          const map = new Map();
          [...localMatches, ...data].forEach((item) => map.set(String(item.client_id || item.id), item));
          return Array.from(map.values()).sort(
            (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          );
        }
      } catch {}
    }

    return localMatches.sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }

  async createLetter({
    recipient,
    message,
    space = "Personal",
    colorHex = "#ffe082",
    templateId = null,
    spotlight = false,
    notifyEmail = ""
  }) {
    const isPriv = this.isPrivateSpace(space);
    const maxMessageLen = isPriv ? 2000 : 500;
    const cleanRecipient = String(recipient || "").trim().slice(0, 60);
    const cleanMessage = String(message || "").trim().slice(0, maxMessageLen);

    if (!cleanRecipient) throw new Error("Please enter who this note or letter is addressed to.");
    if (cleanMessage.length < 2) throw new Error("Please write at least a couple of characters.");

    const nowIso = new Date().toISOString();
    const spotlightIso = spotlight
      ? new Date(Date.now() + 24 * 3600 * 1000).toISOString()
      : null;
    const clientId = `note-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    let savedRecord = {
      id: Date.now(),
      client_id: clientId,
      is_private: isPriv,
      recipient: cleanRecipient,
      message: cleanMessage,
      space,
      color_hex: colorHex,
      template_id: templateId || null,
      hearts_count: 0,
      reports: 0,
      is_hidden: false,
      spotlight_expires_at: spotlightIso,
      created_at: nowIso,
      _synced: false
    };

    if (this.supabase && (!isPriv || this.user)) {
      try {
        const insertPayload = {
          client_id: clientId,
          owner_id: isPriv && this.user ? this.user.id : null,
          is_private: isPriv,
          recipient: cleanRecipient,
          message: cleanMessage,
          space,
          color_hex: colorHex,
          template_id: templateId || null,
          spotlight_expires_at: spotlightIso
        };
        const { data, error } = await this.supabase
          .from("letters")
          .insert(insertPayload)
          .select("*")
          .single();
        if (!error && data) {
          savedRecord = { ...data, _synced: true };
        }
      } catch (err) {
        console.warn("Saved locally (cloud offline):", err);
      }
    }

    const all = readJson(KEYS.LETTERS, SEED_LETTERS);
    writeJson(KEYS.LETTERS, [savedRecord, ...all]);

    const outbox = Array.from(this.getOutboxIds());
    writeJson(KEYS.OUTBOX, [String(savedRecord.id), ...outbox].slice(0, 400));
    try {
      localStorage.setItem(KEYS.UNVISITED_OUTBOX, "true");
    } catch {}

    let notifyStatus = null;
    if (notifyEmail && notifyEmail.trim()) {
      notifyStatus = await this.sendSecretNotification({
        toEmail: notifyEmail.trim(),
        recipientName: cleanRecipient,
        letterId: savedRecord.id,
        space
      });
    }

    return { letter: savedRecord, notifyStatus };
  }

  async updateLetter(id, { recipient, message, colorHex, templateId, spotlight }) {
    const all = readJson(KEYS.LETTERS, SEED_LETTERS);
    const idx = all.findIndex((l) => String(l.id) === String(id));
    const spotlightIso = spotlight
      ? new Date(Date.now() + 24 * 3600 * 1000).toISOString()
      : null;

    let updated = null;
    if (idx !== -1) {
      updated = {
        ...all[idx],
        recipient: String(recipient ?? all[idx].recipient).trim().slice(0, 60),
        message: String(message ?? all[idx].message).trim().slice(0, 2000),
        color_hex: colorHex ?? all[idx].color_hex,
        template_id: templateId !== undefined ? templateId : all[idx].template_id,
        spotlight_expires_at: spotlight !== undefined ? spotlightIso : all[idx].spotlight_expires_at,
        updated_at: new Date().toISOString()
      };
      all[idx] = updated;
      writeJson(KEYS.LETTERS, all);
    }

    if (this.supabase && this.user) {
      try {
        const { data, error } = await this.supabase
          .from("letters")
          .update({
            recipient: updated?.recipient || recipient,
            message: updated?.message || message,
            color_hex: updated?.color_hex || colorHex,
            template_id: updated?.template_id ?? templateId,
            spotlight_expires_at: spotlight !== undefined ? spotlightIso : undefined,
            updated_at: new Date().toISOString()
          })
          .eq("id", id)
          .eq("owner_id", this.user.id)
          .select("*")
          .maybeSingle();
        if (!error && data) updated = data;
      } catch {}
    }

    return updated;
  }

  async deleteLetter(id) {
    const all = readJson(KEYS.LETTERS, SEED_LETTERS).filter((l) => String(l.id) !== String(id));
    writeJson(KEYS.LETTERS, all);

    const outbox = Array.from(this.getOutboxIds()).filter((oid) => oid !== String(id));
    writeJson(KEYS.OUTBOX, outbox);

    if (this.supabase && this.user) {
      try {
        await this.supabase.from("letters").delete().eq("id", id).eq("owner_id", this.user.id);
      } catch {}
    }
  }

  async toggleLike(id) {
    const likedSet = this.getLikedIds();
    const key = String(id);
    const nowLiked = !likedSet.has(key);
    const delta = nowLiked ? 1 : -1;

    if (nowLiked) likedSet.add(key);
    else likedSet.delete(key);
    writeJson(KEYS.LIKES, Array.from(likedSet));

    const all = readJson(KEYS.LETTERS, SEED_LETTERS);
    let nextCount = 0;
    const idx = all.findIndex((l) => String(l.id) === key);
    if (idx !== -1) {
      nextCount = Math.max(0, Number(all[idx].hearts_count || 0) + delta);
      all[idx].hearts_count = nextCount;
      writeJson(KEYS.LETTERS, all);
    }

    if (this.supabase) {
      try {
        const { data, error } = await this.supabase.rpc("toggle_letter_heart", {
          target_id: Number(id),
          delta
        });
        if (!error && typeof data === "number") {
          nextCount = data;
        }
      } catch {}
    }

    return { liked: nowLiked, hearts_count: nextCount };
  }

  async reportLetter(id) {
    const all = readJson(KEYS.LETTERS, SEED_LETTERS);
    const idx = all.findIndex((l) => String(l.id) === String(id));
    if (idx !== -1) {
      all[idx].reports = Number(all[idx].reports || 0) + 1;
      if (all[idx].reports >= 5) all[idx].is_hidden = true;
      writeJson(KEYS.LETTERS, all);
    }
    if (this.supabase) {
      try {
        await this.supabase.rpc("report_public_letter", { target_id: Number(id) });
      } catch {}
    }
  }

  async sendSecretNotification({ toEmail, recipientName, letterId, space }) {
    const cfg = this.getBrandConfig();
    const permalink = `${window.location.origin}${window.location.pathname.replace(/\/$/, "")}/letter/${letterId}`;

    if (cfg.emailJsServiceId && cfg.emailJsTemplateId && cfg.emailJsPublicKey) {
      try {
        const res = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            service_id: cfg.emailJsServiceId,
            template_id: cfg.emailJsTemplateId,
            user_id: cfg.emailJsPublicKey,
            template_params: {
              to_email: toEmail,
              recipient_name: recipientName,
              space_name: space,
              app_name: cfg.appName,
              letter_url: permalink
            }
          })
        });
        if (res.ok) return "sent";
      } catch {}
    }
    return "queued-preview";
  }

  // ==========================================================================
  // 1-Tap JSON Backup Export & Restore (for Mobile <-> Desktop Offline Transfer)
  // ==========================================================================
  exportBackupJSON() {
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      brand: this.getBrandConfig(),
      customSpaces: this.getCustomSpaces(),
      letters: readJson(KEYS.LETTERS, []),
      outbox: Array.from(this.getOutboxIds()),
      verifiedCampuses: this.getVerifiedCampuses()
    };
    return JSON.stringify(payload, null, 2);
  }

  importBackupJSON(jsonString) {
    const parsed = JSON.parse(jsonString);
    if (!parsed || !Array.isArray(parsed.letters)) {
      throw new Error("Invalid backup file format.");
    }
    if (Array.isArray(parsed.customSpaces)) {
      writeJson(KEYS.SPACES, parsed.customSpaces);
    }
    const existing = readJson(KEYS.LETTERS, []);
    const map = new Map();
    [...existing, ...parsed.letters].forEach((l) => {
      map.set(String(l.client_id || l.id), l);
    });
    writeJson(KEYS.LETTERS, Array.from(map.values()));
    if (Array.isArray(parsed.outbox)) {
      const mergedOutbox = Array.from(new Set([...this.getOutboxIds(), ...parsed.outbox.map(String)]));
      writeJson(KEYS.OUTBOX, mergedOutbox);
    }
    return parsed.letters.length;
  }
}

export const storage = new StorageEngine();
