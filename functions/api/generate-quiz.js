// Cloudflare Pages Function: authenticated worksheet photo/PDF -> quiz via Gemini.
// Required Pages secrets: GEMINI_API_KEY. Supabase URL/key are supplied as Pages vars.
const API = 'https://generativelanguage.googleapis.com/v1beta';
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const PROMPT = `You convert a school question sheet (photo or PDF) into a quiz. Extract EVERY question in order.
Return ONLY JSON: {"title": string, "description": string, "questions": [{"type": "mcq" or "written", "text": string, "marks": number, "options": [string], "correctOption": number or null}]}.
Rules:
- type "mcq" when answer choices are printed. options = choice texts WITHOUT letter labels. correctOption = 0-based index; use your own knowledge.
- type "written" when there are no printed choices: options = [] and correctOption = null.
- marks: use printed marks if shown, otherwise 2 for mcq and 5 for written.
- Keep original language and wording. title: short title from sheet or "". description: "".`;
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
async function gfetch(url, key, options = {}, ms = 40000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try { return await fetch(url, { ...options, signal: controller.signal, headers: { 'content-type': 'application/json', 'x-goog-api-key': key, ...(options.headers || {}) } }); }
  finally { clearTimeout(timer); }
}
async function pickModels(key) {
  const response = await gfetch(`${API}/models?pageSize=200`, key, {}, 10000);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message || `models list HTTP ${response.status}`);
  const bad = /(image|tts|live|audio|embedding|embed|robotics|computer|aqa|imagen|veo|learnlm|gemma)/i;
  return (data.models || []).filter(m => /flash/i.test(m.name) && (m.supportedGenerationMethods || []).includes('generateContent') && !bad.test(m.name))
    .map(m => { const name=m.name.replace(/^models\//,''); const v=parseFloat((name.match(/gemini-(\d+(?:\.\d+)?)/)||[0,0])[1]); let rank=v*100; if(/lite/i.test(name))rank-=30; if(/(preview|exp)/i.test(name))rank-=5; if(/latest/i.test(name))rank+=1; return {name,rank}; })
    .sort((a,b)=>b.rank-a.rank).map(x=>x.name);
}
async function verifyTeacher(env, token) {
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const key = env.SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key || !token || typeof token !== 'string') return false;
  try {
    const r=await fetch(`${url}/auth/v1/user`,{headers:{apikey:key,Authorization:`Bearer ${token}`}});
    if(!r.ok)return false; const u=await r.json().catch(()=>null); return !!(u?.id && u?.email);
  } catch { return false; }
}
function cleanQuestions(raw) {
  return (Array.isArray(raw)?raw:[]).map(q=>{
    const text=String(q?.text||'').trim();
    const opts=Array.isArray(q?.options)?q.options.map(o=>String(o).replace(/^\s*\(?[A-Da-d][\).:]\s+/,'').trim()).filter(Boolean):[];
    if(!text)return null;
    if(q?.type==='written'||opts.length<2)return {type:'written',text,marks:Math.max(1,Number(q?.marks)||5),options:[],correctOption:null};
    const options=opts.slice(0,4); while(options.length<4)options.push('None of the above');
    const raw=q?.correctOption; const c=typeof raw==='string'&&/^[A-D]$/i.test(raw.trim())?raw.trim().toUpperCase().charCodeAt(0)-65:Number(raw);
    return {type:'mcq',text,marks:Math.max(1,Number(q?.marks)||2),options,correctOption:raw!==null&&raw!==undefined&&Number.isInteger(c)&&c>=0&&c<options.length?c:null};
  }).filter(Boolean);
}
export async function onRequest({ request, env }) {
  // Accept the original Pages secret name used in the dashboard as well as the canonical name.
  const key=env.GEMINI_API_KEY || env.GEMINI_APT_KEY;
  if(request.method==='GET') return json({key_set:!!key,supabase_configured:!!((env.SUPABASE_URL||env.VITE_SUPABASE_URL)&&(env.SUPABASE_PUBLISHABLE_KEY||env.VITE_SUPABASE_PUBLISHABLE_KEY))});
  if(request.method!=='POST')return json({success:false,error:'POST only'},405);
  if(!key)return json({success:false,error:'GEMINI_API_KEY ကို Cloudflare Pages Secret ထဲ မထည့်ရသေးပါ'},500);
  let body; try { body=await request.json(); } catch { return json({success:false,error:'Invalid JSON'},400); }
  const {base64Data,mimeType,customInstruction,accessToken}=body||{};
  if(!(await verifyTeacher(env,accessToken)))return json({success:false,error:'ဆရာ/ဆရာမ အကောင့် အတည်မပြုနိုင်ပါ။ ပြန်ထွက်ပြီး ပြန်ဝင်ပါ။'},401);
  if(!base64Data||typeof base64Data!=='string')return json({success:false,error:'ဖိုင် မပါလာပါ'},400);
  if(base64Data.length>4_200_000)return json({success:false,error:'ဖိုင်အရွယ်အစား 3MB အောက်ဖြစ်အောင် လျှော့ပြီး ပြန်တင်ပါ။'},413);
  if(!ALLOWED.includes(mimeType))return json({success:false,error:'JPEG, PNG, WebP သို့မဟုတ် PDF သာ ရပါတယ်'},400);
  let models; try { models=await pickModels(key); } catch(e) { return json({success:false,error:'Gemini model စာရင်း မရပါ: '+e.message},502); }
  if(!models.length)return json({success:false,error:'ဒီ key နဲ့ သုံးလို့ရတဲ့ flash model မတွေ့ပါ'},502);
  let prompt=PROMPT; if(customInstruction&&String(customInstruction).trim())prompt+='\nTeacher note: '+String(customInstruction).trim().slice(0,500);
  const notes=[]; let quota=false,busy=false;
  for(const model of models.slice(0,5)) for(let attempt=0;attempt<2;attempt++) {
    try {
      const r=await gfetch(`${API}/models/${model}:generateContent`,key,{method:'POST',body:JSON.stringify({contents:[{parts:[{text:prompt},{inline_data:{mime_type:mimeType,data:base64Data}}]}],generationConfig:{responseMimeType:'application/json',temperature:0.2}})});
      const j=await r.json().catch(()=>({}));
      if(r.ok){const parts=j.candidates?.[0]?.content?.parts||[];const raw=parts.map(p=>p.text||'').join('');let data;try{data=JSON.parse(raw.replace(/^```json|```$/g,'').trim());}catch{notes.push(`[${model}] AI အဖြေကို JSON အဖြစ် ဖတ်မရပါ`);break;}const questions=cleanQuestions(Array.isArray(data)?data:data.questions);if(!questions.length){notes.push(`[${model}] မေးခွန်း မတွေ့ပါ`);break;}return json({success:true,title:data?.title||'',description:data?.description||'',questions,model});}
      const msg=(j.error?.message||`HTTP ${r.status}`).slice(0,160);
      if(r.status===429){quota=true;notes.push(`[${model}] quota: ${msg}`);break;}
      if(r.status===503||r.status===500){busy=true;notes.push(`[${model}] busy`);if(attempt===0){await new Promise(r=>setTimeout(r,1500));continue;}break;}
      notes.push(`[${model}] ${msg}`);break;
    } catch(e){notes.push(`[${model}] ${e.name==='AbortError'?'timeout':e.message}`);break;}
  }
  const hint=quota?'Gemini Free tier တစ်နေ့ကြိမ်ရေ ပြည့်သွားပုံရတယ်။ နောက်တစ်နေ့ ပြန်စမ်းပါ။ ':busy?'Gemini အလုပ်များနေတယ်၊ ခဏနေ ပြန်နှိပ်ပါ။ ':'';
  return json({success:false,error:hint+notes.slice(0,4).join(' | ')},502);
}
