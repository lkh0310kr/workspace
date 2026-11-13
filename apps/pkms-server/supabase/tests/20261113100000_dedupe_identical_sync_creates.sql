-- Run against a migrated database with `supabase db query --local -f ...`.
-- All rows are rolled back; this test does not leave a workspace behind.
begin;
do $$
declare
  wid text := 'fffffffffffffffffffffffffffffffe';
  first_result jsonb;
  retry_result jsonb;
  changed_result jsonb;
  active_count integer;
  original_content text;
  conflict_content text;
begin
  insert into public.pkms_workspaces(workspace_id,owner_login,repository,branch)
    values(wid,'lkh0310kr','lkh0310kr/pkms-sync-regression','test');

  insert into public.pkms_files(workspace_id,file_id,path,parent_path,kind,content,size,revision,deleted,dirty)
    values(wid,'original','notes.md','','markdown','same bytes',10,7,false,true);
  insert into public.pkms_documents(workspace_id,file_id,state_update_b64)
    values(wid,'original','AA==');

  first_result:=public.pkms_apply_operation(
    wid,'ffffffff-ffff-4fff-8fff-fffffffffff1',0,'desktop-sync-bridge',
    '{"type":"create-file","path":"notes.md","fileId":"retry-copy","content":"same bytes"}'::jsonb,'AA=='
  );
  if first_result->>'noOp' is distinct from 'true' or first_result->>'fileId' is distinct from 'original' then
    raise exception 'same-content create did not acknowledge existing file: %',first_result;
  end if;
  select count(*) into active_count from public.pkms_files where workspace_id=wid and not deleted;
  if active_count<>1 then raise exception 'same-content create created another file (count=%)',active_count; end if;

  retry_result:=public.pkms_apply_operation(
    wid,'ffffffff-ffff-4fff-8fff-fffffffffff1',0,'desktop-sync-bridge',
    '{"type":"create-file","path":"notes.md","fileId":"retry-copy","content":"same bytes"}'::jsonb,'AA=='
  );
  if retry_result->>'duplicate' is distinct from 'true' then raise exception 'retry was not idempotent: %',retry_result; end if;

  changed_result:=public.pkms_apply_operation(
    wid,'ffffffff-ffff-4fff-8fff-fffffffffff2',0,'desktop-sync-bridge',
    '{"type":"create-file","path":"notes.md","fileId":"changed-copy","content":"different bytes"}'::jsonb,'AA=='
  );
  if changed_result->>'conflictCopyPath' is null then raise exception 'different content did not receive a conflict path: %',changed_result; end if;
  select content into original_content from public.pkms_files where workspace_id=wid and file_id='original' and not deleted;
  select content into conflict_content from public.pkms_files where workspace_id=wid and file_id='changed-copy' and not deleted;
  if original_content<>'same bytes' or conflict_content<>'different bytes' then
    raise exception 'different-content collision lost content (original %, conflict %)',original_content,conflict_content;
  end if;

  first_result:=public.pkms_apply_operation(
    wid,'ffffffff-ffff-4fff-8fff-fffffffffff3',0,'desktop-sync-bridge',
    '{"type":"create-folder","path":"empty","fileId":"folder-empty"}'::jsonb,null
  );
  retry_result:=public.pkms_apply_operation(
    wid,'ffffffff-ffff-4fff-8fff-fffffffffff4',1,'desktop-sync-bridge',
    '{"type":"create-folder","path":"empty","fileId":"folder-empty-retry"}'::jsonb,null
  );
  if retry_result->>'noOp' is distinct from 'true' then raise exception 'same-folder create did not converge: %',retry_result; end if;
  select count(*) into active_count from public.pkms_files where workspace_id=wid and path='empty' and not deleted;
  if active_count<>1 then raise exception 'same-folder create created another folder (count=%)',active_count; end if;
end;
$$;
rollback;
