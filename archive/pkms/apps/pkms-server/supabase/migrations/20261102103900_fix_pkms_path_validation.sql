create or replace function public.pkms_path_is_valid(p_path text)
returns boolean language sql immutable set search_path = '' as $$
  select length(p_path) between 1 and 1024 and p_path !~ '^/' and strpos(p_path, chr(92))=0
    and p_path !~ '(^|/)\.\.?(/|$)' and p_path !~ '(^|/)(/|$)'
    and p_path !~ '[[:cntrl:]]';
$$;

revoke all on function public.pkms_path_is_valid(text) from public,anon,authenticated;
