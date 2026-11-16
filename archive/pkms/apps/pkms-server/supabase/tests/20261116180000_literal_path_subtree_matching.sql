-- Run after `supabase db reset --local --workdir apps/pkms-server` with the same psql command noted in TASKS.md.
-- Path separators define tree membership; SQL LIKE metacharacters in names are literal.
begin;
do $$
declare
  wid text := 'fffffffffffffffffffffffffffef001';
  result jsonb;
begin
  insert into public.pkms_workspaces(workspace_id,owner_login,repository,branch)
    values(wid,'lkh0310kr','lkh0310kr/pkms-literal-path-regression','test');
  insert into public.pkms_files(workspace_id,file_id,path,parent_path,kind,revision,deleted,dirty)
    values
      (wid,'folder-under','a_b','','folder',4,false,false),
      (wid,'sibling-under','axb/child.md','axb','markdown',10,false,true),
      (wid,'folder-percent','100%','','folder',10,false,false),
      (wid,'sibling-percent','100x/child.md','100x','markdown',10,false,true),
      (wid,'folder-move','m_v','','folder',10,false,false),
      (wid,'sibling-move','mZv/child.md','mZv','markdown',10,false,true),
      (wid,'sibling-create','newX/child.md','newX','markdown',10,false,true),
      (wid,'sibling-asset','assetX/child.md','assetX','markdown',10,false,true),
      (wid,'sibling-conflict','collision_XY/child.md','collision_XY','markdown',10,false,true);
  update public.pkms_workspaces set server_revision=10 where workspace_id=wid;

  -- An underscore in the folder name must not turn an unrelated sibling into a stale descendant.
  begin
    result:=public.pkms_apply_operation(
      wid,'ffffffff-ffff-4fff-8fff-ffffffffffe1',9,'sql-test',
      '{"type":"delete","fileId":"folder-under","protectSubtree":true}'::jsonb,null
    );
  exception when sqlstate 'PZ002' then
    raise exception 'literal underscore was treated as a wildcard in the folder delete guard';
  end;
  if exists(select 1 from public.pkms_files where workspace_id=wid and file_id='sibling-under' and deleted) then
    raise exception 'folder delete removed an underscore-matching sibling';
  end if;

  -- A percent sign in a folder name must not delete a similarly prefixed sibling.
  result:=public.pkms_apply_operation(
    wid,'ffffffff-ffff-4fff-8fff-ffffffffffe2',10,'sql-test',
    '{"type":"delete","fileId":"folder-percent","protectSubtree":false}'::jsonb,null
  );
  if not exists(select 1 from public.pkms_files where workspace_id=wid and file_id='sibling-percent' and not deleted) then
    raise exception 'folder delete removed a percent-matching sibling';
  end if;

  -- A wildcard-like source name must still be movable outside its literal subtree.
  begin
    perform public.pkms_apply_operation(
      wid,'ffffffff-ffff-4fff-8fff-ffffffffffe3',10,'sql-test',
      '{"type":"move","fileId":"folder-move","toPath":"mZv/new"}'::jsonb,null
    );
  exception when sqlstate '23514' then
    raise exception 'underscore wildcard falsely rejected a move as recursive';
  end;
  if not exists(select 1 from public.pkms_files where workspace_id=wid and file_id='folder-move' and path='mZv/new' and not deleted) then
    raise exception 'folder move did not preserve the literal destination path';
  end if;

  -- Existing paths below a wildcard-looking sibling must not force a conflict copy.
  result:=public.pkms_apply_operation(
    wid,'ffffffff-ffff-4fff-8fff-ffffffffffe4',10,'sql-test',
    '{"type":"create-folder","path":"new_%","fileId":"folder-new"}'::jsonb,null
  );
  if result ? 'conflictCopyPath' or not exists(
    select 1 from public.pkms_files where workspace_id=wid and path='new_%' and not deleted
  ) then
    raise exception 'create-folder treated percent/underscore as path wildcards: %',result;
  end if;
  if public.pkms_path_is_same_or_descendant('collision_XY/child.md','collision_%') then
    raise exception 'literal subtree helper treated percent/underscore as wildcards';
  end if;

  result:=public.pkms_apply_asset_sync(
    wid,'ffffffff-ffff-4fff-8fff-ffffffffffe5',10,'sql-test',
    'asset_%','asset-new',wid||'/asset-new/'||repeat('a',40),1,repeat('b',40),null
  );
  if result->>'path' is distinct from 'asset_%' or result ? 'conflictCopyPath' then
    raise exception 'asset sync treated percent/underscore as path wildcards: %',result;
  end if;
end;
$$;
rollback;
