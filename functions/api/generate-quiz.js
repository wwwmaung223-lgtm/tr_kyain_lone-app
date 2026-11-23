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
      const name = m.name.replace(/^models\\//, '');
      const version = parseFloat((name.match(/gemini-(\\d+(?:\\.\\d+)?)/) || [0, 0])[1]);
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
  const clean = String(text || '').replace(/^\uFEFF/, '').replace(/^```(?:json)?\\s*/i, '').replace(/\\s*```$/, '').trim();
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
      ? q.options.map(o => String(o).replace(/^\\s*\\(?[A-Da-d][\\).:]\\s+/, '').trim()).filter(Boolean).slice(0, 4)
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
  for (const line of String(customInstruction).split('\\n')) {
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const label = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (label === 'subject') settings.subject = value;
    if (label === 'grade') settings.grade = value;
    if (label === 'difficulty') settings.difficulty = value;
    if (label === 'question type') settings.questionType = value;
    if (label.startsWith('generate approximately')) settings.count = parseInt(value, 10);
    if (label === 'language') settings.language = value;
  }
  const requestedCount = Math.max(1, Math.min(30, Number(settings.count) || 10));
  const models = await pickModels(key).catch(e => []);
  if (!models.length) return json({ success: false, error: 'Gemini model စာရင်း မရပါ။ API Key သို့မဟုတ် API quota ကို စစ်ဆေးပါ။' }, 502);

  const imagePart = { inline_data: { mime_type: mimeType, data: base64Data } };
  const extractionPrompt = `You are an expert OCR and document-understanding agent for school materials.
Read the uploaded page carefully. Preserve all meaningful educational content, formulas, symbols, diagrams described in words, headings, examples, and any questions/answer choices exactly as printed.
Return JSON only with this schema:
{"document_title":"string","source_language":"string","source_text":"complete faithful transcription in reading order","existing_questions":[{"question":"string","choices":["string"],"printed_answer":"string or empty","marks":number or null}],"uncertain_parts":["short description of anything unreadable"]}
Do not invent missing words. Mark unreadable text as [unclear]. Keep page order. If the image contains exercises, include every exercise item in existing_questions. If it contains lesson notes rather than questions, existing_questions may be empty.`;
  let extracted;
  let lastError;
  for (const model of models.slice(0, 3)) {
    try {
      extracted = await generate(model, key, [{ text: extractionPrompt }, imagePart]);
      break;
    } catch (e) { lastError = e; if (e.status === 429) break; }
  }
  if (!extracted) return json({ success: false, error: lastError?.status === 429
    ? 'Gemini Free quota ပြည့်နေပါတယ်။ ခဏနားပြီး ပြန်စမ်းပါ။'
    : `ပုံထဲက စာသားဖတ်တဲ့အဆင့် မအောင်မြင်ပါ: ${lastError?.message || 'Unknown error'}` }, 502);
  const sourceText = String(extracted.source_text || '').trim();
  const existingQuestions = Array.isArray(extracted.existing_questions) ? extracted.existing_questions : [];
  if (!sourceText && !existingQuestions.length) return json({
    success: false, error: 'ပုံထဲက စာသားကို မဖတ်နိုင်ပါ။ ပိုကြည်လင်တဲ့ပုံ၊ အလင်းကောင်းတဲ့ပုံ သို့မဟုတ် စာမျက်နှာတစ်မျက်နှာချင်း တင်ပေးပါ။',
    uncertainParts: extracted.uncertain_parts || []
  }, 422);

  const generationPrompt = `You are a senior teacher, assessment designer and answer-key verifier.
Create a classroom-ready quiz using ONLY the source material below.
TEACHER SETTINGS:
Subject: ${settings.subject || 'Infer from source'}
Grade: ${settings.grade || 'Appropriate to source'}
Difficulty: ${settings.difficulty || 'Balanced'}
Question format: ${settings.questionType || 'Mixed questions'}
Requested number: ${requestedCount}
Language: ${settings.language || 'Preserve source language'}
Additional instruction: ${String(customInstruction).slice(0, 700)}

SOURCE DOCUMENT TITLE: ${extracted.document_title || ''}
SOURCE TEXT:
${sourceText.slice(0, 24000)}
EXISTING EXERCISES:
${JSON.stringify(existingQuestions).slice(0, 12000)}
OCR UNCERTAINTIES:
${JSON.stringify(extracted.uncertain_parts || [])}

Return JSON only:
{"title":"short title","description":"short student instruction","questions":[{"type":"mcq or written","text":"question","marks":1,"options":["A text","B text","C text","D text"],"correctOption":0}]}
QUALITY RULES:
- Generate exactly ${requestedCount} useful questions when the source has enough information. If it does not, return fewer rather than inventing facts.
- If source is an existing question paper or exercise sheet, preserve its tested skills and wording; you may improve formatting but do not silently change what is being tested.
- If source is lesson notes/textbook content, create fresh questions that test the key ideas in the source.
- Use a balanced mix of recall, understanding and application appropriate to the grade and difficulty.
- For MCQ, provide 3 or 4 plausible distinct options. Never add filler options such as "None of the above" just to reach four.
- correctOption must be the zero-based index of the demonstrably correct answer. Check it against the source; if the source does not support a reliable key, use type "written" instead.
- Use written questions for calculations, explanations, essays, and tasks that cannot be fairly graded by one MCQ answer.
- Preserve mathematical notation, units, names and subject terminology. Do not fabricate diagrams or facts.
- For Myanmar + English, use clear natural Myanmar and English while preserving the original technical meaning.
- Every question must be self-contained. Avoid duplicates and vague questions.
- Output only valid JSON.`;
  let result;
  let generationError;
  for (const model of models.slice(0, 3)) {
    try {
      result = await generate(model, key, [{ text: generationPrompt }]);
      break;
    } catch (e) { generationError = e; if (e.status === 429) break; }
  }
  if (!result) return json({ success: false, error: generationError?.status === 429
    ? 'Gemini Free quota ပြည့်နေပါတယ်။ ခဏနားပြီး ပြန်စမ်းပါ။'
    : `မေးခွန်းဖန်တီးတဲ့အဆင့် မအောင်မြင်ပါ: ${generationError?.message || 'Unknown error'}` }, 502);

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
      extractedExerciseCount: existingQuestions.length,
      generatedQuestionCount: questions.length,
      requestedQuestionCount: requestedCount,
      uncertainParts: extracted.uncertain_parts || [],
      mcqAnswersNeedingTeacherReview: missingKeys
    }
  });
}
