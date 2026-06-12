-- Public check for ambassador forgot-password flow (no auth required).
create or replace function public.kami_ambassador_forgot_password_check(p_email text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_email text;
  v_user public.users%rowtype;
  v_profile public.ambassador_profiles%rowtype;
begin
  v_email := lower(trim(p_email));

  if v_email is null or v_email = '' or position('@' in v_email) = 0 then
    return jsonb_build_object(
      'ok', false,
      'code', 'invalid_email',
      'message', 'Enter a valid email address.'
    );
  end if;

  select *
    into v_user
    from public.users
   where lower(auth_email) = v_email
   limit 1;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'code', 'email_not_found',
      'message', 'No Kami account was found for that email address.'
    );
  end if;

  if coalesce(v_user.user_type, '') <> 'ambassador' then
    return jsonb_build_object(
      'ok', false,
      'code', 'not_ambassador',
      'message',
      'That email is registered with Kami, but it is not linked to an approved ambassador account. Contact ambassadors@kamisocial.com if you believe this is an error.'
    );
  end if;

  select *
    into v_profile
    from public.ambassador_profiles
   where user_id = v_user.id;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'code', 'not_ambassador',
      'message',
      'That email is registered with Kami, but it is not linked to an approved ambassador account. Contact ambassadors@kamisocial.com if you believe this is an error.'
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'code', 'can_reset',
    'email', v_user.auth_email
  );
end;
$$;

revoke all on function public.kami_ambassador_forgot_password_check(text) from public;
grant execute on function public.kami_ambassador_forgot_password_check(text) to anon, authenticated;
