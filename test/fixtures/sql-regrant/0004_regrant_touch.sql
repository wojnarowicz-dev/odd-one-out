-- Naprawa POZNIEJSZA MIGRACJA. To ma trafic do sekcji "naprawione pozniej"
-- i NIE ma wplywac na kod wyjscia.
grant execute on function public.gadget_touch() to service_role;
