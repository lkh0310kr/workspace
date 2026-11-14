-- Folder rows are part of the PKMS tree contract. Older folder-sync passes
-- could cache local directory inventory without creating the matching cloud
-- folder row, leaving documents present but unreachable from the web tree.
create or replace function public.pkms_reconcile_missing_folders(p_workspace_id text)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  w public.pkms_workspaces%rowtype;
  v_revision bigint;
  v_created integer := 0;
begin
  select * into w from public.pkms_workspaces where workspace_id=p_workspace_id for update;
  if not found then raise exception using errcode='P0002',message='workspace_not_found'; end if;
  v_revision:=w.server_revision+1;

  with recursive ancestors(path) as (
    select public.pkms_path_parent(f.path)
      from public.pkms_files f
      where f.workspace_id=p_workspace_id and not f.deleted and f.path<>''
    union
    select public.pkms_path_parent(a.path) from ancestors a where a.path<>''
  ), missing(path) as (
    select distinct a.path
      from ancestors a
      where a.path<>''
        and not exists (
          select 1 from public.pkms_files f
          where f.workspace_id=p_workspace_id and f.path=a.path and not f.deleted
        )
  ), inserted as (
    insert into public.pkms_files(
      workspace_id,file_id,path,parent_path,kind,size,revision,deleted,dirty
    )
    select p_workspace_id,
      case when exists (
        select 1 from public.pkms_files old
        where old.workspace_id=p_workspace_id and old.file_id='folder-'||m.path
      ) then gen_random_uuid()::text else 'folder-'||m.path end,
      m.path,public.pkms_path_parent(m.path),'folder',0,v_revision,false,false
    from missing m
    order by length(m.path),m.path
    on conflict do nothing
    returning path,parent_path
  ), dirs as (
    insert into public.pkms_directories(workspace_id,path,tree_sha,loaded)
    select p_workspace_id,i.path,'',true from inserted i
    on conflict (workspace_id,path) do update set loaded=true
    returning path
  )
  select count(*) into v_created from inserted;

  if v_created>0 then
    update public.pkms_workspaces
      set server_revision=v_revision,updated_at=now()
      where workspace_id=p_workspace_id;
  end if;
  return v_created;
end;
$$;
revoke all on function public.pkms_reconcile_missing_folders(text) from public,anon,authenticated;
grant execute on function public.pkms_reconcile_missing_folders(text) to service_role;

-- Run the repair once for existing workspaces. It inserts only missing parent
-- folder metadata inferred from active file paths; it does not move/delete files.
do $$
declare
  wid text;
begin
  for wid in select workspace_id from public.pkms_workspaces loop
    perform public.pkms_reconcile_missing_folders(wid);
  end loop;
end;
$$;

-- Folder creation is idempotent when descendants already exist but the folder
-- row does not. Such descendants prove the path is a directory; they are not a
-- name collision and must not be diverted into a conflict folder.
create or replace function public.pkms_create_folder(
  p_workspace_id text,
  p_operation_id uuid,
  p_base_revision bigint,
  p_client_id text,
  p_path text,
  p_file_id text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  w public.pkms_workspaces%rowtype;
  prior public.pkms_operations%rowtype;
  existing public.pkms_files%rowtype;
  v_path text := p_path;
  v_parent text;
  v_file_id text;
  v_parent_id text;
  v_conflict text;
  v_revision bigint;
  v_result jsonb;
  v_created_paths text[] := array[]::text[];
begin
  select * into w from public.pkms_workspaces where workspace_id=p_workspace_id for update;
  if not found then raise exception using errcode='P0002',message='workspace_not_found'; end if;
  select * into prior from public.pkms_operations
    where workspace_id=p_workspace_id and operation_id=p_operation_id;
  if found then return prior.result || jsonb_build_object('duplicate',true); end if;
  if v_path is null or not public.pkms_path_is_valid(v_path) then
    raise exception using errcode='22023',message='invalid_path';
  end if;

  select * into existing from public.pkms_files
    where workspace_id=p_workspace_id and path=v_path and not deleted for update;
  if found and existing.kind='folder' then
    v_result:=jsonb_build_object(
      'operationId',p_operation_id,'acceptedRevision',w.server_revision,
      'duplicate',false,'noOp',true,'fileId',existing.file_id,
      'path',existing.path,'revision',existing.revision
    );
    insert into public.pkms_operations(workspace_id,operation_id,revision,result)
      values(p_workspace_id,p_operation_id,w.server_revision,v_result);
    return v_result;
  end if;
  if found then
    v_conflict:=public.pkms_unique_conflict_path(p_workspace_id,v_path,p_client_id);
    v_path:=v_conflict;
  end if;

  v_parent:=public.pkms_path_parent(v_path);
  while v_parent<>'' loop
    select * into existing from public.pkms_files
      where workspace_id=p_workspace_id and path=v_parent and not deleted for update;
    if found and existing.kind<>'folder' then
      raise exception using errcode='23514',message='path_conflict';
    elsif not found then
      v_parent_id:='folder-'||v_parent;
      if exists (
        select 1 from public.pkms_files
        where workspace_id=p_workspace_id and file_id=v_parent_id
      ) then v_parent_id:=gen_random_uuid()::text; end if;
      insert into public.pkms_files(
        workspace_id,file_id,path,parent_path,kind,size,revision,deleted,dirty
      ) values (
        p_workspace_id,v_parent_id,v_parent,public.pkms_path_parent(v_parent),
        'folder',0,0,false,true
      );
      insert into public.pkms_directories(workspace_id,path,tree_sha,loaded)
        values(p_workspace_id,v_parent,'',true)
        on conflict (workspace_id,path) do update set loaded=true;
      v_created_paths:=array_append(v_created_paths,v_parent);
    end if;
    v_parent:=public.pkms_path_parent(v_parent);
  end loop;

  v_file_id:=coalesce(nullif(p_file_id,''),'folder-'||v_path);
  if exists (
    select 1 from public.pkms_files
    where workspace_id=p_workspace_id and file_id=v_file_id
      and (path<>v_path or deleted)
  ) then v_file_id:=gen_random_uuid()::text; end if;
  insert into public.pkms_files(
    workspace_id,file_id,path,parent_path,kind,size,revision,deleted,dirty
  ) values (
    p_workspace_id,v_file_id,v_path,public.pkms_path_parent(v_path),
    'folder',0,0,false,true
  );
  insert into public.pkms_directories(workspace_id,path,tree_sha,loaded)
    values(p_workspace_id,v_path,'',true)
    on conflict (workspace_id,path) do update set loaded=true;
  v_created_paths:=array_append(v_created_paths,v_path);

  v_revision:=w.server_revision+1;
  update public.pkms_files set revision=v_revision,updated_at=now()
    where workspace_id=p_workspace_id and path=any(v_created_paths) and not deleted;
  update public.pkms_workspaces set server_revision=v_revision,github_status='pending',
    github_message=null,flush_due_at=coalesce(flush_due_at,now()+interval '15 minutes'),
    updated_at=now()
    where workspace_id=p_workspace_id;
  v_result:=jsonb_build_object(
    'operationId',p_operation_id,'acceptedRevision',v_revision,
    'duplicate',false,'fileId',v_file_id,'path',v_path,'revision',v_revision
  ) || case when v_conflict is not null then jsonb_build_object('conflictCopyPath',v_conflict) else '{}'::jsonb end
    || case when p_base_revision<v_revision-1 then jsonb_build_object('rebasedFrom',p_base_revision) else '{}'::jsonb end;
  insert into public.pkms_operations(workspace_id,operation_id,revision,result)
    values(p_workspace_id,p_operation_id,v_revision,v_result);
  return v_result;
end;
$$;
revoke all on function public.pkms_create_folder(text,uuid,bigint,text,text,text) from public,anon,authenticated;
grant execute on function public.pkms_create_folder(text,uuid,bigint,text,text,text) to service_role;
