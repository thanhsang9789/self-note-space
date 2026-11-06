# SelfNote. — Tactile Paper Note Spaces

A privacy-first, mobile-ready personal note sanctuary and anonymous letter-writing web app.

## ✨ Highlights

- **`/space` Hub**: Animated interactive brand wordmark, hand-drawn postal globe/route/envelope SVG backdrop, flying `"Your Outbox →"` sine-wave paper airplane, Light/Dark mode toggle, and tilted neo-brutalist space cards.
- **Personal & Custom Note Spaces**: Dedicated **My Personal Notes** space plus `+ New Space` folders (`Future Self`, `Quick Ideas`, or any custom emoji space) with full **Edit**, **Pin (Spotlight)**, **Search**, and **Delete** support.
- **36 Paper Shades & Stationery**: Realistic SVG fractal-noise crumpled paper texture, 36 exact color swatches with automatic ink contrast, `Love` & `Celebration` margin stationery, golden Spotlight borders, and floating heart reactions.
- **Cellphone + PC Storage**:
  - **Works Offline Immediately**: Saves notes on-device via `localStorage` + 1-tap `.json` Backup Export/Restore.
  - **Optional Live Cloud Sync (Supabase Free Tier)**: Paste your Supabase URL & Anon Key into the in-app **Cloud Sync Settings** button (bottom-left cloud icon) and sign in via **6-digit Email OTP** to sync your private notes across your phone and computer.

---

## 🚀 Run Locally (Desktop + Phone over Wi-Fi)

```powershell
python serve.py
```

Open `http://localhost:8000/space` on your computer (or the printed `http://<LAN-IP>:8000/space` address on your phone while on the same Wi-Fi).

---

## 🌐 Publish to GitHub Pages (Access Anywhere from Your Cellphone)

This repository includes `.nojekyll`, `404.html` SPA routing, `manifest.webmanifest`, `sw.js`, and an automated GitHub Actions deployment workflow (`.github/workflows/deploy.yml`).

### Option A: Using GitHub CLI (`gh`)
```powershell
git init -b main
git add .
git commit -m "Initial commit: SelfNote tactile paper spaces"
gh repo create self-note-space --public --source=. --remote=origin --push
```
Then in your GitHub repository **Settings → Pages**, set **Source** to **GitHub Actions**. Within ~30 seconds your live cellphone URL will be:
`https://<your-github-username>.github.io/self-note-space/space`

### Add to Your Cellphone Home Screen
- **iPhone (Safari)**: Open your GitHub Pages URL → tap **Share** → **Add to Home Screen**.
- **Android (Chrome)**: Open your GitHub Pages URL → tap **⋮ Menu** → **Install app / Add to Home screen**.

---

## ☁️ Optional: Connect Free Cross-Device Cloud Sync (Supabase)

1. Create a free project at [supabase.com](https://supabase.com).
2. Open **SQL Editor**, paste the contents of [`supabase/schema.sql`](./supabase/schema.sql), and click **Run**.
3. In **Authentication → Providers → Email**, ensure Email OTP / Magic Link is enabled.
4. Copy your **Project URL** and **Anon Public Key** from **Project Settings → API**.
5. Tap the **Cloud icon** in the bottom-left corner of your app (on both your PC and cellphone), paste the URL & Key, and sign in with your email's 6-digit code!
