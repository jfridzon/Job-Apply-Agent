# Configuration

All files live in `config/`, are git-ignored, and start as copies of the `.example.json` files. Patterns are case-insensitive regular expressions; use `\\b` for whole words, or `intern` will also match "international".

**profile.json**: who the user is. An empty value means "ask", so the job waits instead of getting a guess.

| Field | Use |
|---|---|
| `work_authorization.never_claim` | Words no answer may claim, such as a status the user doesn't hold |
| `declarations` | Yes/no facts forms ask for. `""` sends the question to the user |
| `resumes` | `default`, plus one per track id in `rules.json` |
| `facts` | True statements and stories the assistant may use in open answers |
| `consents` | Which boxes the agent may tick |

**rules.json**: what fits. `fit()` answers yes, no or unsure.

| Field | Use |
|---|---|
| `titles_include`, `titles_exclude` | Decide on the title |
| `locations_include`, `locations_exclude`, `companies_exclude` | Where and who |
| `text_exclude` | `{ pattern, why }` found anywhere in the posting: no |
| `text_require_any` | None of these in the posting: no |
| `unsure_when_missing` | `{ pattern, why }` absent from the posting: unsure |
| `max_years` | The most experience a posting may require |
| `blocked_work_statuses` | Postings that rule these out are skipped |
| `tracks` | `{ id, pattern }` on the title, to pick a resume |
| `score` | `{ pattern, in, points, why }` to order what fits, from 0 to 100 |

**answers.json**: `{ "rules": [{ "pattern", "answer" }] }` for questions that come back often.

**sources.json**: see [SOURCES.md](SOURCES.md).

**agent.json**

| Field | Use |
|---|---|
| `time_zone`, `quiet_hours` | `{ days: ["sat"], from: "00:00", to: "24:00" }`; windows can cross midnight |
| `pause_file` | A file in a synced folder, to pause from a phone |
| `max_per_run` | Most applications per run |
| `finish_wait_minutes` | How long the agent waits for the user's step |
| `budget` | Weekly ceiling, share kept for the user, runs per day |
| `email` | Address of the daily email and the connector that sends it |
