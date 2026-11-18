
const json = (res, status, payload) => {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8').send(JSON.stringify(payload));
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed.' });
  if (!process.env.GEMINI_API_KEY) return json(res, 503, { error: 'Server မှာ GEMINI_API_KEY မသတ်မှတ်ရသေးပါ။ Vercel Environment Variables ကိုစစ်ပါ။' });
  try {
    const { base64Data, mimeType = 'image/jpeg', customInstruction = '' } = req.body || {};
    if (typeof base64Data !== 'string' || base64Data.length < 100) return json(res, 400, { error: 'ပုံဖိုင် မမှန်ကန်ပါ။' });
    if (base64Data.length > 4300000) return json(res, 413, { error: 'ပုံဖိုင်အရွယ်အစား ကြီးလွန်းနေပါသည်။ 3MB အောက် ပုံကိုသုံးပါ။' });
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) return json(res, 415, { error: 'JPEG, PNG, WebP ပုံများကိုသာ လက်ခံပါသည်။' });

    const model = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
    const prompt = `You are an expert school assessment writer. Read the attached educational image and create a useful quiz. ${String(customInstruction).slice(0, 1200)}
Return ONLY valid JSON with this schema: {"title":"string","description":"string","questions":[{"type":"mcq"|"written","text":"string","marks":2,"options":["A","B","C","D"],"correctOption":0}]}. For every MCQ provide exactly four options and correctOption as zero-based integer 0..3. Written questions must have type written, options [], correctOption null. Use the language of the source where possible. Create 5-12 questions when the image supports it. Do not invent facts not supported by the image.`;

    const upstream = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: prompt },
            { inline_data: { mime_type: mimeType, data: base64Data } }
          ]
        }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.25 }
      })
    });

    const raw = await upstream.json().catch(() => ({}));
    if (!upstream.ok) return json(res, upstream.status === 429 ? 429 : 502, { error: raw.error?.message || 'Gemini AI service မှ အဖြေမရရှိပါ။ API key နှင့် quota ကိုစစ်ပါ။' });

    const text = raw.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
    let parsed;
    try {
      parsed = JSON.parse(text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));
    } catch {
      return json(res, 502, { error: 'AI မှ JSON မမှန်ကန်သော အဖြေပြန်ပေးခဲ့ပါ။ ထပ်မံကြိုးစားပါ။' });
    }

    const questions = Array.isArray(parsed.questions) ? parsed.questions.map(q => {
      const written = q.type === 'written';
      const options = Array.isArray(q.options) ? q.options.slice(0, 4).map(x => String(x).slice(0, 500)) : [];
      const correctOption = Number(q.correctOption);
      if (!written && (options.length !== 4 || !Number.isInteger(correctOption) || correctOption < 0 || correctOption > 3)) return null;
      if (!String(q.text || '').trim()) return null;
      return {
        type: written ? 'written' : 'mcq',
        text: String(q.text).slice(0, 2000),
        marks: Math.max(1, Math.min(100, Number(q.marks) || (written ? 5 : 2))),
        options: written ? [] : options,
        correctOption: written ? null : correctOption
      };
    }).filter(Boolean) : [];

    if (!questions.length) return json(res, 422, { error: 'ပုံထဲမှ အသုံးဝင်သော မေးခွန်း မထုတ်နိုင်ပါ။ ပိုမိုရှင်းလင်းသော ပုံကိုတင်ပါ။' });

    return json(res, 200, {
      title: String(parsed.title || 'AI Generated Quiz').slice(0, 120),
      description: String(parsed.description || '').slice(0, 500),
      questions
    });
  } catch (error) {
    console.error('generate-quiz:', error);
    return json(res, 500, { error: 'AI မေးခွန်းထုတ်ရာတွင် server error ဖြစ်နေပါသည်။' });
  }
}
