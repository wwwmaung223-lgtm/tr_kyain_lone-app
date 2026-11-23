import React, { useEffect, useMemo, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { CheckCircle2, Clock3, CreditCard, ImagePlus, Loader2, RefreshCw, ShieldCheck, XCircle } from 'lucide-react';

const ADMIN_EMAIL = 'myintaung7432@gmail.com';
const DEFAULT_KPAY = { name: 'Myint Aung', phone: '09791990867', qr_payload: 'hQZLQlpQYXlhQE8C8FACEFECMTFXFgl5GZCGfSYREBAfnwgEAQGfJAEwFE1a1d57aaa52' };
const FALLBACK_PLANS = [
  { code: 'monthly', label: '1 လ', days: 30, price: 8500, discount: 0 },
  { code: 'quarterly', label: '3 လ', days: 90, price: 22950, discount: 10 },
  { code: 'half_year', label: '6 လ', days: 180, price: 40800, discount: 20 },
  { code: 'yearly', label: '12 လ', days: 365, price: 66300, discount: 35 }
];
const money = n => new Intl.NumberFormat('en-US').format(n) + ' Ks';

export default function SubscriptionCenter({ supabase, user, onClose }) {
  const [subscription, setSubscription] = useState(null);
  const [plans, setPlans] = useState(FALLBACK_PLANS);
  const [paymentAccount, setPaymentAccount] = useState(DEFAULT_KPAY);
  const [payments, setPayments] = useState([]);
  const [selectedPlan, setSelectedPlan] = useState('monthly');
  const [last6, setLast6] = useState('');
  const [receipt, setReceipt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [admin, setAdmin] = useState(false);
  const [signedReceipts, setSignedReceipts] = useState({});

  const selected = useMemo(() => plans.find(p => p.code === selectedPlan) || plans[0] || FALLBACK_PLANS[0], [selectedPlan, plans]);

  const refresh = async () => {
    if (!supabase || !user) return;
    setLoading(true); setError('');
    const [sr, pr, planResult, accountResult] = await Promise.all([
      supabase.from('teacher_subscriptions').select('*').eq('user_id', user.id).maybeSingle(),
      supabase.from('payment_requests').select('*').order('created_at', { ascending: false }),
      supabase.from('teacher_plan_prices').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('platform_payment_accounts').select('*').eq('is_active', true).order('updated_at', { ascending: false }).limit(1).maybeSingle()
    ]);
    if (sr.error) setError(sr.error.message);
    else setSubscription(sr.data);
    if (!pr.error) setPayments(pr.data || []);
    if (!planResult.error && planResult.data?.length) setPlans(planResult.data);
    if (!accountResult.error && accountResult.data) setPaymentAccount({name:accountResult.data.account_name,phone:accountResult.data.account_number,method:accountResult.data.method_name,qr_payload:accountResult.data.qr_payload,qr_image_url:accountResult.data.qr_image_url,instructions:accountResult.data.instructions});
    setLoading(false);
  };

  useEffect(() => { refresh(); }, [user?.id]);

  useEffect(() => {
    let live = true;
    if (!user?.id) { setAdmin(false); return; }
    supabase.rpc('is_platform_admin').then(({ data, error: adminError }) => {
      if (live) setAdmin(!adminError && data === true);
    });
    return () => { live = false; };
  }, [user?.id, supabase]);

  useEffect(() => {
    if (!admin || !payments.length) return;
    let live = true;
    (async () => {
      const pairs = await Promise.all(payments.filter(p => p.receipt_path).map(async p => {
        const { data } = await supabase.storage.from('kpay-receipts').createSignedUrl(p.receipt_path, 300);
        return [p.id, data?.signedUrl || ''];
      }));
      if (live) setSignedReceipts(Object.fromEntries(pairs));
    })();
    return () => { live = false; };
  }, [admin, payments, supabase]);

  const submitPayment = async e => {
    e.preventDefault(); setError(''); setNotice('');
    if (!receipt) return setError('KPay ပြေစာဓာတ်ပုံကို ရွေးပါ။');
    if (!/^[A-Za-z0-9]{6}$/.test(last6.trim())) return setError('Transaction Code နောက်ဆုံး ၆ လုံးကို မှန်ကန်စွာထည့်ပါ။');
    if (receipt.size > 5 * 1024 * 1024) return setError('ပြေစာပုံသည် 5MB အောက် ဖြစ်ရပါမယ်။');
    setSending(true);
    try {
      const ext = receipt.type === 'image/png' ? 'png' : receipt.type === 'image/webp' ? 'webp' : 'jpg';
      const path = user.id + '/' + crypto.randomUUID() + '.' + ext;
      const { error: uploadError } = await supabase.storage.from('kpay-receipts').upload(path, receipt, { contentType: receipt.type, upsert: false });
      if (uploadError) throw uploadError;
      const { error: insertError } = await supabase.from('payment_requests').insert({
        user_id: user.id, plan_code: selected.code, amount_mmk: selected.price,
        transaction_last6: last6.trim().toUpperCase(), receipt_path: path
      });
      if (insertError) throw insertError;
      setNotice('ပြေစာတင်ပြီးပါပြီ။ Admin က KPay ငွေလက်ခံရရှိမှုကို စစ်ဆေးပြီး အတည်ပြုပေးပါမယ်။');
      setLast6(''); setReceipt(null); await refresh();
    } catch (err) { setError(err.message || 'Payment request တင်မရပါ။'); }
    finally { setSending(false); }
  };

  const review = async (paymentId, approve) => {
    const note = approve ? 'KPay receipt verified manually' : 'Receipt/payment could not be verified';
    const { error: rpcError } = await supabase.rpc('review_kpay_payment', {
      p_payment_id: paymentId, p_approve: approve, p_note: note
    });
    if (rpcError) setError(rpcError.message);
    else { setNotice(approve ? 'Payment အတည်ပြုပြီး Subscription စတင်ပါပြီ။' : 'Payment request ကို Reject လုပ်ပြီးပါပြီ။'); await refresh(); }
  };

  const trialEnd = subscription?.trial_ends_at ? new Date(subscription.trial_ends_at) : null;
  const periodEnd = subscription?.current_period_ends_at ? new Date(subscription.current_period_ends_at) : null;
  const remaining = date => date ? Math.max(0, Math.ceil((date.getTime() - Date.now()) / 86400000)) : null;
  const trialGraceEnd = trialEnd ? new Date(trialEnd.getTime() + 3 * 86400000) : null;
  const paidGraceEnd = periodEnd ? new Date(periodEnd.getTime() + 3 * 86400000) : null;
  const graceEnd = subscription?.status === 'trial' ? trialGraceEnd : paidGraceEnd;
  const isGrace = ['trial','active','grace'].includes(subscription?.status) && graceEnd && graceEnd > new Date() && ((subscription?.status === 'grace') || (subscription?.status === 'trial' && trialEnd <= new Date()) || (subscription?.status === 'active' && periodEnd <= new Date()));
  const isAdmin = admin;
  const visiblePayments = isAdmin ? payments : payments.filter(p => p.user_id === user.id);

  return <div className="space-y-4 pb-8">
    <div className="rounded-3xl bg-gradient-to-br from-slate-950 via-indigo-950 to-violet-900 text-white p-5 shadow-xl">
      <div className="flex items-center justify-between gap-3">
        <div><p className="text-xs text-indigo-200 font-semibold">TEACHING PLATFORM</p><h2 className="text-2xl font-black mt-1">Plan & Subscription</h2></div>
        <button onClick={onClose} className="rounded-full bg-white/15 px-3 py-2 text-xs">ပြန်သွားမည်</button>
      </div>
      <div className="mt-5 rounded-2xl bg-white/10 border border-white/15 p-4">
        <p className="text-xs text-indigo-100">လက်ရှိအသုံးပြုခွင့်</p>
        {loading ? <p className="mt-2 text-sm">စစ်ဆေးနေသည်...</p> : <>
          <p className="text-xl font-extrabold mt-1">{subscription?.status === 'admin_free' ? 'Permanent Free' : isGrace ? 'Grace Period' : subscription?.status === 'active' ? 'Active Plan' : subscription?.status === 'trial' ? 'Free Trial' : subscription?.status || 'Plan မရှိသေးပါ'}</p>
          <p className="text-sm text-indigo-100 mt-1">
            {isGrace ? 'Plan သက်တမ်းကုန်နေပါပြီ။ Grace Period ကျန်: ' + remaining(graceEnd) + ' ရက်' : subscription?.status === 'active' ? 'သက်တမ်းကျန်: ' + remaining(periodEnd) + ' ရက်' : subscription?.status === 'trial' ? 'Trial ကျန်: ' + remaining(trialEnd) + ' ရက်' : subscription?.status === 'admin_free' ? 'သက်တမ်းကန့်သတ်ချက်မရှိပါ' : 'Plan ရွေးချယ်ပြီး ဝယ်ယူနိုင်ပါပြီ'}
          </p>
          {periodEnd && subscription?.status === 'active' && <p className="text-xs text-indigo-200 mt-1">သက်တမ်းကုန်မည့်ရက်: {periodEnd.toLocaleDateString()}</p>}
        </>}
      </div>
    </div>

    {error && <div className="rounded-xl bg-rose-50 border border-rose-200 text-rose-700 p-3 text-sm">{error}</div>}
    {notice && <div className="rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 p-3 text-sm">{notice}</div>}

    <section className="rounded-3xl bg-white/90 border border-white p-4 shadow-sm space-y-3">
      <div className="flex items-center gap-2"><CreditCard className="w-5 h-5 text-indigo-600"/><h3 className="font-extrabold">သင့် Plan ကို ရွေးချယ်ပါ</h3></div>
      <div className="grid grid-cols-2 gap-2">
        {plans.map(p => <button key={p.code} onClick={() => setSelectedPlan(p.code)} className={'text-left rounded-2xl p-3 border transition ' + (selectedPlan === p.code ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-100' : 'border-slate-200 bg-white')}>
          <p className="font-extrabold">{p.label}</p><p className="text-lg font-black text-indigo-700">{money(p.price)}</p>
          {p.discount > 0 && <p className="text-[11px] text-emerald-700 font-bold">{p.discount}% Discount</p>}
          <p className="text-[10px] text-slate-500">{p.days} ရက် အသုံးပြုခွင့်</p>
        </button>)}
      </div>
    </section>

    <section className="rounded-3xl bg-white/90 border border-white p-4 shadow-sm space-y-3">
      <div className="flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-emerald-600"/><h3 className="font-extrabold">KPay ဖြင့် ငွေပေးချေပါ</h3></div>
      <div className="rounded-2xl bg-slate-50 border p-3 flex gap-3 items-center">
        <div className="w-28 h-28 rounded-xl bg-white border p-1 flex items-center justify-center">{paymentAccount?.qr_image_url ? <img src={paymentAccount.qr_image_url} alt="Payment QR" className="h-24 w-24 object-contain"/> : <QRCodeSVG value={paymentAccount?.qr_payload || DEFAULT_KPAY.qr_payload} size={100} level="H" includeMargin />}</div>
        <div className="min-w-0"><p className="text-xs text-slate-500">ငွေလက်ခံသူ</p><p className="font-extrabold">{paymentAccount?.name || DEFAULT_KPAY.name}</p><p className="text-sm font-bold">{paymentAccount?.phone || DEFAULT_KPAY.phone}</p><p className="text-xs text-indigo-700 font-bold">ပေးချေရမည့်ငွေ: {money(selected.price)}</p></div>
      </div>
      <form onSubmit={submitPayment} className="space-y-3">
        <label className="block text-xs font-bold text-slate-600">ပြေစာဓာတ်ပုံ (JPEG / PNG / WebP, 5MB အောက်)</label>
        <input type="file" accept="image/jpeg,image/png,image/webp" onChange={e => setReceipt(e.target.files?.[0] || null)} className="block w-full text-xs"/>
        <label className="block text-xs font-bold text-slate-600">Transaction Code နောက်ဆုံး ၆ လုံး</label>
        <input value={last6} onChange={e => setLast6(e.target.value.replace(/[^a-zA-Z0-9]/g,'').slice(0,6))} placeholder="ဥပမာ A1B2C3" className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm tracking-widest uppercase"/>
        <button disabled={sending} className="w-full rounded-xl bg-indigo-600 text-white py-3 font-bold flex items-center justify-center gap-2 disabled:opacity-60">
          {sending ? <Loader2 className="w-4 h-4 animate-spin"/> : <ImagePlus className="w-4 h-4"/>} ပြေစာတင်ပြီး စစ်ဆေးရန်
        </button>
      </form>
      <p className="text-[11px] text-slate-500">ပြေစာပုံနှင့် Code ကို လက်ခံရရှိပြီးနောက် Admin က KPay မှ ငွေဝင်မှုကို ကိုယ်တိုင်စစ်ဆေးပြီးမှ Plan ကို အတည်ပြုပါမယ်။</p>
    </section>

    <section className="rounded-3xl bg-white/90 border border-white p-4 shadow-sm space-y-3">
      <div className="flex items-center justify-between"><h3 className="font-extrabold">Payment History</h3><button onClick={refresh} className="text-xs text-indigo-700 flex items-center gap-1"><RefreshCw className="w-3 h-3"/> Refresh</button></div>
      {visiblePayments.length === 0 ? <p className="text-sm text-slate-500">Payment မှတ်တမ်း မရှိသေးပါ။</p> : visiblePayments.map(p => <div key={p.id} className="rounded-xl border border-slate-200 p-3 flex items-center justify-between gap-2">
        <div><p className="text-sm font-bold">{plans.find(x => x.code === p.plan_code)?.label} · {money(p.amount_mmk)}</p><p className="text-[11px] text-slate-500">Code: {p.transaction_last6} · {new Date(p.created_at).toLocaleString()}</p></div>
        <span className={'text-xs font-bold ' + (p.status === 'approved' ? 'text-emerald-700' : p.status === 'rejected' ? 'text-rose-600' : 'text-amber-700')}>{p.status}</span>
      </div>)}
    </section>

    {isAdmin && <section className="rounded-3xl bg-white border-2 border-violet-200 p-4 shadow-sm space-y-3">
      <div className="flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-violet-700"/><h3 className="font-extrabold">Admin · Payment Review</h3></div>
      {payments.filter(p => p.status === 'pending').length === 0 ? <p className="text-sm text-slate-500">Pending Payment မရှိသေးပါ။</p> : payments.filter(p => p.status === 'pending').map(p => <div key={p.id} className="rounded-2xl border p-3 space-y-2">
        <p className="text-xs break-all text-slate-500">User ID: {p.user_id}</p>
        <p className="font-extrabold">{PLANS.find(x => x.code === p.plan_code)?.label} · {money(p.amount_mmk)}</p>
        <p className="text-sm">Transaction နောက်ဆုံး ၆ လုံး: <b>{p.transaction_last6}</b></p>
        {signedReceipts[p.id] ? <a href={signedReceipts[p.id]} target="_blank" rel="noreferrer" className="text-sm text-indigo-700 underline">ပြေစာဖွင့်ကြည့်ရန်</a> : <p className="text-xs text-slate-400">ပြေစာ link ပြင်ဆင်နေသည်...</p>}
        <div className="flex gap-2"><button onClick={() => review(p.id,true)} className="flex-1 rounded-xl bg-emerald-600 text-white py-2 text-sm font-bold flex items-center justify-center gap-1"><CheckCircle2 className="w-4 h-4"/> Approve</button><button onClick={() => review(p.id,false)} className="flex-1 rounded-xl bg-rose-600 text-white py-2 text-sm font-bold flex items-center justify-center gap-1"><XCircle className="w-4 h-4"/> Reject</button></div>
      </div>)}
    </section>}
  </div>;
}
