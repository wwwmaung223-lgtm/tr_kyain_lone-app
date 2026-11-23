import React, { useEffect, useState } from 'react';
import { Activity, Copy, Loader2, Plus, RefreshCw, Users } from 'lucide-react';

const makeCode = () => Array.from({length:6},()=> 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random()*32)]).join('');

export default function TeacherExamRooms({supabase,user}) {
  const [quizzes,setQuizzes]=useState([]);
  const [rooms,setRooms]=useState([]);
  const [selected,setSelected]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [participants,setParticipants]=useState({});
  const load=async()=>{
    if(!supabase||!user?.id)return;
    setBusy(true);setError('');
    const [q,r]=await Promise.all([
      supabase.from('quiz_assessments').select('code,quiz_data').eq('teacher_id',user.id).order('created_at',{ascending:false}),
      supabase.from('exam_rooms').select('*').eq('teacher_id',user.id).order('created_at',{ascending:false})
    ]);
    if(q.error||r.error)setError(q.error?.message||r.error?.message);
    setQuizzes(q.data||[]);setRooms(r.data||[]);
    setSelected(current=>current||q.data?.[0]?.code||'');
    if(r.data?.length){
      const ids=r.data.map(x=>x.id);
      const p=await supabase.from('exam_room_participants').select('*').in('room_id',ids).order('created_at',{ascending:true});
      if(p.error)setError(p.error.message);
      else setParticipants((p.data||[]).reduce((acc,row)=>{(acc[row.room_id] ||= []).push(row);return acc;},{}));
    }
    setBusy(false);
  };
  useEffect(()=>{load();},[user?.id,supabase]);
  useEffect(()=>{
    if(!supabase||!rooms.length)return;
    const channel=supabase.channel('teacher-exam-rooms-'+user.id)
      .on('postgres_changes',{event:'*',schema:'public',table:'exam_room_participants'},()=>load())
      .on('postgres_changes',{event:'*',schema:'public',table:'exam_rooms',filter:'teacher_id=eq.'+user.id},()=>load())
      .subscribe();
    return()=>{supabase.removeChannel(channel);};
  },[supabase,user?.id,rooms.length]);
  const create=async()=>{
    if(!selected)return setError('အရင်ဆုံး quiz တစ်ခု ရွေးပါ။');
    setBusy(true);setError('');setNotice('');
    try{
      const {data,error:rpcError}=await supabase.rpc('create_exam_room',{p_quiz_code:selected,p_join_code:makeCode()});
      if(rpcError)throw rpcError;
      setNotice('Exam Room ဖန်တီးပြီးပါပြီ။');await load();
    }catch(err){setError(err.message||'Exam Room မဖန်တီးနိုင်ပါ။');}
    finally{setBusy(false);}
  };
  const setRoomStatus=async(room,status)=>{
    const {error:saveError}=await supabase.from('exam_rooms').update({status,starts_at:status==='live'?new Date().toISOString():room.starts_at,ends_at:status==='ended'?new Date().toISOString():null}).eq('id',room.id);
    if(saveError)setError(saveError.message);else await load();
  };
  return <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
    <div className="flex items-center gap-2"><Activity className="h-5 w-5 text-indigo-600"/><div><h3 className="font-extrabold">Live Exam Room</h3><p className="text-[10px] text-slate-500">Common join code · Live student status</p></div></div>
    <div className="flex gap-2"><select value={selected} onChange={e=>setSelected(e.target.value)} className="min-w-0 flex-1 rounded-xl border p-2 text-xs"><option value="">Quiz ရွေးပါ</option>{quizzes.map(q=><option key={q.code} value={q.code}>{q.quiz_data?.title||q.code} · {q.code}</option>)}</select><button disabled={busy||!selected} onClick={create} className="rounded-xl bg-indigo-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"><Plus className="inline h-4 w-4"/> Create</button></div>
    {error&&<p role="alert" className="rounded-xl bg-rose-50 p-2 text-xs text-rose-700">{error}</p>}
    {notice&&<p role="status" className="rounded-xl bg-emerald-50 p-2 text-xs text-emerald-700">{notice}</p>}
    <div className="flex items-center justify-between"><p className="text-xs font-bold text-slate-600">Your exam rooms</p><button onClick={load} className="text-xs text-indigo-700"><RefreshCw className="inline h-3 w-3"/> Refresh</button></div>
    {!rooms.length&&!busy&&<p className="rounded-xl bg-slate-50 p-4 text-center text-xs text-slate-500">Exam Room မရှိသေးပါ။</p>}
    {rooms.map(room=><div key={room.id} className="rounded-2xl border border-slate-200 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2"><div><p className="text-xs font-extrabold">{quizzes.find(q=>q.code===room.quiz_code)?.quiz_data?.title||room.quiz_code}</p><p className="text-[10px] text-slate-500">Room Code · {room.join_code}</p></div><span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold">{room.status}</span></div>
      <button onClick={()=>navigator.clipboard?.writeText(room.join_code).then(()=>setNotice('Join code copied.')).catch(()=>setError('Copy မအောင်မြင်ပါ။'))} className="text-xs font-bold text-indigo-700"><Copy className="inline h-3 w-3"/> Copy Join Code</button>
      <button onClick={()=>navigator.clipboard?.writeText(window.location.origin+'/?e='+encodeURIComponent(room.join_code)).then(()=>setNotice('Student exam link copied.')).catch(()=>setError('Copy မအောင်မြင်ပါ။'))} className="ml-3 text-xs font-bold text-emerald-700"><Copy className="inline h-3 w-3"/> Copy Student Link</button>
      <div className="flex gap-2">{room.status==='waiting'&&<button onClick={()=>setRoomStatus(room,'live')} className="rounded-lg bg-emerald-600 px-3 py-2 text-[10px] font-bold text-white">Start Exam</button>}{room.status!=='ended'&&<button onClick={()=>setRoomStatus(room,'ended')} className="rounded-lg bg-slate-800 px-3 py-2 text-[10px] font-bold text-white">End Exam</button>}</div>
      <div className="space-y-1">{(participants[room.id]||[]).map(p=><div key={p.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-2 py-2"><div className="flex items-center gap-2"><span className="grid h-7 w-7 place-items-center rounded-full bg-indigo-100 text-[10px] font-black text-indigo-700">{p.student_name.slice(0,1).toUpperCase()}</span><div><p className="text-[11px] font-bold">{p.student_name}</p><p className="text-[9px] text-slate-500">{p.student_code||'Student'}</p></div></div><span className="text-[10px] font-bold text-slate-600">{p.status}</span></div>)}</div>
      <p className="flex items-center gap-1 text-[10px] text-slate-500"><Users className="h-3 w-3"/>{(participants[room.id]||[]).length} students</p>
    </div>)}
    {busy&&<p className="text-center text-[10px] text-slate-400"><Loader2 className="inline h-3 w-3 animate-spin"/> Loading...</p>}
  </section>;
}
