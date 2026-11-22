-- Teacher AI workspace, lifetime access grants, device session registry and live exam rooms.
-- All privileged writes are exposed only through SECURITY DEFINER RPCs guarded by is_platform_admin().
create table if not exists public.teacher_ai_lifetime_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  granted_by uuid not null references auth.users(id),
  note text,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id)
);
create unique index if not exists teacher_ai_lifetime_grants_one_active
  on public.teacher_ai_lifetime_grants(user_id) where revoked_at is null;
alter table public.teacher_ai_lifetime_grants enable row level security;
drop policy if exists "Users can view own active AI lifetime grant" on public.teacher_ai_lifetime_grants;
create policy "Users can view own active AI lifetime grant"
  on public.teacher_ai_lifetime_grants for select to authenticated
  using (user_id = (select auth.uid()) or public.is_platform_admin());

create or replace function public.grant_teacher_ai_lifetime(p_email text, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare v_user_id uuid;
begin
  if not public.is_platform_admin() then raise exception 'Admin access required'; end if;
  if p_email is null or length(trim(p_email)) < 5 then raise exception 'A valid teacher email is required'; end if;
  select id into v_user_id from auth.users where lower(email)=lower(trim(p_email)) limit 1;
  if v_user_id is null then raise exception 'Teacher account not found'; end if;
  insert into public.teacher_ai_lifetime_grants(user_id,granted_by,note)
  values(v_user_id,auth.uid(),left(coalesce(p_note,''),500))
  on conflict (user_id) where revoked_at is null do nothing;
  return jsonb_build_object('success',true,'user_id',v_user_id);
end;
$$;

create or replace function public.revoke_teacher_ai_lifetime(p_email text)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare v_user_id uuid;
begin
  if not public.is_platform_admin() then raise exception 'Admin access required'; end if;
  select id into v_user_id from auth.users where lower(email)=lower(trim(p_email)) limit 1;
  if v_user_id is null then raise exception 'Teacher account not found'; end if;
  update public.teacher_ai_lifetime_grants
    set revoked_at=now(),revoked_by=auth.uid()
    where user_id=v_user_id and revoked_at is null;
  return jsonb_build_object('success',true,'user_id',v_user_id);
end;
$$;

create table if not exists public.teacher_device_sessions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  auth_session_id uuid not null,
  device_id text not null,
  device_label text,
  last_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.teacher_device_sessions enable row level security;
drop policy if exists "Teachers can view own device session" on public.teacher_device_sessions;
create policy "Teachers can view own device session"
  on public.teacher_device_sessions for select to authenticated
  using (user_id=(select auth.uid()) or public.is_platform_admin());

create or replace function public.claim_teacher_device(p_device_id text, p_device_label text default null, p_replace boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare v_uid uuid := auth.uid(); v_session uuid; v_existing public.teacher_device_sessions%rowtype;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  v_session := nullif(auth.jwt()->>'session_id','')::uuid;
  if v_session is null then raise exception 'Session identifier missing'; end if;
  if p_device_id is null or length(trim(p_device_id)) < 16 or length(p_device_id)>128 then raise exception 'Invalid device identifier'; end if;
  select * into v_existing from public.teacher_device_sessions where user_id=v_uid for update;
  if found and (v_existing.auth_session_id<>v_session or v_existing.device_id<>p_device_id) and not p_replace then
    return jsonb_build_object('success',false,'conflict',true,'device_label',v_existing.device_label,'last_seen_at',v_existing.last_seen_at);
  end if;
  insert into public.teacher_device_sessions(user_id,auth_session_id,device_id,device_label,last_seen_at,updated_at)
  values(v_uid,v_session,p_device_id,left(coalesce(p_device_label,'Unknown device'),100),now(),now())
  on conflict(user_id) do update set auth_session_id=excluded.auth_session_id,device_id=excluded.device_id,
    device_label=excluded.device_label,last_seen_at=now(),updated_at=now();
  return jsonb_build_object('success',true,'replaced',p_replace);
end;
$$;

create or replace function public.touch_teacher_device(p_device_id text)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare v_uid uuid := auth.uid(); v_session uuid := nullif(auth.jwt()->>'session_id','')::uuid;
begin
  if v_uid is null or v_session is null then return false; end if;
  update public.teacher_device_sessions set last_seen_at=now(),updated_at=now()
   where user_id=v_uid and auth_session_id=v_session and device_id=p_device_id;
  return found;
end;
$$;

create table if not exists public.exam_rooms (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users(id) on delete cascade,
  quiz_code text not null references public.quiz_assessments(code) on delete cascade,
  join_code text not null unique,
  status text not null default 'waiting' check(status in ('waiting','live','ended')),
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists public.exam_room_participants (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.exam_rooms(id) on delete cascade,
  student_name text not null,
  student_code text,
  avatar_path text,
  status text not null default 'joined' check(status in ('joined','in_progress','completed')),
  answers jsonb not null default '{}'::jsonb,
  last_saved_at timestamptz not null default now(),
  submitted_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists exam_room_participants_room_idx on public.exam_room_participants(room_id,created_at);
alter table public.exam_rooms enable row level security;
alter table public.exam_room_participants enable row level security;
drop policy if exists "Teachers manage own exam rooms" on public.exam_rooms;
create policy "Teachers manage own exam rooms" on public.exam_rooms
  for all to authenticated using(teacher_id=(select auth.uid())) with check(teacher_id=(select auth.uid()));
drop policy if exists "Teachers manage own exam participants" on public.exam_room_participants;
create policy "Teachers manage own exam participants" on public.exam_room_participants
  for all to authenticated using(exists(select 1 from public.exam_rooms r where r.id=room_id and r.teacher_id=(select auth.uid())))
  with check(exists(select 1 from public.exam_rooms r where r.id=room_id and r.teacher_id=(select auth.uid())));

create or replace function public.create_exam_room(p_quiz_code text, p_join_code text)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare v_room uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not exists(select 1 from public.quiz_assessments where code=p_quiz_code and teacher_id=auth.uid()) then raise exception 'Quiz not found'; end if;
  if p_join_code !~ '^[A-Z0-9]{6}$' then raise exception 'Invalid join code'; end if;
  insert into public.exam_rooms(teacher_id,quiz_code,join_code) values(auth.uid(),p_quiz_code,p_join_code) returning id into v_room;
  return v_room;
end;
$$;


-- Anonymous students never receive direct table access. They join/save only through
-- narrowly scoped SECURITY DEFINER RPCs using the room's unguessable join code.
create or replace function public.join_exam_room(p_join_code text, p_student_name text, p_student_code text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $
declare v_room public.exam_rooms%rowtype; v_participant uuid;
begin
  if p_student_name is null or length(trim(p_student_name))<2 or length(trim(p_student_name))>100 then
    raise exception 'Enter a valid student name';
  end if;
  select * into v_room from public.exam_rooms where join_code=upper(trim(p_join_code)) and status in ('waiting','live');
  if not found then raise exception 'Exam room not found or closed'; end if;
  insert into public.exam_room_participants(room_id,student_name,student_code,status)
  values(v_room.id,left(trim(p_student_name),100),left(nullif(trim(p_student_code),''),50),'joined')
  returning id into v_participant;
  return jsonb_build_object('participant_id',v_participant,'room_id',v_room.id,'quiz_code',v_room.quiz_code,'status',v_room.status);
end;
$;

create or replace function public.save_exam_room_answers(p_join_code text, p_participant_id uuid, p_answers jsonb, p_submit boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $
declare v_room_id uuid;
begin
  if jsonb_typeof(coalesce(p_answers,'{}'::jsonb))<>'object' or octet_length(coalesce(p_answers,'{}'::jsonb)::text)>50000 then
    raise exception 'Invalid answer payload';
  end if;
  select id into v_room_id from public.exam_rooms
    where join_code=upper(trim(p_join_code)) and status='live';
  if v_room_id is null then raise exception 'Exam is not accepting answers'; end if;
  update public.exam_room_participants set answers=p_answers,
    status=case when p_submit then 'completed' else 'in_progress' end,
    last_saved_at=now(),submitted_at=case when p_submit then now() else null end
    where id=p_participant_id and room_id=v_room_id;
  if not found then raise exception 'Participant not found'; end if;
  return jsonb_build_object('success',true,'saved_at',now(),'status',case when p_submit then 'completed' else 'in_progress' end);
end;
$;

revoke all on function public.join_exam_room(text,text,text) from public;
grant execute on function public.join_exam_room(text,text,text) to anon, authenticated;
revoke all on function public.save_exam_room_answers(text,uuid,jsonb,boolean) from public;
grant execute on function public.save_exam_room_answers(text,uuid,jsonb,boolean) to anon, authenticated;

revoke all on function public.grant_teacher_ai_lifetime(text,text) from public, anon;
grant execute on function public.grant_teacher_ai_lifetime(text,text) to authenticated;
revoke all on function public.revoke_teacher_ai_lifetime(text) from public, anon;
grant execute on function public.revoke_teacher_ai_lifetime(text) to authenticated;
revoke all on function public.claim_teacher_device(text,text,boolean) from public, anon;
grant execute on function public.claim_teacher_device(text,text,boolean) to authenticated;
revoke all on function public.touch_teacher_device(text) from public, anon;
grant execute on function public.touch_teacher_device(text) to authenticated;
revoke all on function public.create_exam_room(text,text) from public, anon;
grant execute on function public.create_exam_room(text,text) to authenticated;
