create extension if not exists pgcrypto with schema extensions;

create table public.pkms_account_values (
  account_login text not null,
  value_key text not null,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (account_login, value_key)
);

create table public.pkms_workspaces (
  workspace_id text primary key check (workspace_id ~ '^[a-f0-9]{32}$'),
  owner_login text not null check (lower(owner_login) = 'lkh0310kr'),
  repository text not null,
  branch text not null,
  server_revision bigint not null default 0,
  github_status text not null default 'pending' check (github_status in ('synced','pending','failed','external-change')),
  github_head text,
  last_github_commit_at timestamptz,
  github_message text,
  flush_due_at timestamptz,
  lease_token uuid,
  lease_until timestamptz,
  retry_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_login, repository, branch)
);

create table public.pkms_files (
  workspace_id text not null references public.pkms_workspaces(workspace_id) on delete cascade,
  file_id text not null,
  path text not null,
  parent_path text not null default '',
  kind text not null check (kind in ('markdown','asset','folder')),
  content text,
  object_key text,
  size bigint not null default 0 check (size >= 0),
  sha text,
  previous_path text,
  revision bigint not null default 0,
  deleted boolean not null default false,
  dirty boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (workspace_id, file_id)
);

create unique index pkms_active_file_paths on public.pkms_files(workspace_id, path) where not deleted;
create index pkms_files_by_parent on public.pkms_files(workspace_id, parent_path, path) where not deleted;
create index pkms_dirty_files on public.pkms_files(workspace_id, revision) where dirty;
create index pkms_deleted_dirty_files on public.pkms_files(workspace_id, revision) where deleted and dirty;

create table public.pkms_directories (
  workspace_id text not null references public.pkms_workspaces(workspace_id) on delete cascade,
  path text not null,
  tree_sha text not null,
  loaded boolean not null default false,
  primary key (workspace_id, path)
);

create table public.pkms_documents (
  workspace_id text not null,
  file_id text not null,
  state_update_b64 text not null default '',
  compacted_revision bigint not null default 0,
  primary key (workspace_id, file_id),
  foreign key (workspace_id, file_id) references public.pkms_files(workspace_id, file_id) on delete cascade
);

create table public.pkms_document_updates (
  update_id bigint generated always as identity primary key,
  workspace_id text not null,
  file_id text not null,
  operation_id uuid not null,
  revision bigint not null,
  update_b64 text not null,
  created_at timestamptz not null default now(),
  unique (workspace_id, operation_id),
  foreign key (workspace_id, file_id) references public.pkms_files(workspace_id, file_id) on delete cascade
);
create index pkms_document_updates_by_file on public.pkms_document_updates(workspace_id, file_id, revision, update_id);

create table public.pkms_operations (
  workspace_id text not null references public.pkms_workspaces(workspace_id) on delete cascade,
  operation_id uuid not null,
  revision bigint not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (workspace_id, operation_id)
);

create or replace function public.pkms_set_account_value(p_login text, p_key text, p_value jsonb)
returns void language sql security definer set search_path = '' as $$
  insert into public.pkms_account_values(account_login,value_key,value,updated_at)
  values(lower(p_login),p_key,p_value,now())
  on conflict(account_login,value_key) do update set value=excluded.value,updated_at=now();
$$;

create or replace function public.pkms_delete_account_value(p_login text, p_key text)
returns void language sql security definer set search_path = '' as $$
  delete from public.pkms_account_values where account_login=lower(p_login) and value_key=p_key;
$$;

create or replace function public.pkms_append_document_update(
  p_workspace_id text, p_file_id text, p_operation_id uuid, p_update_b64 text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  w public.pkms_workspaces%rowtype;
  f public.pkms_files%rowtype;
  prior public.pkms_operations%rowtype;
  v_revision bigint;
  v_result jsonb;
begin
  select * into w from public.pkms_workspaces where workspace_id=p_workspace_id for update;
  if not found then raise exception using errcode='P0002', message='workspace_not_found'; end if;
  select * into prior from public.pkms_operations where workspace_id=p_workspace_id and operation_id=p_operation_id;
  if found then return prior.result || jsonb_build_object('duplicate',true); end if;
  select * into f from public.pkms_files where workspace_id=p_workspace_id and file_id=p_file_id and not deleted and kind='markdown' for update;
  if not found then raise exception using errcode='P0002', message='file_not_found'; end if;
  if length(p_update_b64) > 800000 then raise exception using errcode='22023', message='update_too_large'; end if;
  v_revision := w.server_revision + 1;
  v_result := jsonb_build_object('operationId',p_operation_id,'acceptedRevision',v_revision,'duplicate',false);
  insert into public.pkms_document_updates(workspace_id,file_id,operation_id,revision,update_b64)
    values(p_workspace_id,p_file_id,p_operation_id,v_revision,p_update_b64);
  insert into public.pkms_operations(workspace_id,operation_id,revision,result)
    values(p_workspace_id,p_operation_id,v_revision,v_result);
  update public.pkms_files set revision=v_revision,dirty=true,updated_at=now()
    where workspace_id=p_workspace_id and file_id=p_file_id;
  update public.pkms_workspaces set server_revision=v_revision,github_status='pending',
    github_message=null,flush_due_at=coalesce(flush_due_at,now()+interval '15 minutes'),updated_at=now()
    where workspace_id=p_workspace_id;
  return v_result;
end;
$$;

create or replace function public.pkms_read_document(p_workspace_id text, p_file_id text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  f public.pkms_files%rowtype;
  d public.pkms_documents%rowtype;
  w public.pkms_workspaces%rowtype;
  v_updates jsonb;
begin
  select * into f from public.pkms_files where workspace_id=p_workspace_id and file_id=p_file_id and not deleted;
  if not found then return null; end if;
  select * into d from public.pkms_documents where workspace_id=p_workspace_id and file_id=p_file_id;
  select * into w from public.pkms_workspaces where workspace_id=p_workspace_id;
  select coalesce(jsonb_agg(jsonb_build_object('revision',revision,'update',update_b64) order by revision,update_id),'[]'::jsonb)
    into v_updates from public.pkms_document_updates where workspace_id=p_workspace_id and file_id=p_file_id;
  return jsonb_build_object(
    'file',jsonb_build_object('id',f.file_id,'path',f.path,'parentPath',f.parent_path,'kind',f.kind,'content',f.content,
      'objectKey',f.object_key,'size',f.size,'sha',f.sha,'previousPath',f.previous_path,'revision',f.revision,'deleted',f.deleted,'dirty',f.dirty),
    'stateUpdate',coalesce(d.state_update_b64,''),'compactedRevision',coalesce(d.compacted_revision,0),
    'updates',v_updates,'serverRevision',coalesce(w.server_revision,0));
end;
$$;

create or replace function public.pkms_compact_document(
  p_workspace_id text, p_file_id text, p_state_update_b64 text, p_through_revision bigint
) returns boolean language plpgsql security definer set search_path = '' as $$
declare v_current bigint;
begin
  perform 1 from public.pkms_workspaces where workspace_id=p_workspace_id for update;
  if not found then return false; end if;
  select compacted_revision into v_current from public.pkms_documents
    where workspace_id=p_workspace_id and file_id=p_file_id for update;
  if not found or p_through_revision < v_current then return false; end if;
  insert into public.pkms_documents(workspace_id,file_id,state_update_b64,compacted_revision)
    values(p_workspace_id,p_file_id,p_state_update_b64,p_through_revision)
    on conflict(workspace_id,file_id) do update set state_update_b64=excluded.state_update_b64,compacted_revision=excluded.compacted_revision;
  delete from public.pkms_document_updates where workspace_id=p_workspace_id and file_id=p_file_id and revision<=p_through_revision;
  return true;
end;
$$;

create or replace function public.pkms_claim_due_workspaces(p_limit integer default 20)
returns setof jsonb language plpgsql security definer set search_path = '' as $$
begin
  return query
  with candidates as (
    select workspace_id from public.pkms_workspaces
    where github_status in ('pending','failed') and flush_due_at<=now()
      and (lease_until is null or lease_until<now())
    order by flush_due_at limit greatest(1,least(p_limit,100)) for update skip locked
  ), claimed as (
    update public.pkms_workspaces w set lease_token=gen_random_uuid(),lease_until=now()+interval '5 minutes'
      from candidates c where w.workspace_id=c.workspace_id returning w.*
  ) select to_jsonb(claimed) from claimed;
end;
$$;

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
  update public.pkms_workspaces set github_head=p_new_head,github_status='synced',github_message=null,
    last_github_commit_at=now(),retry_count=0,
    flush_due_at=case when remaining>0 then now()+interval '15 minutes' else null end,
    lease_token=null,lease_until=null,updated_at=now()
    where workspace_id=p_workspace_id;
  return jsonb_build_object('githubStatus','synced','serverRevision',w.server_revision,'pendingFiles',remaining);
end;
$$;

create or replace function public.pkms_fail_flush(
  p_workspace_id text,p_lease_token uuid,p_message text,p_external_change boolean default false
) returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.pkms_workspaces set
    github_status=case when p_external_change then 'external-change' else 'failed' end,
    github_message=p_message,
    retry_count=case when p_external_change then retry_count else least(retry_count+1,7) end,
    flush_due_at=case when p_external_change then null else now()+make_interval(secs=>least(3600,30*power(2,retry_count)::integer)) end,
    lease_token=null,lease_until=null,updated_at=now()
    where workspace_id=p_workspace_id and lease_token=p_lease_token;
end;
$$;

alter table public.pkms_account_values enable row level security;
alter table public.pkms_workspaces enable row level security;
alter table public.pkms_files enable row level security;
alter table public.pkms_directories enable row level security;
alter table public.pkms_documents enable row level security;
alter table public.pkms_document_updates enable row level security;
alter table public.pkms_operations enable row level security;

grant select on public.pkms_workspaces to authenticated;
create policy pkms_owner_can_read_workspace on public.pkms_workspaces for select to authenticated
  using (owner_login='lkh0310kr' and auth.jwt()->'app_metadata'->>'github_login'='lkh0310kr');

create policy pkms_owner_can_receive_realtime on realtime.messages for select to authenticated
  using (
    extension in ('broadcast','presence')
    and auth.jwt()->'app_metadata'->>'github_login'='lkh0310kr'
    and exists(select 1 from public.pkms_workspaces w
      where w.workspace_id=split_part(realtime.topic(),':',2) and w.owner_login='lkh0310kr')
  );
create policy pkms_owner_can_publish_presence on realtime.messages for insert to authenticated
  with check (
    extension='presence'
    and auth.jwt()->'app_metadata'->>'github_login'='lkh0310kr'
    and exists(select 1 from public.pkms_workspaces w
      where w.workspace_id=split_part(realtime.topic(),':',2) and w.owner_login='lkh0310kr')
  );

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
grant select on public.pkms_workspaces to authenticated;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
revoke all on function public.pkms_set_account_value(text,text,jsonb) from public,anon,authenticated;
revoke all on function public.pkms_delete_account_value(text,text) from public,anon,authenticated;
revoke all on function public.pkms_append_document_update(text,text,uuid,text) from public,anon,authenticated;
revoke all on function public.pkms_read_document(text,text) from public,anon,authenticated;
revoke all on function public.pkms_compact_document(text,text,text,bigint) from public,anon,authenticated;
revoke all on function public.pkms_claim_due_workspaces(integer) from public,anon,authenticated;
revoke all on function public.pkms_finish_flush(text,uuid,bigint,text,jsonb,text,text) from public,anon,authenticated;
revoke all on function public.pkms_fail_flush(text,uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.pkms_set_account_value(text,text,jsonb) to service_role;
grant execute on function public.pkms_delete_account_value(text,text) to service_role;
grant execute on function public.pkms_append_document_update(text,text,uuid,text) to service_role;
grant execute on function public.pkms_read_document(text,text) to service_role;
grant execute on function public.pkms_compact_document(text,text,text,bigint) to service_role;
grant execute on function public.pkms_claim_due_workspaces(integer) to service_role;
grant execute on function public.pkms_finish_flush(text,uuid,bigint,text,jsonb,text,text) to service_role;
grant execute on function public.pkms_fail_flush(text,uuid,text,boolean) to service_role;
