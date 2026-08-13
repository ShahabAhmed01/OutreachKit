'use strict';

const { loadConfig, loadCampaign, saveCampaign, launch, writeCsv, info, ok, warn, err, step, sleep, detectPlatform } = require('./lib');

const CACHED_PAGINATION_PARAMS = [
  'av=17841437861955722',
  '__d=www',
  '__user=0',
  '__a=1',
  '__req=x',
  '__hs=20669.HYP%3Ainstagram_web_pkg.2.1.0.0.0',
  'dpr=1',
  '__ccg=GOOD',
  '__rev=1044387223',
  '__s=zowmgq%3A67w0hn%3Aulc0y3',
  '__hsi=7670077585819220131',
  '__dyn=7xeUjG1mxu1syaxG4Vp41twpUnwgU7SbzEdF8vyUco2qwJyEiw50x609vCwjE1EEc87m0yE462mcw5Mx62G5UswoEcE7O2l0Fwqo5W1yw9O1lwlE-U2zxe2GewGw9a361qw8Xxm16wa-0oa2-azo7u3C2u2J0bS1LyUaUbGxK3R08-269wr84-6o5p389oed6goK10xKi2K7E5y4U7a0EoKmUhw5nyEcE4y16wAwj83KwRzk',
  '__csr=grE529nYZhcQHA5nuyNiiQmyuExhiRoGGhltpdijqpcznLZVb_bA9HLFVLrnUBvWABiyi5d9mSQsIOBayqVp7KbXV8_Ambirp-7frjjFA_VF8nBpaJ1eB88z9oSnGKXAxqh165ooxiQpUmzUPxeite_Q7ElgoVLLzpEW5UCh6HAzFu8G2O-Uryt0BKbyqwMGdy9aigB1S9g05uC04r80Gy021G00TN85-1gU0SDwduzN2xd1re0p9w68w5Cx24808dy09a0MU30xq1sa0ma1mwm8m5izoB02HU5e8o2wxq5Gfo4-0_V649Rho0Qa1lg2dBw0lbE0etOwkUfEgw0Cqg2mycE16U',
  '__hsdp=n0hyW17q224yqswIOKyJWFpt4g9SWki7KrgF2AUWcxaafTxMwAC2m9oy7WwBEF20sofQ1ww82czEjoF4wVwwxa0HUa86S4ofonwywm8O1bwt8bEgU8o7a0BUdofK2W0DU3Jw6GwFwf60v60TE0pTw2zU2Kw6ewam0yEMM0P-fwjU3WBU1BE2Kg0ZO0te7Uow2l9K79Gl0',
  '__hblp=0gE2oyopx-8wgoK4K4oVeeBxC17wBykuqdGq5omAuWCwxx50l8vwqEkg5SGJd3K2i3aq7bzHyUe48wEUdosG8wSxq7UhwZUlgrBglwgoO326Emyo5eeBxDy9u26ewoU887qu2SbyotwXwjo560QUpw861Dwiprwr8ao3Nw7Nxu0NEswjU0Y-0wU1JE0E-0HE3Hwa',
  'jazoest=26341',
  'lsd=-cV_mgdPTVZXXZud24ekei',
  '__spin_r=1044387223',
  '__spin_b=trunk',
  '__spin_t=1785829101',
  '__crn=comet.igweb.PolarisClipsTabDesktopProfiledContentRoute',
  'fb_api_caller_class=RelayModern',
  'fb_api_req_friendly_name=PolarisPostCommentsPaginationQuery',
  'server_timestamps=true'
];

function splitBody(post) {
  const pairs = post.split('&');
  const rest = [];
  let variables = null;
  for (const p of pairs) {
    if (p.startsWith('variables=')) variables = p.slice('variables='.length);
    else rest.push(p);
  }
  return { rest, variables };
}

function decodeVars(s) {
  try {
    return JSON.parse(decodeURIComponent(s));
  } catch {
    return null;
  }
}

function parseArgs() {
  const args = process.argv.slice(2);
  const idx = args.indexOf('--campaign');
  const campaignId = idx !== -1 ? args[idx + 1] : null;
  return { campaignId };
}

function getCampaignDir(campaignId) {
  if (!campaignId) return null;
  const lib = require('./lib');
  return lib.DATA ? require('path').join(lib.DATA, 'campaigns', campaignId) : null;
}

function saveCsv(users, owner, campaignId) {
  const filtered = new Map(users);
  if (owner) filtered.delete(owner);
  const rows = [...filtered.entries()]
    .map(([username, v]) => ({ username, comment: v.comment, commented_at: v.ts ? new Date(v.ts * 1000).toISOString() : '' }))
    .sort((a, b) => a.commented_at.localeCompare(b.commented_at));
  if (campaignId) {
    writeCsv('commenters.csv', rows, campaignId);
  } else {
    writeCsv('commenters.csv', rows);
  }
  return rows;
}

async function findOwner(page) {
  try {
    const owner = await page.evaluate(() => {
      const og = document.querySelector('meta[property="og:url"]');
      if (og) {
        const m = og.content.match(/instagram\.com\/([A-Za-z0-9._]+)\/(?:reel|p|tv)\//);
        if (m) return m[1];
      }
      const tt = document.querySelector('meta[name="twitter:title"]');
      if (tt) {
        const m = tt.content.match(/\(@([A-Za-z0-9._]+)\)/);
        if (m) return m[1];
      }
      return null;
    });
    if (owner) return owner;
  } catch {}
  try {
    const html = await page.content();
    const m = html.match(/"owner":\{"username":"([A-Za-z0-9._]+)"/) || html.match(/"username":"([A-Za-z0-9._]{3,})","full_name"/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

// ─── Instagram scraping (original) ───
async function scrapeInstagram(url, campaignId) {
  const cfg = loadConfig();
  const campaign = campaignId ? loadCampaign(campaignId) : null;
  const targetUrl = campaign ? (campaign.url || url) : (cfg.reelUrl || url);
  if (!targetUrl) return err('No URL configured.');

  const ctx = await launch(false);
  try {
    step('Opening the reel…');
    const page = await ctx.newPage();
    page.setDefaultTimeout(20000);
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
    if (page.url().includes('accounts/login')) throw new Error('SESSION_EXPIRED');
    await page.waitForTimeout(4000);

    const html = await page.content();
    const idMatch = html.match(/"media_id":"(\d+)(?:_\d+)?"/) || html.match(/"mediaId":"(\d+)"/) || html.match(/\/media\/(\d+)\/comments/);
    if (!idMatch) throw new Error('Could not find the media id in the page — check the reel URL and that you are logged in.');
    const mediaId = idMatch[1];

    const owner = await findOwner(page);
    if (owner && !cfg.ownerUsername) {
      const lib = require('./lib');
      lib.saveConfig({ ownerUsername: owner });
      ok(`Reel owner detected: @${owner} — will be excluded from leads.`);
    }
    info(`Media ${mediaId} — owner @${owner || 'unknown'}`);

    const users = new Map();
    const addUser = (username, comment, ts) => {
      if (!username || username === 'instagram' || username === owner) return;
      if (!users.has(username)) users.set(username, { comment: comment || '', ts: ts || '' });
    };

    const topComments = [];
    let paginationParams = null;
    let childCommentsParams = null;

    page.on('request', req => {
      if (req.url().includes('/api/graphql') && req.method() === 'POST') {
        const post = req.postData() || '';
        const decoded = decodeURIComponent(post).replace(/\+/g, ' ');
        if (decoded.includes('PolarisPostCommentsPaginationQuery') && !paginationParams) {
          const parsed = splitBody(post);
          if (parsed.variables && decodeVars(parsed.variables)) paginationParams = parsed.rest;
        }
        if (decoded.includes('PolarisPostChildCommentsQuery') && !childCommentsParams) {
          const parsed = splitBody(post);
          if (parsed.variables && decodeVars(parsed.variables)) childCommentsParams = parsed.rest;
        }
      }
    });

    async function gql(params, vars) {
      const body = params.join('&') + '&variables=' + encodeURIComponent(JSON.stringify(vars));
      return page.evaluate(async b => {
        const r = await fetch('https://www.instagram.com/api/graphql', {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-requested-with': 'XMLHttpRequest' },
          credentials: 'include',
          body: b
        });
        const t = await r.text();
        if (!t.trim().startsWith('{')) throw new Error('GraphQL returned a page (status ' + r.status + ')');
        return JSON.parse(t);
      }, body);
    }

    let usedFastPath = false;
    try {
      await page.locator('svg[aria-label="Comment"]').first().click({ timeout: 8000 });
      info('Opened the comments dialog…');
      await page.waitForTimeout(6000);
      await page.locator('div[role="dialog"]').evaluate(el => {
        const all = [...el.querySelectorAll('*')];
        const best = all.filter(n => n.scrollHeight > n.clientHeight + 100 && n.clientHeight > 100).sort((a, b) => b.scrollHeight - a.scrollHeight)[0];
        if (best) best.scrollTop = best.scrollHeight;
      }).catch(() => {});
      await page.waitForTimeout(3000);

      if (!paginationParams) {
        warn('Could not capture a fresh pagination template — using a known-good cached one.');
        paginationParams = CACHED_PAGINATION_PARAMS;
      }

      const baseVars = { media_id: mediaId, sort_order: 'popular', __relay_internal__pv__PolarisIsLoggedInrelayprovider: true };
      let after = null;
      let pageNum = 0;
      let guard = 0;
      let hasMore = true;

      while (hasMore && guard < 300) {
        const vars = { ...baseVars, first: 50, last: null, before: null, after };
        const j = await gql(paginationParams, vars);
        const conn = (j.data && Object.values(j.data)[0]) || null;
        if (!conn || !Array.isArray(conn.edges)) throw new Error('Unexpected comments response shape');
        for (const e of conn.edges) {
          const n = e.node;
          if (!n || !n.pk) continue;
          topComments.push(n);
          addUser(n.user && n.user.username, n.text, n.created_at);
        }
        pageNum++;
        const pi = conn.page_info || {};
        after = pi.end_cursor || null;
        hasMore = !!pi.has_next_page && !!after;
        info(`Comments page ${pageNum}: ${topComments.length} comments, ${users.size} unique users so far…`);
        guard++;
        await sleep(600 + Math.random() * 400);
      }
      usedFastPath = true;
      ok(`Loaded ${topComments.length} top-level comments via API.`);

      const withReplies = topComments.filter(c => (c.child_comment_count || 0) > 0);
      info(`${withReplies.length} comments have replies — fetching reply authors…`);
      if (withReplies.length) {
        const replyBtn = page.getByText(/View all \d+ replies?/i).first();
        if ((await replyBtn.count()) > 0) {
          await replyBtn.click().catch(() => {});
          await page.waitForTimeout(3000);
        }
        if (!childCommentsParams) {
          warn('Could not capture the replies template — reply authors will be missed (top-level commenters still saved).');
        } else {
          let done = 0;
          let noGainStreak = 0;
          for (const c of withReplies) {
            if (noGainStreak >= 80) {
              warn(`No new users from the last ${noGainStreak} reply fetches (mostly the owner replying) — stopping early.`);
              break;
            }
            const sizeBefore = users.size;
            try {
              const rv = { media_id: mediaId, comment_id: c.pk, sort_order: 'popular', __relay_internal__pv__PolarisIsLoggedInrelayprovider: true };
              let rAfter = null;
              let rGuard = 0;
              let rHasMore = true;
              while (rHasMore && rGuard < 30) {
                const rj = await gql(childCommentsParams, { ...rv, first: 50, last: null, before: null, after: rAfter });
                const rconn = (rj.data && Object.values(rj.data)[0]) || null;
                if (!rconn || !Array.isArray(rconn.edges)) break;
                for (const e of rconn.edges) {
                  const n = e.node;
                  if (!n || !n.pk) continue;
                  addUser(n.user && n.user.username, n.text, n.created_at);
                }
                const pi = rconn.page_info || {};
                rAfter = pi.end_cursor || null;
                rHasMore = !!pi.has_next_page && !!rAfter;
                rGuard++;
                await sleep(400 + Math.random() * 300);
              }
            } catch (e) {
              warn(`Replies for comment ${c.pk} failed: ${e.message.split('\n')[0]}`);
            }
            if (users.size === sizeBefore) noGainStreak++;
            else noGainStreak = 0;
            done++;
            if (done % 25 === 0) {
              info(`Replies fetched for ${done}/${withReplies.length} comments (${users.size} unique users)…`);
              saveCsv(users, cfg.ownerUsername, campaignId);
            }
          }
          ok(`Reply authors collected — ${users.size} unique users total.`);
        }
      }
    } catch (e) {
      if (e.message === 'SESSION_EXPIRED') throw e;
      warn(`Fast path failed (${e.message.split('\n')[0]}) — falling back to on-page scrolling.`);
      await scrapeCommentsViaUI(page, cfg, users);
    }

    if (cfg.ownerUsername) users.delete(cfg.ownerUsername);

    const rows = saveCsv(users, cfg.ownerUsername, campaignId);
    ok(`Done — ${rows.length} unique commenters saved.${usedFastPath ? ' (via GraphQL replay)' : ' (via page scroll)'}`);
    return rows;
  } catch (e) {
    if (e.message === 'SESSION_EXPIRED') throw e;
    err(`Scrape failed: ${e.message}`);
    process.exitCode = 1;
  } finally {
    await ctx.close();
  }
}

// ─── Facebook scraping (GraphQL interception via Playwright) ───
async function scrapeFacebook(url, campaignId) {
  const cfg = loadConfig();
  const campaign = campaignId ? loadCampaign(campaignId) : null;
  const targetUrl = campaign ? (campaign.url || url) : url;
  if (!targetUrl) return err('No Facebook URL configured.');

  const ctx = await launch(false);
  try {
    step('Opening Facebook post…');
    const page = await ctx.newPage();
    page.setDefaultTimeout(25000);
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
    if (page.url().includes('login') || page.url().includes('checkpoint')) throw new Error('SESSION_EXPIRED');
    await page.waitForTimeout(5000);

    const users = new Map();
    const addUser = (username, comment) => {
      if (!username || username === 'facebook') return;
      if (!users.has(username)) users.set(username, { comment: comment || '', ts: '' });
    };

    // Try to find post ID from page
    const html = await page.content();
    const postIdMatch = html.match(/"post_id":"(\d+)"/) || html.match(/"story_fbid":"(\d+)"/) || html.match(/\/permalink\/(\d+)/) || html.match(/\/posts\/(\d+)/);
    const postId = postIdMatch ? postIdMatch[1] : null;
    if (postId) {
      info(`Facebook post ID: ${postId}`);
    } else {
      warn('Could not extract post ID from URL — will try UI-based scraping.');
    }

    // Intercept GraphQL requests for comment pagination
    let firstCommentParams = null;
    page.on('request', req => {
      if (req.url().includes('graphql') && req.method() === 'POST') {
        const post = req.postData() || '';
        if (post.includes('CometUFICommentsQuery') || post.includes('comment') || post.includes('feedback')) {
          if (!firstCommentParams) firstCommentParams = post;
        }
      }
    });

    // Try opening comments section
    step('Looking for comments section…');
    try {
      const commentBtn = page.locator('[aria-label*="comment" i], [data-testid*="comment"]').first();
      if (await commentBtn.count() > 0) {
        await commentBtn.click({ timeout: 8000 });
        await page.waitForTimeout(3000);
      }
    } catch {
      info('Could not click comment button — comments may already be visible.');
    }

    // Scroll and collect usernames from links
    step('Scrolling to load comments…');
    let stableRounds = 0;
    let lastCount = 0;
    for (let round = 0; round < 200 && stableRounds < 5; round++) {
      // Scroll the page
      await page.evaluate(() => window.scrollBy(0, 800)).catch(() => {});
      await page.waitForTimeout(2000);

      // Collect usernames from links
      const links = await page.evaluate(() => {
        const results = [];
        document.querySelectorAll('a[href]').forEach(a => {
          const href = a.getAttribute('href') || '';
          const match = href.match(/^\/([a-zA-Z0-9.]+)(?:\/|$)/);
          if (match && !['login', 'privacy', 'terms', 'help', 'stories', 'watch', 'groups', 'pages', 'marketplace', 'gaming', 'events'].includes(match[1])) {
            const text = (a.textContent || '').trim();
            if (text.length > 1 && text.length < 50) {
              results.push({ username: match[1], comment: text });
            }
          }
        });
        return results;
      }).catch(() => []);

      for (const l of links) {
        addUser(l.username, l.comment);
      }

      const n = users.size;
      if (n === lastCount) stableRounds++;
      else stableRounds = 0;
      lastCount = n;

      if (round % 5 === 0) info(`Scroll round ${round}: ${users.size} usernames collected…`);
    }

    // Save results
    const rows = [...users.entries()]
      .map(([username, v]) => ({ username, comment: v.comment, commented_at: '' }))
      .sort((a, b) => a.username.localeCompare(b.username));

    if (campaignId) {
      writeCsv('commenters.csv', rows, campaignId);
    } else {
      writeCsv('commenters.csv', rows);
    }

    ok(`Done — ${rows.length} unique Facebook commenters collected.`);
    return rows;
  } catch (e) {
    if (e.message === 'SESSION_EXPIRED') {
      err('Session expired — run Connect again from the GUI.');
      return;
    }
    err(`Facebook scrape failed: ${e.message}`);
    process.exitCode = 1;
  } finally {
    await ctx.close();
  }
}

// ─── UI-based comment scraper (fallback) ───
async function scrapeCommentsViaUI(page, cfg, users) {
  const dialog = page.locator('div[role="dialog"]');
  if ((await dialog.count()) === 0) {
    const svg = page.locator('svg[aria-label="Comment"]').first();
    await svg.click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(2500);
  }
  let stableRounds = 0;
  let lastCount = 0;
  for (let round = 0; round < 400 && stableRounds < 5; round++) {
    await dialog
      .evaluate(() => {
        const all = [...document.querySelectorAll('div[role="dialog"] *')];
        const best = all.filter(n => n.scrollHeight > n.clientHeight + 100 && n.clientHeight > 100).sort((a, b) => b.scrollHeight - a.scrollHeight)[0];
        if (best) best.scrollTop = best.scrollHeight;
      })
      .catch(() => {});
    const links = await dialog
      .evaluate(() =>
        Array.from(document.querySelectorAll('div[role="dialog"] a[href^="/"]'))
          .map(a => a.getAttribute('href'))
          .filter(h => h && !h.includes('/p/') && !h.includes('/reel/') && !h.includes('/explore/') && !h.includes('/direct/'))
          .map(h => h.replace(/^\/|\/$/g, ''))
      )
      .catch(() => []);
    links.forEach(u => {
      if (u && u !== 'instagram' && !users.has(u)) users.set(u, { comment: '', ts: '' });
    });
    const n = users.size;
    if (n === lastCount) stableRounds++;
    else stableRounds = 0;
    lastCount = n;
    if (round % 5 === 0) info(`UI pass round ${round}: ${users.size} usernames…`);
    await page.waitForTimeout(1500);
  }
  if (cfg.ownerUsername) users.delete(cfg.ownerUsername);
  info(`UI pass collected ${users.size} usernames.`);
}

// ─── Main ───
(async () => {
  const { campaignId } = parseArgs();
  const campaign = campaignId ? loadCampaign(campaignId) : null;
  const cfg = loadConfig();

  const url = campaign ? campaign.url : cfg.reelUrl;
  if (!url) return err('No URL configured — set it in the GUI (Settings) first.');

  const platform = campaign ? campaign.platform : detectPlatform(url);

  try {
    if (platform === 'facebook') {
      step('Detected Facebook post — starting Facebook scraper…');
      if (campaign) { campaign.status = 'scraping'; saveCampaign(campaign); }
      await scrapeFacebook(url, campaignId);
    } else {
      step('Detected Instagram post — starting Instagram scraper…');
      if (campaign) { campaign.status = 'scraping'; saveCampaign(campaign); }
      await scrapeInstagram(url, campaignId);
    }

    // Update campaign status
    if (campaign) {
      campaign.status = 'idle';
      saveCampaign(campaign);
    }
  } catch (e) {
    if (campaign) {
      campaign.status = 'idle';
      saveCampaign(campaign);
    }
    throw e;
  }
})();
