// Cloudflare Pages Function: authenticated worksheet photo/PDF -> grounded quiz via Gemini.
// Keep this function isolated from auth, database and the existing UI.
const API = 'https://generativelanguage.googleapis.com/v1beta';
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
});
async function gfetch(url, key, options = {}, ms = 55000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, {
      ...options, signal: controller.signal,
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key, ...(options.headers || {}) }
    });
  } finally { clearTimeout(timer); }
}
async function pickModels(key) {
  const response = await gfetch(`${API}/models?pageSize=200`, key, {}, 5000);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message || `models list HTTP ${response.status}`);
  const bad = /(image|tts|live|audio|embedding|embed|robotics|computer|aqa|imagen|veo|learnlm|gemma)/i;
  return (data.models || [])
    .filter(m => /flash/i.test(m.name) && (m.supportedGenerationMethods || []).includes('generateContent') && !bad.test(m.name))
    .map(m => {
      const name = m.name.replace(/^models\//, '');
      const version = parseFloat((name.match(/gemini-(\d+(?:\.\d+)?)/) || [0, 0])[1]);
      return { name, rank: version * 100 + (/latest/i.test(name) ? 1 : 0) - (/(preview|exp|lite)/i.test(name) ? 5 : 0) };
    }).sort((a, b) => b.rank - a.rank).map(x => x.name);
}
async function verifyTeacher(env, token) {
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const key = env.SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key || !token || typeof token !== 'string') return false;
  try {
    const r = await fetch(`${url}/auth/v1/user`, { headers: { apikey: key, Authorization: `Bearer ${token}` } });
    if (!r.ok) return false;
    const user = await r.json().catch(() => null);
    return !!(user?.id && user?.email);
  } catch { return false; }
}
function extractJson(text) {
  const clean = String(text || '').replace(/^\uFEFF/, '').replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  const start = clean.indexOf('{');
  const end = clean.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('AI က ဖတ်ရှုရလဒ်ကို JSON အဖြစ် မပေးနိုင်ပါ။ ထပ်စမ်းပါ။');
  return JSON.parse(clean.slice(start, end + 1));
}
function cleanQuestions(raw, requestedCount) {
  if (!Array.isArray(raw)) return [];
  const result = [];
  for (const q of raw) {
    const text = String(q?.text || '').trim();
    if (!text) continue;
    const options = Array.isArray(q?.options)
      ? q.options.map(o => String(o).replace(/^\s*\(?[A-Da-d][\).:]\s+/, '').trim()).filter(Boolean).slice(0, 4)
      : [];
    const type = q?.type === 'written' || options.length < 2 ? 'written' : 'mcq';
    let correctOption = null;
    if (type === 'mcq') {
      const rawAnswer = q?.correctOption;
      const candidate = typeof rawAnswer === 'string' && /^[A-D]$/i.test(rawAnswer.trim())
        ? rawAnswer.trim().toUpperCase().charCodeAt(0) - 65 : Number(rawAnswer);
      if (Number.isInteger(candidate) && candidate >= 0 && candidate < options.length) correctOption = candidate;
    }
    result.push({
      type, text,
      marks: Math.max(1, Math.min(20, Number(q?.marks) || (type === 'mcq' ? 1 : 3))),
      options: type === 'mcq' ? options : [],
      correctOption: type === 'mcq' ? correctOption : null
    });
    if (result.length >= requestedCount) break;
  }
  return result;
}
async function generate(model, key, parts, ms = 55000) {
  const response = await gfetch(`${API}/models/${model}:generateContent`, key, {
    method: 'POST',
    body: JSON.stringify({
      contents: [{ role: 'user', parts }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.15, maxOutputTokens: 8192 }
    })
  }, ms);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error?.message || `Gemini HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  const text = (data.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('');
  if (!text) throw new Error('Gemini က အဖြေဗလာ ပြန်ပေးပါတယ်။');
  return extractJson(text);
}
async function generateOpenAICompatible({ endpoint, key, model, prompt, mimeType, base64Data, provider }) {
  const imageUrl = `data:${mimeType};base64,${base64Data}`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: imageUrl, detail: 'high' } }
      ] }],
      temperature: 0.15,
      max_tokens: 8192,
      response_format: { type: 'json_object' }
    }),
    signal: AbortSignal.timeout(45000)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error?.message || `${provider} HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  const output = data.choices?.[0]?.message?.content;
  if (!output) throw new Error(`${provider} က အဖြေဗလာ ပြန်ပေးပါတယ်။`);
  return extractJson(output);
}
async function generateOpenAI(key, prompt, mimeType, base64Data) {
  return generateOpenAICompatible({
    endpoint: 'https://api.openai.com/v1/chat/completions', key,
    model: 'gpt-4.1-mini', prompt, mimeType, base64Data, provider: 'OpenAI'
  });
}
async function generateGroq(key, prompt, mimeType, base64Data) {
  return generateOpenAICompatible({
    endpoint: 'https://api.groq.com/openai/v1/chat/completions', key,
    model: 'qwen/qwen3.8-27b', prompt, mimeType, base64Data, provider: 'Groq'
  });
}
export async function onRequest({ request, env }) {
  // Preserve the exact Secret name already configured in the user's Cloudflare project.
  const key = env.GEMINI_API_KEY || env.GEMINI_APT_KEY;
  const openaiKey = env.OPENAI_API_KEY;
  const groqKey = env.GROQ_API_KEY;
  if (request.method === 'GET') return json({
    key_set: !!(key || openaiKey || groqKey),
    providers: { gemini: !!key, openai: !!openaiKey, groq: !!groqKey },
    supabase_configured: !!((env.SUPABASE_URL || env.VITE_SUPABASE_URL) && (env.SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY))
  });
  if (request.method !== 'POST') return json({ success: false, error: 'POST only' }, 405);
  if (!key && !openaiKey && !groqKey) return json({ success: false, error: 'AI Provider Secret မတွေ့ပါ။ Gemini, OpenAI သို့မဟုတ် Groq API key တစ်ခုခု ထည့်ပါ။' }, 500);

  let body;
  try { body = await request.json(); } catch { return json({ success: false, error: 'ပို့လိုက်တဲ့အချက်အလက်ကို ဖတ်မရပါ။' }, 400); }
  const { base64Data, mimeType, customInstruction = '', accessToken } = body || {};
  if (!(await verifyTeacher(env, accessToken))) return json({ success: false, error: 'ဆရာ/ဆရာမ အကောင့် အတည်မပြုနိုင်ပါ။ ပြန်ဝင်ပြီး ထပ်စမ်းပါ။' }, 401);
  if (!base64Data || typeof base64Data !== 'string') return json({ success: false, error: 'ပုံ သို့မဟုတ် PDF ဖိုင် မပါလာပါ။' }, 400);
  if (base64Data.length > 4_200_000) return json({ success: false, error: 'ဖိုင်အရွယ်အစား 3MB အောက်ဖြစ်အောင် လျှော့ပါ။' }, 413);
  if (!ALLOWED.includes(mimeType)) return json({ success: false, error: 'JPEG, PNG, WebP သို့မဟုတ် PDF ဖိုင်သာ တင်နိုင်ပါတယ်။' }, 400);

  let settings = {};
  for (const line of String(customInstruction).split('\n')) {
    const idx = line.indexOf(':');
    if (idx < 0) {
      if (/^generate approximately/i.test(line.trim())) settings.count = parseInt(line.match(/[0-9]+/)?.[0] || '10', 10);
      continue;
    }
    const label = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (label === 'subject') settings.subject = value;
    if (label === 'grade') settings.grade = value;
    if (label === 'difficulty') settings.difficulty = value;
    if (label === 'question type') settings.questionType = value;
    if (label === 'language') settings.language = value;
  }
  const requestedCount = Math.max(1, Math.min(30, Number(settings.count) || 10));
  // Multi-provider routing: OpenAI and Groq handle images; Gemini also handles PDFs.
  const imageOnly = mimeType !== 'application/pdf';
  const providers = [];
  if (imageOnly && openaiKey) providers.push({ name: 'OpenAI', run: () => generateOpenAI(openaiKey, prompt, mimeType, base64Data) });
  if (imageOnly && groqKey) providers.push({ name: 'Groq', run: () => generateGroq(groqKey, prompt, mimeType, base64Data) });
  if (key) {
    const models = await pickModels(key).catch(() => []);
    for (const model of models.slice(0, 4)) {
      providers.push({ name: `Gemini (${model})`, run: () => generate(model, key, [{ text: prompt }, imagePart], 18000) });
    }
  }
  let result;
  let generationError;
  for (const provider of providers) {
    try {
      result = await provider.run();
      break;
    } catch (e) {
      generationError = e;
      const message = String(e.message || '').toLowerCase();
      const transient = e.status === 429 || e.status === 500 || e.status === 502 || e.status === 503 || e.status === 504 ||
        /high demand|overloaded|temporarily unavailable|resource_exhausted|rate limit/i.test(message);
      // Fail over on transient provider errors; stop on invalid credentials or malformed requests.
      if (!transient && e.status !== undefined) continue;
      if (!transient) continue;
    }
  }
  if (!result) {
    const aborted = generationError?.name === 'AbortError' || /abort/i.test(generationError?.message || '');
    return json({ success: false, error: generationError?.status === 429
      ? 'Gemini Free quota ပြည့်နေပါတယ်။ ခဏနားပြီး ပြန်စမ်းပါ။'
      : aborted
        ? 'AI က အချိန်မီ မတုံ့ပြန်နိုင်ပါ။ ပုံအရွယ်အစားကို 3MB အောက်ထားပြီး စာမျက်နှာတစ်မျက်နှာချင်း တင်ပေးပါ။'
        : `AI မေးခွန်းဖန်တီးမှု မအောင်မြင်ပါ: ${generationError?.message || 'Unknown error'}` }, 502);
  }
  const sourceText = String(result.sourceText || '').trim();
  const uncertainParts = Array.isArray(result.uncertainParts) ? result.uncertainParts : [];
  if (!Array.isArray(result.questions) || !result.questions.length) return json({
    success: false,
    error: sourceText
      ? 'ပုံထဲက အကြောင်းအရာကို ဖတ်နိုင်ပေမဲ့ မေးခွန်းမထုတ်နိုင်ပါ။ ပိုကြည်လင်တဲ့ပုံ သို့မဟုတ် စာမျက်နှာတစ်မျက်နှာချင်း စမ်းပါ။'
      : 'ပုံထဲက စာသားကို မဖတ်နိုင်ပါ။ ပိုကြည်လင်တဲ့ပုံ၊ အလင်းကောင်းတဲ့ပုံ သို့မဟုတ် စာမျက်နှာတစ်မျက်နှာချင်း တင်ပေးပါ။',
    uncertainParts
  }, 422);
  const questions = cleanQuestions(result.questions, requestedCount);
  if (!questions.length) return json({ success: false, error: 'ဖတ်ရှုထားတဲ့စာသားကနေ မေးခွန်းထုတ်မရပါ။ ပိုကြည်လင်တဲ့ပုံ သို့မဟုတ် အခြားစာမျက်နှာကို စမ်းပါ။' }, 422);
  const missingKeys = questions.filter(q => q.type === 'mcq' && q.correctOption === null).length;
  return json({
    success: true,
    title: String(result.title || 'AI Generated Quiz'),
    description: String(result.description || ''),
    questions,
    diagnostics: {
      sourceTextLength: sourceText.length,
      generatedQuestionCount: questions.length,
      requestedQuestionCount: requestedCount,
      uncertainParts,
      mcqAnswersNeedingTeacherReview: missingKeys
    }
  });
}
