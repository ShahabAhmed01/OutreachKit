'use strict';

const fs = require('fs');
const path = require('path');
const {
  loadConfig,
  loadCampaign,
  saveCampaign,
  launch,
  readCsv,
  appendCsv,
  info,
  ok,
  warn,
  err,
  sleep,
  stopSleep,
  DATA,
  nowIso,
  todayKey
} = require('./lib');

const STOP = path.join(DATA, 'stop.flag');
const pick = (a) => a[Math.floor(Math.random() * a.length)];

function parseArgs() {
  const args = process.argv.slice(2);
  const idx = args.indexOf('--campaign');
  const campaignId = idx !== -1 ? args[idx + 1] : null;
  const dry = args.includes('--dry');
  return { campaignId, dry };
}

function fillTemplate(tpl, lead) {
  return tpl
    .split('{username}')
    .join(lead.username || '')
    .split('{comment}')
    .join(lead.comment || '')
    .split('{link}')
    .join(lead.link || '');
}

function passesFilter(cfg, lead) {
  if (!cfg || !cfg.commentFilter || !cfg.commentFilter.enabled) return true;
  const keywords = cfg.commentFilter.keywords || [];
  if (!keywords.length) return true;
  const c = String(lead.comment || '').toLowerCase();
  return keywords.some((k) => k && c.includes(k));
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function nowHM() {
  const d = new Date();
  return pad2(d.getHours()) + ':' + pad2(d.getMinutes());
}

function inScheduleWindow(cfg) {
  if (!cfg.schedule || !cfg.schedule.enabled) return true;
  const now = nowHM();
  const start = cfg.schedule.start || '09:00';
  const end = cfg.schedule.end || '23:00';
  if (start <= end) return now >= start && now <= end;
  return now >= start || now <= end;
}

// ─── Build message sequence from campaign or global config ───
function buildMessageSequence(lead, campaign, cfg) {
  if (campaign) {
    // Campaign message variant system
    const text1 = campaign.text1 || [];
    const text2 = campaign.text2 || [];
    const followups = campaign.followups || [];

    const seq = [];
    // Pick one variant from text1
    if (text1.length > 0) {
      seq.push(fillTemplate(pick(text1), lead));
    }
    // Pick one variant from text2 (if any)
    if (text2.length > 0) {
      seq.push(fillTemplate(pick(text2), lead));
    }
    // Add followups (one variant each)
    for (const fu of followups) {
      if (Array.isArray(fu)) {
        seq.push(fillTemplate(pick(fu), lead));
      } else if (typeof fu === 'string' && fu.trim()) {
        seq.push(fillTemplate(fu, lead));
      }
    }
    return seq.filter((m) => m && m.trim());
  }

  // Legacy global config
  if (cfg.messages && cfg.messages.openers && cfg.messages.openers.length) {
    return [pick(cfg.messages.openers), ...cfg.messages.questions]
      .map((m) => fillTemplate(m, lead))
      .filter((m) => m.trim());
  }
  return [];
}

async function sendToInstagram(page, lead, msgs) {
  await page.goto('about:blank', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
  await page.goto('https://www.instagram.com/direct/new/', {
    waitUntil: 'domcontentloaded',
    timeout: 60000
  });
  if (page.url().includes('accounts/login')) throw new Error('SESSION_EXPIRED');

  const search = page.getByRole('textbox').first();
  await search.waitFor({ timeout: 30000 });
  await search.fill(lead.username);
  await sleep(1800 + Math.random() * 1800);

  const rows = page.locator('[role="button"]').filter({ hasText: lead.username });
  const count = await rows.count().catch(() => 0);
  if (count === 0) {
    warn(`No account found for @${lead.username} — skipping.`);
    return 'not-found';
  }
  const bestIdx = await rows.evaluateAll((els, u) => {
    const scored = els
      .map((el) => ({
        len: (el.textContent || '').length,
        exact: (el.textContent || '').trim() === u
      }))
      .map((s, i) => ({ i, len: s.len, exact: s.exact }))
      .sort((a, b) => Number(b.exact) - Number(a.exact) || a.len - b.len);
    return scored[0].i;
  }, lead.username);
  await rows.nth(bestIdx).click();
  await sleep(1200 + Math.random() * 800);

  let msgBox = page.locator('[role="textbox"]').last();
  await msgBox.waitFor({ timeout: 15000 });

  for (const msg of msgs) {
    await msgBox.fill(msg);
    await page.keyboard.press('Enter');
    await sleep(4000 + Math.random() * 4000);
    const confirm = page.getByRole('button', { name: /^Send$/i });
    if (await confirm.isVisible().catch(() => false)) {
      await confirm.click();
      await sleep(1000);
    }
    msgBox = page.locator('[role="textbox"]').last();
  }

  return msgs;
}

async function sendToFacebook(page, lead, msgs) {
  // Navigate to Facebook Messenger
  await page.goto('about:blank', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
  await page.goto('https://www.facebook.com/messages/t/', {
    waitUntil: 'domcontentloaded',
    timeout: 60000
  });
  if (page.url().includes('login') || page.url().includes('checkpoint')) {
    throw new Error('SESSION_EXPIRED');
  }

  await page.waitForTimeout(3000);

  // Search for user
  const searchInput = page.locator('[aria-label="Search"], [placeholder*="Search"]').first();
  try {
    await searchInput.waitFor({ timeout: 15000 });
    await searchInput.fill(lead.username);
    await sleep(2000 + Math.random() * 2000);

    // Click on the first result
    const result = page.locator('[role="option"], [role="listbox"] [role="row"]').first();
    if ((await result.count()) > 0) {
      await result.click();
      await sleep(2000);
    } else {
      warn(`No Facebook account found for @${lead.username} — skipping.`);
      return 'not-found';
    }
  } catch {
    warn(`Could not search for @${lead.username} on Facebook — skipping.`);
    return 'not-found';
  }

  // Send messages
  for (const msg of msgs) {
    const msgBox = page.locator('[role="textbox"], [contenteditable="true"]').last();
    try {
      await msgBox.waitFor({ timeout: 10000 });
      await msgBox.fill(msg);
      await sleep(1000);
      await page.keyboard.press('Enter');
      await sleep(3000 + Math.random() * 3000);
    } catch (e) {
      warn(`Failed to send message to @${lead.username}: ${e.message.split('\n')[0]}`);
    }
  }

  return msgs;
}

// ─── Main ───
(async () => {
  const { campaignId, dry } = parseArgs();
  const campaign = campaignId ? loadCampaign(campaignId) : null;
  const cfg = loadConfig();
  const platform = campaign ? campaign.platform || 'instagram' : 'instagram';

  // Validate message config
  if (campaign) {
    if (!campaign.text1 || !campaign.text1.length) {
      return err('No text1 messages configured for this campaign.');
    }
  } else {
    if (!cfg.messages || !cfg.messages.openers.length || !cfg.messages.questions.length) {
      return err('No messages configured — set them in the GUI (Settings) first.');
    }
  }

  // Load leads
  let commenters;
  if (campaign) {
    commenters = readCsv('commenters.csv', campaignId);
  } else {
    commenters = readCsv('commenters.csv');
  }
  if (!commenters.length) return err('No commenters — run Gather → Scrape first.');

  // Filter
  const filtered = commenters.filter((r) => r.username && passesFilter(cfg, r));
  if (filtered.length !== commenters.length) {
    info(`Keyword filter kept ${filtered.length} of ${commenters.length} leads.`);
  }

  // Build exclusion sets
  const sent = new Set(readCsv('sent.csv', campaignId).map((r) => r.username));
  const contacted = new Set(readCsv('already-contacted.csv', campaignId).map((r) => r.username));
  const replied = new Set(readCsv('replied.csv', campaignId).map((r) => r.username));
  const queue = filtered.filter(
    (r) => !sent.has(r.username) && !contacted.has(r.username) && !replied.has(r.username)
  );

  info(
    `Leads: ${commenters.length} | after filter: ${filtered.length} | already sent: ${sent.size} | previously contacted: ${contacted.size} | replied: ${replied.size} | to send: ${queue.length}`
  );

  // Schedule check
  if (!inScheduleWindow(cfg)) {
    return warn(
      `Campaign schedule is ${cfg.schedule.start}–${cfg.schedule.end} (local time) — outside that window now, nothing to do.`
    );
  }

  // Dry run
  if (dry) {
    ok('DRY RUN — would send this sequence to these first leads:');
    queue.slice(0, 5).forEach((r) => {
      const seq = buildMessageSequence(r, campaign, cfg);
      console.log(`  → @${r.username}: ${seq.map((m) => `"${m}"`).join(' → ')}`);
    });
    info('No messages were actually sent.');
    return;
  }

  // Daily cap
  const sentToday = readCsv('sent.csv', campaignId).filter((r) =>
    (r.sent_at || '').startsWith(todayKey())
  ).length;
  const dailyCap = campaign ? campaign.dailyCap || cfg.dailyCap || 50 : cfg.dailyCap;
  if (sentToday >= dailyCap) {
    return warn(
      `Daily cap (${dailyCap}) already reached today — nothing to do. Come back tomorrow.`
    );
  }

  // Update campaign status
  if (campaign) {
    campaign.status = 'running';
    saveCampaign(campaign);
  }

  const ctx = await launch(false);
  const page = await ctx.newPage();
  let sentCount = 0;
  let consecutive = 0;

  try {
    for (const lead of queue) {
      if (fs.existsSync(STOP)) {
        fs.unlinkSync(STOP);
        warn('Stop requested — exiting cleanly.');
        break;
      }
      if (sentCount + sentToday >= dailyCap) {
        warn(`Daily cap (${dailyCap}) reached — stopping for today.`);
        break;
      }
      if (!inScheduleWindow(cfg)) {
        warn(
          `Campaign schedule window (${cfg.schedule.start}–${cfg.schedule.end}) ended — stopping.`
        );
        break;
      }

      try {
        const msgs = buildMessageSequence(lead, campaign, cfg);
        if (!msgs.length) {
          warn(`No messages to send to @${lead.username} — skipping.`);
          continue;
        }

        let result;
        if (platform === 'facebook') {
          result = await sendToFacebook(page, lead, msgs);
        } else {
          result = await sendToInstagram(page, lead, msgs);
        }

        if (result === 'not-found') {
          consecutive = 0;
          continue;
        }

        appendCsv('sent.csv', { username: lead.username, sent_at: nowIso() }, campaignId);
        sentCount++;
        consecutive = 0;
        ok(`Sent to @${lead.username} — "${msgs[0]}" then ${msgs.length - 1} follow-up messages`);
      } catch (e) {
        if (e.message === 'SESSION_EXPIRED') {
          err('Session expired — run Connect again from the GUI, then restart the campaign.');
          break;
        }
        consecutive++;
        warn(`Failed for @${lead.username}: ${e.message.split('\n')[0]}`);
        const maxFailures = cfg.pauseOnConsecutiveFailures || 5;
        const pauseMinutes = cfg.pauseMinutes || 30;
        if (consecutive >= maxFailures) {
          err(
            `Pausing ${pauseMinutes} min — possible action block. Check ${platform === 'facebook' ? 'facebook.com' : 'instagram.com/accounts/status'}.`
          );
          const aborted = await stopSleep(pauseMinutes * 60000, STOP);
          if (aborted) warn('Stop requested during pause — not waiting out the pause.');
          consecutive = 0;
        }
      }

      if (sentCount > 0 && sentCount % 5 === 0) info(`Progress this run: ${sentCount} sent…`);
      if (fs.existsSync(STOP)) continue;
      const minDelay = campaign
        ? campaign.minDelay || cfg.delayMinSec || 30
        : cfg.delayMinSec || 30;
      const maxDelay = campaign
        ? campaign.maxDelay || cfg.delayMaxSec || 90
        : cfg.delayMaxSec || 90;
      const delay = minDelay + Math.random() * (maxDelay - minDelay);
      info(`Next lead in ~${Math.round(delay)}s…`);
      await stopSleep(Math.round(delay * 1000), STOP);
    }

    // Update campaign status
    if (campaign) {
      const remaining = queue.length - sentCount;
      campaign.status = remaining <= 0 ? 'completed' : 'paused';
      saveCampaign(campaign);
    }

    ok(`Run finished. Sent this run: ${sentCount}.`);
  } finally {
    await ctx.close();
  }
})();
