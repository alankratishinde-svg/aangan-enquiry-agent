-- Aangan Studio phone-enquiry agent: initial schema for Neon Postgres.
-- Plain Postgres only. The Next.js backend connects as the database owner and
-- scopes each designer to their own leads in application code.

-- gen_random_uuid() is built in since Postgres 13.

-- designers --------------------------------------------------------------
create table designers (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  email              text not null unique,
  google_calendar_id text not null,
  auth_user_id       text unique, -- id from the dashboard login provider, set when designer logins are built
  active             boolean not null default true,
  created_at         timestamptz not null default now()
);

-- calls ------------------------------------------------------------------
create table calls (
  id               uuid primary key default gen_random_uuid(),
  vaani_call_id    text not null unique,
  started_at       timestamptz not null,
  ended_at         timestamptz,
  caller_number    text,
  status           text not null check (status in ('qualified', 'unqualified', 'failed')),
  transcript       text,
  answers          jsonb not null default '{}'::jsonb,
  verdict          jsonb,
  response_seconds integer check (response_seconds is null or response_seconds >= 0),
  is_after_hours   boolean not null default false,
  failure_reason   text,
  -- failed-call callback tracking (1 hour target)
  callback_due_at  timestamptz,
  called_back_at   timestamptz,
  created_at       timestamptz not null default now(),
  check (status <> 'failed' or failure_reason is not null)
);
create index calls_status_started_idx on calls (status, started_at desc);
create index calls_started_idx on calls (started_at desc);
create index calls_callback_pending_idx on calls (callback_due_at)
  where status = 'failed' and called_back_at is null;

-- leads ------------------------------------------------------------------
create table leads (
  id                    uuid primary key default gen_random_uuid(),
  call_id               uuid not null references calls (id) on delete cascade,
  name                  text,
  phone                 text,
  email                 text, -- nullable: unqualified callers are never asked for it
  project_type          text,
  area_sq_ft            integer check (area_sq_ft is null or area_sq_ft > 0),
  location              text,
  needed_by             date,
  summary               text,
  add_on_tips           jsonb not null default '[]'::jsonb,
  client_size           text,
  internal_estimate     jsonb, -- internal, indicative only, not for the client
  handoff_notes         jsonb not null default '[]'::jsonb,
  assigned_designer_id  uuid references designers (id),
  booked_slot           timestamptz,
  hubspot_deal_id       text,
  created_at            timestamptz not null default now(),
  -- a converted lead cannot be assigned until the front desk has collected an email
  check (assigned_designer_id is null or email is not null)
);
create index leads_call_idx on leads (call_id);
create index leads_designer_idx on leads (assigned_designer_id, booked_slot);

-- requirements (progress meter checklist) --------------------------------
create table requirements (
  id        uuid primary key default gen_random_uuid(),
  lead_id   uuid not null references leads (id) on delete cascade,
  item      text not null,
  delivered boolean not null default false
);
create index requirements_lead_idx on requirements (lead_id);

-- review_queue (front desk) ----------------------------------------------
create table review_queue (
  id         uuid primary key default gen_random_uuid(),
  lead_id    uuid not null references leads (id) on delete cascade,
  reasons    jsonb not null default '[]'::jsonb,
  state      text not null default 'pending' check (state in ('pending', 'deleted', 'converted')),
  decided_by text,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  check (state = 'pending' or decided_at is not null)
);
create index review_queue_state_idx on review_queue (state, created_at desc);
create unique index review_queue_one_per_lead_idx on review_queue (lead_id);

-- decisions (feeds rubric review) ----------------------------------------
-- lead_id has no cascade: a decision row must outlive a deleted lead.
create table decisions (
  id               uuid primary key default gen_random_uuid(),
  lead_id          uuid,
  action           text not null,
  original_verdict text,
  final_outcome    text,
  decided_by       text,
  decided_at       timestamptz not null default now()
);
create index decisions_decided_idx on decisions (decided_at desc);
create index decisions_lead_idx on decisions (lead_id);

-- rubric_proposals -------------------------------------------------------
create table rubric_proposals (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  diff       text not null,
  rationale  text not null,
  state      text not null default 'pending' check (state in ('pending', 'approved', 'rejected')),
  decided_by text,
  decided_at timestamptz
);
create index rubric_proposals_state_idx on rubric_proposals (state, created_at desc);

-- weekly_summaries -------------------------------------------------------
create table weekly_summaries (
  id                  uuid primary key default gen_random_uuid(),
  week_start          date not null unique,
  counts              jsonb not null default '{}'::jsonb,
  improvement_summary text,
  created_at          timestamptz not null default now()
);

-- Row level security ----------------------------------------------------
-- Enabled with no policies: any role other than the table owner (for example a
-- read-only reporting role added later) sees nothing until a policy grants access.
alter table designers        enable row level security;
alter table calls            enable row level security;
alter table leads            enable row level security;
alter table requirements     enable row level security;
alter table review_queue     enable row level security;
alter table decisions        enable row level security;
alter table rubric_proposals enable row level security;
alter table weekly_summaries enable row level security;
