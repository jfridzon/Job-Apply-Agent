# Setup interview

Ask in the user's language, a few questions at a time, and skip what their resume already answers. Say why you ask, and that the answers stay on their computer except for what they send to you (their AI provider) and to employers. "Decline" is always a valid answer to a sensitive question, and a blank field means "ask me".

1. **The work.** Which roles, and which would they love most? Level and years? Industries, companies or kinds of work to avoid? Dream companies? → `titles_*`, `companies_exclude`, `text_exclude`, `max_years`, `score`
2. **Where and when.** Countries, cities, remote, relocation. Earliest start. Must a posting say something specific, such as a start date? → `locations_*`, `unsure_when_missing`, `preferences`
3. **Pay.** The least they'd accept and what to ask for. → `preferences.salary`
4. **Right to work.** Country of the jobs, authorized or not, sponsorship now or later, exact status. Which statuses do postings rule out? Which statements must never be made about them? → `work_authorization`, `blocked_work_statuses`
5. **Identity and contact.** Name as it should appear, email, phone, address, links. → `identity`, `address`
6. **Background.** Education, jobs, languages, licenses. Resume versions and the kind of role for each. → `education`, `experience`, `resumes`, `tracks`
7. **Yes or no facts forms ask for.** Age, background checks, earlier employment there, relatives, non-compete, criminal record, clearance. Ask, never assume. → `declarations`
8. **True stories for open questions.** Projects, a failure, a conflict, why this field. Write down only what they say, and ask for a sample of their writing so answers sound like them. → `facts`
9. **Consents.** May the agent accept privacy notices? AI-use policies? Certify that the application is accurate? Arbitration? → `consents`
10. **Optional self-identification.** Use the form of their country. → `self_id`
11. **Sources.** Target companies, sites they have accounts on, alerts they receive. → `sources.json`
12. **Rhythm.** Hours the agent may work, days it must not, how many applications per run, how much AI usage to keep for themselves, and when the email should arrive. → `agent.json`
13. **Language** of the review queue and the email. English unless they say otherwise. → `language`

Read it all back as a short summary and fix what's wrong before saving.
