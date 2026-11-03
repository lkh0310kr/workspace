-- Content mirror: Markdown bodies are copied from GitHub into pkms_files.content so that opening notes,
-- searching and link maintenance never need a GitHub round trip.
create extension if not exists pg_trgm with schema extensions;

-- Substring lookups (`content ilike '%name%'`) used to find notes that link to a moved file.
create index if not exists pkms_files_content_trgm
  on public.pkms_files using gin (content extensions.gin_trgm_ops)
  where kind='markdown' and not deleted and content is not null;

alter table public.pkms_workspaces add column if not exists mirrored_head text;

-- Fills content (and the initial Yjs state) only where nothing local has happened since the tree entry was
-- cached: same blob sha, no content yet, not dirty. Concurrent edits therefore always win over the mirror.
create or replace function public.pkms_mirror_content(p_workspace_id text, p_items jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  with incoming as (
    select item->>'fileId' as file_id, item->>'sha' as sha, item->>'content' as content, item->>'state' as state
    from jsonb_array_elements(p_items) as item
  ), updated as (
    update public.pkms_files f set content=i.content
    from incoming i
    where f.workspace_id=p_workspace_id and f.file_id=i.file_id and f.kind='markdown'
      and not f.deleted and not f.dirty and f.content is null and f.sha=i.sha
    returning f.file_id, i.state
  ), seeded as (
    insert into public.pkms_documents(workspace_id,file_id,state_update_b64,compacted_revision)
    select p_workspace_id, file_id, state, 0 from updated
    on conflict (workspace_id,file_id) do update set state_update_b64=excluded.state_update_b64
      where public.pkms_documents.state_update_b64=''
    returning 1
  )
  select count(*) into v_count from updated;
  return v_count;
end;
$$;

-- Caches a whole GitHub tree in one pass. Rows that collide with local state (same id or same active path)
-- are skipped, so local edits and moves are never overwritten.
create or replace function public.pkms_mirror_tree(p_workspace_id text, p_files jsonb, p_dirs jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.pkms_files(workspace_id,file_id,path,parent_path,kind,size,sha,revision,deleted,dirty)
  select p_workspace_id, f->>'fileId', f->>'path', f->>'parentPath', f->>'kind', coalesce((f->>'size')::bigint,0), f->>'sha', 0, false, false
  from jsonb_array_elements(p_files) as f
  on conflict do nothing;
  insert into public.pkms_directories(workspace_id,path,tree_sha,loaded)
  select p_workspace_id, d->>'path', d->>'treeSha', true from jsonb_array_elements(p_dirs) as d
  on conflict (workspace_id,path) do update set loaded=true;
end;
$$;

create or replace function public.pkms_mark_mirrored(p_workspace_id text, p_head text)
returns void language sql security definer set search_path = '' as $$
  update public.pkms_workspaces set mirrored_head=p_head where workspace_id=p_workspace_id;
$$;

revoke all on function public.pkms_mirror_content(text,jsonb) from public,anon,authenticated;
revoke all on function public.pkms_mirror_tree(text,jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.pkms_mark_mirrored(text,text) from public,anon,authenticated;
grant execute on function public.pkms_mirror_content(text,jsonb) to service_role;
grant execute on function public.pkms_mirror_tree(text,jsonb,jsonb) to service_role;
grant execute on function public.pkms_mark_mirrored(text,text) to service_role;
