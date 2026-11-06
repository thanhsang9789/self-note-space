// ============================================================================
// Brand Configuration, 36 Paper Swatches, Default Spaces & Seed Data
// ============================================================================

export const DEFAULT_BRAND = {
  appName: "SelfNote.",
  subtitle: "Where do you want to speak or store a thought?",
  hashtag: "#selfnote",
  instagramUrl: "",
  supabaseUrl: "",
  supabaseAnonKey: "",
  emailJsServiceId: "",
  emailJsTemplateId: "",
  emailJsPublicKey: ""
};

export const BRAND_HOVER_COLORS = [
  "#2445ff",
  "#ff611f",
  "#ec4899",
  "#10b981",
  "#f59e0b",
  "#8b5cf6",
  "#06b6d4"
];

// Exact 36 paper shades from unsaid.live
export const PAPER_SWATCHES = [
  "#ffffff", "#e0e0e0", "#d1d1d1", "#bcaaa4", "#795548", "#000000",
  "#fff9c4", "#fff59d", "#ffe082", "#fdd835", "#fbc02d", "#ffa726",
  "#f8bbd0", "#f48fb1", "#f06292", "#e57373", "#d32f2f", "#ad1457",
  "#e1bee7", "#ce93d8", "#b39ddb", "#9575cd", "#7e57c2", "#673ab7",
  "#bbdefb", "#90caf9", "#7986cb", "#5c6bc0", "#3f51b5", "#3949ab",
  "#cddc39", "#aed581", "#81c784", "#66bb6a", "#558b2f", "#2e7d32"
];

export const STATIONERY_TEMPLATES = [
  { id: null, label: "Plain", bg: "#ffe082", ink: "#1f2937" },
  { id: "love", label: "Love", bg: "#FFDAE8", ink: "#3C1023" },
  { id: "celebration", label: "Celebration", bg: "#E9FF92", ink: "#1F2452" }
];

export const CONSUMER_EMAIL_DOMAINS = [
  "gmail.com",
  "yahoo.com",
  "hotmail.com",
  "outlook.com",
  "live.com",
  "icloud.com",
  "aol.com",
  "proton.me",
  "protonmail.com"
];

export const DEFAULT_CUSTOM_SPACES = [
  { slug: "Personal", name: "Personal Notes", emoji: "📓", is_private: true },
  { slug: "Future-Self", name: "Future Self", emoji: "⏳", is_private: true },
  { slug: "Ideas", name: "Quick Ideas", emoji: "💡", is_private: true }
];

export const POPULAR_CAMPUSES = [
  { domain: "stanford.edu", name: "Stanford University", baseCount: 142 },
  { domain: "mit.edu", name: "Massachusetts Institute of Technology", baseCount: 118 },
  { domain: "berkeley.edu", name: "UC Berkeley", baseCount: 94 },
  { domain: "ox.ac.uk", name: "University of Oxford", baseCount: 76 },
  { domain: "iist.ac.in", name: "Indian Institute of Space Science and Technology", baseCount: 362 },
  { domain: "srmist.edu.in", name: "SRM Institute of Science and Technology", baseCount: 161 },
  { domain: "nus.edu.sg", name: "National University of Singapore", baseCount: 64 },
  { domain: "unimelb.edu.au", name: "University of Melbourne", baseCount: 51 }
];

const now = Date.now();

export const SEED_LETTERS = [
  {
    id: 1001,
    client_id: "seed-personal-1",
    is_private: true,
    recipient: "Myself",
    message: "Welcome to your personal paper space! Tap the feather button in the bottom-right corner on your phone or laptop anytime to jot down a note, reminder, or unsent thought.",
    space: "Personal",
    color_hex: "#fff9c4",
    template_id: null,
    hearts_count: 1,
    reports: 0,
    is_hidden: false,
    spotlight_expires_at: new Date(now + 24 * 3600 * 1000).toISOString(),
    created_at: new Date(now - 15 * 60 * 1000).toISOString()
  },
  {
    id: 1002,
    client_id: "seed-future-1",
    is_private: true,
    recipient: "Me, one year from today",
    message: "Keep building quiet things that matter to you. Small daily consistency always beats bursts of pressure.",
    space: "Future-Self",
    color_hex: "#bbdefb",
    template_id: "celebration",
    hearts_count: 2,
    reports: 0,
    is_hidden: false,
    spotlight_expires_at: null,
    created_at: new Date(now - 3 * 3600 * 1000).toISOString()
  },
  {
    id: 1003,
    client_id: "seed-global-1",
    is_private: false,
    recipient: "J.",
    message: "Please take care of yourself and don't forget to rest between late nights. Even when we don't talk every day, I'm still rooting for you from afar.",
    space: "Global",
    color_hex: "#ffe082",
    template_id: null,
    hearts_count: 19,
    reports: 0,
    is_hidden: false,
    spotlight_expires_at: new Date(now + 18 * 3600 * 1000).toISOString(),
    created_at: new Date(now - 2 * 3600 * 1000).toISOString()
  },
  {
    id: 1004,
    client_id: "seed-global-2",
    is_private: false,
    recipient: "The stranger on the 8:15 train",
    message: "You lent me your umbrella during the downpour without hesitating for a second. Thank you for reminding me that kindness is still effortless.",
    space: "Global",
    color_hex: "#f8bbd0",
    template_id: "love",
    hearts_count: 34,
    reports: 0,
    is_hidden: false,
    spotlight_expires_at: null,
    created_at: new Date(now - 5 * 3600 * 1000).toISOString()
  },
  {
    id: 1005,
    client_id: "seed-global-3",
    is_private: false,
    recipient: "My younger self",
    message: "We actually survived all the things you thought would break us, and the mornings feel much lighter now.",
    space: "Global",
    color_hex: "#3949ab",
    template_id: null,
    hearts_count: 47,
    reports: 0,
    is_hidden: false,
    spotlight_expires_at: null,
    created_at: new Date(now - 11 * 3600 * 1000).toISOString()
  },
  {
    id: 1006,
    client_id: "seed-global-4",
    is_private: false,
    recipient: "Room 402",
    message: "Four years went by in the blink of an eye. I'm going to miss midnight tea on the balcony more than I admitted out loud.",
    space: "Global",
    color_hex: "#aed581",
    template_id: "celebration",
    hearts_count: 12,
    reports: 0,
    is_hidden: false,
    spotlight_expires_at: null,
    created_at: new Date(now - 22 * 3600 * 1000).toISOString()
  }
];
