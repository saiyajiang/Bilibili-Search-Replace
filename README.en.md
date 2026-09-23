# Bilibili-Search-Replace

> Replace Bilibili's native search with a custom panel: **official API + local relevance re-ranking**, so results stop being padded with loosely-matched and promoted content.

[中文版](README.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

---

## Install

| Source | Link |
|---|---|
| **Greasy Fork** | <https://greasyfork.org/zh-CN/scripts/597082> |
| GitHub source | [Bilibili-Search-Replace.user.js](Bilibili-Search-Replace.user.js) |

1. Install [Tampermonkey](https://www.tampermonkey.net/) (or Violentmonkey / Greasemonkey).
2. Install from the Greasy Fork page above, or open the `.user.js` file on GitHub.
3. **Recommended:** grant Tampermonkey cookie access. It is used only to seed `buvid3` when Bilibili returns risk-control codes `-412 / -352`. Everything works without it, minus that auto-recovery.

## Why

Bilibili's default **综合排序 (`totalrank`)** mixes in promoted slots and loose token matches — searching `赛博朋克2077` returns anything containing `赛博朋克`. Changing the UI alone doesn't fix that.

This script splits the job in two: the official API is only a **data source**, and relevance is **re-judged locally**:

- **Strict filtering** (on by default): a result whose title matches none of the keywords is dropped outright.
- **Relevance ranking** (default order): re-scores by how well the title / UP matches, instead of trusting the server order.
- When filtering removes too much, the script auto-fetches more pages (up to 6) to refill the list — so narrowing filters doesn't empty the page.

## Features

| | |
|---|---|
| **Search types** | Video · UP · Live · Movie/TV · Anime |
| **Filters** | Time range (24h / week / month / 3 months / year / custom date range), danmaku count, play count, duration, category (18 top-level), UP followers, live viewers |
| **Presets** | Save any filter combo as a named preset; mark one as default per search type — auto-applied every time the panel opens |
| **Query syntax** | `-word` exclude · `"exact phrase"` · `up:name` · direct jump via `BV...` / `av123` / `uid123` / `room123` |
| **Blocking** | Per-result hover buttons to block an UP or a word; global block lists in settings |
| **History** | Native dropdown (history / trending / suggestions) is suppressed; the script keeps its own local history |
| **Keyboard** | `Alt+K` open · `↑↓` select · `Enter` open · `Ctrl+Enter` / middle-click new tab · `Esc` close |
| **Theming** | Auto / light / dark |

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
| `GM_xmlhttpRequest` | Call Bilibili search / suggest / hotword APIs cross-origin |
| `GM_addStyle` | Inject panel styles |
| `GM_setValue` / `GM_getValue` | Persist settings, history, presets, WBI key cache |
| `GM_registerMenuCommand` | Tampermonkey menu entry |
| `GM_cookie` | Seed `buvid3` on risk-control errors (optional) |

## Compatibility

Tested with Tampermonkey on Chromium and Firefox. The top search box is bound in the **capture phase** with `stopImmediatePropagation`, so Bilibili's own Vue listeners never fire (no native dropdown, no redirect to `search.bilibili.com`). A `MutationObserver` + periodic re-bind handles SPA re-renders; if the selectors ever break after a site redesign, a floating fallback button appears bottom-right.

## Changelog

- **2.1.1** — Removed leftover author metadata from the script; repo and script renamed to `Bilibili-Search-Replace`.
- **2.1.0** — Fix `<em class="keyword">` leaking as plain text in titles (highlight now splits on tags before escaping); fix category filter returning zero results (dropped the conflicting `tid` param + added sub→top-level category mapping); thumbnail aspect ratio 16:10 → 16:9; **filter presets** with per-type defaults.
- **2.0.0** — Local relevance re-ranking and strict filtering; time / danmaku / play / duration / category filters; query syntax (`-word`, `"phrase"`, `up:`); local history; UP & word blocking.
- **1.2.0** — Initial release: WBI-signed official API, custom panel, keyboard flow.

## License

MIT — see [LICENSE](LICENSE).
