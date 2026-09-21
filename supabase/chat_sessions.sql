create table if not exists public.chat_sessions (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'New chat',
  messages jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.chat_sessions enable row level security;

drop policy if exists "Users can read own chats" on public.chat_sessions;
drop policy if exists "Users can insert own chats" on public.chat_sessions;
drop policy if exists "Users can update own chats" on public.chat_sessions;
drop policy if exists "Users can delete own chats" on public.chat_sessions;

create policy "Users can read own chats" on public.chat_sessions
  for select using (auth.uid() = user_id);

create policy "Users can insert own chats" on public.chat_sessions
  for insert with check (auth.uid() = user_id);

create policy "Users can update own chats" on public.chat_sessions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users can delete own chats" on public.chat_sessions
  for delete using (auth.uid() = user_id);

create index if not exists chat_sessions_user_id_updated_at_idx
  on public.chat_sessions(user_id, updated_at desc);