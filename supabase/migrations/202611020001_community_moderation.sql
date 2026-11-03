create table public.community_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.community_admins enable row level security;
revoke all on public.community_admins from anon, authenticated;

create or replace function public.is_community_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.community_admins
    where user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_community_admin() from public;
grant execute on function public.is_community_admin() to anon, authenticated;

create table public.community_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  author_name text not null check (char_length(trim(author_name)) between 1 and 48),
  title text not null check (char_length(trim(title)) between 1 and 90),
  body text not null check (char_length(trim(body)) between 1 and 700),
  category text not null default 'foto' check (category in ('foto', 'historia')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'removed')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null
);

create table public.community_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  author_name text not null check (char_length(trim(author_name)) between 1 and 48),
  body text not null check (char_length(trim(body)) between 1 and 700),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'removed')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null
);

create table public.community_media (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null unique,
  media_type text not null check (media_type in ('photo', 'video')),
  mime_type text not null,
  created_at timestamptz not null default now()
);

create table public.community_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  target_type text not null check (target_type in ('post', 'comment')),
  target_id uuid not null,
  reason text not null check (reason in ('insult', 'harassment', 'sexual', 'violence', 'privacy', 'spam', 'other')),
  details text check (details is null or char_length(details) <= 500),
  status text not null default 'open' check (status in ('open', 'reviewed', 'resolved')),
  created_at timestamptz not null default now(),
  unique (reporter_id, target_type, target_id)
);

alter table public.community_posts enable row level security;
alter table public.community_comments enable row level security;
alter table public.community_media enable row level security;
alter table public.community_reports enable row level security;

revoke all on public.community_posts, public.community_comments, public.community_media, public.community_reports
from anon, authenticated;

grant select on public.community_posts, public.community_comments, public.community_media to anon, authenticated;
grant select on public.community_reports to authenticated;
grant insert (user_id, author_name, title, body, category) on public.community_posts to authenticated;
grant insert (post_id, user_id, author_name, body) on public.community_comments to authenticated;
grant insert (post_id, user_id, storage_path, media_type, mime_type) on public.community_media to authenticated;
grant insert (reporter_id, target_type, target_id, reason, details) on public.community_reports to authenticated;
grant update (status, reviewed_at, reviewed_by) on public.community_posts, public.community_comments to authenticated;
grant update (status) on public.community_reports to authenticated;
grant delete on public.community_posts to authenticated;

create policy "approved posts and own pending posts are visible"
on public.community_posts for select to anon, authenticated
using (status = 'approved' or (user_id = (select auth.uid()) and status = 'pending') or public.is_community_admin());

create policy "members submit posts only as pending"
on public.community_posts for insert to authenticated
with check (user_id = (select auth.uid()) and status = 'pending');

create policy "admins review posts"
on public.community_posts for update to authenticated
using (public.is_community_admin())
with check (public.is_community_admin());

create policy "authors can remove their own pending posts"
on public.community_posts for delete to authenticated
using (user_id = (select auth.uid()) and status = 'pending');

create policy "approved comments and own pending comments are visible"
on public.community_comments for select to anon, authenticated
using (
  (status = 'approved' and exists (
    select 1 from public.community_posts p where p.id = post_id and p.status = 'approved'
  ))
  or (user_id = (select auth.uid()) and status = 'pending')
  or public.is_community_admin()
);

create policy "members submit comments only on approved posts"
on public.community_comments for insert to authenticated
with check (
  user_id = (select auth.uid())
  and status = 'pending'
  and exists (
    select 1 from public.community_posts p where p.id = post_id and p.status = 'approved'
  )
);

create policy "admins review comments"
on public.community_comments for update to authenticated
using (public.is_community_admin())
with check (public.is_community_admin());

create policy "approved media and own pending media are visible"
on public.community_media for select to anon, authenticated
using (
  exists (
    select 1 from public.community_posts p
    where p.id = post_id and p.status = 'approved'
  )
  or (user_id = (select auth.uid()) and exists (
    select 1 from public.community_posts p
    where p.id = post_id and p.user_id = (select auth.uid()) and p.status = 'pending'
  ))
  or public.is_community_admin()
);

create policy "members attach media only to their pending posts"
on public.community_media for insert to authenticated
with check (
  user_id = (select auth.uid())
  and storage_path like (select auth.uid())::text || '/' || post_id::text || '/%'
  and exists (
    select 1 from public.community_posts p
    where p.id = post_id and p.user_id = (select auth.uid()) and p.status = 'pending'
  )
);

create policy "members report content once"
on public.community_reports for insert to authenticated
with check (
  reporter_id = (select auth.uid())
  and (
    (target_type = 'post' and exists (
      select 1 from public.community_posts p where p.id = target_id and p.status = 'approved'
    ))
    or (target_type = 'comment' and exists (
      select 1 from public.community_comments c where c.id = target_id and c.status = 'approved'
    ))
  )
);

create policy "admins manage reports"
on public.community_reports for select to authenticated
using (public.is_community_admin());

create policy "admins close reports"
on public.community_reports for update to authenticated
using (public.is_community_admin())
with check (public.is_community_admin());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'community-media',
  'community-media',
  false,
  52428800,
  array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm']
)
on conflict (id) do nothing;

update storage.buckets
set public = false,
    file_size_limit = 52428800,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm']
where id = 'community-media';

create policy "members upload files for their own pending posts"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'community-media'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (
    select 1 from public.community_media m
    join public.community_posts p on p.id = m.post_id
    where m.storage_path = name
      and m.user_id = (select auth.uid())
      and p.user_id = (select auth.uid())
      and p.status = 'pending'
  )
);

create policy "only approved files, their owners, and admins can read media"
on storage.objects for select to anon, authenticated
using (
  bucket_id = 'community-media'
  and exists (
    select 1 from public.community_media m
    join public.community_posts p on p.id = m.post_id
    where m.storage_path = name
      and (
        p.status = 'approved'
        or (p.user_id = (select auth.uid()) and p.status = 'pending')
        or public.is_community_admin()
      )
  )
);

create policy "members delete files from their own pending posts"
on storage.objects for delete to authenticated
using (
  bucket_id = 'community-media'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (
    select 1 from public.community_media m
    join public.community_posts p on p.id = m.post_id
    where m.storage_path = name
      and p.user_id = (select auth.uid())
      and p.status = 'pending'
  )
);

