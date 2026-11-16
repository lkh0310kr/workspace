-- The root directory is part of the mirrored tree too; without this the first listing still asks GitHub.
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
  insert into public.pkms_directories(workspace_id,path,tree_sha,loaded) values(p_workspace_id,'','',true)
  on conflict (workspace_id,path) do update set loaded=true;
end;
$$;
