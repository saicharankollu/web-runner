/**
 * Minimal Express backend for Web Runner
 * - Creates workspaces
 * - Proxies generation/patch requests to run-agent (mock or gpt-pilot service)
 * - Serves workspace preview static files
 * - Exports ZIP of the workspace
 *
 * This is a scaffold. For local testing you can run the provided mock-run-agent.
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const { v4: uuidv4 } = require('uuid');
const archiver = require('archiver');
const bodyParser = require('body-parser');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 8080;
const WORKSPACES_DIR = path.resolve(process.env.WORKSPACES_DIR || './workspaces');
const GPT_PILOT_BASE_URL = process.env.GPT_PILOT_BASE_URL || 'http://localhost:8081';
const MIN_HUMAN_DELAY_SECONDS = Number(process.env.MIN_HUMAN_DELAY_SECONDS || 2);

if (!fs.existsSync(WORKSPACES_DIR)) fs.mkdirSync(WORKSPACES_DIR, { recursive: true });

app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true }));

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20
});
app.use(limiter);

// Simple in-memory timestamps for anti-bot (demo only)
const promptTimestamps = new Map();

app.post('/api/anti-bot/start', (req, res) => {
  const id = uuidv4();
  promptTimestamps.set(id, Date.now());
  res.json({ sessionId: id });
});

/**
 * POST /api/generate
 * Body: { prompt, sessionId, template, userApiKey }
 *
 * - Validate anti-bot timing
 * - Create workspace directory
 * - Call run-agent (mock or gpt-pilot wrapper) at GPT_PILOT_BASE_URL/run-agent with {prompt, workspacePath, template, userApiKey}
 * - Return workspaceId and result
 */
app.post('/api/generate', async (req, res) => {
  const { prompt, sessionId, template = 'minimal', userApiKey } = req.body;
  if (!prompt || !sessionId) return res.status(400).json({ error: 'missing prompt or sessionId' });

  const ts = promptTimestamps.get(sessionId);
  if (!ts || (Date.now() - ts) / 1000 < MIN_HUMAN_DELAY_SECONDS) {
    return res.status(400).json({ error: 'anti-bot validation failed: move slower' });
  }

  const workspaceId = uuidv4();
  const workspacePath = path.join(WORKSPACES_DIR, workspaceId);
  fs.mkdirSync(workspacePath, { recursive: true });

  try {
    const body = { prompt, workspacePath, template, userApiKey };
    const agentResp = await fetch(`${GPT_PILOT_BASE_URL}/run-agent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!agentResp.ok) {
      const text = await agentResp.text();
      console.error('run-agent error', text);
      try { fs.rmSync(workspacePath, { recursive: true, force: true }); } catch {}
      return res.status(500).json({ error: 'run-agent failed', details: text });
    }

    const agentJson = await agentResp.json();
    return res.json({ workspaceId, message: 'generation completed', agent: agentJson });
  } catch (err) {
    console.error('Error calling run-agent', err);
    try { fs.rmSync(workspacePath, { recursive: true, force: true }); } catch {}
    return res.status(500).json({ error: 'backend error', details: String(err) });
  }
});

// List workspace files
app.get('/api/workspace/:id/files', (req, res) => {
  const workspaceId = req.params.id;
  const workspacePath = path.join(WORKSPACES_DIR, workspaceId);
  if (!fs.existsSync(workspacePath)) return res.status(404).json({ error: 'workspace not found' });

  function walk(dir) {
    let files = [];
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        files = files.concat(walk(full));
      } else {
        files.push({
          path: path.relative(workspacePath, full).replace(/\\/g, '/'),
          size: stat.size
        });
      }
    }
    return files;
  }

  const files = walk(workspacePath);
  res.json({ workspaceId, files });
});

// Read a single file
app.get('/api/workspace/:id/file', (req, res) => {
  const { id } = req.params;
  const filePath = req.query.path;
  const workspacePath = path.join(WORKSPACES_DIR, id);
  const full = path.join(workspacePath, filePath || '');
  if (!fs.existsSync(full)) return res.status(404).json({ error: 'file not found' });
  const content = fs.readFileSync(full, 'utf8');
  res.json({ path: filePath, content });
});

// Patch (overwrite) a file
app.post('/api/workspace/:id/patch', (req, res) => {
  const { id } = req.params;
  const { path: filePath, content } = req.body;
  if (!filePath || content === undefined) return res.status(400).json({ error: 'missing path or content' });
  const workspacePath = path.join(WORKSPACES_DIR, id);
  const full = path.join(workspacePath, filePath);
  if (!fs.existsSync(path.dirname(full))) fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf8');
  res.json({ ok: true });
});

// Export zip
app.get('/api/workspace/:id/export.zip', (req, res) => {
  const { id } = req.params;
  const workspacePath = path.join(WORKSPACES_DIR, id);
  if (!fs.existsSync(workspacePath)) return res.status(404).send('Not found');

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${id}.zip"`);

  const archive = archiver('zip');
  archive.on('error', (err) => res.status(500).send({ error: err.message }));
  archive.pipe(res);
  archive.directory(workspacePath, false);
  archive.finalize();
});

// Serve preview static from workspace (for iframe preview)
app.use('/preview/:id', (req, res, next) => {
  const id = req.params.id;
  const workspacePath = path.join(WORKSPACES_DIR, id);
  if (!fs.existsSync(workspacePath)) return res.status(404).send('Not found');
  express.static(workspacePath)(req, res, next);
});

app.listen(PORT, () => {
  console.log(`Web Runner backend listening on ${PORT}`);
  console.log(`Workspaces dir: ${WORKSPACES_DIR}`);
  console.log(`Expecting run-agent at: ${GPT_PILOT_BASE_URL}`);
});
