create or replace function public.has_subscription_access(p_user_id uuid)
returns boolean
language sql stable security definer
set search_path=public,pg_temp
as $$
  select exists (
    select 1 from public.teacher_subscriptions s
    where s.user_id=p_user_id and (
      s.status='admin_free'
      or (s.status='trial' and s.trial_ends_at + interval '3 days' > now())
      or (s.status='active' and s.current_period_ends_at + interval '3 days' > now())
      or (s.status='grace' and coalesce(s.grace_ends_at, s.current_period_ends_at + interval '3 days') > now())
    )
  ) or exists(select 1 from public.platform_admins a where a.user_id=p_user_id);
$$;
revoke all on function public.has_subscription_access(uuid) from public,anon;
grant execute on function public.has_subscription_access(uuid) to authenticated;

drop policy if exists "Subscription required for teacher quiz access" on public.quiz_assessments;
create policy "Subscription required for teacher quiz access"
on public.quiz_assessments as restrictive for all to authenticated
using (public.has_subscription_access((select auth.uid())))
with check (public.has_subscription_access((select auth.uid())));

drop policy if exists "Subscription required for teacher submission access" on public.quiz_submissions;
create policy "Subscription required for teacher submission access"
on public.quiz_submissions as restrictive for all to authenticated
using (public.has_subscription_access((select auth.uid())))
with check (public.has_subscription_access((select auth.uid())));

create or replace function public.review_kpay_payment(p_payment_id uuid, p_approve boolean, p_note text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_payment public.payment_requests%rowtype;
  v_period interval;
  v_now timestamptz := now();
  v_start timestamptz;
begin
  if not public.is_platform_admin() then raise exception 'Admin access required'; end if;
  select * into v_payment from public.payment_requests where id=p_payment_id for update;
  if not found then raise exception 'Payment request not found'; end if;
  if v_payment.status <> 'pending' then raise exception 'Payment request already reviewed'; end if;
  if not p_approve then
    update public.payment_requests set status='rejected',
      admin_note=left(coalesce(p_note,'Receipt could not be verified'),500),
      reviewed_by=auth.uid(),reviewed_at=v_now where id=p_payment_id;
    return jsonb_build_object('success',true,'status','rejected');
  end if;
  v_period := case v_payment.plan_code
    when 'monthly' then interval '30 days'
    when 'quarterly' then interval '90 days'
    when 'half_year' then interval '180 days'
    when 'yearly' then interval '365 days' end;
  select greatest(v_now, coalesce(current_period_ends_at,v_now)) into v_start
  from public.teacher_subscriptions where user_id=v_payment.user_id;
  v_start := coalesce(v_start,v_now);
  update public.payment_requests set status='approved',
    admin_note=left(coalesce(p_note,'KPay payment verified manually'),500),
    reviewed_by=auth.uid(),reviewed_at=v_now where id=p_payment_id;
  insert into public.teacher_subscriptions(user_id,plan_code,status,trial_started_at,trial_ends_at,current_period_started_at,current_period_ends_at,grace_ends_at)
  values(v_payment.user_id,v_payment.plan_code,'active',v_now,v_now,v_start,v_start+v_period,null)
  on conflict(user_id) do update set plan_code=excluded.plan_code,status='active',
    current_period_started_at=excluded.current_period_started_at,
    current_period_ends_at=excluded.current_period_ends_at,grace_ends_at=null,updated_at=v_now;
  return jsonb_build_object('success',true,'status','approved','period_days',extract(epoch from v_period)/86400);
end; $$;
