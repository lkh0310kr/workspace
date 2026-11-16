-- Asset content updates are identity/revision guarded and operation-idempotent.
begin;
do $$
declare
  wid text := 'fffffffffffffffffffffffffffffffc';
  created jsonb;
  updated jsonb;
  duplicate jsonb;
begin
  insert into public.pkms_workspaces(workspace_id,owner_login,repository,branch)
    values(wid,'lkh0310kr','lkh0310kr/pkms-asset-sync-regression','test');
  created := public.pkms_apply_asset_sync(
    wid,'ffffffff-ffff-4fff-8fff-ffffffffffe1',0,'desktop-test','docs/image.bin',
    'asset-sync-test','fffffffffffffffffffffffffffffffc/asset-sync-test/op-create',4,
    '0000000000000000000000000000000000000001',null
  );
  if created->>'acceptedRevision' is distinct from '1' then
    raise exception 'asset create failed: %',created;
  end if;
  updated := public.pkms_apply_asset_sync(
    wid,'ffffffff-ffff-4fff-8fff-ffffffffffe2',1,'desktop-test','docs/image.bin',
    'asset-sync-test','fffffffffffffffffffffffffffffffc/asset-sync-test/op-update',8,
    '0000000000000000000000000000000000000002',1
  );
  if updated->>'acceptedRevision' is distinct from '2' or
     updated->>'oldObjectKey' is distinct from 'fffffffffffffffffffffffffffffffc/asset-sync-test/op-create' then
    raise exception 'asset update did not replace the guarded revision: %',updated;
  end if;
  duplicate := public.pkms_apply_asset_sync(
    wid,'ffffffff-ffff-4fff-8fff-ffffffffffe2',1,'desktop-test','docs/image.bin',
    'asset-sync-test','fffffffffffffffffffffffffffffffc/asset-sync-test/op-update',8,
    '0000000000000000000000000000000000000002',1
  );
  if duplicate->>'duplicate' is distinct from 'true' then
    raise exception 'asset retry was not idempotent: %',duplicate;
  end if;
  begin
    perform public.pkms_apply_asset_sync(
      wid,'ffffffff-ffff-4fff-8fff-ffffffffffe3',2,'desktop-test','docs/image.bin',
      'asset-sync-test','fffffffffffffffffffffffffffffffc/asset-sync-test/op-stale',9,
      '0000000000000000000000000000000000000003',1
    );
    raise exception 'stale asset revision was accepted';
  exception when sqlstate '40001' then
    null;
  end;
  if not exists(select 1 from public.pkms_files where workspace_id=wid and file_id='asset-sync-test'
    and revision=2 and size=8 and sha='0000000000000000000000000000000000000002'
    and object_key='fffffffffffffffffffffffffffffffc/asset-sync-test/op-update' and not deleted) then
    raise exception 'asset metadata did not retain the latest accepted bytes';
  end if;
end;
$$;
rollback;
