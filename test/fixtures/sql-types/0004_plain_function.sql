-- Zwykla funkcja, ktorej EXECUTE jest potrzebne. Odebrane, nienadane, nigdzie
-- dalej nienaprawione — to jest odstepstwo i ma nim zostac.
--
-- To jest prog calej zmiany: wylaczenie funkcji wyzwalaczy nie moze zabrac
-- ani jednego zgloszenia tego ksztaltu.

create or replace function public.widget_delta(id uuid, note text) returns void language sql as $$ select 1 $$;
revoke all on function public.widget_delta(uuid, text) from public, anon, authenticated;
