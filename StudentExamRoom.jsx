import React, { useEffect, useState } from 'react';
import { BookOpen, CheckCircle2, Loader2, Send } from 'lucide-react';

export default function StudentExamRoom({ supabase, joinCode }) {
  const [name,setName]=useState('');
  const [studentCode,setStudentCode]=useState('');
  const [participant,setParticipant]=useState(null);
  const [quiz,setQuiz]=useState(null);
  const [answers,setAnswers]=useState({});
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');

  useEffect(()=>{ if(!supabase) setError('စာမေးပွဲဝန်ဆောင်မှုကို ချိတ်ဆက်မရပါ။'); },[supabase]);

  useEffect(()=>{
    let active=true;
    const resume=async()=>{
      if(!supabase||!joinCode)return;
      try{
        const saved=JSON.parse(sessionStorage.getItem('exam-room:'+String(joinCode).toUpperCase())||'null');
        if(!saved?.participant_id||!saved?.participant_token)return;
        const {data,error:resumeError}=await supabase.rpc('resume_exam_room',{
          p_join_code:String(joinCode).trim().toUpperCase(),
          p_participant_id:saved.participant_id,
          p_participant_token:saved.participant_token
        });
        if(resumeError)throw resumeError;
        if(!active)return;
        setName(data.student_name||saved.student_name||'');
        setStudentCode(saved.student_code||'');
        setParticipant(data);setAnswers(data.answers||{});setQuiz(data.student_data);
      }catch(err){sessionStorage.removeItem('exam-room:'+String(joinCode).toUpperCase());}
    };
    resume();
    return()=>{active=false;};
  },[supabase,joinCode]);

  // Refresh room state while the student is in the exam so a teacher ending the room locks the UI promptly.
  useEffect(()=>{
    if(!participant?.participant_id||!supabase||!joinCode)return;
    let active=true;
    const refreshRoom=async()=>{
      const {data,error:refreshError}=await supabase.rpc('resume_exam_room',{
        p_join_code:String(joinCode).trim().toUpperCase(),
        p_participant_id:participant.participant_id,
        p_participant_token:participant.participant_token
      });
      if(!active||refreshError||!data)return;
      setParticipant(current=>current?({...current,room_status:data.room_status,participant_status:data.participant_status}):current);
    };
    const timer=window.setInterval(refreshRoom,8000);
    return()=>{active=false;window.clearInterval(timer);};
  },[supabase,joinCode,participant?.participant_id,participant?.participant_token]);

  const join=async e=>{
    e.preventDefault();setBusy(true);setError('');setNotice('');
    try{
      const {data,error:joinError}=await supabase.rpc('join_exam_room',{
        p_join_code:String(joinCode||'').trim().toUpperCase(),
        p_student_name:name.trim(),
        p_student_code:studentCode.trim()||null
      });
      if(joinError)throw joinError;
      if(!data?.student_data?.questions?.length)throw new Error('မေးခွန်းစာရင်း မတွေ့ပါ။ ဆရာ/ဆရာမကို ဆက်သွယ်ပါ။');
      setParticipant(data);setAnswers(data.answers||{});setQuiz(data.student_data);
      sessionStorage.setItem('exam-room:'+String(joinCode).toUpperCase(),JSON.stringify({
        participant_id:data.participant_id,participant_token:data.participant_token,
        student_name:name.trim(),student_code:studentCode.trim()
      }));
      setNotice(data.participant_status==='completed'?'အဖြေလွှာ တင်ပြီးပါပြီ။ ပြန်လည်ပြင်ဆင်၍ မရပါ။':'စာမေးပွဲခန်းသို့ ဝင်ရောက်ပြီးပါပြီ။');
    }catch(err){setError(err.message||'စာမေးပွဲခန်းသို့ ဝင်မရပါ။');}
    finally{setBusy(false);}
  };

  const persist=async submit=>{
    if(!participant)return;
    setBusy(true);setError('');setNotice('');
    try{
      const {data,error:saveError}=await supabase.rpc('save_exam_room_answers',{
        p_join_code:String(joinCode||'').trim().toUpperCase(),
        p_participant_id:participant.participant_id,
        p_participant_token:participant.participant_token,
        p_answers:answers,
        p_submit:Boolean(submit)
      });
      if(saveError)throw saveError;
      setParticipant(p=>({...p,participant_status:submit?'completed':'in_progress'}));
      setNotice(submit?'အဖြေလွှာ အောင်မြင်စွာ တင်ပြီးပါပြီ။':'အဖြေများ သိမ်းဆည်းပြီးပါပြီ။');
    }catch(err){setError(err.message||'အဖြေသိမ်းမရပါ။');}
    finally{setBusy(false);}
  };

  if(!participant)return <div className="min-h-screen bg-slate-50 px-4 py-8">
    <div className="mx-auto max-w-xl rounded-3xl border bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-3"><div className="rounded-2xl bg-indigo-100 p-3 text-indigo-700"><BookOpen/></div><div><h1 className="text-xl font-black">Live Exam Room</h1><p className="text-xs text-slate-500">Join code · {String(joinCode||'').toUpperCase()}</p></div></div>
      <form onSubmit={join} className="space-y-3">
        <label className="block text-sm font-bold">ကျောင်းသားအမည်<input required minLength={2} maxLength={100} value={name} onChange={e=>setName(e.target.value)} className="mt-1 w-full rounded-xl border p-3 text-sm"/></label>
        <label className="block text-sm font-bold">Student ID (ရှိပါက)<input value={studentCode} maxLength={50} onChange={e=>setStudentCode(e.target.value)} className="mt-1 w-full rounded-xl border p-3 text-sm" placeholder="Optional"/></label>
        <button disabled={busy||!joinCode} className="w-full rounded-xl bg-indigo-600 py-3 font-bold text-white disabled:opacity-50">{busy?<Loader2 className="mx-auto animate-spin"/>:'စာမေးပွဲခန်း ဝင်မည်'}</button>
      </form>
      {error&&<p role="alert" className="mt-3 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
    </div>
  </div>;

  const roomEnded=participant.room_status==='ended';
  const locked=participant.participant_status==='completed'||roomEnded;
  const questions=quiz?.questions||[];
  const total=questions.reduce((n,q)=>n+(Number(q.marks)||0),0);
  return <div className="min-h-screen bg-slate-50 px-3 py-5 sm:px-5">
    <div className="mx-auto max-w-2xl space-y-4">
      <header className="rounded-3xl bg-slate-950 p-5 text-white"><p className="text-xs text-indigo-200">LIVE EXAM · {participant.student_name||name}</p><h1 className="mt-1 text-xl font-black">{quiz.title||'စာမေးပွဲ'}</h1><p className="mt-1 text-xs text-slate-300">{questions.length} မေးခွန်း · စုစုပေါင်း {total} မှတ်</p></header>
      {roomEnded&&<p role="status" className="rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-800">ဆရာ/ဆရာမက စာမေးပွဲခန်းကို ပိတ်ထားပါပြီ။ သိမ်းထားသောအဖြေများကိုသာ ကြည့်ရှုနိုင်ပြီး ပြင်ဆင်ခြင်း၊ ထပ်မံတင်ခြင်း မပြုလုပ်နိုင်ပါ။</p>}{notice&&<p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
      {error&&<p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      {questions.map((q,i)=><section key={q.id||i} className="rounded-2xl border bg-white p-4 shadow-sm">
        <p className="text-xs font-bold text-indigo-600">မေးခွန်း {i+1} · {q.marks||0} မှတ်</p><p className="mt-2 whitespace-pre-wrap text-sm font-semibold text-slate-900">{q.text}</p>
        {q.type==='mcq'?(q.options||[]).map((opt,j)=><label key={j} className="mt-2 flex items-center gap-2 rounded-xl border p-3 text-sm"><input type="radio" disabled={locked} name={'q-'+i} checked={String(answers[q.id||i]??'')===String(j)} onChange={()=>setAnswers(a=>({...a,[q.id||String(i)]:j}))}/><span>{String.fromCharCode(65+j)}. {opt}</span></label>):<textarea disabled={locked} rows={3} value={answers[q.id||String(i)]||''} onChange={e=>setAnswers(a=>({...a,[q.id||String(i)]:e.target.value}))} className="mt-3 w-full rounded-xl border p-3 text-sm" placeholder="သင့်အဖြေကို ရေးပါ..."/>}
      </section>)}
      {!locked?<div className="sticky bottom-3 flex gap-2 rounded-2xl border bg-white/95 p-2 shadow-lg"><button disabled={busy} onClick={()=>persist(false)} className="flex-1 rounded-xl border py-3 text-sm font-bold">အဖြေသိမ်းမည်</button><button disabled={busy} onClick={()=>{if(window.confirm('အဖြေလွှာတင်ပြီးပါက ပြန်ပြင်၍မရပါ။ တင်မှာသေချာပါသလား?'))persist(true);}} className="flex-1 rounded-xl bg-indigo-600 py-3 text-sm font-bold text-white"><Send className="mr-1 inline h-4 w-4"/> Submit</button></div>:<div className="rounded-2xl bg-emerald-50 p-4 text-center text-sm font-bold text-emerald-800"><CheckCircle2 className="mr-2 inline"/>{roomEnded?'စာမေးပွဲခန်း ပိတ်ထားပါပြီ':'အဖြေလွှာ တင်ပြီးပါပြီ'}</div>}
    </div>
  </div>;
}
