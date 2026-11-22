import React, { useEffect, useMemo, useState } from 'react';
import { BookOpen, ClipboardCheck, GraduationCap, Loader2, Sparkles, ShieldCheck, WandSparkles } from 'lucide-react';
import TeacherExamRooms from './TeacherExamRooms.jsx';

const agents = [
  { id: 'question', label: 'Question Agent', mm: 'မေးခွန်းဖန်တီးသူ', icon: BookOpen, hint: 'မေးခွန်းစာသား၊ စာအုပ်အပိုင်း သို့မဟုတ် OCR ထုတ်ထားသောစာသားကို ထည့်ပါ။' },
  { id: 'gradebook', label: 'Gradebook Agent', mm: 'အမှတ်စာရင်းသုံးသပ်သူ', icon: ClipboardCheck, hint: 'ကျောင်းသားအမည်၊ ရမှတ်၊ ဘာသာရပ်နှင့် အများဆုံးအမှတ်တို့ကို ထည့်ပါ။' },
  { id: 'exam', label: 'Exam Agent', mm: 'စာမေးပွဲအကူ', icon: GraduationCap, hint: 'စာမေးပွဲအစီအစဉ်၊ marking guide သို့မဟုတ် အမှတ်ပေးရန်အချက်အလက် ထည့်ပါ။' },
  { id: 'teaching', label: 'Teaching Agent', mm: 'သင်ကြားရေးအကူ', icon: WandSparkles, hint: 'အတန်း၊ ဘာသာရပ်၊ သင်ခန်းစာခေါင်းစဉ်နှင့် သင်ယူရမည့်ရည်မှန်းချက် ထည့်ပါ။' }
];

export default function TeacherAIWorkspace({ supabase, user, onClose }) {
  const [agent, setAgent] = useState('question');
  const [provider, setProvider] = useState('auto');
  const [language, setLanguage] = useState('my-en');
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [providerState, setProviderState] = useState([]);
  const [paidFallback, setPaidFallback] = useState(false);
  const [admin, setAdmin] = useState(false);
  const [grantEmail, setGrantEmail] = useState('');
  const [grantNote, setGrantNote] = useState('');
  const [grantBusy, setGrantBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const active = useMemo(() => agents.find(item => item.id === agent) || agents[0], [agent]);

  useEffect(() => {
    let live = true;
    fetch('/api/ai-router').then(r => r.json()).then(data => {
      if (live) { setProviderState(data.providers || []); setPaidFallback(Boolean(data.paidFallbackEnabled)); }
    }).catch(() => { if (live) setProviderState([]); });
    if (user?.id && supabase) supabase.rpc('is_platform_admin').then(({data}) => { if (live) setAdmin(data === true); });
    return () => { live = false; };
  }, [supabase, user?.id]);

  const run = async e => {
    e.preventDefault(); setBusy(true); setError(''); setResult(null); setNotice('');
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData?.session?.access_token) throw new Error('Session သက်တမ်းကုန်နေပါပြီ။ ပြန်ဝင်ပါ။');
      const response = await fetch('/api/ai-router', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task: agent, provider: provider === 'auto' ? undefined : provider,
          accessToken: sessionData.session.access_token,
          deviceId: window.localStorage.getItem('tr_kyain_lone_device_id') || '',
          input: { language, request: input.trim() }
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.error || 'AI request မအောင်မြင်ပါ။');
      setResult(data);
    } catch (err) { setError(err.message || 'တစ်ခုခုမှားယွင်းနေပါသည်။'); }
    finally { setBusy(false); }
  };

  const grantLifetime = async e => {
    e.preventDefault(); setGrantBusy(true); setError(''); setNotice('');
    try {
      const { error: grantError } = await supabase.rpc('grant_teacher_ai_lifetime', { p_email: grantEmail.trim(), p_note: grantNote.trim() || null });
      if (grantError) throw grantError;
      setNotice('AI Lifetime access ပေးပြီးပါပြီ။'); setGrantEmail(''); setGrantNote('');
    } catch (err) { setError(err.message || 'Lifetime access မပေးနိုင်ပါ။'); }
    finally { setGrantBusy(false); }
  };

  return <div className="space-y-4 pb-8">
    <header className="rounded-3xl bg-gradient-to-br from-slate-950 via-indigo-950 to-violet-900 p-5 text-white shadow-xl">
      <div className="flex items-start justify-between gap-3">
        <div><p className="text-[10px] font-black tracking-[.18em] text-indigo-200">TEACHER WORKSPACE · AI STUDIO</p><h2 className="mt-1 text-2xl font-black">AI Agents</h2><p className="mt-1 text-xs text-indigo-100">အလုပ်တစ်ခုချင်းအတွက် သီးသန့် AI အကူများ</p></div>
        <button onClick={onClose} className="rounded-full bg-white/15 px-3 py-2 text-xs font-bold">ပိတ်မည်</button>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">{providerState.map(item => <span key={item.id} className="rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[10px]">{item.id}: {item.configured ? 'Ready' : 'Key မရှိသေး'}</span>)}</div>
    </header>

    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {agents.map(item => { const Icon = item.icon; return <button key={item.id} onClick={() => {setAgent(item.id);setResult(null);setError('');}} className={'rounded-2xl border p-3 text-left transition '+(agent===item.id?'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-100':'border-slate-200 bg-white')}><Icon className="h-5 w-5 text-indigo-600"/><p className="mt-2 text-xs font-black text-slate-900">{item.label}</p><p className="mt-0.5 text-[10px] text-slate-500">{item.mm}</p></button>; })}
    </div>

    <form onSubmit={run} className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
      <div><h3 className="font-extrabold text-slate-900">{active.mm}</h3><p className="mt-1 text-xs text-slate-500">{active.hint}</p></div>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-[11px] font-bold text-slate-600">AI Provider<select value={provider} onChange={e=>setProvider(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 text-xs"><option value="auto">Smart Auto (Free first)</option><option value="gemini">Gemini</option><option value="openai">OpenAI</option><option value="anthropic">Claude</option></select></label>
        <label className="text-[11px] font-bold text-slate-600">Language<select value={language} onChange={e=>setLanguage(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 text-xs"><option value="my-en">မြန်မာ + English</option><option value="my">မြန်မာ</option><option value="en">English</option></select></label>
      </div>
      <textarea value={input} onChange={e=>setInput(e.target.value)} required rows={7} maxLength={12000} placeholder="သင့်တောင်းဆိုချက်နှင့် အချက်အလက်များကို ဒီမှာထည့်ပါ..." className="w-full rounded-2xl border border-slate-200 p-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"/>
      <button disabled={busy || !input.trim()} className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3 text-sm font-extrabold text-white disabled:opacity-50">{busy?<Loader2 className="h-4 w-4 animate-spin"/>:<Sparkles className="h-4 w-4"/>}{busy?'AI လုပ်ဆောင်နေသည်...':'AI Agent ကို စတင်မည်'}</button>
      <p className="text-[10px] text-slate-500">AI အဖြေများသည် အကြံပြုချက်သာဖြစ်ပြီး အမှတ်ပေးခြင်းနှင့် စာမေးပွဲအဖြေများကို ဆရာ/ဆရာမက စစ်ဆေးအတည်ပြုရပါမည်။</p>
    </form>

    {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">{error}</p>}
    {notice && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">{notice}</p>}
    {result && <section className="rounded-3xl border border-emerald-200 bg-white p-4 shadow-sm"><div className="flex items-center gap-2 text-emerald-700"><ShieldCheck className="h-5 w-5"/><h3 className="font-extrabold">Teacher Review Required</h3></div><p className="mt-1 text-[10px] text-slate-500">Provider: {result.provider} · မသိမ်းဆည်းရသေးပါ</p><pre className="mt-3 max-h-[28rem] overflow-auto whitespace-pre-wrap break-words rounded-xl bg-slate-950 p-3 text-[11px] leading-5 text-emerald-100">{JSON.stringify(result.result,null,2)}</pre></section>}

    <TeacherExamRooms supabase={supabase} user={user} />

    {admin && <section className="rounded-3xl border-2 border-violet-200 bg-white p-4 shadow-sm space-y-3"><div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-violet-700"/><h3 className="font-extrabold">Admin · AI Lifetime Access</h3></div><p className="text-xs text-slate-500">ဆရာ/ဆရာမ၏ registered email ဖြင့် AI Agent ကို အမြဲတမ်းအသုံးပြုခွင့်ပေးနိုင်သည်။</p><form onSubmit={grantLifetime} className="space-y-2"><input type="email" required value={grantEmail} onChange={e=>setGrantEmail(e.target.value)} placeholder="Teacher account email" className="w-full rounded-xl border p-3 text-sm"/><input value={grantNote} onChange={e=>setGrantNote(e.target.value)} placeholder="မှတ်ချက် (Optional)" className="w-full rounded-xl border p-3 text-sm"/><button disabled={grantBusy} className="w-full rounded-xl bg-violet-700 py-3 text-sm font-extrabold text-white disabled:opacity-50">{grantBusy?'လုပ်ဆောင်နေသည်...':'Lifetime AI Access ပေးမည်'}</button></form></section>}
  </div>;
}
