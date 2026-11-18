import React, { useState, useEffect, useMemo, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  onAuthStateChanged
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  collection,
  query,
  where
} from 'firebase/firestore';
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
  Ruler,
  Paperclip,
  Star,
  BookOpen,
  Eraser,
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
  Hash,
  Zap
} from 'lucide-react';

// ============================================================================
// Firebase setup via Vite environment variables + local demo cache
// ============================================================================
let app = null;
let auth = null;
let db = null;
const appId = 'tr-kyain-lone-app';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

const hasFirebaseConfig = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId);
if (hasFirebaseConfig) {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
}

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
// GEMINI AI MULTIMODAL PHOTO-TO-QUIZ EXTRACTOR (gemini-2.5-flash)
// ============================================================================
const generateQuizFromImageWithGemini = async (base64Data, mimeType, customInstruction) => {
  const response = await fetch('/api/generate-quiz', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ base64Data, mimeType: mimeType || 'image/jpeg', customInstruction })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || `AI service error (${response.status})`);
  if (!Array.isArray(result.questions) || result.questions.length === 0) {
    throw new Error('AI က မေးခွန်းမထုတ်ပေးနိုင်ပါ။ ဓာတ်ပုံကို ပိုရှင်းလင်းစွာ ပြန်တင်ပါ။');
  }
  return {
    title: result.title || 'AI Generated Quiz',
    description: result.description || 'မေးခွန်းအားလုံးကို သေချာစွာ ဖြေဆိုပါ။',
    questions: result.questions.map((q, idx) => ({
      id: `ai-q-${Date.now()}-${idx}`,
      type: q.type === 'written' ? 'written' : 'mcq',
      text: String(q.text || ''),
      marks: Math.max(1, Number(q.marks) || (q.type === 'mcq' ? 2 : 5)),
      options: q.type === 'written' ? [] : (Array.isArray(q.options) && q.options.length === 4 ? q.options : []),
      correctOption: q.type === 'written' ? null : Number(q.correctOption)
    }))
  };
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
  // Firebase Auth User
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
  const [activeTab, setActiveTab] = useState('creator'); // 'creator' | 'student' | 'dashboard'
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

  // AI Photo Upload States
  const fileInputRef = useRef(null);
  const [uploadedPreview, setUploadedPreview] = useState('');
  const [uploadedBase64, setUploadedBase64] = useState('');
  const [uploadedMime, setUploadedMime] = useState('image/jpeg');
  const [aiPromptNote, setAiPromptNote] = useState('');
  const [isAiGenerating, setIsAiGenerating] = useState(false);
  const [aiError, setAiError] = useState('');

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
  // 1. INITIALIZE FIREBASE AUTH (Rule 3: Auth First + Safe Fallback)
  // ==========================================================================
  useEffect(() => {
    // Remove legacy plaintext teacher-password stores from earlier builds.
    try { window.localStorage.removeItem(LOCAL_KEYS.TEACHERS); window.localStorage.removeItem(LOCAL_KEYS.SESSION); } catch {}
    const localQuizzes = readLocalMap(LOCAL_KEYS.QUIZZES);
    if (!localQuizzes['DEMO26']) {
      localQuizzes['DEMO26'] = { ...DEFAULT_SAMPLE_QUIZ, createdAtMs: Date.now() };
      writeLocalMap(LOCAL_KEYS.QUIZZES, localQuizzes);
    }
    setMyQuizzes(Object.values(localQuizzes));
    setAllSubmissions(Object.values(readLocalMap(LOCAL_KEYS.SUBMISSIONS)));

    if (!auth) {
      setAuthReady(true);
      return;
    }
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setFbUser(user);
      setTeacherAccount(user ? { email: user.email, displayName: user.displayName || user.email?.split('@')[0] || 'Teacher', uid: user.uid } : null);
      setAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  // ==========================================================================
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
  // 3. SUBSCRIBE TO CLOUD QUIZZES & SUBMISSIONS (Merged with Local Storage)
  // ==========================================================================
  useEffect(() => {
    const syncFromLocal = () => {
      const localQ = Object.values(readLocalMap(LOCAL_KEYS.QUIZZES));
      localQ.sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
      setMyQuizzes(localQ);

      const localS = Object.values(readLocalMap(LOCAL_KEYS.SUBMISSIONS));
      localS.sort((a, b) => (b.submittedAtMs || 0) - (a.submittedAtMs || 0));
      setAllSubmissions(localS);
    };

    syncFromLocal();

    if (!fbUser || !db) return;

    const quizzesCol = query(collection(db, 'artifacts', appId, 'public', 'data', 'quizzes'), where('teacherEmail', '==', fbUser.email));
    const unsubQuizzes = onSnapshot(
      quizzesCol,
      (snapshot) => {
        const merged = { ...readLocalMap(LOCAL_KEYS.QUIZZES) };
        snapshot.docs.forEach((d) => {
          merged[d.id] = { id: d.id, ...d.data() };
        });
        writeLocalMap(LOCAL_KEYS.QUIZZES, merged);
        const list = Object.values(merged);
        list.sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
        setMyQuizzes(list);
      },
      (err) => console.warn('Quizzes listener fallback:', err)
    );

    const subsCol = query(collection(db, 'artifacts', appId, 'public', 'data', 'submissions'), where('teacherEmail', '==', fbUser.email));
    const unsubSubs = onSnapshot(
      subsCol,
      (snapshot) => {
        const merged = { ...readLocalMap(LOCAL_KEYS.SUBMISSIONS) };
        snapshot.docs.forEach((d) => {
          merged[d.id] = { id: d.id, ...d.data() };
        });
        writeLocalMap(LOCAL_KEYS.SUBMISSIONS, merged);
        const list = Object.values(merged);
        list.sort((a, b) => (b.submittedAtMs || 0) - (a.submittedAtMs || 0));
        setAllSubmissions(list);
      },
      (err) => console.warn('Submissions listener fallback:', err)
    );

    return () => {
      unsubQuizzes();
      unsubSubs();
    };
  }, [fbUser]);

  // Filter quizzes and submissions belonging to the logged-in teacher
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

  // Auto-select latest submission for grading if none selected
  useEffect(() => {
    if (!selectedSubCode && teacherSubmissions.length > 0) {
      setSelectedSubCode(teacherSubmissions[0].code);
    }
  }, [teacherSubmissions, selectedSubCode]);

  // ==========================================================================
  // 4. TEACHER GMAIL + PASSWORD LOGIN / REGISTRATION HANDLERS (Dual-Persistence)
  // ==========================================================================
  const completeTeacherLogin = (accountObj, welcomeText) => {
    setTeacherAccount(accountObj);
    notify(welcomeText);
  };

  const handleTeacherAuthSubmit = async (e) => {
    e.preventDefault();
    setAuthError('');
    const email = loginEmail.trim().toLowerCase();
    const password = loginPassword;
    if (!auth) {
      setAuthError('Firebase မချိတ်ဆက်ရသေးပါ။ .env ဖိုင်တွင် Firebase Project အချက်အလက် ဖြည့်ပြီးမှ Teacher account ဖွင့်/ဝင်နိုင်ပါမည်။');
      return;
    }
    if (!email || !email.includes('@')) { setAuthError('Gmail လိပ်စာ မှန်ကန်စွာ ထည့်ပါ။'); return; }
    if (password.length < 6) { setAuthError('Password အနည်းဆုံး ၆ လုံး ထည့်ပါ။'); return; }
    setIsAuthLoading(true);
    try {
      if (authMode === 'register') {
        const credential = await createUserWithEmailAndPassword(auth, email, password);
        const displayName = registerName.trim() || email.split('@')[0];
        await updateProfile(credential.user, { displayName });
        completeTeacherLogin({ email, displayName, uid: credential.user.uid }, `အကောင့်အသစ် ဖွင့်ပြီးပါပြီ။ ကြိုဆိုပါတယ် ${displayName}`);
      } else {
        const credential = await signInWithEmailAndPassword(auth, email, password);
        const displayName = credential.user.displayName || email.split('@')[0];
        completeTeacherLogin({ email, displayName, uid: credential.user.uid }, `ပြန်လည်ကြိုဆိုပါတယ် ${displayName}`);
      }
    } catch (err) {
      const messages = {
        'auth/email-already-in-use': 'ဤ Gmail ဖြင့် အကောင့်ဖွင့်ပြီးသားပါ။ Login ဝင်ပါ။',
        'auth/invalid-credential': 'Gmail သို့မဟုတ် Password မှားနေပါသည်။',
        'auth/user-not-found': 'အကောင့်မတွေ့ပါ။ Register လုပ်ပါ။',
        'auth/weak-password': 'Password အနည်းဆုံး ၆ လုံး လိုအပ်ပါသည်။',
        'auth/invalid-email': 'Gmail လိပ်စာ မမှန်ပါ။',
        'auth/network-request-failed': 'Internet ချိတ်ဆက်မှုကို စစ်ဆေးပါ။'
      };
      setAuthError(messages[err.code] || err.message || 'အကောင့်ဝင်ရာတွင် အခက်အခဲရှိပါသည်။');
    } finally { setIsAuthLoading(false); }
  };

  const handleTeacherLogout = async () => {
    try { if (auth) await signOut(auth); } catch (err) { console.warn('Sign out:', err); }
    setTeacherAccount(null);
    try {
      window.localStorage.removeItem(LOCAL_KEYS.SESSION);
    } catch {
      // Ignore storage error
    }
    setLoginPassword('');
    setGeneratedQuizLink('');
    setGeneratedQuizCode('');
    notify('အကောင့်မှ ထွက်လိုက်ပါပြီ');
  };

  // ==========================================================================
  // 5. AI PHOTO-TO-QUIZ HANDLERS
  // ==========================================================================
  const handleImageSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAiError('');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { setAiError('JPEG, PNG သို့မဟုတ် WebP ဓာတ်ပုံကိုသာ တင်နိုင်ပါသည်။'); return; }
    if (file.size > 3 * 1024 * 1024) { setAiError('ဓာတ်ပုံအရွယ်အစား 3MB အောက်ဖြစ်အောင် လျှော့ပြီး ပြန်တင်ပါ။'); return; }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      setUploadedPreview(dataUrl);
      const [meta, base64] = dataUrl.split(',');
      const mimeMatch = meta.match(/data:(.*);base64/);
      setUploadedMime(mimeMatch ? mimeMatch[1] : file.type || 'image/jpeg');
      setUploadedBase64(base64);
    };
    reader.readAsDataURL(file);
  };

  const handleRunGeminiPhotoToQuiz = async () => {
    if (!uploadedBase64) {
      setAiError('မေးခွန်းဓာတ်ပုံ အရင်ရွေးချယ်ပေးပါ ဆရာ/ဆရာမ။');
      return;
    }

    setIsAiGenerating(true);
    setAiError('');
    try {
      const aiResult = await generateQuizFromImageWithGemini(
        uploadedBase64,
        uploadedMime,
        aiPromptNote
      );

      setQuizTitle(aiResult.title);
      setQuizDesc(aiResult.description);
      setQuestions(aiResult.questions);
      setGeneratedQuizLink('');
      setGeneratedQuizCode('');
      notify(`Gemini AI မှ မေးခွန်း ${aiResult.questions.length} ပုဒ် ထုတ်ပေးပြီးပါပြီ ✨`);
    } catch (err) {
      console.error(err);
      setAiError(err.message || 'AI မေးခွန်းထုတ်ရာတွင် အခက်အခဲရှိပါသည်။ API Key နှင့် Internet ကို စစ်ဆေးပါ။');
        } finally {
      setIsAiGenerating(false);
    }
  };

  // ==========================================================================
  // 6. QUIZ EDITING & SHORT 6-CHAR LINK GENERATION (Dual Cloud + Local)
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
      if (fbUser && db) {
        await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'quizzes', quiz.code));
      }
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
    if (!quizTitle.trim() || questions.length === 0 || questions.some(q => !q.text.trim() || (q.type === 'mcq' && (q.options.length !== 4 || q.options.some(o => !String(o).trim()) || !Number.isInteger(Number(q.correctOption)) || Number(q.correctOption) < 0 || Number(q.correctOption) > 3)))) {
      notify('ခေါင်းစဉ်၊ မေးခွန်းစာသား၊ MCQ ရွေးချယ်စရာ ၄ ခုနှင့် အဖြေမှန်ကို စစ်ဆေးပါ။');
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
        timeLimitMinutes: Number(timeLimitMinutes) || 0,
        teacherUid: teacherAccount.uid || fbUser?.uid || null,
        questions,
        totalMarks: totalBuilderMarks,
        createdAt: new Date().toLocaleDateString(),
        createdAtMs: Date.now()
      };

      // Save locally first so Quiz Code ALWAYS works immediately
      const localQuizzes = readLocalMap(LOCAL_KEYS.QUIZZES);
      localQuizzes[code] = quizDoc;
      writeLocalMap(LOCAL_KEYS.QUIZZES, localQuizzes);
      setMyQuizzes(
        Object.values(localQuizzes).sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0))
      );

      // Best-effort sync to Firestore
      if (fbUser && db) {
        try {
          await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'quizzes', code), quizDoc);
        } catch (cloudErr) {
          console.warn('Cloud quiz save fallback to local:', cloudErr);
        }
      }

      if (!db) notify('Quiz ကို ဒီ Browser ထဲမှာသာ သိမ်းထားပါတယ်။ အခြားစက်များသို့ မျှဝေရန် Firebase Setup လိုအပ်ပါသည်။');
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
  // 7. STUDENT SHORT CODE / HASH LOADER & DIRECT SUBMISSION (Dual Cloud + Local)
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
      const localQuizzes = readLocalMap(LOCAL_KEYS.QUIZZES);
      let foundQuiz = localQuizzes[code] || null;

      if (!foundQuiz && db) {
        try {
          const snap = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', 'quizzes', code));
          if (snap.exists()) {
            foundQuiz = snap.data();
            localQuizzes[code] = foundQuiz;
            writeLocalMap(LOCAL_KEYS.QUIZZES, localQuizzes);
          }
        } catch (cloudErr) {
          console.warn('Cloud quiz fetch fallback:', cloudErr);
        }
      }

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

      // Save locally first so submission NEVER fails
      const localSubs = readLocalMap(LOCAL_KEYS.SUBMISSIONS);
      localSubs[subCode] = subDoc;
      writeLocalMap(LOCAL_KEYS.SUBMISSIONS, localSubs);
      setAllSubmissions(
        Object.values(localSubs).sort((a, b) => (b.submittedAtMs || 0) - (a.submittedAtMs || 0))
      );

      // Best-effort sync to Firestore
      if (db) {
        try {
          await setDoc(
            doc(db, 'artifacts', appId, 'public', 'data', 'submissions', subCode),
            subDoc
          );
        } catch (cloudErr) {
          console.warn('Cloud submission save fallback:', cloudErr);
        }
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
  }, [teacherSubmissions, allSubmissions, selectedSubCode]);

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
      // Update locally immediately
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

      if (fbUser && db) {
        try {
          const subRef = doc(
            db,
            'artifacts',
            appId,
            'public',
            'data',
            'submissions',
            selectedSubmission.code
          );
          await updateDoc(subRef, {
            status: 'Graded',
            earnedMarks: liveTotalScore,
            grades: gradingMarks
          });
        } catch (cloudErr) {
          console.warn('Cloud grade update fallback:', cloudErr);
        }
      }

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
      const localSubs = readLocalMap(LOCAL_KEYS.SUBMISSIONS);
      let foundSub = localSubs[code] || null;

      if (!foundSub && fbUser && db) {
        try {
          const snap = await getDoc(
            doc(db, 'artifacts', appId, 'public', 'data', 'submissions', code)
          );
          if (snap.exists()) {
            foundSub = snap.data();
            localSubs[code] = foundSub;
            writeLocalMap(LOCAL_KEYS.SUBMISSIONS, localSubs);
          }
        } catch (cloudErr) {
          console.warn('Cloud submission lookup fallback:', cloudErr);
        }
      }

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

  // Determine whether Teacher Gate should be displayed
  const showTeacherAuthGate = (activeTab === 'creator' || activeTab === 'dashboard') && !teacherAccount;

  // ==========================================================================
  // RENDER MOBILE-FIRST iOS 26 VIEWPORT
  // ==========================================================================
  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-[#eef4ff] via-[#f7f5ff] to-[#ebf8ff] text-slate-800 flex justify-center selection:bg-indigo-200">
      {/* Custom Keyframes for Stationery Drift & iOS 26 Glassmorphism */}
      <style>{`
        @keyframes driftA {
          0%, 100% { transform: translate(0px, 0px) rotate(-6deg); }
          33% { transform: translate(16px, -22px) rotate(8deg); }
          66% { transform: translate(-12px, 14px) rotate(-3deg); }
        }
        @keyframes driftB {
          0%, 100% { transform: translate(0px, 0px) rotate(10deg); }
          40% { transform: translate(-18px, -16px) rotate(-8deg); }
          75% { transform: translate(14px, 18px) rotate(5deg); }
        }
        @keyframes driftC {
          0%, 100% { transform: translate(0px, 0px) rotate(0deg); }
          50% { transform: translate(15px, 20px) rotate(14deg); }
        }
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


      {/* Responsive app container (mobile and desktop) */}
      <div className="relative z-10 w-full max-w-[1100px] min-h-screen flex flex-col sm:my-4 sm:min-h-[calc(100vh-2rem)] sm:rounded-[42px] sm:border-[6px] sm:border-white/80 sm:shadow-[0_25px_70px_-15px_rgba(79,70,229,0.22)] overflow-x-clip">
        {/* iOS 26 Dynamic Island / Top Floating Glass Header */}
        <header className="sticky top-0 z-30 px-4 pt-3 pb-2">
          <div className="ios-glass-strong rounded-[26px] px-4 py-2.5 flex items-center justify-between">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-indigo-600 via-violet-500 to-sky-400 flex items-center justify-center text-white shadow-md shadow-indigo-300/50 shrink-0">
                <GraduationCap className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[16px] font-extrabold tracking-tight bg-gradient-to-r from-indigo-700 to-violet-600 bg-clip-text text-transparent truncate">
                    Tr&apos;s Kyain lone
                  </span>
                  <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-indigo-500/10 text-indigo-700 border border-indigo-200/60 shrink-0">
                    AI
                  </span>
                </div>
                <p className="text-[10px] font-medium text-slate-500 leading-none mt-0.5 truncate">
                  {teacherAccount
                    ? `Teacher: ${teacherAccount.displayName}`
                    : 'Smart Mobile Quiz Platform'}
                </p>
              </div>
            </div>

            {/* Right Header Action: Logout if logged in, or Student Switch */}
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

        {/* iOS Floating Notification Pill (Toast) */}
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
          {/* ================================================================
              TEACHER GMAIL & PASSWORD AUTHENTICATION + STUDENT QUICK CODE SCREEN
             ================================================================ */}
          {showTeacherAuthGate ? (
            <div className="pt-1 space-y-4">
              {/* Prominent Student Quick Access Card (No Login Required!) */}
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

              {!hasFirebaseConfig && (
                <div className="rounded-2xl border border-amber-300 bg-amber-50 p-3 text-[11px] text-amber-900">Firebase Project မချိတ်ရသေးပါ။ Student demo ကိုသာ စမ်းနိုင်ပြီး Teacher account / Cloud sync အတွက် Setup လိုအပ်ပါသည်။</div>
              )}
              {/* Teacher Gmail & Password Login / Register Card */}
              <div className="ios-glass-strong rounded-[32px] p-5 space-y-4">
                <div className="text-center space-y-1.5">
                  <div className="w-12 h-12 mx-auto rounded-[20px] bg-gradient-to-tr from-indigo-600 via-violet-500 to-sky-400 text-white flex items-center justify-center shadow-lg shadow-indigo-300/50">
                    <GraduationCap className="w-6 h-6" />
                  </div>
                  <h1 className="text-base font-extrabold text-slate-900">
                    Tr&apos;s Kyain lone (Teacher Portal)
                  </h1>
                  <p className="text-[11px] text-slate-500">
                    ဆရာ/ဆရာမများ Gmail နှင့် ကိုယ်ပိုင် Password ဖြင့် ဝင်ရောက်ပြီး မေးခွန်းထုတ်ခြင်းနှင့် အမှတ်စစ်ခြင်းများ ပြုလုပ်နိုင်ပါသည်
                  </p>
                </div>

                {/* Login / Register Segmented Pill */}
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

                <p className="text-center text-[10px] text-slate-500">Demo အကောင့်မပါဝင်တော့ပါ။ ကိုယ်ပိုင် Teacher account ဖွင့်ပါ။</p>
              </div>

              {/* Seamless Student Bypass Card */}
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
                  TAB 1: AI PHOTO-TO-QUIZ CREATOR (ဆရာ/ဆရာမ မေးခွန်းထုတ်ရန်)
                 ================================================================ */}
              {activeTab === 'creator' && (
                <>
                  {/* Hero AI Photo Scanner Card */}
                  <div className="ios-glass-strong rounded-[28px] p-4 space-y-3.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-sky-400 to-indigo-600 text-white flex items-center justify-center shadow-xs">
                          <Wand2 className="w-4 h-4" />
                        </div>
                        <div>
                          <h1 className="text-sm font-extrabold text-slate-900">
                            ဓာတ်ပုံမှ AI မေးခွန်းထုတ်မည်
                          </h1>
                          <p className="text-[11px] text-slate-500">
                            စာအုပ် / မေးခွန်းရွက် ဓာတ်ပုံထည့်ရုံဖြင့် Gemini AI မှ ထုတ်ပေးပါမည်
                          </p>
                        </div>
                      </div>
                    </div>

                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleImageSelect}
                      className="hidden"
                    />

                    {!uploadedPreview ? (
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full py-6 px-4 rounded-2xl border-2 border-dashed border-indigo-300/80 bg-gradient-to-b from-indigo-50/60 to-sky-50/60 hover:from-indigo-50 hover:to-sky-50 flex flex-col items-center justify-center gap-2 transition active:scale-[0.98]"
                      >
                        <div className="w-12 h-12 rounded-2xl bg-white shadow-sm flex items-center justify-center text-indigo-600">
                          <Camera className="w-6 h-6" />
                        </div>
                        <span className="text-xs font-bold text-indigo-950">
                          မေးခွန်းဓာတ်ပုံ ရွေးမည် / ဓာတ်ပုံရိုက်မည်
                        </span>
                        <span className="text-[11px] text-slate-500">
                          Tap to upload textbook, worksheet, or handwritten photo
                        </span>
                      </button>
                    ) : (
                      <div className="relative rounded-2xl overflow-hidden border border-white shadow-sm bg-slate-900/5">
                        <img
                          src={uploadedPreview}
                          alt="Uploaded Question Sheet"
                          className="w-full max-h-48 object-cover"
                        />
                        <div className="absolute top-2 right-2 flex gap-1.5">
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="px-2.5 py-1.5 rounded-full bg-white/90 backdrop-blur-md text-slate-800 text-[11px] font-bold shadow-sm flex items-center gap-1"
                          >
                            <ImageIcon className="w-3 h-3 text-indigo-600" />
                            <span>ပုံပြောင်းမည်</span>
                          </button>
                        </div>
                      </div>
                    )}

                    <input
                      type="text"
                      value={aiPromptNote}
                      onChange={(e) => setAiPromptNote(e.target.value)}
                      placeholder="AI မှာကြားချက် (ဥပမာ - ရွေးဖြေ ၅ ပုဒ်၊ ရေးဖြေ ၂ ပုဒ် ထုတ်ပေးပါ)"
                      className="w-full px-3.5 py-2.5 rounded-2xl bg-white/85 border border-slate-200/90 text-xs text-slate-800 placeholder:text-slate-400 focus:border-indigo-400 outline-none"
                    />

                    {aiError && (
                      <p className="text-[11px] font-semibold text-rose-600 bg-rose-50/90 px-3 py-2 rounded-xl">
                        {aiError}
                      </p>
                    )}

                    <button
                      type="button"
                      onClick={handleRunGeminiPhotoToQuiz}
                      disabled={isAiGenerating}
                      className="w-full py-3 px-4 rounded-2xl bg-gradient-to-r from-indigo-600 via-violet-600 to-sky-500 text-white font-bold text-xs shadow-lg shadow-indigo-300/40 flex items-center justify-center gap-2 transition active:scale-[0.98] disabled:opacity-60"
                    >
                      {isAiGenerating ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Gemini AI မှ မေးခွန်းများ ဖန်တီးနေပါသည်...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4" />
                          <span>Gemini AI ဖြင့် မေးခွန်းထုတ်မည်</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Quiz Title & Quick Summary Card */}
                  <div className="ios-glass rounded-[26px] p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-extrabold text-slate-800">
                        မေးခွန်းလွှာ အချက်အလက်
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 text-[11px] font-bold">
                          {questions.length} ပုဒ် • {totalBuilderMarks} မှတ်
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setQuizTitle('');
                            setQuizDesc('');
                            setQuestions([]);
                            setGeneratedQuizLink('');
                            setGeneratedQuizCode('');
                            setUploadedPreview('');
                            setUploadedBase64('');
                          }}
                          className="p-1.5 rounded-full bg-white/80 text-slate-500 hover:text-rose-600"
                          title="Clear All"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <input
                      type="text"
                      value={quizTitle}
                      onChange={(e) => {
                        setQuizTitle(e.target.value);
                        setGeneratedQuizLink('');
                      }}
                      placeholder="မေးခွန်းခေါင်းစဉ် (Quiz Title)"
                      className="w-full px-3.5 py-2.5 rounded-2xl bg-white/90 border border-slate-200/80 text-sm font-bold text-slate-900 focus:border-indigo-400 outline-none"
                    />

                    <input
                      type="text"
                      value={quizDesc}
                      onChange={(e) => setQuizDesc(e.target.value)}
                      placeholder="ညွှန်ကြားချက် (Optional description)"
                      className="w-full px-3.5 py-2 rounded-2xl bg-white/80 border border-slate-200/80 text-xs text-slate-700 focus:border-indigo-400 outline-none"
                    />
                    <label className="block text-xs font-bold text-slate-700">စာမေးပွဲအချိန် (မိနစ်) — 0 = အချိန်မကန့်သတ်</label>
                    <input type="number" min="0" max="300" value={timeLimitMinutes} onChange={(e) => setTimeLimitMinutes(Math.max(0, Math.min(300, Number(e.target.value) || 0)))} className="w-full px-3.5 py-2 rounded-2xl bg-white/80 border border-slate-200/80 text-xs text-slate-700 focus:border-indigo-400 outline-none" />
                  </div>

                  {/* Editable Questions List */}
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
                              {q.type === 'mcq' ? 'ရွေးဖြေ (MCQ)' : 'ရေးဖြေ (Written)'}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <div className="flex items-center bg-white/90 px-2 py-1 rounded-full border border-slate-200/80">
                              <input
                                type="number"
                                min="1"
                                value={q.marks}
                                onChange={(e) =>
                                  updateQuestion(q.id, 'marks', Math.max(1, Number(e.target.value)))
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
                                    className={`w-6 h-6 rounded-full text-[11px] font-extrabold flex items-center justify-center shrink-0 transition ${
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
                          <span>{editingQuizCode ? 'ပြင်ဆင်မှု သိမ်းမည်' : 'Save &amp; Short Link တိုတိုလေး ထုတ်မည်'}</span>
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

                        {/* Big Prominent 6-Digit Quiz Code Box */}
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
                          Hash Link: {generatedQuizLink}
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              copyToClipboard(generatedQuizLink, 'quiz-short-url', 'Hash Link')
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
                        {teacherQuizzes.slice(0, 5).map((qz) => {
                          return (
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
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* ================================================================
                  TAB 2: STUDENT EXAM PORTAL (ကျောင်းသား ဖြေဆိုရန် - Login မလိုပါ)
                 ================================================================ */}
              {activeTab === 'student' && (
                <>
                  {/* Enter Short Quiz Code or Hash Link Bar */}
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
                        Teacher: {activeQuiz.teacherName || "Tr's Kyain lone"}
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
                      <h3 className="text-xs font-extrabold text-slate-900 flex items-center gap-2"><Award className="w-4 h-4 text-amber-500" /> အမှတ်အများဆုံး ကျောင်းသားများ</h3>
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
                        const shortSubUrl = buildCleanShortUrl('s', sub.code);
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
                              <button type="button" onClick={(e) => { e.stopPropagation(); copyToClipboard(buildCleanShortUrl('s', sub.code), `sub-link-${sub.code}`, 'Result Link'); }} className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 text-[10px] font-bold flex items-center gap-1">
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
            iOS 26 BOTTOM FLOATING GLASS TAB BAR (Mobile Navigation)
           ================================================================== */}
        <nav className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 w-[92%] max-w-[396px]">
          <div className="ios-glass-strong rounded-[28px] p-1.5 grid grid-cols-3 gap-1 shadow-[0_12px_35px_rgba(79,70,229,0.2)]">
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
              <span className="text-[10px] font-bold">AI မေးခွန်းထုတ်</span>
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
