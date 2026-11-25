// Public job-board endpoints. No account and no scraping: they exist so companies can show their own openings.
// Every source returns the same shape: { url, company, title, location, text, posted, ats }.
const UA = { 'user-agent': 'job-apply-agent' };
async function get(url, init = {}) {
  const r = await fetch(url, { ...init, headers: { ...UA, ...init.headers }, signal: AbortSignal.timeout(25000) });
  if (!r.ok) throw Object.assign(new Error(`${r.status} from ${new URL(url).hostname}`), { status: r.status });
  return r.json();
}
const ENTITIES = { lt: '<', gt: '>', amp: '&', quot: '"', nbsp: ' ', rsquo: "'", lsquo: "'", ndash: '-', mdash: '-', bull: '•' };
const decode = (s) => s.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(n)).replace(/&(\w+);/g, (m, n) => ENTITIES[n] ?? ' ');
export const plain = (html = '') => decode(decode(String(html ?? '')).replace(/<\/(p|li|div|h\d|ul|ol)>|<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' ')).replace(/[^\S\n]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
const enc = encodeURIComponent;

async function* pages(limit, read) { for (let page = 0; page < limit; page++) { const list = await read(page); yield* list; if (!list.length) return; } }

// Each takes the company's board name (see docs/SOURCES.md) and a `wanted(title)` filter, so that systems that need
// one request per posting only open the ones worth reading.
export const BOARDS = {
  greenhouse: async (b) => (await get(`https://boards-api.greenhouse.io/v1/boards/${enc(b)}/jobs?content=true`)).jobs
    .map((j) => ({ url: j.absolute_url, company: j.company_name || b, title: j.title, location: j.location?.name, text: plain(j.content), posted: j.first_published || j.updated_at })),
  lever: async (b) => (await get(`https://api.lever.co/v0/postings/${enc(b)}?mode=json`))
    .map((j) => ({ url: j.hostedUrl, company: b, title: j.text, location: (j.categories?.allLocations || [j.categories?.location]).filter(Boolean).join('; '), text: [j.descriptionPlain, ...(j.lists || []).map((l) => `${l.text}\n${plain(l.content)}`), j.additionalPlain].filter(Boolean).join('\n'), posted: j.createdAt })),
  ashby: async (b) => (await get(`https://api.ashbyhq.com/posting-api/job-board/${enc(b)}`)).jobs.filter((j) => j.isListed !== false)
    .map((j) => ({ url: j.jobUrl, company: b, title: j.title, location: [j.location, ...(j.secondaryLocations || []).map((x) => x.location), j.isRemote ? 'Remote' : ''].filter(Boolean).join('; '), text: plain(j.descriptionHtml), posted: j.publishedAt })),
  workable: async (b) => { const r = await get(`https://apply.workable.com/api/v1/widget/accounts/${enc(b)}?details=true`); return r.jobs
    .map((j) => ({ url: j.url, company: r.name || b, title: j.title, location: [j.city, j.state, j.country, j.telecommuting ? 'Remote' : ''].filter(Boolean).join(', '), text: plain(j.description), posted: j.published_on })); },
  recruitee: async (b) => (await get(`https://${enc(b)}.recruitee.com/api/offers/`)).offers
    .map((j) => ({ url: j.careers_url, company: j.company_name || b, title: j.title, location: [j.location, j.remote ? 'Remote' : ''].filter(Boolean).join('; '), text: plain(`${j.description}\n${j.requirements}`), posted: j.published_at })),
  smartrecruiters: async (b, wanted = () => true) => {
    const out = [];
    for await (const j of pages(20, async (p) => (await get(`https://api.smartrecruiters.com/v1/companies/${enc(b)}/postings?limit=100&offset=${p * 100}`)).content)) {
      if (!wanted(j.name)) continue;
      const d = await get(`https://api.smartrecruiters.com/v1/companies/${enc(b)}/postings/${enc(j.id)}`);
      out.push({ url: d.postingUrl || `https://jobs.smartrecruiters.com/${b}/${j.id}`, company: j.company?.name || b, title: j.name, location: [j.location?.city, j.location?.region, j.location?.country, j.location?.remote ? 'Remote' : ''].filter(Boolean).join(', '), text: Object.values(d.jobAd?.sections || {}).map((s) => plain(s.text)).join('\n'), posted: j.releasedDate });
    }
    return out;
  },
  // "tenant/wd5/site" as it appears in https://tenant.wd5.myworkdayjobs.com/site
  workday: async (b, wanted = () => true) => {
    const [tenant, dc, site] = b.split('/'), base = `https://${tenant}.${dc}.myworkdayjobs.com`, api = `${base}/wday/cxs/${tenant}/${site}`;
    const out = [];
    for await (const j of pages(25, async (p) => (await get(`${api}/jobs`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ limit: 20, offset: p * 20, searchText: '', appliedFacets: {} }) })).jobPostings)) {
      if (!j.externalPath || !wanted(j.title)) continue;
      const d = (await get(`${api}${j.externalPath}`)).jobPostingInfo;
      out.push({ url: d.externalUrl || `${base}/${site}${j.externalPath}`, company: tenant, title: d.title, location: [d.location, ...(d.additionalLocations || [])].filter(Boolean).join('; '), text: plain(d.jobDescription), posted: d.startDate });
    }
    return out;
  },
};

// Aggregators with a public API, searched by the user's own terms. Remotive asks to be named as the source.
export const FEEDS = {
  remotive: async ({ queries = [] }, wanted = () => true) => {
    const out = [];
    for (const q of queries) for (const j of (await get(`https://remotive.com/api/remote-jobs?search=${enc(q)}`)).jobs) if (wanted(j.title)) out.push({ url: j.url, company: j.company_name, title: j.title, location: `Remote; ${j.candidate_required_location || ''}`, text: plain(j.description), posted: j.publication_date });
    return out;
  },
  arbeitnow: async ({ max_pages = 2 }, wanted = () => true) => {
    const out = [];
    for await (const j of pages(max_pages, async (p) => (await get(`https://www.arbeitnow.com/api/job-board-api?page=${p + 1}`)).data)) if (wanted(j.title)) out.push({ url: j.url, company: j.company_name, title: j.title, location: [j.location, j.remote ? 'Remote' : ''].filter(Boolean).join('; '), text: plain(j.description), posted: j.created_at * 1000 });
    return out;
  },
};
