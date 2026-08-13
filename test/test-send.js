'use strict';
let P = 0, F = 0;
function ok(label) { P++; }
function fail(label, msg) { F++; console.error('FAIL [' + label + ']: ' + msg); }
function check(label, cond, msg) { if (cond) ok(label); else fail(label, msg || String(cond)); }

const pick = a => a[Math.floor(Math.random() * a.length)];
function fillTemplate(tpl, lead) {
  return tpl.split('{username}').join(lead.username||'').split('{comment}').join(lead.comment||'').split('{link}').join(lead.link||'');
}
function passesFilter(cfg, lead) {
  if (!cfg || !cfg.commentFilter || !cfg.commentFilter.enabled) return true;
  const kw = cfg.commentFilter.keywords || [];
  if (!kw.length) return true;
  const c = String(lead.comment||'').toLowerCase();
  return kw.some(k => k && c.includes(k));
}
function pad2(n) { return String(n).padStart(2,'0'); }
function nowHM() { const d=new Date(); return pad2(d.getHours())+':'+pad2(d.getMinutes()); }
function inScheduleWindow(cfg) {
  if (!cfg || !cfg.schedule || !cfg.schedule.enabled) return true;
  const now=nowHM(), s=cfg.schedule.start||'09:00', e=cfg.schedule.end||'23:00';
  if (s<=e) return now>=s&&now<=e;
  return now>=s||now<=e;
}
function buildMessageSequence(lead, campaign, cfg) {
  if (campaign) {
    const t1=campaign.text1||[], t2=campaign.text2||[], fu=campaign.followups||[];
    const seq=[];
    if(t1.length>0) seq.push(fillTemplate(pick(t1),lead));
    if(t2.length>0) seq.push(fillTemplate(pick(t2),lead));
    for(const f of fu){if(Array.isArray(f)){seq.push(fillTemplate(pick(f),lead));}else if(typeof f==='string'&&f.trim()){seq.push(fillTemplate(f,lead));}}
    return seq.filter(m=>m&&m.trim());
  }
  if(cfg&&cfg.messages&&cfg.messages.openers&&cfg.messages.openers.length){return[pick(cfg.messages.openers),...cfg.messages.questions].map(m=>fillTemplate(m,lead)).filter(m=>m.trim());}
  return[];
}

const lead={username:'alice',comment:'great post!',link:'https://example.com'};

// fillTemplate
check('fill user',fillTemplate('Hey {username}',lead)==='Hey alice');
check('fill comment',fillTemplate('About {comment}',lead)==='About great post!');
check('fill link',fillTemplate('Check {link}',lead)==='Check https://example.com');
check('fill all',fillTemplate('{username} said {comment} see {link}',lead)==='alice said great post! see https://example.com');
check('fill none',fillTemplate('No placeholders',lead)==='No placeholders');
check('fill empty',fillTemplate('',lead)==='');
check('fill unknown',fillTemplate('{missing}',lead)==='{missing}');
check('fill empty lead',fillTemplate('Hey {username}',{})==='Hey ');

// passesFilter
check('filter disabled',passesFilter({commentFilter:{enabled:false}},{comment:'anything'}));
check('filter no kw',passesFilter({commentFilter:{enabled:true,keywords:[]}},{comment:'anything'}));
check('filter match',passesFilter({commentFilter:{enabled:true,keywords:['hello']}},{comment:'Hello World'}));
check('filter no match',!passesFilter({commentFilter:{enabled:true,keywords:['hello']}},{comment:'Goodbye'}));
check('filter multi',passesFilter({commentFilter:{enabled:true,keywords:['foo','bar']}},{comment:'I like bar'}));
check('filter case',passesFilter({commentFilter:{enabled:true,keywords:['hello']}},{comment:'HELLO'}));
check('filter empty c',!passesFilter({commentFilter:{enabled:true,keywords:['hello']}},{comment:''}));
check('filter no c',!passesFilter({commentFilter:{enabled:true,keywords:['hello']}},{}));
check('filter null',passesFilter(null,{comment:'x'}));
check('filter no cf',passesFilter({}, {comment:'x'}));

// inScheduleWindow
check('sched disabled',inScheduleWindow({schedule:{enabled:false}}));
check('sched no cfg',inScheduleWindow({}));
check('sched null',inScheduleWindow(null));
check('sched wide',inScheduleWindow({schedule:{enabled:true,start:'00:00',end:'23:59'}}));

// buildMessageSequence
const cam={text1:['Hey {username}','Hi {username}'],text2:['About {comment}'],followups:['Follow up',['A','B']]};
const seq=buildMessageSequence(lead,cam,{});
check('seq has 4',seq.length===4);
check('seq text1',seq[0].startsWith('Hey alice')||seq[0].startsWith('Hi alice'));
check('seq text2',seq[1]==='About great post!');
check('seq follow str',seq[2]==='Follow up');
check('seq follow arr',['A','B'].includes(seq[3]));

const legacy={messages:{openers:['Hey {username}'],questions:['Q1','Q2']}};
const ls=buildMessageSequence(lead,null,legacy);
check('legacy opener',ls[0]==='Hey alice');
check('legacy len',ls.length===3);
check('empty cam',buildMessageSequence(lead,{},{}).length===0);
check('null all',buildMessageSequence(lead,null,{}).length===0);

// pick
check('pick single',pick(['only'])==='only');
check('pick variety',new Set([pick(['a','b']),pick(['a','b']),pick(['a','b']),pick(['a','b']),pick(['a','b'])]).size>1);

// pad2
check('pad2 0',pad2(0)==='00');
check('pad2 5',pad2(5)==='05');
check('pad2 12',pad2(12)==='12');

console.log('\n=== send.js unit: '+P+' passed, '+F+' failed ===');
if(F>0)process.exit(1);
