# Sources

## Company boards

Open a company's careers page and look at the address of a posting:

| System | Looks like | Write |
|---|---|---|
| Greenhouse | `boards.greenhouse.io/NAME/jobs/…` | `NAME` |
| Lever | `jobs.lever.co/NAME/…` | `NAME` |
| Ashby | `jobs.ashbyhq.com/NAME/…` | `NAME` |
| Workable | `apply.workable.com/NAME/…` | `NAME` |
| Recruitee | `NAME.recruitee.com` | `NAME` |
| SmartRecruiters | `jobs.smartrecruiters.com/NAME/…` | `NAME` |
| Workday | `TENANT.wd5.myworkdayjobs.com/SITE` | `TENANT/wd5/SITE` |

These are the endpoints companies use to show their own openings. The sweep makes one request at a time per system and stops for the night when one asks it to slow down. Workday limits most: a few companies at a time is enough.

## Feeds

- `remotive`: remote jobs, by search terms. Listings link back to Remotive.
- `arbeitnow`: jobs in Europe, newest first.

## Sites the user signs in to

For a university board, an alumni network or a niche community:

1. Read the site's terms. If they forbid automated access, don't add it.
2. `npm run browser -- https://the-site` and sign in by hand. The session stays in the agent's own Chrome profile.
3. Add it to `sites` with its search address, the pattern of a posting's link, and the pattern of its sign-in page.
4. The user sets `enabled` and `terms_checked` to `true`.

`npm run sites` reads a few pages slowly, prefers the employer's own link, and stops at a bot check, a sign-in page or a request to slow down. It never applies inside the site.

## Email alerts and links

LinkedIn, Indeed and other sites that don't allow automation still send job alerts. Turn those on: the daily prompt reads them and adds the links to `data/leads.jsonl`. Anything else the user finds can go there too.
