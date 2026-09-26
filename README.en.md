# Bilibili-Search-Replace

> Replace Bilibili's native search with a custom panel: **official API + local relevance re-ranking**, so results stop being padded with loosely-matched and promoted content.

[中文版](README.md)

> 🤖 **Authorship**: this script's code was **generated with AI assistance**, not hand-written word by word, and it has **not gone through a full human code review** — the author did not verify every line. There may therefore be undiscovered edge cases or defects; use your own judgement. The source is fully public; please [open an issue](https://github.com/saiyajiang/Bilibili-Search-Replace/issues) if you find anything.

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

---

## ⚠️ About the Cookie permission (please read before installing)

**Tampermonkey will warn that this script requests Cookie access. That is a high-sensitivity permission and you deserve to know exactly what it is used for.**

**The single purpose:** when Bilibili returns risk-control codes `-412 (request intercepted)` / `-352 (insufficient risk level)`, the script calls Bilibili's own fingerprint endpoint `/x/frontend/finger/spi`, takes the device id `b_3` from the response, and writes it into a cookie named `buvid3` (domain `.bilibili.com`, 1 year) so subsequent search requests pass validation. This is exactly what Bilibili itself does the first time you visit from a new device.

**What it does NOT do** (all verifiable):

| Boundary | Detail |
|---|---|
| **Write-only** | There is exactly one `GM_cookie.set()` call in the whole file. **No** `GM_cookie.list` / `get` / `delete` — so the script **cannot read** your login session or any other cookie |
| **Nothing sent out** | The written value comes straight from bilibili.com's own response; the script does not construct, log or transmit it |
| **No third-party server** | Every request goes to `api.bilibili.com` / `s.search.bilibili.com`. No other domain appears in the code |
| **Not persistent** | Runs once, only when risk control actually triggers — at most once per page lifetime |

**Verify it yourself** — search the source:

| Search for | Result |
|---|---|
| `GM_cookie.set(` | **1 hit** (the write described above) |
| `GM_cookie.list(` / `.get(` / `.delete(` | **0 hits** |

Aside from that single write, every other occurrence of `GM_cookie` in the file is a comment or this explanatory text.

**Don't want the permission?** Delete this line from the script header and it's gone entirely:

```js
// @grant        GM_cookie
```

The code is guarded by `typeof GM_cookie === 'undefined'`, so **everything else keeps working**. The only difference: on `-412 / -352` it cannot auto-recover, and the script will tell you to open www.bilibili.com once manually.

## Install

| Source | Link |
|---|---|
| **Greasy Fork** | <https://greasyfork.org/zh-CN/scripts/597082> |
| GitHub source | [Bilibili-Search-Replace.user.js](Bilibili-Search-Replace.user.js) |

1. Install [Tampermonkey](https://www.tampermonkey.net/) (or Violentmonkey / Greasemonkey).
2. Install from the Greasy Fork page above, or open the `.user.js` file on GitHub.
3. The cookie permission is **optional** — the script works either way. If you'd rather not grant it, delete the `@grant GM_cookie` line before installing.

## Why

Bilibili's default **综合排序 (`totalrank`)** mixes in promoted slots and loose token matches — searching `赛博朋克2077` returns anything containing `赛博朋克`. Changing the UI alone doesn't fix that.

This script splits the job in two: the official API is only a **data source**, and relevance is **re-judged locally**:

- **Strict filtering** (on by default): the title must match **every** keyword (AND) — missing even one drops it.
- **Relevance ranking** (default order): re-scores by how well the title / UP matches, instead of trusting the server order.
- When filtering removes too much, the script auto-fetches more pages (up to 6) to **widen the sample** — but it never **lowers the bar**. If nothing matches, the list is genuinely empty.
- An empty result explains which keyword combination was not satisfied and offers a one-click "turn off strict filtering and search again".
- **Results are de-duplicated**: the default ordering repeats items across pages, so results are de-duplicated by bvid across every fetched page.

## Features

| | |
|---|---|
| **Search types** | Video · UP · Live · Movie/TV · Anime |
| **Filters** | Time range (24h / week / month / 3 months / year / custom date range), danmaku count, play count, duration, category (18 top-level), UP followers, live viewers |
| **Presets** | Save any filter combo as a named preset; mark one as default per search type — auto-applied every time the panel opens |
| **Query syntax** | `-word` exclude · `"exact phrase"` · `up:name` · direct jump via `BV...` / `av123` / `uid123` / `room123` |
| **Track UP** | Weight an UP without following them: their videos get a score boost under relevance ranking; the boost strength is configurable |
| **Blocking** | Per-result hover buttons to block an UP (**with a confirm step**) or a word; lists in settings show **both nickname and UID** |
| **Config backup** | Export everything to a JSON file (settings, presets, block/track lists, history) and import it back; also available from the Tampermonkey menu |
| **History** | Native dropdown (history / trending / suggestions) is suppressed; the script keeps its own local history — **uncommitted IME pinyin is never recorded** |
| **Hot search toggle** | Bilibili trending search is **off by default** (it needs an extra request); enable it from the empty-state panel or in settings |
| **Opening it** | A **persistent button** bottom-right (switchable to bottom-left), shown by default; hotkey defaults to `Alt+K` and is **fully customizable** (click the field in settings, then just press the combo) |
| **Keyboard** | `↑↓` select · `Enter` open · `Ctrl+Enter` / middle-click new tab · `Esc` close |
| **Theming** | Auto / light / dark |

### Opening the panel

- **Persistent button**: shown bottom-right by default (can move to bottom-left in settings), styled to match Bilibili's own floating buttons (pink, rounded, line icon). When a hotkey collides with something else, this is the reliable way in.
- **Customizable hotkey**: defaults to `Alt+K`, which browsers and other extensions often grab. In settings, click the "Custom hotkey" field and **just press** the combo you want (`Ctrl+Shift+K`, `Ctrl+,`, ...). `Backspace` clears it, `Esc` cancels recording.
- Matching uses `KeyboardEvent.code` (physical key), so things like `Option+K` on macOS still work instead of turning into a stray character. Modifiers must match exactly — an extra or missing modifier won't trigger it.
- Browser-reserved combos (e.g. `Ctrl+T`, `Ctrl+W`) show a warning, since the browser may swallow them.
- The hotkey is ignored while the search input is focused, so it never interferes with typing.

### Tracking UPs (weight without following)

The follow list is account-level; many people don't want to follow someone just to change ordering. Tracking is a **local** list:

- Hover a result and click "Track UP" to add it (click again to remove).
- Under **relevance** ranking, videos from tracked UPs get a score boost and rank higher.
- The boost strength is configurable (0 / +5 / +10 / +15 / +25 / +40). "No boost" only adds a star marker without changing order.
- Tracking and blocking are mutually exclusive: blocking an UP removes it from the tracked list.
- Lists show **both nickname and UID**, so you never have to guess who a bare number is.

### Config backup

The settings panel has a "Config backup" row that exports everything to a JSON file: script settings, filter presets, block and track lists (with nicknames), and search history.

- Export builds the file locally and triggers a download — **no network involved**.
- Use "Import from file" after reinstalling the script or moving to another browser/machine; you get a summary and a confirm step first.
- Also available as "💾 Export config backup (JSON)" in the Tampermonkey menu.

### Filter fallback design

Time, duration and category are sent **both** as server params (`pubtime_begin_s`, `duration`, `tids`) **and** re-validated locally against `pubdate` / seconds / `typeid`. If Bilibili renames a parameter, filtering still works.

Note: **danmaku count and play count have no server-side parameter** in the public search API — those two are filtered purely client-side, which is why auto-pagination matters for them.

Category filtering maps **sub-category → top-level category** before comparing. Search results carry sub-category ids (e.g. `17` = single-player game) while the dropdown selects top-level (`4` = games); unknown ids are always passed through so filters can never empty the list.

## Privacy

- Requests go **directly to `api.bilibili.com`**, using your own browser cookies. **No third-party server, no proxy, no telemetry.**
- Search history, filter presets and block lists are stored locally via `GM_setValue` and never uploaded.
- WBI signing (required by Bilibili since 2023) is computed locally; the MD5 implementation is bundled, with **no CDN dependency**.

## Permissions

| Grant | Why |
|---|---|
| `GM_xmlhttpRequest` | Call Bilibili search / suggest APIs cross-origin (the hotword endpoint is only hit if you manually enable "Show hot search") |
| `GM_addStyle` | Inject panel styles |
| `GM_setValue` / `GM_getValue` | Persist settings, history, presets, WBI key cache |
| `GM_registerMenuCommand` | Tampermonkey menu entry |
| `GM_cookie` | **Optional.** Writes a `buvid3` device-id cookie only on risk-control errors `-412 / -352` (write-only, never reads). Delete the line to drop the permission entirely — see "About the Cookie permission" above |

## Compatibility

Tested with Tampermonkey on Chromium and Firefox. The top search box is bound in the **capture phase** with `stopImmediatePropagation`, so Bilibili's own Vue listeners never fire (no native dropdown, no redirect to `search.bilibili.com`). A `MutationObserver` + periodic re-bind handles SPA re-renders; if the selectors ever break after a site redesign, a floating fallback button appears bottom-right.

## Changelog

- **2.4.2** — Corrected an inaccurate authorship claim (it said the author had reviewed every line and verified in a real environment, which was not the case); fixed **uncommitted IME pinyin being searched and saved to history**: input is not processed during composition, and existing pinyin leftovers can be cleaned from the history in one click.
- **2.4.1** — Fixed **duplicate results**: Bilibili's default ordering repeats the same video across pages, and strict filtering fetches several pages per search, so the same item showed up multiple times. Results are now de-duplicated across pages by business id (bvid / mid / roomid), with a "N duplicates removed" counter.
- **2.4.0** — **Strict filtering is now AND**: the title must match every keyword, missing one drops it (previously matching any one keyword was enough, so an FGO video that only mentioned 河上彦斋 survived a search for 河上彦斋 浪人崛起). UP-name-only matches no longer count. If nothing matches, the list is empty with a one-click way to relax it.
- **2.3.0** — Persistent entry button **shown by default** and restyled to match Bilibili (pink, rounded, line icon; can move to bottom-left); **customizable hotkey** (defaults to Alt+K, click the field and press your combo, with a warning for browser-reserved keys); fixed typed text being wiped when re-opening the panel.
- **2.2.0** — Hot search entry removed from the idle panel (toggle now lives only in settings); blocking an UP asks for confirmation; settings notices get an "I understand" button (expanded first time, collapsed once acknowledged); block/track lists show nickname + UID; **config export/import**; **Track UP** feature.
- **2.1.4** — Bilibili hot search is now **off by default** and behind a toggle: no hotword request is made while it's off. Turn it on via "Show hot search" in settings.
- **2.1.3** — Disclosed that the code is AI-assisted (leading notice in `@description`, in-script "🤖 Authorship" section, and README note).
- **2.1.2** — Cookie permission notice added to `@description` (shown on the Greasy Fork page); new in-script "🔐 Permission" section plus a footer entry; clear user-facing message when risk control blocks the request.
- **2.1.1** — Removed leftover author metadata from the script; repo and script renamed to `Bilibili-Search-Replace`.
- **2.1.0** — Fix `<em class="keyword">` leaking as plain text in titles (highlight now splits on tags before escaping); fix category filter returning zero results (dropped the conflicting `tid` param + added sub→top-level category mapping); thumbnail aspect ratio 16:10 → 16:9; **filter presets** with per-type defaults.
- **2.0.0** — Local relevance re-ranking and strict filtering; time / danmaku / play / duration / category filters; query syntax (`-word`, `"phrase"`, `up:`); local history; UP & word blocking.
- **1.2.0** — Initial release: WBI-signed official API, custom panel, keyboard flow.

## License

MIT — see [LICENSE](LICENSE).
