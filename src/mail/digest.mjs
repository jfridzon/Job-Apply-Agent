#!/usr/bin/env node
// The daily email: what was sent, who answered, and the short list of things only the user can do. Email-safe HTML
// (tables and inline styles; no scripts, SVG or web fonts), so it looks the same on a phone and on a desktop.
// Writes data/digest.html and prints { file, subject }. The assistant sends it through the user's mail connector.
import { requireOpen } from '../core/open.mjs';
import { writeFileSync } from 'node:fs';
import { config, dataPath, isMain, option, rows, add } from '../core/store.mjs';
import { translator } from '../core/i18n.mjs';
import { stats } from './stats.mjs';

const esc = (s = '') => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const safeUrl = (u = '') => (/^https?:\/\//.test(u) ? esc(u) : '');
const C = { agent: '#F26A1B', you: '#0A7AFF', good: '#1F9D45', bad: '#BE123C', ink: '#1C1C1E', text: '#3A3A3C', soft: '#6C6C70', faint: '#8E8E93', line: '#ECECF0', bg: '#F2F2F7' };
const T = 'role="presentation" cellpadding="0" cellspacing="0" border="0"';
const PORTALS = [[/greenhouse/, 'Greenhouse'], [/ashbyhq/, 'Ashby'], [/lever\.co/, 'Lever'], [/workday/, 'Workday'], [/smartrecruiters/, 'SmartRecruiters'], [/workable/, 'Workable'], [/recruitee/, 'Recruitee']];
export const portal = (url = '') => { try { const h = new URL(url).hostname.replace(/^www\./, ''); return PORTALS.find(([re]) => re.test(h))?.[1] || h.split('.').slice(-2, -1)[0]; } catch { return ''; } };

export function digest(s, { t, lang }, { url = 'http://127.0.0.1:8765/', previous = null } = {}) {
  const n = (x) => x.toLocaleString(lang);
  const dayName = (d, o) => new Intl.DateTimeFormat(lang, { timeZone: 'UTC', ...o }).format(new Date(`${d}T12:00:00Z`));
  const card = (inner, border = C.line) => `<tr><td style="padding:0 0 12px"><table ${T} width="100%" style="background:#fff;border:1px solid ${border};border-radius:22px"><tr><td style="padding:18px 16px 16px">${inner}</td></tr></table></td></tr>`;
  const h = (txt, sub) => `<div style="font-size:17px;font-weight:800;letter-spacing:-0.2px;color:${C.ink};line-height:1.3;margin:0 0 ${sub ? 4 : 12}px">${esc(txt)}</div>${sub ? `<div style="font-size:12px;color:${C.soft};margin:0 0 14px;line-height:1.45">${esc(sub)}</div>` : ''}`;
  const chip = (txt, bg = C.bg, fg = '#475569') => `<span style="display:inline-block;font-size:11px;font-weight:600;padding:2px 8px;border-radius:99px;white-space:nowrap;background:${bg};color:${fg}">${esc(txt)}</span>`;
  const button = (href, txt, bg = C.you) => `<a href="${safeUrl(href)}" style="display:inline-block;background:${bg};color:#fff;text-decoration:none;font-size:13px;font-weight:700;padding:9px 16px;border-radius:99px;white-space:nowrap">${esc(txt)}</a>`;
  const change = (now, before) => (before == null || now === before ? '&nbsp;' : `<span style="color:${C.soft};font-weight:700">${now > before ? '▲' : '▼'} ${Math.abs(now - before)}</span> <span style="color:${C.faint}">${esc(t('vs yesterday'))}</span>`);
  const tile = (v, label, sub, fg, bg) => `<td width="25%" style="padding:3px;vertical-align:top"><table ${T} width="100%" style="background:${bg};border-radius:12px"><tr><td style="padding:12px 4px 10px;text-align:center"><div style="font-size:28px;font-weight:800;line-height:1;color:${fg};letter-spacing:-1px">${n(v)}</div><div style="font-size:11px;font-weight:700;color:${C.text};margin-top:7px;line-height:1.25">${esc(label)}</div><div style="font-size:10px;margin-top:5px;line-height:1.3">${sub}</div></td></tr></table></td>`;
  const agentTotal = s.sent.filter((a) => !a.via).length;

  const tiles = card(`<table ${T} width="100%" style="table-layout:fixed"><tr>${tile(s.sentToday, t('sent today'), change(s.sentToday, s.sentYesterday), C.agent, '#FFF0E3')}${tile(s.sent.length, t('sent in total'), '&nbsp;', C.ink, C.bg)}${tile(s.inbox.open.length, t('next stage now'), change(s.inbox.open.length, previous?.open), s.inbox.open.length ? C.good : C.ink, '#E3F6E8')}${tile(s.inbox.rejected, t('companies said no'), change(s.inbox.rejected, previous?.rejected), C.bad, '#FFE9E7')}</tr></table><div style="font-size:11px;color:${C.faint};text-align:center;margin-top:10px">${esc(t('{a} sent by the agent, {b} with you. {c} companies answered.', { a: n(agentTotal), b: n(s.sent.length - agentTotal), c: n(s.inbox.answered) }))}</div>`);

  const stages = card(`${h(t('Next stage'), s.inbox.open.length ? t('If they asked for something, answer today.') : t('No company asked for a new step.'))}${s.inbox.open.length ? `<table ${T} width="100%">${s.inbox.open.slice(0, 8).map((c) => `<tr><td style="padding:10px 0;border-top:1px solid ${C.line}"><div style="font-size:15px;font-weight:800;color:${C.ink}">${esc(c.company)} ${c.stage === 'next' ? chip(t('YOUR TURN'), '#D92D20', '#fff') : chip(t('WAITING'))}</div><div style="font-size:12px;color:${C.faint};margin-top:3px">${esc(c.subject.slice(0, 90))}</div></td><td style="padding:10px 0 10px 8px;border-top:1px solid ${C.line};text-align:right;width:1%">${safeUrl(c.link) ? button(c.link, t('Open email')) : ''}</td></tr>`).join('')}</table>` : ''}`, s.inbox.open.length ? '#BFE8CB' : C.line);

  const asks = [[s.needs.captcha + s.needs.code, t('CAPTCHA or emailed code'), t('filled, only that step is left')], [s.needs.account, t('accounts'), t('you create it once, the agent fills the rest')], [s.needs.questions, t('with questions for you'), t('things only you know')], [s.undecided.length, t('your call'), t('read in full, not clear if they fit')]].filter(([v]) => v).sort((a, b) => b[0] - a[0]);
  const you = card(`${h(t('What I need from you'), t('Biggest pile first.'))}${asks.length ? `<table ${T} width="100%">${asks.map(([v, what, why]) => `<tr><td style="width:60px;padding:7px 12px 7px 0"><div style="background:#E8F1FF;color:${C.you};border-radius:14px;text-align:center;font-size:20px;font-weight:800;height:44px;line-height:44px">${n(v)}</div></td><td style="padding:7px 0;border-bottom:1px solid ${C.bg}"><div style="font-size:14px;font-weight:700;color:${C.ink}">${esc(what)}</div><div style="font-size:12px;color:${C.soft};margin-top:2px">${esc(why)}</div></td></tr>`).join('')}</table><table ${T} width="100%" style="margin-top:14px"><tr><td align="center">${button(url, t('Open the review queue'))}</td></tr></table>` : `<div style="font-size:14px;font-weight:700;color:${C.good}">${esc(t('Nothing today.'))}</div>`}`);

  const H = 90, max = Math.max(1, ...s.days.map((d) => d.agent + d.you)), px = (v) => (v ? Math.max(3, Math.round((v / max) * H)) : 0);
  const bar = (v, c, top) => (v ? `<div style="height:${px(v)}px;background:${c};${top ? 'border-radius:4px 4px 0 0;' : ''}font-size:0;line-height:0">&nbsp;</div>` : '');
  const total14 = s.days.reduce((q, d) => q + d.agent + d.you, 0);
  const chart = card(`${h(t('Applications per day'), t('{n} in the last 14 days.', { n: n(total14) }))}<table ${T} width="100%" style="table-layout:fixed;border-bottom:1px solid ${C.line}"><tr>${s.days.map((d) => `<td valign="bottom" style="height:${H + 16}px;padding:0 1px;vertical-align:bottom;text-align:center"><div style="font-size:10px;font-weight:700;line-height:12px;margin-bottom:3px;color:${C.ink}">${d.agent + d.you || ''}</div>${bar(d.you, C.you, true)}${bar(d.agent, C.agent, !d.you)}</td>`).join('')}</tr></table><table ${T} width="100%" style="table-layout:fixed"><tr>${s.days.map((d) => `<td style="padding:5px 0 0;text-align:center;font-size:9px;line-height:11px;color:${d.date === s.today ? C.ink : C.faint}">${esc(dayName(d.date, { weekday: 'narrow' }))}<br>${Number(d.date.slice(8))}</td>`).join('')}</tr></table><div style="font-size:11px;color:${C.faint};margin-top:10px"><span style="color:${C.agent}">●</span> ${esc(t('agent'))} &nbsp; <span style="color:${C.you}">●</span> ${esc(t('with you'))}</div>`);

  const th = `font-size:10px;font-weight:700;color:${C.faint};text-transform:uppercase;letter-spacing:0.5px;padding:0 0 6px`, td = `padding:8px 6px 8px 0;border-bottom:1px solid ${C.bg};vertical-align:top;font-size:12px;line-height:1.35`;
  const recent = card(`${h(t('Sent in the last 24 hours'))}${s.last24.length ? `<table ${T} width="100%" style="table-layout:fixed"><tr><td style="width:32%;${th}">${esc(t('Company'))}</td><td style="${th}">${esc(t('Role'))}</td><td style="width:96px;text-align:right;${th}">${esc(t('Portal'))}</td></tr>${s.last24.slice(0, 25).map((a) => `<tr><td style="${td};font-weight:700;color:${C.ink}">${esc(a.company)}</td><td style="${td};color:${C.text}">${esc(a.title)}</td><td style="${td};text-align:right;padding-right:0">${chip(portal(a.url), a.via ? '#dbeafe' : C.bg, a.via ? '#1e40af' : '#475569')}</td></tr>`).join('')}</table>${s.last24.length > 25 ? `<div style="font-size:11px;color:${C.faint};margin-top:8px">${esc(t('and {n} more.', { n: s.last24.length - 25 }))}</div>` : ''}` : `<div style="font-size:13px;color:${C.soft}">${esc(t('Nothing was sent.'))}</div>`}`);

  const f = s.funnel, steps = [[f.read, t('postings read'), C.ink], [f.fit, t('fit your rules'), '#636366'], [f.sent, t('sent'), C.faint], [f.answered, t('answered'), '#AEAEB2'], [f.next, t('next stage'), C.good]];
  const width = (v) => Math.max(5, Math.round((100 * Math.log10(v + 1)) / Math.log10(Math.max(2, f.read + 1))));
  const funnel = card(`${h(t('Funnel'), t('From everything read to what moves forward (log scale).'))}<table ${T} width="100%">${steps.map(([v, l, c]) => `<tr><td style="width:40%;padding:4px 10px 4px 0;line-height:1.25"><span style="font-size:17px;font-weight:800;color:${c}">${n(v)}</span> <span style="font-size:11px;color:${C.soft}">${esc(l)}</span></td><td style="padding:4px 0"><table ${T} width="${width(v)}%"><tr><td style="background:${c};height:16px;font-size:0;line-height:16px;border-radius:8px">&nbsp;</td></tr></table></td></tr>`).join('')}</table>${s.sweep.new ? `<div style="background:${C.bg};border-radius:10px;padding:10px 12px;font-size:12px;color:${C.text};margin-top:14px">${esc(t('Last sweep: {b} job boards, {n} new postings, {f} passed your filters.', { b: n(s.sweep.boards), n: n(s.sweep.new), f: n(s.sweep.apply) }))}</div>` : ''}`);

  const LABEL = { rejection: [t('said no'), C.bg, '#475569'], next: [t('next stage'), '#86efac', '#065f46'], done: [t('step received'), '#E3F6E8', '#065f46'] };
  const answers = s.inbox.messages.filter((m) => LABEL[m.kind] && m.company).slice(-5).reverse();
  const replies = answers.length ? card(`${h(t('Latest answers'))}<table ${T} width="100%">${answers.map((m) => `<tr><td style="${td};font-size:13px;font-weight:600;color:${C.ink}">${esc(m.company)}</td><td style="${td}">${chip(...LABEL[m.kind])}</td><td style="${td};text-align:right;color:${C.faint}">${esc(new Intl.DateTimeFormat(lang, { month: 'short', day: 'numeric' }).format(new Date(m.date)))}</td></tr>`).join('')}</table>`) : '';

  const html = `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(t('Your job search'))}</title></head><body style="margin:0;padding:0;background:${C.bg}"><table ${T} width="100%" style="background:${C.bg}"><tr><td align="center" style="padding:16px 10px 24px"><table ${T} width="100%" style="max-width:600px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${C.ink}"><tr><td style="padding:6px 8px 16px"><div style="font-size:13px;font-weight:700;color:${C.faint}">${esc(dayName(s.today, { weekday: 'long', month: 'long', day: 'numeric' }))}</div><div style="font-size:32px;font-weight:800;letter-spacing:-1px;line-height:1.1;margin-top:3px">${esc(t('Your agent today'))}</div></td></tr>${tiles}${stages}${you}${chart}${recent}${funnel}${replies}</table></td></tr></table></body></html>`;
  const subject = `${t('Job agent')}: ${t('{n} sent today', { n: n(s.sentToday) })}${s.inbox.open.length ? `, ${t('{n} in next stage', { n: n(s.inbox.open.length) })}` : ''}`;
  return { html, subject };
}

if (isMain(import.meta)) requireOpen();
if (isMain(import.meta)) {
  const now = new Date(option('--now') || Date.now()), s = stats(now);
  const previous = rows('digests').filter((r) => r.day < s.today).at(-1);
  const { html, subject } = digest(s, translator(), { url: `http://127.0.0.1:${config('agent').review_port || 8765}/`, previous });
  const file = option('--out', dataPath('digest.html'));
  writeFileSync(file, html);
  add('digests', { day: s.today, open: s.inbox.open.length, rejected: s.inbox.rejected, waiting: s.waiting.length });
  console.log(JSON.stringify({ file, subject }));
}
