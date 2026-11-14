-- Content search follows the latest Markdown revision and path, and omits deleted rows.
begin;
do $$
declare
  wid text := 'fffffffffffffffffffffffffffffffb';
  result jsonb;
begin
  insert into public.pkms_workspaces(workspace_id,owner_login,repository,branch)
    values(wid,'lkh0310kr','lkh0310kr/pkms-search-sync-regression','test');
  insert into public.pkms_files(
    workspace_id,file_id,path,parent_path,kind,revision,deleted,dirty,size,content,content_revision
  ) values (
    wid,'search-note','old/name.md','old','markdown',1,false,true,
    char_length('Original signal'), 'Original signal', 1
  );

  result := public.pkms_search_content(wid,'Original',false,null);
  if jsonb_array_length(result->'results') <> 1 or
     result->'results'->0->>'fileId' is distinct from 'search-note' then
    raise exception 'initial indexed content was not searchable: %', result;
  end if;

  -- A newer Yjs revision whose content cache is stale must not return old text.
  update public.pkms_files set content=null,content_revision=null,revision=2,size=20,dirty=true
    where workspace_id=wid and file_id='search-note';
  result := public.pkms_search_content(wid,'Original',false,null);
  if jsonb_array_length(result->'results') <> 0 or
     (result->>'pendingFiles')::integer <> 1 then
    raise exception 'stale indexed content leaked into results or was not marked pending: %', result;
  end if;

  -- Once the latest Yjs text is materialized, the index must find only that text.
  update public.pkms_files set content='Moved signal',content_revision=2,size=12
    where workspace_id=wid and file_id='search-note';
  result := public.pkms_search_content(wid,'Original',false,null);
  if jsonb_array_length(result->'results') <> 0 then
    raise exception 'obsolete text remained searchable after refresh: %', result;
  end if;
  result := public.pkms_search_content(wid,'Moved',false,null);
  if jsonb_array_length(result->'results') <> 1 or
     result->'results'->0->>'path' is distinct from 'old/name.md' then
    raise exception 'refreshed text was not searchable at its original path: %', result;
  end if;

  update public.pkms_files set path='new/name.md',parent_path='new',revision=3,content_revision=3
    where workspace_id=wid and file_id='search-note';
  result := public.pkms_search_content(wid,'Moved',false,null);
  if jsonb_array_length(result->'results') <> 1 or
     result->'results'->0->>'path' is distinct from 'new/name.md' then
    raise exception 'search result did not follow rename/move: %', result;
  end if;

  update public.pkms_files set deleted=true,revision=4,dirty=true
    where workspace_id=wid and file_id='search-note';
  result := public.pkms_search_content(wid,'Moved',false,null);
  if jsonb_array_length(result->'results') <> 0 or
     (result->>'searchableFiles')::integer <> 0 then
    raise exception 'deleted content remained searchable: %', result;
  end if;
end;
$$;
rollback;
