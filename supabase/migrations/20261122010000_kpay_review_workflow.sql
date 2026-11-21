-- Secure KPay receipt storage and atomic subscription review workflow.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('kpay-receipts','kpay-receipts',false,5242880,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public=false, file_size_limit=5242880, allowed_mime_types=array['image/jpeg','image/png','image/webp'];

drop policy if exists "Users upload own KPay receipts" on storage.objects;
create policy "Users upload own KPay receipts" on storage.objects for insert to authenticated
with check (bucket_id='kpay-receipts' and (storage.foldername(name))[1]=(select auth.uid())::text);
drop policy if exists "Users read own KPay receipts" on storage.objects;
create policy "Users read own KPay receipts" on storage.objects for select to authenticated
using (bucket_id='kpay-receipts' and ((storage.foldername(name))[1]=(select auth.uid())::text or (auth.jwt()->>'email')='myintaung7432@gmail.com'));
drop policy if exists "Admins delete KPay receipts" on storage.objects;
create policy "Admins delete KPay receipts" on storage.objects for delete to authenticated
using (bucket_id='kpay-receipts' and (auth.jwt()->>'email')='myintaung7432@gmail.com');

create or replace function public.review_kpay_payment(p_payment_id uuid, p_approve boolean, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_payment public.payment_requests%rowtype;
  v_period interval;
  v_now timestamptz := now();
begin
  if coalesce(auth.jwt()->>'email','') <> 'myintaung7432@gmail.com' then
    raise exception 'Admin access required';
  end if;
  select * into v_payment from public.payment_requests where id=p_payment_id for update;
  if not found then raise exception 'Payment request not found'; end if;
  if v_payment.status <> 'pending' then raise exception 'Payment request already reviewed'; end if;

  if not p_approve then
    update public.payment_requests
      set status='rejected', admin_note=left(coalesce(p_note,'Receipt could not be verified'),500),
          reviewed_by=auth.uid(), reviewed_at=v_now
      where id=p_payment_id;
    return jsonb_build_object('success',true,'status','rejected');
  end if;

  v_period := case v_payment.plan_code
    when 'monthly' then interval '30 days'
    when 'quarterly' then interval '90 days'
    when 'half_year' then interval '180 days'
    when 'yearly' then interval '365 days'
  end;
  update public.payment_requests
    set status='approved', admin_note=left(coalesce(p_note,'KPay payment verified'),500),
        reviewed_by=auth.uid(), reviewed_at=v_now
    where id=p_payment_id;

  insert into public.teacher_subscriptions(
    user_id,plan_code,status,trial_started_at,trial_ends_at,
    current_period_started_at,current_period_ends_at,grace_ends_at
  ) values (
    v_payment.user_id,v_payment.plan_code,'active',v_now,v_now,
    v_now,v_now+v_period,null
  )
  on conflict(user_id) do update set
    plan_code=excluded.plan_code,status='active',
    current_period_started_at=v_now,
    current_period_ends_at=v_now+v_period,
    grace_ends_at=null,updated_at=v_now;

  return jsonb_build_object('success',true,'status','approved','period_days',extract(epoch from v_period)/86400);
end;
$$;
revoke all on function public.review_kpay_payment(uuid,boolean,text) from public, anon;
grant execute on function public.review_kpay_payment(uuid,boolean,text) to authenticated;
