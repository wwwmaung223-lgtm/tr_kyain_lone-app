-- Use a database-backed admin allowlist rather than trusting editable client state.
create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  created_at timestamptz not null default now()
);
alter table public.platform_admins enable row level security;
revoke all on public.platform_admins from anon, authenticated;

create or replace function public.is_platform_admin()
returns boolean
language sql stable security definer
set search_path=public,pg_temp
as $$
  select exists(select 1 from public.platform_admins a where a.user_id=auth.uid());
$$;
revoke all on function public.is_platform_admin() from public, anon;
grant execute on function public.is_platform_admin() to authenticated;

create or replace function public.sync_platform_admin_allowlist()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if lower(coalesce(new.email,''))='myintaung7432@gmail.com' and new.email_confirmed_at is not null then
    insert into public.platform_admins(user_id,email)
    values(new.id,lower(new.email))
    on conflict(user_id) do update set email=excluded.email;
  else
    delete from public.platform_admins where user_id=new.id;
  end if;
  return new;
end; $$;
drop trigger if exists sync_platform_admin_allowlist on auth.users;
create trigger sync_platform_admin_allowlist
after insert or update of email,email_confirmed_at on auth.users
for each row execute function public.sync_platform_admin_allowlist();
insert into public.platform_admins(user_id,email)
select id,lower(email) from auth.users
where lower(email)='myintaung7432@gmail.com' and email_confirmed_at is not null
on conflict(user_id) do update set email=excluded.email;

drop policy if exists "Users read own subscription" on public.teacher_subscriptions;
create policy "Users read own subscription" on public.teacher_subscriptions for select to authenticated
using (user_id=(select auth.uid()) or public.is_platform_admin());
drop policy if exists "Admins manage subscriptions" on public.teacher_subscriptions;
create policy "Admins manage subscriptions" on public.teacher_subscriptions for all to authenticated
using (public.is_platform_admin()) with check (public.is_platform_admin());

drop policy if exists "Users read own payment requests" on public.payment_requests;
create policy "Users read own payment requests" on public.payment_requests for select to authenticated
using (user_id=(select auth.uid()) or public.is_platform_admin());
drop policy if exists "Admins review payment requests" on public.payment_requests;
create policy "Admins review payment requests" on public.payment_requests for update to authenticated
using (public.is_platform_admin()) with check (public.is_platform_admin());

drop policy if exists "Users read own KPay receipts" on storage.objects;
create policy "Users read own KPay receipts" on storage.objects for select to authenticated
using (bucket_id='kpay-receipts' and ((storage.foldername(name))[1]=(select auth.uid())::text or public.is_platform_admin()));
drop policy if exists "Admins delete KPay receipts" on storage.objects;
create policy "Admins delete KPay receipts" on storage.objects for delete to authenticated
using (bucket_id='kpay-receipts' and public.is_platform_admin());

create or replace function public.review_kpay_payment(p_payment_id uuid, p_approve boolean, p_note text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_payment public.payment_requests%rowtype;
  v_period interval;
  v_now timestamptz := now();
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
  update public.payment_requests set status='approved',
    admin_note=left(coalesce(p_note,'KPay payment verified manually'),500),
    reviewed_by=auth.uid(),reviewed_at=v_now where id=p_payment_id;
  insert into public.teacher_subscriptions(user_id,plan_code,status,trial_started_at,trial_ends_at,current_period_started_at,current_period_ends_at,grace_ends_at)
  values(v_payment.user_id,v_payment.plan_code,'active',v_now,v_now,v_now,v_now+v_period,null)
  on conflict(user_id) do update set plan_code=excluded.plan_code,status='active',
    current_period_started_at=v_now,current_period_ends_at=v_now+v_period,grace_ends_at=null,updated_at=v_now;
  return jsonb_build_object('success',true,'status','approved','period_days',extract(epoch from v_period)/86400);
end; $$;
