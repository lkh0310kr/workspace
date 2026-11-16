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
revoke all on function public.pkms_claim_due_workspaces(integer) from public,anon,authenticated;
grant execute on function public.pkms_claim_due_workspaces(integer) to service_role;
