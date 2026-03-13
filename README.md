# DayOS

**Your daily operating system, self-hosted, voice-first, zero dependencies.**

A schedule-aware dashboard that shows what you should be doing right now. Runs on a Raspberry Pi (or any machine), displays on an iPad (or any browser). Optional two-way voice with ElevenLabs TTS and OpenAI Whisper STT.

<p align="center">
  <img src="https://img.shields.io/badge/node-%3E%3D18-green" alt="Node >= 18">
  <img src="https://img.shields.io/badge/dependencies-zero-brightgreen" alt="Zero dependencies">
  <img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT License">
</p>

## Why?

Most productivity tools are either cloud SaaS or require Docker + 10 services. This is:

- **One folder, one command** — `node server.js`
- **Zero npm dependencies** — just Node.js
- **Single HTML file** — no build step, no React, no webpack
- **Config-driven** — schedule, voice, theme from one JSON file
- **Voice-first** — talk to it, it talks back (optional)
- **Works on a $35 Raspberry Pi**

## Features

🕐 **Schedule Engine** — Define your daily blocks (focus, workout, personal, etc.) with auto-switching modes and time-aware UI

📌 **Persistent Announcements** — Messages stay on screen until dismissed. Push from CLI, API, or voice.

🎯 **Daily Goals** — Always-visible commitment bar. Set via API or CLI.

🎙️ **Two-way Voice** — ElevenLabs TTS for speech output, OpenAI Whisper for speech input. Both optional.

⏱️ **Timers & Alerts** — Pomodoro timers, fullscreen alerts, toast notifications, confetti celebrations

📱 **iPad Kiosk Mode** — Optimized for Guided Access. HTTPS for mic access. Auto-reconnects.

🔌 **Webhook Integration** — Forward voice input to any AI assistant, Home Assistant, n8n, or custom endpoint

📡 **Real-time WebSocket** — All updates push instantly. No polling.

## Quick Start

```bash
# Clone
git clone https://github.com/tkhattar14/dayos.git
cd dayos

# Setup (generates SSL certs, creates .env)
chmod +x setup.sh
./setup.sh

# Or just run directly
node server.js
```

Open `http://localhost:3141` in your browser. For iPad/tablet with mic access, use `https://<your-ip>:3142`.

## Configuration

Edit `config.json` to customize:

```json
{
  "name": "Focus",
  "timezone": "America/New_York",
  "timezoneOffset": -5,

  "schedule": {
    "anchor": "08:00",
    "blocks": [
      { "id": "morning", "start": "08:00", "end": "08:30", "label": "Morning Routine", "icon": "☀️", "mode": "morning", "color": "#f59e0b" },
      { "id": "focus-1", "start": "09:00", "end": "12:00", "label": "Deep Work", "icon": "🎯", "mode": "focus", "color": "#f59e0b" },
      { "id": "lunch",   "start": "12:00", "end": "13:00", "label": "Lunch Break", "icon": "🍽️", "mode": "transition", "color": "#6b7280" },
      { "id": "focus-2", "start": "13:00", "end": "17:00", "label": "Afternoon Work", "icon": "💻", "mode": "focus", "color": "#f59e0b" },
      { "id": "evening", "start": "17:00", "end": "22:00", "label": "Personal Time", "icon": "❤️", "mode": "personal", "color": "#ec4899" },
      { "id": "sleep",   "start": "22:00", "end": "08:00", "label": "Sleep", "icon": "😴", "mode": "sleep", "color": "#1e1e2a" }
    ]
  }
}
```

### Schedule Modes

Each block has a `mode` that controls the UI:

| Mode | Display |
|------|---------|
| `morning` | Sunrise theme, "Rise & Shine" |
| `workout` | Red theme, progress bar |
| `focus` | Amber theme, countdown, minimal distractions |
| `personal` | Pink theme, relaxed layout |
| `reading` | Indigo theme, calm |
| `transition` | Gray, neutral |
| `sleep` | Dark, just a clock |
| `commute` | Gray, neutral |
| `light-work` | Purple, casual work |

### Midnight Crossing

Blocks can span midnight. The schedule engine uses the `anchor` time as the day boundary. Blocks with start times before the anchor are treated as "next day" (e.g., if anchor is `09:00`, a block at `01:00` is early morning of the same logical day).

## Voice Setup (Optional)

DayOS works perfectly as a display-only dashboard. Voice is entirely optional.

### Text-to-Speech (ElevenLabs)

```bash
# In .env
ELEVENLABS_API_KEY=your-key-here
ELEVENLABS_VOICE=pNInz6obpgDQGcFmaJgB  # Voice ID (default: Adam)
```

Get a free API key at [elevenlabs.io](https://elevenlabs.io). Browse voices at [elevenlabs.io/voice-library](https://elevenlabs.io/voice-library).

### Speech-to-Text (OpenAI Whisper)

```bash
# In .env
OPENAI_API_KEY=your-key-here
```

Requires HTTPS (mic access). Run `./setup.sh` to generate self-signed certs.

### Webhook (AI Assistant)

Forward voice transcriptions to any HTTP endpoint:

```json
{
  "webhook": {
    "enabled": true,
    "url": "http://localhost:8080/api/voice",
    "token": "your-secret",
    "messageTemplate": "User said: \"{text}\""
  }
}
```

Works with: [OpenClaw](https://openclaw.ai), Home Assistant, n8n, Make, custom APIs.

## API Reference

All endpoints accept/return JSON. CORS enabled.

### Schedule & Context
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/context` | Full context (schedule + announcements + goals) |
| `GET` | `/api/schedule` | Current schedule state |
| `GET` | `/api/status` | Server status + capabilities |

### Announcements
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/announce` | Add text announcement `{"text": "...", "type": "info"}` |
| `GET` | `/api/announcements` | List all |
| `DELETE` | `/api/announcements/:id` | Dismiss one |
| `POST` | `/api/announcements/clear` | Clear all |

### Goals / Commitments
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/commitments` | Set goals `{"date": "2026-03-13", "commitments": [{"text": "...", "done": false}]}` |
| `GET` | `/api/commitments` | Get current goals |

### Voice
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/tts` | Text-to-speech `{"text": "Hello"}` |
| `POST` | `/api/stt` | Speech-to-text (audio/webm body) |

### WebSocket Commands
| Action | Description |
|--------|-------------|
| `speak` | TTS speech `{"action": "speak", "text": "..."}` |
| `alert` | Fullscreen alert `{"action": "alert", "type": "info", "title": "...", "message": "..."}` |
| `banner` | Top banner `{"action": "banner", "text": "...", "type": "urgent"}` |
| `toast` | Small notification `{"action": "toast", "title": "...", "message": "..."}` |
| `timer` | Start timer `{"action": "timer", "minutes": 25, "label": "Pomodoro"}` |
| `celebrate` | Confetti! `{"action": "celebrate"}` |
| `sound` | Play sound `{"action": "sound", "name": "chime\|alert\|success\|ding"}` |
| `reload` | Force page reload |

## CLI

```bash
chmod +x dayos-say.sh

# Speak (TTS)
./dayos-say.sh speak "Time for a break"

# Text announcement (stays on screen)
./dayos-say.sh announce "PR merged!" success

# Set today's goals
./dayos-say.sh goals "Ship feature X" "Fix bug Y" "Review PRs"

# Raw command
./dayos-say.sh raw '{"action":"timer","minutes":25,"label":"Pomodoro"}'

# Status
./dayos-say.sh status
```

### Schedule Override

Override today's schedule by creating `data/schedule-override.json`:

```json
{
  "blocks": [
    { "id": "wake", "start": "11:00", "end": "11:30", "label": "Wake Up", "icon": "☀️", "mode": "morning", "color": "#f59e0b" },
    { "id": "focus", "start": "12:00", "end": "18:00", "label": "Deep Work", "icon": "🎯", "mode": "focus", "color": "#f59e0b" }
  ]
}
```

Delete the file to return to default schedule.

## iPad Setup

1. Run `./setup.sh` to generate SSL certs
2. Open `https://<pi-ip>:3142` on iPad Safari
3. Trust the certificate (Settings → General → About → Certificate Trust Settings)
4. Tap "🔊 Tap to enable voice" on the dashboard
5. **Optional:** Enable Guided Access (Settings → Accessibility → Guided Access) for kiosk mode

### Tips
- Set Auto-Lock to "Never" for always-on display
- Use Guided Access to lock Safari to the dashboard
- Access from anywhere via [Tailscale](https://tailscale.com) (free, works great on Pi)

## Architecture

```
Browser (iPad/tablet)
    ↕ WebSocket (real-time)
Node.js server (Pi/laptop)
    ↕ HTTPS APIs
CLI / AI assistant / cron jobs
```

- **Server**: Node.js HTTP + HTTPS + WebSocket (zero deps)
- **Client**: Single HTML file (~900 lines, vanilla JS + CSS)
- **Data**: JSON files in `data/` directory
- **Audio**: TTS cache in `audio/` (auto-cleanup, keeps last 20)
- **Certs**: Self-signed in `certs/` (10-year validity)

## Integration Ideas

- **Home Assistant**: Call `/api/announce` on automations
- **n8n / Make**: Webhook voice input → AI → `/api/tts` response
- **Cron jobs**: Morning briefing, weather updates, calendar reminders
- **OpenClaw**: Full AI assistant with voice loop
- **Custom scripts**: Any tool that can `curl` can control the dashboard

## License

MIT — do whatever you want with it.

## Credits

Built by [Tushar Khattar](https://github.com/tkhattar14) with the help of [Ted](https://github.com/openclaw/openclaw), an AI cofounder running on a Raspberry Pi 5.
