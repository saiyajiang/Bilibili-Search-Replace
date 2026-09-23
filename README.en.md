# Bilibili-Search-Replace

> Replace Bilibili's native search with a custom panel: **official API + local relevance re-ranking**, so results stop being padded with loosely-matched and promoted content.

[中文版](README.md)

> 🤖 **Authorship**: this script's code was **generated with AI assistance**, not hand-written word by word. The author read through the entire source and verified the core functionality in a real browser before publishing. AI-generated code may still contain edge cases that were not covered — use your own judgement. The source is fully public and reviewable; please [open an issue](https://github.com/saiyajiang/Bilibili-Search-Replace/issues) if you find anything.

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
| **Hot search toggle** | Bilibili trending search is **off by default** (it needs an extra request); enable it from the empty-state panel or in settings |
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
| `GM_xmlhttpRequest` | Call Bilibili search / suggest APIs cross-origin (the hotword endpoint is only hit if you manually enable "Show hot search") |
| `GM_addStyle` | Inject panel styles |
| `GM_setValue` / `GM_getValue` | Persist settings, history, presets, WBI key cache |
| `GM_registerMenuCommand` | Tampermonkey menu entry |
| `GM_cookie` | **Optional.** Writes a `buvid3` device-id cookie only on risk-control errors `-412 / -352` (write-only, never reads). Delete the line to drop the permission entirely — see "About the Cookie permission" above |

## Compatibility

Tested with Tampermonkey on Chromium and Firefox. The top search box is bound in the **capture phase** with `stopImmediatePropagation`, so Bilibili's own Vue listeners never fire (no native dropdown, no redirect to `search.bilibili.com`). A `MutationObserver` + periodic re-bind handles SPA re-renders; if the selectors ever break after a site redesign, a floating fallback button appears bottom-right.

## Changelog

- **2.1.4** — Bilibili hot search is now **off by default** and behind a toggle: no hotword request is made while it's off. Turn it on from the idle panel button or via "Show hot search" in settings.
- **2.1.3** — Disclosed that the code is AI-assisted (leading notice in `@description`, in-script "🤖 Authorship" section, and README note).
- **2.1.2** — Cookie permission notice added to `@description` (shown on the Greasy Fork page); new in-script "🔐 Permission" section plus a footer entry; clear user-facing message when risk control blocks the request.
- **2.1.1** — Removed leftover author metadata from the script; repo and script renamed to `Bilibili-Search-Replace`.
- **2.1.0** — Fix `<em class="keyword">` leaking as plain text in titles (highlight now splits on tags before escaping); fix category filter returning zero results (dropped the conflicting `tid` param + added sub→top-level category mapping); thumbnail aspect ratio 16:10 → 16:9; **filter presets** with per-type defaults.
- **2.0.0** — Local relevance re-ranking and strict filtering; time / danmaku / play / duration / category filters; query syntax (`-word`, `"phrase"`, `up:`); local history; UP & word blocking.
- **1.2.0** — Initial release: WBI-signed official API, custom panel, keyboard flow.

## License

MIT — see [LICENSE](LICENSE).
