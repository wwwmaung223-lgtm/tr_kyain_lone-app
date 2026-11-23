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
  const response = await gfetch(`${API}/models?pageSize=200`, key, {}, 12000);
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
export async function onRequest({ request, env }) {
  // Preserve the exact Secret name already configured in the user's Cloudflare project.
  const key = env.GEMINI_API_KEY || env.GEMINI_APT_KEY;
  if (request.method === 'GET') return json({
    key_set: !!key,
    supabase_configured: !!((env.SUPABASE_URL || env.VITE_SUPABASE_URL) && (env.SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY))
  });
  if (request.method !== 'POST') return json({ success: false, error: 'POST only' }, 405);
  if (!key) return json({ success: false, error: 'Gemini API Secret ကို Cloudflare မှာ မတွေ့ပါ။ Secret name ကို စစ်ဆေးပါ။' }, 500);

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
      if (/^generate approximately/i.test(line.trim())) settings.count = parseInt(line.match(/\\d+/)?.[0] || '10', 10);
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
  const models = await pickModels(key).catch(e => []);
  if (!models.length) return json({ success: false, error: 'Gemini model စာရင်း မရပါ။ API Key သို့မဟုတ် API quota ကို စစ်ဆေးပါ။' }, 502);

  const imagePart = { inline_data: { mime_type: mimeType, data: base64Data } };
  const prompt = \`You are a multimodal OCR specialist, experienced school teacher, assessment designer and answer-key verifier.
First read the uploaded worksheet/photo/PDF page carefully. Internally transcribe the source in reading order, identify its topic, facts, examples, formulas, exercises and any printed answer choices. Then create a classroom-ready quiz grounded ONLY in that uploaded source.

TEACHER SETTINGS:
Subject: \${settings.subject || 'Infer from source'}
Grade: \${settings.grade || 'Appropriate to source'}
Difficulty: \${settings.difficulty || 'Balanced'}
Question format: \${settings.questionType || 'Mixed questions'}
Requested number: \${requestedCount}
Language: \${settings.language || 'Preserve source language'}
Additional instruction: \${String(customInstruction).slice(0, 700)}

Return ONLY valid JSON using this schema:
{"title":"short title","description":"student instruction","sourceText":"faithful concise transcription of the key source content","uncertainParts":["unreadable or ambiguous parts"],"questions":[{"type":"mcq or written","text":"complete question","marks":1,"options":["choice A","choice B","choice C","choice D"],"correctOption":0}]}

QUALITY RULES:
- Read the actual uploaded material, not the sample quiz or assumed subject. Preserve important terminology, formulas, units, names and facts.
- Generate up to \${requestedCount} useful questions. If the source does not support that many, return fewer rather than inventing content.
- If the source is an existing worksheet/question paper, preserve its tested skills and key wording. Do not silently change what is being tested.
- If the source is lesson notes/textbook material, create new questions that test the key ideas actually present in it.
- Use a balanced progression of recall, understanding and application appropriate to grade and difficulty.
- MCQ choices must be plausible, distinct and supported by the topic. Use 3 or 4 choices; never add filler choices just to reach four.
- correctOption is a zero-based index. Verify the answer against the source and your subject knowledge. If uncertain, make it a written question instead of guessing.
- Use written questions for explanations, essays, calculations and questions that cannot be fairly assessed by one MCQ.
- Avoid duplicate, vague, trick or ambiguous questions. Each question must be self-contained.
- If Myanmar + English is selected, provide clear natural bilingual wording while preserving technical meaning.
- Do not claim OCR certainty for blurry text. Put unclear sections in uncertainParts.
- Output JSON only; no markdown fences or commentary.\`;
  let result;
  let generationError;
  for (const model of models.slice(0, 2)) {
    try {
      // One multimodal pass avoids the previous two sequential long-running Gemini requests.
      result = await generate(model, key, [{ text: prompt }, imagePart], 25000);
      break;
    } catch (e) {
      generationError = e;
      if (e.status === 429 || e.name === 'AbortError') break;
    }
  }
  if (!result) {
    const aborted = generationError?.name === 'AbortError' || /abort/i.test(generationError?.message || '');
    return json({ success: false, error: generationError?.status === 429
      ? 'Gemini Free quota ပြည့်နေပါတယ်။ ခဏနားပြီး ပြန်စမ်းပါ။'
      : aborted
        ? 'AI က အချိန်မီ မတုံ့ပြန်နိုင်ပါ။ ပုံအရွယ်အစားကို 3MB အောက်ထားပြီး စာမျက်နှာတစ်မျက်နှာချင်း တင်ပေးပါ။'
        : \`AI မေးခွန်းဖန်တီးမှု မအောင်မြင်ပါ: \${generationError?.message || 'Unknown error'}\` }, 502);
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
    title: String(result.title || extracted.document_title || 'AI Generated Quiz'),
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
