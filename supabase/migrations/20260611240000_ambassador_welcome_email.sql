-- Ambassador welcome email: idempotency + delivery log + accept RPC metadata.

alter table public.ambassador_profiles
  add column if not exists welcome_email_sent_at timestamptz null;

comment on column public.ambassador_profiles.welcome_email_sent_at is
  'When the first-time ambassador welcome email was successfully sent. Null means not sent yet.';

create table if not exists public.email_delivery_log (
  id uuid primary key default gen_random_uuid(),
  email_type text not null,
  recipient_user_id uuid not null references public.users(id) on delete cascade,
  recipient_email text not null,
  subject text not null,
  status text not null check (status in ('sent', 'failed', 'skipped')),
  provider_message_id text null,
  failure_reason text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  sent_at timestamptz null
);

create unique index if not exists email_delivery_log_recipient_type_uidx
  on public.email_delivery_log (recipient_user_id, email_type);

create index if not exists email_delivery_log_type_created_idx
  on public.email_delivery_log (email_type, created_at desc);

comment on table public.email_delivery_log is
  'Outbound email delivery records for admin visibility and idempotency.';

alter table public.email_delivery_log enable row level security;
revoke all on public.email_delivery_log from anon, authenticated;
grant select, insert, update on public.email_delivery_log to service_role;

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
  v_prior_acceptance_count integer;
  v_is_first_acceptance boolean;
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

  select count(*)::integer
    into v_prior_acceptance_count
    from public.ambassador_agreement_acceptances aa
   where aa.ambassador_user_id = v_user_id;

  if exists (
    select 1 from public.ambassador_agreement_acceptances aa
     where aa.ambassador_user_id = v_user_id
       and aa.agreement_version = v_required_version
  ) then
    return jsonb_build_object(
      'ok', true,
      'already_accepted', true,
      'acceptance_id', null,
      'ambassador_user_id', v_user_id,
      'first_agreement_acceptance', false,
      'welcome_email_sent', v_profile.welcome_email_sent_at is not null
    );
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

  v_is_first_acceptance := v_prior_acceptance_count = 0;

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

  return jsonb_build_object(
    'ok', true,
    'acceptance_id', v_acceptance_id,
    'ambassador_user_id', v_user_id,
    'first_agreement_acceptance', v_is_first_acceptance,
    'welcome_email_sent', v_profile.welcome_email_sent_at is not null
  );
end;
$$;
