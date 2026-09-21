-- Konwencja tego katalogu: kto odbiera, ten nadaje EXECUTE w tym samym pliku.
-- Trzy pary, dokladnie tyle, ile wymaga prog MINCONV.

create or replace function public.widget_alpha() returns void language sql as $$ select 1 $$;
revoke all     on function public.widget_alpha() from public, anon;
grant  execute on function public.widget_alpha() to service_role;

create or replace function public.widget_beta(id uuid) returns integer language sql as $$ select 1 $$;
revoke all     on function public.widget_beta(uuid) from public, anon;
grant  execute on function public.widget_beta(uuid) to service_role;

create or replace function public.widget_gamma() returns text language sql as $$ select 'x' $$;
revoke all     on function public.widget_gamma() from public, anon;
grant  execute on function public.widget_gamma() to service_role;
