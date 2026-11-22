import React, { useEffect, useState } from 'react';
import {
  BookOpen, CalendarDays, ClipboardList, Plus, Users, Trash2, RefreshCw,
  GraduationCap, UserPlus, NotebookPen, Search, Clock3
} from 'lucide-react';

const inputClass = 'w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-800 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';
const buttonClass = 'inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-3 py-2.5 text-xs font-extrabold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-50';
const cardClass = 'rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-sm';

export default function TeachingHub({ supabase, user, onClose }) {
  const [tab, setTab] = useState('classes');
  const [classes, setClasses] = useState([]);
  const [students, setStudents] = useState([]);
  const [lessons, setLessons] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [homework, setHomework] = useState([]);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [className, setClassName] = useState('');
  const [classSubject, setClassSubject] = useState('');
  const [classGrade, setClassGrade] = useState('');
  const [classSchedule, setClassSchedule] = useState('');

  const [studentName, setStudentName] = useState('');
  const [studentCode, setStudentCode] = useState('');
  const [guardianContact, setGuardianContact] = useState('');

  const [lessonTitle, setLessonTitle] = useState('');
  const [lessonSubject, setLessonSubject] = useState('');
  const [lessonDate, setLessonDate] = useState('');
  const [lessonDuration, setLessonDuration] = useState('45');
  const [objective, setObjective] = useState('');

  const [question, setQuestion] = useState('');
  const [questionSubject, setQuestionSubject] = useState('');
  const [questionGrade, setQuestionGrade] = useState('');
  const [questionTopic, setQuestionTopic] = useState('');

  const [homeworkTitle, setHomeworkTitle] = useState('');
  const [homeworkInstructions, setHomeworkInstructions] = useState('');
  const [homeworkDue, setHomeworkDue] = useState('');

  const load = async () => {
    if (!user?.id || !supabase) return;
    setBusy(true);
    setError('');
    const [a, b, c, d, e] = await Promise.all([
      supabase.from('teacher_classes').select('*').order('created_at', { ascending: false }),
      supabase.from('class_students').select('*').order('created_at', { ascending: false }),
      supabase.from('lesson_plans').select('*').order('lesson_date', { ascending: false }),
      supabase.from('question_bank').select('*').order('created_at', { ascending: false }),
      supabase.from('homework_assignments').select('*').order('created_at', { ascending: false })
    ]);
    const firstError = [a, b, c, d, e].find(result => result.error);
    if (firstError) setError(firstError.error.message);
    const nextClasses = a.data || [];
    setClasses(nextClasses);
    setStudents(b.data || []);
    setLessons(c.data || []);
    setQuestions(d.data || []);
    setHomework(e.data || []);
    setSelectedClassId(current => current || nextClasses[0]?.id || '');
    setBusy(false);
  };

  useEffect(() => { load(); }, [user?.id, supabase]);

  const runSave = async (action, successMessage) => {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const { error: actionError } = await action();
      if (actionError) throw actionError;
      setNotice(successMessage);
      await load();
    } catch (err) {
      setError(err?.message || 'သိမ်းဆည်းရာတွင် အမှားဖြစ်နေပါသည်။');
    } finally {
      setSaving(false);
    }
  };

  const addClass = e => {
    e.preventDefault();
    runSave(async () => {
      const { data, error } = await supabase.from('teacher_classes').insert({
        user_id: user.id,
        name: className.trim(),
        subject: classSubject.trim() || null,
        grade_level: classGrade.trim() || null,
        schedule: classSchedule.trim() || null
      }).select('id').single();
      if (!error && data?.id) setSelectedClassId(data.id);
      if (!error) { setClassName(''); setClassSubject(''); setClassGrade(''); setClassSchedule(''); }
      return { error };
    }, 'အတန်းသစ် သိမ်းပြီးပါပြီ။');
  };

  const addStudent = e => {
    e.preventDefault();
    if (!selectedClassId) return setError('ကျောင်းသားထည့်ရန် အတန်းတစ်ခု အရင်ရွေးပါ။');
    runSave(async () => {
      const result = await supabase.from('class_students').insert({
        user_id: user.id,
        class_id: selectedClassId,
        student_name: studentName.trim(),
        student_code: studentCode.trim() || null,
        guardian_contact: guardianContact.trim() || null
      });
      if (!result.error) { setStudentName(''); setStudentCode(''); setGuardianContact(''); }
      return result;
    }, 'ကျောင်းသားစာရင်းထဲ ထည့်ပြီးပါပြီ။');
  };

  const deleteStudent = student => {
    if (!window.confirm(student.student_name + ' ကို အတန်းစာရင်းမှ ဖယ်ရှားမလား?')) return;
    runSave(() => supabase.from('class_students').delete().eq('id', student.id), 'ကျောင်းသားကို ဖယ်ရှားပြီးပါပြီ။');
  };

  const addLesson = e => {
    e.preventDefault();
    runSave(() => supabase.from('lesson_plans').insert({
      user_id: user.id,
      class_id: selectedClassId || null,
      title: lessonTitle.trim(),
      subject: lessonSubject.trim() || null,
      lesson_date: lessonDate || null,
      duration_minutes: Math.max(1, Number(lessonDuration) || 45),
      objectives: objective.trim() || null
    }), 'Lesson Plan သိမ်းပြီးပါပြီ။');
    setLessonTitle(''); setObjective('');
  };

  const addQuestion = e => {
    e.preventDefault();
    runSave(() => supabase.from('question_bank').insert({
      user_id: user.id,
      subject: questionSubject.trim() || null,
      grade_level: questionGrade.trim() || null,
      topic: questionTopic.trim() || null,
      question_type: 'short_answer',
      question_data: { prompt: question.trim() },
      tags: []
    }), 'Question Bank ထဲ သိမ်းပြီးပါပြီ။');
    setQuestion('');
  };

  const addHomework = e => {
    e.preventDefault();
    runSave(() => supabase.from('homework_assignments').insert({
      user_id: user.id,
      class_id: selectedClassId || null,
      title: homeworkTitle.trim(),
      instructions: homeworkInstructions.trim() || null,
      due_at: homeworkDue ? new Date(homeworkDue).toISOString() : null
    }), 'Homework သိမ်းပြီးပါပြီ။');
    setHomeworkTitle(''); setHomeworkInstructions(''); setHomeworkDue('');
  };

  const classLabel = id => classes.find(item => item.id === id)?.name || 'အတန်းမသတ်မှတ်ရသေး';
  const tabs = [
    ['classes', 'အတန်းများ', Users],
    ['students', 'ကျောင်းသား', GraduationCap],
    ['lessons', 'သင်ခန်းစာ', CalendarDays],
    ['questions', 'မေးခွန်းဘဏ်', BookOpen],
    ['homework', 'အိမ်စာ', ClipboardList]
  ];

  return (
    <div className="space-y-4 pb-8">
      <div className="rounded-3xl bg-gradient-to-br from-slate-950 via-indigo-950 to-[#3c4ab7] p-5 text-white shadow-xl">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-extrabold tracking-[.16em] text-indigo-200">TEACHER WORKSPACE</p>
            <h2 className="mt-1 text-2xl font-black">Teaching Hub</h2>
            <p className="mt-1 text-xs text-indigo-100">Classes, students and teaching materials — in one place.</p>
          </div>
          <button onClick={onClose} className="rounded-full bg-white/15 px-3 py-2 text-xs font-bold">ပိတ်မည်</button>
        </div>
        <div className="mt-4 grid grid-cols-5 gap-1.5">
          {[[classes.length,'အတန်း'],[students.length,'ကျောင်းသား'],[lessons.length,'သင်ခန်းစာ'],[questions.length,'မေးခွန်း'],[homework.length,'အိမ်စာ']].map(([n,l]) => (
            <div key={l} className="rounded-xl border border-white/10 bg-white/10 p-2 text-center">
              <p className="text-lg font-black">{n}</p><p className="text-[9px] text-indigo-100">{l}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-5 gap-1 rounded-2xl border border-slate-200 bg-white p-1 shadow-sm">
        {tabs.map(([id,label,Icon]) => (
          <button key={id} onClick={() => setTab(id)} className={'flex min-w-0 flex-col items-center gap-1 rounded-xl px-1 py-2 text-[9px] font-extrabold transition sm:text-[11px] ' + (tab === id ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:bg-indigo-50')}>
            <Icon className="h-4 w-4"/><span className="truncate">{label}</span>
          </button>
        ))}
      </div>

      {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700">{error}</p>}
      {notice && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-800">{notice}</p>}

      <section className="rounded-3xl border border-slate-200/80 bg-white p-4 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="font-extrabold text-slate-900">{tabs.find(item => item[0] === tab)?.[1]}</h3>
          <button onClick={load} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-50 px-2.5 py-2 text-[10px] font-bold text-indigo-700 disabled:opacity-50"><RefreshCw className={'h-3 w-3 '+(busy?'animate-spin':'')}/> Refresh</button>
        </div>

        {tab === 'classes' && <>
          <form onSubmit={addClass} className="mb-4 grid gap-2 sm:grid-cols-2">
            <input className={inputClass} value={className} onChange={e=>setClassName(e.target.value)} placeholder="အတန်းအမည် (ဥပမာ Grade 8 A)" required/>
            <input className={inputClass} value={classSubject} onChange={e=>setClassSubject(e.target.value)} placeholder="ဘာသာရပ်"/>
            <input className={inputClass} value={classGrade} onChange={e=>setClassGrade(e.target.value)} placeholder="အတန်းအဆင့်"/>
            <input className={inputClass} value={classSchedule} onChange={e=>setClassSchedule(e.target.value)} placeholder="အချိန်ဇယား (Optional)"/>
            <button disabled={saving} className={buttonClass+' sm:col-span-2'}><Plus className="h-4 w-4"/> အတန်းထည့်မည်</button>
          </form>
          <div className="space-y-2">
            {classes.length === 0 && <p className="rounded-xl bg-slate-50 p-4 text-center text-xs text-slate-500">အတန်းမရှိသေးပါ။ ပထမဆုံး အတန်းတစ်ခု ဖန်တီးပါ။</p>}
            {classes.map(item => (
              <div key={item.id} className={cardClass+' flex items-center gap-3'}>
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-700"><Users className="h-5 w-5"/></span>
                <div className="min-w-0 flex-1"><p className="truncate text-xs font-extrabold text-slate-900">{item.name}</p><p className="mt-1 text-[10px] text-slate-500">{item.subject||'ဘာသာရပ်မသတ်မှတ်ရသေး'} · {item.grade_level||''} {item.schedule?'· '+item.schedule:''}</p></div>
                <span className="rounded-lg bg-slate-50 px-2 py-1 text-[10px] font-bold text-slate-500">{students.filter(s=>s.class_id===item.id).length} ယောက်</span>
              </div>
            ))}
          </div>
        </>}

        {tab === 'students' && <>
          {classes.length ? <form onSubmit={addStudent} className="mb-4 grid gap-2 sm:grid-cols-2">
            <select className={inputClass+' sm:col-span-2'} value={selectedClassId} onChange={e=>setSelectedClassId(e.target.value)} required>{classes.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select>
            <input className={inputClass} value={studentName} onChange={e=>setStudentName(e.target.value)} placeholder="ကျောင်းသားအမည်" required/>
            <input className={inputClass} value={studentCode} onChange={e=>setStudentCode(e.target.value)} placeholder="Student ID / Roll No."/>
            <input className={inputClass+' sm:col-span-2'} value={guardianContact} onChange={e=>setGuardianContact(e.target.value)} placeholder="မိဘဖုန်း / Guardian contact (Optional)"/>
            <button disabled={saving} className={buttonClass+' sm:col-span-2'}><UserPlus className="h-4 w-4"/> ကျောင်းသားထည့်မည်</button>
          </form> : <p className="mb-4 rounded-xl bg-amber-50 p-3 text-xs text-amber-800">ကျောင်းသားထည့်ရန် အရင်ဆုံး အတန်းတစ်ခု ဖန်တီးပါ။</p>}
          <div className="space-y-2">
            {students.filter(item=>!selectedClassId||item.class_id===selectedClassId).length===0 && <p className="rounded-xl bg-slate-50 p-4 text-center text-xs text-slate-500">ဒီအတန်းမှာ ကျောင်းသားစာရင်း မရှိသေးပါ။</p>}
            {students.filter(item=>!selectedClassId||item.class_id===selectedClassId).map(item=>(
              <div key={item.id} className={cardClass+' flex items-center gap-3'}>
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-indigo-50 text-indigo-700"><GraduationCap className="h-4 w-4"/></span>
                <div className="min-w-0 flex-1"><p className="truncate text-xs font-extrabold text-slate-900">{item.student_name}</p><p className="mt-1 truncate text-[10px] text-slate-500">{item.student_code||'ID မရှိ'} · {classLabel(item.class_id)} {item.guardian_contact?'· '+item.guardian_contact:''}</p></div>
                <button onClick={()=>deleteStudent(item)} className="rounded-lg bg-rose-50 p-2 text-rose-600" aria-label="Remove student"><Trash2 className="h-3.5 w-3.5"/></button>
              </div>
            ))}
          </div>
        </>}

        {tab === 'lessons' && <>
          <form onSubmit={addLesson} className="mb-4 grid gap-2 sm:grid-cols-2">
            <input className={inputClass+' sm:col-span-2'} value={lessonTitle} onChange={e=>setLessonTitle(e.target.value)} placeholder="သင်ခန်းစာခေါင်းစဉ်" required/>
            <input className={inputClass} value={lessonSubject} onChange={e=>setLessonSubject(e.target.value)} placeholder="ဘာသာရပ်"/>
            <select className={inputClass} value={selectedClassId} onChange={e=>setSelectedClassId(e.target.value)}><option value="">အတန်းမရွေးထားပါ</option>{classes.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select>
            <input className={inputClass} type="date" value={lessonDate} onChange={e=>setLessonDate(e.target.value)}/>
            <input className={inputClass} type="number" min="1" max="300" value={lessonDuration} onChange={e=>setLessonDuration(e.target.value)} placeholder="ကြာချိန် (မိနစ်)"/>
            <textarea className={inputClass+' min-h-20 sm:col-span-2'} value={objective} onChange={e=>setObjective(e.target.value)} placeholder="သင်ယူရမည့် ရည်မှန်းချက်များ"/>
            <button disabled={saving} className={buttonClass+' sm:col-span-2'}><NotebookPen className="h-4 w-4"/> Lesson Plan သိမ်းမည်</button>
          </form>
          <div className="space-y-2">{lessons.length===0&&<p className="rounded-xl bg-slate-50 p-4 text-center text-xs text-slate-500">Lesson Plan မရှိသေးပါ။</p>}
            {lessons.map(item=><div key={item.id} className={cardClass}><p className="text-xs font-extrabold text-slate-900">{item.title}</p><p className="mt-1 text-[10px] text-slate-500">{item.subject||'ဘာသာရပ်မသတ်မှတ်ရသေး'} · {classLabel(item.class_id)} · {item.lesson_date||'ရက်မသတ်မှတ်ရသေး'} · {item.duration_minutes||45} min</p>{item.objectives&&<p className="mt-2 text-xs leading-5 text-slate-600">{item.objectives}</p>}</div>)}
          </div>
        </>}

        {tab === 'questions' && <>
          <form onSubmit={addQuestion} className="mb-4 grid gap-2 sm:grid-cols-2">
            <textarea className={inputClass+' min-h-20 sm:col-span-2'} value={question} onChange={e=>setQuestion(e.target.value)} placeholder="မေးခွန်းစာသား..." required/>
            <input className={inputClass} value={questionSubject} onChange={e=>setQuestionSubject(e.target.value)} placeholder="ဘာသာရပ်"/>
            <input className={inputClass} value={questionGrade} onChange={e=>setQuestionGrade(e.target.value)} placeholder="အတန်း"/>
            <input className={inputClass+' sm:col-span-2'} value={questionTopic} onChange={e=>setQuestionTopic(e.target.value)} placeholder="Topic / Chapter"/>
            <button disabled={saving} className={buttonClass+' sm:col-span-2'}><Plus className="h-4 w-4"/> Question Bank ထဲသိမ်းမည်</button>
          </form>
          <div className="space-y-2">{questions.length===0&&<p className="rounded-xl bg-slate-50 p-4 text-center text-xs text-slate-500">မေးခွန်းဘဏ် မရှိသေးပါ။</p>}
            {questions.map(item=><div key={item.id} className={cardClass}><p className="text-xs font-bold text-slate-900">{item.question_data?.prompt||JSON.stringify(item.question_data)}</p><p className="mt-1 text-[10px] text-slate-500">{item.subject||'ဘာသာရပ်မသတ်မှတ်ရသေး'} · {item.grade_level||''} · {item.topic||''}</p></div>)}
          </div>
        </>}

        {tab === 'homework' && <>
          <form onSubmit={addHomework} className="mb-4 grid gap-2 sm:grid-cols-2">
            <input className={inputClass+' sm:col-span-2'} value={homeworkTitle} onChange={e=>setHomeworkTitle(e.target.value)} placeholder="အိမ်စာခေါင်းစဉ်" required/>
            <select className={inputClass} value={selectedClassId} onChange={e=>setSelectedClassId(e.target.value)}><option value="">အတန်းမရွေးထားပါ</option>{classes.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select>
            <input className={inputClass} type="datetime-local" value={homeworkDue} onChange={e=>setHomeworkDue(e.target.value)}/>
            <textarea className={inputClass+' min-h-20 sm:col-span-2'} value={homeworkInstructions} onChange={e=>setHomeworkInstructions(e.target.value)} placeholder="ကျောင်းသားများအတွက် ညွှန်ကြားချက်များ"/>
            <button disabled={saving} className={buttonClass+' sm:col-span-2'}><Plus className="h-4 w-4"/> အိမ်စာသတ်မှတ်မည်</button>
          </form>
          <div className="space-y-2">{homework.length===0&&<p className="rounded-xl bg-slate-50 p-4 text-center text-xs text-slate-500">အိမ်စာ မရှိသေးပါ။</p>}
            {homework.map(item=><div key={item.id} className={cardClass}><p className="text-xs font-extrabold text-slate-900">{item.title}</p><p className="mt-1 text-[10px] text-slate-500">{classLabel(item.class_id)} · {item.due_at?'Due '+new Date(item.due_at).toLocaleString():'Due date မသတ်မှတ်ရသေး'}</p>{item.instructions&&<p className="mt-2 text-xs leading-5 text-slate-600">{item.instructions}</p>}</div>)}
          </div>
        </>}
        {busy && <p className="mt-4 text-center text-[11px] font-semibold text-slate-400">ဒေတာများ ဖတ်နေပါသည်...</p>}
      </section>
    </div>
  );
}
