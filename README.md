# 🌌 Pixel Ghost Station (Ghost Radio)

[![Live Website](https://img.shields.io/badge/Enter%20Ghost%20Station-ghoststation--radio.vercel.app-ff007f?style=for-the-badge&logo=vercel)](https://ghoststation-radio.vercel.app/)
[![Supabase](https://img.shields.io/badge/Database-Supabase-3ECF8E?style=for-the-badge&logo=supabase)](https://supabase.com/)

> 👻 A cute, interactive, multiplayer pixel art canvas where ghosts groove to your favorite songs in real time!

👉 **[Click here to visit the Live Website!](https://ghoststation-radio.vercel.app/)**

---

## 🌸 About Ghost Station

**Pixel Ghost Station** is a minimalist arcade web application and real-time multiplayer playground. Visit the site to summon your own personalized 8-bit ghost, equip it with a custom-drawn pixel accessory, and attach direct music links or local audio files.

When a ghost plays music, it gears up with glowing headphones and pulses along to an audio-reactive visualizer and dynamic starfield equalizer!

---

## ✨ Features

- **👻 Dynamic Ghost Playground:** Full-screen interactive HTML5 Canvas with bouncing ghost entities and responsive viewport bounds across Desktop, Tablet, and Mobile devices.
- **🎨 Custom Pixel Studio:** Draw pixel accessories in a modal drawing studio (supports finger touch drawing on mobile devices with erasers and color palettes).
- **🎵 Multi-Source Audio Engine:**
  - **Uploaded MP3 / Local Files:** Direct in-browser playback powered by the Web Audio API with beat-reactive visualizer bars.
  - **Platform Links:** Smart launching for YouTube Music, Spotify, SoundCloud, and Apple Music.
- **🛡️ Intelligent Song Classifier:** Automated Web Audio spectral & energy analyzer ensuring only verified music files can be attached.
- **⚡ Real-Time Database Sync:** Powered by Supabase PostgreSQL and WebSockets for instantaneous multiplayer syncing across all active visitors worldwide.
- **📱 Touch & Mobile Optimized:** Fluid, touch-friendly UI layout with dynamic boundary checks to keep ghosts visible and clickable on any screen size.

---

## 🛠️ Built With

- **Frontend:** Vanilla JavaScript (ES6+), HTML5 Canvas, CSS3 Keyframes
- **Audio Engine:** HTML5 Web Audio API (`AudioContext`, `AnalyserNode`, `OscillatorNode`)
- **Backend / Database:** [Supabase](https://supabase.com/) (PostgreSQL & Realtime WebSockets)
- **Deployment:** [Vercel](https://vercel.com/)

---

## 🌐 Database Schema (Supabase)

The project connects to a public PostgreSQL database with Row Level Security (RLS) enabled:

| Column Name | Type | Options |
| :--- | :--- | :--- |
| `id` | `uuid` | Primary Key (`gen_random_uuid()`) |
| `name` | `text` | Ghost Display Name |
| `url` | `text` | Audio Source Data URL or Music Link |
| `accessory` | `text` | Base64 Canvas PNG String |
| `x` | `float4` | Initial X Coordinate |
| `y` | `float4` | Initial Y Coordinate |

---

<p align="center">Made with 💖 for cute pixel music lovers everywhere! <br> <b><a href="https://ghoststation-radio.vercel.app/">Visit Ghost Station 🌌</a></b></p>
