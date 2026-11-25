#!/usr/bin/env node
// Links that arrive some other way: job-alert emails, a friend, a list the assistant found. Reads data/leads.jsonl
// ({ url, company, title, location, text }) and decides like any other source. This is also the way to use sites
// that don't allow automation: turn on their email alerts and let the assistant add the links.
import { requireOpen } from '../core/open.mjs';
import { add, isMain, latest, rows } from '../core/store.mjs';
import { consider } from './discover.mjs';

export function importLeads() {
  const seen = latest('decisions'), c = { new: 0, apply: 0, unsure: 0, skip: 0 };
  for (const l of rows('leads')) { const d = consider({ ...l, source: l.source || 'lead' }, seen); if (d) { c.new++; c[d]++; } }
  if (c.new) add('sweeps', { source: 'leads', ...c });
  return c;
}
if (isMain(import.meta)) requireOpen();
if (isMain(import.meta)) console.log(JSON.stringify(importLeads()));
