-- Teaching Platform foundation: subscription lifecycle + daily teacher workflows.
-- Admin access is based on a verified Supabase Auth identity, never a client-side password.
create extension if not exists pgcrypto;

create table if not exists public.teacher_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_code text not null check (plan_code in ('monthly','quarterly','half_year','yearly','admin_free')),
  status text not null default 'trial' check (status in ('trial','active','grace','expired','admin_free','cancelled')),
  trial_started_at timestamptz not null default now(),
  trial_ends_at timestamptz not null default (now() + interval '15 days'),
  current_period_started_at timestamptz,
  current_period_ends_at timestamptz,
  grace_ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id)
);
alter table public.teacher_subscriptions enable row level security;
drop policy if exists "Users read own subscription" on public.teacher_subscriptions;
create policy "Users read own subscription" on public.teacher_subscriptions for select to authenticated
using (user_id = (select auth.uid()) or ((auth.jwt()->>'email') = 'myintaung7432@gmail.com' and coalesce((auth.jwt()->>'email_verified')::boolean,false)));
drop policy if exists "Admins manage subscriptions" on public.teacher_subscriptions;
create policy "Admins manage subscriptions" on public.teacher_subscriptions for all to authenticated
using ((auth.jwt()->>'email') = 'myintaung7432@gmail.com' and coalesce((auth.jwt()->>'email_verified')::boolean,false))
with check ((auth.jwt()->>'email') = 'myintaung7432@gmail.com' and coalesce((auth.jwt()->>'email_verified')::boolean,false));
grant select, insert, update on public.teacher_subscriptions to authenticated;

create table if not exists public.payment_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_code text not null check (plan_code in ('monthly','quarterly','half_year','yearly')),
  amount_mmk integer not null check (amount_mmk > 0),
  transaction_last6 text not null check (transaction_last6 ~ '^[A-Za-z0-9]{6}$'),
  receipt_path text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  admin_note text,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists payment_requests_user_created_idx on public.payment_requests(user_id, created_at desc);
create unique index if not exists payment_requests_unique_last6 on public.payment_requests(transaction_last6) where status <> 'rejected';
alter table public.payment_requests enable row level security;
drop policy if exists "Users submit own payment requests" on public.payment_requests;
create policy "Users submit own payment requests" on public.payment_requests for insert to authenticated
with check (user_id = (select auth.uid()) and status = 'pending' and reviewed_by is null and reviewed_at is null);
drop policy if exists "Users read own payment requests" on public.payment_requests;
create policy "Users read own payment requests" on public.payment_requests for select to authenticated
using (user_id = (select auth.uid()) or ((auth.jwt()->>'email') = 'myintaung7432@gmail.com' and coalesce((auth.jwt()->>'email_verified')::boolean,false)));
drop policy if exists "Admins review payment requests" on public.payment_requests;
create policy "Admins review payment requests" on public.payment_requests for update to authenticated
using ((auth.jwt()->>'email') = 'myintaung7432@gmail.com' and coalesce((auth.jwt()->>'email_verified')::boolean,false))
with check ((auth.jwt()->>'email') = 'myintaung7432@gmail.com' and coalesce((auth.jwt()->>'email_verified')::boolean,false));
grant select, insert on public.payment_requests to authenticated;
grant update on public.payment_requests to authenticated;

create table if not exists public.teacher_classes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  subject text,
  grade_level text,
  schedule jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.class_students (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  class_id uuid not null references public.teacher_classes(id) on delete cascade,
  student_name text not null,
  student_code text,
  guardian_contact text,
  notes text,
  created_at timestamptz not null default now(),
  unique(class_id, student_code)
);
create table if not exists public.lesson_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  class_id uuid references public.teacher_classes(id) on delete set null,
  title text not null,
  subject text,
  lesson_date date,
  duration_minutes integer not null default 45 check (duration_minutes between 1 and 600),
  objectives text,
  content jsonb not null default '{}'::jsonb,
  status text not null default 'planned' check (status in ('planned','in_progress','completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.question_bank (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject text,
  grade_level text,
  topic text,
  question_type text not null check (question_type in ('mcq','written','true_false','short_answer')),
  question_data jsonb not null,
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.homework_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  class_id uuid references public.teacher_classes(id) on delete set null,
  title text not null,
  instructions text,
  due_at timestamptz,
  attachment_path text,
  created_at timestamptz not null default now()
);
create table if not exists public.homework_submissions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.homework_assignments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  student_id uuid references public.class_students(id) on delete set null,
  student_name text not null,
  answer_data jsonb not null default '{}'::jsonb,
  submitted_at timestamptz not null default now(),
  score numeric,
  feedback text,
  graded_at timestamptz
);

-- Apply consistent owner-only policies to teacher workspace tables.
do $$
declare t text;
begin
  foreach t in array array['teacher_classes','class_students','lesson_plans','question_bank','homework_assignments','homework_submissions'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %L on public.%I', 'Owners manage own '||t, t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))',
      'Owners manage own '||t, t
    );
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

create index if not exists teacher_classes_user_idx on public.teacher_classes(user_id, created_at desc);
create index if not exists class_students_class_idx on public.class_students(class_id, created_at desc);
create index if not exists lesson_plans_user_date_idx on public.lesson_plans(user_id, lesson_date desc);
create index if not exists question_bank_user_topic_idx on public.question_bank(user_id, subject, topic);
create index if not exists homework_user_due_idx on public.homework_assignments(user_id, due_at);
create index if not exists homework_submissions_assignment_idx on public.homework_submissions(assignment_id, submitted_at desc);

-- Keep update timestamps consistent.
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin new.updated_at = now(); return new; end; $$;
do $$
declare t text;
begin
  foreach t in array array['teacher_subscriptions','teacher_classes','lesson_plans','question_bank'] loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
  end loop;
end $$;
