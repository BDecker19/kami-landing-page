-- Include ambassador display identity on agreement-required status responses.

create or replace function public.get_my_ambassador_agreement_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_user public.users%rowtype;
  v_profile public.ambassador_profiles%rowtype;
  v_settings public.ambassador_program_settings%rowtype;
  v_current_version text;
  v_has_acceptance boolean;
  v_program_parameters jsonb;
  v_display_name text;
  v_avatar_url text;
begin
  v_user_id := public.kami_resolve_auth_app_user_id();
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select * into v_user from public.users where id = v_user_id;

  select *
    into v_settings
    from public.ambassador_program_settings
   where is_active = true
   order by last_updated desc
   limit 1;

  v_current_version := coalesce(v_settings.current_agreement_version, 'ambassador_terms_v1');

  select *
    into v_profile
    from public.ambassador_profiles
   where user_id = v_user_id;

  if not found or coalesce(v_user.user_type, '') <> 'ambassador' then
    return jsonb_build_object(
      'ok', true,
      'state', 'not_ambassador',
      'current_agreement_version', v_current_version
    );
  end if;

  select coalesce(up.display_name, up.username, 'Ambassador'),
         up.avatar_url
    into v_display_name, v_avatar_url
    from public.user_profiles up
   where up.user_id = v_user_id
   order by up.updated_at desc nulls last
   limit 1;

  v_program_parameters := public.kami_build_ambassador_program_parameters(v_user_id);

  select exists (
    select 1
      from public.ambassador_agreement_acceptances aa
     where aa.ambassador_user_id = v_user_id
       and aa.agreement_version = v_current_version
  )
    into v_has_acceptance;

  if not v_has_acceptance then
    return jsonb_build_object(
      'ok', true,
      'state', 'agreement_required',
      'current_agreement_version', v_current_version,
      'program_parameters', v_program_parameters,
      'profile', jsonb_build_object(
        'display_name', v_display_name,
        'avatar_url', v_avatar_url,
        'program_status', v_profile.program_status,
        'status', v_profile.status,
        'agreement_status', v_profile.agreement_status
      )
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'state', 'dashboard',
    'current_agreement_version', v_current_version,
    'program_parameters', v_program_parameters
  );
end;
$$;
