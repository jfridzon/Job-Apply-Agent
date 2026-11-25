# Scheduling

The scripts need a computer that is on. Two ways to run them:

- **With an assistant** (recommended): schedule [nightly.md](../prompts/nightly.md) and [email.md](../prompts/email.md) in Claude Code, Codex or any assistant with scheduled tasks. Allow only the `npm run` commands of this repository, so an unattended run never waits for a click or does more than you expect.
- **Scripts only**: run `npm run night` with cron, launchd or Task Scheduler. It sweeps, fills and builds the email file. Unsure postings and open questions wait for you.

Add `-- --submit` only after the dry runs look right.

Pick hours when the assistant's usage window ends before your day starts. `npm run budget` keeps a share of the weekly limit for you, and stops when the assistant looks in use.

**Pause** from anywhere: create `data/pause` (empty, or with a date to resume), or a phone shortcut that writes the file set in `pause_file`.
