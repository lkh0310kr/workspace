-- Realtime authorization already verifies this worker's ES256 signing key.
-- Keep authorization scoped to the PKMS owner and matching workspace, while
-- avoiding a second issuer predicate in the `realtime.messages` policy path.
drop policy if exists pkms_owner_can_read_workspace on public.pkms_workspaces;
create policy pkms_owner_can_read_workspace on public.pkms_workspaces for select to authenticated
  using (
    owner_login = 'lkh0310kr'
    and auth.jwt()->'app_metadata'->>'github_login' = 'lkh0310kr'
  );

drop policy if exists pkms_owner_can_receive_realtime on realtime.messages;
create policy pkms_owner_can_receive_realtime on realtime.messages for select to authenticated
  using (
    extension in ('broadcast','presence')
    and auth.jwt()->'app_metadata'->>'github_login' = 'lkh0310kr'
    and exists(select 1 from public.pkms_workspaces w
      where w.workspace_id = split_part(realtime.topic(),':',2) and w.owner_login = 'lkh0310kr')
  );

drop policy if exists pkms_owner_can_publish_presence on realtime.messages;
create policy pkms_owner_can_publish_presence on realtime.messages for insert to authenticated
  with check (
    extension = 'presence'
    and auth.jwt()->'app_metadata'->>'github_login' = 'lkh0310kr'
    and exists(select 1 from public.pkms_workspaces w
      where w.workspace_id = split_part(realtime.topic(),':',2) and w.owner_login = 'lkh0310kr')
  );
