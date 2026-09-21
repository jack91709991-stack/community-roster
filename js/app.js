/**
 * 自治会員名簿管理システム - メインアプリケーションロジック
 */

// アプリケーション状態管理
const state = {
  members: [],
  applications: [],
  currentTab: 'tab-members',
  currentFeeBan: '1班',
  desktopViewMode: 'table', // 'table' or 'cards'
  appFilter: 'pending', // 'pending' or 'all'
  searchKeyword: '',
  filters: {
    block: 'all',
    ban: 'all',
    role: 'all',
    ban_leader: 'all',
    fee: 'all',
    circulation: 'all',
    status: 'all'
  },
  editingBlocks: null,
  editingRoles: null,
  activeMember: null,
  activeApp: null,
  audioCtx: null
};

// サービスワーカー登録
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js')
      .then(reg => console.log('Service Worker registered:', reg.scope))
      .catch(err => console.warn('Service Worker registration skipped or failed:', err));
  });
}

// 効果音再生
function playTone(type) {
  try {
    if (!state.audioCtx) {
      state.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (state.audioCtx.state === 'suspended') {
      state.audioCtx.resume();
    }
    const ctx = state.audioCtx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    const now = ctx.currentTime;

    if (type === 'success') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, now); // A5
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
      osc.start(now);
      osc.stop(now + 0.15);
    } else if (type === 'toggle') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(659, now); // E5
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
      osc.start(now);
      osc.stop(now + 0.1);
    } else if (type === 'delete') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, now);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.linearRampToValueAtTime(0.01, now + 0.25);
      osc.start(now);
      osc.stop(now + 0.25);
    }
  } catch (e) {
    // Web Audio unsupported or blocked
  }
}

// トースト通知の表示
function showToast(message, icon = 'ℹ️') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `<span>${icon}</span><span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}

// 同期ステータスバッジの更新
function updateSyncStatus(status, text) {
  const indicator = document.getElementById('sync-indicator');
  const textElem = document.getElementById('sync-status-text');
  if (!indicator || !textElem) return;

  indicator.className = `sync-indicator ${status}`;
  textElem.textContent = text || (status === 'online' ? '接続中' : status === 'syncing' ? '同期待ち' : status === 'offline' ? 'オフライン' : 'ローカル');
}

// =============================================================================
// 初期化 & イベント登録
// =============================================================================
document.addEventListener('DOMContentLoaded', async () => {
  initDropdownOptions();
  initEventListeners();
  updateCommunityTitleDisplay();
  renderBlockSettings();
  renderRoleSettings();

  // 初回データロード
  await loadData();
});

// セレクトボックスのオプション初期設定
function initDropdownOptions() {
  populateBlockAndBanDropdowns();
  populateRoleDropdowns();
}

// 役職の各セレクトボックスを動的再生成
function populateRoleDropdowns() {
  syncRoleList();
  const filterRole = document.getElementById('filter-role');
  const modalRole = document.getElementById('m-role');
  const approveRole = document.getElementById('approve-role');

  const currentFilterRole = state.filters.role || 'all';

  if (filterRole) {
    let roleHtml = '<option value="all">役員: すべて</option>';
    ROLE_LIST.forEach(role => {
      roleHtml += `<option value="${escapeHtml(role)}" ${currentFilterRole === role ? 'selected' : ''}>役員: ${escapeHtml(role)}</option>`;
    });
    filterRole.innerHTML = roleHtml;
    if (currentFilterRole !== 'all' && !ROLE_LIST.includes(currentFilterRole)) {
      state.filters.role = 'all';
      filterRole.value = 'all';
    }
  }

  if (modalRole) {
    const prev = modalRole.value;
    let roleHtml = '';
    ROLE_LIST.forEach(role => {
      roleHtml += `<option value="${escapeHtml(role)}">${escapeHtml(role)}</option>`;
    });
    modalRole.innerHTML = roleHtml;
    if (prev && ROLE_LIST.includes(prev)) modalRole.value = prev;
  }

  if (approveRole) {
    const prev = approveRole.value;
    let roleHtml = '';
    ROLE_LIST.forEach(role => {
      roleHtml += `<option value="${escapeHtml(role)}">${escapeHtml(role)}</option>`;
    });
    approveRole.innerHTML = roleHtml;
    if (prev && ROLE_LIST.includes(prev)) {
      approveRole.value = prev;
    } else if (ROLE_LIST.length > 0) {
      approveRole.value = ROLE_LIST[0];
    }
  }
}

// ブロック・班の各セレクトボックスを動的再生成
function populateBlockAndBanDropdowns() {
  const blockConfig = getBlockConfig();
  syncBanListFromBlocks();

  // 1. ブロックフィルター (<select id="filter-block">)
  const filterBlock = document.getElementById('filter-block');
  if (filterBlock) {
    const currentVal = state.filters.block || 'all';
    let html = '<option value="all">ブロック: すべて</option>';
    blockConfig.forEach(b => {
      html += `<option value="${escapeHtml(b.name)}" ${currentVal === b.name ? 'selected' : ''}>${escapeHtml(b.name)}</option>`;
    });
    filterBlock.innerHTML = html;
  }

  // 2. 班フィルター (<select id="filter-ban">)
  updateFilterBanDropdown();

  // 3. モーダル・集金等の班セレクト (<select id="m-ban">, <select id="approve-ban">, <select id="fee-ban-select">)
  const modalBan = document.getElementById('m-ban');
  const approveBan = document.getElementById('approve-ban');
  const feeBanSelect = document.getElementById('fee-ban-select');

  let groupedBanOptions = '';
  blockConfig.forEach(b => {
    if (b.bans && b.bans.length > 0) {
      groupedBanOptions += `<optgroup label="${escapeHtml(b.name)}">`;
      b.bans.forEach(ban => {
        groupedBanOptions += `<option value="${escapeHtml(ban)}">${escapeHtml(ban)}</option>`;
      });
      groupedBanOptions += `</optgroup>`;
    }
  });

  if (modalBan) {
    const prev = modalBan.value;
    modalBan.innerHTML = groupedBanOptions;
    if (prev && BAN_LIST.includes(prev)) modalBan.value = prev;
  }
  if (approveBan) {
    const prev = approveBan.value;
    approveBan.innerHTML = groupedBanOptions;
    if (prev && BAN_LIST.includes(prev)) approveBan.value = prev;
  }
  if (feeBanSelect) {
    const prev = feeBanSelect.value;
    feeBanSelect.innerHTML = groupedBanOptions;
    if (prev && BAN_LIST.includes(prev)) {
      feeBanSelect.value = prev;
    } else if (BAN_LIST.length > 0) {
      feeBanSelect.value = BAN_LIST[0];
      state.currentFeeBan = BAN_LIST[0];
    }
  }
}

// 班フィルタードロップダウンの更新（選択中ブロックに応じた連動）
function updateFilterBanDropdown() {
  const filterBan = document.getElementById('filter-ban');
  if (!filterBan) return;

  const blockConfig = getBlockConfig();
  const selectedBlock = state.filters.block || 'all';
  const currentBan = state.filters.ban || 'all';

  let html = '<option value="all">班: すべて</option>';

  if (selectedBlock === 'all') {
    blockConfig.forEach(b => {
      if (b.bans && b.bans.length > 0) {
        html += `<optgroup label="${escapeHtml(b.name)}">`;
        b.bans.forEach(ban => {
          html += `<option value="${escapeHtml(ban)}" ${currentBan === ban ? 'selected' : ''}>${escapeHtml(ban)}</option>`;
        });
        html += `</optgroup>`;
      }
    });
  } else {
    const targetBlock = blockConfig.find(b => b.name === selectedBlock);
    if (targetBlock && targetBlock.bans) {
      targetBlock.bans.forEach(ban => {
        html += `<option value="${escapeHtml(ban)}" ${currentBan === ban ? 'selected' : ''}>${escapeHtml(ban)}</option>`;
      });
    }
  }

  filterBan.innerHTML = html;

  // 選択されていた班が存在しない場合は 'all' にリセット
  if (currentBan !== 'all' && !filterBan.querySelector(`option[value="${currentBan}"]`)) {
    state.filters.ban = 'all';
    filterBan.value = 'all';
  } else {
    filterBan.value = currentBan;
  }
}

// 自治会名ヘッダー更新
function updateCommunityTitleDisplay() {
  const name = api.getCommunityName();
  const titleEl = document.getElementById('display-community-name');
  const printTitleEl = document.getElementById('print-community-title');
  const settingInput = document.getElementById('setting-community-name');
  if (titleEl) titleEl.textContent = name;
  if (printTitleEl) printTitleEl.textContent = `${name} 会員名簿`;
  if (settingInput) settingInput.value = name;
}

// データ読み込み＆全体再描画
async function loadData() {
  const result = await api.loadAllData((status, text) => {
    updateSyncStatus(status, text);
  });

  state.members = result.members || [];
  state.applications = result.applications || [];

  // スプレッドシートから設定がロードされた場合、ローカルの編集バッファをリセットしUIを最新化
  state.editingBlocks = null;
  state.editingRoles = null;
  populateBlockAndBanDropdowns();
  populateRoleDropdowns();
  updateCommunityTitleDisplay();
  renderBlockSettings();
  renderRoleSettings();

  renderAllViews();
}

// 全ビュー描画
function renderAllViews() {
  renderMembersList();
  renderApplicationsList();
  renderFeeCollection();
  renderDashboard();
  renderReportsTab();
  updatePendingBadges();
}

// 申請未処理バッジの更新
function updatePendingBadges() {
  const pendingCount = state.applications.filter(a => a.status === '未処理').length;
  const pcBadge = document.getElementById('pc-app-badge');
  const mobileBadge = document.getElementById('mobile-app-badge');

  [pcBadge, mobileBadge].forEach(el => {
    if (!el) return;
    if (pendingCount > 0) {
      el.textContent = pendingCount;
      el.style.display = 'inline-block';
    } else {
      el.style.display = 'none';
    }
  });

  const appCountLabel = document.getElementById('app-count-label');
  if (appCountLabel) {
    appCountLabel.textContent = `未処理: ${pendingCount}件`;
  }
}

// =============================================================================
// タブ切り替え制御
// =============================================================================
function switchTab(targetTabId) {
  state.currentTab = targetTabId;

  // コンテンツの切り替え
  document.querySelectorAll('.tab-content').forEach(tab => {
    tab.classList.toggle('active', tab.id === targetTabId);
  });

  // PCナビのアクティブ切り替え
  document.querySelectorAll('.desktop-nav .nav-tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-tab') === targetTabId);
  });

  // モバイルナビのアクティブ切り替え
  document.querySelectorAll('.bottom-nav .bottom-nav-item').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-tab') === targetTabId);
  });

  // タブに応じた再描画
  if (targetTabId === 'tab-members') renderMembersList();
  if (targetTabId === 'tab-applications') renderApplicationsList();
  if (targetTabId === 'tab-fees') renderFeeCollection();
  if (targetTabId === 'tab-reports') renderReportsTab();
  if (targetTabId === 'tab-settings') {
    renderBlockSettings();
    renderRoleSettings();
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// =============================================================================
// TAB 1: 会員名簿一覧・検索・フィルタ描画
// =============================================================================
function getFilteredMembers() {
  const q = normalizeSearchText(state.searchKeyword);
  const { block, ban, role, ban_leader, fee, circulation, status } = state.filters;
  const blockConfig = getBlockConfig();

  return state.members.filter(m => {
    // 検索語句マッチ
    if (q) {
      const matchName = normalizeSearchText(m.name).includes(q);
      const matchKana = normalizeSearchText(m.kana).includes(q);
      const matchPhone = normalizeSearchText(m.phone).includes(q) || normalizeSearchText(m.phone2 || '').includes(q);
      const matchAddress = normalizeSearchText(m.address).includes(q);
      const matchId = normalizeSearchText(m.id).includes(q);
      const matchFamily = normalizeSearchText(m.family_members).includes(q);
      if (!matchName && !matchKana && !matchPhone && !matchAddress && !matchId && !matchFamily) {
        return false;
      }
    }

    // ブロックフィルター
    if (block && block !== 'all') {
      const memberBlock = getBanBlockName(m.ban, blockConfig);
      if (memberBlock !== block) return false;
    }

    // 班フィルター
    if (ban !== 'all' && m.ban !== ban) return false;

    // 役員フィルター
    if (role !== 'all' && m.role !== role) return false;

    // 班長フィルター
    if (ban_leader !== 'all') {
      const isLeader = m.ban_leader === '班長';
      if (ban_leader === '班長' && !isLeader) return false;
      if (ban_leader === 'なし' && isLeader) return false;
    }

    // 会費フィルター
    if (fee !== 'all' && m.fee_status !== fee) return false;

    // 回覧方法フィルター
    if (circulation !== 'all' && (m.circulation || '紙') !== circulation) return false;

    // 会員状態フィルター
    if (status !== 'all' && m.status !== status) return false;

    return true;
  });
}

function renderMembersList() {
  const filtered = getFilteredMembers();
  const countLabel = document.getElementById('member-count-label');
  if (countLabel) countLabel.textContent = `該当: ${filtered.length}件`;

  // 1. モバイル用カードリスト描画
  const cardsContainer = document.getElementById('member-cards-list');
  if (cardsContainer) {
    if (filtered.length === 0) {
      cardsContainer.innerHTML = `
        <div style="text-align: center; padding: 36px 16px; color: var(--text-muted); background: #ffffff; border-radius: var(--radius-md); border: 1px dashed var(--border-color);">
          <div style="font-size: 2rem; margin-bottom: 8px;">🔍</div>
          <div>条件に一致する会員が見つかりませんでした</div>
        </div>`;
    } else {
      cardsContainer.innerHTML = filtered.map(m => createMemberCardHtml(m)).join('');
    }
  }

  // 2. PC用テーブル描画
  const tableBody = document.getElementById('member-table-body');
  if (tableBody) {
    if (filtered.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="13" style="text-align: center; padding: 24px; color: var(--text-muted);">一致する会員はいません</td></tr>`;
    } else {
      tableBody.innerHTML = filtered.map(m => createMemberTableRowHtml(m)).join('');
    }
  }
}

function createMemberCardHtml(m) {
  const isOfficer = m.role && m.role !== '一般会員';
  const isBanLeader = m.ban_leader === '班長';
  const isWithdrawn = m.status === '転出退会';
  const isSuspended = m.status === '休会';

  const statusBadge = isWithdrawn 
    ? `<span class="badge badge-status-withdrawn">⛔ 転出退会</span>`
    : isSuspended 
    ? `<span class="badge badge-status-suspended">⏸️ 休会中</span>`
    : `<span class="badge badge-status-active">現役</span>`;

  const isLine = (m.circulation || '紙') === 'LINE';
  const circBadge = isLine
    ? `<span class="badge badge-circulation-line">📱 LINE</span>`
    : `<span class="badge badge-circulation-paper">📄 紙</span>`;

  const feeClass = m.fee_status === '納入済' ? 'badge-paid' : m.fee_status === '未納' ? 'badge-unpaid' : 'badge-exempt';
  const supportBadge = m.support_needed && m.support_needed !== 'なし' 
    ? `<span class="badge badge-support">⚠️ ${m.support_needed}</span>` : '';

  const banLeaderBadge = isBanLeader ? `<span class="badge badge-ban-leader">🚩 班長</span>` : '';
  const officerBadge = isOfficer ? `<span class="badge badge-role highlight">🎖️ ${escapeHtml(m.role)}</span>` : '';

  const cardClass = isWithdrawn ? 'withdrawn' : isSuspended ? 'suspended' : '';
  const nameWithdrawnTag = isWithdrawn ? `<span class="member-withdrawn-tag">退会済</span>` : '';

  const blockName = getBanBlockName(m.ban);
  const blockBadge = blockName ? `<span class="badge-block">${escapeHtml(blockName)}</span>` : '';

  return `
    <div class="member-card ${cardClass}" onclick="openEditMemberModal('${m.id}')">
      <div class="member-card-header">
        <div class="card-tags">
          ${blockBadge}
          <span class="badge badge-ban">${escapeHtml(m.ban || '未割当')}</span>
          ${statusBadge}
          ${circBadge}
          ${banLeaderBadge}
          ${officerBadge}
          <span class="badge ${feeClass}">${escapeHtml(m.fee_status || '未納')}</span>
          ${supportBadge}
        </div>
        <span class="badge-id">${escapeHtml(m.id)}</span>
      </div>

      <div class="member-name-row">
        <div class="member-name">${escapeHtml(m.name)}${nameWithdrawnTag}</div>
        <div class="member-kana">${escapeHtml(m.kana)}</div>
        <span class="member-household-pill">世帯: ${m.household_count || 1}名</span>
      </div>

      <div class="member-info-row">
        <span class="member-info-icon">📍</span>
        <span>${escapeHtml(m.address)}</span>
      </div>

      <div class="member-info-row">
        <span class="member-info-icon">📞</span>
        <a href="tel:${escapeHtml(m.phone)}" class="member-phone-link" onclick="event.stopPropagation();">${escapeHtml(m.phone)}</a>
        ${m.phone2 ? `<span style="margin: 0 4px; color: var(--text-light);">/</span><a href="tel:${escapeHtml(m.phone2)}" class="member-phone-link" onclick="event.stopPropagation();" title="電話番号2">${escapeHtml(m.phone2)}</a>` : ''}
        ${m.email ? `<span style="margin-left: 8px; font-size: 0.8rem; color: var(--text-light);">✉️ ${escapeHtml(m.email)}</span>` : ''}
      </div>

      ${m.family_members ? `
        <div class="member-family-summary">
          <strong>家族:</strong> ${escapeHtml(m.family_members)}
        </div>
      ` : ''}

      <div class="member-card-footer">
        <button type="button" class="btn-card-action primary" onclick="event.stopPropagation(); openEditMemberModal('${m.id}')">
          詳細・編集
        </button>
      </div>
    </div>
  `;
}

function createMemberTableRowHtml(m) {
  const isOfficer = m.role && m.role !== '一般会員';
  const isBanLeader = m.ban_leader === '班長';
  const isWithdrawn = m.status === '転出退会';
  const isSuspended = m.status === '休会';

  const statusBadge = isWithdrawn 
    ? `<span class="badge badge-status-withdrawn">⛔ 転出退会</span>`
    : isSuspended 
    ? `<span class="badge badge-status-suspended">⏸️ 休会中</span>`
    : `<span class="badge badge-status-active">現役</span>`;

  const isLine = (m.circulation || '紙') === 'LINE';
  const circBadge = isLine
    ? `<span class="badge badge-circulation-line">📱 LINE</span>`
    : `<span class="badge badge-circulation-paper">📄 紙</span>`;

  const feeClass = m.fee_status === '納入済' ? 'badge-paid' : m.fee_status === '未納' ? 'badge-unpaid' : 'badge-exempt';
  const supportText = m.support_needed && m.support_needed !== 'なし'
    ? `<span class="badge badge-support">${escapeHtml(m.support_needed)}</span>` : '-';
  const rowClass = isWithdrawn ? 'row-withdrawn' : isSuspended ? 'row-suspended' : '';
  const nameWithdrawnTag = isWithdrawn ? `<span class="member-withdrawn-tag">退会済</span>` : '';

  const blockName = getBanBlockName(m.ban);
  const blockBadge = blockName ? `<span class="badge-block">${escapeHtml(blockName)}</span>` : '';

  const banLeaderBadge = isBanLeader ? `<span class="badge badge-ban-leader">🚩 班長</span>` : '<span style="color: var(--text-light); font-size: 0.8rem;">-</span>';

  return `
    <tr class="${rowClass}" onclick="openEditMemberModal('${m.id}')">
      <td><span class="badge-id">${escapeHtml(m.id)}</span></td>
      <td>${blockBadge}<span class="badge badge-ban">${escapeHtml(m.ban || '未割当')}</span></td>
      <td>
        <strong>${escapeHtml(m.name)}</strong>${nameWithdrawnTag}
        <div style="font-size: 0.75rem; color: var(--text-muted);">${escapeHtml(m.kana)}</div>
      </td>
      <td>${statusBadge}</td>
      <td>${circBadge}</td>
      <td>
        <a href="tel:${escapeHtml(m.phone)}" class="member-phone-link" onclick="event.stopPropagation();">${escapeHtml(m.phone)}</a>
        ${m.phone2 ? `<div style="font-size: 0.78rem; margin-top: 2px;"><a href="tel:${escapeHtml(m.phone2)}" class="member-phone-link" onclick="event.stopPropagation();" style="color: var(--text-muted);" title="電話番号2">${escapeHtml(m.phone2)}</a></div>` : ''}
      </td>
      <td style="max-width: 220px; font-size: 0.82rem;">${escapeHtml(m.address)}</td>
      <td style="text-align: center;">${m.household_count || 1}</td>
      <td><span class="badge badge-role ${isOfficer ? 'highlight' : ''}">${escapeHtml(m.role || '一般会員')}</span></td>
      <td style="text-align: center;">${banLeaderBadge}</td>
      <td><span class="badge ${feeClass}">${escapeHtml(m.fee_status || '未納')}</span></td>
      <td>${supportText}</td>
      <td>
        <button type="button" class="btn-card-action primary" onclick="event.stopPropagation(); openEditMemberModal('${m.id}')">
          編集
        </button>
      </td>
    </tr>
  `;
}

// =============================================================================
// TAB 2: 入会申請受付 (Googleフォーム連携) 描画
// =============================================================================
function renderApplicationsList() {
  const container = document.getElementById('applications-list');
  if (!container) return;

  const apps = state.appFilter === 'pending'
    ? state.applications.filter(a => a.status === '未処理')
    : state.applications;

  if (apps.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 40px 16px; color: var(--text-muted); background: #ffffff; border-radius: var(--radius-md); border: 1px dashed var(--border-color);">
        <div style="font-size: 2.2rem; margin-bottom: 8px;">🎉</div>
        <div style="font-weight: 600;">未処理の入会申込はありません</div>
        <div style="font-size: 0.82rem; margin-top: 4px;">住民がGoogleフォームから申し込むと、ここに自動で届きます。</div>
      </div>
    `;
    return;
  }

  container.innerHTML = apps.map(app => {
    const isPending = app.status === '未処理';
    const statusClass = isPending ? 'pending' : app.status === '承認済' ? 'approved' : 'rejected';
    const statusBadge = isPending 
      ? '<span class="badge badge-unpaid">未処理・要確認</span>'
      : app.status === '承認済' 
      ? '<span class="badge badge-paid">承認済・名簿登録済</span>' 
      : '<span class="badge badge-exempt">却下</span>';

    return `
      <div class="app-card ${statusClass}">
        <div class="app-card-header">
          <div>
            ${statusBadge}
            <span style="font-size: 0.8rem; font-weight: 700; margin-left: 6px; color: var(--text-muted);">${escapeHtml(app.id)}</span>
          </div>
          <div class="app-timestamp">申込日時: ${escapeHtml(app.timestamp || '-')}</div>
        </div>

        <div style="display: flex; align-items: baseline; gap: 8px; margin: 6px 0;">
          <h3 style="font-size: 1.2rem; font-weight: 700;">${escapeHtml(app.name)}</h3>
          <span style="font-size: 0.85rem; color: var(--text-muted);">${escapeHtml(app.kana)}</span>
        </div>

        <div class="app-details-grid">
          <div class="app-detail-item">
            <span class="app-detail-label">住所:</span>
            <span>${escapeHtml(app.address)}</span>
          </div>
          <div class="app-detail-item">
            <span class="app-detail-label">連絡先:</span>
            <span>📞 ${escapeHtml(app.phone)} ${app.email ? `| ✉️ ${escapeHtml(app.email)}` : ''}</span>
          </div>
          <div class="app-detail-item">
            <span class="app-detail-label">希望の班:</span>
            <span style="color: var(--primary); font-weight: 600;">${escapeHtml(app.preferred_ban || '未指定')}</span>
          </div>
          <div class="app-detail-item">
            <span class="app-detail-label">家族構成:</span>
            <span>${app.household_count || 1}名（${escapeHtml(app.family_members || '単身')}）</span>
          </div>
          ${app.notes ? `
            <div class="app-detail-item" style="grid-column: 1 / -1;">
              <span class="app-detail-label">申請者備考:</span>
              <span style="color: #475569;">${escapeHtml(app.notes)}</span>
            </div>
          ` : ''}
        </div>

        ${isPending ? `
          <div class="app-actions">
            <button type="button" class="btn-reject" onclick="handleRejectApp('${app.id}')">
              ❌ 却下
            </button>
            <button type="button" class="btn-approve" onclick="openApproveAppModal('${app.id}')">
              ✅ 班を割り当てて承認・名簿本登録
            </button>
          </div>
        ` : `
          <div style="font-size: 0.78rem; color: var(--text-muted); text-align: right; margin-top: 8px;">
            処理日時: ${escapeHtml(app.processed_at || '-')}
          </div>
        `}
      </div>
    `;
  }).join('');
}

// =============================================================================
// TAB 3: 会費集金チェックモード描画
// =============================================================================
function renderFeeCollection() {
  const banSelect = document.getElementById('fee-ban-select');
  if (banSelect && banSelect.value) {
    state.currentFeeBan = banSelect.value;
  }

  // 現役会員のみを抽出
  const banMembers = state.members.filter(m => m.ban === state.currentFeeBan && m.status === '現役');
  const total = banMembers.length;
  const paidCount = banMembers.filter(m => m.fee_status === '納入済').length;
  const exemptCount = banMembers.filter(m => m.fee_status === '免除').length;
  const unpaidCount = total - paidCount - exemptCount;
  const rate = total > 0 ? Math.round((paidCount / (total - exemptCount || 1)) * 100) : 0;

  // プログレスバー更新
  const progressBar = document.getElementById('fee-progress-bar');
  const progressText = document.getElementById('fee-progress-text');
  const countsText = document.getElementById('fee-counts-text');

  if (progressBar) progressBar.style.width = `${Math.min(rate, 100)}%`;
  if (progressText) progressText.textContent = `納入率: ${rate}%`;
  if (countsText) countsText.textContent = `納入済: ${paidCount} / ${total}世帯 (未納: ${unpaidCount}${exemptCount > 0 ? `, 免除: ${exemptCount}` : ''})`;

  // リスト描画
  const container = document.getElementById('fee-collection-list');
  if (!container) return;

  if (banMembers.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 30px; color: var(--text-muted); background: #ffffff; border-radius: var(--radius-md);">
        ${state.currentFeeBan} に所属する現役会員はいません
      </div>`;
    return;
  }

  container.innerHTML = banMembers.map(m => {
    const isPaid = m.fee_status === '納入済';
    const isExempt = m.fee_status === '免除';
    const buttonClass = isPaid ? 'paid' : isExempt ? 'exempt' : 'unpaid';
    const buttonLabel = isPaid ? '✓ 納入済' : isExempt ? '免除' : '未納 (タップ)';

    return `
      <div class="fee-item-card">
        <div class="fee-member-info">
          <div class="fee-member-name">${escapeHtml(m.name)}</div>
          <div class="fee-member-sub">${escapeHtml(m.address)} | ID: ${m.id}</div>
        </div>
        <button type="button" class="btn-fee-toggle ${buttonClass}" onclick="toggleMemberFeeStatus('${m.id}')">
          ${buttonLabel}
        </button>
      </div>
    `;
  }).join('');
}

// 会費ステータスのワンタップ切り替え
async function toggleMemberFeeStatus(memberId) {
  const target = state.members.find(m => m.id === memberId);
  if (!target) return;

  // 納入済 -> 未納、未納 -> 納入済 (免除の場合は未納に切り替え)
  const nextStatus = target.fee_status === '納入済' ? '未納' : '納入済';
  target.fee_status = nextStatus;

  playTone(nextStatus === '納入済' ? 'success' : 'toggle');
  showToast(`${target.name}様: 会費を「${nextStatus}」に更新しました`, nextStatus === '納入済' ? '💴' : '🔄');

  // UI即時反映
  renderFeeCollection();
  renderDashboard();

  // バックグラウンド同期
  await api.updateFeeStatus(memberId, nextStatus, (status, text) => {
    updateSyncStatus(status, text);
  });
}

// =============================================================================
// TAB 4: ダッシュボード統計描画
// =============================================================================
function renderDashboard() {
  const activeMembers = state.members.filter(m => m.status === '現役');
  const totalHouseholds = activeMembers.length;
  const totalPopulation = activeMembers.reduce((sum, m) => sum + (Number(m.household_count) || 1), 0);

  const paidCount = activeMembers.filter(m => m.fee_status === '納入済').length;
  const exemptCount = activeMembers.filter(m => m.fee_status === '免除').length;
  const baseCount = totalHouseholds - exemptCount;
  const feeRate = baseCount > 0 ? Math.round((paidCount / baseCount) * 100) : 0;

  const supportCount = activeMembers.filter(m => m.support_needed && m.support_needed !== 'なし').length;

  // 回覧方法の集計
  const lineCount = activeMembers.filter(m => (m.circulation || '紙') === 'LINE').length;
  const paperCount = totalHouseholds - lineCount;
  const lineRatio = totalHouseholds > 0 ? Math.round((lineCount / totalHouseholds) * 100) : 0;
  const paperRatio = totalHouseholds > 0 ? (100 - lineRatio) : 0;

  document.getElementById('dash-households').textContent = totalHouseholds;
  document.getElementById('dash-members-count').textContent = totalPopulation;
  document.getElementById('dash-fee-rate').textContent = `${feeRate}%`;
  document.getElementById('dash-fee-sub').textContent = `${paidCount} / ${totalHouseholds} 世帯`;
  document.getElementById('dash-support-count').textContent = supportCount;

  const dashLineCountEl = document.getElementById('dash-line-count');
  const dashLineRatioEl = document.getElementById('dash-line-ratio');
  const dashPaperCountEl = document.getElementById('dash-paper-count');
  const dashPaperRatioEl = document.getElementById('dash-paper-ratio');

  if (dashLineCountEl) dashLineCountEl.textContent = `${lineCount} 世帯`;
  if (dashLineRatioEl) dashLineRatioEl.textContent = `${lineRatio}% (デジタル配信)`;
  if (dashPaperCountEl) dashPaperCountEl.textContent = `${paperCount} 世帯`;
  if (dashPaperRatioEl) dashPaperRatioEl.textContent = `${paperRatio}% (要印刷)`;

  // 班別分布バー（ブロックごとにグループ化）
  const banContainer = document.getElementById('ban-distribution-bars');
  if (banContainer) {
    const blockConfig = getBlockConfig();
    const banCounts = {};
    activeMembers.forEach(m => {
      const b = m.ban || '未割当';
      banCounts[b] = (banCounts[b] || 0) + 1;
    });

    const maxCount = Math.max(...Object.values(banCounts), 1);
    let html = '';

    blockConfig.forEach(blk => {
      const blockBans = blk.bans || [];
      const blockTotal = blockBans.reduce((sum, b) => sum + (banCounts[b] || 0), 0);

      html += `
        <div class="dashboard-block-section">
          <div class="dashboard-block-header">
            <span>🏘️ ${escapeHtml(blk.name)}</span>
            <span style="color: var(--text-muted); font-size: 0.78rem;">計 ${blockTotal} 世帯</span>
          </div>
      `;

      if (blockBans.length === 0) {
        html += `<div style="font-size: 0.75rem; color: var(--text-light); padding: 4px 0;">班が登録されていません</div>`;
      } else {
        blockBans.forEach(ban => {
          const count = banCounts[ban] || 0;
          const percent = Math.round((count / maxCount) * 100);
          html += `
            <div class="ban-bar-row">
              <div class="ban-bar-label">${escapeHtml(ban)}</div>
              <div class="ban-bar-track">
                <div class="ban-bar-fill" style="width: ${percent}%;"></div>
              </div>
              <div class="ban-bar-value">${count} 世帯</div>
            </div>
          `;
        });
      }
      html += `</div>`;
    });

    // 設定外の班（未割当など）が存在する場合のフォールバック表示
    const configuredBans = getAllBansFromBlocks(blockConfig);
    const otherBans = Object.keys(banCounts).filter(b => !configuredBans.includes(b) && banCounts[b] > 0);
    if (otherBans.length > 0) {
      const otherTotal = otherBans.reduce((sum, b) => sum + (banCounts[b] || 0), 0);
      html += `
        <div class="dashboard-block-section">
          <div class="dashboard-block-header">
            <span style="color: var(--warning);">⚠️ その他・未分類</span>
            <span style="color: var(--text-muted); font-size: 0.78rem;">計 ${otherTotal} 世帯</span>
          </div>
      `;
      otherBans.forEach(ban => {
        const count = banCounts[ban] || 0;
        const percent = Math.round((count / maxCount) * 100);
        html += `
          <div class="ban-bar-row">
            <div class="ban-bar-label">${escapeHtml(ban)}</div>
            <div class="ban-bar-track">
              <div class="ban-bar-fill" style="width: ${percent}%; background: var(--warning);"></div>
            </div>
            <div class="ban-bar-value">${count} 世帯</div>
          </div>
        `;
      });
      html += `</div>`;
    }

    banContainer.innerHTML = html;
  }

  // 自治会役員一覧
  const officersContainer = document.getElementById('officers-summary-list');
  if (officersContainer) {
    const officers = activeMembers.filter(m => m.role && m.role !== '一般会員');
    if (officers.length === 0) {
      officersContainer.innerHTML = '<div style="color: var(--text-muted); font-size: 0.85rem;">役員は設定されていません</div>';
    } else {
      // 役員マスタ設定の並び順でソート（同一役職内は班順、氏名順）
      const roleOrder = typeof getRoleConfig === 'function' ? getRoleConfig() : (typeof ROLE_LIST !== 'undefined' ? ROLE_LIST : []);
      officers.sort((a, b) => {
        let idxA = roleOrder.indexOf(a.role);
        let idxB = roleOrder.indexOf(b.role);
        if (idxA === -1) idxA = 9999;
        if (idxB === -1) idxB = 9999;
        if (idxA !== idxB) return idxA - idxB;
        const banCompare = (a.ban || '').localeCompare(b.ban || '', 'ja', { numeric: true });
        if (banCompare !== 0) return banCompare;
        return (a.name || '').localeCompare(b.name || '', 'ja');
      });

      officersContainer.innerHTML = officers.map(o => `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; background: #f8fafc; border-radius: var(--radius-sm); font-size: 0.85rem;">
          <div>
            <strong style="color: var(--primary);">${escapeHtml(o.role)}</strong>:
            <span style="font-weight: 700; margin-left: 4px;">${escapeHtml(o.name)}</span>
            <span style="color: var(--text-muted); font-size: 0.75rem; margin-left: 4px;">(${escapeHtml(o.ban)})</span>
          </div>
          <a href="tel:${escapeHtml(o.phone)}" class="member-phone-link" style="font-size: 0.8rem;">📞 ${escapeHtml(o.phone)}</a>
        </div>
      `).join('');
    }
  }

  // 各班の班長一覧
  const banLeadersContainer = document.getElementById('ban-leaders-summary-list');
  if (banLeadersContainer) {
    const leaders = activeMembers.filter(m => m.ban_leader === '班長');
    if (leaders.length === 0) {
      banLeadersContainer.innerHTML = '<div style="color: var(--text-muted); font-size: 0.85rem;">班長は設定されていません</div>';
    } else {
      // 班名でソート
      leaders.sort((a, b) => (a.ban || '').localeCompare(b.ban || '', 'ja', { numeric: true }));
      banLeadersContainer.innerHTML = leaders.map(l => `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; background: #fffbeb; border: 1px solid #fde68a; border-radius: var(--radius-sm); font-size: 0.85rem;">
          <div>
            <span class="badge badge-ban-leader" style="margin-right: 6px;">🚩 班長</span>
            <span class="badge badge-ban">${escapeHtml(l.ban || '未割当')}</span>
            <span style="font-weight: 700; margin-left: 6px;">${escapeHtml(l.name)}</span>
          </div>
          <a href="tel:${escapeHtml(l.phone)}" class="member-phone-link" style="font-size: 0.8rem;">📞 ${escapeHtml(l.phone)}</a>
        </div>
      `).join('');
    }
  }
}

// =============================================================================
// TAB 5: 帳票印刷 (A4縦 各種帳票出力)
// =============================================================================

function renderReportsTab() {
  const container = document.getElementById('report-paper-container');
  if (!container) return;

  const reportTypeSelect = document.getElementById('report-select-type');
  const reportType = reportTypeSelect ? reportTypeSelect.value : 'block_ban_leaders';

  const yearInput = document.getElementById('report-param-year');
  const dateInput = document.getElementById('report-param-date');

  // 初期値が空なら現在値から自動設定
  if (yearInput && !yearInput.value) {
    yearInput.value = typeof getFiscalYearWareki === 'function' ? getFiscalYearWareki() : '令和8年度';
  }
  if (dateInput && !dateInput.value) {
    dateInput.value = typeof formatWarekiShortDate === 'function' ? formatWarekiShortDate() : 'R8.9.20';
  }

  const fiscalYear = yearInput ? yearInput.value.trim() : '令和8年度';
  const dateStr = dateInput ? dateInput.value.trim() : 'R8.9.20';

  if (reportType === 'block_ban_leaders') {
    container.innerHTML = generateBlockBanLeadersReportHtml(fiscalYear, dateStr);
  }
}

/**
 * 「令和〇年度 ブロック長、班長名簿」のA4縦HTMLを生成
 */
function generateBlockBanLeadersReportHtml(fiscalYear, dateStr) {
  const blockConfig = typeof getBlockConfig === 'function' ? getBlockConfig() : [];
  const members = state.members || [];

  // ブロック設定を昇順ソート
  const sortedBlocks = [...blockConfig].sort((a, b) => {
    return (a.name || '').localeCompare(b.name || '', 'ja', { numeric: true });
  });

  let totalBlocksCount = sortedBlocks.length;
  let totalAllBansCount = 0;
  let grandTotalActiveMembers = 0;

  let tableRowsHtml = '';

  sortedBlocks.forEach(block => {
    const rawBans = block.bans || [];
    // 各ブロック内の班を昇順ソート
    const sortedBans = [...rawBans].sort((a, b) => {
      return (a || '').localeCompare(b || '', 'ja', { numeric: true });
    });

    const banCountInBlock = sortedBans.length;

    // 会員数（現役）が1名以上の班の数をカウント（0の班は除外）
    const activeBansCountInBlock = sortedBans.filter(bName => {
      return members.some(m => m.ban === bName && m.status === '現役');
    }).length;
    totalAllBansCount += activeBansCountInBlock;

    // ブロック表示名（「ブロック」を除外）
    const blockDisplayName = (block.name || '').replace(/ブロック$/, '').trim();

    // rowspan = 班の数 + 小計行(1行)
    const blockRowspan = banCountInBlock > 0 ? (banCountInBlock + 1) : 1;

    let blockActiveTotal = 0;

    if (banCountInBlock === 0) {
      tableRowsHtml += `
        <tr>
          <td class="cell-center cell-bold" rowspan="1">
            ${escapeHtml(blockDisplayName)}<br>
            <span style="font-size: 0.85em; font-weight: normal;">（0班）</span>
          </td>
          <td class="cell-center" colspan="5" style="color: #64748b;">所属する班が設定されていません</td>
        </tr>
      `;
      return;
    }

    sortedBans.forEach((banName, idx) => {
      // 班名から「班」を除外
      const banDisplayName = (banName || '').replace(/班$/, '').trim();

      // 現役会員数
      const activeCount = members.filter(m => m.ban === banName && m.status === '現役').length;
      blockActiveTotal += activeCount;
      grandTotalActiveMembers += activeCount;

      // 休会会員数
      const suspendedCount = members.filter(m => m.ban === banName && m.status === '休会').length;

      // 班長（役職・係ではなく班長項目で判定、現役優先）
      const banLeader = members.find(m => m.ban === banName && m.ban_leader === '班長' && m.status === '現役')
        || members.find(m => m.ban === banName && m.ban_leader === '班長');
      const leaderName = banLeader ? banLeader.name : '';
      const leaderPhone = banLeader ? (banLeader.phone || banLeader.phone2 || '') : '';

      // 氏名・電話・会員数の表示制御（会員数0の場合は「欠番」赤文字、電話は空白、会員数も空白）
      let nameCellHtml = '';
      let phoneCellHtml = '';
      let activeCountDisplay = '';

      if (activeCount === 0) {
        nameCellHtml = '<span class="report-vacant-note">欠番</span>';
        phoneCellHtml = '';
        activeCountDisplay = '';
      } else {
        nameCellHtml = escapeHtml(leaderName);
        phoneCellHtml = escapeHtml(leaderPhone);
        activeCountDisplay = String(activeCount);
      }

      // ブロック長判定（その班の現役会員で role === 'ブロック長' の人がいるか）
      const hasBlockLeader = members.some(m => m.ban === banName && m.role === 'ブロック長' && m.status !== '転出退会');
      const banLabel = hasBlockLeader
        ? `◎${escapeHtml(banDisplayName)}`
        : escapeHtml(banDisplayName);

      // 付記（休会会員がいる場合のみ赤文字で表示）
      let noteHtml = '';
      if (suspendedCount > 0) {
        noteHtml = `<span class="report-suspended-note">休会会員${suspendedCount}名を除く</span>`;
      }

      tableRowsHtml += `<tr>`;
      // 最初の行のみブロック名セルを出力（縦結合）
      if (idx === 0) {
        tableRowsHtml += `
          <td class="cell-center cell-bold" rowspan="${blockRowspan}">
            ${escapeHtml(blockDisplayName)}<br>
            <span style="font-size: 0.85em; font-weight: normal;">（${activeBansCountInBlock}班）</span>
          </td>
        `;
      }

      tableRowsHtml += `
          <td class="cell-center">${banLabel}</td>
          <td class="cell-center">${nameCellHtml}</td>
          <td class="cell-left">${phoneCellHtml}</td>
          <td class="cell-right">${activeCountDisplay}</td>
          <td class="cell-left">${noteHtml}</td>
        </tr>
      `;
    });

    // 各ブロックの小計行
    tableRowsHtml += `
      <tr class="subtotal-row">
        <td class="cell-center">計</td>
        <td></td>
        <td></td>
        <td class="cell-right">${blockActiveTotal === 0 ? '' : blockActiveTotal}</td>
        <td></td>
      </tr>
    `;
  });

  // 全ブロックの合計行（最終行）
  tableRowsHtml += `
    <tr class="total-row">
      <td colspan="2" class="cell-center">${totalBlocksCount}ブロック　${totalAllBansCount}班</td>
      <td></td>
      <td></td>
      <td class="cell-right">${grandTotalActiveMembers}</td>
      <td></td>
    </tr>
  `;

  return `
    <div class="report-header-top">
      <div class="report-caution">※取り扱い注意（班長用）</div>
      <div class="report-date">${escapeHtml(dateStr)}時点</div>
    </div>
    <div class="report-title-main">${escapeHtml(fiscalYear)}　ブロック長、班長名簿</div>
    <table class="report-table">
      <thead>
        <tr>
          <th style="width: 14%;">ブロック名</th>
          <th style="width: 8%;">班名</th>
          <th style="width: 21%;">氏名</th>
          <th style="width: 19%;">電話</th>
          <th style="width: 9%;">会員数</th>
          <th style="width: 29%;">付記</th>
        </tr>
      </thead>
      <tbody>
        ${tableRowsHtml}
      </tbody>
    </table>
    <div class="report-footer-note">◎がブロック長になります。</div>
  `;
}

// =============================================================================
// モーダル操作: 会員登録・編集
// =============================================================================
function openAddMemberModal() {
  state.activeMember = null;
  document.getElementById('modal-member-title').textContent = '新規会員の登録';
  document.getElementById('edit-member-is-new').value = 'true';
  document.getElementById('btn-delete-member').style.display = 'none';

  // フォーム初期化
  const nextId = getNextMemberId(state.members);
  document.getElementById('m-id').value = nextId;
  document.getElementById('m-ban').value = BAN_LIST[0] || '1班';
  document.getElementById('m-name').value = '';
  document.getElementById('m-kana').value = '';
  document.getElementById('m-phone').value = '';
  document.getElementById('m-phone2').value = '';
  document.getElementById('m-email').value = '';
  document.getElementById('m-address').value = '';
  document.getElementById('m-household-count').value = 1;
  document.getElementById('m-role').value = '一般会員';
  document.getElementById('m-ban-leader').value = 'なし';
  document.getElementById('m-circulation').value = '紙';
  document.getElementById('m-family').value = '';
  document.getElementById('m-fee-status').value = '未納';
  document.getElementById('m-support').value = 'なし';
  document.getElementById('m-status').value = '現役';
  document.getElementById('m-join-date').value = formatCurrentDate();
  document.getElementById('m-notes').value = '';

  document.getElementById('modal-member').classList.add('active');
}

function openEditMemberModal(memberId) {
  const member = state.members.find(m => m.id === memberId);
  if (!member) return;

  state.activeMember = member;
  document.getElementById('modal-member-title').textContent = `会員情報の編集 (${member.id})`;
  document.getElementById('edit-member-is-new').value = 'false';
  document.getElementById('btn-delete-member').style.display = 'block';

  document.getElementById('m-id').value = member.id;
  const mBanSelect = document.getElementById('m-ban');
  if (member.ban && !mBanSelect.querySelector(`option[value="${member.ban}"]`)) {
    const opt = document.createElement('option');
    opt.value = member.ban;
    opt.textContent = `${member.ban} (未割当)`;
    mBanSelect.appendChild(opt);
  }
  mBanSelect.value = member.ban || BAN_LIST[0] || '1班';
  document.getElementById('m-name').value = member.name || '';
  document.getElementById('m-kana').value = member.kana || '';
  document.getElementById('m-phone').value = member.phone || '';
  document.getElementById('m-phone2').value = member.phone2 || '';
  document.getElementById('m-email').value = member.email || '';
  document.getElementById('m-address').value = member.address || '';
  document.getElementById('m-household-count').value = member.household_count || 1;
  const mRoleSelect = document.getElementById('m-role');
  if (member.role && !mRoleSelect.querySelector(`option[value="${member.role}"]`)) {
    const opt = document.createElement('option');
    opt.value = member.role;
    opt.textContent = `${member.role} (未登録)`;
    mRoleSelect.appendChild(opt);
  }
  mRoleSelect.value = member.role || (ROLE_LIST.includes('一般会員') ? '一般会員' : (ROLE_LIST[0] || '一般会員'));
  document.getElementById('m-ban-leader').value = member.ban_leader === '班長' ? '班長' : 'なし';
  document.getElementById('m-circulation').value = member.circulation || '紙';
  document.getElementById('m-family').value = member.family_members || '';
  document.getElementById('m-fee-status').value = member.fee_status || '未納';
  document.getElementById('m-support').value = member.support_needed || 'なし';
  document.getElementById('m-status').value = member.status || '現役';
  document.getElementById('m-join-date').value = normalizeDateToYmd(member.join_date);
  document.getElementById('m-notes').value = member.notes || '';

  document.getElementById('modal-member').classList.add('active');
}

function closeMemberModal() {
  document.getElementById('modal-member').classList.remove('active');
  state.activeMember = null;
}

// 会員保存処理
async function handleSaveMember() {
  const name = document.getElementById('m-name').value.trim();
  const phone = document.getElementById('m-phone').value.trim();
  const address = document.getElementById('m-address').value.trim();

  if (!name || !phone || !address) {
    alert('氏名、電話番号1、住所は必須項目です。');
    return;
  }

  const isNew = document.getElementById('edit-member-is-new').value === 'true';
  const memberData = {
    id: document.getElementById('m-id').value.trim(),
    ban: document.getElementById('m-ban').value,
    name: name,
    kana: document.getElementById('m-kana').value.trim(),
    phone: formatPhoneNumber(phone),
    phone2: formatPhoneNumber(document.getElementById('m-phone2').value.trim()),
    email: document.getElementById('m-email').value.trim(),
    address: address,
    household_count: parseInt(document.getElementById('m-household-count').value, 10) || 1,
    role: document.getElementById('m-role').value,
    ban_leader: document.getElementById('m-ban-leader').value === '班長' ? '班長' : 'なし',
    circulation: document.getElementById('m-circulation').value || '紙',
    family_members: document.getElementById('m-family').value.trim(),
    fee_status: document.getElementById('m-fee-status').value,
    support_needed: document.getElementById('m-support').value,
    status: document.getElementById('m-status').value,
    join_date: normalizeDateToYmd(document.getElementById('m-join-date').value),
    notes: document.getElementById('m-notes').value.trim()
  };

  closeMemberModal();
  playTone('success');
  showToast(isNew ? '新会員を登録しました' : '会員情報を更新しました', '💾');

  if (isNew) {
    state.members.unshift(memberData);
  } else {
    const idx = state.members.findIndex(m => m.id === memberData.id);
    if (idx !== -1) state.members[idx] = memberData;
  }

  renderAllViews();

  // バックグラウンド同期
  await api.saveMember(memberData, isNew, (status, text) => {
    updateSyncStatus(status, text);
  });
}

// 会員の退会・削除処理
async function handleDeleteMember() {
  if (!state.activeMember) return;
  const id = state.activeMember.id;
  const name = state.activeMember.name;

  const isHard = confirm(`「${name} 様 (${id})」の処理を選択してください。\n\n[OK]: 転出退会としてステータス変更（名簿履歴に残す）\n[キャンセル]: 処理を中止`);
  if (!isHard) return;

  closeMemberModal();
  playTone('delete');
  showToast(`${name} 様を「転出退会」に変更しました`, '🚪');

  const target = state.members.find(m => m.id === id);
  if (target) {
    target.status = '転出退会';
  }

  renderAllViews();

  await api.deleteMember(id, false, (status, text) => {
    updateSyncStatus(status, text);
  });
}

// =============================================================================
// モーダル操作: Googleフォーム入会申請の承認
// =============================================================================
function openApproveAppModal(appId) {
  const app = state.applications.find(a => a.id === appId);
  if (!app) return;

  state.activeApp = app;
  document.getElementById('approve-app-id').value = app.id;
  document.getElementById('approve-applicant-name').textContent = app.name;
  document.getElementById('approve-applicant-address').textContent = `住所: ${app.address}`;
  document.getElementById('approve-applicant-phone').textContent = `電話: ${app.phone}`;
  document.getElementById('approve-applicant-preferred').textContent = `希望・近隣情報: ${app.preferred_ban || '指定なし'}`;

  // 次の会員IDを生成
  const nextId = getNextMemberId(state.members);
  document.getElementById('approve-new-id').value = nextId;

  // 希望班の推測
  const banSelect = document.getElementById('approve-ban');
  if (app.preferred_ban) {
    const matchedBan = BAN_LIST.find(b => app.preferred_ban.includes(b));
    if (matchedBan) banSelect.value = matchedBan;
  }

  document.getElementById('modal-approve').classList.add('active');
}

function closeApproveModal() {
  document.getElementById('modal-approve').classList.remove('active');
  state.activeApp = null;
}

// 承認実行
async function handleConfirmApprove() {
  if (!state.activeApp) return;

  const app = state.activeApp;
  const newMemberId = document.getElementById('approve-new-id').value;
  const assignedBan = document.getElementById('approve-ban').value;
  const initialRole = document.getElementById('approve-role').value;
  const initialBanLeader = (document.getElementById('approve-ban-leader') && document.getElementById('approve-ban-leader').value === '班長') ? '班長' : 'なし';
  const initialFee = document.getElementById('approve-fee').value;
  const initialCirculation = document.getElementById('approve-circulation').value || 'LINE';
  const notes = document.getElementById('approve-notes').value.trim() || `Googleフォーム(${app.id})より入会`;

  const newMember = {
    id: newMemberId,
    ban: assignedBan,
    name: app.name,
    kana: app.kana || '',
    phone: formatPhoneNumber(app.phone),
    phone2: formatPhoneNumber(app.phone2 || ''),
    email: app.email || '',
    address: app.address,
    household_count: app.household_count || 1,
    family_members: app.family_members || '',
    role: initialRole,
    ban_leader: initialBanLeader,
    fee_status: initialFee,
    circulation: initialCirculation,
    support_needed: 'なし',
    join_date: formatCurrentDate(),
    status: '現役',
    notes: notes,
    updated_at: formatCurrentDateTime()
  };

  closeApproveModal();
  playTone('success');
  showToast(`🎉 ${app.name}様の入会を承認し、${assignedBan} (${newMemberId}) に登録しました！`, '✅');

  // ローカルステータス更新
  app.status = '承認済';
  app.processed_at = formatCurrentDateTime();
  state.members.unshift(newMember);

  renderAllViews();

  // バックグラウンド同期
  await api.approveApplication(app.id, newMember, (status, text) => {
    updateSyncStatus(status, text);
  });
}

// 申請の却下
async function handleRejectApp(appId) {
  const app = state.applications.find(a => a.id === appId);
  if (!app) return;

  const reason = prompt(`「${app.name}様」の申請を却下する理由を入力してください（任意）:`);
  if (reason === null) return; // キャンセル

  app.status = '却下';
  app.processed_at = formatCurrentDateTime();
  if (reason) app.notes = (app.notes ? app.notes + ' ' : '') + `[却下理由: ${reason}]`;

  playTone('delete');
  showToast('申請を却下にしました', '❌');
  renderApplicationsList();
  updatePendingBadges();

  await api.rejectApplication(appId, reason, (status, text) => {
    updateSyncStatus(status, text);
  });
}

// =============================================================================
// CSV エクスポート & インポート
// =============================================================================
function exportRosterToCsv() {
  const headers = [
    "会員ID", "班", "氏名", "フリガナ", "電話番号", "電話番号2", "メールアドレス",
    "住所", "世帯人数", "同居家族", "役員", "班長", "会費状況", "回覧方法", "要支援・見守り",
    "加入年月日", "会員状態", "備考"
  ];

  const rows = state.members.map(m => [
    `"${m.id || ''}"`,
    `"${m.ban || ''}"`,
    `"${m.name || ''}"`,
    `"${m.kana || ''}"`,
    `"${m.phone || ''}"`,
    `"${m.phone2 || ''}"`,
    `"${m.email || ''}"`,
    `"${m.address || ''}"`,
    m.household_count || 1,
    `"${(m.family_members || '').replace(/"/g, '""')}"`,
    `"${m.role || '一般会員'}"`,
    `"${m.ban_leader === '班長' ? '班長' : 'なし'}"`,
    `"${m.fee_status || '未納'}"`,
    `"${m.circulation || '紙'}"`,
    `"${m.support_needed || 'なし'}"`,
    `"${normalizeDateToYmd(m.join_date) || ''}"`,
    `"${m.status || '現役'}"`,
    `"${(m.notes || '').replace(/"/g, '""')}"`
  ]);

  const csvContent = "\uFEFF" + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${api.getCommunityName()}_会員名簿_${formatCurrentDate()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('名簿CSVをダウンロードしました', '💾');
}

function importRosterFromCsv(file) {
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const text = e.target.result;
      const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');
      if (lines.length <= 1) {
        alert('CSVデータが空かヘッダーのみです。');
        return;
      }

      // ヘッダー行の解析
      const headerCols = parseCsvLine(lines[0]).map(h => h.trim());
      const colMap = {};
      headerCols.forEach((h, idx) => colMap[h] = idx);

      const hasPhone2 = colMap['電話番号2'] !== undefined;
      const hasBanLeaderCol = colMap['班長'] !== undefined;
      const roleColKey = colMap['役員'] !== undefined ? '役員' : (colMap['役職'] !== undefined ? '役職' : '役員');
      const imported = [];

      for (let i = 1; i < lines.length; i++) {
        const row = parseCsvLine(lines[i]);
        if (!row) continue;
        const nameVal = colMap['氏名'] !== undefined ? row[colMap['氏名']] : row[2];
        if (!nameVal) continue; // 氏名がない行はスキップ

        function getCsvVal(key, fallbackIdx, def = '') {
          if (colMap[key] !== undefined && row[colMap[key]] !== undefined) {
            return row[colMap[key]];
          }
          if (fallbackIdx !== undefined && row[fallbackIdx] !== undefined) {
            return row[fallbackIdx];
          }
          return def;
        }

        const emailFallback = hasPhone2 ? 6 : 5;
        const addrFallback = hasPhone2 ? 7 : 6;
        const countFallback = hasPhone2 ? 8 : 7;
        const famFallback = hasPhone2 ? 9 : 8;
        const roleFallback = hasPhone2 ? 10 : 9;
        const feeFallback = hasPhone2 ? (hasBanLeaderCol ? 12 : 11) : 10;
        const circFallback = hasPhone2 ? (hasBanLeaderCol ? 13 : 12) : 11;
        const supFallback = hasPhone2 ? (hasBanLeaderCol ? 14 : 13) : 12;
        const joinFallback = hasPhone2 ? (hasBanLeaderCol ? 15 : 14) : 13;
        const statusFallback = hasPhone2 ? (hasBanLeaderCol ? 16 : 15) : 14;
        const notesFallback = hasPhone2 ? (hasBanLeaderCol ? 17 : 16) : 15;

        let rawRole = getCsvVal(roleColKey, roleFallback, '一般会員');
        let rawBanLeader = getCsvVal('班長', hasBanLeaderCol ? 11 : undefined, '');

        if (!rawBanLeader) {
          if (rawRole === '班長') {
            rawBanLeader = '班長';
            rawRole = '一般会員';
          } else {
            rawBanLeader = 'なし';
          }
        } else {
          rawBanLeader = rawBanLeader === '班長' ? '班長' : 'なし';
        }

        imported.push({
          id: getCsvVal('会員ID', 0) || getNextMemberId([...state.members, ...imported]),
          ban: getCsvVal('班', 1, '1班') || '1班',
          name: nameVal,
          kana: getCsvVal('フリガナ', 3, ''),
          phone: formatPhoneNumber(getCsvVal('電話番号', 4, '')),
          phone2: formatPhoneNumber(hasPhone2 ? getCsvVal('電話番号2', 5, '') : ''),
          email: getCsvVal('メールアドレス', emailFallback, ''),
          address: getCsvVal('住所', addrFallback, ''),
          household_count: parseInt(getCsvVal('世帯人数', countFallback, 1), 10) || 1,
          family_members: getCsvVal('同居家族', famFallback, ''),
          role: rawRole,
          ban_leader: rawBanLeader,
          fee_status: getCsvVal('会費状況', feeFallback, '未納'),
          circulation: getCsvVal('回覧方法', circFallback, '紙') === 'LINE' ? 'LINE' : '紙',
          support_needed: getCsvVal('要支援・見守り', supFallback, 'なし'),
          join_date: normalizeDateToYmd(getCsvVal('加入年月日', joinFallback, '')) || formatCurrentDate(),
          status: getCsvVal('会員状態', statusFallback, '現役'),
          notes: getCsvVal('備考', notesFallback, ''),
          updated_at: formatCurrentDateTime()
        });
      }

      if (imported.length > 0) {
        if (confirm(`${imported.length} 件の会員データをインポートしますか？\n既存の名簿データに追加されます。`)) {
          state.members = [...imported, ...state.members];
          api.setLocalMembers(state.members);
          renderAllViews();
          showToast(`${imported.length}件をインポートしました`, '📥');
        }
      }
    } catch (err) {
      alert('CSV読み込み中にエラーが発生しました: ' + err.message);
    }
  };
  reader.readAsText(file);
}

function parseCsvLine(text) {
  const result = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (inQuotes && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === ',' && !inQuotes) {
      result.push(cur.trim());
      cur = '';
    } else {
      cur += c;
    }
  }
  result.push(cur.trim());
  return result;
}

// =============================================================================
// イベントリスナーの登録
// =============================================================================
function initEventListeners() {
  // ナビゲーションタブ
  document.querySelectorAll('[data-tab]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const tab = e.currentTarget.getAttribute('data-tab');
      switchTab(tab);
    });
  });

  // 同期インジケーター（クリックで手動再同期）
  const syncIndicator = document.getElementById('sync-indicator');
  if (syncIndicator) {
    syncIndicator.addEventListener('click', async () => {
      showToast('スプレッドシートと再同期中...', '🔄');
      await loadData();
    });
  }

  // 新規登録ボタン
  document.getElementById('btn-open-add-member').addEventListener('click', openAddMemberModal);

  // 検索入力 & クリア
  const searchInput = document.getElementById('member-search-input');
  const clearBtn = document.getElementById('btn-clear-search');

  searchInput.addEventListener('input', (e) => {
    state.searchKeyword = e.target.value;
    clearBtn.style.display = state.searchKeyword ? 'block' : 'none';
    renderMembersList();
  });

  clearBtn.addEventListener('click', () => {
    searchInput.value = '';
    state.searchKeyword = '';
    clearBtn.style.display = 'none';
    renderMembersList();
  });

  // ブロックフィルター
  const filterBlock = document.getElementById('filter-block');
  if (filterBlock) {
    filterBlock.addEventListener('change', () => {
      state.filters.block = filterBlock.value;
      updateFilterBanDropdown();
      renderMembersList();
    });
  }

  // フィルター
  ['filter-ban', 'filter-role', 'filter-ban-leader', 'filter-fee', 'filter-circulation', 'filter-status'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('change', () => {
      state.filters.ban = document.getElementById('filter-ban').value;
      state.filters.role = document.getElementById('filter-role').value;
      const banLeaderEl = document.getElementById('filter-ban-leader');
      if (banLeaderEl) state.filters.ban_leader = banLeaderEl.value;
      state.filters.fee = document.getElementById('filter-fee').value;
      state.filters.circulation = document.getElementById('filter-circulation').value;
      state.filters.status = document.getElementById('filter-status').value;
      renderMembersList();
    });
  });

  // 表示切り替えボタン（PC用）
  const btnCards = document.getElementById('btn-view-cards');
  const btnTable = document.getElementById('btn-view-table');
  const cardsList = document.getElementById('member-cards-list');
  const tableCont = document.getElementById('member-table-container');

  btnCards.addEventListener('click', () => {
    btnCards.classList.add('primary');
    btnTable.classList.remove('primary');
    cardsList.style.display = 'flex';
    tableCont.style.display = 'none';
  });

  btnTable.addEventListener('click', () => {
    btnTable.classList.add('primary');
    btnCards.classList.remove('primary');
    cardsList.style.display = 'none';
    tableCont.style.display = 'block';
  });

  // 申請フィルターボタン
  document.getElementById('btn-app-filter-pending').addEventListener('click', (e) => {
    e.target.classList.add('primary');
    document.getElementById('btn-app-filter-all').classList.remove('primary');
    state.appFilter = 'pending';
    renderApplicationsList();
  });

  document.getElementById('btn-app-filter-all').addEventListener('click', (e) => {
    e.target.classList.add('primary');
    document.getElementById('btn-app-filter-pending').classList.remove('primary');
    state.appFilter = 'all';
    renderApplicationsList();
  });

  // 会費班セレクト
  document.getElementById('fee-ban-select').addEventListener('change', (e) => {
    state.currentFeeBan = e.target.value;
    renderFeeCollection();
  });

  // モーダルイベント
  document.getElementById('btn-close-member-modal').addEventListener('click', closeMemberModal);
  document.getElementById('btn-cancel-member-modal').addEventListener('click', closeMemberModal);
  document.getElementById('btn-save-member').addEventListener('click', handleSaveMember);
  document.getElementById('btn-delete-member').addEventListener('click', handleDeleteMember);

  document.getElementById('btn-close-approve-modal').addEventListener('click', closeApproveModal);
  document.getElementById('btn-cancel-approve').addEventListener('click', closeApproveModal);
  document.getElementById('btn-confirm-approve').addEventListener('click', handleConfirmApprove);

  // 設定タブ
  document.getElementById('btn-save-community-name').addEventListener('click', async () => {
    const val = document.getElementById('setting-community-name').value.trim();
    if (val) {
      const res = await api.saveSettings({ communityName: val }, (status, text) => {
        updateSyncStatus(status, text);
      });
      updateCommunityTitleDisplay();
      if (res && res.localOnly) {
        showToast('自治会名を保存しました', '🏠');
      } else {
        showToast('自治会名を保存し、スプレッドシートと同期しました！', '☁️');
      }
    }
  });

  const settingGasInput = document.getElementById('setting-gas-url');
  settingGasInput.value = api.getGasUrl();

  document.getElementById('btn-save-gas-url').addEventListener('click', async () => {
    const url = settingGasInput.value.trim();
    if (!url) {
      alert('URLを入力してください');
      return;
    }
    showToast('GAS接続テストを実行中...', '🔄');
    updateSyncStatus('syncing', '接続テスト中...');
    const res = await api.testGasConnection(url);
    if (res.success) {
      api.setGasUrl(url);
      showToast('スプレッドシートへの接続に成功しました！', '✅');
      updateSyncStatus('online', '接続成功');
      await loadData();
    } else {
      updateSyncStatus('offline', '接続エラー');
      alert(`接続テストに失敗しました。\nエラー: ${res.error}\n\n【確認点】\n1. デプロイ時に「アクセスできるユーザー: 全員」を選択していますか？\n2. URL末尾が「/exec」になっていますか？`);
    }
  });

  document.getElementById('btn-clear-gas-url').addEventListener('click', () => {
    if (confirm('GAS URLの設定を解除し、ローカルモード（スタンドアロン）に戻しますか？')) {
      api.setGasUrl('');
      settingGasInput.value = '';
      updateSyncStatus('local', 'ローカルモード');
      showToast('ローカルモードに切り替えました', '💻');
    }
  });

  // 印刷ボタン（名簿一覧）
  document.getElementById('btn-print-roster').addEventListener('click', () => {
    switchTab('tab-members');
    setTimeout(() => {
      window.print();
    }, 300);
  });

  // 帳票印刷タブ: 印刷ボタン（A4縦帳票）
  const btnPrintActiveReport = document.getElementById('btn-print-active-report');
  if (btnPrintActiveReport) {
    btnPrintActiveReport.addEventListener('click', () => {
      document.body.classList.add('printing-report');
      window.print();
      setTimeout(() => {
        document.body.classList.remove('printing-report');
      }, 500);
    });
  }

  // 帳票印刷タブ: パラメータ変更・帳票切り替え
  ['report-select-type', 'report-param-year', 'report-param-date'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', renderReportsTab);
    el.addEventListener('change', renderReportsTab);
  });

  // CSV
  document.getElementById('btn-export-csv').addEventListener('click', exportRosterToCsv);
  document.getElementById('input-import-csv').addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      importRosterFromCsv(e.target.files[0]);
      e.target.value = '';
    }
  });

  // ブロック設定: 新規ブロック追加
  const btnAddBlock = document.getElementById('btn-add-block');
  if (btnAddBlock) {
    btnAddBlock.addEventListener('click', () => {
      if (!state.editingBlocks) {
        state.editingBlocks = JSON.parse(JSON.stringify(getBlockConfig()));
      }
      syncEditingBlockNamesFromDom();
      const newNum = state.editingBlocks.length + 1;
      state.editingBlocks.push({
        id: `blk-${Date.now()}`,
        name: `${newNum}ブロック`,
        bans: []
      });
      renderBlockSettings();
      setTimeout(() => {
        const lastInput = document.querySelector(`.input-add-ban[data-block-idx="${state.editingBlocks.length - 1}"]`);
        if (lastInput) lastInput.focus();
      }, 50);
    });
  }

  // ブロック設定: 保存
  const btnSaveBlocks = document.getElementById('btn-save-blocks');
  if (btnSaveBlocks) {
    btnSaveBlocks.addEventListener('click', async () => {
      syncEditingBlockNamesFromDom();
      if (!state.editingBlocks || state.editingBlocks.length === 0) {
        alert('ブロックが1つもありません。最低1つのブロックを設定してください。');
        return;
      }
      btnSaveBlocks.disabled = true;
      btnSaveBlocks.textContent = '保存中...';
      const res = await api.saveSettings({ blocks: state.editingBlocks }, (status, text) => {
        updateSyncStatus(status, text);
      });
      btnSaveBlocks.disabled = false;
      btnSaveBlocks.innerHTML = '<span>💾</span> ブロック・班の設定を保存';
      populateBlockAndBanDropdowns();
      renderAllViews();
      playTone('success');
      if (res && res.localOnly) {
        showToast('ブロック・班の設定を保存しました！', '💾');
      } else {
        showToast('ブロック・班の設定を保存し、スプレッドシートと同期しました！', '☁️');
      }
    });
  }

  // ブロック設定: デフォルトに戻す
  const btnResetBlocks = document.getElementById('btn-reset-blocks');
  if (btnResetBlocks) {
    btnResetBlocks.addEventListener('click', async () => {
      if (confirm('ブロックと班の編成を初期設定（1〜5ブロック）に戻しますか？\n（スプレッドシート側の設定も初期状態に更新されます）')) {
        state.editingBlocks = JSON.parse(JSON.stringify(DEFAULT_BLOCK_CONFIG));
        await api.saveSettings({ blocks: state.editingBlocks }, (status, text) => {
          updateSyncStatus(status, text);
        });
        renderBlockSettings();
        populateBlockAndBanDropdowns();
        renderAllViews();
        playTone('toggle');
        showToast('ブロック・班の設定を初期状態に戻しました', '🔄');
      }
    });
  }

  // ブロック設定コンテナ内の委任イベント（班削除、ブロック削除、班追加）
  const blockSettingsContainer = document.getElementById('block-settings-container');
  if (blockSettingsContainer) {
    blockSettingsContainer.addEventListener('click', (e) => {
      const target = e.target.closest('[data-action]');
      if (!target) return;

      const action = target.getAttribute('data-action');
      const blkIdx = parseInt(target.getAttribute('data-block-idx'), 10);
      if (isNaN(blkIdx) || !state.editingBlocks || !state.editingBlocks[blkIdx]) return;

      syncEditingBlockNamesFromDom();

      if (action === 'remove-ban') {
        const banIdx = parseInt(target.getAttribute('data-ban-idx'), 10);
        if (!isNaN(banIdx)) {
          state.editingBlocks[blkIdx].bans.splice(banIdx, 1);
          renderBlockSettings();
        }
      } else if (action === 'remove-block') {
        const blk = state.editingBlocks[blkIdx];
        if (blk.bans && blk.bans.length > 0) {
          if (!confirm(`「${blk.name}」には ${blk.bans.length} 個の班が含まれています。本当に削除しますか？`)) {
            return;
          }
        }
        state.editingBlocks.splice(blkIdx, 1);
        renderBlockSettings();
      } else if (action === 'add-ban') {
        handleAddBanToBlock(blkIdx);
      }
    });

    // Enterキー押下で班追加
    blockSettingsContainer.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.classList.contains('input-add-ban')) {
        e.preventDefault();
        const blkIdx = parseInt(e.target.getAttribute('data-block-idx'), 10);
        if (!isNaN(blkIdx)) {
          syncEditingBlockNamesFromDom();
          handleAddBanToBlock(blkIdx);
        }
      }
    });
  }

  // 役職設定: 新規役職追加
  const btnAddRole = document.getElementById('btn-add-role');
  const inputAddRole = document.getElementById('input-add-role');
  if (btnAddRole) {
    btnAddRole.addEventListener('click', handleAddRole);
  }
  if (inputAddRole) {
    inputAddRole.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleAddRole();
      }
    });
  }

  // 役職設定: チップ内削除クリック
  const roleChipsContainer = document.getElementById('role-chips-container');
  if (roleChipsContainer) {
    roleChipsContainer.addEventListener('click', (e) => {
      const target = e.target.closest('[data-action="remove-role"]');
      if (!target) return;
      const idx = parseInt(target.getAttribute('data-role-idx'), 10);
      if (!isNaN(idx)) {
        handleRemoveRole(idx);
      }
    });
  }

  // 役職設定: 保存
  const btnSaveRoles = document.getElementById('btn-save-roles');
  if (btnSaveRoles) {
    btnSaveRoles.addEventListener('click', handleSaveRoles);
  }

  // 役職設定: デフォルトに戻す
  const btnResetRoles = document.getElementById('btn-reset-roles');
  if (btnResetRoles) {
    btnResetRoles.addEventListener('click', handleResetRoles);
  }

  // サンプルリセット
  document.getElementById('btn-reset-sample').addEventListener('click', () => {
    if (confirm('ローカルの名簿データを初期サンプルデータにリセットしますか？')) {
      api.resetToSampleData();
      loadData();
      showToast('初期サンプルデータにリセットしました', '🔄');
    }
  });
}

// =============================================================================
// ブロック・班管理設定 ロジック
// =============================================================================

// DOMの入力欄からブロック名を同期
function syncEditingBlockNamesFromDom() {
  if (!state.editingBlocks) return;
  document.querySelectorAll('.block-name-input').forEach(input => {
    const idx = parseInt(input.getAttribute('data-block-idx'), 10);
    if (!isNaN(idx) && state.editingBlocks[idx]) {
      const val = input.value.trim();
      state.editingBlocks[idx].name = val || `${idx + 1}ブロック`;
    }
  });
}

// 班の追加処理
function handleAddBanToBlock(blkIdx) {
  if (!state.editingBlocks || !state.editingBlocks[blkIdx]) return;
  const input = document.querySelector(`.input-add-ban[data-block-idx="${blkIdx}"]`);
  if (!input) return;

  const val = input.value.trim();
  if (!val) return;

  // 全ブロック内での重複チェック
  const allCurrentBans = getAllBansFromBlocks(state.editingBlocks);
  if (allCurrentBans.includes(val)) {
    alert(`「${val}」は既に登録されています。別の班名を入力してください。`);
    input.focus();
    return;
  }

  if (!state.editingBlocks[blkIdx].bans) {
    state.editingBlocks[blkIdx].bans = [];
  }
  state.editingBlocks[blkIdx].bans.push(val);
  renderBlockSettings();

  setTimeout(() => {
    const nextInput = document.querySelector(`.input-add-ban[data-block-idx="${blkIdx}"]`);
    if (nextInput) nextInput.focus();
  }, 50);
}

// ブロック・班設定UIのレンダリング
function renderBlockSettings() {
  if (!state.editingBlocks) {
    state.editingBlocks = JSON.parse(JSON.stringify(getBlockConfig()));
  }

  const container = document.getElementById('block-settings-container');
  if (!container) return;

  if (state.editingBlocks.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 24px; color: var(--text-muted); background: #ffffff; border-radius: var(--radius-md); border: 1px dashed var(--border-color);">
        ブロックが登録されていません。「＋ 新しいブロックを追加」を押して作成してください。
      </div>
    `;
    return;
  }

  container.innerHTML = state.editingBlocks.map((blk, blkIdx) => {
    const bansHtml = (blk.bans || []).map((ban, banIdx) => `
      <span class="ban-chip">
        <span>${escapeHtml(ban)}</span>
        <button type="button" class="ban-chip-remove" data-action="remove-ban" data-block-idx="${blkIdx}" data-ban-idx="${banIdx}" title="班を削除">×</button>
      </span>
    `).join('');

    return `
      <div class="block-config-card" data-block-idx="${blkIdx}">
        <div class="block-config-header">
          <input type="text" class="block-name-input" data-block-idx="${blkIdx}" value="${escapeHtml(blk.name)}" placeholder="ブロック名">
          <button type="button" class="btn-remove-block" data-action="remove-block" data-block-idx="${blkIdx}" title="ブロックを削除">🗑️</button>
        </div>

        <div class="ban-chips-container">
          ${bansHtml || '<span style="font-size: 0.75rem; color: var(--text-light); padding: 4px 0;">班が登録されていません</span>'}
        </div>

        <div class="block-add-ban-row">
          <input type="text" class="input-add-ban" data-block-idx="${blkIdx}" placeholder="新しい班名 (例: ${blkIdx + 1}-1班)">
          <button type="button" class="btn-add-ban" data-action="add-ban" data-block-idx="${blkIdx}">＋ 追加</button>
        </div>
      </div>
    `;
  }).join('');
}

// =============================================================================
// 役職マスタ管理設定 ロジック
// =============================================================================

function renderRoleSettings() {
  if (!state.editingRoles) {
    state.editingRoles = [...getRoleConfig()];
  }

  const container = document.getElementById('role-chips-container');
  if (!container) return;

  if (state.editingRoles.length === 0) {
    container.innerHTML = `
      <span style="font-size: 0.82rem; color: var(--text-muted); padding: 6px;">
        役職が登録されていません。「＋ 役職を追加」から登録してください。
      </span>
    `;
    return;
  }

  container.innerHTML = state.editingRoles.map((role, idx) => {
    const isGeneral = role === '一般会員';
    const removeBtn = isGeneral
      ? ''
      : `<button type="button" class="role-chip-remove" data-action="remove-role" data-role-idx="${idx}" title="役職を削除">×</button>`;

    return `
      <span class="role-chip ${isGeneral ? 'primary-role' : ''}">
        <span>${escapeHtml(role)}</span>
        ${removeBtn}
      </span>
    `;
  }).join('');
}

function handleAddRole() {
  if (!state.editingRoles) {
    state.editingRoles = [...getRoleConfig()];
  }

  const input = document.getElementById('input-add-role');
  if (!input) return;

  const val = input.value.trim();
  if (!val) return;

  if (state.editingRoles.includes(val)) {
    alert(`「${val}」は既に登録されています。別の役職名を入力してください。`);
    input.focus();
    return;
  }

  state.editingRoles.push(val);
  input.value = '';
  renderRoleSettings();

  setTimeout(() => {
    input.focus();
  }, 50);
}

function handleRemoveRole(idx) {
  if (!state.editingRoles || !state.editingRoles[idx]) return;
  const roleName = state.editingRoles[idx];

  // 名簿内にこの役職を持つ会員がいるか確認
  const assignedCount = state.members.filter(m => m.role === roleName).length;
  if (assignedCount > 0) {
    if (!confirm(`現在 ${assignedCount} 名の会員が「${roleName}」に設定されています。\n役職リストから削除してもよろしいですか？（既存の会員データは維持されます）`)) {
      return;
    }
  }

  state.editingRoles.splice(idx, 1);
  renderRoleSettings();
}

async function handleSaveRoles() {
  if (!state.editingRoles || state.editingRoles.length === 0) {
    alert('役職が1つもありません。最低1つの役職を設定してください。');
    return;
  }

  const btn = document.getElementById('btn-save-roles');
  if (btn) {
    btn.disabled = true;
    btn.textContent = '保存中...';
  }

  const res = await api.saveSettings({ roles: state.editingRoles }, (status, text) => {
    updateSyncStatus(status, text);
  });

  if (btn) {
    btn.disabled = false;
    btn.innerHTML = '<span>💾</span> 役職マスタ設定を保存';
  }

  populateRoleDropdowns();
  renderAllViews();
  playTone('success');
  if (res && res.localOnly) {
    showToast('役職マスタ設定を保存しました！', '💾');
  } else {
    showToast('役職マスタ設定を保存し、スプレッドシートと同期しました！', '☁️');
  }
}

async function handleResetRoles() {
  if (confirm('役職マスタを初期設定に戻しますか？\n（スプレッドシート側の設定も初期状態に更新されます）')) {
    state.editingRoles = [...DEFAULT_ROLE_LIST];
    await api.saveSettings({ roles: state.editingRoles }, (status, text) => {
      updateSyncStatus(status, text);
    });
    renderRoleSettings();
    populateRoleDropdowns();
    renderAllViews();
    playTone('toggle');
    showToast('役職マスタを初期設定に戻しました', '🔄');
  }
}

// XSS対策用エスケープ
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
