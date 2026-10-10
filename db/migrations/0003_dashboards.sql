-- Dashboards, designer login, review state, rubric apply tracking, Cal.com booking link.

alter table designers add column access_token_hash text;

alter table leads add column calcom_booking_uid text;
alter table leads add column email_sent_at timestamptz;

-- Compliance entries are reviewed, not converted or deleted.
alter table review_queue drop constraint review_queue_state_check;
alter table review_queue add constraint review_queue_state_check
  check (state in ('pending', 'deleted', 'converted', 'reviewed'));

alter table rubric_proposals add column applied_at timestamptz;
alter table rubric_proposals add column proposed_text text;
