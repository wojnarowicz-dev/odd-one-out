-- Nadanie przed odebraniem, i NIC pozniej. Kontrast do gadget_touch:
-- wczesniejsze nadanie NIE jest naprawa.
create or replace function public.gadget_probe() returns void language sql as $$ select 1 $$;
grant execute on function public.gadget_probe() to service_role;
