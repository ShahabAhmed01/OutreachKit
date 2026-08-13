'use strict';

const { loadConfig, loadCampaign, readCsv, info, ok, todayKey } = require('./lib');

function parseArgs() {
  const args = process.argv.slice(2);
  const idx = args.indexOf('--campaign');
  const campaignId = idx !== -1 ? args[idx + 1] : null;
  return { campaignId };
}

(async () => {
  const { campaignId } = parseArgs();
  const cfg = loadConfig();
  const campaign = campaignId ? loadCampaign(campaignId) : null;

  if (campaign) {
    const commenters = readCsv('commenters.csv', campaignId);
    const sent = readCsv('sent.csv', campaignId);
    const contacted = readCsv('already-contacted.csv', campaignId);
    const replied = readCsv('replied.csv', campaignId);
    const dailyCap = campaign.dailyCap || cfg.dailyCap || 50;
    const sentToday = sent.filter(r => (r.sent_at || '').startsWith(todayKey())).length;
    const skip = new Set([...sent.map(r => r.username), ...contacted.map(r => r.username), ...replied.map(r => r.username)]);
    const remaining = commenters.filter(r => r.username && !skip.has(r.username)).length;

    ok(`Campaign: ${campaign.name} (${campaign.platform}) — ${campaign.status}`);
    info(
      `Leads: ${commenters.length} | contacted: ${contacted.length} | replied: ${replied.length} | sent: ${sent.length} (${sentToday} today / cap ${dailyCap}) | remaining: ${remaining}`
    );
    if (campaign.text1 && campaign.text1.length) {
      info(`Message variants: text1=${campaign.text1.length}, text2=${(campaign.text2 || []).length}, followups=${(campaign.followups || []).length}`);
    }
  } else {
    const commenters = readCsv('commenters.csv');
    const sent = readCsv('sent.csv');
    const contacted = readCsv('already-contacted.csv');
    const replied = readCsv('replied.csv');
    const sentToday = sent.filter(r => (r.sent_at || '').startsWith(todayKey())).length;
    const skip = new Set([...sent.map(r => r.username), ...contacted.map(r => r.username), ...replied.map(r => r.username)]);
    info(
      `Leads: ${commenters.length} | already messaged: ${contacted.length} | replied (hot): ${replied.length} | sent by tool: ${sent.length} (${sentToday} today / cap ${cfg.dailyCap}) | remaining: ${commenters.filter(r => !skip.has(r.username)).length}`
    );
  }
})();
