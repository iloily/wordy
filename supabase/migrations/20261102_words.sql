-- Wordy's tables in the shared puzzle-apps Supabase project. Everything starts
-- with words_. Only the Wordy app server (service role key) reads or writes:
-- RLS is on with no policies, and the functions aren't callable by anon or
-- signed-in roles.

create table if not exists words_servers (
  server_id text primary key,
  name text not null default '',
  updated_at timestamptz not null default now()
);

create table if not exists words_players (
  user_id text primary key,
  name text not null default '',
  played int not null default 0,
  wins int not null default 0,
  streak int not null default 0,
  best_streak int not null default 0,
  last_day int not null default -1,
  dist int[] not null default '{0,0,0,0,0,0,0}', -- 1..6 guesses, then misses
  total_score int not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists words_members (
  user_id text not null references words_players(user_id) on delete cascade,
  server_id text not null references words_servers(server_id) on delete cascade,
  primary key (user_id, server_id)
);
create index if not exists words_members_server on words_members(server_id);

create table if not exists words_daily (
  day int not null,
  user_id text not null references words_players(user_id) on delete cascade,
  server_id text not null references words_servers(server_id) on delete cascade,
  guesses text[] not null default '{}',
  started_at timestamptz not null default now(),
  done boolean not null default false,
  won boolean not null default false,
  score int not null default 0,
  seconds numeric(8,1) not null default 0,
  primary key (day, user_id)
);
create index if not exists words_daily_board on words_daily(day, done, score, seconds);
create index if not exists words_daily_server on words_daily(server_id);

create table if not exists words_freeplay (
  week int not null,
  user_id text not null references words_players(user_id) on delete cascade,
  wins int not null default 0,
  primary key (week, user_id)
);
create index if not exists words_freeplay_board on words_freeplay(week, wins desc);

alter table words_servers enable row level security;
alter table words_players enable row level security;
alter table words_members enable row level security;
alter table words_daily enable row level security;
alter table words_freeplay enable row level security;

-- player, server and membership rows, kept fresh with the latest names
create or replace function words_touch(p_user text, p_name text, p_server text, p_server_name text)
returns void language sql set search_path = public as $$
  insert into words_servers(server_id, name) values (p_server, p_server_name)
    on conflict (server_id) do update set name = excluded.name, updated_at = now();
  insert into words_players(user_id, name) values (p_user, p_name)
    on conflict (user_id) do update set name = excluded.name, updated_at = now();
  insert into words_members(user_id, server_id) values (p_user, p_server) on conflict do nothing;
$$;

create or replace function words_start_daily(p_day int, p_user text, p_name text, p_server text, p_server_name text, p_started timestamptz)
returns setof words_daily language plpgsql set search_path = public as $$
begin
  perform words_touch(p_user, p_name, p_server, p_server_name);
  insert into words_daily(day, user_id, server_id, started_at) values (p_day, p_user, p_server, p_started)
    on conflict (day, user_id) do nothing;
  return query select * from words_daily where day = p_day and user_id = p_user;
end $$;

-- finishes a daily once and counts it (same rule as applyDaily in backend.ts)
create or replace function words_finish_daily(p_day int, p_user text, p_guesses text[], p_won boolean, p_score int, p_seconds numeric)
returns boolean language plpgsql set search_path = public as $$
declare n int;
begin
  update words_daily set guesses = p_guesses, done = true, won = p_won, score = p_score, seconds = p_seconds
    where day = p_day and user_id = p_user and not done;
  get diagnostics n = row_count;
  if n = 0 then return false; end if;
  update words_players set
    played = played + 1,
    wins = wins + (case when p_won then 1 else 0 end),
    total_score = total_score + p_score,
    dist[least(p_score, 7)] = dist[least(p_score, 7)] + 1,
    streak = case when not p_won then 0 when last_day = p_day - 1 then streak + 1 else 1 end,
    best_streak = greatest(best_streak, case when not p_won then 0 when last_day = p_day - 1 then streak + 1 else 1 end),
    last_day = p_day,
    updated_at = now()
  where user_id = p_user;
  return true;
end $$;

create or replace function words_freeplay_win(p_week int, p_user text, p_name text, p_server text, p_server_name text)
returns void language plpgsql set search_path = public as $$
begin
  perform words_touch(p_user, p_name, p_server, p_server_name);
  insert into words_freeplay(week, user_id, wins) values (p_week, p_user, 1)
    on conflict (week, user_id) do update set wins = words_freeplay.wins + 1;
end $$;

-- every board in one place (same rules as MemoryBackend.board in backend.ts).
-- p_server = null for global, a server id for "this server".
create or replace function words_board(p_kind text, p_server text, p_day int, p_week int, p_limit int)
returns table(rank bigint, id text, name text, server text, value numeric, extra numeric)
language plpgsql stable set search_path = public as $$
begin
  if p_kind = 'today' then
    return query
      select row_number() over (order by d.score, d.seconds), d.user_id, p.name, s.name, d.score::numeric, d.seconds
      from words_daily d join words_players p using (user_id) left join words_servers s on s.server_id = d.server_id
      where d.day = p_day and d.done
        and (p_server is null or exists (select 1 from words_members m where m.user_id = d.user_id and m.server_id = p_server))
      order by d.score, d.seconds limit p_limit;
  elsif p_kind = 'streaks' then
    return query
      select row_number() over (order by p.streak desc, p.best_streak desc), p.user_id, p.name, null::text, p.streak::numeric, p.best_streak::numeric
      from words_players p
      where p.streak > 0 and p.last_day >= p_day - 1
        and (p_server is null or exists (select 1 from words_members m where m.user_id = p.user_id and m.server_id = p_server))
      order by p.streak desc, p.best_streak desc limit p_limit;
  elsif p_kind = 'alltime' then
    return query
      select row_number() over (order by round(p.total_score::numeric / p.played, 2), p.played desc), p.user_id, p.name, null::text,
             round(p.total_score::numeric / p.played, 2), p.played::numeric
      from words_players p
      where p.played >= 10
        and (p_server is null or exists (select 1 from words_members m where m.user_id = p.user_id and m.server_id = p_server))
      order by round(p.total_score::numeric / p.played, 2), p.played desc limit p_limit;
  elsif p_kind = 'freeplay' then
    return query
      select row_number() over (order by f.wins desc), f.user_id, p.name, null::text, f.wins::numeric, 0::numeric
      from words_freeplay f join words_players p using (user_id)
      where f.week = p_week
        and (p_server is null or exists (select 1 from words_members m where m.user_id = f.user_id and m.server_id = p_server))
      order by f.wins desc limit p_limit;
  elsif p_kind = 'servers' then
    return query
      with ranked as (
        select d.server_id, d.score, row_number() over (partition by d.server_id order by d.score) as n,
               count(*) over (partition by d.server_id) as players
        from words_daily d where d.day = p_day and d.done
      ), agg as (
        select r.server_id, round(avg(r.score), 2) as avg_score, max(r.players) as players
        from ranked r where r.n <= 10 group by r.server_id having max(r.players) >= 3
      )
      select row_number() over (order by a.avg_score, a.players desc), a.server_id, coalesce(s.name, 'a server'), null::text, a.avg_score, a.players::numeric
      from agg a left join words_servers s using (server_id)
      order by a.avg_score, a.players desc limit p_limit;
  end if;
end $$;

revoke all on function words_touch(text, text, text, text) from public, anon, authenticated;
revoke all on function words_start_daily(int, text, text, text, text, timestamptz) from public, anon, authenticated;
revoke all on function words_finish_daily(int, text, text[], boolean, int, numeric) from public, anon, authenticated;
revoke all on function words_freeplay_win(int, text, text, text, text) from public, anon, authenticated;
revoke all on function words_board(text, text, int, int, int) from public, anon, authenticated;
grant execute on function words_start_daily(int, text, text, text, text, timestamptz) to service_role;
grant execute on function words_finish_daily(int, text, text[], boolean, int, numeric) to service_role;
grant execute on function words_freeplay_win(int, text, text, text, text) to service_role;
grant execute on function words_board(text, text, int, int, int) to service_role;
grant execute on function words_touch(text, text, text, text) to service_role;
