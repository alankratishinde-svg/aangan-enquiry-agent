-- Post-call processing: compliance flags, raw webhook inbox, review kinds.

alter table calls
  add column price_spoken             boolean not null default false,
  add column booking_before_qualified boolean not null default false,
  add column summary                  text,
  add column entities                 jsonb   not null default '{}'::jsonb,
  -- price evidence, booking turns, agent/classifier mismatch, HubSpot errors
  add column flags                    jsonb   not null default '{}'::jsonb,
  add column recording_url            text;
create index calls_price_spoken_idx on calls (started_at desc) where price_spoken;
create index calls_booking_flag_idx on calls (started_at desc) where booking_before_qualified;

-- 'unqualified': a caller the classifier declined. 'compliance': a call flagged for what the agent did.
alter table review_queue
  add column kind text not null default 'unqualified' check (kind in ('unqualified', 'compliance'));

-- Every webhook body is stored first, so nothing is lost if processing fails.
create table webhook_events (
  id             uuid primary key default gen_random_uuid(),
  vaani_call_id  text,
  event          text not null,
  payload        jsonb not null,
  state          text not null default 'received' check (state in ('received', 'processed', 'failed', 'ignored')),
  error          text,
  attempts       integer not null default 0,
  received_at    timestamptz not null default now(),
  processed_at   timestamptz
);
create index webhook_events_state_idx on webhook_events (state, received_at);
create index webhook_events_call_idx on webhook_events (vaani_call_id);
alter table webhook_events enable row level security;
