/**
 * 自治会員名簿管理システム - データモデル・モックデータ・ユーティリティ
 */

// デフォルトのブロック・班構成（1ブロック〜5ブロック）
const DEFAULT_BLOCK_CONFIG = [
  { id: 'blk-1', name: '1ブロック', bans: ['1班', '2班'] },
  { id: 'blk-2', name: '2ブロック', bans: ['3班', '4班'] },
  { id: 'blk-3', name: '3ブロック', bans: ['5班', '6班'] },
  { id: 'blk-4', name: '4ブロック', bans: ['7班'] },
  { id: 'blk-5', name: '5ブロック', bans: ['8班'] }
];

// ブロック設定の取得
function getBlockConfig() {
  const raw = localStorage.getItem('community_roster_blocks');
  if (!raw) {
    return JSON.parse(JSON.stringify(DEFAULT_BLOCK_CONFIG));
  }
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
  } catch (e) {
    console.error('Failed to parse block config:', e);
  }
  return JSON.parse(JSON.stringify(DEFAULT_BLOCK_CONFIG));
}

// ブロック設定から全班リストを抽出
function getAllBansFromBlocks(config = getBlockConfig()) {
  const bans = [];
  config.forEach(b => {
    (b.bans || []).forEach(ban => {
      const trimmed = String(ban).trim();
      if (trimmed && !bans.includes(trimmed)) {
        bans.push(trimmed);
      }
    });
  });
  return bans;
}

// 班リスト（設定から動的初期化）
const BAN_LIST = getAllBansFromBlocks(getBlockConfig());

// 班リストをブロック設定と同期
function syncBanListFromBlocks() {
  const bans = getAllBansFromBlocks(getBlockConfig());
  BAN_LIST.length = 0;
  bans.forEach(b => BAN_LIST.push(b));
  return BAN_LIST;
}

// ブロック設定の保存
function saveBlockConfig(config) {
  localStorage.setItem('community_roster_blocks', JSON.stringify(config));
  syncBanListFromBlocks();
}

// 指定の班が属するブロック名を取得
function getBanBlockName(ban, config = getBlockConfig()) {
  if (!ban) return '';
  for (const blk of config) {
    if ((blk.bans || []).includes(ban)) {
      return blk.name;
    }
  }
  return '';
}

// 班長選択肢リスト
const BAN_LEADER_LIST = ['なし', '班長'];

// デフォルト役員リスト（現行の役職・係を役員として整理）
const DEFAULT_ROLE_LIST = [
  '一般会員',
  '会長',
  '副会長',
  'ブロック長',
  '会計',
  '書記',
  '防災委員',
  '環境美化委員',
  '防犯交通委員',
  '青少年育成委員',
  '民生委員',
  '顧問'
];

// 日付から和暦年度を計算（4月1日〜翌年3月31日、例: 令和8年度）
function getFiscalYearWareki(dateInput = new Date()) {
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(d.getTime())) return '令和8年度';
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  const fiscalYear = month >= 4 ? year : year - 1;
  const reiwaYear = fiscalYear - 2018;
  return `令和${reiwaYear === 1 ? '元' : reiwaYear}年度`;
}

// 日付から和暦短縮形式を生成（例: R8.9.20）
function formatWarekiShortDate(dateInput = new Date()) {
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(d.getTime())) return '';
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const reiwaYear = year - 2018;
  return `R${reiwaYear}.${month}.${day}`;
}

// 役員設定の取得
function getRoleConfig() {
  const raw = localStorage.getItem('community_roster_roles');
  if (!raw) {
    return [...DEFAULT_ROLE_LIST];
  }
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      const filtered = parsed.filter(r => r !== '班長');
      if (!filtered.includes('ブロック長')) {
        const fukuIdx = filtered.indexOf('副会長');
        if (fukuIdx !== -1) {
          filtered.splice(fukuIdx + 1, 0, 'ブロック長');
        } else {
          filtered.push('ブロック長');
        }
      }
      return filtered;
    }
  } catch (e) {
    console.error('Failed to parse role config:', e);
  }
  return [...DEFAULT_ROLE_LIST];
}

// 役員リスト（設定から動的初期化）
const ROLE_LIST = getRoleConfig();

// 役員リストをストレージ設定と同期
function syncRoleList() {
  const roles = getRoleConfig();
  ROLE_LIST.length = 0;
  roles.forEach(r => ROLE_LIST.push(r));
  return ROLE_LIST;
}

// 役員設定の保存
function saveRoleConfig(roles) {
  const filtered = Array.isArray(roles) ? roles.filter(r => r !== '班長') : [...DEFAULT_ROLE_LIST];
  localStorage.setItem('community_roster_roles', JSON.stringify(filtered));
  syncRoleList();
}

// 会費ステータス
const FEE_STATUS_LIST = ['納入済', '未納', '免除'];

// 回覧方法
const CIRCULATION_LIST = ['LINE', '紙'];

// 会員状態
const STATUS_LIST = ['現役', '休会', '転出退会'];

// 要支援・見守り区分
const SUPPORT_LIST = ['なし', '要支援(防災)', '見守り対象(高齢)', '要支援・見守り双方'];

// 初期モック会員名簿データ（リアルな自治会サンプル）
const INITIAL_MEMBERS = [
  {
    id: "MB-0001",
    ban: "1班",
    name: "山田 太郎",
    kana: "ヤマダ タロウ",
    phone: "090-1234-5678",
    phone2: "03-1234-5670",
    email: "yamada.t@example.com",
    address: "1丁目12-3 パークハイツ101",
    household_count: 3,
    family_members: "妻: 花子(45), 長男: 一郎(17)",
    role: "会長",
    ban_leader: "なし",
    fee_status: "納入済",
    circulation: "LINE",
    support_needed: "なし",
    join_date: "2015-04-01",
    status: "現役",
    notes: "自治会連絡網リーダー、集会所鍵保管者",
    updated_at: "2026-04-10 10:00:00"
  },
  {
    id: "MB-0002",
    ban: "1班",
    name: "佐藤 健一",
    kana: "サトウ ケンイチ",
    phone: "080-2345-6789",
    phone2: "",
    email: "sato.k@example.com",
    address: "1丁目12-8",
    household_count: 2,
    family_members: "妻: 美佐子(68)",
    role: "一般会員",
    ban_leader: "班長",
    fee_status: "納入済",
    circulation: "LINE",
    support_needed: "なし",
    join_date: "2018-05-12",
    status: "現役",
    notes: "1班班長（2026年度）",
    updated_at: "2026-05-01 14:20:00"
  },
  {
    id: "MB-0003",
    ban: "1班",
    name: "田中 義雄",
    kana: "タナカ ヨシオ",
    phone: "03-3456-7890",
    phone2: "090-9876-5432",
    email: "",
    address: "1丁目14-2",
    household_count: 1,
    family_members: "独居",
    role: "一般会員",
    ban_leader: "なし",
    fee_status: "納入済",
    circulation: "紙",
    support_needed: "見守り対象(高齢)",
    join_date: "2010-04-01",
    status: "現役",
    notes: "82歳独居。民生委員が月1回巡回中。広報誌は手渡し希望。",
    updated_at: "2026-04-15 09:30:00"
  },
  {
    id: "MB-0004",
    ban: "2班",
    name: "鈴木 一郎",
    kana: "スズキ イチロウ",
    phone: "090-3456-7891",
    phone2: "03-3456-7800",
    email: "suzuki.i@example.com",
    address: "2丁目3-15 メゾン緑202",
    household_count: 4,
    family_members: "妻: 優子(38), 長女: 結衣(10), 次女: 葵(7)",
    role: "副会長",
    ban_leader: "なし",
    fee_status: "納入済",
    circulation: "LINE",
    support_needed: "なし",
    join_date: "2020-04-01",
    status: "現役",
    notes: "夏祭り・秋祭り実行委員長",
    updated_at: "2026-04-20 16:45:00"
  },
  {
    id: "MB-0005",
    ban: "2班",
    name: "高橋 誠",
    kana: "タカハシ マコト",
    phone: "090-4567-8902",
    phone2: "",
    email: "takahashi.m@example.com",
    address: "2丁目4-5",
    household_count: 3,
    family_members: "妻: 陽子(42), 長男: 翔(12)",
    role: "ブロック長",
    ban_leader: "班長",
    fee_status: "未納",
    circulation: "紙",
    support_needed: "なし",
    join_date: "2021-06-15",
    status: "現役",
    notes: "2班班長・1ブロック長（2026年度）",
    updated_at: "2026-05-10 11:15:00"
  },
  {
    id: "MB-0006",
    ban: "2班",
    name: "伊藤 京子",
    kana: "イトウ キョウコ",
    phone: "080-5678-9013",
    phone2: "03-5678-9000",
    email: "",
    address: "2丁目6-12",
    household_count: 1,
    family_members: "独居",
    role: "一般会員",
    ban_leader: "なし",
    fee_status: "免除",
    circulation: "紙",
    support_needed: "見守り対象(高齢)",
    join_date: "2008-04-01",
    status: "休会",
    notes: "車椅子利用。長期療養中のため一時休会中。",
    updated_at: "2026-04-25 14:00:00"
  },
  {
    id: "MB-0007",
    ban: "3班",
    name: "渡辺 大輔",
    kana: "ワタナベ ダイスケ",
    phone: "090-6789-0124",
    phone2: "",
    email: "watanabe.d@example.com",
    address: "3丁目1-8",
    household_count: 4,
    family_members: "妻: 由美(35), 長男: 蓮(5), 次男: 湊(2)",
    role: "会計",
    ban_leader: "なし",
    fee_status: "納入済",
    circulation: "LINE",
    support_needed: "なし",
    join_date: "2022-10-01",
    status: "現役",
    notes: "自治会口座・会計帳簿管理担当",
    updated_at: "2026-04-02 10:00:00"
  },
  {
    id: "MB-0008",
    ban: "3班",
    name: "中村 修",
    kana: "ナカムラ オサム",
    phone: "090-7890-1235",
    phone2: "03-7890-1200",
    email: "",
    address: "3丁目2-22",
    household_count: 2,
    family_members: "妻: 節子(70)",
    role: "一般会員",
    ban_leader: "班長",
    fee_status: "納入済",
    circulation: "紙",
    support_needed: "なし",
    join_date: "2016-04-01",
    status: "現役",
    notes: "3班班長（2026年度）",
    updated_at: "2026-05-02 08:30:00"
  },
  {
    id: "MB-0009",
    ban: "3班",
    name: "小林 勇気",
    kana: "コバヤシ ユウキ",
    phone: "080-8901-2346",
    phone2: "",
    email: "kobayashi.y@example.com",
    address: "3丁目3-10 サンシャイン301",
    household_count: 2,
    family_members: "同居人: 佐々木 真理",
    role: "一般会員",
    ban_leader: "なし",
    fee_status: "未納",
    circulation: "LINE",
    support_needed: "なし",
    join_date: "2025-04-01",
    status: "現役",
    notes: "共働きのため平日夜間連絡希望",
    updated_at: "2026-05-15 19:10:00"
  },
  {
    id: "MB-0010",
    ban: "4班",
    name: "加藤 浩",
    kana: "カトウ ヒロシ",
    phone: "090-9012-3457",
    phone2: "",
    email: "kato.h@example.com",
    address: "4丁目7-1",
    household_count: 3,
    family_members: "妻: 早苗(52), 母: ハツ(85)",
    role: "防災委員",
    ban_leader: "なし",
    fee_status: "納入済",
    circulation: "LINE",
    support_needed: "要支援(防災)",
    join_date: "2012-04-01",
    status: "現役",
    notes: "母が足が不自由なため避難時要支援。自身は防災委員として防災訓練リード。",
    updated_at: "2026-04-18 15:40:00"
  },
  {
    id: "MB-0011",
    ban: "4班",
    name: "吉田 恵美",
    kana: "ヨシダ エミ",
    phone: "090-0123-4568",
    phone2: "",
    email: "yoshida.e@example.com",
    address: "4丁目8-14",
    household_count: 2,
    family_members: "夫: 健治(48)",
    role: "一般会員",
    ban_leader: "班長",
    fee_status: "納入済",
    circulation: "紙",
    support_needed: "なし",
    join_date: "2019-09-01",
    status: "現役",
    notes: "4班班長（2026年度）",
    updated_at: "2026-05-04 10:20:00"
  },
  {
    id: "MB-0012",
    ban: "4班",
    name: "松本 健二",
    kana: "マツモト ケンジ",
    phone: "080-1122-3344",
    phone2: "",
    email: "matsumoto@example.com",
    address: "4丁目9-3",
    household_count: 1,
    family_members: "単身",
    role: "一般会員",
    ban_leader: "なし",
    fee_status: "未納",
    circulation: "LINE",
    support_needed: "なし",
    join_date: "2023-04-01",
    status: "転出退会",
    notes: "2026年3月末に他市へ転出退会",
    updated_at: "2026-03-31 17:00:00"
  }
];

// 初期モック入会申請データ（Googleフォーム回答連携のサンプル）
const INITIAL_APPLICATIONS = [
  {
    id: "FORM-001",
    timestamp: "2026-09-01 14:23:10",
    name: "森田 雄大",
    kana: "モリタ ユウダイ",
    phone: "090-4455-6677",
    email: "morita.y@example.com",
    address: "2丁目7-3 クレストヒルズ203",
    preferred_ban: "2班希望（隣のメゾン緑の近くです）",
    household_count: 3,
    family_members: "妻: 智子(34), 長男: 颯太(4)",
    status: "未処理",
    processed_at: "",
    notes: "8月に引っ越してまいりました。ゴミ出しや子供会、防災活動に参加したいです。"
  },
  {
    id: "FORM-002",
    timestamp: "2026-09-03 09:12:45",
    name: "井上 陽菜",
    kana: "イノウエ ハルナ",
    phone: "080-7788-9900",
    email: "inoue.haruna@example.com",
    address: "3丁目4-15",
    preferred_ban: "3班",
    household_count: 2,
    family_members: "母: 弘子(78)",
    status: "未処理",
    processed_at: "",
    notes: "母と同居のため見守り支援なども相談させていただけますと幸いです。"
  },
  {
    id: "FORM-003",
    timestamp: "2026-08-25 18:05:22",
    name: "斎藤 隆",
    kana: "サイトウ タカシ",
    phone: "090-8899-0011",
    email: "saito.t@example.com",
    address: "1丁目15-20",
    preferred_ban: "1班",
    household_count: 1,
    family_members: "単身",
    status: "承認済",
    processed_at: "2026-08-26 10:00:00",
    notes: "承認済サンプル（MB-0013として登録済）"
  }
];

// 全角英数・記号を半角に変換
function toHalfWidth(str) {
  if (!str) return '';
  return str.replace(/[！-～]/g, function(s) {
    return String.fromCharCode(s.charCodeAt(0) - 0xFEE0);
  }).replace(/　/g, ' ').replace(/[ー－―—]/g, '-');
}

// 電話番号の正規化・日付誤認復元ヘルパー
// スプレッドシート側で「03-1234-5678」などの電話番号がDate型として解釈されてしまい
// "2024-03-12" や "1899-12-30T..." や "2026-04-01T15:00:00.000Z" のような日付文字列として
// 届いてしまった場合や、不要な日付型変換を防止・修復する
function formatPhoneNumber(val) {
  if (val === undefined || val === null) return '';
  if (val instanceof Date) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const d = String(val.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  let str = toHalfWidth(String(val).trim());
  if (!str) return '';

  // ISOタイムスタンプ ("2026-03-12T15:00:00.000Z" など) または "2026-04-01 00:00:00" の場合、日付部分だけを取り出す
  const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})[T\s]/);
  if (isoMatch) {
    str = `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }

  return str;
}

// ひらがなをカタカナに変換（検索照合用）
function hiraToKata(str) {
  if (!str) return '';
  return str.replace(/[\u3041-\u3096]/g, function(ch) {
    return String.fromCharCode(ch.charCodeAt(0) + 0x60);
  });
}

// 検索文字列の正規化（ひらがな・カタカナ・大文字小文字・半角全角を統一）
function normalizeSearchText(str) {
  if (!str) return '';
  let s = toHalfWidth(str.toLowerCase());
  s = hiraToKata(s);
  return s.replace(/[\s\-_]/g, '');
}

// 現在日時のフォーマット YYYY-MM-DD HH:mm:ss
function formatCurrentDateTime() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

// 現在日付のフォーマット YYYY-MM-DD
function formatCurrentDate() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// 日付文字列を YYYY-MM-DD 形式に正規化（HTMLの<input type="date">や名簿管理用）
// スプレッドシート由来の "2024-04-01 00:00:00", "2024/04/01", "2024/4/1", "2024年4月1日", Dateオブジェクト等を吸収
function normalizeDateToYmd(val) {
  if (!val) return '';
  if (val instanceof Date) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const d = String(val.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const str = String(val).trim();
  if (!str) return '';

  // 1. "2024-04-01 00:00:00" や "2024/04/01", "2024/4/1", "2024年4月1日" などの年月日抽出
  const m1 = str.match(/^(\d{4})[-\/\.年](\d{1,2})[-\/\.月](\d{1,2})/);
  if (m1) {
    const y = m1[1];
    const m = String(m1[2]).padStart(2, '0');
    const d = String(m1[3]).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // 2. JavaScript Date としてパース可能な場合
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  return '';
}

// 次の会員IDを発行（MB-0013等）
function getNextMemberId(members) {
  let maxNum = 0;
  (members || []).forEach(m => {
    if (m.id) {
      const match = m.id.match(/^MB-(\d+)$/i);
      if (match) {
        const n = parseInt(match[1], 10);
        if (n > maxNum) maxNum = n;
      }
    }
  });
  const nextNum = maxNum + 1;
  return `MB-${String(nextNum).padStart(4, '0')}`;
}
