-- Returns the registration report only to authenticated community admins.
create or replace function public.admin_list_community_users()
returns table (
  user_id uuid,
  email text,
  display_name text,
  account_type text,
  created_at timestamptz,
  email_confirmed_at timestamptz,
  last_sign_in_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    u.id,
    u.email,
    coalesce(u.raw_user_meta_data ->> 'display_name', ''),
    coalesce(u.raw_user_meta_data ->> 'account_type', 'usuario'),
    u.created_at,
    u.email_confirmed_at,
    u.last_sign_in_at
  from auth.users as u
  where exists (
    select 1
    from public.community_admins as ca
    where ca.user_id = (select auth.uid())
  )
  order by u.created_at desc;
$$;

revoke all on function public.admin_list_community_users() from public, anon;
grant execute on function public.admin_list_community_users() to authenticated;
