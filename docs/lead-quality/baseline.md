# Lead quality: baseline

The pipeline as it was on 2026-10-17 (commit 1c28b2c), before the lead
quality work, measured with `pnpm eval --label baseline --minutes 60
--smtp-per-minute 5` from a clean copy of that commit. SMTP at 5 sessions a
minute is what production allowed. Each entry runs the searches a user
could run for it that day (`apps/server/src/bench/eval-suite.ts`), all at
once, against real sources and real mail servers. Raw output:
`apps/server/.bench/eval/baseline-2026-10-17T17-47-58-273Z.json`
(gitignored).

## Against the bar (nvoke-customers, 60 minutes)

| bar | target | baseline |
|---|--:|--:|
| verified emails in an hour | 300 | 47 |
| named people among verified | 70% | 0% (no names extracted) |
| decision makers among verified | 50% | 0% |
| blind review, would email | 25 of 30 | 5 of 30 |
| companies that clearly fit | (no bar) | 40% of 25 |
| short search keeps pushing | yes | no, it ends |
| cost per verified email | at most $0.0015 | $0.003 (Brave only) |

## What the numbers say

- Verification is the wall: 3,176 addresses found, 2,774 still unchecked
  after an hour at 5 SMTP sessions a minute. 237 verified in all.
- The finds are inboxes, not people: 0 named, and the judge turned down
  info@, hello@, privacy@ and university staff pages.
- Fit is weak: one keyword per search pulls in directories, media and
  adjacent businesses (40% clear fit for nvoke's customers, 8% for
  accountants in Copenhagen, where OpenStreetMap was down and the web
  fallback found university and directory pages).
- Launches finds products, not reachable founders: 0 of 30.
- Where it works (accountants 26 of 30, recruiters 17 of 30) the sites
  print personal addresses of the owners themselves.

## End, 60.0 min

| entry | min | ended | companies | crawled | w/ email | emails | pers/gen | named/titled/DM | valid | valid rate | catch-all/unk/inv/pending | valid pers/named | pattern/valid | Brave req+hits | Brave $ (paid) | AI $ | $/valid |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| nvoke-customers | 60.0 | 0/4 | 330 | 330 | 262 | 675 | 329/346 | 0/0/0 | 47 | 41% | 65/0/2/561 | 25/0 | 0/0 | 24+0 | $0.120 ($0.120) | $0.000 | $0.003 |
| dentists-aarhus | 60.0 | 0/1 | 63 | 63 | 50 | 364 | 318/46 | 0/0/0 | 29 | 78% | 8/0/0/327 | 23/0 | 0/0 | 0+14 | $0.070 ($0.000) | $0.000 | $0.002 |
| accountants-copenhagen | 60.0 | 0/1 | 53 | 53 | 38 | 702 | 659/43 | 0/0/0 | 67 | 74% | 23/0/0/612 | 64/0 | 0/0 | 10+0 | $0.050 ($0.050) | $0.000 | $0.001 |
| software-agencies-de | 60.0 | 0/1 | 80 | 80 | 64 | 187 | 97/90 | 0/0/0 | 7 | 15% | 38/0/2/140 | 2/0 | 0/0 | 6+0 | $0.030 ($0.030) | $0.000 | $0.004 |
| shopify-agencies-us | 60.0 | 0/1 | 79 | 79 | 62 | 102 | 26/76 | 0/0/0 | 7 | 50% | 7/0/0/88 | 3/0 | 0/0 | 6+0 | $0.030 ($0.030) | $0.000 | $0.004 |
| recruiters-london | 60.0 | 0/1 | 82 | 82 | 64 | 481 | 420/61 | 0/0/0 | 39 | 81% | 6/0/3/433 | 30/0 | 0/0 | 6+0 | $0.030 ($0.030) | $0.000 | $0.001 |
| law-firms-munich | 60.0 | 0/1 | 100 | 100 | 90 | 335 | 256/79 | 0/0/0 | 21 | 78% | 0/6/0/308 | 14/0 | 0/0 | 39+0 | $0.195 ($0.195) | $0.000 | $0.009 |
| launches | 60.0 | 0/1 | 100 | 100 | 70 | 89 | 19/70 | 0/0/0 | 7 | 88% | 1/0/0/81 | 0/0 | 0/0 | 0+0 | $0.000 ($0.000) | $0.000 | $0.000 |
| hard-pump-makers | 60.0 | 0/1 | 99 | 99 | 69 | 241 | 154/87 | 0/0/0 | 13 | 76% | 4/0/0/224 | 10/0 | 0/0 | 6+0 | $0.030 ($0.030) | $0.000 | $0.002 |
| **total** | 60.0 | 0/12 | 986 | 986 | 769 | 3176 | 2278/898 | 0/0/0 | 237 | 59% | 152/6/7/2774 | 171/0 | 0/0 | 97+14 | $0.555 ($0.485) | $0.000 | $0.002 |


## Judges ($0.164, not in product cost)

| entry | ICP mean fit | clear fit | would email |
|---|--:|--:|--:|
| nvoke-customers | 1.20 | 40% of 25 | 5/30 |
| dentists-aarhus | 1.00 | 32% of 25 | 0/30 |
| accountants-copenhagen | 0.56 | 8% of 25 | 26/30 |
| software-agencies-de | 0.88 | 20% of 25 | 1/30 |
| shopify-agencies-us | 1.32 | 44% of 25 | 0/30 |
| recruiters-london | 1.36 | 44% of 25 | 17/30 |
| law-firms-munich | 1.88 | 88% of 25 | 8/30 |
| launches | 0.48 | 0% of 25 | 0/30 |
| hard-pump-makers | 0.76 | 12% of 25 | 1/30 |


### Would email: nvoke-customers

| | address | kind | verification | company | why |
|---|---|---|---|---|---|
| yes | monikap@sopro.io | personal | valid | Sopro (sopro.io) | Named person at B2B lead gen firm, valid |
| no | privacy@saffronedge.com | generic | valid | Saffronedge (saffronedge.com) | Generic privacy inbox |
| no | alexander.ariel@monterro.com | personal | valid | Monterro (monterro.com) | Monterro is a PE investor, not a fit |
| yes | clare.price@headleymedia.com | personal | valid | Headley Media (headleymedia.com) | Named person at B2B marketing agency, valid |
| no | admin@chilipiper.com | generic | valid | Chili Piper (chilipiper.com) | Generic admin inbox |
| no | johan.blomdahl@monterro.com | personal | valid | Monterro (monterro.com) | Monterro is a PE investor, not a fit |
| no | donia.corvera@monterro.com | personal | valid | Monterro (monterro.com) | Monterro is a PE investor, not a fit |
| yes | tatjana.manojlovska@sopro.io | personal | valid | Sopro (sopro.io) | Named person at B2B lead gen firm, valid |
| no | jacob.fellman@monterro.com | personal | valid | Monterro (monterro.com) | Monterro is a PE investor, not a fit |
| yes | victoria.heyward@sopro.io | personal | valid | Sopro (sopro.io) | Named person at B2B lead gen firm, valid |
| yes | tanya@tigauk.com | personal | valid | Tigauk (tigauk.com) | Named person at B2B lead gen agency, valid |
| no | git@github.com | personal | valid | B2bsaaskit (b2bsaaskit.com) | git@github.com is not a real prospect |
| no | itsupport@directiveconsulting.com | personal | valid | Directive UK (directiveconsulting.com) | IT support inbox, not a decision maker |
| no | hr@demanddrive.com | generic | valid | demandDrive (demanddrive.com) | Generic HR inbox |
| no | careers@directiveconsulting.com | generic | valid | Directive (directiveconsulting.com) | Generic careers inbox |
| no | hi@velocitypartners.com | generic | valid | Velocity Partners (velocitypartners.com) | Generic hi@ inbox |
| no | contact@air-marketing.co.uk | generic | valid | Air Marketing (air-marketing.co.uk) | Generic contact inbox |
| no | contact@outboundleads.com | generic | valid | OutboundLeads (outboundleads.com) | Generic contact inbox |
| no | privacy@callboxinc.com | generic | valid | Callbox Inc. (callboxinc.com) | Generic privacy inbox |
| no | privacy@saleshandy.com | generic | valid | Saleshandy (saleshandy.com) | Generic privacy inbox |
| no | hadar.cars@monterro.com | personal | valid | Monterro (monterro.com) | Monterro is a PE investor, not a fit |
| no | huong.tran@monterro.com | personal | valid | Monterro (monterro.com) | Monterro is a PE investor, not a fit |
| no | brian.nordli@builtin.com | personal | valid | Built In (builtin.com) | Built In is a job board and media company, not a fit |
| no | support@chilipiper.com | generic | valid | Chili Piper (chilipiper.com) | Generic support inbox |
| no | madelene.magnusson@monterro.com | personal | valid | Monterro (monterro.com) | Monterro is a PE investor, not a fit |
| no | hello@siegemedia.com | generic | valid | Siege Media (siegemedia.com) | Generic hello@ inbox |
| no | legal@thegrowthsyndicate.com | generic | valid | Thegrowthsyndicate (thegrowthsyndicate.com) | Generic legal inbox |

wrote C:\Users\morte\AppData\Local\Temp\nvb\apps\server\.bench\eval\baseline-2026-10-17T17-47-58-273Z.json

