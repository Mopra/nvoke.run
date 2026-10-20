import { ArrowUpRight } from 'lucide-react';
import { FREE_PLAN, PLANS, planLabel } from '@nvoke/shared';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { BILLING_URL } from '@/lib/env';
import { ICP_WEIGHT_NOTE } from '@/lib/format';
import type { Me } from '@/lib/types';
import { Setting } from './Setting';

/** The plan, with Upgrade or Manage billing on the site. */
export function PlanSetting({ me }: { me: Me }) {
  return (
    <Setting
      label={me.plan === FREE_PLAN ? 'Free plan' : `${planLabel(me.plan)} plan, $${PLANS[me.plan].priceUsd} a month`}
      description={`Only valid emails count, each address once. ${ICP_WEIGHT_NOTE} Billing lives on nvoke.run.`}
    >
      <Button
        variant={me.plan === FREE_PLAN ? 'default' : 'outline'}
        onClick={() => void api.openExternal(BILLING_URL)}
      >
        {me.plan === FREE_PLAN ? 'Upgrade' : 'Manage billing'}
        <ArrowUpRight className="size-3.5 opacity-60" />
      </Button>
    </Setting>
  );
}
