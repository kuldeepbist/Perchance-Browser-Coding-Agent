# Perchance Browser Coding Agent

A browser-based AI file assistant: a single clean HTML page that talks to a tiny local
server on your own PC. The AI **proposes** code edits, and **you approve them** in your
own terminal before anything is saved. Human-in-the-loop by design.

> **What this is NOT:** this is not an autonomous agent like Claude Code or Cursor.
> It does not run terminal commands, execute code, or plan multi-step tasks on its own.
> It only saves file edits that you manually approve with `y + Enter`.

There is no Terms popup and no in-app Setup Guide in this version —
**this README is the setup guide.**

---

## 1. Try the live demo

Open the generator in your browser:

```
https://perchance.org/perchance-browser-coding-agent
```

You can look around freely — Explorer, editor, AI chat, Terminal tabs are all visible.
To edit real files on your computer, do the local setup in Section 3 once.

---

## 2. Use these files in a new generator

This repo contains exactly what you need — nothing else:

| File | Where it goes | Purpose |
|---|---|---|
| `index.html` (the clean one) | Generator's `index.html` (paste it whole) | Entire UI + all logic: Uplink, Explorer tree, editor, AI chat, approvals |
| `main.pjs` | Generator's `main.pjs` | One line: `generateText = {import:ai-text-plugin}` (powers the AI chat) |
| `server.js` | Your PC (run with Node) | Local file server: list/read/write/backups/undo + terminal approval |
| `chrome-extension/` (4 files) | Loaded into Chrome as unpacked extension | Bridges the Perchance page to the local server |

No ZIP, no screenshots, no extra folders. That is the whole project.

### Steps

1. Create a new Perchance generator (or fork the demo).
2. Get `main.pjs` into the generator's `main.pjs` — easy way: in the Perchance editor,
   upload the `main.pjs` file and ask the Perchance AI to replace the generator's
   `main.pjs` with it. (Or copy-paste its contents manually — it is only 1 line:
   `generateText = {import:ai-text-plugin}`.)
3. Get `index.html` into the generator's `index.html` — easy way: in the Perchance editor,
   upload the `index.html` file and ask the Perchance AI to replace the generator's
   `index.html` with it. (Or copy-paste its contents manually.)
4. Press **Save** in the Perchance editor.
5. Open the generator and follow Section 3 below to connect it to your PC.

---

## 3. Local setup (what you need on your computer)

### Requirements

- **Node.js LTS** (v18 or newer) — runs the local file server. Download from https://nodejs.org/
- **Google Chrome** — the generator page and the bridge extension run here.
- **This repo's `server.js` + `chrome-extension/` folder** — download them from GitHub.
- **One dedicated project folder** — the only folder the AI will ever be allowed to touch.
  Example: `D:\MyProject` (Windows) or `/Users/you/Desktop/MyProject` (macOS).

### Step-by-step

**Step 1 — Get the local files.**
Download (or `git clone`) this repo. You only need two things from it on your PC:

```
server.js
chrome-extension/
├── manifest.json
├── main.js
├── content.js
└── background.js
```

**Step 2 — Install Node.js.**
Install the LTS version from https://nodejs.org/ , then verify in a terminal:

```
node -v
npm -v
```

Both commands must print a version number.

**Step 3 — Start the local server.**
Open a terminal, go to the folder with `server.js`, and start it with your project folder:

Windows:
```
node server.js "D:\MyProject" --port 18777
```

macOS:
```
node server.js "$HOME/Desktop/MyProject" --port 18777
```

You will see something like:

```
================================
 PERCHANCE SAFE LOCAL AGENT
================================
Folder: D:\MyProject
URL: http://127.0.0.1:18777
Token: YOUR_RANDOM_TOKEN
File writes require terminal approval.
================================
```

Copy the **Token** — you need it in the next step. **Keep this terminal window open.**
A new random token is generated on every restart.

**Step 4 — Install the Chrome extension.**
1. Open Chrome and go to `chrome://extensions`
2. Turn **Developer mode** ON (top right).
3. Click **Load unpacked** and select the `chrome-extension` folder from this repo.
4. Confirm "Perchance Local Bridge" appears with no errors. If Chrome asks for local
   network access permission, allow it.

**Step 5 — Connect the page.**
1. Open the generator page.
2. In the Uplink popup enter:
   - Server URL: `http://127.0.0.1:18777`
   - Token: the token printed by your server.
3. Press **CONNECT**. The badge turns green (● Connected) and your files load into the Explorer.

**Step 6 — Test it.**
Click a file in the Explorer to read it. Then ask the AI something small, e.g.
*"Create a file named test.html with a Hello heading."*
The server will show you a diff in its terminal and wait — press **`y` + Enter** to approve.
The file is saved (with a backup), and the chat confirms *"All approved and saved."*

**Step 7 — Stop when done.**
Press `Ctrl + C` in the server terminal. You can also disable the extension until next time.

---

## 4. How editing works (the approval loop)

1. You type a task in the AI chat (select a file first).
2. The AI replies with a **JSON edit plan**: `{ explanation, edits: [{ path, content }] }`.
3. The page sends each edit to the local server (`POST /write`).
4. The server shows a **diff preview in YOUR terminal** and waits for **`y + Enter`**.
5. Only then is the file saved. A backup of the previous version goes to
   `MyProject/.pc-mode-backups/`.
6. Rejected edits are skipped; the chat tells you exactly what was saved and what was not.

Nothing is ever written without your explicit terminal approval. No approval = no changes.

### Local server API

| Endpoint | Method | Purpose |
|---|---|---|
| `/status` | GET | Server alive? Returns project root + file count |
| `/list` | GET | List files under the allowed folder |
| `/read?path=` | GET | Read one file (size-capped) |
| `/write` | POST | Write one file (after YOUR terminal approval) |
| `/backups?path=` | GET | List backups of a file |
| `/undo` | POST | Restore a backup |

---

## 5. Precautions (read before use)

1. **Use a dedicated project folder.** Never point the server at your home directory,
   system drive, or documents folder.
2. **Never share your token.** It prints fresh on every server start — never paste it
   into a public generator, chat, screenshot, or committed file.
3. **Keep manual approval ON.** It is the core safety feature. Always read the terminal
   diff before pressing `y`.
4. **Review every change.** The AI can be wrong. Check the diff, not just the chat text.
5. **Keep your own backups** of important projects — `.pc-mode-backups/` is a convenience,
   not a backup strategy.
6. **Know what the AI sees.** File contents you ask about are sent to an online AI service.
   Never expose passwords, API keys, private certificates, or personal data.
7. **Don't run AI-suggested terminal commands blindly.** This tool edits files; it does not
   need you to run anything else. Treat unexpected commands as hostile.
8. **Stop the server when finished** (`Ctrl + C`) and disable the extension when not in use.
9. **Install the extension only from this repo** (or your own copy of it).
10. **Use at your own risk.** You are responsible for every change you approve.

---

## 6. Troubleshooting

| Problem | Fix |
|---|---|
| `link failed` / Could not reach server | Is `node server.js` still running? Correct URL `http://127.0.0.1:18777`? Extension enabled + local network access allowed? |
| Invalid token | Copy the token fresh from the running server terminal. Restart = new token. |
| Permission denied | Folder must exist and be inside the one you passed to `server.js`. |
| AI did not return JSON | Just ask again — the app auto-retries once with a format repair. |
| `generateText plugin did not load` | `main.pjs` must contain `generateText = {import:ai-text-plugin}` and the generator must be saved. |
| Extension errors | Open `chrome://extensions`, find Perchance Local Bridge, click Errors. |

---

## 7. Repository layout

```
perchance-browser-coding-agent/
├── README.md                  ← this file (the setup guide)
├── generator/
│   ├── main.pjs               ← generateText import (1 line)
│   └── index.html             ← clean UI + logic (no Terms, no Setup Guide)
├── server.js                  ← run this with Node on your PC
└── chrome-extension/
    ├── manifest.json
    ├── main.js
    ├── content.js
    └── background.js
```

**Never commit:** your server token, `.pc-mode-backups/`, `node_modules/`, or editor scratch files.
