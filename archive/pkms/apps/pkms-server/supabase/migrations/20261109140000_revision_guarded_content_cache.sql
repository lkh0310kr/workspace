-- `pkms_files.content` is a read cache of the canonical Yjs document. Concurrent
-- writers may have computed their text from an older snapshot, so only publish
-- that text when the file revision still matches the snapshot used by the writer.
alter table public.pkms_files
  add column if not exists content_revision bigint;

drop function if exists public.pkms_append_document_update(text,text,uuid,text,text,bigint);
create function public.pkms_append_document_update(
  p_workspace_id text,
  p_file_id text,
  p_operation_id uuid,
  p_update_b64 text,
  p_content text,
  p_size bigint,
  p_base_revision bigint
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  w public.pkms_workspaces%rowtype;
  f public.pkms_files%rowtype;
  prior public.pkms_operations%rowtype;
  v_revision bigint;
  v_result jsonb;
begin
  select * into w from public.pkms_workspaces where workspace_id=p_workspace_id for update;
  if not found then raise exception using errcode='P0002',message='workspace_not_found'; end if;
  select * into prior from public.pkms_operations where workspace_id=p_workspace_id and operation_id=p_operation_id;
  if found then return prior.result || jsonb_build_object('duplicate',true); end if;
  select * into f from public.pkms_files where workspace_id=p_workspace_id and file_id=p_file_id and not deleted and kind='markdown' for update;
  if not found then raise exception using errcode='P0002',message='file_not_found'; end if;
  if length(p_update_b64)>800000 or p_size>524288 then raise exception using errcode='22023',message='update_too_large'; end if;

  v_revision:=w.server_revision+1;
  v_result:=jsonb_build_object('operationId',p_operation_id,'acceptedRevision',v_revision,'duplicate',false);
  insert into public.pkms_document_updates(workspace_id,file_id,operation_id,revision,update_b64)
    values(p_workspace_id,p_file_id,p_operation_id,v_revision,p_update_b64);
  insert into public.pkms_operations(workspace_id,operation_id,revision,result)
    values(p_workspace_id,p_operation_id,v_revision,v_result);

  if f.revision=p_base_revision then
    update public.pkms_files set content=p_content,content_revision=v_revision,size=p_size,
      revision=v_revision,dirty=true,updated_at=now()
      where workspace_id=p_workspace_id and file_id=p_file_id;
  else
    -- The CRDT update is still valid, but its accompanying text was computed
    -- from a stale snapshot. Force readers to rebuild the text from Yjs.
    update public.pkms_files set content=null,content_revision=null,
      revision=v_revision,dirty=true,updated_at=now()
      where workspace_id=p_workspace_id and file_id=p_file_id;
  end if;

  update public.pkms_workspaces set server_revision=v_revision,github_status='pending',
    github_message=null,flush_due_at=coalesce(flush_due_at,now()+interval '15 minutes'),updated_at=now()
    where workspace_id=p_workspace_id;
  return v_result;
end;
$$;

revoke all on function public.pkms_append_document_update(text,text,uuid,text,text,bigint,bigint) from public,anon,authenticated;
grant execute on function public.pkms_append_document_update(text,text,uuid,text,text,bigint,bigint) to service_role;
