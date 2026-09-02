-- fixture migration
create or replace function public.touch_slot(p_id uuid)
returns void
language plpgsql
security definer
as $$
begin
  update public.slots set taken = false where id = p_id;
end;
$$;

revoke all on function public.touch_slot(uuid) from public;
grant execute on function public.touch_slot(uuid) to authenticated;
