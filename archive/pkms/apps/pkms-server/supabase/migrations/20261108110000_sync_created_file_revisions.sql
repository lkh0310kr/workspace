-- New markdown files must appear in the incremental sync feed. The operation
-- RPC advances workspace.server_revision, but historically inserted files at
-- revision 0, making them invisible to clients whose cursor was already > 0.
create or replace function public.pkms_assign_created_file_revision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kind = 'markdown' and new.dirty and new.revision = 0 and not new.deleted then
    select server_revision + 1
      into new.revision
      from public.pkms_workspaces
     where workspace_id = new.workspace_id;
  end if;
  return new;
end;
$$;

create trigger pkms_files_assign_created_file_revision
before insert on public.pkms_files
for each row execute function public.pkms_assign_created_file_revision();

revoke all on function public.pkms_assign_created_file_revision() from public, anon, authenticated;
