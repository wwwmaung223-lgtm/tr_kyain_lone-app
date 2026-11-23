import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ShieldCheck, LayoutDashboard, CreditCard, Users, Settings2, CheckCircle2, XCircle, Search, Crown, Clock3, Save, LogOut, ExternalLink, Smartphone, Wallet, Loader2 } from 'lucide-react';

const ADMIN_EMAIL = 'myintaung7432@gmail.com';
const money = value => new Intl.NumberFormat('en-US').format(Number(value || 0)) + ' Ks';
const card = 'rounded-2xl border border-white/70 p-4';
const glassSurface = { background: 'rgba(255,255,255,.74)', border: '1px solid rgba(255,255,255,.85)', borderRadius: 26, boxShadow: '0 10px 30px -10px rgba(79,70,229,.12), inset 0 1px 0 rgba(255,255,255,.9)', backdropFilter: 'blur(22px) saturate(180%)', WebkitBackdropFilter: 'blur(22px) saturate(180%)', transition: 'transform .22s ease, box-shadow .22s ease, background .22s ease' };
const glassBar = { background: 'rgba(255,255,255,.88)', border: '1px solid rgba(255,255,255,.95)', borderRadius: 26, boxShadow: '0 16px 40px -12px rgba(79,70,229,.16), inset 0 1px 0 rgba(255,255,255,1)', backdropFilter: 'blur(26px) saturate(190%)', WebkitBackdropFilter: 'blur(26px) saturate(190%)' };
const field = 'w-full min-w-0 rounded-2xl border border-white/80 bg-white/70 px-4 py-3 text-sm text-slate-800 shadow-inner outline-none backdrop-blur-md placeholder:text-slate-400 focus:border-violet-400 focus:ring-2 focus:ring-violet-100';
const glassInset = { background: 'rgba(255,255,255,.74)', border: '1px solid rgba(255,255,255,.85)', borderRadius: 20, boxShadow: '0 10px 30px -10px rgba(79,70,229,.12), inset 0 1px 0 rgba(255,255,255,.9)', backdropFilter: 'blur(22px) saturate(180%)', WebkitBackdropFilter: 'blur(22px) saturate(180%)' };

export default function AdminPanel({ supabase, onClose, onAuthenticated, onLogout }) {
  const [sessionUser, setSessionUser] = useState(null);
  const [authorized, setAuthorized] = useState(false);
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState(ADMIN_EMAIL);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [tab, setTab] = useState('overview');
  const [plans, setPlans] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [payments, setPayments] = useState([]);
  const [users, setUsers] = useState([]);
  const [receipts, setReceipts] = useState({});
  const [search, setSearch] = useState('');
  const [freeDays, setFreeDays] = useState({});
  const [accountDraft, setAccountDraft] = useState(null);

  const loadData = useCallback(async () => {
    setBusy(true); setError('');
    const [pr, ar, pay, ur] = await Promise.all([
      supabase.from('teacher_plan_prices').select('*').order('sort_order'),
      supabase.from('platform_payment_accounts').select('*').order('updated_at', { ascending: false }),
      supabase.from('payment_requests').select('*').order('created_at', { ascending: false }),
      supabase.rpc('admin_list_accounts')
    ]);
    const firstError = pr.error || ar.error || pay.error || ur.error;
    if (firstError) setError(firstError.message);
    if (!pr.error) setPlans(pr.data || []);
    if (!ar.error) { setAccounts(ar.data || []); setAccountDraft(ar.data?.[0] || null); }
    if (!pay.error) setPayments(pay.data || []);
    if (!ur.error) setUsers(Array.isArray(ur.data) ? ur.data : []);
    if (!pay.error && pay.data?.length) {
      const pairs = await Promise.all(pay.data.filter(p => p.receipt_path).map(async p => {
        const { data } = await supabase.storage.from('kpay-receipts').createSignedUrl(p.receipt_path, 600);
        return [p.id, data?.signedUrl || ''];
      }));
      setReceipts(Object.fromEntries(pairs));
    }
    setBusy(false);
  }, [supabase]);

  const verifySession = useCallback(async () => {
    setChecking(true); setError('');
    const { data } = await supabase.auth.getUser();
    const current = data?.user || null;
    setSessionUser(current);
    if (current) {
      const { data: isAdmin, error: checkError } = await supabase.rpc('is_platform_admin');
      if (!checkError && isAdmin === true) {
        setAuthorized(true);
        await loadData();
      } else {
        setAuthorized(false);
      }
    }
    setChecking(false);
  }, [supabase, loadData]);

  useEffect(() => {
    const body = document.body;
    const previousOverflow = body.style.overflow;
    const previousOverscroll = body.style.overscrollBehavior;
    body.style.overflow = 'hidden';
    body.style.overscrollBehavior = 'none';
    verifySession();
    return () => { body.style.overflow = previousOverflow; body.style.overscrollBehavior = previousOverscroll; };
  }, [verifySession]);

  const signIn = async e => {
    e.preventDefault(); setBusy(true); setError('');
    const { data, error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    if (signInError) { setError(signInError.message); setBusy(false); return; }
    const { data: isAdmin, error: checkError } = await supabase.rpc('is_platform_admin');
    if (checkError || isAdmin !== true) {
      await supabase.auth.signOut();
      setError('ဒီအကောင့်ကို Admin အဖြစ် ခွင့်ပြုမထားပါ။');
      setBusy(false); return;
    }
    setSessionUser(data.user); setAuthorized(true); setPassword(''); onAuthenticated?.();
    await loadData();
    setBusy(false);
  };

  const logout = async () => {
    setBusy(true); setError('');
    const { error: logoutError } = await supabase.auth.signOut();
    if (logoutError) { setError(logoutError.message); setBusy(false); return; }
    setSessionUser(null); setAuthorized(false); setPassword('');
    onLogout?.();
    setBusy(false);
  };

  const savePlan = async plan => {
    setBusy(true); setError(''); setNotice('');
    const { error: updateError } = await supabase.from('teacher_plan_prices').update({
      price_mmk: Math.max(0, Math.round(Number(plan.price_mmk) || 0)),
      is_active: Boolean(plan.is_active), updated_at: new Date().toISOString()
    }).eq('code', plan.code);
    if (updateError) setError(updateError.message);
    else { setNotice(plan.label + ' Plan ဈေးနှုန်း သိမ်းပြီးပါပြီ။'); await loadData(); }
    setBusy(false);
  };

  const savePaymentAccount = async () => {
    if (!accountDraft) return;
    setBusy(true); setError(''); setNotice('');
    const payload = {
      method_name: accountDraft.method_name || 'KPay',
      account_name: accountDraft.account_name?.trim(),
      account_number: accountDraft.account_number?.trim(),
      qr_payload: accountDraft.qr_payload || null,
      qr_image_url: accountDraft.qr_image_url || null,
      instructions: accountDraft.instructions || null,
      is_active: Boolean(accountDraft.is_active),
      updated_at: new Date().toISOString()
    };
    const query = accountDraft.id
      ? supabase.from('platform_payment_accounts').update(payload).eq('id', accountDraft.id)
      : supabase.from('platform_payment_accounts').insert(payload);
    const { error: saveError } = await query;
    if (saveError) setError(saveError.message);
    else { setNotice('ငွေလက်ခံအကောင့် အချက်အလက် သိမ်းပြီးပါပြီ။'); await loadData(); }
    setBusy(false);
  };

  const reviewPayment = async (paymentId, approve) => {
    setBusy(true); setError(''); setNotice('');
    const { error: reviewError } = await supabase.rpc('review_kpay_payment', {
      p_payment_id: paymentId, p_approve: approve,
      p_note: approve ? 'Admin verified payment receipt' : 'Payment could not be verified'
    });
    if (reviewError) setError(reviewError.message);
    else { setNotice(approve ? 'ငွေပေးချေမှု အတည်ပြုပြီး Plan ဖွင့်ပေးလိုက်ပါပြီ။' : 'Payment ကို ပယ်ချပြီးပါပြီ။'); await loadData(); }
    setBusy(false);
  };

  const grantAccess = async (account, lifetime) => {
    const days = Math.max(1, Math.min(3650, Number(freeDays[account.user_id]) || 30));
    setBusy(true); setError(''); setNotice('');
    const { error: grantError } = await supabase.rpc('admin_set_free_access', {
      p_user_id: account.user_id, p_free_days: lifetime ? null : days,
      p_lifetime: lifetime, p_note: lifetime ? 'Admin lifetime free access' : 'Admin complimentary access'
    });
    if (grantError) setError(grantError.message);
    else { setNotice(lifetime ? account.email + ' ကို Lifetime Free ပေးပြီးပါပြီ။' : account.email + ' ကို ' + days + ' ရက် Free ပေးပြီးပါပြီ။'); await loadData(); }
    setBusy(false);
  };

  const filteredUsers = useMemo(() => users.filter(u => (u.email || '').toLowerCase().includes(search.toLowerCase())), [users, search]);
  const pendingCount = payments.filter(p => p.status === 'pending').length;
  const activeCount = users.filter(u => ['active','trial','admin_free','grace'].includes(u.subscription_status)).length;

  if (checking) return createPortal(<div className="fixed inset-0 z-[100] grid h-[100dvh] w-screen place-items-center overscroll-y-contain bg-slate-950/35 p-4 backdrop-blur-lg"><div className={card} style={glassSurface}><Loader2 className="mx-auto h-7 w-7 animate-spin text-indigo-600"/><p className="mt-2 text-sm font-bold text-slate-700">Admin စစ်ဆေးနေသည်...</p></div></div>, document.body);

  return createPortal(<div className="admin-console fixed inset-0 z-[100] isolate h-[100dvh] w-screen overflow-x-hidden overflow-y-scroll overscroll-y-contain bg-[#e8e8ff] text-slate-900" style={{ position: "fixed", inset: 0, height: "100dvh", overflowY: "scroll", overflowX: "hidden", WebkitOverflowScrolling: "touch", touchAction: "pan-y", overscrollBehaviorY: "contain", backgroundColor: "#e8e8ff" }}>
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0" style={{ backgroundColor: "#f7f5ff", backgroundImage: "linear-gradient(135deg, #eef4ff 0%, #f7f5ff 52%, #ebf8ff 100%)" }}/>
    <style>{".admin-console { color: #1e293b; }\\n.admin-console .admin-panel-glass { background: rgba(255,255,255,.74) !important; backdrop-filter: blur(22px) saturate(180%); -webkit-backdrop-filter: blur(22px) saturate(180%); border: 1px solid rgba(255,255,255,.85) !important; box-shadow: 0 10px 30px -10px rgba(79,70,229,.12), inset 0 1px 0 rgba(255,255,255,.9) !important; box-sizing: border-box; }\\n.admin-console .admin-panel-glass-strong { background: rgba(255,255,255,.88) !important; backdrop-filter: blur(26px) saturate(190%); -webkit-backdrop-filter: blur(26px) saturate(190%); border: 1px solid rgba(255,255,255,.95) !important; box-shadow: 0 16px 40px -12px rgba(79,70,229,.16), inset 0 1px 0 rgba(255,255,255,1) !important; }\\n.admin-console .admin-stat-box { padding: 16px 18px !important; border-radius: 26px !important; transition: transform .18s ease, box-shadow .18s ease; }\\n.admin-console .admin-stat-box:hover { transform: translateY(-2px); }\\n.admin-console .admin-stat-value { color: #1e293b; font-weight: 800; line-height: 1.2; margin: 6px 0 4px; }\\n.admin-console .admin-stat-label { color: #64748b; font-size: .875rem; font-weight: 500; line-height: 1.35; }\\n.admin-console .admin-panel-glass.admin-section-box { padding: 18px !important; border-radius: 26px !important; }\\n.admin-console .admin-quick-action { background: rgba(255,255,255,.74) !important; border: 1px solid rgba(255,255,255,.85) !important; border-radius: 20px !important; padding: 14px 16px !important; color: #334155 !important; font-weight: 650; line-height: 1.4; box-shadow: 0 10px 30px -10px rgba(79,70,229,.10), inset 0 1px 0 rgba(255,255,255,.9); transition: background .18s ease, transform .15s ease, box-shadow .18s ease; }\\n.admin-console .admin-quick-action:hover { background: rgba(255,255,255,.88) !important; transform: translateY(-1px); }\\n.admin-console .admin-nav { background: rgba(255,255,255,.88) !important; border: 1px solid rgba(255,255,255,.95) !important; border-radius: 26px !important; box-shadow: 0 16px 40px -12px rgba(79,70,229,.16), inset 0 1px 0 rgba(255,255,255,1) !important; backdrop-filter: blur(26px) saturate(190%); -webkit-backdrop-filter: blur(26px) saturate(190%); }\\n.admin-console .admin-primary { background: linear-gradient(110deg,#4f46e5 0%,#7c3aed 52%,#0ea5e9 100%) !important; box-shadow: 0 10px 24px rgba(79,70,229,.22); }\\n.admin-console .admin-icon { color: #4f46e5 !important; }\\n@media (max-width: 640px) { .admin-console .admin-stat-box { padding: 14px !important; border-radius: 22px !important; } .admin-console .admin-panel-glass.admin-section-box { padding: 14px !important; border-radius: 24px !important; } .admin-console .admin-quick-action { padding: 12px 14px !important; border-radius: 18px !important; } }"}</style>
    <div className="relative z-10 mx-auto min-h-full w-full min-w-0 max-w-6xl px-4 pb-12 pt-4 sm:px-6 sm:pt-6" style={{ minHeight: "100%", paddingBottom: "calc(3rem + env(safe-area-inset-bottom))" }}>
      <header className="mb-5 flex items-center justify-between gap-3 rounded-[26px] border border-white/95 bg-white/[.88] p-4 shadow-[0_16px_40px_-12px_rgba(79,70,229,.16)] backdrop-blur-[26px]">
        <div className="flex min-w-0 items-center gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-500 text-white"><ShieldCheck className="h-5 w-5"/></div><div className="min-w-0"><p className="truncate text-sm font-black">Platform Admin</p><p className="truncate text-[11px] text-slate-500">Tr.Kyain Lone · Secure Console</p></div></div>
        <div className="flex shrink-0 items-center gap-2">
          {authorized && <button onClick={logout} disabled={busy} className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 disabled:opacity-50"><LogOut className="mr-1 inline h-4 w-4"/> Logout</button>}
          <button onClick={onClose} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold"><ArrowLeft className="mr-1 inline h-4 w-4"/> ပိတ်ရန်</button>
        </div>
      </header>

      {!authorized ? <div className="mx-auto mt-10 max-w-md">
        <div className={card}>
          <div className="mb-4 text-center"><div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-violet-100 text-indigo-700"><ShieldCheck className="h-7 w-7"/></div><h1 className="mt-3 text-xl font-black">Admin Login</h1><p className="mt-1 text-xs text-slate-500">Admin account ဖြင့်သာ ဝင်ရောက်နိုင်သည်</p></div>
          <form onSubmit={signIn} className="space-y-3">
            <label className="block text-xs font-bold">Admin Gmail<input className={field+' mt-1'} type="email" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="username" required/></label>
            <label className="block text-xs font-bold">Password<input className={field+' mt-1'} type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password" required/></label>
            {error && <p className="rounded-xl bg-rose-50 p-3 text-xs font-semibold text-rose-700">{error}</p>}
            <button disabled={busy} className="w-full rounded-xl admin-primary bg-gradient-to-r from-indigo-600 via-violet-600 to-sky-500 py-3 text-sm font-extrabold text-white disabled:opacity-60">{busy?'စစ်ဆေးနေသည်...':'Admin Panel ဝင်မည်'}</button>
          </form>
        </div>
      </div> : <>
        <div className="mb-5 grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ['Accounts',users.length,Users],['Active access',activeCount,ShieldCheck],['Pending payments',pendingCount,Clock3],['Plans',plans.length,CreditCard]
          ].map(([label,value,Icon])=><div key={label} className={card+' admin-panel-glass admin-stat-box min-w-0'}><Icon className="admin-icon h-5 w-5"/><p className="admin-stat-value mt-3 text-2xl font-black tabular-nums">{value}</p><p className="admin-stat-label mt-1">{label}</p></div>)}
        </div>
        <nav aria-label="Admin sections" className="admin-nav sticky top-2 z-20 mb-5 flex min-w-0 max-w-full gap-2 overflow-x-auto p-2">
          {[
            ['overview','Overview',LayoutDashboard],['plans','Plans',CreditCard],['payments','Payments',Wallet],['accounts','Users',Users],['payment-account','Pay account',Settings2]
          ].map(([key,label,Icon])=><button key={key} onClick={()=>setTab(key)} className={'flex min-w-[76px] shrink-0 flex-col items-center gap-1.5 rounded-2xl px-3 py-3 text-xs font-bold transition-all duration-200 active:scale-[.97] sm:min-w-0 sm:flex-1 sm:flex-row sm:justify-center sm:text-sm '+(tab===key?'admin-primary bg-gradient-to-r from-indigo-600 via-violet-600 to-sky-500 text-white shadow-[0_8px_20px_rgba(99,78,220,.32)] ring-1 ring-white/70':'text-slate-600 hover:bg-white/55')}><Icon className="h-4 w-4"/>{label}</button>)}
        </nav>
        {error && <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">{error}</div>}
        {notice && <div className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">{notice}</div>}
        {tab==='overview' && <div className="grid gap-4 pb-6 md:grid-cols-2">
          <section className={card+' admin-panel-glass admin-section-box'}><h2 className="text-base font-extrabold">Recent payments</h2>{payments.slice(0,5).map(p=><div key={p.id} className="flex items-center justify-between gap-2 border-b border-slate-100 py-3 last:border-0"><div className="min-w-0"><p className="truncate text-xs font-bold">{users.find(u=>u.user_id===p.user_id)?.email||p.user_id}</p><p className="text-[10px] text-slate-500">{p.plan_code} · {money(p.amount_mmk)}</p></div><span className="shrink-0 rounded-full bg-amber-50 px-2 py-1 text-[10px] font-bold">{p.status}</span></div>)}{!payments.length&&<p className="py-5 text-center text-xs text-slate-500">Payment မရှိသေးပါ။</p>}</section>
          <section className={card+' admin-panel-glass admin-section-box'}><h2 className="text-base font-extrabold">Quick actions</h2><div className="mt-4 grid gap-3"><button onClick={()=>setTab('plans')} className="admin-quick-action text-left text-sm shadow-sm active:scale-[.99]"><CreditCard className="mr-2 inline h-4 w-4"/> Plan ဈေးနှုန်း ပြင်ရန်</button><button onClick={()=>setTab('payments')} className="admin-quick-action text-left text-sm shadow-sm active:scale-[.99]"><Wallet className="mr-2 inline h-4 w-4"/> Payment ပြေစာ စစ်ရန်</button><button onClick={()=>setTab('accounts')} className="admin-quick-action text-left text-sm shadow-sm active:scale-[.99]"><Users className="mr-2 inline h-4 w-4"/> User Free Access သတ်မှတ်ရန်</button><button onClick={()=>setTab('payment-account')} className="admin-quick-action text-left text-sm shadow-sm active:scale-[.99]"><Settings2 className="mr-2 inline h-4 w-4"/> ငွေလက်ခံအကောင့် ပြင်ရန်</button></div></section>
        </div>}

        {tab==='plans' && <section className={card+' admin-panel-glass admin-section-box space-y-4'}><div><h2 className="font-extrabold">Plan pricing</h2><p className="text-[11px] text-slate-500">ဈေးနှုန်းပြောင်းလဲမှုသည် Plan ဝယ်ယူသည့်နေရာတွင်ပါ အကျိုးသက်ရောက်မည်။</p></div>{plans.map(plan=><div key={plan.code} className="admin-panel-glass rounded-[26px] p-4"><div className="flex items-center justify-between"><div><p className="font-extrabold">{plan.label}</p><p className="text-[10px] text-slate-500">{plan.days} days · {plan.code}</p></div><label className="flex items-center gap-2 text-[10px] font-bold"><input type="checkbox" checked={plan.is_active} onChange={e=>setPlans(xs=>xs.map(x=>x.code===plan.code?{...x,is_active:e.target.checked}:x))}/> Active</label></div><div className="mt-4 flex items-center gap-3"><input aria-label={plan.label+' price'} className={field} type="number" min="0" step="100" value={plan.price_mmk} onChange={e=>setPlans(xs=>xs.map(x=>x.code===plan.code?{...x,price_mmk:e.target.value}:x))}/><button disabled={busy} onClick={()=>savePlan(plan)} className="shrink-0 rounded-2xl admin-primary bg-gradient-to-r from-indigo-600 via-violet-600 to-sky-500 px-4 py-3 text-sm font-bold text-white shadow-md transition active:scale-95"><Save className="inline h-4 w-4"/></button></div></div>)}</section>}

        {tab==='payments' && <section className={card+' admin-panel-glass admin-section-box space-y-4'}><h2 className="font-extrabold">Payment records ({payments.length})</h2>{payments.map(p=><article key={p.id} className="admin-panel-glass rounded-[26px] p-4"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="break-all text-xs font-extrabold">{users.find(u=>u.user_id===p.user_id)?.email||p.user_id}</p><p className="mt-1 text-[11px] text-slate-500">{p.plan_code} · {money(p.amount_mmk)}</p><p className="text-[10px] text-slate-500">Txn: {p.transaction_last6} · {new Date(p.created_at).toLocaleString()}</p></div><span className="shrink-0 rounded-full border border-white/80 bg-white/65 px-3 py-1.5 text-xs font-bold text-slate-700">{p.status}</span></div>{receipts[p.id]&&<a className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-indigo-700 underline" href={receipts[p.id]} target="_blank" rel="noreferrer">ပြေစာကြည့်ရန် <ExternalLink className="h-3 w-3"/></a>}{p.status==='pending'&&<div className="mt-3 grid grid-cols-2 gap-2"><button disabled={busy} onClick={()=>reviewPayment(p.id,true)} className="rounded-2xl bg-emerald-600 py-3 text-sm font-bold text-white shadow-sm transition active:scale-[.98]"><CheckCircle2 className="mr-1 inline h-4 w-4"/> Approve</button><button disabled={busy} onClick={()=>reviewPayment(p.id,false)} className="rounded-2xl bg-rose-600 py-3 text-sm font-bold text-white shadow-sm transition active:scale-[.98]"><XCircle className="mr-1 inline h-4 w-4"/> Reject</button></div>}</article>)}{!payments.length&&<p className="py-8 text-center text-xs text-slate-500">Payment မရှိသေးပါ။</p>}</section>}

        {tab==='accounts' && <section className={card+' admin-panel-glass admin-section-box space-y-3'}><div><h2 className="font-extrabold">Registered accounts ({users.length})</h2><p className="text-[11px] text-slate-500">Lifetime Free သို့မဟုတ် ရက်အလိုက် Free Access ပေးနိုင်သည်။</p></div><div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400"/><input className={field+' pl-9'} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Gmail ရှာရန်..."/></div>{filteredUsers.map(u=><article key={u.user_id} className="admin-panel-glass rounded-[26px] p-4"><p className="break-all text-xs font-extrabold">{u.email}</p><p className="mt-1 text-[10px] text-slate-500">Joined: {new Date(u.created_at).toLocaleDateString()} · {u.subscription_status||'No plan'}</p><div className="mt-3 grid grid-cols-[1fr_auto_auto] gap-2"><input className={field+' min-w-0'} type="number" min="1" max="3650" value={freeDays[u.user_id]??30} onChange={e=>setFreeDays(x=>({...x,[u.user_id]:e.target.value}))} aria-label="Free days"/><button disabled={busy} onClick={()=>grantAccess(u,false)} className="rounded-2xl bg-indigo-600 px-4 py-3 text-xs font-bold text-white shadow-sm transition active:scale-[.98]"><Clock3 className="mr-1 inline h-3.5 w-3.5"/> Days</button><button disabled={busy} onClick={()=>grantAccess(u,true)} className="rounded-2xl bg-amber-500 px-4 py-3 text-xs font-bold text-white shadow-sm transition active:scale-[.98]"><Crown className="mr-1 inline h-3.5 w-3.5"/> Life</button></div></article>)}{!filteredUsers.length&&<p className="py-8 text-center text-xs text-slate-500">အကောင့်မတွေ့ပါ။</p>}</section>}

        {tab==='payment-account' && <section className={card+' admin-panel-glass admin-section-box space-y-3'}><div><h2 className="font-extrabold">Payment receiving account</h2><p className="text-[11px] text-slate-500">Customer တွေမြင်ရမည့် KPay အကောင့်အချက်အလက်။</p></div>{accountDraft ? <><label className="block text-xs font-bold">Payment method<input className={field+' mt-1'} value={accountDraft.method_name||''} onChange={e=>setAccountDraft(x=>({...x,method_name:e.target.value}))}/></label><label className="block text-xs font-bold">Account name<input className={field+' mt-1'} value={accountDraft.account_name||''} onChange={e=>setAccountDraft(x=>({...x,account_name:e.target.value}))}/></label><label className="block text-xs font-bold">Phone / Account number<input className={field+' mt-1'} value={accountDraft.account_number||''} onChange={e=>setAccountDraft(x=>({...x,account_number:e.target.value}))}/></label><label className="block text-xs font-bold">QR payload<input className={field+' mt-1'} value={accountDraft.qr_payload||''} onChange={e=>setAccountDraft(x=>({...x,qr_payload:e.target.value}))}/></label><label className="block text-xs font-bold">QR image URL (optional)<input className={field+' mt-1'} value={accountDraft.qr_image_url||''} onChange={e=>setAccountDraft(x=>({...x,qr_image_url:e.target.value}))}/></label><label className="block text-xs font-bold">Payment instructions<textarea className={field+' mt-1'} rows="3" value={accountDraft.instructions||''} onChange={e=>setAccountDraft(x=>({...x,instructions:e.target.value}))}/></label><label className="flex items-center gap-2 text-xs font-bold"><input type="checkbox" checked={Boolean(accountDraft.is_active)} onChange={e=>setAccountDraft(x=>({...x,is_active:e.target.checked}))}/> Active / အသုံးပြုမည်</label><button disabled={busy} onClick={savePaymentAccount} className="w-full rounded-2xl admin-primary bg-gradient-to-r from-indigo-600 via-violet-600 to-sky-500 py-4 text-sm font-extrabold text-white shadow-lg transition active:scale-[.99]"><Save className="mr-2 inline h-4 w-4"/> အကောင့်အချက်အလက် သိမ်းမည်</button></> : <p className="text-xs text-slate-500">Payment account မရှိသေးပါ။</p>}</section>}
        <footer className="mt-6 flex items-center justify-center gap-2 text-[10px] text-slate-400"><ShieldCheck className="h-3.5 w-3.5"/> Admin access is verified by Supabase platform_admins</footer>
      </>}
    </div>
  </div>, document.body);
}
