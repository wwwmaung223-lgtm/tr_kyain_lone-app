// Vercel serverless function (ESM): ဓာတ်ပုံ/PDF -> quiz (Gemini ကို server ကနေ ခေါ်တယ်၊ n8n မလိုတော့ဘူး)
// Vercel Environment Variables: GEMINI_API_KEY, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY
const API = 'https://generativelanguage.googleapis.com/v1beta';
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

const PROMPT = `You convert a school question sheet (photo or PDF) into a quiz. Extract EVERY question in order.
Return ONLY JSON: {"title": string, "description": string, "questions": [{"type": "mcq" or "written", "text": string, "marks": number, "options": [string], "correctOption": number or null}]}.
Rules:
- type "mcq" when answer choices are printed. "options" = the choice texts WITHOUT letter labels like A. or (a). "correctOption" = the 0-based index of the correct choice; use your own knowledge to pick the correct answer.
- type "written" when there are no printed choices: "options" = [] and "correctOption" = null.
- "marks": use the marks printed on the sheet if shown, otherwise 2 for mcq and 5 for written.
- Keep the original language and wording of the sheet. "title": a short title from the sheet, or "". "description": "".`;

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function gfetch(url, key, opts = {}, ms = 40000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ac.signal, headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key, ...(opts.headers || {}) } });
  } finally { clearTimeout(t); }
}

// model နာမည်တွေ ပြောင်းသွားတတ်လို့ ကုဒ်ထဲ မသတ်မှတ်ဘဲ key က သုံးခွင့်ရတဲ့ flash model တွေကို Google ဆီက မေးယူတယ်
async function pickModels(key) {
  const r = await gfetch(`${API}/models?pageSize=200`, key, {}, 10000);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j.error && j.error.message) || ('models list HTTP ' + r.status));
  const bad = /(image|tts|live|audio|embedding|embed|robotics|computer|aqa|imagen|veo|learnlm|gemma)/i;
  return (j.models || [])
    .filter(m => /flash/i.test(m.name) && (m.supportedGenerationMethods || []).includes('generateContent') && !bad.test(m.name))
    .map(m => {
      const name = m.name.replace(/^models\//, '');
      const v = parseFloat((name.match(/gemini-(\d+(?:\.\d+)?)/) || [0, 0])[1]);
      let rank = v * 100;
      if (/lite/i.test(name)) rank -= 30;
      if (/(preview|exp)/i.test(name)) rank -= 5;
      if (/latest/i.test(name)) rank += 1;
      return { name, rank };
    })
    .sort((a, b) => b.rank - a.rank)
    .map(x => x.name);
}

async function verifyTeacher(accessToken) {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey || !accessToken || typeof accessToken !== 'string') return false;
  try {
    const r = await fetch(`${url}/auth/v1/user`, {
      headers: { apikey: publishableKey, Authorization: `Bearer ${accessToken}` }
    });
    if (!r.ok) return false;
    const user = await r.json().catch(() => null);
    return !!(user && user.id && user.email);
  } catch {
    return false;
  }
}

function cleanQuestions(raw) {
  const arr = Array.isArray(raw) ? raw : [];
  return arr.map(q => {
    const text = String((q && q.text) || '').trim();
    const opts = Array.isArray(q && q.options) ? q.options.map(o => String(o).replace(/^\s*\(?[A-Da-d][\).:]\s+/, '').trim()).filter(Boolean) : [];
    const isMcq = q && q.type !== 'written' && opts.length >= 2;
    if (!text) return null;
    if (!isMcq) return { type: 'written', text, marks: Math.max(1, Number(q && q.marks) || 5), options: [], correctOption: null };
    const options = opts.slice(0, 4);
    while (options.length < 4) options.push('None of the above');
    const rawCorrect = q && q.correctOption;
    const c = typeof rawCorrect === 'string' && /^[A-D]$/i.test(rawCorrect.trim())
      ? rawCorrect.trim().toUpperCase().charCodeAt(0) - 65
      : Number(rawCorrect);
    const validCorrect = rawCorrect !== null && rawCorrect !== undefined &&
      Number.isInteger(c) && c >= 0 && c < options.length;
    return {
      type: 'mcq',
      text,
      marks: Math.max(1, Number(q && q.marks) || 2),
      options,
      correctOption: validCorrect ? c : null
    };
  }).filter(Boolean);
}

export default async function handler(req, res) {
  const key = process.env.GEMINI_API_KEY;

  // စစ်ဆေးရန်: browser မှာ /api/generate-quiz ကို ဖွင့်ကြည့်ရင် key နဲ့ model အခြေအနေ ပြမယ်
  if (req.method === 'GET') {
    const out = { key_set: !!key, key_length: key ? key.length : 0, supabase_configured: !!((process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL) && (process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY)), models: [], tests: [] };
    if (!key) { out.hint = 'Vercel Environment Variables မှာ GEMINI_API_KEY မရှိပါ (ထည့်ပြီးရင် Redeploy လုပ်ရမယ်)'; return res.status(200).json(out); }
    try { out.models = await pickModels(key); } catch (e) { out.list_error = e.message; return res.status(200).json(out); }
    for (const m of out.models.slice(0, 4)) {
      try {
        const r = await gfetch(`${API}/models/${m}:generateContent`, key, { method: 'POST', body: JSON.stringify({ contents: [{ parts: [{ text: 'Reply with the single word OK' }] }] }) }, 15000);
        const j = await r.json().catch(() => ({}));
        out.tests.push({ model: m, http: r.status, ok: r.ok, message: r.ok ? 'အလုပ်လုပ်ပါတယ်' : ((j.error && j.error.message) || 'unknown').slice(0, 300) });
      } catch (e) { out.tests.push({ model: m, ok: false, message: e.message }); }
    }
    return res.status(200).json(out);
  }

  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'POST only' });
  if (!key) return res.status(500).json({ success: false, error: 'Vercel မှာ GEMINI_API_KEY (Environment Variable) မထည့်ရသေးပါ' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  body = body || {};
  const { base64Data, mimeType, customInstruction, accessToken } = body;

  if (!(await verifyTeacher(accessToken))) return res.status(401).json({ success: false, error: 'ဆရာ/ဆရာမ အကောင့် အတည်မပြုနိုင်ပါ။ ပြန်ထွက်ပြီး ပြန်ဝင်ပါ။' });
  if (!base64Data || typeof base64Data !== 'string') return res.status(400).json({ success: false, error: 'ဖိုင် မပါလာပါ' });
  // Vercel serverless request bodies are limited; the frontend caps source files at 3MB.
  if (base64Data.length > 4_200_000) return res.status(413).json({ success: false, error: 'ဖိုင်အရွယ်အစား 3MB အောက်ဖြစ်အောင် လျှော့ပြီး ပြန်တင်ပါ။' });
  if (!ALLOWED.includes(mimeType)) return res.status(400).json({ success: false, error: 'JPEG, PNG, WebP သို့မဟုတ် PDF သာ ရပါတယ်' });

  let models;
  try { models = await pickModels(key); } catch (e) { return res.status(502).json({ success: false, error: 'Gemini model စာရင်း မရပါ: ' + e.message }); }
  if (!models.length) return res.status(502).json({ success: false, error: 'ဒီ key နဲ့ သုံးလို့ရတဲ့ flash model မတွေ့ပါ' });

  let prompt = PROMPT;
  if (customInstruction && String(customInstruction).trim()) prompt += '\nTeacher note: ' + String(customInstruction).trim().slice(0, 500);

  const notes = [];
  let quota = false, busy = false;
  for (const m of models.slice(0, 5)) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const r = await gfetch(`${API}/models/${m}:generateContent`, key, {
          method: 'POST',
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: mimeType, data: base64Data } }] }],
            generationConfig: { responseMimeType: 'application/json', temperature: 0.2 }
          })
        });
        const j = await r.json().catch(() => ({}));
        if (r.ok) {
          const parts = (((j.candidates || [])[0] || {}).content || {}).parts || [];
          const text = parts.map(p => p.text || '').join('');
          let data;
          try { data = JSON.parse(text.replace(/^```json|```$/g, '').trim()); } catch (e) { notes.push(`[${m}] AI အဖြေကို JSON အဖြစ် ဖတ်မရပါ`); break; }
          const questions = cleanQuestions(Array.isArray(data) ? data : data.questions);
          if (!questions.length) { notes.push(`[${m}] မေးခွန်း မတွေ့ပါ`); break; }
          return res.status(200).json({ success: true, title: (data && data.title) || '', description: (data && data.description) || '', questions, model: m });
        }
        const msg = ((j.error && j.error.message) || ('HTTP ' + r.status)).slice(0, 160);
        if (r.status === 429) { quota = true; notes.push(`[${m}] quota: ${msg}`); break; }
        if (r.status === 503 || r.status === 500) { busy = true; notes.push(`[${m}] busy`); if (attempt === 0) { await sleep(1500); continue; } break; }
        notes.push(`[${m}] ${msg}`); break;
      } catch (e) { notes.push(`[${m}] ${e.name === 'AbortError' ? 'timeout' : e.message}`); break; }
    }
  }
  let hint = '';
  if (quota) hint = 'Gemini Free tier တစ်နေ့ကြိမ်ရေ ပြည့်သွားပုံရတယ်။ နောက်တစ်နေ့ ပြန်စမ်းပါ။ ';
  else if (busy) hint = 'Gemini အလုပ်များနေတယ်၊ ခဏနေ ပြန်နှိပ်ပါ။ ';
  return res.status(502).json({ success: false, error: hint + notes.slice(0, 4).join(' | ') });
}
