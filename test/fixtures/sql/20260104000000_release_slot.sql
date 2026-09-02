-- fixture migration
create or replace function public.release_slot(p_id uuid)
returns void
language plpgsql
security definer
as $$
begin
  update public.slots set taken = false where id = p_id;
end;
$$;

revoke all on function public.release_slot(uuid) from public;
-- planted deviation: no grant execute, so nobody can call it
