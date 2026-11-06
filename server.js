
const http = require("http");
const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const readline = require("readline");

const args = process.argv.slice(2);
const rootArg = args[0] || ".";
let port = 18777;
let token = null;

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--port" && args[i + 1]) {
    port = Number(args[i + 1]);
  }
  if (args[i] === "--token" && args[i + 1]) {
    token = args[i + 1];
  }
}

if (!token) token = crypto.randomBytes(32).toString("hex");

const BACKUP_DIR = ".pc-mode-backups";
const MAX_FILE = 500 * 1024;
const SKIP = new Set([
  "node_modules", ".git", ".hg", "dist", "build",
  "out", ".next", "__pycache__", ".venv", "venv",
  BACKUP_DIR
]);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

let approvalQueue = Promise.resolve();

async function askApproval(question) {
  const task = approvalQueue.then(async () => {
    const answer = await new Promise(resolve => {
      rl.question(question, resolve);
    });
    return answer.trim().toLowerCase() === "y";
  });

  approvalQueue = task.catch(() => false);
  return task;
}

async function initialize() {
  await fs.mkdir(rootArg, { recursive: true });
  const root = await fs.realpath(rootArg);
  return root;
}

let root;

function safePath(rel) {
  if (typeof rel !== "string" || !rel || rel.includes("\0")) {
    throw new Error("Invalid file path");
  }

  if (path.isAbsolute(rel) || rel.startsWith("~")) {
    throw new Error("Absolute paths blocked");
  }

  const parts = rel.split(/[\\/]+/);

  if (
    parts.some(p => !p || p === "." || p === "..") ||
    parts[0] === BACKUP_DIR
  ) {
    throw new Error("Unsafe path blocked");
  }

  const abs = path.resolve(root, ...parts);

  if (abs !== root && !abs.startsWith(root + path.sep)) {
    throw new Error("Folder se bahar access blocked");
  }

  return { abs, parts };
}

async function checkPath(parts, allowMissing = false) {
  let current = root;

  for (let i = 0; i < parts.length; i++) {
    current = path.join(current, parts[i]);

    try {
      const st = await fs.lstat(current);

      if (st.isSymbolicLink()) {
        throw new Error("Symlink access blocked");
      }

      if (i < parts.length - 1 && !st.isDirectory()) {
        throw new Error("Parent directory invalid");
      }
    } catch (e) {
      if (e.code === "ENOENT" && allowMissing) return;
      throw e;
    }
  }
}

async function ensureParent(parts) {
  let current = root;

  for (const part of parts.slice(0, -1)) {
    current = path.join(current, part);

    try {
      const st = await fs.lstat(current);
      if (st.isSymbolicLink() || !st.isDirectory()) {
        throw new Error("Unsafe parent directory");
      }
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
      await fs.mkdir(current);
    }
  }
}

async function walk(dir, base, out, limit) {
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const e of entries) {
    if (out.length >= limit) break;
    if (SKIP.has(e.name)) continue;

    const abs = path.join(dir, e.name);

    if (e.isDirectory()) {
      await walk(abs, base, out, limit);
    } else if (e.isFile()) {
      out.push(path.relative(base, abs));
    }
  }
}

async function ensureBackupDirectory() {
  const dir = path.join(root, BACKUP_DIR);

  try {
    const st = await fs.lstat(dir);

    if (st.isSymbolicLink() || !st.isDirectory()) {
      throw new Error("Unsafe backup directory");
    }
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
    await fs.mkdir(dir);
  }

  return dir;
}

async function makeBackup(rel, content, existed) {
  const dir = await ensureBackupDirectory();

  const id = crypto.randomUUID();

  const record = {
    id,
    path: rel,
    existed,
    created: new Date().toISOString(),
    content: existed ? Buffer.from(content).toString("base64") : null
  };

  await fs.writeFile(
    path.join(dir, id + ".json"),
    JSON.stringify(record),
    { flag: "wx" }
  );

  return record;
}

async function getBackup(id) {
  if (!/^[a-f0-9-]{36}$/i.test(id)) {
    throw new Error("Invalid backup ID");
  }

  await ensureBackupDirectory();

  const file = path.join(root, BACKUP_DIR, id + ".json");
  const record = JSON.parse(await fs.readFile(file, "utf8"));

  if (record.id !== id) throw new Error("Backup mismatch");

  return record;
}

function showDiff(oldText, newText) {
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");

  let start = 0;
  while (
    start < oldLines.length &&
    start < newLines.length &&
    oldLines[start] === newLines[start]
  ) start++;

  let endOld = oldLines.length - 1;
  let endNew = newLines.length - 1;

  while (
    endOld >= start &&
    endNew >= start &&
    oldLines[endOld] === newLines[endNew]
  ) {
    endOld--;
    endNew--;
  }

  console.log("\n========== FILE DIFF ==========");

  const contextStart = Math.max(0, start - 3);
  const contextEndOld = Math.min(oldLines.length - 1, endOld + 3);
  const contextEndNew = Math.min(newLines.length - 1, endNew + 3);

  for (let i = contextStart; i < start; i++) {
    console.log("  " + oldLines[i]);
  }

  const removed = oldLines.slice(start, endOld + 1);
  const added = newLines.slice(start, endNew + 1);

  for (const line of removed.slice(0, 100)) {
    console.log("- " + line);
  }

  for (const line of added.slice(0, 100)) {
    console.log("+ " + line);
  }

  if (removed.length > 100 || added.length > 100) {
    console.log("... Diff truncated in terminal preview ...");
  }

  console.log("===============================\n");
}

async function atomicWrite(abs, content) {
  const temp = abs + ".pc-mode-" + crypto.randomUUID() + ".tmp";

  try {
    await fs.writeFile(temp, content, {
      encoding: "utf8",
      flag: "wx"
    });

    await fs.rename(temp, abs);
  } catch (e) {
    await fs.rm(temp, { force: true }).catch(() => {});
    throw e;
  }
}

function send(res, code, obj) {
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "x-bridge-token, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Private-Network": "true",
    "Cache-Control": "no-store"
  });

  res.end(JSON.stringify(obj));
}

async function readBody(req) {
  let body = "";

  for await (const chunk of req) {
    body += chunk.toString("utf8");

    if (Buffer.byteLength(body, "utf8") > 1024 * 1024) {
      throw new Error("Request too large");
    }
  }

  return JSON.parse(body);
}

async function handleWrite(j) {
  if (typeof j.content !== "string") {
    throw new Error("content string required");
  }

  if (Buffer.byteLength(j.content, "utf8") > MAX_FILE) {
    throw new Error("File too large (500KB max)");
  }

  const { abs, parts } = safePath(j.path);
  await ensureParent(parts);

  let existed = false;
  let oldText = "";

  try {
    await checkPath(parts);
    const st = await fs.lstat(abs);

    if (!st.isFile()) throw new Error("Only regular files can be edited");
    if (st.size > MAX_FILE) throw new Error("Existing file too large");

    oldText = await fs.readFile(abs, "utf8");
    existed = true;
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
    await checkPath(parts, true);
  }

  if (existed && oldText === j.content) {
    return { ok: true, unchanged: true };
  }

  console.log("\nAI wants to modify:", j.path);
  console.log("Existing file:", existed ? "YES" : "NO");
  showDiff(oldText, j.content);

  const approved = await askApproval(
    "Approve and save this change? Type y and press Enter [y/N]: "
  );

  if (!approved) {
    console.log("Change cancelled.");
    return { ok: false, error: "User rejected change" };
  }

  const backup = await makeBackup(j.path, oldText, existed);

  await atomicWrite(abs, j.content);

  console.log("Saved:", j.path);
  console.log("Backup ID:", backup.id);

  return {
    ok: true,
    path: j.path,
    backupId: backup.id
  };
}

async function handleUndo(id) {
  const backup = await getBackup(id);
  const { abs, parts } = safePath(backup.path);

  await ensureParent(parts);
  await checkPath(parts, true);

  let current = "";
  let currentExists = false;

  try {
    const st = await fs.lstat(abs);
    if (!st.isFile()) throw new Error("Not a regular file");
    current = await fs.readFile(abs, "utf8");
    currentExists = true;
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }

  console.log("\nUNDO requested:", backup.path);
  showDiff(
    current,
    backup.existed
      ? Buffer.from(backup.content, "base64").toString("utf8")
      : ""
  );

  const approved = await askApproval(
    "Restore this backup? Type y and press Enter [y/N]: "
  );

  if (!approved) return { ok: false, error: "Undo cancelled" };

  await makeBackup(backup.path, current, currentExists);

  if (backup.existed) {
    const oldContent = Buffer.from(backup.content, "base64").toString("utf8");
    await atomicWrite(abs, oldContent);
  } else {
    await fs.rm(abs);
  }

  console.log("Restored:", backup.path);

  return { ok: true, restored: backup.path };
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    send(res, 200, { ok: true });
    return;
  }

  if (req.headers["x-bridge-token"] !== token) {
    send(res, 403, { ok: false, error: "Invalid token" });
    return;
  }

  const u = new URL(req.url, "http://127.0.0.1");

  try {
    if (u.pathname === "/status" && req.method === "GET") {
      const files = [];
      await walk(root, root, files, 500);
      send(res, 200, { ok: true, root, files: files.length });

    } else if (u.pathname === "/list" && req.method === "GET") {
      const files = [];
      await walk(root, root, files, 300);
      send(res, 200, { ok: true, files: files.sort() });

    } else if (u.pathname === "/read" && req.method === "GET") {
      const rel = u.searchParams.get("path");
      const { abs, parts } = safePath(rel);
      await checkPath(parts);

      const st = await fs.lstat(abs);
      if (!st.isFile()) throw new Error("Not a regular file");
      if (st.size > MAX_FILE) throw new Error("File too large");

      const content = await fs.readFile(abs, "utf8");
      send(res, 200, { ok: true, content });

    } else if (u.pathname === "/write" && req.method === "POST") {
      const j = await readBody(req);
      const result = await handleWrite(j);
      send(res, result.ok ? 200 : 403, result);

    } else if (u.pathname === "/backups" && req.method === "GET") {
      const dir = await ensureBackupDirectory();

      const names = await fs.readdir(dir);
      const backups = [];

      for (const name of names.slice(-100)) {
        if (!name.endsWith(".json")) continue;
        try {
          const b = JSON.parse(
            await fs.readFile(path.join(dir, name), "utf8")
          );
          backups.push({
            id: b.id,
            path: b.path,
            created: b.created,
            existed: b.existed
          });
        } catch {}
      }

      send(res, 200, { ok: true, backups });

    } else if (u.pathname === "/undo" && req.method === "POST") {
      const j = await readBody(req);
      const result = await handleUndo(j.backupId);
      send(res, result.ok ? 200 : 403, result);

    } else {
      send(res, 404, { ok: false, error: "Unknown endpoint" });
    }
  } catch (e) {
    console.error("Request error:", e.message);
    send(res, 400, { ok: false, error: e.message });
  }
});

initialize().then(resolvedRoot => {
  root = resolvedRoot;

  server.listen(port, "127.0.0.1", () => {
    console.log("\n================================");
    console.log(" PERCHANCE SAFE LOCAL AGENT");
    console.log("================================");
    console.log("Folder:", root);
    console.log("URL:   ", `http://127.0.0.1:${port}`);
    console.log("Token: ", token);
    console.log("\nFile writes require terminal approval.");
    console.log("Backups:", path.join(root, BACKUP_DIR));
    console.log("================================\n");
  });
}).catch(error => {
  console.error("Startup failed:", error);
  process.exit(1);
});
