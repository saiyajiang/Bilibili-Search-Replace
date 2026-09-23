// ==UserScript==
// @name         B站搜索替代器（自定义搜索面板）
// @namespace    https://github.com/saiyajiang
// @version      2.1.3
// @description  【编写说明】本脚本代码由 AI 辅助生成，作者已逐行审阅并在真实环境验证后发布；发现问题请在 GitHub 提 issue。｜【权限说明】本脚本会申请 Cookie 权限——仅用于在 B 站返回风控错误(-412/-352)时写入一个 buvid3 设备标识，不会读取、不会上传你的任何 Cookie（脚本无任何第三方服务器，全部请求直连 bilibili.com）。不需要可删除脚本第 25 行 @grant GM_cookie，其余功能不受影响。｜功能：接管 B 站顶部搜索：官方接口 + 相关性重排/严格过滤，支持时间范围、弹幕量、播放量、时长、分区筛选，筛选可保存为预设并设为默认，本地搜索历史，屏蔽词与UP主屏蔽，键盘流
// @description:en  [Authorship] This script's code was generated with AI assistance; the author reviewed it line by line and verified it in a real environment before publishing. Please report issues on GitHub. | [Permission notice] This script requests the Cookie permission for ONE purpose only: writing a buvid3 device-id cookie when Bilibili returns risk-control errors (-412/-352). It never reads or uploads any of your cookies — there is no third-party server, all requests go directly to bilibili.com. You may delete line 25 (@grant GM_cookie) to drop the permission; everything else keeps working. | Features: replaces Bilibili's native search: official API + relevance re-ranking / strict filtering, with time range, danmaku count, play count, duration and category filters. Filters can be saved as presets. Local search history, word/UP blocking, full keyboard flow.
// @author       saiyajiang
// @license      MIT
// @homepageURL  https://github.com/saiyajiang/Bilibili-Search-Replace
// @supportURL   https://github.com/saiyajiang/Bilibili-Search-Replace/issues
// @match        https://www.bilibili.com/*
// @match        https://bilibili.com/*
// @match        https://search.bilibili.com/*
// @match        https://m.bilibili.com/*
// @match        https://live.bilibili.com/*
// @match        https://space.bilibili.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_registerMenuCommand
// @grant        GM_cookie
// @note         编写说明：本脚本代码由 AI 辅助生成，非作者逐字手写。
// @note         作者已通读全部代码、在真实浏览器环境验证核心功能后发布，
// @note         但 AI 生成的代码仍可能存在未覆盖到的边界情况，使用前请自行判断，
// @note         遇到问题欢迎在 GitHub 提 issue（见 @supportURL）。
// @note         Cookie 权限说明（可自行核对）：
// @note           代码中 GM_cookie.set( 只出现 1 次，且仅在 B 站返回风控错误(-412/-352)时执行，
// @note           写入的是名为 buvid3 的设备标识（值取自 B 站官方指纹接口 /x/frontend/finger/spi）。
// @note           代码中不存在 GM_cookie.list( / .get( / .delete(，因此无法读取你的登录态或其它任何 Cookie。
// @note         如不需要，删除上方 "@grant GM_cookie" 这一行即可彻底移除该权限，其余功能不受影响。
// @connect      api.bilibili.com
// @connect      s.search.bilibili.com
// @run-at       document-idle
// @noframes
// ==/UserScript==

(function () {
  'use strict';

  /* =======================================================================
   * 1. 配置
   * ===================================================================== */
  const CFG_KEY = 'bcs_cfg_v2';
  const DEFAULT_CFG = {
    hijackTopSearch: true,    // 接管顶部搜索框
    killDropdown: true,       // 屏蔽原生下拉（历史/大家都在搜/猜你想搜）
    hotkey: true,             // Alt + K 唤出
    suggest: true,            // 搜索建议
    openInNewTab: false,      // 结果新标签打开
    showEntry: false,         // 右下角常驻入口
    defaultType: 'video',
    defaultOrder: 'relevance',// relevance = 相关度优先（本地重排）
    pageSize: 30,
    strict: true,             // 严格过滤：标题完全没命中关键词的结果直接剔除
    theme: 'auto',            // auto / light / dark
    fallback: 'bilibili',
    saveHistory: true,        // 本地保存搜索历史
    blockWords: [],           // 全局屏蔽词
    blockUps: []              // 屏蔽的 UP 主 mid 列表
  };

  let cfg = Object.assign({}, DEFAULT_CFG);
  try {
    const saved = GM_getValue(CFG_KEY, null);
    if (saved) cfg = Object.assign({}, DEFAULT_CFG, JSON.parse(saved));
  } catch (e) { }
  function saveCfg() { try { GM_setValue(CFG_KEY, JSON.stringify(cfg)); } catch (e) { } }

  const HIST_KEY = 'bcs_history_v2';
  let history = [];
  try { history = JSON.parse(GM_getValue(HIST_KEY, '[]')) || []; } catch (e) { history = []; }
  function pushHistory(kw) {
    if (!cfg.saveHistory || !kw) return;
    history = [kw].concat(history.filter(x => x !== kw)).slice(0, 40);
    try { GM_setValue(HIST_KEY, JSON.stringify(history)); } catch (e) { }
  }

  /* =======================================================================
   * 2b. 筛选预设
   * ===================================================================== */
  const PRESET_KEY = 'bcs_presets_v2';
  let presets = [];
  try { presets = JSON.parse(GM_getValue(PRESET_KEY, '[]')) || []; } catch (e) { presets = []; }
  function savePresets() { try { GM_setValue(PRESET_KEY, JSON.stringify(presets)); } catch (e) { } }

  function emptyFilters() {
    return {
      duration: 0, tid: 0, timeKey: 'all', timeBegin: 0, timeEnd: 0,
      minDm: 0, minPlay: 0, minFans: 0, minOnline: 0
    };
  }
  // 规范化，用于判断「当前筛选是否等于某个预设」
  function canon(o) {
    const f = o.filters || {};
    return JSON.stringify({
      type: o.type || 'video', order: o.order || 'relevance',
      strict: !!o.strict,
      filters: {
        duration: f.duration || 0, tid: f.tid || 0, timeKey: f.timeKey || 'all',
        timeBegin: f.timeBegin || 0, timeEnd: f.timeEnd || 0,
        minDm: f.minDm || 0, minPlay: f.minPlay || 0,
        minFans: f.minFans || 0, minOnline: f.minOnline || 0
      }
    });
  }
  function snapshot() {
    return { type: state.type, order: state.order, strict: cfg.strict, filters: Object.assign(emptyFilters(), state.filters) };
  }
  function defaultPreset(type) {
    return presets.filter(p => p.def && (p.type || 'video') === type)[0] || null;
  }
  function applyPreset(p, rerun) {
    if (!p) return;
    state.type = p.type || state.type;
    state.order = p.order || state.order;
    if (typeof p.strict === 'boolean') { cfg.strict = p.strict; saveCfg(); }
    state.filters = Object.assign(emptyFilters(), JSON.parse(JSON.stringify(p.filters || {})));
    [].forEach.call(tabsEl.children, x => x.classList.toggle('on', x.dataset.type === state.type));
    orderSel.value = state.order;
    orderSel.hidden = state.type !== 'video';
    strictBtn.classList.toggle('on', cfg.strict);
    buildFilterBar();
    syncPresetSelect();
    if (rerun && state.kw) { clearList(); runSearch(); }
  }
  function saveCurrentAsPreset(name) {
    name = String(name || '').trim();
    if (!name) return null;
    const p = Object.assign({ id: 'p' + Date.now().toString(36), name: name, def: false }, snapshot());
    presets.push(p);
    savePresets();
    return p;
  }

  /* =======================================================================
   * 2. 基础工具
   * ===================================================================== */
  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function stripTags(s) {
    return String(s == null ? '' : s).replace(/<[^>]*>/g, '');
  }
  function unescapeEntities(s) {
    return String(s).replace(/&quot;/g, '"').replace(/&#39;/g, "'")
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  }
  function plain(s) { return unescapeEntities(stripTags(s)); }
  /* B 站标题里带 <em class="keyword">xxx</em>。
   * 必须「先按标签切分、再逐段转义」：如果先整体 escapeHtml，引号会变成 &quot;，
   * 后面基于转义结果写的正则就匹配不上，标签会以纯文本形式显示出来（v2.0 的 bug）。
   * 这里用宽松正则，即使官方改了 class 名也能正常高亮。 */
  function highlight(s) {
    const parts = String(s == null ? '' : s).split(/<em[^>]*>([\s\S]*?)<\/em>/gi);
    let out = '';
    for (let i = 0; i < parts.length; i++) {
      if (i % 2 === 0) out += escapeHtml(parts[i]);
      else out += '<mark>' + escapeHtml(parts[i]) + '</mark>';
    }
    return out;
  }
  function fmtNum(n) {
    n = Number(n);
    if (!isFinite(n)) return '-';
    if (n >= 1e8) return (n / 1e8).toFixed(1).replace(/\.0$/, '') + '亿';
    if (n >= 1e4) return (n / 1e4).toFixed(1).replace(/\.0$/, '') + '万';
    return String(n);
  }
  function fmtDate(ts) {
    if (!ts) return '';
    const d = new Date(Number(ts) * 1000);
    if (isNaN(d.getTime())) return '';
    const p = x => String(x).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }
  function parseDur(s) {
    if (!s) return 0;
    const m = String(s).match(/^(\d+):(\d{1,2})$/);
    if (m) return (+m[1]) * 60 + (+m[2]);
    return parseInt(s, 10) || 0;
  }
  function fixUrl(u) {
    if (!u) return '';
    u = String(u);
    if (u.startsWith('//')) return 'https:' + u;
    return u.replace(/^http:/, 'https:');
  }

  /* --- MD5（WBI 签名用，独立实现不依赖 CDN） --- */
  function md5(msg) {
    const data = new TextEncoder().encode(String(msg));
    const bitLen = data.length * 8;
    const blocks = Math.ceil((data.length + 9) / 64);
    const total = blocks * 64;
    const buf = new Uint8Array(total);
    buf.set(data);
    buf[data.length] = 0x80;
    const dv = new DataView(buf.buffer);
    dv.setUint32(total - 8, bitLen >>> 0, true);
    dv.setUint32(total - 4, Math.floor(bitLen / 4294967296), true);

    let h0 = 0x67452301, h1 = 0xefcdab89, h2 = 0x98badcfe, h3 = 0x10325476;
    const S = [7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
               5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
               4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
               6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21];
    const K = new Uint32Array(64);
    for (let i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) >>> 0;
    const M = new Uint32Array(16);

    for (let b = 0; b < blocks; b++) {
      for (let i = 0; i < 16; i++) M[i] = dv.getUint32(b * 64 + i * 4, true);
      let a = h0, bb = h1, c = h2, d = h3;
      for (let i = 0; i < 64; i++) {
        let f, g;
        if (i < 16) { f = (bb & c) | (~bb & d); g = i; }
        else if (i < 32) { f = (d & bb) | (~d & c); g = (5 * i + 1) % 16; }
        else if (i < 48) { f = bb ^ c ^ d; g = (3 * i + 5) % 16; }
        else { f = c ^ (bb | ~d); g = (7 * i) % 16; }
        f = (f + a + K[i] + M[g]) >>> 0;
        a = d; d = c; c = bb;
        bb = (bb + ((f << S[i]) | (f >>> (32 - S[i])))) >>> 0;
      }
      h0 = (h0 + a) >>> 0; h1 = (h1 + bb) >>> 0;
      h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
    }
    const hex = n => {
      let s = '';
      for (let i = 0; i < 4; i++) s += ('0' + ((n >>> (i * 8)) & 0xff).toString(16)).slice(-2);
      return s;
    };
    return hex(h0) + hex(h1) + hex(h2) + hex(h3);
  }

  /* =======================================================================
   * 3. WBI 签名
   * ===================================================================== */
  const MIXIN_TAB = [46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43,
    5, 49, 33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40, 61,
    26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52];

  function getMixinKey(orig) { return MIXIN_TAB.map(n => orig[n]).join('').slice(0, 32); }

  function encWbi(params, imgKey, subKey) {
    const mixinKey = getMixinKey(imgKey + subKey);
    const p = Object.assign({}, params, { wts: Math.round(Date.now() / 1000) });
    const keys = Object.keys(p).sort();
    let query = '';
    keys.forEach(k => {
      const v = String(p[k]).replace(/[!'()*]/g, '');
      query += (query ? '&' : '') + encodeURIComponent(k) + '=' + encodeURIComponent(v);
    });
    return query + '&w_rid=' + md5(query + mixinKey);
  }

  const WBI_CACHE_KEY = 'bcs_wbi_cache_v1';
  async function getWbiKeys(force) {
    const cached = GM_getValue(WBI_CACHE_KEY, null);
    if (!force && cached && cached.img && cached.sub && Date.now() - cached.ts < 30 * 60 * 1000) {
      return { img: cached.img, sub: cached.sub };
    }
    const json = await apiGet('https://api.bilibili.com/x/web-interface/nav');
    const w = json && json.data && json.data.wbi_img;
    if (!w || !w.img_url || !w.sub_url) throw new Error('无法获取 WBI 密钥（需登录或接口异常）');
    const keys = {
      img: w.img_url.split('/').pop().split('.')[0],
      sub: w.sub_url.split('/').pop().split('.')[0],
      ts: Date.now()
    };
    GM_setValue(WBI_CACHE_KEY, keys);
    return keys;
  }

  /* =======================================================================
   * 4. 网络层
   * ===================================================================== */
  function gmFetch(url, opt) {
    opt = opt || {};
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: opt.method || 'GET',
        url: url,
        headers: Object.assign({
          'Referer': 'https://www.bilibili.com/',
          'Origin': 'https://www.bilibili.com',
          'Accept': 'application/json, text/plain, */*'
        }, opt.headers || {}),
        timeout: 15000,
        onload(r) {
          try { resolve(JSON.parse(r.responseText)); }
          catch (e) { reject(new Error('响应解析失败（HTTP ' + r.status + '）')); }
        },
        onerror: () => reject(new Error('网络请求失败')),
        ontimeout: () => reject(new Error('请求超时'))
      });
    });
  }

  /* ------------------------------------------------------------------
   * Cookie 权限的唯一用途
   *
   * 触发条件：仅当 B 站接口返回风控错误码 -412「请求被拦截」或 -352「风险等级不足」时。
   * 做了什么：调用 B 站官方指纹接口 /x/frontend/finger/spi 取一个设备标识 b_3，
   *           然后写入名为 buvid3 的 Cookie（域名 .bilibili.com，有效期 1 年）。
   *           这等价于 B 站自己在新设备上首次访问时做的事，用于让后续搜索请求通过校验。
   *
   * 安全边界（可自行核对）：
   *   - 只写不读：代码中 GM_cookie.set( 只此一处，不存在 GM_cookie.list / get / delete
   *     （可搜索验证），因此脚本无法读取你的登录态或任何其它 Cookie。
   *   - 不外传：写入的值直接来自 bilibili.com 自己返回的接口，脚本不拼接、不记录、不发送。
   *   - 不常驻：只在真正触发风控时执行一次（buvidFixed 标记，整个页面生命周期最多一次）。
   *
   * 不需要该权限：删掉脚本头部 "// @grant GM_cookie" 这一行即可。
   * 代码已用 typeof GM_cookie === 'undefined' 做了保护，移除后其余功能完全正常，
   * 只是遇到 -412/-352 时无法自动恢复（此时会提示你手动访问一次 bilibili.com）。
   * ------------------------------------------------------------------ */
  let buvidFixed = false;
  async function ensureBuvid3() {
    if (buvidFixed || typeof GM_cookie === 'undefined') return;
    try {
      const spi = await gmFetch('https://api.bilibili.com/x/frontend/finger/spi');
      const b3 = spi && spi.data && spi.data.b_3;
      if (!b3) return;
      GM_cookie.set({
        url: 'https://www.bilibili.com', name: 'buvid3', value: b3,
        domain: '.bilibili.com', path: '/',
        expirationDate: Math.floor(Date.now() / 1000) + 3600 * 24 * 365
      }, () => { });
      buvidFixed = true;
    } catch (e) { }
  }

  async function apiGet(url, retry) {
    let json = await gmFetch(url);
    if (json && (json.code === -412 || json.code === -352) && !retry) {
      await ensureBuvid3();
      const again = await apiGet(url, true);
      if (again && (again.code === -412 || again.code === -352)) {
        const noCookie = typeof GM_cookie === 'undefined';
        throw new Error('B 站风控拦截（code ' + again.code + '）。' +
          (noCookie
            ? '当前脚本未申请 Cookie 权限，无法自动补种设备标识，请手动打开一次 www.bilibili.com 再重试。'
            : '自动补种设备标识后仍被拦截，请手动打开一次 www.bilibili.com（或重新登录）后再重试。'));
      }
      return again;
    }
    return json;
  }

  /* =======================================================================
   * 5. 常量表
   * ===================================================================== */
  const TYPES = [
    { key: 'video', label: '视频', filterable: true },
    { key: 'bili_user', label: 'UP主', filterable: false },
    { key: 'live_room', label: '直播', filterable: false },
    { key: 'media_ft', label: '影视', filterable: false },
    { key: 'media_bangumi', label: '番剧', filterable: false }
  ];
  // 视频专属：relevance 为本地重排，其余交给服务端
  const ORDERS = [
    { key: 'relevance', label: '相关度（本地重排）' },
    { key: 'totalrank', label: '综合排序' },
    { key: 'click', label: '最多播放' },
    { key: 'pubdate', label: '最新发布' },
    { key: 'dm', label: '最多弹幕' },
    { key: 'stow', label: '最多收藏' }
  ];
  const DURATION_OPTS = [
    { v: 0, label: '时长不限' },
    { v: 1, label: '10分钟以下' },
    { v: 2, label: '10-30分钟' },
    { v: 3, label: '30-60分钟' },
    { v: 4, label: '60分钟以上' }
  ];
  // duration=1..4 对应的秒区间，用于客户端兜底过滤
  const DURATION_SEC = {
    1: [0, 600], 2: [600, 1800], 3: [1800, 3600], 4: [3600, Infinity]
  };
  const TIME_OPTS = [
    { v: 'all', label: '时间不限', ms: 0 },
    { v: 'd1', label: '24小时内', ms: 864e5 },
    { v: 'w1', label: '一周内', ms: 7 * 864e5 },
    { v: 'm1', label: '一个月内', ms: 30 * 864e5 },
    { v: 'm3', label: '三个月内', ms: 90 * 864e5 },
    { v: 'y1', label: '一年内', ms: 365 * 864e5 },
    { v: 'custom', label: '自定义…', ms: -1 }
  ];
  const DM_OPTS = [
    { v: 0, label: '弹幕不限' },
    { v: 10, label: '≥10弹幕' },
    { v: 50, label: '≥50弹幕' },
    { v: 100, label: '≥100弹幕' },
    { v: 500, label: '≥500弹幕' },
    { v: 1000, label: '≥1000弹幕' },
    { v: 5000, label: '≥5000弹幕' },
    { v: 10000, label: '≥1万弹幕' }
  ];
  const PLAY_OPTS = [
    { v: 0, label: '播放不限' },
    { v: 1000, label: '≥1千播放' },
    { v: 10000, label: '≥1万播放' },
    { v: 50000, label: '≥5万播放' },
    { v: 100000, label: '≥10万播放' },
    { v: 1000000, label: '≥100万播放' }
  ];
  const TIDS = [
    { v: 0, label: '全部分区' },
    { v: 1, label: '动画' }, { v: 3, label: '音乐' }, { v: 4, label: '游戏' },
    { v: 5, label: '娱乐' }, { v: 36, label: '知识' }, { v: 188, label: '科技' },
    { v: 234, label: '运动' }, { v: 223, label: '汽车' }, { v: 160, label: '生活' },
    { v: 211, label: '美食' }, { v: 217, label: '动物圈' }, { v: 119, label: '鬼畜' },
    { v: 155, label: '时尚' }, { v: 129, label: '舞蹈' }, { v: 181, label: '影视' },
    { v: 177, label: '纪录片' }, { v: 23, label: '电影' }, { v: 11, label: '电视剧' }
  ];
  /* 子分区 tid → 一级分区 tid。
   * 搜索结果里的 typeid 是「子分区」（如 17 单机游戏），而筛选下拉选的是「一级分区」（如 4 游戏），
   * 两者口径不同，直接比较会把所有结果都判为不匹配 —— 这正是「选游戏分区反而没内容」的原因。
   * 表中查不到的 tid 一律放行，保证映射不全时也不会筛空。 */
  const TID_PARENT = (function () {
    const m = {};
    const put = (parent, children) => {
      m[parent] = parent;
      children.forEach(c => { m[c] = parent; });
    };
    put(1, [24, 25, 47, 210, 86, 253]);                       // 动画
    put(3, [28, 31, 30, 194, 59, 193, 29]);                   // 音乐
    put(4, [17, 171, 172, 65, 173, 121, 136, 19, 240]);        // 游戏
    put(5, [71, 241, 137]);                                    // 娱乐
    put(36, [201, 124, 228, 207, 208, 209, 229, 122]);          // 知识
    put(188, [95, 189, 96, 97, 176]);                          // 科技
    put(234, [235, 249, 250, 251, 252]);                       // 运动
    put(160, [138, 239, 161, 162, 21]);                        // 生活
    put(211, [76, 212, 213]);                                  // 美食
    put(217, [218, 219, 220, 221, 222]);                       // 动物圈
    put(119, [22, 26, 126, 127]);                              // 鬼畜
    put(155, [157, 158, 159]);                                 // 时尚
    put(129, [20, 154, 156, 257, 258]);                        // 舞蹈
    put(181, [182, 183, 184, 85]);                             // 影视
    put(177, [37, 178, 179, 180]);                             // 纪录片
    put(23, [147, 148, 149, 150, 151]);                        // 电影
    put(11, [185, 186, 187]);                                  // 电视剧
    return m;
  })();
  function parentTid(t) {
    const v = TID_PARENT[String(t)];
    return typeof v === 'number' ? v : 0; // 0 = 未知，调用方应放行
  }
  const FANS_OPTS = [
    { v: 0, label: '粉丝不限' }, { v: 1000, label: '≥1千粉' },
    { v: 10000, label: '≥1万粉' }, { v: 100000, label: '≥10万粉' },
    { v: 1000000, label: '≥100万粉' }
  ];
  const ONLINE_OPTS = [
    { v: 0, label: '人气不限' }, { v: 100, label: '≥100人' },
    { v: 1000, label: '≥1000人' }, { v: 10000, label: '≥1万人' }
  ];

  /* =======================================================================
   * 6. 查询串解析：支持 -排除词 / "精确短语" / up:作者
   * ===================================================================== */
  function parseQuery(raw) {
    const q = { terms: [], phrases: [], excludes: [], up: '' };
    const re = /"([^"]+)"|(\S+)/g;
    let m;
    while ((m = re.exec(raw)) !== null) {
      let tok = m[1] !== undefined ? m[1] : m[2];
      if (!tok) continue;
      if (m[1] === undefined && tok.startsWith('-') && tok.length > 1) { q.excludes.push(tok.slice(1).toLowerCase()); continue; }
      if (m[1] === undefined && /^up[:：]/i.test(tok)) { q.up = tok.replace(/^up[:：]/i, '').toLowerCase(); continue; }
      if (m[1] !== undefined) { q.phrases.push(tok.toLowerCase()); q.terms.push(tok.toLowerCase()); }
      else q.terms.push(tok.toLowerCase());
    }
    // 短语内的词不再重复计分
    q.terms = q.terms.filter((t, i) => q.terms.indexOf(t) === i);
    return q;
  }

  /* --- 匹配预处理：忽略空格与标点，避免「赛博朋克 2077」匹配不上「赛博朋克2077」 --- */
  function squash(s) {
    return String(s).toLowerCase().replace(/[\s\u3000]/g, '')
      .replace(/[·・.,，。、!！?？:：;；~～\-_—+'"“”‘’()（）【】\[\]]/g, '');
  }
  // 长中文串切成 3 字片段做弱匹配（跳过含停用字的片段）
  const STOP_CHARS = '的了了吗呢啊是有和与在我你他这那就都也吧哦呀么着过';
  function subTerms(t) {
    if (t.length < 5 || /^[0-9a-z]+$/.test(t)) return [];
    const out = [];
    for (let i = 0; i + 3 <= t.length; i++) {
      const seg = t.substr(i, 3);
      if (STOP_CHARS.split('').some(c => seg.indexOf(c) >= 0)) continue;
      if (out.indexOf(seg) < 0) out.push(seg);
      if (out.length >= 10) break;
    }
    return out;
  }

  /* --- 相关度打分 + 过滤 --- */
  function judge(it, q) {
    const title = plain(it.title).toLowerCase();
    const up = plain(it.sub || '').toLowerCase();
    const tFlat = squash(title);
    const uFlat = squash(up);
    let score = 0;
    let hitTitle = false;

    // 排除词（含全局屏蔽词）
    const allEx = q.excludes.concat(cfg.blockWords.map(w => String(w).toLowerCase()));
    for (const e of allEx) {
      if (!e) continue;
      const ef = squash(e);
      if (ef && (tFlat.indexOf(ef) >= 0 || uFlat.indexOf(ef) >= 0)) return { drop: true, reason: 'exclude' };
    }
    // UP 主限定
    if (q.up && uFlat.indexOf(squash(q.up)) < 0) return { drop: true, reason: 'up' };
    // 精确短语必须完整出现
    for (const p of q.phrases) {
      const pf = squash(p);
      if (tFlat.indexOf(pf) < 0 && uFlat.indexOf(pf) < 0) return { drop: true, reason: 'phrase' };
      score += 20;
    }
    // 主词命中（先整词，再长句片段弱命中）
    for (const t of q.terms) {
      const tf = squash(t);
      if (!tf) continue;
      if (tFlat.indexOf(tf) >= 0) { score += 10; hitTitle = true; continue; }
      if (uFlat.indexOf(tf) >= 0) { score += 3; continue; }
      const segs = subTerms(tf);
      const weak = segs.some(s => tFlat.indexOf(s) >= 0);
      if (weak) { score += 2; hitTitle = true; }
      else if (segs.some(s => uFlat.indexOf(s) >= 0)) score += 1;
      else score -= 12;
    }
    // 屏蔽的 UP 主
    if (it.mid && cfg.blockUps.indexOf(String(it.mid)) >= 0) return { drop: true, reason: 'blockup' };
    return { drop: false, score, hitTitle };
  }

  /* =======================================================================
   * 7. 搜索接口
   * ===================================================================== */
  function normalize(list, type) {
    return (list || []).map(it => {
      if (type === 'video') {
        return {
          id: it.bvid, type: 'video',
          url: 'https://www.bilibili.com/video/' + it.bvid,
          pic: fixUrl(it.pic), title: it.title, sub: it.author,
          mid: it.mid, subUrl: it.mid ? 'https://space.bilibili.com/' + it.mid : '',
          play: +it.play || 0, dm: +it.video_review || 0, dur: parseDur(it.duration),
          pub: +it.pubdate || 0, tid: +it.typeid || 0,
          meta: [fmtNum(it.play) + '播放', fmtNum(it.video_review) + '弹幕', it.duration, fmtDate(it.pubdate)]
        };
      }
      if (type === 'bili_user') {
        return {
          id: 'u' + it.mid, type: 'user',
          url: 'https://space.bilibili.com/' + it.mid,
          pic: fixUrl(it.upic), title: it.uname, sub: (it.usign || '').trim(),
          mid: it.mid, subUrl: '',
          fans: +it.fans || 0,
          meta: [fmtNum(it.fans) + '粉丝', fmtNum(it.videos) + '视频']
        };
      }
      if (type === 'live_room') {
        return {
          id: 'L' + it.roomid, type: 'live',
          url: 'https://live.bilibili.com/' + it.roomid,
          pic: fixUrl(it.user_cover || it.cover), title: it.title, sub: it.uname || '',
          mid: it.uid, subUrl: it.uid ? 'https://space.bilibili.com/' + it.uid : '',
          online: +it.online || 0,
          meta: [fmtNum(it.online) + '人气', it.area_name || it.cate_name || '直播']
        };
      }
      return {
        id: 'md' + it.season_id, type: 'media',
        url: 'https://www.bilibili.com/bangumi/media/md' + it.season_id,
        pic: fixUrl(it.cover), title: it.title, sub: (it.styles || '').replace(/\s+/g, ' '),
        mid: 0, subUrl: '',
        meta: [it.areas || '', it.index_show || '', fmtDate(it.pubtime)].filter(Boolean)
      };
    });
  }

  async function rawSearch(kw, page) {
    const f = state.filters;
    const keys = await getWbiKeys();
    const params = { search_type: state.type, keyword: kw, page: page, page_size: cfg.pageSize };

    if (state.type === 'video') {
      // relevance 用综合排序取数据，再本地重排
      params.order = state.order === 'relevance' ? 'totalrank' : state.order;
      // 服务端筛选（参数名若被官方改动，下方客户端兜底仍会生效）
      if (f.duration) params.duration = f.duration;
      if (f.tid) params.tids = f.tid; // 只传 tids，传 tid 会让官方接口返回空结果
      if (f.timeBegin) params.pubtime_begin_s = f.timeBegin;
      if (f.timeEnd) params.pubtime_end_s = f.timeEnd;
    }

    let json = await apiGet('https://api.bilibili.com/x/web-interface/wbi/search/type?' + encWbi(params, keys.img, keys.sub));
    if (!json || json.code !== 0) {
      const legacy = Object.keys(params).map(k => k + '=' + encodeURIComponent(params[k])).join('&');
      json = await apiGet('https://api.bilibili.com/x/web-interface/search/type?' + legacy);
    }
    if (!json || json.code !== 0) {
      throw new Error((json && json.message) ? json.message + '（code ' + json.code + '）' : '接口返回异常');
    }
    const data = json.data || {};
    const list = normalize(data.result, state.type);
    const numPages = data.numPages || 0;
    return { list, hasMore: !!list.length && page < numPages, numResults: data.numResults || 0 };
  }

  /* --- 客户端兜底筛选（保证官方参数失效时仍然生效） --- */
  function clientFilter(list) {
    const f = state.filters;
    const q = state.q;
    const out = [];
    let dropped = 0;
    for (const it of list) {
      // 数值/时间类兜底
      if (state.type === 'video') {
        if (f.duration && DURATION_SEC[f.duration]) {
          const [lo, hi] = DURATION_SEC[f.duration];
          if (!(it.dur >= lo && it.dur < hi)) { dropped++; continue; }
        }
        // 一级分区 vs 子分区口径对齐；未知 tid 放行，避免误杀
        if (f.tid && it.tid) {
          const p = parentTid(it.tid);
          if (p && p !== f.tid && it.tid !== f.tid) { dropped++; continue; }
        }
        if (f.timeBegin && it.pub && it.pub < f.timeBegin) { dropped++; continue; }
        if (f.timeEnd && it.pub && it.pub > f.timeEnd) { dropped++; continue; }
        if (f.minDm && it.dm < f.minDm) { dropped++; continue; }
        if (f.minPlay && it.play < f.minPlay) { dropped++; continue; }
      } else if (state.type === 'bili_user') {
        if (f.minFans && it.fans < f.minFans) { dropped++; continue; }
      } else if (state.type === 'live_room') {
        if (f.minOnline && it.online < f.minOnline) { dropped++; continue; }
      }
      // 相关性判定
      const j = judge(it, q);
      if (j.drop) { dropped++; continue; }
      if (cfg.strict && !j.hitTitle && q.terms.length) { dropped++; continue; }
      it._score = j.score;
      out.push(it);
    }
    return { list: out, dropped };
  }

  async function fetchSuggest(kw) {
    try {
      const json = await gmFetch('https://s.search.bilibili.com/main/suggest?term=' + encodeURIComponent(kw) + '&platform=pc');
      const arr = json && json.result ? json.result : [];
      return arr.slice(0, 8).map(x => x.value || x.name).filter(Boolean);
    } catch (e) { return []; }
  }
  async function fetchHotword() {
    try {
      const json = await gmFetch('https://s.search.bilibili.com/main/hotword?limit=12');
      const arr = json && json.list ? json.list : [];
      return arr.slice(0, 12).map(x => x.keyword || x.show_name).filter(Boolean);
    } catch (e) { return []; }
  }

  /* =======================================================================
   * 8. 样式
   * ===================================================================== */
  GM_addStyle(`
    #bcs-root{position:fixed;inset:0;z-index:2147483000;font:14px/1.5 system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif}
    #bcs-root[hidden]{display:none}
    #bcs-root{--bcs-bg:#fff;--bcs-fg:#18191c;--bcs-sub:#9499a0;--bcs-border:#e3e5e7;--bcs-input:#f6f7f8;--bcs-hover:#f1f2f3;--bcs-accent:#FB7299}
    #bcs-root.bcs-dark{--bcs-bg:#1c1f23;--bcs-fg:#e3e5e7;--bcs-sub:#9499a0;--bcs-border:#2f3134;--bcs-input:#26292e;--bcs-hover:#2b2e33;--bcs-accent:#FB7299}
    .bcs-mask{position:absolute;inset:0;background:rgba(0,0,0,.45)}
    .bcs-panel{position:absolute;left:50%;top:6vh;transform:translateX(-50%);width:min(920px,94vw);max-height:82vh;
      display:flex;flex-direction:column;border-radius:14px;overflow:hidden;box-shadow:0 18px 60px rgba(0,0,0,.35);
      background:var(--bcs-bg);color:var(--bcs-fg);border:1px solid var(--bcs-border)}
    .bcs-head{display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid var(--bcs-border)}
    .bcs-input{flex:1;height:40px;padding:0 14px;border-radius:10px;border:1px solid var(--bcs-border);
      background:var(--bcs-input);color:var(--bcs-fg);font-size:15px;outline:none}
    .bcs-input:focus{border-color:var(--bcs-accent)}
    .bcs-icon{width:40px;height:40px;border:0;border-radius:10px;background:transparent;color:var(--bcs-sub);font-size:18px;cursor:pointer}
    .bcs-icon:hover{background:var(--bcs-hover);color:var(--bcs-fg)}
    .bcs-bar{display:flex;align-items:center;gap:8px;padding:8px 14px;border-bottom:1px solid var(--bcs-border);flex-wrap:wrap}
    .bcs-tabs{display:flex;gap:6px}
    .bcs-tab{padding:5px 12px;border-radius:999px;border:0;background:transparent;color:var(--bcs-sub);cursor:pointer;font-size:13px}
    .bcs-tab.on{background:var(--bcs-accent);color:#fff}
    .bcs-select{height:28px;border-radius:8px;border:1px solid var(--bcs-border);background:var(--bcs-input);color:var(--bcs-fg);padding:0 6px;outline:none;font-size:13px}
    .bcs-spacer{flex:1}
    .bcs-toggle{padding:4px 10px;border-radius:999px;border:1px solid var(--bcs-border);background:transparent;
      color:var(--bcs-sub);font-size:12px;cursor:pointer}
    .bcs-toggle.on{background:var(--bcs-accent);border-color:var(--bcs-accent);color:#fff}
    .bcs-presets{display:flex;gap:8px;flex-wrap:wrap;align-items:center;padding:8px 14px;border-bottom:1px solid var(--bcs-border);
      font-size:12px;color:var(--bcs-sub)}
    .bcs-presets .bcs-select{min-width:150px;max-width:230px}
    .bcs-filters{display:flex;gap:8px;flex-wrap:wrap;align-items:center;padding:8px 14px;border-bottom:1px solid var(--bcs-border);background:var(--bcs-input)}
    .bcs-filters[hidden]{display:none}
    .bcs-filters label{font-size:12px;color:var(--bcs-sub);display:flex;align-items:center;gap:4px}
    .bcs-custom{display:flex;gap:6px;align-items:center}
    .bcs-custom input{height:28px;border-radius:8px;border:1px solid var(--bcs-border);background:var(--bcs-bg);color:var(--bcs-fg);padding:0 6px;font-size:13px}
    .bcs-body{flex:1;overflow:auto;padding:6px 10px 10px}
    .bcs-item{display:flex;gap:12px;padding:10px;border-radius:10px;cursor:pointer;text-decoration:none;color:inherit;position:relative}
    .bcs-item:hover,.bcs-item.active{background:var(--bcs-hover)}
    .bcs-thumb{position:relative;flex:0 0 150px;width:150px;aspect-ratio:16/9;border-radius:8px;overflow:hidden;background:var(--bcs-hover)}
    .bcs-thumb img{width:100%;height:100%;object-fit:cover;display:block}
    .bcs-dur{position:absolute;right:4px;bottom:4px;padding:1px 5px;border-radius:4px;font-size:12px;background:rgba(0,0,0,.65);color:#fff}
    .bcs-info{min-width:0;flex:1;display:flex;flex-direction:column;gap:6px}
    .bcs-title{font-size:15px;font-weight:600;line-height:1.4;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
    .bcs-title mark{background:rgba(251,114,153,.18);color:var(--bcs-accent);font-weight:700;border-radius:3px;padding:0 1px}
    .bcs-sub{color:var(--bcs-sub);font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .bcs-meta{color:var(--bcs-sub);font-size:12px;display:flex;gap:10px;flex-wrap:wrap;align-items:center}
    .bcs-score{font-size:11px;padding:1px 6px;border-radius:4px;background:var(--bcs-hover);color:var(--bcs-sub)}
    .bcs-acts{display:none;gap:8px}
    .bcs-item:hover .bcs-acts{display:flex}
    .bcs-acts button{border:0;background:var(--bcs-bg);color:var(--bcs-sub);font-size:12px;cursor:pointer;padding:2px 6px;border-radius:4px;border:1px solid var(--bcs-border)}
    .bcs-acts button:hover{color:var(--bcs-accent);border-color:var(--bcs-accent)}
    .bcs-status{padding:14px;text-align:center;color:var(--bcs-sub);font-size:13px;line-height:1.8}
    .bcs-status a{color:var(--bcs-accent);cursor:pointer;text-decoration:none;margin:0 6px}
    .bcs-sug-row{padding:8px 10px;border-radius:8px;cursor:pointer}
    .bcs-sug-row:hover{background:var(--bcs-hover)}
    .bcs-chips{display:flex;gap:8px;flex-wrap:wrap;padding:6px 4px 10px}
    .bcs-chip{display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:999px;background:var(--bcs-hover);
      color:var(--bcs-sub);font-size:12px;cursor:pointer;border:1px solid transparent}
    .bcs-chip:hover{border-color:var(--bcs-accent);color:var(--bcs-accent)}
    .bcs-chip b{font-weight:400}
    .bcs-chip i{font-style:normal;opacity:.6}
    .bcs-chip i:hover{color:var(--bcs-accent);opacity:1}
    .bcs-sechead{font-size:12px;color:var(--bcs-sub);padding:8px 4px 2px;display:flex;align-items:center;gap:8px}
    .bcs-foot{padding:8px 14px;border-top:1px solid var(--bcs-border);color:var(--bcs-sub);font-size:12px;display:flex;gap:10px;align-items:center;flex-wrap:wrap}
    .bcs-foot a{color:var(--bcs-accent);cursor:pointer;text-decoration:none}
    .bcs-set{padding:6px 14px 14px}
    .bcs-set-row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 0;border-bottom:1px dashed var(--bcs-border)}
    .bcs-set-row:last-child{border-bottom:0}
    .bcs-set-row>span{font-size:13px}
    .bcs-set-row em{display:block;color:var(--bcs-sub);font-style:normal;font-size:12px;margin-top:2px}
    .bcs-set-row select,.bcs-set-row input[type=text]{height:28px;border-radius:6px;border:1px solid var(--bcs-border);background:var(--bcs-input);color:var(--bcs-fg)}
    .bcs-set-row input[type=checkbox]{width:16px;height:16px;accent-color:var(--bcs-accent)}
    .bcs-tag{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;margin:2px;border-radius:999px;background:var(--bcs-hover);font-size:12px}
    .bcs-tag b{font-weight:400} .bcs-tag i{font-style:normal;cursor:pointer;color:var(--bcs-sub)} .bcs-tag i:hover{color:var(--bcs-accent)}
    .bcs-preset-list{max-width:460px;text-align:right;line-height:2.2}
    .bcs-preset-list .bcs-tag em{font-size:11px;opacity:.75;margin-left:2px}
    .bcs-perm{border:1px solid var(--bcs-accent);border-radius:10px;padding:12px 14px;margin:6px 0 14px;
      background:var(--bcs-input);font-size:12.5px;line-height:1.85}
    .bcs-perm-h{font-size:14px;font-weight:700;color:var(--bcs-fg);margin-bottom:8px}
    .bcs-perm p{margin:0 0 8px;color:var(--bcs-fg)}
    .bcs-perm p:last-child{margin-bottom:0}
    .bcs-perm-tip{color:var(--bcs-sub)!important;font-size:12px}
    .bcs-perm-ai{border-style:dashed;margin-bottom:10px}
    .bcs-perm a{color:var(--bcs-accent);text-decoration:none}
    .bcs-perm a:hover{text-decoration:underline}
    .bcs-perm code{background:var(--bcs-hover);padding:1px 5px;border-radius:4px;
      font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px}
    .bcs-help{font-size:12px;color:var(--bcs-sub);line-height:1.9;padding:4px 2px}
    .bcs-help code{background:var(--bcs-hover);padding:1px 5px;border-radius:4px;font-family:ui-monospace,Menlo,Consolas,monospace}
    .bcs-entry{position:fixed;right:18px;bottom:18px;z-index:2147482999;width:46px;height:46px;border-radius:50%;
      border:0;background:#FB7299;color:#fff;font-size:20px;cursor:pointer;box-shadow:0 6px 18px rgba(251,114,153,.45)}
    body.bcs-lock{overflow:hidden!important}
  `);

  /* =======================================================================
   * 9. 状态与 UI
   * ===================================================================== */
  const state = {
    kw: '', type: cfg.defaultType, order: cfg.defaultOrder,
    q: { terms: [], phrases: [], excludes: [], up: '' },
    filters: {
      duration: 0, tid: 0, timeKey: 'all', timeBegin: 0, timeEnd: 0,
      minDm: 0, minPlay: 0, minFans: 0, minOnline: 0
    },
    items: [], active: -1, loading: false, hasMore: false,
    nextPage: 1, reqId: 0, dropped: 0, numResults: 0,
    mode: 'idle' // idle | suggest | result
  };

  let root, panel, input, listEl, statusEl, bodyEl, footEl, tabsEl, orderSel, chipsEl, settingsEl, filterBar, strictBtn, presetRow, presetSel;

  function buildUI() {
    root = document.createElement('div');
    root.id = 'bcs-root';
    root.hidden = true;
    root.innerHTML = `
      <div class="bcs-mask" data-close="1"></div>
      <div class="bcs-panel">
        <div class="bcs-head">
          <input class="bcs-input" type="text" placeholder='搜索：-排除词  "精确短语"  up:作者名   （Alt+K 唤出，Esc 关闭）'>
          <button class="bcs-icon" id="bcs-filter" title="筛选">⚗</button>
          <button class="bcs-icon" id="bcs-gear" title="设置">⚙</button>
        </div>
        <div class="bcs-bar">
          <div class="bcs-tabs"></div>
          <select class="bcs-select bcs-order"></select>
          <span class="bcs-spacer"></span>
          <button class="bcs-toggle bcs-strict">严格过滤</button>
        </div>
        <div class="bcs-presets"></div>
        <div class="bcs-filters"></div>
        <div class="bcs-body">
          <div class="bcs-chips bcs-home" hidden></div>
          <div class="bcs-list"></div>
          <div class="bcs-status"></div>
        </div>
        <div class="bcs-foot"></div>
      </div>`;
    document.documentElement.appendChild(root);

    panel = root.querySelector('.bcs-panel');
    input = root.querySelector('.bcs-input');
    listEl = root.querySelector('.bcs-list');
    statusEl = root.querySelector('.bcs-status');
    bodyEl = root.querySelector('.bcs-body');
    footEl = root.querySelector('.bcs-foot');
    tabsEl = root.querySelector('.bcs-tabs');
    orderSel = root.querySelector('.bcs-order');
    chipsEl = root.querySelector('.bcs-home');
    filterBar = root.querySelector('.bcs-filters');
    strictBtn = root.querySelector('.bcs-strict');
    presetRow = root.querySelector('.bcs-presets');

    settingsEl = document.createElement('div');
    settingsEl.className = 'bcs-set';
    settingsEl.hidden = true;
    bodyEl.insertBefore(settingsEl, chipsEl);

    buildPresetRow();

    TYPES.forEach(t => {
      const b = document.createElement('button');
      b.className = 'bcs-tab' + (t.key === state.type ? ' on' : '');
      b.textContent = t.label;
      b.dataset.type = t.key;
      b.addEventListener('click', () => {
        if (state.type === t.key) return;
        state.type = t.key;
        // 切类型时自动套用该类型的默认预设
        const dp = defaultPreset(t.key);
        if (dp) applyPreset(dp, false);
        else {
          state.order = cfg.defaultOrder;
          state.filters = emptyFilters();
          [].forEach.call(tabsEl.children, x => x.classList.toggle('on', x.dataset.type === t.key));
          orderSel.value = state.order;
          orderSel.hidden = t.key !== 'video';
          buildFilterBar();
          syncPresetSelect();
        }
        clearList();
        if (state.kw) runSearch();
      });
      tabsEl.appendChild(b);
    });
    ORDERS.forEach(o => {
      const op = document.createElement('option');
      op.value = o.key; op.textContent = o.label;
      orderSel.appendChild(op);
    });
    orderSel.value = state.order;
    orderSel.hidden = state.type !== 'video';
    orderSel.addEventListener('change', () => {
      state.order = orderSel.value;
      if (state.kw) { clearList(); runSearch(); }
    });

    strictBtn.classList.toggle('on', cfg.strict);
    strictBtn.addEventListener('click', () => {
      cfg.strict = !cfg.strict;
      strictBtn.classList.toggle('on', cfg.strict);
      saveCfg();
      if (state.kw) { clearList(); runSearch(); }
    });

    input.addEventListener('input', () => {
      state.kw = input.value.trim();
      if (!state.kw) { state.mode = 'idle'; clearList(); showHome(); return; }
      if (cfg.suggest) { state.mode = 'suggest'; debounceSuggest(); }
      debounceSearch();
    });
    input.addEventListener('keydown', onPanelKey);

    root.querySelector('#bcs-gear').addEventListener('click', toggleSettings);
    root.querySelector('#bcs-filter').addEventListener('click', () => {
      filterBar.hidden = !filterBar.hidden;
    });

    root.addEventListener('click', e => { if (e.target.dataset.close) closePanel(); });
    bodyEl.addEventListener('scroll', () => {
      if (state.loading || !state.hasMore || state.mode !== 'result') return;
      if (bodyEl.scrollTop + bodyEl.clientHeight >= bodyEl.scrollHeight - 300) runSearch(false);
    });
    listEl.addEventListener('click', e => {
      const btn = e.target.closest('[data-act]');
      if (btn) { e.preventDefault(); e.stopPropagation(); itemAction(btn); return; }
      const a = e.target.closest('.bcs-item');
      if (!a) return;
      e.preventDefault();
      openUrl(a.dataset.url, e.ctrlKey || e.metaKey || e.shiftKey);
    });
    listEl.addEventListener('auxclick', e => {
      if (e.button !== 1) return;
      const a = e.target.closest('.bcs-item');
      if (a) { e.preventDefault(); openUrl(a.dataset.url, true); }
    });

    buildFilterBar();
  }

  function openUrl(url, forceNew) {
    if (!url) return;
    if (cfg.openInNewTab || forceNew) window.open(url, '_blank', 'noopener');
    else location.href = url;
  }

  function typeLabel(k) {
    const t = TYPES.filter(x => x.key === k)[0];
    return t ? t.label : k;
  }

  /* --- 预设行：切换 / 保存 / 设为默认 / 管理 / 重置 --- */
  function buildPresetRow() {
    presetRow.innerHTML = '';
    const lab = document.createElement('span');
    lab.textContent = '预设';
    presetRow.appendChild(lab);

    presetSel = document.createElement('select');
    presetSel.className = 'bcs-select bcs-preset';
    presetSel.title = '保存过的筛选组合，选一个即可套用；★ 表示该类目的默认筛选';
    presetSel.addEventListener('change', () => {
      const v = presetSel.value;
      if (!v) { syncPresetSelect(); return; }
      const p = presets.filter(x => x.id === v)[0];
      if (p) { applyPreset(p, true); presetSel.value = p.id; }
    });
    presetRow.appendChild(presetSel);

    const mkBtn = (text, title, fn) => {
      const b = document.createElement('button');
      b.className = 'bcs-toggle';
      b.textContent = text;
      b.title = title;
      b.addEventListener('click', fn);
      presetRow.appendChild(b);
      return b;
    };

    mkBtn('＋ 保存当前', '把当前这套筛选存成预设', () => {
      const name = (prompt('给当前这套筛选起个名字', '我的筛选') || '').trim();
      if (!name) return;
      const p = saveCurrentAsPreset(name);
      if (p) { syncPresetSelect(); presetSel.value = p.id; setStatus('已保存预设「' + escapeHtml(p.name) + '」'); }
    });

    mkBtn('★ 设为默认', '设为该搜索类型的默认筛选，之后每次打开面板自动套用', () => {
      const p = presets.filter(x => x.id === presetSel.value)[0];
      if (!p) { setStatus('先在下拉里选一个预设，再点「设为默认」'); return; }
      presets.forEach(x => { if ((x.type || 'video') === (p.type || 'video')) x.def = false; });
      p.def = true;
      savePresets();
      syncPresetSelect();
      presetSel.value = p.id;
      setStatus('已把「' + escapeHtml(p.name) + '」设为【' + typeLabel(p.type) + '】的默认筛选');
    });

    mkBtn('管理', '重命名 / 删除 / 调整默认', () => renderSettings());
    mkBtn('重置筛选', '清空当前筛选条件', () => {
      state.filters = emptyFilters();
      buildFilterBar();
      syncPresetSelect();
      if (state.kw) { clearList(); runSearch(); }
    });

    syncPresetSelect();
  }

  function syncPresetSelect() {
    if (!presetSel) return;
    const cur = canon(snapshot());
    presetSel.innerHTML = '';
    const o0 = document.createElement('option');
    o0.value = '';
    o0.textContent = '（自定义）';
    presetSel.appendChild(o0);
    presets.forEach(p => {
      const o = document.createElement('option');
      o.value = p.id;
      o.textContent = (p.def ? '★ ' : '') + p.name + ' · ' + typeLabel(p.type);
      presetSel.appendChild(o);
    });
    const hit = presets.filter(p => canon(p) === cur)[0];
    presetSel.value = hit ? hit.id : '';
  }

  /* --- 筛选栏（按类型动态生成） --- */
  function buildFilterBar() {
    filterBar.innerHTML = '';
    // 用赋值而非 addEventListener，避免重建时重复绑定
    filterBar.onchange = syncPresetSelect;
    const mk = (opts, cur, onChange, title) => {
      const l = document.createElement('label');
      if (title) l.appendChild(document.createTextNode(title));
      const s = document.createElement('select');
      s.className = 'bcs-select';
      opts.forEach(o => {
        const op = document.createElement('option');
        op.value = o.v; op.textContent = o.label;
        if (o.v === cur) op.selected = true;
        s.appendChild(op);
      });
      s.addEventListener('change', () => onChange(isNaN(+s.value) ? s.value : +s.value, s));
      l.appendChild(s);
      filterBar.appendChild(l);
      return s;
    };

    if (state.type === 'video') {
      mk(TIME_OPTS, state.filters.timeKey, (v, sel) => {
        state.filters.timeKey = v;
        const cust = filterBar.querySelector('.bcs-custom');
        if (v === 'custom') {
          state.filters.timeBegin = 0;
          state.filters.timeEnd = 0;
          if (!cust) {
            const box = document.createElement('div');
            box.className = 'bcs-custom';
            box.innerHTML = '<input type="date" class="bcs-from"><span style="font-size:12px;color:var(--bcs-sub)">至</span><input type="date" class="bcs-to">';
            box.querySelector('.bcs-from').value = state.filters.timeBegin ? fmtDate(state.filters.timeBegin) : '';
            box.querySelector('.bcs-to').value = state.filters.timeEnd ? fmtDate(state.filters.timeEnd) : '';
            box.querySelector('.bcs-from').addEventListener('change', e => { state.filters.timeBegin = Math.floor(new Date(e.target.value + 'T00:00:00').getTime() / 1000); if (state.kw) { clearList(); runSearch(); } });
            box.querySelector('.bcs-to').addEventListener('change', e => { state.filters.timeEnd = Math.floor(new Date(e.target.value + 'T23:59:59').getTime() / 1000); if (state.kw) { clearList(); runSearch(); } });
            filterBar.appendChild(box);
          }
          return; // 等用户选日期
        } else {
          if (cust) cust.remove();
          const opt = TIME_OPTS.find(o => o.v === v);
          state.filters.timeBegin = opt.ms > 0 ? Math.floor((Date.now() - opt.ms) / 1000) : 0;
          state.filters.timeEnd = opt.ms > 0 ? Math.floor(Date.now() / 1000) : 0;
        }
        if (state.kw) { clearList(); runSearch(); }
      });
      mk(DURATION_OPTS, state.filters.duration, v => { state.filters.duration = v; if (state.kw) { clearList(); runSearch(); } });
      mk(DM_OPTS, state.filters.minDm, v => { state.filters.minDm = v; if (state.kw) { clearList(); runSearch(); } });
      mk(PLAY_OPTS, state.filters.minPlay, v => { state.filters.minPlay = v; if (state.kw) { clearList(); runSearch(); } });
      mk(TIDS, state.filters.tid, v => { state.filters.tid = v; if (state.kw) { clearList(); runSearch(); } });
    } else if (state.type === 'bili_user') {
      mk(FANS_OPTS, state.filters.minFans, v => { state.filters.minFans = v; if (state.kw) { clearList(); runSearch(); } });
    } else if (state.type === 'live_room') {
      mk(ONLINE_OPTS, state.filters.minOnline, v => { state.filters.minOnline = v; if (state.kw) { clearList(); runSearch(); } });
    } else {
      const tip = document.createElement('span');
      tip.style.cssText = 'font-size:12px;color:var(--bcs-sub)';
      tip.textContent = '影视/番剧类型暂无可用筛选条件';
      filterBar.appendChild(tip);
    }
  }

  /* --- 结果项操作：屏蔽 UP / 排除词 --- */
  function itemAction(btn) {
    const item = btn.closest('.bcs-item');
    const idx = +item.dataset.idx;
    const it = state.items[idx];
    if (!it) return;
    if (btn.dataset.act === 'blockup') {
      if (it.mid && cfg.blockUps.indexOf(String(it.mid)) < 0) cfg.blockUps.push(String(it.mid));
      saveCfg();
      state.items = state.items.filter(x => !(x.mid && String(x.mid) === String(it.mid)));
      renderAll();
      setStatus('已屏蔽 UP 主「' + escapeHtml(plain(it.sub)) + '」，可在设置里恢复');
    } else if (btn.dataset.act === 'blockword') {
      const w = (prompt('要把哪个词加入全局屏蔽？（命中该词的结果将被剔除）', plain(it.title).slice(0, 20)) || '').trim();
      if (w) {
        cfg.blockWords.push(w);
        saveCfg();
        clearList();
        runSearch();
      }
    }
  }

  /* --- 防抖 --- */
  let sTimer = null, rTimer = null;
  function debounceSuggest() {
    clearTimeout(sTimer);
    sTimer = setTimeout(async () => {
      const kw = state.kw;
      const sug = await fetchSuggest(kw);
      if (state.kw !== kw || state.mode !== 'suggest') return;
      renderSuggest(sug);
    }, 200);
  }
  function debounceSearch() {
    clearTimeout(rTimer);
    rTimer = setTimeout(() => { state.mode = 'result'; clearList(); runSearch(); }, 320);
  }

  function clearList() {
    listEl.innerHTML = '';
    chipsEl.hidden = true;
    state.items = []; state.active = -1; state.nextPage = 1;
    state.hasMore = false; state.dropped = 0; state.numResults = 0;
    if (settingsEl) settingsEl.hidden = true;
  }

  function setStatus(html) { statusEl.innerHTML = html; statusEl.hidden = !html; }

  /* --- 空态：历史 + 热搜 --- */
  async function showHome() {
    chipsEl.innerHTML = '';
    chipsEl.hidden = false;
    if (history.length) {
      const h = document.createElement('div');
      h.className = 'bcs-sechead';
      h.innerHTML = '<span>最近搜索</span>';
      const clr = document.createElement('a');
      clr.textContent = '清空';
      clr.style.cssText = 'color:var(--bcs-accent);cursor:pointer;font-size:12px';
      clr.addEventListener('click', () => {
        history = [];
        try { GM_setValue(HIST_KEY, '[]'); } catch (e) { }
        showHome();
      });
      h.appendChild(clr);
      chipsEl.appendChild(h);
      const box = document.createElement('div');
      box.className = 'bcs-chips';
      history.slice(0, 16).forEach(kw => {
        const c = document.createElement('div');
        c.className = 'bcs-chip';
        c.innerHTML = '<b></b>';
        c.querySelector('b').textContent = kw;
        const x = document.createElement('i');
        x.textContent = '✕';
        x.addEventListener('click', e => {
          e.stopPropagation();
          history = history.filter(x2 => x2 !== kw);
          try { GM_setValue(HIST_KEY, JSON.stringify(history)); } catch (e2) { }
          showHome();
        });
        c.appendChild(x);
        c.addEventListener('click', () => { input.value = kw; state.kw = kw; state.mode = 'result'; clearList(); runSearch(); });
        box.appendChild(c);
      });
      chipsEl.appendChild(box);
    }
    const h2 = document.createElement('div');
    h2.className = 'bcs-sechead';
    h2.textContent = 'B 站热搜';
    chipsEl.appendChild(h2);
    const box2 = document.createElement('div');
    box2.className = 'bcs-chips';
    box2.textContent = '加载中…';
    chipsEl.appendChild(box2);
    const words = await fetchHotword();
    box2.innerHTML = '';
    words.forEach(w => {
      const c = document.createElement('div');
      c.className = 'bcs-chip';
      c.textContent = w;
      c.addEventListener('click', () => { input.value = w; state.kw = w; state.mode = 'result'; clearList(); runSearch(); });
      box2.appendChild(c);
    });
    setStatus('');
    renderFoot();
  }

  function renderSuggest(sug) {
    if (!sug.length || state.mode !== 'suggest') return;
    listEl.innerHTML = '';
    sug.forEach(s => {
      const row = document.createElement('div');
      row.className = 'bcs-sug-row';
      row.textContent = '🔍 ' + s;
      row.addEventListener('click', () => {
        input.value = s;
        state.kw = s;
        state.mode = 'result';
        clearList();
        runSearch();
      });
      listEl.appendChild(row);
    });
  }

  function quickJump(kw) {
    let m;
    if ((m = kw.match(/^(BV[0-9A-Za-z]{10})$/i))) return 'https://www.bilibili.com/video/' + m[1];
    if ((m = kw.match(/^av(\d+)$/i))) return 'https://www.bilibili.com/video/av' + m[1];
    if ((m = kw.match(/^(?:uid|mid|space)[:：\s]*(\d+)$/i))) return 'https://space.bilibili.com/' + m[1];
    if ((m = kw.match(/^(?:live|room)[:：\s]*(\d+)$/i))) return 'https://live.bilibili.com/' + m[1];
    return '';
  }

  /* --- 主搜索流程：抓取 → 客户端过滤 → 渲染 ---
   * 过滤会吃掉很多条，所以开启筛选/严格模式时自动多抓几页补足 */
  async function runSearch(reset) {
    if (!state.kw) return;
    if (reset !== false) {
      const direct = quickJump(state.kw);
      if (direct) { listEl.innerHTML = ''; setStatus('识别为直达地址，正在打开…'); openUrl(direct); return; }
      pushHistory(state.kw);
      state.q = parseQuery(state.kw);
      clearList();
      setStatus('搜索中…');
    } else {
      setStatus('加载更多…');
    }
    state.loading = true;
    const myId = ++state.reqId;
    const t0 = Date.now();
    const want = Math.max(12, Math.min(cfg.pageSize, 24)); // 一次想凑够的条数
    const MAX_FETCH = 6;                                    // 最多连抓几页防止刷接口
    let acc = [], fetched = 0, hasMore = true, droppedPage = 0;

    try {
      while (acc.length < want && hasMore && fetched < MAX_FETCH) {
        const res = await rawSearch(state.kw, state.nextPage);
        if (myId !== state.reqId) return;
        hasMore = res.hasMore;
        state.numResults = res.numResults;
        state.nextPage += 1;
        fetched++;
        const f = clientFilter(res.list);
        droppedPage += f.dropped;
        acc = acc.concat(f.list);
        if (!hasMore) break;
      }
      state.dropped += droppedPage;
      state.hasMore = hasMore;
      state.mode = 'result';
      chipsEl.hidden = true;

      if (state.order === 'relevance' && state.type === 'video') {
        acc.sort((a, b) => (b._score - a._score) || (b.play - a.play));
      }
      const seen = new Set(state.items.map(i => i.id));
      const fresh = acc.filter(i => !seen.has(i.id));
      fresh.forEach(i => seen.add(i.id));
      state.items = state.items.concat(fresh);
      renderAppend(fresh);

      if (!state.items.length) {
        setStatus('没有符合条件的结果' +
          (state.dropped ? `（已过滤 ${state.dropped} 条）` : '') +
          '<br>试试放宽筛选，或关掉「严格过滤」<br>' + fallbackLinks());
        bindFallback();
      } else {
        setStatus(`共 ${fmtNum(state.numResults)} 条相关 · 已展示 ${state.items.length}` +
          (state.dropped ? ` · 已过滤 ${state.dropped} 条不相关` : '') +
          ` · ${Date.now() - t0}ms` + (hasMore ? ' · 下滑加载更多' : ' · 没有更多了'));
      }
      renderFoot();
    } catch (err) {
      if (myId !== state.reqId) return;
      setStatus('搜索失败：' + escapeHtml(err.message) + '<br>' + fallbackLinks());
      bindFallback();
    } finally {
      state.loading = false;
    }
  }

  function renderAppend(list) {
    const frag = document.createDocumentFragment();
    list.forEach(it => {
      const idx = state.items.indexOf(it);
      const a = document.createElement('a');
      a.className = 'bcs-item';
      a.href = it.url;
      a.dataset.url = it.url;
      a.dataset.idx = idx;
      a.target = cfg.openInNewTab ? '_blank' : '_self';
      a.rel = 'noopener';
      const scoreTag = (state.order === 'relevance' && it._score != null)
        ? `<span class="bcs-score">相关度 ${it._score > 0 ? '高' : it._score >= -10 ? '中' : '低'}</span>` : '';
      a.innerHTML = `
        <div class="bcs-thumb">
          <img src="${escapeHtml(it.pic)}" loading="lazy" alt="">
          ${state.type === 'video' && it.meta[2] ? `<span class="bcs-dur">${escapeHtml(it.meta[2])}</span>` : ''}
        </div>
        <div class="bcs-info">
          <div class="bcs-title">${highlight(it.title)}</div>
          <div class="bcs-sub">${escapeHtml(it.sub || '')}</div>
          <div class="bcs-meta">
            ${it.meta.filter(Boolean).map(m => `<span>${escapeHtml(m)}</span>`).join('')}
            ${scoreTag}
            <span class="bcs-acts">
              <button data-act="blockup" title="屏蔽该 UP 主">屏蔽UP</button>
              <button data-act="blockword" title="把词加入屏蔽">屏蔽词</button>
            </span>
          </div>
        </div>`;
      const img = a.querySelector('img');
      if (img) img.addEventListener('error', () => { img.style.visibility = 'hidden'; });
      frag.appendChild(a);
    });
    listEl.appendChild(frag);
  }

  function renderAll() {
    listEl.innerHTML = '';
    renderAppend(state.items);
  }

  function fallbackLinks() {
    const map = {
      bilibili: '<a data-fb="bilibili">打开 B 站原版搜索</a>',
      google: '<a data-fb="google">用 Google 搜</a>',
      bing: '<a data-fb="bing">用 Bing 搜</a>',
      none: ''
    };
    return map[cfg.fallback] || '';
  }
  function bindFallback() {
    [].forEach.call(statusEl.querySelectorAll('[data-fb]'), el => {
      el.addEventListener('click', () => {
        const kw = encodeURIComponent(state.kw);
        const url = {
          bilibili: 'https://search.bilibili.com/all?keyword=' + kw,
          google: 'https://www.google.com/search?q=site:bilibili.com+' + kw,
          bing: 'https://www.bing.com/search?q=site:bilibili.com+' + kw
        }[el.dataset.fb];
        if (url) window.open(url, '_blank', 'noopener');
      });
    });
  }

  function renderFoot() {
    const kw = encodeURIComponent(state.kw);
    footEl.innerHTML = `
      <span>↑↓ 选择 · Enter 打开 · Ctrl+Enter/中键 新标签 · Alt+K 唤出</span>
      <span style="margin-left:auto">
        <a data-ext="bilibili">B站原版</a> · <a data-ext="google">Google</a> · <a data-ext="bing">Bing</a> · <a data-act="help">语法帮助</a> · <a data-act="perm">🔐 权限说明</a>
      </span>`;
    [].forEach.call(footEl.querySelectorAll('[data-ext]'), el => {
      el.addEventListener('click', () => {
        const u = {
          bilibili: 'https://search.bilibili.com/all?keyword=' + kw,
          google: 'https://www.google.com/search?q=' + kw,
          bing: 'https://www.bing.com/search?q=' + kw
        }[el.dataset.ext];
        window.open(u, '_blank', 'noopener');
      });
    });
    const perm = footEl.querySelector('[data-act=perm]');
    if (perm) perm.addEventListener('click', () => { renderSettings(); });

    const help = footEl.querySelector('[data-act=help]');
    if (help) help.addEventListener('click', () => {
      settingsEl.hidden = false;
      listEl.innerHTML = '';
      setStatus('');
      settingsEl.innerHTML = `
        <div class="bcs-help">
          <b>搜索语法</b><br>
          <code>关键词1 关键词2</code> 空格分词，标题命中的排前面<br>
          <code>"精确短语"</code> 引号内必须完整出现，如 <code>"赛博朋克2077"</code><br>
          <code>-词</code> 排除含该词的结果，如 <code>赛博朋克 -手游</code><br>
          <code>up:名字</code> 只看某个 UP 主，如 <code>up:老番茄</code><br>
          <code>BV1xx411c7mD</code> / <code>av170001</code> / <code>uid946974</code> / <code>room6</code> 直达<br><br>
          <b>为什么结果会变干净</b><br>
          官方「综合排序」会掺推广与分词泛匹配。本脚本默认开启<b>严格过滤</b>：
          标题里一个关键词都没命中的结果直接剔除；开启「相关度」排序后，还会按标题/UP 主命中情况重新打分排序。<br>
          命中不足时脚本会自动多抓几页补足数量，所以过滤后结果不会变太少。<br><br>
          <b>筛选兜底</b><br>
          时间、时长、分区都同时走服务端参数与本地二次校验，即使官方改参数名，筛选依然生效。
          弹幕数与播放量官方接口无对应参数，由本地在返回结果上过滤。
        </div>`;
    });
  }

  /* --- 键盘 --- */
  function onPanelKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); closePanel(); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const els = listEl.querySelectorAll('.bcs-item');
      if (!els.length) return;
      state.active = e.key === 'ArrowDown'
        ? Math.min(state.active + 1, els.length - 1)
        : Math.max(state.active - 1, 0);
      [].forEach.call(els, (el, i) => el.classList.toggle('active', i === state.active));
      els[state.active].scrollIntoView({ block: 'nearest' });
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const els = listEl.querySelectorAll('.bcs-item');
      if (els.length && state.active >= 0) openUrl(els[state.active].dataset.url, e.ctrlKey || e.metaKey || e.shiftKey);
      else { state.kw = input.value.trim(); state.mode = 'result'; runSearch(true); }
    }
  }

  /* --- 设置面板 --- */
  let pendingRerun = false;
  function toggleSettings() {
    if (!settingsEl.hidden) {
      settingsEl.hidden = true;
      if (pendingRerun && state.kw) { pendingRerun = false; clearList(); runSearch(); }
      return;
    }
    renderSettings();
  }

  function renderSettings() {
    listEl.innerHTML = ''; chipsEl.hidden = true; setStatus('');

    // 权限说明区块（置顶，配合 Greasy Fork 页面上的 @description 提示）
    // 注意：必须在 settingsEl.innerHTML 赋值之后再插入，否则会被覆盖
    const permHtml = `
      <div class="bcs-perm bcs-perm-ai">
      <div class="bcs-perm-h">🤖 编写说明：AI 辅助生成</div>
      <p>本脚本的代码由 <b>AI 辅助生成</b>，并非作者逐字手写。作者已通读全部代码、
      并在真实浏览器环境中验证核心功能后发布。</p>
      <p>需要你知道的是：<b>AI 生成的代码可能存在未被覆盖到的边界情况</b>。
      脚本不涉及你的账号安全操作（不读取 Cookie、不上传任何数据），
      但功能层面若有异常，欢迎在
      <a href="https://github.com/saiyajiang/Bilibili-Search-Replace/issues" target="_blank" rel="noopener">GitHub 提 issue</a>
      反馈，源码完全公开可自行审阅。</p>
      </div>
      <div class="bcs-perm">
      <div class="bcs-perm-h">🔐 关于 Cookie 权限</div>
      <p><b>脚本会申请 Cookie 权限，只为一件事</b>：当 B 站接口返回风控错误
      <code>-412 请求被拦截</code> / <code>-352 风险等级不足</code> 时，写入一个名为
      <code>buvid3</code> 的设备标识，让后续搜索请求能通过校验。这个值取自 B 站官方接口
      <code>/x/frontend/finger/spi</code>，等同于 B 站在新设备上首次访问时自己做的事。</p>
      <p><b>它没有做什么</b>：脚本全文只有一处 <code>GM_cookie.set()</code>（写入），
      没有 <code>list</code> / <code>get</code> / <code>delete</code>，
      因此<b>读不到</b>你的登录态或任何其它 Cookie；写入的值不外传，脚本也没有任何第三方服务器，
      全部请求直连 <code>bilibili.com</code>。</p>
      <p><b>不想要这个权限？</b>删掉脚本头部 <code>// @grant GM_cookie</code>
      这一行即可彻底移除。代码已做保护，移除后其余功能<b>完全正常</b>，
      只是遇到风控时无法自动恢复（会提示你手动打开一次 B 站）。</p>
      <p class="bcs-perm-tip">自行核对：在源码里搜索 <code>GM_cookie.set(</code> —— 只有 1 处（第 321 行附近）；
      搜索 <code>GM_cookie.list(</code> / <code>.get(</code> / <code>.delete(</code> —— 0 处。
      除了这一处写入，其它出现的地方都只是注释和这段文字本身。</p>
      </div>`;

    const rows = [
      ['hijackTopSearch', '接管顶部搜索框', '回车与搜索按钮走自定义面板'],
      ['killDropdown', '屏蔽搜索框下拉推荐', '隐藏历史记录、猜你想搜、大家都在搜'],
      ['hotkey', 'Alt + K 唤出面板', ''],
      ['suggest', '显示搜索建议', '输入时展示官方 suggest 词'],
      ['openInNewTab', '结果在新标签打开', ''],
      ['saveHistory', '保存本地搜索历史', '原生历史被屏蔽后，用这个替代'],
      ['strict', '严格过滤不相关结果', '标题未命中任何关键词的结果直接剔除'],
      ['showEntry', '右下角常驻入口按钮', '接管失败时会自动兜底出现']
    ];
    settingsEl.innerHTML = permHtml + rows.map(([k, label, desc]) => `
      <div class="bcs-set-row" data-key="${k}">
        <span>${label}${desc ? `<em>${desc}</em>` : ''}</span>
        <input type="checkbox" ${cfg[k] ? 'checked' : ''}>
      </div>`).join('') + `
      <div class="bcs-set-row" data-key="defaultType"><span>默认搜索类型</span>
        <select>${TYPES.map(t => `<option value="${t.key}" ${cfg.defaultType === t.key ? 'selected' : ''}>${t.label}</option>`).join('')}</select></div>
      <div class="bcs-set-row" data-key="defaultOrder"><span>默认排序</span>
        <select>${ORDERS.map(o => `<option value="${o.key}" ${cfg.defaultOrder === o.key ? 'selected' : ''}>${o.label}</option>`).join('')}</select></div>
      <div class="bcs-set-row" data-key="pageSize"><span>每页条数</span>
        <select>${[20, 30, 50].map(n => `<option value="${n}" ${cfg.pageSize === n ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
      <div class="bcs-set-row" data-key="theme"><span>主题</span>
        <select>${[['auto', '跟随系统'], ['light', '浅色'], ['dark', '深色']].map(([v, l]) => `<option value="${v}" ${cfg.theme === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div class="bcs-set-row" data-key="fallback"><span>接口失败兜底</span>
        <select>${[['bilibili', 'B站原版'], ['google', 'Google'], ['bing', 'Bing'], ['none', '不跳转']].map(([v, l]) => `<option value="${v}" ${cfg.fallback === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div class="bcs-set-row" data-key="blockWords"><span>全局屏蔽词<em>命中任一词的结果直接剔除，逗号或回车分隔</em></span>
        <input type="text" style="width:220px" value="${escapeHtml(cfg.blockWords.join('，'))}"></div>
      <div class="bcs-set-row" data-key="blockUps"><span>已屏蔽的 UP 主<em>点 ✕ 恢复</em></span>
        <span>${cfg.blockUps.length ? cfg.blockUps.map(m => `<span class="bcs-tag"><b>${escapeHtml(m)}</b><i data-mid="${escapeHtml(m)}">✕</i></span>`).join('') : '<span style="color:var(--bcs-sub);font-size:12px">无</span>'}</span></div>
      <div class="bcs-set-row"><span>筛选预设<em>★ 设为该类目默认 · ✎ 重命名 · ✕ 删除；默认预设会在每次打开面板时自动套用</em></span>
        <span class="bcs-preset-list">${presets.length ? presets.map(p => `<span class="bcs-tag"><i data-pact="def" data-pid="${escapeHtml(p.id)}" title="设为默认">${p.def ? '★' : '☆'}</i><b>${escapeHtml(p.name)}</b><em style="font-style:normal">${typeLabel(p.type)}</em><i data-pact="ren" data-pid="${escapeHtml(p.id)}">✎</i><i data-pact="del" data-pid="${escapeHtml(p.id)}">✕</i></span>`).join('') : '<span style="color:var(--bcs-sub);font-size:12px">还没有预设，去筛选栏点「＋ 保存当前」</span>'}</span></div>
      <div class="bcs-set-row"><span style="color:var(--bcs-sub)">版本 2.1.3 · AI 辅助编写 · 数据直连 B 站官方接口，不经过任何第三方服务器</span>
        <button class="bcs-toggle" data-act="reset">恢复默认</button></div>`;

    settingsEl.querySelectorAll('.bcs-set-row[data-key]').forEach(row => {
      const k = row.dataset.key;
      const ctl = row.querySelector('input,select');
      if (!ctl || !ctl.addEventListener) return;
      ctl.addEventListener('change', () => {
        if (ctl.type === 'checkbox') cfg[k] = ctl.checked;
        else if (k === 'pageSize') cfg[k] = Number(ctl.value);
        else if (k === 'blockWords') cfg[k] = ctl.value.split(/[,，\n]/).map(s => s.trim()).filter(Boolean);
        else cfg[k] = ctl.value;
        saveCfg();
        applyCfg();
        if (k === 'strict') strictBtn.classList.toggle('on', cfg.strict);
        // 这些项会影响结果集，关掉设置面板时自动重搜
        if (['strict', 'blockWords', 'pageSize', 'defaultOrder'].indexOf(k) >= 0) pendingRerun = true;
      });
    });
    settingsEl.querySelectorAll('[data-mid]').forEach(i => {
      i.addEventListener('click', () => {
        cfg.blockUps = cfg.blockUps.filter(m => m !== i.dataset.mid);
        saveCfg();
        renderSettings();
      });
    });
    settingsEl.querySelectorAll('[data-pact]').forEach(el => {
      el.addEventListener('click', () => {
        const p = presets.filter(x => x.id === el.dataset.pid)[0];
        if (!p) return;
        const act = el.dataset.pact;
        if (act === 'del') {
          if (!confirm('删除预设「' + p.name + '」？')) return;
          presets = presets.filter(x => x.id !== p.id);
        } else if (act === 'ren') {
          const n = (prompt('重命名预设', p.name) || '').trim();
          if (n) p.name = n; else return;
        } else if (act === 'def') {
          presets.forEach(x => { if ((x.type || 'video') === (p.type || 'video')) x.def = false; });
          p.def = true;
        }
        savePresets();
        syncPresetSelect();
        renderSettings();
      });
    });
    const rst = settingsEl.querySelector('[data-act=reset]');
    if (rst) rst.addEventListener('click', () => {
      cfg = Object.assign({}, DEFAULT_CFG);
      saveCfg();
      applyCfg();
      renderSettings();
    });
    settingsEl.hidden = false;
  }

  function applyCfg() {
    const dark = cfg.theme === 'dark' ||
      (cfg.theme === 'auto' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    root.classList.toggle('bcs-dark', dark);
    if (strictBtn) strictBtn.classList.toggle('on', cfg.strict);
    renderEntry();
  }

  /* =======================================================================
   * 10. 开关与入口
   * ===================================================================== */
  function openPanel(kw) {
    const isOpen = !root.hidden;
    root.hidden = false;
    document.body.classList.add('bcs-lock');
    applyCfg();
    // 每次打开都套用该类型的默认预设，省得反复手调
    const dp = defaultPreset(state.type);
    if (dp) applyPreset(dp, false);
    else syncPresetSelect();
    if (kw !== undefined && kw !== null) input.value = kw;
    input.focus();
    input.select();
    if (kw) {
      state.kw = kw.trim();
      state.mode = 'result';
      runSearch(true);
    } else if (!isOpen && !state.kw) {
      clearList();
      showHome();
      renderFoot();
    }
  }
  function closePanel() {
    root.hidden = true;
    document.body.classList.remove('bcs-lock');
    try { document.activeElement && document.activeElement.blur(); } catch (e) { }
  }

  let entryBtn = null;
  function renderEntry() {
    const need = cfg.showEntry || !hijackOk;
    if (need && !entryBtn) {
      entryBtn = document.createElement('button');
      entryBtn.className = 'bcs-entry';
      entryBtn.title = 'B站自定义搜索（Alt+K）';
      entryBtn.textContent = '🔍';
      entryBtn.addEventListener('click', () => openPanel(''));
      document.documentElement.appendChild(entryBtn);
    } else if (!need && entryBtn) {
      entryBtn.remove(); entryBtn = null;
    }
  }

  /* =======================================================================
   * 11. 接管原生搜索框
   * ===================================================================== */
  const SEARCH_SELECTORS = [
    '.center-search-container input.nav-search-input',
    '.nav-search-container input.nav-search-input',
    'input.nav-search-input',
    'input#search-keyword',
    '#nav-searchform input',
    '#nav_searchform input',
    '.search-input-el'
  ];
  const DROPDOWN_SELECTORS = [
    '.nav-search-panel', '.header-search-panel', '.recommend-panel',
    '.nav-search-content .history', '.center-search-container .history'
  ];
  let hijackOk = false;

  function isVisible(el) {
    return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
  }
  function findInput() {
    let fallback = null;
    for (const s of SEARCH_SELECTORS) {
      const el = document.querySelector(s);
      if (!el) continue;
      if (isVisible(el)) return el;
      if (!fallback) fallback = el;
    }
    return fallback;
  }

  function hijack() {
    if (!cfg.hijackTopSearch) return;
    const inputEl = findInput();
    if (!inputEl || inputEl.dataset.bcsBound) return;
    inputEl.dataset.bcsBound = '1';
    hijackOk = true;
    inputEl.setAttribute('autocomplete', 'off');

    // 捕获阶段拦截：B 站的 Vue 监听器收不到事件，热搜/历史下拉不会再弹出
    inputEl.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopImmediatePropagation();
        openPanel(inputEl.value.trim());
      }
    }, true);
    if (cfg.killDropdown) {
      inputEl.addEventListener('input', e => e.stopImmediatePropagation(), true);
      inputEl.addEventListener('focus', e => e.stopImmediatePropagation(), true);
    }

    const form = inputEl.closest('form') || inputEl.closest('.nav-search-form') || inputEl.closest('.center-search-container');
    if (form) {
      form.addEventListener('submit', e => {
        e.preventDefault();
        e.stopImmediatePropagation();
        openPanel(inputEl.value.trim());
      }, true);
      const btn = form.querySelector('.nav-search-btn, .search-btn, button[type=submit]');
      if (btn) btn.addEventListener('click', e => {
        e.preventDefault(); e.stopImmediatePropagation();
        openPanel(inputEl.value.trim());
      }, true);
    }
    renderEntry();
  }

  function killDropdownStatic() {
    if (!cfg.killDropdown) return;
    if (location.hostname === 'search.bilibili.com') return;
    DROPDOWN_SELECTORS.forEach(sel => {
      document.querySelectorAll(sel).forEach(el => { el.style.display = 'none'; });
    });
  }

  /* =======================================================================
   * 12. 启动
   * ===================================================================== */
  function boot() {
    buildUI();
    applyCfg();
    const dp0 = defaultPreset(state.type);
    if (dp0) applyPreset(dp0, false);
    hijack();
    killDropdownStatic();

    document.addEventListener('keydown', e => {
      if (cfg.hotkey && e.altKey && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        if (root.hidden) openPanel(''); else closePanel();
      }
      if (!root.hidden && e.key === 'Escape') closePanel();
    }, true);

    let pending = false;
    const onDom = () => {
      if (pending) return;
      pending = true;
      setTimeout(() => { pending = false; hijack(); killDropdownStatic(); }, 300);
    };
    new MutationObserver(onDom).observe(document.documentElement, { childList: true, subtree: true });

    setTimeout(() => renderEntry(), 8000);

    GM_registerMenuCommand('⚙️ B站自定义搜索 · 设置', () => {
      openPanel('');
      renderSettings();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
