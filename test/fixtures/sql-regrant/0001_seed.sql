-- Konwencja: trzy pary revoke+grant, tyle ile wymaga prog MINCONV.

create or replace function public.alpha_one() returns void language sql as $$ select 1 $$;
revoke all     on function public.alpha_one() from public, anon;
grant  execute on function public.alpha_one() to service_role;

create or replace function public.alpha_two() returns void language sql as $$ select 1 $$;
revoke all     on function public.alpha_two() from public, anon;
grant  execute on function public.alpha_two() to service_role;

create or replace function public.alpha_three() returns void language sql as $$ select 1 $$;
revoke all     on function public.alpha_three() from public, anon;
grant  execute on function public.alpha_three() to service_role;
