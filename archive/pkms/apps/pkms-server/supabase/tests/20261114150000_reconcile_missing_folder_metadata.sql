-- Run against a migrated database with `supabase db query --local -f ...`.
-- The transaction is rolled back and leaves no workspace behind.
begin;
do $$
declare
  wid text := 'fffffffffffffffffffffffffffffffd';
  repaired integer;
  first_result jsonb;
  retry_result jsonb;
  created_id text;
  created_revision bigint;
  revision_before bigint;
  active_count integer;
  loaded boolean;
begin
  insert into public.pkms_workspaces(workspace_id,owner_login,repository,branch)
    values(wid,'lkh0310kr','lkh0310kr/pkms-folder-repair-regression','test');

  -- Existing cloud content can have descendants without parent folder rows.
  insert into public.pkms_files(
    workspace_id,file_id,path,parent_path,kind,content,size,revision,deleted,dirty
  ) values
    (wid,'physics-note','02 physics/mechanics.md','02 physics','markdown','content',7,0,false,false),
    (wid,'electric-note','03 electric/power.md','03 electric','markdown','content',7,0,false,false);
  repaired:=public.pkms_reconcile_missing_folders(wid);
  if repaired<>2 then raise exception 'expected two missing root folders to be repaired, got %',repaired; end if;
  if not exists(select 1 from public.pkms_files where workspace_id=wid and path='02 physics' and parent_path='' and kind='folder' and not deleted) then
    raise exception '02 physics parent folder was not repaired';
  end if;
  if not exists(select 1 from public.pkms_files where workspace_id=wid and path='03 electric' and parent_path='' and kind='folder' and not deleted) then
    raise exception '03 electric parent folder was not repaired';
  end if;
  select d.loaded into loaded from public.pkms_directories d where d.workspace_id=wid and d.path='02 physics';
  if loaded is distinct from true then raise exception 'repaired folder directory is not readable'; end if;

  -- A sync retry for an existing descendant tree backfills its parent; it must
  -- not create a conflict-named folder or duplicate the path.
  insert into public.pkms_files(
    workspace_id,file_id,path,parent_path,kind,content,size,revision,deleted,dirty
  ) values(wid,'chapter-note','04 cs/chapter.md','04 cs','markdown','chapter',7,0,false,false);
  select server_revision into revision_before from public.pkms_workspaces where workspace_id=wid;
  first_result:=public.pkms_create_folder(
    wid,'ffffffff-ffff-4fff-8fff-fffffffffff1',revision_before,'desktop-sync-bridge','04 cs',null
  );
  if first_result->>'path' is distinct from '04 cs' or first_result->>'conflictCopyPath' is not null then
    raise exception 'folder repair produced an unexpected conflict: %',first_result;
  end if;
  created_id:=first_result->>'fileId';
  created_revision:=(first_result->>'acceptedRevision')::bigint;
  if not exists(select 1 from public.pkms_files where workspace_id=wid and file_id=created_id and path='04 cs' and revision=created_revision and kind='folder' and not deleted) then
    raise exception 'created folder is missing from the change feed';
  end if;
  select d.loaded into loaded from public.pkms_directories d where d.workspace_id=wid and d.path='04 cs';
  if loaded is distinct from true then raise exception 'new folder directory is not readable'; end if;
  retry_result:=public.pkms_create_folder(
    wid,'ffffffff-ffff-4fff-8fff-fffffffffff2',created_revision,'desktop-sync-bridge','04 cs',null
  );
  if retry_result->>'noOp' is distinct from 'true' then raise exception 'folder create retry did not converge: %',retry_result; end if;
  select count(*) into active_count from public.pkms_files where workspace_id=wid and path='04 cs' and not deleted;
  if active_count<>1 then raise exception 'folder retry created duplicate path rows (count=%)',active_count; end if;
end;
$$;
rollback;
