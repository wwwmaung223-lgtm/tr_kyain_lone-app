import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
const SubscriptionCenter = React.lazy(() => import('./SubscriptionCenter.jsx'));
const TeachingHub = React.lazy(() => import('./TeachingHub.jsx'));
const AiQuizStudio = React.lazy(() => import('./AiQuizStudio.jsx'));
import {
  Camera,
  Sparkles,
  Plus,
  Trash2,
  Copy,
  Check,
  Send,
  Award,
  Users,
  FileText,
  CheckCircle2,
  XCircle,
  ExternalLink,
  GraduationCap,
  Link as LinkIcon,
  ClipboardCheck,
  Search,
  Eye,
  RotateCcw,
  Pencil,
  Image as ImageIcon,
  Loader2,
  ChevronRight,
  Wand2,
  Mail,
  Lock,
  LogOut,
  UserCheck,
  KeyRound,
  Share2,
  Hash
} from 'lucide-react';

// ============================================================================
// Supabase setup (Auth + Postgres)
// ============================================================================
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const hasSupabaseConfig = Boolean(supabaseUrl && supabasePublishableKey);
const supabase = hasSupabaseConfig ? createClient(supabaseUrl, supabasePublishableKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
}) : null;

const LOCAL_KEYS = {
  TEACHERS: 'tr_kyain_lone_teachers',
  QUIZZES: 'tr_kyain_lone_quizzes',
  SUBMISSIONS: 'tr_kyain_lone_submissions',
  SESSION: 'tr_kyain_lone_active_teacher'
};

const readLocalMap = (key) => {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

const writeLocalMap = (key, data) => {
  try {
    window.localStorage.setItem(key, JSON.stringify(data));
  } catch {
    // Ignore storage quota errors
  }
};

// ============================================================================
// SHORT 6-CHARACTER ALPHANUMERIC ID & HASH URL BUILDER (404-Proof)
// ============================================================================
const generateShortCode = (length = 6) => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

const buildCleanShortUrl = (paramKey, code) => {
  const configuredBase = import.meta.env.VITE_PUBLIC_SHORT_BASE_URL?.trim();
  const baseUrl = (configuredBase || window.location.origin).replace(/\/$/, '');
  return `${baseUrl}/?${paramKey}=${encodeURIComponent(code.toUpperCase())}`;
};

const parseShortCodeFromInput = (rawInput, expectedPrefix) => {
  const cleaned = rawInput.trim();
  if (!cleaned) return '';
  try {
    if (cleaned.includes('#')) {
      const hashPart = cleaned.split('#')[1];
      if (hashPart && hashPart.toLowerCase().startsWith(`${expectedPrefix}=`)) {
        return hashPart.slice(2).trim().toUpperCase();
      }
    }
    if (cleaned.includes('?')) {
      const urlObj = new URL(cleaned.startsWith('http') ? cleaned : `https://x.com/${cleaned}`);
      const val = urlObj.searchParams.get(expectedPrefix);
      if (val) return val.toUpperCase();
    }
    if (cleaned.toLowerCase().startsWith(`${expectedPrefix}=`)) {
      return cleaned.slice(2).trim().toUpperCase();
    }
  } catch {
    // Fall back to direct code parsing
  }
  return cleaned.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
};

// ============================================================================
// ASYNC N8N MULTIMODAL PHOTO/PDF-TO-QUIZ GENERATOR
// ============================================================================
// AI generation runs through the same-origin Vercel serverless endpoint.

const normalizeGeneratedQuiz = (result) => {
  const questions = Array.isArray(result?.questions) ? result.questions : [];
  if (!questions.length) throw new Error('AI က မေးခွန်းမထုတ်ပေးနိုင်ပါ။ ဖိုင်ကို ပြန်စစ်ပြီး ထပ်ကြိုးစားပါ။');
  return {
    title: result.title || 'AI Generated Quiz',
    description: result.description || 'မေးခွန်းအားလုံးကို သေချာစွာ ဖြေဆိုပါ။',
    questions: questions.map((q, idx) => ({
      id: `ai-q-${Date.now()}-${idx}`,
      type: q.type === 'written' ? 'written' : 'mcq',
      text: String(q.text || ''),
      marks: Math.max(1, Number(q.marks) || (q.type === 'mcq' ? 2 : 5)),
      options: q.type === 'written' ? [] : (Array.isArray(q.options) && q.options.length === 4 ? q.options : []),
      correctOption: q.type === 'written' || q.correctOption === null || q.correctOption === undefined || !Number.isInteger(Number(q.correctOption)) ? null : Number(q.correctOption)
    }))
  };
};

const generateQuizFromApi = async (base64Data, mimeType, customInstruction, onStatus) => {
  if (!supabase) throw new Error('Supabase ချိတ်ဆက်မှု မရှိသေးပါ။');
  onStatus?.('Gemini AI သို့ ဖိုင်ပို့နေပါသည်...');
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData?.session?.access_token) throw new Error('ဆရာ/ဆရာမ အကောင့်ကို ပြန်ဝင်ပါ။');
  const accessToken = sessionData.session.access_token;
  const response = await fetch('/api/generate-quiz', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ base64Data, mimeType, customInstruction, accessToken })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success) {
    throw new Error(data.error || `AI API request failed (${response.status})`);
  }
  onStatus?.('မေးခွန်းများကို စစ်ဆေးနေပါသည်...');
  const quiz = normalizeGeneratedQuiz(data);
  onStatus?.('completed');
  return quiz;
};

// ============================================================================
// DEFAULT SAMPLE QUIZ TEMPLATE FOR NEW TEACHERS (DEMO26 & DEMO01)
// ============================================================================
const DEFAULT_SAMPLE_QUIZ = {
  code: 'DEMO26',
  teacherEmail: 'tr.yamin@gmail.com',
  teacherName: 'Tr. Yamin',
  title: 'Grade 10 English - Unit 1 Quick Test',
  description: 'ရွေးဖြေ (MCQ) နှင့် ရေးဖြေ (Written) မေးခွန်းများကို သေချာဖတ်၍ ဖြေဆိုပါ။',
  worksheetImage: '',
  questions: [
    {
      id: 'q1',
      type: 'mcq',
      text: 'She ________ to the library every Saturday morning to read English books.',
      marks: 2,
      options: ['go', 'goes', 'going', 'gone'],
      correctOption: 1
    },
    {
      id: 'q2',
      type: 'mcq',
      text: 'Choose the synonym of "Diligent":',
      marks: 2,
      options: ['Lazy', 'Hardworking', 'Careless', 'Slow'],
      correctOption: 1
    },
    {
      id: 'q3',
      type: 'written',
      text: 'Write two sentences about why learning English is useful for students.',
      marks: 6,
      options: [],
      correctOption: null
    }
  ]
};

// ============================================================================
// MAIN MOBILE-FIRST iOS 26 APPLICATION COMPONENT
// ============================================================================
export default function App() {
  // Supabase Auth User
  const [fbUser, setFbUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);

  // Teacher Account Session State (Gmail + Custom Password)
  const [teacherAccount, setTeacherAccount] = useState(null);
  const [authMode, setAuthMode] = useState('login'); // 'login' | 'register'
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [registerName, setRegisterName] = useState('');
  const [authError, setAuthError] = useState('');
  const [isAuthLoading, setIsAuthLoading] = useState(false);

  // Navigation & Global UI Feedback
  const [activeTab, setActiveTab] = useState('creator'); // 'creator' | 'student' | 'dashboard' | 'subscription' | 'teaching'
  const adminLogoTapRef = useRef({ count: 0, at: 0 });
  const [toast, setToast] = useState('');
  const [copiedId, setCopiedId] = useState('');

  // Teacher Quiz Builder & AI Photo State
  const [quizTitle, setQuizTitle] = useState(DEFAULT_SAMPLE_QUIZ.title);
  const [quizDesc, setQuizDesc] = useState(DEFAULT_SAMPLE_QUIZ.description);
  const [timeLimitMinutes, setTimeLimitMinutes] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const timerSubmissionLock = useRef(false);
  const studentSubmitHandlerRef = useRef(null);
  const [questions, setQuestions] = useState(DEFAULT_SAMPLE_QUIZ.questions);
  const [generatedQuizCode, setGeneratedQuizCode] = useState('');
  const [generatedQuizLink, setGeneratedQuizLink] = useState('');
  const [isSavingQuiz, setIsSavingQuiz] = useState(false);
  const [myQuizzes, setMyQuizzes] = useState([]);
  const [editingQuizCode, setEditingQuizCode] = useState('');

  // Worksheet Image + Quick Answer Sheet States (No AI Required)
  const [worksheetImage, setWorksheetImage] = useState('');
  const [worksheetZoomed, setWorksheetZoomed] = useState(false);
  const [sheetCount, setSheetCount] = useState(10);
  const [sheetMode, setSheetMode] = useState('mcq4'); // 'mcq3' | 'mcq4' | 'written'
  const [sheetDefaultMarks, setSheetDefaultMarks] = useState(1);

  // AI Photo Upload States
  const fileInputRef = useRef(null);
  const [uploadedPreview, setUploadedPreview] = useState('');
  const [uploadedBase64, setUploadedBase64] = useState('');
  const [uploadedMime, setUploadedMime] = useState('image/jpeg');
  const [aiPromptNote, setAiPromptNote] = useState('');
  const [isAiGenerating, setIsAiGenerating] = useState(false);
  const [aiError, setAiError] = useState('');
  const [aiStatus, setAiStatus] = useState('');
  const [uploadedFileName, setUploadedFileName] = useState('');

  // Student Exam Portal States (No Teacher Login Required!)
  const [activeQuiz, setActiveQuiz] = useState(DEFAULT_SAMPLE_QUIZ);
  const [studentName, setStudentName] = useState('');
  const [studentRoll, setStudentRoll] = useState('');
  const [studentAnswers, setStudentAnswers] = useState({});
  const [generatedResultCode, setGeneratedResultCode] = useState('');
  const [generatedResultLink, setGeneratedResultLink] = useState('');
  const [studentError, setStudentError] = useState('');
  const [isSubmittingStudent, setIsSubmittingStudent] = useState(false);
  const [pasteQuizInput, setPasteQuizInput] = useState('');
  const [landingStudentCode, setLandingStudentCode] = useState('');
  const [isLoadingQuizCode, setIsLoadingQuizCode] = useState(false);

  // Teacher Grading & Gradebook States
  const [allSubmissions, setAllSubmissions] = useState([]);
  const [selectedSubCode, setSelectedSubCode] = useState('');
  const [gradingMarks, setGradingMarks] = useState({});
  const [pasteResultInput, setPasteResultInput] = useState('');
  const [pasteResultError, setPasteResultError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSavingGrade, setIsSavingGrade] = useState(false);

  const notify = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3200);
  };

  const copyToClipboard = async (text, idKey, label = 'Short Code / Link') => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopiedId(idKey);
    notify(`${label} ကို Copy ကူးပြီးပါပြီ ✓`);
    setTimeout(() => setCopiedId(''), 2200);
  };

  // ==========================================================================
  // WORKSHEET IMAGE UPLOAD & QUICK ANSWER SHEET BUILDER HANDLERS
  // ==========================================================================
  const handleWorksheetUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const maxW = 800;
        const scale = img.width > maxW ? maxW / img.width : 1;
        const canvas = document.createElement('canvas');
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        setWorksheetImage(canvas.toDataURL('image/jpeg', 0.65));
        setGeneratedQuizLink('');
        notify('မေးခွန်းစာရွက်ပုံ တင်ပြီးပါပြီ ✓');
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  };

  const generateAnswerSheetQuestions = () => {
    const count = Math.max(1, Math.min(60, Number(sheetCount) || 1));
    const isMcq = sheetMode === 'mcq3' || sheetMode === 'mcq4';
    const optCount = sheetMode === 'mcq4' ? 4 : 3;
    const letters = Array.from({ length: optCount }, (_, i) => String.fromCharCode(65 + i));

    const built = Array.from({ length: count }, (_, i) => ({
      id: `ws-q-${Date.now()}-${i + 1}`,
      type: isMcq ? 'mcq' : 'written',
      text: `Question ${i + 1} (အပေါ်ပုံကို ကြည့်၍ ဖြေပါ)`,
      marks: Number(sheetDefaultMarks) || 1,
      options: isMcq ? letters : [],
      correctOption: isMcq ? 0 : null
    }));

    setQuestions(built);
    setGeneratedQuizLink('');
    setGeneratedQuizCode('');
    notify(`Answer Sheet (${count} ပုဒ်) ထုတ်ပေးပြီးပါပြီ ✓`);
  };

  // ==========================================================================
  // 1. INITIALIZE SUPABASE AUTH
  // ==========================================================================
  useEffect(() => {
    const localQuizzes=readLocalMap(LOCAL_KEYS.QUIZZES);
    if(!localQuizzes['DEMO26']){localQuizzes['DEMO26']={...DEFAULT_SAMPLE_QUIZ,createdAtMs:Date.now()};writeLocalMap(LOCAL_KEYS.QUIZZES,localQuizzes);}
    setMyQuizzes(Object.values(localQuizzes));setAllSubmissions(Object.values(readLocalMap(LOCAL_KEYS.SUBMISSIONS)));
    if(!supabase){setAuthReady(true);return;}
    supabase.auth.getSession().then(({data})=>{const user=data?.session?.user||null;setFbUser(user);setTeacherAccount(user?{email:user.email,displayName:user.user_metadata?.display_name||user.email?.split('@')[0]||'Teacher',uid:user.id}:null);setAuthReady(true);}).catch(()=>setAuthReady(true));
    const {data:authListener}=supabase.auth.onAuthStateChange((_event,session)=>{const user=session?.user||null;setFbUser(user);setTeacherAccount(user?{email:user.email,displayName:user.user_metadata?.display_name||user.email?.split('@')[0]||'Teacher',uid:user.id}:null);setAuthReady(true);});
    return()=>authListener.subscription.unsubscribe();
  },[]);

  // 2. DETECT HASH / URL PARAMETERS (#q=XXXXXX or #s=XXXXXX) ON LOAD & HASHCHANGE
  // ==========================================================================
  useEffect(() => {
    if (!authReady) return;

    const inspectRouteParams = async () => {
      const params = new URLSearchParams(window.location.search);
      const hash = window.location.hash || '';
      const qCode =
        params.get('q') || (hash.toLowerCase().startsWith('#q=') ? hash.slice(3) : null);
      const sCode =
        params.get('s') || (hash.toLowerCase().startsWith('#s=') ? hash.slice(3) : null);

      if (qCode) {
        await fetchQuizByShortCode(qCode.toUpperCase(), true);
      } else if (sCode) {
        setActiveTab('dashboard');
        setSelectedSubCode(sCode.toUpperCase());
      }
    };

    inspectRouteParams();
    window.addEventListener('hashchange', inspectRouteParams);
    return () => window.removeEventListener('hashchange', inspectRouteParams);
  }, [authReady, fbUser]);

  // ==========================================================================
  // 3. LOAD TEACHER QUIZZES & SUBMISSIONS FROM SUPABASE
  // ==========================================================================
  useEffect(()=>{
    let cancelled=false;
    const loadTeacherData=async()=>{
      if(!fbUser||!supabase)return;
      const [qr,sr]=await Promise.all([
        supabase.from('quiz_assessments').select('quiz_data').eq('teacher_id',fbUser.id).order('created_at',{ascending:false}),
        supabase.from('quiz_submissions').select('submission_data').eq('teacher_id',fbUser.id).order('created_at',{ascending:false})
      ]);
      if(cancelled)return;
      if(qr.error)console.warn('Supabase quizzes:',qr.error.message);
      else{const merged={...readLocalMap(LOCAL_KEYS.QUIZZES)};(qr.data||[]).forEach(row=>{if(row.quiz_data?.code)merged[row.quiz_data.code]=row.quiz_data;});writeLocalMap(LOCAL_KEYS.QUIZZES,merged);setMyQuizzes(Object.values(merged).sort((x,y)=>(y.createdAtMs||0)-(x.createdAtMs||0)));}
      if(sr.error)console.warn('Supabase submissions:',sr.error.message);
      else{const merged={...readLocalMap(LOCAL_KEYS.SUBMISSIONS)};(sr.data||[]).forEach(row=>{const sub=row.submission_data;if(sub?.code)merged[sub.code]=sub;});writeLocalMap(LOCAL_KEYS.SUBMISSIONS,merged);setAllSubmissions(Object.values(merged).sort((x,y)=>(y.submittedAtMs||0)-(x.submittedAtMs||0)));}
    };loadTeacherData();return()=>{cancelled=true;};
  },[fbUser]);

  const teacherQuizzes = useMemo(() => {
    if (!teacherAccount) return [];
    return myQuizzes.filter(
      (q) => q.teacherEmail?.toLowerCase() === teacherAccount.email.toLowerCase()
    );
  }, [myQuizzes, teacherAccount]);

  const teacherSubmissions = useMemo(() => {
    if (!teacherAccount) return [];
    return allSubmissions.filter(
      (s) => s.teacherEmail?.toLowerCase() === teacherAccount.email.toLowerCase()
    );
  }, [allSubmissions, teacherAccount]);

  useEffect(() => {
    if (!selectedSubCode && teacherSubmissions.length > 0) {
      setSelectedSubCode(teacherSubmissions[0].code);
    }
  }, [teacherSubmissions, selectedSubCode]);

  // Complete a successful Supabase teacher sign-in.
  const completeTeacherLogin = (account, message) => {
    setFbUser({ id: account.uid, email: account.email });
    setTeacherAccount(account);
    setAuthError('');
    setLoginPassword('');
    setActiveTab('dashboard');
    notify(message);
  };

  // ==========================================================================
  // 4. TEACHER GMAIL + PASSWORD LOGIN / REGISTRATION HANDLERS
  const handleTeacherAuthSubmit=async(e)=>{
    e.preventDefault();setAuthError('');const email=loginEmail.trim().toLowerCase(),password=loginPassword;
    if(!supabase){setAuthError('Supabase ချိတ်ဆက်မှု မရှိသေးပါ။ Vercel Environment Variables ကို စစ်ပါ။');return;}
    if(!email||!email.includes('@')){setAuthError('Gmail လိပ်စာ မှန်ကန်စွာ ထည့်ပါ။');return;}
    if(password.length<6){setAuthError('Password အနည်းဆုံး ၆ လုံး ထည့်ပါ။');return;}
    setIsAuthLoading(true);
    try{let result;if(authMode==='register'){const displayName=registerName.trim()||email.split('@')[0];result=await supabase.auth.signUp({email,password,options:{data:{display_name:displayName},emailRedirectTo:`${window.location.origin}/`}});}else result=await supabase.auth.signInWithPassword({email,password});if(result.error)throw result.error;if(!result.data?.user)throw new Error('အကောင့်အတည်ပြုရန် Email ကို စစ်ဆေးပါ။');if(authMode==='register'&&!result.data.session)throw new Error('Email အတည်ပြုရန် Inbox ကို စစ်ဆေးပြီးမှ Login ဝင်ပါ။');const user=result.data.user,displayName=user.user_metadata?.display_name||email.split('@')[0];completeTeacherLogin({email,displayName,uid:user.id},authMode==='register'?`အကောင့်အသစ် ဖွင့်ပြီးပါပြီ။ ကြိုဆိုပါတယ် ${displayName}`:`ပြန်လည်ကြိုဆိုပါတယ် ${displayName}`);}
    catch(err){const messages={'User already registered':'ဤ Gmail ဖြင့် အကောင့်ဖွင့်ပြီးသားပါ။ Login ဝင်ပါ။','Invalid login credentials':'Gmail သို့မဟုတ် Password မှားနေပါသည်။','Email not confirmed':'Email အတည်ပြုရန် Inbox ကို စစ်ဆေးပါ။'};setAuthError(messages[err.message]||err.message||'အကောင့်ဝင်ရာတွင် အခက်အခဲရှိပါသည်။');}finally{setIsAuthLoading(false);}
  };
  const handleTeacherLogout=async()=>{try{if(supabase)await supabase.auth.signOut();}catch(err){console.warn('Sign out:',err);}setTeacherAccount(null);setFbUser(null);setLoginPassword('');setGeneratedQuizLink('');setGeneratedQuizCode('');notify('အကောင့်မှ ထွက်လိုက်ပါပြီ');};

  // 5. AI PHOTO-TO-QUIZ HANDLERS
  // ==========================================================================
  const handleImageSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAiError('');
    setAiStatus('');
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (!allowedTypes.includes(file.type)) {
      setAiError('JPEG, PNG, WebP ဓာတ်ပုံ သို့မဟုတ် PDF ဖိုင်ကိုသာ တင်နိုင်ပါသည်။');
      e.target.value = '';
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      setAiError('ဖိုင်အရွယ်အစား 3MB အောက်ဖြစ်အောင် လျှော့ပြီး ပြန်တင်ပါ။ AI API သို့ ပို့ရာတွင် လုံခြုံစိတ်ချစွာ လက်ခံနိုင်ရန် ကန့်သတ်ထားပါသည်။');
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      setUploadedPreview(file.type === 'application/pdf' ? '' : dataUrl);
      const [, base64] = dataUrl.split(',');
      setUploadedMime(file.type);
      setUploadedBase64(base64);
      setUploadedFileName(file.name);
    };
    reader.onerror = () => setAiError('ဖိုင်ဖတ်မရပါ။ ထပ်ရွေးကြည့်ပါ။');
    reader.readAsDataURL(file);
  };

  const handleRunGeminiPhotoToQuiz = async (instruction = aiPromptNote) => {
    if (!uploadedBase64) {
      setAiError('မေးခွန်းဓာတ်ပုံ သို့မဟုတ် PDF ဖိုင် အရင်ရွေးချယ်ပေးပါ ဆရာ/ဆရာမ။');
      return;
    }
    if (!fbUser || !supabase) {
      setAiError('AI မေးခွန်းထုတ်ရန် ဆရာ/ဆရာမ အကောင့်ဖြင့် ဝင်ထားရန် လိုအပ်ပါသည်။');
      return;
    }

    setIsAiGenerating(true);
    setAiError('');
    setAiStatus('queued');
    try {
      const aiResult = await generateQuizFromApi(
        uploadedBase64,
        uploadedMime,
        instruction,
        setAiStatus
      );
      setQuizTitle(aiResult.title);
      setQuizDesc(aiResult.description);
      setQuestions(aiResult.questions);
      setGeneratedQuizLink('');
      setGeneratedQuizCode('');
      setAiStatus('completed');
      notify(`AI မှ မေးခွန်း ${aiResult.questions.length} ပုဒ် ထုတ်ပေးပြီးပါပြီ။ ပြန်စစ်ပြီးမှ သိမ်းဆည်းပါ။`);
    } catch (err) {
      console.error(err);
      setAiStatus('failed');
      setAiError(err.message || 'AI မေးခွန်းထုတ်ရာတွင် အခက်အခဲရှိပါသည်။');
    } finally {
      setIsAiGenerating(false);
    }
  };

  // ==========================================================================
  // 6. QUIZ EDITING & SHORT 6-CHAR LINK GENERATION (Cloud Saved)
  // ==========================================================================
  const totalBuilderMarks = useMemo(
    () => questions.reduce((sum, q) => sum + (Number(q.marks) || 0), 0),
    [questions]
  );

  const addQuestion = (type) => {
    setQuestions((prev) => [
      ...prev,
      {
        id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        type,
        text: '',
        marks: type === 'mcq' ? 2 : 5,
        options: type === 'mcq' ? ['', '', '', ''] : [],
        correctOption: type === 'mcq' ? 0 : null
      }
    ]);
    setGeneratedQuizLink('');
  };

  const updateQuestion = (id, field, val) => {
    setQuestions((prev) => prev.map((q) => (q.id === id ? { ...q, [field]: val } : q)));
    setGeneratedQuizLink('');
  };

  const updateOption = (qId, idx, val) => {
    setQuestions((prev) =>
      prev.map((q) => {
        if (q.id !== qId) return q;
        const opts = [...q.options];
        opts[idx] = val;
        return { ...q, options: opts };
      })
    );
    setGeneratedQuizLink('');
  };

  const deleteQuestion = (id) => {
    setQuestions((prev) => prev.filter((q) => q.id !== id));
    setGeneratedQuizLink('');
  };

  const handleEditQuiz = (quiz) => {
    setEditingQuizCode(quiz.code);
    setQuizTitle(quiz.title || '');
    setQuizDesc(quiz.description || '');
    setWorksheetImage(quiz.worksheetImage || '');
    setTimeLimitMinutes(Number(quiz.timeLimitMinutes) || 0);
    setQuestions((quiz.questions || []).map((q) => ({ ...q, options: [...(q.options || [])] })));
    setGeneratedQuizCode('');
    setGeneratedQuizLink('');
    setActiveTab('creator');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    notify(`Quiz ${quiz.code} ကို ပြင်ဆင်ရန် ဖွင့်လိုက်ပါပြီ`);
  };

  const handleDeleteQuiz = async (quiz) => {
    if (!window.confirm(`“${quiz.title}” (${quiz.code}) ကို ဖျက်မှာ သေချာပါသလား?`)) return;
    try {
      const local = readLocalMap(LOCAL_KEYS.QUIZZES);
      delete local[quiz.code];
      writeLocalMap(LOCAL_KEYS.QUIZZES, local);
      if(fbUser&&supabase){const {error}=await supabase.from('quiz_assessments').delete().eq('code',quiz.code).eq('teacher_id',fbUser.id);if(error)throw error;}
      setMyQuizzes(Object.values(local));
      if (editingQuizCode === quiz.code) setEditingQuizCode('');
      notify('မေးခွန်းလွှာကို ဖျက်ပြီးပါပြီ');
    } catch (err) {
      console.error('Delete quiz:', err);
      notify('ဖျက်ရာတွင် အခက်အခဲရှိပါသည်။ Cloud permission ကိုစစ်ပါ။');
    }
  };

  const handleSaveAndGenerateShortQuiz = async () => {
    if (!teacherAccount) return;
    const isInvalid =
      !quizTitle.trim() ||
      questions.length === 0 ||
      questions.some(
        (q) =>
          !q.text.trim() ||
          (q.type === 'mcq' &&
            (q.options.length < 2 ||
              q.options.length > 4 ||
              q.options.some((o) => !String(o).trim()) ||
              (q.correctOption === null || q.correctOption === undefined) ||
              !Number.isInteger(Number(q.correctOption)) ||
              Number(q.correctOption) < 0 ||
              Number(q.correctOption) >= q.options.length))
      );

    if (isInvalid) {
      notify('ခေါင်းစဉ်၊ မေးခွန်းစာသား၊ MCQ ရွေးချယ်စရာများနှင့် အဖြေမှန်ကို စစ်ဆေးပါ။');
      return;
    }

    setIsSavingQuiz(true);
    try {
      const code = editingQuizCode || generateShortCode(6);
      const quizDoc = {
        code,
        teacherEmail: teacherAccount.email,
        teacherName: teacherAccount.displayName,
        title: quizTitle.trim(),
        description: quizDesc.trim(),
        worksheetImage: worksheetImage || '',
        timeLimitMinutes: Number(timeLimitMinutes) || 0,
        teacherUid: teacherAccount.uid || fbUser?.uid || null,
        questions,
        totalMarks: totalBuilderMarks,
        createdAt: new Date().toLocaleDateString(),
        createdAtMs: Date.now()
      };

      if(!supabase||!fbUser)throw new Error('Supabase အကောင့်ကို ပြန်ဝင်ပါ။');
      const studentData={...quizDoc,questions:quizDoc.questions.map(({correctOption,...q})=>q)};
      const {error:saveError}=await supabase.from('quiz_assessments').upsert({code,teacher_id:fbUser.id,teacher_email:fbUser.email,quiz_data:quizDoc,student_data:studentData,is_published:true},{onConflict:'code'});
      if(saveError)throw saveError;
      const localQuizzes=readLocalMap(LOCAL_KEYS.QUIZZES);localQuizzes[code]=quizDoc;writeLocalMap(LOCAL_KEYS.QUIZZES,localQuizzes);
      setMyQuizzes(Object.values(localQuizzes).sort((x,y)=>(y.createdAtMs||0)-(x.createdAtMs||0)));
      const shortUrl = buildCleanShortUrl('q', code);
      setGeneratedQuizCode(code);
      setGeneratedQuizLink(shortUrl);
      setEditingQuizCode('');
      setActiveQuiz(quizDoc);
      window.location.hash = `q=${code}`;
      notify(`Quiz Code (${code}) ထုတ်ပြီးပါပြီ 🎉`);
    } catch (err) {
      console.error('Save Quiz Error:', err);
      notify('မေးခွန်းသိမ်းဆည်းရာတွင် အခက်အခဲရှိပါသည်');
    } finally {
      setIsSavingQuiz(false);
    }
  };

  // ==========================================================================
  // 7. STUDENT SHORT CODE / HASH LOADER & DIRECT SUBMISSION
  // ==========================================================================
  const activeQuizTotalMarks = useMemo(
    () => (activeQuiz?.questions || []).reduce((s, q) => s + (Number(q.marks) || 0), 0),
    [activeQuiz]
  );

  const fetchQuizByShortCode = async (rawCode, switchToStudentTab = false) => {
    const code = rawCode?.trim().toUpperCase();
    if (!code) return;

    if (code === 'DEMO01' || code === 'DEMO26') {
      setActiveQuiz({ ...DEFAULT_SAMPLE_QUIZ, code });
      setStudentAnswers({});
      setGeneratedResultLink('');
      setGeneratedResultCode('');
      if (switchToStudentTab) setActiveTab('student');
      notify(`နမူနာမေးခွန်း (${code}) ဖွင့်ပြီးပါပြီ ✓`);
      return;
    }

    setIsLoadingQuizCode(true);
    try {
      let foundQuiz=null;
      if(supabase){const {data,error}=await supabase.from('published_quizzes').select('student_data').eq('code',code).maybeSingle();if(error)throw error;foundQuiz=data?.student_data||null;}

      if (foundQuiz) {
        setActiveQuiz(foundQuiz);
        setStudentAnswers({});
        setGeneratedResultLink('');
        setGeneratedResultCode('');
        window.location.hash = `q=${code}`;
        if (switchToStudentTab) {
          setActiveTab('student');
        }
        notify(`မေးခွန်းလွှာ (${code}) ဖွင့်ပြီးပါပြီ ✓`);
      } else {
        notify(`Quiz Code "${code}" ရှာမတွေ့ပါ (Code ၆ လုံး ပြန်စစ်ပါ)`);
      }
    } catch (err) {
      console.error('Fetch Quiz Error:', err);
      notify('မေးခွန်းဖွင့်ရာတွင် အခက်အခဲရှိပါသည်');
    } finally {
      setIsLoadingQuizCode(false);
    }
  };

  const handleLoadStudentQuizInput = () => {
    const code = parseShortCodeFromInput(pasteQuizInput, 'q');
    if (!code) return;
    setPasteQuizInput('');
    fetchQuizByShortCode(code, false);
  };

  const handleLandingStudentQuickJoin = (e) => {
    e.preventDefault();
    const code = parseShortCodeFromInput(landingStudentCode, 'q');
    if (!code) {
      notify('ဆရာ/ဆရာမ ပေးထားသော Quiz Code ၆ လုံး ထည့်သွင်းပါ');
      return;
    }
    setLandingStudentCode('');
    fetchQuizByShortCode(code, true);
  };

  const handleStudentSubmit = async () => {
    if (generatedResultCode || isSubmittingStudent) return;
    if (!studentName.trim()) {
      setStudentError('ကျောင်းသားအမည် ထည့်သွင်းပေးပါ (Enter your name)');
      return;
    }

    setStudentError('');
    setIsSubmittingStudent(true);

    try {
      const subCode = generateShortCode(6);

      // Auto-grade MCQs immediately
      const autoGrades = {};
      let autoScore = 0;
      activeQuiz.questions.forEach((q) => {
        if (q.type === 'mcq' && q.correctOption !== null && studentAnswers[q.id] !== undefined) {
          const right = Number(studentAnswers[q.id]) === Number(q.correctOption);
          const pts = right ? Number(q.marks) : 0;
          autoGrades[q.id] = { status: right ? 'right' : 'wrong', marks: pts };
          autoScore += pts;
        } else {
          autoGrades[q.id] = { status: 'ungraded', marks: 0 };
        }
      });

      const subDoc = {
        code: subCode,
        quizCode: activeQuiz.code || 'DEMO26',
        teacherUid: activeQuiz.teacherUid || null,
        teacherEmail: activeQuiz.teacherEmail || teacherAccount?.email || 'tr.yamin@gmail.com',
        teacherName: activeQuiz.teacherName || 'Tr. Yamin',
        quizTitle: activeQuiz.title,
        questions: activeQuiz.questions,
        studentName: studentName.trim(),
        studentRoll: studentRoll.trim(),
        answers: studentAnswers,
        status: 'Pending',
        earnedMarks: autoScore,
        totalMarks: activeQuizTotalMarks,
        grades: autoGrades,
        submittedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        submittedAtMs: Date.now()
      };

      const localSubs = readLocalMap(LOCAL_KEYS.SUBMISSIONS);
      localSubs[subCode] = subDoc;
      writeLocalMap(LOCAL_KEYS.SUBMISSIONS, localSubs);
      setAllSubmissions(
        Object.values(localSubs).sort((a, b) => (b.submittedAtMs || 0) - (a.submittedAtMs || 0))
      );

      if (supabase && activeQuiz.teacherUid) {
        const { error: submitError } = await supabase.from('quiz_submissions').insert({
          code: subCode,
          quiz_code: activeQuiz.code,
          teacher_id: activeQuiz.teacherUid,
          submission_data: subDoc,
          status: 'Pending'
        });
        if (submitError) throw submitError;
      }

      const shortResUrl = buildCleanShortUrl('s', subCode);
      setGeneratedResultCode(subCode);
      setGeneratedResultLink(shortResUrl);
      setSelectedSubCode(subCode);
      notify(`အဖြေလွှာ (${subCode}) ပေးပို့ပြီးပါပြီ! ဆရာ/ဆရာမထံ တိုက်ရိုက်ရောက်ရှိပါပြီ ✓`);
    } catch (err) {
      console.error('Submit Answer Error:', err);
      setStudentError('အဖြေပေးပို့ရာတွင် အခက်အခဲရှိသွားပါသည်။ ထပ်မံကြိုးစားပါ။');
    } finally {
      setIsSubmittingStudent(false);
    }
  };

  useEffect(() => {
    studentSubmitHandlerRef.current = handleStudentSubmit;
  });

  useEffect(() => {
    timerSubmissionLock.current = false;
    setRemainingSeconds(Math.max(0, Number(activeQuiz?.timeLimitMinutes || 0) * 60));
  }, [activeQuiz?.code, activeQuiz?.timeLimitMinutes]);

  useEffect(() => {
    const duration = Math.max(0, Number(activeQuiz?.timeLimitMinutes || 0) * 60);
    if (activeTab !== 'student' || duration <= 0 || !studentName.trim() || generatedResultCode) return;
    const timer = window.setInterval(() => {
      setRemainingSeconds((current) => {
        if (current <= 1) {
          window.clearInterval(timer);
          if (!timerSubmissionLock.current) {
            timerSubmissionLock.current = true;
            setTimeout(() => studentSubmitHandlerRef.current?.(), 0);
          }
          return 0;
        }
        return current - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [activeTab, activeQuiz?.code, activeQuiz?.timeLimitMinutes, studentName, generatedResultCode]);

  // ==========================================================================
  // 8. TEACHER GRADING & SCOREBOARD HANDLERS
  // ==========================================================================
  const selectedSubmission = useMemo(() => {
    const pool = teacherSubmissions;
    return pool.find((s) => s.code === selectedSubCode) || pool[0] || null;
  }, [teacherSubmissions, selectedSubCode]);

  useEffect(() => {
    if (!selectedSubmission) return;
    const initial = {};
    (selectedSubmission.questions || []).forEach((q) => {
      if (selectedSubmission.grades?.[q.id]) {
        initial[q.id] = { ...selectedSubmission.grades[q.id] };
      } else if (
        q.type === 'mcq' &&
        q.correctOption !== null &&
        selectedSubmission.answers?.[q.id] !== undefined
      ) {
        const isRight = Number(selectedSubmission.answers[q.id]) === Number(q.correctOption);
        initial[q.id] = { status: isRight ? 'right' : 'wrong', marks: isRight ? Number(q.marks) : 0 };
      } else {
        initial[q.id] = { status: 'ungraded', marks: 0 };
      }
    });
    setGradingMarks(initial);
  }, [selectedSubmission]);

  const setGradeChoice = (q, status) => {
    setGradingMarks((prev) => ({
      ...prev,
      [q.id]: {
        status,
        marks: status === 'right' ? Number(q.marks) : 0
      }
    }));
  };

  const setCustomQuestionScore = (q, val) => {
    const clamped = Math.max(0, Math.min(Number(q.marks), Number(val) || 0));
    setGradingMarks((prev) => ({
      ...prev,
      [q.id]: {
        status: clamped > 0 ? 'right' : 'wrong',
        marks: clamped
      }
    }));
  };

  const liveTotalScore = useMemo(
    () => Object.values(gradingMarks).reduce((sum, g) => sum + (Number(g?.marks) || 0), 0),
    [gradingMarks]
  );

  const handleSaveGrade = async () => {
    if (!selectedSubmission) return;
    setIsSavingGrade(true);
    try {
      const localSubs = readLocalMap(LOCAL_KEYS.SUBMISSIONS);
      if (localSubs[selectedSubmission.code]) {
        localSubs[selectedSubmission.code] = {
          ...localSubs[selectedSubmission.code],
          status: 'Graded',
          earnedMarks: liveTotalScore,
          grades: gradingMarks
        };
        writeLocalMap(LOCAL_KEYS.SUBMISSIONS, localSubs);
        setAllSubmissions(
          Object.values(localSubs).sort((a, b) => (b.submittedAtMs || 0) - (a.submittedAtMs || 0))
        );
      }

      if(fbUser&&supabase){const current=localSubs[selectedSubmission.code]||selectedSubmission;const {error}=await supabase.from('quiz_submissions').update({status:'Graded',submission_data:{...current,status:'Graded',earnedMarks:liveTotalScore,grades:gradingMarks}}).eq('code',selectedSubmission.code).eq('teacher_id',fbUser.id);if(error)throw error;}

      notify(
        `${selectedSubmission.studentName} ၏ ရမှတ် (${liveTotalScore}/${selectedSubmission.totalMarks}) သိမ်းပြီးပါပြီ ✓`
      );
    } catch (err) {
      console.error('Save Grade Error:', err);
      notify('အမှတ်သိမ်းဆည်းရာတွင် အခက်အခဲရှိပါသည်');
    } finally {
      setIsSavingGrade(false);
    }
  };

  const handleImportStudentShortCode = async () => {
    setPasteResultError('');
    const code = parseShortCodeFromInput(pasteResultInput, 's');
    if (!code) return;

    try {
      let foundSub=null;
      if(supabase&&fbUser){
        const {data,error}=await supabase.from('quiz_submissions').select('submission_data').eq('code',code).eq('teacher_id',fbUser.id).maybeSingle();if(error)throw error;foundSub=data?.submission_data||null;
        if(foundSub?.quizCode){const {data:quizRow,error:quizError}=await supabase.from('quiz_assessments').select('quiz_data').eq('code',foundSub.quizCode).eq('teacher_id',fbUser.id).maybeSingle();if(quizError)throw quizError;const answerMap=new Map((quizRow?.quiz_data?.questions||[]).map(q=>[q.id,q.correctOption]));foundSub={...foundSub,questions:(foundSub.questions||[]).map(q=>({...q,correctOption:answerMap.has(q.id)?answerMap.get(q.id):null}))};}
      }else{const localSubs=readLocalMap(LOCAL_KEYS.SUBMISSIONS);foundSub=localSubs[code]||null;}

      if (!foundSub) {
        setPasteResultError(`Submission Code "${code}" ရှာမတွေ့ပါ။`);
        return;
      }
      setSelectedSubCode(code);
      setPasteResultInput('');
      notify(`${foundSub.studentName} ၏ အဖြေလွှာကို ဖွင့်လိုက်ပါပြီ`);
    } catch (err) {
      console.error(err);
      setPasteResultError('အဖြေလွှာ ဖွင့်ရာတွင် အခက်အခဲရှိပါသည်။');
    }
  };

  const leaderboard = useMemo(() => teacherSubmissions
    .filter((s) => s.status === 'Graded' && Number(s.totalMarks) > 0)
    .sort((a, b) => (Number(b.earnedMarks) / Number(b.totalMarks)) - (Number(a.earnedMarks) / Number(a.totalMarks)))
    .slice(0, 5), [teacherSubmissions]);

  const filteredSubmissions = useMemo(() => {
    const list = teacherSubmissions;
    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase();
    return list.filter(
      (s) =>
        s.studentName.toLowerCase().includes(q) ||
        (s.code && s.code.toLowerCase().includes(q))
    );
  }, [teacherSubmissions, searchQuery]);

  const showTeacherAuthGate = (activeTab === 'creator' || activeTab === 'dashboard') && !teacherAccount;

  const displayWorksheetImg = activeQuiz?.worksheetImage || (activeQuiz?.code === generatedQuizCode ? worksheetImage : '');

  // ==========================================================================
  // RENDER MOBILE-FIRST iOS 26 VIEWPORT
  // ==========================================================================
  return (
    <div className="liquid-morph-shell min-h-screen w-full bg-gradient-to-br from-[#eef4ff] via-[#f7f5ff] to-[#ebf8ff] text-slate-800 flex justify-center selection:bg-indigo-200">
      <style>{`
        .ios-glass {
          background: rgba(255, 255, 255, 0.74);
          backdrop-filter: blur(22px) saturate(180%);
          -webkit-backdrop-filter: blur(22px) saturate(180%);
          border: 1px solid rgba(255, 255, 255, 0.85);
          box-shadow: 0 10px 30px -10px rgba(79, 70, 229, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.9);
        }
        .ios-glass-strong {
          background: rgba(255, 255, 255, 0.88);
          backdrop-filter: blur(26px) saturate(190%);
          -webkit-backdrop-filter: blur(26px) saturate(190%);
          border: 1px solid rgba(255, 255, 255, 0.95);
          box-shadow: 0 16px 40px -12px rgba(79, 70, 229, 0.16), inset 0 1px 0 rgba(255, 255, 255, 1);
        }
      `}</style>

      {/* Responsive app container */}
      <div className="relative z-10 w-full max-w-[1100px] min-h-screen flex flex-col sm:my-4 sm:min-h-[calc(100vh-2rem)] sm:rounded-[42px] sm:border-[6px] sm:border-white/80 sm:shadow-[0_25px_70px_-15px_rgba(79,70,229,0.22)] overflow-x-clip">
        {/* Top Floating Glass Header */}
        <header className="sticky top-0 z-30 px-4 pt-3 pb-2">
          <div className="ios-glass-strong rounded-[26px] px-4 py-2.5 flex items-center justify-between">
            <div className="flex items-center gap-2.5 min-w-0">
              <div onClick={() => { const now = Date.now(); const tap = adminLogoTapRef.current; if (now - tap.at > 1800) tap.count = 0; tap.at = now; tap.count += 1; if (tap.count >= 5) { tap.count = 0; setActiveTab(teacherAccount ? 'subscription' : 'creator'); if (!teacherAccount) notify('Admin Panel ဝင်ရန် အရင် Login ဝင်ပါ။'); } }} className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-indigo-600 via-violet-500 to-sky-400 flex items-center justify-center text-white shadow-md shadow-indigo-300/50 shrink-0 cursor-pointer select-none">
                <GraduationCap className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[16px] font-extrabold tracking-tight bg-gradient-to-r from-indigo-700 to-violet-600 bg-clip-text text-transparent truncate">
                    Tr.Kyain Lone
                  </span>
                  <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-indigo-500/10 text-indigo-700 border border-indigo-200/60 shrink-0">
                    Quiz
                  </span>
                </div>
                <p className="text-[10px] font-medium text-slate-500 leading-none mt-0.5 truncate">
                  {teacherAccount
                    ? `Teacher: ${teacherAccount.displayName}`
                    : 'Smart Mobile Quiz Platform'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {teacherAccount ? (
                <button
                  type="button"
                  onClick={handleTeacherLogout}
                  className="px-2.5 py-1.5 rounded-full text-[11px] font-bold bg-rose-50 text-rose-600 border border-rose-200/70 flex items-center gap-1 active:scale-95 transition"
                  title="Logout"
                >
                  <LogOut className="w-3 h-3" />
                  <span>ထွက်မည်</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setActiveTab(activeTab === 'student' ? 'creator' : 'student')}
                  className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-white/90 text-indigo-700 border border-indigo-100 shadow-xs"
                >
                  {activeTab === 'student' ? 'Teacher Login' : 'Student View'}
                </button>
              )}
            </div>
          </div>
        </header>

        {/* Floating Notification Pill (Toast) */}
        {toast && (
          <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 w-[90%] max-w-[380px]">
            <div className="bg-slate-900/90 backdrop-blur-xl text-white px-4 py-2.5 rounded-full shadow-xl border border-white/15 flex items-center justify-center gap-2 text-xs font-semibold">
              <Sparkles className="w-3.5 h-3.5 text-sky-400 shrink-0" />
              <span className="truncate">{toast}</span>
            </div>
          </div>
        )}

        {/* ==================================================================
            SCROLLABLE MOBILE BODY CONTENT
           ================================================================== */}
        <main className="flex-1 w-full max-w-5xl mx-auto px-4 md:px-8 pt-2 pb-28 space-y-4">
          {activeTab === 'teaching' && teacherAccount ? (
            <React.Suspense fallback={<div role="status" className="liquid-panel rounded-2xl p-5 text-center text-xs font-semibold text-slate-600">Loading Teaching Hub…</div>}>
              <TeachingHub supabase={supabase} user={fbUser} onClose={() => setActiveTab('creator')} />
            </React.Suspense>
          ) : activeTab === 'subscription' && teacherAccount ? (
            <React.Suspense fallback={<div role="status" className="liquid-panel rounded-2xl p-5 text-center text-xs font-semibold text-slate-600">Loading subscription…</div>}>
              <SubscriptionCenter supabase={supabase} user={fbUser} onClose={() => setActiveTab('creator')} />
            </React.Suspense>
          ) : showTeacherAuthGate ? (
            <div className="pt-1 space-y-4">
              {/* Student Quick Access Card */}
              <div className="ios-glass-strong rounded-[30px] p-4 border-2 border-indigo-200/80 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 text-white flex items-center justify-center shadow-xs">
                      <FileText className="w-4 h-4" />
                    </div>
                    <div>
                      <h2 className="text-xs font-extrabold text-slate-900">
                        ကျောင်းသား ဝင်ရောက်ဖြေဆိုရန် (Student Quick Access)
                      </h2>
                      <p className="text-[10px] text-slate-500">
                        အကောင့်ဝင်ရန်မလိုဘဲ Quiz Code ၆ လုံး ရိုက်ထည့်ပြီး ဖြေဆိုနိုင်ပါသည်
                      </p>
                    </div>
                  </div>
                </div>

                <form onSubmit={handleLandingStudentQuickJoin} className="flex gap-2">
                  <input
                    type="text"
                    maxLength={24}
                    value={landingStudentCode}
                    onChange={(e) => setLandingStudentCode(e.target.value)}
                    placeholder="Quiz Code ၆ လုံး (ဥပမာ - 85CEGF)"
                    className="flex-1 px-3.5 py-2.5 rounded-2xl bg-white/95 border border-indigo-200 text-xs font-mono font-extrabold uppercase tracking-wider text-indigo-800 placeholder:font-sans placeholder:font-normal placeholder:normal-case placeholder:tracking-normal placeholder:text-slate-400 focus:border-indigo-500 outline-none"
                  />
                  <button
                    type="submit"
                    disabled={isLoadingQuizCode}
                    className="px-4 py-2.5 rounded-2xl bg-gradient-to-r from-sky-500 to-indigo-600 text-white font-bold text-xs shadow-md shrink-0 flex items-center gap-1 active:scale-95 transition"
                  >
                    <span>{isLoadingQuizCode ? '...' : 'စဖြေမည်'}</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </form>

                <div className="flex items-center justify-between pt-1 text-[10px] text-slate-500">
                  <span>စမ်းသပ်ဖြေကြည့်လိုပါက:</span>
                  <button
                    type="button"
                    onClick={() => fetchQuizByShortCode('DEMO26', true)}
                    className="font-bold text-indigo-600 underline underline-offset-2"
                  >
                    နမူနာမေးခွန်း (DEMO26) ဖွင့်ကြည့်မည် →
                  </button>
                </div>
              </div>

              {!hasSupabaseConfig && (
                <div className="rounded-2xl border border-amber-300 bg-amber-50 p-3 text-[11px] text-amber-900">
                  Supabase မချိတ်ရသေးပါ။ Student demo ကိုသာ စမ်းနိုင်ပြီး Teacher account / Cloud sync အတွက် Setup လိုအပ်ပါသည်။
                </div>
              )}

              {/* Teacher Gmail & Password Login / Register Card */}
              <div className="ios-glass-strong rounded-[32px] p-5 space-y-4">
                <div className="text-center space-y-1.5">
                  <div className="w-12 h-12 mx-auto rounded-[20px] bg-gradient-to-tr from-indigo-600 via-violet-500 to-sky-400 text-white flex items-center justify-center shadow-lg shadow-indigo-300/50">
                    <GraduationCap className="w-6 h-6" />
                  </div>
                  <h1 className="text-base font-extrabold text-slate-900">
                    Tr.Kyain Lone (Teacher Portal)
                  </h1>
                  <p className="text-[11px] text-slate-500">
                    ဆရာ/ဆရာမများ Gmail နှင့် ကိုယ်ပိုင် Password ဖြင့် ဝင်ရောက်ပြီး မေးခွန်းထုတ်ခြင်းနှင့် အမှတ်စစ်ခြင်းများ ပြုလုပ်နိုင်ပါသည်
                  </p>
                </div>

                <div className="grid grid-cols-2 p-1 rounded-2xl bg-slate-200/60">
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode('login');
                      setAuthError('');
                    }}
                    className={`py-2 rounded-xl text-xs font-extrabold transition ${
                      authMode === 'login'
                        ? 'bg-white text-indigo-700 shadow-xs'
                        : 'text-slate-600'
                    }`}
                  >
                    အကောင့်ဝင်ရန် (Login)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode('register');
                      setAuthError('');
                    }}
                    className={`py-2 rounded-xl text-xs font-extrabold transition ${
                      authMode === 'register'
                        ? 'bg-white text-indigo-700 shadow-xs'
                        : 'text-slate-600'
                    }`}
                  >
                    အကောင့်သစ်ဖွင့်ရန်
                  </button>
                </div>

                <form onSubmit={handleTeacherAuthSubmit} className="space-y-3">
                  {authMode === 'register' && (
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        ဆရာ/ဆရာမ အမည် (Teacher Name)
                      </label>
                      <div className="relative">
                        <UserCheck className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          value={registerName}
                          onChange={(e) => setRegisterName(e.target.value)}
                          placeholder="ဥပမာ - Tr. Kyain lone"
                          className="w-full pl-10 pr-3.5 py-2.5 rounded-2xl bg-white/90 border border-slate-200 text-xs font-semibold text-slate-900 focus:border-indigo-500 outline-none"
                        />
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Gmail လိပ်စာ (Gmail Address)
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="email"
                        value={loginEmail}
                        onChange={(e) => setLoginEmail(e.target.value)}
                        placeholder="example@gmail.com"
                        className="w-full pl-10 pr-3.5 py-2.5 rounded-2xl bg-white/90 border border-slate-200 text-xs font-semibold text-slate-900 focus:border-indigo-500 outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      ကိုယ်ပိုင်စကားဝှက် (Password)
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="password"
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full pl-10 pr-3.5 py-2.5 rounded-2xl bg-white/90 border border-slate-200 text-xs font-semibold text-slate-900 focus:border-indigo-500 outline-none"
                      />
                    </div>
                  </div>

                  {authError && (
                    <p className="text-[11px] font-bold text-rose-600 bg-rose-50/95 px-3 py-2 rounded-xl border border-rose-200/70">
                      {authError}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={isAuthLoading}
                    className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-indigo-600 via-violet-600 to-sky-500 text-white font-bold text-xs shadow-lg shadow-indigo-300/40 flex items-center justify-center gap-2 transition active:scale-[0.98] disabled:opacity-60"
                  >
                    {isAuthLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>စစ်ဆေးနေပါသည်...</span>
                      </>
                    ) : (
                      <>
                        <KeyRound className="w-4 h-4" />
                        <span>
                          {authMode === 'login'
                            ? 'Gmail ဖြင့် အကောင့်ဝင်မည်'
                            : 'အကောင့်အသစ် ဖွင့်ပြီး ဝင်မည်'}
                        </span>
                      </>
                    )}
                  </button>
                </form>
              </div>

              <div className="ios-glass rounded-[26px] p-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-extrabold text-slate-800">
                    ကျောင်းသား ဖြစ်ပါသလား?
                  </p>
                  <p className="text-[11px] text-slate-500">
                    အကောင့်ဝင်ရန်မလိုဘဲ မေးခွန်းတိုက်ရိုက်ဖြေဆိုနိုင်ပါသည်
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('student')}
                  className="px-3.5 py-2 rounded-2xl bg-white text-indigo-700 border border-indigo-200 font-bold text-xs shadow-xs shrink-0 flex items-center gap-1"
                >
                  <span>မေးခွန်းဖြေရန်</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* ================================================================
                  TAB 1: QUIZ CREATOR (Worksheet Upload + Quick Answer Sheet + AI)
                 ================================================================ */}
              {activeTab === 'creator' && (
                <>
                  {/* 1. Fast Worksheet Upload + Quick Answer Sheet Card (No AI Fail) */}
                  <div className="ios-glass-strong rounded-[28px] p-4 space-y-3 border-2 border-indigo-200">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-extrabold text-slate-900">
                        Worksheet ပုံတင် + အဖြေလွှာ (Answer Sheet) ဆောက်မည်
                      </span>
                      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                        100% Instant
                      </span>
                    </div>

                    <label className="block w-full py-4 px-4 rounded-2xl border-2 border-dashed border-indigo-400 bg-gradient-to-b from-indigo-50/80 to-sky-50/80 text-center text-xs font-bold text-indigo-900 cursor-pointer hover:border-indigo-600 transition">
                      {worksheetImage ? '✓ မေးခွန်းစာရွက်ပုံ ပြောင်းရန် နှိပ်ပါ' : '+ မေးခွန်းစာရွက်ပုံ ရွေးချယ်ပါ (ကျောင်းသားများ ကြည့်ဖြေရန်)'}
                      <input type="file" accept="image/*" onChange={handleWorksheetUpload} className="hidden" />
                    </label>

                    {worksheetImage && (
                      <div className="relative rounded-2xl overflow-hidden border-2 border-indigo-300 shadow-md">
                        <img
                          src={worksheetImage}
                          alt="Worksheet preview"
                          className="w-full max-h-48 object-contain bg-white"
                        />
                        <button
                          type="button"
                          onClick={() => setWorksheetImage('')}
                          className="absolute top-2 right-2 px-2.5 py-1 rounded-full bg-rose-600 text-white text-[10px] font-bold shadow"
                        >
                          ပုံဖျက်မည်
                        </button>
                      </div>
                    )}

                    <div className="grid grid-cols-3 gap-2 pt-1">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-600 mb-1">မေးခွန်းပုဒ်ရေ</label>
                        <input
                          type="number"
                          min="1"
                          max="60"
                          value={sheetCount}
                          onChange={(e) => setSheetCount(e.target.value)}
                          className="w-full px-2.5 py-2 rounded-xl bg-white border border-slate-300 text-xs font-bold text-center outline-none focus:border-indigo-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-600 mb-1">အဖြေရွေးစရာ</label>
                        <select
                          value={sheetMode}
                          onChange={(e) => setSheetMode(e.target.value)}
                          className="w-full px-2 py-2 rounded-xl bg-white border border-slate-300 text-xs font-bold outline-none focus:border-indigo-500"
                        >
                          <option value="mcq3">A / B / C</option>
                          <option value="mcq4">A / B / C / D</option>
                          <option value="written">စာရိုက်ဖြေ</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-600 mb-1">တစ်ပုဒ်မှတ်</label>
                        <input
                          type="number"
                          min="0.5"
                          step="0.5"
                          value={sheetDefaultMarks}
                          onChange={(e) => setSheetDefaultMarks(e.target.value)}
                          className="w-full px-2.5 py-2 rounded-xl bg-white border border-slate-300 text-xs font-bold text-center outline-none focus:border-indigo-500"
                        />
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={generateAnswerSheetQuestions}
                      className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-bold text-xs shadow-lg shadow-indigo-300/50 active:scale-[0.98] transition"
                    >
                      အောက်မှာ ဖြေရမယ့် Answer Sheet ထုတ်မည်
                    </button>
                  </div>

                  {/* 2. Figma-aligned AI Quiz Studio — upload, settings and live question preview */}
                  <React.Suspense fallback={<div role="status" className="liquid-panel rounded-2xl p-5 text-center text-xs font-semibold text-slate-600">Loading AI Studio…</div>}>
                  <AiQuizStudio
                    fileInputRef={fileInputRef}
                    uploadedPreview={uploadedPreview}
                    uploadedBase64={uploadedBase64}
                    uploadedMime={uploadedMime}
                    uploadedFileName={uploadedFileName}
                    handleImageSelect={handleImageSelect}
                    handleRunGeminiPhotoToQuiz={handleRunGeminiPhotoToQuiz}
                    isAiGenerating={isAiGenerating}
                    aiStatus={aiStatus}
                    aiError={aiError}
                    aiPromptNote={aiPromptNote}
                    setAiPromptNote={setAiPromptNote}
                    quizTitle={quizTitle}
                    setQuizTitle={(value) => { setQuizTitle(value); setGeneratedQuizLink(''); }}
                    quizDesc={quizDesc}
                    setQuizDesc={setQuizDesc}
                    timeLimitMinutes={timeLimitMinutes}
                    setTimeLimitMinutes={setTimeLimitMinutes}
                    questions={questions}
                    totalBuilderMarks={totalBuilderMarks}
                    onClear={() => {
                      setQuizTitle('');
                      setQuizDesc('');
                      setQuestions([]);
                      setGeneratedQuizLink('');
                      setGeneratedQuizCode('');
                      setUploadedPreview('');
                      setUploadedBase64('');
                      setUploadedFileName('');
                      setAiPromptNote('');
                      setWorksheetImage('');
                    }}
                  />
                  </React.Suspense>

                  {/* 4. Editable Questions List (အဖြေမှန် ရွေးချယ်သတ်မှတ်ရန်) */}
                  <div className="space-y-3">
                    {questions.map((q, idx) => (
                      <div key={q.id} className="ios-glass rounded-[26px] p-4 space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="w-6 h-6 rounded-full bg-indigo-600 text-white text-xs font-extrabold flex items-center justify-center">
                              {idx + 1}
                            </span>
                            <span
                              className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                                q.type === 'mcq'
                                  ? 'bg-sky-100/80 text-sky-800'
                                  : 'bg-amber-100/80 text-amber-800'
                              }`}
                            >
                              {q.type === 'mcq' ? 'ရွေးဖြေ (MCQ) — အဖြေမှန် နှိပ်ရွေးပါ' : 'ရေးဖြေ (Written)'}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <div className="flex items-center bg-white/90 px-2 py-1 rounded-full border border-slate-200/80">
                              <input
                                type="number"
                                min="0.5"
                                step="0.5"
                                value={q.marks}
                                onChange={(e) =>
                                  updateQuestion(q.id, 'marks', Math.max(0.5, Number(e.target.value)))
                                }
                                className="w-8 text-center text-xs font-extrabold text-indigo-700 bg-transparent outline-none"
                              />
                              <span className="text-[10px] text-slate-500">မှတ်</span>
                            </div>

                            <button
                              type="button"
                              onClick={() => deleteQuestion(q.id)}
                              className="p-1.5 rounded-full bg-rose-50 text-rose-500 hover:bg-rose-100"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        <textarea
                          rows={2}
                          value={q.text}
                          onChange={(e) => updateQuestion(q.id, 'text', e.target.value)}
                          placeholder="မေးခွန်းစာသား ရေးပါ..."
                          className="w-full px-3.5 py-2.5 rounded-2xl bg-white/90 border border-slate-200/80 text-xs font-medium text-slate-900 focus:border-indigo-400 outline-none"
                        />

                        {q.type === 'mcq' && (
                          <div className="space-y-2">
                            {q.options.map((opt, optIdx) => {
                              const letter = String.fromCharCode(65 + optIdx);
                              const isCorrect = q.correctOption === optIdx;
                              return (
                                <div key={optIdx} className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => updateQuestion(q.id, 'correctOption', optIdx)}
                                    className={`w-7 h-7 rounded-full text-[11px] font-extrabold flex items-center justify-center shrink-0 transition ${
                                      isCorrect
                                        ? 'bg-emerald-500 text-white shadow-xs'
                                        : 'bg-white text-slate-500 border border-slate-300'
                                    }`}
                                  >
                                    {letter}
                                  </button>
                                  <input
                                    type="text"
                                    value={opt}
                                    onChange={(e) => updateOption(q.id, optIdx, e.target.value)}
                                    placeholder={`Option ${letter}`}
                                    className={`flex-1 px-3 py-1.5 rounded-xl text-xs outline-none border ${
                                      isCorrect
                                        ? 'bg-emerald-50/70 border-emerald-300 font-semibold text-slate-900'
                                        : 'bg-white/85 border-slate-200/80 text-slate-800'
                                    }`}
                                  />
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Add Manual Question Pills */}
                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => addQuestion('mcq')}
                      className="ios-glass py-2.5 px-3 rounded-2xl text-indigo-700 font-bold text-xs flex items-center justify-center gap-1.5 active:scale-95 transition"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>ရွေးဖြေ ထပ်ထည့်</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => addQuestion('written')}
                      className="ios-glass py-2.5 px-3 rounded-2xl text-amber-800 font-bold text-xs flex items-center justify-center gap-1.5 active:scale-95 transition"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>ရေးဖြေ ထပ်ထည့်</span>
                    </button>
                  </div>

                  {/* Save & Generate Ultra-Short 6-Char Link Card */}
                  <div className="ios-glass-strong rounded-[28px] p-4 space-y-3">
                    <button
                      type="button"
                      onClick={handleSaveAndGenerateShortQuiz}
                      disabled={isSavingQuiz}
                      className="w-full py-3.5 px-4 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs shadow-lg flex items-center justify-center gap-2 transition active:scale-[0.98] disabled:opacity-60"
                    >
                      {isSavingQuiz ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin text-sky-400" />
                          <span>Short Link ဖန်တီးနေပါသည်...</span>
                        </>
                      ) : (
                        <>
                          <LinkIcon className="w-4 h-4 text-sky-400" />
                          <span>{editingQuizCode ? 'ပြင်ဆင်မှု သိမ်းမည်' : 'Save & Short Link တိုတိုလေး ထုတ်မည်'}</span>
                        </>
                      )}
                    </button>

                    {generatedQuizLink && (
                      <div className="p-3.5 rounded-2xl bg-emerald-50/95 border border-emerald-200 space-y-3">
                        <div className="flex items-center justify-between">
                          <p className="text-[11px] font-extrabold text-emerald-800 flex items-center gap-1.5">
                            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                            <span>မေးခွန်း Code ထွက်ရှိပါပြီ!</span>
                          </p>
                          <span className="px-2 py-0.5 rounded-full bg-emerald-600 text-white text-[10px] font-bold">
                            404-Free
                          </span>
                        </div>

                        <div className="bg-white p-3 rounded-2xl border border-emerald-200 flex items-center justify-between">
                          <div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase">
                              Student Quiz Code (၆ လုံး)
                            </p>
                            <p className="text-xl font-mono font-black tracking-widest text-indigo-700">
                              {generatedQuizCode}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              copyToClipboard(generatedQuizCode, 'quiz-short-code', 'Quiz Code')
                            }
                            className="px-3.5 py-2 rounded-xl bg-indigo-600 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs active:scale-95 transition"
                          >
                            {copiedId === 'quiz-short-code' ? (
                              <Check className="w-3.5 h-3.5" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                            <span>{copiedId === 'quiz-short-code' ? 'Copied!' : 'Copy Code'}</span>
                          </button>
                        </div>

                        <div className="bg-white/80 px-3 py-1.5 rounded-xl border border-emerald-200/80 text-[10px] font-mono text-slate-600 truncate">
                          Link: {generatedQuizLink}
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              copyToClipboard(generatedQuizLink, 'quiz-short-url', 'Quiz Link')
                            }
                            className="py-2.5 px-3 rounded-xl bg-emerald-600 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs"
                          >
                            {copiedId === 'quiz-short-url' ? (
                              <Check className="w-3.5 h-3.5" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                            <span>{copiedId === 'quiz-short-url' ? 'Copied!' : 'Copy Link'}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setStudentAnswers({});
                              setGeneratedResultLink('');
                              setGeneratedResultCode('');
                              setActiveTab('student');
                            }}
                            className="py-2.5 px-3 rounded-xl bg-white border border-emerald-300 text-emerald-800 font-bold text-xs flex items-center justify-center gap-1.5"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            <span>စမ်းဖြေကြည့်မည်</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Previously Created Short Quizzes by this Teacher */}
                  {teacherQuizzes.length > 0 && (
                    <div className="ios-glass rounded-[26px] p-4 space-y-2.5">
                      <p className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5">
                        <Hash className="w-3.5 h-3.5 text-indigo-600" />
                        <span>သင်ဖန်တီးထားသော မေးခွန်းလွှာများ ({teacherQuizzes.length})</span>
                      </p>
                      <div className="space-y-2">
                        {teacherQuizzes.slice(0, 5).map((qz) => (
                          <div
                            key={qz.code}
                            className="p-2.5 rounded-2xl bg-white/85 border border-slate-200/80 flex items-center justify-between gap-2"
                          >
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-slate-900 truncate">
                                {qz.title}
                              </p>
                              <p className="text-[10px] font-mono font-bold text-indigo-600">
                                Code: {qz.code} • {qz.questions?.length || 0} ပုဒ်
                              </p>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <button type="button" onClick={() => handleEditQuiz(qz)} className="px-2 py-1.5 rounded-xl bg-amber-50 text-amber-800 text-[10px] font-bold flex items-center gap-1">
                                <Pencil className="w-3 h-3" /><span>ပြင်</span>
                              </button>
                              <button type="button" onClick={() => handleDeleteQuiz(qz)} className="px-2 py-1.5 rounded-xl bg-rose-50 text-rose-700 text-[10px] font-bold flex items-center gap-1">
                                <Trash2 className="w-3 h-3" /><span>ဖျက်</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => copyToClipboard(buildCleanShortUrl('q', qz.code), `qz-${qz.code}`, `Quiz Link (${qz.code})`)}
                                className="px-2 py-1.5 rounded-xl bg-indigo-50 text-indigo-700 text-[10px] font-bold flex items-center gap-1"
                              >
                                <Share2 className="w-3 h-3" /><span>Link</span>
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* ================================================================
                  TAB 2: STUDENT EXAM PORTAL (ကျောင်းသား ဖြေဆိုရန်)
                 ================================================================ */}
              {activeTab === 'student' && (
                <>
                  {/* Enter Short Quiz Code Bar */}
                  <div className="ios-glass rounded-[22px] p-2.5 flex items-center gap-2">
                    <input
                      type="text"
                      value={pasteQuizInput}
                      onChange={(e) => setPasteQuizInput(e.target.value)}
                      placeholder="Quiz Code ၆ လုံး (ဥပမာ 85CEGF) သို့မဟုတ် #q=... ထည့်ပါ"
                      className="flex-1 bg-transparent px-2 text-[11px] font-semibold text-slate-800 placeholder:font-normal placeholder:text-slate-400 outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleLoadStudentQuizInput}
                      disabled={isLoadingQuizCode}
                      className="px-3 py-1.5 rounded-xl bg-indigo-600 text-white text-[11px] font-bold shrink-0"
                    >
                      {isLoadingQuizCode ? '...' : 'ဖွင့်မည်'}
                    </button>
                  </div>

                  {/* Exam Header Card */}
                  <div className="ios-glass-strong rounded-[28px] p-5 space-y-3.5">
                    <div className="flex items-center justify-between">
                      <span className="px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 text-[10px] font-extrabold">
                        Teacher: {activeQuiz.teacherName || "Tr.Kyain Lone"}
                      </span>
                      <span className="px-2.5 py-1 rounded-full bg-sky-50 text-sky-700 text-[10px] font-extrabold">
                        စုစုပေါင်း {activeQuizTotalMarks} မှတ်
                      </span>
                    </div>

                    {activeQuiz.timeLimitMinutes > 0 && (
                      <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-center text-sm font-extrabold text-amber-800">
                        ကျန်အချိန်: {Math.floor(remainingSeconds / 60).toString().padStart(2, '0')}:{(remainingSeconds % 60).toString().padStart(2, '0')}
                      </div>
                    )}
                    <div>
                      <h2 className="text-lg font-extrabold text-slate-900 leading-snug">
                        {activeQuiz.title}
                      </h2>
                      {activeQuiz.description && (
                        <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                          {activeQuiz.description}
                        </p>
                      )}
                    </div>

                    {/* Student Name & Roll Input */}
                    <div className="pt-2 border-t border-slate-200/70 space-y-2.5">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">
                          ကျောင်းသားအမည် (Student Name) <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={studentName}
                          onChange={(e) => {
                            setStudentName(e.target.value);
                            setStudentError('');
                          }}
                          placeholder="ဥပမာ - မောင်အောင်ကျော်"
                          className="w-full px-3.5 py-2.5 rounded-2xl bg-white/90 border border-slate-200 text-xs font-semibold text-slate-900 focus:border-indigo-500 outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">
                          ခုံနံပါတ် / အတန်း (Roll / Class - Optional)
                        </label>
                        <input
                          type="text"
                          value={studentRoll}
                          onChange={(e) => setStudentRoll(e.target.value)}
                          placeholder="ဥပမာ - Roll 15 / Grade 10 (A)"
                          className="w-full px-3.5 py-2 rounded-2xl bg-white/85 border border-slate-200 text-xs text-slate-800 focus:border-indigo-500 outline-none"
                        />
                      </div>

                      {studentError && (
                        <p className="text-[11px] font-bold text-rose-600">{studentError}</p>
                      )}
                    </div>
                  </div>

                  {/* Worksheet Image Viewer (Zoomable) */}
                  {displayWorksheetImg && (
                    <div className="ios-glass-strong rounded-[28px] p-3 space-y-2 border-2 border-indigo-200">
                      <div className="flex items-center justify-between px-1">
                        <span className="text-[11px] font-extrabold text-slate-800">
                          မေးခွန်းစာရွက် (ပုံကို နှိပ်၍ ချဲ့ကြည့်နိုင်သည်)
                        </span>
                        <button
                          type="button"
                          onClick={() => setWorksheetZoomed((z) => !z)}
                          className="px-3 py-1 rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-bold"
                        >
                          {worksheetZoomed ? 'ပုံသေးမည်' : 'Zoom ချဲ့မည်'}
                        </button>
                      </div>
                      <div
                        onClick={() => setWorksheetZoomed((z) => !z)}
                        className="cursor-zoom-in overflow-hidden rounded-2xl bg-white border border-slate-200 shadow-sm"
                      >
                        <img
                          src={displayWorksheetImg}
                          alt="Exam Worksheet"
                          className={`w-full transition-all duration-300 ${
                            worksheetZoomed ? 'max-h-[750px] object-contain' : 'max-h-64 object-contain'
                          }`}
                        />
                      </div>
                    </div>
                  )}

                  {/* Student Questions List */}
                  <div className="space-y-3.5">
                    {(activeQuiz.questions || []).map((q, idx) => (
                      <div key={q.id} className="ios-glass rounded-[26px] p-4 space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-xs font-bold text-slate-900 leading-relaxed">
                            <span className="text-indigo-600 mr-1.5">{idx + 1}.</span>
                            {q.text}
                          </p>
                          <span className="px-2 py-0.5 rounded-full bg-white/90 text-slate-600 text-[10px] font-bold shrink-0">
                            {q.marks} မှတ်
                          </span>
                        </div>

                        {q.type === 'mcq' && (
                          <div className="space-y-2">
                            {q.options.map((opt, optIdx) => {
                              const letter = String.fromCharCode(65 + optIdx);
                              const isSelected = studentAnswers[q.id] === optIdx;
                              return (
                                <button
                                  key={optIdx}
                                  type="button"
                                  onClick={() =>
                                    setStudentAnswers((prev) => ({ ...prev, [q.id]: optIdx }))
                                  }
                                  className={`w-full text-left p-3 rounded-2xl border flex items-center gap-2.5 transition active:scale-[0.99] ${
                                    isSelected
                                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                                      : 'bg-white/85 text-slate-800 border-slate-200/80 hover:bg-white'
                                  }`}
                                >
                                  <span
                                    className={`w-6 h-6 rounded-full text-[11px] font-extrabold flex items-center justify-center shrink-0 ${
                                      isSelected
                                        ? 'bg-white text-indigo-700'
                                        : 'bg-slate-100 text-slate-600'
                                    }`}
                                  >
                                    {letter}
                                  </span>
                                  <span className="text-xs font-semibold">{opt}</span>
                                </button>
                              );
                            })}
                          </div>
                        )}

                        {q.type === 'written' && (
                          <textarea
                            rows={3}
                            value={studentAnswers[q.id] || ''}
                            onChange={(e) =>
                              setStudentAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))
                            }
                            placeholder="အဖြေကို ဤနေရာတွင် ရေးဖြေပါ..."
                            className="w-full px-3.5 py-2.5 rounded-2xl bg-white/90 border border-slate-200 text-xs text-slate-900 focus:border-indigo-500 outline-none leading-relaxed"
                          />
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Submit & Generate Short Answer Link Card */}
                  <div className="ios-glass-strong rounded-[28px] p-4 space-y-3">
                    <button
                      type="button"
                      onClick={handleStudentSubmit}
                      disabled={isSubmittingStudent}
                      className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-bold text-xs shadow-lg shadow-indigo-300/40 flex items-center justify-center gap-2 transition active:scale-[0.98] disabled:opacity-60"
                    >
                      {isSubmittingStudent ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>အဖြေလွှာ ပေးပို့နေပါသည်...</span>
                        </>
                      ) : (
                        <>
                          <Send className="w-4 h-4" />
                          <span>Submit &amp; အဖြေလွှာ Short Link ထုတ်မည်</span>
                        </>
                      )}
                    </button>

                    {generatedResultLink && (
                      <div className="p-3.5 rounded-2xl bg-emerald-50/95 border border-emerald-200 space-y-2.5">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-extrabold text-emerald-900 flex items-center gap-1.5">
                            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                            <span>အဖြေလွှာ ပေးပို့ပြီးပါပြီ!</span>
                          </p>
                          <span className="px-2.5 py-0.5 rounded-full bg-emerald-600 text-white text-[11px] font-mono font-bold">
                            ID: {generatedResultCode}
                          </span>
                        </div>
                        <p className="text-[11px] text-emerald-800">
                          ဆရာ/ဆရာမ၏ Dashboard ထဲသို့ တိုက်ရိုက်ရောက်ရှိပြီး ဖြစ်ပါသည်။ အောက်ပါ Result ID ၆ လုံးကိုလည်း Copy ယူ၍ ပေးပို့နိုင်ပါသည်။
                        </p>
                        <div className="bg-white px-3 py-2 rounded-xl border border-emerald-200 flex items-center justify-between">
                          <span className="text-sm font-mono font-extrabold text-indigo-700 tracking-wider">
                            {generatedResultCode}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              copyToClipboard(
                                generatedResultCode,
                                'res-short-code',
                                'Result Code'
                              )
                            }
                            className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-bold text-[11px] flex items-center gap-1"
                          >
                            {copiedId === 'res-short-code' ? (
                              <Check className="w-3 h-3" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                            <span>
                              {copiedId === 'res-short-code' ? 'Copied!' : 'Copy Code'}
                            </span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* ================================================================
                  TAB 3: TEACHER GRADING & GRADEBOOK (အဖြေစစ် & အမှတ်စာရင်း)
                 ================================================================ */}
              {activeTab === 'dashboard' && (
                <>
                  {/* Lookup by Short Submission Code or Hash Link */}
                  <div className="ios-glass rounded-[24px] p-3.5 space-y-2">
                    <p className="text-[11px] font-extrabold text-slate-800 flex items-center gap-1.5">
                      <LinkIcon className="w-3.5 h-3.5 text-indigo-600" />
                      <span>ကျောင်းသား Result Code ၆ လုံး (သို့) #s=... ဖြင့် ရှာစစ်ရန်</span>
                    </p>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={pasteResultInput}
                        onChange={(e) => {
                          setPasteResultInput(e.target.value);
                          setPasteResultError('');
                        }}
                        placeholder="Result Code ၆ လုံး (ဥပမာ A9K2LM) ထည့်ပါ..."
                        className="flex-1 px-3 py-2 rounded-xl bg-white/90 border border-slate-200 text-xs outline-none focus:border-indigo-500"
                      />
                      <button
                        type="button"
                        onClick={handleImportStudentShortCode}
                        className="px-3.5 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold shrink-0"
                      >
                        ဖွင့်မည်
                      </button>
                    </div>
                    {pasteResultError && (
                      <p className="text-[11px] font-semibold text-rose-600">{pasteResultError}</p>
                    )}
                  </div>

                  {/* Active Student Answer Sheet Grading Card */}
                  {selectedSubmission ? (
                    <div className="ios-glass-strong rounded-[28px] overflow-hidden">
                      <div className="p-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-violet-950 text-white">
                        <div className="flex items-center justify-between text-[10px] text-indigo-200 mb-1">
                          <span className="truncate max-w-[200px]">
                            {selectedSubmission.quizTitle}
                          </span>
                          <span className="font-mono">
                            ID: {selectedSubmission.code} • {selectedSubmission.submittedAt}
                          </span>
                        </div>

                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <h3 className="text-base font-extrabold">
                              {selectedSubmission.studentName}
                            </h3>
                            {selectedSubmission.studentRoll && (
                              <p className="text-[11px] text-indigo-200">
                                {selectedSubmission.studentRoll}
                              </p>
                            )}
                          </div>

                          <div className="px-3 py-1.5 rounded-2xl bg-white/15 backdrop-blur-md border border-white/15 text-right">
                            <p className="text-[9px] uppercase tracking-wider text-indigo-200">
                              ရမှတ်
                            </p>
                            <p className="text-base font-extrabold">
                              {liveTotalScore}{' '}
                              <span className="text-xs font-normal text-indigo-200">
                                / {selectedSubmission.totalMarks}
                              </span>
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="p-4 space-y-3">
                        {(selectedSubmission.questions || []).map((q, idx) => {
                          const rawAns = selectedSubmission.answers?.[q.id];
                          const gState = gradingMarks[q.id] || { status: 'ungraded', marks: 0 };

                          let ansDisplay = '(မဖြေဆိုထားပါ)';
                          if (q.type === 'mcq' && rawAns !== undefined && rawAns !== null) {
                            const letter = String.fromCharCode(65 + Number(rawAns));
                            ansDisplay = `${letter}. ${q.options[Number(rawAns)] || ''}`;
                          } else if (q.type === 'written' && rawAns) {
                            ansDisplay = rawAns;
                          }

                          return (
                            <div
                              key={q.id}
                              className={`p-3.5 rounded-2xl border transition ${
                                gState.status === 'right'
                                  ? 'bg-emerald-50/60 border-emerald-200'
                                  : gState.status === 'wrong'
                                  ? 'bg-rose-50/60 border-rose-200'
                                  : 'bg-white/75 border-slate-200/80'
                              }`}
                            >
                              <div className="flex items-start justify-between gap-2 mb-2">
                                <p className="text-xs font-bold text-slate-900">
                                  <span className="text-indigo-600 mr-1">Q{idx + 1}.</span>
                                  {q.text}
                                </p>
                                <span className="text-[10px] font-bold text-slate-500 shrink-0">
                                  {q.marks} မှတ်
                                </span>
                              </div>

                              <div className="bg-white/90 p-2.5 rounded-xl border border-slate-200/70 mb-2.5">
                                <p className="text-[10px] text-slate-400 font-semibold mb-0.5">
                                  ကျောင်းသားအဖြေ:
                                </p>
                                <p className="text-xs font-semibold text-slate-800 whitespace-pre-wrap">
                                  {ansDisplay}
                                </p>
                                {q.type === 'mcq' && q.correctOption !== null && (
                                  <p className="text-[10px] font-bold text-emerald-700 mt-1.5 pt-1.5 border-t border-slate-100">
                                    အဖြေမှန်: {String.fromCharCode(65 + Number(q.correctOption))}.{' '}
                                    {q.options[Number(q.correctOption)]}
                                  </p>
                                )}
                              </div>

                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => setGradeChoice(q, 'right')}
                                    className={`px-3 py-1.5 rounded-xl text-[11px] font-bold flex items-center gap-1 transition ${
                                      gState.status === 'right'
                                        ? 'bg-emerald-600 text-white shadow-xs'
                                        : 'bg-white text-slate-700 border border-slate-200'
                                    }`}
                                  >
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    <span>Right ✓</span>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => setGradeChoice(q, 'wrong')}
                                    className={`px-3 py-1.5 rounded-xl text-[11px] font-bold flex items-center gap-1 transition ${
                                      gState.status === 'wrong'
                                        ? 'bg-rose-600 text-white shadow-xs'
                                        : 'bg-white text-slate-700 border border-slate-200'
                                    }`}
                                  >
                                    <XCircle className="w-3.5 h-3.5" />
                                    <span>Wrong ✗</span>
                                  </button>
                                </div>

                                <div className="flex items-center gap-1 bg-white px-2.5 py-1 rounded-xl border border-slate-200">
                                  <input
                                    type="number"
                                    min="0"
                                    max={q.marks}
                                    step="0.5"
                                    value={gState.marks}
                                    onChange={(e) => setCustomQuestionScore(q, e.target.value)}
                                    className="w-9 text-center text-xs font-extrabold text-indigo-700 outline-none"
                                  />
                                  <span className="text-[10px] text-slate-400">/{q.marks}</span>
                                </div>
                              </div>
                            </div>
                          );
                        })}

                        <button
                          type="button"
                          onClick={handleSaveGrade}
                          disabled={isSavingGrade}
                          className="w-full py-3 px-4 rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-bold text-xs shadow-md flex items-center justify-center gap-2 active:scale-[0.98] transition disabled:opacity-60"
                        >
                          <Award className="w-4 h-4" />
                          <span>
                            {isSavingGrade
                              ? 'သိမ်းဆည်းနေပါသည်...'
                              : `Save နှိပ်ပြီး အမှတ်စာရင်းသွင်းမည် (${liveTotalScore} မှတ်)`}
                          </span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="ios-glass rounded-[28px] p-6 text-center space-y-2">
                      <p className="text-xs font-extrabold text-slate-800">
                        ကျောင်းသား အဖြေလွှာများ မရှိသေးပါ
                      </p>
                      <p className="text-[11px] text-slate-500">
                        မေးခွန်းဖန်တီးပြီး ရရှိလာသော Short Link (?q=xxxxxx) ကို ကျောင်းသားများထံ ပေးပို့လိုက်ပါ။
                      </p>
                    </div>
                  )}

                  {/* Teacher Leaderboard */}
                  {leaderboard.length > 0 && (
                    <div className="ios-glass rounded-[28px] p-4 space-y-2">
                      <h3 className="text-xs font-extrabold text-slate-900 flex items-center gap-2">
                        <Award className="w-4 h-4 text-amber-500" /> အမှတ်အများဆုံး ကျောင်းသားများ
                      </h3>
                      {leaderboard.map((item, index) => (
                        <div key={item.code} className="flex items-center justify-between rounded-xl bg-white/80 px-3 py-2 text-xs">
                          <span className="font-bold text-slate-700">{index + 1}. {item.studentName}</span>
                          <span className="font-extrabold text-indigo-700">{item.earnedMarks}/{item.totalMarks}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Persistent Cloud Gradebook & Short Links Collection */}
                  <div className="ios-glass rounded-[28px] p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-extrabold text-slate-900 flex items-center gap-1.5">
                        <Users className="w-4 h-4 text-indigo-600" />
                        <span>
                          ကျောင်းသား အမှတ်စာရင်းနှင့် Short Link များ ({teacherSubmissions.length})
                        </span>
                      </h3>
                    </div>

                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="ကျောင်းသားအမည် သို့မဟုတ် Code ရှာရန်..."
                        className="w-full pl-8 pr-3 py-2 rounded-xl bg-white/85 border border-slate-200 text-xs outline-none focus:border-indigo-400"
                      />
                    </div>

                    <div className="space-y-2.5">
                      {filteredSubmissions.map((sub) => {
                        const active = sub.code === selectedSubmission?.code;
                        return (
                          <div
                            key={sub.code}
                            onClick={() => setSelectedSubCode(sub.code)}
                            className={`p-3 rounded-2xl border transition cursor-pointer ${
                              active
                                ? 'bg-indigo-50/90 border-indigo-400 shadow-xs'
                                : 'bg-white/80 border-slate-200/80 hover:bg-white'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="min-w-0">
                                <p className="text-xs font-extrabold text-slate-900 truncate">
                                  {sub.studentName}
                                </p>
                                <p className="text-[10px] text-slate-500 truncate">
                                  <span className="font-mono font-bold text-indigo-600">
                                    ID: {sub.code}
                                  </span>{' '}
                                  • {sub.studentRoll ? `${sub.studentRoll} • ` : ''}
                                  {sub.submittedAt}
                                </p>
                              </div>

                              {sub.status === 'Graded' ? (
                                <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-extrabold shrink-0">
                                  {sub.earnedMarks}/{sub.totalMarks} မှတ်
                                </span>
                              ) : (
                                <span className="px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold shrink-0">
                                  စစ်ရန်ကျန်
                                </span>
                              )}
                            </div>

                            <div className="flex items-center justify-end gap-2 mt-2 pt-2 border-t border-slate-200/60">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  copyToClipboard(
                                    sub.code,
                                    sub.code,
                                    `Result Code (${sub.code})`
                                  );
                                }}
                                className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 text-[10px] font-bold flex items-center gap-1"
                              >
                                <Copy className="w-3 h-3" />
                                <span>Copy ID</span>
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  copyToClipboard(buildCleanShortUrl('s', sub.code), `sub-link-${sub.code}`, 'Result Link');
                                }}
                                className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 text-[10px] font-bold flex items-center gap-1"
                              >
                                <LinkIcon className="w-3 h-3" /><span>Copy Link</span>
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedSubCode(sub.code);
                                }}
                                className="px-2.5 py-1 rounded-lg bg-indigo-600 text-white text-[10px] font-bold flex items-center gap-1"
                              >
                                <Eye className="w-3 h-3" />
                                <span>စစ်မည်</span>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </main>

        {/* ==================================================================
            BOTTOM FLOATING GLASS TAB BAR (Mobile Navigation)
           ================================================================== */}
        <nav className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 w-[92%] max-w-[396px]">
          <div className="ios-glass-strong rounded-[28px] p-1.5 grid grid-cols-5 gap-1 shadow-[0_12px_35px_rgba(79,70,229,0.2)]">
            <button
              type="button"
              onClick={() => setActiveTab('creator')}
              className={`py-2 px-2 rounded-[22px] flex flex-col items-center justify-center gap-0.5 transition-all ${
                activeTab === 'creator'
                  ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Sparkles className="w-4 h-4" />
              <span className="text-[10px] font-bold">မေးခွန်းထုတ်</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('student')}
              className={`py-2 px-2 rounded-[22px] flex flex-col items-center justify-center gap-0.5 transition-all ${
                activeTab === 'student'
                  ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileText className="w-4 h-4" />
              <span className="text-[10px] font-bold">ကျောင်းသားဖြေ</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('teaching')}
              className={`py-2 px-1 rounded-[22px] flex flex-col items-center justify-center gap-0.5 transition-all ${
                activeTab === 'teaching'
                  ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span className="text-sm">📚</span>
              <span className="text-[10px] font-bold">Teaching</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('subscription')}
              className={`py-2 px-1 rounded-[22px] flex flex-col items-center justify-center gap-0.5 transition-all ${
                activeTab === 'subscription'
                  ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span className="text-sm">💳</span>
              <span className="text-[10px] font-bold">Plan</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('dashboard')}
              className={`relative py-2 px-2 rounded-[22px] flex flex-col items-center justify-center gap-0.5 transition-all ${
                activeTab === 'dashboard'
                  ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ClipboardCheck className="w-4 h-4" />
              <span className="text-[10px] font-bold">
                အမှတ်စစ် ({teacherAccount ? teacherSubmissions.length : 0})
              </span>
            </button>
          </div>
        </nav>
      </div>
    </div>
  );
}
