-- Storage only deletes objects the caller can also SELECT; without this policy
-- `storage.remove()` silently deleted nothing. Scoped to the same rows the delete
-- policy allows (the bucket is public, so reads via public URLs are unaffected).
create policy "Owners and the admin can see media they may delete" on storage.objects
  for select to authenticated
  using (bucket_id = 'media'
         and ((storage.foldername(name))[1] = (select auth.uid()::text) or (select public.is_admin())));
