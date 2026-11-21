-- Supabase Auth + PostgreSQL storage for teacher quizzes and student submissions.
-- Public students can read only the sanitized published_quizzes view.
-- Correct answers remain in quiz_assessments.quiz_data, which is teacher-only.

create table if not exists public.quiz_assessments (
  code text primary key check (code ~ '^[A-Z0-9]{6}$'),
  teacher_id uuid not null references auth.users(id) on delete cascade,
  teacher_email text not null,
  quiz_data jsonb not null,
  student_data jsonb,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists quiz_assessments_teacher_created_idx
  on public.quiz_assessments (teacher_id, created_at desc);
alter table public.quiz_assessments enable row level security;

drop policy if exists "Teachers read their own quizzes" on public.quiz_assessments;
create policy "Teachers read their own quizzes" on public.quiz_assessments
  for select to authenticated using (teacher_id = (select auth.uid()));
drop policy if exists "Teachers create their own quizzes" on public.quiz_assessments;
create policy "Teachers create their own quizzes" on public.quiz_assessments
  for insert to authenticated with check (teacher_id = (select auth.uid()));
drop policy if exists "Teachers update their own quizzes" on public.quiz_assessments;
create policy "Teachers update their own quizzes" on public.quiz_assessments
  for update to authenticated using (teacher_id = (select auth.uid()))
  with check (teacher_id = (select auth.uid()));
drop policy if exists "Teachers delete their own quizzes" on public.quiz_assessments;
create policy "Teachers delete their own quizzes" on public.quiz_assessments
  for delete to authenticated using (teacher_id = (select auth.uid()));

create or replace view public.published_quizzes
with (security_barrier = true) as
  select code, student_data, teacher_id
  from public.quiz_assessments where is_published = true;
revoke all on public.published_quizzes from public;
grant select on public.published_quizzes to anon, authenticated;
grant select on public.quiz_assessments to authenticated;
grant insert, update, delete on public.quiz_assessments to authenticated;

create table if not exists public.quiz_submissions (
  code text primary key check (code ~ '^[A-Z0-9]{6}$'),
  quiz_code text not null references public.quiz_assessments(code) on delete cascade,
  teacher_id uuid not null references auth.users(id) on delete cascade,
  submission_data jsonb not null,
  status text not null default 'Pending' check (status in ('Pending', 'Graded')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists quiz_submissions_teacher_created_idx
  on public.quiz_submissions (teacher_id, created_at desc);
create index if not exists quiz_submissions_quiz_code_idx
  on public.quiz_submissions (quiz_code);
alter table public.quiz_submissions enable row level security;

drop policy if exists "Students submit answers to published quizzes" on public.quiz_submissions;
create policy "Students submit answers to published quizzes" on public.quiz_submissions
  for insert to anon, authenticated with check (
    status = 'Pending'
    and exists (
      select 1 from public.published_quizzes q
      where q.code = quiz_submissions.quiz_code
        and q.teacher_id = quiz_submissions.teacher_id
    )
  );
drop policy if exists "Teachers read submissions for their quizzes" on public.quiz_submissions;
create policy "Teachers read submissions for their quizzes" on public.quiz_submissions
  for select to authenticated using (teacher_id = (select auth.uid()));
drop policy if exists "Teachers grade submissions for their quizzes" on public.quiz_submissions;
create policy "Teachers grade submissions for their quizzes" on public.quiz_submissions
  for update to authenticated using (teacher_id = (select auth.uid()))
  with check (teacher_id = (select auth.uid()));
grant insert on public.quiz_submissions to anon, authenticated;
grant select, update on public.quiz_submissions to authenticated;
