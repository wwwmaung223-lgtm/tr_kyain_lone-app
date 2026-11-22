-- Automatically provision a 15-day trial for every newly registered teacher.
create or replace function public.provision_teacher_trial()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  insert into public.teacher_subscriptions(
    user_id, plan_code, status, trial_started_at, trial_ends_at
  ) values (
    new.id, 'monthly', 'trial', now(), now() + interval '15 days'
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_teacher_trial on auth.users;
create trigger on_auth_user_created_teacher_trial
after insert on auth.users
for each row execute function public.provision_teacher_trial();

-- Backfill trial records for existing accounts that have no subscription.
insert into public.teacher_subscriptions(user_id,plan_code,status,trial_started_at,trial_ends_at)
select u.id,'monthly','trial',now(),now()+interval '15 days'
from auth.users u
left join public.teacher_subscriptions s on s.user_id=u.id
where s.user_id is null
on conflict(user_id) do nothing;

-- Authenticated students may submit public quiz answers; subscription gating
-- applies to teacher reads/updates/deletes, not public student INSERTs.
drop policy if exists "Subscription required for teacher submission access" on public.quiz_submissions;
create policy "Subscription required for teacher submission reads"
on public.quiz_submissions as restrictive for select to authenticated
using (public.has_subscription_access((select auth.uid())));
create policy "Subscription required for teacher submission updates"
on public.quiz_submissions as restrictive for update to authenticated
using (public.has_subscription_access((select auth.uid())))
with check (public.has_subscription_access((select auth.uid())));
create policy "Subscription required for teacher submission deletes"
on public.quiz_submissions as restrictive for delete to authenticated
using (public.has_subscription_access((select auth.uid())));

-- Gate the additional teacher workspace behind the same trial/paid access.
do $$
declare t text;
begin
 foreach t in array array['teacher_classes','lesson_plans','question_bank','homework_assignments'] loop
   execute format('drop policy if exists %I on public.%I', 'Subscription required for '||t, t);
   execute format(
     'create policy %I on public.%I as restrictive for all to authenticated using (public.has_subscription_access((select auth.uid()))) with check (public.has_subscription_access((select auth.uid())))',
     'Subscription required for '||t, t
   );
 end loop;
end $$;
