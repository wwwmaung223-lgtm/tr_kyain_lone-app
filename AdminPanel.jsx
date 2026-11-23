import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ShieldCheck, LayoutDashboard, CreditCard, Users, Settings2, RefreshCw, CheckCircle2, XCircle, Search, Crown, Clock3, Save, LogOut, ExternalLink, Smartphone, Wallet, Loader2 } from 'lucide-react';

const ADMIN_EMAIL = 'myintaung7432@gmail.com';
const money = value => new Intl.NumberFormat('en-US').format(Number(value || 0)) + ' Ks';
const card = 'rounded-2xl border border-white/70 p-4';
const glassSurface = { background: 'linear-gradient(145deg, rgba(255,255,255,.56), rgba(255,255,255,.28))', border: '1px solid rgba(255,255,255,.82)', borderRadius: 26, boxShadow: '0 16px 36px rgba(68,58,132,.12), inset 0 1.5px 0 rgba(255,255,255,.92), inset 0 -1px 0 rgba(255,255,255,.24)', backdropFilter: 'blur(16px) saturate(165%)', WebkitBackdropFilter: 'blur(16px) saturate(165%)', transition: 'transform .22s ease, box-shadow .22s ease, background .22s ease' };
const glassBar = { background: 'linear-gradient(135deg, rgba(255,255,255,.78), rgba(255,255,255,.48))', border: '1px solid rgba(255,255,255,.92)', borderRadius: 26, boxShadow: '0 10px 28px rgba(68,58,132,.10), inset 0 1.5px 0 rgba(255,255,255,.96)', backdropFilter: 'blur(18px) saturate(170%)', WebkitBackdropFilter: 'blur(18px) saturate(170%)' };
const field = 'w-full min-w-0 rounded-xl border border-white/80 bg-white/75 px-3 py-2.5 text-sm text-slate-800 shadow-inner outline-none backdrop-blur-md focus:border-violet-400 focus:ring-2 focus:ring-violet-100';

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

  if (checking) return createPortal(<div className="fixed inset-0 z-[100] grid h-[100dvh] w-screen place-items-center overscroll-y-contain bg-slate-950/35 p-4 backdrop-blur-lg"><div className={card} style={glassSurface}><Loader2 className="mx-auto h-7 w-7 animate-spin text-violet-600"/><p className="mt-2 text-sm font-bold text-slate-700">Admin စစ်ဆေးနေသည်...</p></div></div>, document.body);

  return createPortal(<div className="fixed inset-0 z-[100] isolate h-[100dvh] w-screen overflow-x-hidden overflow-y-auto overscroll-y-contain bg-[#e8e8ff] text-slate-900" style={{ WebkitOverflowScrolling: "touch", touchAction: "pan-y", backgroundColor: "#e8e8ff" }}>
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0" style={{ backgroundColor: "#e8e8ff", backgroundImage: "radial-gradient(ellipse at 10% 5%, rgba(255,255,255,.78), transparent 30%), radial-gradient(ellipse at 90% 82%, rgba(125,211,252,.72), transparent 42%), radial-gradient(ellipse at 15% 90%, rgba(216,180,254,.72), transparent 42%), linear-gradient(135deg, #c9d8ff 0%, #e7d5ff 48%, #c4e4ff 100%)" }}/>
    <div className="relative z-10 mx-auto min-h-[100dvh] w-full min-w-0 max-w-6xl px-3 pb-8 pt-3 sm:px-6 sm:pt-6">
      <header className="mb-4 flex items-center justify-between gap-3 rounded-3xl border border-white/90 bg-white/90 p-3 shadow-[0_8px_24px_rgba(57,52,128,.08)]">
        <div className="flex min-w-0 items-center gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-500 text-white"><ShieldCheck className="h-5 w-5"/></div><div className="min-w-0"><p className="truncate text-sm font-black">Platform Admin</p><p className="truncate text-[11px] text-slate-500">Tr.Kyain Lone · Secure Console</p></div></div>
        <div className="flex shrink-0 items-center gap-2">
          {authorized && <button onClick={logout} disabled={busy} className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 disabled:opacity-50"><LogOut className="mr-1 inline h-4 w-4"/> Logout</button>}
          <button onClick={onClose} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold"><ArrowLeft className="mr-1 inline h-4 w-4"/> ပိတ်ရန်</button>
        </div>
      </header>

      {!authorized ? <div className="mx-auto mt-10 max-w-md">
        <div className={card}>
          <div className="mb-4 text-center"><div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-violet-100 text-violet-700"><ShieldCheck className="h-7 w-7"/></div><h1 className="mt-3 text-xl font-black">Admin Login</h1><p className="mt-1 text-xs text-slate-500">Admin account ဖြင့်သာ ဝင်ရောက်နိုင်သည်</p></div>
          <form onSubmit={signIn} className="space-y-3">
            <label className="block text-xs font-bold">Admin Gmail<input className={field+' mt-1'} type="email" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="username" required/></label>
            <label className="block text-xs font-bold">Password<input className={field+' mt-1'} type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password" required/></label>
            {error && <p className="rounded-xl bg-rose-50 p-3 text-xs font-semibold text-rose-700">{error}</p>}
            <button disabled={busy} className="w-full rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 py-3 text-sm font-extrabold text-white disabled:opacity-60">{busy?'စစ်ဆေးနေသည်...':'Admin Panel ဝင်မည်'}</button>
          </form>
        </div>
      </div> : <>
        <div className="mb-4 grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            ['Accounts',users.length,Users],['Active access',activeCount,ShieldCheck],['Pending payments',pendingCount,Clock3],['Plans',plans.length,CreditCard]
          ].map(([label,value,Icon])=><div key={label} className={card+' min-w-0'} style={glassSurface}><Icon className="h-4 w-4 text-violet-600"/><p className="mt-2 text-xl font-black tabular-nums">{value}</p><p className="truncate text-[10px] font-semibold text-slate-500">{label}</p></div>)}
        </div>
        <nav aria-label="Admin sections" className="mb-4 flex min-w-0 max-w-full gap-1 overflow-x-auto p-1" style={glassBar}>
          {[
            ['overview','Overview',LayoutDashboard],['plans','Plans',CreditCard],['payments','Payments',Wallet],['accounts','Users',Users],['payment-account','Pay account',Settings2]
          ].map(([key,label,Icon])=><button key={key} onClick={()=>setTab(key)} className={'flex min-w-[68px] shrink-0 flex-col items-center gap-1 rounded-xl px-2 py-2 text-[10px] font-bold sm:min-w-0 sm:flex-1 sm:flex-row sm:justify-center sm:text-xs '+(tab===key?'bg-gradient-to-br from-violet-600 via-indigo-600 to-blue-600 text-white shadow-[0_8px_20px_rgba(99,78,220,.32)] ring-1 ring-white/70':'text-slate-600 hover:bg-white/55')}><Icon className="h-4 w-4"/>{label}</button>)}
        </nav>
        {error && <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">{error}</div>}
        {notice && <div className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">{notice}</div>}
        <div className="mb-3 flex justify-end"><button onClick={loadData} disabled={busy} className="rounded-xl border border-white bg-white px-3 py-2 text-xs font-bold text-slate-600"><RefreshCw className={'mr-1 inline h-3.5 w-3.5 '+(busy?'animate-spin':'')}/> Refresh</button></div>

        {tab==='overview' && <div className="grid gap-3 md:grid-cols-2">
          <section className={card}><h2 className="font-extrabold">Recent payments</h2>{payments.slice(0,5).map(p=><div key={p.id} className="flex items-center justify-between gap-2 border-b border-slate-100 py-3 last:border-0"><div className="min-w-0"><p className="truncate text-xs font-bold">{users.find(u=>u.user_id===p.user_id)?.email||p.user_id}</p><p className="text-[10px] text-slate-500">{p.plan_code} · {money(p.amount_mmk)}</p></div><span className="shrink-0 rounded-full bg-amber-50 px-2 py-1 text-[10px] font-bold">{p.status}</span></div>)}{!payments.length&&<p className="py-5 text-center text-xs text-slate-500">Payment မရှိသေးပါ။</p>}</section>
          <section className={card}><h2 className="font-extrabold">Quick actions</h2><div className="mt-3 grid gap-2"><button onClick={()=>setTab('plans')} className="rounded-xl bg-violet-50 p-3 text-left text-xs font-bold text-violet-800"><CreditCard className="mr-2 inline h-4 w-4"/> Plan ဈေးနှုန်း ပြင်ရန်</button><button onClick={()=>setTab('payments')} className="rounded-xl bg-emerald-50 p-3 text-left text-xs font-bold text-emerald-800"><Wallet className="mr-2 inline h-4 w-4"/> Payment ပြေစာ စစ်ရန်</button><button onClick={()=>setTab('accounts')} className="rounded-xl bg-sky-50 p-3 text-left text-xs font-bold text-sky-800"><Users className="mr-2 inline h-4 w-4"/> User Free Access သတ်မှတ်ရန်</button><button onClick={()=>setTab('payment-account')} className="rounded-xl bg-amber-50 p-3 text-left text-xs font-bold text-amber-800"><Settings2 className="mr-2 inline h-4 w-4"/> ငွေလက်ခံအကောင့် ပြင်ရန်</button></div></section>
        </div>}

        {tab==='plans' && <section className={card+' space-y-3'} style={glassSurface}><div><h2 className="font-extrabold">Plan pricing</h2><p className="text-[11px] text-slate-500">ဈေးနှုန်းပြောင်းလဲမှုသည် Plan ဝယ်ယူသည့်နေရာတွင်ပါ အကျိုးသက်ရောက်မည်။</p></div>{plans.map(plan=><div key={plan.code} className="rounded-2xl border border-white/75 bg-white/42 p-3 shadow-[0_8px_20px_rgba(68,58,132,.08)] backdrop-blur-xl"><div className="flex items-center justify-between"><div><p className="font-extrabold">{plan.label}</p><p className="text-[10px] text-slate-500">{plan.days} days · {plan.code}</p></div><label className="flex items-center gap-2 text-[10px] font-bold"><input type="checkbox" checked={plan.is_active} onChange={e=>setPlans(xs=>xs.map(x=>x.code===plan.code?{...x,is_active:e.target.checked}:x))}/> Active</label></div><div className="mt-3 flex items-center gap-2"><input aria-label={plan.label+' price'} className={field} type="number" min="0" step="100" value={plan.price_mmk} onChange={e=>setPlans(xs=>xs.map(x=>x.code===plan.code?{...x,price_mmk:e.target.value}:x))}/><button disabled={busy} onClick={()=>savePlan(plan)} className="shrink-0 rounded-xl bg-violet-600 px-3 py-3 text-xs font-bold text-white"><Save className="inline h-4 w-4"/></button></div></div>)}</section>}

        {tab==='payments' && <section className={card+' space-y-3'}><h2 className="font-extrabold">Payment records ({payments.length})</h2>{payments.map(p=><article key={p.id} className="rounded-xl border border-slate-200 p-3"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="break-all text-xs font-extrabold">{users.find(u=>u.user_id===p.user_id)?.email||p.user_id}</p><p className="mt-1 text-[11px] text-slate-500">{p.plan_code} · {money(p.amount_mmk)}</p><p className="text-[10px] text-slate-500">Txn: {p.transaction_last6} · {new Date(p.created_at).toLocaleString()}</p></div><span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold">{p.status}</span></div>{receipts[p.id]&&<a className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-violet-700 underline" href={receipts[p.id]} target="_blank" rel="noreferrer">ပြေစာကြည့်ရန် <ExternalLink className="h-3 w-3"/></a>}{p.status==='pending'&&<div className="mt-3 grid grid-cols-2 gap-2"><button disabled={busy} onClick={()=>reviewPayment(p.id,true)} className="rounded-xl bg-emerald-600 py-2.5 text-xs font-bold text-white"><CheckCircle2 className="mr-1 inline h-4 w-4"/> Approve</button><button disabled={busy} onClick={()=>reviewPayment(p.id,false)} className="rounded-xl bg-rose-600 py-2.5 text-xs font-bold text-white"><XCircle className="mr-1 inline h-4 w-4"/> Reject</button></div>}</article>)}{!payments.length&&<p className="py-8 text-center text-xs text-slate-500">Payment မရှိသေးပါ။</p>}</section>}

        {tab==='accounts' && <section className={card+' space-y-3'}><div><h2 className="font-extrabold">Registered accounts ({users.length})</h2><p className="text-[11px] text-slate-500">Lifetime Free သို့မဟုတ် ရက်အလိုက် Free Access ပေးနိုင်သည်။</p></div><div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400"/><input className={field+' pl-9'} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Gmail ရှာရန်..."/></div>{filteredUsers.map(u=><article key={u.user_id} className="rounded-xl border border-slate-200 p-3"><p className="break-all text-xs font-extrabold">{u.email}</p><p className="mt-1 text-[10px] text-slate-500">Joined: {new Date(u.created_at).toLocaleDateString()} · {u.subscription_status||'No plan'}</p><div className="mt-3 grid grid-cols-[1fr_auto_auto] gap-2"><input className={field+' min-w-0'} type="number" min="1" max="3650" value={freeDays[u.user_id]??30} onChange={e=>setFreeDays(x=>({...x,[u.user_id]:e.target.value}))} aria-label="Free days"/><button disabled={busy} onClick={()=>grantAccess(u,false)} className="rounded-xl bg-indigo-600 px-3 text-[10px] font-bold text-white"><Clock3 className="mr-1 inline h-3.5 w-3.5"/> Days</button><button disabled={busy} onClick={()=>grantAccess(u,true)} className="rounded-xl bg-amber-500 px-3 text-[10px] font-bold text-white"><Crown className="mr-1 inline h-3.5 w-3.5"/> Life</button></div></article>)}{!filteredUsers.length&&<p className="py-8 text-center text-xs text-slate-500">အကောင့်မတွေ့ပါ။</p>}</section>}

        {tab==='payment-account' && <section className={card+' space-y-3'}><div><h2 className="font-extrabold">Payment receiving account</h2><p className="text-[11px] text-slate-500">Customer တွေမြင်ရမည့် KPay အကောင့်အချက်အလက်။</p></div>{accountDraft ? <><label className="block text-xs font-bold">Payment method<input className={field+' mt-1'} value={accountDraft.method_name||''} onChange={e=>setAccountDraft(x=>({...x,method_name:e.target.value}))}/></label><label className="block text-xs font-bold">Account name<input className={field+' mt-1'} value={accountDraft.account_name||''} onChange={e=>setAccountDraft(x=>({...x,account_name:e.target.value}))}/></label><label className="block text-xs font-bold">Phone / Account number<input className={field+' mt-1'} value={accountDraft.account_number||''} onChange={e=>setAccountDraft(x=>({...x,account_number:e.target.value}))}/></label><label className="block text-xs font-bold">QR payload<input className={field+' mt-1'} value={accountDraft.qr_payload||''} onChange={e=>setAccountDraft(x=>({...x,qr_payload:e.target.value}))}/></label><label className="block text-xs font-bold">QR image URL (optional)<input className={field+' mt-1'} value={accountDraft.qr_image_url||''} onChange={e=>setAccountDraft(x=>({...x,qr_image_url:e.target.value}))}/></label><label className="block text-xs font-bold">Payment instructions<textarea className={field+' mt-1'} rows="3" value={accountDraft.instructions||''} onChange={e=>setAccountDraft(x=>({...x,instructions:e.target.value}))}/></label><label className="flex items-center gap-2 text-xs font-bold"><input type="checkbox" checked={Boolean(accountDraft.is_active)} onChange={e=>setAccountDraft(x=>({...x,is_active:e.target.checked}))}/> Active / အသုံးပြုမည်</label><button disabled={busy} onClick={savePaymentAccount} className="w-full rounded-xl bg-violet-600 py-3 text-sm font-extrabold text-white"><Save className="mr-2 inline h-4 w-4"/> အကောင့်အချက်အလက် သိမ်းမည်</button></> : <p className="text-xs text-slate-500">Payment account မရှိသေးပါ။</p>}</section>}
        <footer className="mt-6 flex items-center justify-center gap-2 text-[10px] text-slate-400"><ShieldCheck className="h-3.5 w-3.5"/> Admin access is verified by Supabase platform_admins</footer>
      </>}
    </div>
  </div>, document.body);
}
