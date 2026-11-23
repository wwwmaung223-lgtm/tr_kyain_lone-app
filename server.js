import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import generateQuizHandler from './api/generate-quiz.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.join(__dirname, 'dist');
const PORT = Number(process.env.PORT) || 3000;
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.pdf': 'application/pdf'
};

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(payload));
}

async function readJsonBody(req, maxBytes = 5 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw Object.assign(new Error('Request body too large'), { statusCode: 413 });
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  try { return JSON.parse(raw); }
  catch { throw Object.assign(new Error('Invalid JSON body'), { statusCode: 400 }); }
}

async function handleApi(req, res) {
  if (!['GET', 'POST'].includes(req.method)) {
    return sendJson(res, 405, { success: false, error: 'Method not allowed' });
  }
  if (req.method === 'POST') {
    try { req.body = await readJsonBody(req); }
    catch (error) { return sendJson(res, error.statusCode || 400, { success: false, error: error.message }); }
  }

  const responseAdapter = {
    status(code) { this.statusCode = code; return this; },
    json(payload) {
      if (res.writableEnded) return;
      sendJson(res, this.statusCode || 200, payload);
      return this;
    }
  };

  try {
    await generateQuizHandler(req, responseAdapter);
  } catch (error) {
    console.error('Generate quiz API error:', error);
    if (!res.writableEnded) sendJson(res, 500, { success: false, error: 'Internal server error' });
  }
}

async function handleStatic(req, res, pathname) {
  let decodedPath;
  try { decodedPath = decodeURIComponent(pathname); }
  catch { return sendJson(res, 400, { error: 'Bad request' }); }

  const relativePath = decodedPath.replace(/^\/+/, '');
  let target = path.resolve(DIST_DIR, relativePath || 'index.html');
  if (target !== DIST_DIR && !target.startsWith(DIST_DIR + path.sep)) {
    return sendJson(res, 403, { error: 'Forbidden' });
  }

  try {
    const stat = await fs.promises.stat(target);
    if (stat.isDirectory()) target = path.join(target, 'index.html');
    await fs.promises.access(target, fs.constants.R_OK);
  } catch {
    target = path.join(DIST_DIR, 'index.html');
  }

  try {
    const stat = await fs.promises.stat(target);
    if (!stat.isFile()) throw new Error('Not a file');
    const ext = path.extname(target).toLowerCase();
    const headers = {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      'Content-Length': stat.size,
      'X-Content-Type-Options': 'nosniff'
    };
    if (target.includes(path.sep + 'assets' + path.sep)) {
      headers['Cache-Control'] = 'public, max-age=31536000, immutable';
    } else if (ext === '.html') {
      headers['Cache-Control'] = 'no-cache';
    }
    res.writeHead(200, headers);
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(target).pipe(res);
  } catch {
    sendJson(res, 404, { error: 'Build output not found. Run npm run build first.' });
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://localhost');
  if (url.pathname === '/health') {
    return sendJson(res, 200, { status: 'ok' });
  }
  if (url.pathname === '/api/generate-quiz') {
    return handleApi(req, res);
  }
  if (!['GET', 'HEAD'].includes(req.method)) {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }
  return handleStatic(req, res, url.pathname);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Tr.Kyain Lone server listening on port ${PORT}`);
});
