-- Run once in Supabase SQL Editor for the PDF resources feature. Safe to rerun.
-- Existing notes and files are left unchanged.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('subject-resources','subject-resources',false,52428800,array['application/pdf'])
on conflict (id) do update set public=false,file_size_limit=52428800,allowed_mime_types=array['application/pdf'];
-- Keep this bucket private and do not add anon/authenticated write policies.
-- The authenticated admin uses the app server, which holds the Supabase secret key.
-- Reading/downloading resources through the website is available to all readers.
