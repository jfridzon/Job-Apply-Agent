// The review page: jobs that need one step from the user, best use of their time first, and the jobs the rules could
// not decide. Keyboard first: acting on a job moves to the next one and offers Undo.
const CSS = `
:root{--bg:#f6f5f1;--panel:#fff;--fg:#1f1e1d;--mut:#6d6b65;--line:#e6e3da;--acc:#b9542f;--acc2:#fbeee8;--ok:#2f7d5b;--okbg:#e6f3ec;--warn:#8f5609;--warnbg:#fbf0dc;--blue:#2f6db0;--bluebg:#e6eff9;--pur:#6b52ae;--purbg:#eeeafa;--mutbg:#ecebe6}
@media (prefers-color-scheme:dark){:root{--bg:#191817;--panel:#232220;--fg:#f0eee6;--mut:#a5a299;--line:#35332f;--acc:#e08361;--acc2:#3b2a23;--ok:#6cc39b;--okbg:#20352b;--warn:#e0ab5c;--warnbg:#3a2e1b;--blue:#86b6ea;--bluebg:#1f2e3f;--pur:#b5a3ea;--purbg:#2c2740;--mutbg:#2c2b28}}
*{box-sizing:border-box}html,body{height:100%}body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif}
button,input{font:inherit;color:inherit}:focus-visible{outline:2px solid var(--acc);outline-offset:1px}
.app{display:grid;grid-template-columns:380px minmax(0,1fr);grid-template-rows:auto minmax(0,1fr);height:100vh}
header{grid-column:1/-1;display:flex;align-items:center;gap:10px;padding:12px 18px;background:var(--panel);border-bottom:1px solid var(--line)}header b{font-size:16px;margin-right:8px}
.tab{border:0;background:none;padding:7px 12px;border-radius:9px;cursor:pointer;color:var(--mut);font-weight:600}.tab.on{background:var(--acc2);color:var(--acc)}.tab span{font-weight:500;margin-left:6px}
#q{margin-left:auto;width:220px;min-width:0;padding:7px 11px;border:1px solid var(--line);border-radius:9px;background:var(--bg)}
.list{border-right:1px solid var(--line);overflow:auto;background:var(--panel)}
.row{display:block;width:100%;text-align:left;border:0;border-bottom:1px solid var(--line);border-left:3px solid transparent;background:none;padding:10px 14px;cursor:pointer}.row:hover{background:var(--bg)}.row.on{background:var(--acc2);border-left-color:var(--acc)}
.row .c{font-weight:600}.row .m{display:flex;gap:6px;align-items:center;margin-top:4px;color:var(--mut);font-size:12px;flex-wrap:wrap}
.tag{padding:1px 8px;border-radius:99px;font-size:12px;font-weight:500}
.detail{overflow:auto;padding:26px 32px 40px}.wrap{max-width:700px;margin:0 auto}.co{color:var(--mut);font-weight:600}h1{font-size:22px;line-height:1.25;margin:2px 0 12px}
.box{background:var(--panel);border:1px solid var(--line);border-radius:13px;padding:16px 18px;margin-bottom:14px}.need{font-size:15px;margin:0 0 10px}.box ol{margin:0 0 14px;padding-left:20px;color:var(--mut)}
.b{display:inline-flex;align-items:center;gap:7px;border:1px solid var(--line);background:var(--panel);border-radius:10px;padding:8px 13px;cursor:pointer;font-weight:500}.b:hover{border-color:var(--mut)}.b.p{background:var(--acc);border-color:var(--acc);color:#fff;font-size:15px;padding:11px 18px}.b:disabled{opacity:.55;cursor:wait}
@media (prefers-color-scheme:dark){.b.p{color:#191817}}
.acts{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.acts+.acts{margin-top:12px}
kbd{font:600 11px ui-monospace,Menlo,monospace;border:1px solid currentColor;border-radius:5px;padding:0 5px;opacity:.65}
.msg{margin-top:12px;min-height:20px}.msg.turn{background:var(--warnbg);color:var(--warn);border-radius:9px;padding:9px 12px;font-weight:600}a{color:var(--mut);font-size:13px}
summary{cursor:pointer;color:var(--mut);font-weight:600}.kv{display:grid;grid-template-columns:1fr 1fr;gap:4px 14px;margin-top:10px}.kv div{display:flex;justify-content:space-between;gap:8px;border-bottom:1px dashed var(--line);padding:4px 0;min-width:0}.kv span{color:var(--mut);font-size:12.5px;flex:none}.kv button{border:0;background:none;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:0;min-width:0}
.empty{padding:40px;text-align:center;color:var(--mut)}#toast{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);background:var(--fg);color:var(--bg);border-radius:11px;padding:10px 14px;display:none;gap:12px;z-index:9}#toast button{background:none;border:0;color:inherit;font-weight:700;text-decoration:underline;cursor:pointer}
@media (max-width:800px){.app{grid-template-columns:1fr;grid-template-rows:auto auto auto;height:auto}header{flex-wrap:wrap}.list{max-height:40vh;border-right:0;border-bottom:1px solid var(--line)}.detail{padding:18px 16px 40px}.kv{grid-template-columns:1fr}#q{width:100%}}
`;

const JS = String.raw`
const t = (k) => DATA.strings[k] || k, $ = (s) => document.querySelector(s);
const el = (n, c, x) => { const e = document.createElement(n); if (c) e.className = c; if (x !== undefined) e.textContent = x; return e; };
const KIND = {
  code: ['Emailed code', 'blue', 'The site emails a code. I fill the form, you type the code.'], captcha: ['CAPTCHA', 'warn', 'Only a CAPTCHA is left.'],
  account: ['Account', 'pur', 'The site needs an account. You create it once with your own password.'], questions: ['Questions', 'ok', 'It asks things your profile does not answer.'], unsure: ['Your call', 'mut', 'I read the whole posting and could not tell if it fits.'],
};
const STEPS = {
  code: ['Press L. I open it and fill it.', 'Type the code from your email.', 'I continue and submit.'], captcha: ['Press L. I open it and fill it.', 'Solve the CAPTCHA.', 'I continue and submit.'],
  account: ['Press L. I open it.', 'Sign in or create the account.', 'I fill the form and submit.'], questions: ['Press L. I fill what I can.', 'Answer the highlighted questions.', 'Press S. I check it and submit.'],
};
let tab = 'items', sel = null, q = '', undo = null, running = null; const gone = new Set();
const post = (path, body = {}) => fetch(path + '?t=' + DATA.token, { method: 'POST', body: JSON.stringify(body) }).then((r) => { if (!r.ok) throw new Error(r.status); });
const open = (k) => DATA[k].filter((i) => !gone.has(i.url));
// Best use of the user's time: how good the job is per minute it takes.
const visible = () => open(tab).filter((i) => (i.company + ' ' + i.title).toLowerCase().includes(q.toLowerCase())).sort((a, b) => b.score / (b.minutes + 3) - a.score / (a.minutes + 3));
function toast(text, canUndo) { const b = $('#toast'); b.firstChild.textContent = text; b.lastChild.style.display = canUndo ? '' : 'none'; b.style.display = 'flex'; clearTimeout(toast.t); toast.t = setTimeout(() => { b.style.display = 'none'; }, 6000); }
async function act(path, state, back, label, url = sel) {
  const l = visible(), i = l.findIndex((x) => x.url === url); if (i < 0) return;
  const job = l[i], where = tab; gone.add(url); sel = (l[i + 1] || l[i - 1] || {}).url || null; render();
  const restore = () => { gone.delete(url); tab = where; sel = url; render(); };
  try { await post(path, { url, state }); } catch { restore(); return toast(t('Not saved. Reload the page.')); }
  undo = async () => { try { await post(path, { url, state: back }); restore(); } catch { toast(t('Not saved. Reload the page.')); } };
  toast(job.company + ': ' + t(label), true);
}
const mark = (state, label) => act('/mark', state, null, label);
function key(text, k, fn, primary) { const b = el('button', 'b' + (primary ? ' p' : '')); b.append(t(text) + ' ', el('kbd', '', k)); b.onclick = fn; return b; }
function list() {
  const box = $('.list'); box.textContent = ''; const l = visible();
  if (!l.some((i) => i.url === sel)) sel = l[0]?.url || null;
  if (!l.length) box.append(el('div', 'empty', t(q ? 'Nothing matches.' : 'Nothing left here.')));
  for (const it of l) {
    const b = el('button', 'row' + (it.url === sel ? ' on' : '')), m = el('div', 'm'), k = KIND[it.need] || KIND.questions, g = el('span', 'tag', t(k[0]));
    g.style.cssText = 'background:var(--' + k[1] + 'bg);color:var(--' + k[1] + ')';
    m.append(g, [it.portal, it.place].filter(Boolean).join(' · ')); b.append(el('div', 'c', it.company), el('div', '', it.title), m); b.onclick = () => { sel = it.url; render(); }; box.append(b);
  }
  box.querySelector('.on')?.scrollIntoView({ block: 'nearest' });
}
function detail() {
  const d = $('.detail'), w = el('div', 'wrap'); d.textContent = ''; d.append(w);
  const it = visible().find((i) => i.url === sel); if (!it) return w.append(el('div', 'empty', t('You are all caught up.')));
  const box = el('div', 'box'), acts = el('div', 'acts'), more = el('div', 'acts'), link = el('a', '', t('Open in my browser')), k = KIND[it.need] || KIND.questions;
  link.href = /^https?:/.test(it.url) ? it.url : '#'; link.target = '_blank'; link.rel = 'noreferrer';
  w.append(el('div', 'co', [it.company, it.place].filter(Boolean).join(' · ')), el('h1', '', it.title));
  const lead = it.status === 'unknown' ? 'Submit was pressed but no confirmation was seen. Check your email first.' : it.error ? 'The form stopped the agent. Finish it together.' : k[2];
  box.append(el('p', 'need', t(lead))); const extra = it.need === 'unsure' ? it.why : it.error || it.missing.slice(0, 6).join(' · '); if (extra) box.append(el('p', 'co', extra));
  if (it.need === 'unsure') acts.append(key('Apply to this', 'Y', () => act('/decide', 'apply', 'unsure', 'will apply'), true), key('Skip', 'N', () => act('/decide', 'skip', 'unsure', 'skipped')), link);
  else {
    const ol = el('ol'); for (const s of STEPS[it.need] || STEPS.questions) ol.append(el('li', '', t(s))); box.append(ol);
    const go = key('Finish this one', 'L', () => finish(it), true); go.id = 'go'; go.disabled = !!running; acts.append(go);
    if (running?.url === it.url) { const s = key('Done, continue', 'S', () => post('/continue').then(() => toast(t('Continuing.')), () => {})); s.id = 'cont'; acts.append(s); }
    acts.append(link); more.append(key('I sent it', 'H', () => mark('sent', 'sent')), key('Not interested', 'N', () => mark('no', 'not interested')), key('It is closed', 'C', () => mark('closed', 'closed')));
  }
  const msg = el('div', 'msg'); msg.id = 'msg'; msg.setAttribute('role', 'status'); box.append(acts, more, msg); w.append(box); say();
  const det = el('details', 'box'), kv = el('div', 'kv'); det.append(el('summary', '', t('Your details to copy')));
  for (const [n, v] of [...DATA.details, ...(it.resume ? [[t('Resume'), it.resume]] : [])]) { const r = el('div'), b = el('button', '', v); b.title = v; b.onclick = () => navigator.clipboard.writeText(v).then(() => toast(t('Copied'))); r.append(el('span', '', n), b); kv.append(r); }
  det.append(kv); for (const [n, v] of it.answers) { const r = el('p'); r.append(el('div', 'co', n), el('div', '', String(v))); det.append(r); } w.append(det);
}
function say() { const m = $('#msg'); if (!m || !running) return; const mine = running.url === sel; m.textContent = mine ? (running.turn ? t('Your turn') + ': ' : '') + running.text : t('Finishing another application.'); m.classList.toggle('turn', mine && !!running.turn); }
async function finish(it) {
  if (running) return; running = { url: it.url, since: Date.now(), text: t('Opening…') }; render();
  try { await post('/finish', { url: it.url }); poll(); } catch { running = null; render(); toast(t('Could not reach the agent.')); }
}
async function poll() {
  const r = running; if (!r) return; let e = {}; try { e = await (await fetch('/status?t=' + DATA.token)).json(); } catch {}
  const mine = e.url === r.url && Date.parse(e.at) >= r.since - 3000;
  if (mine) { r.text = e.text; r.turn = e.phase === 'your-turn'; document.title = (r.turn ? '● ' : '') + t('Review queue'); say(); }
  if (!mine && Date.now() - r.since > 90000) { running = null; render(); return toast(t('It did not start. Press L again.')); }
  if (mine && e.phase === 'done') { running = null; document.title = t('Review queue'); if (['applied', 'closed'].includes(e.result)) gone.add(r.url); render(); return toast(e.text); }
  setTimeout(poll, 1500);
}
function render() { for (const [id, k] of [['#tItems', 'items'], ['#tUnsure', 'unsure']]) { $(id).lastChild.textContent = open(k).length; $(id).classList.toggle('on', tab === k); } list(); detail(); }
const move = (n) => { const l = visible(), it = l[Math.max(0, Math.min(l.length - 1, l.findIndex((x) => x.url === sel) + n))]; if (it) { sel = it.url; render(); } };
document.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey || e.repeat && !/^(j|k|Arrow)/i.test(e.key)) return; if (e.target.tagName === 'INPUT') { if (e.key === 'Escape') e.target.blur(); return; }
  const k = e.key.toLowerCase(), un = tab === 'unsure';
  if (k === 'j' || k === 'arrowdown') { e.preventDefault(); move(1); } else if (k === 'k' || k === 'arrowup') { e.preventDefault(); move(-1); }
  else if (k === '/') { e.preventDefault(); $('#q').focus(); } else if (k === 'u' && undo) { undo(); undo = null; }
  else if (un && k === 'y') act('/decide', 'apply', 'unsure', 'will apply'); else if (un && k === 'n') act('/decide', 'skip', 'unsure', 'skipped');
  else if (!un && k === 'l') $('#go')?.click(); else if (!un && k === 's') $('#cont')?.click(); else if (!un && k === 'h') mark('sent', 'sent'); else if (!un && k === 'n') mark('no', 'not interested'); else if (!un && k === 'c') mark('closed', 'closed');
});
$('#q').oninput = (e) => { q = e.target.value; render(); }; $('#tItems').onclick = () => { tab = 'items'; render(); }; $('#tUnsure').onclick = () => { tab = 'unsure'; render(); };
$('#toast').lastChild.onclick = () => { if (undo) undo(); undo = null; $('#toast').style.display = 'none'; };
fetch('/status?t=' + DATA.token).then((r) => r.json()).then((e) => { if (e.phase && e.phase !== 'done') { running = { url: e.url, since: Date.parse(e.at), text: e.text }; render(); poll(); } }).catch(() => {});
render();
`;

export function page(data) {
  const t = (k) => data.strings[k] || k;
  const json = JSON.stringify(data).replace(/</g, '\\u003c'); // a job title can't close the script tag
  return `<!doctype html><html lang="${data.lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${t('Review queue')}</title><style>${CSS}</style></head><body><div class="app"><header><b>${t('Review queue')}</b><button class="tab" id="tItems">${t('Applications')}<span></span></button><button class="tab" id="tUnsure">${t('Your call')}<span></span></button><input id="q" aria-label="${t('Search')}" placeholder="${t('Search')}  ( / )" autocomplete="off"></header><section class="list"></section><main class="detail"></main></div><div id="toast" role="status"><span></span><button>${t('Undo')} (U)</button></div><script>const DATA=${json};${JS}</script></body></html>`;
}
