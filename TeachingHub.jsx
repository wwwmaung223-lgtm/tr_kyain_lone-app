import React,{useEffect,useState} from 'react';
import {BookOpen,CalendarDays,ClipboardList,Plus,Users,Trash2,RefreshCw} from 'lucide-react';

export default function TeachingHub({supabase,user,onClose}){
 const [tab,setTab]=useState('classes');
 const [classes,setClasses]=useState([]);
 const [lessons,setLessons]=useState([]);
 const [questions,setQuestions]=useState([]);
 const [homework,setHomework]=useState([]);
 const [name,setName]=useState('');
 const [subject,setSubject]=useState('');
 const [grade,setGrade]=useState('');
 const [lessonTitle,setLessonTitle]=useState('');
 const [lessonDate,setLessonDate]=useState('');
 const [objective,setObjective]=useState('');
 const [question,setQuestion]=useState('');
 const [homeworkTitle,setHomeworkTitle]=useState('');
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const load=async()=>{
  if(!user?.id)return;setBusy(true);setError('');
  const [a,b,c,d]=await Promise.all([
   supabase.from('teacher_classes').select('*').order('created_at',{ascending:false}),
   supabase.from('lesson_plans').select('*').order('lesson_date',{ascending:false}),
   supabase.from('question_bank').select('*').order('created_at',{ascending:false}),
   supabase.from('homework_assignments').select('*').order('created_at',{ascending:false})
  ]);
  const first=[a,b,c,d].find(x=>x.error);if(first)setError(first.error.message);
  setClasses(a.data||[]);setLessons(b.data||[]);setQuestions(c.data||[]);setHomework(d.data||[]);setBusy(false);
 };
 useEffect(()=>{load();},[user?.id]);
 const addClass=async e=>{e.preventDefault();setError('');const {error}=await supabase.from('teacher_classes').insert({user_id:user.id,name:name.trim(),subject:subject.trim(),grade_level:grade.trim()});if(error)setError(error.message);else{setName('');setSubject('');setGrade('');setNotice('အတန်းသစ် သိမ်းပြီးပါပြီ။');load();}};
 const addLesson=async e=>{e.preventDefault();const {error}=await supabase.from('lesson_plans').insert({user_id:user.id,title:lessonTitle.trim(),lesson_date:lessonDate||null,objectives:objective});if(error)setError(error.message);else{setLessonTitle('');setObjective('');setNotice('Lesson Plan သိမ်းပြီးပါပြီ။');load();}};
 const addQuestion=async e=>{e.preventDefault();const {error}=await supabase.from('question_bank').insert({user_id:user.id,question_type:'short_answer',question_data:{prompt:question}});if(error)setError(error.message);else{setQuestion('');setNotice('Question Bank ထဲ သိမ်းပြီးပါပြီ။');load();}};
 const addHomework=async e=>{e.preventDefault();const {error}=await supabase.from('homework_assignments').insert({user_id:user.id,title:homeworkTitle.trim()});if(error)setError(error.message);else{setHomeworkTitle('');setNotice('Homework သိမ်းပြီးပါပြီ။');load();}};
 const tabs=[['classes','အတန်းများ',Users],['lessons','သင်ခန်းစာ',CalendarDays],['questions','မေးခွန်းဘဏ်',BookOpen],['homework','အိမ်စာ',ClipboardList]];
 const field='w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-500';
 return <div className="space-y-4 pb-8">
  <div className="rounded-3xl bg-gradient-to-br from-indigo-950 to-sky-800 text-white p-5">
   <div className="flex justify-between items-center"><div><p className="text-xs text-indigo-200">TEACHER WORKSPACE</p><h2 className="text-2xl font-black">Teaching Hub</h2><p className="text-xs text-indigo-100 mt-1">ကျောင်းနှင့် ကျူရှင် စီမံခန့်ခွဲမှု</p></div><button onClick={onClose} className="rounded-full bg-white/15 px-3 py-2 text-xs">ပိတ်မည်</button></div>
   <div className="grid grid-cols-4 gap-2 mt-4">{[[classes.length,'အတန်း'],[lessons.length,'သင်ခန်းစာ'],[questions.length,'မေးခွန်း'],[homework.length,'အိမ်စာ']].map(([n,l])=><div key={l} className="rounded-xl bg-white/10 p-2 text-center"><p className="text-xl font-black">{n}</p><p className="text-[10px] text-indigo-100">{l}</p></div>)}</div>
  </div>
  <div className="grid grid-cols-4 gap-1 rounded-2xl bg-white p-1 border">{tabs.map(([id,label,Icon])=><button key={id} onClick={()=>setTab(id)} className={'rounded-xl py-2 px-1 text-[11px] font-bold flex flex-col items-center gap-1 '+(tab===id?'bg-indigo-600 text-white':'text-slate-600')}><Icon className="w-4 h-4"/>{label}</button>)}</div>
  {error&&<p className="rounded-xl bg-rose-50 text-rose-700 p-3 text-sm">{error}</p>}
  {notice&&<p className="rounded-xl bg-emerald-50 text-emerald-700 p-3 text-sm">{notice}</p>}
  <section className="rounded-3xl bg-white border p-4 space-y-3">
   <div className="flex justify-between items-center"><h3 className="font-extrabold">{tabs.find(x=>x[0]===tab)?.[1]}</h3><button onClick={load} className="text-xs text-indigo-700 flex gap-1 items-center"><RefreshCw className="w-3 h-3"/> ပြန်ဖတ်ရန်</button></div>
   {tab==='classes'&&<><form onSubmit={addClass} className="space-y-2"><input className={field} value={name} onChange={e=>setName(e.target.value)} placeholder="အတန်းအမည် (ဥပမာ Grade 8 A)" required/><input className={field} value={subject} onChange={e=>setSubject(e.target.value)} placeholder="ဘာသာရပ်"/><input className={field} value={grade} onChange={e=>setGrade(e.target.value)} placeholder="အတန်းအဆင့်"/><button className="w-full bg-indigo-600 text-white rounded-xl py-3 font-bold"><Plus className="inline w-4 h-4"/> အတန်းထည့်မည်</button></form>{classes.map(x=><div key={x.id} className="border rounded-xl p-3"><p className="font-bold">{x.name}</p><p className="text-xs text-slate-500">{x.subject||'ဘာသာရပ်မသတ်မှတ်ရသေး'} · {x.grade_level||''}</p></div>)}</>}
   {tab==='lessons'&&<><form onSubmit={addLesson} className="space-y-2"><input className={field} value={lessonTitle} onChange={e=>setLessonTitle(e.target.value)} placeholder="သင်ခန်းစာခေါင်းစဉ်" required/><input className={field} type="date" value={lessonDate} onChange={e=>setLessonDate(e.target.value)}/><textarea className={field} value={objective} onChange={e=>setObjective(e.target.value)} placeholder="သင်ယူရမည့် ရည်မှန်းချက်များ"/><button className="w-full bg-indigo-600 text-white rounded-xl py-3 font-bold">Lesson Plan သိမ်းမည်</button></form>{lessons.map(x=><div key={x.id} className="border rounded-xl p-3"><p className="font-bold">{x.title}</p><p className="text-xs text-slate-500">{x.lesson_date||'ရက်မသတ်မှတ်ရသေး'}</p><p className="text-sm mt-1">{x.objectives}</p></div>)}</>}
   {tab==='questions'&&<><form onSubmit={addQuestion} className="space-y-2"><textarea className={field} value={question} onChange={e=>setQuestion(e.target.value)} placeholder="မေးခွန်းစာသား..." required/><button className="w-full bg-indigo-600 text-white rounded-xl py-3 font-bold">Question Bank ထဲသိမ်းမည်</button></form>{questions.map(x=><div key={x.id} className="border rounded-xl p-3 text-sm">{x.question_data?.prompt||JSON.stringify(x.question_data)}</div>)}</>}
   {tab==='homework'&&<><form onSubmit={addHomework} className="space-y-2"><input className={field} value={homeworkTitle} onChange={e=>setHomeworkTitle(e.target.value)} placeholder="အိမ်စာခေါင်းစဉ်" required/><button className="w-full bg-indigo-600 text-white rounded-xl py-3 font-bold">အိမ်စာသတ်မှတ်မည်</button></form>{homework.map(x=><div key={x.id} className="border rounded-xl p-3"><p className="font-bold">{x.title}</p><p className="text-xs text-slate-500">{new Date(x.created_at).toLocaleDateString()}</p></div>)}</>}
   {busy&&<p className="text-xs text-slate-500">ဖတ်နေသည်...</p>}
  </section>
 </div>;
}
