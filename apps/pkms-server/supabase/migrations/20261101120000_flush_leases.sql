create or replace function public.pkms_claim_workspace(p_workspace_id text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare w public.pkms_workspaces%rowtype;
begin
  update public.pkms_workspaces set lease_token=gen_random_uuid(),lease_until=now()+interval '5 minutes'
    where workspace_id=p_workspace_id and (lease_until is null or lease_until<now())
    returning * into w;
  if not found then return null; end if;
  return to_jsonb(w);
end;
$$;
revoke all on function public.pkms_claim_workspace(text) from public,anon,authenticated;
grant execute on function public.pkms_claim_workspace(text) to service_role;

create or replace function public.pkms_finish_flush(
  p_workspace_id text, p_lease_token uuid, p_captured_revision bigint, p_new_head text,
  p_files jsonb, p_github_status text default 'synced', p_message text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare w public.pkms_workspaces%rowtype; item jsonb; remaining integer;
begin
  select * into w from public.pkms_workspaces where workspace_id=p_workspace_id for update;
  if not found or w.lease_token is distinct from p_lease_token then
    raise exception using errcode='40001',message='flush_lease_lost';
  end if;
  if p_github_status='external-change' then
    update public.pkms_workspaces set github_status='external-change',github_message=p_message,flush_due_at=null,lease_token=null,lease_until=null,updated_at=now() where workspace_id=p_workspace_id;
    return jsonb_build_object('githubStatus','external-change','serverRevision',w.server_revision);
  end if;
  for item in select * from jsonb_array_elements(coalesce(p_files,'[]'::jsonb)) loop
    update public.pkms_files set dirty=false,deleted=coalesce((item->>'deleted')::boolean,deleted),
      sha=coalesce(item->>'sha',sha),previous_path=null,updated_at=now()
      where workspace_id=p_workspace_id and file_id=item->>'fileId'
        and revision=(item->>'revision')::bigint and revision<=p_captured_revision;
  end loop;
  select count(*) into remaining from public.pkms_files where workspace_id=p_workspace_id and dirty;
  update public.pkms_workspaces set github_head=p_new_head,github_status=case when remaining>0 then 'pending' else 'synced' end,
    github_message=null,last_github_commit_at=now(),retry_count=0,
    flush_due_at=case when remaining>0 then now()+interval '15 minutes' else null end,
    lease_token=null,lease_until=null,updated_at=now()
    where workspace_id=p_workspace_id;
  return jsonb_build_object('githubStatus',case when remaining>0 then 'pending' else 'synced' end,'serverRevision',w.server_revision,'pendingFiles',remaining);
end;
$$;
revoke all on function public.pkms_finish_flush(text,uuid,bigint,text,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.pkms_finish_flush(text,uuid,bigint,text,jsonb,text,text) to service_role;
