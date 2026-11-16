create or replace function public.pkms_search_content(
  p_workspace_id text,
  p_query text,
  p_case_sensitive boolean default false,
  p_after_path text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pattern text;
  v_result jsonb;
begin
  if p_query is null or char_length(p_query) < 1 or char_length(p_query) > 200 then
    raise exception using errcode = '22023', message = 'invalid_search_query';
  end if;

  -- One-character queries may scan the small corpus because trigrams are unavailable.
  -- Bound the database work even when the client cancels its request.
  perform set_config('statement_timeout', '3000ms', true);
  v_pattern := '%' || replace(replace(replace(p_query, E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') || '%';

  with counts as materialized (
    select
      count(*) filter (where f.content is not null and f.content_revision = f.revision) as indexed_files,
      count(*) as searchable_files
    from public.pkms_files f
    where f.workspace_id = p_workspace_id
      and f.kind = 'markdown'
      and not f.deleted
      and f.size <= 524288
  ), candidates as materialized (
    select f.file_id, f.path, f.content
    from public.pkms_files f
    where f.workspace_id = p_workspace_id
      and f.kind = 'markdown'
      and not f.deleted
      and f.size <= 524288
      and f.content is not null
      and f.content_revision = f.revision
      and (p_after_path is null or f.path > p_after_path)
      and (
        (p_case_sensitive and f.content like v_pattern escape E'\\')
        or (not p_case_sensitive and f.content ilike v_pattern escape E'\\')
      )
    order by f.path
    limit 101
  ), result_files as (
    select
      c.file_id,
      c.path,
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'line', matched.line_number,
            'column', matched.column_number,
            'preview',
              case when matched.start_at > 1 then '…' else '' end
              || substring(matched.line_text from matched.start_at for 240)
              || case when matched.start_at + 239 < char_length(matched.line_text) then '…' else '' end
          ) order by matched.line_number
        )
        from (
          select
            lines.ordinality::integer as line_number,
            lines.line_text,
            case
              when p_case_sensitive then strpos(lines.line_text, p_query)
              else strpos(lower(lines.line_text), lower(p_query))
            end as column_number,
            greatest(1, (case
              when p_case_sensitive then strpos(lines.line_text, p_query)
              else strpos(lower(lines.line_text), lower(p_query))
            end) - 80) as start_at
          from regexp_split_to_table(c.content, E'\\n') with ordinality as lines(line_text, ordinality)
          where (p_case_sensitive and lines.line_text like v_pattern escape E'\\')
             or (not p_case_sensitive and lines.line_text ilike v_pattern escape E'\\')
          order by lines.ordinality
          limit 10
        ) matched
      ), '[]'::jsonb) as matches
    from candidates c
    order by c.path
    limit 100
  )
  select jsonb_build_object(
    'results', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'fileId', r.file_id,
          'path', r.path,
          'matches', r.matches
        ) order by r.path
      )
      from result_files r
    ), '[]'::jsonb),
    'indexedFiles', counts.indexed_files,
    'searchableFiles', counts.searchable_files,
    'pendingFiles', counts.searchable_files - counts.indexed_files,
    'hasMore', (select count(*) > 100 from candidates),
    'nextPath', case
      when (select count(*) > 100 from candidates)
        then (select r.path from result_files r order by r.path desc limit 1)
      else null
    end
  )
  into v_result
  from counts;

  return v_result;
end;
$$;

revoke all on function public.pkms_search_content(text, text, boolean, text) from public, anon, authenticated;
grant execute on function public.pkms_search_content(text, text, boolean, text) to service_role;
