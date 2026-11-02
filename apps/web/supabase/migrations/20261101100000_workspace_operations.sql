create or replace function public.pkms_path_parent(p_path text)
returns text language sql immutable set search_path = '' as $$
  select case when strpos(reverse(p_path),'/')=0 then ''
    else left(p_path,length(p_path)-strpos(reverse(p_path),'/')) end;
$$;

create or replace function public.pkms_path_is_valid(p_path text)
returns boolean language sql immutable set search_path = '' as $$
  select length(p_path) between 1 and 1024 and p_path !~ '^/' and strpos(p_path, chr(92))=0
    and p_path !~ '(^|/)\.\.?(/|$)' and p_path !~ '(^|/)(/|$)'
    and p_path !~ '[[:cntrl:]]';
$$;

create or replace function public.pkms_unique_conflict_path(p_workspace_id text,p_path text,p_client_id text)
returns text language plpgsql stable security definer set search_path = '' as $$
declare
  v_suffix text := ' (conflict '||left(regexp_replace(coalesce(p_client_id,'offline'),'[^A-Za-z0-9_-]','','g'),8)||')';
  v_slash integer := length(p_path)-strpos(reverse(p_path),'/')+1;
  v_dot integer := strpos(reverse(p_path),'.');
  v_stem text;
  v_ext text := '';
  v_candidate text;
  v_n integer := 2;
begin
  if v_dot>0 and (v_slash=0 or v_dot<length(p_path)-v_slash+1) then
    v_stem:=left(p_path,length(p_path)-v_dot);
    v_ext:=right(p_path,v_dot);
  else v_stem:=p_path;
  end if;
  v_candidate:=v_stem||v_suffix||v_ext;
  while exists(select 1 from public.pkms_files where workspace_id=p_workspace_id and not deleted and (path=v_candidate or path like v_candidate||'/%')) loop
    v_candidate:=v_stem||' (conflict '||left(regexp_replace(coalesce(p_client_id,'offline'),'[^A-Za-z0-9_-]','','g'),5)||'-'||v_n||')'||v_ext;
    v_n:=v_n+1;
  end loop;
  return v_candidate;
end;
$$;

create or replace function public.pkms_initialize_workspace(
  p_workspace_id text,p_owner_login text,p_repository text,p_branch text,p_head text,p_tree_sha text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare w public.pkms_workspaces%rowtype;
begin
  if lower(p_owner_login)<>'lkh0310kr' then raise exception using errcode='42501',message='account_not_allowed'; end if;
  insert into public.pkms_workspaces(workspace_id,owner_login,repository,branch,github_status,github_head,github_message)
    values(p_workspace_id,lower(p_owner_login),p_repository,p_branch,'synced',p_head,null)
    on conflict(workspace_id) do update set owner_login=excluded.owner_login,repository=excluded.repository,branch=excluded.branch;
  insert into public.pkms_directories(workspace_id,path,tree_sha,loaded)
    values(p_workspace_id,'',p_tree_sha,false)
    on conflict(workspace_id,path) do update set tree_sha=excluded.tree_sha;
  select * into w from public.pkms_workspaces where workspace_id=p_workspace_id;
  return jsonb_build_object('workspaceId',w.workspace_id,'repository',w.repository,'branch',w.branch,
    'serverRevision',w.server_revision,'githubStatus',w.github_status,'githubHead',w.github_head);
end;
$$;

create or replace function public.pkms_apply_operation(
  p_workspace_id text,p_operation_id uuid,p_base_revision bigint,p_client_id text,p_operation jsonb,p_initial_state_b64 text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  w public.pkms_workspaces%rowtype;
  prior public.pkms_operations%rowtype;
  f public.pkms_files%rowtype;
  v_type text := p_operation->>'type';
  v_path text;
  v_target text;
  v_dest text;
  v_file_id text;
  v_revision bigint;
  v_conflict text;
  v_result jsonb;
  v_parent text;
  v_dir public.pkms_directories%rowtype;
begin
  select * into w from public.pkms_workspaces where workspace_id=p_workspace_id for update;
  if not found then raise exception using errcode='P0002',message='workspace_not_found'; end if;
  select * into prior from public.pkms_operations where workspace_id=p_workspace_id and operation_id=p_operation_id;
  if found then return prior.result || jsonb_build_object('duplicate',true); end if;

  if v_type in ('create-folder','create-file') then
    v_path:=p_operation->>'path';
    if not public.pkms_path_is_valid(v_path) then raise exception using errcode='22023',message='invalid_path'; end if;
    if exists(select 1 from public.pkms_files where workspace_id=p_workspace_id and not deleted and (path=v_path or path like v_path||'/%')) then
      v_conflict:=public.pkms_unique_conflict_path(p_workspace_id,v_path,p_client_id);
      v_path:=v_conflict;
    end if;
    v_file_id:=coalesce(nullif(p_operation->>'fileId',''),case when v_type='create-folder' then 'folder-'||v_path else gen_random_uuid()::text end);
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
    insert into public.pkms_files(workspace_id,file_id,path,parent_path,kind,content,size,revision,deleted,dirty)
      values(p_workspace_id,v_file_id,v_path,public.pkms_path_parent(v_path),case when v_type='create-folder' then 'folder' else 'markdown' end,
        case when v_type='create-file' then coalesce(p_operation->>'content','') else null end,
        case when v_type='create-file' then octet_length(convert_to(coalesce(p_operation->>'content',''),'UTF8')) else 0 end,
        0,false,true);
    if v_type='create-folder' then
      insert into public.pkms_directories(workspace_id,path,tree_sha,loaded) values(p_workspace_id,v_path,'',true) on conflict do nothing;
    else
      if p_initial_state_b64 is null then raise exception using errcode='22023',message='initial_state_required'; end if;
      insert into public.pkms_documents(workspace_id,file_id,state_update_b64,compacted_revision)
        values(p_workspace_id,v_file_id,p_initial_state_b64,0);
    end if;
  elsif v_type='move' then
    select * into f from public.pkms_files where workspace_id=p_workspace_id and file_id=p_operation->>'fileId' and not deleted for update;
    if not found then raise exception using errcode='P0002',message='file_not_found'; end if;
    v_target:=p_operation->>'toPath';
    if not public.pkms_path_is_valid(v_target) then raise exception using errcode='22023',message='invalid_path'; end if;
    if f.kind='folder' and v_target like f.path||'/%' then raise exception using errcode='23514',message='move_into_itself'; end if;
    v_dest:=v_target;
    if v_dest<>f.path and exists(select 1 from public.pkms_files where workspace_id=p_workspace_id and not deleted and (path=v_dest or path like v_dest||'/%')) then
      v_dest:=public.pkms_unique_conflict_path(p_workspace_id,v_dest,p_client_id); v_conflict:=v_dest;
    end if;
    v_parent:=public.pkms_path_parent(v_dest);
    while v_parent<>'' loop
      if not exists(select 1 from public.pkms_files where workspace_id=p_workspace_id and path=v_parent and not deleted) then
        insert into public.pkms_files(workspace_id,file_id,path,parent_path,kind,dirty)
          values(p_workspace_id,'folder-'||v_parent,v_parent,public.pkms_path_parent(v_parent),'folder',true)
          on conflict(workspace_id,file_id) do update set deleted=false,dirty=true;
        insert into public.pkms_directories(workspace_id,path,tree_sha,loaded) values(p_workspace_id,v_parent,'',true) on conflict do nothing;
      end if;
      v_parent:=public.pkms_path_parent(v_parent);
    end loop;
    if f.kind='folder' then
      update public.pkms_files set previous_path=coalesce(previous_path,path),
        path=v_dest||substr(path,length(f.path)+1),
        parent_path=public.pkms_path_parent(v_dest||substr(path,length(f.path)+1)),
        revision=w.server_revision+1,dirty=(kind<>'folder'),updated_at=now()
        where workspace_id=p_workspace_id and not deleted and (path=f.path or path like f.path||'/%');
      for v_dir in select * from public.pkms_directories where workspace_id=p_workspace_id and (path=f.path or path like f.path||'/%') loop
        delete from public.pkms_directories where workspace_id=p_workspace_id and path=v_dir.path;
        insert into public.pkms_directories(workspace_id,path,tree_sha,loaded)
          values(p_workspace_id,v_dest||substr(v_dir.path,length(f.path)+1),v_dir.tree_sha,v_dir.loaded)
          on conflict(workspace_id,path) do update set tree_sha=excluded.tree_sha,loaded=excluded.loaded;
      end loop;
    else
      update public.pkms_files set previous_path=coalesce(previous_path,path),path=v_dest,parent_path=public.pkms_path_parent(v_dest),
        revision=w.server_revision+1,dirty=true,updated_at=now() where workspace_id=p_workspace_id and file_id=f.file_id;
    end if;
  elsif v_type='delete' then
    select * into f from public.pkms_files where workspace_id=p_workspace_id and file_id=p_operation->>'fileId' and not deleted for update;
    if not found then raise exception using errcode='P0002',message='file_not_found'; end if;
    if f.kind='folder' then
      update public.pkms_files set deleted=true,dirty=(kind<>'folder'),revision=w.server_revision+1,updated_at=now()
        where workspace_id=p_workspace_id and not deleted and (path=f.path or path like f.path||'/%');
      delete from public.pkms_directories where workspace_id=p_workspace_id and (path=f.path or path like f.path||'/%');
    else
      update public.pkms_files set deleted=true,dirty=true,revision=w.server_revision+1,updated_at=now()
        where workspace_id=p_workspace_id and file_id=f.file_id;
    end if;
  else
    raise exception using errcode='22023',message='unsupported_operation';
  end if;

  v_revision:=w.server_revision+1;
  update public.pkms_workspaces set server_revision=v_revision,github_status='pending',github_message=null,
    flush_due_at=coalesce(flush_due_at,now()+interval '15 minutes'),updated_at=now() where workspace_id=p_workspace_id;
  v_result:=jsonb_build_object('operationId',p_operation_id,'acceptedRevision',v_revision,'duplicate',false)
    ||case when v_conflict is not null then jsonb_build_object('conflictCopyPath',v_conflict) else '{}'::jsonb end
    ||case when p_base_revision<v_revision-1 then jsonb_build_object('rebasedFrom',p_base_revision) else '{}'::jsonb end;
  insert into public.pkms_operations(workspace_id,operation_id,revision,result) values(p_workspace_id,p_operation_id,v_revision,v_result);
  return v_result;
end;
$$;

revoke all on function public.pkms_path_parent(text) from public,anon,authenticated;
revoke all on function public.pkms_path_is_valid(text) from public,anon,authenticated;
revoke all on function public.pkms_unique_conflict_path(text,text,text) from public,anon,authenticated;
revoke all on function public.pkms_initialize_workspace(text,text,text,text,text,text) from public,anon,authenticated;
revoke all on function public.pkms_apply_operation(text,uuid,bigint,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.pkms_initialize_workspace(text,text,text,text,text,text) to service_role;
grant execute on function public.pkms_apply_operation(text,uuid,bigint,text,jsonb,text) to service_role;
