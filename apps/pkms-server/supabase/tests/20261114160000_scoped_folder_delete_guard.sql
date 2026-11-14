-- Folder delete ignores unrelated workspace revisions but rejects changes
-- inside the target subtree after the caller's observed revision.
begin;
do $$
declare
  wid text := 'fffffffffffffffffffffffffffffffd';
  result jsonb;
begin
  insert into public.pkms_workspaces(workspace_id,owner_login,repository,branch)
    values(wid,'lkh0310kr','lkh0310kr/pkms-folder-delete-regression','test');
  insert into public.pkms_files(workspace_id,file_id,path,parent_path,kind,revision,deleted,dirty)
    values
      (wid,'folder-target','02 physics','','folder',4,false,false),
      (wid,'note-target','02 physics/mechanics.md','02 physics','markdown',7,false,true),
      (wid,'unrelated','other.md','','markdown',10,false,true);
  update public.pkms_workspaces set server_revision=10 where workspace_id=wid;

  -- The global revision is 10, but the target subtree has not changed after 7.
  result:=public.pkms_apply_operation(
    wid,'ffffffff-ffff-4fff-8fff-fffffffffff1',7,'web-test',
    '{"type":"delete","fileId":"folder-target","protectSubtree":true}'::jsonb,null
  );
  if result->>'acceptedRevision' is distinct from '11' then
    raise exception 'folder delete was rejected by an unrelated workspace mutation: %',result;
  end if;
  if exists(select 1 from public.pkms_files where workspace_id=wid and path like '02 physics%' and not deleted) then
    raise exception 'folder delete left active subtree rows';
  end if;

  insert into public.pkms_files(workspace_id,file_id,path,parent_path,kind,revision,deleted,dirty)
    values
      (wid,'folder-stale','stale','','folder',11,false,false),
      (wid,'note-stale','stale/new.md','stale','markdown',12,false,true);
  update public.pkms_workspaces set server_revision=12 where workspace_id=wid;
  begin
    perform public.pkms_apply_operation(
      wid,'ffffffff-ffff-4fff-8fff-fffffffffff2',11,'web-test',
      '{"type":"delete","fileId":"folder-stale","protectSubtree":true}'::jsonb,null
    );
    raise exception 'folder delete accepted a changed subtree';
  exception when sqlstate 'PZ002' then
    null;
  end;
end;
$$;
rollback;
