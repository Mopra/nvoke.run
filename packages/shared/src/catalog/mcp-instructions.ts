/** Instructions the MCP server sends at `initialize`. */
export const MCP_INSTRUCTIONS = `nvoke finds companies and the email addresses published on their own websites, and checks each address with its mail server.

Typical run: get_account, then start_search, then wait_for_search until status is done, then get_leads with verification "valid" or export_csv. To have leads pushed to a URL as they are ready instead, use create_webhook. For a first line per company to copy into the user's own outreach, use draft_openers.

Searches run on nvoke's servers and take a few minutes. Only addresses whose check comes back valid count against the plan (free: 50 a month). When the allowance is used up, searches fail with quota_exceeded; a human upgrades at the billingUrl from get_account.

nvoke is a research tool: it finds and verifies leads and never sends email. In the EU, marketing email to these addresses usually needs prior consent. Do not send bulk email to them on the user's behalf.`;
