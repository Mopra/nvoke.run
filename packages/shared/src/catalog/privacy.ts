// The Privacy group of the catalog: its endpoints.

import { OptOutRequest, OptOutResponse } from '../privacy.ts';
import type { Endpoint } from './types.ts';

export const privacyEndpoints: Endpoint[] = [
  {
    id: 'optOut',
    method: 'POST',
    path: '/v1/privacy/opt-out',
    group: 'Privacy',
    summary: 'Opt an address or domain out',
    description: 'Stops collection of an address or a whole domain and deletes what we hold. Always answers `{ ok: true }`.',
    auth: 'public',
    body: OptOutRequest,
    status: 200,
    response: OptOutResponse,
    errors: ['invalid_request'],
  },
];
