-- Realtime authorization runs during every private-channel join. Keep the policy
-- independent from workspace-table RLS and constrain it to the single account
-- and PKMS topic namespace used by this application.
drop policy if exists pkms_owner_can_receive_realtime on realtime.messages;
create policy pkms_owner_can_receive_realtime on realtime.messages for select to authenticated
  using (
    auth.jwt()->>'iss' = 'https://pkms-cloud.lkh0310kr.workers.dev'
    and auth.jwt()->'app_metadata'->>'github_login' = 'lkh0310kr'
    and realtime.topic() ~ '^pkms:[0-9a-f]{32}$'
    and extension in ('broadcast','presence')
  );

drop policy if exists pkms_owner_can_publish_presence on realtime.messages;
create policy pkms_owner_can_publish_presence on realtime.messages for insert to authenticated
  with check (
    auth.jwt()->>'iss' = 'https://pkms-cloud.lkh0310kr.workers.dev'
    and auth.jwt()->'app_metadata'->>'github_login' = 'lkh0310kr'
    and realtime.topic() ~ '^pkms:[0-9a-f]{32}$'
    and extension = 'presence'
  );
