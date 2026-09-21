/**
 * 自治会員名簿管理システム - API & ストレージ連携レイヤー
 * Google Apps Script (GAS) Web API との非同期通信およびLocalStorageキャッシュ管理
 */

const STORAGE_KEYS = {
  MEMBERS: 'community_roster_members_v1',
  APPLICATIONS: 'community_roster_apps_v1',
  GAS_URL: 'community_roster_gas_url',
  COMMUNITY_NAME: 'community_roster_name',
  LAST_SYNC: 'community_roster_last_sync',
  BLOCKS: 'community_roster_blocks',
  ROLES: 'community_roster_roles'
};

const api = {
  getGasUrl() {
    return localStorage.getItem(STORAGE_KEYS.GAS_URL) || '';
  },

  setGasUrl(url) {
    if (url) {
      localStorage.setItem(STORAGE_KEYS.GAS_URL, url.trim());
    } else {
      localStorage.removeItem(STORAGE_KEYS.GAS_URL);
    }
  },

  getCommunityName() {
    return localStorage.getItem(STORAGE_KEYS.COMMUNITY_NAME) || '緑が丘自治会';
  },

  setCommunityName(name) {
    localStorage.setItem(STORAGE_KEYS.COMMUNITY_NAME, (name || '自治会').trim());
  },

  // ローカルキャッシュから名簿を取得
  getLocalMembers() {
    const raw = localStorage.getItem(STORAGE_KEYS.MEMBERS);
    if (!raw) {
      // 初期サンプルデータを格納して返す
      localStorage.setItem(STORAGE_KEYS.MEMBERS, JSON.stringify(INITIAL_MEMBERS));
      return [...INITIAL_MEMBERS];
    }
    try {
      const list = JSON.parse(raw);
      // マイグレーション: circulation（回覧方法）、phone2、join_date、ban_leader
      let updated = false;
      list.forEach(m => {
        if (!m.circulation) {
          const initMatch = INITIAL_MEMBERS.find(init => init.id === m.id);
          m.circulation = (initMatch && initMatch.circulation) ? initMatch.circulation : '紙';
          updated = true;
        }
        if (m.phone) {
          m.phone = formatPhoneNumber(m.phone);
        }
        if (m.phone2 === undefined) {
          const initMatch = INITIAL_MEMBERS.find(init => init.id === m.id);
          m.phone2 = (initMatch && initMatch.phone2) ? initMatch.phone2 : '';
          updated = true;
        } else if (m.phone2) {
          const formatted = formatPhoneNumber(m.phone2);
          if (formatted !== m.phone2) {
            m.phone2 = formatted;
            updated = true;
          }
        }
        if (m.ban_leader === undefined) {
          if (m.role === '班長') {
            m.ban_leader = '班長';
            m.role = '一般会員';
          } else {
            const initMatch = INITIAL_MEMBERS.find(init => init.id === m.id);
            m.ban_leader = (initMatch && initMatch.ban_leader) ? initMatch.ban_leader : 'なし';
          }
          updated = true;
        }
        if (m.join_date) {
          const normDate = normalizeDateToYmd(m.join_date);
          if (normDate !== m.join_date) {
            m.join_date = normDate;
            updated = true;
          }
        }
      });
      if (updated) {
        localStorage.setItem(STORAGE_KEYS.MEMBERS, JSON.stringify(list));
      }
      return list;
    } catch (e) {
      console.error('Failed to parse local members cache:', e);
      return [...INITIAL_MEMBERS];
    }
  },

  // ローカルキャッシュに名簿を保存
  setLocalMembers(members) {
    localStorage.setItem(STORAGE_KEYS.MEMBERS, JSON.stringify(members));
  },

  // ローカルキャッシュから申請一覧を取得
  getLocalApplications() {
    const raw = localStorage.getItem(STORAGE_KEYS.APPLICATIONS);
    if (!raw) {
      localStorage.setItem(STORAGE_KEYS.APPLICATIONS, JSON.stringify(INITIAL_APPLICATIONS));
      return [...INITIAL_APPLICATIONS];
    }
    try {
      return JSON.parse(raw);
    } catch (e) {
      console.error('Failed to parse local applications cache:', e);
      return [...INITIAL_APPLICATIONS];
    }
  },

  // ローカルキャッシュに申請一覧を保存
  setLocalApplications(apps) {
    localStorage.setItem(STORAGE_KEYS.APPLICATIONS, JSON.stringify(apps));
  },

  // タイムアウト付きFetch（GASが遅延した場合のブラウザフリーズ防止）
  async fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      clearTimeout(timer);
      return res;
    } catch (err) {
      clearTimeout(timer);
      throw err;
    }
  },

  // 全データの同期・取得
  async loadAllData(onStatusChange) {
    const gasUrl = this.getGasUrl();
    
    // GAS URLが設定されていない場合はローカルデータを使用
    if (!gasUrl) {
      if (onStatusChange) onStatusChange('local', 'ローカルモード（GAS未設定）');
      return {
        members: this.getLocalMembers(),
        applications: this.getLocalApplications(),
        isLocalOnly: true
      };
    }

    if (onStatusChange) onStatusChange('syncing', 'スプレッドシートと同期中...');
    try {
      const res = await this.fetchWithTimeout(`${gasUrl}?action=read&_t=${Date.now()}`);
      if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
      const data = await res.json();

      if (data && data.success) {
        if (Array.isArray(data.members)) {
          data.members.forEach(m => {
            m.join_date = normalizeDateToYmd(m.join_date);
            m.phone = formatPhoneNumber(m.phone);
            m.phone2 = formatPhoneNumber(m.phone2);
            m.ban_leader = m.ban_leader === '班長' ? '班長' : 'なし';
          });
          this.setLocalMembers(data.members);
        }
        if (Array.isArray(data.applications)) {
          this.setLocalApplications(data.applications);
        }
        if (data.settings) {
          if (Array.isArray(data.settings.blocks) && data.settings.blocks.length > 0) {
            saveBlockConfig(data.settings.blocks);
          }
          if (Array.isArray(data.settings.roles) && data.settings.roles.length > 0) {
            saveRoleConfig(data.settings.roles);
          }
          if (data.settings.communityName) {
            this.setCommunityName(data.settings.communityName);
          }
        }
        localStorage.setItem(STORAGE_KEYS.LAST_SYNC, formatCurrentDateTime());
        if (onStatusChange) onStatusChange('online', 'スプレッドシートと接続中');
        return {
          members: data.members || this.getLocalMembers(),
          applications: data.applications || this.getLocalApplications(),
          settings: data.settings || null,
          isLocalOnly: false
        };
      } else {
        throw new Error(data.error || 'データ取得に失敗しました');
      }
    } catch (err) {
      console.warn('GAS通信失敗、ローカルキャッシュにフォールバックします:', err);
      if (onStatusChange) onStatusChange('offline', 'オフライン（キャッシュ表示中）');
      return {
        members: this.getLocalMembers(),
        applications: this.getLocalApplications(),
        isLocalOnly: false,
        isFallback: true
      };
    }
  },

  // 会員追加または更新
  async saveMember(memberData, isNew = false, onStatusChange) {
    const gasUrl = this.getGasUrl();
    const members = this.getLocalMembers();
    const now = formatCurrentDateTime();
    memberData.updated_at = now;
    memberData.join_date = normalizeDateToYmd(memberData.join_date);
    memberData.phone = formatPhoneNumber(memberData.phone);
    memberData.phone2 = formatPhoneNumber(memberData.phone2);
    memberData.ban_leader = memberData.ban_leader === '班長' ? '班長' : 'なし';

    if (isNew) {
      if (!memberData.id) {
        memberData.id = getNextMemberId(members);
      }
      members.unshift(memberData);
    } else {
      const idx = members.findIndex(m => m.id === memberData.id);
      if (idx !== -1) {
        members[idx] = { ...members[idx], ...memberData };
      } else {
        members.unshift(memberData);
      }
    }
    this.setLocalMembers(members);

    if (gasUrl) {
      if (onStatusChange) onStatusChange('syncing', 'スプレッドシートに保存中...');
      try {
        const action = isNew ? 'createMember' : 'updateMember';
        const res = await this.fetchWithTimeout(gasUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: JSON.stringify({ action: action, member: memberData })
        });
        const result = await res.json();
        if (result && result.success) {
          if (onStatusChange) onStatusChange('online', '保存完了');
        } else {
          console.warn('GAS保存時にエラーが返されました:', result);
          if (onStatusChange) onStatusChange('offline', 'ローカルのみ保存（後で同期）');
        }
      } catch (err) {
        console.error('GAS保存失敗:', err);
        if (onStatusChange) onStatusChange('offline', 'ローカルのみ保存（オフライン）');
      }
    }
    return memberData;
  },

  // 会費ステータスの高速更新
  async updateFeeStatus(memberId, newStatus, onStatusChange) {
    const members = this.getLocalMembers();
    const target = members.find(m => m.id === memberId);
    if (target) {
      target.fee_status = newStatus;
      target.updated_at = formatCurrentDateTime();
      this.setLocalMembers(members);
    }

    const gasUrl = this.getGasUrl();
    if (gasUrl) {
      if (onStatusChange) onStatusChange('syncing', '会費状況を同期中...');
      try {
        await this.fetchWithTimeout(gasUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: JSON.stringify({
            action: 'updateFeeStatus',
            id: memberId,
            status: newStatus
          }),
          timeoutMs: 4000
        });
        if (onStatusChange) onStatusChange('online', '会費状況を更新しました');
      } catch (err) {
        console.warn('会費同期失敗:', err);
        if (onStatusChange) onStatusChange('offline', 'ローカルのみ反映');
      }
    }
    return target;
  },

  // 会員の削除または退会処理
  async deleteMember(memberId, hardDelete = false, onStatusChange) {
    let members = this.getLocalMembers();
    if (hardDelete) {
      members = members.filter(m => m.id !== memberId);
    } else {
      const target = members.find(m => m.id === memberId);
      if (target) {
        target.status = '転出退会';
        target.updated_at = formatCurrentDateTime();
      }
    }
    this.setLocalMembers(members);

    const gasUrl = this.getGasUrl();
    if (gasUrl) {
      if (onStatusChange) onStatusChange('syncing', 'スプレッドシート更新中...');
      try {
        await this.fetchWithTimeout(gasUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: JSON.stringify({
            action: 'deleteMember',
            id: memberId,
            hardDelete: hardDelete
          })
        });
        if (onStatusChange) onStatusChange('online', '削除・退会完了');
      } catch (err) {
        console.warn('GAS削除失敗:', err);
        if (onStatusChange) onStatusChange('offline', 'ローカルのみ反映');
      }
    }
    return true;
  },

  // Googleフォーム入会申請の承認＆名簿への本登録
  async approveApplication(appId, memberData, onStatusChange) {
    const apps = this.getLocalApplications();
    const appTarget = apps.find(a => a.id === appId);
    if (appTarget) {
      appTarget.status = '承認済';
      appTarget.processed_at = formatCurrentDateTime();
      this.setLocalApplications(apps);
    }

    // 会員名簿に追加
    await this.saveMember(memberData, true, onStatusChange);

    const gasUrl = this.getGasUrl();
    if (gasUrl) {
      if (onStatusChange) onStatusChange('syncing', '申請承認をスプレッドシートに反映中...');
      try {
        await this.fetchWithTimeout(gasUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: JSON.stringify({
            action: 'approveApplication',
            appId: appId,
            member: memberData
          })
        });
        if (onStatusChange) onStatusChange('online', '承認・名簿登録完了');
      } catch (err) {
        console.warn('GAS申請承認同期失敗:', err);
      }
    }
    return true;
  },

  // Googleフォーム入会申請の却下
  async rejectApplication(appId, reason = '', onStatusChange) {
    const apps = this.getLocalApplications();
    const appTarget = apps.find(a => a.id === appId);
    if (appTarget) {
      appTarget.status = '却下';
      appTarget.processed_at = formatCurrentDateTime();
      if (reason) appTarget.notes = (appTarget.notes ? appTarget.notes + ' ' : '') + `[却下理由: ${reason}]`;
      this.setLocalApplications(apps);
    }

    const gasUrl = this.getGasUrl();
    if (gasUrl) {
      try {
        await this.fetchWithTimeout(gasUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: JSON.stringify({
            action: 'rejectApplication',
            appId: appId,
            reason: reason
          })
        });
      } catch (err) {
        console.warn('GAS申請却下同期失敗:', err);
      }
    }
    return true;
  },

  // システム設定（ブロック・班、役職、自治会名）の保存
  async saveSettings(settingsData, onStatusChange) {
    // 1. ローカルキャッシュに保存
    if (settingsData.blocks) {
      saveBlockConfig(settingsData.blocks);
    }
    if (settingsData.roles) {
      saveRoleConfig(settingsData.roles);
    }
    if (settingsData.communityName) {
      this.setCommunityName(settingsData.communityName);
    }

    // 2. GASスプレッドシートへ同期
    const gasUrl = this.getGasUrl();
    if (gasUrl) {
      if (onStatusChange) onStatusChange('syncing', '設定をスプレッドシートに保存中...');
      try {
        const res = await this.fetchWithTimeout(gasUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: JSON.stringify({
            action: 'updateSettings',
            settings: settingsData
          })
        });
        const result = await res.json();
        if (result && result.success) {
          if (onStatusChange) onStatusChange('online', 'スプレッドシートと接続中');
          return { success: true };
        } else {
          throw new Error(result.error || '設定の保存に失敗しました');
        }
      } catch (err) {
        console.warn('GAS設定同期失敗:', err);
        if (onStatusChange) onStatusChange('offline', 'ローカルのみ保存（オフライン）');
        return { success: false, error: err.message, localSaved: true };
      }
    }
    return { success: true, localOnly: true };
  },

  // GAS接続テスト
  async testGasConnection(url) {
    if (!url) return { success: false, error: 'URLが入力されていません' };
    try {
      const res = await this.fetchWithTimeout(`${url}?action=ping&_t=${Date.now()}`, {}, 6000);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return { success: true, message: data.message || '接続成功' };
    } catch (err) {
      return { success: false, error: err.message || '接続に失敗しました。URLや公開権限（全員）をご確認ください。' };
    }
  },

  // 初期サンプルデータへのリセット
  resetToSampleData() {
    localStorage.setItem(STORAGE_KEYS.MEMBERS, JSON.stringify(INITIAL_MEMBERS));
    localStorage.setItem(STORAGE_KEYS.APPLICATIONS, JSON.stringify(INITIAL_APPLICATIONS));
    localStorage.removeItem(STORAGE_KEYS.LAST_SYNC);
  }
};
