#!/usr/bin/env node
// Opens the agent's Chrome in front so the user can sign in to their sites. They type their own passwords.
// Usage: npm run browser [-- https://site-to-open]
import { requireOpen } from '../core/open.mjs';
import { newTab, openBrowser } from '../apply/browser.mjs';

requireOpen();
const nav = await openBrowser({ foreground: true }), tab = await newTab(nav);
if (/^https?:\/\//.test(process.argv[2] || '')) await tab.goto(process.argv[2], { waitUntil: 'domcontentloaded' });
await tab.bringToFront();
await nav.close();
console.log('The agent browser is open. Sign in to your sites there.');
