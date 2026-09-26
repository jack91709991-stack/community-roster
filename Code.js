/**
 * 自治会員名簿管理システム - Google Apps Script (GAS) バックエンドAPI
 * 
 * =========================================================================
 * 【Googleスプレッドシート・GAS導入手順】
 * =========================================================================
 * 1. Googleスプレッドシートを新規作成（または既存の自治会スプレッドシートを開く）。
 * 2. メニューバーの「拡張機能」>「Apps Script」をクリック。
 * 3. 表示されたコードエディタ（コード.gs）の中身を全選択して削除し、本スクリプト（Code.js）を丸ごと貼り付け。
 * 4. エディタ上部の「プロジェクトを保存（フロッピーアイコン）」をクリック。
 * 5. エディタ右上の青いボタン「デプロイ」>「新しいデプロイ」をクリック。
 * 6. 歯車アイコンをクリックし「ウェブアプリ」を選択。
 * 7. 次の項目を設定：
 *    - 説明: 自治会名簿API v1
 *    - 次のユーザーとして実行: 自分（あなたのGoogleアカウント）
 *    - アクセスできるユーザー: 全員 (「全員 (Anyone)」を選択してください。ログイン認証なしでWebアプリから通信できます)
 * 8. 「デプロイ」をクリックし、初回のみ「アクセスの承認」画面が出たら「詳細」>「...に移動（安全ではない）」をクリックして許可。
 * 9. 発行された「ウェブアプリのURL」（https://script.google.com/macros/s/.../exec）をコピー。
 * 10. 本アプリ（自治会員名簿管理システム）の画面右上「設定」タブを開き、
 *     「Google Apps Script Web App URL」に貼り付けて「保存して接続テスト」をクリック！
 * 
 * -------------------------------------------------------------------------
 * 【Googleフォーム連携について】
 * -------------------------------------------------------------------------
 * 入会申込用のGoogleフォームを作成後、フォームの「回答」タブ >「スプレッドシートにリンク」で
 * 本スプレッドシートを指定するか、本スクリプトが自動生成する「入会申込_フォーム連携」シートを
 * 回答先として指定すると、自動的にWebアプリ上の「入会申請受付」画面で確認・1クリック承認できるようになります。
 */

var MASTER_SHEET_NAME = "会員名簿";
var FORM_SHEET_NAME = "入会申込_フォーム連携";
var SETTINGS_SHEET_NAME = "システム設定";

// システム設定シートのヘッダー定義
var SETTINGS_HEADERS = ["設定項目キー", "設定値 (JSON/テキスト)", "設定名称・説明", "最終更新日時"];

var DEFAULT_BLOCKS_GAS = [
  { id: 'blk-1', name: '1ブロック', bans: ['1班', '2班'] },
  { id: 'blk-2', name: '2ブロック', bans: ['3班', '4班'] },
  { id: 'blk-3', name: '3ブロック', bans: ['5班', '6班'] },
  { id: 'blk-4', name: '4ブロック', bans: ['7班'] },
  { id: 'blk-5', name: '5ブロック', bans: ['8班'] }
];

var DEFAULT_ROLES_GAS = [
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

// 会員名簿シートのヘッダー定義
var MASTER_HEADERS = [
  "会員ID",
  "班",
  "氏名",
  "フリガナ",
  "電話番号",
  "電話番号2",
  "メールアドレス",
  "住所",
  "世帯人数",
  "同居家族",
  "役員",
  "班長",
  "会費状況",
  "回覧方法",
  "要支援・見守り",
  "加入日",
  "会員状態",
  "備考",
  "更新日時"
];

// 入会申込（フォーム連携）シートのヘッダー定義
var FORM_HEADERS = [
  "タイムスタンプ",
  "申請ID",
  "氏名",
  "フリガナ",
  "電話番号",
  "メールアドレス",
  "住所",
  "希望班・近隣情報",
  "世帯人数",
  "家族構成",
  "ステータス",
  "処理日時",
  "備考"
];

/**
 * シートの1行目ヘッダーから列名と列インデックス（0-based）のマップを生成
 */
function getHeaderMap(sheet) {
  var lastCol = sheet.getLastColumn();
  if (lastCol <= 0) return {};
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var map = {};
  for (var i = 0; i < headers.length; i++) {
    var key = String(headers[i] || '').trim();
    if (key) {
      map[key] = i;
      // 互換性: 「役職」と「役員」を相互認識
      if (key === '役職' && map['役員'] === undefined) map['役員'] = i;
      if (key === '役員' && map['役職'] === undefined) map['役職'] = i;
    }
  }
  return map;
}

/**
 * 会員名簿シートを取得（存在しない場合は初期作成、既存シートの場合はヘッダーを最新化・電話番号2および班長列の自動挿入）
 */
function getMasterSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(MASTER_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(MASTER_SHEET_NAME);
    sheet.getRange(1, 1, 1, MASTER_HEADERS.length).setValues([MASTER_HEADERS]);
    sheet.getRange(1, 1, 1, MASTER_HEADERS.length).setFontWeight("bold").setBackground("#1e3a8a").setFontColor("#ffffff");
    sheet.setFrozenRows(1);
    // 電話番号1, 電話番号2 列を書式なしテキスト（@）に設定
    sheet.getRange(2, 5, sheet.getMaxRows() - 1, 2).setNumberFormat('@');
  } else {
    var maxCol = sheet.getLastColumn();
    if (maxCol > 0) {
      var headerValues = sheet.getRange(1, 1, 1, maxCol).getValues()[0];
      var phoneIdx = -1;
      var phone2Idx = -1;
      var roleIdx = -1;
      var banLeaderIdx = -1;

      for (var c = 0; c < headerValues.length; c++) {
        var hName = String(headerValues[c] || '').trim();
        if (hName === "電話番号" || hName === "電話番号1") phoneIdx = c + 1; // 1-based
        if (hName === "電話番号2") phone2Idx = c + 1;
        if (hName === "役職" || hName === "役員") roleIdx = c + 1;
        if (hName === "班長") banLeaderIdx = c + 1;
      }

      // 1. 電話番号2の自動挿入
      if (phone2Idx === -1 && phoneIdx > 0) {
        sheet.insertColumnAfter(phoneIdx);
        sheet.getRange(1, phoneIdx + 1).setValue("電話番号2").setFontWeight("bold").setBackground("#1e3a8a").setFontColor("#ffffff");
        phone2Idx = phoneIdx + 1;
        if (roleIdx > phoneIdx) roleIdx++; // 列挿入によるインデックスシフト
        if (banLeaderIdx > phoneIdx) banLeaderIdx++;
      }

      // 電話番号列と電話番号2列を「書式なしテキスト（@）」に設定（自動日付化防止）
      var totalRows = Math.max(sheet.getMaxRows(), 100);
      if (phoneIdx > 0) {
        sheet.getRange(2, phoneIdx, totalRows - 1, 1).setNumberFormat('@');
      }
      if (phone2Idx > 0) {
        sheet.getRange(2, phone2Idx, totalRows - 1, 1).setNumberFormat('@');
      }

      // 2. 「役職」ヘッダーを「役員」に更新
      if (roleIdx > 0) {
        var curRoleHeader = String(sheet.getRange(1, roleIdx).getValue() || '').trim();
        if (curRoleHeader === '役職') {
          sheet.getRange(1, roleIdx).setValue("役員");
        }
      }

      // 3. 班長列の自動挿入（役員列の直後）
      if (banLeaderIdx === -1 && roleIdx > 0) {
        sheet.insertColumnAfter(roleIdx);
        sheet.getRange(1, roleIdx + 1).setValue("班長").setFontWeight("bold").setBackground("#1e3a8a").setFontColor("#ffffff");
      }
    }
  }
  return sheet;
}

/**
 * 入会申込連携シートを取得（Googleフォームが自動作成する「フォームの回答 1」等のシートを自動検出、なければデフォルトシートを作成）
 */
function getFormSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // 1. Googleフォーム標準の回答シート（「フォームの回答 1」「フォームの回答」等）を優先探索
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    var sName = sheets[i].getName();
    if (sName.indexOf("フォームの回答") !== -1) {
      return sheets[i];
    }
  }

  // 2. 指定名称「入会申込_フォーム連携」があればそれを返す
  var sheet = ss.getSheetByName(FORM_SHEET_NAME);
  if (sheet) return sheet;

  // 3. なければ新規作成
  sheet = ss.insertSheet(FORM_SHEET_NAME);
  sheet.getRange(1, 1, 1, FORM_HEADERS.length).setValues([FORM_HEADERS]);
  sheet.getRange(1, 1, 1, FORM_HEADERS.length).setFontWeight("bold").setBackground("#059669").setFontColor("#ffffff");
  sheet.setFrozenRows(1);
  return sheet;
}

/**
 * システム設定シートを取得（存在しない場合は初期作成）
 */
function getSettingsSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SETTINGS_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SETTINGS_SHEET_NAME);
    sheet.getRange(1, 1, 1, SETTINGS_HEADERS.length).setValues([SETTINGS_HEADERS]);
    sheet.getRange(1, 1, 1, SETTINGS_HEADERS.length).setFontWeight("bold").setBackground("#475569").setFontColor("#ffffff");
    sheet.setFrozenRows(1);

    var now = Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyy-MM-dd HH:mm:ss");
    var initialRows = [
      ["blocks", JSON.stringify(DEFAULT_BLOCKS_GAS), "ブロック・班の編成設定", now],
      ["roles", JSON.stringify(DEFAULT_ROLES_GAS), "役職・係のマスタ設定", now],
      ["communityName", "緑が丘自治会", "自治会・町内会名", now],
      ["passcode", "roster2026", "役員用合言葉（閲覧・帳票印刷・集金チェック用）", now],
      ["adminPasscode", "admin2026", "管理者用合言葉（名簿編集・削除・設定変更用）", now]
    ];
    sheet.getRange(2, 1, initialRows.length, SETTINGS_HEADERS.length).setValues(initialRows);
    sheet.setColumnWidth(1, 140);
    sheet.setColumnWidth(2, 360);
    sheet.setColumnWidth(3, 200);
    sheet.setColumnWidth(4, 180);
  }
  return sheet;
}

/**
 * スプレッドシートを開いた時に自動実行（メニュー追加＆初期シートの自動作成）
 */
function onOpen() {
  try {
    initSheets();
    var ui = SpreadsheetApp.getUi();
    ui.createMenu('自治会名簿システム')
      .addItem('⚙️ システム設定シートを作成・最新化', 'initSheets')
      .addToUi();
  } catch (e) {
    // Web Apps経由等でgetUiが取得できない場合の安全ガード
  }
}

/**
 * 必要な全シート（会員名簿、入会申込、システム設定）を生成・初期化
 */
function initSheets() {
  getMasterSheet();
  getFormSheet();
  getSettingsSheet();
  try {
    SpreadsheetApp.getActiveSpreadsheet().toast('「システム設定」シートを作成・最新化しました。合言葉の確認・変更が可能です。', '設定完了', 5);
  } catch (e) {}
}

/**
 * システム設定（ブロック・班、役職マスタ、自治会名、合言葉）を取得
 */
function fetchSettings(isInternal) {
  var sheet = getSettingsSheet();
  var lastRow = sheet.getLastRow();
  var settings = {
    blocks: DEFAULT_BLOCKS_GAS,
    roles: DEFAULT_ROLES_GAS,
    communityName: "緑が丘自治会",
    passcode: "roster2026",
    adminPasscode: "admin2026"
  };
  if (lastRow <= 1) return settings;

  var values = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
  for (var i = 0; i < values.length; i++) {
    var key = String(values[i][0] || '').trim();
    var val = values[i][1];
    if (!key) continue;

    if (key === 'blocks') {
      try {
        var parsedBlocks = JSON.parse(val);
        if (Array.isArray(parsedBlocks) && parsedBlocks.length > 0) {
          settings.blocks = parsedBlocks;
        }
      } catch (e) {}
    } else if (key === 'roles') {
      try {
        var parsedRoles = JSON.parse(val);
        if (Array.isArray(parsedRoles) && parsedRoles.length > 0) {
          var filteredRoles = parsedRoles.filter(function(r) { return r !== '班長'; });
          if (filteredRoles.indexOf('ブロック長') === -1) {
            var fukuIdx = filteredRoles.indexOf('副会長');
            if (fukuIdx !== -1) {
              filteredRoles.splice(fukuIdx + 1, 0, 'ブロック長');
            } else {
              filteredRoles.push('ブロック長');
            }
          }
          settings.roles = filteredRoles;
        }
      } catch (e) {}
    } else if (key === 'communityName') {
      if (val) settings.communityName = String(val).trim();
    } else if (key === 'passcode') {
      settings.passcode = val !== undefined ? String(val).trim() : '';
    } else if (key === 'adminPasscode') {
      settings.adminPasscode = val !== undefined ? String(val).trim() : '';
    }
  }
  return settings;
}

/**
 * 合言葉（パスコード）の認証検証
 * @param {string} inputCode - 入力されたパスコード
 * @param {string} requiredRole - 要求される権限 ('officer' または 'admin')
 * @returns {object} { ok: boolean, role: string, error?: string, authError?: boolean }
 */
function verifyPasscode(inputCode, requiredRole) {
  var settings = fetchSettings(true);
  var officerPass = String(settings.passcode || '').trim();
  var adminPass = String(settings.adminPasscode || '').trim();

  // スプレッドシート側でパスコードが全く設定されていない場合は認証スキップ（後方互換）
  if (!officerPass && !adminPass) {
    return { ok: true, role: 'admin' };
  }

  var code = String(inputCode || '').trim();
  if (!code) {
    return { ok: false, authError: true, error: '合言葉（パスコード）を入力してください' };
  }

  // 管理者パスコード一致
  if (adminPass && code === adminPass) {
    return { ok: true, role: 'admin' };
  }

  // 一般役員パスコード一致（または管理者パスコード未設定時の一般パスコード）
  if (officerPass && code === officerPass) {
    if (requiredRole === 'admin' && adminPass) {
      return { ok: false, authError: true, error: 'この操作には管理者権限（管理者パスコード）が必要です', requireAdmin: true };
    }
    return { ok: true, role: adminPass ? 'officer' : 'admin' };
  }

  return { ok: false, authError: true, error: '合言葉（パスコード）が正しくありません' };
}

/**
 * システム設定を更新保存
 */
function saveSettings(newSettings) {
  if (!newSettings) return { success: false, error: '設定データが空です' };
  var sheet = getSettingsSheet();
  var lastRow = sheet.getLastRow();
  var now = Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyy-MM-dd HH:mm:ss");

  var keyRowMap = {};
  if (lastRow > 1) {
    var keys = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (var i = 0; i < keys.length; i++) {
      var k = String(keys[i][0] || '').trim();
      if (k) keyRowMap[k] = i + 2;
    }
  }

  var filteredRoles = newSettings.roles ? newSettings.roles.filter(function(r) { return r !== '班長'; }) : null;

  var items = [
    { key: 'blocks', val: newSettings.blocks ? JSON.stringify(newSettings.blocks) : null, desc: 'ブロック・班の編成設定' },
    { key: 'roles', val: filteredRoles ? JSON.stringify(filteredRoles) : null, desc: '役員のマスタ設定' },
    { key: 'communityName', val: newSettings.communityName ? String(newSettings.communityName).trim() : null, desc: '自治会・町内会名' },
    { key: 'passcode', val: newSettings.passcode !== undefined ? String(newSettings.passcode).trim() : null, desc: '役員用合言葉（閲覧・帳票印刷・集金用）' },
    { key: 'adminPasscode', val: newSettings.adminPasscode !== undefined ? String(newSettings.adminPasscode).trim() : null, desc: '管理者用合言葉（名簿編集・設定用）' }
  ];

  items.forEach(function(item) {
    if (item.val !== null) {
      if (keyRowMap[item.key]) {
        sheet.getRange(keyRowMap[item.key], 2).setValue(item.val);
        sheet.getRange(keyRowMap[item.key], 4).setValue(now);
      } else {
        sheet.appendRow([item.key, item.val, item.desc, now]);
      }
    }
  });

  return { success: true, settings: fetchSettings(true) };
}

/**
 * GETリクエストハンドラ（名簿データおよびフォーム申請データの読み込み）
 */
function doGet(e) {
  try {
    var params = (e && e.parameter) ? e.parameter : {};
    var action = params.action || 'read';
    
    // ヘルスチェック＆基本設定読み込み（認証不要・合言葉は除外）
    if (action === 'ping' || action === 'getPublicSettings') {
      var s = fetchSettings();
      return jsonResponse({
        success: true,
        message: '自治会名簿API 稼働中',
        timestamp: new Date().toISOString(),
        settings: {
          communityName: s.communityName || '緑が丘自治会',
          blocks: s.blocks || DEFAULT_BLOCKS_GAS,
          roles: s.roles || DEFAULT_ROLES_GAS
        }
      });
    }

    // 合言葉（パスコード）の検証
    var inputPasscode = params.passcode || '';
    var auth = verifyPasscode(inputPasscode, 'officer');

    // パスコード検証API
    if (action === 'verifyAuth') {
      return jsonResponse({
        success: auth.ok,
        role: auth.role,
        authError: auth.authError,
        error: auth.error
      });
    }

    // 認証失敗時はデータを一切返さず拒絶
    if (!auth.ok) {
      return jsonResponse({
        success: false,
        authError: true,
        error: auth.error || '合言葉（パスコード）が正しくありません'
      });
    }
    
    if (action === 'read' || action === 'getAll') {
      return jsonResponse(fetchAllData(auth.role));
    } else if (action === 'getMembers') {
      return jsonResponse({ success: true, members: fetchMembers(), authRole: auth.role });
    } else if (action === 'getApplications') {
      return jsonResponse({ success: true, applications: fetchApplications(), authRole: auth.role });
    } else if (action === 'getSettings') {
      var s = fetchSettings();
      if (auth.role !== 'admin') {
        delete s.passcode;
        delete s.adminPasscode;
      }
      return jsonResponse({ success: true, settings: s, authRole: auth.role });
    }
    
    return jsonResponse({ success: false, error: '不明なGETアクションです: ' + action });
  } catch (err) {
    return jsonResponse({ success: false, error: err.toString() });
  }
}

/**
 * POSTリクエストハンドラ（会員登録・更新・削除・会費ステータス更新・入会承認・設定更新）
 */
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonResponse({ success: false, error: 'リクエストデータが空です' });
    }
    
    var payload = JSON.parse(e.postData.contents);
    var action = payload.action;

    // パスコード認証チェック（会費更新のみ一般役員でも許可、それ以外は管理者権限が必要）
    var requiredRole = (action === 'updateFeeStatus') ? 'officer' : 'admin';
    var auth = verifyPasscode(payload.passcode, requiredRole);

    if (!auth.ok) {
      return jsonResponse({
        success: false,
        authError: true,
        requireAdmin: auth.requireAdmin,
        error: auth.error || '権限エラー: 合言葉（パスコード）が無効です'
      });
    }
    
    if (action === 'createMember' || action === 'add') {
      return jsonResponse(createMember(payload.member));
    } else if (action === 'updateMember' || action === 'update') {
      return jsonResponse(updateMember(payload.member));
    } else if (action === 'deleteMember' || action === 'delete') {
      return jsonResponse(deleteMember(payload.id, payload.hardDelete));
    } else if (action === 'updateFeeStatus') {
      return jsonResponse(updateFeeStatus(payload.id, payload.status));
    } else if (action === 'approveApplication') {
      return jsonResponse(approveApplication(payload));
    } else if (action === 'rejectApplication') {
      return jsonResponse(rejectApplication(payload.appId, payload.reason));
    } else if (action === 'batchUpdate') {
      return jsonResponse(batchUpdateMembers(payload.members));
    } else if (action === 'updateSettings' || action === 'saveSettings') {
      return jsonResponse(saveSettings(payload.settings));
    }
    
    return jsonResponse({ success: false, error: '不明なPOSTアクションです: ' + action });
  } catch (err) {
    return jsonResponse({ success: false, error: err.toString() });
  }
}

/**
 * 全データ取得（名簿＋入会申請＋システム設定）
 */
function fetchAllData(role) {
  var members = fetchMembers();
  var applications = fetchApplications();
  var settings = fetchSettings();
  if (role !== 'admin') {
    delete settings.passcode;
    delete settings.adminPasscode;
  }
  return {
    success: true,
    members: members,
    applications: applications,
    settings: settings,
    authRole: role,
    timestamp: new Date().toISOString()
  };
}

/**
 * 会員一覧取得
 */
function fetchMembers() {
  var sheet = getMasterSheet();
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];
  
  var lastCol = sheet.getLastColumn();
  var range = sheet.getRange(2, 1, lastRow - 1, lastCol);
  var values = range.getValues();
  var displayValues = range.getDisplayValues();
  var hMap = getHeaderMap(sheet);
  var members = [];
  
  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    var dispRow = displayValues[i];
    var id = (hMap["会員ID"] !== undefined ? String(row[hMap["会員ID"]] || '') : String(row[0] || '')).trim();
    if (!id) continue;

    function getVal(key, def) {
      if (hMap[key] !== undefined && row[hMap[key]] !== undefined) {
        return row[hMap[key]];
      }
      return def;
    }

    function getDispVal(key, def) {
      if (hMap[key] !== undefined && dispRow[hMap[key]] !== undefined) {
        return dispRow[hMap[key]];
      }
      return def;
    }

    var rawOfficer = String(getVal("役員", '') || getVal("役職", ''));
    var rawBanLeader = String(getVal("班長", ''));

    var finalOfficer = rawOfficer;
    var finalBanLeader = rawBanLeader;

    // マイグレーション: 旧データで役員（役職）に「班長」が入っていた場合
    if (!rawBanLeader && rawOfficer === '班長') {
      finalBanLeader = '班長';
      finalOfficer = '一般会員';
    } else {
      finalBanLeader = rawBanLeader === '班長' ? '班長' : 'なし';
    }
    if (!finalOfficer) finalOfficer = '一般会員';

    // 電話番号の取得: スプレッドシートのセルの見た目文字列（getDisplayValues）を優先
    var rawPhone = getDispVal("電話番号", '') || getVal("電話番号", '');
    var rawPhone2 = getDispVal("電話番号2", '') || getVal("電話番号2", '');

    members.push({
      id: id,
      ban: String(getVal("班", '')),
      name: String(getVal("氏名", '')),
      kana: String(getVal("フリガナ", '')),
      phone: formatPhone(rawPhone),
      phone2: formatPhone(rawPhone2),
      email: String(getVal("メールアドレス", '')),
      address: String(getVal("住所", '')),
      household_count: Number(getVal("世帯人数", 1)) || 1,
      family_members: String(getVal("同居家族", '')),
      role: finalOfficer,
      ban_leader: finalBanLeader,
      fee_status: String(getVal("会費状況", '未納')),
      circulation: String(getVal("回覧方法", '紙')),
      support_needed: String(getVal("要支援・見守り", 'なし')),
      join_date: formatDateOnly(getVal("加入日", '')),
      status: String(getVal("会員状態", '現役')),
      notes: String(getVal("備考", '')),
      updated_at: formatDateValue(getVal("更新日時", ''))
    });
  }
  return members;
}

/**
 * 入会申請一覧取得（Googleフォームの可変ヘッダー・項目順に対応）
 */
function fetchApplications() {
  var sheet = getFormSheet();
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow <= 1 || lastCol <= 0) return [];
  
  var hMap = getHeaderMap(sheet);
  var values = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  var dispValues = sheet.getRange(2, 1, lastRow - 1, lastCol).getDisplayValues();
  var applications = [];

  // ヘッダー名から柔軟に列インデックス（0-based）を逆引きするヘルパー
  function findColIndex(candidates) {
    for (var k in hMap) {
      var normK = k.replace(/[\s\(\)（）]/g, '');
      for (var c = 0; c < candidates.length; c++) {
        var cand = candidates[c].replace(/[\s\(\)（）]/g, '');
        if (normK.indexOf(cand) !== -1) {
          return hMap[k];
        }
      }
    }
    return undefined;
  }

  var cTimestamp = findColIndex(['タイムスタンプ', '日時']);
  var cAppId = findColIndex(['申請ID']);
  var cEmail = findColIndex(['メールアドレス', 'メール']);
  var cName = findColIndex(['氏名']);
  var cKana = findColIndex(['フリガナ', 'ふりがな']);
  var cAddress = findColIndex(['住所']);
  var cPhone = findColIndex(['電話番号']);
  var cYear = findColIndex(['入会希望年', '希望年']);
  var cMonth = findColIndex(['入会希望月', '希望月']);
  var cCircPhone = findColIndex(['回覧板への電話番号の掲載', '電話番号の掲載', '掲載可']);
  var cCircMethod = findColIndex(['回覧板の受け取り方法', '受け取り方法', 'LINE']);
  var cPreferredBan = findColIndex(['希望班', '近隣情報']);
  var cHousehold = findColIndex(['世帯人数']);
  var cFamily = findColIndex(['家族構成', '同居家族']);
  var cStatus = findColIndex(['ステータス', '状態']);
  var cProcessedAt = findColIndex(['処理日時']);
  var cNotes = findColIndex(['備考']);

  // デフォルト位置のフォールバック（旧固定フォーマット互換）
  if (cTimestamp === undefined && lastCol >= 1) cTimestamp = 0;
  if (cAppId === undefined && lastCol >= 2 && String(sheet.getRange(1, 2).getValue()).trim() === '申請ID') cAppId = 1;

  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    var dispRow = dispValues[i];

    function getV(idx) {
      return (idx !== undefined && row[idx] !== undefined) ? row[idx] : '';
    }
    function getDV(idx) {
      return (idx !== undefined && dispRow[idx] !== undefined) ? dispRow[idx] : '';
    }

    var timestampVal = getV(cTimestamp);
    var rawAppId = String(getV(cAppId) || '').trim();
    var nameVal = String(getV(cName) || '').trim();

    // タイムスタンプも氏名も空行ならスキップ
    if (!timestampVal && !rawAppId && !nameVal) continue;

    var appId = rawAppId || ('FORM-' + (i + 1));
    var phoneVal = formatPhone(getDV(cPhone) || getV(cPhone));

    // 入会希望（年）・入会希望（月）の結合ロジック
    // 例: 2026 または 2026年、4 または 4月
    var rawYear = String(getV(cYear) || '').trim();
    var rawMonth = String(getV(cMonth) || '').trim();
    var joinHopeStr = '';

    if (rawYear) {
      var yDigits = rawYear.replace(/[^0-9]/g, '');
      var yStr = yDigits ? (yDigits + '年') : rawYear;
      joinHopeStr = yStr;
    }
    if (rawMonth) {
      var mDigits = rawMonth.replace(/[^0-9]/g, '');
      var mStr = mDigits ? (mDigits + '月') : rawMonth;
      joinHopeStr = joinHopeStr ? (joinHopeStr + mStr) : mStr;
    }
    if (joinHopeStr) {
      joinHopeStr += '入会希望';
    }

    // 回覧板への電話番号掲載（1.掲載可、2.掲載不可）
    var rawCircPhone = String(getV(cCircPhone) || '').trim();
    var phonePublish = '掲載可';
    if (rawCircPhone.indexOf('不可') !== -1 || rawCircPhone.indexOf('2') !== -1) {
      phonePublish = '掲載不可';
    }

    // 回覧板受け取り方法（LINE / 紙）
    var rawCircMethod = String(getV(cCircMethod) || '').trim();
    var circMethod = '紙';
    if (rawCircMethod.indexOf('LINE') !== -1 || rawCircMethod.indexOf('ライン') !== -1 || rawCircMethod.indexOf('1') !== -1) {
      circMethod = 'LINE';
    }

    // 備考欄の自動統合
    var noteParts = [];
    if (joinHopeStr) noteParts.push(joinHopeStr);
    if (phonePublish === '掲載不可') noteParts.push('回覧板への電話番号掲載: 不可');
    var rawNotes = String(getV(cNotes) || '').trim();
    if (rawNotes) noteParts.push(rawNotes);

    var finalNotes = noteParts.join(' / ');

    var statusVal = String(getV(cStatus) || '未処理').trim();
    if (!statusVal) statusVal = '未処理';

    applications.push({
      rowIndex: i + 2,
      timestamp: formatDateValue(timestampVal),
      id: appId,
      name: nameVal,
      kana: String(getV(cKana) || ''),
      phone: phoneVal,
      email: String(getV(cEmail) || ''),
      address: String(getV(cAddress) || ''),
      preferred_ban: String(getV(cPreferredBan) || ''),
      household_count: Number(getV(cHousehold)) || 1,
      family_members: String(getV(cFamily) || ''),
      status: statusVal,
      processed_at: formatDateValue(getV(cProcessedAt)),
      notes: finalNotes,
      join_hope: joinHopeStr,
      phone_publish: phonePublish,
      circulation: circMethod
    });
  }
  return applications;
}

/**
 * 新規会員登録
 */
function createMember(m) {
  if (!m || !m.name) {
    return { success: false, error: '氏名は必須です' };
  }
  
  var sheet = getMasterSheet();
  var id = m.id || generateNewMemberId(sheet);
  var now = Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyy-MM-dd HH:mm:ss");
  var hMap = getHeaderMap(sheet);
  var lastCol = Math.max(sheet.getLastColumn(), MASTER_HEADERS.length);

  var rowData = new Array(lastCol);
  for (var c = 0; c < lastCol; c++) rowData[c] = '';

  function setVal(key, val, fallbackCol) {
    if (hMap[key] !== undefined) {
      rowData[hMap[key]] = val;
    } else if (fallbackCol !== undefined && fallbackCol < rowData.length) {
      rowData[fallbackCol] = val;
    }
  }

  setVal("会員ID", id, 0);
  setVal("班", m.ban || '', 1);
  setVal("氏名", m.name, 2);
  setVal("フリガナ", m.kana || '', 3);
  setVal("電話番号", formatPhone(m.phone || ''), 4);
  setVal("電話番号2", formatPhone(m.phone2 || ''), 5);
  setVal("メールアドレス", m.email || '', 6);
  setVal("住所", m.address || '', 7);
  setVal("世帯人数", m.household_count || 1, 8);
  setVal("同居家族", m.family_members || '', 9);
  setVal("役員", m.role || '一般会員', 10);
  setVal("役職", m.role || '一般会員');
  setVal("班長", m.ban_leader === '班長' ? '班長' : 'なし', 11);
  setVal("会費状況", m.fee_status || '未納', 12);
  setVal("回覧方法", m.circulation || '紙', 13);
  setVal("要支援・見守り", m.support_needed || 'なし', 14);
  setVal("加入日", formatDateOnly(m.join_date) || Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyy-MM-dd"), 15);
  setVal("会員状態", m.status || '現役', 16);
  setVal("備考", m.notes || '', 17);
  setVal("更新日時", now, 18);

  sheet.appendRow(rowData);
  m.id = id;
  m.updated_at = now;
  return { success: true, member: m, id: id };
}

/**
 * 会員情報更新
 */
function updateMember(m) {
  if (!m || !m.id) {
    return { success: false, error: '会員IDが見つかりません' };
  }
  
  var sheet = getMasterSheet();
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return { success: false, error: '名簿が空です' };
  
  var hMap = getHeaderMap(sheet);
  var idColIdx = (hMap["会員ID"] !== undefined ? hMap["会員ID"] : 0) + 1;
  var idColValues = sheet.getRange(2, idColIdx, lastRow - 1, 1).getValues();
  var targetRow = -1;
  
  for (var i = 0; i < idColValues.length; i++) {
    if (String(idColValues[i][0]).trim() === String(m.id).trim()) {
      targetRow = i + 2;
      break;
    }
  }
  
  if (targetRow === -1) {
    return { success: false, error: '該当する会員IDが見つかりません: ' + m.id };
  }
  
  var now = Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyy-MM-dd HH:mm:ss");
  var lastCol = Math.max(sheet.getLastColumn(), MASTER_HEADERS.length);
  var rowData = sheet.getRange(targetRow, 1, 1, lastCol).getValues()[0];

  function setVal(key, val, fallbackCol) {
    if (hMap[key] !== undefined) {
      rowData[hMap[key]] = val;
    } else if (fallbackCol !== undefined && fallbackCol < rowData.length) {
      rowData[fallbackCol] = val;
    }
  }

  setVal("会員ID", m.id, 0);
  setVal("班", m.ban || '', 1);
  setVal("氏名", m.name, 2);
  setVal("フリガナ", m.kana || '', 3);
  setVal("電話番号", formatPhone(m.phone || ''), 4);
  setVal("電話番号2", formatPhone(m.phone2 || ''), 5);
  setVal("メールアドレス", m.email || '', 6);
  setVal("住所", m.address || '', 7);
  setVal("世帯人数", m.household_count || 1, 8);
  setVal("同居家族", m.family_members || '', 9);
  setVal("役員", m.role || '一般会員', 10);
  setVal("役職", m.role || '一般会員');
  setVal("班長", m.ban_leader === '班長' ? '班長' : 'なし', 11);
  setVal("会費状況", m.fee_status || '未納', 12);
  setVal("回覧方法", m.circulation || '紙', 13);
  setVal("要支援・見守り", m.support_needed || 'なし', 14);
  setVal("加入日", formatDateOnly(m.join_date), 15);
  setVal("会員状態", m.status || '現役', 16);
  setVal("備考", m.notes || '', 17);
  setVal("更新日時", now, 18);

  sheet.getRange(targetRow, 1, 1, lastCol).setValues([rowData]);
  m.updated_at = now;
  return { success: true, member: m };
}

/**
 * 会費ステータス更新（高速更新用）
 */
function updateFeeStatus(id, newStatus) {
  var sheet = getMasterSheet();
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return { success: false, error: '名簿が空です' };

  var hMap = getHeaderMap(sheet);
  var idColIdx = (hMap["会員ID"] !== undefined ? hMap["会員ID"] : 0) + 1;
  var feeColIdx = (hMap["会費状況"] !== undefined ? hMap["会費状況"] : 10) + 1;
  var updatedColIdx = (hMap["更新日時"] !== undefined ? hMap["更新日時"] : sheet.getLastColumn() - 1) + 1;

  var idColValues = sheet.getRange(2, idColIdx, lastRow - 1, 1).getValues();
  var targetRow = -1;
  
  for (var i = 0; i < idColValues.length; i++) {
    if (String(idColValues[i][0]).trim() === String(id).trim()) {
      targetRow = i + 2;
      break;
    }
  }
  
  if (targetRow === -1) return { success: false, error: '会員IDが見つかりません' };
  
  var now = Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyy-MM-dd HH:mm:ss");
  sheet.getRange(targetRow, feeColIdx).setValue(newStatus);
  sheet.getRange(targetRow, updatedColIdx).setValue(now);
  return { success: true, id: id, fee_status: newStatus, updated_at: now };
}

/**
 * 会員削除（通常は「転出退会」ステータスへの変更、hardDelete時は行削除）
 */
function deleteMember(id, hardDelete) {
  var sheet = getMasterSheet();
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return { success: false, error: '名簿が空です' };

  var hMap = getHeaderMap(sheet);
  var idColIdx = (hMap["会員ID"] !== undefined ? hMap["会員ID"] : 0) + 1;
  var statusColIdx = (hMap["会員状態"] !== undefined ? hMap["会員状態"] : 14) + 1;
  var updatedColIdx = (hMap["更新日時"] !== undefined ? hMap["更新日時"] : sheet.getLastColumn() - 1) + 1;

  var idColValues = sheet.getRange(2, idColIdx, lastRow - 1, 1).getValues();
  var targetRow = -1;
  
  for (var i = 0; i < idColValues.length; i++) {
    if (String(idColValues[i][0]).trim() === String(id).trim()) {
      targetRow = i + 2;
      break;
    }
  }
  
  if (targetRow === -1) return { success: false, error: '会員が見つかりません' };
  
  if (hardDelete) {
    sheet.deleteRow(targetRow);
    return { success: true, deleted: true, hard: true };
  } else {
    var now = Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyy-MM-dd HH:mm:ss");
    sheet.getRange(targetRow, statusColIdx).setValue('転出退会');
    sheet.getRange(targetRow, updatedColIdx).setValue(now);
    return { success: true, deleted: true, status: '転出退会' };
  }
}

/**
 * 入会申請の承認＆名簿登録
 */
function approveApplication(payload) {
  var appId = payload.appId;
  var memberData = payload.member;
  
  // 1. 申請シートのステータスを「承認済」に更新
  var formSheet = getFormSheet();
  var lastRow = formSheet.getLastRow();
  var lastCol = formSheet.getLastColumn();
  var found = false;
  var now = Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyy-MM-dd HH:mm:ss");
  
  if (lastRow > 1 && lastCol > 0) {
    var hMap = getHeaderMap(formSheet);
    
    // ステータス列と処理日時列の列インデックスを探す（なければ末尾に自動追加）
    var statusCol = -1;
    var processedCol = -1;
    for (var k in hMap) {
      if (k.indexOf('ステータス') !== -1 || k.indexOf('状態') !== -1) statusCol = hMap[k] + 1;
      if (k.indexOf('処理日時') !== -1) processedCol = hMap[k] + 1;
    }

    if (statusCol === -1) {
      lastCol++;
      formSheet.getRange(1, lastCol).setValue('ステータス').setFontWeight('bold').setBackground('#059669').setFontColor('#ffffff');
      statusCol = lastCol;
    }
    if (processedCol === -1) {
      lastCol++;
      formSheet.getRange(1, lastCol).setValue('処理日時').setFontWeight('bold').setBackground('#059669').setFontColor('#ffffff');
      processedCol = lastCol;
    }

    // 申請ID列を探す（なければ行番号 FORM-X または氏名等で判定）
    var idCol = -1;
    for (var k in hMap) {
      if (k.indexOf('申請ID') !== -1) idCol = hMap[k] + 1;
    }

    // 全行走査
    var rowCount = lastRow - 1;
    var allRows = formSheet.getRange(2, 1, rowCount, Math.max(statusCol, processedCol, idCol, 3)).getValues();

    for (var i = 0; i < rowCount; i++) {
      var rowAppId = idCol > 0 ? String(allRows[i][idCol - 1] || '').trim() : '';
      var fallbackId = 'FORM-' + (i + 1);

      if ((rowAppId && rowAppId === appId) || fallbackId === appId) {
        formSheet.getRange(i + 2, statusCol).setValue('承認済');
        formSheet.getRange(i + 2, processedCol).setValue(now);
        found = true;
        break;
      }
    }
  }
  
  // 2. 会員名簿に本登録
  var res = createMember(memberData);
  return {
    success: res.success,
    member: res.member,
    appId: appId,
    appUpdated: found
  };
}

/**
 * 入会申請の却下
 */
function rejectApplication(appId, reason) {
  var formSheet = getFormSheet();
  var lastRow = formSheet.getLastRow();
  var lastCol = formSheet.getLastColumn();
  if (lastRow <= 1 || lastCol <= 0) return { success: false, error: '申請データがありません' };
  
  var now = Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyy-MM-dd HH:mm:ss");
  var hMap = getHeaderMap(formSheet);
  
  var statusCol = -1;
  var processedCol = -1;
  var notesCol = -1;
  for (var k in hMap) {
    if (k.indexOf('ステータス') !== -1 || k.indexOf('状態') !== -1) statusCol = hMap[k] + 1;
    if (k.indexOf('処理日時') !== -1) processedCol = hMap[k] + 1;
    if (k.indexOf('備考') !== -1) notesCol = hMap[k] + 1;
  }

  if (statusCol === -1) {
    lastCol++;
    formSheet.getRange(1, lastCol).setValue('ステータス').setFontWeight('bold').setBackground('#059669').setFontColor('#ffffff');
    statusCol = lastCol;
  }
  if (processedCol === -1) {
    lastCol++;
    formSheet.getRange(1, lastCol).setValue('処理日時').setFontWeight('bold').setBackground('#059669').setFontColor('#ffffff');
    processedCol = lastCol;
  }

  var idCol = -1;
  for (var k in hMap) {
    if (k.indexOf('申請ID') !== -1) idCol = hMap[k] + 1;
  }

  var rowCount = lastRow - 1;
  var allRows = formSheet.getRange(2, 1, rowCount, Math.max(statusCol, processedCol, idCol, 3)).getValues();

  for (var i = 0; i < rowCount; i++) {
    var rowAppId = idCol > 0 ? String(allRows[i][idCol - 1] || '').trim() : '';
    var fallbackId = 'FORM-' + (i + 1);

    if ((rowAppId && rowAppId === appId) || fallbackId === appId) {
      formSheet.getRange(i + 2, statusCol).setValue('却下');
      formSheet.getRange(i + 2, processedCol).setValue(now);
      if (reason && notesCol > 0) {
        formSheet.getRange(i + 2, notesCol).setValue(reason);
      }
      return { success: true, appId: appId, status: '却下' };
    }
  }
  return { success: false, error: '申請IDが見つかりません' };
}

/**
 * 会員IDの自動採番 (MB-0001 形式)
 */
function generateNewMemberId(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return "MB-0001";
  
  var idValues = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  var maxNum = 0;
  
  for (var i = 0; i < idValues.length; i++) {
    var str = String(idValues[i][0] || '');
    var match = str.match(/^MB-(\d+)$/i);
    if (match) {
      var num = parseInt(match[1], 10);
      if (num > maxNum) maxNum = num;
    }
  }
  
  var nextNum = maxNum + 1;
  var padded = ("0000" + nextNum).slice(-4);
  return "MB-" + padded;
}

/**
 * 電話番号フォーマットヘルパー
 * スプレッドシート側で「03-1234-5678」などのハイフン付き電話番号が誤ってDate型（日時）に自動変換された場合や、
 * 数値（ハイフンなし市外局番落ち等）になった場合を検知・復元し、常に文字列として返却する
 */
function formatPhone(val) {
  if (val === undefined || val === null) return '';
  if (val instanceof Date) {
    // スプレッドシートがハイフン付き電話番号を日付として認識してしまった場合の復元
    // 例: "3-1234-5678" や "03-1234-5678" などが Date 型になっている場合
    var y = val.getFullYear();
    var m = val.getMonth() + 1;
    var d = val.getDate();
    // 日付として出力せず、元の電話番号入力に近づける（または ISO ではなくスプレッドシート上の表示文字列を取得）
    // 通常の電話番号が Date になった場合: yyyy/M/d などになる
    // ただし、03-1234 等の部分一致の場合もあるので、安全に処理
    return Utilities.formatDate(val, "Asia/Tokyo", "yyyy-MM-dd");
  }
  var str = String(val).trim();
  if (!str) return '';
  // 全角英数や全角ハイフンを半角に変換
  str = str.replace(/[！-～]/g, function(s) {
    return String.fromCharCode(s.charCodeAt(0) - 0xFEE0);
  }).replace(/　/g, ' ').replace(/[ー－―—]/g, '-');

  // もし "2024-03-12T..." や "2026-04-01" などのISO日付文字列の形式になってしまっている場合
  var isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/);
  if (isoMatch) {
    // 日付文字列としてパースされた疑いがある場合、ハイフン区切りの数字列としてそのまま保持するか確認
    // 通常の日本の電話番号は 090-xxxx-xxxx, 03-xxxx-xxxx, 045-xxx-xxxx 等
  }

  return str;
}

/**
 * 日付のみのフォーマットヘルパー (yyyy-MM-dd)
 * スプレッドシートの日時オブジェクトや様々な日付表記文字列を yyyy-MM-dd に正規化
 */
function formatDateOnly(val) {
  if (!val) return '';
  if (val instanceof Date) {
    return Utilities.formatDate(val, "Asia/Tokyo", "yyyy-MM-dd");
  }
  var str = String(val).trim();
  var m = str.match(/^(\d{4})[\/\-\.年](\d{1,2})[\/\-\.月](\d{1,2})/);
  if (m) {
    var y = m[1];
    var mo = ("0" + m[2]).slice(-2);
    var d = ("0" + m[3]).slice(-2);
    return y + "-" + mo + "-" + d;
  }
  return str;
}

/**
 * 日付・時刻フォーマットヘルパー
 */
function formatDateValue(val) {
  if (!val) return '';
  if (val instanceof Date) {
    return Utilities.formatDate(val, "Asia/Tokyo", "yyyy-MM-dd HH:mm:ss");
  }
  return String(val);
}

/**
 * JSONレスポンス出力
 */
function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
