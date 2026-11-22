import React, { useMemo, useState } from 'react';
import { Camera, FileText, Sparkles, UploadCloud, Check, Clock3, RotateCcw, X, ChevronDown } from 'lucide-react';

const subjects = ['Biology', 'Mathematics', 'English', 'Physics', 'Chemistry', 'Myanmar', 'History', 'General'];
const grades = ['Grade 5', 'Grade 6', 'Grade 7', 'Grade 8', 'Grade 9', 'Grade 10', 'Grade 11', 'Grade 12'];
const types = ['Mixed questions', 'Multiple choice', 'True / False', 'Short answer'];

export default function AiQuizStudio({
  fileInputRef, uploadedPreview, uploadedBase64, uploadedMime, uploadedFileName,
  handleImageSelect, handleRunGeminiPhotoToQuiz, isAiGenerating, aiStatus, aiError,
  aiPromptNote, setAiPromptNote, quizTitle, setQuizTitle, quizDesc, setQuizDesc,
  timeLimitMinutes, setTimeLimitMinutes, questions, totalBuilderMarks, onClear
}) {
  const [subject, setSubject] = useState('Biology');
  const [grade, setGrade] = useState('Grade 9');
  const [difficulty, setDifficulty] = useState('Balanced');
  const [questionType, setQuestionType] = useState('Mixed questions');
  const [questionCount, setQuestionCount] = useState('10');
  const [bilingual, setBilingual] = useState(true);

  const previewQuestions = useMemo(() => (questions || []).slice(0, 3), [questions]);
  const prompt = [
    'Subject: ' + subject,
    'Grade: ' + grade,
    'Difficulty: ' + difficulty,
    'Question type: ' + questionType,
    'Generate approximately ' + questionCount + ' questions.',
    'Language: ' + (bilingual ? 'Myanmar and English, preserve source language' : 'preserve source language'),
    aiPromptNote.trim() ? 'Additional teacher instruction: ' + aiPromptNote.trim() : ''
  ].filter(Boolean).join('\n');

  const handleGenerate = () => {
    handleRunGeminiPhotoToQuiz(prompt);
  };

  const field = 'w-full min-w-0 rounded-xl border border-[#e7e8f3] bg-[#fbfbff] px-3 py-3 text-[12px] font-semibold text-[#323451] outline-none transition focus:border-[#7869e9] focus:ring-2 focus:ring-[#7869e9]/10';
  const label = 'mb-1.5 block text-[11px] font-bold text-[#535779]';

  return (
    <section className="liquid-studio rounded-[26px] border border-white bg-gradient-to-br from-white via-[#fbfaff] to-[#f4f5ff] p-4 shadow-[0_18px_44px_rgba(86,77,180,.10)] sm:p-5">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="mb-1 text-[10px] font-extrabold tracking-[.16em] text-[#8068dc]">TEACHER WORKSPACE / AI STUDIO</p>
          <h2 className="text-[23px] font-black tracking-tight text-[#1c2140] sm:text-[28px]">Create a quiz with AI</h2>
          <p className="mt-1 max-w-xl text-[11px] leading-5 text-[#7d829c] sm:text-xs">Upload a lesson sheet, set your quiz preferences, and turn it into a classroom-ready assessment.</p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[#e4defe] bg-[#f0edff] px-3 py-2 text-[9px] font-extrabold tracking-wide text-[#6d57cf]"><Sparkles className="h-3.5 w-3.5"/> AI ASSISTED</span>
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.06fr)_minmax(300px,.94fr)]">
        <div className="liquid-panel space-y-4 rounded-[20px] border border-[#eceaf6] bg-white p-3.5 sm:p-4">
          <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf,.pdf" onChange={handleImageSelect} className="hidden"/>
          <button type="button" onClick={()=>fileInputRef.current?.click()} className="liquid-dropzone group flex w-full items-center gap-3 rounded-2xl border border-dashed border-[#b9a9f2] bg-gradient-to-r from-[#faf7ff] to-[#f3f5ff] p-4 text-left transition hover:border-[#8068dc] hover:shadow-sm">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#eeeaff] text-[#715cda]"><UploadCloud className="h-6 w-6"/></span>
            <span className="min-w-0 flex-1">
              <b className="block truncate text-xs font-extrabold text-[#34365d]">{uploadedFileName || 'Upload worksheet, textbook or photo'}</b>
              <small className="mt-1 block text-[10px] text-[#8c90a9]">JPG, PNG, WebP or PDF · up to 3 MB</small>
            </span>
            <span className="rounded-xl bg-[#ebe8ff] px-3 py-2 text-[10px] font-extrabold text-[#6652ce]">Browse</span>
          </button>

          {(uploadedPreview || (uploadedBase64 && uploadedMime === 'application/pdf')) && (
            <div className="relative overflow-hidden rounded-xl border border-[#e8e6f4] bg-[#f8f8fc]">
              {uploadedMime === 'application/pdf' ? (
                <div className="flex items-center gap-3 p-4"><FileText className="h-8 w-8 text-[#7560d8]"/><div className="min-w-0"><b className="block truncate text-xs text-[#36375d]">{uploadedFileName}</b><span className="text-[10px] text-[#8589a3]">PDF ready for AI processing</span></div></div>
              ) : <img src={uploadedPreview} alt="Uploaded worksheet preview" className="max-h-48 w-full bg-white object-contain"/>}
              <button type="button" onClick={()=>fileInputRef.current?.click()} className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-white/95 px-2.5 py-1.5 text-[10px] font-bold text-[#6252bd] shadow-sm"><Camera className="h-3 w-3"/> Change</button>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="sm:col-span-2"><span className={label}>Quiz title / ခေါင်းစဉ်</span><input className={field} value={quizTitle} onChange={e=>setQuizTitle(e.target.value)} placeholder="Chapter 3 — Photosynthesis"/></label>
            <label><span className={label}>Subject / ဘာသာရပ်</span><select className={field} value={subject} onChange={e=>setSubject(e.target.value)}>{subjects.map(x=><option key={x}>{x}</option>)}</select></label>
            <label><span className={label}>Grade / အတန်း</span><select className={field} value={grade} onChange={e=>setGrade(e.target.value)}>{grades.map(x=><option key={x}>{x}</option>)}</select></label>
            <label><span className={label}>Difficulty / အခက်အခဲ</span><select className={field} value={difficulty} onChange={e=>setDifficulty(e.target.value)}><option>Easy</option><option>Balanced</option><option>Advanced</option></select></label>
            <label><span className={label}>Question type / မေးခွန်းပုံစံ</span><select className={field} value={questionType} onChange={e=>setQuestionType(e.target.value)}>{types.map(x=><option key={x}>{x}</option>)}</select></label>
            <label><span className={label}>Number of questions</span><select className={field} value={questionCount} onChange={e=>setQuestionCount(e.target.value)}>{['5','10','15','20','25','30'].map(x=><option key={x}>{x}</option>)}</select></label>
            <label><span className={label}>Time limit (minutes)</span><input className={field} type="number" min="0" max="300" value={timeLimitMinutes} onChange={e=>setTimeLimitMinutes(Math.max(0,Math.min(300,Number(e.target.value)||0)))}/></label>
            <label className="sm:col-span-2"><span className={label}>Description / ညွှန်ကြားချက်</span><input className={field} value={quizDesc} onChange={e=>setQuizDesc(e.target.value)} placeholder="Optional instructions for students"/></label>
          </div>

          <label className="flex cursor-pointer items-center gap-2.5 rounded-xl bg-[#f7f5ff] p-3">
            <input type="checkbox" checked={bilingual} onChange={e=>setBilingual(e.target.checked)} className="h-4 w-4 accent-[#6f5cda]"/>
            <span><b className="block text-[11px] font-extrabold text-[#484a70]">Myanmar + English</b><small className="text-[10px] text-[#9294aa]">မြန်မာ / အင်္ဂလိပ် နှစ်ဘာသာ</small></span>
          </label>

          <label><span className={label}>Extra AI instruction / AI မှာကြားချက်</span><input className={field} value={aiPromptNote} onChange={e=>setAiPromptNote(e.target.value)} placeholder="e.g. Focus on chapter key concepts"/></label>

          {aiError && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-[11px] font-semibold text-rose-700">{aiError}</p>}
          {isAiGenerating && <p role="status" className="rounded-xl bg-[#f0edff] px-3 py-2.5 text-[11px] font-semibold text-[#6555c4]">{aiStatus || 'AI is preparing your quiz…'}</p>}
          <button type="button" onClick={handleGenerate} disabled={isAiGenerating || !uploadedBase64} className="liquid-cta flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#8065e8] to-[#5861df] px-4 py-3.5 text-xs font-extrabold text-white shadow-lg shadow-indigo-200/70 transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"><Sparkles className="h-4 w-4"/>{isAiGenerating ? 'Generating quiz…' : 'Generate quiz'}<span className="ml-auto">→</span></button>
          <p className="text-[10px] leading-4 text-[#9699ae]">AI-generated questions should be reviewed by the teacher before publishing.</p>
        </div>

        <aside className="liquid-panel space-y-3 rounded-[20px] border border-[#eceaf6] bg-white p-3.5 sm:p-4">
          <div className="flex items-start justify-between gap-3">
            <div><p className="text-[9px] font-extrabold tracking-[.15em] text-[#8068dc]">LIVE PREVIEW</p><h3 className="mt-1 text-[15px] font-extrabold text-[#292b50]">{quizTitle || 'Untitled quiz'}</h3><p className="mt-1 text-[10px] text-[#8589a2]">{subject} · {grade} · {difficulty}</p></div>
            <span className="rounded-xl bg-[#efedff] px-2.5 py-2 text-[10px] font-extrabold text-[#6855d2]">{questions.length} Q</span>
          </div>
          <div className="flex flex-wrap gap-2 border-b border-[#f0eef8] pb-3 text-[9px] font-semibold text-[#777c9a]"><span className="rounded-full bg-[#f7f6fb] px-2.5 py-1.5"><Clock3 className="mr-1 inline h-3 w-3"/>{timeLimitMinutes ? timeLimitMinutes+' min' : 'No time limit'}</span><span className="rounded-full bg-[#f7f6fb] px-2.5 py-1.5">{questionType}</span><span className="rounded-full bg-[#f7f6fb] px-2.5 py-1.5">{bilingual ? 'MM / EN' : 'Source language'}</span></div>
          {previewQuestions.length ? previewQuestions.map((q,i)=><div key={q.id} className="border-b border-[#f1eff8] py-3 last:border-0"><p className="text-[11px] font-bold leading-5 text-[#35375b]">{String(i+1).padStart(2,'0')}. {q.text || 'Question text not entered yet'}</p>{q.type==='mcq' && <div className="mt-2 space-y-1.5">{(q.options||[]).map((o,j)=><div key={j} className={'flex items-center gap-2 rounded-lg border px-2.5 py-2 text-[10px] '+(Number(q.correctOption)===j?'border-[#c5b8f7] bg-[#f4f0ff] text-[#5746ba]':'border-[#eeedf5] bg-[#fbfbfd] text-[#696e89]')}><span className="grid h-5 w-5 place-items-center rounded-full bg-white text-[9px] font-extrabold">{String.fromCharCode(65+j)}</span><span className="flex-1">{o}</span>{Number(q.correctOption)===j&&<Check className="h-3.5 w-3.5"/>}</div>)}</div>}</div>) : <div className="rounded-xl bg-[#faf9ff] p-4 text-center"><FileText className="mx-auto h-7 w-7 text-[#b4a7ed]"/><p className="mt-2 text-[11px] font-bold text-[#5f6184]">Your quiz preview will appear here</p><p className="mt-1 text-[10px] text-[#999bb0]">Upload your material and generate questions.</p></div>}
          <div className="flex items-center justify-between rounded-xl bg-[#f7f6fc] px-3 py-2.5"><span className="text-[10px] font-bold text-[#737894]">Total marks</span><b className="text-[12px] font-black text-[#34365d]">{totalBuilderMarks}</b></div>
          <button type="button" onClick={onClear} className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[#e9e7f3] py-2.5 text-[10px] font-bold text-[#777a96] hover:bg-[#faf9ff]"><RotateCcw className="h-3.5 w-3.5"/> Clear quiz</button>
        </aside>
      </div>
    </section>
  );
}
