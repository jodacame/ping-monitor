import { useEffect, useState } from 'react';
import { api } from './api';

export interface RegistrationStatus {
  /** Clean install with no users yet — show first-account onboarding. */
  needsSetup: boolean;
  /** Whether the register form should be offered at all. */
  registrationOpen: boolean;
}

/**
 * Fetches the instance registration state once. On failure it fails closed
 * (no setup, registration closed) so a broken call never exposes signup.
 */
export function useRegistration(): { status: RegistrationStatus | null; loading: boolean } {
  const [status, setStatus] = useState<RegistrationStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    api
      .registrationStatus()
      .then((s) => active && setStatus(s))
      .catch(() => active && setStatus({ needsSetup: false, registrationOpen: false }))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  return { status, loading };
}
