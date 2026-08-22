(function () {
  const API = '/api';
  const state = {
    view: 'dashboard',
    activeCampaign: null,
    leadsFilter: 'all',
    search: '',
    config: null,
    campaigns: [],
    dashboard: null,
    campaignDetails: null,
    leads: [],
    sentLeads: [],
    repliedLeads: [],
    logs: [],
    connected: false,
    wizardStep: 1,
    detectedPlatform: ''
  };

  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

  // ─── Init ───
  window.__init = async function () {
    bindNavigation();
    bindWizard();
    bindSettings();
    bindSearch();
    bindConsole();
    bindSidebar();
    startSSE();
    await refreshAll();
    navigate('dashboard');
  };

  // ─── SSE ───
  function startSSE() {
    const evtSource = new EventSource('/events');
    evtSource.onmessage = (e) => {
      const entry = JSON.parse(e.data);
      state.logs.push(entry);
      renderLog(entry);
    };
    evtSource.onerror = () => {
      state.connected = false;
      renderConnection();
      setTimeout(() => startSSE(), 3000);
    };
    evtSource.onopen = () => {
      state.connected = true;
      renderConnection();
    };
  }

  function renderConnection() {
    const badge = $('#connection-badge');
    if (!badge) return;
    badge.classList.toggle('connected', state.connected);
    badge.innerHTML = `<span class="conn-dot"></span>${state.connected ? 'Live' : 'Offline'}`;
  }

  function renderLog(entry) {
    const console = $('#log-output');
    if (!console) return;
    const line = document.createElement('div');
    line.className = 'log-line';
    const t = new Date(entry.time).toLocaleTimeString('en-US', { hour12: false });
    line.innerHTML = `<span class="log-time">${t}</span> <span class="log-origin">[${escapeHtml(entry.from || 'system')}]</span> <span class="log-${entry.level || 'info'}">${escapeHtml(entry.message || '')}</span>`;
    console.appendChild(line);
    console.scrollTop = console.scrollHeight;
    const count = $('#log-count');
    if (count) count.textContent = console.children.length;
  }

  // ─── API ───
  async function api(path, opts = {}) {
    const url = API + path;
    const res = await fetch(url, {
      method: opts.method || 'GET',
      headers: opts.body ? { 'Content-Type': 'application/json' } : undefined,
      body: opts.body ? JSON.stringify(opts.body) : undefined
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  async function refreshAll() {
    try {
      state.config = await api('/config');
      state.campaigns = await api('/campaigns');
      state.dashboard = await api('/dashboard');
      state.leads = await api('/leads?status=new');
      state.sentLeads = await api('/leads?status=sent');
      state.repliedLeads = await api('/leads?status=replied');
      renderAll();
    } catch (err) {
      console.error('Refresh failed:', err);
    }
  }

  function renderAll() {
    renderDashboard();
    renderCampaignList();
    renderCampaignsGrid();
    renderLeads();
    renderSettings();
    renderStatusPill();
  }

  // ─── Navigation ───
  function bindNavigation() {
    $$('.nav-btn').forEach((btn) => {
      btn.addEventListener('click', () => navigate(btn.dataset.view));
    });
  }

  function navigate(view) {
    state.view = view;
    $$('.nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
    $$('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${view}`));
    updateTopbar();
  }

  function updateTopbar() {
    const title = $('#page-title');
    const subtitle = $('#page-subtitle');
    const titles = {
      dashboard: ['Dashboard', 'Campaign overview'],
      campaigns: ['Campaigns', 'Manage all campaigns'],
      leads: ['Leads', 'Commenters & send status'],
      console: ['Activity', 'Live event stream'],
      settings: ['Settings', 'Scraper & message config']
    };
    const [t, s] = titles[state.view] || ['', ''];
    if (title) title.textContent = t;
    if (subtitle) subtitle.textContent = s;
  }

  // ─── Sidebar ───
  function bindSidebar() {
    const sidebar = $('.sidebar');
    const toggle = $('#sidebarToggle');
    const mobileBtn = $('.mobile-menu');
    const overlay = $('.sidebar-overlay');

    if (toggle) toggle.addEventListener('click', () => sidebar.classList.toggle('collapsed'));
    if (mobileBtn) {
      mobileBtn.addEventListener('click', () => {
        sidebar.classList.toggle('open');
        overlay.classList.toggle('open');
      });
    }
    if (overlay) {
      overlay.addEventListener('click', () => {
        sidebar.classList.remove('open');
        overlay.classList.remove('open');
      });
    }
  }

  // ─── Dashboard ───
  function renderDashboard() {
    const d = state.dashboard;
    if (!d) return;
    const set = (id, v) => {
      const el = $(`#${id}`);
      if (el) el.textContent = v;
    };
    set('stat-total', d.total || 0);
    set('stat-sent', d.sent || 0);
    set('stat-replied', d.replied || 0);
    set('stat-remaining', d.remaining || 0);

    const trend = $('#stat-trend');
    if (trend && d.total > 0) {
      const rate = d.sent > 0 ? Math.round((d.replied / d.sent) * 100) : 0;
      trend.textContent = `${rate}% reply`;
      if (rate > 10) trend.classList.add('up');
    }
  }

  function renderStatusPill() {
    const pill = $('#status-pill');
    if (!pill || !state.dashboard) return;
    const { running, paused, completed } = state.dashboard;
    pill.classList.remove('running', 'done');
    if (running) {
      pill.classList.add('running');
      pill.innerHTML = '<span class="pill-dot"></span>Running';
    } else if (completed) {
      pill.classList.add('done');
      pill.innerHTML = '<span class="pill-dot"></span>Done';
    } else if (paused) {
      pill.innerHTML = '<span class="pill-dot"></span>Paused';
    } else {
      pill.innerHTML = '<span class="pill-dot"></span>Idle';
    }
  }

  // ─── Campaign List (sidebar) ───
  function renderCampaignList() {
    const list = $('#campaign-list');
    if (!list) return;
    list.innerHTML = '';
    const campaigns = state.campaigns || [];
    campaigns.forEach((c) => {
      const item = document.createElement('div');
      item.className = `campaign-item${c.id === state.activeCampaign ? ' active' : ''}`;
      item.innerHTML = `
        <span class="platform-badge ${c.platform || 'instagram'}">${(c.platform || 'ig').charAt(0).toUpperCase()}</span>
        <span class="campaign-item-name">${escapeHtml(c.name || c.id)}</span>
        <span class="campaign-item-status ${c.status || ''}"></span>`;
      item.addEventListener('click', () => {
        state.activeCampaign = c.id;
        navigate('campaigns');
        loadCampaignDetails(c.id);
      });
      list.appendChild(item);
    });
  }

  // ─── Campaigns Grid ───
  function renderCampaignsGrid() {
    const grid = $('#campaigns-grid');
    if (!grid) return;
    grid.innerHTML = '';
    const campaigns = state.campaigns || [];
    if (campaigns.length === 0) {
      grid.innerHTML = `<div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 7a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/><path d="M3 7h18"/><path d="M8 11h2m4 0h2"/></svg><p>No campaigns yet. Click "New Campaign" to get started.</p></div>`;
      return;
    }
    campaigns.forEach((c) => {
      const card = document.createElement('div');
      card.className = `campaign-card ${c.platform || 'instagram'}${c.id === state.activeCampaign ? ' active' : ''}`;
      const stats = c.stats || {};
      card.innerHTML = `
        <div class="campaign-card-header">
          <div class="campaign-card-name">
            <span class="platform-badge ${c.platform || 'instagram'}">${(c.platform || 'ig').charAt(0).toUpperCase()}</span>
            ${escapeHtml(c.name || c.id)}
          </div>
          <span class="campaign-card-status ${c.status || 'draft'}">${c.status || 'draft'}</span>
        </div>
        <div class="campaign-card-stats">
          <div class="campaign-stat"><div class="campaign-stat-value">${stats.total || 0}</div><div class="campaign-stat-label">Leads</div></div>
          <div class="campaign-stat"><div class="campaign-stat-value">${stats.sent || 0}</div><div class="campaign-stat-label">Sent</div></div>
          <div class="campaign-stat"><div class="campaign-stat-value">${stats.replied || 0}</div><div class="campaign-stat-label">Replied</div></div>
        </div>
        <div class="campaign-card-actions">
          ${c.status === 'draft' || c.status === 'idle' ? `<button class="btn btn-primary btn-sm" data-action="scrape" data-id="${c.id}">Scrape</button>` : ''}
          ${c.status === 'scraping' ? `<button class="btn btn-ghost btn-sm" disabled>Scraping...</button>` : ''}
          ${c.status === 'idle' || c.status === 'completed' || c.status === 'paused' ? `<button class="btn btn-primary btn-sm" data-action="start" data-id="${c.id}">Send</button>` : ''}
          ${c.status === 'running' ? `<button class="btn btn-ghost btn-sm" data-action="pause" data-id="${c.id}">Pause</button>` : ''}
          <button class="btn btn-danger btn-sm" data-action="delete" data-id="${c.id}">Delete</button>
        </div>`;
      card.addEventListener('click', (e) => {
        if (e.target.closest('[data-action]')) return;
        state.activeCampaign = c.id;
        loadCampaignDetails(c.id);
        navigate('leads');
      });
      grid.appendChild(card);
    });

    $$('[data-action]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        handleCampaignAction(btn.dataset.action, btn.dataset.id);
      });
    });
  }

  async function handleCampaignAction(action, id) {
    try {
      if (action === 'delete' && !confirm('Delete this campaign?')) return;
      await api(`/campaigns/${id}/${action}`, { method: 'POST' });
      await refreshAll();
    } catch (err) {
      console.error(`Action ${action} failed:`, err);
    }
  }

  async function loadCampaignDetails(id) {
    state.activeCampaign = id;
    try {
      state.campaignDetails = await api(`/campaigns/${id}`);
      state.leads = await api(`/campaigns/${id}/leads?status=new`);
      state.sentLeads = await api(`/campaigns/${id}/leads?status=sent`);
      state.repliedLeads = await api(`/campaigns/${id}/leads?status=replied`);
      renderLeads();
    } catch (err) {
      console.error('Load campaign failed:', err);
    }
  }

  // ─── Leads ───
  function renderLeads() {
    const tbody = $('#leads-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    const filter = state.leadsFilter;
    let leads = [];
    if (filter === 'new') leads = state.leads || [];
    else if (filter === 'sent') leads = state.sentLeads || [];
    else if (filter === 'replied') leads = state.repliedLeads || [];
    else
      {leads = [...(state.leads || []), ...(state.sentLeads || []), ...(state.repliedLeads || [])];}

    const q = (state.search || '').toLowerCase();
    if (q)
      {leads = leads.filter(
        (l) =>
          (l.username || '').toLowerCase().includes(q) ||
          (l.comment || '').toLowerCase().includes(q)
      );}

    const countEl = $('#lead-count');
    if (countEl) countEl.textContent = `${leads.length} lead${leads.length !== 1 ? 's' : ''}`;

    leads.forEach((lead) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="td-user">@${escapeHtml(lead.username)}</td>
        <td class="td-comment">${escapeHtml(lead.comment || '')}</td>
        <td class="td-time">${lead.timestamp ? new Date(lead.timestamp).toLocaleDateString() : '—'}</td>
        <td><span class="status-badge ${lead.status || 'new'}">${lead.status || 'new'}</span></td>`;
      tbody.appendChild(tr);
    });

    if (leads.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg><p>No leads match this filter.</p></td></tr>`;
    }

    $$('.chip').forEach((chip) => {
      chip.classList.toggle('active', chip.dataset.filter === filter);
      chip.onclick = () => {
        state.leadsFilter = chip.dataset.filter;
        renderLeads();
      };
    });
  }

  // ─── Search ───
  function bindSearch() {
    const input = $('#leads-search');
    if (input) {
      input.addEventListener('input', () => {
        state.search = input.value;
        renderLeads();
      });
    }
  }

  // ─── Console ───
  function bindConsole() {
    const clearBtn = $('#clear-logs');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        state.logs = [];
        const out = $('#log-output');
        if (out) out.innerHTML = '';
        const count = $('#log-count');
        if (count) count.textContent = '0';
      });
    }
  }

  // ─── Settings ───
  function bindSettings() {
    const form = $('#settings-form');
    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const data = {
          dailyCap: parseInt($('#daily-cap').value) || 50,
          minDelay: parseInt($('#min-delay').value) || 30,
          maxDelay: parseInt($('#max-delay').value) || 90,
          messagePause: parseInt($('#message-pause').value) || 180,
          text1: $('#text1').value,
          followups: $('#followups')
            .value.split('\n')
            .filter((l) => l.trim()),
          alreadyContactedFile: $('#already-contacted-file').value,
          dmCap: parseInt($('#dm-cap').value) || 0,
          dmWindow: $('#dm-window').value || '',
          dmMessage: $('#dm-message').value,
          dmFollowups: $('#dm-followups').value,
          dmMinDelay: parseInt($('#dm-min-delay').value) || 5,
          dmMaxDelay: parseInt($('#dm-max-delay').value) || 15,
          dmSessionTimeout: parseInt($('#dm-session-timeout').value) || 0,
          dmScrollPause: parseInt($('#dm-scroll-pause').value) || 3
        };
        try {
          await api('/config', { method: 'POST', body: data });
          const status = $('#save-status');
          if (status) {
            status.textContent = 'Saved';
            setTimeout(() => (status.textContent = ''), 2000);
          }
          await refreshAll();
        } catch (err) {
          console.error('Save failed:', err);
        }
      });
    }
  }

  function renderSettings() {
    const c = state.config || {};
    const set = (id, v) => {
      const el = $(`#${id}`);
      if (el) el.value = v ?? '';
    };
    set('daily-cap', c.dailyCap || 50);
    set('min-delay', c.minDelay || 30);
    set('max-delay', c.maxDelay || 90);
    set('message-pause', c.messagePause || 180);
    set('text1', c.text1 || '');
    set('followups', (c.followups || []).join('\n'));
    set('already-contacted-file', c.alreadyContactedFile || '');
    set('dm-cap', c.dmCap || 0);
    set('dm-window', c.dmWindow || '');
    set('dm-message', c.dmMessage || '');
    set('dm-followups', c.dmFollowups || '');
    set('dm-min-delay', c.dmMinDelay || 5);
    set('dm-max-delay', c.dmMaxDelay || 15);
    set('dm-session-timeout', c.dmSessionTimeout || 0);
    set('dm-scroll-pause', c.dmScrollPause || 3);
  }

  // ─── Wizard ───
  function bindWizard() {
    const newBtn = $('#btn-new-campaign');
    const closeBtn = $('#modalClose');
    const backBtn = $('#wizBack');
    const nextBtn = $('#wizNext');
    const urlInput = $('#wizUrl');
    const addVariantBtns = $$('.add-variant');
    const addFollowupBtn = $('#btnAddFollowup');
    const wizSchedule = $('#wizSchedule');
    const wizScheduleRow = $('#wizScheduleRow');

    if (newBtn) newBtn.addEventListener('click', openWizard);
    if (closeBtn) closeBtn.addEventListener('click', closeWizard);
    if (backBtn) backBtn.addEventListener('click', () => wizardNav(-1));
    if (nextBtn) nextBtn.addEventListener('click', wizardNext);
    if (urlInput) urlInput.addEventListener('input', detectPlatform);

    if (addVariantBtns.length) {
      addVariantBtns.forEach((btn) => {
        btn.addEventListener('click', () => addVariantRow(btn.dataset.target));
      });
    }

    if (addFollowupBtn) {
      addFollowupBtn.addEventListener('click', addFollowupBlock);
    }

    // Remove variant buttons (delegated)
    document.addEventListener('click', (e) => {
      if (e.target.closest('.remove-variant')) {
        const row = e.target.closest('.variant-row');
        if (row) row.remove();
      }
    });

    if (wizSchedule && wizScheduleRow) {
      wizSchedule.addEventListener('change', () => {
        wizScheduleRow.hidden = !wizSchedule.checked;
      });
    }
  }

  function openWizard() {
    const overlay = $('#modalOverlay');
    if (overlay) overlay.hidden = false;
    state.wizardStep = 1;
    state.detectedPlatform = '';
    updateWizard();
  }

  function closeWizard() {
    const overlay = $('#modalOverlay');
    if (overlay) overlay.hidden = true;
    resetWizard();
  }

  function wizardNav(dir) {
    state.wizardStep = Math.max(1, Math.min(3, state.wizardStep + dir));
    updateWizard();
  }

  function wizardNext() {
    if (state.wizardStep === 3) {
      finishWizard();
    } else {
      wizardNav(1);
    }
  }

  function updateWizard() {
    const step = state.wizardStep;
    $$('.wizard-step').forEach((s) => {
      const n = parseInt(s.dataset.step);
      s.classList.toggle('active', n === step);
    });
    const back = $('#wizBack');
    const next = $('#wizNext');
    if (back) back.hidden = step === 1;
    if (next) next.textContent = step === 3 ? 'Create Campaign' : 'Next';
  }

  function detectPlatform() {
    const url = $('#wizUrl')?.value || '';
    const badge = $('#wizPlatformBadge');
    const icon = $('#wizPlatformIcon');
    const name = $('#wizPlatformName');
    const platformField = $('#wizPlatform');
    if (!badge) return;

    const fb = /facebook\.com|fb\.com|fb\.watch/i.test(url);
    const ig = /instagram\.com/i.test(url);

    if (fb) {
      badge.hidden = false;
      icon.className = 'platform-icon facebook';
      icon.textContent = 'f';
      name.textContent = 'Facebook URL detected';
      state.detectedPlatform = 'facebook';
      if (platformField) platformField.value = 'Facebook';
    } else if (ig) {
      badge.hidden = false;
      icon.className = 'platform-icon instagram';
      icon.textContent = 'ig';
      name.textContent = 'Instagram URL detected';
      state.detectedPlatform = 'instagram';
      if (platformField) platformField.value = 'Instagram';
    } else {
      badge.hidden = true;
      state.detectedPlatform = '';
      if (platformField) platformField.value = '';
    }
  }

  function resetWizard() {
    state.wizardStep = 1;
    state.detectedPlatform = '';
    ['wizName', 'wizUrl'].forEach((id) => {
      const el = $(`#${id}`);
      if (el) el.value = '';
    });
    $$('.variant-input').forEach((el) => (el.value = ''));
    $$('.variants-container').forEach((c) => {
      const rows = $$('.variant-row', c);
      rows.slice(1).forEach((r) => r.remove());
    });
    const badge = $('#wizPlatformBadge');
    if (badge) badge.hidden = true;
    const platform = $('#wizPlatform');
    if (platform) platform.value = '';
    const wizCap = $('#wizCap');
    if (wizCap) wizCap.value = '50';
    const wizDelayMin = $('#wizDelayMin');
    if (wizDelayMin) wizDelayMin.value = '60';
    const wizDelayMax = $('#wizDelayMax');
    if (wizDelayMax) wizDelayMax.value = '120';
    updateWizard();
  }

  function addVariantRow(target) {
    const container = $(`#wiz${target.charAt(0).toUpperCase() + target.slice(1)}`);
    if (!container) return;
    const row = document.createElement('div');
    row.className = 'variant-row';
    row.innerHTML = `
      <input type="text" class="form-input variant-input" placeholder="Write message variant..." spellcheck="false">
      <button class="btn-icon-only remove-variant" title="Remove"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>`;
    container.appendChild(row);
  }

  function addFollowupBlock() {
    const container = $('#wizFollowups');
    if (!container) return;
    const section = document.createElement('div');
    section.className = 'message-section';
    section.style.marginBottom = '12px';
    section.innerHTML = `
      <div class="message-section-header">
        <span class="message-step-label">Follow-up</span>
        <input type="text" class="form-input variant-input" placeholder="Write follow-up message..." spellcheck="false" style="flex:1;">
        <button class="btn-icon-only remove-variant" title="Remove follow-up"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
      </div>`;
    container.appendChild(section);
  }

  async function finishWizard() {
    const url = $('#wizUrl')?.value?.trim();
    const name = $('#wizName')?.value?.trim();
    const platform = state.detectedPlatform || 'instagram';
    if (!url) return alert('Paste a post URL');
    if (!name) return alert('Enter a campaign name');

    const getVariantTexts = (containerId) => {
      const inputs = $$(`#${containerId} .variant-input`);
      return inputs.map((i) => i.value.trim()).filter(Boolean);
    };

    const text1 = getVariantTexts('wizText1');
    const text2 = getVariantTexts('wizText2');

    // Follow-ups from the dynamic followup container
    const followupContainer = $('#wizFollowups');
    const followups = [];
    if (followupContainer) {
      $$('.variant-input', followupContainer).forEach((el) => {
        const val = el.value.trim();
        if (val) followups.push(val);
      });
    }

    if (text1.length === 0) return alert('Write at least one opening message');

    const dailyCap = parseInt($('#wizCap')?.value) || 50;
    const minDelay = parseInt($('#wizDelayMin')?.value) || 60;
    const maxDelay = parseInt($('#wizDelayMax')?.value) || 120;

    try {
      await api('/campaigns', {
        method: 'POST',
        body: { url, name, platform, text1, text2, followups, dailyCap, minDelay, maxDelay }
      });
      closeWizard();
      await refreshAll();
      navigate('campaigns');
    } catch (err) {
      console.error('Create campaign failed:', err);
      alert('Failed to create campaign');
    }
  }

  // ─── Utils ───
  function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }
})();
