-- Dwie funkcje, ktorym EXECUTE nie jest do niczego potrzebne.
-- Odebranie bez nadania jest tu stanem docelowym, nie polowa pary:
-- PostgreSQL sprawdza EXECUTE przy CREATE TRIGGER, nie przy odpaleniu wyzwalacza,
-- a wywolanie wprost konczy sie 0A000 "trigger functions can only be called as triggers".
--
-- ZADNA z tych dwoch nie moze trafic do odstepstw.

create or replace function public.widget_stamp() returns trigger language plpgsql as $$
begin
  new.touched_at = now();
  return new;
end
$$;
revoke execute on function public.widget_stamp() from public;

create or replace function public.widget_watch() returns event_trigger language plpgsql as $$
begin
  perform 1;
end
$$;
revoke execute on function public.widget_watch() from public;
