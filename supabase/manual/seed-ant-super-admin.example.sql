-- Run manually in the intended Supabase TEST project after migrations.
-- Replace the email literal with the owner's verified Supabase Auth email.
-- Do not expose this as a public API or run against an unintended project.
do $$
declare target_user uuid;
begin
  select id into target_user
  from auth.users
  where lower(email) = lower('REPLACE_WITH_OWNER_EMAIL')
  limit 1;

  if target_user is null then
    raise exception 'No Supabase Auth user found for the configured owner email';
  end if;

  insert into public.ant_admin_roles(user_id, role, granted_by)
  values (target_user, 'SUPER_ADMIN', null)
  on conflict (user_id, role) do nothing;
end $$;
