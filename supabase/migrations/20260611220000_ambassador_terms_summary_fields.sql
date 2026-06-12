-- Add structured ambassador program parameter fields for UI summaries (snapshots unchanged in shape).

create or replace function public.kami_build_ambassador_program_parameters(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_settings public.ambassador_program_settings%rowtype;
  v_profile public.ambassador_profiles%rowtype;
  v_rate_text text;
  v_cap_text text;
  v_tier_cap_cents integer;
begin
  select *
    into v_settings
    from public.ambassador_program_settings
   where is_active = true
   order by last_updated desc
   limit 1;

  if not found then
    return jsonb_build_object(
      'qualification_requirements', 'Contact ambassadors@kamisocial.com for current program settings.',
      'compensation_rate', 'Contact ambassadors@kamisocial.com for current program settings.',
      'bonus_opportunities', 'Contact ambassadors@kamisocial.com for current program settings.',
      'monthly_earnings_limit', 'Contact ambassadors@kamisocial.com for current program settings.',
      'payout_threshold', 'Contact ambassadors@kamisocial.com for current program settings.',
      'payout_schedule', 'Contact ambassadors@kamisocial.com for current program settings.',
      'last_updated', now()
    );
  end if;

  select *
    into v_profile
    from public.ambassador_profiles
   where user_id = p_user_id;

  if found then
    v_rate_text := format(
      '$%s per qualified referral',
      to_char(coalesce(v_profile.rate_cents_per_registration, 0) / 100.0, 'FM999990.00')
    );
    v_tier_cap_cents := v_profile.maximum_spend_cents;
    if v_tier_cap_cents is not null then
      v_cap_text := format(
        '$%s USD Tier Cap per calendar month. Global policy: %s',
        to_char(v_tier_cap_cents / 100.0, 'FM999990.00'),
        v_settings.monthly_earnings_limit
      );
    else
      v_cap_text := v_settings.monthly_earnings_limit;
    end if;
  else
    v_rate_text := v_settings.compensation_rate;
    v_cap_text := v_settings.monthly_earnings_limit;
    v_tier_cap_cents := null;
  end if;

  return jsonb_build_object(
    'qualification_requirements', v_settings.qualification_requirements,
    'compensation_rate', v_rate_text,
    'bonus_opportunities', v_settings.bonus_opportunities,
    'monthly_earnings_limit', v_cap_text,
    'payout_threshold', v_settings.payout_threshold,
    'payout_schedule', v_settings.payout_schedule,
    'last_updated', v_settings.last_updated,
    'rate_tiers', case when found then v_profile.rate_tiers else '[]'::jsonb end,
    'rate_cents_per_registration', case when found then v_profile.rate_cents_per_registration else null end,
    'tier_cap_cents', v_tier_cap_cents,
    'maximum_spend_cents', v_tier_cap_cents
  );
end;
$$;
