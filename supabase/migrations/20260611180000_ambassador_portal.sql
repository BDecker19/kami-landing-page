-- Ambassador portal: program settings, agreement acceptances, and self-service RPCs.

create table if not exists public.ambassador_program_settings (
  id uuid primary key default gen_random_uuid(),
  qualification_requirements text not null,
  compensation_rate text not null,
  bonus_opportunities text not null,
  monthly_earnings_limit text not null,
  payout_threshold text not null,
  payout_schedule text not null,
  current_agreement_version text not null default 'ambassador_terms_v1',
  is_active boolean not null default true,
  last_updated timestamptz not null default now(),
  updated_by_admin_id uuid references public.users (id),
  created_at timestamptz not null default now()
);

create table if not exists public.ambassador_agreement_acceptances (
  id uuid primary key default gen_random_uuid(),
  ambassador_user_id uuid not null references public.users (id) on delete cascade,
  agreement_version text not null,
  agreement_snapshot text not null,
  program_parameters_snapshot jsonb not null default '{}'::jsonb,
  accepted_at timestamptz not null default now(),
  accepted_by_auth_user_id uuid not null,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists ambassador_agreement_acceptances_user_idx
  on public.ambassador_agreement_acceptances (ambassador_user_id, accepted_at desc);

create index if not exists ambassador_agreement_acceptances_version_idx
  on public.ambassador_agreement_acceptances (ambassador_user_id, agreement_version);

alter table public.ambassador_program_settings enable row level security;
alter table public.ambassador_agreement_acceptances enable row level security;

insert into public.ambassador_program_settings (
  qualification_requirements,
  compensation_rate,
  bonus_opportunities,
  monthly_earnings_limit,
  payout_threshold,
  payout_schedule,
  current_agreement_version
)
select
  'Referred users must create a Kami account using your referral link, complete onboarding, and meet Kami''s active-user criteria (non-test account, not removed, in good standing). Qualification is determined when Kami verifies the referral.',
  '$2.00 USD per qualified referral (default tier). Tiered rates may apply based on referral volume as shown in your dashboard.',
  'Occasional promotional bonus opportunities may be offered by Kami. Any active bonus programs are shown in your Ambassador Dashboard when available.',
  'Monthly earnings are subject to the maximum spend cap shown in your dashboard. Referrals that would exceed the cap may be marked Cap Reached.',
  'Approved earnings are eligible for payout once your owed balance reaches the payout threshold shown in your dashboard.',
  'Payouts are processed monthly for approved balances that meet the payout threshold, unless otherwise noted in your dashboard.',
  'ambassador_terms_v1'
where not exists (
  select 1 from public.ambassador_program_settings where is_active = true
);

create or replace function public.kami_resolve_auth_app_user_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select u.id
    from public.users u
   where u.auth_user_id = auth.uid()
   limit 1;
$$;

revoke all on function public.kami_resolve_auth_app_user_id() from public;
grant execute on function public.kami_resolve_auth_app_user_id() to authenticated;

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
      'Your rate: $%s per qualified referral. Tiers: %s',
      to_char(coalesce(v_profile.rate_cents_per_registration, 0) / 100.0, 'FM999990.00'),
      coalesce(v_profile.rate_tiers::text, '[]')
    );
    if v_profile.maximum_spend_cents is not null then
      v_cap_text := format(
        '$%s USD maximum approved earnings per calendar month (profile cap). Global policy: %s',
        to_char(v_profile.maximum_spend_cents / 100.0, 'FM999990.00'),
        v_settings.monthly_earnings_limit
      );
    else
      v_cap_text := v_settings.monthly_earnings_limit;
    end if;
  else
    v_rate_text := v_settings.compensation_rate;
    v_cap_text := v_settings.monthly_earnings_limit;
  end if;

  return jsonb_build_object(
    'qualification_requirements', v_settings.qualification_requirements,
    'compensation_rate', v_rate_text,
    'bonus_opportunities', v_settings.bonus_opportunities,
    'monthly_earnings_limit', v_cap_text,
    'payout_threshold', v_settings.payout_threshold,
    'payout_schedule', v_settings.payout_schedule,
    'last_updated', v_settings.last_updated
  );
end;
$$;

revoke all on function public.kami_build_ambassador_program_parameters(uuid) from public;
grant execute on function public.kami_build_ambassador_program_parameters(uuid) to authenticated;

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

revoke all on function public.get_my_ambassador_agreement_status() from public;
grant execute on function public.get_my_ambassador_agreement_status() to authenticated;

create or replace function public.get_my_ambassador_dashboard()
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
  v_status jsonb;
  v_referral_code text;
  v_month_start timestamptz;
  v_month_qualified bigint;
  v_month_earned_cents bigint;
  v_remaining_cents integer;
  v_display_name text;
  v_handle text;
  v_avatar_url text;
  v_status_label text;
begin
  v_user_id := public.kami_resolve_auth_app_user_id();
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  v_status := public.get_my_ambassador_agreement_status();
  if coalesce(v_status->>'state', '') <> 'dashboard' then
    return jsonb_build_object(
      'ok', false,
      'error', 'dashboard_locked',
      'agreement_status', v_status
    );
  end if;

  select * into v_user from public.users where id = v_user_id;
  select * into v_profile from public.ambassador_profiles where user_id = v_user_id;
  select * into v_settings from public.ambassador_program_settings where is_active = true order by last_updated desc limit 1;

  select coalesce(up.display_name, up.username, 'Kami user'),
         coalesce(up.username, v_user.ig_handle, ''),
         up.avatar_url
    into v_display_name, v_handle, v_avatar_url
    from public.user_profiles up
   where up.user_id = v_user_id
   order by up.updated_at desc nulls last
   limit 1;

  select pl.code
    into v_referral_code
    from public.promotion_links pl
   where pl.owner_user_id = v_user_id
     and pl.link_type = 'user_referral'
     and pl.status = 'active'
   order by pl.created_at asc
   limit 1;

  v_month_start := date_trunc('month', now());

  select count(*)::bigint
    into v_month_qualified
    from public.referral_attributions ra
    join public.promotion_links pl on pl.id = ra.promotion_link_id
    join public.users ref_u on ref_u.id = ra.referred_user_id
   where pl.owner_user_id = v_user_id
     and pl.link_type = 'user_referral'
     and ra.qualified_at >= v_month_start
     and coalesce(ref_u.is_test_user, false) = false
     and ref_u.is_removed = false;

  select coalesce(sum(bl.amount_cents), 0)::bigint
    into v_month_earned_cents
    from public.bounty_ledger_entries bl
   where bl.ambassador_user_id = v_user_id
     and bl.created_at >= v_month_start
     and bl.status in ('approved', 'owed', 'paid');

  if v_profile.maximum_spend_cents is not null then
    v_remaining_cents := greatest(v_profile.maximum_spend_cents - v_month_earned_cents::integer, 0);
  else
    v_remaining_cents := null;
  end if;

  if v_profile.program_status = 'active' then
    v_status_label := 'Active Ambassador';
  elsif v_profile.program_status = 'inactive' then
    v_status_label := 'Paused';
  else
    v_status_label := initcap(replace(v_profile.program_status, '_', ' '));
  end if;

  return jsonb_build_object(
    'ok', true,
    'header', jsonb_build_object(
      'display_name', coalesce(v_display_name, 'Kami Ambassador'),
      'handle', coalesce(v_handle, ''),
      'email', coalesce(v_user.auth_email, ''),
      'avatar_url', v_avatar_url,
      'status_label', v_status_label,
      'program_status', v_profile.program_status,
      'status', v_profile.status
    ),
    'referral', jsonb_build_object(
      'code', coalesce(v_referral_code, ''),
      'link', case
        when v_referral_code is not null and length(trim(v_referral_code)) > 0
          then 'https://www.kamisocial.com/invite/' || v_referral_code
        else ''
      end
    ),
    'metrics', jsonb_build_object(
      'current_month_qualified_referrals', coalesce(v_month_qualified, 0),
      'pending_earnings_cents', coalesce(v_profile.accrued_cents, 0) - coalesce(v_profile.owed_cents, 0),
      'approved_earnings_cents', coalesce(v_profile.owed_cents, 0),
      'lifetime_earnings_cents', coalesce(v_profile.accrued_cents, 0),
      'monthly_earnings_limit_cents', v_profile.maximum_spend_cents,
      'remaining_eligible_earnings_cents', v_remaining_cents,
      'paid_this_month_cents', (
        select coalesce(sum(ap.amount_cents), 0)
          from public.ambassador_payments ap
         where ap.ambassador_user_id = v_user_id
           and ap.paid_at >= v_month_start
      ),
      'total_paid_lifetime_cents', coalesce(v_profile.paid_cents, 0)
    ),
    'program_parameters', public.kami_build_ambassador_program_parameters(v_user_id),
    'current_agreement_version', coalesce(v_settings.current_agreement_version, 'ambassador_terms_v1')
  );
end;
$$;

revoke all on function public.get_my_ambassador_dashboard() from public;
grant execute on function public.get_my_ambassador_dashboard() to authenticated;

create or replace function public.get_my_ambassador_referrals()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_rows jsonb;
begin
  v_user_id := public.kami_resolve_auth_app_user_id();
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select coalesce(jsonb_agg(row order by row->>'date' desc), '[]'::jsonb)
    into v_rows
    from (
      select jsonb_build_object(
        'date', ra.created_at,
        'name', coalesce(up.display_name, up.username, 'Kami user'),
        'handle', coalesce(up.username, ref_u.ig_handle, ''),
        'avatar_url', up.avatar_url,
        'qualification_status', case
          when ra.status = 'rejected' then 'Rejected'
          when ra.status = 'qualified' or ra.qualified_at is not null then 'Qualified'
          when exists (
            select 1 from public.bounty_ledger_entries bl
             where bl.referral_attribution_id = ra.id and bl.status = 'paid'
          ) then 'Paid'
          when ra.metadata->>'cap_reached' = 'true' then 'Cap Reached'
          else 'Pending'
        end,
        'applied_rate', coalesce(ra.metadata->>'applied_rate', ra.metadata->>'rate_tier', ''),
        'earnings_cents', coalesce((
          select sum(bl.amount_cents)
            from public.bounty_ledger_entries bl
           where bl.referral_attribution_id = ra.id
        ), 0),
        'reason', coalesce(ra.metadata->>'rejection_reason', ra.metadata->>'reason', '')
      ) as row
        from public.referral_attributions ra
        join public.promotion_links pl on pl.id = ra.promotion_link_id
        join public.users ref_u on ref_u.id = ra.referred_user_id
        left join lateral (
          select display_name, username, avatar_url
            from public.user_profiles
           where user_id = ref_u.id
           order by updated_at desc nulls last
           limit 1
        ) up on true
       where pl.owner_user_id = v_user_id
         and pl.link_type = 'user_referral'
       order by ra.created_at desc
       limit 200
    ) q;

  return jsonb_build_object('ok', true, 'referrals', v_rows);
end;
$$;

revoke all on function public.get_my_ambassador_referrals() from public;
grant execute on function public.get_my_ambassador_referrals() to authenticated;

create or replace function public.get_my_ambassador_payout_history()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_rows jsonb;
begin
  v_user_id := public.kami_resolve_auth_app_user_id();
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select coalesce(jsonb_agg(row order by row->>'paid_date' desc), '[]'::jsonb)
    into v_rows
    from (
      select jsonb_build_object(
        'period', case
          when ap.period_start is not null and ap.period_end is not null
            then to_char(ap.period_start, 'Mon YYYY') || ' – ' || to_char(ap.period_end, 'Mon DD, YYYY')
          when ap.period_start is not null then to_char(ap.period_start, 'Mon YYYY')
          else to_char(ap.paid_at, 'Mon YYYY')
        end,
        'qualified_referrals', null,
        'gross_earnings_cents', ap.amount_cents,
        'adjustments_cents', 0,
        'approved_amount_cents', ap.amount_cents,
        'paid_amount_cents', ap.amount_cents,
        'paid_date', ap.paid_at,
        'status', 'Paid',
        'notes', coalesce(ap.notes, ap.payment_reference, '')
      ) as row
        from public.ambassador_payments ap
       where ap.ambassador_user_id = v_user_id
       order by ap.paid_at desc
       limit 100
    ) q;

  return jsonb_build_object('ok', true, 'payouts', v_rows);
end;
$$;

revoke all on function public.get_my_ambassador_payout_history() from public;
grant execute on function public.get_my_ambassador_payout_history() to authenticated;

create or replace function public.get_my_ambassador_change_ledger()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_rows jsonb;
begin
  v_user_id := public.kami_resolve_auth_app_user_id();
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select coalesce(jsonb_agg(row order by row->>'date' desc), '[]'::jsonb)
    into v_rows
    from (
      select jsonb_build_object(
        'date', ae.created_at,
        'change_type', ae.event_type,
        'previous_value', ae.old_value,
        'new_value', ae.new_value,
        'notes', ae.notes
      ) as row
        from public.ambassador_audit_events ae
       where ae.ambassador_user_id = v_user_id
       order by ae.created_at desc
       limit 200
    ) q;

  return jsonb_build_object('ok', true, 'ledger', v_rows);
end;
$$;

revoke all on function public.get_my_ambassador_change_ledger() from public;
grant execute on function public.get_my_ambassador_change_ledger() to authenticated;

create or replace function public.get_my_ambassador_agreement_history()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_settings public.ambassador_program_settings%rowtype;
  v_current_version text;
  v_current_acceptance public.ambassador_agreement_acceptances%rowtype;
  v_historical jsonb;
begin
  v_user_id := public.kami_resolve_auth_app_user_id();
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select * into v_settings from public.ambassador_program_settings where is_active = true order by last_updated desc limit 1;
  v_current_version := coalesce(v_settings.current_agreement_version, 'ambassador_terms_v1');

  select *
    into v_current_acceptance
    from public.ambassador_agreement_acceptances aa
   where aa.ambassador_user_id = v_user_id
     and aa.agreement_version = v_current_version
   order by aa.accepted_at desc
   limit 1;

  select coalesce(jsonb_agg(row order by row->>'accepted_at' desc), '[]'::jsonb)
    into v_historical
    from (
      select jsonb_build_object(
        'version', aa.agreement_version,
        'accepted_at', aa.accepted_at,
        'agreement_snapshot', aa.agreement_snapshot,
        'program_parameters_snapshot', aa.program_parameters_snapshot
      ) as row
        from public.ambassador_agreement_acceptances aa
       where aa.ambassador_user_id = v_user_id
         and aa.agreement_version <> v_current_version
       order by aa.accepted_at desc
    ) q;

  return jsonb_build_object(
    'ok', true,
    'current_agreement', case
      when v_current_acceptance.id is null then null
      else jsonb_build_object(
        'version', v_current_acceptance.agreement_version,
        'accepted_at', v_current_acceptance.accepted_at,
        'agreement_snapshot', v_current_acceptance.agreement_snapshot,
        'program_parameters_snapshot', v_current_acceptance.program_parameters_snapshot
      )
    end,
    'historical_agreements', coalesce(v_historical, '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_my_ambassador_agreement_history() from public;
grant execute on function public.get_my_ambassador_agreement_history() to authenticated;

create or replace function public.accept_my_ambassador_agreement(
  p_agreement_version text,
  p_agreement_snapshot text,
  p_program_parameters_snapshot jsonb default null,
  p_ip_address text default null,
  p_user_agent text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_user public.users%rowtype;
  v_profile public.ambassador_profiles%rowtype;
  v_settings public.ambassador_program_settings%rowtype;
  v_required_version text;
  v_params jsonb;
  v_acceptance_id uuid;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  v_user_id := public.kami_resolve_auth_app_user_id();
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'app_user_not_found');
  end if;

  select * into v_user from public.users where id = v_user_id;
  if coalesce(v_user.user_type, '') <> 'ambassador' then
    return jsonb_build_object('ok', false, 'error', 'not_ambassador');
  end if;

  select * into v_profile from public.ambassador_profiles where user_id = v_user_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'profile_not_found');
  end if;

  if v_profile.program_status <> 'active' then
    return jsonb_build_object('ok', false, 'error', 'program_not_active');
  end if;

  select * into v_settings from public.ambassador_program_settings where is_active = true order by last_updated desc limit 1;
  v_required_version := coalesce(v_settings.current_agreement_version, 'ambassador_terms_v1');

  if coalesce(p_agreement_version, '') <> v_required_version then
    return jsonb_build_object('ok', false, 'error', 'agreement_version_mismatch', 'required_version', v_required_version);
  end if;

  if coalesce(length(trim(p_agreement_snapshot)), 0) < 20 then
    return jsonb_build_object('ok', false, 'error', 'invalid_agreement_snapshot');
  end if;

  v_params := coalesce(p_program_parameters_snapshot, public.kami_build_ambassador_program_parameters(v_user_id));

  if exists (
    select 1 from public.ambassador_agreement_acceptances aa
     where aa.ambassador_user_id = v_user_id
       and aa.agreement_version = v_required_version
  ) then
    return jsonb_build_object('ok', true, 'already_accepted', true);
  end if;

  insert into public.ambassador_agreement_acceptances (
    ambassador_user_id,
    agreement_version,
    agreement_snapshot,
    program_parameters_snapshot,
    accepted_by_auth_user_id,
    ip_address,
    user_agent
  )
  values (
    v_user_id,
    v_required_version,
    p_agreement_snapshot,
    v_params,
    auth.uid(),
    nullif(trim(p_ip_address), ''),
    nullif(trim(p_user_agent), '')
  )
  returning id into v_acceptance_id;

  update public.ambassador_profiles
     set agreement_status = 'signed',
         agreement_version = v_required_version,
         agreement_signed_at = now(),
         ambassador_terms_version = v_required_version,
         ambassador_terms_accepted_at = now(),
         updated_at = now()
   where user_id = v_user_id;

  insert into public.ambassador_audit_events (
    ambassador_user_id,
    actor_admin_user_id,
    event_type,
    old_value,
    new_value,
    notes
  )
  values (
    v_user_id,
    null,
    'Agreement Accepted',
    null,
    jsonb_build_object('agreement_version', v_required_version, 'acceptance_id', v_acceptance_id),
    'Ambassador accepted the program agreement via the public portal.'
  );

  return jsonb_build_object('ok', true, 'acceptance_id', v_acceptance_id);
end;
$$;

revoke all on function public.accept_my_ambassador_agreement(text, text, jsonb, text, text) from public;
grant execute on function public.accept_my_ambassador_agreement(text, text, jsonb, text, text) to authenticated;

create or replace function public.terminate_my_ambassador_participation(p_confirmation text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_user public.users%rowtype;
  v_profile public.ambassador_profiles%rowtype;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  if coalesce(trim(p_confirmation), '') <> 'LEAVE' then
    return jsonb_build_object('ok', false, 'error', 'confirmation_required');
  end if;

  v_user_id := public.kami_resolve_auth_app_user_id();
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'app_user_not_found');
  end if;

  select * into v_user from public.users where id = v_user_id;
  if coalesce(v_user.user_type, '') <> 'ambassador' then
    return jsonb_build_object('ok', false, 'error', 'not_ambassador');
  end if;

  select * into v_profile from public.ambassador_profiles where user_id = v_user_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'profile_not_found');
  end if;

  if v_profile.program_status = 'inactive' then
    return jsonb_build_object('ok', false, 'error', 'already_inactive');
  end if;

  update public.ambassador_profiles
     set program_status = 'inactive',
         status = 'self_terminated',
         deactivated_at = now(),
         updated_at = now(),
         metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('self_terminated_at', now())
   where user_id = v_user_id;

  insert into public.ambassador_audit_events (
    ambassador_user_id,
    actor_admin_user_id,
    event_type,
    old_value,
    new_value,
    notes
  )
  values (
    v_user_id,
    null,
    'Ambassador Terminated',
    jsonb_build_object('program_status', v_profile.program_status, 'status', v_profile.status),
    jsonb_build_object('program_status', 'inactive', 'status', 'self_terminated'),
    'Ambassador left the program via the public portal.'
  );

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.terminate_my_ambassador_participation(text) from public;
grant execute on function public.terminate_my_ambassador_participation(text) to authenticated;
