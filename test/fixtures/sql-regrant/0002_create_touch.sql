-- Nadanie PRZED odebraniem. Mapa pamietajaca tylko pierwsze nadanie widziala
-- wlasnie to i uznawala, ze pozniejszej naprawy nie ma.
create or replace function public.gadget_touch() returns void language sql as $$ select 1 $$;
grant execute on function public.gadget_touch() to service_role;
