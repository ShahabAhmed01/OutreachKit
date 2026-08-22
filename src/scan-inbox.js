'use strict';

const {
  launch,
  readCsv,
  writeCsv,
  info,
  ok,
  warn,
  err,
  step,
  sleep,
  clearSession,
  nowIso
} = require('./lib');

const LIST_NAME = 'ThreadListProfessionalOffMsysPaginationQuery';
const MAX_PAGES = 200;
const CURSOR_PARAM = 'cursor';
const PAGE_COUNT = 5;

function parseArgs() {
  const args = process.argv.slice(2);
  const idx = args.indexOf('--campaign');
  const campaignId = idx !== -1 ? args[idx + 1] : null;
  return { campaignId };
}

(async () => {
  const { campaignId } = parseArgs();

  const ctx = await launch(false);
  try {
    const commenters = new Set(readCsv('commenters.csv', campaignId).map((r) => r.username));
    if (!commenters.size) {
      warn('No commenters.csv yet — run Gather → Scrape first.');
      return;
    }

    const existingContacted = new Map();
    readCsv('already-contacted.csv', campaignId).forEach((r) => {
      if (r.username && !existingContacted.has(r.username)) {
        existingContacted.set(r.username, r.detected_at || nowIso());
      }
    });
    const sentRows = readCsv('sent.csv', campaignId).filter((r) => r.username);
    sentRows.forEach((r) => {
      if (!existingContacted.has(r.username)) {
        existingContacted.set(r.username, r.sent_at || nowIso());
      }
    });
    if (sentRows.length) ok(`Loaded ${sentRows.length} contacts from sent.csv history.`);

    const replied = new Map();
    readCsv('replied.csv', campaignId).forEach((r) => {
      if (r.username && !replied.has(r.username)) replied.set(r.username, r.replied_at || nowIso());
    });

    const page = await ctx.newPage();
    page.setDefaultTimeout(20000);

    let listTpl = null;
    let viewerFbid = null;

    page.on('request', (req) => {
      if (req.url().includes('/api/graphql') && req.method() === 'POST') {
        const post = req.postData() || '';
        const dec = decodeURIComponent(post).replace(/\+/g, ' ');
        if (dec.includes(LIST_NAME) && !listTpl) listTpl = post;
      }
    });
    page.on('response', async (res) => {
      if (res.url().includes('/api/graphql') && !viewerFbid) {
        try {
          const t = await res.text();
          if (t.includes('threads_by_system_folder_and_ig_inbox_folder')) {
            const j = JSON.parse(t);
            const box = j.data && j.data.fetch__SlideMailbox;
            const list = box && box.threads_by_system_folder_and_ig_inbox_folder;
            const th =
              list && list.edges && list.edges[0] && list.edges[0].node.as_ig_direct_thread;
            if (th && th.viewer && th.viewer.interop_messaging_user_fbid) {
              viewerFbid = th.viewer.interop_messaging_user_fbid;
            }
          }
        } catch {}
      }
    });

    step('Opening your DM inbox…');
    await page.goto('https://www.instagram.com/direct/inbox/', {
      waitUntil: 'domcontentloaded',
      timeout: 90000
    });
    if (page.url().includes('accounts/login')) throw new Error('SESSION_EXPIRED');
    await page.waitForTimeout(7000);

    for (let i = 0; i < 15 && !listTpl; i++) {
      await page
        .evaluate(() => {
          const els = [...document.querySelectorAll('div,main')].filter((el) => {
            if (el.scrollHeight <= el.clientHeight + 100) return false;
            const cs = getComputedStyle(el);
            return cs.overflowY === 'auto' || cs.overflowY === 'scroll';
          });
          els.forEach((el) => {
            el.scrollTop = el.scrollHeight;
          });
        })
        .catch(() => {});
      await page.waitForTimeout(800);
    }
    if (!listTpl) throw new Error('Could not capture the inbox list query from the page');

    const varsM = listTpl.match(/variables=([^&]+)&doc_id=/);
    const baseVars = JSON.parse(decodeURIComponent(varsM[1]));
    if (viewerFbid) info(`Viewer id: ${viewerFbid}`);
    else warn('Viewer id unknown — will rely on "You:" snippets only.');

    function replay(vars) {
      const body = listTpl.replace(
        /variables=[^&]+/,
        'variables=' + encodeURIComponent(JSON.stringify(vars))
      );
      return page.evaluate(async (b) => {
        const r = await fetch('https://www.instagram.com/api/graphql', {
          method: 'POST',
          headers: {
            'content-type': 'application/x-www-form-urlencoded',
            'x-requested-with': 'XMLHttpRequest'
          },
          credentials: 'include',
          body: b
        });
        const t = await r.text();
        if (!t.trim().startsWith('{')) {
          throw new Error('GraphQL returned a page (status ' + r.status + ')');
        }
        return JSON.parse(t);
      }, body);
    }

    const threads = new Map();
    let cursor = baseVars[CURSOR_PARAM] || null;
    let pages = 0;
    let emptyPages = 0;

    step(`Paging through your inbox (${PAGE_COUNT} threads per page)…`);
    while (pages < MAX_PAGES) {
      const vars = { ...baseVars, [CURSOR_PARAM]: cursor, count: PAGE_COUNT };
      let j = null;
      try {
        j = await replay(vars);
      } catch (e) {
        warn(`Page ${pages + 1} failed: ${e.message.split('\n')[0]} — retrying once…`);
        await sleep(3000);
        try {
          j = await replay(vars);
        } catch {
          break;
        }
      }
      pages++;
      if (!j || !j.data) {
        emptyPages++;
        if (emptyPages > 2) break;
        continue;
      }
      const list = j.data.fetch__SlideMailbox.threads_by_system_folder_and_ig_inbox_folder;
      if (!list || !list.edges || !list.edges.length) {
        info(`Inbox exhausted after ${pages} pages.`);
        break;
      }

      for (const e of list.edges) {
        const th = e.node && e.node.as_ig_direct_thread;
        if (!th) continue;
        const key = th.thread_key || th.thread_id || th.id;
        if (!key || threads.has(key)) continue;
        const users = ((th.users && th.users.map((u) => u.username)) || [])
          .filter((u, i) => String((th.users[i] || {}).id) !== String(th.viewer_id))
          .filter(Boolean);
        const msgs = ((th.slide_messages && th.slide_messages.edges) || [])
          .map((m) => m.node)
          .filter(Boolean);
        const snippet = (msgs[msgs.length - 1] && msgs[msgs.length - 1].igd_snippet) || '';
        const sentByMe = viewerFbid
          ? msgs.some((m) => String(m.sender_fbid) === String(viewerFbid))
          : /^You[: ]/i.test(snippet);
        const repliedByThem = viewerFbid
          ? msgs.some((m) => String(m.sender_fbid) !== String(viewerFbid))
          : msgs.length > 0;
        const crmText = msgs.some((m) =>
          /CRM/i.test((m.text_body || '') + ' ' + (m.igd_snippet || ''))
        );
        threads.set(key, {
          key,
          users,
          snippet,
          sentByMe,
          repliedByThem,
          crmText,
          ts: th.last_activity_timestamp_ms || null
        });
      }

      const pi = list.page_info;
      const next = pi && pi.end_cursor;
      if (!pi || !pi.has_next_page || !next || next === cursor) {
        info(`Inbox fully loaded (${threads.size} threads).`);
        break;
      }
      cursor = next;
      await sleep(1200 + Math.random() * 900);
    }
    info(`Scanned ${threads.size} total conversations.`);

    let matched = 0;
    const rows = [];
    for (const t of threads.values()) {
      const match = t.users.find((u) => commenters.has(u));
      if (!match) continue;
      if (t.repliedByThem) {
        if (!replied.has(match)) {
          replied.set(match, nowIso());
          ok(`Reply from @${match} — hot lead logged in replied.csv.`);
        }
      }
      if (!t.sentByMe && !t.crmText) continue;
      if (existingContacted.has(match)) continue;
      existingContacted.set(match, nowIso());
      rows.push({
        username: match,
        snippet: t.snippet.slice(0, 120),
        detected_at: nowIso()
      });
      matched++;
      ok(`Already contacted: @${match} — will be skipped.`);
    }

    const allContacted = [...existingContacted.entries()].map(([username, detected_at]) => ({
      username,
      detected_at
    }));
    writeCsv('already-contacted.csv', allContacted, campaignId);
    const allReplied = [...replied.entries()].map(([username, replied_at]) => ({
      username,
      replied_at
    }));
    writeCsv('replied.csv', allReplied, campaignId);
    ok(
      `Inbox scan done — ${matched} new previously-contacted leads found (${threads.size} threads scanned, ${replied.size} hot replies logged).`
    );
  } catch (e) {
    if (e.message === 'SESSION_EXPIRED') {
      clearSession();
      return err('Session expired — cleared stale session. Run Connect again from the GUI.');
    }
    err(`Inbox scan failed: ${e.message}`);
    process.exitCode = 1;
  } finally {
    await ctx.close();
  }
})();
