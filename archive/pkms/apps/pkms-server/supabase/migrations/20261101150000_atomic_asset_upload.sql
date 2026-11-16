create or replace function public.pkms_apply_asset_upload(
  p_workspace_id text,
  p_operation_id uuid,
  p_base_revision bigint,
  p_client_id text,
  p_path text,
  p_file_id text,
  p_object_key text,
  p_size bigint
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  w public.pkms_workspaces%rowtype;
  prior public.pkms_operations%rowtype;
  v_path text := p_path;
  v_parent text;
  v_revision bigint;
  v_conflict text;
  v_result jsonb;
begin
  if not public.pkms_path_is_valid(p_path) or p_size < 0 or p_size > 52428800
    or length(p_file_id) not between 1 and 128
    or p_object_key <> p_workspace_id || '/' || p_file_id then
    raise exception using errcode='22023',message='invalid_asset_upload';
  end if;
  select * into w from public.pkms_workspaces where workspace_id=p_workspace_id for update;
  if not found then raise exception using errcode='P0002',message='workspace_not_found'; end if;
  select * into prior from public.pkms_operations where workspace_id=p_workspace_id and operation_id=p_operation_id;
  if found then return prior.result || jsonb_build_object('duplicate',true); end if;
  if exists(select 1 from public.pkms_files where workspace_id=p_workspace_id and not deleted and (path=v_path or path like v_path||'/%')) then
    v_conflict:=public.pkms_unique_conflict_path(p_workspace_id,v_path,p_client_id);
    v_path:=v_conflict;
  end if;
  v_parent:=public.pkms_path_parent(v_path);
  while v_parent<>'' loop
    if not exists(select 1 from public.pkms_files where workspace_id=p_workspace_id and path=v_parent and not deleted) then
      insert into public.pkms_files(workspace_id,file_id,path,parent_path,kind,revision,deleted,dirty)
        values(p_workspace_id,'folder-'||v_parent,v_parent,public.pkms_path_parent(v_parent),'folder',0,false,true)
        on conflict(workspace_id,file_id) do update set path=excluded.path,parent_path=excluded.parent_path,deleted=false,dirty=true;
      insert into public.pkms_directories(workspace_id,path,tree_sha,loaded)
        values(p_workspace_id,v_parent,'',true) on conflict do nothing;
    end if;
    v_parent:=public.pkms_path_parent(v_parent);
  end loop;
  v_revision:=w.server_revision+1;
  insert into public.pkms_files(workspace_id,file_id,path,parent_path,kind,object_key,size,revision,deleted,dirty)
    values(p_workspace_id,p_file_id,v_path,public.pkms_path_parent(v_path),'asset',p_object_key,p_size,v_revision,false,true);
  v_result:=jsonb_build_object('operationId',p_operation_id,'acceptedRevision',v_revision,'duplicate',false,'fileId',p_file_id)
    ||case when v_conflict is not null then jsonb_build_object('conflictCopyPath',v_conflict) else '{}'::jsonb end;
  insert into public.pkms_operations(workspace_id,operation_id,revision,result) values(p_workspace_id,p_operation_id,v_revision,v_result);
  update public.pkms_workspaces set server_revision=v_revision,github_status='pending',github_message=null,
    flush_due_at=coalesce(flush_due_at,now()+interval '15 minutes'),updated_at=now() where workspace_id=p_workspace_id;
  return v_result;
end;
$$;
revoke all on function public.pkms_apply_asset_upload(text,uuid,bigint,text,text,text,text,bigint) from public,anon,authenticated;
grant execute on function public.pkms_apply_asset_upload(text,uuid,bigint,text,text,text,text,bigint) to service_role;
