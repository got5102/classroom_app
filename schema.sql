create extension if not exists "pgcrypto";

create table groups (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null,
  name text not null
);

create table users (
  id uuid primary key default gen_random_uuid(),
  username text unique not null,
  password_hash text not null,
  role text check (role in ('teacher','student')) not null,
  group_id uuid references groups(id)
);

create table assignments (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references groups(id),
  title text,
  description text
);

create table testcases (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid references assignments(id),
  kind text check (kind in ('text','file')) not null,
  input_text text,
  output_text text,
  input_path text,
  output_path text
);

create table submissions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid references assignments(id),
  student_id uuid references users(id),
  language text,
  score int,
  passed int,
  total_tests int,
  submitted_at timestamptz default now()
);
