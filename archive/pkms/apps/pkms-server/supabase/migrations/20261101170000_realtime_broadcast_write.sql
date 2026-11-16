-- The private client channel subscribes to Broadcast and may also publish
-- Presence. Both write paths must be authorized for the owner-scoped topic.
drop policy if exists pkms_owner_can_publish_presence on realtime.messages;
drop policy if exists pkms_owner_can_publish_realtime on realtime.messages;
create policy pkms_owner_can_publish_realtime on realtime.messages for insert to authenticated
  with check (
    auth.jwt()->>'iss' = 'https://pkms-cloud.lkh0310kr.workers.dev'
    and auth.jwt()->'app_metadata'->>'github_login' = 'lkh0310kr'
    and realtime.topic() ~ '^pkms:[0-9a-f]{32}$'
    and extension in ('broadcast','presence')
  );
