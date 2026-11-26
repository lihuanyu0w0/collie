/* Collie — web console + super-agent for herdr. No build step, no framework. */
(() => {
  "use strict";

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const store = {
    get(k, d) { try { const v = localStorage.getItem("collie." + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem("collie." + k, JSON.stringify(v)); } catch {} },
  };
  const narrow = () => matchMedia("(max-width: 760px)").matches;
  const AGENT_LABEL = { claude: "Claude Code", codex: "Codex", agy: "Antigravity", doubao: "Doubao" };
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const tilde = (p) => (p || "").replace(/^\/Users\/[^/]+|^\/home\/[^/]+/, "~");
  const FMT_HHMM = typeof Intl !== "undefined" ? new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }) : null;
  const FMT_MD = typeof Intl !== "undefined" ? new Intl.DateTimeFormat(undefined, { month: "numeric", day: "numeric" }) : null;
  const FMT_FULL = typeof Intl !== "undefined" ? new Intl.DateTimeFormat(undefined, { year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : null;
  const _hhmmCache = new Map();
  const _fullTimeCache = new Map();
  const _mdCache = new Map();
  let _dayBoundsAt = 0, _todayStart = 0, _yestStart = 0, _tomorrowStart = 0, _dayStamp = "";
  function dayBounds() {
    const now = Date.now();
    if (now >= _tomorrowStart || now - _dayBoundsAt > 30000 || !_todayStart) {
      const d = new Date(now);
      d.setHours(0, 0, 0, 0);
      _todayStart = d.getTime();
      _yestStart = _todayStart - 86400e3;
      _tomorrowStart = _todayStart + 86400e3;
      _dayBoundsAt = now;
      _dayStamp = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    }
    return _dayStamp;
  }
  const hhmm = (t) => {
    const ms = typeof t === "number" ? t : +new Date(t);
    if (!Number.isFinite(ms)) return "";
    const min = Math.floor(ms / 60000);
    let out = _hhmmCache.get(min);
    if (out === undefined) {
      const d = new Date(ms);
      out = FMT_HHMM ? FMT_HHMM.format(d) : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      if (_hhmmCache.size > 4000) _hhmmCache.clear();
      _hhmmCache.set(min, out);
    }
    return out;
  };
  // 21:52 today, 昨天 18:30, 11月18日 18:30 before that.
  const sepTime = (t) => {
    const ms = typeof t === "number" ? t : +new Date(t);
    if (!Number.isFinite(ms)) return "";
    dayBounds();
    const hm = hhmm(ms);
    if (ms >= _todayStart && ms < _tomorrowStart) return hm;
    if (ms >= _yestStart && ms < _todayStart) return "昨天 " + hm;
    const d = new Date(ms);
    return `${d.getMonth() + 1}月${d.getDate()}日 ${hm}`;
  };
  const fullTime = (t) => {
    const ms = typeof t === "number" ? t : +new Date(t);
    if (!Number.isFinite(ms)) return "";
    const min = Math.floor(ms / 60000);
    let out = _fullTimeCache.get(min);
    if (out === undefined) {
      const d = new Date(ms);
      out = FMT_FULL ? FMT_FULL.format(d) : d.toLocaleString([], { year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
      if (_fullTimeCache.size > 4000) _fullTimeCache.clear();
      _fullTimeCache.set(min, out);
    }
    return out;
  };
  const when = (t) => {
    const ms = typeof t === "number" ? t : +new Date(t);
    if (!Number.isFinite(ms)) return "";
    dayBounds();
    if (ms >= _todayStart && ms < _tomorrowStart) return hhmm(ms);
    const day = Math.floor(ms / 86400000);
    let mdStr = _mdCache.get(day);
    if (mdStr === undefined) {
      const d = new Date(ms);
      mdStr = FMT_MD ? FMT_MD.format(d) : d.toLocaleDateString([], { month: "numeric", day: "numeric" });
      if (_mdCache.size > 500) _mdCache.clear();
      _mdCache.set(day, mdStr);
    }
    return mdStr + " " + hhmm(ms);
  };
  const setHTML = (el, html) => {
    if (!el) return false;
    if (el._html === html) return false;
    el._html = html;
    el.innerHTML = html;
    return true;
  };
  const setText = (el, txt) => {
    if (!el) return;
    const s = String(txt ?? "");
    if (el.textContent !== s) el.textContent = s;
  };

  // ───────────────────────────── icons & labels
  const GLYPHS = {
    claude: '<svg viewBox="0 0 32 32"><path d="M16 5v22M5 16h22M8.2 8.2l15.6 15.6M23.8 8.2L8.2 23.8"/></svg>',
    codex: '<svg viewBox="0 0 32 32"><path d="M16 4l10.4 6v12L16 28 5.6 22V10z"/><path d="M13 13l-3 3 3 3M19 13l3 3-3 3"/></svg>',
    agy: '<svg viewBox="0 0 32 32"><ellipse cx="16" cy="16" rx="11" ry="5" transform="rotate(-30 16 16)"/><path d="M16 21V9M12 13l4-4 4 4"/></svg>',
    doubao: '<svg viewBox="0 0 32 32"><path d="M16 5c5.8 0 10 4.2 10 10.2C26 21.8 21.8 27 16 27S6 21.8 6 15.2C6 9.2 10.2 5 16 5z"/><circle cx="12.5" cy="14.5" r="1.4" fill="currentColor" stroke="none"/><circle cx="19.5" cy="14.5" r="1.4" fill="currentColor" stroke="none"/><path d="M12.5 19.5c1.1 1.1 2.2 1.6 3.5 1.6s2.4-.5 3.5-1.6"/></svg>',
    agent: '<svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="10"/><path d="M12 15h.01M20 15h.01M12 20c2.4 1.8 5.6 1.8 8 0"/></svg>',
    shell: '<svg viewBox="0 0 32 32"><rect x="4" y="6" width="24" height="20" rx="3"/><path d="M9 13l4 3-4 3M15 20h7"/></svg>',
    collie: '<img src="icon.svg" alt="" style="width:20px;height:20px">',
  };
  const KIND_LABEL = { claude: "claude", codex: "codex", agy: "antigravity", antigravity: "antigravity", doubao: "doubao" };
  const STATUS_LABEL = {
    idle: "空闲", working: "工作中", waiting: "在等后台任务", blocked: "等你确认", done: "已完成", unknown: "运行中", shell: "终端",
    asleep: "休眠中", starting: "启动中", gone: "已退出", failed: "启动失败",
  };
  const ROUTER = "collie";
  // Collie is one conversation to the human; the session behind it is an
  // implementation detail. "done" just means a turn ended: it is idle.
  const COLLIE_STATUS = { asleep: "休眠中", starting: "正在唤醒", working: "在想…", blocked: "等你确认", failed: "出错了", dreaming: "在做梦…" };
  const SOURCE_LABEL = { worker: "派出的 agent", chat: "对话", timer: "定时", system: "Collie" };
  const collieStatus = (s) => COLLIE_STATUS[s] || "空闲";
  const collieDot = (s) => (s === "done" || s === "unknown" ? "idle" : s === "dreaming" ? "starting" : s || "asleep");
  const glyph = (v) => v.name === ROUTER ? GLYPHS.collie : !v.is_agent ? GLYPHS.shell : (GLYPHS[v.kind] || GLYPHS.agent);

  // ───────────────────────────── api
  // A page left open keeps its old code after the hub is updated: when the
  // hub reports a different web app, offer a reload (once).
  let webBuild = null;
  function noteBuild(v) {
    if (!v) return;
    if (webBuild === null) { webBuild = v; return; }
    if (v === webBuild || updateFlow.phase === "restarting" || document.getElementById("update-bar")) return;
    const bar = document.createElement("button");
    bar.id = "update-bar"; bar.type = "button";
    bar.textContent = "Collie 有新版本，点这里刷新";
    bar.onclick = () => location.reload();
    document.body.append(bar);
  }
  // ───────────────────────────── other hubs
  // Hubs on networks that can't reach each other (a devbox, a cloud
  // computer, a Mac mini at home) can all be reached from this browser.
  // Their sessions join this sidebar with every id tagged "!<key>"; any
  // request that names a tagged id goes straight to that hub, with its token.
  let hubs = [];              // [{ key, name, url, token }], kept on this hub
  const remote = new Map();   // key -> { state, ext, hist, online, es }
  const tagged = (v, k) => (v || "") + "!" + k;
  const hubMarks = (h) => ["!" + h.key, "%21" + h.key];
  const hubOf = (text) => hubs.find((h) => hubMarks(h).some((m) => text.includes(m))) || null;
  const untag = (text, h) => hubMarks(h).reduce((t, m) => t.split(m).join(""), text);
  const hubName = (k) => hubs.find((h) => h.key === k)?.name || "";
  function routeReq(path, body, hub) {
    const b = body === undefined ? undefined : JSON.stringify(body);
    const h = hub || hubOf(path + (b || ""));
    if (!h) return { url: path, body: b, hub: null };
    return { url: h.url + untag(path, h), body: b && untag(b, h), hub: h };
  }
  // Ids in a remote hub's answers get its tag, so follow-up requests route back.
  function tagIds(v, k, depth = 0) {
    if (depth > 3 || !v || typeof v !== "object") return v;
    if (Array.isArray(v)) return v.map((x) => tagIds(x, k, depth + 1));
    const out = { ...v };
    for (const f of ["pane_id", "workspace_id"]) if (typeof out[f] === "string" && out[f]) out[f] = tagged(out[f], k);
    if (typeof out.machine === "string") out.machine = tagged(out.machine, k);
    for (const [f, x] of Object.entries(out)) if (x && typeof x === "object") out[f] = tagIds(x, k, depth + 1);
    return out;
  }
  function timeoutSignal(ms) {
    if (!(ms > 0)) return { signal: undefined, clear() {} };
    if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
      return { signal: AbortSignal.timeout(ms), clear() {} };
    }
    const ctrl = new AbortController();
    const id = setTimeout(() => ctrl.abort(new DOMException("Timed out", "TimeoutError")), ms);
    return { signal: ctrl.signal, clear: () => clearTimeout(id) };
  }
  const AUTH_TOKEN_KEY = "collie.authToken";
  const authBackup = {
    get() { try { return (localStorage.getItem(AUTH_TOKEN_KEY) || "").trim(); } catch { return ""; } },
    set(tok) {
      const v = String(tok || "").trim();
      try { if (v) localStorage.setItem(AUTH_TOKEN_KEY, v); else localStorage.removeItem(AUTH_TOKEN_KEY); } catch {}
    },
    clear() { try { localStorage.removeItem(AUTH_TOKEN_KEY); } catch {} },
  };
  let restoreInFlight = null;
  async function restoreSession() {
    if (window.__collieDemo) return false;
    const tok = authBackup.get();
    if (!tok) return false;
    if (restoreInFlight) return restoreInFlight;
    restoreInFlight = (async () => {
      try {
        const res = await fetch("/api/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ token: tok }),
        });
        if (res.ok) return true;
        if (res.status === 401 && authBackup.get() === tok) authBackup.clear();
        return false;
      } catch {
        return false;
      } finally {
        restoreInFlight = null;
      }
    })();
    return restoreInFlight;
  }
  async function authFetch(url, init, isRemoteHub = false) {
    const res = await fetch(url, init);
    if (!isRemoteHub && res.status === 401 && await restoreSession()) {
      return fetch(url, init);
    }
    return res;
  }
  async function api(path, opts = {}) {
    const r = routeReq(path, opts.body, opts.hub);
    const headers = opts.body ? { "Content-Type": "application/json" } : {};
    if (r.hub) headers.Authorization = "Bearer " + r.hub.token;
    const t = timeoutSignal(opts.timeout);
    let res;
    try {
      res = await fetch(r.url, {
        method: opts.body ? "POST" : (opts.method || "GET"),
        headers, body: r.body,
        credentials: r.hub ? "omit" : "same-origin",
        signal: t.signal,
      });
    } catch (err) {
      if (err?.name === "TimeoutError" || err?.name === "AbortError") {
        throw new Error(opts.timeoutMessage || "请求超时，请检查网络后重试", { cause: err });
      }
      throw new Error(opts.networkMessage || "网络连接中断，请检查服务是否在线后重试", { cause: err });
    } finally {
      t.clear();
    }
    if (!r.hub) noteBuild(res.headers?.get?.("X-Collie-Web"));
    let raw = "", data = {};
    if (typeof res.text === "function") {
      raw = await res.text();
      if (raw) { try { data = JSON.parse(raw); } catch {} }
    } else if (typeof res.json === "function") {
      try { data = await res.json(); } catch {}
    }
    if (res.status === 401) {
      if (r.hub) throw new Error(`${r.hub.name} 不认这个浏览器了，在「设备」里重新添加它`);
      if (!opts._retried && await restoreSession()) {
        return api(path, { ...opts, _retried: true });
      }
      showLogin(); throw new Error("unauthorized");
    }
    if (!res.ok) {
      const fallback = raw && !/^\s*</.test(raw) ? raw.trim().slice(0, 240) : "";
      throw new Error(data.error || fallback || res.statusText || `HTTP ${res.status}`);
    }
    return r.hub ? tagIds(data, r.hub.key) : data;
  }
  // EventSource can't set headers: a remote hub takes its token in the URL.
  function openES(path, hub) {
    const r = routeReq(path, undefined, hub);
    if (!r.hub) return new EventSource(path);
    return new EventSource(r.url + (r.url.includes("?") ? "&" : "?") + "access_token=" + encodeURIComponent(r.hub.token));
  }
  const paneURL = (id, rest) => `/api/panes/${encodeURIComponent(id)}/${rest}`;
  // ───────────────────────────── pickers
  // Every <select> keeps its value (forms read it as before) but shows a quiet
  // button and a menu that matches the app; on a phone the menu is a sheet.
  // Options may carry data-glyph (agent icon), data-dot (status) and data-sub.
  const pickPop = document.createElement("div");
  pickPop.className = "pick-pop"; pickPop.hidden = true; pickPop.setAttribute("role", "listbox");
  const pickBack = document.createElement("div");
  pickBack.className = "pick-back"; pickBack.hidden = true;
  document.body.append(pickBack, pickPop);
  let pickOpen = null;
  const optIcon = (o) => o.dataset.glyph ? `<span class="pi">${GLYPHS[o.dataset.glyph] || ""}</span>`
    : o.dataset.dot ? `<span class="pi"><span class="dot ${esc(o.dataset.dot)}"></span></span>` : "";
  function syncPick(sel) {
    const b = sel._pick;
    if (!b) return;
    const o = sel.selectedOptions[0];
    b.querySelector(".pv").innerHTML = o ? optIcon(o) + `<span class="pt">${esc(o.dataset.short || o.textContent)}</span>` : "";
    b.disabled = sel.disabled;
    b.hidden = sel.hidden;
  }
  function enhance(sel) {
    if (sel._pick || "native" in sel.dataset) return;
    const b = document.createElement("button");
    b.type = "button";
    b.className = "pick" + (sel.dataset.pick ? " " + sel.dataset.pick : "");
    if (sel.title) b.title = sel.title;
    b.setAttribute("aria-haspopup", "listbox");
    b.setAttribute("aria-expanded", "false");
    b.innerHTML = `<span class="pv"></span><svg class="pc" viewBox="0 0 24 24"><path d="M7 10l5 5 5-5"/></svg>`;
    sel._pick = b;
    sel.classList.add("picked");
    sel.tabIndex = -1;
    sel.setAttribute("aria-hidden", "true");
    sel.after(b);
    sel.addEventListener("focus", () => b.focus({ preventScroll: true }));
    b.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); pickOpen === sel ? closePick() : openPick(sel); });
    b.addEventListener("keydown", (e) => {
      if ((e.key === "ArrowDown" || e.key === "ArrowUp") && pickOpen !== sel) { e.preventDefault(); openPick(sel); }
    });
    syncPick(sel);
  }
  function openPick(sel) {
    closePick();
    closeDirPick(false);
    pickOpen = sel;
    // A modal <dialog> sits in the top layer, above any z-index: the menu has
    // to live inside it to show.
    const host = sel.closest("dialog[open]") || document.body;
    if (pickPop.parentNode !== host) host.append(pickBack, pickPop);
    const row = (o) => `<button type="button" class="po${o.selected ? " on" : ""}" role="option" aria-selected="${o.selected}" data-v="${esc(o.value)}" ${o.disabled ? "disabled" : ""}>
      ${optIcon(o)}<span class="pl"><span>${esc(o.textContent)}</span>${o.dataset.sub ? `<small>${esc(o.dataset.sub)}</small>` : ""}</span>
      <svg class="ck" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></button>`;
    let html = sel.dataset.title ? `<div class="ph">${esc(sel.dataset.title)}</div>` : "";
    for (const c of sel.children) {
      html += c.tagName === "OPTGROUP" ? `<div class="ph">${esc(c.label)}</div>` + [...c.children].map(row).join("") : row(c);
    }
    pickPop.innerHTML = html;
    const sheet = narrow();
    pickPop.classList.toggle("sheet", sheet);
    pickBack.hidden = !sheet;
    pickPop.hidden = false;
    sel._pick.setAttribute("aria-expanded", "true");
    if (sheet) {
      pickPop.style.cssText = "";
    } else {
      pickPop.style.cssText = "";
      const r = sel._pick.getBoundingClientRect();
      const vv = window.visualViewport;
      const vh = vv ? vv.height : innerHeight;
      const vtop = vv ? vv.offsetTop : 0;
      const rich = [...sel.options].some((o) => o.dataset.sub);
      const maxW = Math.min(360, innerWidth - 16);
      pickPop.style.minWidth = Math.min(Math.max(r.width, rich ? 200 : 124), maxW) + "px";
      pickPop.style.maxWidth = maxW + "px";
      const below = Math.max(0, vh - (r.bottom - vtop) - 10);
      const above = Math.max(0, (r.top - vtop) - 10);
      const rawH = Math.min(pickPop.scrollHeight + 10, 380);
      const openBelow = below >= Math.min(rawH, 220) + 6 || below >= above;
      const avail = Math.max(120, Math.min(380, (openBelow ? below : above) - 6));
      pickPop.style.maxHeight = avail + "px";
      const w = pickPop.offsetWidth, h = Math.min(pickPop.offsetHeight, avail);
      const left = Math.min(Math.max(8, r.left), innerWidth - w - 8);
      pickPop.style.left = left + "px";
      if (openBelow) {
        pickPop.style.top = Math.round(r.bottom + 6) + "px";
        pickPop.style.bottom = "auto";
      } else {
        pickPop.style.top = Math.max(8, Math.round(r.top - h - 6)) + "px";
        pickPop.style.bottom = "auto";
      }
    }
    ($(".po.on", pickPop) || $(".po", pickPop))?.focus({ preventScroll: true });
    $(".po.on", pickPop)?.scrollIntoView({ block: "nearest" });
  }
  function closePick(refocus) {
    if (!pickOpen) return;
    const sel = pickOpen;
    pickOpen = null;
    pickPop.hidden = true;
    pickBack.hidden = true;
    sel._pick.setAttribute("aria-expanded", "false");
    if (refocus) sel._pick.focus({ preventScroll: true });
  }
  pickPop.addEventListener("click", (e) => {
    const o = e.target.closest(".po");
    if (!o || !pickOpen) return;
    const sel = pickOpen;
    closePick(true);
    if (sel.value === o.dataset.v) return;
    sel.value = o.dataset.v;
    syncPick(sel);
    sel.dispatchEvent(new Event("input", { bubbles: true }));
    sel.dispatchEvent(new Event("change", { bubbles: true }));
  });
  pickPop.addEventListener("keydown", (e) => {
    const items = $$(".po:not([disabled])", pickPop);
    if (!items.length) {
      if (e.key === "Escape" || e.key === "Tab") { e.preventDefault(); closePick(true); }
      return;
    }
    const i = items.indexOf(document.activeElement);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      items[0]?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      items[items.length - 1]?.focus();
    } else if (e.key === "Escape" || e.key === "Tab") { e.preventDefault(); closePick(true); }
  });
  pickBack.addEventListener("click", () => closePick());
  document.addEventListener("mousedown", (e) => {
    if (pickOpen && !pickPop.contains(e.target) && !pickOpen._pick.contains(e.target)) closePick();
  });
  addEventListener("resize", () => closePick());
  document.addEventListener("scroll", (e) => { if (pickOpen && !pickPop.contains(e.target)) closePick(); }, true);
  document.addEventListener("change", (e) => { if (e.target.tagName === "SELECT") syncPick(e.target); });
  const NO_SELECT_IDS = new Set(["super-thread", "td-list", "live-list", "recent-list", "attention", "shells", "crew", "collie-threads-list", "screen", "log"]);
  let _screenSkipHost = null;
  const isScreenDomTarget = (t) => {
    if (!t) return false;
    if (t.id === "screen" || t.id === "log") return true;
    const host = _screenSkipHost || (_screenSkipHost = $("#screen"));
    return !!(host && typeof host.contains === "function" && host.contains(t));
  };
  new MutationObserver((ms) => {
    for (const m of ms) {
      const t = m.target;
      if (NO_SELECT_IDS.has(t?.id) || isScreenDomTarget(t)) continue;
      for (const n of m.addedNodes) {
        if (n.nodeType !== 1) continue;
        if (n.tagName === "SELECT") enhance(n);
        else if (n.childElementCount > 0) n.querySelectorAll?.("select").forEach(enhance);
      }
      const s = t.tagName === "SELECT" ? t : t.closest?.("select");
      if (s) syncPick(s);
    }
  }).observe(document.body, { childList: true, subtree: true });
  $$("select").forEach(enhance);

  // ───────────────────────────── directory picker (unified pick + free typing)
  const DIR_FOLDER_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 6.5a2 2 0 0 1 2-2h4.2l2 2h6.8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/></svg>';
  const DIR_CHEV_SVG = '<svg class="dp-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 6.5L15 12l-5.5 5.5"/></svg>';
  const dirBack = document.createElement("div");
  dirBack.className = "dir-back"; dirBack.hidden = true;
  const dirPop = document.createElement("div");
  dirPop.className = "dir-pop"; dirPop.id = "dir-pop"; dirPop.hidden = true;
  dirPop.setAttribute("role", "dialog");
  dirPop.setAttribute("aria-label", "选择目录");
  dirPop.innerHTML = `
    <header class="dp-head">
      <span class="dp-title">选择目录</span>
      <span class="dp-mach" id="dp-mach"></span>
      <span class="spacer"></span>
      <button type="button" class="dp-close" id="dp-close" aria-label="关闭目录选择器" title="关闭 (Esc)">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
      </button>
    </header>
    <div class="dp-sheet-input">
      <input type="text" id="dp-sheet-input" class="mono" placeholder="~ 或输入任意目录路径" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">
    </div>
    <div class="dp-sec" id="dp-recent-sec" hidden>
      <div class="dp-sec-h">常用 / 最近</div>
      <div class="dp-recent" id="dp-recent"></div>
    </div>
    <div class="dp-nav">
      <button type="button" class="dp-nav-btn" id="dp-up" title="上一级" aria-label="上一级">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 18V6M7 11l5-5 5 5"/></svg>
      </button>
      <div class="dp-crumbs" id="dp-crumbs" aria-label="当前路径"></div>
      <button type="button" class="dp-nav-btn" id="dp-hidden-btn" title="显示以 . 开头的隐藏目录" aria-pressed="false">.*</button>
    </div>
    <div class="dp-body" id="dp-body"></div>
    <div class="dp-note" id="dp-note" hidden></div>
    <footer class="dp-foot">
      <span class="dp-cur" id="dp-cur">~</span>
      <button type="button" class="btn primary small dp-use" id="dp-use">选定当前目录</button>
    </footer>`;
  document.body.append(dirBack, dirPop);

  const dirRecentKey = (machine) => "recentDirs" + (machine ? ":" + machine : "");
  function recordRecentDir(machine, dir) {
    const v = String(dir || "").trim();
    if (!v) return;
    const key = dirRecentKey(machine);
    store.set(key, [v, ...store.get(key, []).filter((d) => d !== v)].slice(0, 10));
  }
  function tildeForMachine(p, machine, homeHint) {
    const s = String(p || "").trim();
    if (!s) return "~";
    const h = homeHint || (state.machines || []).find((m) => m.id === (machine || ""))?.home || "";
    if (h) {
      const ch = h.replace(/\/+$/, "");
      if (s === ch) return "~";
      if (s.startsWith(ch + "/")) return "~" + s.slice(ch.length);
    }
    return tilde(s);
  }
  function joinDirPath(base, name) {
    const b = String(base || "").trim();
    if (!b || b === "/") return "/" + name;
    return b.replace(/\/+$/, "") + "/" + name;
  }
  function buildDirBreadcrumbs(displayPath, fullPath, home) {
    const disp = String(displayPath || fullPath || "~").trim() || "~";
    const out = [];
    if (disp === "~" || disp.startsWith("~/")) {
      out.push({ label: "~", path: "~" });
      const rest = disp === "~" ? [] : disp.slice(2).split("/").filter(Boolean);
      let acc = "~";
      for (const seg of rest) {
        acc += "/" + seg;
        out.push({ label: seg, path: acc });
      }
      return out;
    }
    if (disp.startsWith("/")) {
      out.push({ label: "/", path: "/" });
      const parts = disp.slice(1).split("/").filter(Boolean);
      let acc = "";
      for (const seg of parts) {
        acc += "/" + seg;
        out.push({ label: seg, path: acc });
      }
      return out;
    }
    out.push({ label: disp, path: disp });
    return out;
  }

  let dirCtx = null; // { input, btn, wrap, opts, machine, showHidden, reqSeq, data, hiIndex, debounce, loadTimer }
  const dpSheetInput = $("#dp-sheet-input", dirPop);

  function positionDirPop() {
    if (!dirCtx || dirPop.hidden) return;
    const sheetMode = narrow();
    dirPop.classList.toggle("sheet", sheetMode);
    dirBack.hidden = !sheetMode;
    if (sheetMode) {
      dirPop.style.cssText = "";
      return;
    }
    const anchor = dirCtx.wrap.getBoundingClientRect();
    if (!anchor.width || anchor.bottom < 0 || anchor.top > innerHeight) {
      closeDirPick(false);
      return;
    }
    const vv = window.visualViewport;
    const vh = vv ? vv.height : innerHeight;
    const vtop = vv ? vv.offsetTop : 0;
    const margin = 10;
    const w = Math.min(Math.max(anchor.width, 360), Math.min(480, innerWidth - 16));
    const left = Math.min(Math.max(8, anchor.left), innerWidth - w - 8);
    const below = vh - (anchor.bottom - vtop) - margin;
    const above = (anchor.top - vtop) - margin;
    const openBelow = below >= 260 || below >= above;
    const avail = Math.max(180, Math.min(440, (openBelow ? below : above) - 6));
    dirPop.style.width = w + "px";
    dirPop.style.left = left + "px";
    dirPop.style.maxHeight = avail + "px";
    if (openBelow) {
      dirPop.style.top = Math.round(anchor.bottom + 6) + "px";
      dirPop.style.bottom = "auto";
    } else {
      dirPop.style.top = "auto";
      dirPop.style.bottom = Math.round(innerHeight - anchor.top + 6) + "px";
    }
  }

  function mergeDirShortcuts(machine, data) {
    const out = [];
    const seen = new Set();
    const home = data?.home || (state.machines || []).find((m) => m.id === (machine || ""))?.home || "";
    const push = (rawPath, display, label) => {
      const d = (display || tildeForMachine(rawPath, machine, home)).replace(/\/+$/, "") || "/";
      if (!d || seen.has(d)) return;
      seen.add(d);
      out.push({ display: d, path: rawPath || d, label: label || "" });
    };
    for (const sc of data?.recent || []) push(sc.path, sc.display, sc.label);
    // Merge live agents/shells cwds on the same machine so active project dirs appear right away.
    for (const a of [...(state.agents || []), ...(state.shells || [])]) {
      if ((a.machine || "") === (machine || "") && a.cwd) push(a.cwd, tildeForMachine(a.cwd, machine, home), "");
    }
    for (const d of store.get(dirRecentKey(machine), [])) push(d, tildeForMachine(d, machine, home), "");
    if (!out.length) push("~", "~", "主目录");
    return out.slice(0, 10);
  }

  function renderDirPop() {
    if (!dirCtx) return;
    const machine = dirCtx.machine || "";
    const mInfo = (state.machines || []).find((m) => m.id === machine);
    const mOnline = dirCtx.data ? !dirCtx.data.offline : (mInfo ? (mInfo.local ? state.ok !== false : !!mInfo.online) : true);
    const mLabel = mInfo ? (mInfo.local ? `${mInfo.name}（hub）` : mInfo.name) : (machine || "本机");
    $("#dp-mach", dirPop).innerHTML = `<span class="dot ${mOnline ? "online" : "offline"}"></span><span>${esc(mLabel)}</span>`;

    const data = dirCtx.data;
    const shortcuts = mergeDirShortcuts(machine, data);
    const curVal = dirCtx.input.value.trim();
    const curDisp = tildeForMachine(curVal || "~", machine, data?.home);
    const recSec = $("#dp-recent-sec", dirPop);
    recSec.hidden = !shortcuts.length;
    $("#dp-recent", dirPop).innerHTML = shortcuts.map((sc) =>
      `<button type="button" class="dp-chip${sc.display === curDisp ? " on" : ""}" data-dp-pick="${esc(sc.display)}" title="${esc(sc.display)}"><span class="dp-chip-t">${esc(sc.display)}</span>${sc.label ? `<span class="dp-chip-tag">${esc(sc.label)}</span>` : ""}</button>`
    ).join("");

    const browseDisp = data?.browse_display || data?.display || curDisp || "~";
    const crumbs = buildDirBreadcrumbs(browseDisp, data?.browse_path || data?.path || "", data?.home || "");
    const crumbsEl = $("#dp-crumbs", dirPop);
    crumbsEl.innerHTML = crumbs.map((c, i) =>
      `${i > 0 ? '<span class="dp-sep" aria-hidden="true">/</span>' : ""}<button type="button" class="dp-crumb${i === crumbs.length - 1 ? " cur" : ""}" data-dp-go="${esc(c.path)}">${esc(c.label)}</button>`
    ).join("");
    crumbsEl.scrollLeft = crumbsEl.scrollWidth;

    const upBtn = $("#dp-up", dirPop);
    const upTarget = data?.parent_display || data?.parent || "";
    upBtn.disabled = !upTarget || !!data?.offline;
    upBtn.dataset.dpGo = upTarget;

    const hidBtn = $("#dp-hidden-btn", dirPop);
    const effHidden = !!(dirCtx.showHidden || data?.hidden);
    hidBtn.classList.toggle("on", effHidden);
    hidBtn.setAttribute("aria-pressed", String(effHidden));

    const body = $("#dp-body", dirPop);
    if (dirCtx.loading && !data) {
      body.innerHTML = '<div class="dp-empty">正在读取目录…</div>';
    } else if (data?.offline) {
      body.innerHTML = '<div class="dp-empty">这台电脑当前离线，可点上方常用目录或直接手动输入路径</div>';
    } else if (data && data.dirs.length) {
      const hi = dirCtx.hiIndex;
      body.innerHTML = `<ul class="dp-list" role="listbox" aria-label="子目录">${data.dirs.map((d, i) =>
        `<li><button type="button" class="dp-item${i === hi ? " hi" : ""}" role="option" aria-selected="${i === hi}" data-dp-enter="${esc(d)}"><span class="dp-ico">${DIR_FOLDER_SVG}</span><span class="dp-name">${esc(d)}</span>${DIR_CHEV_SVG}</button></li>`
      ).join("")}</ul>`;
    } else if (data) {
      body.innerHTML = `<div class="dp-empty">${data.prefix ? `「${esc(data.prefix)}」下没有匹配的子目录，可直接手输使用` : "当前目录下没有子目录"}</div>`;
    } else {
      body.innerHTML = '<div class="dp-empty">可直接输入任意目录路径</div>';
    }

    const noteEl = $("#dp-note", dirPop);
    const noteText = data?.note || "";
    noteEl.hidden = !noteText;
    noteEl.className = "dp-note" + (data?.offline ? " warn" : "");
    noteEl.textContent = noteText;

    // Footer: pick the browsed directory, or the user's custom typed path if non-existent.
    const commitPath = data && !data.exists && curVal ? curVal : (data?.browse_display || curVal || "~");
    const useBtn = $("#dp-use", dirPop);
    $("#dp-cur", dirPop).textContent = commitPath;
    $("#dp-cur", dirPop).title = commitPath;
    useBtn.dataset.dpCommit = commitPath;
    useBtn.textContent = data && !data.exists && curVal ? "使用此路径" : "选定当前目录";
    positionDirPop();
  }

  async function loadDirPop(targetPath, opts = {}) {
    if (!dirCtx) return;
    const ctx = dirCtx;
    const seq = ++ctx.reqSeq;
    const p = targetPath !== undefined ? targetPath : ctx.input.value;
    ctx.hiIndex = -1;
    clearTimeout(ctx.loadTimer);
    ctx.loadTimer = setTimeout(() => {
      if (dirCtx === ctx && ctx.reqSeq === seq && !ctx.data) {
        ctx.loading = true;
        renderDirPop();
      }
    }, 120);
    const q = new URLSearchParams();
    q.set("path", p || "~");
    if (ctx.machine) q.set("machine", ctx.machine);
    if (ctx.showHidden) q.set("hidden", "1");
    try {
      const r = await api("/api/dirs?" + q.toString());
      if (dirCtx !== ctx || ctx.reqSeq !== seq) return;
      clearTimeout(ctx.loadTimer);
      ctx.loading = false;
      ctx.data = {
        ...r,
        dirs: Array.isArray(r.dirs) ? r.dirs : [],
        recent: Array.isArray(r.recent) ? r.recent : [],
      };
      if (opts.syncInput && ctx.data.browse_display) {
        ctx.input.value = ctx.data.browse_display;
        if (!dirPop.hidden && dirPop.classList.contains("sheet")) dpSheetInput.value = ctx.data.browse_display;
      }
      renderDirPop();
    } catch {
      if (dirCtx !== ctx || ctx.reqSeq !== seq) return;
      clearTimeout(ctx.loadTimer);
      ctx.loading = false;
      ctx.data = {
        path: p || "~", display: p || "~", browse_path: p || "~", browse_display: p || "~",
        exists: false, offline: true, dirs: [], recent: [],
        note: "无法读取目录列表，仍可直接手动输入路径",
      };
      renderDirPop();
    }
  }

  function commitDirChoice(pathVal) {
    if (!dirCtx) return;
    const ctx = dirCtx;
    const v = String(pathVal || "").trim() || "~";
    ctx.input.value = v;
    recordRecentDir(ctx.machine, v);
    closeDirPick(false);
    ctx.input.dispatchEvent(new Event("input", { bubbles: true }));
    ctx.input.dispatchEvent(new Event("change", { bubbles: true }));
    ctx.opts.onPick?.(v);
  }

  function openDirPick(input, { focusSheet = false } = {}) {
    const ctrl = input?._dir;
    if (!ctrl) return;
    closePick();
    if (dirCtx && dirCtx.input !== input) closeDirPick(false);
    const host = input.closest("dialog[open]") || document.body;
    if (dirPop.parentNode !== host) host.append(dirBack, dirPop);
    const machine = ctrl.opts.getMachine?.() || "";
    const changedMachine = !dirCtx || dirCtx.machine !== machine;
    if (!dirCtx) {
      dirCtx = {
        input, btn: ctrl.btn, wrap: ctrl.wrap, opts: ctrl.opts,
        machine, showHidden: false, reqSeq: 0, data: null, loading: false, hiIndex: -1, debounce: null, loadTimer: null,
      };
    } else {
      dirCtx.machine = machine;
      if (changedMachine) { dirCtx.data = null; dirCtx.showHidden = false; }
    }
    dirPop.hidden = false;
    ctrl.btn.setAttribute("aria-expanded", "true");
    dpSheetInput.value = input.value;
    renderDirPop();
    loadDirPop(input.value);
    if (narrow()) {
      if (focusSheet) setTimeout(() => { dpSheetInput.focus(); dpSheetInput.setSelectionRange?.(dpSheetInput.value.length, dpSheetInput.value.length); }, 20);
      else input.blur?.();
    }
  }

  function closeDirPick(refocus = false) {
    if (!dirCtx) return;
    const ctx = dirCtx;
    clearTimeout(ctx.debounce);
    clearTimeout(ctx.loadTimer);
    ctx.btn.setAttribute("aria-expanded", "false");
    dirCtx = null;
    dirPop.hidden = true;
    dirBack.hidden = true;
    if (refocus) ctx.input.focus({ preventScroll: true });
  }

  dirPop.addEventListener("mousedown", (e) => {
    // Keep desktop input focus stable while clicking navigation buttons inside the dropdown.
    if (!dirPop.classList.contains("sheet") && !e.target.closest("input")) e.preventDefault();
  });
  dirPop.addEventListener("click", (e) => {
    if (!dirCtx) return;
    if (e.target.closest("#dp-close")) { closeDirPick(!narrow()); return; }
    const pick = e.target.closest("[data-dp-pick]");
    if (pick) { commitDirChoice(pick.dataset.dpPick); return; }
    const use = e.target.closest("#dp-use");
    if (use) { commitDirChoice(use.dataset.dpCommit); return; }
    if (e.target.closest("#dp-hidden-btn")) {
      dirCtx.showHidden = !dirCtx.showHidden;
      const cur = dirCtx.data?.browse_display || dirCtx.input.value || "~";
      loadDirPop(cur);
      return;
    }
    const go = e.target.closest("[data-dp-go]");
    if (go && !go.disabled && go.dataset.dpGo) {
      loadDirPop(go.dataset.dpGo, { syncInput: true });
      return;
    }
    const enter = e.target.closest("[data-dp-enter]");
    if (enter) {
      const base = dirCtx.data?.browse_display || dirCtx.input.value || "~";
      const next = joinDirPath(base, enter.dataset.dpEnter);
      loadDirPop(next, { syncInput: true });
    }
  });
  dirBack.addEventListener("click", () => closeDirPick(false));
  dpSheetInput.addEventListener("input", () => {
    if (!dirCtx) return;
    dirCtx.input.value = dpSheetInput.value;
    dirCtx.input.dispatchEvent(new Event("input", { bubbles: true }));
    clearTimeout(dirCtx.debounce);
    dirCtx.debounce = setTimeout(() => loadDirPop(dpSheetInput.value), 180);
  });
  dpSheetInput.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { e.preventDefault(); closeDirPick(false); return; }
    if (e.key === "Enter") {
      e.preventDefault();
      if (e.isComposing || e.keyCode === 229) return;
      commitDirChoice(dpSheetInput.value);
    }
  });
  document.addEventListener("mousedown", (e) => {
    if (dirCtx && !dirPop.contains(e.target) && !dirCtx.wrap.contains(e.target)) closeDirPick(false);
  });
  addEventListener("resize", () => positionDirPop());
  window.visualViewport?.addEventListener("resize", () => positionDirPop());
  window.visualViewport?.addEventListener("scroll", () => positionDirPop());
  document.addEventListener("scroll", (e) => {
    if (!dirCtx || dirPop.hidden || dirPop.classList.contains("sheet")) return;
    if (dirPop.contains(e.target)) return;
    positionDirPop();
  }, true);

  function enhanceDirInput(input, opts = {}) {
    if (!input || !input.parentNode) return null;
    if (input._dir) { input._dir.opts = opts; return input._dir; }
    const wrap = document.createElement("span");
    wrap.className = "dir-field";
    input.parentNode.insertBefore(wrap, input);
    wrap.append(input);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "dir-field-btn";
    btn.title = "浏览并选择目录";
    btn.setAttribute("aria-label", "浏览并选择目录");
    btn.setAttribute("aria-expanded", "false");
    btn.innerHTML = DIR_FOLDER_SVG;
    wrap.append(btn);

    const ctrl = {
      input, btn, wrap, opts,
      open: (focusSheet = false) => openDirPick(input, { focusSheet }),
      close: () => { if (dirCtx?.input === input) closeDirPick(false); },
      refresh: () => {
        if (dirCtx?.input !== input) return;
        const m = ctrl.opts.getMachine?.() || "";
        if (dirCtx.machine !== m) {
          dirCtx.machine = m;
          dirCtx.data = null;
          dirCtx.showHidden = false;
        }
        dpSheetInput.value = input.value;
        loadDirPop(input.value);
      },
    };
    input._dir = ctrl;

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (dirCtx?.input === input) closeDirPick(!narrow());
      else openDirPick(input, { focusSheet: false });
    });
    input.addEventListener("focus", () => {
      if (!narrow()) openDirPick(input, { focusSheet: false });
    });
    input.addEventListener("click", () => {
      if (narrow()) openDirPick(input, { focusSheet: true });
      else if (dirCtx?.input !== input) openDirPick(input, { focusSheet: false });
    });
    input.addEventListener("input", () => {
      if (dirCtx?.input !== input) return;
      if (dirPop.classList.contains("sheet")) dpSheetInput.value = input.value;
      clearTimeout(dirCtx.debounce);
      dirCtx.debounce = setTimeout(() => loadDirPop(input.value), 180);
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        if (dirCtx?.input !== input) { openDirPick(input, { focusSheet: false }); return; }
        const n = dirCtx.data?.dirs?.length || 0;
        if (!n) return;
        dirCtx.hiIndex = (dirCtx.hiIndex + (e.key === "ArrowDown" ? 1 : -1) + n) % n;
        renderDirPop();
        $(".dp-item.hi", dirPop)?.scrollIntoView({ block: "nearest" });
        return;
      }
      if (e.key === "Escape" && dirCtx?.input === input) {
        e.preventDefault();
        e.stopPropagation();
        closeDirPick(true);
        return;
      }
      if (e.key === "Enter" && dirCtx?.input === input) {
        if (e.isComposing || e.keyCode === 229) return;
        if (dirCtx.hiIndex >= 0 && dirCtx.data?.dirs?.[dirCtx.hiIndex]) {
          e.preventDefault();
          const base = dirCtx.data.browse_display || input.value || "~";
          loadDirPop(joinDirPath(base, dirCtx.data.dirs[dirCtx.hiIndex]), { syncInput: true });
          return;
        }
        closeDirPick(false);
      }
    });
    return ctrl;
  }


  let toastPriorFocus = null;
  const toastHost = $("#toasts");
  toastHost?.addEventListener("focusin", (e) => {
    if (e.relatedTarget && !toastHost.contains?.(e.relatedTarget)) toastPriorFocus = e.relatedTarget;
  });
  function syncToastPopover(host) {
    if (!host) return;
    const count = host.children?.length ?? 0;
    if (count > 0) {
      if (typeof host.showPopover === "function") {
        try { if (!host.matches?.(":popover-open")) host.showPopover(); } catch {}
      }
    } else if (typeof host.hidePopover === "function") {
      try { if (!host.matches || host.matches(":popover-open")) host.hidePopover(); } catch {}
    }
  }
  function toast(msg, kind = "") {
    const text = String(msg ?? "");
    const openDlg = document.querySelector("dialog[open]");
    if (openDlg && openDlg.open === true) {
      openDlg.addEventListener("close", () => toast(text, kind), { once: true });
      return;
    }
    const host = $("#toasts");
    if (!host) return;
    const t = document.createElement("div");
    t.className = "toast" + (kind ? " " + kind : "");
    const hasAriaNotify = typeof document.ariaNotify === "function";
    if (!hasAriaNotify) t.setAttribute("role", kind === "attn" ? "alert" : "status");
    const body = document.createElement("span");
    body.className = "toast-msg";
    body.textContent = text;
    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "toast-x";
    closeBtn.setAttribute("aria-label", "关闭通知");
    closeBtn.title = "关闭";
    closeBtn.textContent = "×";
    t.append(body, closeBtn);
    t.dataset.msg = text;
    const ttl = kind === "attn" ? Math.min(10000, Math.max(5200, text.length * 140)) : 2600;
    let timer = 0, hovered = false, focused = false;
    const dismiss = (manual = false) => {
      clearTimeout(timer);
      if (t._gone) return;
      t._gone = true;
      const hadFocus = manual && document.activeElement && (document.activeElement === t || t.contains?.(document.activeElement));
      const nextBtn = hadFocus ? (t.nextElementSibling?.querySelector?.(".toast-x") || t.previousElementSibling?.querySelector?.(".toast-x")) : null;
      t.remove();
      syncToastPopover(host);
      if (hadFocus) {
        if (nextBtn) nextBtn.focus?.({ preventScroll: true });
        else if (toastPriorFocus?.isConnected) { toastPriorFocus.focus?.({ preventScroll: true }); toastPriorFocus = null; }
      }
    };
    const arm = (ms = ttl) => {
      clearTimeout(timer);
      if (hovered || focused) return;
      timer = setTimeout(() => dismiss(false), ms);
    };
    closeBtn.addEventListener("click", () => dismiss(true));
    t.addEventListener("mouseenter", () => { hovered = true; clearTimeout(timer); });
    t.addEventListener("mouseleave", () => { hovered = false; arm(1600); });
    t.addEventListener("focusin", () => { focused = true; clearTimeout(timer); });
    t.addEventListener("focusout", (e) => {
      if (e.relatedTarget && t.contains?.(e.relatedTarget)) return;
      focused = false;
      arm(1600);
    });
    while ((host.children?.length ?? 0) >= 4) host.firstElementChild?.remove();
    host.append(t);
    syncToastPopover(host);
    if (hasAriaNotify) {
      try { document.ariaNotify(text, { priority: kind === "attn" ? "high" : "normal" }); } catch {}
    }
    arm();
  }

  // ───────────────────────────── auth
  let liveEv = null;
  let loginPairFailed = false;
  function isStandaloneMode() {
    try {
      return window.navigator.standalone === true ||
        (typeof matchMedia === "function" && matchMedia("(display-mode: standalone)").matches);
    } catch { return false; }
  }
  function syncLoginTip() {
    const tip = $("#login-tip");
    if (tip) tip.hidden = !(isStandaloneMode() || loginPairFailed);
  }
  function showLogin(opts = {}) {
    if (opts.pairFailed) loginPairFailed = true;
    if (liveEv) { liveEv.close(); liveEv = null; }
    $("#app").hidden = true;
    $("#login").hidden = false;
    syncLoginTip();
    setTimeout(() => $("#login-token")?.focus(), 50);
  }
  async function login(token) {
    const tok = String(token || "").trim();
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ token: tok }),
    });
    if (!res.ok) throw new Error("bad token");
    authBackup.set(tok);
  }
  // A name the hub shows in its device list, e.g. "iPhone · Safari".
  function deviceName() {
    const ua = navigator.userAgent;
    const dev = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android"
      : /Macintosh/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "设备";
    const br = /EdgA?\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "浏览器";
    return `${dev} · ${br}`;
  }
  async function pair(code) {
    const res = await fetch("/api/pair", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ code, kind: "browser", name: deviceName() }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "配对失败");
    if (data.token) authBackup.set(data.token);
  }
  $("#login-token")?.addEventListener("input", () => {
    $("#login-token").removeAttribute("aria-invalid");
    if ($("#login-error").textContent) $("#login-error").textContent = "";
  });
  $("#login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = $("#login-token");
    const btn = $("#login-form button[type='submit']");
    $("#login-error").textContent = "";
    input.removeAttribute("aria-invalid");
    const v = input.value.trim();
    const isPair = /^[A-Z2-7]{8}$/i.test(v);
    if (btn) btn.disabled = true;
    try {
      if (isPair) await pair(v); else await login(v);
      loginPairFailed = false;
      input.value = "";
      await boot();
    } catch (err) {
      if (isPair) {
        loginPairFailed = true;
        syncLoginTip();
      }
      input.setAttribute("aria-invalid", "true");
      $("#login-error").textContent = isPair ? err.message : "令牌不对";
      input.focus();
    } finally {
      if (btn) btn.disabled = false;
    }
  });
  async function doLogout() {
    if (!confirm("确定退出当前浏览器的登录状态吗？")) return;
    authBackup.clear();
    try { await fetch("/api/logout", { method: "POST", credentials: "same-origin" }); } catch {}
    location.reload();
  }

  // ───────────────────────────── live state
  let state = { ok: false, agents: [], shells: [] };
  let localState = state;     // this hub's own; state adds the other hubs'
  function tagState(s, h, online) {
    const k = h.key;
    const fix = (a) => ({ ...a, hub: k, pane_id: tagged(a.pane_id, k), machine: tagged(a.machine, k),
      workspace_id: a.workspace_id ? tagged(a.workspace_id, k) : a.workspace_id,
      // Each hub has its own Collie; only this hub's is "Collie" here.
      ...(a.name === ROUTER ? { name: "Collie · " + h.name, topic: "Collie · " + h.name } : {}) });
    const ms = s.machines && s.machines.length ? s.machines : [{ id: "", name: h.name, local: true, online: s.ok !== false }];
    return {
      agents: (s.agents || []).map(fix), shells: (s.shells || []).map(fix),
      machines: ms.map((m) => ({ ...m, hub: k, id: tagged(m.id, k), local: false,
        name: m.local ? h.name : h.name + " · " + m.name,
        online: online && (m.local ? s.ok !== false : m.online) })),
    };
  }
  function mergedState() {
    const parts = [...remote.values()].map((r) => r.state).filter(Boolean);
    if (!parts.length) return localState;
    return { ...localState,
      agents: [...(localState.agents || []), ...parts.flatMap((p) => p.agents)],
      shells: [...(localState.shells || []), ...parts.flatMap((p) => p.shells)],
      machines: [...(localState.machines && localState.machines.length ? localState.machines : [{ id: "", name: "本机", local: true, online: localState.ok }]),
        ...parts.flatMap((p) => p.machines)] };
  }
  function setLocalState(next) {
    localState = next;
    syncReadCursorFromServer(next?.last_read_entry_id, sup.entries);
    state = mergedState();
  }
  function remoteChanged() {
    const m = mergedState();
    notifyTransitions(m);
    state = m;
    renderSide();
    if (view === "pane") renderHead();
  }
  function connectHub(h) {
    let r = remote.get(h.key);
    if (!r) { r = { state: tagState({}, h, false) }; remote.set(h.key, r); }
    r.es?.close();
    const es = r.es = openES("/api/events", h);
    let gone;
    es.addEventListener("state", (e) => {
      clearTimeout(gone);
      r.online = true; r.raw = JSON.parse(e.data);
      r.state = tagState(r.raw, h, true);
      remoteChanged();
    });
    es.onerror = () => {
      // A blip reconnects by itself; only a hub that stays away goes grey.
      clearTimeout(gone);
      gone = setTimeout(() => { r.online = false; r.state = tagState({ ...(r.raw || {}), agents: [], shells: [] }, h, false); remoteChanged(); }, 8000);
      if (es.readyState === EventSource.CLOSED && r.es === es) setTimeout(() => { if (r.es === es) connectHub(h); }, 5000);
    };
  }
  async function loadHubs() {
    try { hubs = (await api("/api/hubs")).hubs || []; } catch { return; }
    for (const [k, r] of remote) if (!hubs.some((h) => h.key === k)) { r.es?.close(); remote.delete(k); }
    for (const h of hubs) if (!remote.get(h.key)?.es || remote.get(h.key).url !== h.url) { connectHub(h); remote.get(h.key).url = h.url; }
    state = mergedState();
    renderSide();
  }
  let sup = { router: { status: "asleep" }, entries: [], workers: [], queued: 0 };
  let prevStatus = new Map();
  let view = null;     // "collie" | "auto" | "pane" | null
  let current = null;  // pane id when view === "pane"

  // Coalesce burst SSE "super"/"state" updates into one animation frame and defer
  // DOM work while the user is mid-IME composition so typing never drops frames.
  let superComposing = false;
  let liveUpdateMask = 0;
  let liveUpdateRAF = 0;
  let liveComposeTimer = 0;
  const LIVE_SIDE = 1, LIVE_PENDING_BARS = 2, LIVE_SUPER = 4, LIVE_UPDATE_ENTRY = 8, LIVE_HEAD = 16;
  function flushLiveUpdates() {
    liveUpdateRAF = 0;
    if (liveComposeTimer) { clearTimeout(liveComposeTimer); liveComposeTimer = 0; }
    const mask = liveUpdateMask;
    liveUpdateMask = 0;
    if (!mask) return;
    if (mask & LIVE_SIDE) renderSide();
    if (mask & LIVE_PENDING_BARS) renderRouterPendingBars();
    if (mask & LIVE_UPDATE_ENTRY) renderUpdateEntry();
    if ((mask & LIVE_HEAD) && view === "pane") renderHead();
    if ((mask & LIVE_SUPER) && view === "collie") renderSuper();
  }
  function scheduleLiveUpdates(mask) {
    liveUpdateMask |= mask;
    if (superComposing) {
      if (!liveComposeTimer) {
        liveComposeTimer = setTimeout(() => {
          liveComposeTimer = 0;
          if (liveUpdateMask) flushLiveUpdates();
        }, 450);
      }
      return;
    }
    if (document.hidden || typeof requestAnimationFrame !== "function") {
      flushLiveUpdates();
      return;
    }
    if (!liveUpdateRAF) {
      let ranSync = false;
      const id = requestAnimationFrame(() => {
        ranSync = true;
        flushLiveUpdates();
      });
      if (!ranSync) liveUpdateRAF = id;
    }
  }
  function bindCompositionGuard(el) {
    if (!el || el._compGuardBound) return;
    el._compGuardBound = true;
    const onStart = () => { superComposing = true; };
    const onUpdate = () => {
      if (!superComposing || !liveComposeTimer) return;
      clearTimeout(liveComposeTimer);
      liveComposeTimer = setTimeout(() => {
        liveComposeTimer = 0;
        if (liveUpdateMask) flushLiveUpdates();
      }, 450);
    };
    const onEnd = () => {
      if (!superComposing) return;
      superComposing = false;
      if (liveComposeTimer) { clearTimeout(liveComposeTimer); liveComposeTimer = 0; }
      if (liveUpdateMask) flushLiveUpdates();
    };
    el.addEventListener("compositionstart", onStart);
    el.addEventListener("compositionupdate", onUpdate);
    el.addEventListener("compositionend", onEnd);
    el.addEventListener("blur", onEnd);
  }
  bindCompositionGuard($("#super-input"));
  bindCompositionGuard($("#td-input"));

  function connect() {
    const ev = new EventSource("/api/events");
    let lastSuperRaw = "", lastStateRaw = "";
    ev.addEventListener("super", (e) => {
      if (e.data === lastSuperRaw) return;
      lastSuperRaw = e.data;
      const prevSum = JSON.stringify(sup.integrations_summary || null);
      const prevInboxKey = `${sup.queued}:${(sup.entries || []).length}:${sup.entries?.[sup.entries.length - 1]?.id || ""}`;
      sup = normSup(JSON.parse(e.data));
      syncCollieNotifyWatermark(sup.entries, true);
      scheduleLiveUpdates(LIVE_SIDE | LIVE_PENDING_BARS | (view === "collie" ? LIVE_SUPER : 0));
      if (view === "auto" && autoTab === "integrations") {
        const nextSum = JSON.stringify(sup.integrations_summary || null);
        if (nextSum !== prevSum) {
          if (!$("#int-modal")?.open) loadAuto();
          else if (intModalKind === "feishu" && intModalDraft) refreshFeishuModalHealth();
        }
      }
      if (view === "auto" && autoTab === "inbox") {
        const nextInboxKey = `${sup.queued}:${(sup.entries || []).length}:${sup.entries?.[sup.entries.length - 1]?.id || ""}`;
        if (nextInboxKey !== prevInboxKey) loadAuto();
      }
    });
    ev.addEventListener("state", (e) => {
      if (e.data === lastStateRaw) return;
      lastStateRaw = e.data;
      localState = JSON.parse(e.data);
      syncReadCursorFromServer(localState?.last_read_entry_id, sup.entries);
      const next = mergedState();
      notifyTransitions(next);
      state = next;
      scheduleLiveUpdates(LIVE_SIDE | LIVE_UPDATE_ENTRY | (view === "pane" ? LIVE_HEAD : 0) | (view === "collie" ? LIVE_SUPER : 0));
    });
    ev.onopen = () => $("#conn").className = "conn on";
    ev.onerror = async () => {
      $("#conn").className = "conn off";
      try { await api("/api/session"); } catch {}
      if (!$("#login").hidden) return;
      // A restart can answer with an error status, which closes the stream
      // for good; open a new one or the page silently goes stale.
      if (ev.readyState === EventSource.CLOSED && liveEv === ev) setTimeout(() => { if (liveEv === ev) connect(); }, 2000);
    };
    liveEv = ev;
  }
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && $("#login").hidden && liveEv?.readyState === EventSource.CLOSED) connect();
  });

  // A finished agent you have open here has been seen: the hub then shows
  // it as idle everywhere (herdr itself only counts its own terminal).
  const seenAt = new Map();
  function markSeen(v) {
    if (v.status !== "done" || document.hidden || Date.now() - (seenAt.get(v.pane_id) || 0) < 3000) return;
    seenAt.set(v.pane_id, Date.now());
    api("/api/seen", { body: { pane: v.pane_id } }).catch(() => {});
  }
  document.addEventListener("visibilitychange", () => { if (view === "pane" && find(current)) markSeen(find(current)); });

  // ───────────────────────────── browser notifications (Collie replies + agents)
  const entryIdNum = (id) => {
    if (!id) return 0;
    const s = String(id);
    if (s.charCodeAt(0) === 101 && s.length > 1) { // fast path for "e1234"
      const n = Number(s.slice(1));
      if (Number.isInteger(n) && n > 0) return n;
    }
    return parseInt(s.replace(/^[a-z]+/i, ""), 10) || 0;
  };
  function notifyEnvState() {
    if (window.isSecureContext === false) {
      return {
        supported: false, insecure: true, permission: "unsupported", active: false, warn: true,
        text: "当前为非 HTTPS 内网地址，浏览器禁止桌面通知；通过本机 127.0.0.1 或 HTTPS 打开即可生效",
      };
    }
    if (!("Notification" in window)) {
      return {
        supported: false, insecure: false, permission: "unsupported", active: false, warn: true,
        text: "当前浏览器不支持桌面通知（手机上通常需要先添加到主屏幕）",
      };
    }
    const perm = Notification.permission || "default";
    if (perm === "denied") {
      return {
        supported: true, insecure: false, permission: "denied", active: false, warn: true,
        text: "已被浏览器拦截，请在地址栏左侧站点设置中重新开启",
      };
    }
    if (perm === "granted") {
      const active = !!prefs.notify();
      return {
        supported: true, insecure: false, permission: "granted", active, warn: false,
        text: active
          ? "已开启：页面在后台时，Collie 回复、agent 完成或需要你确认都会弹桌面通知"
          : "已关闭：开启后，页面在后台时 Collie 回复和 agent 状态变化会弹桌面通知",
      };
    }
    return {
      supported: true, insecure: false, permission: "default", active: false, warn: false,
      text: "开启后会请求浏览器授权；页面在后台时，Collie 回复、agent 完成或需要你确认都会弹桌面通知",
    };
  }
  const canBrowserNotify = () => notifyEnvState().active;
  const pageInBackground = () => !!document.hidden || (typeof document.hasFocus === "function" && !document.hasFocus());
  function collieNotifySummary(text) {
    const cleaned = String(text || "")
      .replace(/```[^\n`]*\n?([\s\S]*?)(?:```|$)/g, " ")
      .replace(/\[image:[^\]]+\]/g, " ")
      .replace(/\[([^\]\n]+)\]\([^)\n]+\)/g, "$1");
    for (const raw of cleaned.split("\n")) {
      const line = raw.replace(/^\s*(?:[#>*•\-]+|\d+[.)])\s+/, "").replace(/\*\*|__|`/g, "").replace(/\s+/g, " ").trim();
      if (line) return line.length > 120 ? line.slice(0, 120) + "…" : line;
    }
    const fallback = plainLine(text);
    return fallback ? (fallback.length > 120 ? fallback.slice(0, 120) + "…" : fallback) : "Collie 有新回复";
  }
  let collieNotifyPrimed = false;
  let lastCollieNotifyNum = 0;
  const seenCollieNotifyIds = new Set();
  function syncCollieNotifyWatermark(entries, allowNotify) {
    const list = Array.isArray(entries) ? entries : [];
    const collies = list.filter((e) => e && e.role === "collie" && e.id);
    if (!collieNotifyPrimed || !allowNotify) {
      for (const e of collies) {
        seenCollieNotifyIds.add(e.id);
        const n = entryIdNum(e.id);
        if (n > lastCollieNotifyNum) lastCollieNotifyNum = n;
      }
      collieNotifyPrimed = true;
      return;
    }
    const fresh = [];
    for (const e of collies) {
      if (seenCollieNotifyIds.has(e.id)) continue;
      const n = entryIdNum(e.id);
      seenCollieNotifyIds.add(e.id);
      if (n === 0 || n > lastCollieNotifyNum) {
        if (n > lastCollieNotifyNum) lastCollieNotifyNum = n;
        fresh.push(e);
      }
    }
    if (seenCollieNotifyIds.size > 600) {
      const keep = [...seenCollieNotifyIds].slice(-300);
      seenCollieNotifyIds.clear();
      for (const id of keep) seenCollieNotifyIds.add(id);
    }
    if (!fresh.length || !pageInBackground() || !canBrowserNotify()) return;
    const latest = fresh[fresh.length - 1];
    try {
      const n = new Notification("Collie", { body: collieNotifySummary(latest.text), icon: "/icon.svg", tag: "collie-reply" });
      n.onclick = () => { try { focus(); } catch {} location.hash = "#/collie"; };
    } catch {}
  }
  function sendTestNotification() {
    const env = notifyEnvState();
    if (!env.active) {
      toast(env.text, "attn");
      return false;
    }
    try {
      const n = new Notification("Collie", {
        body: "浏览器通知工作正常，Collie 回复和 agent 状态变化会这样提醒你。",
        icon: "/icon.svg",
        tag: "collie-test",
      });
      n.onclick = () => { try { focus(); } catch {} location.hash = "#/collie"; };
      toast("已发送测试通知");
      return true;
    } catch (err) {
      toast("发送通知失败：" + (err?.message || "浏览器拒绝了通知"), "attn");
      return false;
    }
  }

  function notifyTransitions(next) {
    for (const a of next.agents) {
      const before = prevStatus.get(a.pane_id);
      if (before && before !== a.status) {
        if (a.status === "blocked") ping(`${title(a)} 需要你确认`, a, "attn");
        else if (before === "working" && (a.status === "done" || a.status === "idle") && !isWorker(a.name) && a.name !== ROUTER) {
          ping(`${title(a)} 完成了`, a);
        }
      }
    }
    prevStatus = new Map(next.agents.map((a) => [a.pane_id, a.status]));
  }

  function ping(msg, a, kind) {
    if (a.pane_id !== current || document.hidden) {
      toast(msg, kind);
      if (pageInBackground() && canBrowserNotify()) {
        try {
          const n = new Notification("Collie", { body: msg, icon: "/icon.svg", tag: a.pane_id });
          n.onclick = () => { try { focus(); } catch {} location.hash = "#/p/" + encodeURIComponent(a.pane_id); };
        } catch {}
      }
    }
  }

  // Tell the hub a page of Collie is in front of you: it holds back
  // notifications while you can see them here.
  const seen = () => { if (!document.hidden && document.hasFocus()) api("/api/super/seen", { body: { url: location.origin } }).catch(() => {}); };
  setInterval(seen, 30e3);
  document.addEventListener("visibilitychange", seen);
  addEventListener("focus", seen);

  // Optimistic pin toggles before the hub's next stream frame lands: id -> { pinned, item }.
  const pinnedLocal = new Map();
  const AT_BOTTOM_PX = 36;
  const CHAT_READ_KEY = "chatReadEntryId";
  const UNREAD_TOP_PAD = 14;
  const CHAT_READ_DEBOUNCE_MS = 450;
  let readCursorId = "";
  let serverReadCursorId = "";
  let sessionUnreadMarkerId = "";
  let unreadAnchorApplied = false;
  let readSyncTimer = 0;
  let pendingReadSyncId = "";
  const latestEntryNum = (list) => {
    let max = 0;
    for (const e of list || []) {
      const n = entryIdNum(e?.id);
      if (n > max) max = n;
    }
    return max;
  };
  const latestPersistedEntryId = (list = chatEntries()) => {
    let bestId = "", bestN = 0;
    for (const e of list || []) {
      const n = entryIdNum(e?.id);
      if (n > bestN) { bestN = n; bestId = e.id; }
    }
    return bestId;
  };
  function syncReadCursorFromServer(rawId, entries = sup.entries) {
    const srvId = typeof rawId === "string" ? rawId.trim() : "";
    const srvN = entryIdNum(srvId);
    const maxN = latestEntryNum(entries);
    if (srvN > entryIdNum(serverReadCursorId)) {
      serverReadCursorId = srvId;
    }
    let locId = store.get(CHAT_READ_KEY, "");
    let locN = entryIdNum(locId);
    if (locN > 0 && maxN > 0 && locN > maxN) {
      locId = "";
      locN = 0;
      store.set(CHAT_READ_KEY, "");
    }
    const curN = entryIdNum(readCursorId);
    if (curN > 0 && maxN > 0 && curN > maxN && srvN < curN) {
      readCursorId = "";
    }
    const bestN = Math.max(entryIdNum(readCursorId), entryIdNum(serverReadCursorId), locN);
    if (bestN > 0) {
      const bestId = bestN === entryIdNum(serverReadCursorId) ? serverReadCursorId
        : bestN === entryIdNum(readCursorId) ? readCursorId
        : locId;
      if (bestId !== readCursorId) readCursorId = bestId;
      if (entryIdNum(bestId) > locN) store.set(CHAT_READ_KEY, bestId);
    }
  }
  function sendChatReadNow(entryId, keepalive = false) {
    const id = String(entryId || "").trim();
    if (!id || entryIdNum(id) <= entryIdNum(serverReadCursorId)) return;
    if (keepalive && typeof fetch === "function") {
      try {
        fetch("/api/chat/read", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ entry_id: id }),
          keepalive: true,
        }).catch(() => {});
      } catch {}
      return;
    }
    api("/api/chat/read", { body: { entry_id: id } })
      .then((r) => {
        const ack = r?.last_read_entry_id || id;
        if (entryIdNum(ack) > entryIdNum(serverReadCursorId)) serverReadCursorId = ack;
      })
      .catch(() => {});
  }
  function flushPendingChatRead(keepalive = false) {
    if (!pendingReadSyncId) return;
    clearTimeout(readSyncTimer);
    readSyncTimer = 0;
    const sendId = pendingReadSyncId;
    pendingReadSyncId = "";
    sendChatReadNow(sendId, keepalive);
  }
  function commitChatRead(entryId, opts = {}) {
    const id = String(entryId || "").trim();
    const n = entryIdNum(id);
    if (n <= 0) return;
    if (n > entryIdNum(readCursorId)) {
      readCursorId = id;
      store.set(CHAT_READ_KEY, id);
    }
    const targetId = readCursorId;
    if (entryIdNum(targetId) <= entryIdNum(serverReadCursorId)) return;
    pendingReadSyncId = targetId;
    if (opts.immediate) {
      flushPendingChatRead(!!opts.keepalive);
      return;
    }
    clearTimeout(readSyncTimer);
    readSyncTimer = setTimeout(() => {
      readSyncTimer = 0;
      const sendId = pendingReadSyncId;
      pendingReadSyncId = "";
      if (sendId) sendChatReadNow(sendId, false);
    }, opts.delay ?? CHAT_READ_DEBOUNCE_MS);
  }
  function normSup(s) {
    s.hasPending = Array.isArray(s.pending);
    s.entries ||= []; s.workers ||= []; s.pending ||= []; s.pinned ||= []; s.router ||= { status: "asleep" };
    syncReadCursorFromServer(s.last_read_entry_id, s.entries);
    // Preserve entries sliding off the front of the hub's 200-entry window when
    // earlier pages are loaded or the viewer is reading above the bottom, so an
    // anchored historical message never vanishes from the DOM on SSE updates.
    if (sup.entries?.length && s.entries.length) {
      const sc = $("#super-thread")?.parentElement;
      const keepSpilled = older.length > 0 || !!activeThreadRoot || (view === "collie"
        ? !!(sc && sc.clientHeight > 0 && sc.scrollHeight - sc.scrollTop - sc.clientHeight > AT_BOTTOM_PX)
        : scrollByRoute.get("collie")?.atBottom === false);
      if (keepSpilled) {
        const nextIds = new Set(s.entries.map((e) => e?.id));
        const oldIds = new Set(older.map((e) => e?.id));
        const spilled = sup.entries.filter((e) => e?.id && !nextIds.has(e.id) && !oldIds.has(e.id));
        if (spilled.length) older = [...older, ...spilled];
      }
    }
    for (const [id, loc] of pinnedLocal) {
      if (s.pinned.some((p) => p?.id === id) === loc.pinned) pinnedLocal.delete(id);
    }
    return s;
  }
  let _agentByNameCache = { ref: null, len: -1, map: new Map() };
  function getAgentByName() {
    const arr = state.agents || [];
    if (_agentByNameCache.ref === arr && _agentByNameCache.len === arr.length) return _agentByNameCache.map;
    const map = new Map();
    for (let i = 0; i < arr.length; i++) {
      const a = arr[i];
      if (a?.name && !map.has(a.name)) map.set(a.name, a);
    }
    _agentByNameCache = { ref: arr, len: arr.length, map };
    return map;
  }
  const isWorker = (name) => {
    const w = name ? getWorkerLookup().byName.get(name) : null;
    return !!(w && !w.ended);
  };
  const paneOf = (name) => (name ? getAgentByName().get(name)?.pane_id : undefined);
  // A worker's status as the sidebar shows it (which knows when it waits on
  // background work), else as Collie last saw it.
  const workerStatus = (w) => (!w.ended && w.name && getAgentByName().get(w.name)?.status) || w.status;
  const workerBusy = (w) => !w.ended && ["working", "starting", "waiting"].includes(workerStatus(w));
  const find = (id) => state.agents.find((a) => a.pane_id === id) || state.shells.find((a) => a.pane_id === id);
  // What to call an agent: the session's own title; a handle like "agy-1" says
  // nothing, so until there's a title use the folder it works in.
  const autoName = (n) => /^(claude|codex|agy|antigravity|doubao)-\d+$/.test(n || "");
  const base = (p) => (p || "").replace(/\/+$/, "").split("/").pop() || "~";
  function title(v) {
    if (!v) return "";
    if (v.name === ROUTER) return "Collie";
    if (isWorker(v.name)) return v.name; // Collie talks about its agents by name
    return v.topic || (v.name && !autoName(v.name) ? v.name : base(tilde(v.cwd))) || v.pane_id;
  }

  // ───────────────────────────── sidebar
  function itemHTML(v, workerThreadMap = null, allEntries = null) {
    const where = (state.machines || []).length > 1 ? machineName(v.machine) + " · " : "";
    const named = v.is_agent && v.name !== ROUTER && !isWorker(v.name) && v.name && !autoName(v.name) && v.topic && v.topic !== v.name ? v.name + " · " : "";
    const sub = v.name === ROUTER ? "Collie 停在一个对话框上"
      : v.is_agent ? `${named}${KIND_LABEL[v.kind] || v.kind} · ${where}${base(tilde(v.cwd))}` : where + tilde(v.cwd);
    const label = v.is_agent ? title(v) : v.workspace_label || base(tilde(v.cwd));
    const isRealAgent = v.is_agent && v.name !== ROUTER;
    const entries = isRealAgent ? (allEntries || chatEntries()) : null;
    const linked = isRealAgent ? ((workerThreadMap || computeWorkerThreadMap(null, entries)).get(v.name) || null) : null;
    const sum = isRealAgent ? agentTaskSummary(v, findWorkerForAgent(v), linked, entries) : null;
    const sumText = sum && sum.short && sum.short !== label ? sum.short : "";
    const sumFull = sumText ? (sum.full || sumText) : "";
    const cardTitle = sumFull ? `${label} — ${sumFull}` : label;
    const sumHtml = sumText ? `<div class="item-sum" title="${esc(sumFull)}">${esc(sumText)}</div>` : "";
    const itemCls = `item${sumHtml ? " has-sum" : ""}${linked ? " has-th" : ""}${view === "pane" && v.pane_id === current ? " active" : ""}`;
    const card = `<a class="${itemCls}" href="#/p/${encodeURIComponent(v.pane_id)}" title="${esc(cardTitle)}">
      <span class="glyph">${glyph(v)}</span>
      <span class="body"><div class="name">${isCollieOwned(v) && v.name !== ROUTER ? `<span class="nm" title="${esc(label)}">${esc(label)}</span><span class="by-collie">Collie 派出</span>` : esc(label)}</div>${sumHtml}<div class="sub">${esc(sub)}</div></span>
      <span class="dot ${esc(v.status)}" title="${esc(STATUS_LABEL[v.status] || v.status)}"></span></a>`;
    if (!linked) return `<li>${card}</li>`;
    const isThActive = view === "collie" && !!activeThreadRoot && activeThreadRoot === linked.rootId;
    const thTip = linked.title ? `打开关联话题：${linked.title}` : "打开关联话题抽屉";
    const thAria = linked.title ? `打开 ${label} 关联的话题抽屉：${linked.title}` : `打开 ${label} 关联的话题抽屉`;
    return `<li class="item-wrap">${card}<button type="button" class="item-th-btn${isThActive ? " active" : ""}" data-agent-thread="${esc(linked.rootId)}" data-agent-focus="${esc(linked.focusId)}" aria-expanded="${isThActive ? "true" : "false"}" title="${esc(thTip)}" aria-label="${esc(thAria)}">${ICON_TOPIC}</button></li>`;
  }

  const machineName = (id) => (state.machines || []).find((m) => m.id === (id || ""))?.name || id || "本机";
  const isCollieOwned = (v) => v.name === ROUTER || isWorker(v.name);

  // "09:00", "明天 09:00", "11月24日 09:00".
  function whenShort(at) {
    const d = new Date(at), hm = d.toTimeString().slice(0, 5);
    const days = Math.round((new Date(d).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 864e5);
    return days === 0 ? hm : days === 1 ? "明天 " + hm : `${d.getMonth() + 1}月${d.getDate()}日 ${hm}`;
  }
  function renderSide() {
    const allEntries = chatEntries();
    const wtMap = computeWorkerThreadMap(null, allEntries);
    const blocked = state.agents.filter((a) => a.status === "blocked");
    $("#attention-group").hidden = blocked.length === 0;
    setHTML($("#attention"), blocked.map((a) => itemHTML(a, wtMap, allEntries)).join(""));

    const machines = (state.machines || [{ id: "", name: "本机", local: true, online: state.ok }]);
    const multi = machines.length > 1;

    renderSessions(wtMap, allEntries);
    setHTML($("#shells"), state.shells.map((s) => itemHTML(s, wtMap, allEntries)).join(""));
    setText($("#shell-count"), state.shells.length || "");
    $("#shell-group").hidden = state.shells.length === 0;

    const online = machines.filter((m) => m.local ? state.ok : m.online).length;
    const connCls = "conn " + (online ? "on" : "off");
    if ($("#conn").className !== connCls) $("#conn").className = connCls;
    setText($("#herdr-status"), !online ? "herdr 不可用" : multi ? `${online}/${machines.length} 台电脑在线` : `${state.agents.length} 个 agent`);
    if (!state.ok && state.error) $("#herdr-status").title = state.error;
    const wantDocTitle = blocked.length ? `(${blocked.length}) Collie` : "Collie";
    if (view !== "file" && document.title !== wantDocTitle) document.title = wantDocTitle;

    const r = sup.router || {};
    const active = sup.workers.filter((w) => !w.ended);
    const running = active.filter(workerBusy).length;
    setText($("#nav-collie-sub"), collieStatus(r.status) + (running ? ` · ${running} 个任务在跑` : active.length ? ` · 派出 ${active.length} 个` : ""));
    // The next time Collie set itself to look again, under 自动化 where its
    // timers are: "明天 09:00 再看：复查 paper_df…".
    const f = sup.follow;
    setText($("#nav-auto-sub"), f?.next ? `${whenShort(f.next)} 再看：${f.next_text || ""}` : "记忆 · 定时 · 接入");
    const wantFollowTitle = f?.next ? `Collie 设的下一次跟进：${f.next_text || ""}（点开看进行中的任务）` : "";
    if ($("#nav-auto-sub").title !== wantFollowTitle) $("#nav-auto-sub").title = wantFollowTitle;
    $("#nav-auto-sub").classList.toggle("follow", !!f?.next);
    const dotCls = "dot " + collieDot(r.status);
    if ($("#nav-collie-dot").className !== dotCls) $("#nav-collie-dot").className = dotCls;
    const pend = activePending();
    const unreadCount = pend.length === 0 && view !== "collie" ? computeUnreadInfo(allEntries).count : 0;
    const np = $("#nav-pending");
    if (np) {
      if (pend.length > 0) {
        np.hidden = false;
        np.classList.add("attn");
        np.classList.remove("unread");
        setText(np, pend.length > 99 ? "99+" : String(pend.length));
        const lbl = `${pend.length} 条待处理`;
        if (np.title !== lbl) { np.title = lbl; np.setAttribute("aria-label", lbl); }
      } else if (unreadCount > 0) {
        np.hidden = false;
        np.classList.remove("attn");
        np.classList.add("unread");
        setText(np, unreadCount > 99 ? "99+" : String(unreadCount));
        const lbl = `${unreadCount} 条未读`;
        if (np.title !== lbl) { np.title = lbl; np.setAttribute("aria-label", lbl); }
      } else {
        np.hidden = true;
        np.classList.add("attn");
        np.classList.remove("unread");
        setText(np, "");
        if (np.title !== "") { np.title = ""; np.removeAttribute("aria-label"); }
      }
    }
    const intErr = sup.integrations_summary?.error || 0;
    const nie = $("#nav-int-err");
    if (nie) {
      nie.hidden = intErr === 0;
      setText(nie, intErr || "");
      const errTitle = intErr ? `${intErr} 个外部接入异常` : "";
      if (nie.title !== errTitle) nie.title = errTitle;
    }
    $("#nav-queue").hidden = !sup.queued;
    setText($("#nav-queue"), sup.queued);
    $("#nav-collie").classList.toggle("active", view === "collie");
    $("#nav-auto").classList.toggle("active", view === "auto");
    $("#nav-devices").classList.toggle("active", view === "devices");
    $("#nav-prefs").classList.toggle("active", view === "prefs");
  }

  // ───────────────────────────── routing & scroll restoration
  // Track in-app history depth on history.state so the header back button pops
  // back to the exact caller view when available, and falls back inside Collie
  // on deep links or fresh standalone PWA launches without exiting the app.
  let navCur = typeof history.state?.collieIdx === "number" ? history.state.collieIdx : 0;
  let booted = false;
  // Saved reading position per history entry (collieIdx) and per logical route.
  const scrollByIdx = new Map();
  const scrollByRoute = new Map();
  const threadByIdx = new Map();
  let programmaticScrollUntil = 0;
  let collieRestoreRAF = 0;
  let activeCollieRestore = null;
  let collieLayoutLock = null;
  let scrollTrackRAF = 0;

  const markProgrammaticScroll = (ms = 90) => {
    programmaticScrollUntil = Math.max(programmaticScrollUntil, performance.now() + ms);
  };
  function routeKeyFor(v, id) {
    if (v === "collie") return "collie";
    if (v === "auto") return "auto:" + autoTab;
    if (v === "devices") return "devices";
    if (v === "prefs") return "prefs";
    if (v === "file") return "file:" + (id || "");
    if (v === "ext") return "ext:" + (id || "");
    if (v === "pane") return "pane:" + (id || "") + ":" + ($("#viewer")?.dataset.mode || curMode());
    return "";
  }
  function viewScroller(v = view) {
    if (v === "collie") return $("#super-thread")?.parentElement || null;
    if (v === "auto") return $("#auto-body");
    if (v === "devices") return $("#devices-body");
    if (v === "prefs") return $("#prefs-body");
    if (v === "file") return $("#rv-scroller");
    if (v === "ext") return $("#x-thread")?.parentElement || null;
    if (v === "pane") {
      const m = $("#viewer")?.dataset.mode || curMode();
      if (m === "screen") return $("#screen");
      if (m === "log") return $("#log");
      return scroller($("#thread"));
    }
    return null;
  }
  function extractCollieAnchorEl(box, hit) {
    if (!hit || !box || (typeof box.contains === "function" && !box.contains(hit))) return null;
    const direct = hit.closest?.(".msg[data-id], .event[data-id]");
    if (direct && (!box.contains || box.contains(direct))) return direct;
    const row = hit.closest?.(".say, .mine");
    if (row && (!box.contains || box.contains(row))) {
      return row.querySelector?.(".msg[data-id]") || null;
    }
    return null;
  }
  function neighborCollieAnchor(box, el, dir) {
    if (!box || !el) return null;
    let cur = el.closest?.(".say, .mine") || el;
    for (let steps = 0; steps < 6 && cur; steps++) {
      cur = dir < 0 ? cur.previousElementSibling : cur.nextElementSibling;
      if (!cur) return null;
      if (cur.matches?.(".msg[data-id], .event[data-id]")) return cur;
      if (cur.classList?.contains("say") || cur.classList?.contains("mine")) {
        const m = cur.querySelector?.(".msg[data-id]");
        if (m) return m;
      }
    }
    return null;
  }
  function captureCollieAnchor(sc) {
    const box = $("#super-thread");
    if (!box || !sc || sc.clientHeight <= 0) return null;
    const sr = sc.getBoundingClientRect();
    const edge = sr.top + 4;
    let pick = null;
    let pr = null;

    // O(1) hit-test against the visible viewport top so off-screen `content-visibility: auto`
    // messages are never forced to lay out by a full DOM scan or binary-search rects.
    const hasEfp = typeof document.elementsFromPoint === "function" || typeof document.elementFromPoint === "function";
    if (hasEfp && sr.width > 0 && sr.height > 0 && typeof box.getBoundingClientRect === "function") {
      const br = box.getBoundingClientRect();
      const left = Math.max(sr.left + 8, br.left + 8);
      const right = Math.min(sr.right - 8, br.right - 8);
      const probeX = right > left ? (left + right) * 0.5 : sr.left + sr.width * 0.5;
      const vw = typeof innerWidth === "number" ? innerWidth : 0;
      const vh = typeof innerHeight === "number" ? innerHeight : 0;
      if ((!vw || (probeX >= 0 && probeX < vw)) && sr.bottom > 0) {
        const offsets = [8, 36, 72];
        for (let oi = 0; oi < offsets.length && !pick; oi++) {
          const probeY = sr.top + offsets[oi];
          if (probeY >= sr.bottom - 2 || probeY < 0 || (vh && probeY >= vh)) continue;
          const hits = typeof document.elementsFromPoint === "function"
            ? document.elementsFromPoint(probeX, probeY)
            : [document.elementFromPoint(probeX, probeY)];
          for (let hi = 0; hi < hits.length; hi++) {
            const cand = extractCollieAnchorEl(box, hits[hi]);
            if (cand) { pick = cand; break; }
          }
        }
        if (pick) {
          pr = pick.getBoundingClientRect();
          // If the probe stepped past a compact row sitting right at the top edge, walk back.
          for (let back = 0; back < 3 && pr.top > edge; back++) {
            const prev = neighborCollieAnchor(box, pick, -1);
            if (!prev) break;
            const prevR = prev.getBoundingClientRect();
            if (prevR.bottom > edge) { pick = prev; pr = prevR; }
            else break;
          }
          // If the hit element ended above the edge, advance to the first row crossing `edge`.
          for (let fwd = 0; fwd < 3 && pr.bottom <= edge; fwd++) {
            const next = neighborCollieAnchor(box, pick, 1);
            if (!next) break;
            pick = next;
            pr = next.getBoundingClientRect();
          }
          if (pr.bottom <= edge) {
            pick = null;
            pr = null;
          } else if (pr.top < sr.top - 4) {
            const next = neighborCollieAnchor(box, pick, 1);
            if (next) {
              const nr = next.getBoundingClientRect();
              if (nr.top >= sr.top - 4 && nr.top < sr.bottom - 24) {
                pick = next;
                pr = nr;
              }
            }
          }
        }
      }
    }

    // Boundary fallback (e.g. non-browser test DOM or a tall non-message gap spanning the probe band).
    if (!pick) {
      const msgs = box.querySelectorAll(".msg[data-id], .event[data-id]");
      if (!msgs.length) return null;
      let lo = 0, hi = msgs.length - 1, pickIdx = msgs.length - 1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        const mr = msgs[mid].getBoundingClientRect();
        if (mr.bottom > edge) {
          pickIdx = mid;
          hi = mid - 1;
        } else {
          lo = mid + 1;
        }
      }
      pick = msgs[pickIdx];
      pr = pick.getBoundingClientRect();
      if (pr.top < sr.top - 4 && pickIdx + 1 < msgs.length) {
        const next = msgs[pickIdx + 1];
        const nr = next.getBoundingClientRect();
        if (nr.top >= sr.top - 4 && nr.top < sr.bottom - 24) {
          pick = next;
          pr = nr;
        }
      }
    }
    const anchorId = pick?.dataset.id || "";
    if (!anchorId || !pr) return null;
    return { anchorId, anchorOffset: pr.top - sr.top };
  }
  function applyCollieAnchor(sc, snap) {
    if (!sc || !snap) return false;
    const box = $("#super-thread");
    if (snap.unreadSep && box) {
      const sep = $("#unread-sep", box);
      if (sep) {
        const sr = sc.getBoundingClientRect();
        const mr = sep.getBoundingClientRect();
        const delta = (mr.top - sr.top) - snap.anchorOffset;
        if (Math.abs(delta) > 0.5) {
          markProgrammaticScroll(120);
          sc.scrollTop += delta;
        }
        return true;
      }
    }
    if (snap.anchorId && box) {
      const eid = CSS.escape(snap.anchorId);
      const el = box.querySelector(`.msg[data-id="${eid}"], .event[data-id="${eid}"]`);
      if (el) {
        const sr = sc.getBoundingClientRect();
        const mr = el.getBoundingClientRect();
        const delta = (mr.top - sr.top) - snap.anchorOffset;
        if (Math.abs(delta) > 0.5) {
          markProgrammaticScroll(120);
          sc.scrollTop += delta;
        }
        return true;
      }
    }
    const fallback = (snap.useFromBottom && typeof snap.fromBottom === "number")
      ? Math.max(0, sc.scrollHeight - snap.fromBottom)
      : snap.scrollTop;
    if (Math.abs(sc.scrollTop - fallback) > 0.5) {
      markProgrammaticScroll(120);
      sc.scrollTop = fallback;
    }
    return false;
  }
  function isCollieNearBottom(sc = viewScroller("collie")) {
    if (!sc || sc.clientHeight <= 0) return true;
    return (sc.scrollHeight - sc.scrollTop - sc.clientHeight) <= AT_BOTTOM_PX;
  }
  function captureEntryAnchor(sc, entryId) {
    if (!sc || !entryId || sc.clientHeight <= 0) return null;
    const box = $("#super-thread");
    if (!box) return null;
    const eid = CSS.escape(entryId);
    const el = box.querySelector(`.msg[data-id="${eid}"], .event[data-id="${eid}"]`);
    if (!el) return null;
    const sr = sc.getBoundingClientRect();
    const mr = el.getBoundingClientRect();
    if (mr.bottom <= sr.top || mr.top >= sr.bottom) return null;
    return {
      atBottom: false,
      scrollTop: sc.scrollTop,
      anchorId: entryId,
      anchorOffset: mr.top - sr.top,
    };
  }
  function captureColliePos(sc = viewScroller("collie")) {
    if (!sc || sc.clientHeight <= 0) return null;
    const dist = sc.scrollHeight - sc.scrollTop - sc.clientHeight;
    const atBottom = dist <= AT_BOTTOM_PX;
    const anc = !atBottom ? captureCollieAnchor(sc) : null;
    return {
      atBottom,
      scrollTop: sc.scrollTop,
      fromBottom: sc.scrollHeight - sc.scrollTop,
      anchorId: anc?.anchorId || "",
      anchorOffset: anc?.anchorOffset || 0,
    };
  }
  function applyColliePos(sc, snap) {
    if (!sc || !snap || sc.clientHeight <= 0) return false;
    if (snap.atBottom) {
      const target = Math.max(0, sc.scrollHeight - sc.clientHeight);
      if (Math.abs(sc.scrollTop - target) > 0.5) {
        markProgrammaticScroll(120);
        sc.scrollTop = sc.scrollHeight;
      }
      return true;
    }
    return applyCollieAnchor(sc, snap);
  }
  function cancelCollieLayoutLock() {
    const lock = collieLayoutLock;
    if (!lock) return;
    collieLayoutLock = null;
    if (lock.raf && typeof cancelAnimationFrame === "function") cancelAnimationFrame(lock.raf);
    if (lock.timer) clearTimeout(lock.timer);
    if (lock.ro) try { lock.ro.disconnect(); } catch {}
    if (lock.app && lock.onEnd) lock.app.removeEventListener("transitionend", lock.onEnd);
  }
  function beginCollieLayoutLock(snap, opts = {}) {
    if (!snap || view !== "collie") return;
    cancelCollieLayoutLock();
    const sc = viewScroller("collie");
    if (!sc) return;
    const track = opts.trackTransition !== false;
    const dur = opts.duration || 460;
    const lock = { snap, raf: 0, timer: 0, ro: null, app: null, onEnd: null, until: performance.now() + dur };
    collieLayoutLock = lock;
    applyColliePos(sc, snap);
    updateSuperJump();
    const finish = () => {
      if (collieLayoutLock !== lock) return;
      cancelCollieLayoutLock();
      if (view === "collie") {
        applyColliePos(sc, snap);
        captureViewScroll("collie", null, navCur);
        updateSuperJump();
      }
    };
    if (!track) {
      if (typeof requestAnimationFrame === "function") {
        let sync = true;
        lock.raf = requestAnimationFrame(() => {
          if (sync) { finish(); return; }
          finish();
        });
        sync = false;
      } else {
        finish();
      }
      return;
    }
    if (typeof ResizeObserver === "function") {
      lock.ro = new ResizeObserver(() => {
        if (collieLayoutLock !== lock || view !== "collie") return;
        applyColliePos(sc, snap);
        updateSuperJump();
      });
      try { lock.ro.observe(sc); } catch {}
    }
    const appEl = $("#app");
    if (appEl) {
      lock.app = appEl;
      lock.onEnd = (ev) => {
        if (ev.target !== appEl || ev.propertyName !== "grid-template-columns") return;
        if (collieLayoutLock !== lock) return;
        applyColliePos(sc, snap);
        updateSuperJump();
        if (typeof requestAnimationFrame === "function") {
          let sync = true;
          lock.raf = requestAnimationFrame(() => { if (sync) { finish(); return; } finish(); });
          sync = false;
        } else {
          finish();
        }
      };
      appEl.addEventListener("transitionend", lock.onEnd);
    }
    lock.timer = setTimeout(finish, dur + 40);
    if (typeof requestAnimationFrame === "function") {
      let frames = 0;
      const tick = () => {
        if (collieLayoutLock !== lock || view !== "collie") return;
        applyColliePos(sc, snap);
        updateSuperJump();
        frames++;
        if (performance.now() >= lock.until || frames >= 45) {
          finish();
          return;
        }
        let sync = true;
        lock.raf = requestAnimationFrame(() => {
          if (sync) { finish(); return; }
          tick();
        });
        sync = false;
      };
      let sync = true;
      lock.raf = requestAnimationFrame(() => {
        if (sync) { finish(); return; }
        tick();
      });
      sync = false;
    }
  }
  function captureViewScroll(v = view, id = (v === "ext" ? extCur : current), idx = navCur) {
    if (!v) return null;
    if (v === "pane" && ($("#viewer")?.dataset.mode || curMode()) === "screen" && term?.buffer?.active) {
      const routeKey = routeKeyFor(v, id);
      const buf = term.buffer.active;
      const snap = {
        routeKey,
        atBottom: (buf.baseY - buf.viewportY) <= 2,
        scrollTop: buf.viewportY,
        termLine: buf.viewportY,
        anchorId: "",
        anchorOffset: 0,
      };
      if (typeof idx === "number") scrollByIdx.set(idx, snap);
      if (routeKey) scrollByRoute.set(routeKey, snap);
      return snap;
    }
    const sc = viewScroller(v);
    if (!sc || sc.clientHeight <= 0) return null;
    const dist = sc.scrollHeight - sc.scrollTop - sc.clientHeight;
    const atBottom = dist <= AT_BOTTOM_PX;
    const routeKey = routeKeyFor(v, id);
    const snap = { routeKey, atBottom, scrollTop: sc.scrollTop, anchorId: "", anchorOffset: 0 };
    if (v === "collie" && !atBottom) {
      const anc = captureCollieAnchor(sc);
      if (anc) {
        snap.anchorId = anc.anchorId;
        snap.anchorOffset = anc.anchorOffset;
      }
    }
    if (typeof idx === "number") scrollByIdx.set(idx, snap);
    if (routeKey) scrollByRoute.set(routeKey, snap);
    return snap;
  }
  function restoreSimpleScroll(el, snap) {
    if (!el || !snap) return;
    const apply = () => {
      if (el.clientHeight <= 0) return;
      markProgrammaticScroll();
      el.scrollTop = snap.atBottom ? el.scrollHeight : snap.scrollTop;
    };
    apply();
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(apply);
  }
  // Defer scroll-anchor capture until scrolling truly settles (`scrollend` + trailing coalesce
  // so stepped wheel ticks or programmatic frame-by-frame scroll never trigger per-frame anchors).
  // route() still captures synchronously before departing a view.
  let scrollEndTimer = 0;
  function scheduleScrollSettleCapture(delayMs) {
    clearTimeout(scrollEndTimer);
    scrollEndTimer = setTimeout(() => {
      scrollEndTimer = 0;
      if (!booted || !view || performance.now() < programmaticScrollUntil) return;
      captureViewScroll(view, view === "ext" ? extCur : current, navCur);
    }, delayMs);
  }
  function captureOnScrollSettle(ev) {
    if (!booted || !view || performance.now() < programmaticScrollUntil) return;
    const sc = viewScroller(view);
    if (!sc || ev.target !== sc || sc.clientHeight <= 0) return;
    scheduleScrollSettleCapture(120);
  }
  if ("onscrollend" in window) {
    document.addEventListener("scroll", (ev) => {
      if (!scrollEndTimer) return;
      const sc = viewScroller(view);
      if (sc && ev.target === sc) { clearTimeout(scrollEndTimer); scrollEndTimer = 0; }
    }, { capture: true, passive: true });
    document.addEventListener("scrollend", captureOnScrollSettle, { capture: true, passive: true });
  } else {
    document.addEventListener("scroll", (ev) => {
      if (!booted || !view || performance.now() < programmaticScrollUntil) return;
      const sc = viewScroller(view);
      if (!sc || ev.target !== sc || sc.clientHeight <= 0) return;
      scheduleScrollSettleCapture(140);
    }, { capture: true, passive: true });
  }

  function syncHistoryIndex() {
    if (typeof history.state?.collieIdx === "number") {
      navCur = history.state.collieIdx;
    } else {
      navCur = booted ? navCur + 1 : 0;
      history.replaceState({ ...(history.state || {}), collieIdx: navCur }, "");
    }
  }
  function replaceHash(hash) {
    history.replaceState({ ...(history.state || {}), collieIdx: navCur }, "", hash);
  }
  function fallbackHash() {
    if (!narrow()) return "#/collie";
    if (view === "pane") {
      const v = find(current);
      if (v && isCollieOwned(v)) return "#/collie";
    } else if (view === "ext" && extCur?.startsWith("h:")) {
      const h = hist.find((x) => x.id === extCur.slice(2));
      if (h && (h.name === ROUTER || sup.workers.some((w) => w.name === h.name))) return "#/collie";
    }
    return "#/";
  }
  function goBack(replaceAtRoot = false) {
    if (navCur > 0) {
      history.back();
      return;
    }
    const dest = fallbackHash();
    if (location.hash === dest || (!location.hash && dest === "#/")) return;
    if (replaceAtRoot) { replaceHash(dest); route(); }
    else location.hash = dest;
  }
  document.addEventListener("click", (e) => {
    if (e.target.closest(".back")) { e.preventDefault(); goBack(); return; }
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest('a[href^="#/"]');
    if (a && a.getAttribute("href") === location.hash) e.preventDefault();
  });

  function route() {
    closePick();
    closeDirPick(false);
    const prevView = view, prevId = view === "ext" ? extCur : current, prevIdx = navCur;
    const wasExistingIdx = typeof history.state?.collieIdx === "number";
    syncHistoryIndex();
    let h = location.hash;
    let next = null, id = null;
    if (h.startsWith("#/p/")) { next = "pane"; id = decodeURIComponent(h.slice(4)); }
    else if (h.startsWith("#/x/")) { next = "ext"; id = decodeURIComponent(h.slice(4)); }
    else if (h.startsWith("#/h/")) { next = "ext"; id = "h:" + decodeURIComponent(h.slice(4)); }
    else if (h === "#/file" || h.startsWith("#/file?")) { next = "file"; id = h.slice(6); }
    else if (h === "#/collie") next = "collie";
    else if (h === "#/auto") next = "auto";
    else if (h === "#/devices") next = "devices";
    else if (h === "#/prefs") next = "prefs";
    else if (!narrow()) {
      // Desktop has no empty home: reopen where you were on fresh launch, else Collie.
      let dest = "#/collie";
      if (!booted && !h) {
        const last = store.get("last", "#/collie");
        const ok = last.startsWith("#/p/") ? !!find(decodeURIComponent(last.slice(4))) : /^#\/(collie|auto|devices|prefs)$/.test(last);
        if (ok) dest = last;
      }
      replaceHash(dest);
      h = dest;
      if (h.startsWith("#/p/")) { next = "pane"; id = decodeURIComponent(h.slice(4)); }
      else next = h.slice(2);
    }
    if (next && next !== "file") store.set("last", h);
    if (next === view && id === (next === "ext" ? extCur : current)) return;
    // Snapshot the departing view right before its DOM is hidden.
    if (prevView && performance.now() >= programmaticScrollUntil) {
      captureViewScroll(prevView, prevId, prevIdx);
    }
    if ($("#app").classList.contains("has-file") && (next === "file" || matchMedia("(max-width: 1000px)").matches)) closeFilePane();
    if (view === "ext" && (next !== "ext" || id !== extCur)) { closeExt(); extCur = null; }
    if (view === "pane" && (next !== "pane" || id !== current)) closeStream();
    if (view === "auto" && next !== "auto") clearInterval(autoTimer);
    if (view === "devices" && next !== "devices") clearInterval(devTimer);
    if (prevView === "collie" && next !== "collie") {
      if (activeThreadRoot) {
        threadByIdx.set(prevIdx, {
          rootId: activeThreadRoot,
          anchorId: activeThreadAnchor,
          scrollTop: $("#td-body")?.scrollTop || 0,
        });
      } else {
        threadByIdx.delete(prevIdx);
      }
    }
    if (next !== "collie") {
      cancelCollieLayoutLock();
      cancelInitialAnchor();
      pendingOpen = false;
      hideSearchPanel();
      closeCollieThreadsPop();
      if (activeThreadRoot) closeThreadDrawer({ rerender: false, immediate: true });
    }
    view = next; current = next === "ext" ? null : id;
    livePageTarget = next === "pane" || (next === "ext" && !id.startsWith("h:")) ? id : null;
    const nextKey = routeKeyFor(next, id);
    const byIdx = wasExistingIdx ? scrollByIdx.get(navCur) : null;
    const saved = (byIdx && byIdx.routeKey === nextKey ? byIdx : null)
      || (next === "collie" || next === "auto" || next === "devices" || next === "prefs" || next === "file" ? scrollByRoute.get(nextKey) : null);

    document.body.classList.toggle("reading-file", next === "file");
    document.body.classList.toggle("show-main", !!next);
    $("#v-collie").hidden = next !== "collie";
    $("#v-auto").hidden = next !== "auto";
    $("#v-devices").hidden = next !== "devices";
    $("#v-prefs").hidden = next !== "prefs";
    $("#v-ext").hidden = next !== "ext";
    $("#detail").hidden = next !== "pane";
    $("#v-file").hidden = next !== "file";
    renderSide();
    if (next === "collie") {
      const wantThread = pendingOpenThread;
      pendingOpenThread = null;
      const savedThread = !wantThread && wasExistingIdx ? threadByIdx.get(navCur) : null;
      const superEl = $("#super-thread");
      const needRebuild = !superBodyKey || (canPatchSuperDom(superEl) && !superEl?.firstElementChild);
      if (saved && !saved.atBottom) {
        unreadAnchorApplied = true;
        renderSuper({ force: needRebuild, restore: saved });
      } else {
        unreadAnchorApplied = false;
        sessionUnreadMarkerId = "";
        renderSuper({ force: needRebuild, unreadAnchor: true });
      }
      renderTarget(true);
      if (wantThread?.rootId) {
        openThreadDrawer(wantThread.rootId, wantThread.focusId || "", wantThread.focusId || wantThread.rootId);
      } else if (savedThread?.rootId) {
        openThreadDrawer(savedThread.rootId, "", savedThread.anchorId || savedThread.rootId, {
          restoreScrollTop: savedThread.scrollTop,
          immediate: true,
        });
      }
      if (!narrow() && ($("#super-search")?.hidden ?? true) && !activeThreadRoot) $("#super-input").focus({ preventScroll: true });
    }
    if (next === "auto") openAuto(saved);
    if (next === "devices") openDevices(saved);
    if (next === "prefs") renderPrefs(saved);
    if (next === "file") openWideFile(id, saved);
    if (next === "ext") openExt(id, saved);
    if (next === "pane") {
      $("#gone").hidden = true;
      $("#log").textContent = "";
      resetChat();
      resetScreen();
      renderHead();
      openStream(saved);
      if (!narrow()) $("#input").focus({ preventScroll: true });
    }
  }
  addEventListener("popstate", route);
  addEventListener("hashchange", route);
  addEventListener("resize", () => { if (booted && !view && !narrow()) route(); });

  // ───────────────────────────── Collie (super-agent) view
  let superSig = "";
  // Which model Collie itself runs with, next to its status.
  function isRouterBusy(r = sup.router) {
    if (!r) return false;
    return ["working", "starting", "dreaming", "blocked"].includes(r.status) || !!r.handover || !!r.dreaming;
  }
  function renderRouterPendingBars() {
    const r = sup.router || {};
    const show = !!(r.alive && r.pending);
    const busy = isRouterBusy(r);
    const text = busy ? "Collie 启动设置已更新（当前正在忙碌，重启后生效）" : "Collie 启动设置已更新 · 重启后生效";
    const html = show ? `<span class="dot blocked" aria-hidden="true"></span><span class="rp-text">${esc(text)}</span><button type="button" class="rp-btn" data-act="router-restart-apply">点此重启生效</button>` : "";
    for (const el of [$("#collie-pending-bar"), $("#settings-pending-bar")]) {
      if (!el) continue;
      el.hidden = !show;
      if (el._html !== html) { el._html = html; el.innerHTML = html; }
    }
  }
  async function renderRouterModel(r) {
    const el = $("#router-model");
    const key = [r.kind, r.model, r.effort].join("|");
    if (el._key === key) return;
    el._key = key;
    let model = r.model;
    if (!model && r.kind) model = (await modelsFor(r.kind === "antigravity" ? "agy" : r.kind, "")).default || "";
    if (el._key !== key) return;
    const parts = [];
    if (model) parts.push(esc(model.split("/").pop()) + (r.model ? "" : "（默认）"));
    if (r.effort) parts.push("思考 " + esc(EFFORT_LABEL[r.effort] || r.effort));
    el.innerHTML = parts.join(" · ");
    el.title = `Collie 自己用的模型${model ? "：" + model : ""}${r.effort ? "，思考强度 " + r.effort : ""}（自动化 → 设置 → Collie 自己）`;
  }
  // A worker's comings and goings: its spawn line shows where it stands, and
  // a dialog waiting on the human shows as a card below. Reports and errors stay.
  const CHATTER = /\s(完成了一轮|等你确认|已停止|已退出|回来了（herdr 恢复了它的窗格）)$/;
  const workerChatter = (e) => e.ref && e.ref !== ROUTER && (e.tone === "done" || e.tone === "info" || e.tone === "blocked") && CHATTER.test(e.text);
  const isHiddenSuperEntry = (e) => {
    if (!e) return true;
    if (e.ref === ROUTER && e.tone === "info" && e.role !== "user" && e.role !== "collie") return true;
    if (e.role === "event" && workerChatter(e)) return true;
    return false;
  };
  const isSubstantiveUnread = (e) => {
    if (!e || !e.id || isHiddenSuperEntry(e)) return false;
    if (e.role === "collie") return true;
    if (e.role === "event" && (e.tone === "error" || e.tone === "blocked")) return true;
    return false;
  };
  let _unreadInfoCache = { key: "", val: { firstUnreadId: "", count: 0 } };
  function computeUnreadInfo(allEntries = chatEntries(), cursorId = readCursorId) {
    const curN = entryIdNum(cursorId);
    if (curN <= 0) return { firstUnreadId: "", count: 0 };
    const entries = allEntries || [];
    const key = `${curN}|${entriesFingerprint(entries)}`;
    if (key === _unreadInfoCache.key) return _unreadInfoCache.val;
    let firstUnreadId = "", count = 0;
    for (const e of entries) {
      if (!isSubstantiveUnread(e)) continue;
      if (entryIdNum(e.id) > curN) {
        if (!firstUnreadId) firstUnreadId = e.id;
        count++;
      }
    }
    const val = { firstUnreadId, count };
    _unreadInfoCache = { key, val };
    return val;
  }
  function findUnreadRowEl(box, id) {
    if (!box || !id) return null;
    const eid = CSS.escape(id);
    const el = box.querySelector(`.msg[data-id="${eid}"], .event[data-id="${eid}"]`);
    if (!el) return null;
    return el.closest(".say, .mine") || el;
  }
  // Messages waiting for Collie itself (an older hub only counts them all).
  const routerQueued = () => sup.queued_router ?? sup.queued;
  // Messages you sent that the hub's stream hasn't shown yet.
  const pendingSays = [];
  let pendingSaySeq = 0;
  // Maps persisted server entry id -> prior optimistic _localId so incremental DOM
  // patching promotes the existing bubble in-place without flashing or re-creating it.
  const promotedPendingKeys = new Map();
  function rememberPromotedPending(realId, localId) {
    if (!realId || !localId) return;
    if (promotedPendingKeys.size >= 64) {
      promotedPendingKeys.delete(promotedPendingKeys.keys().next().value);
    }
    promotedPendingKeys.set(realId, localId);
  }
  // Natural reply-chain thread drawer state.
  let activeThreadRoot = null;
  let activeThreadAnchor = "";
  let drawerReplyTarget = null;
  let pendingOpenThread = null;
  let tdLastSig = "";
  let tdLastCount = 0;
  let tdForceScroll = false;
  const tdRootFetchTried = new Set();
  const ICON_TOPIC = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15.5 11a2 2 0 0 1-2 2H7l-3.5 3V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2z"/><path d="M15.5 8.5h3a2 2 0 0 1 2 2V20L17 17h-6.5a2 2 0 0 1-2-2v-2"/></svg>`;
  const ICON_THREAD_BRANCH = `<svg class="te-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5v9a4 4 0 0 0 4 4h8"/><path d="M14 14l4 4-4 4"/></svg>`;
  const ICON_THREAD_CHEV = `<svg class="te-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>`;
  const ICON_TD_REPLY = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 14L4 9l5-5"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></svg>`;
  const ICON_TD_LOCATE = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/></svg>`;
  const ICON_TD_USER = `<svg viewBox="0 0 64 64" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18.2 24.4c.4-6.8 5.2-11.2 14.4-11.4 7.2-.2 12.2 2.5 13.8 8.3"/><path d="M18.2 24.4c9.2-3.2 22.2-4.2 35-2.4"/><path d="M43.2 21.5c.2 2.4.8 4.2 3.6 7.4.6.7.1 1.7-.9 2l-2 .5c.2 2.8-.8 5.2-3.6 6.4-2.8 1.2-6.4 1-9.2-.3"/><path d="M20.2 24c-1.6 3.8-1.2 7.8 1.8 10.4"/><path d="M24.2 35.2c.2 2.4-.2 4.6-.8 6.4-5.4 2-9.2 5.8-10.9 11.9"/><path d="M23.4 41.6c4.2 3.6 10.2 3.8 15.2.6 4.6 2.1 8.5 5.6 10.9 11.3"/></g><circle cx="39.4" cy="27.2" r="1.45" fill="currentColor" stroke="none"/></svg>`;
  const entryKey = (e) => (e && (e.id || e._localId)) || "";
  const threadWhoLabel = (e) => (e?.role === "user" ? "你" : "Collie");
  const isWorkerActiveStatus = (w) => !!w && !w.ended && ["working", "starting", "waiting", "blocked"].includes(w.status);
  const META_PAREN_TOKEN_RE = /^(?:claude|codex|agy|antigravity|doubao|shell|hub|local|mac|macbook|devbox|linux|darwin|amd64|arm64|worker|agent|main|worktree|v?\d+(?:\.\d+)*|#t\d+|t\d+)$/i;
  function isMetaParen(inner) {
    const parts = String(inner || "").split(/[\s·•\/,|｜\-—–+]+/).filter(Boolean);
    return !parts.length || parts.every((p) => META_PAREN_TOKEN_RE.test(p));
  }
  let _workerLookupCache = { ref: null, len: -1, byPane: new Map(), byName: new Map() };
  function getWorkerLookup() {
    const workers = sup.workers || [];
    if (_workerLookupCache.ref === workers && _workerLookupCache.len === workers.length) {
      return _workerLookupCache;
    }
    const byPane = new Map();
    const byName = new Map();
    for (const w of workers) {
      if (!w) continue;
      if (w.pane_id) {
        const prevP = byPane.get(w.pane_id);
        if (!prevP || (prevP.ended && !w.ended)) byPane.set(w.pane_id, w);
      }
      if (w.name) {
        const prevN = byName.get(w.name);
        if (!prevN || (prevN.ended && !w.ended) || (!!prevN.ended === !!w.ended && (+new Date(w.created_at) || 0) >= (+new Date(prevN.created_at) || 0))) {
          byName.set(w.name, w);
        }
      }
    }
    _workerLookupCache = { ref: workers, len: workers.length, byPane, byName };
    return _workerLookupCache;
  }
  function findWorkerForAgent(v) {
    if (!v || !v.is_agent || v.name === ROUTER) return null;
    const { byPane, byName } = getWorkerLookup();
    const byP = v.pane_id ? byPane.get(v.pane_id) : null;
    if (byP && !byP.ended) return byP;
    const byN = v.name ? byName.get(v.name) : null;
    if (!byP) return byN || null;
    if (!byN) return byP;
    if (!byN.ended) return byN;
    return (+new Date(byN.created_at) || 0) >= (+new Date(byP.created_at) || 0) ? byN : byP;
  }
  const _goalTaskCache = new Map();
  const GOAL_LABEL_RE = /^(?:任务目标|核心目标|目标|任务说明|任务|需求|目的|主题|工作目标|Task|Goal|Objective)\s*(?:[（(][^）)\n]{1,36}[）)])?\s*[:：]\s*(.+)$/i;
  const TASK_PREAMBLE_RE = /^(?:You are worker\b|请先阅读|先阅读|先读|先看下?规范|并发隔离|隔离要求|安全红线|工作目录|路径|仓库|分支|注意|提醒|约束|背景|上下文|环境|Before you start|Note:|Context:)/i;
  const TASK_PATH_ONLY_RE = /^(?:~\/|\/[A-Za-z0-9_.\-/]+)\s*$/;
  const TASK_LEAD_BRACKET_RE = /^(?:【([^】\n]{2,36})】|（([^）\n]{2,36})）)\s*(.*)$/;
  function extractGoalFromTask(rawTask) {
    const raw = String(rawTask || "").trim();
    if (!raw) return { goal: "", full: "" };
    const hit = _goalTaskCache.get(raw);
    if (hit !== undefined) return hit;
    const cleaned = raw
      .replace(/```[^\n`]*\n?([\s\S]*?)(?:```|$)/g, " ")
      .replace(/\[image:[^\]]+\]/g, " ")
      .replace(/\[([^\]\n]+)\]\([^)\n]+\)/g, "$1");
    const rawLines = cleaned.split("\n");
    const lines = [];
    for (let i = 0; i < rawLines.length && lines.length < 14; i++) {
      const s = stripThreadMarkdownLine(rawLines[i]);
      if (s) lines.push(s);
    }
    let res;
    if (!lines.length) {
      res = { goal: "", full: "" };
    } else {
      const isPreamble = (l) => TASK_PREAMBLE_RE.test(l) || TASK_PATH_ONLY_RE.test(l);
      const first = lines[0];
      const workerBracket = first.match(WORKER_TOPIC_PREFIX_RE);
      if (workerBracket) {
        const t = (workerBracket[2] || workerBracket[3] || "").trim();
        if (t && !isMetaParen(t)) {
          const rest = (workerBracket[4] || "").replace(/^[\s:：\-—–·•,，、]+/, "").trim();
          const full = rest ? `${t}：${rest}` : t;
          res = { goal: rest ? `${t} · ${rest}` : t, full };
        }
      }
      if (!res) {
        const leadBracket = first.match(TASK_LEAD_BRACKET_RE);
        if (leadBracket) {
          const t = (leadBracket[1] || leadBracket[2] || "").trim();
          if (t && !isMetaParen(t)) {
            const rest = (leadBracket[3] || "").replace(/^[\s:：\-—–·•,，、]+/, "").trim();
            const full = rest ? `${t}：${rest}` : t;
            res = { goal: rest ? `${t} · ${rest}` : t, full };
          }
        }
      }
      if (!res) {
        for (let i = 0; i < Math.min(lines.length, 10); i++) {
          const gm = lines[i].match(GOAL_LABEL_RE);
          if (gm && gm[1].trim()) {
            const g = gm[1].trim();
            res = { goal: g, full: g };
            break;
          }
        }
      }
      if (!res) {
        const natural = lines.find((l) => !isPreamble(l)) || first;
        const full = lines.slice(0, 3).join(" ").trim();
        res = { goal: natural, full: full.length > 260 ? full.slice(0, 260) + "…" : full };
      }
    }
    if (_goalTaskCache.size > 500) _goalTaskCache.clear();
    _goalTaskCache.set(raw, res);
    return res;
  }
  const _bracketTopicReCache = new Map();
  const _bracketTopicCache = new Map();
  function findWorkerBracketTopic(workerName, entries, minAtMs = 0) {
    if (!workerName || !entries?.length) return "";
    const cacheKey = `${workerName}|${minAtMs}|${entriesFingerprint(entries)}`;
    const hit = _bracketTopicCache.get(cacheKey);
    if (hit !== undefined) return hit;
    let re = _bracketTopicReCache.get(workerName);
    if (!re) {
      re = new RegExp(`(?:^|[^A-Za-z0-9_\\-/.\\\\])${escRegex(workerName)}[\`*\\s]*(?:（([^）\\n]{2,40})）|\\(([^)\\n]{2,40})\\))`);
      if (_bracketTopicReCache.size > 500) _bracketTopicReCache.clear();
      _bracketTopicReCache.set(workerName, re);
    }
    let out = "";
    for (let i = entries.length - 1; i >= 0; i--) {
      const e = entries[i];
      if (!e || (e.role !== "collie" && e.role !== "user") || !e.text) continue;
      if (!e.text.includes(workerName)) continue;
      if (minAtMs > 0) {
        const at = +new Date(e.at) || 0;
        if (at && at < minAtMs) continue;
      }
      const m = cleanTextForWorkerMatch(e.text, e.role).match(re);
      if (!m) continue;
      const t = stripThreadMarkdownLine(m[1] || m[2] || "");
      if (t && !isMetaParen(t)) { out = t; break; }
    }
    if (_bracketTopicCache.size > 500) _bracketTopicCache.clear();
    _bracketTopicCache.set(cacheKey, out);
    return out;
  }
  function agentTaskSummary(v, w = null, linkedThread = null, allEntries = null) {
    if (!v || !v.is_agent || v.name === ROUTER) return { short: "", full: "" };
    const entries = allEntries || chatEntries();
    const minAt = w?.created_at ? Math.max(0, (+new Date(w.created_at) || 0) - 5 * 60000) : 0;
    const bracketTopic = v.name
      ? (findWorkerBracketTopic(v.name, linkedThread?.list, 0) || findWorkerBracketTopic(v.name, entries, minAt))
      : "";
    const taskGoal = w?.task ? extractGoalFromTask(w.task) : { goal: "", full: "" };
    const shortRaw = bracketTopic
      || taskGoal.goal
      || (v.topic && v.topic !== v.name ? stripThreadMarkdownLine(v.topic) : "")
      || (w?.note ? firstCleanThreadLine(w.note) : "")
      || (w?.last_report ? firstCleanThreadLine(w.last_report) : "")
      || (linkedThread?.title || "");
    if (!shortRaw) return { short: "", full: "" };
    const fullRaw = (bracketTopic && taskGoal.goal && !taskGoal.goal.includes(bracketTopic))
      ? `${bracketTopic} — ${taskGoal.full || taskGoal.goal}`
      : (taskGoal.full || bracketTopic || shortRaw);
    const full = fullRaw.length > 280 ? fullRaw.slice(0, 280) + "…" : fullRaw;
    return { short: shortRaw, full };
  }
  function resolveThread(info, rootId, anchorId = "") {
    if (!info || !rootId) return null;
    const map = info.allThreads || info.threads;
    const direct = map?.get(rootId) || null;
    if (direct) return direct;
    if (anchorId) {
      const migrated = (info.allMsgToRoot || info.msgToRoot)?.get(anchorId) || "";
      if (migrated && map?.has(migrated)) return map.get(migrated);
    }
    return null;
  }
  function entryPendingNow(allEntries, idx, id, pendIds = null, hasOpts = true) {
    if (!id) return false;
    if (sup.hasPending) return (pendIds || new Set(activePending().map((p) => p.id))).has(id);
    if (dismissedLocal.has(id)) return false;
    let otherCollie = false;
    for (let j = idx + 1; j < allEntries.length; j++) {
      const next = allEntries[j];
      if (next.role === "user") {
        const reId = next.re?.entry || "";
        if (reId === id || (hasOpts && !reId && !otherCollie)) return false;
      } else if (next.role === "collie") {
        otherCollie = true;
      }
    }
    return true;
  }
  function replyOptsMarkup(e, idx, allEntries, pendIds = null, opts = null) {
    if (!e || e.role !== "collie" || !e.id) return "";
    const optList = Array.isArray(e.options) ? e.options.filter((o) => typeof o === "string" && o.trim()) : [];
    if (optList.length) {
      if (entryPendingNow(allEntries, idx, e.id, pendIds, true)) {
        return `<div class="reply-opts" data-entry="${esc(e.id)}">${optList.map((o) =>
          `<button type="button" class="reply-opt" data-opt="${esc(o)}">${esc(o)}</button>`).join("")}</div>`;
      }
      const picked = !opts?.inDrawer ? pickedReplyOpts.get(e.id) : null;
      if (picked) {
        return `<div class="reply-opts reply-picked${picked.sending ? " is-sending" : ""}" data-entry="${esc(e.id)}" role="status" aria-live="polite"><span class="reply-picked-tag"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg><span class="reply-picked-text"><span class="reply-picked-lbl">已选择：</span><span class="reply-picked-val">${esc(picked.text)}</span></span></span></div>`;
      }
      return "";
    }
    if (e.check && entryPendingNow(allEntries, idx, e.id, pendIds, false)) {
      return `<div class="reply-opts reply-check" data-entry="${esc(e.id)}"><button type="button" class="reply-ack" data-ack="${esc(e.id)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>已处理</button></div>`;
    }
    return "";
  }
  function threadEntryPlainText(e) {
    let t = String(e?.text || "");
    if (e?.role === "user") {
      const cut = t.indexOf("\n\n[The human picked");
      if (cut >= 0) t = t.slice(0, cut);
      const att = t.lastIndexOf("附件：\n");
      if (att >= 0) t = t.slice(0, att).trim() || "附件消息";
    }
    return t;
  }
  function stripThreadMarkdownLine(raw) {
    return String(raw || "")
      .replace(/^\s*(?:[#>*•\-]+|\d+[.)])\s+/, "")
      .replace(/\\([!"#$%&'()*+,\-.\/:;<=>?@\[\\\]^_`{|}~])/g, "$1")
      .replace(/(\*\*|__|~~)/g, "")
      .replace(/`+/g, "")
      .replace(/(^|[\s（(【\[「『])\*([^\s*][^*]*?[^\s*]|[^\s*])\*(?=$|[\s，。！？、：；.,!?)）】\]」』])/g, "$1$2")
      .replace(/\s+/g, " ")
      .trim();
  }
  function firstCleanThreadLine(text) {
    const rawText = String(text || "");
    const cleaned = rawText
      .replace(/```[^\n`]*\n?([\s\S]*?)(?:```|$)/g, " ")
      .replace(/\[image:[^\]]+\]/g, " ")
      .replace(/\[([^\]\n]+)\]\([^)\n]+\)/g, "$1");
    for (const raw of cleaned.split("\n")) {
      const line = stripThreadMarkdownLine(raw);
      if (line) return line;
    }
    if (/\[image:[^\]]+\]/.test(rawText)) return "图片消息";
    if (/```/.test(rawText)) return "代码片段";
    return stripThreadMarkdownLine(plainLine(rawText));
  }
  function collapseThreadMarkdown(text) {
    const rawText = String(text || "");
    const cleaned = rawText
      .replace(/```[^\n`]*\n?([\s\S]*?)(?:```|$)/g, " ")
      .replace(/\[image:[^\]]+\]/g, " ")
      .replace(/\[([^\]\n]+)\]\([^)\n]+\)/g, "$1");
    const lines = cleaned.split("\n").map(stripThreadMarkdownLine).filter(Boolean);
    if (lines.length) return lines.join(" ").replace(/\s+/g, " ").trim();
    if (/\[image:[^\]]+\]/.test(rawText)) return "图片消息";
    if (/```/.test(rawText)) return "代码片段";
    return stripThreadMarkdownLine(plainLine(rawText));
  }
  function threadCleanText(e) {
    const t = threadEntryPlainText(e);
    const line = firstCleanThreadLine(t);
    if (line) return line.length > 120 ? line.slice(0, 120) + "…" : line;
    return collieNotifySummary(t);
  }
  // Strip leading `ascii-worker-name（中文主题）...` or `` `ascii-worker-name`（中文主题）... ``
  // so thread titles foreground the human topic instead of raw worker IDs.
  const WORKER_TOPIC_PREFIX_RE = /^([a-z][a-z0-9]*(?:[-_][a-z0-9]+)+|[a-z]+\d+[a-z0-9]*)\s*(?:（([^）\n]+)）|\(([^)\n]+)\))(.*)$/;
  function threadTitleFromText(text, fallback = "话题线") {
    const clean = firstCleanThreadLine(text);
    if (!clean) return fallback;
    const m = clean.match(WORKER_TOPIC_PREFIX_RE);
    if (m) {
      const workerName = m[1];
      const fullTopic = (m[2] || "").trim();
      const halfTopic = (m[3] || "").trim();
      const topic = fullTopic || halfTopic;
      const isAsciiOnlyHalfTag = !!halfTopic && !/[\u4e00-\u9fff]/.test(halfTopic) &&
        (((workerName.match(/[-_]/g) || []).length < 2 && !/\d/.test(workerName)) || halfTopic.length < 4);
      if (topic && !isAsciiOnlyHalfTag) {
        const rawRest = (m[4] || "").trim();
        const leadingEnd = /^[？?。！!]/.test(rawRest);
        const restTrim = leadingEnd ? "" : rawRest.replace(/^[\s:：\-—–·•,，、]+/, "");
        const restFirst = restTrim ? (restTrim.split(/[？?。！!\n]/)[0] || "").trim() : "";
        const combined = restFirst ? `${topic} · ${restFirst}` : topic;
        return combined.length > 48 ? combined.slice(0, 48) + "…" : combined;
      }
    }
    const first = clean.split(/[？?。！!\n]/)[0].trim() || clean;
    return first.length > 48 ? first.slice(0, 48) + "…" : first;
  }
  function threadPreviewFromEntry(e) {
    if (!e) return "";
    const who = threadWhoLabel(e);
    const body = collapseThreadMarkdown(threadEntryPlainText(e));
    const text = body || (e.role === "user" ? "附件消息" : "新回复");
    const clipped = text.length > 90 ? text.slice(0, 90) + "…" : text;
    return `${who}：${clipped}`;
  }
  function entryConfirmOptions(e) {
    const raw = Array.isArray(e?.options) ? e.options
      : Array.isArray(e?.opts) ? e.opts
      : Array.isArray(e?.buttons) ? e.buttons
      : null;
    if (!raw) return [];
    return raw.filter((o) => {
      if (typeof o === "string") return !!o.trim();
      if (o && typeof o === "object") return !!(String(o.label || o.text || o.value || "").trim());
      return false;
    });
  }
  function entryHasConfirmMarker(e) {
    if (!e || e.role !== "collie") return false;
    if (e.picked || e.resolved || e.dismissed) return false;
    return entryConfirmOptions(e).length > 0 || !!e.check || !!e.pending;
  }
  function isThreadPending(th, allEntries = chatEntries(), pendIds = null, idxByEntry = null) {
    const e = th?.latest;
    if (!e || e.role !== "collie") return false;
    if (e.picked || e.resolved || e.dismissed) return false;
    const id = e.id || "";
    if (id && dismissedLocal.has(id)) return false;
    if (id && optimisticallyResolved(e, allEntries)) return false;
    const pset = pendIds || new Set(activePending().map((p) => p.id));
    if (sup.hasPending) {
      if (id && pset.has(id)) return true;
      const hasAlias = !e.options?.length && !e.check && (
        (Array.isArray(e.opts) && entryConfirmOptions(e).length > 0) ||
        (Array.isArray(e.buttons) && entryConfirmOptions(e).length > 0) ||
        !!e.pending
      );
      if (!hasAlias) return false;
    } else if (!entryHasConfirmMarker(e)) {
      return false;
    }
    const idx = idxByEntry ? (idxByEntry.get(e) ?? -1) : allEntries.indexOf(e);
    if (idx < 0) return entryHasConfirmMarker(e);
    const hasOpts = entryConfirmOptions(e).length > 0;
    let otherCollie = false;
    for (let j = idx + 1; j < allEntries.length; j++) {
      const next = allEntries[j];
      if (next.role === "user") {
        const reId = next.re?.entry || "";
        if ((id && reId === id) || (hasOpts && !reId && !otherCollie)) return false;
      } else if (next.role === "collie") {
        otherCollie = true;
      }
    }
    return true;
  }
  function threadSnippet(text, max = 24) {
    const clean = String(text || "").replace(/\s+/g, " ").trim();
    return clean.length > max ? clean.slice(0, max) + "…" : clean;
  }
  // Lightweight content fingerprints & compiled regex / text-match caches for thread/worker analysis.
  const _entriesFpWeak = new WeakMap();
  const _workerReCache = new Map();
  let _textWorkersCacheKey = "";
  const _textWorkersCache = new Map();
  let _replyThreadsCache = { key: "", val: null };
  function fnvHashStr(h, s) {
    if (!s) return h;
    for (let i = 0, n = s.length; i < n; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return h;
  }
  function entriesFingerprint(entries) {
    const arr = entries || [];
    const n = arr.length;
    if (!n) return "0";
    const first = arr[0], last = arr[n - 1];
    const fk = entryKey(first), lk = entryKey(last);
    const lt = last?.text || "", lre = last?.re?.entry || "";
    const cached = _entriesFpWeak.get(arr);
    if (cached && cached.n === n && cached.fk === fk && cached.lk === lk && cached.lt === lt && cached.lre === lre) {
      return cached.fp;
    }
    let h = 2166136261;
    for (let i = 0; i < n; i++) {
      const e = arr[i];
      if (!e) { h = Math.imul(h ^ 1, 16777619); continue; }
      h = fnvHashStr(h, e.id || e._localId || "");
      h = fnvHashStr(h, e.role || "");
      h = fnvHashStr(h, e.at || "");
      h = fnvHashStr(h, e.ref || "");
      h = fnvHashStr(h, e.tone || "");
      if (e.re) {
        h = fnvHashStr(h, e.re.entry || "");
        h = fnvHashStr(h, e.re.worker || "");
        h = fnvHashStr(h, e.re.from || "");
        h = fnvHashStr(h, e.re.kind || "");
        h = fnvHashStr(h, e.re.who || "");
      }
      if (e.worker) h = fnvHashStr(h, e.worker);
      if (e.from) h = fnvHashStr(h, e.from);
      if (e.action && typeof e.action === "object") {
        h = fnvHashStr(h, e.action.worker || e.action.ref || e.action.target || e.action.name || "");
      }
      if (e.check) h = Math.imul(h ^ 37, 16777619);
      if (e.pending) h = Math.imul(h ^ 41, 16777619);
      if (e.picked || e.resolved || e.dismissed) h = Math.imul(h ^ 43, 16777619);
      if (Array.isArray(e.options)) h = Math.imul(h ^ (e.options.length + 53), 16777619);
      if (e.text) {
        const s = e.text, len = s.length;
        h = Math.imul(h ^ len, 16777619);
        if (len <= 256) {
          h = fnvHashStr(h, s);
        } else {
          for (let j = 0; j < 64; j++) h = Math.imul(h ^ s.charCodeAt(j), 16777619);
          for (let j = len - 64; j < len; j++) h = Math.imul(h ^ s.charCodeAt(j), 16777619);
          const step = Math.max(1, (len - 128) >> 5);
          for (let j = 64; j < len - 64; j += step) h = Math.imul(h ^ s.charCodeAt(j), 16777619);
        }
      }
    }
    const fp = `${n}:${fk}:${lk}:${h >>> 0}`;
    _entriesFpWeak.set(arr, { n, fk, lk, lt, lre, fp });
    return fp;
  }
  function workerNameRe(name) {
    let re = _workerReCache.get(name);
    if (!re) {
      re = new RegExp(`(?:^|[^A-Za-z0-9_\\-/.\\\\])${escRegex(name)}(?![A-Za-z0-9_\\-/\\\\]|\\.[A-Za-z0-9_])`);
      if (_workerReCache.size > 1000) _workerReCache.clear();
      _workerReCache.set(name, re);
    }
    return re;
  }
  function matchWorkerNamesInText(cleaned, workerNames, namesKey) {
    if (!cleaned || !workerNames.length) return [];
    if (_textWorkersCacheKey !== namesKey) {
      _textWorkersCacheKey = namesKey;
      _textWorkersCache.clear();
    }
    let hits = _textWorkersCache.get(cleaned);
    if (hits !== undefined) return hits;
    hits = [];
    for (let i = 0; i < workerNames.length; i++) {
      const name = workerNames[i];
      if (cleaned.includes(name) && workerNameRe(name).test(cleaned)) hits.push(name);
    }
    if (_textWorkersCache.size > 4000) _textWorkersCache.clear();
    _textWorkersCache.set(cleaned, hits);
    return hits;
  }
  let _kwFpCache = { wRef: null, wLen: -1, aRef: null, aLen: -1, hRef: null, hLen: -1, fp: "" };
  function knownWorkersFingerprint() {
    const workers = sup.workers || [], agents = state.agents || [], hs = hist || [];
    if (_kwFpCache.wRef === workers && _kwFpCache.wLen === workers.length &&
      _kwFpCache.aRef === agents && _kwFpCache.aLen === agents.length &&
      _kwFpCache.hRef === hs && _kwFpCache.hLen === hs.length) {
      return _kwFpCache.fp;
    }
    let h = 2166136261, n = 0;
    for (let i = 0; i < workers.length; i++) { const nm = workers[i]?.name; if (nm) { h = fnvHashStr(h, nm); n++; } }
    for (let i = 0; i < agents.length; i++) { const nm = agents[i]?.name; if (nm) { h = fnvHashStr(h, nm); n++; } }
    for (let i = 0; i < hs.length; i++) { const nm = hs[i]?.name; if (nm) { h = fnvHashStr(h, nm); n++; } }
    const fp = `${n}:${h >>> 0}`;
    _kwFpCache = { wRef: workers, wLen: workers.length, aRef: agents, aLen: agents.length, hRef: hs, hLen: hs.length, fp };
    return fp;
  }
  let _wsFpCache = { wRef: null, wLen: -1, aRef: null, aLen: -1, hRef: null, hLen: -1, fp: "" };
  function workerStateFingerprint() {
    const workers = sup.workers || [], agents = state.agents || [], hs = hist || [];
    if (_wsFpCache.wRef === workers && _wsFpCache.wLen === workers.length &&
      _wsFpCache.aRef === agents && _wsFpCache.aLen === agents.length &&
      _wsFpCache.hRef === hs && _wsFpCache.hLen === hs.length) {
      return _wsFpCache.fp;
    }
    let h = 2166136261;
    for (let i = 0; i < workers.length; i++) {
      const w = workers[i];
      if (!w) continue;
      h = fnvHashStr(h, w.name || "");
      h = fnvHashStr(h, w.status || "");
      h = fnvHashStr(h, w.pane_id || "");
      h = fnvHashStr(h, w.thread || "");
      h = fnvHashStr(h, w.created_at || "");
      h = fnvHashStr(h, w.report_at || "");
      h = Math.imul(h ^ (w.ended ? 1 : 2), 16777619);
    }
    for (let i = 0; i < agents.length; i++) {
      const a = agents[i];
      if (!a) continue;
      h = fnvHashStr(h, a.name || "");
      h = fnvHashStr(h, a.status || "");
      h = fnvHashStr(h, a.pane_id || "");
      h = fnvHashStr(h, a.kind || "");
      h = fnvHashStr(h, a.topic || "");
    }
    for (let i = 0; i < hs.length; i++) {
      const x = hs[i];
      if (!x) continue;
      h = fnvHashStr(h, x.id || "");
      h = fnvHashStr(h, x.name || "");
      h = fnvHashStr(h, x.ended || "");
    }
    const fp = `${workers.length}:${agents.length}:${hs.length}:${h >>> 0}`;
    _wsFpCache = { wRef: workers, wLen: workers.length, aRef: agents, aLen: agents.length, hRef: hs, hLen: hs.length, fp };
    return fp;
  }
  // Group user/collie messages connected by `re.entry` into natural reply threads,
  // and fold background worker report replies back into their worker's origin topic thread.
  function computeReplyThreads(allEntries) {
    const entries = allEntries || [];
    const cacheKey = `${entriesFingerprint(entries)}|${knownWorkersFingerprint()}`;
    if (_replyThreadsCache.val && _replyThreadsCache.key === cacheKey) {
      return _replyThreadsCache.val;
    }
    const byId = new Map();
    const knownWorkers = new Set();
    const addKnownWorker = (raw) => {
      const name = typeof raw === "string" ? raw.trim() : "";
      if (!name || THREAD_IGNORED_WORKERS.has(name) || name.startsWith("h:")) return;
      knownWorkers.add(name);
    };
    for (const w of sup.workers || []) addKnownWorker(w?.name);
    for (const a of state.agents || []) addKnownWorker(a?.name);
    for (const h of hist || []) addKnownWorker(h?.name);
    for (const e of entries) {
      const k = entryKey(e);
      if (k) byId.set(k, e);
      if (!e) continue;
      if (e.role === "event") {
        addKnownWorker(e.ref);
        addKnownWorker(e.worker);
      } else if (e.role === "collie" && e.re) {
        addKnownWorker(e.re.worker);
        if (e.re.kind === "trigger") addKnownWorker(e.re.from);
      }
    }
    const replyQuoteWorker = (m) => {
      if (!m || m.role !== "collie" || !m.re) return "";
      const q = m.re;
      const pick = (raw, requireKnown = false) => {
        const name = typeof raw === "string" ? raw.trim() : "";
        if (!name || THREAD_IGNORED_WORKERS.has(name) || name.startsWith("h:")) return "";
        if (requireKnown && !knownWorkers.has(name)) return "";
        return name;
      };
      const wDirect = pick(q.worker, false);
      if (wDirect) return wDirect;
      if (q.entry) {
        const target = byId.get(q.entry);
        if (target && target.role === "event") {
          const wEv = pick(target.ref, false) || pick(target.worker, false) || pick(target.from, false);
          if (wEv) return wEv;
        }
      }
      if (q.kind === "trigger") {
        const wTrig = pick(q.from, false) || pick(q.who, true);
        if (wTrig) return wTrig;
      }
      const wFrom = pick(q.from, true);
      if (wFrom) return wFrom;
      if (!q.entry || !byId.has(q.entry)) {
        const wWho = pick(q.who, true);
        if (wWho) return wWho;
      }
      return "";
    };
    const parentOf = (m) => {
      const pid = m?.re?.entry;
      if (!pid) return "";
      const target = byId.get(pid);
      if (target) return (target.role === "user" || target.role === "collie") ? pid : "";
      if (m.re.worker || m.re.kind === "trigger") return "";
      if (m.re.from && knownWorkers.has(String(m.re.from).trim())) return "";
      if (m.re.who && knownWorkers.has(String(m.re.who).trim())) return "";
      return pid;
    };
    const knownWorkerNames = [...knownWorkers];
    const knownNamesKey = knownWorkerNames.join("\0");
    const missingRoots = new Map();
    const mergedRoot = new Map(); // entryKey -> origin thread rootId (for worker-report replies)
    const workerReportOf = new Map(); // entryKey -> worker name (for Collie replies quoting a worker report)
    const originRootByWorker = new Map(); // worker name -> origin thread rootId
    const resolvedRootCache = new Map();
    const resolveRoot = (id) => {
      if (resolvedRootCache.has(id)) return resolvedRootCache.get(id);
      let curId = id;
      const seen = new Set();
      while (curId && !seen.has(curId)) {
        seen.add(curId);
        if (mergedRoot.has(curId)) {
          curId = mergedRoot.get(curId);
          continue;
        }
        const cur = byId.get(curId);
        if (!cur) break;
        const pid = parentOf(cur);
        if (!pid) break;
        if (!byId.has(pid) && !missingRoots.has(pid)) {
          missingRoots.set(pid, {
            id: pid,
            who: cur.re?.who || "历史消息",
            text: cur.re?.text || "",
            missing: true,
          });
        }
        curId = pid;
      }
      resolvedRootCache.set(id, curId);
      return curId;
    };
    const recordOrigin = (rawName, rootId) => {
      const name = typeof rawName === "string" ? rawName.trim() : "";
      if (!name || !rootId || !knownWorkers.has(name) || originRootByWorker.has(name)) return;
      originRootByWorker.set(name, rootId);
    };
    const recordActionOrigin = (act, rootId) => {
      if (!act || typeof act !== "object") return;
      if (Array.isArray(act)) { for (const x of act) recordActionOrigin(x, rootId); return; }
      recordOrigin(act.worker, rootId);
      recordOrigin(act.ref, rootId);
      recordOrigin(act.target, rootId);
      if (act.name && (!act.type || /spawn|worker|send|agent|report/i.test(String(act.type)))) {
        recordOrigin(act.name, rootId);
      }
    };
    const groups = new Map();
    for (const m of entries) {
      if (!m || (m.role !== "user" && m.role !== "collie")) continue;
      const k = entryKey(m);
      if (!k) continue;
      const directPid = parentOf(m);
      const repW = !directPid ? replyQuoteWorker(m) : "";
      if (repW) workerReportOf.set(k, repW);
      let r;
      if (repW) {
        const existingOrigin = originRootByWorker.get(repW);
        if (existingOrigin) {
          r = existingOrigin;
          mergedRoot.set(k, r);
          resolvedRootCache.set(k, r);
        } else {
          r = resolveRoot(k);
          originRootByWorker.set(repW, r);
        }
      } else {
        r = resolveRoot(k);
      }
      // Track first dispatch/mention origin for each worker in chronological order.
      recordOrigin(m.worker, r);
      recordOrigin(m.from, r);
      recordOrigin(m.ref, r);
      recordOrigin(m.re?.worker, r);
      recordActionOrigin(m.action, r);
      recordActionOrigin(m.actions, r);
      if (knownWorkerNames.length && originRootByWorker.size < knownWorkerNames.length && m.text) {
        const cleaned = cleanTextForWorkerMatch(m.text, m.role);
        if (cleaned) {
          const hits = matchWorkerNamesInText(cleaned, knownWorkerNames, knownNamesKey);
          for (let hi = 0; hi < hits.length; hi++) {
            const wName = hits[hi];
            if (!originRootByWorker.has(wName)) originRootByWorker.set(wName, r);
          }
        }
      }
      if (!groups.has(r)) groups.set(r, []);
      groups.get(r).push(m);
    }
    const threads = new Map();
    const allThreads = new Map();
    const msgToRoot = new Map();
    const allMsgToRoot = new Map();
    for (const [rootId, list] of groups.entries()) {
      const missingRoot = missingRoots.get(rootId) || null;
      const totalCount = missingRoot ? list.length + 1 : list.length;
      const root = byId.get(rootId) || null;
      let branchCount = 0;
      for (let i = 1; i < list.length; i++) {
        const prevK = entryKey(list[i - 1]);
        const pid = parentOf(list[i]);
        if (pid && pid !== prevK) branchCount++;
      }
      const latest = list[list.length - 1];
      const latestReply = latest && latest !== root ? latest : null;
      const replyCount = totalCount - 1;
      const rootSummary = root ? threadCleanText(root) : (missingRoot?.text ? firstCleanThreadLine(missingRoot.text) || collieNotifySummary(missingRoot.text) : threadCleanText(list[0]));
      const thObj = {
        rootId,
        root,
        missingRoot,
        list,
        latest,
        replyCount,
        totalCount,
        branchCount,
        title: threadTitleFromText(rootSummary),
        fullTitle: rootSummary,
        preview: latestReply ? threadPreviewFromEntry(latestReply) : "",
      };
      allThreads.set(rootId, thObj);
      for (const x of list) allMsgToRoot.set(entryKey(x), rootId);
      if (totalCount < 3) continue;
      threads.set(rootId, thObj);
      for (const x of list) msgToRoot.set(entryKey(x), rootId);
    }
    // Only show `↳ N 条回复 >` at the end of each contiguous run of a >=3 thread,
    // avoiding stacked duplicate links when messages of the same thread are adjacent.
    const showEntryOn = new Set();
    const visibleTalk = [];
    for (const m of entries) {
      if (m && (m.role === "user" || m.role === "collie")) visibleTalk.push(m);
    }
    for (let i = 0; i < visibleTalk.length; i++) {
      const k = entryKey(visibleTalk[i]);
      const r = msgToRoot.get(k);
      if (!r) continue;
      const nextR = i + 1 < visibleTalk.length ? msgToRoot.get(entryKey(visibleTalk[i + 1])) : null;
      if (nextR !== r) showEntryOn.add(k);
    }
    const out = { byId, threads, allThreads, msgToRoot, allMsgToRoot, showEntryOn, parentOf, workerReportOf, originRootByWorker };
    _replyThreadsCache = { key: cacheKey, val: out };
    return out;
  }
  // Items dismissed locally via × before the hub's next stream frame lands.
  const dismissedLocal = new Set();
  // Quick-reply options picked while scrolled above the bottom: entryId -> { text, sending }.
  const pickedReplyOpts = new Map();
  const ICON_X = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17"/></svg>`;
  const ICON_PIN = `<svg viewBox="0 0 24 24" aria-hidden="true"><path class="pin-body" d="M9.5 3.5h5v5l3 3v2h-11v-2l3-3z"/><path d="M8.5 3.5h7M12 13.5v7"/></svg>`;
  let pendingOpen = false, pendingBarSig = "", pendingListSig = "", flashEntry = { id: "", until: 0 }, jumpSeq = 0, superJumpHiding = false;
  const SUPER_JUMP_DIST = 120;

  function scrollToAsync(sc, top, behavior = "smooth") {
    const res = sc.scrollTo({ top, behavior });
    if (res instanceof Promise) return res;
    if (behavior !== "smooth" || Math.abs(sc.scrollTop - top) < 2) return Promise.resolve();
    return new Promise((resolve) => {
      let tid;
      const done = () => {
        clearTimeout(tid);
        sc.removeEventListener("scrollend", done);
        sc.removeEventListener("scroll", onScroll);
        resolve();
      };
      const onScroll = () => { clearTimeout(tid); tid = setTimeout(done, 110); };
      sc.addEventListener("scrollend", done, { once: true });
      sc.addEventListener("scroll", onScroll, { passive: true });
      tid = setTimeout(done, 120);
    });
  }
  let _lastJumpUiKey = "";
  function updateSuperJump() {
    const btn = $("#super-jump"), sc = $("#super-thread")?.parentElement;
    if (!btn || !sc) return;
    const dist = sc.scrollHeight - sc.scrollTop - sc.clientHeight;
    if (dist <= 24) superJumpHiding = false;
    const unreadCount = view === "collie" ? computeUnreadInfo().count : 0;
    const threshold = unreadCount > 0 ? AT_BOTTOM_PX : SUPER_JUMP_DIST;
    const show = view === "collie" && !pendingOpen && !superJumpHiding && dist > threshold;
    const uiKey = `${show ? 1 : 0}|${unreadCount}`;
    if (uiKey === _lastJumpUiKey && btn.hidden === !show) return;
    _lastJumpUiKey = uiKey;
    const badgeText = unreadCount > 99 ? "99+" : unreadCount > 0 ? String(unreadCount) : "";
    const ariaText = unreadCount > 0 ? `回到底部，${unreadCount} 条未读` : "回到底部";
    const badgeEl = $("#super-jump-badge", btn);
    if (badgeEl) {
      if (badgeEl.textContent !== badgeText) badgeEl.textContent = badgeText;
      badgeEl.hidden = !badgeText;
    }
    btn.classList.toggle("has-unread", unreadCount > 0);
    if (btn.title !== ariaText) {
      btn.title = ariaText;
      btn.setAttribute("aria-label", ariaText);
    }
    if (btn.hidden === !show) return;
    const hadFocus = !show && document.activeElement === btn;
    btn.hidden = !show;
    if (hadFocus) sc.focus({ preventScroll: true });
  }
  function maybeScheduleReadAtBottom(opts = {}) {
    if (view !== "collie" || document.hidden || collieLayoutLock) return;
    const latestId = latestPersistedEntryId();
    if (!latestId) return;
    if (entryIdNum(latestId) <= entryIdNum(readCursorId) && entryIdNum(latestId) <= entryIdNum(serverReadCursorId)) return;
    const sc = $("#super-thread")?.parentElement;
    if (!sc || sc.clientHeight <= 0) return;
    const dist = sc.scrollHeight - sc.scrollTop - sc.clientHeight;
    if (dist > AT_BOTTOM_PX) return;
    commitChatRead(latestId, opts);
    updateSuperJump();
  }

  function optimisticallyResolved(p, list = chatEntries()) {
    const id = typeof p === "string" ? p : p?.id;
    if (!id) return false;
    if (dismissedLocal.has(id)) return true;
    if (!pendingSays.length) return false;
    if (pendingSays.some((m) => m.re?.entry === id)) return true;
    // Pure --check external todos do not auto-resolve on an unquoted message.
    const hasOpts = typeof p === "object"
      ? entryConfirmOptions(p).length > 0
      : true;
    if (!hasOpts) return false;
    if (!pendingSays.some((m) => !m.re?.entry)) return false;
    const idx = list.findIndex((e) => e.id === id);
    if (idx < 0) return false;
    for (let j = idx + 1; j < list.length; j++) {
      if (list[j].role === "collie") return false;
    }
    return true;
  }
  function activePending() {
    const list = sup.pending || [];
    if (!list.length) return [];
    const entries = pendingSays.length ? chatEntries() : sup.entries;
    return list.filter((p) => p?.id && !optimisticallyResolved(p, entries));
  }
  function clientPinSummary(e) {
    if (!e) return "";
    let t = String(e.text || "");
    if (e.role === "user") {
      const cut = t.indexOf("\n\n[The human picked");
      if (cut >= 0) t = t.slice(0, cut);
      const att = t.lastIndexOf("附件：\n");
      if (att >= 0) t = (t.slice(0, att).trim() + " 📎").trim();
    }
    return plainLine(t.replace(/```[\s\S]*?```/g, " ").replace(/\[image:[^\]]+\]/g, " ")).slice(0, 120) || plainLine(t).slice(0, 120);
  }
  function activePinned() {
    const base = (sup.pinned || []).filter((p) => p?.id && pinnedLocal.get(p.id)?.pinned !== false);
    const have = new Set(base.map((p) => p.id));
    const added = [];
    for (const [id, loc] of pinnedLocal) {
      if (loc.pinned && !have.has(id) && loc.item) added.push(loc.item);
    }
    return added.length ? [...base, ...added] : base;
  }
  const pinDisplaySummary = (p) => (p.role === "user" && p.summary && !p.summary.startsWith("你：") ? "你：" + p.summary : p.summary || "");
  async function togglePin(id, forceVal) {
    if (!id) return;
    const cur = activePinned().some((p) => p.id === id);
    const next = typeof forceVal === "boolean" ? forceVal : !cur;
    if (next === cur) return;
    const e = chatEntries().find((x) => x.id === id);
    pinnedLocal.set(id, {
      pinned: next,
      item: next ? { id, at: e?.at || new Date().toISOString(), role: e?.role || "collie", summary: clientPinSummary(e) } : null,
    });
    if (view === "collie") renderSuper();
    try {
      await api("/api/super/pin", { body: { id, pinned: next } });
    } catch (err) {
      pinnedLocal.delete(id);
      if (view === "collie") renderSuper();
      toast(err.message, "attn");
    }
  }
  function renderPendingBar() {
    const wrap = $("#pending-wrap"), bar = $("#pending-bar"), listEl = $("#pending-list");
    if (!wrap) return;
    const pend = activePending(), pinsAll = activePinned();
    const pendIds = new Set(pend.map((p) => p.id));
    const pinIds = new Set(pinsAll.map((p) => p.id));
    const pinsOnly = pinsAll.filter((p) => !pendIds.has(p.id));
    const total = pend.length + pinsOnly.length;
    if (total < 2) pendingOpen = false;
    if (!total) {
      wrap.hidden = true;
      wrap.classList.remove("open", "pin-only");
      listEl.hidden = true;
      pendingBarSig = pendingListSig = "";
      updateSuperJump();
      return;
    }
    wrap.hidden = false;
    wrap.classList.toggle("open", pendingOpen);
    wrap.classList.toggle("pin-only", pend.length === 0);
    const P = pend.length, M = pinsAll.length;
    const lastPend = P ? pend[P - 1] : null, lastPin = M ? pinsAll[M - 1] : null;
    const sum = lastPend ? lastPend.summary : pinDisplaySummary(lastPin);
    const label = P && M ? (total === 1 ? "待处理 · 钉住" : `待处理 (${P}) · 钉住 (${M})`)
      : P ? (total === 1 ? "待处理" : `待处理 (${P})`)
      : (total === 1 ? "已钉住" : `已钉住 (${M})`);
    const barSig = `${total}:${P}:${M}:${lastPend?.id || ""}:${lastPin?.id || ""}:${sum}`;
    if (barSig !== pendingBarSig) {
      pendingBarSig = barSig;
      const lead = P ? `<span class="pending-dot"></span>` : `<span class="pending-pin-ico">${ICON_PIN}</span>`;
      if (total === 1) {
        const onlyId = lastPend ? lastPend.id : lastPin.id;
        const xBtn = lastPend
          ? `<button type="button" class="pending-x" data-dismiss="${esc(onlyId)}" title="标为已处理" aria-label="标为已处理">${ICON_X}</button>`
          : `<button type="button" class="pending-x" data-unpin="${esc(onlyId)}" title="取消钉住" aria-label="取消钉住">${ICON_X}</button>`;
        bar.innerHTML = `<button type="button" class="pending-main" data-goto-pending="${esc(onlyId)}" title="${esc(sum)}">
            ${lead}<span class="pending-label">${esc(label)}</span><span class="pending-sep">·</span><span class="pending-sum">${esc(sum)}</span>
          </button>${xBtn}`;
      } else {
        bar.innerHTML = `<button type="button" class="pending-main" data-toggle-pending aria-expanded="${pendingOpen}" title="${esc(sum)}">
            ${lead}<span class="pending-label">${esc(label)}</span><span class="pending-sep">·</span><span class="pending-sum">${esc(sum)}</span>
            <svg class="pending-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 14l5-5 5 5"/></svg>
          </button>`;
      }
    } else {
      bar.querySelector("[data-toggle-pending]")?.setAttribute("aria-expanded", String(pendingOpen));
    }
    if (total >= 2 && pendingOpen) {
      const listSig = JSON.stringify([
        pend.map((p) => [p.id, p.summary, p.at, pinIds.has(p.id) ? 1 : 0]),
        pinsOnly.map((p) => [p.id, p.summary, p.at, p.role]),
      ]);
      if (listSig !== pendingListSig) {
        pendingListSig = listSig;
        const pendRows = [...pend].reverse().map((p) => `<div class="pending-item">
          <button type="button" class="pending-jump" data-goto-pending="${esc(p.id)}" title="${esc(p.summary)}">
            <span class="pending-dot"></span>${pinIds.has(p.id) ? `<span class="pending-both-pin" title="已钉住">${ICON_PIN}</span>` : ""}<span class="pending-sum">${esc(p.summary)}</span><span class="pending-time">${esc(sepTime(p.at))}</span>
          </button><button type="button" class="pending-x" data-dismiss="${esc(p.id)}" title="标为已处理" aria-label="标为已处理">${ICON_X}</button>
        </div>`);
        const pinRows = [...pinsOnly].reverse().map((p) => {
          const ps = pinDisplaySummary(p);
          return `<div class="pending-item is-pin">
          <button type="button" class="pending-jump" data-goto-pending="${esc(p.id)}" title="${esc(ps)}">
            <span class="pending-pin-ico">${ICON_PIN}</span><span class="pending-sum">${esc(ps)}</span><span class="pending-time">${esc(sepTime(p.at))}</span>
          </button><button type="button" class="pending-x" data-unpin="${esc(p.id)}" title="取消钉住" aria-label="取消钉住">${ICON_X}</button>
        </div>`;
        });
        listEl.innerHTML = [...pendRows, ...pinRows].join("");
      }
      listEl.hidden = false;
    } else {
      listEl.hidden = true;
      if (pendingListSig !== "") {
        listEl.innerHTML = "";
        pendingListSig = "";
      }
    }
    updateSuperJump();
  }
  async function dismissPending(id) {
    if (!id || dismissedLocal.has(id)) return;
    const sc = view === "collie" ? viewScroller("collie") : null;
    let keepSnap = null;
    if (sc && !activeThreadRoot && !isCollieNearBottom(sc)) {
      cancelCollieLayoutLock();
      cancelInitialAnchor();
      activeCollieRestore = null;
      unreadAnchorApplied = true;
      keepSnap = captureEntryAnchor(sc, id) || captureColliePos(sc);
      if (keepSnap) keepSnap.atBottom = false;
    }
    dismissedLocal.add(id);
    if (replyTo?.entry === id) setReply(null);
    renderSide();
    if (view === "collie") renderSuper(keepSnap ? { restore: keepSnap } : undefined);
    try {
      await api("/api/super/dismiss", { body: { id } });
    } catch (err) {
      dismissedLocal.delete(id);
      renderSide();
      if (view === "collie") renderSuper();
      toast(err.message, "attn");
    }
  }

  // Older chat, loaded a page at a time when you ask: the hub only sends the
  // latest 200 lines. olderMore: whether there is more before that.
  let older = [], olderMore = null, olderBusy = false, superScrollRAF = 0;
  let _chatEntriesCache = null;
  function chatEntries() {
    const supArr = sup.entries || [];
    if (!older.length && !pendingSays.length) return supArr;
    if (pendingSays.length) {
      const have = new Set();
      const byClientId = new Map();
      for (let i = 0; i < supArr.length; i++) {
        const e = supArr[i];
        if (!e?.id) continue;
        have.add(e.id);
        if (e.client_msg_id) byClientId.set(e.client_msg_id, e.id);
      }
      const claimed = new Set();
      for (let i = pendingSays.length - 1; i >= 0; i--) {
        const m = pendingSays[i];
        if (m.id && have.has(m.id)) {
          claimed.add(m.id);
          rememberPromotedPending(m.id, m._localId);
          pendingSays.splice(i, 1);
          continue;
        }
        if (m.client_msg_id && byClientId.has(m.client_msg_id)) {
          const realId = byClientId.get(m.client_msg_id);
          m.id = realId;
          claimed.add(realId);
          rememberPromotedPending(realId, m._localId);
          pendingSays.splice(i, 1);
          continue;
        }
      }
      // Fallback for older hubs or mocks that do not echo client_msg_id on Entry:
      // reconcile strictly newer server user entries with matching text and re.entry
      // so SSE arriving ahead of the POST /api/super/say response never renders a
      // duplicate optimistic bubble (which would momentarily flash a redundant quote bar).
      if (pendingSays.length) {
        for (let i = 0; i < pendingSays.length; i++) {
          const m = pendingSays[i];
          if (m.id) continue;
          const afterNum = m._afterNum || 0;
          const mRe = m.re?.entry || "";
          let hitId = "";
          for (let j = supArr.length - 1; j >= 0; j--) {
            const e = supArr[j];
            if (!e?.id) continue;
            if (afterNum > 0 && entryIdNum(e.id) <= afterNum) break;
            if (e.role !== "user" || e.client_msg_id || claimed.has(e.id)) continue;
            if (e.text === m.text && (e.re?.entry || "") === mRe) {
              hitId = e.id;
              break;
            }
          }
          if (hitId) {
            m.id = hitId;
            claimed.add(hitId);
            rememberPromotedPending(hitId, m._localId);
            pendingSays.splice(i, 1);
            i--;
          }
        }
      }
      if (!older.length && !pendingSays.length) return supArr;
    }
    const oldArr = older;
    const pLen = pendingSays.length;
    const pKey = pLen ? pendingSays.map((m) => `${m._localId || ""}:${m.id || ""}:${m.client_msg_id || ""}:${m.text?.length || 0}`).join("|") : "";
    if (_chatEntriesCache &&
      _chatEntriesCache.supArr === supArr && _chatEntriesCache.supLen === supArr.length &&
      _chatEntriesCache.oldArr === oldArr && _chatEntriesCache.oldLen === oldArr.length &&
      _chatEntriesCache.pKey === pKey) {
      return _chatEntriesCache.out;
    }
    const have = new Set(supArr.map((e) => e.id));
    const old = oldArr.length ? oldArr.filter((e) => !have.has(e.id)) : [];
    const out = old.length || pLen ? [...old, ...supArr, ...pendingSays] : supArr;
    _chatEntriesCache = { supArr, supLen: supArr.length, oldArr, oldLen: oldArr.length, pKey, out };
    return out;
  }
  // More before what is shown? Until asked, guess from a full page.
  const canLoadOlder = () => olderMore ?? !!sup.earlier;
  async function loadOlder(keepPos = true, untilId = "") {
    const first = chatEntries().find((e) => e.id);
    if (olderBusy || !first) return false;
    const scroller = $("#super-thread")?.parentElement || null;
    const keepSnap = keepPos && scroller
      ? (collieLayoutLock?.snap ? { ...collieLayoutLock.snap, useFromBottom: true } : { ...captureColliePos(scroller), useFromBottom: true })
      : null;
    const bgFetch = !!(keepPos && untilId);
    olderBusy = true;
    if (!bgFetch) renderSuper(keepSnap ? { restore: keepSnap } : undefined);
    let added = false;
    try {
      let url = `/api/super/earlier?before=${encodeURIComponent(first.id)}`;
      if (untilId) url += `&until=${encodeURIComponent(untilId)}`;
      const r = await api(url);
      const batch = r.entries || [];
      if (batch.length) {
        const seen = new Set(older.map((x) => x?.id));
        const fresh = batch.filter((x) => x?.id && !seen.has(x.id));
        if (fresh.length) {
          older = [...fresh, ...older];
          added = true;
        }
      }
      olderMore = batch.length ? !!r.more : false;
    } catch (e) { olderMore = false; toast(e.message, "attn"); }
    olderBusy = false;
    const finalSnap = keepPos ? (collieLayoutLock?.snap || keepSnap) : null;
    if (!bgFetch || added) {
      renderSuper(finalSnap ? { restore: finalSnap } : undefined);
    }
    if (finalSnap && scroller) {
      if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(superScrollRAF);
      applyColliePos(scroller, finalSnap);
      updateSuperJump();
    }
    return added;
  }
  const entrySelector = (id) => {
    const eid = CSS.escape(id);
    return `#v-collie .msg[data-id="${eid}"], #v-collie .event[data-id="${eid}"]`;
  };
  async function jumpToEntry(id, opts) {
    if (!id) return;
    const seq = ++jumpSeq;
    cancelCollieLayoutLock();
    cancelInitialAnchor();
    activeCollieRestore = null;
    pendingOpen = false;
    renderPendingBar();
    const sel = entrySelector(id);
    let m = document.querySelector(sel);
    let guards = 0;
    while (!m && canLoadOlder() && guards++ < 40) {
      while (olderBusy) await new Promise((r) => setTimeout(r, 35));
      if (seq !== jumpSeq) return;
      m = document.querySelector(sel);
      if (m) break;
      const ok = await loadOlder(false, id);
      if (seq !== jumpSeq) return;
      m = document.querySelector(sel);
      if (!ok) break;
    }
    if (!m) { toast("这条消息太早了，已经不在这里"); return; }
    if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(superScrollRAF);
    const sc = $("#super-thread").parentElement;
    const sr = sc.getBoundingClientRect(), mr = m.getBoundingClientRect();
    const want = Math.max(0, Math.min(sc.scrollHeight - sc.clientHeight, sc.scrollTop + (mr.top - sr.top) - Math.max(24, (sc.clientHeight - mr.height) / 2)));
    const dist = want - sc.scrollTop;
    const smooth = !matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (smooth && Math.abs(dist) > sc.clientHeight * 2.2) {
      sc.scrollTop = want - Math.sign(dist) * sc.clientHeight * 0.9;
    }
    flashEntry = { id, until: Date.now() + 2200 };
    await scrollToAsync(sc, want, smooth ? "smooth" : "auto");
    if (seq !== jumpSeq) return;
    // Settle once if off-screen content-visibility sizing shifted the target after scrolling into view.
    const settledHit = document.querySelector(sel);
    if (settledHit) {
      const sr2 = sc.getBoundingClientRect(), mr2 = settledHit.getBoundingClientRect();
      const want2 = Math.max(0, Math.min(sc.scrollHeight - sc.clientHeight, sc.scrollTop + (mr2.top - sr2.top) - Math.max(24, (sc.clientHeight - mr2.height) / 2)));
      if (Math.abs(want2 - sc.scrollTop) > 48) {
        markProgrammaticScroll();
        sc.scrollTop = want2;
      }
    }
    captureViewScroll("collie", null, navCur);
    updateSuperJump();
    if (seq !== jumpSeq) return;
    flashEntry = { id, until: Date.now() + 1550 };
    const hit = document.querySelector(sel);
    if (hit) {
      hit.classList.remove("flash");
      void hit.offsetWidth;
      hit.classList.add("flash");
      if (opts?.focus) {
        if (hit.tagName !== "A" && !hit.hasAttribute("tabindex")) hit.setAttribute("tabindex", "-1");
        hit.focus({ preventScroll: true });
      }
    }
    setTimeout(() => {
      if (flashEntry.id === id && Date.now() >= flashEntry.until) {
        document.querySelector(sel)?.classList.remove("flash");
      }
    }, 1600);
  }
  // Legacy quotes created before worker events stored quote.entry: locate the
  // worker's nearest preceding timeline event in main chat without leaving it.
  async function jumpToWorkerEvent(worker, beforeId, opts) {
    if (!worker) return;
    const seq = ++jumpSeq;
    cancelCollieLayoutLock();
    cancelInitialAnchor();
    activeCollieRestore = null;
    pendingOpen = false;
    renderPendingBar();
    const findTarget = () => {
      const all = chatEntries();
      const stop = beforeId ? all.findIndex((x) => x.id === beforeId) : all.length;
      const end = stop >= 0 ? stop - 1 : all.length - 1;
      for (let i = end; i >= 0; i--) {
        const x = all[i];
        if (x.role !== "event" || x.ref !== worker || !x.id) continue;
        if (x.ref === ROUTER && x.tone === "info") continue;
        if (workerChatter(x)) continue;
        return x.id;
      }
      return "";
    };
    let id = findTarget();
    let guards = 0;
    while (!id && canLoadOlder() && guards++ < 40) {
      while (olderBusy) await new Promise((r) => setTimeout(r, 35));
      if (seq !== jumpSeq) return;
      id = findTarget();
      if (id) break;
      const ok = await loadOlder(false);
      if (seq !== jumpSeq) return;
      id = findTarget();
      if (!ok) break;
    }
    if (seq !== jumpSeq) return;
    if (!id) { toast("这条记录太早了，已经不在这里"); return; }
    await jumpToEntry(id, opts);
  }

  // ───────────────────────────── Collie conversation search
  let searchTimer = 0, searchAbort = null, searchSeq = 0;
  let searchQuery = "", searchHits = [], searchTotal = 0, searchHasMore = false, searchIdx = -1;
  {
    const btn = $("#super-search-btn"), wrap = $("#super-search"), input = $("#super-search-input");
    const clearBtn = $("#super-search-clear"), closeBtn = $("#super-search-close");
    const metaEl = $("#super-search-meta"), panel = $("#super-search-panel");
    const headEl = $("#super-search-head"), listEl = $("#super-search-list");
    const isMac = /Mac|iPhone|iPad/.test(navigator.platform || "");
    if (btn && matchMedia("(pointer: fine)").matches) {
      btn.title = `搜索对话 (${isMac ? "⌘K" : "Ctrl+K"})`;
    }
    const highlightSnippet = (snippet, q) => {
      const text = String(snippet || "");
      const terms = [...new Set(String(q || "").trim().split(/\s+/).filter(Boolean))].sort((a, b) => b.length - a.length);
      if (!terms.length || !text) return esc(text);
      const re = new RegExp("(" + terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")", "gi");
      let out = "", pos = 0;
      for (const m of text.matchAll(re)) {
        if (m.index > pos) out += esc(text.slice(pos, m.index));
        if (!m[0]) continue;
        out += `<mark>${esc(m[0])}</mark>`;
        pos = m.index + m[0].length;
      }
      if (pos < text.length) out += esc(text.slice(pos));
      return out;
    };
    const syncSearchActive = (scrollInto = true) => {
      if (!listEl || !input) return;
      const items = $$(".ss-item", listEl);
      items.forEach((el, idx) => {
        const on = idx === searchIdx;
        el.classList.toggle("active", on);
        el.setAttribute("aria-selected", String(on));
        if (on && scrollInto) el.scrollIntoView({ block: "nearest" });
      });
      const activeId = searchIdx >= 0 && items[searchIdx] ? items[searchIdx].id : "";
      if (activeId) input.setAttribute("aria-activedescendant", activeId);
      else input.removeAttribute("aria-activedescendant");
    };
    function showSearchPanel() {
      if (!panel || !input) return;
      panel.hidden = false;
      input.setAttribute("aria-expanded", "true");
    }
    window.__collieHideSearchPanel = () => {
      if (!panel || !input) return;
      panel.hidden = true;
      input.setAttribute("aria-expanded", "false");
      input.removeAttribute("aria-activedescendant");
    };
    const renderSearchResults = (q, hits, total, hasMore) => {
      searchQuery = q;
      searchHits = hits;
      searchTotal = total;
      searchHasMore = hasMore;
      if (!q) {
        metaEl.hidden = true;
        metaEl.textContent = "";
        headEl.hidden = true;
        listEl.innerHTML = "";
        searchIdx = -1;
        window.__collieHideSearchPanel();
        return;
      }
      metaEl.hidden = false;
      metaEl.textContent = hasMore ? `${hits.length}/${total} 条` : `${total} 条`;
      if (!hits.length) {
        headEl.hidden = true;
        listEl.innerHTML = `<div class="ss-empty">没有找到包含「${esc(q)}」的对话</div>`;
        searchIdx = -1;
        showSearchPanel();
        input.removeAttribute("aria-activedescendant");
        return;
      }
      headEl.hidden = false;
      headEl.innerHTML = `<span>${hasMore ? `找到 ${total} 条，显示最近 ${hits.length} 条` : `找到 ${total} 条相关消息`}</span><span class="ss-hint">↑↓ 选择 · ↵ 定位</span>`;
      searchIdx = 0;
      listEl.innerHTML = hits.map((h, i) => {
        const who = h.role === "user" ? "你" : "Collie";
        const at = +new Date(h.at) || 0;
        return `<button type="button" class="ss-item${i === 0 ? " active" : ""}" id="ss-opt-${i}" role="option" aria-selected="${i === 0}" data-hit-id="${esc(h.id)}">
          <div class="ss-top"><span class="ss-who ${h.role === "user" ? "user" : "collie"}">${who}</span><span class="ss-when"${at ? ` title="${esc(fullTime(at))}"` : ""}>${esc(at ? sepTime(at) : "")}</span></div>
          <div class="ss-snip">${highlightSnippet(h.snippet, q)}</div>
        </button>`;
      }).join("");
      showSearchPanel();
      syncSearchActive(false);
    };
    const runSuperSearch = async (raw) => {
      const q = String(raw || "").trim();
      const seq = ++searchSeq;
      searchAbort?.abort();
      if (!q) {
        renderSearchResults("", [], 0, false);
        return;
      }
      const ctrl = new AbortController();
      searchAbort = ctrl;
      try {
        const res = await authFetch(`/api/super/search?q=${encodeURIComponent(q)}&limit=30`, {
          credentials: "same-origin",
          signal: ctrl.signal,
        });
        noteBuild(res.headers.get("X-Collie-Web"));
        if (res.status === 401) { showLogin(); return; }
        if (!res.ok) throw new Error(res.statusText);
        const data = await res.json();
        if (seq !== searchSeq || input.value.trim() !== q) return;
        renderSearchResults(q, data.results || [], data.total || 0, !!data.has_more);
      } catch (err) {
        if (err?.name === "AbortError" || seq !== searchSeq) return;
      }
    };
    const openSuperSearch = (selectExisting = false) => {
      if (!wrap || !input || !btn) return;
      const wasHidden = wrap.hidden;
      wrap.hidden = false;
      btn.classList.add("on");
      btn.setAttribute("aria-expanded", "true");
      input.focus({ preventScroll: true });
      if (selectExisting && !wasHidden && input.value) input.select();
      const q = input.value.trim();
      if (q) {
        if (q === searchQuery && (searchHits.length || !panel.hidden)) showSearchPanel();
        else runSuperSearch(q);
      }
    };
    const closeSuperSearch = (refocus = false) => {
      if (!wrap || !input || !btn) return;
      clearTimeout(searchTimer);
      searchAbort?.abort();
      searchSeq++;
      window.__collieHideSearchPanel();
      wrap.hidden = true;
      btn.classList.remove("on");
      btn.setAttribute("aria-expanded", "false");
      if (refocus && view === "collie") {
        if (!narrow()) $("#super-input")?.focus({ preventScroll: true });
        else btn.focus({ preventScroll: true });
      }
    };
    const selectSearchHit = (id) => {
      if (!id) return;
      window.__collieHideSearchPanel();
      if (narrow()) input?.blur();
      jumpToEntry(id);
    };
    btn?.addEventListener("click", (e) => {
      e.preventDefault();
      if (wrap.hidden) openSuperSearch(false);
      else closeSuperSearch(true);
    });
    clearBtn?.addEventListener("click", () => {
      clearTimeout(searchTimer);
      searchAbort?.abort();
      searchSeq++;
      input.value = "";
      clearBtn.hidden = true;
      renderSearchResults("", [], 0, false);
      input.focus({ preventScroll: true });
    });
    closeBtn?.addEventListener("click", () => closeSuperSearch(true));
    input?.addEventListener("input", () => {
      const raw = input.value;
      clearBtn.hidden = !raw.length;
      clearTimeout(searchTimer);
      if (!raw.trim()) {
        searchAbort?.abort();
        searchSeq++;
        renderSearchResults("", [], 0, false);
        return;
      }
      searchTimer = setTimeout(() => runSuperSearch(raw), 180);
    });
    input?.addEventListener("focus", () => {
      const q = input.value.trim();
      if (q && q === searchQuery && panel.hidden) showSearchPanel();
    });
    input?.addEventListener("keydown", (e) => {
      if (e.isComposing || e.keyCode === 229) return;
      if (e.key === "ArrowDown" && searchHits.length) {
        e.preventDefault();
        if (panel.hidden) showSearchPanel();
        searchIdx = (searchIdx + 1) % searchHits.length;
        syncSearchActive(true);
      } else if (e.key === "ArrowUp" && searchHits.length) {
        e.preventDefault();
        if (panel.hidden) showSearchPanel();
        searchIdx = (searchIdx - 1 + searchHits.length) % searchHits.length;
        syncSearchActive(true);
      } else if (e.key === "Enter") {
        e.preventDefault();
        const q = input.value.trim();
        if (!q) return;
        if (q === searchQuery && searchHits.length) {
          const hit = searchHits[Math.max(0, searchIdx)];
          if (hit?.id) selectSearchHit(hit.id);
        } else {
          clearTimeout(searchTimer);
          runSuperSearch(q);
        }
      }
    });
    listEl?.addEventListener("mousemove", (e) => {
      const item = e.target.closest(".ss-item");
      if (!item) return;
      const idx = $$(".ss-item", listEl).indexOf(item);
      if (idx >= 0 && idx !== searchIdx) {
        searchIdx = idx;
        syncSearchActive(false);
      }
    });
    listEl?.addEventListener("click", (e) => {
      const item = e.target.closest(".ss-item[data-hit-id]");
      if (item) {
        e.preventDefault();
        selectSearchHit(item.dataset.hitId);
      }
    });
    document.addEventListener("mousedown", (e) => {
      if (!wrap || wrap.hidden) return;
      if (wrap.contains(e.target) || btn?.contains(e.target)) return;
      if (!input.value.trim()) closeSuperSearch(false);
      else window.__collieHideSearchPanel();
    });
    document.addEventListener("keydown", (e) => {
      if (view !== "collie" || document.querySelector("dialog[open]")) return;
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        openSuperSearch(true);
        return;
      }
      if (e.key === "Escape" && wrap && !wrap.hidden && !e.isComposing && e.keyCode !== 229) {
        if (pickOpen || pendingOpen || !$("#file-view")?.hidden || activeThreadRoot) return;
        e.preventDefault();
        closeSuperSearch(true);
      }
    });
  }
  function hideSearchPanel() {
    window.__collieHideSearchPanel?.();
  }

  // Initial enter/reload scroll-anchor lock: keeps bottom or #unread-sep pinned
  // while asynchronous screenshots / fonts expand #super-thread height, and
  // releases immediately on the user's first manual scroll or after 2500ms.
  const INITIAL_ANCHOR_MS = 2500;
  let collieInitialAnchor = null;
  function cancelInitialAnchor() {
    if (!collieInitialAnchor) return;
    clearTimeout(collieInitialAnchor.timer);
    try { collieInitialAnchor.ro?.disconnect?.(); } catch {}
    collieInitialAnchor = null;
  }
  function placeUnreadAnchor(scroller, sepEl) {
    const maxTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
    const sr = scroller.getBoundingClientRect();
    const sepRect = sepEl.getBoundingClientRect();
    const sepTop = scroller.scrollTop + (sepRect.top - sr.top);
    const wantTop = Math.max(0, Math.min(maxTop, sepTop - UNREAD_TOP_PAD));
    // Whenever scrolling all the way to bottom already keeps #unread-sep
    // completely inside the viewport, all unread messages fit in one screen.
    const fitsAtBottom = maxTop <= 0 || sepTop - UNREAD_TOP_PAD >= maxTop;
    if (fitsAtBottom) {
      activeCollieRestore = null;
      markProgrammaticScroll(120);
      scroller.scrollTop = scroller.scrollHeight;
      return { fitsAtBottom: true, wantTop: maxTop };
    }
    markProgrammaticScroll(140);
    scroller.scrollTop = wantTop;
    return { fitsAtBottom: false, wantTop };
  }
  function applyInitialAnchor(fromResize = false) {
    if (!collieInitialAnchor) return;
    if (view !== "collie") { cancelInitialAnchor(); return; }
    if (performance.now() > collieInitialAnchor.until) { cancelInitialAnchor(); return; }
    if (activeThreadRoot || collieLayoutLock || olderBusy) return;
    const box = $("#super-thread"), sc = box?.parentElement;
    if (!sc || sc.clientHeight <= 0) return;
    const sh = sc.scrollHeight, ch = sc.clientHeight;
    if (fromResize && sh === collieInitialAnchor.lastH && ch === collieInitialAnchor.lastCH) {
      if (collieInitialAnchor.mode === "bottom" && sh - sc.scrollTop - ch <= 1) return;
    }
    collieInitialAnchor.lastH = sh;
    collieInitialAnchor.lastCH = ch;
    if (collieInitialAnchor.mode === "bottom") {
      markProgrammaticScroll(120);
      sc.scrollTop = sh;
      const snap = { routeKey: "collie", atBottom: true, scrollTop: sc.scrollTop, anchorId: "", anchorOffset: 0 };
      if (typeof navCur === "number") scrollByIdx.set(navCur, snap);
      scrollByRoute.set("collie", snap);
      updateSuperJump();
      maybeScheduleReadAtBottom();
      return;
    }
    const sepEl = sessionUnreadMarkerId ? $("#unread-sep", box) : null;
    if (!sepEl) { cancelInitialAnchor(); return; }
    const placed = placeUnreadAnchor(sc, sepEl);
    if (placed.fitsAtBottom) {
      collieInitialAnchor.mode = "bottom";
      maybeScheduleReadAtBottom();
    } else if (activeCollieRestore?.unreadSep) {
      activeCollieRestore.scrollTop = placed.wantTop;
    }
    captureViewScroll("collie", null, navCur);
    updateSuperJump();
  }
  function beginInitialAnchor(mode) {
    cancelInitialAnchor();
    const box = $("#super-thread"), sc = box?.parentElement;
    if (!box || !sc) return;
    const until = performance.now() + INITIAL_ANCHOR_MS;
    let ro = null;
    if (typeof ResizeObserver === "function") {
      ro = new ResizeObserver(() => { applyInitialAnchor(true); });
      try { ro.observe(box); } catch {}
      try { ro.observe(sc); } catch {}
    }
    const timer = setTimeout(cancelInitialAnchor, INITIAL_ANCHOR_MS);
    collieInitialAnchor = { mode, until, timer, ro, lastH: sc.scrollHeight, lastCH: sc.clientHeight };
  }

  let superBodyKey = "", superDomGen = 0, superAsksGen = 0, thumbRenderVer = 0;
  let _superPatchTpl = null;
  function canPatchSuperDom(box) {
    if (!box || typeof box.insertBefore !== "function" || typeof box.replaceChild !== "function"
      || typeof box.removeChild !== "function" || typeof box.appendChild !== "function") {
      return false;
    }
    if (typeof document?.createElement !== "function") return false;
    if (!_superPatchTpl) {
      const tpl = document.createElement("template");
      if (!tpl || !tpl.content) return false;
      _superPatchTpl = tpl;
    }
    return true;
  }
  function parseSuperNode(html) {
    _superPatchTpl.innerHTML = html;
    return _superPatchTpl.content.firstElementChild;
  }
  function promoteUserNodeInPlace(el, item) {
    const msgEl = el.querySelector?.(".msg.user");
    if (!msgEl) return false;
    const nextCls = `mine${item.pinned ? " is-pinned" : ""}`;
    if (el.className !== nextCls) el.className = nextCls;
    if (item.rootId) el.dataset.threadRoot = item.rootId;
    else delete el.dataset.threadRoot;
    if (msgEl.dataset.id !== (item.entryId || "")) msgEl.dataset.id = item.entryId || "";
    const nextTitle = item.at ? fullTime(item.at) : "";
    if (nextTitle) msgEl.setAttribute("title", nextTitle);
    else msgEl.removeAttribute("title");
    const curPin = el.querySelector?.(".pin-ind");
    if (item.pinned && !curPin) {
      const pinEl = parseSuperNode(`<div class="pin-ind">${ICON_PIN}<span>已钉住</span></div>`);
      if (pinEl) el.insertBefore(pinEl, msgEl);
    } else if (!item.pinned && curPin && curPin.parentNode === el) {
      el.removeChild(curPin);
    }
    const oldFoot = el.querySelector?.(":scope > .msg-foot, :scope > .msg-acts")
      || (msgEl.nextElementSibling && (msgEl.nextElementSibling.classList?.contains("msg-foot") || msgEl.nextElementSibling.classList?.contains("msg-acts")) ? msgEl.nextElementSibling : null);
    const footHtml = item.renderFoot ? item.renderFoot() : "";
    if (footHtml) {
      const newFoot = parseSuperNode(footHtml);
      if (newFoot) {
        if (oldFoot && oldFoot.parentNode === el) el.replaceChild(newFoot, oldFoot);
        else el.appendChild(newFoot);
      }
    } else if (oldFoot && oldFoot.parentNode === el) {
      el.removeChild(oldFoot);
    }
    el._collieSig = item.sig;
    el._collieKey = item.key;
    return true;
  }
  function patchSuperThread(box, items) {
    const t0 = performance.now();
    const stats = box._colliePatchStats || (box._colliePatchStats = {
      renders: 0, fullRebuilds: 0, lastAdded: 0, lastUpdated: 0, lastRemoved: 0, lastReused: 0, lastMs: 0,
    });
    stats.renders++;
    let nodeMap = box._collieNodes;
    const isInitial = !nodeMap || !nodeMap.size || !box.firstElementChild || items.length === 0;
    if (isInitial) {
      nodeMap = new Map();
      box._collieNodes = nodeMap;
      if (!items.length) {
        while (box.firstChild) box.removeChild(box.firstChild);
        stats.fullRebuilds++;
        stats.lastAdded = stats.lastUpdated = stats.lastRemoved = stats.lastReused = 0;
        stats.lastMs = performance.now() - t0;
        return { mutated: true, added: 0, updated: 0, removed: 0, reused: 0, fullRebuild: true };
      }
      const frag = document.createDocumentFragment();
      if (items.length > 16) {
        _superPatchTpl.innerHTML = items.map((it) => it.render()).join("");
        const parsed = [..._superPatchTpl.content.children];
        if (parsed.length === items.length) {
          for (let i = 0; i < items.length; i++) {
            const el = parsed[i], it = items[i];
            el._collieKey = it.key;
            el._collieSig = it.sig;
            if (it.msgSig !== undefined) el._collieMsgSig = it.msgSig;
            nodeMap.set(it.key, el);
            frag.appendChild(el);
          }
        } else {
          _superPatchTpl.innerHTML = "";
          for (let i = 0; i < items.length; i++) {
            const it = items[i], el = parseSuperNode(it.render());
            if (!el) continue;
            el._collieKey = it.key;
            el._collieSig = it.sig;
            if (it.msgSig !== undefined) el._collieMsgSig = it.msgSig;
            nodeMap.set(it.key, el);
            frag.appendChild(el);
          }
        }
      } else {
        for (let i = 0; i < items.length; i++) {
          const it = items[i], el = parseSuperNode(it.render());
          if (!el) continue;
          el._collieKey = it.key;
          el._collieSig = it.sig;
          if (it.msgSig !== undefined) el._collieMsgSig = it.msgSig;
          nodeMap.set(it.key, el);
          frag.appendChild(el);
        }
      }
      while (box.firstChild) box.removeChild(box.firstChild);
      box.appendChild(frag);
      stats.fullRebuilds++;
      stats.lastAdded = items.length;
      stats.lastUpdated = stats.lastRemoved = stats.lastReused = 0;
      stats.lastMs = performance.now() - t0;
      return { mutated: true, added: items.length, updated: 0, removed: 0, reused: 0, fullRebuild: true };
    }

    let added = 0, updated = 0, removed = 0, reused = 0, moved = 0;
    const nextKeys = new Set();
    for (let i = 0; i < items.length; i++) {
      const k = items[i].key;
      nextKeys.add(k);
      if (!nodeMap.has(k)) {
        let alias = "";
        if (promotedPendingKeys.has(k)) {
          alias = promotedPendingKeys.get(k);
        } else if (k.startsWith("__tsep:")) {
          const idPart = k.slice(7);
          const localPart = promotedPendingKeys.get(idPart);
          if (localPart && nodeMap.has("__tsep:" + localPart)) alias = "__tsep:" + localPart;
        }
        if (alias && nodeMap.has(alias)) {
          const existing = nodeMap.get(alias);
          nodeMap.delete(alias);
          existing._collieKey = k;
          nodeMap.set(k, existing);
        }
      }
    }

    for (const [k, el] of nodeMap) {
      if (!nextKeys.has(k)) {
        if (el.parentNode === box) box.removeChild(el);
        nodeMap.delete(k);
        removed++;
      }
    }

    let cursor = box.firstElementChild;
    let pendingFrag = null;
    const flushFrag = () => {
      if (!pendingFrag) return;
      if (cursor) box.insertBefore(pendingFrag, cursor);
      else box.appendChild(pendingFrag);
      pendingFrag = null;
    };

    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      let el = nodeMap.get(it.key);
      if (!el) {
        el = parseSuperNode(it.render());
        if (!el) continue;
        el._collieKey = it.key;
        el._collieSig = it.sig;
        if (it.msgSig !== undefined) el._collieMsgSig = it.msgSig;
        nodeMap.set(it.key, el);
        if (!pendingFrag) pendingFrag = document.createDocumentFragment();
        pendingFrag.appendChild(el);
        added++;
        continue;
      }
      flushFrag();
      if (el._collieSig !== it.sig) {
        if (it.canPromoteInPlace && el._collieMsgSig && el._collieMsgSig === it.msgSig && promoteUserNodeInPlace(el, it)) {
          updated++;
          reused++;
        } else {
          const fresh = parseSuperNode(it.render());
          if (fresh) {
            fresh._collieKey = it.key;
            fresh._collieSig = it.sig;
            if (it.msgSig !== undefined) fresh._collieMsgSig = it.msgSig;
            const wasCursor = el === cursor;
            if (el.parentNode === box) box.replaceChild(fresh, el);
            el = fresh;
            nodeMap.set(it.key, el);
            if (wasCursor) cursor = el;
            updated++;
          }
        }
      } else {
        reused++;
      }
      if (el === cursor) {
        cursor = el.nextElementSibling;
      } else {
        if (cursor) box.insertBefore(el, cursor);
        else box.appendChild(el);
        moved++;
      }
    }
    flushFrag();
    while (cursor) {
      const next = cursor.nextElementSibling;
      box.removeChild(cursor);
      cursor = next;
      removed++;
    }
    stats.lastAdded = added;
    stats.lastUpdated = updated;
    stats.lastRemoved = removed;
    stats.lastReused = reused;
    stats.lastMs = performance.now() - t0;
    return { mutated: added + updated + removed + moved > 0, added, updated, removed, reused, fullRebuild: false };
  }

  // Anti-flicker state for the in-stream "Collie 在想…" row (#super-working):
  // - Background silent turns (worker reports / timers / system checks when the
  //   human isn't waiting on a reply) stay quietly in the header #router-status
  //   instead of popping an avatar bubble in and out of the chat stream.
  // - Human-initiated turns debounce brief (<180ms) mount blips and short (<350ms)
  //   status dips, while hiding immediately (0ms) the instant Collie replies.
  const SUPER_BUSY_SHOW_MS = 180;
  const SUPER_BUSY_HIDE_MS = 350;
  let superBusyShown = null;
  let superBusyShowTimer = 0;
  let superBusyHideTimer = 0;
  let superLastCollieId = "";
  function isWaitingCollieReply(r, allEntries) {
    if (r?.replied) return false;
    if (pendingSays.length > 0) return true;
    if (r?.turn_kind === "chat") return true;
    if (r?.turn_kind === "background") return false;
    for (let i = (allEntries?.length || 0) - 1; i >= 0; i--) {
      const e = allEntries[i];
      if (!e) continue;
      if (e.role === "user") return true;
      if (e.role === "collie") return false;
    }
    return false;
  }
  function latestCollieEntryId(allEntries) {
    for (let i = (allEntries?.length || 0) - 1; i >= 0; i--) {
      const e = allEntries[i];
      if (e?.role === "collie" && e.id) return e.id;
    }
    return "";
  }
  function resolveSuperBusy(r, allEntries, opts = {}) {
    const rawBusy = r.replied ? null : {
      working: "Collie 在想…",
      starting: "Collie 正在醒来…",
      blocked: "Collie 在等你在电脑上确认",
      dreaming: "Collie 在做梦，整理完记忆会自己醒来",
    }[r.status] || null;
    const collieId = latestCollieEntryId(allEntries);
    const gotNewCollieReply = !!(collieId && superLastCollieId && collieId !== superLastCollieId);
    if (collieId) superLastCollieId = collieId;
    const persistentState = r.status === "blocked" || r.status === "dreaming";
    const waiting = isWaitingCollieReply(r, allEntries);
    const wantBusy = rawBusy && (persistentState || waiting)
      ? { text: rawBusy, cls: "working-row say " + (r.status === "working" ? "working" : collieDot(r.status)) }
      : null;

    if (wantBusy) {
      if (superBusyHideTimer) { clearTimeout(superBusyHideTimer); superBusyHideTimer = 0; }
      if (persistentState || opts.immediate || opts.busyTimer || superBusyShown) {
        if (superBusyShowTimer) { clearTimeout(superBusyShowTimer); superBusyShowTimer = 0; }
        superBusyShown = wantBusy;
      } else if (!superBusyShowTimer) {
        superBusyShowTimer = setTimeout(() => {
          superBusyShowTimer = 0;
          if (view === "collie") renderSuper({ busyTimer: true });
        }, SUPER_BUSY_SHOW_MS);
      }
      return superBusyShown;
    }

    if (superBusyShowTimer) { clearTimeout(superBusyShowTimer); superBusyShowTimer = 0; }
    if (!superBusyShown) return null;
    const hideNow = !!r.replied || gotNewCollieReply || r.turn_kind === "background" || !waiting || opts.immediate || opts.busyTimer;
    if (hideNow) {
      if (superBusyHideTimer) { clearTimeout(superBusyHideTimer); superBusyHideTimer = 0; }
      superBusyShown = null;
      return null;
    }
    if (!superBusyHideTimer) {
      superBusyHideTimer = setTimeout(() => {
        superBusyHideTimer = 0;
        if (view === "collie") renderSuper({ busyTimer: true });
      }, SUPER_BUSY_HIDE_MS);
    }
    return superBusyShown;
  }

  function renderSuper(opts) {
    const force = opts === true || !!opts?.force;
    const forceBottom = !!opts?.scrollBottom;
    const wantUnreadAnchor = !!opts?.unreadAnchor;
    const restore = opts?.restore || null;
    const box = $("#super-thread"), wk = $("#super-working"), crew = $("#crew");
    const scroller = box.parentElement;
    const holdRestore = !forceBottom && (restore || collieLayoutLock?.snap || (activeCollieRestore && performance.now() < activeCollieRestore.until ? activeCollieRestore : null));
    const distBefore = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
    const initialBottomLock = !forceBottom && !holdRestore && !activeThreadRoot && collieInitialAnchor?.mode === "bottom" && performance.now() <= collieInitialAnchor.until;
    const atBottom = forceBottom ? true : holdRestore ? !!holdRestore.atBottom : (initialBottomLock || distBefore <= AT_BOTTOM_PX);
    const jumping = flashEntry.until > Date.now();
    const shouldApplyUnreadAnchor = (wantUnreadAnchor || !unreadAnchorApplied) && !forceBottom && !holdRestore && !activeThreadRoot && view === "collie";
    const liveAnchor = !atBottom && !holdRestore && !jumping && !olderBusy && !shouldApplyUnreadAnchor && collieInitialAnchor?.mode !== "unread" ? captureCollieAnchor(scroller) : null;
    const prevScrollTop = scroller.scrollTop;
    const wasWorking = !wk.hidden, prevBusy = wasWorking ? wk.textContent : "", prevCrew = crew._html ?? crew.innerHTML;
    const r = sup.router || {};
    const allEntries = chatEntries();
    setText($("#router-kind"), KIND_LABEL[r.kind] || r.kind || "");
    const st = $("#router-status");
    const stCls = "status " + collieDot(r.status);
    if (st.className !== stCls) st.className = stCls;
    setHTML(st, `<span class="dot ${esc(collieDot(r.status))}"></span>${esc(r.replied ? "在收尾" : collieStatus(r.status))}`);
    // While Collie is busy on a human turn (or blocked/dreaming), show the indicator
    // where its next message will appear; quiet background inspections stay in header.
    const busyInfo = resolveSuperBusy(r, allEntries, opts || {});
    const busy = busyInfo?.text || null;
    st.hidden = !!busy;
    if (busy) {
      if (wk.className !== busyInfo.cls) wk.className = busyInfo.cls;
      if (busy !== prevBusy) wk.innerHTML = `<span class="avatar"><img src="icon.svg" alt=""></span><span class="wk-t">${esc(busy)}</span>`;
    }
    wk.hidden = !busy;
    setText($("#router-queue"), sup.paused ? "已暂停投递" : routerQueued() ? `${routerQueued()} 条事件排队中` : "");
    const cx = $("#router-ctx");
    setText(cx, r.handover ? "正在交接记忆…" : r.alive && r.context ? `上下文 ${r.context}%` : "");
    cx.classList.toggle("warn", !!r.handover || (r.rotate_at > 0 && r.context >= r.rotate_at - 10));
    const cxTitle = r.rotate_at > 0 ? `用到 ${r.rotate_at}% 时，Collie 会把要记住的事写进 memory/，然后换一个新会话` : "自动换会话已关闭（自动化 → 设置）";
    if (cx.title !== cxTitle) cx.title = cxTitle;
    renderRouterModel(r);
    renderRouterPendingBars();
    const pauseLabel = sup.paused ? "恢复投递" : "暂停投递";
    $$('[data-act="pause"]').forEach((b) => setText(b, pauseLabel));

    const active = sup.workers.filter((w) => !w.ended);
    if (view === "collie") renderTarget();
    const crewHTML = active.map((w) => {
      const pane = paneOf(w.name);
      return `<a class="chip" ${pane ? `href="#/p/${encodeURIComponent(pane)}"` : ""}><span class="dot ${esc(workerStatus(w))}" title="${esc(STATUS_LABEL[workerStatus(w)] || "")}"></span>${esc(w.name)}<span class="k">${esc(KIND_LABEL[w.kind] || w.kind)}</span></a>`;
    }).join("");
    const prevCrewScroll = crew.scrollLeft || 0;
    const crewChanged = setHTML(crew, crewHTML) || crewHTML !== prevCrew;
    if (crewChanged) {
      if (prevCrewScroll > 0) crew.scrollLeft = prevCrewScroll;
      crew._syncScrollFade?.();
    }

    const isEmptyChat = !sup.entries.length && !pendingSays.length;
    let curThreadInfo = { threads: new Map(), allThreads: new Map(), msgToRoot: new Map(), allMsgToRoot: new Map() };
    const pendList = activePending();
    const pinList = activePinned();
    const needs = state.agents.filter((a) => a.status === "blocked");
    for (const a of needs) {
      const got = superAsks.get(a.pane_id);
      if (!got || Date.now() - got.at > 4000) loadSuperAsk(a.pane_id);
    }

    if (!isEmptyChat) {
      const unreadNow = computeUnreadInfo(allEntries, readCursorId);
      if (shouldApplyUnreadAnchor) {
        sessionUnreadMarkerId = unreadNow.firstUnreadId;
      } else if (!sessionUnreadMarkerId && (!atBottom || document.hidden) && unreadNow.firstUnreadId) {
        sessionUnreadMarkerId = unreadNow.firstUnreadId;
      }
      curThreadInfo = computeReplyThreads(allEntries);
      if (activeThreadRoot && !curThreadInfo.allThreads.has(activeThreadRoot) && activeThreadAnchor) {
        const migrated = curThreadInfo.allMsgToRoot.get(activeThreadAnchor);
        if (migrated && curThreadInfo.allThreads.has(migrated)) activeThreadRoot = migrated;
      }
      renderCollieThreadsMenu(curThreadInfo, allEntries);
    } else {
      renderCollieThreadsMenu(curThreadInfo, allEntries);
    }

    const curDayStamp = dayBounds();
    // Fast structural key for #super-thread body: skip item diffing when completely unchanged.
    const nextBodyKey = [
      isEmptyChat ? "E" : "L",
      entriesFingerprint(allEntries),
      sessionUnreadMarkerId || "",
      olderBusy ? 1 : 0,
      curDayStamp,
      thumbRenderVer,
      sup.hasPending ? 1 : 0,
      pendList.map((p) => p.id).join(","),
      dismissedLocal.size ? [...dismissedLocal].join(",") : "",
      pickedReplyOpts.size ? [...pickedReplyOpts.entries()].map(([k, v]) => `${k}:${v.sending ? 1 : 0}:${v.text}`).join(",") : "",
      pinList.map((p) => p.id).join(","),
      workerStateFingerprint(),
      superAsksGen,
    ].join("|");

    renderPendingBar();
    const busyChanged = (busy || "") !== prevBusy;

    if (!force && nextBodyKey === superBodyKey && (!canPatchSuperDom(box) || box.firstElementChild)) {
      if (!busyChanged && !crewChanged && !shouldApplyUnreadAnchor && !holdRestore && !forceBottom) {
        syncActiveThreadMarks(curThreadInfo, { skipMenu: true });
        if (activeThreadRoot) syncThreadDrawer();
        updateSuperJump();
        return;
      }
      syncActiveThreadMarks(curThreadInfo, { skipMenu: true });
      if (activeThreadRoot) syncThreadDrawer();
    } else {
      const items = [];
      if (olderBusy) {
        items.push({ key: "__earlier__", sig: "earlier", render: () => `<div class="earlier-row">加载中…</div>` });
      }
      if (isEmptyChat) {
        items.push({
          key: "__hello__",
          sig: "hello",
          render: () => `<div class="hello"><img src="icon.svg" alt="">
        <h3>一个入口，管一群 agent</h3>
        <p>把事情告诉 Collie。它会理解上下文、拆好活，交给 Claude、Codex 或 Antigravity 在你的机器上并行去做，只在需要你决定或验收时出声。</p>
        <div class="ideas">
          <button data-idea="看一下 ~/agent-workspace 里最近改动最多的三个项目，各派一个 agent 检查有没有失败的测试，最后给我一句话总结。">并行检查三个项目的测试</button>
          <button data-idea="每天早上 9 点帮我看一下各个任务的进展，有卡住的就告诉我。">每天 9 点汇报进展</button>
          <button data-idea="以后 GitHub 上有人评论 @collie 的 issue，就派一个 agent 去复现，确认后再告诉我。">把 GitHub 评论变成任务</button>
        </div></div>`,
        });
      } else {
        let prev = "", lastAt = 0;
        let lastUser = "", sinceUser = 0, lastEvent = "", lastEventId = "", lastCollie = "", sinceCollie = 0;
        const threadInfo = curThreadInfo;
        const pendIds = new Set(pendList.map((p) => p.id));
        const pinIds = new Set(pinList.map((p) => p.id));
        const workerByNameMap = getWorkerLookup().byName;
        const findWorkerEventBefore = (worker, idx) => {
          if (!worker) return "";
          for (let j = idx - 1; j >= 0; j--) {
            const p = allEntries[j];
            if (p.role !== "event" || p.ref !== worker || !p.id) continue;
            if (p.ref === ROUTER && p.tone === "info") continue;
            if (workerChatter(p)) continue;
            return p.id;
          }
          return "";
        };
        const analyzeQuote = (e, idx) => {
          const q = e.re;
          if (!q) return null;
          if (q.entry && q.entry === lastUser && !sinceUser) return null;
          if (q.entry && q.entry === lastCollie && !sinceCollie) return null;
          if (q.entry && q.entry === lastEventId) return null;
          if (!q.entry && q.worker && q.worker === lastEvent) return null;
          const targetId = q.entry || (q.worker ? findWorkerEventBefore(q.worker, idx) : "");
          const k = entryKey(e);
          const tr = threadInfo.allMsgToRoot.get(k) || "";
          const trTh = tr ? threadInfo.allThreads.get(tr) : null;
          const isWorkerQuote = !!(q.worker || threadInfo.workerReportOf?.has(k) || (targetId && threadInfo.byId.get(targetId)?.role === "event"));
          const openRoot = !isWorkerQuote && trTh && trTh.totalCount >= 2 ? tr : "";
          return { q, targetId, openRoot, sig: `${targetId}|${openRoot}|${q.who || ""}|${q.worker || ""}|${q.text || ""}` };
        };
        const renderQuoteHtml = (qi, e) => {
          if (!qi) return "";
          const { q, targetId, openRoot } = qi;
          const body = `<span class="re-who">${esc(q.who)}</span>${esc(plainLine(q.text))}`;
          if (targetId) {
            return `<a class="re" href="#" data-goto="${esc(targetId)}"${openRoot ? ` data-thread-root="${esc(openRoot)}"` : ""} title="${esc(q.text)}">${body}</a>`;
          }
          if (q.worker) {
            return `<a class="re" href="#" data-goto-worker="${esc(q.worker)}" data-before="${esc(e.id || "")}" title="${esc(q.text)}">${body}</a>`;
          }
          return `<div class="re" title="${esc(q.text)}">${body}</div>`;
        };
        const renderThreadEntryBtn = (eKey, rootId, replyCount) => {
          if (!rootId || !replyCount) return "";
          return `<button type="button" class="thread-entry" data-open-thread="${esc(rootId)}" data-focus-msg="${esc(eKey)}" aria-expanded="false">` +
            `${ICON_THREAD_BRANCH}<span class="te-count">${replyCount} 条回复</span>${ICON_THREAD_CHEV}</button>`;
        };
        for (let ei = 0; ei < allEntries.length; ei++) {
          const e = allEntries[ei];
          if (isHiddenSuperEntry(e)) continue;
          const eKey = entryKey(e) || ("__idx:" + ei);
          if (sessionUnreadMarkerId && e.id === sessionUnreadMarkerId) {
            const uId = e.id;
            items.push({
              key: "__unread__",
              sig: `unread:${uId}`,
              render: () => `<div class="unread-sep" id="unread-sep" data-first-unread="${esc(uId)}" role="separator" aria-label="以下为未读消息"><span>以下为未读消息</span></div>`,
            });
            prev = "";
          }
          const at = +new Date(e.at) || 0;
          const talk = e.role === "user" || e.role === "collie";
          const newDay = at && lastAt && Math.floor((at - new Date(at).getTimezoneOffset() * 60000) / 86400000) !== Math.floor((lastAt - new Date(lastAt).getTimezoneOffset() * 60000) / 86400000);
          if (at && (newDay || (talk && (!lastAt || at - lastAt > 10 * 60e3)))) {
            const tLabel = sepTime(at);
            items.push({
              key: "__tsep:" + eKey,
              sig: `tsep:${tLabel}`,
              render: () => `<div class="time-sep">${esc(tLabel)}</div>`,
            });
            prev = "";
          }
          if (at) lastAt = at;
          const cont = e.role === "collie" && prev === "collie";
          prev = e.role;
          const pinned = !!(e.id && pinIds.has(e.id));
          const eRoot = eKey ? (threadInfo.allMsgToRoot.get(eKey) || "") : "";
          const showEntry = !!(eKey && threadInfo.showEntryOn.has(eKey));
          const teRoot = showEntry ? (threadInfo.msgToRoot.get(eKey) || "") : "";
          const teCount = teRoot ? (threadInfo.threads.get(teRoot)?.replyCount || 0) : 0;

          if (e.role === "user") {
            const qi = analyzeQuote(e, ei);
            const qSig = qi ? qi.sig : "";
            const hasMedia = !!(e.text && (e.text.includes("附件：\n") || e.text.includes("[image:")));
            const msgSig = `u:${qSig}|${hasMedia ? thumbRenderVer : 0}|${e.text || ""}`;
            const sig = `u|${e.id || ""}|${at}|${pinned ? 1 : 0}|${eRoot}|${teRoot}:${teCount}|${curDayStamp}|${msgSig}`;
            const renderFoot = () => {
              const entryBtn = renderThreadEntryBtn(eKey, teRoot, teCount);
              const acts = mineActs(e, at, pinned, entryBtn ? "" : eRoot);
              return entryBtn ? `<div class="msg-foot">${entryBtn}${acts}</div>` : acts;
            };
            items.push({
              key: eKey,
              sig,
              msgSig,
              canPromoteInPlace: true,
              entryId: e.id || "",
              pinned,
              rootId: eRoot,
              at,
              renderFoot,
              render: () => {
                const pinBadge = pinned ? `<div class="pin-ind">${ICON_PIN}<span>已钉住</span></div>` : "";
                const rootAttr = eRoot ? ` data-thread-root="${esc(eRoot)}"` : "";
                return `<div class="mine${pinned ? " is-pinned" : ""}"${rootAttr}>${pinBadge}<div class="msg user" data-id="${esc(e.id)}"${at ? ` title="${esc(fullTime(at))}"` : ""}>${renderQuoteHtml(qi, e)}${userText(e.text)}</div>${renderFoot()}</div>`;
              },
            });
            lastUser = eKey; sinceUser = 0; lastEvent = ""; lastEventId = ""; sinceCollie++;
          } else if (e.role === "collie") {
            const qi = analyzeQuote(e, ei);
            const qSig = qi ? qi.sig : "";
            const hasOptsField = (Array.isArray(e.options) && e.options.length > 0) || !!e.check;
            const optsHtml = hasOptsField ? replyOptsMarkup(e, ei, allEntries, pendIds) : "";
            const hasMedia = !!(e.text && (e.text.includes("![") || e.text.includes("/") || e.text.includes("~")));
            const sig = `c|${e.id || ""}|${at}|${cont ? 1 : 0}|${pinned ? 1 : 0}|${eRoot}|${teRoot}:${teCount}|${curDayStamp}|${hasMedia ? thumbRenderVer : 0}|${qSig}|${optsHtml}|${e.text || ""}`;
            items.push({
              key: eKey,
              sig,
              render: () => {
                const pinBadge = pinned ? `<div class="pin-ind">${ICON_PIN}<span>已钉住</span></div>` : "";
                const rootAttr = eRoot ? ` data-thread-root="${esc(eRoot)}"` : "";
                const entryBtn = renderThreadEntryBtn(eKey, teRoot, teCount);
                const acts = msgActs(e, at, pinned, entryBtn ? "" : eRoot);
                const foot = entryBtn ? `<div class="msg-foot">${entryBtn}${acts}</div>` : acts;
                return `<div class="say${cont ? " cont" : ""}${pinned ? " is-pinned" : ""}"${rootAttr}><span class="avatar">${cont ? "" : `<img src="icon.svg" alt="">`}</span><div class="msg assistant" data-id="${esc(e.id)}"${at ? ` title="${esc(fullTime(at))}"` : ""}>${pinBadge}${renderQuoteHtml(qi, e)}${md(e.text)}${imagesIn(e.text)}${optsHtml}${foot}</div></div>`;
              },
            });
            sinceUser++; lastEvent = ""; lastEventId = ""; lastCollie = eKey; sinceCollie = 0;
          } else {
            lastEvent = e.ref || "";
            lastEventId = e.id || "";
            const hid = e.ref?.startsWith("h:") ? e.ref.slice(2)
              : (!e.ref && (e.text?.includes("换了一个新会话") || (e.text?.includes("睡一会儿") && e.text?.includes("做梦"))) ? routerHist(e.at)?.id : "");
            const past = !hid && e.ref && e.ref !== ROUTER ? workerHist(e.ref, e.at) : null;
            const pane = !hid && !past && e.ref ? paneOf(e.ref) : null;
            const hTitle = e.text?.includes("做梦") ? "翻看做梦前的对话" : "翻看交接前的对话";
            const tag = hid ? `a href="#/h/${encodeURIComponent(hid)}" title="${hTitle}"`
              : past ? `a href="#/h/${encodeURIComponent(past.id)}" title="看它的完整记录"`
              : pane ? `a href="#/p/${encodeURIComponent(pane)}"` : "div";
            const w = e.tone === "spawn" ? (workerByNameMap.get(e.ref) || null) : null;
            const busyW = w && workerBusy(w);
            const stuck = w && !w.ended && w.status === "blocked";
            const tone = e.tone === "blocked" ? "blocked" : e.tone === "done" ? "done" : e.tone === "spawn" ? (busyW ? "running" : stuck ? "blocked" : "unknown") : e.tone === "error" ? "failed" : "unknown";
            const wstate = w ? (w.ended ? "已结束" : busyW ? "还在跑" : stuck ? "等你确认" : "") : "";
            const whenStr = hhmm(at || e.at);
            const sig = `ev|${e.id || ""}|${e.ref || ""}|${e.tone || ""}|${tag}|${tone}|${wstate}|${whenStr}|${e.text || ""}`;
            items.push({
              key: eKey,
              sig,
              render: () => {
                const idAttr = e.id ? ` data-id="${esc(e.id)}"` : "";
                const refAttr = e.ref ? ` data-ref="${esc(e.ref)}"` : "";
                return `<${tag} class="event${e.tone === "error" ? " error" : ""}"${idAttr}${refAttr}><span class="dot ${tone}"></span><span class="when">${whenStr}</span><span>${esc(e.text)}</span>${wstate ? `<span class="wstate">${wstate}</span>` : ""}</${tag.split(" ")[0]}>`;
              },
            });
          }
        }
      }
      if (needs.length) {
        const needsHtml = `<div class="needs">` + needs.map((a) => {
          const got = superAsks.get(a.pane_id);
          if (got?.a) return superAskHTML(got.a, a);
          return `<a class="need" href="#/p/${encodeURIComponent(a.pane_id)}">
        <span class="dot blocked"></span>
        <span class="body"><div class="name">${esc(title(a))} 等你确认</div><div class="sub">${esc(a.name === ROUTER ? "它停在一个对话框上，处理后才能继续" : (KIND_LABEL[a.kind] || a.kind) + " · " + tilde(a.cwd))}</div></span>
        <span class="go">处理 →</span></a>`;
        }).join("") + `</div>`;
        items.push({ key: "__needs__", sig: "needs:" + needsHtml, render: () => needsHtml });
      }
      superBodyKey = nextBodyKey;
      let domMutated = false;
      if (canPatchSuperDom(box)) {
        const res = patchSuperThread(box, items);
        domMutated = res.mutated;
        if (domMutated) superDomGen++;
      } else {
        const html = items.map((it) => it.render()).join("");
        if (html !== superSig || force) {
          superSig = html;
          superDomGen++;
          box.innerHTML = html;
          domMutated = true;
        }
      }
      if (domMutated) {
        syncActiveThreadMarks(curThreadInfo, { skipMenu: true });
        if (flashEntry.until > Date.now() && flashEntry.id) {
          const fid = CSS.escape(flashEntry.id);
          const fEl = box.querySelector(`.msg[data-id="${fid}"], .event[data-id="${fid}"]`);
          if (fEl && !fEl.classList.contains("flash")) fEl.classList.add("flash");
        }
        if (activeThreadRoot) syncThreadDrawer();
      } else if (!busyChanged && !crewChanged && !shouldApplyUnreadAnchor) {
        syncActiveThreadMarks(curThreadInfo, { skipMenu: true });
        if (activeThreadRoot) syncThreadDrawer();
        updateSuperJump();
        return;
      } else {
        syncActiveThreadMarks(curThreadInfo, { skipMenu: true });
        if (activeThreadRoot) syncThreadDrawer();
      }
    }
    if (shouldApplyUnreadAnchor && scroller.clientHeight > 0) {
      const hasEntries = chatEntries().length > 0;
      if (hasEntries) unreadAnchorApplied = true;
      const sepEl = sessionUnreadMarkerId ? $("#unread-sep", box) : null;
      const firstEl = sessionUnreadMarkerId ? findUnreadRowEl(box, sessionUnreadMarkerId) : null;
      if (sepEl && firstEl) {
        const placed = placeUnreadAnchor(scroller, sepEl);
        if (placed.fitsAtBottom) {
          beginInitialAnchor("bottom");
          const set = scroller.scrollTop;
          if (typeof requestAnimationFrame === "function") {
            if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(superScrollRAF);
            superScrollRAF = requestAnimationFrame(() => {
              if (collieInitialAnchor?.mode === "bottom" || scroller.scrollTop === set) {
                markProgrammaticScroll();
                scroller.scrollTop = scroller.scrollHeight;
              }
              captureViewScroll("collie", null, navCur);
              updateSuperJump();
              maybeScheduleReadAtBottom();
            });
          } else {
            captureViewScroll("collie", null, navCur);
            maybeScheduleReadAtBottom();
          }
        } else {
          beginInitialAnchor("unread");
          activeCollieRestore = {
            unreadSep: true,
            anchorId: sessionUnreadMarkerId,
            anchorOffset: UNREAD_TOP_PAD,
            atBottom: false,
            scrollTop: placed.wantTop,
            until: performance.now() + INITIAL_ANCHOR_MS,
          };
          if (typeof cancelAnimationFrame === "function") {
            cancelAnimationFrame(superScrollRAF);
            cancelAnimationFrame(collieRestoreRAF);
          }
          if (typeof requestAnimationFrame === "function") {
            collieRestoreRAF = requestAnimationFrame(() => {
              if (view !== "collie" || !activeCollieRestore?.unreadSep) return;
              applyInitialAnchor();
            });
          } else {
            captureViewScroll("collie", null, navCur);
          }
        }
        updateSuperJump();
        return;
      }
      // No unread (or first-time enablement with no read cursor): stick cleanly to bottom and record cursor.
      activeCollieRestore = null;
      beginInitialAnchor("bottom");
      markProgrammaticScroll();
      scroller.scrollTop = scroller.scrollHeight;
      const set = scroller.scrollTop;
      if (typeof requestAnimationFrame === "function") {
        if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(superScrollRAF);
        superScrollRAF = requestAnimationFrame(() => {
          if (collieInitialAnchor?.mode === "bottom" || scroller.scrollTop === set) {
            markProgrammaticScroll();
            scroller.scrollTop = scroller.scrollHeight;
          }
          captureViewScroll("collie", null, navCur);
          updateSuperJump();
          maybeScheduleReadAtBottom();
        });
      } else {
        captureViewScroll("collie", null, navCur);
        maybeScheduleReadAtBottom();
      }
      updateSuperJump();
      return;
    }
    if (!forceBottom && !holdRestore && !jumping && !olderBusy && collieInitialAnchor?.mode === "unread" && performance.now() <= collieInitialAnchor.until) {
      applyInitialAnchor();
      return;
    }
    if (holdRestore && !holdRestore.atBottom) {
      activeCollieRestore = { ...holdRestore, until: performance.now() + 340 };
      if (typeof cancelAnimationFrame === "function") {
        cancelAnimationFrame(superScrollRAF);
        cancelAnimationFrame(collieRestoreRAF);
      }
      if (holdRestore.unreadSep && collieInitialAnchor?.mode === "unread") {
        applyInitialAnchor();
        return;
      }
      applyCollieAnchor(scroller, holdRestore);
      updateSuperJump();
      if (typeof requestAnimationFrame === "function") {
        collieRestoreRAF = requestAnimationFrame(() => {
          if (view !== "collie" || !activeCollieRestore) return;
          applyCollieAnchor(scroller, activeCollieRestore);
          captureViewScroll("collie", null, navCur);
          updateSuperJump();
        });
      }
      return;
    }
    if ((atBottom && !jumping) || forceBottom) {
      activeCollieRestore = null;
      markProgrammaticScroll();
      scroller.scrollTop = scroller.scrollHeight;
      const set = scroller.scrollTop;
      if (typeof requestAnimationFrame === "function") {
        if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(superScrollRAF);
        superScrollRAF = requestAnimationFrame(() => {
          if (collieInitialAnchor?.mode === "bottom" || scroller.scrollTop === set) {
            markProgrammaticScroll();
            scroller.scrollTop = scroller.scrollHeight;
          }
          captureViewScroll("collie", null, navCur);
          updateSuperJump();
          maybeScheduleReadAtBottom();
        });
      } else {
        maybeScheduleReadAtBottom();
      }
    } else {
      if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(superScrollRAF);
      if (!jumping && !olderBusy && liveAnchor) {
        applyCollieAnchor(scroller, { anchorId: liveAnchor.anchorId, anchorOffset: liveAnchor.anchorOffset, scrollTop: prevScrollTop });
      }
    }
    updateSuperJump();
  }
  $("#super-thread")._loadMore = () => canLoadOlder() && loadOlder();
  {
    const box = $("#super-thread");
    const sc = box?.parentElement;
    box?.addEventListener("load", (e) => {
      if (e.target?.tagName !== "IMG") return;
      const p = e.target.parentElement?.dataset?.img;
      if (p && e.target.naturalWidth > 0 && e.target.naturalHeight > 0 && !thumbDims.has(p)) {
        thumbDims.set(p, { w: e.target.naturalWidth, h: e.target.naturalHeight });
        invalidateMdCacheForImage(p);
      }
      if (collieInitialAnchor) applyInitialAnchor();
    }, true);
    let superJumpScrollRAF = 0;
    sc?.addEventListener("scroll", () => {
      if (superJumpScrollRAF) return;
      const run = () => {
        superJumpScrollRAF = 0;
        updateSuperJump();
        if (performance.now() >= programmaticScrollUntil) maybeScheduleReadAtBottom();
      };
      if (typeof requestAnimationFrame === "function") superJumpScrollRAF = requestAnimationFrame(run);
      else run();
    }, { passive: true });
    sc?.addEventListener("wheel", (e) => {
      cancelCollieLayoutLock();
      cancelInitialAnchor();
      activeCollieRestore = null;
      if (e.deltaY < 0 && superJumpHiding) { jumpSeq++; superJumpHiding = false; updateSuperJump(); }
    }, { passive: true });
    sc?.addEventListener("touchstart", () => {
      cancelCollieLayoutLock();
      cancelInitialAnchor();
      activeCollieRestore = null;
    }, { passive: true });
    sc?.addEventListener("touchmove", () => {
      cancelCollieLayoutLock();
      cancelInitialAnchor();
      activeCollieRestore = null;
      if (superJumpHiding) { jumpSeq++; superJumpHiding = false; updateSuperJump(); }
    }, { passive: true });
    sc?.addEventListener("pointerdown", () => {
      cancelCollieLayoutLock();
      cancelInitialAnchor();
      activeCollieRestore = null;
    }, { passive: true });
    const onScrollKey = (e) => {
      if (!collieInitialAnchor && !activeCollieRestore) return;
      if (!["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(e.key)) return;
      const tag = e.target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || e.target?.isContentEditable) return;
      cancelCollieLayoutLock();
      cancelInitialAnchor();
      activeCollieRestore = null;
    };
    sc?.addEventListener("keydown", onScrollKey);
    document.addEventListener("keydown", onScrollKey);
    addEventListener("resize", updateSuperJump);

    // Horizontal wheel-to-scroll & fallback fade sync for overflowing worker capsule strips.
    const supportsScrollFade = typeof CSS !== "undefined"
      && CSS.supports?.("animation-timeline", "scroll(self inline)")
      && CSS.supports?.("mask-composite", "subtract")
      && CSS.supports?.("mask-clip", "no-clip");
    const bindHorizontalStrip = (el) => {
      if (!el || el._hStripBound) return;
      el._hStripBound = true;
      el.addEventListener("wheel", (e) => {
        if (e.ctrlKey) return;
        const maxScroll = el.scrollWidth - el.clientWidth;
        if (maxScroll <= 1) return;
        // Keep native trackpad / shift-wheel horizontal gestures untouched;
        // map predominantly vertical mouse-wheel scrolling to horizontal scroll.
        if (!e.deltaY || Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return;
        let delta = e.deltaY;
        if (e.deltaMode === 1) delta *= 24;
        else if (e.deltaMode === 2) delta *= Math.max(120, el.clientWidth * 0.8);
        e.preventDefault();
        el.scrollLeft += delta;
      }, { passive: false });
      const syncFade = () => {
        if (supportsScrollFade) return;
        const maxScroll = el.scrollWidth - el.clientWidth;
        const overflow = maxScroll > 1;
        el.classList.toggle("more-start", overflow && el.scrollLeft > 1);
        el.classList.toggle("more-end", overflow && el.scrollLeft < maxScroll - 1);
      };
      el._syncScrollFade = syncFade;
      if (!supportsScrollFade) {
        let raf = 0;
        const schedule = () => {
          if (raf) return;
          raf = requestAnimationFrame(() => { raf = 0; syncFade(); });
        };
        el.addEventListener("scroll", schedule, { passive: true });
        if (typeof ResizeObserver === "function") new ResizeObserver(schedule).observe(el);
        else addEventListener("resize", schedule, { passive: true });
        syncFade();
      }
    };
    bindHorizontalStrip($("#crew"));
    bindHorizontalStrip($("#td-workers"));
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) flushPendingChatRead(true);
      else maybeScheduleReadAtBottom();
    });
    addEventListener("pagehide", () => flushPendingChatRead(true));
    $("#super-jump")?.addEventListener("click", async () => {
      if (!sc) return;
      const seq = ++jumpSeq;
      cancelCollieLayoutLock();
      cancelInitialAnchor();
      activeCollieRestore = null;
      if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(superScrollRAF);
      superJumpHiding = true;
      const latestId = latestPersistedEntryId();
      if (latestId) commitChatRead(latestId, { immediate: true });
      updateSuperJump();
      const smooth = !matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (smooth && sc.scrollHeight - sc.scrollTop > sc.clientHeight * 2.5) {
        sc.scrollTop = sc.scrollHeight - sc.clientHeight * 1.8;
      }
      await scrollToAsync(sc, sc.scrollHeight, smooth ? "smooth" : "auto");
      if (seq !== jumpSeq) return;
      markProgrammaticScroll();
      sc.scrollTop = sc.scrollHeight;
      captureViewScroll("collie", null, navCur);
      superJumpHiding = false;
      const afterId = latestPersistedEntryId();
      if (afterId) commitChatRead(afterId, { immediate: true });
      updateSuperJump();
    });
  }

  // The dialogs agents are stuck on, read from their screens (pane → {at, a}).
  const superAsks = new Map();
  async function loadSuperAsk(pane, force) {
    const prev = superAsks.get(pane);
    if ((prev?.loading || prev?.sending) && !force) return;
    superAsks.set(pane, { ...prev, at: Date.now(), loading: true, sending: false });
    let a = null;
    try { const r = await api(paneURL(pane, "ask")); a = r.asking ? r.approval : null; } catch { a = prev?.a || null; }
    if (superAsks.get(pane)?.sending && !force) return;
    const changedAsk = JSON.stringify(a) !== JSON.stringify(prev?.a ?? null);
    superAsks.set(pane, { at: Date.now(), a });
    if (changedAsk) superAsksGen++;
    if ((force || changedAsk) && view === "collie") renderSuper(force ? { force: true } : undefined);
  }
  setInterval(() => { if (view === "collie" && state.agents.some((x) => x.status === "blocked")) renderSuper(); }, 4000);
  function superAskHTML(a, agent) {
    const { q, blocks } = readDialog(a.question);
    const body = blocks.map((b) => b.code ? `<pre class="ctx-code">${esc(b.text)}</pre>` : `<p>${esc(b.text)}</p>`).join("");
    const choices = a.choices || [];
    return `<div class="ask" data-pane="${esc(agent.pane_id)}">
      <div class="ask-head"><span class="dot blocked"></span><span class="who">${esc(title(agent))}</span><span>需要你确认</span><span class="spacer"></span>
        <a href="#/p/${encodeURIComponent(agent.pane_id)}">打开 →</a></div>
      <div class="ask-q"><div class="q">${esc(q)}</div>${body ? `<div class="ctx">${body}</div>` : ""}</div>
      ${choices.length ? `<div class="choices">${choices.map((c, i) => `<button type="button" class="choice ${c.current ? "current" : ""}" data-choice="${i}">
          <span class="n">${esc(c.text || i + 1)}</span><span class="l">${esc(c.label)}${c.desc ? `<span class="d">${esc(c.desc)}</span>` : ""}</span></button>`).join("")}</div>
        <div class="ask-keys"><button type="button" data-k="esc">Esc 取消</button></div>`
      : `<div class="ask-keys"><button type="button" data-k="up">↑</button><button type="button" data-k="down">↓</button><button type="button" data-k="esc">Esc</button><button type="button" class="go" data-k="enter">确认 ↵</button></div>`}
    </div>`;
  }

  $("#super-thread").addEventListener("mousedown", (e) => { if (e.target.closest(".ask button")) e.preventDefault(); });
  $("#super-thread").addEventListener("click", async (e) => {
    const idea = e.target.closest("[data-idea]")?.dataset.idea;
    if (idea) { $("#super-input").value = idea; grow($("#super-input")); $("#super-input").focus(); }
    // Answering a stuck agent from here.
    const b = e.target.closest("button"), card = b?.closest(".ask[data-pane]");
    if (!card || card.dataset.busy) return;
    const pane = card.dataset.pane;
    let kind, body;
    if (b.dataset.choice != null) {
      const c = superAsks.get(pane)?.a?.choices?.[+b.dataset.choice];
      if (!c) return;
      if (c.keys?.length) { kind = "keys"; body = { keys: c.keys }; }
      else if (c.text) { kind = "text"; body = { text: c.text }; }
      else { kind = "keys"; body = { keys: ["enter"] }; }
    } else if (b.dataset.k) {
      kind = "keys"; body = { keys: [b.dataset.k] };
    } else return;
    card.dataset.busy = "1";
    card.style.opacity = ".5";
    const cur = superAsks.get(pane);
    if (cur) cur.sending = true;
    try {
      await api(paneURL(pane, kind), { body });
      await new Promise((r) => setTimeout(r, 350));
      await loadSuperAsk(pane, true);
    } catch (err) {
      if (cur) cur.sending = false;
      delete card.dataset.busy;
      card.style.opacity = "";
      toast(err.message, "attn");
    }
  });

  // Models and thinking efforts each agent offers, per computer (asked once per page).
  const EFFORT_LABEL = { none: "关闭", minimal: "最低", low: "低", medium: "中", high: "高", xhigh: "很高", max: "最高", ultra: "极致" };
  const AGY_EFFORT_RE = /-(low|medium|high|xhigh|max)$/i;
  function agyRejectsEffort(model) {
    const m = (model || "").trim();
    return AGY_EFFORT_RE.test(m) || /orchestrator/i.test(m);
  }
  function effortsFor(info, kind, model) {
    if ((kind === "agy" || kind === "antigravity") && model && agyRejectsEffort(model)) return [];
    const m = (info?.models || []).find((x) => x.id === model);
    if (m && Array.isArray(m.efforts)) return m.efforts;
    return Array.isArray(info?.efforts) ? info.efforts : [];
  }
  function defaultModelName(info) {
    const def = info?.default || "";
    if (!def) return "";
    const m = (info?.models || []).find((x) => x.id === def);
    return m?.label || def.split("/").pop();
  }
  const modelInfo = {};
  async function modelsFor(kind, machine) {
    const key = kind + "@" + (machine || "");
    if (!modelInfo[key]) {
      const q = new URLSearchParams({ kind });
      if (machine) q.set("machine", machine);
      modelInfo[key] = api("/api/models?" + q).catch(() => ({
        models: [],
        efforts: kind === "agy" || kind === "antigravity" ? [] : ["low", "medium", "high", "xhigh", "max"],
      }));
    }
    return modelInfo[key];
  }
  // "派到": where this message's work runs. Shows the defaults from
  // 自动化 → 设置 (read again whenever this view opens); target holds only
  // what was picked here, so a message never carries a stale default.
  let target = null, targetDefault = null, _renderTargetSig = "";
  async function renderTarget(fresh) {
    if (!targetDefault || fresh) {
      _renderTargetSig = "";
      try {
        const s = (await api("/api/super/settings")).settings;
        targetDefault = { machine: s.worker_machine || "", kind: s.worker_kind === "antigravity" ? "agy" : s.worker_kind || "claude", model: s.worker_model || "", effort: s.worker_effort || "" };
      } catch { targetDefault ||= { machine: "", kind: "claude", model: "", effort: "" }; }
    }
    // What was picked here over the defaults: picking only an agent leaves the
    // computer at its default, not unset.
    const t = targetNow();
    const ms = (state.machines || [{ id: "", name: "本机", local: true }]).filter((m) => !m.hub && (m.local ? state.ok !== false : m.online || m.id === t.machine));
    const sig = `${t.machine}|${t.kind}|${t.model ?? ""}|${t.effort ?? ""}|${targetDefault.machine}|${targetDefault.kind}|${targetDefault.model}|${targetDefault.effort}|${state.ok}|${ms.map((m) => `${m.id}:${m.name}:${m.online}:${(m.agents || []).join(",")}`).join(";")}`;
    if (!fresh && sig === _renderTargetSig) return;
    _renderTargetSig = sig;
    const fill = (sel, html) => { if (sel._html !== html) { sel._html = html; sel.innerHTML = html; } };
    const mSel = $("#t-machine"), kSel = $("#t-kind");
    fill(mSel, ms.map((m) => `<option value="${esc(m.id)}" data-dot="${m.local || m.online ? "online" : "offline"}"
      data-sub="${m.local ? "hub" : m.os || ""}${m.id === targetDefault.machine ? " · 默认" : ""}" ${m.id === t.machine ? "selected" : ""}>${esc(m.name)}</option>`).join(""));
    const have = ms.find((m) => m.id === t.machine)?.agents;
    fill(kSel, [["claude", "Claude"], ["codex", "Codex"], ["agy", "Antigravity"], ["doubao", "Doubao"]].map(([k, l]) => {
      const missing = Array.isArray(have) && !have.includes(k);
      const sub = [missing ? "这台电脑没装" : "", k === targetDefault.kind ? "默认" : ""].filter(Boolean).join(" · ");
      return `<option value="${k}" data-glyph="${k}" data-short="${KIND_LABEL[k]}" ${sub ? `data-sub="${sub}"` : ""} ${missing && k !== t.kind ? "disabled" : ""} ${k === t.kind ? "selected" : ""}>${l}</option>`;
    }).join(""));
    mSel.value = t.machine; kSel.value = t.kind;
    mSel.hidden = ms.length < 2;
    syncPick(mSel); syncPick(kSel);
    mSel._pick?.classList.toggle("changed", t.machine !== targetDefault.machine);
    kSel._pick?.classList.toggle("changed", t.kind !== targetDefault.kind);
    renderModelChips();
  }
  // The default model and effort belong to the default kind of agent; any
  // other kind starts from that agent's own settings.
  const modelDefaults = (t) => targetDefault && t.kind === targetDefault.kind ? { model: targetDefault.model, effort: targetDefault.effort } : { model: "", effort: "" };
  const modelNow = (t) => { const d = modelDefaults(t); return { model: t.model ?? d.model, effort: t.effort ?? d.effort, d }; };
  let chipSeq = 0;
  async function renderModelChips() {
    const seq = ++chipSeq, t = targetNow(), { model, effort, d } = modelNow(t);
    const mSel = $("#t-model"), eSel = $("#t-effort");
    const info = await modelsFor(t.kind, t.machine);
    if (seq !== chipSeq) return;
    const list = [...(info.models || [])];
    if (model && !list.some((m) => m.id === model)) list.unshift({ id: model });
    const short = (id) => id.split("/").pop();
    const mark = (v, dv) => (v === dv ? " · 默认" : "");
    const defName = defaultModelName(info);
    let html = d.model ? "" : `<option value="" data-short="${esc(defName ? "默认 · " + defName : "默认模型")}" data-sub="${esc(defName ? "现在是 " + defName + " · 默认" : "agent 自己的设置 · 默认")}">默认</option>`;
    html += list.map((m) => `<option value="${esc(m.id)}" data-short="${esc(m.label && m.label.length <= 24 ? m.label : short(m.id))}" data-sub="${esc((m.label && m.label !== m.id ? m.id : "") + mark(m.id, d.model))}" ${m.id === model ? "selected" : ""}>${esc(m.label || m.id)}</option>`).join("");
    if (mSel._html !== html) { mSel._html = html; mSel.innerHTML = html; }
    mSel.value = model;
    const effs = effortsFor(info, t.kind, model);
    const eff = effs.includes(effort) ? effort : "";
    const defOwn = effs.includes(d.effort) ? d.effort : "";
    const defE = defOwn || (effs.includes(info.default_effort) ? info.default_effort : "") || "";
    let ehtml = `<option value="" data-short="思考 · ${esc(EFFORT_LABEL[defE] || defE || "默认")}" data-sub="${esc(defOwn ? "派活默认" : "agent 自己的设置")}">默认（${esc(EFFORT_LABEL[defE] || defE || "agent 自己定")}）</option>`;
    ehtml += effs.map((e) => `<option value="${esc(e)}" data-short="思考 · ${esc(EFFORT_LABEL[e] || e)}" data-sub="${esc(e)}" ${e === eff ? "selected" : ""}>${esc(EFFORT_LABEL[e] || e)}</option>`).join("");
    if (eSel._html !== ehtml) { eSel._html = ehtml; eSel.innerHTML = ehtml; }
    eSel.value = eff && eff !== defOwn ? eff : "";
    const hideEff = effs.length === 0;
    eSel.hidden = hideEff;
    eSel.disabled = hideEff;
    if (hideEff && pickOpen === eSel) closePick();
    syncPick(mSel); syncPick(eSel);
    mSel._pick?.classList.toggle("changed", model !== d.model);
    eSel._pick?.classList.toggle("changed", !hideEff && eff !== defOwn && eff !== "");
  }
  const pick = (o) => { target = { ...(target || {}), ...o }; };
  $("#t-machine").addEventListener("change", (e) => { pick({ machine: e.target.value }); renderTarget(); });
  $("#t-kind").addEventListener("change", (e) => { pick({ kind: e.target.value, model: undefined, effort: undefined }); renderTarget(); });
  $("#t-model").addEventListener("change", (e) => { pick({ model: e.target.value, effort: undefined }); renderModelChips(); });
  $("#t-effort").addEventListener("change", (e) => { pick({ effort: e.target.value || undefined }); renderModelChips(); });
  const targetNow = () => {
    const d = targetDefault || { machine: "", kind: "claude", model: "", effort: "" };
    const t = { ...d };
    for (const [k, v] of Object.entries(target || {})) if (v !== undefined) t[k] = v;
    if (target && "kind" in target && t.kind !== d.kind) { t.model = target.model; t.effort = target.effort; }
    return t;
  };

  // Quoting one of Collie's messages: it rides along with what you send next.
  let replyTo = null;
  const setReply = (e) => {
    replyTo = e ? { entry: e.id, who: e.role === "user" ? "你" : "Collie", text: e.text } : null;
    const box = $("#re-draft");
    box.hidden = !e;
    if (e) {
      const whoEl = $(".re-who", box);
      if (whoEl) whoEl.textContent = replyTo.who;
      $(".re-t", box).textContent = reLine(e.text);
      $("#super-input").focus({ preventScroll: true });
    }
  };
  const reLine = (t) => plainLine(t);
  $("#re-draft button").addEventListener("click", () => setReply(null));
  document.addEventListener("click", (ev) => {
    const b = ev.target.closest(".re-btn[data-re]");
    if (!b) return;
    const e = chatEntries().find((x) => x.id === b.dataset.re);
    if (e) setReply(e);
  });

  const newClientMsgID = () => (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function")
    ? crypto.randomUUID()
    : `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

  async function sendSuper(text, re, restoreRe, clientMsgID = newClientMsgID(), opts = {}) {
    const scrollBottom = opts.scrollBottom !== false;
    const keepRestore = !scrollBottom && opts.restore && !opts.restore.atBottom ? opts.restore : null;
    const normRe = re?.entry ? { entry: String(re.entry), who: re.who || "Collie", text: re.text || "" } : null;
    // Only what was picked here goes along; the hub fills in its current defaults.
    const t = targetNow(), p = target || {};
    const { model, effort } = modelNow(t);
    // Your message shows at once; the hub's copy takes its place seamlessly when it arrives.
    const mine = {
      id: "",
      _localId: "_p" + (++pendingSaySeq),
      client_msg_id: clientMsgID,
      _afterNum: entryIdNum(latestPersistedEntryId()),
      role: "user",
      text,
      at: new Date().toISOString(),
      pending: true,
      re: normRe,
    };
    pendingSays.push(mine);
    if (scrollBottom) {
      cancelInitialAnchor();
      activeCollieRestore = null;
      unreadAnchorApplied = true;
      sessionUnreadMarkerId = "";
      const latestBeforeSend = latestPersistedEntryId();
      if (latestBeforeSend) commitChatRead(latestBeforeSend, { immediate: false });
    }
    renderSide();
    renderSuper({ scrollBottom, ...(keepRestore ? { restore: keepRestore } : {}) });
    let r;
    try {
      const info = await modelsFor(t.kind, t.machine);
      const sendEffort = effortsFor(info, t.kind, model).includes(effort) ? effort : "";
      r = await api("/api/super/say", { body: { text, re: normRe?.entry || "", client_msg_id: clientMsgID,
      machine: "machine" in p ? (t.machine || "local") : "",
      kind: "kind" in p ? t.kind : "",
      model: "model" in p || "kind" in p ? model : "",
      effort: "effort" in p || "kind" in p ? sendEffort : "" } });
    } catch (err) {
      const idx = pendingSays.indexOf(mine);
      if (idx >= 0) pendingSays.splice(idx, 1);
      if (restoreRe && normRe && !replyTo) setReply(chatEntries().find((x) => x.id === normRe.entry));
      opts.onRollback?.();
      const errSc = !scrollBottom && view === "collie" ? viewScroller("collie") : null;
      const errRestore = errSc && !isCollieNearBottom(errSc)
        ? (captureEntryAnchor(errSc, normRe?.entry || "") || captureColliePos(errSc))
        : null;
      if (errRestore) errRestore.atBottom = false;
      renderSide();
      renderSuper(errRestore ? { restore: errRestore } : undefined);
      throw err;
    }
    // The hub's copy may already be here (its push beat the reply): swap seamlessly now.
    mine.id = r?.entry || mine.id || "";
    if (mine.id && scrollBottom) commitChatRead(mine.id, { immediate: true });
    const idx = pendingSays.indexOf(mine);
    if (idx >= 0 && (!mine.id || sup.entries.some((e) => e.id === mine.id))) {
      if (mine.id) rememberPromotedPending(mine.id, mine._localId);
      pendingSays.splice(idx, 1);
      renderSide();
      renderSuper();
    }
    if (!sup.router?.alive) toast("正在唤醒 Collie…");
  }

  const busyReplyOpts = new Set();
  async function handleQuickOptionClick(ev, opts = {}) {
    const ack = ev.target.closest(".reply-ack[data-ack]");
    if (ack) { ev.preventDefault(); dismissPending(ack.dataset.ack); return true; }
    const b = ev.target.closest(".reply-opt[data-opt]");
    if (!b) return false;
    const grp = b.closest(".reply-opts[data-entry]");
    const id = grp?.dataset.entry;
    if (!grp || !id || grp.dataset.busy || busyReplyOpts.has(id)) return true;
    busyReplyOpts.add(id);
    grp.dataset.busy = "1";
    grp.querySelectorAll("button").forEach((x) => { x.disabled = true; });
    const text = b.dataset.opt;
    if (replyTo?.entry === id) setReply(null);
    const e = chatEntries().find((x) => x.id === id);
    const sc = viewScroller("collie");
    const shouldScrollBottom = typeof opts.scrollBottom === "boolean"
      ? opts.scrollBottom
      : (!opts.inDrawer && isCollieNearBottom(sc));
    let keepSnap = null;
    if (opts.inDrawer) {
      tdForceScroll = true;
      tdAutoStickUntil = performance.now() + 1200;
    } else if (!shouldScrollBottom) {
      cancelCollieLayoutLock();
      cancelInitialAnchor();
      activeCollieRestore = null;
      unreadAnchorApplied = true;
      keepSnap = captureEntryAnchor(sc, id) || captureColliePos(sc);
      if (keepSnap) keepSnap.atBottom = false;
      pickedReplyOpts.set(id, { text, sending: true });
    }
    try {
      await sendSuper(
        text,
        e ? { entry: e.id, who: "Collie", text: e.text } : { entry: id, who: "Collie", text: "" },
        false,
        undefined,
        {
          scrollBottom: shouldScrollBottom,
          restore: keepSnap,
          onRollback: () => { pickedReplyOpts.delete(id); },
        },
      );
      const picked = pickedReplyOpts.get(id);
      if (picked) {
        picked.sending = false;
        const box = $("#super-thread");
        box?.querySelector(`.reply-picked[data-entry="${CSS.escape(id)}"]`)?.classList.remove("is-sending");
      }
    } catch (err) {
      pickedReplyOpts.delete(id);
      delete grp.dataset.busy;
      grp.querySelectorAll("button").forEach((x) => { x.disabled = false; });
      toast(err.message, "attn");
    } finally {
      busyReplyOpts.delete(id);
    }
    return true;
  }
  $("#super-thread").addEventListener("click", (ev) => { handleQuickOptionClick(ev); });

  $("#pending-wrap").addEventListener("click", (ev) => {
    const dis = ev.target.closest("[data-dismiss]");
    if (dis) { ev.preventDefault(); ev.stopPropagation(); dismissPending(dis.dataset.dismiss); return; }
    const unpin = ev.target.closest("[data-unpin]");
    if (unpin) { ev.preventDefault(); ev.stopPropagation(); togglePin(unpin.dataset.unpin, false); return; }
    if (ev.target.closest("[data-toggle-pending]")) { ev.preventDefault(); pendingOpen = !pendingOpen; renderPendingBar(); return; }
    const go = ev.target.closest("[data-goto-pending]");
    if (go) { ev.preventDefault(); jumpToEntry(go.dataset.gotoPending); }
  });
  document.addEventListener("click", (ev) => {
    if (pendingOpen && !ev.composedPath().includes($("#pending-wrap"))) { pendingOpen = false; renderPendingBar(); }
  });
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && pendingOpen && !document.querySelector("dialog[open]")) { pendingOpen = false; renderPendingBar(); }
  });

  bindComposer($("#super-composer"), $("#super-input"), async (text, re) => {
    await sendSuper(text, re, true);
  }, () => targetNow().machine, {
    beforeSend: () => { const re = replyTo; setReply(null); return re; },
    onError: (re) => { if (re && !replyTo) setReply(chatEntries().find((x) => x.id === re.entry)); },
  });

  // ───────────────────────────── automation view
  function normalizeAutoTab(t) {
    if (t === "hooks") return "integrations";
    if (t === "threads") return "inbox";
    return ["memory", "timers", "inbox", "integrations", "settings"].includes(t) ? t : "memory";
  }
  let autoTab = normalizeAutoTab(store.get("autoTab", "memory"));
  let inboxThread = "";
  const inboxExpanded = new Set();
  let inboxLoadSeq = 0;
  let autoTimer;
  let intPayload = null;
  let intModalKind = null;
  let intModalDraft = null;
  let intPairTimer = null;
  let intOnboardPollTimer = null;
  let intOnboardTickTimer = null;
  const INT_STATUS_TEXT = {
    connected: "已连通",
    connecting: "连接中",
    error: "连接异常",
    unconfigured: "未配置",
    disabled: "已暂停",
  };
  const INT_ICONS = {
    feishu: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 17.5V6.8l7.2 4.2L19 5.5v10.2c0 1.4-.9 2.6-2.3 2.9L9.8 20c-2.6.5-4.8-1-4.8-2.5Z"/><path d="M12.2 11 19 15.2"/></svg>`,
    github: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 19c-4.5 1.4-4.5-2.3-6.2-2.8m12.4 5.6v-3.5a3 3 0 0 0-.8-2.3c2.8-.3 5.8-1.4 5.8-6.3a4.9 4.9 0 0 0-1.3-3.4 4.6 4.6 0 0 0-.1-3.4s-1.1-.3-3.5 1.3a12.1 12.1 0 0 0-6.4 0C6.5 2.6 5.4 2.9 5.4 2.9a4.6 4.6 0 0 0-.1 3.4A4.9 4.9 0 0 0 4 9.7c0 4.9 3 6 5.8 6.3a3 3 0 0 0-.8 2.3v3.5"/></svg>`,
    gitforge: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6.5" cy="6.5" r="2.2"/><circle cx="6.5" cy="17.5" r="2.2"/><circle cx="17.5" cy="9.5" r="2.2"/><path d="M6.5 8.7v6.6M17.5 11.7c0 3.2-2.2 5.8-8.8 5.8"/></svg>`,
  };
  const INT_CLI_HINT_CARD = {
    kind: "gitforge-cli-hint",
    name: "自定义代码托管 CLI",
    subtitle: "可插拔本机 CLI 适配器 · 零公网门槛",
    description: "在 ~/.collie/providers/ 放入声明式 JSON 插件，即可免公网追踪任意自建或企业 Git 平台的 MR 评审、评论 @我 与流水线失败。",
  };
  $("#auto-tabs").addEventListener("click", (e) => {
    const t = e.target.closest("button")?.dataset.tab;
    if (!t) return;
    if (view === "auto") captureViewScroll("auto", null, navCur);
    autoTab = normalizeAutoTab(t); store.set("autoTab", autoTab);
    const saved = scrollByRoute.get("auto:" + autoTab) || null;
    if (!saved) { markProgrammaticScroll(); $("#auto-body").scrollTop = 0; }
    openAuto(saved);
  });

  // The follow-up line under 自动化 opens the open tasks (top of 记忆).
  $("#nav-auto-sub").addEventListener("click", () => {
    if (sup.follow?.next) {
      autoTab = "memory"; store.set("autoTab", autoTab);
      scrollByRoute.delete("auto:memory");
      if (view === "auto") { markProgrammaticScroll(); $("#auto-body").scrollTop = 0; openAuto(); }
    }
  });

  function openAuto(restore = null) {
    autoTab = normalizeAutoTab(autoTab);
    store.set("autoTab", autoTab);
    memEditing = false;
    const body = $("#auto-body");
    body._memSig = "";
    body._inboxSig = "";
    body._inboxRendered = false;
    body.classList.toggle("is-integrations", autoTab === "integrations");
    $$("#auto-tabs button").forEach((b) => b.classList.toggle("on", b.dataset.tab === autoTab));
    if (restore) restoreSimpleScroll(body, restore);
    clearInterval(autoTimer);
    loadAuto(restore);
    if (autoTab === "inbox") autoTimer = setInterval(() => loadAuto(), 4000);
    if (autoTab === "memory") autoTimer = setInterval(() => { if (!memEditing) loadAuto(); }, 5000);
    if (autoTab === "integrations") autoTimer = setInterval(() => { if (!$("#int-modal")?.open) loadAuto(); }, 6000);
  }

  function inboxTextId(id) {
    return "inbox-text-" + String(id ?? "").replace(/[^A-Za-z0-9_-]/g, "_");
  }
  function hasSelectionInside(root) {
    try {
      const sel = window.getSelection?.();
      if (!sel || !sel.toString()) return false;
      return !!(
        (sel.anchorNode && root.contains(sel.anchorNode))
        || (sel.focusNode && root.contains(sel.focusNode))
      );
    } catch { return false; }
  }
  function captureInboxScrollAnchor(body) {
    if (!body || body.clientHeight <= 0) return null;
    const scrollTop = body.scrollTop;
    if (scrollTop <= 0) return { scrollTop: 0, id: "", offset: 0 };
    const bodyTop = body.getBoundingClientRect().top;
    for (const row of body.querySelectorAll(".inbox-row")) {
      const rect = row.getBoundingClientRect();
      if (rect.bottom > bodyTop + 1) {
        return { scrollTop, id: row.dataset.inboxId || "", offset: rect.top - bodyTop };
      }
    }
    return { scrollTop, id: "", offset: 0 };
  }
  function restoreInboxScrollAnchor(body, anchor) {
    if (!body || !anchor || body.clientHeight <= 0) return;
    if (anchor.id) {
      const row = [...body.querySelectorAll(".inbox-row")].find((el) => el.dataset.inboxId === anchor.id);
      if (row) {
        const bodyTop = body.getBoundingClientRect().top;
        const rowTop = row.getBoundingClientRect().top;
        const target = Math.max(0, body.scrollTop + (rowTop - bodyTop) - anchor.offset);
        markProgrammaticScroll();
        body.scrollTop = target;
        return;
      }
    }
    if (anchor.scrollTop > 0) {
      markProgrammaticScroll();
      body.scrollTop = anchor.scrollTop;
    }
  }
  function syncInboxRow(row) {
    if (!row) return false;
    const id = String(row.dataset?.inboxId || "");
    const textEl = row.querySelector(".inbox-text");
    const btn = row.querySelector(".inbox-toggle");
    if (!id || !textEl || !btn) return false;
    const expanded = inboxExpanded.has(id);
    row.classList.toggle("is-expanded", expanded);
    const truncated = !expanded && textEl.clientHeight > 0 && textEl.scrollHeight > textEl.clientHeight + 1;
    const expandable = expanded || truncated;
    row.classList.toggle("is-expandable", expandable);
    btn.hidden = !expandable;
    btn.setAttribute("aria-expanded", expanded ? "true" : "false");
    btn.setAttribute("aria-label", `${expanded ? "收起" : "展开"} #${id}`);
    const lbl = btn.querySelector(".inbox-toggle-lbl");
    if (lbl) lbl.textContent = expanded ? "收起" : "展开";
    return expandable;
  }
  function syncInboxOverflow(root = $("#auto-body")) {
    if (!root) return;
    root.querySelectorAll(".inbox-row").forEach((row) => syncInboxRow(row));
  }
  function toggleInboxRow(row, id, { animate = true } = {}) {
    const key = String(id ?? row?.dataset?.inboxId ?? "");
    if (!row || !key) return false;
    const textEl = row.querySelector(".inbox-text");
    const wasExpanded = inboxExpanded.has(key);
    if (textEl?._inboxAnim) {
      try { textEl._inboxAnim.cancel(); } catch {}
      textEl._inboxAnim = null;
      textEl.style.overflow = "";
    }
    row.classList.remove("is-collapsing");
    const reduceMotion = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    const canAnim = animate && !reduceMotion && textEl && typeof textEl.animate === "function";
    const startH = canAnim ? textEl.getBoundingClientRect().height : 0;
    if (wasExpanded) {
      inboxExpanded.delete(key);
    } else {
      inboxExpanded.add(key);
      if (inboxExpanded.size > 200) inboxExpanded.delete(inboxExpanded.values().next().value);
    }
    syncInboxRow(row);
    if (canAnim && startH > 0) {
      const endH = textEl.getBoundingClientRect().height;
      if (Math.abs(endH - startH) > 1) {
        if (wasExpanded) row.classList.add("is-collapsing");
        else textEl.style.overflow = "hidden";
        const anim = textEl.animate(
          [{ height: startH + "px" }, { height: endH + "px" }],
          { duration: wasExpanded ? 160 : 190, easing: "cubic-bezier(.22, 1, .36, 1)" },
        );
        textEl._inboxAnim = anim;
        const done = () => {
          if (textEl._inboxAnim !== anim) return;
          textEl._inboxAnim = null;
          textEl.style.overflow = "";
          row.classList.remove("is-collapsing");
        };
        anim.finished.then(done, done);
      }
    }
    return !wasExpanded;
  }
  if (typeof ResizeObserver === "function" && $("#auto-body")) {
    let lastAutoW = 0, autoResizeRAF = 0;
    new ResizeObserver(() => {
      const body = $("#auto-body");
      if (!body || view !== "auto" || autoTab !== "inbox") return;
      const w = Math.round(body.clientWidth);
      if (w <= 0 || w === lastAutoW) return;
      lastAutoW = w;
      if (autoResizeRAF) return;
      autoResizeRAF = requestAnimationFrame(() => {
        autoResizeRAF = 0;
        if (view === "auto" && autoTab === "inbox") syncInboxOverflow(body);
      });
    }).observe($("#auto-body"));
  }

  async function loadAuto(restore = null) {
    const body = $("#auto-body");
    body.classList.toggle("is-integrations", autoTab === "integrations");
    const keepTop = !restore && body.clientHeight > 0 ? { scrollTop: body.scrollTop, atBottom: body.scrollHeight - body.scrollTop - body.clientHeight <= AT_BOTTOM_PX } : null;
    const applyAfter = () => {
      if (restore) restoreSimpleScroll(body, restore);
      else if (keepTop && !keepTop.atBottom) { markProgrammaticScroll(); body.scrollTop = keepTop.scrollTop; }
    };
    try {
      if (autoTab === "inbox") {
        // Avoid tearing down the inbox DOM while the user is interacting with its dropdown.
        if (pickOpen && body.contains(pickOpen)) return;
        const seq = ++inboxLoadSeq;
        const r = await api("/api/super/triggers");
        if (seq !== inboxLoadSeq || view !== "auto" || autoTab !== "inbox") return;
        if (pickOpen && body.contains(pickOpen)) return;
        const triggers = r.triggers || [];
        const threads = r.threads || [];
        const activeWorkers = (sup.workers || []).filter((w) => !w.ended).map((w) => w.name);
        const sig = JSON.stringify({
          t: triggers,
          th: threads,
          f: inboxThread,
          w: activeWorkers,
          tm: triggers.map((x) => when(x.at)),
          thm: threads.map((x) => when(x.last_at)),
        });
        if (sig === body._inboxSig && body._inboxRendered) {
          if (restore) restoreSimpleScroll(body, restore);
          return;
        }
        // Preserve active user text selection during background refreshes.
        if (!restore && body._inboxRendered && hasSelectionInside(body)) return;
        const subsOpen = !!body.querySelector(".inbox-subs-fold[open]");
        const focusToggleId = document.activeElement && body.contains(document.activeElement)
          ? document.activeElement.closest?.("[data-inbox-toggle]")?.dataset?.inboxToggle || ""
          : "";
        const anchor = !restore ? captureInboxScrollAnchor(body) : null;
        body._inboxSig = sig;
        body._inboxRendered = true;
        body.innerHTML = inboxHTML(triggers, threads);
        if (subsOpen) { const d = body.querySelector(".inbox-subs-fold"); if (d) d.open = true; }
        syncInboxOverflow(body);
        if (restore) restoreSimpleScroll(body, restore);
        else restoreInboxScrollAnchor(body, anchor);
        if (focusToggleId) {
          const btn = [...body.querySelectorAll("[data-inbox-toggle]")].find((el) => el.dataset.inboxToggle === focusToggleId);
          if (btn && !btn.hidden) btn.focus?.({ preventScroll: true });
        }
        return;
      } else if (autoTab === "memory") {
        const r = await api("/api/super/memory");
        if (view !== "auto" || autoTab !== "memory" || memEditing) return;
        // Workers' states count too: the task cards show them.
        const sig = JSON.stringify(r) + sup.workers.map((w) => w.name + ":" + workerStatus(w)).join();
        if (sig !== body._memSig) {
          const open = new Set([...body.querySelectorAll("details[open]")].map((d) => d.dataset.path || d.querySelector("summary")?.textContent));
          const first = !body._memSig;
          body._memSig = sig; body.innerHTML = memoryHTML(r);
          if (!first) body.querySelectorAll("details").forEach((d) => d.open = open.has(d.dataset.path || d.querySelector("summary")?.textContent));
          applyAfter();
        } else if (restore) {
          restoreSimpleScroll(body, restore);
        }
        return;
      } else if (autoTab === "timers") {
        const r = await api("/api/super/timers");
        if (view !== "auto" || autoTab !== "timers") return;
        const endedOpen = !!body.querySelector("details[data-ended-timers][open]");
        body.innerHTML = timersHTML(r.timers || []);
        if (endedOpen) { const d = body.querySelector("details[data-ended-timers]"); if (d) d.open = true; }
        applyAfter();
      } else if (autoTab === "integrations") {
        const r = await api("/api/super/integrations");
        if (view !== "auto" || autoTab !== "integrations") return;
        const advOpen = !!body.querySelector("#int-adv-fold[open]");
        const focusedWebhook = document.activeElement?.id === "int-adv-webhook";
        const draftWebhook = focusedWebhook ? document.activeElement.value : null;
        intPayload = r;
        if (!focusedWebhook) {
          body.innerHTML = integrationsHTML(r);
          if (advOpen) { const d = body.querySelector("#int-adv-fold"); if (d) d.open = true; }
          applyAfter();
        } else if (draftWebhook !== null && $("#int-adv-webhook")) {
          $("#int-adv-webhook").value = draftWebhook;
        }
        api("/api/super/lark?fresh").then((l) => {
          const el = $("#int-adv-lark-who");
          if (el) el.textContent = l.ready ? `已就绪：发给 ${l.who || "本机登录用户"}（以机器人身份）` : `${l.problem}，当前不可用`;
        }).catch(() => {});
      } else {
        const r = await api("/api/super/settings");
        if (view !== "auto" || autoTab !== "settings") return;
        body.innerHTML = settingsHTML(r);
        applyAfter();
        api("/api/super/lark?fresh").then((l) => {
          const el = $("#lark-who");
          if (el) el.textContent = l.ready ? `发给 ${l.who || "lark-cli 登录的人"}（以机器人身份）` : `${l.problem}，所以不会发`;
        }).catch(() => {});
      }
    } catch (err) { body._inboxSig = ""; body._inboxRendered = false; body.innerHTML = `<p class="panel-intro">${esc(err.message)}</p>`; }
  }

  // ───────────────────────────── integrations store & centered modal
  function intEffectiveState(item) {
    const raw = item?.health?.state;
    if (raw && INT_STATUS_TEXT[raw]) return raw;
    if (!item?.configured) return "unconfigured";
    return item.enabled ? "connecting" : "disabled";
  }
  function intTimeHint(item, st) {
    if (st === "unconfigured") {
      if (item.extra?.provider_type === "cli") return "本机 CLI 插件就绪";
      return "尚未连接";
    }
    if (st === "disabled") return "已关闭接入";
    if (st === "connecting") return item.health?.detail || "正在连接…";
    if (st === "error") return item.health?.last_error ? item.health.last_error.slice(0, 32) : "需要检查配置";
    if (item.health?.last_active_at) return `${ago(item.health.last_active_at)}活跃`;
    if (item.health?.last_ok_at) return `${ago(item.health.last_ok_at)}连通`;
    if (item.extra?.engine === "gitforge") return item.health?.detail || "轮询就绪";
    return "长连接在线";
  }
  function integrationsHTML(r) {
    const live = Array.isArray(r?.integrations) ? r.integrations : [];
    const hasCLIProvider = live.some((x) => x.extra?.provider_type === "cli");
    const notify = r?.notify || {};
    const hasWebhook = !!String(notify.notify_webhook || "").trim();
    const okCount = live.filter((x) => intEffectiveState(x) === "connected").length + (hasWebhook ? 1 : 0);
    const errCount = live.filter((x) => intEffectiveState(x) === "error").length;
    const summaryText = `已连通 ${okCount} 项 · ${errCount > 0 ? `${errCount} 项需处理` : "运行正常"}`;
    const hookURL = `${location.origin}/hooks/ci?key=${encodeURIComponent(r?.hook_key || "")}`;
    const advPill = hasWebhook
      ? `<span class="sdot connected" aria-hidden="true"></span><span style="color:var(--fg);font-weight:500">已配置推送</span>`
      : notify.notify_lark
        ? `<span class="sdot disabled" aria-hidden="true"></span><span>仅兜底开启</span>`
        : `<span class="sdot unconfigured" aria-hidden="true"></span><span>未配置</span>`;

    const cards = live.map((item) => {
      const st = intEffectiveState(item);
      const actLabel = st === "error" ? "去修复 ›" : st === "unconfigured" ? "去配置 ›" : "配置 ›";
      return `<article class="int-card${st === "error" ? " is-error" : ""}">
        <div class="int-card-top">
          <span class="int-logo">${INT_ICONS[item.kind] || INT_ICONS.gitforge}</span>
          <div class="int-head">
            <h3 class="int-title"><button type="button" class="int-card-hit" data-int-open="${esc(item.kind)}" aria-label="配置 ${esc(item.name)}">${esc(item.name)}</button></h3>
            <p class="int-sub">${esc(item.subtitle || "")}</p>
          </div>
          <div class="int-switch-wrap">
            <button type="button" class="switch" role="switch" aria-checked="${item.enabled ? "true" : "false"}" aria-label="开关 ${esc(item.name)}" data-int-toggle="${esc(item.kind)}"></button>
          </div>
        </div>
        <p class="int-desc">${esc(item.description || "")}</p>
        <div class="int-foot">
          <span class="int-status is-${esc(st)}">
            <span class="sdot ${esc(st)}" aria-hidden="true"></span>
            <span class="int-status-txt"><span class="int-state-lbl">${esc(INT_STATUS_TEXT[st] || st)}</span> · ${esc(intTimeHint(item, st))}</span>
          </span>
          <span class="int-act" aria-hidden="true">${actLabel}</span>
        </div>
      </article>`;
    }).join("") + (!hasCLIProvider ? `
      <article class="int-card is-coming">
        <div class="int-card-top">
          <span class="int-logo">${INT_ICONS.gitforge}</span>
          <div class="int-head">
            <h3 class="int-title"><button type="button" class="int-card-hit" data-int-cli-hint aria-label="${esc(INT_CLI_HINT_CARD.name)}">${esc(INT_CLI_HINT_CARD.name)}</button></h3>
            <p class="int-sub">${esc(INT_CLI_HINT_CARD.subtitle)}</p>
          </div>
          <span class="int-coming-pill">可插拔</span>
        </div>
        <p class="int-desc">${esc(INT_CLI_HINT_CARD.description)}</p>
        <div class="int-foot">
          <span class="int-status is-unconfigured">
            <span class="sdot unconfigured" aria-hidden="true"></span>
            <span class="int-status-txt"><span class="int-state-lbl">未发现插件</span> · ~/.collie/providers/</span>
          </span>
          <span class="int-act" aria-hidden="true">说明</span>
        </div>
      </article>` : "");

    return `<div class="int-intro-row">
        <span class="int-summary-stat">${esc(summaryText)}</span>
      </div>
      <section class="int-grid" aria-label="可用接入">${cards}</section>
      <details class="adv-fold" id="int-adv-fold">
        <summary>
          <span class="adv-sum-title">自定义通知与本地脚本（高级）</span>
          <span class="adv-sum-desc">单向群机器人推送 · 本地脚本触发入口 · 旧版 lark-cli 兜底</span>
          <span class="adv-sum-right">${advPill}</span>
        </summary>
        <div class="adv-inner">
          <div class="adv-block">
            <div class="adv-block-head">
              <span class="adv-block-title">通用单向推送地址</span>
              <button type="button" class="btn small" data-int-adv-save>保存地址</button>
            </div>
            <p class="adv-block-hint">把 Collie 的提醒推送到任意群机器人或通知地址；你正在浏览 Collie 网页时自动静默。</p>
            <div class="adv-url-row">
              <input id="int-adv-webhook" type="url" value="${esc(notify.notify_webhook || "")}" placeholder="https://open.feishu.cn/open-apis/bot/v2/hook/…" autocomplete="off" spellcheck="false">
              <button type="button" class="btn small" data-int-adv-test>发送测试提醒</button>
            </div>
          </div>
          <div class="adv-block">
            <span class="adv-block-title">本地脚本事件入口</span>
            <p class="adv-block-hint">给本地 CI、定时脚本或监控工具向 Collie 推送事件，带上密钥直接 POST JSON 即可。</p>
            <div class="int-code-line">
              <span id="int-local-hook-url">${esc(hookURL)}</span>
              <button type="button" class="btn ghost small" data-copy="${esc(hookURL)}">复制</button>
            </div>
          </div>
          <div class="adv-block">
            <div class="int-toggle-row">
              <div class="tl">
                <b>保留本机 lark-cli 单向提醒作为兜底</b>
                <small>仅在未启用上方「飞书机器人」长连接时生效，启用长连接后会自动接管双向卡片推送。<span id="int-adv-lark-who"></span></small>
              </div>
              <button type="button" class="switch" role="switch" aria-checked="${notify.notify_lark ? "true" : "false"}" aria-label="保留本机 lark-cli 兜底" data-int-adv-lark></button>
            </div>
          </div>
        </div>
      </details>`;
  }

  function stopOnboardTimers() {
    clearInterval(intOnboardPollTimer);
    intOnboardPollTimer = null;
    clearInterval(intOnboardTickTimer);
    intOnboardTickTimer = null;
  }

  function formatOnboardRemaining(sec) {
    const s = Math.max(0, Math.floor(Number(sec) || 0));
    const m = Math.floor(s / 60), r = s % 60;
    return m > 0 ? `${m} 分 ${String(r).padStart(2, "0")} 秒` : `${r} 秒`;
  }

  function onboardRemainingSec(d) {
    if (!d) return 0;
    if (d.onboardDeadlineMs > 0) return Math.max(0, Math.ceil((d.onboardDeadlineMs - Date.now()) / 1000));
    return Math.max(0, Number(d.onboard?.remaining_sec) || 0);
  }

  async function refreshFeishuModalHealth() {
    if (!intModal?.open || intModalKind !== "feishu" || !intModalDraft) return;
    try {
      const r = await api("/api/super/integrations");
      if (!intModal?.open || intModalKind !== "feishu" || !intModalDraft) return;
      intPayload = r;
      const item = (r.integrations || []).find((x) => x.kind === "feishu");
      if (!item) return;
      intModalDraft.health = item.health || intModalDraft.health;
      const st = intEffectiveState({
        configured: !!intModalDraft.app_id && (intModalDraft.secret_set || !!intModalDraft.app_secret),
        enabled: intModalDraft.enabled,
        health: intModalDraft.health,
      });
      const stEl = $("#int-modal-state");
      if (stEl) stEl.innerHTML = `<span class="sdot ${esc(st)}" aria-hidden="true"></span><span>${esc(INT_STATUS_TEXT[st] || st)}</span>`;
    } catch {}
  }

  const intModal = $("#int-modal");
  async function closeIntModal(reason = "cancel") {
    if (!intModal?.open || intModal.hasAttribute("data-closing")) return;
    clearInterval(intPairTimer);
    intPairTimer = null;
    stopOnboardTimers();
    if (!supportsTopLayerExit()) {
      intModal.setAttribute("data-closing", "");
      const anims = intModal.getAnimations({ subtree: true });
      if (anims.length) {
        await Promise.race([
          Promise.allSettled(anims.map((a) => a.finished)),
          new Promise((r) => setTimeout(r, 240)),
        ]);
      }
      if (!intModal.hasAttribute("data-closing")) return;
      intModal.removeAttribute("data-closing");
    }
    if (intModal.open) intModal.close(reason);
  }
  if (intModal) {
    $("#int-modal-close")?.addEventListener("click", () => closeIntModal("cancel"));
    if (!("closedBy" in HTMLDialogElement.prototype)) {
      let pressedOutside = false;
      const outside = (ev) => {
        const r = intModal.getBoundingClientRect();
        return ev.clientX < r.left || ev.clientX > r.right || ev.clientY < r.top || ev.clientY > r.bottom;
      };
      intModal.addEventListener("pointerdown", (ev) => { pressedOutside = ev.target === intModal && outside(ev); });
      intModal.addEventListener("pointerup", (ev) => { if (pressedOutside && outside(ev)) closeIntModal("cancel"); pressedOutside = false; });
    }
    intModal.addEventListener("cancel", (ev) => {
      if (!supportsTopLayerExit()) {
        ev.preventDefault();
        closeIntModal("cancel");
      }
    });
    intModal.addEventListener("close", () => {
      clearInterval(intPairTimer);
      intPairTimer = null;
      stopOnboardTimers();
      intModal.returnValue = "";
      intModal.removeAttribute("data-closing");
      intModalKind = null;
      intModalDraft = null;
    });
  }

  function openIntModal(kind) {
    const item = (intPayload?.integrations || []).find((x) => x.kind === kind);
    if (!item || !intModal) return;
    intModalKind = kind;
    const cfg = item.config || {};
    if (kind === "feishu") {
      intModalDraft = {
        kind,
        configured: !!item.configured,
        region: cfg.region || "cn",
        app_id: cfg.app_id || "",
        app_secret: "",
        secret_set: !!item.secret_set,
        allow_open_id: cfg.allow_open_id || (Array.isArray(cfg.allow_open_ids) ? cfg.allow_open_ids.join(", ") : ""),
        feedback_chat_ids: cfg.feedback_chat_id || (Array.isArray(cfg.feedback_chat_ids) ? cfg.feedback_chat_ids.join(", ") : ""),
        group_mention_only: cfg.group_mention_only !== false,
        instant_chat_sync: cfg.instant_chat_sync !== false,
        enabled: !!item.enabled,
        health: item.health || { state: "unconfigured" },
        pairing: item.extra?.pairing || { active: false },
        onboardMode: "create",
        onboardClientId: "",
        onboardStarting: false,
        onboard: null,
        onboardDeadlineMs: 0,
        onboardDoneTitle: "",
        onboardDoneMsg: "",
        manualOpen: false,
        testState: null,
        testMsg: "",
        saving: false,
      };
      renderIntModal(item);
      if (!intModal.open) intModal.showModal();
      $("#int-modal-body").scrollTop = 0;
      if (intModalDraft.pairing?.active) startPairPoll();
      syncFeishuOnboardOnOpen(item);
      return;
    }

    const extra = item.extra || {};
    const termPR = extra.term_pr || (kind === "github" ? "PR" : "MR");
    const defaultEvents = termPR === "MR" ? { mr: true, mention: true, ci: true } : { pr: true, issue: true, ci: true };
    const evs = cfg.events && Object.keys(cfg.events).length ? { ...defaultEvents, ...cfg.events } : defaultEvents;
    intModalDraft = {
      kind,
      engine: "gitforge",
      termPR,
      configured: !!item.configured,
      enabled: !!item.enabled,
      secret_set: !!item.secret_set,
      health: item.health || { state: "unconfigured" },
      extra,
      auth_mode: cfg.auth_mode || (extra.supports_gh ? "gh" : "cli"),
      pat: "",
      watch_mentions: cfg.watch_mentions !== false,
      repos: Array.isArray(cfg.repos) ? [...cfg.repos] : [],
      events: evs,
      handle_mode: cfg.handle_mode || "advise",
      probeState: null,
      probe: null,
      testState: null,
      testMsg: "",
      samples: null,
      saving: false,
    };
    renderIntModal(item);
    if (!intModal.open) intModal.showModal();
    $("#int-modal-body").scrollTop = 0;
    if (intModalDraft.auth_mode !== "pat") runForgeProbe(item);
  }

  function startPairPoll() {
    clearInterval(intPairTimer);
    intPairTimer = setInterval(async () => {
      if (!intModal?.open || intModalKind !== "feishu" || !intModalDraft) {
        clearInterval(intPairTimer);
        intPairTimer = null;
        return;
      }
      try {
        const r = await api("/api/super/integrations");
        intPayload = r;
        const item = (r.integrations || []).find((x) => x.kind === "feishu");
        if (!item) return;
        const pairing = item.extra?.pairing || { active: false };
        intModalDraft.pairing = pairing;
        intModalDraft.health = item.health || intModalDraft.health;
        if (pairing.captured_open_id) {
          intModalDraft.allow_open_id = item.config?.allow_open_id || pairing.captured_open_id;
          clearInterval(intPairTimer);
          intPairTimer = null;
          toast("已自动捕获并锁定你的飞书 OpenID");
          if (view === "auto" && autoTab === "integrations") loadAuto();
        } else if (!pairing.active) {
          clearInterval(intPairTimer);
          intPairTimer = null;
        }
        renderIntModal(item);
      } catch {}
    }, 2000);
  }

  async function runForgeProbe(item) {
    if (!intModalDraft || intModalKind !== item.kind) return;
    const d = intModalDraft;
    d.probeState = "probing";
    renderIntModal(item);
    try {
      const body = {
        config: { auth_mode: d.auth_mode, watch_mentions: d.watch_mentions, repos: d.repos, events: d.events, handle_mode: d.handle_mode },
      };
      if (d.pat.trim()) body.secrets = { pat: d.pat.trim() };
      const res = await api(`/api/super/integrations/${encodeURIComponent(item.kind)}/probe`, { body });
      if (!intModal?.open || intModalKind !== item.kind || !intModalDraft) return;
      d.probeState = res.ready ? "ok" : "err";
      d.probe = res;
      renderIntModal(item);
    } catch (err) {
      if (!intModal?.open || intModalKind !== item.kind || !intModalDraft) return;
      d.probeState = "err";
      d.probe = { ready: false, problem: err.message };
      renderIntModal(item);
    }
  }

  function forgeModeActionPreview(mode, sample, termPR) {
    if (sample.action && mode === sample._mode) return sample.action;
    const k = sample.kind || "pr";
    if (mode === "notify") {
      if (k === "ci") return "按当前模式：仅推送失败摘要和直达链接，不唤醒 Collie";
      if (k === "issue" || k === "mention") return "按当前模式：仅把评论/讨论摘要提醒你，不唤醒 Collie";
      return `按当前模式：仅把 ${termPR} 摘要发给你，不唤醒 Collie`;
    }
    if (mode === "agent") {
      return `按当前模式：若已有 Agent 订阅该 ${termPR} 则直接投递继续修；否则自动转交 Collie 先只读调研汇报`;
    }
    if (k === "ci") return "按当前模式：Collie 自动拉取失败日志定位原因，给修复拍板选项（不擅自修改远端）";
    if (k === "issue" || k === "mention") return "按当前模式：Collie 结合上下文调研并拟好建议选项，严禁擅自评论";
    return `按当前模式：Collie 自动调研 ${termPR} 改动与评审意见并给拍板选项，严禁擅自评论或合并`;
  }

  function renderIntModal(item) {
    if (!intModal || !intModalDraft) return;
    if (intModalDraft.kind === "feishu") {
      renderFeishuIntModal(item);
    } else {
      renderGitForgeIntModal(item);
    }
  }

  async function syncFeishuOnboardOnOpen(item) {
    try {
      const res = await api("/api/super/integrations/feishu/onboard");
      if (!intModal?.open || intModalKind !== "feishu" || !intModalDraft) return;
      if (res && (res.state === "waiting" || res.state === "domain_switched")) {
        intModalDraft.onboard = res;
        intModalDraft.onboardDeadlineMs = Date.now() + Math.max(0, Number(res.remaining_sec) || 0) * 1000;
        if (res.region) intModalDraft.region = res.region;
        if (res.mode === "existing" || res.mode === "create") intModalDraft.onboardMode = res.mode;
        renderIntModal(item);
        startOnboardPoll(item);
      }
    } catch {}
  }

  function startOnboardPoll(item) {
    stopOnboardTimers();
    intOnboardTickTimer = setInterval(() => {
      if (!intModal?.open || intModalKind !== "feishu" || !intModalDraft) {
        stopOnboardTimers();
        return;
      }
      const cd = $("#fs-ob-countdown");
      if (cd) cd.textContent = formatOnboardRemaining(onboardRemainingSec(intModalDraft));
    }, 1000);
    intOnboardPollTimer = setInterval(async () => {
      if (!intModal?.open || intModalKind !== "feishu" || !intModalDraft) {
        stopOnboardTimers();
        return;
      }
      const d = intModalDraft;
      try {
        const res = await api("/api/super/integrations/feishu/onboard");
        if (!intModal?.open || intModalKind !== "feishu" || intModalDraft !== d) return;
        const st = res?.state || "idle";
        if (st === "waiting" || st === "domain_switched") {
          const prevSt = d.onboard?.state;
          const prevRegion = d.onboard?.region;
          d.onboard = res;
          d.onboardDeadlineMs = Date.now() + Math.max(0, Number(res.remaining_sec) || 0) * 1000;
          if (res.region) d.region = res.region;
          if (st !== prevSt || res.region !== prevRegion) {
            renderIntModal(item);
          } else {
            const cd = $("#fs-ob-countdown");
            if (cd) cd.textContent = formatOnboardRemaining(onboardRemainingSec(d));
          }
          return;
        }
        stopOnboardTimers();
        if (st === "completed") {
          const wasExisting = res.mode === "existing" || d.configured;
          d.onboard = null;
          d.onboardDeadlineMs = 0;
          try {
            const r = await api("/api/super/integrations");
            intPayload = r;
            const fresh = (r.integrations || []).find((x) => x.kind === "feishu") || item;
            const fc = fresh.config || {};
            d.configured = !!fresh.configured;
            d.secret_set = !!fresh.secret_set;
            d.enabled = !!fresh.enabled;
            d.region = fc.region || res.region || d.region;
            d.app_id = fc.app_id || res.app_id || d.app_id;
            d.app_secret = "";
            d.allow_open_id = fc.allow_open_id || (Array.isArray(fc.allow_open_ids) ? fc.allow_open_ids.join(", ") : (res.open_id || d.allow_open_id));
            d.feedback_chat_ids = fc.feedback_chat_id || (Array.isArray(fc.feedback_chat_ids) ? fc.feedback_chat_ids.join(", ") : d.feedback_chat_ids);
            d.health = fresh.health || d.health;
            d.onboardDoneTitle = wasExisting ? "已完成已有应用的权限与双长连接补齐" : "已完成飞书机器人创建与长连接接入";
            d.onboardDoneMsg = "凭据已按 0600 权限安全保存并自动拉起长连接，可点下方「测试连通 · 发验证卡片」校验；若企业开启应用发布审批，待管理员通过后即可收发消息。";
            renderIntModal(fresh);
            $("#int-modal-body").scrollTop = 0;
            toast(wasExisting ? "已补齐飞书应用权限并重载长连接" : "飞书机器人已自动配置并启动长连接");
            if (view === "auto" && autoTab === "integrations") loadAuto();
          } catch {
            d.configured = true;
            d.secret_set = true;
            d.enabled = true;
            if (res.app_id) d.app_id = res.app_id;
            if (res.region) d.region = res.region;
            if (res.open_id && !d.allow_open_id) d.allow_open_id = res.open_id;
            d.onboardDoneTitle = wasExisting ? "已完成已有应用的权限与双长连接补齐" : "已完成飞书机器人创建与长连接接入";
            d.onboardDoneMsg = "凭据已安全保存并自动拉起长连接，可点击下方「测试连通 · 发验证卡片」校验。";
            renderIntModal(item);
          }
          return;
        }
        d.onboard = st === "idle" ? null : res;
        d.onboardDeadlineMs = 0;
        renderIntModal(item);
      } catch {}
    }, 2000);
  }

  function renderFeishuIntModal(item) {
    const d = intModalDraft;
    const isConfigured = !!(d.configured || d.secret_set || item?.configured || item?.secret_set);
    const st = intEffectiveState({ configured: !!d.app_id && (d.secret_set || !!d.app_secret), enabled: d.enabled, health: d.health });
    const ob = d.onboard;
    const isObWaiting = !!(ob && (ob.state === "waiting" || ob.state === "domain_switched"));
    const isObTerminalErr = !!(ob && (ob.state === "denied" || ob.state === "expired" || ob.state === "error"));

    $("#int-modal-icon").innerHTML = INT_ICONS[d.kind] || INT_ICONS.gitforge;
    $("#int-modal-title").textContent = item?.name || "飞书机器人";
    $("#int-modal-sub").textContent = item?.subtitle || "长连接双向对话 · 零公网门槛";
    $("#int-modal-state").innerHTML = `<span class="sdot ${esc(st)}" aria-hidden="true"></span><span>${esc(INT_STATUS_TEXT[st] || st)}</span>`;

    const testRow = () => {
      if (d.testState === "testing") {
        return `<span class="int-test-status" role="status"><span class="int-spinner" aria-hidden="true"></span><span>正在校验应用凭据并尝试发送验证卡片…</span></span>`;
      }
      if (d.testState === "ok") {
        return `<span class="int-test-status ok" role="status"><svg viewBox="0 0 24 24" style="width:15px;height:15px" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg><span>${esc(d.testMsg)}</span></span>`;
      }
      if (d.testState === "err") {
        return `<span class="int-test-status err" role="status">${esc(d.testMsg)}</span>`;
      }
      return `<span class="int-test-status muted">不会写入正式对话或唤醒 Collie</span>`;
    };

    const pairBanner = d.pairing?.active ? `
      <div class="int-pair-box" role="status">
        <span>等待私信配对中（剩余约 ${Math.max(1, d.pairing.remaining_sec || 120)} 秒）：请用飞书给机器人发任意一条私信，系统将自动锁定你的 OpenID。</span>
        <button type="button" class="btn ghost small" id="fs-pair-cancel">取消</button>
      </div>` : "";

    const renderOnboardWaiting = () => {
      if (!isObWaiting) return "";
      const safeHref = /^https:\/\//i.test(ob.url || "") ? ob.url : "";
      const safeQR = /^(data:image\/(?:png|svg\+xml);base64,|demo-qr\.png)/i.test(ob.qr_data_url || "") ? ob.qr_data_url : "";
      const isExisting = ob.mode === "existing";
      const targetHint = isExisting
        ? (ob.client_id ? `确认页已自动定位应用 <code>${esc(ob.client_id)}</code>，点确认即可一键补齐最小 IM 权限与事件/卡片双长连接。` : "在确认页选择你的已有飞书应用并确认，将自动补齐最小 IM 权限与事件/卡片双长连接。")
        : "用飞书 App 扫码或在浏览器打开确认页，点「创建」即可自动配好机器人、双长连接与白名单。";
      const statusText = ob.state === "domain_switched"
        ? (ob.region === "intl"
          ? "检测到海外 Lark 账号，已自动切至 Lark 域等待确认（剩余 "
          : "检测到国内飞书账号，已自动切至飞书域等待确认（剩余 ")
        : (isExisting ? "等待你在飞书中确认补齐（剩余 " : "等待你在飞书中确认创建（剩余 ");
      return `
        <div class="int-onboard-wait">
          <div class="int-onboard-qr-row">
            ${safeQR ? `<div class="int-qr-frame"><img src="${esc(safeQR)}" alt="飞书一键确认二维码" width="144" height="144"></div>` : ""}
            <div class="int-onboard-actions">
              <p class="int-onboard-guide">${targetHint}</p>
              <div class="int-onboard-btns">
                ${safeHref ? `<a class="btn primary int-ob-open" href="${esc(safeHref)}" target="_blank" rel="noopener noreferrer">在浏览器打开确认页 ↗</a>` : ""}
                ${safeHref ? `
                  <span class="int-copy-wrap">
                    <button type="button" class="btn int-copy-btn" command="--copy" commandfor="fs-ob-url-src">复制确认链接</button>
                    <span class="int-copy-tip" role="status"></span>
                  </span>
                  <span id="fs-ob-url-src" class="sr-only">${esc(safeHref)}</span>` : ""}
              </div>
              ${ob.user_code ? `<p class="int-onboard-code">确认码：<code>${esc(ob.user_code)}</code></p>` : ""}
            </div>
          </div>
          <div class="int-onboard-status${ob.state === "domain_switched" ? " is-switched" : ""}" role="status">
            <span class="int-spinner" aria-hidden="true"></span>
            <span class="int-onboard-status-txt">${statusText}<span id="fs-ob-countdown" class="tnum">${esc(formatOnboardRemaining(onboardRemainingSec(d)))}</span>）…</span>
            <button type="button" class="btn ghost small" id="fs-ob-cancel-btn">取消</button>
          </div>
        </div>`;
    };

    const renderOnboardTerminal = () => {
      if (!isObTerminalErr) return "";
      const fallbackMsg = ob.state === "denied"
        ? "你已取消本次飞书授权确认，可随时重新发起。"
        : ob.state === "expired"
          ? "确认二维码已过期，请重新生成。"
          : "一键开通未完成，请重试或改用手动填写。";
      return `
        <div class="int-onboard-err" role="status">
          <span class="sdot error" aria-hidden="true"></span>
          <span class="int-onboard-err-txt">${esc(ob.error || fallbackMsg)}</span>
          <button type="button" class="btn ghost small" id="fs-ob-retry-btn">重新生成</button>
        </div>`;
    };

    const credentialsFieldsHTML = (includeRegion = true) => `
      ${includeRegion ? `
        <div class="int-field">
          <span class="int-field-label">平台区域</span>
          <div class="seg" role="group" aria-label="平台区域">
            <button type="button" class="${d.region === "cn" ? "on" : ""}" data-fs-region="cn">国内飞书</button>
            <button type="button" class="${d.region === "intl" ? "on" : ""}" data-fs-region="intl">海外 Lark</button>
          </div>
        </div>` : ""}
      <div class="int-field">
        <label class="int-field-label" for="fs-app-id">App ID</label>
        <input id="fs-app-id" value="${esc(d.app_id)}" placeholder="cli_xxxxxxxxxxxx" autocomplete="off" autocorrect="off" autocapitalize="none" spellcheck="false">
      </div>
      <div class="int-field">
        <label class="int-field-label" for="fs-app-secret">App Secret <span class="opt">${d.secret_set ? "已安全保存在本机" : "必填"}</span></label>
        <input id="fs-app-secret" type="password" value="${esc(d.app_secret)}" placeholder="${d.secret_set ? "已保存在本机 secrets.json（留空则保持不变）" : "粘贴应用的 App Secret"}" autocomplete="new-password">
        <p class="int-field-help">凭据以 <code>0600</code> 权限单独落盘，界面、接口与日志永不回显明文。</p>
      </div>`;

    const allowlistFieldsHTML = `
      <div class="int-field">
        <label class="int-field-label" for="fs-openid">允许对话的本人 OpenID <span class="opt">强烈建议</span></label>
        <div class="int-input-row has-multi">
          <input id="fs-openid" value="${esc(d.allow_open_id)}" placeholder="ou_xxxxxxxxxxxx，多个逗号隔开" autocomplete="off" autocorrect="off" autocapitalize="none" spellcheck="false">
          <button type="button" class="btn small" id="fs-detect-id" title="从本机 lark-cli 读取当前登录账号">自动填入</button>
          <button type="button" class="btn small" id="fs-pair-btn" ${d.pairing?.active ? "disabled" : ""} title="给机器人发一条私信自动抓拍锁定">私信配对</button>
        </div>
        ${pairBanner}
        <p class="int-field-help">仅白名单账号可唤醒 Collie 与点击卡片拍板按钮，防止他人借机器人操作你的电脑。</p>
      </div>
      <div class="int-field">
        <label class="int-field-label" for="fs-feedback-chats">只读反馈监听群 Chat ID <span class="opt">可选</span></label>
        <textarea id="fs-feedback-chats" name="feedback_chat_ids" rows="2" placeholder="oc_xxxxxxxxxxxx，多个逗号或换行隔开" aria-describedby="fs-feedback-help" autocomplete="off" autocorrect="off" autocapitalize="none" spellcheck="false">${esc(d.feedback_chat_ids)}</textarea>
        <p class="int-field-help" id="fs-feedback-help">仅在群内 @Collie 时以只读建议送入主会话，不响应普通闲聊、不授予执行权限。</p>
      </div>
      <div class="int-toggle-row">
        <div class="tl">
          <b>群聊中仅响应 @Collie</b>
          <small>私信默认直接回复；拉进群后只有 @机器人 才会触发，不打扰群聊。</small>
        </div>
        <button type="button" class="switch" id="fs-mention-sw" role="switch" aria-checked="${d.group_mention_only ? "true" : "false"}" aria-label="群聊中仅响应 @Collie"></button>
      </div>
      <div class="int-toggle-row">
        <div class="tl">
          <b>飞书对话立即同步卡片</b>
          <small>从飞书发出的消息会立刻回传交互卡片，不受「网页在线静默」限制。</small>
        </div>
        <button type="button" class="switch" id="fs-sync-sw" role="switch" aria-checked="${d.instant_chat_sync ? "true" : "false"}" aria-label="飞书对话立即同步卡片"></button>
      </div>`;

    if (!isConfigured) {
      $("#int-modal-body").innerHTML = `
        ${st === "error" && d.health?.last_error ? `
          <div class="int-modal-alert" role="alert">
            <span class="sdot error" aria-hidden="true"></span>
            <div><strong>连接异常：</strong>${esc(d.health.last_error)}</div>
          </div>` : ""}

        <section class="int-onboard-card" aria-label="飞书一键开通向导">
          <div class="int-onboard-head">
            <div class="int-onboard-title-row">
              <span class="int-onboard-title">一键接入飞书机器人</span>
              <span class="int-onboard-badge">推荐</span>
            </div>
            <p class="int-onboard-desc">扫码或在浏览器确认，自动完成创建或绑定应用、开启机器人、配置最小消息权限、启用事件与卡片双长连接，并自动锁定你的安全白名单。</p>
          </div>

          ${isObWaiting ? renderOnboardWaiting() : `
            <div class="int-onboard-opts">
              <div class="int-onboard-row">
                <div class="int-field">
                  <span class="int-field-label">平台区域</span>
                  <div class="seg" role="group" aria-label="平台区域">
                    <button type="button" class="${d.region === "cn" ? "on" : ""}" data-fs-region="cn">国内飞书</button>
                    <button type="button" class="${d.region === "intl" ? "on" : ""}" data-fs-region="intl">海外 Lark</button>
                  </div>
                </div>
                <div class="int-field">
                  <span class="int-field-label">开通方式</span>
                  <div class="seg" role="group" aria-label="飞书开通方式">
                    <button type="button" class="${d.onboardMode === "create" ? "on" : ""}" data-fs-ob-mode="create">新建应用</button>
                    <button type="button" class="${d.onboardMode === "existing" ? "on" : ""}" data-fs-ob-mode="existing">绑定已有应用</button>
                  </div>
                </div>
              </div>
              ${d.onboardMode === "existing" ? `
                <div class="int-field">
                  <label class="int-field-label" for="fs-ob-client-id">已有应用 App ID <span class="opt">可选</span></label>
                  <input id="fs-ob-client-id" value="${esc(d.onboardClientId)}" placeholder="留空可在飞书确认页直接选择已有应用，或填入 cli_…" autocomplete="off" autocorrect="off" autocapitalize="none" spellcheck="false">
                </div>` : ""}
              <div class="int-onboard-cta">
                <button type="button" class="btn primary" id="fs-ob-start-btn" ${d.onboardStarting ? "disabled" : ""}>
                  ${d.onboardStarting ? "正在生成确认码…" : (d.onboardMode === "existing" ? "一键绑定并补齐权限" : "一键开通飞书")}
                </button>
                <span class="int-onboard-hint">零公网地址 · 自动配好双长连接与白名单</span>
              </div>
              ${renderOnboardTerminal()}
            </div>`}
        </section>

        <details class="int-manual-fold" id="fs-manual-fold" ${d.manualOpen ? "open" : ""}>
          <summary>
            <span class="int-manual-title">手动填写 App ID / App Secret</span>
            <span class="int-manual-hint">已有凭据或受限租户兜底</span>
          </summary>
          <div class="int-manual-body">
            <div class="int-sec">
              ${credentialsFieldsHTML(false)}
            </div>
            <div class="int-sec">
              <div class="int-sec-title">安全白名单与对话方式</div>
              ${allowlistFieldsHTML}
            </div>
            <div class="int-sec">
              <div class="int-sec-title">连通自检</div>
              <div class="int-test-box">
                <div class="int-test-head">
                  <button type="button" class="btn" id="fs-test-btn" ${d.testState === "testing" ? "disabled" : ""}>测试连通 · 发验证卡片</button>
                  ${testRow()}
                </div>
              </div>
            </div>
          </div>
        </details>
      `;
    } else {
      $("#int-modal-body").innerHTML = `
        ${st === "error" && d.health?.last_error ? `
          <div class="int-modal-alert" role="alert">
            <span class="sdot error" aria-hidden="true"></span>
            <div><strong>连接异常：</strong>${esc(d.health.last_error)}</div>
          </div>` : ""}

        ${d.onboardDoneMsg ? `
          <div class="int-onboard-done" role="status">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>
            <div>
              <strong>${esc(d.onboardDoneTitle || "已完成飞书接入")}</strong>
              <p>${esc(d.onboardDoneMsg)}</p>
            </div>
          </div>` : ""}

        <section class="int-sec">
          <h3 class="int-sec-title">应用凭据（主动出站长连接，无需公网地址）</h3>
          ${credentialsFieldsHTML(true)}
        </section>

        <section class="int-sec">
          <h3 class="int-sec-title">安全白名单与对话方式</h3>
          ${allowlistFieldsHTML}
        </section>

        <section class="int-sec">
          <h3 class="int-sec-title">连通自检与一键补齐</h3>
          <div class="int-test-box">
            <div class="int-test-head">
              <button type="button" class="btn" id="fs-test-btn" ${d.testState === "testing" ? "disabled" : ""}>测试连通 · 发验证卡片</button>
              <button type="button" class="btn" id="fs-ob-repair-btn" ${d.onboardStarting || isObWaiting ? "disabled" : ""} title="带当前 App ID 唤起飞书确认页，一键补齐最小 IM 权限与事件/卡片双长连接">
                ${d.onboardStarting ? "生成确认码…" : "一键补齐权限/回调"}
              </button>
            </div>
            ${testRow()}
            ${isObWaiting || isObTerminalErr ? `<div class="int-onboard-inline" id="fs-ob-inline">${isObWaiting ? renderOnboardWaiting() : renderOnboardTerminal()}</div>` : ""}
          </div>
        </section>
      `;
    }

    const renderFeishuFoot = () => {
      const showSave = isConfigured || d.manualOpen || !!d.app_id.trim() || !!d.app_secret.trim();
      $("#int-modal-foot").innerHTML = `
        ${isConfigured ? `<button type="button" class="btn ghost small" id="fs-reset-btn" ${d.saving ? "disabled" : ""}>清空配置</button>` : ""}
        <div class="int-sheet-foot-right">
          <button type="button" class="btn" id="fs-cancel-btn">${showSave ? "取消" : "关闭"}</button>
          ${showSave ? `<button type="button" class="btn primary" id="fs-save-btn" ${d.saving ? "disabled" : ""}>${d.saving ? "保存中…" : "保存并应用"}</button>` : ""}
        </div>
      `;
      $("#fs-reset-btn")?.addEventListener("click", handleReset);
      $("#fs-cancel-btn")?.addEventListener("click", () => closeIntModal("cancel"));
      $("#fs-save-btn")?.addEventListener("click", handleSave);
    };

    const splitIDList = (raw) => String(raw || "").split(/[\s,，;；]+/).map((s) => s.trim()).filter(Boolean);
    const draftConfigPayload = () => ({
      region: d.region,
      app_id: d.app_id.trim(),
      allow_open_id: d.allow_open_id.trim(),
      feedback_chat_ids: splitIDList(d.feedback_chat_ids),
      group_mention_only: d.group_mention_only,
      instant_chat_sync: d.instant_chat_sync,
    });
    const draftSecretsPayload = () => {
      const s = {};
      if (d.app_id.trim()) s.app_id = d.app_id.trim();
      if (d.app_secret.trim()) s.app_secret = d.app_secret.trim();
      return s;
    };

    const startOnboardFlow = async (mode, clientID) => {
      d.onboardStarting = true;
      d.onboardDoneMsg = "";
      d.onboardDoneTitle = "";
      d.manualOpen = false;
      renderIntModal(item);
      try {
        const res = await api("/api/super/integrations/feishu/onboard", {
          body: { region: d.region, mode, client_id: clientID || "" },
        });
        if (!intModal?.open || intModalKind !== "feishu" || intModalDraft !== d) return;
        d.onboardStarting = false;
        d.onboard = res;
        d.onboardDeadlineMs = Date.now() + Math.max(0, Number(res.remaining_sec ?? res.expire_in) || 600) * 1000;
        renderIntModal(item);
        startOnboardPoll(item);
        if (isConfigured) {
          $("#fs-ob-inline")?.scrollIntoView({ block: "nearest", behavior: "smooth" });
        }
      } catch (err) {
        if (!intModal?.open || intModalKind !== "feishu" || intModalDraft !== d) return;
        d.onboardStarting = false;
        d.onboard = { state: "error", mode, client_id: clientID || "", error: err.message || "发起飞书一键开通失败" };
        d.onboardDeadlineMs = 0;
        renderIntModal(item);
      }
    };

    intModal.querySelectorAll("[data-fs-region]").forEach((b) => {
      b.addEventListener("click", () => {
        if ($("#fs-manual-fold")) d.manualOpen = !!$("#fs-manual-fold").open;
        d.region = b.dataset.fsRegion;
        renderIntModal(item);
      });
    });
    intModal.querySelectorAll("[data-fs-ob-mode]").forEach((b) => {
      b.addEventListener("click", () => {
        if ($("#fs-manual-fold")) d.manualOpen = !!$("#fs-manual-fold").open;
        d.onboardMode = b.dataset.fsObMode;
        if (isObTerminalErr) d.onboard = null;
        renderIntModal(item);
      });
    });
    $("#fs-ob-client-id")?.addEventListener("input", (ev) => { d.onboardClientId = ev.target.value; });
    $("#fs-ob-start-btn")?.addEventListener("click", () => {
      const cid = d.onboardMode === "existing" ? d.onboardClientId.trim() : "";
      startOnboardFlow(d.onboardMode, cid);
    });
    $("#fs-ob-repair-btn")?.addEventListener("click", () => {
      startOnboardFlow("existing", d.app_id.trim());
    });
    $("#fs-ob-retry-btn")?.addEventListener("click", () => {
      const mode = isConfigured ? "existing" : (d.onboard?.mode || d.onboardMode || "create");
      const cid = isConfigured ? d.app_id.trim() : (mode === "existing" ? (d.onboard?.client_id || d.onboardClientId.trim()) : "");
      startOnboardFlow(mode, cid);
    });
    $("#fs-ob-cancel-btn")?.addEventListener("click", async () => {
      stopOnboardTimers();
      try {
        await api("/api/super/integrations/feishu/onboard", { method: "DELETE" });
      } catch {}
      if (!intModal?.open || intModalKind !== "feishu" || intModalDraft !== d) return;
      d.onboard = null;
      d.onboardDeadlineMs = 0;
      renderIntModal(item);
    });
    $("#fs-manual-fold")?.addEventListener("toggle", (ev) => {
      d.manualOpen = !!ev.target.open;
      if (!isConfigured) renderFeishuFoot();
    });

    $("#fs-app-id")?.addEventListener("input", (ev) => { d.app_id = ev.target.value; });
    $("#fs-app-secret")?.addEventListener("input", (ev) => { d.app_secret = ev.target.value; });
    $("#fs-openid")?.addEventListener("input", (ev) => { d.allow_open_id = ev.target.value; });
    $("#fs-feedback-chats")?.addEventListener("input", (ev) => { d.feedback_chat_ids = ev.target.value; });
    $("#fs-mention-sw")?.addEventListener("click", () => { d.group_mention_only = !d.group_mention_only; renderIntModal(item); });
    $("#fs-sync-sw")?.addEventListener("click", () => { d.instant_chat_sync = !d.instant_chat_sync; renderIntModal(item); });

    $("#fs-detect-id")?.addEventListener("click", async () => {
      try {
        const res = await api("/api/super/integrations/feishu/probe");
        if (res.ready && res.open_id) {
          d.allow_open_id = res.open_id;
          const inp = $("#fs-openid");
          if (inp) inp.value = d.allow_open_id;
          toast(`已识别本机飞书账号${res.who ? `（${res.who}）` : ""}并填入`);
        } else {
          toast(res.problem || "未检测到本机 lark-cli 登录账号，可使用「私信配对」", "attn");
        }
      } catch (err) { toast(err.message, "attn"); }
    });

    $("#fs-pair-btn")?.addEventListener("click", async () => {
      try {
        const res = await api("/api/super/integrations/feishu/pair", { body: {} });
        d.pairing = { active: true, remaining_sec: 120 };
        renderIntModal(item);
        startPairPoll();
        toast(res.message || "已开启 2 分钟私信配对");
      } catch (err) { toast(err.message, "attn"); }
    });
    $("#fs-pair-cancel")?.addEventListener("click", async () => {
      try {
        await api("/api/super/integrations/feishu/pair", { body: { cancel: true } });
        d.pairing = { active: false };
        clearInterval(intPairTimer);
        intPairTimer = null;
        renderIntModal(item);
      } catch (err) { toast(err.message, "attn"); }
    });

    $("#fs-test-btn")?.addEventListener("click", async () => {
      if (!d.app_id.trim() || (!d.secret_set && !d.app_secret.trim())) {
        d.testState = "err";
        d.testMsg = "请先填写 App ID 和 App Secret 再测试连通";
        renderIntModal(item);
        return;
      }
      d.testState = "testing";
      d.testMsg = "";
      renderIntModal(item);
      try {
        const res = await api("/api/super/integrations/feishu/test", {
          body: { config: draftConfigPayload(), secrets: draftSecretsPayload() },
        });
        if (!intModal.open || intModalKind !== "feishu") return;
        d.testState = res.ok ? "ok" : "err";
        d.testMsg = res.message || (res.ok ? "测试连通成功" : "测试失败");
        renderIntModal(item);
      } catch (err) {
        if (!intModal.open || intModalKind !== "feishu") return;
        d.testState = "err";
        d.testMsg = err.message;
        renderIntModal(item);
      }
    });

    const handleReset = async () => {
      d.saving = true;
      renderIntModal(item);
      try {
        stopOnboardTimers();
        await api("/api/super/integrations/feishu/onboard", { method: "DELETE" }).catch(() => {});
        await api("/api/super/integrations/feishu", {
          body: {
            enabled: false,
            clear_secret: true,
            config: { region: "cn", app_id: "", allow_open_id: "", feedback_chat_ids: [], group_mention_only: true, instant_chat_sync: true },
          },
        });
        toast("已清空飞书本地配置与凭据");
        await closeIntModal("reset");
        if (view === "auto" && autoTab === "integrations") loadAuto();
      } catch (err) {
        d.saving = false;
        renderIntModal(item);
        toast(err.message, "attn");
      }
    };

    const handleSave = async () => {
      const hasCreds = !!d.app_id.trim() && (d.secret_set || !!d.app_secret.trim());
      d.saving = true;
      renderIntModal(item);
      try {
        await api("/api/super/integrations/feishu", {
          body: {
            enabled: hasCreds,
            config: draftConfigPayload(),
            secrets: draftSecretsPayload(),
          },
        });
        toast(hasCreds ? "飞书长连接配置已保存并热重载" : "配置已保存（补充凭据后自动启用）");
        await closeIntModal("saved");
        if (view === "auto" && autoTab === "integrations") loadAuto();
      } catch (err) {
        d.saving = false;
        renderIntModal(item);
        toast(err.message, "attn");
      }
    };

    renderFeishuFoot();
  }

  function renderGitForgeIntModal(item) {
    const d = intModalDraft;
    const extra = d.extra || {};
    const isGitHub = !!(extra.supports_gh && extra.supports_pat);
    const isConfigured = !!(d.configured || d.secret_set || item?.configured || item?.secret_set);
    const st = intEffectiveState({ configured: isConfigured, enabled: d.enabled, health: d.health });
    const pr = d.termPR || "PR";

    $("#int-modal-icon").innerHTML = INT_ICONS[d.kind] || INT_ICONS.gitforge;
    $("#int-modal-title").textContent = item?.name || d.kind;
    $("#int-modal-sub").textContent = item?.subtitle || "代码托管主动追踪 · 零公网门槛";
    $("#int-modal-state").innerHTML = `<span class="sdot ${esc(st)}" aria-hidden="true"></span><span>${esc(INT_STATUS_TEXT[st] || st)}</span>`;

    const renderProbeBox = () => {
      if (d.probeState === "probing") {
        return `<div class="int-probe-box" role="status"><span class="int-spinner" aria-hidden="true"></span><span class="int-probe-body">正在探测本机登录态…</span></div>`;
      }
      if (d.probeState === "ok" && d.probe?.ready) {
        const who = d.probe.user ? `<strong>@${esc(d.probe.user)}</strong>` : "已登录";
        const cliTag = extra.cli_label ? `（${esc(extra.cli_label)}）` : "";
        return `<div class="int-probe-box" role="status">
          <span class="sdot connected" aria-hidden="true"></span>
          <span class="int-probe-body">已检测到本机账号 ${who}${cliTag}，自动复用登录态，Collie 自身不落盘明文令牌。</span>
          <button type="button" class="btn ghost small" id="gf-reprobe-btn">重测</button>
        </div>`;
      }
      if (d.probeState === "err") {
        return `<div class="int-probe-box" role="status">
          <span class="sdot error" aria-hidden="true"></span>
          <span class="int-probe-body">${esc(d.probe?.problem || "未检测到本机登录态")}</span>
          <button type="button" class="btn ghost small" id="gf-reprobe-btn">重试</button>
        </div>`;
      }
      return `<div class="int-probe-box">
        <span class="sdot unconfigured" aria-hidden="true"></span>
        <span class="int-probe-body">点击检测本机 CLI 登录态，自动复用现有凭据。</span>
        <button type="button" class="btn ghost small" id="gf-reprobe-btn">检测</button>
      </div>`;
    };

    const authSection = isGitHub ? `
      <section class="int-sec">
        <h3 class="int-sec-title">认证方式（主动条件轮询，无需公网地址）</h3>
        <div class="int-field">
          <span class="int-field-label">令牌来源</span>
          <div class="seg" role="group" aria-label="GitHub 认证方式">
            <button type="button" class="${d.auth_mode === "gh" ? "on" : ""}" data-gf-auth="gh">复用本机 gh 登录</button>
            <button type="button" class="${d.auth_mode === "pat" ? "on" : ""}" data-gf-auth="pat">个人令牌（PAT）</button>
          </div>
        </div>
        ${d.auth_mode === "gh" ? renderProbeBox() : `
          <div class="int-field">
            <label class="int-field-label" for="gf-pat">Fine-grained PAT <span class="opt">${d.secret_set ? "已安全保存在本机" : "必填"}</span></label>
            <input id="gf-pat" type="password" value="${esc(d.pat)}" placeholder="${d.secret_set ? "已保存在本机 secrets.json（留空则保持不变）" : "粘贴只读 Fine-grained PAT"}" autocomplete="new-password">
            <p class="int-field-help">只需勾选 Notifications、Pull requests、Issues、Actions 只读权限，以 <code>0600</code> 权限单独落盘。</p>
          </div>`}
      </section>` : `
      <section class="int-sec">
        <h3 class="int-sec-title">本机 CLI 连接（声明式插件加载，无需公网地址）</h3>
        ${renderProbeBox()}
        ${extra.provider_path ? `<p class="int-field-help">插件声明位置：<code>${esc(extra.provider_path)}</code></p>` : ""}
      </section>`;

    const suggested = Array.isArray(d.probe?.repos)
      ? d.probe.repos.filter((r) => r && !d.repos.includes(r)).slice(0, 4)
      : [];

    const eventCheckboxes = pr === "MR" ? `
      <label class="int-check-item"><input type="checkbox" data-gf-ev="mr" ${d.events.mr !== false ? "checked" : ""}> 指派给我的 MR 评审</label>
      <label class="int-check-item"><input type="checkbox" data-gf-ev="mention" ${d.events.mention !== false ? "checked" : ""}> 评论 @我</label>
      <label class="int-check-item"><input type="checkbox" data-gf-ev="ci" ${d.events.ci !== false ? "checked" : ""}> 流水线 / CI 失败</label>
    ` : `
      <label class="int-check-item"><input type="checkbox" data-gf-ev="pr" ${d.events.pr !== false ? "checked" : ""}> PR 变更与评审</label>
      <label class="int-check-item"><input type="checkbox" data-gf-ev="issue" ${d.events.issue !== false ? "checked" : ""}> Issue 讨论</label>
      <label class="int-check-item"><input type="checkbox" data-gf-ev="ci" ${d.events.ci !== false ? "checked" : ""}> CI 构建失败</label>
    `;

    const testRow = () => {
      if (d.testState === "testing") {
        return `<span class="int-test-status" role="status"><span class="int-spinner" aria-hidden="true"></span><span>正在校验身份并试拉最近 3 条动态…</span></span>`;
      }
      if (d.testState === "ok") {
        return `<span class="int-test-status ok" role="status"><svg viewBox="0 0 24 24" style="width:15px;height:15px" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg><span>${esc(d.testMsg)}</span></span>`;
      }
      if (d.testState === "err") {
        return `<span class="int-test-status err" role="status">${esc(d.testMsg)}</span>`;
      }
      return `<span class="int-test-status muted">仅只读预览，不推进水位线、不写收件箱也不唤醒 Collie</span>`;
    };

    const sampleHTML = d.samples !== null ? `
      <div class="int-preview-shell" id="gf-preview">
        <div class="int-preview-cap"><span>试拉到的最近 ${d.samples.length} 条命中动态</span><span>只读预览</span></div>
        ${d.samples.length ? `<ul class="int-forge-list">${d.samples.map((ev) => {
          const safeHref = /^https?:\/\//i.test(ev.url || "") ? ev.url : "";
          const titleEl = safeHref
            ? `<a class="int-forge-title" href="${esc(safeHref)}" target="_blank" rel="noopener noreferrer">${esc(ev.title || "(无标题)")}</a>`
            : `<div class="int-forge-title">${esc(ev.title || "(无标题)")}</div>`;
          const timeLbl = ev.at && !String(ev.at).startsWith("0001-") ? ago(ev.at) : "";
          const metaLeft = [ev.repo, ev.tag].filter(Boolean).join(" · ");
          return `<li class="int-forge-item">
            <div class="int-forge-top">
              <span class="int-forge-repo">${esc(metaLeft)}</span>
              <span>${esc(timeLbl)}</span>
            </div>
            ${titleEl}
            <div class="int-forge-plan">${esc(forgeModeActionPreview(d.handle_mode, ev, pr))}</div>
          </li>`;
        }).join("")}</ul>` : `<p class="int-preview-empty">连通正常，当前筛选条件和关注仓库下暂无近期命中动态。</p>`}
      </div>` : "";

    $("#int-modal-body").innerHTML = `
      ${st === "error" && d.health?.last_error ? `
        <div class="int-modal-alert" role="alert">
          <span class="sdot error" aria-hidden="true"></span>
          <div><strong>连接异常：</strong>${esc(d.health.last_error)}</div>
        </div>` : ""}

      ${authSection}

      <section class="int-sec">
        <h3 class="int-sec-title">关注范围与过滤</h3>
        <div class="int-toggle-row">
          <div class="tl">
            <b>所有指派给我的 ${esc(pr)} 评审与评论 @我</b>
            <small>首次开启自动记录水位线不回灌旧积压；自动跳过本人评论与常见机器人。</small>
          </div>
          <button type="button" class="switch" id="gf-mentions-sw" role="switch" aria-checked="${d.watch_mentions ? "true" : "false"}" aria-label="关注所有指派给我的评审与评论"></button>
        </div>
        <div class="int-field">
          <label class="int-field-label" for="gf-repo-input">重点关注的仓库 <span class="opt">可选</span></label>
          ${d.repos.length ? `<div class="int-repo-tags">${d.repos.map((r) => `<span class="int-repo-tag"><span>${esc(r)}</span><button type="button" data-gf-rm-repo="${esc(r)}" aria-label="移除 ${esc(r)}">×</button></span>`).join("")}</div>` : ""}
          <div class="int-input-row">
            <input id="gf-repo-input" placeholder="输入 org/repo 回车添加" autocomplete="off" autocorrect="off" autocapitalize="none" spellcheck="false">
            <button type="button" class="btn small" id="gf-add-repo">添加</button>
          </div>
          ${suggested.length ? `<div class="int-repo-suggest"><span class="int-repo-suggest-lbl">快捷添加：</span>${suggested.map((r) => `<button type="button" class="int-repo-pick" data-gf-pick-repo="${esc(r)}">+ ${esc(r)}</button>`).join("")}</div>` : ""}
        </div>
        <div class="int-field">
          <span class="int-field-label">关注的动态类型</span>
          <div class="int-check-row">${eventCheckboxes}</div>
        </div>
      </section>

      <section class="int-sec">
        <h3 class="int-sec-title">收到新动态后如何处理</h3>
        <div class="int-mode-list" role="radiogroup" aria-label="${esc(item?.name || d.kind)} 事件处理模式">
          <label class="int-mode-opt">
            <input type="radio" name="gf_mode" value="notify" ${d.handle_mode === "notify" ? "checked" : ""}>
            <span><b>仅汇总提醒我</b><small>写入收件箱并推送精简摘要与直达链接，不唤醒 Collie，零模型消耗。</small></span>
          </label>
          <label class="int-mode-opt">
            <input type="radio" name="gf_mode" value="advise" ${d.handle_mode === "advise" ? "checked" : ""}>
            <span><b>让 Collie 自动调研并出建议（不擅自合并/评论）<span class="rec">推荐</span></b><small>只读阅读 diff、评审意见或失败日志并给出拍板按钮，严禁未经确认擅自操作远端。</small></span>
          </label>
          <label class="int-mode-opt">
            <input type="radio" name="gf_mode" value="agent" ${d.handle_mode === "agent" ? "checked" : ""}>
            <span><b>交给已订阅该 ${esc(pr)} 的 Agent 直接处理</b><small>若已有在线 Agent 订阅该 ${esc(pr)} 线程则直接投递继续修；否则自动转交 Collie 先调研。</small></span>
          </label>
        </div>
      </section>

      <section class="int-sec">
        <h3 class="int-sec-title">连通自检与试拉</h3>
        <div class="int-test-box">
          <div class="int-test-head">
            <button type="button" class="btn" id="gf-test-btn" ${d.testState === "testing" ? "disabled" : ""}>立即试拉最近 3 条</button>
            ${testRow()}
          </div>
          ${sampleHTML}
        </div>
      </section>
    `;

    $("#int-modal-foot").innerHTML = `
      ${isConfigured ? `<button type="button" class="btn ghost small" id="gf-reset-btn" ${d.saving ? "disabled" : ""}>清空配置</button>` : ""}
      <div class="int-sheet-foot-right">
        <button type="button" class="btn" id="gf-cancel-btn">取消</button>
        <button type="button" class="btn primary" id="gf-save-btn" ${d.saving ? "disabled" : ""}>${d.saving ? "保存中…" : "保存并应用"}</button>
      </div>
    `;

    const draftConfigPayload = (configured = true) => ({
      auth_mode: d.auth_mode,
      watch_mentions: d.watch_mentions,
      repos: d.repos,
      events: d.events,
      handle_mode: d.handle_mode,
      configured,
    });
    const draftSecretsPayload = () => {
      const s = {};
      if (d.pat.trim()) s.pat = d.pat.trim();
      return s;
    };

    intModal.querySelectorAll("[data-gf-auth]").forEach((b) => {
      b.addEventListener("click", () => {
        d.auth_mode = b.dataset.gfAuth;
        d.testState = null;
        renderIntModal(item);
        if (d.auth_mode === "gh" && !d.probeState) runForgeProbe(item);
      });
    });
    $("#gf-pat")?.addEventListener("input", (ev) => { d.pat = ev.target.value; });
    $("#gf-reprobe-btn")?.addEventListener("click", () => runForgeProbe(item));
    $("#gf-mentions-sw")?.addEventListener("click", () => { d.watch_mentions = !d.watch_mentions; renderIntModal(item); });

    const addRepo = () => {
      const inp = $("#gf-repo-input");
      if (!inp) return;
      const v = inp.value.trim().replace(/^https?:\/\/[^/]+\//, "").replace(/\.git$/, "").replace(/^\/+|\/+$/g, "");
      if (!v || !v.includes("/")) { toast("请按 org/repo 格式输入", "attn"); inp.focus(); return; }
      if (!d.repos.includes(v)) d.repos.push(v);
      renderIntModal(item);
      $("#gf-repo-input")?.focus();
    };
    $("#gf-add-repo")?.addEventListener("click", addRepo);
    $("#gf-repo-input")?.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" && !ev.isComposing) { ev.preventDefault(); addRepo(); }
    });
    intModal.querySelectorAll("[data-gf-rm-repo]").forEach((b) => {
      b.addEventListener("click", () => {
        d.repos = d.repos.filter((r) => r !== b.dataset.gfRmRepo);
        renderIntModal(item);
      });
    });
    intModal.querySelectorAll("[data-gf-pick-repo]").forEach((b) => {
      b.addEventListener("click", () => {
        const r = b.dataset.gfPickRepo;
        if (r && !d.repos.includes(r)) d.repos.push(r);
        renderIntModal(item);
      });
    });
    intModal.querySelectorAll("[data-gf-ev]").forEach((cb) => {
      cb.addEventListener("change", () => { d.events[cb.dataset.gfEv] = cb.checked; });
    });
    intModal.querySelectorAll('input[name="gf_mode"]').forEach((r) => {
      r.addEventListener("change", () => {
        d.handle_mode = r.value;
        if (d.samples !== null) renderIntModal(item);
      });
    });

    $("#gf-test-btn")?.addEventListener("click", async () => {
      if (isGitHub && d.auth_mode === "pat" && !d.secret_set && !d.pat.trim()) {
        d.testState = "err";
        d.testMsg = "请先填写 Fine-grained PAT 再试拉";
        renderIntModal(item);
        return;
      }
      d.testState = "testing";
      d.testMsg = "";
      renderIntModal(item);
      try {
        const res = await api(`/api/super/integrations/${encodeURIComponent(item.kind)}/test`, {
          body: { config: draftConfigPayload(true), secrets: draftSecretsPayload() },
        });
        if (!intModal.open || intModalKind !== item.kind) return;
        d.testState = res.ok ? "ok" : "err";
        d.testMsg = res.message || (res.ok ? "试拉成功" : "试拉失败");
        if (res.ok) {
          const list = Array.isArray(res.detail?.samples) ? res.detail.samples : [];
          d.samples = list.map((s) => ({ ...s, _mode: d.handle_mode }));
          if (res.detail?.user && !d.probe?.ready) {
            d.probeState = "ok";
            d.probe = { ready: true, user: res.detail.user, repos: res.detail.repos || [] };
          }
        }
        renderIntModal(item);
        if (res.ok) $("#gf-preview")?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      } catch (err) {
        if (!intModal.open || intModalKind !== item.kind) return;
        d.testState = "err";
        d.testMsg = err.message;
        renderIntModal(item);
      }
    });

    $("#gf-reset-btn")?.addEventListener("click", async () => {
      d.saving = true;
      renderIntModal(item);
      try {
        await api(`/api/super/integrations/${encodeURIComponent(item.kind)}`, {
          body: {
            enabled: false,
            clear_secret: true,
            reset_cursor: true,
            config: { configured: false, auth_mode: isGitHub ? "gh" : "cli", watch_mentions: true, repos: [], handle_mode: "advise" },
          },
        });
        toast(`已清空 ${item.name} 配置`);
        await closeIntModal("reset");
        if (view === "auto" && autoTab === "integrations") loadAuto();
      } catch (err) {
        d.saving = false;
        renderIntModal(item);
        toast(err.message, "attn");
      }
    });

    $("#gf-cancel-btn")?.addEventListener("click", () => closeIntModal("cancel"));

    $("#gf-save-btn")?.addEventListener("click", async () => {
      const hasCreds = !isGitHub || d.auth_mode !== "pat" || d.secret_set || !!d.pat.trim();
      if (!hasCreds) {
        toast("请填写个人令牌（PAT）或切换为复用本机 gh 登录", "attn");
        $("#gf-pat")?.focus();
        return;
      }
      d.saving = true;
      renderIntModal(item);
      try {
        await api(`/api/super/integrations/${encodeURIComponent(item.kind)}`, {
          body: {
            enabled: true,
            config: draftConfigPayload(true),
            secrets: draftSecretsPayload(),
          },
        });
        toast(`${item.name} 主动追踪配置已保存并热重载`);
        await closeIntModal("saved");
        if (view === "auto" && autoTab === "integrations") loadAuto();
      } catch (err) {
        d.saving = false;
        renderIntModal(item);
        toast(err.message, "attn");
      }
    });
  }

  // ───────────────────────────── memory: what Collie keeps between sessions
  let memEditing = false;
  const kb = (n) => (n / 1024).toFixed(1) + " KB";
  const kbNum = (n) => (n / 1024).toFixed(1);
  const kbCap = (n) => (n % 1024 === 0 ? String(n / 1024) : (n / 1024).toFixed(1)) + " KB";
  const dayTime = (t) => {
    const d = new Date(t), today = new Date().toDateString(), tmr = new Date(Date.now() + 864e5).toDateString();
    const hm = d.toTimeString().slice(0, 5);
    return d.toDateString() === today ? "今天 " + hm : d.toDateString() === tmr ? "明天 " + hm : `${d.getMonth() + 1}月${d.getDate()}日 ${hm}`;
  };
  function memoryHTML(r) {
    const files = r.files || [];
    const by = (f) => files.filter(f);
    const dream = r.dreaming ? `<b>Collie 正在做梦</b>：回顾最近的对话，整理记忆。整理完会自己醒来，期间的消息会先攒着。`
      : `上次做梦：${r.last_dream ? dayTime(r.last_dream) : "还没有"}　·　下次：${r.next_dream ? dayTime(r.next_dream) + "（当天有新对话才会做）" : "已关闭"}`;
    const firstLine = (t, dflt) => t.split("\n").filter((l) => !/^\s*#/.test(l)).map((l) => l.replace(/^[>*\-\s]+/, "").replace(/`|\*\*/g, "").trim()).find(Boolean) || dflt;
    // A task names the workers on it: show them live, and open their session.
    const crew = (f) => {
      const latest = new Map(); // a name can be reused: the newest one
      for (const w of sup.workers) if (!latest.has(w.name) || new Date(w.created_at) > new Date(latest.get(w.name).created_at)) latest.set(w.name, w);
      const ws = [...latest.values()].filter((w) => new RegExp(`(^|[^\\w-])${w.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w-])`).test(f.text));
      if (!ws.length) return "";
      return `<span class="mem-crew">${ws.map((w) => {
        const pane = !w.ended && paneOf(w.name), past = !pane && workerHist(w.name, w.created_at);
        const href = pane ? `#/p/${encodeURIComponent(pane)}` : past ? `#/h/${encodeURIComponent(past.id)}` : "";
        const st = workerStatus(w);
        return `<a ${href ? `href="${href}"` : ""} title="${esc((KIND_LABEL[w.kind] || w.kind) + " · " + (STATUS_LABEL[st] || st))}"><span class="dot ${esc(st)}"></span>${esc(w.name)}</a>`;
      }).join("")}</span>`;
    };
    const card = (f, o = {}) => {
      const edit = !f.legacy && o.edit !== false;
      const sub = o.sub ?? firstLine(f.text, "");
      return `<details class="mem-fold" ${o.open ? "open" : ""} data-path="${esc(f.name)}"><summary>
          <span class="mem-name">${esc(o.label || f.name)}</span><span class="grow mem-sub">${esc(sub)}</span><span class="muted mem-size">${kb(f.size)}</span></summary>
        <div class="mem-body msg assistant" data-view>${md(f.text)}</div>
        ${edit ? `<div class="mem-tools">${o.crew ? crew(f) : ""}<span class="muted grow">${esc(dayTime(f.mod))} 更新</span><button class="btn small" data-act="mem-edit">编辑</button></div>
        <form class="mem-edit" hidden><textarea name="text" spellcheck="false">${esc(f.text)}</textarea>
          <div class="form-actions"><span class="muted grow">Collie 下次读这个文件时生效。</span><button type="button" class="btn small" data-act="mem-cancel">取消</button><button class="btn primary small">保存</button></div></form>` : ""}
      </details>`;
    };
    const group = (title, note, list, o = {}) => list.length || o.always ? `<h4 class="mem-h">${title}<span class="muted">${note}</span></h4>
      <div class="card">${list.length ? list.map((f, i) => card(f, typeof o.card === "function" ? o.card(f, i) : o.card || {})).join("") : `<div class="empty-row">${o.empty || "空"}</div>`}</div>` : "";
    const ins = by((f) => f.name === "instructions.md");
    const tasks = by((f) => /^tasks\/[^/]+\.md$/.test(f.name));
    const notes = by((f) => f.name.startsWith("notes/")).sort((a, b) => (a.name === "notes/index.md" ? -1 : b.name === "notes/index.md" ? 1 : a.name.localeCompare(b.name)));
    const done = by((f) => f.name.startsWith("tasks/done/")).sort((a, b) => new Date(b.mod) - new Date(a.mod));
    const msgs = by((f) => f.name === "messages.md");
    const legacy = by((f) => f.legacy);
    const msgBytes = r.messages ?? msgs.reduce((s, f) => s + (f.size || 0), 0);
    const upFront = r.up_front ?? Math.max(0, (r.loaded || 0) - msgBytes);
    const budget = r.budget || (10 << 10);
    const over = upFront > budget;
    return `<div class="card"><div class="mem-dream"><span class="dot ${r.dreaming ? "starting" : "asleep"}"></span><span class="grow">${dream}</span>
        <button class="btn small" data-act="dream-now" ${r.dreaming ? "disabled" : ""}>${r.dreaming ? "做梦中…" : "现在整理"}</button></div>
        <div class="mem-load">
          <div class="mem-load-row">
            <span class="mem-load-main" id="mem-front-label">前置记忆 <b class="${over ? "warn" : ""}">${kbNum(upFront)}</b> / ${kbCap(budget)}${over ? `<span class="mem-warn-note">超出预算，做梦时会精简</span>` : ""}</span>
            <span class="mem-load-msg">近期消息 <b>${kb(msgBytes)}</b><span class="muted"> · 自动记录</span></span>
          </div>
          <progress class="mem-meter${over ? " warn" : ""}" max="${budget}" value="${Math.min(upFront, budget)}" aria-labelledby="mem-front-label"></progress>
          <div class="mem-load-sub muted">仅指令、笔记索引与进行中任务计入 ${kbCap(budget)} 预算；<code>messages.md</code> 由 hub 自动维护，不占预算</div>
        </div></div>
      ${legacy.length ? group("旧版记忆", "等下次做梦或换会话时拆进 memory/", legacy, { card: { open: true } }) : ""}
      ${group("进行中的任务", "一件事一个文件，每次都读", tasks, { card: { label: undefined, crew: true }, always: true, empty: "没有进行中的任务" })}
      ${group("指令", "你的长期要求和偏好，每次都读", ins, { card: { open: true, label: "instructions.md", sub: "" }, always: true, empty: "还没有" })}
      ${group("笔记", "只先读索引，其余需要时读", notes, { card: (f) => ({ open: f.name === "notes/index.md", label: f.name.replace(/^notes\//, "") }) })}
      ${group("最近说过的话", "hub 自动记录最近 10 条，每次都读，避免重复", msgs, { card: { edit: false, label: "messages.md" } })}
      ${r.dreams.length ? `<h4 class="mem-h">做梦日记</h4><div class="card">${r.dreams.map((d, i) => `<details class="mem-fold" ${i === 0 ? "open" : ""}><summary><span class="muted mem-name">${esc(d.name.replace(/\.md$/, ""))}</span><span class="grow mem-sub">${esc(firstLine(d.text, d.name))}</span></summary><div class="mem-body msg assistant">${md(d.text)}</div></details>`).join("")}</div>` : ""}
      ${done.length ? `<details class="mem-done" data-path="tasks/done/"><summary class="mem-h">已完成<span class="muted">${done.length} 件 · 做完或放弃的任务，不再先读</span></summary>
        <div class="card">${done.map((f) => card(f, { label: f.name.replace(/^tasks\/done\//, ""), crew: true })).join("")}</div></details>` : ""}`;
  }

  function inboxHTML(ts, ths = []) {
    const multiThread = ths.length > 1;
    if (!multiThread || (inboxThread && !ths.some((th) => th.id === inboxThread))) inboxThread = "";
    const shown = inboxThread ? ts.filter((t) => t.thread === inboxThread) : ts;
    const activeWorkers = (sup.workers || []).filter((w) => !w.ended).map((w) => w.name);
    let threadBar = "";
    if (multiThread) {
      const selTh = inboxThread ? ths.find((th) => th.id === inboxThread) : null;
      const subsChips = (th) => {
        if (!th) return "";
        if (th.id === "chat:main") return `<span class="muted">→ Collie（主线程）</span>`;
        const subs = th.subscribers || [];
        const pills = subs.length
          ? subs.map((w) => `<span class="sub-pill">${esc(w)}<button type="button" data-unsub-worker="${esc(w)}" data-unsub-thread="${esc(th.id)}" title="取消订阅" aria-label="取消 ${esc(w)} 订阅">×</button></span>`).join("")
          : `<span class="muted">→ Collie</span>`;
        const addOpts = activeWorkers.filter((w) => !subs.includes(w));
        const adder = addOpts.length
          ? `<select id="inbox-sub-add" data-thread="${esc(th.id)}" data-pick="compact" data-title="添加订阅 agent"><option value="">+ 订阅 agent</option>${addOpts.map((w) => `<option value="${esc(w)}">${esc(w)}</option>`).join("")}</select>`
          : "";
        return `<div class="inbox-subs"><span>订阅：</span>${pills}${adder}</div>`;
      };
      const allSubsFold = !selTh ? `<details class="inbox-subs-fold"><summary>线程与订阅管理（${ths.length} 条线程）</summary>
        <div class="card"><ul class="rows">${ths.map((th) => `<li class="row">
          <span class="badge">${th.triggers?.length || 0}</span>
          <div><div class="meta"><b>${esc(th.id)}</b>${th.id === "chat:main" ? "<span>→ Collie（主线程）</span>" : th.subscribers?.length ? `<span class="inbox-subs">${th.subscribers.map((w) => `<span class="sub-pill">${esc(w)}<button type="button" data-unsub-worker="${esc(w)}" data-unsub-thread="${esc(th.id)}" title="取消订阅" aria-label="取消 ${esc(w)} 订阅">×</button></span>`).join("")}</span>` : "<span>→ Collie</span>"}</div></div>
          <span class="right">${when(th.last_at)}</span></li>`).join("")}</ul></div></details>` : "";
      threadBar = `<div class="inbox-bar">
        <label class="inbox-filter">线程<select id="inbox-thread-filter" data-pick="compact" data-title="按线程筛选">
          <option value="" ${!inboxThread ? "selected" : ""}>全部线程（${ths.length}）</option>
          ${ths.map((th) => `<option value="${esc(th.id)}" data-sub="${esc((th.subscribers?.length ? "订阅：" + th.subscribers.join(", ") : "→ Collie") + " · " + (th.triggers?.length || 0) + " 条")}" ${inboxThread === th.id ? "selected" : ""}>${esc(th.id)}</option>`).join("")}
        </select></label>
        ${selTh ? subsChips(selTh) : ""}
      </div>${allSubsFold}`;
    }
    return `${threadBar}
      <div class="card"><ul class="rows">${shown.length ? shown.map((t) => {
        const id = String(t.id ?? "");
        const expanded = inboxExpanded.has(id);
        const textId = inboxTextId(id);
        return `<li class="row inbox-row${expanded ? " is-expanded is-expandable" : ""}" data-inbox-id="${esc(id)}">
        <span class="badge ${esc(t.status === "queued" ? "queued" : t.status === "ignored" ? "ignored" : t.action === "candidate" ? "candidate" : "")}">${esc({ queued: "排队", delivered: "已投递", ignored: "已忽略" }[t.status] || t.status)}</span>
        <div class="inbox-main"><div class="meta"><b>#${esc(id)}</b><span>${esc(SOURCE_LABEL[t.source] || t.source)}</span><span>${esc(t.thread)}</span>${t.from ? `<span>from ${esc(t.from === ROUTER ? "Collie" : t.from)}</span>` : ""}${t.targets?.length ? `<span>→ ${esc(t.targets.map((x) => x === ROUTER ? "Collie" : x).join(", "))}</span>` : ""}${t.action === "candidate" ? "<span>candidate</span>" : ""}</div>
        <div class="text inbox-text" id="${esc(textId)}">${esc(t.text)}</div>
        <button type="button" class="inbox-toggle" data-inbox-toggle="${esc(id)}" aria-expanded="${expanded ? "true" : "false"}" aria-controls="${esc(textId)}" aria-label="${expanded ? "收起" : "展开"} #${esc(id)}"${expanded ? "" : " hidden"}><span class="inbox-toggle-lbl">${expanded ? "收起" : "展开"}</span><svg class="inbox-toggle-ico" viewBox="0 0 16 16" aria-hidden="true"><path d="M4.25 6.25L8 10l3.75-3.75"/></svg></button></div>
        <span class="right">${when(t.at)}</span></li>`;
      }).join("") : `<li class="empty-row">${inboxThread ? "这条线程里还没有事件" : "收件箱是空的"}</li>`}</ul></div>`;
  }

  // ───────────────────────────── timers: picked, not typed
  const WEEK = [["mon", "一"], ["tue", "二"], ["wed", "三"], ["thu", "四"], ["fri", "五"], ["sat", "六"], ["sun", "日"]];
  const UNIT = { m: "分钟", h: "小时" };
  // describeSpec turns "weekly mon,thu 09:00" into "每周一、四 09:00".
  function describeSpec(spec) {
    const f = String(spec || "").trim().split(/\s+/);
    const dur = (d) => {
      const m = /^(\d+(?:\.\d+)?)([mhs])$/.exec(d || "");
      if (!m) return d;
      const n = +m[1];
      if (m[2] === "h" && n >= 24 && n % 24 === 0) return `${n / 24} 天`;
      if (m[2] === "m" && n >= 60 && n % 60 === 0) return `${n / 60} 小时`;
      return `${n} ${UNIT[m[2]] || "秒"}`;
    };
    switch (f[0]) {
      case "daily": return `每天 ${f[1]}`;
      case "weekdays": return `工作日 ${f[1]}`;
      case "weekly": return `每周${(f[1] || "").split(",").map((d) => (WEEK.find((w) => w[0] === d) || [, d])[1]).join("、")} ${f[2] || ""}`;
      case "every": return `每隔 ${dur(f[1])}`;
      case "in": return `${dur(f[1])}后（一次）`;
      case "at": return `${f[1]} ${f[2] || ""}（一次）`;
    }
    return spec;
  }
  const pad2 = (n) => String(n).padStart(2, "0");
  const localStamp = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  // The spec the timer form describes, or an error to show.
  function timerSpec(f) {
    const mode = f.dataset.mode, clock = f.clock.value;
    if (["daily", "weekdays", "weekly"].includes(mode) && !/^\d\d:\d\d$/.test(clock)) return { err: "选一个时间" };
    if (mode === "daily") return { spec: `daily ${clock}` };
    if (mode === "weekdays") return { spec: `weekdays ${clock}` };
    if (mode === "weekly") {
      const days = [...f.querySelectorAll(".tm-days button.on")].map((b) => b.dataset.day);
      return days.length ? { spec: `weekly ${days.join(",")} ${clock}` } : { err: "选至少一天" };
    }
    if (mode === "every") {
      const n = Math.floor(+f.every_n.value);
      if (!(n >= 1)) return { err: "间隔至少 1" };
      const u = f.every_u.value;
      return { spec: u === "d" ? `every ${n * 24}h` : `every ${n}${u}` };
    }
    const at = f.at.value;
    if (!at) return { err: "选一个日期和时间" };
    if (new Date(at) <= new Date()) return { err: "这个时间已经过去了" };
    return { spec: `at ${at.replace("T", " ")}` };
  }
  function syncTimerForm(f) {
    const mode = f.dataset.mode;
    f.querySelectorAll(".tm-mode button").forEach((b) => b.classList.toggle("on", b.dataset.mode === mode));
    f.querySelectorAll("[data-show]").forEach((el) => { el.hidden = !el.dataset.show.split(" ").includes(mode); });
    const r = timerSpec(f), target = f.target.selectedOptions[0]?.textContent || "Collie";
    const sum = f.querySelector(".tm-sum");
    sum.textContent = r.err ? r.err : `${describeSpec(r.spec)} · 交给 ${target.replace(/（.*）/, "")}`;
    sum.classList.toggle("err", !!r.err);
  }

  const timerModal = $("#timer-modal");
  const timerForm = $("#timer-form");
  async function closeTimerModal(reason = "cancel") {
    if (!timerModal?.open || timerModal.hasAttribute("data-closing")) return;
    if (pickOpen && timerModal.contains(pickOpen)) closePick();
    if (!supportsTopLayerExit()) {
      timerModal.setAttribute("data-closing", "");
      const anims = timerModal.getAnimations({ subtree: true });
      if (anims.length) {
        await Promise.race([
          Promise.allSettled(anims.map((a) => a.finished)),
          new Promise((r) => setTimeout(r, 240)),
        ]);
      }
      if (!timerModal.hasAttribute("data-closing")) return;
      timerModal.removeAttribute("data-closing");
    }
    if (timerModal.open) timerModal.close(reason);
  }
  function openTimerModal() {
    if (!timerModal || !timerForm) return;
    const soon = new Date(Date.now() + 60 * 60 * 1000); soon.setMinutes(0, 0, 0);
    timerForm.reset();
    timerForm.dataset.mode = "weekdays";
    timerForm.clock.value = "09:00";
    timerForm.every_n.value = "2";
    timerForm.every_u.value = "h";
    timerForm.at.value = localStamp(soon);
    timerForm.text.value = "";
    timerForm.querySelectorAll(".tm-days button").forEach((b, i) => b.classList.toggle("on", i === 0));
    const liveWorkers = (sup.workers || []).filter((w) => !w.ended);
    timerForm.target.innerHTML = `<option value="" data-sub="由它决定怎么处理">Collie</option>`
      + liveWorkers.map((w) => `<option value="${esc(w.name)}" data-sub="${esc(KIND_LABEL[w.kind] || w.kind)}">${esc(w.name)}</option>`).join("");
    timerForm.target.value = "";
    syncPick(timerForm.every_u);
    syncPick(timerForm.target);
    syncTimerForm(timerForm);
    timerModal.removeAttribute("data-closing");
    if (!timerModal.open) timerModal.showModal();
  }
  if (timerModal && timerForm) {
    $("#tm-modal-close")?.addEventListener("click", () => closeTimerModal("cancel"));
    $("#tm-modal-cancel")?.addEventListener("click", () => closeTimerModal("cancel"));
    if (!("closedBy" in HTMLDialogElement.prototype)) {
      let pressedOutside = false;
      const outside = (ev) => {
        const r = timerModal.getBoundingClientRect();
        return ev.clientX < r.left || ev.clientX > r.right || ev.clientY < r.top || ev.clientY > r.bottom;
      };
      timerModal.addEventListener("pointerdown", (ev) => { pressedOutside = ev.target === timerModal && outside(ev); });
      timerModal.addEventListener("pointerup", (ev) => { if (pressedOutside && outside(ev)) closeTimerModal("cancel"); pressedOutside = false; });
    }
    timerModal.addEventListener("cancel", (ev) => {
      if (pickOpen && timerModal.contains(pickOpen)) {
        ev.preventDefault();
        closePick(true);
        return;
      }
      if (!supportsTopLayerExit()) {
        ev.preventDefault();
        closeTimerModal("cancel");
      }
    });
    timerModal.addEventListener("close", () => {
      if (pickOpen && timerModal.contains(pickOpen)) closePick();
      timerModal.returnValue = "";
      timerModal.removeAttribute("data-closing");
    });
    // Timer form: mode, days and quick times are buttons; everything re-describes the spec.
    timerForm.addEventListener("click", (e) => {
      const b = e.target.closest("button[type=button]");
      if (!b || b.id === "tm-modal-close" || b.id === "tm-modal-cancel") return;
      if (b.dataset.mode) timerForm.dataset.mode = b.dataset.mode;
      if (b.dataset.day) b.classList.toggle("on");
      if (b.dataset.at) {
        let d = new Date();
        if (b.dataset.at === "am") { d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); }
        else d = new Date(d.getTime() + +b.dataset.at * 60000);
        timerForm.at.value = localStamp(d);
      }
      syncTimerForm(timerForm);
    });
    timerForm.addEventListener("input", () => syncTimerForm(timerForm));
    timerForm.addEventListener("change", () => syncTimerForm(timerForm));
    timerForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const r = timerSpec(timerForm);
      if (r.err) { toast(r.err, "attn"); return; }
      const text = timerForm.text.value.trim();
      if (!text) { timerForm.text.focus(); return; }
      const btn = $("#tm-modal-submit");
      if (btn) btn.disabled = true;
      try {
        await api("/api/super/timers", { body: { spec: r.spec, text, target: timerForm.target.value, owner: "you" } });
        toast(`已添加：${describeSpec(r.spec)}`);
        await closeTimerModal("ok");
        loadAuto();
      } catch (err) {
        toast(err.message, "attn");
      } finally {
        if (btn) btn.disabled = false;
      }
    });
  }

  function timersHTML(ts = []) {
    const idN = (id) => +(/\d+$/.exec(id || "")?.[0] || 0);
    const ms = (s) => { const n = s ? Date.parse(s) : NaN; return n > 0 ? n : NaN; };
    const endMs = (t) => { const l = ms(t.last_run); return isNaN(l) ? ms(t.next_run) : l; };
    const active = ts.filter((t) => t.enabled).sort((a, b) => {
      const ta = ms(a.next_run), tb = ms(b.next_run);
      if (isNaN(ta) !== isNaN(tb)) return isNaN(ta) ? 1 : -1;
      return (ta - tb) || (idN(a.id) - idN(b.id));
    });
    const ended = ts.filter((t) => !t.enabled).sort((a, b) => {
      const ta = endMs(a), tb = endMs(b);
      if (isNaN(ta) !== isNaN(tb)) return isNaN(ta) ? 1 : -1;
      return (tb - ta) || (idN(b.id) - idN(a.id));
    });
    const timerRow = (t) => {
      const meta = [
        t.enabled ? `下次 ${when(t.next_run)}` : t.last_run ? `上次 ${when(t.last_run)}` : "已结束",
        t.owner ? (t.owner === "you" ? "你设的" : `${t.owner} 设的`) : "",
      ].filter(Boolean);
      return `<li class="tm-row${t.enabled ? "" : " is-ended"}">
        <div class="tm-row-head">
          <span class="sdot ${t.enabled ? "connected" : "disabled"}" aria-hidden="true"></span>
          <b class="tm-spec" title="${esc(t.spec)}">${esc(describeSpec(t.spec))}</b>
          <span class="tm-target-tag">→ ${esc(t.target || "Collie")}</span>
          <button type="button" class="icon-btn tm-del" data-del-timer="${esc(t.id)}" title="删除定时" aria-label="删除定时">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3"/></svg>
          </button>
        </div>
        <div class="tm-row-meta">${meta.map((m) => `<span>${esc(m)}</span>`).join('<span class="tm-sep" aria-hidden="true">·</span>')}</div>
        <div class="tm-row-text">${esc(t.text)}</div>
      </li>`;
    };
    return `<div class="tm-bar">
        <span class="tm-bar-stat">${active.length ? `启用中 · ${active.length}` : "定时任务"}</span>
        <button type="button" class="btn primary small tm-new-btn" id="tm-open-btn" data-act="timer-open">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>
          <span>新建定时</span>
        </button>
      </div>
      <div class="card"><ul class="rows">${active.length ? active.map(timerRow).join("") : `<li class="empty-row">${ended.length ? "没有启用中的定时" : "还没有定时，点右上角新建"}</li>`}</ul></div>
      ${ended.length ? `<details class="mem-done" data-ended-timers><summary class="mem-h">已结束<span class="muted">${ended.length} 个</span></summary>
        <div class="card"><ul class="rows">${ended.map(timerRow).join("")}</ul></div></details>` : ""}`;
  }

  // ───────────────────────────── settings: grouped by what they are about
  // Fills a model picker and its effort picker from what that agent offers.
  async function fillModels(form, who) {
    const kindSel = form[who + "_kind"], modelSel = form[who + "_model"], effSel = form[who + "_effort"];
    const effField = effSel.closest("label");
    const machine = who === "worker" && form.worker_machine ? form.worker_machine.value : "";
    const seq = (modelSel._seq = (modelSel._seq || 0) + 1);
    const want = modelSel.dataset.value ?? modelSel.value;
    modelSel.dataset.loading = "1";
    modelSel.dataset.pendingValue = want || "";
    modelSel.innerHTML = `<option value="">读取中…</option>`;
    syncPick(modelSel);
    const info = await modelsFor(kindSel.value, machine);
    if (seq !== modelSel._seq) return;
    delete modelSel.dataset.loading;
    delete modelSel.dataset.pendingValue;
    const list = [...(info.models || [])];
    if (want && !list.some((m) => m.id === want)) list.unshift({ id: want });
    const sub = (m) => [m.label && m.label !== m.id ? m.id : "", m.note && m.note !== m.id && !(m.label && m.note.startsWith(m.label)) ? m.note : ""].filter(Boolean).join(" · ");
    const defName = defaultModelName(info);
    modelSel.innerHTML = `<option value="" data-sub="${esc(defName ? "现在是 " + defName : "用 agent 自己的设置")}">默认</option>`
      + list.map((m) => `<option value="${esc(m.id)}" data-sub="${esc(sub(m))}" ${m.id === want ? "selected" : ""}>${esc(m.label || m.id)}</option>`).join("")
      + `<option value="__custom" data-sub="输入列表里没有的模型名">其他…</option>`;
    modelSel.value = want || "";
    delete modelSel.dataset.value;
    syncPick(modelSel);
    const fillEffort = () => {
      const effs = effortsFor(info, kindSel.value, modelSel.value);
      const rawCur = effSel.dataset.value ?? effSel.value;
      const cur = effs.includes(rawCur) ? rawCur : "";
      const defE = effs.includes(info.default_effort) ? info.default_effort : "";
      effSel.innerHTML = `<option value="" data-sub="${esc(defE ? "现在是 " + (EFFORT_LABEL[defE] || defE) : "用 agent 自己的设置")}">默认</option>`
        + effs.map((e) => `<option value="${esc(e)}" data-sub="${esc(e)}" ${e === cur ? "selected" : ""}>${esc(EFFORT_LABEL[e] || e)}</option>`).join("");
      effSel.value = cur;
      delete effSel.dataset.value;
      const hide = effs.length === 0;
      effSel.hidden = hide;
      effSel.disabled = hide;
      if (effField) effField.hidden = hide;
      if (hide && pickOpen === effSel) closePick();
      syncPick(effSel);
    };
    fillEffort();
    modelSel.onchange = () => {
      if (modelSel.value === "__custom") {
        const v = (prompt("模型名（照 agent 的 --model 参数写）") || "").trim();
        if (v) modelSel.add(new Option(v, v, true, true), 1);
        else modelSel.value = "";
        syncPick(modelSel);
      }
      fillEffort();
      form._autoSave?.flush();
    };
  }
  let latestSettingsBase = null;
  function createSettingsAutoSaver(form, initial) {
    let base = { ...(initial || {}) };
    let saving = false, queued = false, debounceTimer = null, statusTimer = null;
    const statusEl = () => $("#settings-save-state", form);
    const setStatus = (mode, text) => {
      const el = statusEl();
      if (!el) return;
      clearTimeout(statusTimer);
      if (!mode) {
        el.className = "set-save-state";
        el.textContent = "";
        el.hidden = true;
        return;
      }
      el.className = "set-save-state " + mode;
      el.textContent = text;
      el.hidden = false;
      if (mode === "saved") {
        statusTimer = setTimeout(() => {
          if (el.classList.contains("saved")) {
            el.className = "set-save-state";
            el.textContent = "";
            el.hidden = true;
          }
        }, 1800);
      }
    };
    const readModel = (sel, fallback) => {
      if (!sel) return fallback || "";
      if (sel.dataset.loading === "1") return sel.dataset.pendingValue ?? (fallback || "");
      return sel.value === "__custom" ? "" : sel.value;
    };
    const readEffort = (sel, fallback) => {
      if (!sel) return fallback || "";
      if (sel.disabled) return "";
      return sel.dataset.value ?? sel.value;
    };
    const readNum = (input, fallback, minVal) => {
      const raw = input?.value?.trim();
      if (raw === "" || raw == null) return fallback;
      const n = Number(raw);
      return Number.isFinite(n) && n >= minVal ? n : fallback;
    };
    const collect = () => ({
      ...base,
      router_kind: form.router_kind.value,
      router_args: form.router_args.value.split(/\s+/).filter(Boolean),
      router_model: readModel(form.router_model, base.router_model),
      router_effort: readEffort(form.router_effort, base.router_effort),
      worker_kind: form.worker_kind.value,
      worker_cwd: form.worker_cwd.value.trim() || "~",
      worker_model: readModel(form.worker_model, base.worker_model),
      worker_effort: readEffort(form.worker_effort, base.worker_effort),
      worker_machine: form.worker_machine ? form.worker_machine.value : (base.worker_machine || ""),
      reply_chars: readNum(form.reply_chars, base.reply_chars || 200, 40),
      stall_minutes: readNum(form.stall_minutes, base.stall_minutes || 0, 0),
      rotate_pct: Number(form.rotate_pct.value),
      dream_at: form.dream_at.value,
      notify_webhook: form.notify_webhook.value.trim(),
      notify_lark: form.notify_lark.checked,
      notify_level: form.notify_level.value,
      paused: form.paused.checked,
      ask_permissions: !form.bypass.checked,
    });
    let lastSent = JSON.stringify(collect());

    async function run() {
      if (!form.isConnected) return;
      const payload = collect();
      const sig = JSON.stringify(payload);
      if (sig === lastSent) return;
      if (saving) { queued = true; return; }
      saving = true;
      setStatus("saving", "保存中…");
      try {
        const res = await api("/api/super/settings", { body: { settings: payload } });
        if (res?.settings) base = { ...base, ...res.settings };
        lastSent = sig;
        renderTarget(true);
        setStatus("saved", "✓ 已保存");
        // Refresh router.pending immediately so the amber restart bar reflects changes right away.
        api("/api/super").then((d) => {
          sup = normSup(d);
          renderSide();
          renderRouterPendingBars();
          if (view === "collie") renderSuper();
        }).catch(() => {});
      } catch (err) {
        setStatus("error", "保存失败：" + err.message);
        toast(err.message, "attn");
      } finally {
        saving = false;
        if (queued) {
          queued = false;
          run();
        }
      }
    }
    return {
      flush() { clearTimeout(debounceTimer); run(); },
      schedule(ms = 500) {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => run(), ms);
      },
    };
  }
  function bindSettings(form) {
    if (!form || form._bound) return;
    form._bound = true;
    const saver = (form._autoSave = createSettingsAutoSaver(form, latestSettingsBase));
    renderRouterPendingBars();
    for (const who of ["router", "worker"]) {
      fillModels(form, who);
      form[who + "_kind"].addEventListener("change", () => {
        delete form[who + "_model"].dataset.value;
        delete form[who + "_effort"].dataset.value;
        form[who + "_model"].value = "";
        form[who + "_effort"].value = "";
        fillModels(form, who);
        saver.flush();
      });
      form[who + "_effort"].addEventListener("change", () => saver.flush());
    }
    let prevWorkerMachine = form.worker_machine?.value || "";
    const dirCtrl = enhanceDirInput(form.worker_cwd, {
      getMachine: () => form.worker_machine?.value || "",
      onPick: () => saver.flush(),
    });
    form.worker_machine?.addEventListener("change", () => {
      const nextMachine = form.worker_machine.value;
      const oldInfo = (state.machines || []).find((m) => m.id === prevWorkerMachine);
      const curCwd = form.worker_cwd.value.trim();
      if (oldInfo?.home && curCwd.startsWith(oldInfo.home)) {
        form.worker_cwd.value = "~" + curCwd.slice(oldInfo.home.length);
      } else if (prevWorkerMachine !== nextMachine && (/^\/Users\//.test(curCwd) || /^\/home\//.test(curCwd) || /^\/data\d+\/home\//.test(curCwd))) {
        form.worker_cwd.value = "~";
      }
      prevWorkerMachine = nextMachine;
      fillModels(form, "worker");
      dirCtrl?.refresh();
      saver.flush();
    });

    // Selects and checkboxes save immediately on change.
    for (const name of ["rotate_pct", "dream_at", "notify_level", "notify_lark", "bypass", "paused"]) {
      form[name]?.addEventListener("change", () => saver.flush());
    }
    // Text & number inputs auto-save after 500ms debounce or immediately on blur / IME-safe Enter.
    for (const name of ["router_args", "worker_cwd", "notify_webhook", "reply_chars", "stall_minutes"]) {
      const el = form[name];
      if (!el) continue;
      el.addEventListener("input", () => saver.schedule(500));
      el.addEventListener("blur", () => {
        if (name === "reply_chars" && (!el.value.trim() || Number(el.value) < 40)) el.value = "200";
        if (name === "stall_minutes" && (!el.value.trim() || Number(el.value) < 0)) el.value = "0";
        saver.flush();
      });
      el.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          if (e.isComposing || e.keyCode === 229) return;
          e.preventDefault();
          saver.flush();
        }
      });
    }
    form.worker_cwd.addEventListener("change", () => saver.flush());
  }

  function settingsHTML(r) {
    const s = r.settings;
    latestSettingsBase = s;
    const routerKindOpts = (v) => [["claude", "Claude", "claude"], ["codex", "Codex", "codex"], ["antigravity", "Antigravity", "agy"]].map(([k, l, g]) => `<option value="${k}" data-glyph="${g}" ${v === k ? "selected" : ""}>${l}</option>`).join("");
    const workerKindOpts = (v) => [["claude", "Claude", "claude"], ["codex", "Codex", "codex"], ["antigravity", "Antigravity", "agy"], ["doubao", "Doubao", "doubao"]].map(([k, l, g]) => `<option value="${k}" data-glyph="${g}" ${v === k ? "selected" : ""}>${l}</option>`).join("");
    const modelPick = (who, kind, model, effort) => {
      const hideEff = (kind === "antigravity" || kind === "agy") && agyRejectsEffort(model);
      const eff = hideEff ? "" : (effort || "");
      return `
          <label>模型<select name="${who}_model" data-title="模型" data-value="${esc(model || "")}"><option value="${esc(model || "")}" selected>${esc(model || "默认")}</option></select></label>
          <label${hideEff ? " hidden" : ""}>思考强度<select name="${who}_effort" data-pick="compact" data-title="思考强度" data-value="${esc(eff)}"${hideEff ? " hidden disabled" : ""}><option value="${esc(eff)}" selected>${esc(EFFORT_LABEL[eff] || eff || "默认")}</option></select></label>`;
    };
    const localMs = (state.machines || []).filter((m) => !m.hub);
    const many = localMs.length > 1;
    const cwdDisp = tildeForMachine(s.worker_cwd, s.worker_machine || "");
    setTimeout(() => bindSettings($("#settings-form")));
    return `<form class="settings" id="settings-form">
      <div class="router-pending-bar" id="settings-pending-bar" hidden></div>
      <span class="set-save-state" id="settings-save-state" role="status" aria-live="polite" hidden></span>

      <section class="card set-sec">
        <header>
          <div class="set-head-row">
            <h4>Collie 自己</h4>
            <button type="button" class="btn small set-restart-btn" data-act="router-restart" title="手动重启 Collie（保留记忆与排队消息）">重启 Collie</button>
          </div>
          <p>负责理解、分派与回复，选轻量快速的模型即可。</p>
        </header>
        <div class="set-grid three">
          <label>Agent<select name="router_kind" data-title="Collie 自己用的 agent">${routerKindOpts(s.router_kind)}</select></label>
          ${modelPick("router", s.router_kind, s.router_model, s.router_effort)}
        </div>
        <details class="set-adv" ${(s.router_args || []).length ? "open" : ""}><summary>更多启动参数</summary>
          <label><input name="router_args" class="mono" value="${esc((s.router_args || []).join(" "))}" placeholder="例如 --permission-mode plan" autocorrect="off" autocapitalize="off" spellcheck="false"><small>原样加在启动命令后面；工作目录 <code>${esc(tilde(r.router_dir))}</code></small></label>
        </details>
      </section>

      <section class="card set-sec">
        <header><h4>派活默认</h4><p>派发任务的默认配置，对话中可随时口头指定。</p></header>
        <div class="set-grid three">
          <label>Agent<select name="worker_kind" data-title="派活默认用">${workerKindOpts(s.worker_kind)}</select></label>
          ${modelPick("worker", s.worker_kind, s.worker_model, s.worker_effort)}
        </div>
        <div class="set-grid three">
          ${many ? `<label>电脑<select name="worker_machine" data-title="派活默认在哪台电脑">${localMs.map((m) => `<option value="${esc(m.id)}" data-dot="${m.local || m.online ? "online" : "offline"}" ${m.id === (s.worker_machine || "") ? "selected" : ""}>${esc(m.name)}${m.local ? "（hub）" : m.online ? "" : "（离线）"}</option>`).join("")}</select></label>` : ""}
          <label class="${many ? "span2" : "span3"}">目录<input name="worker_cwd" class="mono" value="${esc(cwdDisp)}" placeholder="~ 或输入任意目录路径" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"></label>
        </div>
      </section>

      <section class="card set-sec">
        <header><h4>记忆与会话</h4><p>对话超限时自动交接新会话，夜间自动整理记忆。</p></header>
        <div class="set-grid">
          <label>上下文用到多少时换新会话<select name="rotate_pct" data-pick="compact" data-title="上下文用到多少时换新会话">${[50, 60, 70, 80, -1].map((p) => `<option value="${p}" ${(s.rotate_pct || 60) === p ? "selected" : ""}>${p < 0 ? "从不" : p + "%"}</option>`).join("")}</select><small>窗口大小按 agent 自己的设置算</small></label>
          <label>每晚做梦<select name="dream_at" data-pick="compact" data-title="每晚做梦">${["02:00", "04:00", "06:00", "off"].map((t) => `<option value="${t}" ${(s.dream_at || "04:00") === t ? "selected" : ""}>${t === "off" ? "不做" : t}</option>`).join("")}</select><small>当天没有新对话就跳过</small></label>
        </div>
        <div class="set-mem-io">
          <div class="set-mem-io-copy">
            <span class="set-mem-io-title">记忆备份与迁移</span>
            <small>打包下载全部 <code>.md</code> 记忆，或从 <code>.zip</code> 备份恢复；导入前会自动备份当前记忆。</small>
          </div>
          <div class="set-mem-io-acts">
            <button type="button" class="btn small" data-act="mem-export">导出记忆</button>
            <button type="button" class="btn small" data-act="mem-import">导入记忆</button>
          </div>
        </div>
      </section>

      <section class="card set-sec">
        <header><h4>通知</h4></header>
        <p class="int-set-note">想在飞书里双向对话、直接点交互卡片按钮拍板？前往 <button type="button" data-go-tab="integrations">接入 → 飞书机器人</button> 一键配置。</p>
        <div class="set-grid">
          <label class="check span3"><input type="checkbox" name="notify_lark" ${s.notify_lark ? "checked" : ""}> 用 hub 上的 lark-cli 发飞书消息给你<small id="lark-who" class="muted">· 正在看 hub 上的 lark-cli…</small></label>
          <label>Webhook<input name="notify_webhook" value="${esc(s.notify_webhook || "")}" placeholder="https://open.feishu.cn/open-apis/bot/v2/hook/…" autocorrect="off" autocapitalize="off" spellcheck="false"><small>飞书 / Lark 机器人或 Slack</small></label>
          <label>什么时候推送<select name="notify_level" data-pick="compact" data-title="什么时候推送"><option value="quiet" ${s.notify_level === "quiet" ? "selected" : ""} data-sub="卡住、要你确认、出错">只在需要你时</option><option value="normal" ${s.notify_level === "normal" ? "selected" : ""} data-sub="外加 Collie 的回复，比如做完事的汇报">也推送 Collie 的回复</option></select><small>你正开着 Collie 的网页时不推</small></label>
        </div>
      </section>

      <section class="card set-sec">
        <header><h4>其他</h4></header>
        <div class="set-grid">
          <label>聊天回复长度<input name="reply_chars" type="number" min="40" step="20" value="${s.reply_chars || 200}"><small>平时每条回复的大致字数，要求详述时会自动写长</small></label>
          <label>多久没进展算卡住<input name="stall_minutes" type="number" min="0" value="${s.stall_minutes}"><small>分钟；0 表示不检查</small></label>
        </div>
        <label class="check"><input type="checkbox" name="bypass" ${s.ask_permissions ? "" : "checked"}> 跳过权限确认：自动执行命令与改文件（重启 Collie、新派 agent 生效）</label>
        <label class="check"><input type="checkbox" name="paused" ${s.paused ? "checked" : ""}> 暂停投递：事件照收，先不交给 agent</label>
      </section>
    </form>`;
  }

  $("#auto-body").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target;
    try {
      if (f.classList.contains("mem-edit")) {
        await api("/api/super/memory", { body: { path: f.closest("[data-path]").dataset.path, text: f.text.value } });
        memEditing = false;
        toast("已保存");
        loadAuto();
      } else if (f.id === "settings-form") {
        f._autoSave?.flush();
      }
    } catch (err) { toast(err.message, "attn"); }
  });

  $("#auto-body").addEventListener("change", async (e) => {
    if (e.target.id === "inbox-thread-filter") {
      inboxThread = e.target.value;
      $("#auto-body")._inboxRendered = false;
      loadAuto();
      return;
    }
    if (e.target.id === "inbox-sub-add") {
      const worker = e.target.value, thread = e.target.dataset.thread;
      if (!worker || !thread) return;
      try {
        await api("/api/super/subscribe", { body: { worker, thread, off: false } });
        toast(`已订阅 ${worker} → ${thread}`);
        $("#auto-body")._inboxRendered = false;
        loadAuto();
      } catch (err) { toast(err.message, "attn"); }
    }
  });

  $("#auto-body").addEventListener("click", async (e) => {
    const inboxBtn = e.target.closest("button[data-inbox-toggle]");
    if (inboxBtn) {
      const row = inboxBtn.closest(".inbox-row");
      if (row) toggleInboxRow(row, inboxBtn.dataset.inboxToggle, { animate: true });
      return;
    }
    const inboxText = e.target.closest(".inbox-row.is-expandable .inbox-text");
    if (inboxText) {
      if (e.target.closest("a, button, input, select, textarea, summary, label")) return;
      if (String(window.getSelection?.()?.toString() || "").length > 0) return;
      const row = inboxText.closest(".inbox-row");
      if (row?.dataset.inboxId) toggleInboxRow(row, row.dataset.inboxId, { animate: true });
      return;
    }
    const t = e.target.closest("button");
    if (!t) return;
    if (t.dataset.goTab) {
      autoTab = normalizeAutoTab(t.dataset.goTab);
      store.set("autoTab", autoTab);
      openAuto();
      return;
    }
    if (t.hasAttribute("data-int-cli-hint")) {
      toast("将声明式插件 JSON 放入 ~/.collie/providers/ 并重启 Hub 即可自动出现在这里");
      return;
    }
    if (t.dataset.intOpen) {
      openIntModal(t.dataset.intOpen);
      return;
    }
    if (t.dataset.intToggle) {
      e.stopPropagation();
      const kind = t.dataset.intToggle;
      const item = (intPayload?.integrations || []).find((x) => x.kind === kind);
      if (!item) return;
      if (!item.enabled && !item.configured) {
        openIntModal(kind);
        toast("请先完成必要配置再开启");
        return;
      }
      t.disabled = true;
      try {
        await api(`/api/super/integrations/${encodeURIComponent(kind)}`, { body: { enabled: !item.enabled } });
        toast(!item.enabled ? `已开启 ${item.name}` : `已暂停 ${item.name}`);
        await loadAuto();
      } catch (err) { toast(err.message, "attn"); t.disabled = false; }
      return;
    }
    if (t.hasAttribute("data-int-adv-save")) {
      const url = ($("#int-adv-webhook")?.value || "").trim();
      try {
        const cur = await api("/api/super/settings");
        await api("/api/super/settings", { body: { settings: { ...cur.settings, notify_webhook: url } } });
        toast(url ? "已保存通用单向推送地址" : "已清空通用单向推送地址");
        loadAuto();
      } catch (err) { toast(err.message, "attn"); }
      return;
    }
    if (t.hasAttribute("data-int-adv-test")) {
      const url = ($("#int-adv-webhook")?.value || "").trim();
      if (!url) { toast("请先填写推送地址再测试", "attn"); $("#int-adv-webhook")?.focus(); return; }
      t.disabled = true;
      try {
        const res = await api("/api/super/notify/test", { body: { url } });
        toast(res.message || "测试提醒已发送");
      } catch (err) { toast(err.message, "attn"); }
      finally { t.disabled = false; }
      return;
    }
    if (t.hasAttribute("data-int-adv-lark")) {
      const next = t.getAttribute("aria-checked") !== "true";
      t.disabled = true;
      try {
        const cur = await api("/api/super/settings");
        await api("/api/super/settings", { body: { settings: { ...cur.settings, notify_lark: next } } });
        toast(next ? "已开启本机 lark-cli 兜底提醒" : "已关闭本机 lark-cli 兜底提醒");
        await loadAuto();
      } catch (err) { toast(err.message, "attn"); t.disabled = false; }
      return;
    }
    if (t.dataset.unsubWorker && t.dataset.unsubThread) {
      try {
        await api("/api/super/subscribe", { body: { worker: t.dataset.unsubWorker, thread: t.dataset.unsubThread, off: true } });
        toast(`已取消 ${t.dataset.unsubWorker} 订阅`);
        loadAuto();
      } catch (err) { toast(err.message, "attn"); }
      return;
    }
    if (t.dataset.act === "mem-edit" || t.dataset.act === "mem-cancel") {
      const box = t.closest("[data-path]");
      memEditing = t.dataset.act === "mem-edit";
      box.querySelector(".mem-edit").hidden = !memEditing;
      box.querySelector("[data-view]").hidden = memEditing;
      box.querySelector(".mem-tools").hidden = memEditing;
      if (memEditing) box.querySelector("textarea").focus();
      else { $("#auto-body")._memSig = ""; loadAuto(); }
      return;
    }
    if (t.dataset.act === "timer-open") {
      openTimerModal();
      return;
    }
    if (t.dataset.act === "dream-now") {
      t.disabled = true; t.textContent = "开始中…";
      try { await api("/api/super/dream", { body: {} }); toast("Collie 去做梦了"); }
      catch (err) { toast(err.message, "attn"); }
      loadAuto();
      return;
    }
    if (t.dataset.act === "mem-export") {
      exportMemoryZipUI(t);
      return;
    }
    if (t.dataset.act === "mem-import") {
      if (memImportFile) {
        memImportFile.value = "";
        memImportFile.click();
      }
      return;
    }
    if (t.dataset.delTimer) {
      await api(`/api/super/timers/${t.dataset.delTimer}/delete`, { method: "POST", body: {} }).catch((err) => toast(err.message));
      loadAuto();
    } else if (t.dataset.copy) {
      await copy(t.dataset.copy); toast("已复制");
    }
  });

  // ───────────────────────────── memory export / import (ZIP + auto-backup)
  const MEM_IMPORT_MAX = 20 * (1 << 20);
  const memImportModal = $("#mem-import-modal");
  const memImportForm = $("#mem-import-form");
  const memImportFile = $("#mem-import-file");
  let memImportPending = null;
  let memImportBusy = false;

  function fmtMemBytes(n) {
    if (!(n >= 0)) return "";
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(2)} MB`;
  }
  function memZipStamp() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  }
  async function exportMemoryZipUI(btn) {
    if (!btn || btn.disabled) return;
    const orig = btn.textContent;
    btn.disabled = true;
    btn.textContent = "导出中…";
    try {
      const res = await authFetch("/api/memory/export", { credentials: "same-origin", cache: "no-store" });
      if (res.status === 401) {
        showLogin();
        return;
      }
      if (!res.ok) {
        let msg = "";
        try { msg = (await res.json())?.error || ""; } catch {}
        throw new Error(msg || `导出失败（HTTP ${res.status}）`);
      }
      const cd = res.headers?.get?.("Content-Disposition") || "";
      const m = /filename="([^"]+)"/i.exec(cd);
      const fileName = m?.[1] || `collie-memory-${memZipStamp()}.zip`;
      const cntHdr = res.headers?.get?.("X-Memory-Files");
      const cnt = cntHdr !== null && cntHdr !== "" ? Number(cntHdr) : NaN;
      const blob = await res.blob();
      triggerBlobDownload(blob, fileName);
      toast(Number.isFinite(cnt) ? `已导出 ${cnt} 个记忆文件` : "已导出记忆");
    } catch (err) {
      toast(err.message || "导出失败", "attn");
    } finally {
      btn.disabled = false;
      btn.textContent = orig;
    }
  }
  function syncMemImportModeUI() {
    if (!memImportForm) return;
    const mode = memImportForm.querySelector('input[name="mode"]:checked')?.value || "merge";
    const sub = $("#mem-io-submit");
    if (sub && !memImportBusy) {
      sub.textContent = mode === "replace" ? "覆盖并导入" : "开始导入";
      sub.classList.toggle("is-danger", mode === "replace");
    }
  }
  function setMemImportError(msg) {
    const el = $("#mem-io-error");
    if (!el) return;
    el.textContent = msg || "";
    el.hidden = !msg;
  }
  async function closeMemImportModal(reason = "cancel") {
    if (!memImportModal?.open || memImportModal.hasAttribute("data-closing")) return;
    if (!supportsTopLayerExit()) {
      memImportModal.setAttribute("data-closing", "");
      const anims = memImportModal.getAnimations({ subtree: true });
      if (anims.length) {
        await Promise.race([
          Promise.allSettled(anims.map((a) => a.finished)),
          new Promise((r) => setTimeout(r, 240)),
        ]);
      }
      if (!memImportModal.hasAttribute("data-closing")) return;
      memImportModal.removeAttribute("data-closing");
    }
    if (memImportModal.open) memImportModal.close(reason);
  }
  function openMemImportModal(file) {
    if (!memImportModal || !memImportForm || !file) return;
    memImportPending = file;
    $("#mem-io-file-name").textContent = file.name;
    $("#mem-io-file-meta").textContent = fmtMemBytes(file.size);
    const mergeRadio = memImportForm.querySelector('input[name="mode"][value="merge"]');
    if (mergeRadio) mergeRadio.checked = true;
    setMemImportError("");
    syncMemImportModeUI();
    memImportModal.removeAttribute("data-closing");
    if (!memImportModal.open) memImportModal.showModal();
  }
  if (memImportFile) {
    memImportFile.addEventListener("change", () => {
      const file = memImportFile.files?.[0];
      memImportFile.value = "";
      if (!file) return;
      if (file.size > MEM_IMPORT_MAX) {
        toast("压缩包太大了（最多 20 MiB）", "attn");
        return;
      }
      if (!/\.zip$/i.test(file.name)) {
        toast("请选择 .zip 格式的记忆备份文件", "attn");
        return;
      }
      openMemImportModal(file);
    });
  }
  if (memImportModal && memImportForm) {
    $("#mem-io-close")?.addEventListener("click", () => { if (!memImportBusy) closeMemImportModal("cancel"); });
    $("#mem-io-cancel")?.addEventListener("click", () => { if (!memImportBusy) closeMemImportModal("cancel"); });
    $("#mem-io-repick")?.addEventListener("click", () => {
      if (memImportBusy || !memImportFile) return;
      memImportFile.value = "";
      memImportFile.click();
    });
    memImportForm.addEventListener("change", (e) => {
      if (e.target?.name === "mode") {
        setMemImportError("");
        syncMemImportModeUI();
      }
    });
    if (!("closedBy" in HTMLDialogElement.prototype)) {
      let pressedOutside = false;
      const outside = (ev) => {
        const r = memImportModal.getBoundingClientRect();
        return ev.clientX < r.left || ev.clientX > r.right || ev.clientY < r.top || ev.clientY > r.bottom;
      };
      memImportModal.addEventListener("pointerdown", (ev) => { pressedOutside = !memImportBusy && ev.target === memImportModal && outside(ev); });
      memImportModal.addEventListener("pointerup", (ev) => { if (pressedOutside && !memImportBusy && outside(ev)) closeMemImportModal("cancel"); pressedOutside = false; });
    }
    memImportModal.addEventListener("cancel", (ev) => {
      if (memImportBusy) {
        ev.preventDefault();
        return;
      }
      if (!supportsTopLayerExit()) {
        ev.preventDefault();
        closeMemImportModal("cancel");
      }
    });
    memImportModal.addEventListener("close", () => {
      memImportModal.returnValue = "";
      memImportModal.removeAttribute("data-closing");
      memImportPending = null;
      setMemImportError("");
    });
    memImportForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (memImportBusy || !memImportPending) return;
      const mode = memImportForm.querySelector('input[name="mode"]:checked')?.value === "replace" ? "replace" : "merge";
      const sub = $("#mem-io-submit"), cancel = $("#mem-io-cancel"), closeBtn = $("#mem-io-close"), repick = $("#mem-io-repick");
      memImportBusy = true;
      setMemImportError("");
      if (sub) { sub.disabled = true; sub.textContent = "导入中…"; }
      if (cancel) cancel.disabled = true;
      if (closeBtn) closeBtn.disabled = true;
      if (repick) repick.disabled = true;
      try {
        const fd = new FormData();
        fd.append("file", memImportPending);
        fd.append("mode", mode);
        const res = await authFetch(`/api/memory/import?mode=${encodeURIComponent(mode)}`, {
          method: "POST",
          body: fd,
          credentials: "same-origin",
        });
        if (res.status === 401) {
          memImportBusy = false;
          await closeMemImportModal("cancel");
          showLogin();
          return;
        }
        let data = {};
        let raw = "";
        try {
          raw = await res.text();
          if (raw) data = JSON.parse(raw);
        } catch {}
        if (!res.ok) {
          const msg = data.error || (raw && !/^\s*</.test(raw) ? raw.trim().slice(0, 200) : "") || `导入失败（HTTP ${res.status}）`;
          setMemImportError(msg);
          return;
        }
        memImportBusy = false;
        await closeMemImportModal("ok");
        $("#auto-body")._memSig = "";
        const modeLbl = (data.mode || mode) === "replace" ? "覆盖导入" : "合并导入";
        const n = Number(data.imported || 0);
        const bak = data.backup ? `（原记忆已备份为 ${data.backup}）` : "";
        toast(`已${modeLbl} ${n} 个记忆文件${bak}`);
        if (view === "auto" && autoTab === "memory") loadAuto();
      } catch (err) {
        setMemImportError(err.message || "网络异常，请稍后重试");
      } finally {
        memImportBusy = false;
        if (sub) sub.disabled = false;
        if (cancel) cancel.disabled = false;
        if (closeBtn) closeBtn.disabled = false;
        if (repick) repick.disabled = false;
        syncMemImportModeUI();
      }
    });
  }

  // ───────────────────────────── agents in other terminals (outside herdr)
  let ext = [], extTimer, extStream = null, extCur = null, _lastExtSig = "", _lastExtRenderAt = 0;
  function sessionListSig(list) {
    if (!list || !list.length) return "0";
    let out = String(list.length);
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!e) continue;
      out += `|${e.id || ""}:${e.live ? 1 : 0}:${e.status || ""}:${e.title || ""}:${e.updated || e.ended || e.started || ""}`;
    }
    return out;
  }
  let externalLoad = null;
  function loadExternal() {
    if (!externalLoad) {
      externalLoad = refreshExternal().finally(() => { externalLoad = null; });
    }
    return externalLoad;
  }
  async function refreshExternal() {
    if (document.hidden && ext.length) return;
    let nextExt;
    try { nextExt = (await api("/api/external")).sessions || []; } catch { return; }
    nextExt = nextExt.concat(...await fromHubs("/api/external", "ext"));
    const sig = sessionListSig(nextExt);
    const now = Date.now();
    ext = nextExt;
    if (sig !== _lastExtSig || now - _lastExtRenderAt >= 30000) {
      _lastExtSig = sig;
      _lastExtRenderAt = now;
      renderExt();
    }
    if (view === "ext") renderExtHead();
  }

  // The same list from every other hub, ids tagged; a hub that doesn't
  // answer keeps what it showed last until it is marked offline.
  async function fromHubs(path, field) {
    return Promise.all(hubs.map(async (h) => {
      const r = remote.get(h.key);
      if (!r) return [];
      if (!r.online) return (r[field] = []);
      try {
        const d = await api(path, { hub: h });
        r[field] = (d.sessions || []).map((e) => ({ ...tagIds(e, h.key), id: tagged(e.id, h.key), hub: h.key }));
      } catch {}
      return r[field] || [];
    }));
  }

  // ───────────────────────────── ended sessions: read them, continue them
  let hist = [], _lastHistSig = "", _lastHistRenderAt = 0;
  let _histIndexCache = { ref: null, len: -1, byName: new Map(), routers: [] };
  function getHistIndex() {
    const arr = hist || [];
    if (_histIndexCache.ref === arr && _histIndexCache.len === arr.length) return _histIndexCache;
    const byName = new Map();
    const routers = [];
    for (let i = 0; i < arr.length; i++) {
      const h = arr[i];
      if (!h) continue;
      const endedMs = +new Date(h.ended) || 0;
      const item = { h, endedMs };
      if (h.name === ROUTER) routers.push(item);
      if (h.name) {
        let list = byName.get(h.name);
        if (!list) { list = []; byName.set(h.name, list); }
        list.push(item);
      }
    }
    _histIndexCache = { ref: arr, len: arr.length, byName, routers };
    return _histIndexCache;
  }
  // workerHist: the ended session named name that a line at time at was
  // about: the first of that name to end after it.
  const workerHist = (name, at) => {
    if (!name) return null;
    const list = getHistIndex().byName.get(name);
    if (!list || !list.length) return null;
    const t = +new Date(at) || 0;
    let best = null, bestMs = Infinity;
    for (let i = 0; i < list.length; i++) {
      const item = list[i];
      if (item.endedMs >= t && item.endedMs < bestMs) { best = item.h; bestMs = item.endedMs; }
    }
    return best;
  };
  // routerHist: the ended Collie session closest in time to an older
  // handover/dream line written before explicit "h:<id>" refs.
  const routerHist = (at) => {
    const t = +new Date(at);
    if (!t) return null;
    const routers = getHistIndex().routers;
    let best = null, bestDiff = 10 * 60e3;
    for (let i = 0; i < routers.length; i++) {
      const d = Math.abs(routers[i].endedMs - t);
      if (d < bestDiff) { best = routers[i].h; bestDiff = d; }
    }
    return best;
  };
  async function loadHistory() {
    let nextHist;
    try { nextHist = (await api("/api/history")).sessions || []; } catch { return; }
    nextHist = nextHist.concat(...await fromHubs("/api/history", "hist"));
    const sig = sessionListSig(nextHist);
    const now = Date.now();
    const changed = sig !== _lastHistSig;
    hist = nextHist;
    if (changed || now - _lastHistRenderAt >= 30000) {
      _lastHistSig = sig;
      _lastHistRenderAt = now;
      renderHist();
    }
    if (changed && view === "collie") renderSuper();
    if (view === "ext" && extCur?.startsWith("h:")) renderHistHead(extCur.slice(2));
  }
  const ago = (t) => {
    const s = (Date.now() - new Date(t)) / 1000;
    return s < 90 ? "刚刚" : s < 3600 ? Math.round(s / 60) + " 分钟前" : s < 86400 ? Math.round(s / 3600) + " 小时前" : Math.round(s / 86400) + " 天前";
  };
  const histName = (h) => h.title || (h.name && !autoName(h.name) ? h.name : base(tilde(h.cwd)));
  const histOnline = (h) => !h.machine || (state.machines || []).some((m) => m.id === h.machine && m.online);
  const renderHist = () => renderSessions();
  function renderHistHead(hid) {
    const h = hist.find((x) => x.id === hid);
    const on = h && histOnline(h);
    $("#x-name").textContent = h ? histName(h) : "已结束的会话";
    $("#x-kind").textContent = h ? KIND_LABEL[h.kind] || h.kind : "";
    $("#x-tag").textContent = "已结束";
    $("#x-status").className = "status ended";
    $("#x-status").textContent = h ? "结束于 " + ago(h.ended) : "";
    $("#x-cwd").textContent = h ? (h.machine ? machineName(h.machine) + " · " : "") + tilde(h.cwd) : "";
    $("#x-note").textContent = !h ? "这条记录已经不在了。"
      : on ? `继续会${h.machine ? "在 " + machineName(h.machine) + " 上" : ""}用同一个会话重新打开 ${KIND_LABEL[h.kind] || h.kind}，之前的上下文都还在。`
      : `${machineName(h.machine)} 现在不在线，连上后才能继续。`;
    const b = $("#x-takeover");
    b.textContent = "继续这个会话";
    b.hidden = false;
    b.disabled = !on;
    $("#x-forget").hidden = !h;
  }
  async function openHist(hid, restore = null) {
    const el = $("#x-thread");
    resetEarlier(el, null); el._msgs = null;
    el._restore = restore && !restore.atBottom ? restore : null;
    primeThread(el, "h:" + hid);
    if (!hist.some((h) => h.id === hid)) await loadHistory();
    renderHistHead(hid);
    const h = hist.find((x) => x.id === hid);
    if (!h) { el.innerHTML = ""; el._restore = null; return; }
    try {
      const q = new URLSearchParams({ kind: h.kind, session: h.session, cwd: h.cwd });
      if (h.machine) q.set("machine", h.machine);
      const r = await api("/api/transcript?" + q);
      if (view === "ext" && extCur === "h:" + hid) {
        resetEarlier(el, (c) => `/api/transcript?${q}&before=${c}`);
        el._msgs = r.messages || []; el._liveEarlier = r.earlier || 0;
        keepThread("h:" + hid, el._msgs);
        el._redraw = () => { if (view === "ext" && extCur === "h:" + hid) drawThread(threadMsgs(el), el, "这个会话没有消息。"); };
        el._redraw();
      }
    } catch (err) {
      el._restore = null;
      if (view === "ext" && extCur === "h:" + hid) el.innerHTML = `<div class="thread-empty">${esc(err.message)}</div>`;
    }
  }
  const RESUME = { claude: (s) => ["--resume", s], codex: (s) => ["resume", s], agy: (s) => ["--conversation", s], doubao: (s) => ["--resume", s] };
  async function continueHist(hid) {
    const h = hist.find((x) => x.id === hid);
    if (!h || !RESUME[h.kind]) return;
    const b = $("#x-takeover");
    b.disabled = true; b.textContent = "正在打开…";
    try {
      const r = await api("/api/agents", { body: {
        kind: h.kind, cwd: h.cwd, machine: h.machine || "", name: "", label: histName(h).slice(0, 40), args: RESUME[h.kind](h.session),
      } });
      if (r.warning) toast(r.warning);
      await api(`/api/history/${encodeURIComponent(h.id)}/delete`, { body: {} }).catch(() => {});
      hist = hist.filter((x) => x.id !== h.id);
      renderHist();
      replaceHash("#/p/" + encodeURIComponent(r.pane_id));
      route();
    } catch (err) {
      toast(err.message, "attn");
      renderHistHead(hid);
    }
  }
  $("#x-forget").addEventListener("click", async () => {
    const hid = extCur?.startsWith("h:") && extCur.slice(2);
    if (!hid) return;
    try { await api(`/api/history/${encodeURIComponent(hid)}/delete`, { body: {} }); } catch (err) { toast(err.message, "attn"); return; }
    hist = hist.filter((x) => x.id !== hid);
    renderHist();
    if (store.get("last") === location.hash) store.set("last", "#/collie");
    goBack(true);
  });
  const extName = (e) => e.title || (e.cwd ? e.cwd.split("/").filter(Boolean).pop() : "") || KIND_LABEL[e.kind] || e.kind;
  // The sidebar, by what you need: what is going on now (herdr agents, yours
  // and Collie's, and other apps' running sessions), then what you did lately
  // (other apps' resting conversations and ended herdr sessions, merged).
  // Which computer something is on is a detail on its row.
  const RECENT_N = 8;
  const LIVE_PAGE_SIZE = 8;
  let livePage = 1, livePageTarget = null;
  const liveGroup = $("#live-group");
  liveGroup.open = store.get("liveGroupOpen", true);
  liveGroup.addEventListener("toggle", () => store.set("liveGroupOpen", liveGroup.open));
  function showLivePage(page) {
    livePageTarget = null;
    livePage = page;
    renderSessions();
  }
  $("#live-prev").addEventListener("click", () => showLivePage(livePage - 1));
  $("#live-next").addEventListener("click", () => showLivePage(livePage + 1));
  $("#live-page").addEventListener("change", (ev) => showLivePage(Number(ev.target.value)));
  let extAll = store.get("extAll", false);
  const EXT_STATE = { working: "在干活", waiting: "在等后台任务", idle: "开着，在等你", blocked: "等电脑那边确认" };
  const RANK = { working: 0, waiting: 0.5, starting: 1, blocked: 2, done: 3, unknown: 4, idle: 4 };
  function renderExt() { renderSessions(); }
  function renderSessions(workerThreadMap = null, allEntries = null) {
    const entries = allEntries || chatEntries();
    const wtMap = workerThreadMap || computeWorkerThreadMap(null, entries);
    const many = (state.machines || []).length > 1;
    const extRow = (e) => {
      const open = e.live && e.status === "idle";
      const name = extName(e);
      const where = [e.app || KIND_LABEL[e.kind] || e.kind, many && e.machine ? machineName(e.machine) : "", e.live && !open ? "" : ago(e.updated || e.started)].filter(Boolean).join(" · ");
      const dot = e.live ? `<span class="dot ${esc(e.status || "unknown")}" title="${esc(EXT_STATE[e.status] || "正在运行")}"></span>` : "";
      return `<li><a class="item ${e.live ? "" : "ended"} ${view === "ext" && extCur === e.id ? "active" : ""}" href="#/x/${encodeURIComponent(e.id)}" title="${esc(name)}">
        <span class="glyph">${GLYPHS[e.kind] || GLYPHS.agent}</span>
        <span class="body"><div class="name">${esc(name)}</div><div class="sub">${esc(where)}</div></span>${dot}</a></li>`;
    };
    const histRow = (h) => {
      const name = histName(h);
      const sub = [KIND_LABEL[h.kind] || h.kind, many ? machineName(h.machine) : "", ago(h.ended)].filter(Boolean).join(" · ");
      return `<li><a class="item ended ${view === "ext" && extCur === "h:" + h.id ? "active" : ""}" href="#/h/${encodeURIComponent(h.id)}" title="${esc(name)}">
        <span class="glyph">${GLYPHS[h.kind] || GLYPHS.agent}</span>
        <span class="body"><div class="name">${esc(name)}</div><div class="sub">${esc(sub)}</div></span></a></li>`;
    };

    // 进行中: what is running or has just finished (needs-you rows are already
    // above). Another app's session that is only open (kept alive in the
    // background, nothing running) is listed under 最近 by its time, its dot
    // saying it is still open.
    const going = (e) => e.live && e.status !== "idle" && e.status !== "unknown";
    const panes = state.agents.filter((a) => a.name !== ROUTER && a.status !== "blocked");
    const rank = (s) => RANK[s.status] ?? 3;
    const live = [...panes, ...ext.filter(going)].sort((a, b) => rank(a) - rank(b));
    const busy = live.filter((s) => rank(s) <= 1).length;
    setText($("#live-count"), live.length ? `共 ${live.length} 个${busy ? ` · ${busy} 个在跑` : ""}` : "");

    const pages = Math.max(1, Math.ceil(live.length / LIVE_PAGE_SIZE));
    // A deep link may resolve after the first poll. Reveal it once, then let
    // the viewer browse other pages while the selected conversation stays open.
    if (livePageTarget) {
      const index = live.findIndex((s) => (view === "pane" ? s.pane_id : s.id) === livePageTarget);
      if (index >= 0) {
        livePage = Math.floor(index / LIVE_PAGE_SIZE) + 1;
        livePageTarget = null;
      }
    }
    livePage = Math.max(1, Math.min(livePage, pages));
    $("#live-pages").hidden = pages === 1;
    $("#live-prev").disabled = livePage === 1;
    $("#live-next").disabled = livePage === pages;
    const picker = $("#live-page");
    if (picker.length !== pages) {
      if (pickOpen === picker) closePick();
      setHTML(picker, Array.from({ length: pages }, (_, i) => `<option value="${i + 1}">${i + 1} / ${pages}</option>`).join(""));
    }
    if (picker.value !== String(livePage)) {
      picker.value = String(livePage);
      syncPick(picker);
    }
    const offset = (livePage - 1) * LIVE_PAGE_SIZE;
    setHTML($("#live-list"), live.slice(offset, offset + LIVE_PAGE_SIZE)
      .map((s) => s.pane_id ? itemHTML(s, wtMap, entries) : extRow(s)).join("")
      || `<li class="empty-hint">没有在跑的会话。点右上角 + 新建，或让 Collie 派一个。</li>`);

    // 最近: newest first; Collie's own sessions are reached from its conversation.
    const collieWorkerNames = getWorkerLookup().byName;
    const collieRan = (name) => name === ROUTER || collieWorkerNames.has(name);
    const recent = [
      ...ext.filter((e) => !going(e)).map((e) => ({ id: e.id, t: +new Date(e.updated || e.started) || 0, html: extRow(e) })),
      ...hist.filter((h) => !collieRan(h.name)).map((h) => ({ id: "h:" + h.id, t: +new Date(h.ended) || 0, html: histRow(h) })),
    ].sort((x, y) => y.t - x.t);
    let shown = extAll ? recent : recent.slice(0, RECENT_N);
    const cur = view === "ext" && extCur && !shown.some((x) => x.id === extCur) && recent.find((x) => x.id === extCur);
    if (cur) shown = [...shown, cur];
    $("#recent-group").hidden = !recent.length;
    setHTML($("#recent-list"), shown.map((x) => x.html).join("")
      + (recent.length > RECENT_N ? `<li><button type="button" class="more-row" data-act="ext-more">${extAll ? "收起" : `还有 ${recent.length - RECENT_N} 个`}</button></li>` : ""));
  }
  // Look up the open session again in a moment (a few times at most).
  let extSoonT = null, extSoonN = 0;
  function extSoon() {
    if (extSoonT || extSoonN >= 15) return;
    extSoonN++;
    extSoonT = setTimeout(() => { extSoonT = null; if (view === "ext") loadExternal(); }, 1500);
  }
  function extWorking(gone) {
    const box = $("#x-working");
    const e = !gone && !extCur?.startsWith("h:") && ext.find((x) => x.id === extCur);
    const st = e && e.live ? e.status : "";
    const text = { working: `${e && e.app || "那边"}里还在跑…`, blocked: "在等你在电脑上确认" }[st] || "";
    const prev = box.hidden ? "" : box.textContent;
    if (!text) { box.hidden = true; return; }
    if (text === prev) return;
    const was = nearBottom($("#x-thread"));
    box.className = "working-row " + st;
    box.innerHTML = `<span class="dot ${st}"></span>${esc(text)}`;
    box.hidden = false;
    stick($("#x-thread"), was);
  }
  function renderExtHead(gone) {
    extWorking(gone);
    if (extCur?.startsWith("h:")) return renderHistHead(extCur.slice(2));
    $("#x-tag").textContent = "只读";
    $("#x-forget").hidden = true;
    $("#x-takeover").textContent = "在 herdr 里接管";
    $("#x-takeover").className = "btn primary small";
    $("#x-composer").hidden = true;
    const e = ext.find((x) => x.id === extCur);
    if (!e) {
      $("#x-status").textContent = gone ? "已退出" : "正在连接那台电脑…";
      $("#x-status").className = "status " + (gone ? "ended" : "unknown");
      $("#x-takeover").disabled = true;
      if (!gone) extSoon();
      return;
    }
    $("#x-name").textContent = extName(e);
    $("#x-kind").textContent = KIND_LABEL[e.kind] || e.kind;
    $("#x-status").textContent = gone ? "已退出" : `正在运行 · ${e.app || "另一个终端"}`;
    $("#x-status").className = "status " + (gone ? "ended" : "unknown");
    $("#x-cwd").textContent = (e.machine ? machineName(e.machine) + " · " : "") + tilde(e.cwd);
    const app = e.app || "另一个终端";
    if (!e.live && !gone) {
      // A desktop app's conversation that is not running right now.
      $("#x-tag").textContent = e.can_send ? "可对话" : "只读";
      $("#x-status").textContent = `上次活动 ${ago(e.updated || e.started)} · ${app}`;
      $("#x-status").className = "status ended";
      $("#x-takeover").hidden = !e.can_take_over;
      $("#x-takeover").disabled = false;
      $("#x-takeover").textContent = "在 herdr 里继续";
      $("#x-takeover").className = "btn small";
      $("#x-composer").hidden = !e.can_send;
      if (e.can_send) $("#x-hint").textContent = e.kind === "agy" ? "经 Antigravity 送达" : "经 Codex App 送达";
      $("#x-note").textContent = e.can_send ? ""
        : (e.read_only || "") + (e.can_take_over ? "。也可以在 herdr 里用同一个会话继续，之后就能在这里对话。" : "");
      return;
    }
    $("#x-takeover").hidden = !e.can_take_over;
    $("#x-note").textContent = gone ? "这个进程已经退出了。"
      : !e.session ? `它跑在 ${app} 里，还没有会话记录，所以没法接管。`
      : e.can_take_over
        ? `它跑在 ${app} 里，Collie 只能看，不能往里面打字。接管会先结束那边的进程（相当于按 Ctrl-C），再在 herdr 里接着同一个会话继续，之后就能在这里和它对话。`
        : `它跑在 ${app} 里，Collie 目前只能查看。`;
    $("#x-takeover").disabled = !!gone || !e.session;
    if (e.status && !gone) {
      $("#x-status").textContent = `${{ working: "正在跑", waiting: "在等后台任务", idle: "空闲，等你发话", blocked: "等电脑那边确认" }[e.status] || "正在运行"} · ${app}`;
      $("#x-status").className = "status " + e.status;
    }
    if (e.can_send && !gone) {
      // It takes messages where it runs: no need to take it over.
      $("#x-tag").textContent = "可对话";
      $("#x-composer").hidden = false;
      $("#x-takeover").className = "btn small";
      $("#x-hint").textContent = e.kind === "agy" ? "经 Antigravity 送达" : e.app === "Codex 桌面版" ? "经 Codex App 送达" : e.kind === "codex" ? "经 Codex 后台送达" : "经会话收件箱送达";
      $("#x-note").textContent = "";
    } else if (!gone && e.read_only) {
      $("#x-note").textContent = e.read_only + (e.session && e.can_take_over
        ? "。接管会先结束那边的进程（相当于按 Ctrl-C），再在 herdr 里接着同一个会话继续。"
        : "");
    }
  }
  bindComposer($("#x-composer"), $("#x-input"), async (text) => {
    const e = ext.find((x) => x.id === extCur);
    if (!e) throw new Error("这个会话已经结束了");
    const r = await api(`/api/external/${encodeURIComponent(e.id)}/send`, { body: { text } });
    if (r.note) toast(r.note, "attn");
  }, () => { // files go to the computer it runs on (through its hub, if another)
    const e = ext.find((x) => x.id === extCur);
    return e?.hub ? tagged(e.machine || "", e.hub) : e?.machine || "";
  });
  function closeExt() { extStream?.close(); extStream = null; }
  $("#recent-list").addEventListener("click", (ev) => {
    if (!ev.target.closest("[data-act=ext-more]")) return;
    ev.preventDefault();
    extAll = !extAll; store.set("extAll", extAll);
    renderExt();
  });
  async function openExt(id, restore = null) {
    closeExt();
    extCur = id;
    if (id.startsWith("h:")) return openHist(id.slice(2), restore);
    const el = $("#x-thread");
    el._msgs = null;
    el._restore = restore && !restore.atBottom ? restore : null;
    primeThread(el, "x:" + id);
    resetEarlier(el, (c) => `/api/external/${encodeURIComponent(id)}/earlier?before=${c}`);
    extSoonN = 0;
    if (!ext.some((e) => e.id === id)) void loadExternal();
    renderExtHead();
    const mine = () => view === "ext" && extCur === id;
    // The stream drops when the hub restarts or the computer reconnects:
    // try again in a moment, keeping what is on screen.
    let tries = 0;
    const connect = () => {
      const es = extStream = openES(`/api/external/${encodeURIComponent(id)}/chat`);
      es.addEventListener("meta", (ev) => {
        tries = 0; extSoonN = 0;
        if (!ext.some((e) => e.id === id)) loadExternal();
        if (mine() && !JSON.parse(ev.data).structured) el.innerHTML = `<div class="thread-empty">还没有找到这个会话的记录。</div>`;
      });
      const show = (msgs) => { keepThread("x:" + id, msgs); if (mine()) { drawThread(msgs, el, "这个会话还没有消息。"); extWorking(); } };
      el._redraw = () => show(threadMsgs(el));
      es.addEventListener("patch", (ev) => mine() && show(applyPatch(el, JSON.parse(ev.data))));
      es.addEventListener("messages", (ev) => { el._msgs = null; el._older = null; show(JSON.parse(ev.data)); }); // an older computer
      es.addEventListener("gone", () => { closeExt(); if (mine()) renderExtHead(true); });
      es.onerror = () => {
        if (es.readyState !== EventSource.CLOSED || extStream !== es || !mine()) return;
        if (++tries > 20) { renderExtHead(true); return; }
        if (!el.querySelector(".msg")) el.innerHTML = `<div class="thread-empty">连不上那台电脑，正在重试…</div>`;
        setTimeout(() => { if (extStream === es && mine()) connect(); }, Math.min(1000 * tries, 5000));
      };
    };
    connect();
  }
  $("#x-takeover").addEventListener("click", async () => {
    if (extCur?.startsWith("h:")) return continueHist(extCur.slice(2));
    const e = ext.find((x) => x.id === extCur);
    if (!e) return;
    const app = e.app || "另一个终端";
    if (e.live && !confirm(`接管「${extName(e)}」？\n\n会先结束 ${app} 里的这个 ${KIND_LABEL[e.kind] || e.kind} 进程（相当于按 Ctrl-C），然后在 herdr 里用同一个会话继续。${app} 那边会回到命令行。`)) return;
    const b = $("#x-takeover");
    const prevLabel = b.textContent;
    b.disabled = true; b.textContent = e.live ? "接管中…" : "启动中…";
    try {
      const r = await api(`/api/external/${encodeURIComponent(e.id)}/takeover`, { body: {} });
      toast(e.live ? "已在 herdr 里接管" : "已在 herdr 里继续");
      ext = ext.filter((x) => x.id !== e.id);
      renderExt();
      replaceHash("#/p/" + encodeURIComponent(r.pane_id));
      route();
    } catch (err) {
      toast(err.message, "attn");
      b.disabled = false;
    } finally { b.textContent = prevLabel; }
  });

  // ───────────────────────────── preferences (per device, in localStorage)
  const prefs = {
    theme: () => store.get("theme", "system"),
    text: () => store.get("text", "normal"),
    sendKey: () => store.get("sendKey", "enter"),
    notify: () => store.get("notify", true),
    fold: () => store.get("fold", true),
  };
  const darkMQ = matchMedia("(prefers-color-scheme: dark)");
  function applyLook() {
    const root = document.documentElement;
    const t = prefs.theme(), x = prefs.text();
    if (t === "system") delete root.dataset.theme; else root.dataset.theme = t;
    if (x === "normal") delete root.dataset.text; else root.dataset.text = x;
    const dark = t === "dark" || (t === "system" && darkMQ.matches);
    $$('meta[name="theme-color"]').forEach((m) => { m.removeAttribute("media"); m.content = dark ? "#0b0b0c" : "#ffffff"; });
    dispatchEvent(new Event("collie:theme"));
  }
  darkMQ.addEventListener("change", applyLook);
  addEventListener("storage", (ev) => {
    if (!ev.key || ev.key === "collie.theme" || ev.key === "collie.text") applyLook();
  });
  applyLook();

  function renderPrefs(restore = null) {
    const seg = (key, cur, opts) => `<div class="seg" data-pref="${key}">${opts.map(([v, label]) =>
      `<button type="button" data-v="${v}" class="${v === cur ? "on" : ""}">${label}</button>`).join("")}</div>`;
    const sw = (key, on, disabled = false) => `<button type="button" class="switch" role="switch" aria-checked="${on}" data-pref="${key}"${disabled ? " disabled" : ""}></button>`;
    const row = (title, sub, ctl, warn = false) => `<div class="pref"><div class="pl"><b>${title}</b>${sub ? `<small${warn ? ' class="pref-hint-warn"' : ""}>${sub}</small>` : ""}</div>${ctl}</div>`;
    const env = notifyEnvState();
    const notifyCtl = env.active
      ? `<div class="pref-ctls"><button type="button" class="btn small ghost pref-test-btn" data-act="test-notify">测试</button>${sw("notify", true)}</div>`
      : sw("notify", false, !env.supported);
    const mac = /Mac|iPhone|iPad/.test(navigator.platform);
    $("#prefs-body").innerHTML = `<div class="prefs">
      <div class="card"><div class="card-h">外观</div>
        ${row("主题", "跟随系统时，设备切到深色模式这里也跟着变", seg("theme", prefs.theme(), [["system", '<span class="theme-swatch system"></span>跟随系统'], ["light", '<span class="theme-swatch light"></span>浅色'], ["dark", '<span class="theme-swatch dark"></span>深色']]))}
        ${row("对话文字", "", seg("text", prefs.text(), [["small", "小"], ["normal", "标准"], ["large", "大"]]))}
      </div>
      <div class="card"><div class="card-h">对话</div>
        ${row("打开 agent 时显示", "对话：从会话记录整理的消息；屏幕：终端原样；日志：自动换行的滚动输出", seg("mode2", mode, [["chat", "对话"], ["screen", "屏幕"], ["log", "日志"]]))}
        ${row("发送消息", "另一种按法用来换行；Shift+Enter 总是换行", seg("sendKey", prefs.sendKey(), [["enter", "Enter"], ["mod", mac ? "⌘ Enter" : "Ctrl Enter"]]))}
        ${row("折叠连续的工具步骤", "超过 3 步时收成一行，只露出最后一步", sw("fold", prefs.fold()))}
      </div>
      <div class="card"><div class="card-h">通知</div>
        ${row("浏览器通知", esc(env.text), notifyCtl, env.warn)}
      </div>
      <div class="card"><div class="card-h">登录状态</div>
        ${row("退出登录", "清除当前浏览器的登录凭证，下次需要重新配对或输入访问令牌", `<button type="button" class="btn small danger-ghost" data-act="logout">退出登录</button>`)}
      </div>
      <p class="panel-intro">Collie 本身的设置（它自己用哪个 agent、派活默认在哪台电脑、通知机器人）在 <a href="#/auto" data-auto-tab="settings">自动化 → 设置</a>；电脑和手机的连接在 <a href="#/devices">设备</a>。</p>
    </div>`;
    if (restore) restoreSimpleScroll($("#prefs-body"), restore);
  }
  $("#prefs-body").addEventListener("click", async (e) => {
    const link = e.target.closest("a[data-auto-tab]");
    if (link) autoTab = link.dataset.autoTab;
    const b = e.target.closest(".seg[data-pref] button, button.switch[data-pref]");
    if (!b || b.disabled) return;
    if (b.classList.contains("switch")) {
      const key = b.dataset.pref, on = b.getAttribute("aria-checked") !== "true";
      if (key === "notify" && on) {
        const env = notifyEnvState();
        if (!env.supported) { toast(env.text, "attn"); renderPrefs(); return; }
        if (env.permission === "denied") {
          toast("已被浏览器拦截，请在地址栏左侧站点设置中重新开启", "attn");
          renderPrefs();
          return;
        }
        if (env.permission !== "granted") {
          let p = "denied";
          try { p = await Notification.requestPermission(); } catch { p = "denied"; }
          if (p !== "granted") {
            toast(p === "denied" ? "已被浏览器拦截，请在地址栏左侧站点设置中重新开启" : "浏览器没有允许通知", "attn");
            renderPrefs();
            return;
          }
        }
      }
      store.set(key, on);
    } else {
      const key = b.closest("[data-pref]").dataset.pref, v = b.dataset.v;
      if (key === "mode2") setMode(v); else store.set(key, v);
      if (key === "theme" || key === "text") applyLook();
      if (key === "sendKey") syncThreadComposerHint();
    }
    renderPrefs();
  });

  // ───────────────────────────── devices
  let devTimer;
  let devAddr = store.get("pairAddr", "");
  let pairing = { browser: null, machine: null }; // {code, expires}

  function openDevices(restore = null) {
    clearInterval(devTimer);
    if (restore) restoreSimpleScroll($("#devices-body"), restore);
    loadDevices(restore);
    devTimer = setInterval(() => loadDevices(), 5000);
  }

  async function newCode(kind) {
    const r = await api("/api/pair/new", { body: { kind } });
    pairing[kind] = { code: r.code, expires: new Date(r.expires).getTime() };
    return r;
  }

  const left = (p) => { const s = Math.max(0, Math.round((p.expires - Date.now()) / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

  // A newer release: one restrained primary capsule when any online machine
  // lags behind, and per-machine controls on the devices page kept in sync.
  const INSTALL = "curl -fsSL https://lihuanyu0w0.github.io/collie/install.sh | sh -s --";
  const isOld = (have, latest) => {
    const p = (v) => /^v\d+\.\d+\.\d+$/.test(v || "") ? v.slice(1).split(".").map(Number) : null;
    const a = p(have), b = p(latest);
    if (!a || !b) return false;
    for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] < b[i];
    return false;
  };
  const UPDATE_REQUEST_TIMEOUT_MS = 185_000;
  const UPDATE_REQ_OPTS = {
    body: {},
    timeout: UPDATE_REQUEST_TIMEOUT_MS,
    timeoutMessage: "更新请求超时（可能下载较慢或网络卡顿），请检查网络后重试或刷新查看版本",
    networkMessage: "连接中断，请检查网络或稍候刷新查看是否已更新",
  };
  const cleanUpdateError = (err) => String(err?.message || "更新失败").replace(/^更新失败[：:]\s*/, "").trim() || "更新失败";
  let versionInfo = { version: "", latest: "", outdated: [], machines: [] };
  let versionRetryT = null, versionRetries = 0;
  const updateFlow = {
    busy: false, phase: "idle", scope: "", targetVersion: "",
    total: 0, index: 0, currentId: null, currentName: "", failedId: "", failedMachine: "", error: "",
    errors: new Map(),
  };
  function resetUpdateFlow(keepErrors = false) {
    updateFlow.busy = false; updateFlow.phase = "idle"; updateFlow.scope = "";
    updateFlow.targetVersion = ""; updateFlow.total = 0; updateFlow.index = 0;
    updateFlow.currentId = null; updateFlow.currentName = "";
    updateFlow.failedId = ""; updateFlow.failedMachine = ""; updateFlow.error = "";
    if (!keepErrors) updateFlow.errors.clear();
  }
  function updateNoteState(id) {
    if (updateFlow.busy && updateFlow.currentId === id) {
      if (updateFlow.phase === "restarting") {
        return { cls: "busy", text: "新版本已就绪，正在重启并等待页面自动刷新…", alert: false };
      }
      if (updateFlow.phase === "reconnecting") {
        return { cls: "busy", text: "节点已更新，正在等待重新上线…", alert: false };
      }
      const ver = updateFlow.targetVersion || versionInfo.latest || "新版本";
      return { cls: "busy", text: `正在下载并校验 ${ver}，完成后自动重启（运行中的 agent 不受影响）…`, alert: false };
    }
    const err = updateFlow.errors.get(id);
    if (err) return { cls: "error", text: `更新失败：${err}`, alert: true };
    return null;
  }
  function updateBtnHtml(id, latest) {
    if (updateFlow.busy && updateFlow.currentId === id) {
      const label = updateFlow.phase === "restarting" ? "重启中…" : updateFlow.phase === "reconnecting" ? "重连中…" : "更新中…";
      return `<span class="up-spin" aria-hidden="true"></span><span>${esc(label)}</span>`;
    }
    if (updateFlow.errors.has(id)) return esc(latest ? `重试更新到 ${latest}` : "重试更新");
    return esc(latest ? `更新到 ${latest}` : "更新");
  }
  function outdatedOnlineMachines() {
    const latest = versionInfo.latest;
    if (!latest) return [];
    const byId = new Map();
    for (const m of versionInfo.machines || []) {
      const id = m.local ? "" : (m.id || "");
      byId.set(id, { id, name: m.name || (m.local ? "hub" : id), version: m.version || "", local: !!m.local, online: m.local ? true : !!m.online });
    }
    for (const m of localState.machines || []) {
      const id = m.local ? "" : (m.id || "");
      const prev = byId.get(id);
      byId.set(id, {
        id,
        name: m.name || prev?.name || (m.local ? "hub" : id),
        version: m.local ? (m.version || versionInfo.version || prev?.version || "") : (m.version || prev?.version || ""),
        local: !!m.local,
        online: m.local ? true : !!m.online,
      });
    }
    let out = [];
    if (byId.size) {
      for (const m of byId.values()) {
        if ((m.local || m.online) && isOld(m.version, latest)) out.push(m);
      }
    } else if (versionInfo.outdated?.length) {
      // Backwards-compatible fallback when talking to an older hub without `machines`.
      const names = new Set(versionInfo.outdated);
      if (isOld(versionInfo.version, latest)) out.push({ id: "", name: versionInfo.outdated[0] || "hub", version: versionInfo.version, local: true, online: true });
      for (const m of localState.machines || []) {
        if (!m.local && m.online && names.has(m.name)) out.push({ id: m.id, name: m.name, version: m.version || "", local: false, online: true });
      }
    }
    // Always update remote nodes first so restarting the hub never drops node tunnels.
    out.sort((a, b) => (a.local === b.local ? a.name.localeCompare(b.name) : a.local ? 1 : -1));
    return out;
  }
  function updatePillButtons() {
    return [$("#update-all-btn"), $("#collie-update-btn")].filter(Boolean);
  }
  function renderUpdateEntry() {
    const btns = updatePillButtons();
    if (!btns.length) return;
    const list = outdatedOnlineMachines();
    for (const k of [...updateFlow.errors.keys()]) {
      const m = (versionInfo.machines || []).find((x) => (x.local ? "" : (x.id || "")) === k);
      if (m && versionInfo.latest && !isOld(m.version, versionInfo.latest)) updateFlow.errors.delete(k);
    }
    const latest = updateFlow.targetVersion || versionInfo.latest;
    if (!updateFlow.busy && !list.length) {
      if (updateFlow.phase === "failed" && !updateFlow.errors.size) resetUpdateFlow();
      for (const b of btns) {
        b.hidden = true;
        b.removeAttribute("aria-disabled");
        b.classList.remove("busy", "failed");
      }
      syncDeviceUpdateButtons();
      return;
    }
    let html = "", compactHtml = "", tip = "", aria = "", cls = "";
    const busy = updateFlow.busy;
    if (updateFlow.phase === "updating") {
      const step = updateFlow.total > 1 ? ` ${updateFlow.index}/${updateFlow.total}` : "";
      const label = `更新中${step}…`;
      html = `<span class="up-spin" aria-hidden="true"></span><span>${esc(label)}</span>`;
      compactHtml = html;
      tip = `正在更新 ${updateFlow.currentName}${step ? `（${updateFlow.index}/${updateFlow.total}）` : ""}…`;
      aria = `${label}，正在更新 ${updateFlow.currentName}`;
      cls = "busy";
    } else if (updateFlow.phase === "restarting") {
      html = `<span class="up-spin" aria-hidden="true"></span><span>重启中…</span>`;
      compactHtml = html;
      tip = `正在重启 ${updateFlow.currentName || "hub"}，恢复后自动刷新`;
      aria = `重启中…，恢复后自动刷新`;
      cls = "busy";
    } else if (updateFlow.phase === "reconnecting") {
      html = `<span class="up-spin" aria-hidden="true"></span><span>重连中…</span>`;
      compactHtml = html;
      tip = "节点已更新，正在等待重连…";
      aria = "重连中…，等待节点上线";
      cls = "busy";
    } else if (updateFlow.phase === "failed") {
      html = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg><span>重试更新</span>`;
      compactHtml = html;
      tip = `更新 ${updateFlow.failedMachine || "设备"} 失败：${updateFlow.error}（点此重试）`;
      aria = `重试更新（${updateFlow.failedMachine || "设备"} 失败：${updateFlow.error}）`;
      cls = "failed";
    } else {
      const names = list.map((m) => m.name).join("、");
      const arrow = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M6 11l6-6 6 6"/></svg>`;
      html = `${arrow}<span>更新到 ${esc(latest)}</span>`;
      compactHtml = `${arrow}<span>${esc(latest)}</span>`;
      tip = `一键更新到 ${latest}（待更新：${names}）`;
      aria = `一键更新到 ${latest}（待更新：${names}）`;
    }
    for (const b of btns) {
      const nextHtml = b.id === "collie-update-btn" ? compactHtml : html;
      b.hidden = false;
      b.classList.toggle("busy", cls === "busy");
      b.classList.toggle("failed", cls === "failed");
      if (busy) b.setAttribute("aria-disabled", "true"); else b.removeAttribute("aria-disabled");
      b.title = tip;
      b.setAttribute("aria-label", aria);
      if (b.innerHTML !== nextHtml) b.innerHTML = nextHtml;
    }
    syncDeviceUpdateButtons();
  }
  function syncDeviceUpdateButtons() {
    if (view !== "devices") return;
    const latest = versionInfo.latest;
    for (const b of $$("#devices-body button[data-update]")) {
      const id = b.dataset.update;
      const isMe = updateFlow.busy && updateFlow.currentId === id;
      b.disabled = updateFlow.busy;
      b.setAttribute("aria-busy", isMe ? "true" : "false");
      const nextHtml = updateBtnHtml(id, latest);
      if (b.innerHTML !== nextHtml) b.innerHTML = nextHtml;
    }
    for (const n of $$("#devices-body [data-update-note]")) {
      const st = updateNoteState(n.dataset.updateNote);
      if (!st) {
        n.hidden = true;
        n.className = "update-note";
        n.removeAttribute("role");
        n.textContent = "";
      } else {
        n.hidden = false;
        n.className = `update-note ${st.cls}`;
        if (st.alert) n.setAttribute("role", "alert"); else n.removeAttribute("role");
        n.textContent = st.text;
      }
    }
  }
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function waitForHubRestartAndReload(targetVersion) {
    updateFlow.phase = "restarting";
    renderUpdateEntry();
    await sleep(window.__collieDemo ? 300 : 1200);
    let sawDown = false;
    const maxTries = 60;
    for (let i = 0; i < maxTries; i++) {
      const t = timeoutSignal(5000);
      try {
        const res = await authFetch("/api/version", { cache: "no-store", credentials: "same-origin", signal: t.signal });
        if (res.ok) {
          const wb = res.headers.get("X-Collie-Web");
          const data = await res.json().catch(() => ({}));
          if (sawDown || (data.version && !isOld(data.version, targetVersion)) || (wb && webBuild && wb !== webBuild)) {
            location.reload();
            return true;
          }
        } else if (res.status >= 500) {
          sawDown = true;
        }
      } catch {
        sawDown = true;
      } finally {
        t.clear();
      }
      await sleep(1500);
    }
    updateFlow.busy = false;
    updateFlow.phase = "failed";
    updateFlow.failedId = "";
    updateFlow.failedMachine = updateFlow.currentName || "hub";
    updateFlow.error = "等待重启恢复超时，请刷新页面或重试";
    updateFlow.errors.set("", updateFlow.error);
    toast("等待 hub 重启恢复超时，请手动刷新页面", "attn");
    renderUpdateEntry();
    return false;
  }
  async function waitForNodesReconnect(targetVersion) {
    updateFlow.phase = "reconnecting";
    renderUpdateEntry();
    for (let i = 0; i < 16; i++) {
      await sleep(window.__collieDemo ? 200 : 1500);
      await checkUpdates();
      if (!outdatedOnlineMachines().length) {
        resetUpdateFlow();
        renderUpdateEntry();
        if (view === "devices") loadDevices();
        toast(`已全部更新到 ${targetVersion}`);
        return;
      }
    }
    resetUpdateFlow();
    renderUpdateEntry();
    if (view === "devices") loadDevices();
    toast("已触发更新，等待节点重连");
  }
  async function runUpdateAll() {
    if (updateFlow.busy) return;
    const targets = outdatedOnlineMachines();
    if (!targets.length) { await checkUpdates(); return; }
    const targetVersion = versionInfo.latest;
    updateFlow.busy = true;
    updateFlow.phase = "updating";
    updateFlow.scope = "all";
    updateFlow.targetVersion = targetVersion;
    updateFlow.total = targets.length;
    updateFlow.index = 0;
    updateFlow.currentId = null;
    updateFlow.currentName = "";
    updateFlow.failedId = "";
    updateFlow.failedMachine = "";
    updateFlow.error = "";
    renderUpdateEntry();
    let restartedHub = false;
    let updatedAnyRemote = false;
    for (let i = 0; i < targets.length; i++) {
      const m = targets[i];
      updateFlow.index = i + 1;
      updateFlow.currentId = m.id;
      updateFlow.currentName = m.name;
      updateFlow.errors.delete(m.id);
      renderUpdateEntry();
      try {
        const qs = m.id ? "?" + new URLSearchParams({ machine: m.id }) : "";
        const r = await api("/api/update" + qs, UPDATE_REQ_OPTS);
        if (m.local) {
          if (!r.latest) {
            restartedHub = true;
            await waitForHubRestartAndReload(r.version || targetVersion);
            return;
          }
        } else {
          updatedAnyRemote = true;
          // Give the remote node's self-exec a moment before touching the hub.
          if (!r.latest && i + 1 < targets.length && targets[i + 1].local) {
            await sleep(window.__collieDemo ? 150 : 1000);
          }
        }
      } catch (err) {
        const msg = cleanUpdateError(err);
        updateFlow.busy = false;
        updateFlow.phase = "failed";
        updateFlow.failedId = m.id;
        updateFlow.failedMachine = m.name;
        updateFlow.error = msg;
        updateFlow.errors.set(m.id, msg);
        toast(`更新 ${m.name} 失败：${msg}`, "attn");
        renderUpdateEntry();
        checkUpdates();
        return;
      }
    }
    if (!restartedHub) {
      if (updatedAnyRemote) {
        await waitForNodesReconnect(targetVersion);
      } else {
        resetUpdateFlow();
        await checkUpdates();
        if (view === "devices") loadDevices();
        toast("全端已是最新版本");
      }
    }
  }
  for (const b of updatePillButtons()) b.addEventListener("click", runUpdateAll);

  async function checkUpdates() {
    clearTimeout(versionRetryT);
    try {
      const r = await api("/api/version");
      versionInfo = {
        version: r.version || "",
        latest: r.latest || "",
        outdated: Array.isArray(r.outdated) ? r.outdated : [],
        machines: Array.isArray(r.machines) ? r.machines : [],
      };
      if (r.latest) {
        versionRetries = 0;
      } else if (versionRetries < 6) {
        versionRetries++;
        versionRetryT = setTimeout(checkUpdates, 5000);
      }
      renderUpdateEntry();
    } catch {}
  }
  setInterval(checkUpdates, 30 * 60 * 1000);
  // Which agents a computer has: nothing when not known (an older node).
  const agentsTag = (list) => !Array.isArray(list) ? ""
    : list.length ? `<span title="这台电脑上装了的 agent">${list.map((k) => esc(AGENT_LABEL[k] || k)).join(" · ")}</span>`
    : `<span class="tag attn" title="找不到 claude、codex、agy、doubao 命令：装一个，再重连这台电脑">没装 agent</span>`;
  const verTag = (have, latest, cmd) => !have ? "" : isOld(have, latest)
    ? `<span class="tag attn" title="${esc("更新：" + cmd)}">${esc(have)} → ${esc(latest)}</span>` : `<span>${esc(have)}</span>`;
  const updateRow = (have, latest, cmd, note, id, name) => {
    if (!isOld(have, latest)) return "";
    const busy = updateFlow.busy;
    const isMe = busy && updateFlow.currentId === id;
    const st = updateNoteState(id);
    const noteHtml = st
      ? `<div class="update-note ${st.cls}" data-update-note="${esc(id)}"${st.alert ? ' role="alert"' : ""}>${esc(st.text)}</div>`
      : `<div class="update-note" data-update-note="${esc(id)}" hidden></div>`;
    return `<div class="update-cmd"><p class="pair-hint">有新版本 ${esc(latest)}。<button class="btn small primary" data-update="${esc(id)}" data-name="${esc(name)}" aria-busy="${isMe ? "true" : "false"}"${busy ? " disabled" : ""}>${updateBtnHtml(id, latest)}</button></p>${noteHtml}<p class="pair-hint muted">如果自动更新失败或需要手动安装，在这台电脑上运行${note ? "（" + esc(note) + "）" : ""}：</p><div class="code"><span>${esc(cmd)}</span><button class="icon-btn" data-copy="${esc(cmd)}" title="复制"><svg viewBox="0 0 24 24"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg></button></div></div>`;
  };

  async function loadDevices(restore = null) {
    const body = $("#devices-body");
    const keepTop = !restore && body.clientHeight > 0 ? { scrollTop: body.scrollTop, atBottom: body.scrollHeight - body.scrollTop - body.clientHeight <= AT_BOTTOM_PX } : null;
    let r;
    try { r = await api("/api/devices"); } catch (err) { body.innerHTML = `<p class="panel-intro">${esc(err.message)}</p>`; return; }
    if (view !== "devices") return;
    if (r.latest && r.latest !== versionInfo.latest) {
      versionInfo.latest = r.latest;
      if (r.hub?.version) versionInfo.version = r.hub.version;
      checkUpdates();
    }
    const addrs = r.addresses || [];
    if (!addrs.includes(devAddr)) devAddr = addrs[0] || location.origin;
    const fresh = (k) => pairing[k] && pairing[k].expires - Date.now() > 15000;
    if (!fresh("browser")) await newCode("browser").catch(() => {});
    const pb = pairing.browser;
    const phoneURL = pb ? `${devAddr}/?pair=${pb.code}` : "";
    const pm = fresh("machine") ? pairing.machine : null;
    const nodeCmd = pm ? `collie node --hub ${devAddr} --code ${pm.code}` : "";
    const installCmd = pm ? `curl -fsSL https://lihuanyu0w0.github.io/collie/install.sh | sh -s -- node --hub ${devAddr} --code ${pm.code}` : "";
    const machines = r.devices.filter((d) => d.kind === "machine");
    const browsers = r.devices.filter((d) => d.kind !== "machine");
    const addrSel = addrs.length > 1 ? `<label class="addr-pick">用这个地址<select id="dev-addr" data-pick="compact">${addrs.map((a) => `<option ${a === devAddr ? "selected" : ""}>${esc(a)}</option>`).join("")}</select></label>` : "";
    const keepOpen = (pickOpen && pickOpen.id === "dev-addr") || document.activeElement?.id === "dev-addr" || document.activeElement?.closest?.("#add-hub");
    if (keepOpen) return; // don't redraw under an open select or a half-typed form
    const typed = [...document.querySelectorAll("#add-hub input")].map((i) => i.value);

    $("#devices-body").innerHTML = `
      <p class="panel-intro">Collie 适合放在一台常开的开发机上当 hub：手机、平板和浏览器只连 hub；你的 Mac 等电脑运行 <code>collie node</code> 主动连上来，hub 就能在上面开 agent、看对话、处理确认。不用开端口，也不需要 SSH。</p>

      <div class="pair-grid">
        <div class="card pair-card">
          <div class="card-h">连接手机或平板</div>
          <div class="qr-wrap">${pb ? `<img class="qr" alt="配对二维码" src="demo-qr.png?text=${encodeURIComponent(phoneURL)}">` : ""}</div>
          <p class="pair-hint">用相机扫一下，在浏览器里打开即可，之后可「添加到主屏幕」。<b>${pb ? left(pb) : ""}</b> 内有效，只能用一次。</p>
          <div class="code"><span>${esc(phoneURL)}</span><button class="icon-btn" data-copy="${esc(phoneURL)}" title="复制"><svg viewBox="0 0 24 24"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg></button></div>
          ${addrSel}
        </div>

        <div class="card pair-card">
          <div class="card-h">连接一台电脑</div>
          <p class="pair-hint">在那台电脑上装好 herdr、git 和 Go 1.25+，然后运行（从源码编译 Collie，并作为后台服务常驻）：</p>
          ${pm ? `<div class="code big"><span>${esc(installCmd)}</span><button class="icon-btn" data-copy="${esc(installCmd)}" title="复制"><svg viewBox="0 0 24 24"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg></button></div>
               <p class="pair-hint">已经装了 collie 的话：</p>
               <div class="code"><span>${esc(nodeCmd)}</span><button class="icon-btn" data-copy="${esc(nodeCmd)}" title="复制"><svg viewBox="0 0 24 24"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg></button></div>
               <p class="pair-hint"><b>${left(pm)}</b> 内有效，只能用一次。之后它会自动重连。</p>`
             : `<button class="btn primary small" id="new-node-code">生成连接命令</button>`}
          <p class="pair-hint muted">需要这台电脑能访问上面的地址（同一内网或 VPN）。</p>
        </div>
      </div>

      <div class="card"><div class="card-h">电脑</div><ul class="rows">
        <li class="row dev-row">
          <span class="dot ${r.hub.herdr ? "online" : "offline"}"></span>
          <div><div class="meta"><b>${esc(r.hub.name)}</b><span class="tag">hub</span>${verTag(r.hub.version, r.latest, INSTALL + " hub")}${agentsTag(r.hub.agents)}${r.hub.herdr ? "" : "<span>没检测到 herdr，这台只当 hub 用</span>"}</div><div class="text mono">${esc(tilde(r.hub.home))}</div>${updateRow(r.hub.version, r.latest, INSTALL + " hub", "装 hub 时加过 --url 等参数的话照样带上", "", r.hub.name)}</div>
          <span class="right">${r.hub.herdr ? "在线" : ""}</span></li>
        ${machines.map((d) => `<li class="row dev-row">
          <span class="dot ${d.online ? "online" : "offline"}"></span>
          <div><div class="meta"><b>${esc(d.name)}</b><span>${esc(d.os || "")}</span>${verTag(d.version, r.latest, INSTALL + " node")}${d.online ? agentsTag(d.agents) : ""}<span>${d.online ? "在线" : "离线 · 上次 " + when(d.last_seen)}</span></div><div class="text mono">${esc(d.home ? tilde(d.home) : "")}</div>${updateRow(d.version, r.latest, INSTALL + " node", "", d.id, d.name)}</div>
          <button class="btn ghost small" data-del-dev="${esc(d.id)}" data-name="${esc(d.name)}">移除</button></li>`).join("")}
      </ul></div>

      <div class="card"><div class="card-h">其他 hub</div>
        <p class="pair-hint">别的网络里的 Collie hub（云电脑、家里的电脑）。和这台 hub 不通也没关系：只要这个浏览器能打开它，它的会话就会出现在侧栏里。</p>
        <ul class="rows">${hubs.map((h) => { const on = remote.get(h.key)?.online; return `<li class="row dev-row">
          <span class="dot ${on ? "online" : "offline"}"></span>
          <div><div class="meta"><b>${esc(h.name)}</b><span>${on ? "在线" : "连不上"}</span></div><div class="text mono">${esc(h.url)}</div></div>
          <button class="btn ghost small" data-del-hub="${esc(h.key)}" data-name="${esc(h.name)}">移除</button></li>`; }).join("")}
        </ul>
        <form id="add-hub" class="hub-add">
          <input name="link" required autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" placeholder="粘贴那个 hub「设备 → 连接手机或平板」里的链接">
          <input name="name" autocomplete="off" placeholder="叫它什么（可选）">
          <button class="btn primary small">添加</button>
        </form>
        <p class="pair-hint muted">那个 hub 也要是 v0.2.4 以后的版本。</p>
      </div>

      <div class="card"><div class="card-h">手机和浏览器</div><ul class="rows">
        ${browsers.length ? browsers.map((d) => `<li class="row dev-row">
          <span class="dot unknown"></span>
          <div><div class="meta"><b>${esc(d.name)}</b>${d.current ? '<span class="tag">当前</span>' : ""}<span>最近 ${when(d.last_seen)}</span></div></div>
          <button class="btn ghost small" data-del-dev="${esc(d.id)}" data-name="${esc(d.name)}">移除</button></li>`).join("")
        : `<li class="empty-row">还没有配对过的手机。用访问令牌登录的浏览器不在这里列出。</li>`}
      </ul></div>`;
    document.querySelectorAll("#add-hub input").forEach((i, n) => { i.value = typed[n] || ""; });
    if (restore) restoreSimpleScroll(body, restore);
    else if (keepTop && !keepTop.atBottom) { markProgrammaticScroll(); body.scrollTop = keepTop.scrollTop; }
  }

  $("#devices-body").addEventListener("change", (e) => {
    if (e.target.id === "dev-addr") { devAddr = e.target.value; store.set("pairAddr", devAddr); e.target.blur(); loadDevices(); }
  });
  // Adding another hub: its phone link carries a one-time pairing code; trade
  // it for a token of its own (the cookie that link would set can't be used
  // from this page) and keep the token here, for every browser of this hub.
  $("#devices-body").addEventListener("submit", async (e) => {
    if (e.target.id !== "add-hub") return;
    e.preventDefault();
    const f = e.target, btn = f.querySelector("button");
    let u;
    try { u = new URL(f.link.value.trim()); } catch { toast("链接不对：要以 http:// 或 https:// 开头", "attn"); return; }
    const code = u.searchParams.get("pair");
    if (!code) { toast("链接里没有配对码（?pair=…），在那个 hub 的「设备」页复制「连接手机或平板」下面的链接", "attn"); return; }
    const url = (u.origin + u.pathname).replace(/\/+$/, "");
    if (url === location.origin) { toast("这就是当前这个 hub", "attn"); return; }
    if (location.protocol === "https:" && u.protocol === "http:") { toast("这个页面是 https，浏览器不让它连 http 的 hub", "attn"); return; }
    btn.disabled = true;
    try {
      let res;
      try {
        res = await fetch(url + "/api/pair", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "omit",
          body: JSON.stringify({ code, kind: "browser", name: "hub " + location.host, want_token: true }) });
      } catch { throw new Error("这个浏览器连不上 " + url + "（或者它还是旧版本，不允许跨站访问）"); }
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.token) throw new Error(d.error || (res.ok ? "那个 hub 是旧版本，先升级到 v0.2.4" : res.statusText));
      const key = "h" + Math.random().toString(36).slice(2, 8);
      const name = f.name.value.trim().slice(0, 30) || u.hostname.split(".")[0];
      const next = [...hubs, { key, name, url, token: d.token }];
      hubs = (await api("/api/hubs", { body: { hubs: next } })).hubs;
      f.reset();
      toast(`已添加 ${name}`);
      await loadHubs();
      setTimeout(loadExternal, 1500);
      loadDevices();
    } catch (err) { toast(err.message, "attn"); }
    finally { btn.disabled = false; }
  });
  $("#devices-body").addEventListener("click", async (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    try {
      if (b.dataset.copy) { await copy(b.dataset.copy); toast("已复制"); }
      else if (b.id === "new-node-code") { await newCode("machine"); loadDevices(); }
      else if (b.dataset.update !== undefined) {
        if (updateFlow.busy) return;
        const id = b.dataset.update, name = b.dataset.name || (id || "hub");
        updateFlow.busy = true;
        updateFlow.phase = "updating";
        updateFlow.scope = "single";
        updateFlow.targetVersion = versionInfo.latest;
        updateFlow.total = 1;
        updateFlow.index = 1;
        updateFlow.currentId = id;
        updateFlow.currentName = name;
        updateFlow.failedId = "";
        updateFlow.failedMachine = "";
        updateFlow.error = "";
        updateFlow.errors.delete(id);
        renderUpdateEntry();
        try {
          const qs = id ? "?" + new URLSearchParams({ machine: id }) : "";
          const r = await api("/api/update" + qs, UPDATE_REQ_OPTS);
          if (!id && !r.latest) {
            toast(`已更新到 ${r.version}，正在重启`);
            await waitForHubRestartAndReload(r.version || versionInfo.latest);
            return;
          }
          toast(r.latest ? "已经是最新版" : `已更新到 ${r.version}，正在重启`);
          if (id && !r.latest) {
            await waitForNodesReconnect(r.version || versionInfo.latest);
          } else {
            resetUpdateFlow();
            await checkUpdates();
            loadDevices();
          }
        } catch (err) {
          const msg = cleanUpdateError(err);
          updateFlow.busy = false;
          updateFlow.phase = "failed";
          updateFlow.failedId = id;
          updateFlow.failedMachine = name;
          updateFlow.error = msg;
          updateFlow.errors.set(id, msg);
          renderUpdateEntry();
          toast(`更新 ${name} 失败：${msg}`, "attn");
          checkUpdates();
        }
      }
      else if (b.dataset.delHub) {
        if (!confirm(`不再显示「${b.dataset.name}」的会话？那个 hub 本身不受影响。`)) return;
        hubs = (await api("/api/hubs", { body: { hubs: hubs.filter((h) => h.key !== b.dataset.delHub) } })).hubs;
        await loadHubs(); loadExternal(); loadHistory(); loadDevices();
      }
      else if (b.dataset.delDev) {
        if (!confirm(`移除「${b.dataset.name}」？它需要重新配对才能再连进来。`)) return;
        await api(`/api/devices/${encodeURIComponent(b.dataset.delDev)}/delete`, { body: {} });
        loadDevices();
      }
    } catch (err) { toast(err.message, "attn"); }
  });

  // Clipboard API needs a secure context; plain-http LAN addresses fall back.
  async function copy(text) {
    if (!await copyText(text)) throw new Error("复制失败");
  }

  // ───────────────────────────── one agent: header
  function renderHead() {
    const v = find(current);
    if (!v) return;
    markSeen(v);
    $("#d-name").textContent = v.name === ROUTER ? "Collie 的终端" : v.is_agent ? title(v) : v.workspace_label || base(tilde(v.cwd));
    $("#d-name").title = v.is_agent && v.name && v.name !== ROUTER ? `名字：${v.name}` : "";
    $("#d-kind").textContent = v.is_agent ? (KIND_LABEL[v.kind] || v.kind) : "";
    const role = isWorker(v.name) ? "Collie 派出" : "";
    $("#d-worker").hidden = !role;
    $("#d-worker").textContent = role;
    const st = $("#d-status");
    st.className = "status " + v.status;
    st.innerHTML = `<span class="dot ${esc(v.status)}"></span>${esc(STATUS_LABEL[v.status] || v.status)}`;
    // With more than one computer, say which one it runs on; its own home
    // folder shortens to ~ (big Linux boxes keep homes outside /home).
    const ms = state.machines || [];
    const home = ms.find((m) => m.id === (v.machine || ""))?.home;
    const cwd = home && (v.cwd || "").startsWith(home) ? "~" + v.cwd.slice(home.length) : tilde(v.cwd);
    $("#d-cwd").textContent = (ms.length > 1 ? machineName(v.machine) + " · " : "") + cwd;
    renderWorkerModel(v);
    // The pane may have shown up before the page knew what it is (a fresh
    // terminal): once it does, switch to the view that fits.
    if (view === "pane" && $("#viewer").dataset.mode && $("#viewer").dataset.mode !== curMode()) { closeStream(); resetChat(); resetScreen(); openStream(); }
    $("#input").placeholder = v.name === ROUTER ? "直接在 Collie 的终端里输入…" : v.is_agent ? `给 ${KIND_LABEL[v.kind] || v.kind} 发消息…` : "输入命令…";
  }

  // What model an agent was started with, recorded when Collie (the launcher
  // or a spawn) started it. Agents started by hand elsewhere show nothing.
  async function renderWorkerModel(v) {
    const el = $("#d-model");
    const w = !v.run && isWorker(v.name) ? sup.workers.find((x) => x.name === v.name && !x.ended) : null;
    const run = v.run || w?.run;
    const kind = v.run ? v.kind : w?.kind === "antigravity" ? "agy" : w?.kind;
    const machine = v.run ? v.machine : w?.machine;
    const key = run ? [v.pane_id, kind, machine, ...run].join("|") : "";
    if (el._key === key) return;
    el._key = key;
    if (!key) { el.hidden = true; el.textContent = ""; return; }
    let [model, effort] = run;
    const own = !model;
    const info = hubOf(v.pane_id) ? {} : await modelsFor(kind, machine || "").catch(() => ({}));
    if (own) model = info.default || "";
    if (!effort && info.default_effort && effortsFor(info, kind, model).includes(info.default_effort)) effort = info.default_effort;
    if (el._key !== key) return;
    // The model list's own name ("Gemini 4 Neon (XHigh)"), its bracket read
    // as the thinking level when the id carries one, as Antigravity's do.
    let name = (info.models || []).find((m) => m.id === model)?.label || model.split("/").pop();
    const b = name.match(/^(.*\S)\s*\(([^)]+)\)$/);
    if (b && EFFORT_LABEL[b[2].toLowerCase()]) { name = b[1]; effort ||= b[2].toLowerCase(); }
    const parts = [model ? name + (own ? "（默认）" : "") : "默认模型"];
    if (effort) parts.push("思考 " + (EFFORT_LABEL[effort] || effort));
    el.textContent = parts.join(" · ");
    el.title = `启动时用的模型：${model || "agent 自己的设置"}${effort ? "，思考强度 " + effort : ""}（之后在 agent 里换过的话这里不会变）`;
    el.hidden = false;
  }

  // ───────────────────────────── one agent: streams
  const TERM_SCROLLBACK = 600;
  const TERM_MIN_ROWS = 12;
  const TERM_MAX_ROWS = 80;
  let mode = store.get("mode2", "chat");
  let stream = null;
  let term = null;
  let size = { cols: 0, rows: 0 };
  let prevScreenLines = null;
  let pendingScreen = null;
  let screenFresh = true;
  let screenSeq = 0;
  let screenWriting = false;
  let screenQueuedFrame = null;
  let screenScrollRAF = 0;
  let screenBufLines = 0;

  // A plain shell has no conversation to show, so it opens on the screen.
  const isShell = () => { const v = find(current); return !!v && !v.is_agent; };
  let shellMode = null; // a shell's own pick; never overwrites the agent default
  const curMode = () => isShell() ? (shellMode || (mode === "chat" ? "screen" : mode)) : mode;
  function applyMode() {
    const m = curMode();
    $("#viewer").dataset.mode = m;
    $("#detail").classList.toggle("chat-mode", m === "chat");
    $("#detail").classList.toggle("shell", isShell());
    if (m === "chat") hideJump();
    $$("#mode-seg button").forEach((b) => {
      b.classList.toggle("on", b.dataset.mode === m);
      if (b.dataset.mode === "chat") b.hidden = isShell();
    });
  }
  function setMode(m) {
    if (view === "pane" && isShell()) shellMode = m; else { mode = m; store.set("mode2", m); }
    applyMode();
    if (view === "pane" && current) { closeStream(); resetChat(); resetScreen(); openStream(); }
  }
  $$("#mode-seg button").forEach((b) => b.addEventListener("click", () => setMode(b.dataset.mode)));

  const screenNearBottom = () => {
    const buf = term?.buffer?.active;
    if (buf) return (buf.baseY - buf.viewportY) <= 2;
    const el = $("#screen");
    return el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  };
  function desiredTermRows(el, paneRows, skipCachedCellH = false) {
    const fallback = Math.max(TERM_MIN_ROWS, Math.min(TERM_MAX_ROWS, paneRows || size.rows || 40));
    if (!el || !el.clientHeight) return fallback;
    const cs = typeof getComputedStyle === "function" ? getComputedStyle(el) : null;
    const padY = cs ? ((parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0)) : 0;
    const avail = el.clientHeight - padY;
    if (avail <= 0) return fallback;
    const cellH = skipCachedCellH ? 0 : (term?._core?._renderService?.dimensions?.css?.cell?.height || 0);
    const estH = cellH > 4 ? cellH : Math.max(10, Math.ceil((term?.options?.fontSize || 13) * (term?.options?.lineHeight || 1.15) * 1.18));
    return Math.max(TERM_MIN_ROWS, Math.min(TERM_MAX_ROWS, Math.floor(avail / estH)));
  }
  function handleScreenScrollChange() {
    if (curMode() !== "screen") return;
    if (screenNearBottom()) {
      hideJump();
      if (pendingScreen) { const p = pendingScreen; pendingScreen = null; drawScreen(p); }
    } else {
      $("#jump").hidden = false;
    }
  }
  function hideJump() {
    const j = $("#jump");
    if (j.hidden) return;
    const hadFocus = document.activeElement === j;
    j.hidden = true;
    if (hadFocus) (curMode() === "screen" ? $("#screen") : $("#log"))?.focus({ preventScroll: true });
  }
  function resetScreen() {
    screenSeq++;
    screenWriting = false;
    screenQueuedFrame = null;
    if (screenScrollRAF && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(screenScrollRAF);
      screenScrollRAF = 0;
    }
    prevScreenLines = null;
    pendingScreen = null;
    screenFresh = true;
    screenBufLines = 0;
    size = { cols: 0, rows: 0 };
    hideJump();
    if (term) {
      term.reset();
      const el = $("#screen");
      if (el) { el.scrollTop = 0; el.scrollLeft = 0; }
    }
  }

  function ensureTerm() {
    if (term || !window.Terminal) return;
    const css = getComputedStyle(document.documentElement);
    const el = $("#screen");
    term = new Terminal({
      cols: 120, rows: desiredTermRows(el, 40), fontFamily: css.getPropertyValue("--mono"), fontSize: 13, lineHeight: 1.15,
      cursorBlink: false, scrollback: TERM_SCROLLBACK, allowTransparency: true, theme: termTheme(),
    });
    // Vertical wheel scrolls xterm's native scrollback buffer; horizontal wheel pans #screen;
    // never translate wheel into Up/Down arrow keys when buffer has no scrollback.
    term.attachCustomWheelEventHandler((e) => {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return false;
      if (!term?.buffer?.active?.baseY) return false;
      return true;
    });
    // Mobile 2D touch pan: let horizontal swipes scroll #screen horizontally without xterm
    // calling preventDefault(), while vertical swipes scroll xterm's scrollback buffer.
    let touchStartX = 0, touchStartY = 0, touchAxis = "";
    el.addEventListener("touchstart", (e) => {
      if (e.touches.length !== 1) return;
      touchStartX = e.touches[0].pageX;
      touchStartY = e.touches[0].pageY;
      touchAxis = "";
    }, { capture: true, passive: true });
    el.addEventListener("touchmove", (e) => {
      if (e.touches.length !== 1) return;
      if (!touchAxis) {
        const dx = Math.abs(e.touches[0].pageX - touchStartX);
        const dy = Math.abs(e.touches[0].pageY - touchStartY);
        if (dx > 6 || dy > 6) touchAxis = dx > dy ? "x" : "y";
      }
      if (touchAxis === "x" || !term?.buffer?.active?.baseY) e.stopPropagation();
    }, { capture: true, passive: true });
    term.open(el);
    term.onData(typeIntoPane);
    term.onScroll(handleScreenScrollChange);
    // xterm's Viewport._handleScroll sets suppressScrollEvent=true on native wheel/scrollbar scroll,
    // so listen passively on .xterm-viewport as well (reads only pure-JS buffer.baseY/viewportY).
    el.querySelector(".xterm-viewport")?.addEventListener("scroll", handleScreenScrollChange, { passive: true });
    term.onSelectionChange(() => {
      if (!term.hasSelection() && pendingScreen && curMode() === "screen") {
        const p = pendingScreen;
        pendingScreen = null;
        drawScreen(p);
      }
    });
    // The terminal is the input: tap or click it and type. (A drag that
    // selected text, or scrolled the screen sideways, isn't a tap.)
    el.addEventListener("click", () => { if (!term.hasSelection()) term.focus(); });
    term.textarea?.setAttribute("enterkeyhint", "enter");
    term.textarea?.addEventListener("focus", () => $("#viewer").classList.add("typing"));
    term.textarea?.addEventListener("blur", () => $("#viewer").classList.remove("typing"));
    matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { term.options.theme = termTheme(); });
    addEventListener("collie:theme", () => { term.options.theme = termTheme(); });
    if (typeof ResizeObserver === "function") {
      let fitRAF = 0;
      const ro = new ResizeObserver(() => {
        if (view !== "pane" || curMode() !== "screen" || !size.cols) return;
        if (fitRAF) return;
        const run = () => { fitRAF = 0; if (view === "pane" && curMode() === "screen") fitTerm(); };
        if (typeof requestAnimationFrame === "function") fitRAF = requestAnimationFrame(run);
        else run();
      });
      try { ro.observe(el); } catch {}
    }
  }
  function termTheme() {
    const fg = getComputedStyle(document.documentElement).getPropertyValue("--term-fg").trim();
    return { background: "rgba(0,0,0,0)", foreground: fg, cursor: fg, selectionBackground: "rgba(127,127,127,.3)" };
  }
  // The pane keeps its own width (herdr can't resize it for us), so a phone
  // can't fit 120 columns legibly: there it shows the screen at a readable
  // size and scrolls sideways, or, with 全览, the whole width at once.
  const narrowScreen = matchMedia("(max-width: 760px)");
  function fitTerm() {
    if (!term || !size.cols) return;
    const el = $("#screen"), was = screenNearBottom();
    if (!el || !el.clientWidth) return;
    const pad = parseFloat(getComputedStyle(el).paddingLeft) * 2;
    const fitW = Math.floor(((el.clientWidth - pad) / size.cols / 0.602) * 2) / 2;
    const overview = store.get("term-overview", false);
    const fs = narrowScreen.matches && !overview ? Math.min(14, Math.max(fitW, 11)) : Math.max(4.5, Math.min(14, fitW));
    const fsChanged = term.options.fontSize !== fs;
    if (fsChanged) term.options.fontSize = fs;
    const wantRows = desiredTermRows(el, size.rows, fsChanged);
    const rowsChanged = term.rows !== wantRows;
    if (rowsChanged && !screenWriting && prevScreenLines) {
      // Redraw against the new viewport height so buffer row addressing stays exact.
      const replay = { text: prevScreenLines.join("\n"), cols: size.cols, rows: size.rows };
      prevScreenLines = null;
      drawScreen(replay, was ? { atBottom: true } : { atBottom: false, termLine: term.buffer?.active?.viewportY || 0 });
    } else if (fsChanged && was) {
      term.scrollToBottom?.();
      hideJump();
    }
    $("#term-fit").textContent = overview ? "放大" : "全览";
    $("#term-fit").hidden = !narrowScreen.matches || fitW >= 11;
  }
  addEventListener("resize", () => fitTerm());
  $("#term-fit").addEventListener("click", () => { store.set("term-overview", !store.get("term-overview", false)); fitTerm(); });
  $("#term-kbd").addEventListener("click", () => term?.focus());

  function openStream(restore = null) {
    const id = current;
    applyMode();
    const m = curMode();
    if (m === "chat") return openChat(id, restore);
    if (m === "screen") ensureTerm();
    let pendingRestore = restore && !restore.atBottom ? restore : null;
    stream = openES(paneURL(id, "stream") + "?mode=" + m);
    stream.addEventListener("frame", (e) => {
      if (id !== current) return;
      const f = JSON.parse(e.data);
      if (m === "screen") drawScreen(f, pendingRestore);
      else drawLog(f.text, pendingRestore);
      pendingRestore = null;
    });
    stream.addEventListener("gone", () => { $("#gone").hidden = false; closeStream(); });
  }
  function closeStream() {
    screenSeq++;
    screenWriting = false;
    screenQueuedFrame = null;
    if (screenScrollRAF && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(screenScrollRAF);
      screenScrollRAF = 0;
    }
    stream?.close();
    stream = null;
    term?.blur();
  }

  // Compute minimal ANSI stream delta between consecutive `pane.read(recent, ansi, 500)` frames
  // while keeping xterm sized to the visible viewport (`visRows`) with native scrollback.
  // Invariant: after every write, xterm's cursor sits on the bottom-most logical line so
  // subsequent scrolling output can be appended via `\r\n` without rewriting 500 DOM rows.
  function computeScreenDelta(prevLines, lines, visRows) {
    const N = lines.length;
    if (!prevLines || !prevLines.length) {
      return {
        kind: "full",
        out: "\x1b[?25l\x1b[?7l\x1b[0m" + lines.join("\r\n\x1b[0m"),
        bufLines: Math.min(visRows + TERM_SCROLLBACK, N),
      };
    }
    const M = prevLines.length;
    // 1. Exact equality fast path.
    if (M === N) {
      let firstDiff = -1;
      for (let i = 0; i < N; i++) {
        if (prevLines[i] !== lines[i]) { firstDiff = i; break; }
      }
      if (firstDiff === -1) return { kind: "noop", out: "", bufLines: screenBufLines };
      // 1b. In-place viewport-only update (e.g. TUI spinner / menu / status line).
      const vpStart = Math.max(0, N - visRows);
      if (firstDiff >= vpStart) {
        let patches = "";
        for (let i = firstDiff; i < N; i++) {
          if (prevLines[i] !== lines[i]) {
            const vpRow = (i - vpStart) + 1;
            patches += `\x1b[${vpRow};1H\x1b[0m\x1b[2K${lines[i]}`;
          }
        }
        const lastVpRow = N - vpStart;
        return {
          kind: "patch",
          out: `\x1b[?25l\x1b[?7l${patches}\x1b[${lastVpRow};1H`,
          bufLines: screenBufLines,
        };
      }
    }
    // 2. Pure growth / tail append (same prefix up to M - 1).
    if (N >= M) {
      let prefixOk = true;
      for (let i = 0; i < M - 1; i++) {
        if (prevLines[i] !== lines[i]) { prefixOk = false; break; }
      }
      if (prefixOk) {
        let out = "\x1b[?25l\x1b[?7l";
        if (prevLines[M - 1] !== lines[M - 1]) {
          out += `\r\x1b[0m\x1b[2K${lines[M - 1]}`;
        }
        if (N > M) {
          out += "\r\n\x1b[0m" + lines.slice(M).join("\r\n\x1b[0m");
        }
        return {
          kind: "append",
          out,
          bufLines: Math.min(visRows + TERM_SCROLLBACK, screenBufLines + (N - M)),
        };
      }
    }
    // 3. Sliding rolling-window overlap (e.g. 500-line tail advanced by `shift` lines).
    const minOverlap = Math.min(4, Math.max(1, Math.floor(M / 2)));
    if (M >= 4 && N >= minOverlap) {
      const h0 = lines[0], h1 = lines[1];
      const maxShift = M - minOverlap;
      for (let shift = 1; shift <= maxShift; shift++) {
        if (prevLines[shift] !== h0 || prevLines[shift + 1] !== h1) continue;
        const overlap = M - shift;
        if (overlap > N) continue;
        let match = true;
        for (let i = 2; i < overlap - 1; i++) {
          if (prevLines[shift + i] !== lines[i]) { match = false; break; }
        }
        if (!match) continue;
        const lastSame = prevLines[M - 1] === lines[overlap - 1];
        let out = "\x1b[?25l\x1b[?7l";
        if (!lastSame) out += `\r\x1b[0m\x1b[2K${lines[overlap - 1]}`;
        if (N > overlap) out += "\r\n\x1b[0m" + lines.slice(overlap).join("\r\n\x1b[0m");
        if (out === "\x1b[?25l\x1b[?7l") return { kind: "noop", out: "", bufLines: screenBufLines };
        return {
          kind: "append",
          out,
          bufLines: Math.min(visRows + TERM_SCROLLBACK, screenBufLines + (N - overlap)),
        };
      }
    }
    // 4. Fallback: full reset + write into scrollback buffer (still renders only `visRows` DOM rows).
    return {
      kind: "full",
      out: "\x1b[?25l\x1b[?7l\x1b[0m" + lines.join("\r\n\x1b[0m"),
      bufLines: Math.min(visRows + TERM_SCROLLBACK, N),
    };
  }

  function drawScreen(f, restore = null) {
    if (!term) return;
    if (!screenFresh && term.hasSelection?.()) {
      pendingScreen = f;
      return;
    }
    // Coalesce bursty frames while xterm is still flushing an in-flight write.
    if (screenWriting && !restore) {
      screenQueuedFrame = f;
      return;
    }
    const el = $("#screen");
    const stick = restore ? !!restore.atBottom : (screenFresh || screenNearBottom());
    const raw = (f.text || "").replace(/\r\n/g, "\n").replace(/\r/g, "");
    const lines = raw ? raw.split("\n") : [""];
    if (!stick && prevScreenLines) {
      const check = Math.min(6, prevScreenLines.length);
      const sameHead = lines.length >= prevScreenLines.length &&
        prevScreenLines.slice(0, check).every((l, i) => lines[i] === l);
      if (!sameHead) {
        pendingScreen = f;
        $("#jump").hidden = false;
        return;
      }
    }
    pendingScreen = null;
    const savedLine = restore && !restore.atBottom && typeof restore.termLine === "number"
      ? restore.termLine
      : (term.buffer?.active?.viewportY ?? 0);
    const cols = f.cols || size.cols || 120;
    const paneRows = f.rows || size.rows || 40;
    const dimChanged = cols !== size.cols || paneRows !== size.rows;
    if (dimChanged) size = { cols, rows: paneRows };
    const prevFs = term.options.fontSize;
    if (dimChanged) fitTerm();
    const visRows = desiredTermRows(el, paneRows, term.options.fontSize !== prevFs);
    const needResize = cols !== term.cols || visRows !== term.rows;
    const delta = (!prevScreenLines || needResize)
      ? {
          kind: "full",
          out: "\x1b[?25l\x1b[?7l\x1b[0m" + lines.join("\r\n\x1b[0m"),
          bufLines: Math.min(visRows + TERM_SCROLLBACK, lines.length),
        }
      : computeScreenDelta(prevScreenLines, lines, visRows);

    if (delta.kind === "full") {
      if (prevScreenLines || needResize) term.reset();
      if (needResize) term.resize(cols, visRows);
    }

    prevScreenLines = lines;
    screenFresh = false;
    screenBufLines = delta.bufLines;

    const applyScroll = () => {
      const buf = term?.buffer?.active;
      if (stick) {
        if (buf && buf.viewportY !== buf.baseY) term.scrollToBottom?.();
        hideJump();
      } else {
        if (buf && buf.viewportY !== savedLine) term.scrollToLine?.(savedLine);
        if (screenNearBottom()) hideJump(); else $("#jump").hidden = false;
      }
    };

    if (delta.kind === "noop" || !delta.out) {
      applyScroll();
      return;
    }

    const seq = screenSeq;
    screenWriting = true;
    term.write(delta.out, () => {
      if (seq !== screenSeq) return;
      screenWriting = false;
      // Zero-reflow scroll sync: uses pure-JS xterm buffer viewportY/baseY instead of
      // synchronous DOM `scrollHeight` reads inside the write callback and rAF.
      applyScroll();
      if (screenQueuedFrame) {
        const nextF = screenQueuedFrame;
        screenQueuedFrame = null;
        if (typeof requestAnimationFrame === "function") {
          if (screenScrollRAF && typeof cancelAnimationFrame === "function") cancelAnimationFrame(screenScrollRAF);
          screenScrollRAF = requestAnimationFrame(() => {
            screenScrollRAF = 0;
            if (seq === screenSeq && curMode() === "screen") drawScreen(nextF);
          });
        } else {
          drawScreen(nextF);
        }
      }
    });
  }
  function cleanLog(text) {
    return text.split("\n").map((l) => l.replace(/\s+$/, ""))
      .map((l) => (/^\s*[─━═\-]{16,}\s*$/.test(l) ? "────────────────" : l))
      .join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
  }
  function drawLog(text, restore = null) {
    const el = $("#log");
    const atBottom = restore ? !!restore.atBottom : (el.scrollHeight - el.scrollTop - el.clientHeight < 40);
    el.textContent = cleanLog(text);
    if (restore && !restore.atBottom) {
      restoreSimpleScroll(el, restore);
      if (el.scrollHeight - el.scrollTop - el.clientHeight < 40) hideJump(); else $("#jump").hidden = false;
      return;
    }
    if (atBottom) { el.scrollTop = el.scrollHeight; hideJump(); } else $("#jump").hidden = false;
  }
  $("#screen").addEventListener("scroll", () => {
    if (curMode() !== "screen" || term?.buffer?.active) return;
    handleScreenScrollChange();
  }, { passive: true });
  $("#log").addEventListener("scroll", () => {
    if (curMode() !== "log") return;
    const el = $("#log");
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 40) hideJump(); else $("#jump").hidden = false;
  }, { passive: true });
  $("#jump").addEventListener("click", () => {
    if (curMode() === "screen") {
      if (term?.scrollToBottom) term.scrollToBottom();
      else { const el = $("#screen"); el.scrollTop = el.scrollHeight; }
      hideJump();
      if (pendingScreen) { const p = pendingScreen; pendingScreen = null; drawScreen(p); }
    } else {
      const el = $("#log");
      el.scrollTop = el.scrollHeight;
      hideJump();
    }
  });

  // ───────────────────────────── one agent: conversation
  let showRaw = false;
  function resetChat() {
    $("#thread").innerHTML = "";
    $("#thread").classList.remove("asking");
    $("#live").hidden = true;
    $("#live").innerHTML = "";
    $("#thread")._sig = ""; $("#thread")._msgs = null; $("#thread")._blocks = null; $("#thread")._older = null; $("#thread")._restore = null; showRaw = false;
  }
  function openChat(id, restore = null) {
    stream = openES(paneURL(id, "chat"));
    const alive = () => id === current && curMode() === "chat";
    stream.addEventListener("reset", () => alive() && resetChat());
    const th = $("#thread");
    resetEarlier(th, (c) => paneURL(id, "earlier") + "?before=" + c);
    th._restore = restore && !restore.atBottom ? restore : null;
    th._redraw = () => alive() && drawThread(threadMsgs(th));
    if (!th._msgs) primeThread(th, "p:" + id);
    const showPane = (msgs) => { keepThread("p:" + id, msgs); drawThread(msgs); };
    stream.addEventListener("patch", (e) => alive() && showPane(applyPatch(th, JSON.parse(e.data))));
    stream.addEventListener("messages", (e) => alive() && drawThread(JSON.parse(e.data))); // an older computer
    stream.addEventListener("log", (e) => alive() && drawFallback(JSON.parse(e.data).text));
    stream.addEventListener("live", (e) => alive() && drawLive(JSON.parse(e.data)));
    stream.addEventListener("gone", () => { $("#gone").hidden = false; closeStream(); });
  }
  // Threads on a .viewer.chatbg scroll the viewer around them.
  const scroller = (el) => el.closest(".viewer.chatbg") || el;
  const nearBottom = (el) => { const s = scroller(el); return s.scrollHeight - s.scrollTop - s.clientHeight < 80; };
  const stick = (el, was) => {
    if (!was) return;
    const s = scroller(el);
    s.scrollTop = s.scrollHeight;
    requestAnimationFrame(() => { s.scrollTop = s.scrollHeight; }); // after images and code lay out
  };

  // A stream sends {base, from, msgs}: the first (and every reconnect) has
  // from === base and carries the whole view; later ones replace the
  // messages from position `from` on, and `base` moves when old ones fall off.
  function applyPatch(el, p) {
    let list = el._msgs, base = el._base;
    if (!list || p.from === p.base || p.from < base || p.from > base + list.length) {
      list = []; base = p.from;
      el._older = null; // a fresh view: what was loaded before may not join it
    }
    list = list.slice(0, p.from - base).concat(p.msgs);
    if (p.base > base) {
      if (el._older) el._older = el._older.concat(list.slice(0, p.base - base));
      list = list.slice(p.base - base); base = p.base;
    }
    el._msgs = list; el._base = base; el._liveEarlier = p.earlier || 0;
    return threadMsgs(el);
  }
  // A thread's messages: the older ones loaded on request, then the live view.
  const threadMsgs = (el) => (el._older || []).concat(el._msgs || []);
  const earlierCursor = (el) => (el._older ? el._olderEarlier : el._liveEarlier) || 0;
  function resetEarlier(el, url) {
    el._older = null; el._olderEarlier = 0; el._liveEarlier = 0; el._earlierURL = url;
    el._loadMore = url && (() => { el._earlierFailed = false; if (earlierCursor(el) > 0) loadEarlier(el); });
  }

  // Scrolled to the top of a conversation: fetch the page before the oldest
  // message shown, keeping the reader's place.
  async function loadEarlier(el) {
    if (el._loadingEarlier || !el._earlierURL) return;
    const cursor = earlierCursor(el);
    if (!cursor) return;
    el._loadingEarlier = true;
    el._redraw?.();
    try {
      const r = await api(el._earlierURL(cursor));
      if (el._earlierURL && earlierCursor(el) === cursor) {
        el._older = (r.messages || []).concat(el._older || []);
        el._olderEarlier = r.earlier || 0;
      }
    } catch (err) {
      el._earlierFailed = true; // scrolling up tries again; nothing loops on its own
      toast(err.message, "attn");
    }
    el._loadingEarlier = false;
    const s = scroller(el), fromBottom = s.scrollHeight - s.scrollTop;
    el._redraw?.();
    s.scrollTop = s.scrollHeight - fromBottom;
  }
  // Any conversation scrolled to its top brings in the page before: each
  // thread says how (_loadMore), this one listener notices.
  document.addEventListener("scroll", (ev) => {
    if (performance.now() < programmaticScrollUntil) return;
    const s = ev.target;
    if (!(s instanceof Element) || s.scrollTop >= 40 || s.scrollHeight <= s.clientHeight + 100) return;
    const el = s._loadMore ? s : [...s.querySelectorAll(".thread")].find((t) => t._loadMore && (t.parentElement === s || scroller(t) === s));
    el?._loadMore();
  }, { capture: true, passive: true });

  // Opening a thread: what was on screen last time shows at once and the live
  // stream updates it; a thread never opened shows a skeleton of a
  // conversation, so nothing jumps when the messages land.
  const threadCache = new Map();
  const SKELETON = `<div class="thread-skel" aria-label="读取中">${["user", "a", "a short", "tools", "user short", "a", "a short"].map((c) => `<div class="sk ${c}"></div>`).join("")}</div>`;
  function primeThread(el, key) {
    el._sig = ""; el._blocks = null; el._fresh = true;
    const got = key && threadCache.get(key);
    if (got) { drawThread(got, el); el._fresh = true; } else el.innerHTML = SKELETON;
  }
  function keepThread(key, msgs) {
    if (!key || !msgs || !msgs.length) return;
    threadCache.delete(key);
    threadCache.set(key, msgs.slice(-120));
    while (threadCache.size > 20) threadCache.delete(threadCache.keys().next().value);
  }

  document.addEventListener("click", async (ev) => {
    const b = ev.target.closest("[data-act=ask-reveal]");
    if (!b || !extCur) return;
    b.disabled = true;
    try { await api(`/api/external/${encodeURIComponent(extCur)}/reveal`, { body: {} }); toast("已在电脑上的 Claude 桌面版打开这个会话"); }
    catch (err) { toast(err.message, "attn"); }
    finally { b.disabled = false; }
  });
  // An end-of-turn button answers by sending its label from this view's composer.
  document.addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-act=ask-reply]");
    if (!b) return;
    const form = b.closest("section.view")?.querySelector("form.composer:not([hidden])");
    const input = form?.querySelector("textarea");
    if (!form || !input) { toast("这里没法发消息，去电脑上回答", "attn"); return; }
    input.value = b.dataset.text;
    form.requestSubmit();
  });
  function drawThread(msgs, el = $("#thread"), empty = "还没有对话。发一条消息开始吧。") {
    const rest = el._restore;
    // Just opened: start at the latest message, unless restoring a scroll position.
    const was = rest ? !!rest.atBottom : (el._fresh || nearBottom(el) || !el.childElementCount);
    if (msgs.length) el._fresh = false;
    const open = new Set($$("details.tool[open], details.toolrun[open]", el).map((d) => d.dataset.i));
    if (!msgs.length) { el.innerHTML = `<div class="thread-empty">${empty}</div>`; el._sig = ""; el._blocks = null; return; }
    const blocks = [];
    let html = "", i = 0;
    const cut = () => { blocks.push(html); html = ""; };
    while (i < msgs.length) {
      const m = msgs[i];
      if (m.kind === "tool") {
        // A run of tool calls reads as one quiet line; long runs fold away,
        // keeping only the latest step in view.
        const start = i;
        while (i < msgs.length && msgs[i].kind === "tool") i++;
        const run = msgs.slice(start, i);
        const row = (t, k) => {
          const cls = t.error ? "err" : (t.output ? "" : "pending");
          return `<details class="tool ${cls}" data-i="${k}" ${open.has(String(k)) ? "open" : ""}>`
            + `<summary><span class="tname">${esc(t.name)}</span><span class="targ">${esc(t.input)}</span></summary>`
            + (t.output ? `<pre>${esc(t.output)}</pre>` : "") + `</details>`;
        };
        if (run.length <= 3 || !prefs.fold()) {
          html += `<div class="tools">${run.map((t, k) => row(t, start + k)).join("")}</div>`;
          cut();
          continue;
        }
        const key = "run" + start;
        const names = [...new Set(run.map((t) => t.name))].slice(0, 4).join("、");
        const errs = run.filter((t) => t.error).length;
        html += `<div class="tools"><details class="toolrun" data-i="${key}" ${open.has(key) ? "open" : ""}>
          <summary><span class="n">${run.length} 个步骤</span><span class="targ">${esc(names)}${errs ? ` · <b class="errs">${errs} 个出错</b>` : ""}</span></summary>
          <div class="toolrun-body">${run.slice(0, -1).map((t, k) => row(t, start + k)).join("")}</div>
        </details>${row(run[run.length - 1], i - 1)}</div>`;
        cut();
        continue;
      }
      if (m.kind === "ask" && m.name === "recap") {
        html += `<div class="recap-note">${esc(m.input)}</div>`;
        cut();
        i++;
        continue;
      }
      if (m.kind === "ask") {
        // A question to you: AskUserQuestion is answered in the app it runs
        // in; the Claude app's end-of-turn buttons just send their label.
        const later = msgs.slice(i + 1).some((x) => x.kind === "user");
        const box = m.name === "wrap_up";
        const open = box ? !later : !m.output;
        const opts = (m.options || []).map((o) => box && open
          ? `<button type="button" class="btn small" data-act="ask-reply" data-text="${esc(o)}">${esc(o)}</button>`
          : `<span class="opt">${esc(o)}</span>`).join("");
        html += `<div class="ask-card ${open ? "open" : ""}">`
          + (m.input ? `<div class="recap">${esc(m.input)}</div>` : "")
          + `<div class="q"><span class="dot ${open ? "blocked" : "unknown"}"></span>${esc(m.text)}</div>`
          + (opts ? `<div class="opts">${opts}</div>` : "")
          + (m.output ? `<div class="answer">${esc(m.output)}</div>`
            : open && !box ? (el.id === "x-thread" && /^cd-/.test(extCur || "")
              ? `<div class="where"><button type="button" class="btn small" data-act="ask-reveal">去 Claude 桌面版回答</button><span>这个对话框只能在电脑上答</span></div>`
              : el.id === "thread" ? "" : `<div class="where">在电脑上的会话里回答</div>`) : "")
          + `</div>`;
        cut();
        i++;
        continue;
      }
      html += m.kind === "user" ? `<div class="msg user">${userText(m.text)}</div>` : `<div class="msg assistant">${md(m.text)}</div>`;
      cut();
      i++;
    }
    if (el._loadingEarlier) blocks.unshift(`<div class="earlier-row">加载中…</div>`);
    const sig = blocks.join("");
    if (sig === el._sig) return;
    el._sig = sig;
    const old = el._blocks;
    if (old && el.children.length === old.length && el.lastElementChild === el._last) {
      // Keep what did not change (and its open/closed state); redraw from
      // the first block that did.
      let k = 0;
      while (k < old.length && k < blocks.length && old[k] === blocks[k]) k++;
      while (el.children.length > k) el.lastElementChild.remove();
      el.insertAdjacentHTML("beforeend", blocks.slice(k).join(""));
    } else {
      el.innerHTML = sig;
    }
    el._blocks = blocks; el._last = el.lastElementChild;
    if (rest && !rest.atBottom) {
      restoreSimpleScroll(scroller(el), rest);
      if (msgs.length && !el.querySelector(".thread-skel")) el._restore = null;
    } else {
      stick(el, was);
    }
    // Too short to scroll, with more before it: there is no top to scroll
    // to, so bring the earlier page in now.
    if (el._earlierURL && !el._loadingEarlier && !el._earlierFailed && earlierCursor(el) > 0) {
      const s = scroller(el);
      if (s.scrollHeight <= s.clientHeight + 100) setTimeout(() => loadEarlier(el));
    }
  }

  function drawFallback(text) {
    const el = $("#thread");
    const was = nearBottom(el) || !el.childElementCount;
    const v = find(current);
    const note = v && v.is_agent ? `${esc(KIND_LABEL[v.kind] || v.kind)} 还没有可读取的会话记录，先显示终端输出` : "普通终端，这里显示终端输出";
    el.innerHTML = `<div class="fallback-note">${note}</div><pre class="termcard">${esc(cleanLog(text))}</pre>`;
    stick(el, was);
  }

  let lastLive = null;
  function drawLive(l) {
    lastLive = l;
    const box = $("#live");
    const th = $("#thread");
    const was = nearBottom(th);
    th.classList.toggle("asking", l.status === "blocked" && !!l.approval);
    let html = "";
    if (l.status === "working" && l.tail) {
      html = `<div class="live-working"><span class="dot working"></span><pre>${esc(l.tail)}</pre><span class="meta"></span></div>`;
    } else if (l.status === "blocked" && l.approval) {
      const v = find(current);
      html = askHTML(l.approval, v ? title(v) : "agent");
    }
    // Live updates arrive every second (the agent's clock ticks); redrawing
    // an unchanged card would replay its entrance and make it jump.
    if (html !== box._html) {
      box._html = html;
      box.innerHTML = html;
    }
    // The counters tick every second: only their text changes.
    const meta = box.querySelector(".live-working .meta");
    if (meta && meta.textContent !== (l.meta || "")) meta.textContent = l.meta || "";
    box.hidden = !html;
    stick(th, was);
  }

  // Terminal dialogs arrive hard-wrapped at the terminal's width. Rebuild the
  // paragraphs so the card can use its own width, and find the real question.
  const CJK = /[　-鿿＀-￯]/;
  function readDialog(text) {
    const raw = (text || "").split("\n");
    const ind = (l) => l.match(/^ */)[0].length;
    const filled = raw.filter((l) => l.trim());
    const base = filled.length ? Math.min(...filled.map(ind)) : 0;
    const paras = [];
    let cur = [];
    for (const l of raw) {
      if (l.trim()) cur.push(l);
      else if (cur.length) { paras.push(cur); cur = []; }
    }
    if (cur.length) paras.push(cur);
    // A line that ends mid-word and is followed by a capitalised line is a real
    // line break ("This command requires approval" / "Do you want…"), not a wrap.
    const split = [];
    for (const p of paras) {
      let part = [p[0]];
      for (let k = 1; k < p.length; k++) {
        const prev = p[k - 1].trim(), next = p[k].trim();
        if (ind(p[k]) === ind(p[k - 1]) && /[A-Za-z0-9]$/.test(prev) && /^[A-Z]/.test(next)) { split.push(part); part = []; }
        part.push(p[k]);
      }
      split.push(part);
    }
    let blocks = split.map((p) => {
      const t0 = p[0].trim();
      // Indented deeper than the dialog's text, or a lone path: show as-is.
      if (p.every((l) => ind(l) > base) || (p.length === 1 && /^[~/.][^\s]*$/.test(t0))) {
        const cut = Math.min(...p.map(ind));
        return { code: true, text: p.map((l) => l.slice(cut)).join("\n") };
      }
      let t = "";
      for (const l of p.map((x) => x.trim())) t += !t ? l : (CJK.test(t.slice(-1)) && CJK.test(l[0]) ? "" : " ") + l;
      return { code: false, text: t };
    });
    // Terminal chrome that means nothing in a card.
    // Claude's question box heads itself with tabs ("☐ Color  ✔ Submit").
    blocks = blocks.filter((b) => !/^(←\s*)?[☐☒✔]\s/.test(b.text.trim()));
    blocks = blocks.filter((b, i) => b.code || !(/^tip:/i.test(b.text) ||
      (i === blocks.length - 1 && b.text.split(/\s+/).length <= 3 && !/[.:?？。：]/.test(b.text))));
    // The question is the last sentence ending in "?"; it becomes the title.
    for (let i = blocks.length - 1; i >= 0; i--) {
      const b = blocks[i];
      if (b.code) continue;
      const ms = [...b.text.matchAll(/[^.!?。！？]*[?？]/g)];
      if (!ms.length) continue;
      const m = ms[ms.length - 1];
      const rest = (b.text.slice(0, m.index) + b.text.slice(m.index + m[0].length)).trim();
      const out = blocks.slice();
      if (rest) out[i] = { code: false, text: rest }; else out.splice(i, 1);
      // "Quick safety check: Is this…" → the label adds nothing to a title.
      const q = m[0].trim().replace(/^[^:：?？]{1,24}[:：]\s*(?=\S)/, "");
      return { q, blocks: out };
    }
    const last = blocks.map((b) => !b.code).lastIndexOf(true);
    if (last < 0) return { q: "要继续吗？", blocks };
    return { q: blocks[last].text, blocks: blocks.filter((_, k) => k !== last) };
  }

  // A calm decision sheet: the question as the title, the dialog's text
  // reflowed under it, the choices as a list.
  function askHTML(a, who) {
    const { q, blocks } = readDialog(a.question);
    const choices = a.choices || [];
    const body = blocks.map((b) => b.code ? `<pre class="ctx-code">${esc(b.text)}</pre>` : `<p>${esc(b.text)}</p>`).join("");
    return `<div class="ask">
      <div class="ask-head"><span class="dot blocked"></span><span class="who">${esc(who)}</span><span>需要你确认</span><span class="spacer"></span>
        <button data-raw>${showRaw ? "收起终端" : "查看终端"}</button></div>
      <div class="ask-q"><div class="q">${esc(q)}</div>${body ? `<div class="ctx">${body}</div>` : ""}</div>
      ${showRaw ? `<pre class="ask-raw">${esc(a.screen)}</pre>` : ""}
      ${choices.length ? `<div class="choices">${choices.map((c, i) => `<button class="choice ${c.current ? "current" : ""}" data-choice="${i}">
          <span class="n">${esc(c.text || i + 1)}</span><span class="l">${esc(c.label)}${c.desc ? `<span class="d">${esc(c.desc)}</span>` : ""}</span></button>`).join("")}</div>
        <div class="ask-keys"><button data-k="esc">Esc 取消</button></div>`
      : `<div class="ask-keys"><button data-k="up">↑</button><button data-k="down">↓</button><button data-k="esc">Esc</button><button class="go" data-k="enter">确认 ↵</button></div>`}
    </div>`;
  }

  $("#live").addEventListener("mousedown", (e) => { if (e.target.closest(".ask button")) e.preventDefault(); });
  $("#live").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b || !current) return;
    if (b.hasAttribute("data-raw")) { showRaw = !showRaw; if (lastLive) drawLive(lastLive); return; }
    const ask = b.closest(".ask");
    if (ask?.dataset.busy) return;
    let p;
    if (b.dataset.choice != null) {
      const c = lastLive?.approval?.choices?.[+b.dataset.choice];
      if (!c) return;
      if (c.keys?.length) p = sendKeys(c.keys);
      else if (c.text) p = sendText(c.text);
      else p = sendKeys(["enter"]);
    } else if (b.dataset.k) {
      p = sendKeys([b.dataset.k]);
    } else return;
    if (ask) {
      ask.dataset.busy = "1";
      ask.style.opacity = ".5";
      Promise.resolve(p).finally(() => setTimeout(() => { $("#live")._html = ""; }, 600));
    }
  });

  $("#kbd-toggle").addEventListener("click", () => {
    const on = $("#keys").classList.toggle("open");
    $("#kbd-toggle").classList.toggle("on", on);
  });

  // A file path in a message: ~/… or /…, ending in a name with an extension.
  // It runs on escaped text, so it never meets a raw quote or tag.
  const FILE_RE = /(^|[\s`(（：，、；>;])((?:~|\/)[\w.\-+@%~\/]*\/[\w.\-+@%~]+\.[A-Za-z0-9]{1,8})(?![\w\/])/g;

  // ───────────────────────────── offline syntax highlighter
  // Pure local single-pass lexical scanner: zero external dependencies, O(N)
  // non-backtracking rules, and every slice passes through esc() so output is
  // XSS-safe and preserves exact textContent when copying selected lines.
  const HL_MAX_BYTES = 200 * 1024, HL_MAX_LINES = 5000;
  const LANG_LABELS = {
    go: "Go", py: "Python", js: "JavaScript", ts: "TypeScript", jsx: "JSX", tsx: "TSX",
    sql: "SQL", json: "JSON", yaml: "YAML", sh: "Shell", html: "HTML", xml: "XML",
    css: "CSS", md: "Markdown", diff: "Diff", rust: "Rust", java: "Java",
    c: "C", cpp: "C++", toml: "TOML", dockerfile: "Dockerfile", makefile: "Makefile",
  };
  const EXT_LANG = {
    go: "go", py: "py", pyi: "py", pyw: "py",
    js: "js", mjs: "js", cjs: "js", ts: "ts", mts: "ts", cts: "ts", jsx: "jsx", tsx: "tsx",
    sql: "sql", json: "json", jsonl: "json", jsonc: "json", webmanifest: "json",
    yaml: "yaml", yml: "yaml", sh: "sh", bash: "sh", zsh: "sh",
    html: "html", htm: "html", vue: "html", svelte: "html",
    xml: "xml", svg: "xml", plist: "xml", xhtml: "xml",
    css: "css", scss: "css", less: "css", md: "md", markdown: "md", mdx: "md",
    diff: "diff", patch: "diff", rs: "rust", java: "java", kt: "java", kts: "java",
    c: "c", h: "c", cc: "cpp", cpp: "cpp", cxx: "cpp", hpp: "cpp", hh: "cpp", proto: "cpp",
    toml: "toml", ini: "toml", cfg: "toml", conf: "toml",
    dockerfile: "dockerfile", mk: "makefile",
  };
  const FENCE_LANG = {
    ...EXT_LANG,
    golang: "go", gomod: "go", python: "py", python3: "py",
    javascript: "js", node: "js", typescript: "ts",
    mysql: "sql", postgres: "sql", postgresql: "sql", sqlite: "sql", hive: "sql", sparksql: "sql", plsql: "sql",
    json5: "json", shell: "sh", console: "sh", env: "sh",
    rust: "rust", kotlin: "java", "c++": "cpp", protobuf: "cpp",
    docker: "dockerfile", makefile: "makefile", make: "makefile",
  };
  function detectCodeLang(raw, byPath = false) {
    if (!raw) return null;
    let id = "";
    if (byPath) {
      const name = String(raw).split("/").pop() || "", low = name.toLowerCase();
      if (low === "dockerfile" || low.startsWith("dockerfile.") || low === "containerfile") id = "dockerfile";
      else if (low === "makefile" || low === "gnumakefile" || low === "justfile") id = "makefile";
      else if (low === "go.mod" || low === "go.sum") id = "go";
      else if (/^\.(?:bashrc|bash_profile|zshrc|profile|env)(?:\..+)?$/.test(low) || low === ".gitignore" || low === ".dockerignore") id = "sh";
      else if (low.includes(".")) id = EXT_LANG[low.split(".").pop()] || "";
    } else {
      const tag = String(raw).trim().split(/[\s{:]/)[0].toLowerCase().replace(/^language-/, "");
      id = FENCE_LANG[tag] || "";
    }
    return id && LANG_LABELS[id] ? { id, label: LANG_LABELS[id] } : null;
  }
  const wset = (s) => new Set(s.trim().split(/\s+/));
  function wordCls(kw, ty, cn, { ci = false, pascal = true, calls = true } = {}) {
    const kS = wset(kw), tS = ty ? wset(ty) : null, cS = cn ? wset(cn) : null;
    return (tok, src, idx) => {
      const w = ci ? tok.toLowerCase() : tok;
      if (kS.has(w)) return "k";
      if (cS?.has(w)) return "n";
      if (tS?.has(w)) return "ty";
      if (calls) {
        let j = idx + tok.length;
        while (j < src.length && (src[j] === " " || src[j] === "\t")) j++;
        if (src[j] === "(") return "fn";
      }
      if (pascal && /^[A-Z][A-Za-z0-9_]*$/.test(tok)) return "ty";
      return "";
    };
  }
  function compileRules(rules, flags = "gm") {
    return { re: new RegExp(rules.map((r) => "(" + r.pat + ")").join("|"), flags), rules };
  }
  function scanCompiled(src, { re, rules }) {
    let out = "", pos = 0;
    for (const m of src.matchAll(re)) {
      if (m.index > pos) out += esc(src.slice(pos, m.index));
      const tok = m[0];
      if (!tok) continue;
      let g = 0;
      while (g < rules.length && m[g + 1] === undefined) g++;
      const r = rules[g];
      if (r?.html) {
        out += r.html(tok, src, m.index);
      } else {
        const cls = typeof r?.cls === "function" ? r.cls(tok, src, m.index) : r?.cls;
        out += cls ? `<span class="hl-${cls}">${esc(tok)}</span>` : esc(tok);
      }
      pos = m.index + tok.length;
    }
    if (pos < src.length) out += esc(src.slice(pos));
    return out;
  }
  const P_CL = "//[^\\n]*", P_CB = "\\/\\*[\\s\\S]*?(?:\\*\\/|$)", P_HASH = "#[^\\n]*";
  const P_DQ = '"(?:\\\\[\\s\\S]|[^"\\\\\\n])*"?', P_SQ = "'(?:\\\\[\\s\\S]|[^'\\\\\\n])*'?", P_TPL = "`(?:\\\\[\\s\\S]|[^`\\\\])*`?";
  const P_NUM = "-?\\b(?:0[xX][0-9a-fA-F_]+|0[bBoO][0-9_]+|\\d[\\d_]*(?:\\.[\\d_]+)?(?:[eE][+-]?\\d+)?i?)\\b";
  const P_ID = "[A-Za-z_$][\\w$]*";
  const leadHash = (t) => (t[0] === "#" ? `<span class="hl-c">${esc(t)}</span>` : esc(t[0]) + `<span class="hl-c">${esc(t.slice(1))}</span>`);
  const TAG_SUB = compileRules([
    { pat: "^<\\/?[A-Za-z][\\w:-]*", cls: "ty" },
    { pat: "\\/?>|<\\?[\\w:-]*|\\?>", cls: "ty" },
    { pat: '"[^"]*"|\'[^\']*\'', cls: "s" },
    { pat: "[\\w:-]+(?=\\s*=)", cls: "pr" },
    { pat: "[\\w:-]+", cls: "pr" },
  ]);
  const hlTag = (t) => scanCompiled(t, TAG_SUB);
  const GRAMMARS = {};
  function getGrammar(id) {
    if (GRAMMARS[id]) return GRAMMARS[id];
    let rules = null, flags = "gm";
    const jsWords = wordCls(
      "as async await break case catch class const continue debugger default delete do else enum export extends finally for from function get if implements import in instanceof interface keyof let namespace new of private protected public readonly return satisfies set static super switch throw try type typeof var void while yield",
      "any bigint boolean never number object string symbol unknown Promise Map Set Array Record Partial Omit Pick Readonly",
      "true false null undefined NaN Infinity this"
    );
    switch (id) {
      case "go":
        rules = [
          { pat: P_CL, cls: "c" }, { pat: P_CB, cls: "c" },
          { pat: "`[^`]*`?", cls: "s" }, { pat: P_DQ, cls: "s" }, { pat: P_SQ, cls: "s" },
          { pat: P_NUM, cls: "n" },
          { pat: P_ID, cls: wordCls(
            "break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var module require replace exclude",
            "any bool byte comparable complex64 complex128 error float32 float64 int int8 int16 int32 int64 rune string uint uint8 uint16 uint32 uint64 uintptr",
            "true false nil iota"
          ) },
        ];
        break;
      case "py":
        rules = [
          { pat: P_HASH, cls: "c" },
          { pat: '(?:[fFrRbBuU]{1,2})?(?:"""[\\s\\S]*?(?:"""|$)|\'\'\'[\\s\\S]*?(?:\'\'\'|$))', cls: "s" },
          { pat: "(?:[fFrRbBuU]{1,2})?(?:" + P_DQ + "|" + P_SQ + ")", cls: "s" },
          { pat: "@[A-Za-z_][\\w.]*", cls: "m" },
          { pat: P_NUM, cls: "n" },
          { pat: "[A-Za-z_][\\w]*", cls: wordCls(
            "and as assert async await break case class continue def del elif else except finally for from global if import in is lambda match nonlocal not or pass raise return try while with yield",
            "bool bytes callable dict float frozenset int list object set slice str tuple type Exception ValueError TypeError KeyError RuntimeError OSError",
            "True False None self cls"
          ) },
        ];
        break;
      case "js": case "ts": case "jsx": case "tsx":
        rules = [
          { pat: P_CL, cls: "c" }, { pat: P_CB, cls: "c" },
          { pat: P_TPL, cls: "s" }, { pat: P_DQ, cls: "s" }, { pat: P_SQ, cls: "s" },
          ...(id === "jsx" || id === "tsx" ? [{ pat: "<\\/?[A-Za-z][\\w.]*(?=\\s|\\/|\\>)", cls: "ty" }] : []),
          { pat: "@[A-Za-z_$][\\w$.]*", cls: "m" },
          { pat: P_NUM, cls: "n" },
          { pat: P_ID, cls: jsWords },
        ];
        break;
      case "sql":
        rules = [
          { pat: "--[^\\n]*", cls: "c" }, { pat: P_CB, cls: "c" },
          { pat: "'(?:''|\\\\[\\s\\S]|[^'])*'?", cls: "s" }, { pat: P_DQ, cls: "pr" }, { pat: "`[^`]*`?", cls: "pr" },
          { pat: "\\$\\d+|:[A-Za-z_]\\w*", cls: "m" },
          { pat: P_NUM, cls: "n" },
          { pat: "[A-Za-z_]\\w*", cls: wordCls(
            "select from where and or not in exists is as join left right inner outer full cross lateral on using group by order asc desc nulls first last having limit offset union all except intersect insert into values update set delete create alter drop replace truncate table view index database schema temp temporary if case when then else end with recursive distinct over partition rows range between preceding following unbounded current row primary key foreign references default unique check constraint begin commit rollback pragma explain analyze unnest",
            "int integer bigint smallint tinyint text varchar char nvarchar boolean bool date time timestamp timestamptz datetime float double real decimal numeric json jsonb blob bytea uuid serial array map struct string",
            "null true false",
            { ci: true, pascal: false, calls: true }
          ) },
        ];
        break;
      case "json":
        rules = [
          { pat: P_CL, cls: "c" }, { pat: P_CB, cls: "c" },
          { pat: P_DQ, cls: (tok, src, idx) => {
            let j = idx + tok.length;
            while (j < src.length && (src[j] === " " || src[j] === "\t" || src[j] === "\n" || src[j] === "\r")) j++;
            return src[j] === ":" ? "pr" : "s";
          } },
          { pat: "\\b(?:true|false|null)\\b", cls: "n" },
          { pat: "-?\\b\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?\\b", cls: "n" },
        ];
        break;
      case "yaml":
        rules = [
          { pat: "(?:^|[ \\t])#[^\\n]*", html: leadHash },
          { pat: "^[ \\t]*(?:-[ \\t]+)?[A-Za-z0-9_.\\-]+(?=\\s*:(?:\\s|$))", html: (t) => {
            const m = /^([ \t]*(?:-[ \t]+)?)(.*)$/.exec(t);
            return esc(m[1]) + `<span class="hl-pr">${esc(m[2])}</span>`;
          } },
          { pat: P_DQ, cls: "s" }, { pat: "'(?:''|[^'\\n])*'?", cls: "s" },
          { pat: "[&*][\\w-]+|![\\w/-]+", cls: "m" },
          { pat: "\\b(?:true|false|null|yes|no|on|off)\\b", cls: "n" },
          { pat: "-?\\b\\d+(?:\\.\\d+)?\\b", cls: "n" },
        ];
        break;
      case "sh":
        rules = [
          { pat: "^#![^\\n]*", cls: "m" },
          { pat: "(?:^|[ \\t;&|()])#[^\\n]*", html: leadHash },
          { pat: '"(?:\\\\[\\s\\S]|[^"\\\\])*"?', cls: "s" }, { pat: "'[^']*'", cls: "s" },
          { pat: "\\$(?:\\{[^}\\n]+\\}|\\([^)\\n]*\\)|[A-Za-z_]\\w*|[0-9?!@#$*_-])", cls: "m" },
          { pat: "(?:^|[ \\t])--?[A-Za-z0-9][\\w-]*", html: (t) => (t[0] === "-" ? `<span class="hl-pr">${esc(t)}</span>` : esc(t[0]) + `<span class="hl-pr">${esc(t.slice(1))}</span>`) },
          { pat: "\\b(?:if|then|else|elif|fi|for|in|do|done|while|until|case|esac|function|select|return|exit|break|continue|export|local|readonly|declare|typeset|set|unset|shift|source|trap|exec|eval)\\b", cls: "k" },
          { pat: "\\b(?:echo|printf|cd|pwd|test|read|kill|wait|true|false)\\b", cls: "fn" },
          { pat: "-?\\b\\d+\\b", cls: "n" },
        ];
        break;
      case "html": case "xml":
        rules = [
          { pat: "<!--[\\s\\S]*?(?:-->|$)", cls: "c" },
          { pat: "<![^>]*>", cls: "m" },
          ...(id === "html" ? [
            { pat: "<script\\b[^>]*>[\\s\\S]*?<\\/script>", html: (t) => {
              const m = /^(<script\b[^>]*>)([\s\S]*)(<\/script>)$/i.exec(t);
              return m ? hlTag(m[1]) + highlightCode(m[2], "js") + hlTag(m[3]) : esc(t);
            } },
            { pat: "<style\\b[^>]*>[\\s\\S]*?<\\/style>", html: (t) => {
              const m = /^(<style\b[^>]*>)([\s\S]*)(<\/style>)$/i.exec(t);
              return m ? hlTag(m[1]) + highlightCode(m[2], "css") + hlTag(m[3]) : esc(t);
            } },
          ] : []),
          { pat: "<\\/?[A-Za-z?][\\w:-]*(?:\\s+(?:\"[^\"]*\"|'[^']*'|[^\"'<>])*)?\\s*[\\/?]?>", html: hlTag },
          { pat: "&[A-Za-z0-9#]+;", cls: "n" },
        ];
        break;
      case "css":
        rules = [
          { pat: P_CB, cls: "c" }, { pat: P_CL, cls: "c" },
          { pat: P_DQ, cls: "s" }, { pat: P_SQ, cls: "s" },
          { pat: "@[\\w-]+", cls: "k" },
          { pat: "--[\\w-]+", cls: "m" },
          { pat: "#[0-9a-fA-F]{3,8}\\b", cls: "n" },
          { pat: "[a-zA-Z-]+(?=\\s*:)", cls: "pr" },
          { pat: "-?\\b\\d+(?:\\.\\d+)?(?:px|em|rem|dvh|svh|vh|vw|%|s|ms|deg|fr|ch)?\\b", cls: "n" },
          { pat: "\\b(?:var|calc|min|max|clamp|color-mix|light-dark|linear-gradient|radial-gradient|url|rgb|rgba|hsl|hsla)(?=\\()", cls: "fn" },
        ];
        break;
      case "diff":
        rules = [
          { pat: "^(?:diff |index |--- |\\+\\+\\+ )[^\\n]*", cls: "m" },
          { pat: "^@@[^\\n]*", cls: "fn" },
          { pat: "^\\+[^\\n]*", cls: "add" },
          { pat: "^-[^\\n]*", cls: "del" },
        ];
        break;
      case "md":
        rules = [
          { pat: "^#{1,6}\\s[^\\n]*", cls: "fn" },
          { pat: "```[\\s\\S]*?(?:```|$)", cls: "s" },
          { pat: "`[^`\\n]+`", cls: "s" },
          { pat: "\\*\\*[^*\\n]+\\*\\*", cls: "k" },
          { pat: "\\[[^\\]\\n]+\\]\\([^)\\n]+\\)", cls: "ty" },
          { pat: "^>\\s[^\\n]*", cls: "c" },
        ];
        break;
      case "rust":
        rules = [
          { pat: P_CL, cls: "c" }, { pat: P_CB, cls: "c" },
          { pat: "#!?\\[[^\\]\\n]*\\]", cls: "m" },
          { pat: 'r#*"[\\s\\S]*?"#*', cls: "s" }, { pat: P_DQ, cls: "s" },
          { pat: "'(?:\\\\.|[^'\\\\\\n])'", cls: "s" },
          { pat: "'[a-zA-Z_]\\w*\\b", cls: "m" },
          { pat: "\\b[a-z_]\\w*!", cls: "m" },
          { pat: P_NUM, cls: "n" },
          { pat: "[A-Za-z_]\\w*", cls: wordCls(
            "as async await break const continue crate dyn else enum extern fn for if impl in let loop match mod move mut pub ref return self Self static struct super trait type unsafe use where while",
            "bool char f32 f64 i8 i16 i32 i64 i128 isize str u8 u16 u32 u64 u128 usize String Vec Option Result Box Rc Arc Cow",
            "true false None Some Ok Err"
          ) },
        ];
        break;
      case "java":
        rules = [
          { pat: P_CL, cls: "c" }, { pat: P_CB, cls: "c" },
          { pat: P_DQ, cls: "s" }, { pat: P_SQ, cls: "s" },
          { pat: "@[A-Za-z_][\\w.]*", cls: "m" },
          { pat: P_NUM, cls: "n" },
          { pat: P_ID, cls: wordCls(
            "abstract assert break case catch class const continue default do else enum extends final finally for fun goto if implements import in instanceof interface internal native new object open override package private protected public record return sealed static strictfp super suspend switch synchronized throw throws transient try val var volatile when while yield",
            "boolean byte char double float int long short void String List Map Set Optional Object Integer Long Double Boolean",
            "true false null this"
          ) },
        ];
        break;
      case "c": case "cpp":
        rules = [
          { pat: P_CL, cls: "c" }, { pat: P_CB, cls: "c" },
          { pat: "^[ \\t]*#[ \\t]*[a-zA-Z_]\\w*[^\\n]*", cls: "m" },
          { pat: P_DQ, cls: "s" }, { pat: P_SQ, cls: "s" },
          { pat: P_NUM, cls: "n" },
          { pat: "[A-Za-z_]\\w*", cls: wordCls(
            "alignas alignof auto break case catch class co_await co_return co_yield constexpr consteval constinit const const_cast continue decltype default delete do dynamic_cast else enum explicit export extern final for friend goto if inline mutable namespace new noexcept operator override private protected public register reinterpret_cast requires return sizeof static static_assert static_cast struct switch template thread_local throw try typedef typeid typename union using virtual volatile while message service rpc repeated optional required",
            "bool char char8_t char16_t char32_t double float int long short signed size_t ssize_t int8_t int16_t int32_t int64_t uint8_t uint16_t uint32_t uint64_t uintptr_t ptrdiff_t void wchar_t string vector map unordered_map set unique_ptr shared_ptr bytes",
            "true false nullptr NULL this"
          ) },
        ];
        break;
      case "toml":
        rules = [
          { pat: P_HASH, cls: "c" },
          { pat: "^[ \\t]*\\[\\[?[^\\]\\n]+\\]\\]?", cls: "ty" },
          { pat: '"""[\\s\\S]*?(?:"""|$)|\'\'\'[\\s\\S]*?(?:\'\'\'|$)', cls: "s" },
          { pat: P_DQ, cls: "s" }, { pat: "'[^'\\n]*'?", cls: "s" },
          { pat: "^[ \\t]*[A-Za-z0-9_.-]+(?=\\s*=)", cls: "pr" },
          { pat: "\\b(?:true|false)\\b|\\b\\d{4}-\\d{2}-\\d{2}(?:[T ]\\d{2}:\\d{2}:\\d{2}(?:\\.\\d+)?(?:Z|[+-]\\d{2}:\\d{2})?)?\\b", cls: "n" },
          { pat: P_NUM, cls: "n" },
        ];
        break;
      case "dockerfile":
        rules = [
          { pat: P_HASH, cls: "c" },
          { pat: "^[ \\t]*(?:FROM|RUN|CMD|LABEL|EXPOSE|ENV|ADD|COPY|ENTRYPOINT|VOLUME|USER|WORKDIR|ARG|ONBUILD|STOPSIGNAL|HEALTHCHECK|SHELL|AS)\\b", cls: "k" },
          { pat: P_DQ, cls: "s" }, { pat: P_SQ, cls: "s" },
          { pat: "\\$(?:\\{[^}\\n]+\\}|[A-Za-z_]\\w*)", cls: "m" },
          { pat: "(?:^|[ \\t])--[A-Za-z0-9][\\w=-]*", html: (t) => (t[0] === "-" ? `<span class="hl-pr">${esc(t)}</span>` : esc(t[0]) + `<span class="hl-pr">${esc(t.slice(1))}</span>`) },
          { pat: P_NUM, cls: "n" },
        ];
        flags = "gim";
        break;
      case "makefile":
        rules = [
          { pat: P_HASH, cls: "c" },
          { pat: "^[A-Za-z0-9_.\\-/]+(?=\\s*:[^=])", cls: "fn" },
          { pat: "^[ \\t]*(?:include|-include|ifeq|ifneq|ifdef|ifndef|else|endif|export|unexport|override|define|endef|\\.PHONY|\\.DEFAULT_GOAL)\\b", cls: "k" },
          { pat: "^[ \\t]*[A-Za-z_]\\w*(?=\\s*[:+?]?=)", cls: "pr" },
          { pat: "\\$(?:\\([^)\\n]+\\)|\\{[^}\\n]+\\}|[@<^?*+%|])", cls: "m" },
          { pat: P_DQ, cls: "s" }, { pat: P_SQ, cls: "s" },
        ];
        break;
    }
    return rules ? (GRAMMARS[id] = compileRules(rules, flags)) : null;
  }
  function highlightCode(code, langId) {
    if (!langId || code.length > HL_MAX_BYTES) return esc(code);
    const g = getGrammar(langId);
    return g ? scanCompiled(code, g) : esc(code);
  }

  // ───────────────────────────── file viewer
  // A file an agent mentions opens here, read-only, from the computer it is on.
  const IMG_EXT = /\.(png|jpe?g|gif|webp|svg|bmp|ico)$/i;
  const MD_EXT = /\.(md|markdown|mdx)$/i;
  const HTML_EXT = /\.html?$/i;
  const htmlFileURL = (path, machine = "") => {
    if (typeof window.__collieDemoHtmlUrl === "function") {
      const u = window.__collieDemoHtmlUrl(path);
      if (u) return u;
    }
    return `/api/file?path=${encodeURIComponent(path)}${machine ? "&machine=" + encodeURIComponent(machine) : ""}&as=html`;
  };
  const fileLinkAttrs = (rawPath, escapedPath, titleText) => HTML_EXT.test(rawPath)
    ? `class="fpath html-link" href="${esc(htmlFileURL(rawPath))}" target="_blank" rel="noopener" data-path="${escapedPath}" title="${esc("在新标签页打开 " + rawPath)}"`
    : IMG_EXT.test(rawPath)
    ? `class="fpath img-link" href="#" data-path="${escapedPath}" title="${esc("查看大图 " + (rawPath.split("/").pop() || rawPath))}"`
    : `class="fpath" href="#" data-path="${escapedPath}" title="${titleText}"`;
  const IMG_TYPE = { svg: "image/svg+xml", jpg: "image/jpeg", jpeg: "image/jpeg", ico: "image/x-icon" };
  const imgMime = (p) => {
    const ext = String(p || "").split(".").pop().toLowerCase();
    return IMG_TYPE[ext] || "image/" + ext;
  };
  function fileContextMachine() {
    if (view === "pane") return find(current)?.machine;
    if (view === "ext") {
      const id = extCur || "";
      return (id.startsWith("h:") ? hist.find((h) => h.id === id.slice(2)) : ext.find((x) => x.id === id))?.machine;
    }
  }
  async function fetchFile(path, machine) {
    const q = `/api/file?path=${encodeURIComponent(path)}${machine ? "&machine=" + encodeURIComponent(machine) : ""}${IMG_EXT.test(path) ? "&as=image" : ""}`;
    const r = routeReq(q);
    const res = await authFetch(r.url, { headers: r.hub ? { Authorization: "Bearer " + r.hub.token } : {}, credentials: r.hub ? "omit" : "same-origin" }, !!r.hub);
    if (res.status === 401 && !r.hub) { showLogin(); throw new Error("unauthorized"); }
    if (res.status === 404) return null;
    if (!res.ok) { let e = {}; try { e = await res.json(); } catch {} throw new Error(e.error || "打不开这个文件"); }
    return { kind: res.headers.get("X-File-Kind"), size: +res.headers.get("X-File-Size") || 0,
      path: decodeURIComponent(res.headers.get("X-File-Path") || path), blob: await res.blob(), machine };
  }
  // Where the message came from first, then the hub, then every other computer.
  const fileTries = () => {
    const ms = (state.machines || []).filter((m) => !m.hub && (m.local || m.online)).map((m) => m.local ? "" : m.id);
    return [...new Set([fileContextMachine() ?? "", "", ...ms])];
  };
  async function findFile(path, tries = fileTries()) {
    for (const m of tries) { const f = await fetchFile(path, m); if (f) return f; }
    return null;
  }
  let fileUrl = "", wideFileUrl = "", fileSeq = 0, wideSeq = 0;
  let fvCur = null, rvCur = null;
  const FILE_DL_MAX = 100 * (1 << 20), FILE_COPY_MAX = 20 * (1 << 20);
  const wideFileHash = (path, machine = "") => {
    const q = new URLSearchParams({ path });
    if (machine) q.set("machine", machine);
    return "#/file?" + q.toString();
  };
  const baseFileName = (raw) => {
    const s = String(raw || "").split(/[?#]/)[0].replace(/\/+$/, "");
    const n = s.split("/").pop() || "";
    try { return decodeURIComponent(n) || "download"; } catch { return n || "download"; }
  };
  function triggerBlobDownload(blob, fileName) {
    const u = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = u;
    a.download = fileName;
    a.style.display = "none";
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 60000);
  }
  async function downloadCurFile(cur) {
    if (!cur?.reqPath) return;
    if (cur.size > FILE_DL_MAX) {
      toast("文件超过 100 MB，无法通过网页直接下载", "attn");
      return;
    }
    const fileName = baseFileName(cur.path || cur.reqPath);
    const machine = cur.machine || "";
    const q = `/api/file?path=${encodeURIComponent(cur.reqPath)}${machine ? "&machine=" + encodeURIComponent(machine) : ""}&download=1`;
    if (window.__collieDemo && !cur.truncated && cur.blob) {
      triggerBlobDownload(cur.blob, fileName);
      return;
    }
    const r = routeReq(q);
    if (window.__collieDemo || r.hub) {
      try {
        const res = await fetch(r.url, {
          headers: r.hub ? { Authorization: "Bearer " + r.hub.token } : {},
          credentials: r.hub ? "omit" : "same-origin",
        });
        if (!res.ok) {
          let e = {};
          try { e = await res.json(); } catch {}
          throw new Error(e.error || "下载失败");
        }
        triggerBlobDownload(await res.blob(), fileName);
      } catch (err) {
        toast(err.message || "下载失败", "attn");
      }
      return;
    }
    const a = document.createElement("a");
    a.href = q;
    a.download = fileName;
    a.style.display = "none";
    document.body.append(a);
    a.click();
    a.remove();
  }
  async function fetchFullTextForCopy(cur) {
    const q = `/api/file?path=${encodeURIComponent(cur.reqPath)}${cur.machine ? "&machine=" + encodeURIComponent(cur.machine) : ""}&download=1`;
    const r = routeReq(q);
    const res = await authFetch(r.url, {
      headers: r.hub ? { Authorization: "Bearer " + r.hub.token } : {},
      credentials: r.hub ? "omit" : "same-origin",
    }, !!r.hub);
    if (res.status === 401 && !r.hub) { showLogin(); throw new Error("unauthorized"); }
    if (!res.ok) {
      let e = {};
      try { e = await res.json(); } catch {}
      throw new Error(e.error || "拉取完整原文失败");
    }
    const full = await res.text();
    cur.rawText = full;
    cur.truncated = false;
    return full;
  }
  function syncFileBar(prefix, { langLabel = "", copyable = false, copyTitle = "复制全文", downloadable = false, wideHref = "" }) {
    const lEl = $("#" + prefix + "-lang"), cWrap = $("#" + prefix + "-copy-wrap"), cBtn = $("#" + prefix + "-copy");
    const dlBtn = $("#" + prefix + "-dl"), wideBtn = prefix === "fv" ? $("#fv-wide") : null;
    if (lEl) { lEl.hidden = !langLabel; lEl.textContent = langLabel; }
    if (dlBtn) dlBtn.hidden = !downloadable;
    if (cWrap) cWrap.hidden = !copyable;
    if (cBtn) {
      cBtn.title = copyTitle;
      cBtn.setAttribute("aria-label", copyTitle);
      cBtn.removeAttribute("data-copied");
      cBtn.removeAttribute("data-failed");
      if (cBtn.nextElementSibling) cBtn.nextElementSibling.textContent = "";
    }
    if (wideBtn) {
      wideBtn.hidden = !wideHref;
      if (wideHref) wideBtn.href = wideHref;
    }
  }
  function renderCodeBody(body, path, text, cut, srcId, wrapCard = false) {
    const lang = detectCodeLang(path, true);
    const norm = text.replace(/\r\n/g, "\n").replace(/\n$/, "");
    let lines = 1;
    for (let i = 0; i < norm.length && lines <= HL_MAX_LINES + 1; i++) if (norm.charCodeAt(i) === 10) lines++;
    let inner = "";
    if (lang && norm.length <= HL_MAX_BYTES && lines <= HL_MAX_LINES) {
      const nums = Array.from({ length: lines }, (_, i) => i + 1).join("\n");
      body.classList.add("is-code");
      inner = `<div class="fv-code"><div class="fv-ln" aria-hidden="true">${nums}</div><pre class="fv-pre"><code id="${srcId}">${highlightCode(norm, lang.id)}</code></pre></div>`;
    } else if (lang) {
      body.classList.add("is-code");
      inner = `<pre class="fv-pre fv-large" id="${srcId}">${esc(norm)}</pre>`;
    } else if (wrapCard) {
      body.classList.add("is-code");
      inner = `<pre class="fv-pre fv-large" id="${srcId}">${esc(text)}</pre>`;
    } else {
      inner = `<pre class="fv-pre" id="${srcId}">${esc(text)}</pre>`;
    }
    body.innerHTML = wrapCard ? `<div class="rv-code-card">${inner}</div>${cut}` : `${inner}${cut}`;
    return lang;
  }
  async function openFile(path) {
    if (IMG_EXT.test(path)) { openLightbox([{ path }], 0); return; }
    const body = $("#fv-body"), seq = ++fileSeq;
    fvCur = null;
    body.classList.remove("is-code");
    const initMachine = fileContextMachine() || "";
    syncFileBar("fv", { wideHref: HTML_EXT.test(path) ? "" : wideFileHash(path, initMachine) });
    $("#fv-name").textContent = path.split("/").pop();
    $("#fv-path").textContent = path;
    body.innerHTML = `<p class="fv-note muted">读取中…</p>`;
    showFilePane();
    const tries = fileTries();
    let f = null;
    try {
      f = await findFile(path, tries);
    } catch (e) { syncFileBar("fv", {}); body.innerHTML = `<p class="fv-note">${esc(e.message)}</p>`; return; }
    if (seq !== fileSeq) return;
    if (!f) { syncFileBar("fv", {}); body.innerHTML = `<p class="fv-note">在${tries.length > 1 ? "各台电脑" : "这台电脑"}上都没找到这个文件。</p>`; return; }
    const where = (state.machines || []).length > 1 || f.machine ? machineName(f.machine) + " · " : "";
    $("#fv-path").textContent = where + f.path + " · " + fmtSize(f.size);
    if (fileUrl) URL.revokeObjectURL(fileUrl), fileUrl = "";
    const canDl = f.size <= FILE_DL_MAX;
    const wHref = HTML_EXT.test(path) ? "" : wideFileHash(path, f.machine || "");
    fvCur = { reqPath: path, path: f.path, machine: f.machine || "", kind: f.kind, size: f.size, blob: f.blob, rawText: "", truncated: false };
    if (f.kind === "image") {
      syncFileBar("fv", { downloadable: canDl, wideHref: wHref });
      const ext = path.split(".").pop().toLowerCase();
      fileUrl = URL.createObjectURL(new Blob([f.blob], { type: IMG_TYPE[ext] || "image/" + ext }));
      body.innerHTML = `<div class="fv-img"><img src="${fileUrl}" alt=""></div>`;
      return;
    }
    if (f.kind !== "text") {
      syncFileBar("fv", { downloadable: canDl });
      body.innerHTML = `<p class="fv-note">这个文件不是文本${f.size > 20 << 20 ? "，也太大了" : ""}，没法在这里预览${canDl ? "（可点右上角下载原件）" : ""}。</p>`;
      return;
    }
    const text = await f.blob.text();
    if (seq !== fileSeq) return;
    const truncated = f.size > f.blob.size;
    fvCur.rawText = text;
    fvCur.truncated = truncated;
    const cut = truncated ? `<p class="fv-note muted">文件有 ${fmtSize(f.size)}，这里只预览前 1 MB（点右上角下载可获取完整原件）。</p>` : "";
    if (MD_EXT.test(path)) {
      syncFileBar("fv", { langLabel: "Markdown", copyable: true, copyTitle: "复制 Markdown 源码", downloadable: canDl, wideHref: wHref });
      body.innerHTML = `<div class="msg assistant fv-md" id="fv-code-src">${md(text)}</div>${cut}`;
      body.scrollTop = body.scrollLeft = 0;
      return;
    }
    const lang = renderCodeBody(body, path, text, cut, "fv-code-src", false);
    syncFileBar("fv", { langLabel: lang ? lang.label : "", copyable: true, copyTitle: "复制全文", downloadable: canDl, wideHref: wHref });
    body.scrollTop = body.scrollLeft = 0;
  }
  async function openWideFile(rawQuery, restore = null) {
    const q = new URLSearchParams(String(rawQuery || "").replace(/^\?/, ""));
    const path = (q.get("path") || "").trim();
    const machineHint = (q.get("machine") || "").trim();
    const body = $("#rv-body"), sc = $("#rv-scroller"), seq = ++wideSeq;
    rvCur = null;
    body.classList.remove("is-code");
    syncFileBar("rv", {});
    if (!path) {
      $("#rv-name").textContent = "文件阅读";
      $("#rv-path").textContent = "";
      document.title = "文件阅读 · Collie";
      body.innerHTML = `<p class="fv-note muted">缺少文件路径参数。</p>`;
      return;
    }
    const name = path.split("/").pop() || path;
    $("#rv-name").textContent = name;
    $("#rv-path").textContent = (machineHint ? machineName(machineHint) + " · " : "") + path;
    document.title = `${name} · Collie`;
    body.innerHTML = `<p class="fv-note muted">读取中…</p>`;
    const tries = [...new Set([machineHint, ...fileTries()])];
    let f = null;
    try {
      f = await findFile(path, tries);
    } catch (e) { body.innerHTML = `<p class="fv-note">${esc(e.message)}</p>`; return; }
    if (seq !== wideSeq || view !== "file") return;
    if (!f) { body.innerHTML = `<p class="fv-note">在${tries.length > 1 ? "各台电脑" : "这台电脑"}上都没找到这个文件。</p>`; return; }
    const where = (state.machines || []).length > 1 || f.machine ? machineName(f.machine) + " · " : "";
    $("#rv-path").textContent = where + f.path + " · " + fmtSize(f.size);
    if (wideFileUrl) URL.revokeObjectURL(wideFileUrl), wideFileUrl = "";
    const canDl = f.size <= FILE_DL_MAX;
    rvCur = { reqPath: path, path: f.path, machine: f.machine || "", kind: f.kind, size: f.size, blob: f.blob, rawText: "", truncated: false };
    if (f.kind === "image") {
      syncFileBar("rv", { downloadable: canDl });
      const ext = path.split(".").pop().toLowerCase();
      wideFileUrl = URL.createObjectURL(new Blob([f.blob], { type: IMG_TYPE[ext] || "image/" + ext }));
      body.innerHTML = `<div class="rv-img"><img src="${wideFileUrl}" alt="${esc(name)}" data-wide-img="${esc(path)}"></div>`;
      if (restore) restoreSimpleScroll(sc, restore); else sc.scrollTop = 0;
      return;
    }
    if (f.kind !== "text") {
      syncFileBar("rv", { downloadable: canDl });
      body.innerHTML = `<p class="fv-note">这个文件不是文本${f.size > 20 << 20 ? "，也太大了" : ""}，没法在这里预览${canDl ? "（可点右上角下载原件）" : ""}。</p>`;
      return;
    }
    const text = await f.blob.text();
    if (seq !== wideSeq || view !== "file") return;
    const truncated = f.size > f.blob.size;
    rvCur.rawText = text;
    rvCur.truncated = truncated;
    const cut = truncated ? `<p class="fv-note muted">文件有 ${fmtSize(f.size)}，这里只显示前 1 MB（点右上角下载可获取完整原件）。</p>` : "";
    if (MD_EXT.test(path)) {
      syncFileBar("rv", { langLabel: "Markdown", copyable: true, copyTitle: "复制 Markdown 源码", downloadable: canDl });
      body.innerHTML = `<article class="msg assistant rv-md" id="rv-code-src">${md(text)}</article>${cut}`;
    } else {
      const lang = renderCodeBody(body, path, text, cut, "rv-code-src", true);
      syncFileBar("rv", { langLabel: lang ? lang.label : "", copyable: true, copyTitle: "复制全文", downloadable: canDl });
    }
    if (restore) restoreSimpleScroll(sc, restore);
    else { markProgrammaticScroll(); sc.scrollTop = sc.scrollLeft = 0; }
  }
  $("#fv-dl")?.addEventListener("click", () => downloadCurFile(fvCur));
  $("#rv-dl")?.addEventListener("click", () => downloadCurFile(rvCur));
  $("#rv-home")?.addEventListener("click", (ev) => {
    if (ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
    if (navCur > 0) {
      ev.preventDefault();
      goBack();
    }
  });
  // Images a message carries ("[image:~/.collie/images/….png]", saved from the
  // agent's transcript on its computer) show as thumbnails; tap for the lightbox.
  const IMG_TOKEN = /\[image:(~\/\.collie\/images\/[0-9a-f]+\.(?:png|jpe?g|gif|webp|svg))\]\n?/gi;
  const thumbs = new Map();    // path -> object URL, kept so redraws don't refetch
  const thumbMeta = new Map(); // path -> { size, machine, path }
  const thumbDims = new Map(); // path -> { w, h } natural dimensions to keep 0px layout stability on redraws
  const IMG_RUN = /(?:\[image:~\/\.collie\/images\/[0-9a-f]+\.(?:png|jpe?g|gif|webp|svg)\]\n?)+/gi;
  const thumbImgAttrs = (p) => {
    const src = thumbs.get(p);
    const dim = thumbDims.get(p);
    return (src ? ` src="${src}"` : "") + (dim ? ` width="${dim.w}" height="${dim.h}"` : "");
  };
  const thumbBtn = (p) => `<button type="button" class="thumb" data-img="${esc(p)}" aria-label="${esc("查看大图 " + (p.split("/").pop() || "图片"))}"><img alt=""${thumbImgAttrs(p)}></button>`;
  const withImages = (html) => html.includes("[image:") ? html.replace(IMG_RUN, (run) => `<span class="thumbs">${run.replace(IMG_TOKEN, (_, p) => thumbBtn(p))}</span>`) : html;
  async function loadThumb(img) {
    const p = img.parentElement.dataset.img;
    if (thumbs.get(p)) {
      img.src = thumbs.get(p);
      const dim = thumbDims.get(p);
      if (dim) { img.width = dim.w; img.height = dim.h; }
      return;
    }
    if (thumbs.has(p)) return; // on its way; it fills every copy when it lands
    thumbs.set(p, "");
    try {
      const f = await findFile(p);
      if (!f || f.kind !== "image") throw 0;
      const u = URL.createObjectURL(new Blob([f.blob], { type: imgMime(p) }));
      thumbs.set(p, u);
      thumbMeta.set(p, { size: f.size, machine: f.machine, path: f.path });
      invalidateMdCacheForImage(p);
      for (const el of document.querySelectorAll(".thumb[data-img] img")) {
        if (el.parentElement.dataset.img === p) { el.src = u; el.parentElement.classList.remove("broken"); }
      }
    } catch { thumbs.delete(p); img.parentElement.classList.add("broken"); }
  }
  // Under each Collie message, on hover: copy, quote, focus-thread (when no inline capsule), pin, and when it was said.
  const ICON_COPY = `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>`;
  const ICON_QUOTE = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z"/><path d="M5 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z"/></svg>`;
  const pinActBtn = (id, pinned) => `<button type="button" class="pin-btn${pinned ? " on" : ""}" data-pin="${esc(id)}" aria-pressed="${pinned}" title="${pinned ? "取消钉住" : "钉住"}" aria-label="${pinned ? "取消钉住" : "钉住"}">${ICON_PIN}</button>`;
  const focusActBtn = (id, rootId) => rootId ? `<button type="button" class="focus-btn" data-open-thread="${esc(rootId)}" data-focus-msg="${esc(id)}" aria-expanded="false" title="话题专注" aria-label="话题专注">${ICON_TOPIC}</button>` : "";
  const msgActs = (e, at, pinned = false, focusRoot = "") => e.id ? `<div class="msg-acts">
      <button type="button" data-copy="${esc(e.id)}" title="复制" aria-label="复制">${ICON_COPY}</button>
      <button type="button" class="re-btn" data-re="${esc(e.id)}" title="引用回复" aria-label="引用回复">${ICON_QUOTE}</button>
      ${focusActBtn(e.id, focusRoot)}
      ${pinActBtn(e.id, pinned)}
      ${at ? `<span class="t">${esc(sepTime(at))}</span>` : ""}</div>` : "";
  // Under your own message, at its right edge: when you said it, focus-thread, copy, and pin.
  const mineActs = (e, at, pinned = false, focusRoot = "") => e.id ? `<div class="msg-acts">${at ? `<span class="t">${esc(sepTime(at))}</span>` : ""}
      ${focusActBtn(e.id, focusRoot)}
      <button type="button" data-copy="${esc(e.id)}" title="复制" aria-label="复制">${ICON_COPY}</button>
      ${pinActBtn(e.id, pinned)}</div>` : "";
  async function copyText(t) {
    if (navigator.clipboard && window.isSecureContext) {
      try { await navigator.clipboard.writeText(t); return true; } catch {}
    }
    // Plain-HTTP LAN addresses have no Async Clipboard API: synchronous textarea fallback.
    // Mount inside any open top-layer <dialog> because document.body is inert while showModal() is active.
    const ta = Object.assign(document.createElement("textarea"), { value: t });
    ta.setAttribute("readonly", "");
    ta.style.cssText = "position:fixed;inset-block-start:0;opacity:0";
    const host = document.querySelector("dialog[open]") || document.body;
    host.append(ta);
    ta.select();
    try { return document.execCommand("copy"); } catch { return false; } finally { ta.remove(); }
  }
  const copyTimers = new WeakMap();
  let lastCopyMsg = "";
  function reportCopy(button, ok) {
    const tip = button.nextElementSibling;
    clearTimeout(copyTimers.get(button));
    button.removeAttribute("data-copied");
    button.removeAttribute("data-failed");
    let msg = ok ? "已复制" : "复制失败";
    if (msg === lastCopyMsg) msg += "\u00A0";
    lastCopyMsg = msg;
    if (tip) tip.textContent = "";
    void button.offsetWidth;
    button.setAttribute(ok ? "data-copied" : "data-failed", "");
    if (tip) requestAnimationFrame(() => { tip.textContent = msg; });
    copyTimers.set(button, setTimeout(() => {
      button.removeAttribute("data-copied");
      button.removeAttribute("data-failed");
      if (tip) tip.textContent = "";
    }, 1500));
  }
  async function invokeCopy(button, target) {
    const cur = target?.id === "fv-code-src" ? fvCur : target?.id === "rv-code-src" ? rvCur : null;
    if (cur) {
      if (cur.truncated) {
        if (cur.size > FILE_COPY_MAX) {
          reportCopy(button, false);
          toast("文件超过 20 MB，请点下载按钮获取完整原件", "attn");
          return;
        }
        try {
          const full = await fetchFullTextForCopy(cur);
          const ok = await copyText(full);
          reportCopy(button, ok);
          if (!ok) toast("完整全文已加载，再点一次即可复制");
        } catch (err) {
          reportCopy(button, false);
          toast(err.message || "复制失败", "attn");
        }
        return;
      }
      if (!cur.rawText) return;
      reportCopy(button, await copyText(cur.rawText));
      return;
    }
    const text = target?.textContent || "";
    if (!text) return;
    reportCopy(button, await copyText(text));
  }
  if ("CommandEvent" in window) {
    document.addEventListener("command", (ev) => {
      if (ev.command === "--copy") invokeCopy(ev.source, ev.target);
    }, true);
  } else {
    document.addEventListener("click", (ev) => {
      const btn = ev.target.closest('button[command="--copy"]');
      if (!btn) return;
      const target = document.getElementById(btn.getAttribute("commandfor"));
      if (target) invokeCopy(btn, target);
    });
  }
  document.addEventListener("click", async (ev) => {
    const pb = ev.target.closest(".pin-btn[data-pin]");
    if (pb) { ev.preventDefault(); togglePin(pb.dataset.pin); return; }
    const b = ev.target.closest("[data-copy]");
    if (!b) return;
    const e = chatEntries().find((x) => x.id === b.dataset.copy);
    if (e) toast(await copyText(e.text) ? "已复制" : "复制失败", "");
  });
  // A reply's quote: open the reply-thread drawer when part of a chain (or locate in main chat when already open / standalone).
  document.addEventListener("click", (e) => {
    const agentTh = e.target.closest(".item-th-btn[data-agent-thread]");
    if (agentTh) {
      e.preventDefault();
      openThreadFromAnywhere(agentTh.dataset.agentThread, agentTh.dataset.agentFocus || "");
      return;
    }
    const openTh = e.target.closest("[data-open-thread]");
    if (openTh) {
      e.preventDefault();
      openThreadDrawer(openTh.dataset.openThread, openTh.dataset.focusMsg || "", openTh.dataset.focusMsg || "");
      return;
    }
    const a = e.target.closest("a.re[data-goto], a.re[data-goto-worker]");
    if (!a) return;
    e.preventDefault();
    const opts = e.detail === 0 && a.matches(":focus-visible") ? { focus: true } : undefined;
    if (a.dataset.threadRoot && !a.closest("#thread-drawer")) {
      const rootId = a.dataset.threadRoot;
      const targetId = a.dataset.goto || "";
      const msgId = a.closest(".msg[data-id]")?.dataset.id || targetId;
      if (activeThreadRoot === rootId) {
        if (targetId) jumpToEntry(targetId, opts);
      } else {
        openThreadDrawer(rootId, targetId || msgId, msgId);
      }
      return;
    }
    if (a.dataset.goto) jumpToEntry(a.dataset.goto, opts);
    else if (a.dataset.gotoWorker) jumpToWorkerEvent(a.dataset.gotoWorker, a.dataset.before || "", opts);
  });
  // No hover on a phone: tap a Collie chat message to see when it was said.
  document.addEventListener("click", (e) => {
    if (!matchMedia("(hover: none)").matches) return;
    const m = e.target.closest("#v-collie .msg[data-time], #v-collie .say .msg, #v-collie .mine .msg");
    if (m && e.target.closest("a, button, .thumb, img")) return;
    for (const x of document.querySelectorAll("#v-collie .msg.show-time")) if (x !== m) x.classList.remove("show-time");
    m?.classList.toggle("show-time");
  });
  const NO_THUMB_IDS = new Set(["live-list", "recent-list", "attention", "shells", "crew", "collie-threads-list", "router-status", "screen", "log"]);
  function triggerThumbLoads(root) {
    if (!root || root.nodeType !== 1) return;
    if (root.tagName === "IMG") {
      if (!root.getAttribute("src") && !root.dataset.asked && root.parentElement?.classList?.contains("thumb")) {
        root.dataset.asked = 1;
        loadThumb(root);
      }
      return;
    }
    if (root.childElementCount === 0) return;
    for (const img of root.querySelectorAll(".thumb img:not([src])")) {
      if (!img.dataset.asked) { img.dataset.asked = 1; loadThumb(img); }
    }
  }
  new MutationObserver((ms) => {
    for (const m of ms) {
      const t = m.target;
      if (NO_THUMB_IDS.has(t?.id) || isScreenDomTarget(t)) continue;
      for (const n of m.addedNodes) triggerThumbLoads(n);
    }
  }).observe(document.body, { childList: true, subtree: true });

  // ───────────────────────────── fullscreen image lightbox
  const lightbox = $("#lightbox"), lbStage = $("#lb-stage"), lbImg = $("#lb-img");
  const lbName = $("#lb-name"), lbCount = $("#lb-count"), lbMeta = $("#lb-meta"), lbStatus = $("#lb-status");
  const lbZoomBtn = $("#lb-zoom"), lbZoomPct = $("#lb-zoom-pct"), lbOpenLink = $("#lb-open"), lbDlLink = $("#lb-dl");
  const lbPrevBtn = $("#lb-prev"), lbNextBtn = $("#lb-next"), lbCloseBtn = $("#lb-close");
  let lbItems = [], lbIdx = 0, lbSeq = 0, lbTempUrl = "", lbCurMeta = null;
  let lbScale = 1, lbX = 0, lbY = 0, lbSavedScroll = null;
  const lbTabProtected = new Set();

  let supportsDisplayTransition;
  function canTransitionDisplay() {
    if (supportsDisplayTransition !== undefined) return supportsDisplayTransition;
    if (!window.CSS?.supports?.("transition-behavior", "allow-discrete") || !document.body) return false;
    const probe = document.createElement("div");
    probe.style.cssText = "transition: display 1s allow-discrete !important; display: block;";
    document.body.appendChild(probe);
    getComputedStyle(probe).display;
    probe.style.display = "none";
    supportsDisplayTransition = getComputedStyle(probe).display === "block";
    probe.remove();
    return supportsDisplayTransition;
  }
  const supportsTopLayerExit = () => !!(window.CSS?.supports?.("overlay", "auto") && canTransitionDisplay());

  function releaseLbTempUrl() {
    if (!lbTempUrl) return;
    const u = lbTempUrl;
    lbTempUrl = "";
    // Never revoke an ObjectURL currently shared with the `thumbs` cache.
    for (const v of thumbs.values()) if (v === u) return;
    if (lbTabProtected.has(u)) {
      setTimeout(() => { lbTabProtected.delete(u); URL.revokeObjectURL(u); }, 60000);
    } else {
      URL.revokeObjectURL(u);
    }
  }
  const cleanImgName = (raw, fallback = "图片") => {
    const s = String(raw || "").split(/[?#]/)[0].replace(/\/+$/, "");
    const n = s.split("/").pop() || "";
    try { return decodeURIComponent(n) || fallback; } catch { return n || fallback; }
  };
  function updateLbMeta() {
    if (!lbMeta) return;
    const parts = [];
    if (lbCurMeta) {
      const multi = (state.machines || []).length > 1;
      if (multi || lbCurMeta.machine) parts.push(machineName(lbCurMeta.machine));
      if (lbCurMeta.isSvg) parts.push("SVG");
      else if (lbCurMeta.width > 0 && lbCurMeta.height > 0) parts.push(`${lbCurMeta.width} × ${lbCurMeta.height}`);
      if (lbCurMeta.size > 0) parts.push(fmtSize(lbCurMeta.size));
    }
    lbMeta.textContent = parts.join(" · ");
  }
  function setLbReady(ready, url = "", dlName = "") {
    if (lbZoomBtn) {
      if (!ready && document.activeElement === lbZoomBtn) lbCloseBtn?.focus({ preventScroll: true });
      lbZoomBtn.disabled = !ready;
    }
    for (const a of [lbOpenLink, lbDlLink]) {
      if (!a) continue;
      if (ready && url) {
        a.href = url;
        a.removeAttribute("aria-disabled");
        a.tabIndex = 0;
      } else {
        a.href = "#";
        a.setAttribute("aria-disabled", "true");
        a.tabIndex = -1;
      }
    }
    if (lbDlLink) {
      if (ready && dlName) lbDlLink.setAttribute("download", dlName);
      else lbDlLink.removeAttribute("download");
    }
  }
  function clampLbPan() {
    if (lbScale <= 1.005) { lbScale = 1; lbX = 0; lbY = 0; return; }
    const st = lbStage.getBoundingClientRect();
    const bw = lbImg.offsetWidth || 0, bh = lbImg.offsetHeight || 0;
    const maxX = Math.max(0, (bw * lbScale - st.width) / 2 + 24);
    const maxY = Math.max(0, (bh * lbScale - st.height) / 2 + 24);
    lbX = Math.min(maxX, Math.max(-maxX, lbX));
    lbY = Math.min(maxY, Math.max(-maxY, lbY));
  }
  function applyLbTransform(immediate = false) {
    clampLbPan();
    const zoomed = lbScale > 1.005;
    lightbox.classList.toggle("is-zoomed", zoomed);
    if (immediate) lightbox.classList.add("no-anim");
    lbImg.style.transform = zoomed ? `translate3d(${lbX.toFixed(1)}px, ${lbY.toFixed(1)}px, 0) scale(${lbScale.toFixed(3)})` : "";
    if (immediate) requestAnimationFrame(() => lightbox.classList.remove("no-anim"));
    if (lbZoomBtn) {
      lbZoomBtn.classList.toggle("zoomed", zoomed);
      lbZoomBtn.setAttribute("aria-pressed", String(zoomed));
      const label = zoomed ? "缩回适屏 (1x)" : "放大查看细节";
      lbZoomBtn.title = label;
      lbZoomBtn.setAttribute("aria-label", label);
    }
    if (lbZoomPct) {
      lbZoomPct.textContent = !zoomed ? "1x" : (Math.abs(lbScale - Math.round(lbScale)) < 0.06 ? `${Math.round(lbScale)}x` : `${lbScale.toFixed(1)}x`);
    }
  }
  function targetLbZoomScale() {
    const bw = lbImg.offsetWidth || 0, nw = lbImg.naturalWidth || 0;
    if (bw > 0 && nw > 0 && !lbImg.classList.contains("is-svg")) {
      const ratio = nw / bw;
      if (narrow()) return Math.max(2, Math.min(ratio > 1.2 ? ratio : 2.4, 3));
      return ratio >= 1.35 ? Math.min(ratio, 4) : 2;
    }
    return 2;
  }
  function zoomLbTo(nextScale, clientX, clientY, immediate = false) {
    const clamped = Math.min(6, Math.max(1, nextScale));
    if (clamped <= 1.005) {
      lbScale = 1; lbX = 0; lbY = 0;
      applyLbTransform(immediate);
      return;
    }
    if (typeof clientX === "number" && typeof clientY === "number") {
      const r = lbStage.getBoundingClientRect();
      const ox = clientX - (r.left + r.width / 2);
      const oy = clientY - (r.top + r.height / 2);
      const factor = clamped / lbScale;
      lbX = ox - (ox - lbX) * factor;
      lbY = oy - (oy - lbY) * factor;
    }
    lbScale = clamped;
    applyLbTransform(immediate);
  }
  function toggleLbZoom(clientX, clientY) {
    if (lbImg.hidden || lbZoomBtn?.disabled) return;
    if (lbScale > 1.005) zoomLbTo(1);
    else zoomLbTo(targetLbZoomScale(), clientX, clientY);
  }
  function collectGallery(triggerEl, fallbackItem) {
    const scope = triggerEl?.closest(".rv-md") || triggerEl?.closest(".fv-md") || triggerEl?.closest(".mem-body") || triggerEl?.closest(".td-text") || triggerEl?.closest(".msg") || triggerEl?.closest(".thumbs");
    if (!scope) return { items: [fallbackItem], index: 0 };
    const seen = new Set(), items = [];
    const add = (it) => {
      const key = it.path ? "p:" + it.path : (it.url ? "u:" + it.url : "");
      if (!key || seen.has(key)) return;
      seen.add(key);
      items.push(it);
    };
    for (const el of scope.querySelectorAll(".thumb[data-img], .md-img-btn[data-img-url], a.fpath[data-path], img")) {
      if (el.classList.contains("thumb") && el.dataset.img) {
        add({ path: el.dataset.img, alt: el.dataset.imgAlt || "" });
      } else if (el.classList.contains("md-img-btn") && el.dataset.imgUrl) {
        add({ url: el.dataset.imgUrl, alt: el.dataset.imgAlt || "" });
      } else if (el.matches("a.fpath[data-path]")) {
        const p = el.dataset.path || "";
        if (IMG_EXT.test(p)) add({ path: p, alt: "" });
      } else if (el.tagName === "IMG" && !el.closest(".thumb, .md-img-btn, .avatar")) {
        const u = el.currentSrc || el.getAttribute("src") || "";
        if (u) add({ url: u, alt: el.getAttribute("alt") || "" });
      }
    }
    const wantKey = fallbackItem.path ? "p:" + fallbackItem.path : "u:" + (fallbackItem.url || "");
    let index = items.findIndex((it) => (it.path ? "p:" + it.path : "u:" + (it.url || "")) === wantKey);
    if (index < 0) { items.push(fallbackItem); index = items.length - 1; }
    return { items, index };
  }
  async function showLbSlide(idx) {
    if (!lbItems.length) return;
    lbIdx = ((idx % lbItems.length) + lbItems.length) % lbItems.length;
    const item = lbItems[lbIdx], seq = ++lbSeq;
    releaseLbTempUrl();
    lbScale = 1; lbX = 0; lbY = 0;
    applyLbTransform(true);
    const multi = lbItems.length > 1;
    lbPrevBtn.hidden = !multi;
    lbNextBtn.hidden = !multi;
    lbCount.hidden = !multi;
    if (multi) lbCount.textContent = `${lbIdx + 1} / ${lbItems.length}`;

    const name = cleanImgName(item.path || item.url, item.alt || "图片");
    lbName.textContent = item.alt && !item.path ? item.alt : name;
    lbCurMeta = null;
    updateLbMeta();
    setLbReady(false);

    const isSvg = /\.svg(?:$|[?#])/i.test(item.path || item.url || "");
    lbImg.classList.toggle("is-svg", isSvg);
    lbImg.alt = item.alt || name;

    const showErr = (msg) => {
      if (seq !== lbSeq) return;
      lbImg.hidden = true;
      lbImg.removeAttribute("src");
      lbStatus.className = "lb-status";
      lbStatus.textContent = msg;
      lbStatus.hidden = false;
      setLbReady(false);
    };
    const showUrl = (u, meta) => {
      if (seq !== lbSeq) return;
      lbCurMeta = { ...meta, isSvg, width: 0, height: 0 };
      updateLbMeta();
      lbImg.onload = () => {
        if (seq !== lbSeq) return;
        lbStatus.hidden = true;
        lbImg.hidden = false;
        if (lbCurMeta) {
          lbCurMeta.width = lbImg.naturalWidth || 0;
          lbCurMeta.height = lbImg.naturalHeight || 0;
          updateLbMeta();
        }
        setLbReady(true, u, name);
      };
      lbImg.onerror = () => showErr("这张图片加载失败了。");
      lbImg.src = u;
    };

    // 1. Direct remote/static URL (e.g. Markdown ![alt](https://...))
    if (!item.path && item.url) {
      lbImg.hidden = true;
      lbStatus.className = "lb-status loading";
      lbStatus.textContent = "加载图片中…";
      lbStatus.hidden = false;
      showUrl(item.url, {});
      return;
    }

    // 2. Cached in `thumbs`: instant display, zero refetch, never revoked on close.
    const cached = thumbs.get(item.path);
    if (cached) {
      lbStatus.hidden = true;
      const m = thumbMeta.get(item.path) || {};
      showUrl(cached, { size: m.size || 0, machine: m.machine ?? fileContextMachine() ?? "" });
      return;
    }

    // 3. Cross-machine fetch via `findFile` (hub / node / remote hub Bearer).
    lbImg.hidden = true;
    lbImg.removeAttribute("src");
    lbStatus.className = "lb-status loading";
    lbStatus.textContent = "读取原图中…";
    lbStatus.hidden = false;
    const tries = fileTries();
    let f = null;
    try {
      f = await findFile(item.path, tries);
    } catch (err) {
      showErr(err.message || "打不开这张图片。");
      return;
    }
    if (seq !== lbSeq) return;
    if (!f) {
      showErr(`在${tries.length > 1 ? "各台电脑" : "这台电脑"}上都没找到这张图片。`);
      return;
    }
    if (f.kind !== "image") {
      showErr(f.size > 20 << 20 ? `这张图片有 ${fmtSize(f.size)}（超过 20 MB），没法直接预览。` : "这个文件不是受支持的图片格式。");
      return;
    }
    const blobUrl = URL.createObjectURL(new Blob([f.blob], { type: imgMime(item.path) }));
    // If a `.thumb` in the DOM is waiting on this exact path, share it into `thumbs`.
    if (document.querySelector(`.thumb[data-img="${CSS.escape(item.path)}"]`)) {
      thumbs.set(item.path, blobUrl);
      thumbMeta.set(item.path, { size: f.size, machine: f.machine, path: f.path });
      for (const el of document.querySelectorAll(".thumb[data-img] img")) {
        if (el.parentElement.dataset.img === item.path) { el.src = blobUrl; el.parentElement.classList.remove("broken"); }
      }
    } else {
      lbTempUrl = blobUrl;
    }
    showUrl(blobUrl, { size: f.size, machine: f.machine });
  }
  function openLightbox(items, index = 0) {
    if (!lightbox || !items?.length) return;
    const sc = viewScroller(view);
    lbSavedScroll = sc ? { sc, top: sc.scrollTop } : null;
    lbItems = items;
    lightbox.removeAttribute("data-closing");
    if (!lightbox.open) {
      markProgrammaticScroll(150);
      lightbox.showModal();
      if (lbSavedScroll?.sc && lbSavedScroll.sc.scrollTop !== lbSavedScroll.top) {
        lbSavedScroll.sc.scrollTop = lbSavedScroll.top;
      }
    }
    showLbSlide(index);
  }
  async function closeLightbox() {
    if (!lightbox?.open || lightbox.hasAttribute("data-closing")) return;
    markProgrammaticScroll(180);
    if (!supportsTopLayerExit()) {
      lightbox.setAttribute("data-closing", "");
      const anims = lightbox.getAnimations({ subtree: true });
      if (anims.length) {
        await Promise.race([
          Promise.allSettled(anims.map((a) => a.finished)),
          new Promise((r) => setTimeout(r, 240)),
        ]);
      }
      if (!lightbox.hasAttribute("data-closing")) return;
      lightbox.removeAttribute("data-closing");
    }
    if (lightbox.open) lightbox.close();
  }
  if (lightbox) {
    // Fallback for browsers without native <dialog closedby="any"> support.
    if (!("closedBy" in HTMLDialogElement.prototype)) {
      lightbox.addEventListener("click", (ev) => {
        if (ev.target !== lightbox) return;
        const r = lightbox.getBoundingClientRect();
        const inside = r.top <= ev.clientY && ev.clientY <= r.top + r.height && r.left <= ev.clientX && ev.clientX <= r.left + r.width;
        if (!inside) closeLightbox();
      });
    }
    lightbox.addEventListener("cancel", (ev) => {
      markProgrammaticScroll(180);
      if (!supportsTopLayerExit()) {
        ev.preventDefault();
        closeLightbox();
      }
    });
    lightbox.addEventListener("close", () => {
      lightbox.returnValue = "";
      lightbox.removeAttribute("data-closing");
      lightbox.classList.remove("is-zoomed", "is-dragging", "no-anim");
      lbSeq++;
      releaseLbTempUrl();
      lbImg.onload = lbImg.onerror = null;
      lbImg.removeAttribute("src");
      lbImg.hidden = true;
      lbStatus.hidden = true;
      lbScale = 1; lbX = 0; lbY = 0;
      if (lbSavedScroll?.sc && lbSavedScroll.sc.scrollTop !== lbSavedScroll.top) {
        markProgrammaticScroll(120);
        lbSavedScroll.sc.scrollTop = lbSavedScroll.top;
      }
      lbSavedScroll = null;
    });
    lbCloseBtn?.addEventListener("click", () => closeLightbox());
    lbZoomBtn?.addEventListener("click", () => toggleLbZoom());
    lbOpenLink?.addEventListener("click", (ev) => {
      if (lbOpenLink.getAttribute("aria-disabled") === "true") { ev.preventDefault(); return; }
      if (lbTempUrl && lbOpenLink.href === lbTempUrl) lbTabProtected.add(lbTempUrl);
    });
    lbDlLink?.addEventListener("click", (ev) => {
      if (lbDlLink.getAttribute("aria-disabled") === "true") ev.preventDefault();
    });
    lbPrevBtn?.addEventListener("click", () => showLbSlide(lbIdx - 1));
    lbNextBtn?.addEventListener("click", () => showLbSlide(lbIdx + 1));
    document.addEventListener("keydown", (ev) => {
      if (!lightbox.open || lightbox.hasAttribute("data-closing") || ev.metaKey || ev.ctrlKey || ev.altKey) return;
      if (ev.key === "ArrowLeft" && lbItems.length > 1) { ev.preventDefault(); showLbSlide(lbIdx - 1); }
      else if (ev.key === "ArrowRight" && lbItems.length > 1) { ev.preventDefault(); showLbSlide(lbIdx + 1); }
      else if (ev.key === "+" || ev.key === "=") { ev.preventDefault(); if (!lbImg.hidden) zoomLbTo(lbScale * 1.35); }
      else if (ev.key === "-") { ev.preventDefault(); if (!lbImg.hidden) zoomLbTo(lbScale / 1.35); }
      else if (ev.key === "0") { ev.preventDefault(); zoomLbTo(1); }
    });
    lightbox.addEventListener("wheel", (ev) => {
      if (lbImg.hidden || lbZoomBtn?.disabled) return;
      ev.preventDefault();
      const factor = Math.exp(-ev.deltaY * 0.0022);
      zoomLbTo(lbScale * factor, ev.clientX, ev.clientY, true);
    }, { passive: false });

    // Pointer gestures on stage: backdrop light-dismiss, click-to-zoom, 1-finger pan, 2-finger pinch & 1x swipe.
    const ptrs = new Map();
    let gesture = null;
    lbStage.addEventListener("pointerdown", (ev) => {
      if (ev.button !== 0 && ev.pointerType === "mouse") return;
      ptrs.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      if (ptrs.size === 2) {
        const [a, b] = [...ptrs.values()];
        gesture = {
          kind: "pinch", moved: true,
          dist: Math.hypot(b.x - a.x, b.y - a.y) || 1,
          scale0: lbScale,
        };
        lightbox.classList.add("is-dragging");
        return;
      }
      gesture = {
        kind: "single", pointerId: ev.pointerId,
        startX: ev.clientX, startY: ev.clientY,
        panX0: lbX, panY0: lbY,
        target: ev.target, moved: false,
      };
      if (lbScale > 1.005 && ev.target === lbImg) {
        try { lbStage.setPointerCapture(ev.pointerId); } catch {}
      }
    });
    lbStage.addEventListener("pointermove", (ev) => {
      if (!ptrs.has(ev.pointerId)) return;
      ptrs.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      if (ptrs.size === 2 && gesture?.kind === "pinch" && !lbImg.hidden) {
        const [a, b] = [...ptrs.values()];
        const dist = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        const midX = (a.x + b.x) / 2, midY = (a.y + b.y) / 2;
        zoomLbTo(gesture.scale0 * (dist / gesture.dist), midX, midY, true);
        return;
      }
      if (!gesture || gesture.kind !== "single" || gesture.pointerId !== ev.pointerId) return;
      const dx = ev.clientX - gesture.startX, dy = ev.clientY - gesture.startY;
      if (!gesture.moved && Math.hypot(dx, dy) > 5) {
        gesture.moved = true;
        if (lbScale > 1.005) lightbox.classList.add("is-dragging");
      }
      if (gesture.moved && lbScale > 1.005) {
        lbX = gesture.panX0 + dx;
        lbY = gesture.panY0 + dy;
        applyLbTransform(true);
      }
    });
    const endPtr = (ev, cancelled = false) => {
      ptrs.delete(ev.pointerId);
      if (ptrs.size === 0) lightbox.classList.remove("is-dragging");
      if (!gesture || cancelled) { if (!ptrs.size) gesture = null; return; }
      if (gesture.kind === "single" && gesture.pointerId === ev.pointerId) {
        const g = gesture;
        gesture = null;
        const dx = ev.clientX - g.startX, dy = ev.clientY - g.startY;
        if (!g.moved) {
          if (g.target === lbImg && !lbImg.hidden) {
            toggleLbZoom(ev.clientX, ev.clientY);
          } else if (g.target === lbStage && ev.target === lbStage) {
            closeLightbox();
          }
        } else if (lbScale <= 1.005 && lbItems.length > 1 && Math.abs(dx) > 52 && Math.abs(dx) > Math.abs(dy) * 1.6) {
          showLbSlide(lbIdx + (dx < 0 ? 1 : -1));
        }
      }
    };
    lbStage.addEventListener("pointerup", (ev) => endPtr(ev, false));
    lbStage.addEventListener("pointercancel", (ev) => endPtr(ev, true));
  }

  async function openSandboxedHtmlRemote(path, win) {
    try {
      const tries = fileTries();
      let htmlText = null;
      for (const m of tries) {
        const q = `/api/file?path=${encodeURIComponent(path)}${m ? "&machine=" + encodeURIComponent(m) : ""}&as=html`;
        const r = routeReq(q);
        const res = await authFetch(r.url, { headers: r.hub ? { Authorization: "Bearer " + r.hub.token } : {}, credentials: r.hub ? "omit" : "same-origin" }, !!r.hub);
        if (res.status === 401 && !r.hub) { showLogin(); throw new Error("unauthorized"); }
        if (res.status === 404) continue;
        if (!res.ok) { let d = {}; try { d = await res.json(); } catch {} throw new Error(d.error || "打不开这个文件"); }
        htmlText = await res.text();
        break;
      }
      if (htmlText === null) throw new Error("没找到这个 HTML 文件");
      const sb = "allow-scripts allow-forms allow-popups allow-modals allow-downloads";
      if (win && !win.closed) {
        const doc = win.document;
        doc.open();
        doc.write(`<!doctype html><meta charset="utf-8"><title>${esc(path.split("/").pop())}</title><style>html,body,iframe{margin:0;width:100%;height:100%;border:0;display:block}</style><iframe sandbox="${sb}"></iframe>`);
        doc.close();
        const frame = doc.querySelector("iframe");
        if (frame) frame.srcdoc = htmlText;
        return;
      }
      syncFileBar("fv", { langLabel: "HTML" });
      $("#fv-name").textContent = path.split("/").pop();
      $("#fv-path").textContent = path;
      const body = $("#fv-body");
      body.classList.remove("is-code");
      body.innerHTML = `<iframe class="fv-html-sandbox" sandbox="${sb}"></iframe>`;
      body.querySelector("iframe").srcdoc = htmlText;
      showFilePane();
    } catch (err) {
      if (win && !win.closed) try { win.close(); } catch {}
      toast(err.message, "attn");
    }
  }
  document.addEventListener("click", (e) => {
    const t = e.target.closest(".thumb[data-img]");
    if (t) {
      e.preventDefault();
      const { items, index } = collectGallery(t, { path: t.dataset.img, alt: t.dataset.imgAlt || "" });
      openLightbox(items, index);
      return;
    }
    const mb = e.target.closest(".md-img-btn[data-img-url]");
    if (mb) {
      e.preventDefault();
      const { items, index } = collectGallery(mb, { url: mb.dataset.imgUrl, alt: mb.dataset.imgAlt || "" });
      openLightbox(items, index);
      return;
    }
    const a = e.target.closest("a.fpath");
    if (a) {
      const path = a.dataset.path || "";
      if (HTML_EXT.test(path)) {
        const ctxMachine = (view === "file" ? rvCur?.machine : fileContextMachine()) || "";
        const hub = hubOf(ctxMachine);
        if (!hub && (!window.__collieDemo || window.__collieDemoHtmlUrl?.(path))) {
          a.href = htmlFileURL(path, ctxMachine);
          a.target = "_blank";
          a.rel = "noopener";
          return;
        }
        e.preventDefault();
        const win = window.open("", "_blank");
        if (win) { try { win.opener = null; } catch {} }
        openSandboxedHtmlRemote(path, win);
        return;
      }
      e.preventDefault();
      if (IMG_EXT.test(path)) {
        const { items, index } = collectGallery(a, { path });
        openLightbox(items, index);
        return;
      }
      if (view === "file") {
        location.hash = wideFileHash(path, rvCur?.machine || "");
        return;
      }
      openFile(path);
      return;
    }
    const wideImg = e.target.closest(".rv-img img[data-wide-img]");
    if (wideImg) {
      e.preventDefault();
      openLightbox([{ path: wideImg.dataset.wideImg, alt: wideImg.getAttribute("alt") || "" }], 0);
      return;
    }
    const rawImg = e.target.closest(".msg img, .td-text img, .mem-body img, .fv-md img, .rv-md img");
    if (rawImg && !rawImg.closest(".avatar, .td-av, a[href]")) {
      const u = rawImg.currentSrc || rawImg.getAttribute("src") || "";
      if (u) {
        e.preventDefault();
        const { items, index } = collectGallery(rawImg, { url: u, alt: rawImg.getAttribute("alt") || "" });
        openLightbox(items, index);
      }
    }
  });
  // Wide screens: a panel to the right of the conversation, which stays
  // usable; its width is dragged and remembered. Narrow ones: full screen.
  const pane = $("#file-view");
  const setFileW = (w) => document.documentElement.style.setProperty("--file-w", Math.round(w) + "px");
  // The widest the panel may be: the conversation keeps at least 420px.
  const fileMax = () => innerWidth - $(".side").offsetWidth - 420;
  let paneTimer;
  function showFilePane() {
    if (activeThreadRoot) closeThreadDrawer({ immediate: true, rerender: view === "collie" });
    clearTimeout(paneTimer);
    // Until it has been dragged: a little under half the window.
    setFileW(Math.max(Math.min(store.get("fileW", 0) || innerWidth * 0.45, fileMax()), 360));
    if (pane.hidden) { pane.hidden = false; pane.offsetWidth; }
    $("#app").classList.add("has-file");
  }
  function closeFilePane() {
    $("#app").classList.remove("has-file");
    fileSeq++;
    clearTimeout(paneTimer);
    paneTimer = setTimeout(() => {
      pane.hidden = true;
      if (fileUrl) URL.revokeObjectURL(fileUrl), fileUrl = "";
    }, 360);
  }
  pane.addEventListener("click", (e) => { if (e.target.closest("[data-fv-close]")) closeFilePane(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !pane.hidden && !document.querySelector("dialog[open]")) closeFilePane(); });
  $("#fv-grip").addEventListener("pointerdown", (e) => {
    e.preventDefault();
    const grip = e.currentTarget;
    grip.setPointerCapture(e.pointerId);
    document.body.classList.add("dragging");
    const max = fileMax();
    const move = (ev) => setFileW(Math.max(Math.min(innerWidth - ev.clientX, max), 360));
    const up = () => {
      grip.removeEventListener("pointermove", move);
      document.body.classList.remove("dragging");
      store.set("fileW", parseInt(getComputedStyle(document.documentElement).getPropertyValue("--file-w")) || 520);
    };
    grip.addEventListener("pointermove", move);
    grip.addEventListener("pointerup", up, { once: true });
  });

  // ───────────────────────────── natural reply-chain thread drawer
  const thPopWrap = $("#collie-threads-wrap");
  const thHeadBtn = $("#collie-threads-btn");
  const thHeadCnt = $("#collie-threads-cnt");
  const thPop = $("#collie-threads-pop");
  const thPopTabs = $("#collie-threads-tabs");
  const thPopCntAll = $("#collie-threads-cnt-all");
  const thPopCntActive = $("#collie-threads-cnt-active");
  const thPopSub = $("#collie-threads-sub");
  const thPopList = $("#collie-threads-list");
  let thPopFilter = "all"; // "all" | "active"
  let thPopSig = "";

  function openThreadFromAnywhere(rootId, focusId = "") {
    if (!rootId) return;
    if (view === "collie") {
      openThreadDrawer(rootId, focusId, focusId);
      return;
    }
    pendingOpenThread = { rootId, focusId };
    if (location.hash === "#/collie") route();
    else location.hash = "#/collie";
  }

  let _lastMarkedGen = -1, _lastMarkedRoot = null, _lastSideMarkedKey = "";
  function syncActiveThreadMarks(threadInfo, opts = {}) {
    const curRoot = activeThreadRoot || "";
    const box = $("#super-thread");
    if (box && (_lastMarkedGen !== superDomGen || _lastMarkedRoot !== curRoot)) {
      const hadPrevRoot = !!_lastMarkedRoot;
      _lastMarkedGen = superDomGen;
      _lastMarkedRoot = curRoot;
      if (hadPrevRoot) {
        for (const el of box.querySelectorAll(".in-active-thread")) {
          if (!curRoot || el.dataset.threadRoot !== curRoot) el.classList.remove("in-active-thread");
        }
        for (const btn of box.querySelectorAll(".thread-entry.active, .focus-btn.active")) {
          if (!curRoot || btn.dataset.openThread !== curRoot) {
            btn.classList.remove("active");
            btn.setAttribute("aria-expanded", "false");
          }
        }
      }
      if (curRoot) {
        const escRoot = CSS.escape(curRoot);
        for (const el of box.querySelectorAll(`.say[data-thread-root="${escRoot}"], .mine[data-thread-root="${escRoot}"]`)) {
          el.classList.add("in-active-thread");
        }
        for (const btn of box.querySelectorAll(`.thread-entry[data-open-thread="${escRoot}"], .focus-btn[data-open-thread="${escRoot}"]`)) {
          btn.classList.add("active");
          btn.setAttribute("aria-expanded", "true");
        }
      }
    }
    const sideKey = view === "collie" ? curRoot : "";
    if (_lastSideMarkedKey !== sideKey) {
      _lastSideMarkedKey = sideKey;
      for (const btn of document.querySelectorAll(".item-th-btn.active")) {
        if (!sideKey || btn.dataset.agentThread !== sideKey) {
          btn.classList.remove("active");
          btn.setAttribute("aria-expanded", "false");
        }
      }
      if (sideKey) {
        const escSide = CSS.escape(sideKey);
        for (const btn of document.querySelectorAll(`.item-th-btn[data-agent-thread="${escSide}"]`)) {
          btn.classList.add("active");
          btn.setAttribute("aria-expanded", "true");
        }
      }
    }
    if (thPopWrap && !opts.skipMenu) {
      const entries = chatEntries();
      renderCollieThreadsMenu(threadInfo || computeReplyThreads(entries), entries);
    }
  }
  function closeCollieThreadsPop() {
    if (!thPop || thPop.hidden) return;
    thPop.hidden = true;
    thPop.style.top = "";
    thHeadBtn?.setAttribute("aria-expanded", "false");
  }
  function setCollieThreadsFilter(nextFilter) {
    const f = nextFilter === "active" ? "active" : "all";
    if (thPopFilter === f) return;
    thPopFilter = f;
    const entries = chatEntries();
    renderCollieThreadsMenu(computeReplyThreads(entries), entries);
  }
  let _thMenuRowsCache = { key: "", allRows: [], activeRows: [] };
  let _thPopInputSig = "";
  function renderCollieThreadsMenu(threadInfo, allEntries) {
    if (!thPopWrap || !thHeadBtn || !thHeadCnt || !thPop || !thPopList) return;
    const entries = allEntries || chatEntries();
    const info = threadInfo || computeReplyThreads(entries);
    const pendList = activePending();
    const pendKey = `${sup.hasPending ? 1 : 0}:${pendList.map((p) => p.id).join(",")}:${dismissedLocal.size ? [...dismissedLocal].join(",") : ""}`;
    const rowsKey = `${entriesFingerprint(entries)}|${workerStateFingerprint()}|${pendKey}`;
    const fullInputSig = `${rowsKey}|${thPopFilter}|${activeThreadRoot || ""}|${dayBounds()}`;
    if (fullInputSig === _thPopInputSig) return;
    _thPopInputSig = fullInputSig;

    let allRows, activeRows;
    if (_thMenuRowsCache.key === rowsKey) {
      allRows = _thMenuRowsCache.allRows;
      activeRows = _thMenuRowsCache.activeRows;
    } else {
      const pendIds = new Set(pendList.map((p) => p.id));
      const idxByEntry = new Map();
      for (let i = 0; i < entries.length; i++) idxByEntry.set(entries[i], i);
      const wCtx = makeWorkerExtractCtx(entries);
      allRows = [];
      for (const th of (info?.allThreads || info?.threads)?.values() || []) {
        const workers = extractThreadWorkers(th, info, entries, wCtx);
        const activeWorkers = workers.filter(isWorkerActiveStatus);
        const pending = isThreadPending(th, entries, pendIds, idxByEntry);
        const inProgress = activeWorkers.length > 0 || pending;
        if (th.totalCount < 3 && !inProgress) continue;
        allRows.push({
          th,
          pending,
          activeWorkers,
          hasActiveWorker: activeWorkers.length > 0,
          hasBlockedWorker: activeWorkers.some((w) => w.status === "blocked"),
          inProgress,
        });
      }
      allRows.sort((a, b) => {
        const ta = +new Date(a.th.latest?.at || 0) || 0;
        const tb = +new Date(b.th.latest?.at || 0) || 0;
        if (tb !== ta) return tb - ta;
        return String(b.th.latest?.id || "").localeCompare(String(a.th.latest?.id || ""));
      });
      activeRows = allRows.filter((r) => r.inProgress);
      _thMenuRowsCache = { key: rowsKey, allRows, activeRows };
    }
    if (!allRows.length) {
      thPopWrap.hidden = true;
      closeCollieThreadsPop();
      thPopSig = "";
      return;
    }
    thPopWrap.hidden = false;
    setText(thHeadCnt, String(allRows.length));
    thHeadBtn.classList.toggle("has-active", !!activeThreadRoot);
    if (thPopCntAll) setText(thPopCntAll, String(allRows.length));
    if (thPopCntActive) setText(thPopCntActive, String(activeRows.length));
    if (thPopTabs) {
      for (const tab of thPopTabs.querySelectorAll("[data-th-filter]")) {
        const on = tab.dataset.thFilter === thPopFilter;
        tab.classList.toggle("on", on);
        tab.setAttribute("aria-pressed", on ? "true" : "false");
      }
    }
    const filtered = thPopFilter === "active" ? activeRows : allRows;
    const shown = filtered.slice(0, 30);
    if (thPopSub) {
      setText(thPopSub, filtered.length > shown.length
        ? `前 ${shown.length} / ${filtered.length} 条`
        : filtered.length > 0 ? "按最近活跃" : "");
    }
    const sig = JSON.stringify([
      thPopFilter,
      activeThreadRoot || "",
      allRows.length,
      activeRows.length,
      shown.map(({ th, pending, activeWorkers, hasBlockedWorker, inProgress }) => [
        th.rootId,
        th.replyCount,
        th.branchCount,
        th.latest?.id || "",
        th.latest?.at || "",
        th.title,
        th.preview || "",
        pending ? 1 : 0,
        activeWorkers.length,
        hasBlockedWorker ? 1 : 0,
        inProgress ? 1 : 0,
      ]),
    ]);
    if (sig === thPopSig) return;
    thPopSig = sig;
    if (!shown.length) {
      thPopList.innerHTML = `<div class="th-pop-empty" role="status">当前没有进行中的话题</div>`;
      return;
    }
    thPopList.innerHTML = shown.map(({ th, pending, activeWorkers, hasBlockedWorker, inProgress }) => {
      const isAct = activeThreadRoot === th.rootId;
      const lastAt = th.latest?.at ? sepTime(+new Date(th.latest.at)) : "";
      const metaParts = [th.replyCount > 0 ? `${th.replyCount} 条回复` : "1 条消息"];
      if (th.branchCount > 0) metaParts.push("含分支");
      if (activeWorkers.length > 0) {
        metaParts.push(hasBlockedWorker ? "Agent 等确认" : `${activeWorkers.length} 个在跑`);
      }
      const dotHtml = pending
        ? `<span class="th-pop-dot" aria-hidden="true"></span><span class="visually-hidden">待处理，</span>`
        : "";
      const previewHtml = th.preview
        ? `<div class="th-pop-preview" title="${esc(th.preview)}">${esc(th.preview)}</div>`
        : "";
      return `<button type="button" class="th-pop-item${isAct ? " active" : ""}${pending ? " is-pending" : ""}${inProgress ? " is-active" : ""}" role="listitem" data-th-pick="${esc(th.rootId)}" data-th-latest="${esc(entryKey(th.latest))}"${pending ? ' data-th-pending="1"' : ""}${inProgress ? ' data-th-active="1"' : ""}>
        ${dotHtml}
        <div class="th-pop-title" title="${esc(th.fullTitle || th.title)}">${esc(th.title)}</div>
        ${previewHtml}
        <div class="th-pop-meta"><span>${esc(metaParts.join(" · "))}</span><span>${esc(lastAt)}</span></div>
      </button>`;
    }).join("");
  }
  thPopTabs?.addEventListener("click", (e) => {
    const tab = e.target.closest("[data-th-filter]");
    if (!tab) return;
    e.stopPropagation();
    setCollieThreadsFilter(tab.dataset.thFilter);
  });
  thHeadBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    if (!thPop) return;
    const willOpen = thPop.hidden;
    $$(".menu").forEach((m) => { m.hidden = true; });
    if (willOpen) {
      const entries = chatEntries();
      renderCollieThreadsMenu(computeReplyThreads(entries), entries);
      if (narrow()) {
        const hr = $("#v-collie .d-head")?.getBoundingClientRect?.();
        thPop.style.top = hr && hr.bottom > 0 ? Math.round(hr.bottom + 6) + "px" : "";
      } else {
        thPop.style.top = "";
      }
      thPop.hidden = false;
      thHeadBtn.setAttribute("aria-expanded", "true");
    } else {
      closeCollieThreadsPop();
    }
  });
  thPopList?.addEventListener("click", (e) => {
    const item = e.target.closest("[data-th-pick]");
    if (!item) return;
    const rootId = item.dataset.thPick;
    const latestId = item.dataset.thLatest || "";
    closeCollieThreadsPop();
    if (rootId) openThreadDrawer(rootId, latestId, latestId);
  });
  document.addEventListener("click", (e) => {
    if (thPop && !thPop.hidden && !e.target.closest("#collie-threads-wrap")) closeCollieThreadsPop();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && thPop && !thPop.hidden) {
      closeCollieThreadsPop();
      thHeadBtn?.focus({ preventScroll: true });
    }
  });

  const tdDrawer = $("#thread-drawer");
  const tdScrim = $("#thread-scrim");
  const tdTitleEl = $("#td-title");
  const tdMetaEl = $("#td-meta");
  const tdWorkersEl = $("#td-workers");
  const tdBodyEl = $("#td-body");
  const tdListEl = $("#td-list");
  const tdComposer = $("#td-composer");
  const tdInput = $("#td-input");
  const tdSendBtn = $("#td-send");
  const tdTargetText = $("#td-target-text");
  const tdTargetReset = $("#td-target-reset");
  const tdHintEl = $("#td-hint");
  const tdLocateRootBtn = $("#td-locate-root");
  const tdWidenBtn = $("#td-widen");
  const tdCloseBtn = $("#td-close");
  const tdBackBtn = $("#td-back");
  const tdGripEl = $("#td-grip");
  const setThreadW = (w) => document.documentElement.style.setProperty("--thread-w", Math.round(w) + "px");
  const threadMax = () => Math.max(360, Math.min(560, innerWidth - ($(".side")?.offsetWidth || 0) - 420));
  const threadWideW = () => {
    const sideW = $(".side")?.offsetWidth || 260;
    const avail = Math.max(480, innerWidth - sideW);
    return Math.max(480, Math.min(920, Math.round(avail * 0.78), avail - 200));
  };
  let threadWide = !!store.get("threadWide", false);
  function syncThreadWideUI() {
    const activeWide = !!(activeThreadRoot && threadWide && innerWidth > 1000);
    $("#app")?.classList.toggle("thread-wide", activeWide);
    if (tdWidenBtn) {
      tdWidenBtn.setAttribute("aria-pressed", activeWide ? "true" : "false");
      const lbl = activeWide ? "还原宽度" : "拓宽抽屉";
      tdWidenBtn.title = lbl;
      tdWidenBtn.setAttribute("aria-label", lbl);
    }
  }
  function applyThreadWidth() {
    if (innerWidth <= 1000) {
      syncThreadWideUI();
      return;
    }
    const defW = innerWidth <= 1120 ? 420 : 432;
    const w = threadWide
      ? threadWideW()
      : Math.max(360, Math.min(store.get("threadW", 0) || defW, threadMax()));
    setThreadW(w);
    syncThreadWideUI();
  }
  function setThreadWide(next, opts = {}) {
    const wide = !!next;
    if (threadWide === wide && !opts.force) {
      syncThreadWideUI();
      return;
    }
    const sc = activeThreadRoot && view === "collie" ? viewScroller("collie") : null;
    const lockSnap = sc ? (collieLayoutLock?.snap || captureColliePos(sc)) : null;
    threadWide = wide;
    store.set("threadWide", wide);
    applyThreadWidth();
    if (lockSnap && innerWidth > 1000 && opts.animate !== false) {
      beginCollieLayoutLock(lockSnap, { trackTransition: true });
    }
  }
  let tdHideTimer = 0, tdFocusTimer = 0, tdLoadingRoot = false, tdWorkersSig = "";
  let tdComposerCtrl = null, tdAutoStickUntil = 0, tdDraftRoot = null;

  const escRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const THREAD_IGNORED_WORKERS = new Set(["", ROUTER, "you", "你", "Collie", "collie", "定时", "system", "router"]);
  function threadWorkerRank(status, ended) {
    if (ended || status === "gone" || status === "failed") return 4;
    if (status === "blocked") return 0;
    if (status === "working" || status === "starting") return 1;
    if (status === "waiting") return 2;
    return 3;
  }
  const _cleanTextCache = new Map();
  function cleanTextForWorkerMatch(raw, role) {
    let t = String(raw || "");
    if (!t) return "";
    const ck = `${role || ""}\0${t}`;
    const hit = _cleanTextCache.get(ck);
    if (hit !== undefined) return hit;
    if (role === "user") {
      const cut = t.indexOf("\n\n[The human picked");
      if (cut >= 0) t = t.slice(0, cut);
      const att = t.lastIndexOf("附件：\n");
      if (att >= 0) t = t.slice(0, att);
    }
    const out = t
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/\]\([^)\n]+\)/g, "]")
      .replace(/https?:\/\/\S+/gi, " ");
    if (_cleanTextCache.size > 4000) _cleanTextCache.clear();
    _cleanTextCache.set(ck, out);
    return out;
  }
  let _workerExtractCtxCache = { key: "", ctx: null };
  let _workerThreadMapCache = { key: "", val: null };
  function makeWorkerExtractCtx(allEntries) {
    const entries = allEntries || chatEntries();
    const key = `${entriesFingerprint(entries)}|${workerStateFingerprint()}`;
    if (_workerExtractCtxCache.ctx && _workerExtractCtxCache.key === key) {
      return _workerExtractCtxCache.ctx;
    }
    // Deduplicate sup.workers by name: prefer active (!ended), then newest created_at.
    const workerByName = new Map();
    const workersByThread = new Map();
    for (const w of sup.workers || []) {
      const name = typeof w?.name === "string" ? w.name.trim() : "";
      if (!name || name === ROUTER) continue;
      const prev = workerByName.get(name);
      if (!prev) {
        workerByName.set(name, w);
      } else {
        const prevEnded = !!prev.ended, curEnded = !!w.ended;
        if ((prevEnded && !curEnded) || (prevEnded === curEnded && (+new Date(w.created_at) || 0) >= (+new Date(prev.created_at) || 0))) {
          workerByName.set(name, w);
        }
      }
    }
    for (const [name, w] of workerByName.entries()) {
      if (w.thread) {
        let list = workersByThread.get(w.thread);
        if (!list) { list = []; workersByThread.set(w.thread, list); }
        list.push([name, w]);
      }
    }
    const liveAgentByName = new Map();
    for (const a of state.agents || []) {
      if (a?.name && a.name !== ROUTER && !liveAgentByName.has(a.name)) liveAgentByName.set(a.name, a);
    }
    const histIdx = getHistIndex();
    const histNames = new Set(histIdx.byName.keys());
    const latestEventAtByName = new Map();
    const eventsByReEntry = new Map();
    const eventsByThread = new Map();
    for (const ev of entries) {
      if (!ev || ev.role !== "event") continue;
      if (ev.ref && ev.ref !== ROUTER && !ev.ref.startsWith("h:")) {
        const t = +new Date(ev.at) || 0;
        if (t > (latestEventAtByName.get(ev.ref) || 0)) latestEventAtByName.set(ev.ref, t);
      }
      if (ev.re?.entry) {
        let list = eventsByReEntry.get(ev.re.entry);
        if (!list) { list = []; eventsByReEntry.set(ev.re.entry, list); }
        list.push(ev);
      }
      if (ev.thread) {
        let list = eventsByThread.get(ev.thread);
        if (!list) { list = []; eventsByThread.set(ev.thread, list); }
        list.push(ev);
      }
    }
    const workerNames = [...workerByName.keys()];
    const workerNamesKey = workerNames.join("\0");
    const ctx = {
      entries, workerByName, workersByThread, liveAgentByName, histNames, histByName: histIdx.byName,
      latestEventAtByName, eventsByReEntry, eventsByThread, workerNames, workerNamesKey,
      threadWorkersWeak: new WeakMap(),
    };
    _workerExtractCtxCache = { key, ctx };
    return ctx;
  }
  function extractThreadWorkers(th, info, allEntries, ctx = null) {
    if (!th) return [];
    const c = ctx || makeWorkerExtractCtx(allEntries);
    const cachedList = c.threadWorkersWeak.get(th);
    if (cachedList) return cachedList;
    const {
      entries, workerByName, workersByThread, liveAgentByName, histNames, histByName,
      latestEventAtByName, eventsByReEntry, eventsByThread, workerNames, workerNamesKey,
    } = c;
    const byId = info?.byId || new Map(entries.map((e) => [entryKey(e), e]).filter(([k]) => !!k));

    const found = new Map(); // name -> { lastMentionAt, structured }
    const record = (rawName, atMs, viaStructured) => {
      const name = typeof rawName === "string" ? rawName.trim() : "";
      if (!name || THREAD_IGNORED_WORKERS.has(name) || name.startsWith("h:")) return;
      if (viaStructured) {
        const known = workerByName.has(name) || liveAgentByName.has(name) || histNames.has(name);
        if (!known) return;
      }
      const prev = found.get(name);
      const at = atMs || 0;
      if (!prev) found.set(name, { lastMentionAt: at, structured: !!viaStructured });
      else {
        if (at > prev.lastMentionAt) prev.lastMentionAt = at;
        if (viaStructured) prev.structured = true;
      }
    };
    const recordAction = (act, at) => {
      if (!act || typeof act !== "object") return;
      if (Array.isArray(act)) { for (const x of act) recordAction(x, at); return; }
      record(act.worker, at, true);
      record(act.ref, at, true);
      record(act.target, at, true);
      if (act.name && (!act.type || /spawn|worker|send|agent|report/i.test(String(act.type)))) {
        record(act.name, at, true);
      }
    };

    const nodeIds = new Set();
    if (th.rootId) nodeIds.add(th.rootId);
    const textParts = [];
    for (let i = 0; i < (th.list || []).length; i++) {
      const m = th.list[i];
      if (!m) continue;
      const k = entryKey(m);
      if (k) nodeIds.add(k);
      const at = +new Date(m.at) || 0;
      record(m.worker, at, true);
      record(m.from, at, true);
      record(m.ref, at, true);
      record(m.re?.worker, at, true);
      recordAction(m.action, at);
      recordAction(m.actions, at);
      if (m.re?.entry) {
        const target = byId.get(m.re.entry);
        if (target && target.role === "event") {
          const tat = +new Date(target.at) || at;
          record(target.ref, tat, true);
          record(target.worker, tat, true);
          record(target.from, tat, true);
        }
      }
      const cleaned = cleanTextForWorkerMatch(m.text, m.role);
      if (cleaned) textParts.push({ text: cleaned, at });
      if (i === 0 && !th.missingRoot && m.re?.text) {
        const rq = cleanTextForWorkerMatch(m.re.text, "");
        if (rq) textParts.push({ text: rq, at });
      }
    }
    if (th.missingRoot?.text) {
      const mq = cleanTextForWorkerMatch(th.missingRoot.text, "");
      if (mq) textParts.push({ text: mq, at: 0 });
    }
    const recordEv = (ev) => {
      const at = +new Date(ev.at) || 0;
      record(ev.ref, at, true);
      record(ev.worker, at, true);
      record(ev.from, at, true);
    };
    for (const nid of nodeIds) {
      const evs = eventsByReEntry.get(nid);
      if (evs) for (let i = 0; i < evs.length; i++) recordEv(evs[i]);
    }
    if (th.rootId) {
      const tevs = eventsByThread.get(th.rootId);
      if (tevs) for (let i = 0; i < tevs.length; i++) recordEv(tevs[i]);
      const tws = workersByThread.get(th.rootId);
      if (tws) {
        for (let i = 0; i < tws.length; i++) {
          const [name, w] = tws[i];
          record(name, +new Date(w.report_at || w.created_at) || 0, true);
        }
      }
    }
    if (textParts.length && workerNames.length) {
      for (let pi = 0; pi < textParts.length; pi++) {
        const part = textParts[pi];
        const hits = matchWorkerNamesInText(part.text, workerNames, workerNamesKey);
        for (let hi = 0; hi < hits.length; hi++) record(hits[hi], part.at, false);
      }
    }

    const out = [];
    for (const [name, meta] of found.entries()) {
      const w = workerByName.get(name) || null;
      const live = liveAgentByName.get(name) || null;
      const ended = w ? !!w.ended : !live;
      const status = ended
        ? (w?.status === "failed" ? "failed" : "gone")
        : (live?.status || w?.status || "unknown");
      const pane = !ended ? (live?.pane_id || w?.pane_id || "") : "";
      const past = !pane ? (workerHist(name, w?.created_at || 0) || histByName.get(name)?.[0]?.h || null) : null;
      const href = pane ? `#/p/${encodeURIComponent(pane)}` : past ? `#/h/${encodeURIComponent(past.id)}` : "";
      const kind = live?.kind || w?.kind || past?.kind || "";
      const lastActive = Math.max(
        meta.lastMentionAt || 0,
        +new Date(w?.report_at || 0) || 0,
        +new Date(w?.created_at || 0) || 0,
        latestEventAtByName.get(name) || 0,
        +new Date(past?.ended || 0) || 0,
      );
      out.push({
        name,
        status,
        ended,
        kind,
        pane,
        href,
        isHist: !pane && !!past,
        rank: threadWorkerRank(status, ended),
        lastActive,
        lastMentionAt: meta.lastMentionAt || 0,
        structured: !!meta.structured,
      });
    }
    out.sort((a, b) => {
      if (a.rank !== b.rank) return a.rank - b.rank;
      if (b.lastActive !== a.lastActive) return b.lastActive - a.lastActive;
      return a.name.localeCompare(b.name);
    });
    c.threadWorkersWeak.set(th, out);
    return out;
  }
  function computeWorkerThreadMap(threadInfo = null, allEntries = null) {
    const entries = allEntries || chatEntries();
    if (!entries.length) return new Map();
    const cacheKey = `${entriesFingerprint(entries)}|${workerStateFingerprint()}`;
    if (!threadInfo && _workerThreadMapCache.val && _workerThreadMapCache.key === cacheKey) {
      return _workerThreadMapCache.val;
    }
    const out = new Map();
    const info = threadInfo || computeReplyThreads(entries);
    const wCtx = makeWorkerExtractCtx(entries);
    if (!wCtx.workerByName.size && !wCtx.liveAgentByName.size) {
      if (!threadInfo) _workerThreadMapCache = { key: cacheKey, val: out };
      return out;
    }
    for (const th of (info.allThreads || info.threads).values()) {
      const workers = extractThreadWorkers(th, info, entries, wCtx);
      if (!workers.length) continue;
      const latestAt = +new Date(th.latest?.at || 0) || 0;
      const focusId = entryKey(th.latest) || th.rootId;
      for (const w of workers) {
        const cand = {
          rootId: th.rootId,
          focusId,
          title: th.title,
          list: th.list,
          lastMentionAt: w.lastMentionAt || latestAt,
          structured: !!w.structured,
          totalCount: th.totalCount,
          latestAt,
        };
        const prev = out.get(w.name);
        if (!prev) {
          out.set(w.name, cand);
          continue;
        }
        const better =
          cand.lastMentionAt !== prev.lastMentionAt ? cand.lastMentionAt > prev.lastMentionAt
          : cand.structured !== prev.structured ? cand.structured
          : (cand.totalCount >= 3) !== (prev.totalCount >= 3) ? cand.totalCount >= 3
          : cand.latestAt > prev.latestAt;
        if (better) out.set(w.name, cand);
      }
    }
    if (!threadInfo) _workerThreadMapCache = { key: cacheKey, val: out };
    return out;
  }
  function renderThreadWorkers(th, info, allEntries, force = false) {
    if (!tdWorkersEl) return;
    const list = extractThreadWorkers(th, info, allEntries);
    if (!list.length) {
      if (!tdWorkersEl.hidden || tdWorkersSig !== "") {
        tdWorkersEl.hidden = true;
        tdWorkersEl.innerHTML = "";
        tdWorkersSig = "";
      }
      return;
    }
    const sig = JSON.stringify(list.map((w) => [w.name, w.status, w.ended ? 1 : 0, w.href, w.kind]));
    if (!force && sig === tdWorkersSig && !tdWorkersEl.hidden) return;
    tdWorkersSig = sig;
    tdWorkersEl.hidden = false;
    tdWorkersEl.innerHTML = list.map((w) => {
      const stLabel = STATUS_LABEL[w.status] || (w.ended ? "已停止" : w.status);
      const kindLabel = KIND_LABEL[w.kind] || w.kind || "";
      const tip = [w.name, kindLabel, stLabel].filter(Boolean).join(" · ");
      const cls = `td-worker${w.ended ? " is-ended" : ""}${w.href ? "" : " is-static"}`;
      const inner = `<span class="dot ${esc(w.status)}" aria-hidden="true"></span><span class="td-worker-name">${esc(w.name)}</span>`;
      if (w.href) {
        const act = w.isHist ? "查看记录" : "打开终端";
        return `<a class="${cls}" href="${esc(w.href)}" data-td-worker="${esc(w.name)}" data-td-status="${esc(w.status)}" title="${esc(tip)}" aria-label="${esc(`${w.name}，${stLabel}，${act}`)}">${inner}</a>`;
      }
      return `<span class="${cls}" data-td-worker="${esc(w.name)}" data-td-status="${esc(w.status)}" title="${esc(tip)}">${inner}</span>`;
    }).join("");
    tdWorkersEl._syncScrollFade?.();
  }

  function syncThreadComposerHint() {
    if (!tdHintEl) return;
    const isMac = /Mac|iPhone|iPad/.test(navigator.platform || "");
    const keyLabel = prefs.sendKey() === "mod" ? (isMac ? "⌘Enter" : "Ctrl+Enter") : "Enter";
    tdHintEl.textContent = `${keyLabel} 发送 · 同步写入主聊天流`;
    if (tdSendBtn) tdSendBtn.title = `发送回复 (${keyLabel})`;
  }
  function syncThreadSendBtn(sending = tdComposerCtrl?.isSending?.() || false) {
    if (!tdSendBtn || !tdInput) return;
    const hasText = !!String(tdInput.value || "").trim();
    const hasFiles = !!(tdComposer?._files?.length);
    tdSendBtn.disabled = !!sending || (!hasText && !hasFiles);
  }
  function growThreadInput() {
    if (!tdInput) return;
    if (window.CSS?.supports?.("field-sizing", "content")) return;
    tdInput.style.height = "auto";
    tdInput.style.height = Math.min(tdInput.scrollHeight, 160) + "px";
  }
  function updateThreadTargetBanner(th, byId) {
    if (!tdTargetText || !tdTargetReset) return;
    const latest = th.latest;
    const explicit = drawerReplyTarget && drawerReplyTarget !== entryKey(latest) && byId.has(drawerReplyTarget)
      ? byId.get(drawerReplyTarget)
      : null;
    if (explicit) {
      const at = +new Date(explicit.at) || 0;
      tdTargetText.innerHTML = `分叉回复 <b>${esc(at ? sepTime(at) + " " : "")}${esc(threadWhoLabel(explicit))}</b> · ${esc(threadSnippet(threadCleanText(explicit), 18))}`;
      tdTargetReset.hidden = false;
    } else {
      drawerReplyTarget = null;
      const at = +new Date(latest.at) || 0;
      const prefix = th.totalCount <= 1 ? "自动引用此消息" : "自动接续最新";
      tdTargetText.innerHTML = `${prefix} · <b>${esc(at ? sepTime(at) + " " : "")}${esc(threadWhoLabel(latest))}</b>`;
      tdTargetReset.hidden = true;
    }
  }
  function focusNodeInDrawer(msgId) {
    if (!tdListEl || !msgId) return;
    const node = tdListEl.querySelector(`.td-node[data-td-id="${CSS.escape(msgId)}"]`);
    if (!node) return;
    const smooth = !matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (tdBodyEl) {
      const br = tdBodyEl.getBoundingClientRect();
      const nr = node.getBoundingClientRect();
      const maxTop = Math.max(0, tdBodyEl.scrollHeight - tdBodyEl.clientHeight);
      const want = Math.max(0, Math.min(
        maxTop,
        tdBodyEl.scrollTop + (nr.top - br.top) - Math.max(16, (tdBodyEl.clientHeight - nr.height) / 2),
      ));
      if (typeof tdBodyEl.scrollTo === "function") tdBodyEl.scrollTo({ top: want, behavior: smooth ? "smooth" : "auto" });
      else tdBodyEl.scrollTop = want;
    }
    clearTimeout(tdFocusTimer);
    tdListEl.querySelectorAll(".td-node.is-focused").forEach((n) => n.classList.remove("is-focused"));
    void node.offsetWidth;
    node.classList.add("is-focused");
    tdFocusTimer = setTimeout(() => node.classList.remove("is-focused"), 1450);
  }
  async function ensureThreadRootLoaded(rootId, manual = false) {
    if (!rootId || tdLoadingRoot || !canLoadOlder()) return;
    if (!manual && tdRootFetchTried.has(rootId)) return;
    tdRootFetchTried.add(rootId);
    tdLoadingRoot = true;
    syncThreadDrawer();
    try {
      let guards = 0;
      while (activeThreadRoot && canLoadOlder() && guards++ < 10) {
        const info = computeReplyThreads(chatEntries());
        const th = resolveThread(info, activeThreadRoot, activeThreadAnchor);
        if (!th || !th.missingRoot) break;
        const targetId = th.missingRoot.id;
        while (olderBusy) await new Promise((r) => setTimeout(r, 35));
        const ok = await loadOlder(true, targetId);
        if (!ok) break;
      }
    } finally {
      tdLoadingRoot = false;
      if (activeThreadRoot) syncThreadDrawer();
    }
  }
  function promoteThreadDrawerNodeInPlace(el, item) {
    if (!el || !item.canPromoteInPlace) return false;
    el.dataset.tdId = item.key;
    el.dataset.entryId = item.entryId || "";
    const top = el.querySelector?.(".td-node-top");
    if (!top) return false;
    if (item.at) {
      const when = top.querySelector?.(".td-when");
      const wt = sepTime(item.at), ft = fullTime(item.at);
      if (when) {
        if (when.textContent !== wt) when.textContent = wt;
        if (when.getAttribute?.("title") !== ft) when.setAttribute?.("title", ft);
      } else {
        const wEl = parseSuperNode(`<span class="td-when" title="${esc(ft)}">${esc(wt)}</span>`);
        const whoEl = top.querySelector?.(".td-who");
        if (wEl && whoEl && whoEl.parentNode === top) top.insertBefore(wEl, whoEl.nextSibling);
      }
    }
    const oldActs = top.querySelector?.(".td-node-acts");
    const actsHtml = item.renderActs ? item.renderActs() : "";
    if (actsHtml) {
      const newActs = parseSuperNode(actsHtml);
      if (newActs) {
        if (oldActs && oldActs.parentNode === top) top.replaceChild(newActs, oldActs);
        else top.appendChild(newActs);
      }
    } else if (oldActs && oldActs.parentNode === top) {
      top.removeChild(oldActs);
    }
    el._tdKey = item.key;
    el._tdSig = item.sig;
    return true;
  }
  function patchThreadDrawerList(box, rootId, items) {
    const t0 = performance.now();
    const stats = box._tdPatchStats || (box._tdPatchStats = {
      renders: 0, fullRebuilds: 0, lastAdded: 0, lastUpdated: 0, lastRemoved: 0, lastReused: 0, lastMs: 0,
    });
    stats.renders++;
    let nodeMap = box._tdNodes;
    const switchedRoot = !!(box._tdRoot && box._tdRoot !== rootId);
    const isInitial = switchedRoot || !nodeMap || !nodeMap.size || !box.firstElementChild || items.length === 0;
    box._tdRoot = rootId || "";
    if (isInitial) {
      nodeMap = new Map();
      box._tdNodes = nodeMap;
      if (!items.length) {
        while (box.firstChild) box.removeChild(box.firstChild);
        stats.fullRebuilds++;
        stats.lastAdded = stats.lastUpdated = stats.lastRemoved = stats.lastReused = 0;
        stats.lastMs = performance.now() - t0;
        return { mutated: true, added: 0, updated: 0, removed: 0, reused: 0, fullRebuild: true };
      }
      const frag = document.createDocumentFragment();
      if (items.length > 16) {
        _superPatchTpl.innerHTML = items.map((it) => it.render()).join("");
        const parsed = [..._superPatchTpl.content.children];
        if (parsed.length === items.length) {
          for (let i = 0; i < items.length; i++) {
            const el = parsed[i], it = items[i];
            el._tdKey = it.key;
            el._tdSig = it.sig;
            if (it.msgSig !== undefined) el._tdMsgSig = it.msgSig;
            nodeMap.set(it.key, el);
            frag.appendChild(el);
          }
        } else {
          _superPatchTpl.innerHTML = "";
          for (let i = 0; i < items.length; i++) {
            const it = items[i], el = parseSuperNode(it.render());
            if (!el) continue;
            el._tdKey = it.key;
            el._tdSig = it.sig;
            if (it.msgSig !== undefined) el._tdMsgSig = it.msgSig;
            nodeMap.set(it.key, el);
            frag.appendChild(el);
          }
        }
      } else {
        for (let i = 0; i < items.length; i++) {
          const it = items[i], el = parseSuperNode(it.render());
          if (!el) continue;
          el._tdKey = it.key;
          el._tdSig = it.sig;
          if (it.msgSig !== undefined) el._tdMsgSig = it.msgSig;
          nodeMap.set(it.key, el);
          frag.appendChild(el);
        }
      }
      while (box.firstChild) box.removeChild(box.firstChild);
      box.appendChild(frag);
      stats.fullRebuilds++;
      stats.lastAdded = items.length;
      stats.lastUpdated = stats.lastRemoved = stats.lastReused = 0;
      stats.lastMs = performance.now() - t0;
      return { mutated: true, added: items.length, updated: 0, removed: 0, reused: 0, fullRebuild: true };
    }

    let added = 0, updated = 0, removed = 0, reused = 0, moved = 0;
    const nextKeys = new Set();
    for (let i = 0; i < items.length; i++) {
      const k = items[i].key;
      nextKeys.add(k);
      if (!nodeMap.has(k) && promotedPendingKeys.has(k)) {
        const alias = promotedPendingKeys.get(k);
        if (alias && nodeMap.has(alias)) {
          const existing = nodeMap.get(alias);
          nodeMap.delete(alias);
          existing._tdKey = k;
          nodeMap.set(k, existing);
        }
      }
    }
    for (const [k, el] of nodeMap) {
      if (!nextKeys.has(k)) {
        if (el.parentNode === box) box.removeChild(el);
        nodeMap.delete(k);
        removed++;
      }
    }

    let cursor = box.firstElementChild;
    let pendingFrag = null;
    const flushFrag = () => {
      if (!pendingFrag) return;
      if (cursor) box.insertBefore(pendingFrag, cursor);
      else box.appendChild(pendingFrag);
      pendingFrag = null;
    };

    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      let el = nodeMap.get(it.key);
      if (!el) {
        el = parseSuperNode(it.render());
        if (!el) continue;
        el._tdKey = it.key;
        el._tdSig = it.sig;
        if (it.msgSig !== undefined) el._tdMsgSig = it.msgSig;
        nodeMap.set(it.key, el);
        if (!pendingFrag) pendingFrag = document.createDocumentFragment();
        pendingFrag.appendChild(el);
        added++;
        continue;
      }
      flushFrag();
      if (el._tdSig !== it.sig) {
        if (it.canPromoteInPlace && el._tdMsgSig && el._tdMsgSig === it.msgSig && promoteThreadDrawerNodeInPlace(el, it)) {
          updated++;
          reused++;
        } else {
          const fresh = parseSuperNode(it.render());
          if (fresh) {
            fresh._tdKey = it.key;
            fresh._tdSig = it.sig;
            if (it.msgSig !== undefined) fresh._tdMsgSig = it.msgSig;
            const wasCursor = el === cursor;
            if (el.parentNode === box) box.replaceChild(fresh, el);
            el = fresh;
            nodeMap.set(it.key, el);
            if (wasCursor) cursor = el;
            updated++;
          }
        }
      } else {
        reused++;
      }
      if (el === cursor) {
        cursor = el.nextElementSibling;
      } else {
        if (cursor) box.insertBefore(el, cursor);
        else box.appendChild(el);
        moved++;
      }
    }
    flushFrag();
    while (cursor) {
      const next = cursor.nextElementSibling;
      box.removeChild(cursor);
      cursor = next;
      removed++;
    }
    stats.lastAdded = added;
    stats.lastUpdated = updated;
    stats.lastRemoved = removed;
    stats.lastReused = reused;
    stats.lastMs = performance.now() - t0;
    return { mutated: added + updated + removed + moved > 0, added, updated, removed, reused, fullRebuild: false };
  }

  function renderThreadDrawer(opts = {}) {
    if (!tdDrawer || !tdListEl) return;
    const allEntries = chatEntries();
    const info = computeReplyThreads(allEntries);
    const th = resolveThread(info, activeThreadRoot, activeThreadAnchor);
    if (th && th.rootId !== activeThreadRoot) activeThreadRoot = th.rootId;
    if (!th) {
      closeThreadDrawer({ rerender: false });
      return;
    }
    const prevCount = tdLastCount;
    const wasAtBottom = tdBodyEl ? (tdBodyEl.scrollHeight - tdBodyEl.scrollTop - tdBodyEl.clientHeight <= AT_BOTTOM_PX + 20) : true;
    const scrollBottom = !!opts.scrollBottom || tdForceScroll || (prevCount > 0 && th.list.length > prevCount && wasAtBottom);
    tdForceScroll = false;

    if (tdTitleEl) {
      tdTitleEl.textContent = th.title;
      tdTitleEl.title = th.fullTitle || th.title;
    }
    if (tdMetaEl) {
      const parts = th.missingRoot
        ? [`已加载 ${th.list.length} 条`, "含更早起点"]
        : [`共 ${th.totalCount} 条消息`];
      if (th.branchCount > 0) parts.push(`含 ${th.branchCount} 处分支`);
      tdMetaEl.textContent = parts.join(" · ");
    }
    if (tdLocateRootBtn) {
      tdLocateRootBtn.hidden = !th.root?.id && !th.list[0]?.id;
    }
    renderThreadWorkers(th, info, allEntries, !!opts.force);

    const pendIds = new Set(activePending().map((p) => p.id));
    const idxByKey = new Map();
    for (let i = 0; i < allEntries.length; i++) {
      const ek = entryKey(allEntries[i]);
      if (ek) idxByKey.set(ek, i);
    }
    const curDayStamp = dayBounds();
    const sig = JSON.stringify([
      th.rootId,
      curDayStamp,
      thumbRenderVer,
      th.missingRoot?.id || "",
      tdLoadingRoot ? 1 : 0,
      canLoadOlder() ? 1 : 0,
      th.list.map((m) => {
        const k = entryKey(m);
        const idx = idxByKey.get(k) ?? -1;
        const hasOpts = Array.isArray(m.options) && m.options.some((o) => typeof o === "string" && o.trim());
        const hasPendingOpts = m.role === "collie" && !!m.id && (hasOpts || !!m.check) && idx >= 0 && entryPendingNow(allEntries, idx, m.id, pendIds, hasOpts);
        const picked = m.id ? pickedReplyOpts.get(m.id) : null;
        return [k, m.id || "", m.role, m.text, m.re?.entry || "", m.at || "", hasPendingOpts ? 1 : 0, picked ? `${picked.sending ? 1 : 0}:${picked.text}` : ""];
      }),
    ]);
    if (sig !== tdLastSig || opts.force) {
      tdLastSig = sig;
      tdLastCount = th.list.length;
      const items = [];
      if (th.missingRoot) {
        const statusText = tdLoadingRoot
          ? "正在拉取更早的话题起点…"
          : canLoadOlder()
            ? "起点消息在更早的历史记录中"
            : "起点消息已超出当前历史窗口";
        const canLoad = !tdLoadingRoot && canLoadOlder();
        const mrId = th.missingRoot.id || "";
        const mrWho = th.missingRoot.who || "";
        const mrText = th.missingRoot.text || "";
        items.push({
          key: "__td_older__",
          sig: `${mrId}|${mrWho}|${mrText}|${tdLoadingRoot ? 1 : 0}|${canLoad ? 1 : 0}`,
          render: () => {
            const loadBtn = canLoad
              ? `<button type="button" class="btn small td-older-btn" data-td-load-older>加载更早起点</button>`
              : "";
            const qPreview = mrText
              ? `<div class="td-older-quote"><b>${esc(mrWho || "历史消息")}</b>${esc(plainLine(mrText))}</div>`
              : "";
            return `<div class="td-older"><div class="td-older-top"><span>${esc(statusText)}</span></div>${qPreview}${loadBtn}</div>`;
          },
        });
      }
      for (let i = 0; i < th.list.length; i++) {
        const m = th.list[i];
        const k = entryKey(m);
        const isRoot = !th.missingRoot && i === 0;
        const prevInThread = i > 0 ? th.list[i - 1] : null;
        const pid = info.parentOf(m);
        const isBranch = !isRoot && !!pid && !!prevInThread && pid !== entryKey(prevInThread);
        const parent = pid ? info.byId.get(pid) : null;
        const at = +new Date(m.at) || 0;
        const who = threadWhoLabel(m);
        const isWorkerReport = !!info.workerReportOf?.has(k);
        const hasRootQuote = !!(isRoot || isWorkerReport) && !!(m.re && m.re.text);
        const entryIdx = idxByKey.get(k) ?? -1;
        const hasOpts = Array.isArray(m.options) && m.options.some((o) => typeof o === "string" && o.trim());
        const hasPendingOpts = m.role === "collie" && !!m.id && (hasOpts || !!m.check) && entryIdx >= 0 && entryPendingNow(allEntries, entryIdx, m.id, pendIds, hasOpts);
        const picked = m.id ? pickedReplyOpts.get(m.id) : null;
        const pickedSig = picked ? `${picked.sending ? 1 : 0}:${picked.text}` : "";
        const branchSig = isBranch && parent ? `${entryKey(parent)}|${parent.at || ""}|${threadWhoLabel(parent)}|${parent.text || ""}` : "";
        const rootQuoteSig = hasRootQuote ? `${m.re.who || ""}|${m.re.text}` : "";
        const hasMedia = !!(m.text && (m.text.includes("[file:") || m.text.includes("/api/uploads/") || m.text.includes("![")));
        const msgSig = [
          m.role, who, m.text || "", isRoot ? 1 : 0, isBranch ? 1 : 0,
          branchSig, rootQuoteSig, hasMedia ? thumbRenderVer : 0,
        ].join("\x1f");
        const itemSig = [
          k, m.id || "", at ? sepTime(at) : "", msgSig,
          hasPendingOpts ? 1 : 0, pickedSig,
        ].join("\x1f");
        const renderActs = () => m.id
          ? `<div class="td-node-acts">
              <button type="button" class="td-act" data-td-reply="${esc(m.id)}" title="回复这条（新建分支）" aria-label="回复这条">${ICON_TD_REPLY}<span>回复</span></button>
              <button type="button" class="td-act" data-td-locate="${esc(m.id)}" title="在主聊天流中定位" aria-label="在主聊天流中定位">${ICON_TD_LOCATE}<span>定位</span></button>
            </div>`
          : "";
        items.push({
          key: k,
          sig: itemSig,
          msgSig,
          entryId: m.id || "",
          at,
          canPromoteInPlace: m.role === "user",
          renderActs,
          render: () => {
            const avHtml = m.role === "user"
              ? `<span class="td-av user" aria-hidden="true">${ICON_TD_USER}</span>`
              : `<span class="td-av collie" aria-hidden="true"><img src="icon.svg" alt=""></span>`;
            const tagHtml = isRoot
              ? `<span class="td-tag">起点</span>`
              : isBranch
                ? `<span class="td-tag">分支</span>`
                : "";
            const branchRefHtml = isBranch && parent
              ? `<button type="button" class="td-branch-ref" data-jump-drawer="${esc(entryKey(parent))}" title="跳到分支来源消息">` +
                `<span>↳ 回复 ${esc(+new Date(parent.at) ? sepTime(+new Date(parent.at)) + " " : "")}${esc(threadWhoLabel(parent))}「${esc(threadSnippet(threadCleanText(parent), 24))}」</span></button>`
              : "";
            const rootQuoteHtml = hasRootQuote
              ? `<div class="re" title="${esc(m.re.text)}"><span class="re-who">${esc(m.re.who || "")}</span>${esc(plainLine(m.re.text))}</div>`
              : "";
            const optsHtml = entryIdx >= 0 ? replyOptsMarkup(m, entryIdx, allEntries, pendIds, { inDrawer: true }) : "";
            const bodyHtml = m.role === "user"
              ? `<div class="td-text td-user-text">${rootQuoteHtml}${userText(m.text)}</div>`
              : `<div class="td-text msg assistant">${rootQuoteHtml}${md(m.text)}${imagesIn(m.text)}${optsHtml}</div>`;
            return `<article class="td-node${isBranch ? " is-branch" : ""}" data-td-id="${esc(k)}" data-entry-id="${esc(m.id || "")}">
          <div class="td-rail">${avHtml}</div>
          <div class="td-content">
            <div class="td-node-top">
              <span class="td-who">${esc(who)}</span>
              ${at ? `<span class="td-when" title="${esc(fullTime(at))}">${esc(sepTime(at))}</span>` : ""}
              ${tagHtml}
              ${renderActs()}
            </div>
            ${branchRefHtml}
            ${bodyHtml}
          </div>
        </article>`;
          },
        });
      }
      if (canPatchSuperDom(tdListEl)) {
        // Preserve reading scroll position if older messages were prepended while scrolled up.
        let prepAnchor = null, prepTop = 0;
        if (!scrollBottom && !opts.focusMsgId && typeof opts.restoreScrollTop !== "number"
          && tdBodyEl && tdListEl._tdRoot === th.rootId && prevCount > 0 && th.list.length > prevCount) {
          const curFirst = tdListEl.querySelector?.(".td-node[data-td-id]");
          const firstKey = curFirst?.dataset?.tdId || "";
          const nextFirstNodeItem = items.find((it) => it.key !== "__td_older__");
          if (curFirst && firstKey && nextFirstNodeItem && nextFirstNodeItem.key !== firstKey
            && typeof curFirst.getBoundingClientRect === "function") {
            prepAnchor = curFirst;
            prepTop = curFirst.getBoundingClientRect().top;
          }
        }
        patchThreadDrawerList(tdListEl, th.rootId, items);
        if (prepAnchor && prepAnchor.isConnected && typeof prepAnchor.getBoundingClientRect === "function") {
          const delta = prepAnchor.getBoundingClientRect().top - prepTop;
          if (Math.abs(delta) > 0.5) tdBodyEl.scrollTop += delta;
        }
      } else {
        tdListEl.innerHTML = items.map((it) => it.render()).join("");
      }
    }
    updateThreadTargetBanner(th, info.byId);
    syncThreadComposerHint();
    syncThreadSendBtn();

    if (opts.focusMsgId) {
      requestAnimationFrame(() => focusNodeInDrawer(opts.focusMsgId));
    } else if (typeof opts.restoreScrollTop === "number" && tdBodyEl) {
      requestAnimationFrame(() => { tdBodyEl.scrollTop = opts.restoreScrollTop; });
    } else if (scrollBottom && tdBodyEl) {
      requestAnimationFrame(() => { tdBodyEl.scrollTop = tdBodyEl.scrollHeight; });
    }
  }
  function syncThreadDrawer(opts = {}) {
    if (!activeThreadRoot) return;
    renderThreadDrawer(opts);
  }
  function openThreadDrawer(rootId, focusMsgId = "", anchorId = "", opts = {}) {
    if (!tdDrawer || !rootId) return;
    cancelInitialAnchor();
    const info = computeReplyThreads(chatEntries());
    const resolved = resolveThread(info, rootId, anchorId || focusMsgId || rootId);
    if (!resolved) return;
    const realRoot = resolved.rootId;
    const appEl = $("#app");
    const sc = view === "collie" ? viewScroller("collie") : null;
    const lockSnap = sc ? (collieLayoutLock?.snap || captureColliePos(sc)) : null;
    const hadFile = appEl.classList.contains("has-file");
    const hadThread = appEl.classList.contains("has-thread");
    if (hadFile) closeFilePane();
    clearTimeout(tdHideTimer);
    const switched = activeThreadRoot !== realRoot;
    if (tdDraftRoot && tdDraftRoot !== realRoot) tdComposer?._clearFiles?.();
    tdDraftRoot = realRoot;
    activeThreadRoot = realRoot;
    activeThreadAnchor = anchorId || focusMsgId || realRoot;
    if (switched) {
      drawerReplyTarget = null;
      tdLastSig = "";
      tdWorkersSig = "";
      tdLastCount = 0;
    }
    applyThreadWidth();
    if (tdDrawer.hidden) { tdDrawer.hidden = false; tdDrawer.offsetWidth; }
    tdDrawer.classList.remove("is-dragging");
    tdDrawer.style.transform = "";
    if (tdScrim) { tdScrim.style.opacity = ""; tdScrim.hidden = false; }
    tdDrawer.setAttribute("aria-hidden", "false");
    appEl.classList.add("has-thread");
    syncActiveThreadMarks(info);
    const hasRestore = typeof opts.restoreScrollTop === "number";
    renderThreadDrawer({
      focusMsgId,
      scrollBottom: !focusMsgId && !hasRestore,
      restoreScrollTop: hasRestore ? opts.restoreScrollTop : undefined,
      force: true,
    });
    if (lockSnap) {
      beginCollieLayoutLock(lockSnap, { trackTransition: !hadThread && innerWidth > 1000 });
    }
    if (resolved.missingRoot && canLoadOlder()) {
      ensureThreadRootLoaded(activeThreadRoot, false);
    }
  }
  function closeThreadDrawer(opts = {}) {
    if (!tdDrawer) return;
    const appEl = $("#app");
    const wasOpen = !!activeThreadRoot || !tdDrawer.hidden;
    const hadThread = appEl.classList.contains("has-thread");
    const sc = wasOpen && opts.rerender !== false && view === "collie" ? viewScroller("collie") : null;
    const lockSnap = sc ? (collieLayoutLock?.snap || captureColliePos(sc)) : null;
    activeThreadRoot = null;
    activeThreadAnchor = "";
    drawerReplyTarget = null;
    tdLastSig = "";
    tdWorkersSig = "";
    tdLastCount = 0;
    if (tdWorkersEl) { tdWorkersEl.hidden = true; tdWorkersEl.innerHTML = ""; }
    tdDrawer.classList.remove("is-dragging");
    tdDrawer.style.transform = "";
    if (tdScrim) tdScrim.style.opacity = "";
    appEl.classList.remove("has-thread");
    appEl.classList.remove("thread-wide");
    syncThreadWideUI();
    tdDrawer.setAttribute("aria-hidden", "true");
    clearTimeout(tdHideTimer);
    const hideNow = () => {
      tdDrawer.hidden = true;
      if (tdScrim) tdScrim.hidden = true;
    };
    if (opts.immediate) hideNow();
    else tdHideTimer = setTimeout(hideNow, 340);
    if (wasOpen && opts.rerender !== false && view === "collie") {
      syncActiveThreadMarks();
      if (lockSnap) {
        beginCollieLayoutLock(lockSnap, { trackTransition: hadThread && innerWidth > 1000 && !opts.immediate });
      }
    }
  }
  function locateFromDrawer(msgId) {
    if (!msgId) return;
    if (innerWidth <= 1000 && activeThreadRoot) closeThreadDrawer();
    requestAnimationFrame(() => jumpToEntry(msgId));
  }

  if (tdDrawer) {
    const tdHandleBtn = $("#td-handle");
    const tdHeadEl = tdDrawer.querySelector(".td-head");
    let tdSkipHandleClickUntil = 0;
    tdWidenBtn?.addEventListener("click", () => {
      if (innerWidth <= 1000 || !activeThreadRoot) return;
      setThreadWide(!threadWide);
    });
    $("#v-collie")?.addEventListener("click", (e) => {
      if (!activeThreadRoot || !threadWide || innerWidth <= 1000) return;
      if (window.getSelection?.()?.toString()) return;
      if (e.target.closest?.("a, button, input, textarea, select, label, .composer, .d-head, .crew, .super-search, .pending-wrap, .msg, .event, .ask, .thumb")) return;
      setThreadWide(false);
    });
    addEventListener("resize", () => {
      if (activeThreadRoot) applyThreadWidth();
      else syncThreadWideUI();
    });
    tdCloseBtn?.addEventListener("click", () => closeThreadDrawer());
    tdBackBtn?.addEventListener("click", () => closeThreadDrawer());
    tdScrim?.addEventListener("click", () => closeThreadDrawer());
    tdHandleBtn?.addEventListener("click", () => {
      if (performance.now() < tdSkipHandleClickUntil) return;
      closeThreadDrawer();
    });
    // Mobile bottom-sheet drag-to-dismiss on the grabber handle and header area.
    const bindSheetDrag = (zone) => {
      if (!zone) return;
      let startY = 0, startX = 0, startT = 0, lastY = 0, pid = null, dragging = false;
      const resetDrag = () => {
        pid = null;
        dragging = false;
        tdDrawer.classList.remove("is-dragging");
        tdDrawer.style.transform = "";
        if (tdScrim) tdScrim.style.opacity = "";
      };
      zone.addEventListener("pointerdown", (e) => {
        if (innerWidth > 760 || !activeThreadRoot) return;
        if (e.pointerType === "mouse" && e.button !== 0) return;
        if (e.target.closest("button:not(#td-handle)")) return;
        pid = e.pointerId;
        startY = lastY = e.clientY;
        startX = e.clientX;
        startT = performance.now();
        dragging = false;
      });
      zone.addEventListener("pointermove", (e) => {
        if (pid !== e.pointerId) return;
        const dy = e.clientY - startY, dx = e.clientX - startX;
        lastY = e.clientY;
        if (!dragging) {
          if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) { pid = null; return; }
          if (dy <= 8) return;
          dragging = true;
          tdDrawer.classList.add("is-dragging");
          try { zone.setPointerCapture(e.pointerId); } catch {}
        }
        const offset = Math.max(0, dy);
        tdDrawer.style.transform = `translateY(${offset}px)`;
        if (tdScrim) {
          const ratio = Math.min(1, offset / Math.max(240, tdDrawer.offsetHeight * 0.5));
          tdScrim.style.opacity = String(Math.max(0, 1 - ratio));
        }
      });
      const finish = (e, cancelled) => {
        if (pid !== e.pointerId) return;
        const wasDragging = dragging;
        const dy = Math.max(0, lastY - startY);
        const dt = Math.max(1, performance.now() - startT);
        const vy = dy / dt;
        const threshold = Math.min(120, (tdDrawer.offsetHeight || 600) * 0.22);
        resetDrag();
        if (wasDragging) {
          tdSkipHandleClickUntil = performance.now() + 80;
          if (!cancelled && (dy > threshold || (dy > 40 && vy > 0.45))) closeThreadDrawer();
        }
      };
      zone.addEventListener("pointerup", (e) => finish(e, false));
      zone.addEventListener("pointercancel", (e) => finish(e, true));
    };
    bindSheetDrag(tdHandleBtn);
    bindSheetDrag(tdHeadEl);
    tdLocateRootBtn?.addEventListener("click", () => {
      const info = computeReplyThreads(chatEntries());
      const th = resolveThread(info, activeThreadRoot, activeThreadAnchor);
      const target = th?.root?.id || th?.list?.[0]?.id || "";
      if (target) locateFromDrawer(target);
    });
    tdTargetReset?.addEventListener("click", () => {
      drawerReplyTarget = null;
      const info = computeReplyThreads(chatEntries());
      const th = resolveThread(info, activeThreadRoot, activeThreadAnchor);
      if (th) updateThreadTargetBanner(th, info.byId);
      tdInput?.focus({ preventScroll: true });
    });
    tdListEl?.addEventListener("click", (e) => {
      if (e.target.closest(".reply-ack[data-ack], .reply-opt[data-opt]")) {
        handleQuickOptionClick(e, { scrollBottom: false, inDrawer: true });
        return;
      }
      const loadBtn = e.target.closest("[data-td-load-older]");
      if (loadBtn) {
        e.preventDefault();
        ensureThreadRootLoaded(activeThreadRoot, true);
        return;
      }
      const replyBtn = e.target.closest("[data-td-reply]");
      if (replyBtn) {
        e.preventDefault();
        const info = computeReplyThreads(chatEntries());
        const th = resolveThread(info, activeThreadRoot, activeThreadAnchor);
        if (!th) return;
        drawerReplyTarget = replyBtn.dataset.tdReply;
        updateThreadTargetBanner(th, info.byId);
        tdInput?.focus({ preventScroll: true });
        return;
      }
      const locBtn = e.target.closest("[data-td-locate]");
      if (locBtn) {
        e.preventDefault();
        locateFromDrawer(locBtn.dataset.tdLocate);
        return;
      }
      const jumpBtn = e.target.closest("[data-jump-drawer]");
      if (jumpBtn) {
        e.preventDefault();
        focusNodeInDrawer(jumpBtn.dataset.jumpDrawer);
        return;
      }
      if (e.target.closest("a, button, .thumb, img, pre, code")) return;
      if (window.getSelection?.()?.toString()) return;
      const node = e.target.closest(".td-node[data-entry-id]");
      const eid = node?.dataset.entryId || "";
      if (eid) locateFromDrawer(eid);
    });
    tdListEl?.addEventListener("load", (e) => {
      if (e.target?.tagName !== "IMG" || !tdBodyEl) return;
      if (performance.now() < tdAutoStickUntil) tdBodyEl.scrollTop = tdBodyEl.scrollHeight;
    }, true);
    if (tdComposer && tdInput) {
      tdComposerCtrl = bindComposer(tdComposer, tdInput, async (text, ctx) => {
        tdForceScroll = true;
        tdAutoStickUntil = performance.now() + 1200;
        await sendSuper(text, ctx.targetRe, false, undefined, { scrollBottom: false });
        if (tdBodyEl) requestAnimationFrame(() => { tdBodyEl.scrollTop = tdBodyEl.scrollHeight; });
      }, () => targetNow().machine, {
        sendBtn: tdSendBtn,
        grow: growThreadInput,
        trim: true,
        syncSendBtn: syncThreadSendBtn,
        onFilesChange: () => {
          if (tdBodyEl && tdBodyEl.scrollHeight - tdBodyEl.scrollTop - tdBodyEl.clientHeight <= AT_BOTTOM_PX + 24) {
            requestAnimationFrame(() => { tdBodyEl.scrollTop = tdBodyEl.scrollHeight; });
          }
        },
        beforeSend: () => {
          if (!activeThreadRoot) return false;
          const info = computeReplyThreads(chatEntries());
          const th = resolveThread(info, activeThreadRoot, activeThreadAnchor);
          if (!th) return false;
          const fallbackLatest = [...th.list].reverse().find((x) => x.id) || th.latest;
          const targetMsg = (drawerReplyTarget && info.byId.get(drawerReplyTarget)?.id)
            ? info.byId.get(drawerReplyTarget)
            : fallbackLatest;
          if (!targetMsg?.id) return false;
          const ctx = {
            targetRe: { entry: targetMsg.id, who: threadWhoLabel(targetMsg), text: targetMsg.text },
            prevBranch: drawerReplyTarget,
          };
          drawerReplyTarget = null;
          return ctx;
        },
        onError: (ctx) => {
          if (ctx) drawerReplyTarget = ctx.prevBranch;
          if (activeThreadRoot) syncThreadDrawer();
        },
      });
    }
    tdGripEl?.addEventListener("pointerdown", (e) => {
      if (innerWidth <= 1000) return;
      e.preventDefault();
      cancelCollieLayoutLock();
      const sc = view === "collie" ? viewScroller("collie") : null;
      const gripSnap = sc ? captureColliePos(sc) : null;
      const grip = e.currentTarget;
      grip.setPointerCapture(e.pointerId);
      document.body.classList.add("dragging");
      const max = Math.max(threadMax(), threadWideW());
      const move = (ev) => {
        setThreadW(Math.max(360, Math.min(innerWidth - ev.clientX, max)));
        if (gripSnap && sc) {
          applyColliePos(sc, gripSnap);
          updateSuperJump();
        }
      };
      const up = () => {
        grip.removeEventListener("pointermove", move);
        grip.removeEventListener("pointerup", up);
        grip.removeEventListener("pointercancel", up);
        document.body.classList.remove("dragging");
        const finalW = parseInt(getComputedStyle(document.documentElement).getPropertyValue("--thread-w")) || 432;
        if (finalW > threadMax() + 40) {
          threadWide = true;
          store.set("threadWide", true);
        } else {
          threadWide = false;
          store.set("threadWide", false);
          store.set("threadW", finalW);
        }
        syncThreadWideUI();
        if (gripSnap && sc) {
          applyColliePos(sc, gripSnap);
          captureViewScroll("collie", null, navCur);
          updateSuperJump();
        }
      };
      grip.addEventListener("pointermove", move);
      grip.addEventListener("pointerup", up, { once: true });
      grip.addEventListener("pointercancel", up, { once: true });
    });
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape" || !activeThreadRoot || tdDrawer.hidden) return;
      if (e.isComposing || e.keyCode === 229) return;
      if (document.querySelector("dialog[open]") || pickOpen || dirCtx) return;
      e.preventDefault();
      closeThreadDrawer();
    });
    syncThreadComposerHint();
    syncThreadSendBtn();
  }

  // Minimal, safe Markdown: escape first, then add a little structure.
  const mdCache = new Map();
  const mdCacheImgKeys = new Set();
  function invalidateMdCacheForImage(p) {
    thumbRenderVer++;
    if (!p || !mdCacheImgKeys.size) return;
    const baseName = p.split("/").pop() || "";
    for (const k of [...mdCacheImgKeys]) {
      const rendered = mdCache.get(k);
      if (rendered === undefined) { mdCacheImgKeys.delete(k); continue; }
      if (k.includes(p) || (baseName && k.includes(baseName)) || rendered.includes(p)) {
        mdCache.delete(k);
        mdCacheImgKeys.delete(k);
      }
    }
  }
  function md(src) {
    const key = String(src || "");
    let out = mdCache.get(key);
    if (out === undefined) {
      out = mdRender(key);
      if (mdCache.size > 8000) {
        const oldest = mdCache.keys().next().value;
        mdCache.delete(oldest);
        mdCacheImgKeys.delete(oldest);
      }
      mdCache.set(key, out);
      if (out.includes('class="thumb md-thumb"')) mdCacheImgKeys.add(key);
    }
    return out;
  }
  // A bare link: ASCII URL characters up to whitespace, tags or non-ASCII text
  // and punctuation, shown as its host and path, shortened ([name](url) is
  // better still: the name shows).
  const URL_RE = /(?<![A-Za-z0-9_\/])https?:\/\/[^\x00-\x20<>\x7f-\uffff]+/g;
  const unesc = (s) => s.replace(/&(amp|lt|gt|quot|#39);/g, (m) => ({ "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'" }[m]));
  const urlLabel = (u) => {
    const s = u.replace(/^https?:\/\//, "").replace(/\/$/, "");
    return s.length > 42 ? s.slice(0, 40) + "…" : s;
  };
  function parseInlineCodePath(raw) {
    if (!raw || raw.includes("://") || raw.includes("//") || /[\s<>"'`*?;$&|()\\]/.test(raw)) return "";
    const base = raw.replace(/(?:#L\d+(?:-L?\d+)?|:\d+(?:[-:]\d+)?)$/i, "");
    if (!/^(?:~\/(?:[\w.\-+@%~\u4e00-\u9fff]+\/)*|\/(?:[\w.\-+@%~\u4e00-\u9fff]+\/)+)[\w.\-+@%~\u4e00-\u9fff]*[A-Za-z0-9_\u4e00-\u9fff][\w.\-+@%~\u4e00-\u9fff]*\.[A-Za-z][A-Za-z0-9]{0,9}$/.test(base)) {
      return "";
    }
    const segs = (base.startsWith("~/") ? base.slice(2) : base.slice(1)).split("/");
    if (segs.some((seg) => !seg || seg === "." || /^\.{2,}$/.test(seg))) return "";
    return base;
  }
  function isPureHttpUrl(raw) {
    if (!/^https?:\/\/[^\x00-\x20<>"'`]+$/i.test(raw)) return false;
    try {
      const u = new URL(raw);
      if (u.protocol !== "http:" && u.protocol !== "https:") return false;
      const h = u.hostname;
      if (!h || h.startsWith(".") || h.endsWith(".")) return false;
      return h === "localhost" || h.includes(".") || h.startsWith("[") || Boolean(u.port);
    } catch {
      return false;
    }
  }
  // CommonMark ASCII punctuation characters that may be backslash-escaped.
  // inline() runs on HTML-escaped text, so the five escaped entities are
  // matched alongside the remaining 27 literal ASCII punctuation characters.
  const CM_ESC_ENTITY_RE = /^(?:&amp;|&lt;|&gt;|&quot;|&#39;)/;
  const CM_ESC_PUNCT_RE = /^[!#$%()*+,\-.\/:;=?@\[\\\]^_`{|}~]/;
  const isEscapedAt = (s, idx) => {
    let bs = 0;
    for (let k = idx - 1; k >= 0 && s[k] === "\\"; k--) bs++;
    return (bs & 1) === 1;
  };
  const hasUnescapedToken = (s, token) => {
    for (let p = s.indexOf(token); p >= 0; p = s.indexOf(token, p + token.length)) {
      if (!isEscapedAt(s, p)) return true;
    }
    return false;
  };
  // Heuristic for \(...\) and \[...\] so genuine LaTeX formulas render while
  // CommonMark-escaped prose like \(parens\) or \[brackets\] unescapes cleanly.
  function looksLikeLatexMath(raw) {
    const s = String(raw || "").trim();
    if (!s || /https?:\/\//i.test(s)) return false;
    if (/\\(?:[A-Za-z]+|[,;:!{}|%#$&_])/.test(s)) return true;
    if (/[=^_+<>~±×÷≈≠≤≥∞∑∫√∂∇∈∉⊂⊆∪∩∀∃→←↔⇒⇔α-ωΑ-Ω]/.test(s)) return true;
    if (/(?:^|\s)-\s*[A-Za-z0-9(\\]|(?<![A-Za-z])[A-Za-z0-9)\]]\s*-\s*(?:\d+|[A-Za-z](?![A-Za-z])|[(\\]|[A-Za-z]\()/.test(s)) return true;
    if (/^(?:\d+(?:\.\d+)?|[A-Za-z])(?:\s*[\/\*]\s*(?:\d+(?:\.\d+)?|[A-Za-z]))+$/.test(s)) return true;
    if (/^(?:\d+[A-Za-z]['′]?|[A-Za-z]['′]?(?:\s*,\s*[A-Za-z]['′]?)*|[A-Za-z]\([^()\n]+\)|\|[^|\n]+\|)$/.test(s)) return true;
    return false;
  }
  function renderMath(tex, displayMode, inlineWrap = false) {
    const src = String(tex || "").trim();
    if (!src) return "";
    const k = typeof katex !== "undefined" ? katex : (typeof globalThis !== "undefined" ? globalThis.katex : null);
    if (k && typeof k.renderToString === "function") {
      try {
        const html = k.renderToString(src, {
          displayMode: !!displayMode,
          throwOnError: false,
          errorColor: "var(--attn)",
          strict: "ignore",
          trust: false,
          maxSize: 20,
          maxExpand: 1000,
        });
        if (displayMode) {
          return inlineWrap
            ? `<span class="md-math-block" role="region" aria-label="数学公式">${html}</span>`
            : `<div class="md-math-block" tabindex="0" role="region" aria-label="数学公式">${html}</div>`;
        }
        return `<span class="md-math">${html}</span>`;
      } catch {}
    }
    return displayMode
      ? (inlineWrap
        ? `<span class="md-math-block md-math-fallback"><code>${esc(src)}</code></span>`
        : `<div class="md-math-block md-math-fallback"><code>${esc(src)}</code></div>`)
      : `<span class="md-math md-math-fallback"><code>${esc(src)}</code></span>`;
  }
  function extractMathBlocks(text, blocks) {
    const rawLines = text.split("\n");
    const outLines = [];
    for (let i = 0; i < rawLines.length; i++) {
      const line = rawLines[i];
      const trimmed = line.trim();
      if (trimmed.startsWith("$$")) {
        if (trimmed.length > 4 && trimmed.endsWith("$$") && !isEscapedAt(trimmed, trimmed.length - 2)) {
          const inner = trimmed.slice(2, -2);
          if (inner.trim() && !hasUnescapedToken(inner, "$$")) {
            blocks.push(renderMath(inner, true));
            outLines.push(`\u0000${blocks.length - 1}\u0000`);
            continue;
          }
        }
        const afterOpen = trimmed.slice(2);
        if (!hasUnescapedToken(afterOpen, "$$")) {
          let matched = false;
          for (let j = i + 1; j < rawLines.length; j++) {
            const nextTrim = rawLines[j].trim();
            if (!nextTrim || /^\u0000\d+\u0000$/.test(nextTrim)) break;
            const rt = rawLines[j].trimEnd();
            if (rt.endsWith("$$") && !isEscapedAt(rt, rt.length - 2)) {
              const beforeClose = rt.slice(0, -2);
              if (!hasUnescapedToken(beforeClose, "$$")) {
                const expr = [afterOpen, ...rawLines.slice(i + 1, j), beforeClose].join("\n").trim();
                if (expr) {
                  blocks.push(renderMath(expr, true));
                  outLines.push(`\u0000${blocks.length - 1}\u0000`);
                  i = j;
                  matched = true;
                }
              }
              break;
            }
            if (hasUnescapedToken(rawLines[j], "$$")) break;
          }
          if (matched) continue;
        }
      } else if (trimmed.startsWith("\\[")) {
        if (trimmed.length > 4 && trimmed.endsWith("\\]") && !isEscapedAt(trimmed, trimmed.length - 2)) {
          const inner = trimmed.slice(2, -2);
          if (!hasUnescapedToken(inner, "\\]") && looksLikeLatexMath(inner)) {
            blocks.push(renderMath(inner, true));
            outLines.push(`\u0000${blocks.length - 1}\u0000`);
            continue;
          }
        }
        const afterOpen = trimmed.slice(2);
        if (!hasUnescapedToken(afterOpen, "\\]")) {
          let matched = false;
          for (let j = i + 1; j < rawLines.length; j++) {
            const nextTrim = rawLines[j].trim();
            if (!nextTrim || /^\u0000\d+\u0000$/.test(nextTrim)) break;
            const rt = rawLines[j].trimEnd();
            if (rt.endsWith("\\]") && !isEscapedAt(rt, rt.length - 2)) {
              const beforeClose = rt.slice(0, -2);
              if (!hasUnescapedToken(beforeClose, "\\]")) {
                const expr = [afterOpen, ...rawLines.slice(i + 1, j), beforeClose].join("\n").trim();
                if (looksLikeLatexMath(expr)) {
                  blocks.push(renderMath(expr, true));
                  outLines.push(`\u0000${blocks.length - 1}\u0000`);
                  i = j;
                  matched = true;
                }
              }
              break;
            }
            if (hasUnescapedToken(rawLines[j], "\\]")) break;
          }
          if (matched) continue;
        }
      }
      outLines.push(line);
    }
    return outLines.join("\n");
  }
  const findLatexClose = (s, start, closeCh) => {
    for (let j = start; j < s.length; j++) {
      const ch = s[j];
      if (ch === "`") return -1;
      if (ch === "\\") {
        if (s[j + 1] === closeCh) return j;
        j++;
      }
    }
    return -1;
  };
  const findDoubleDollarClose = (s, start) => {
    for (let j = start; j < s.length - 1; j++) {
      if (s[j] === "`") return -1;
      if (s[j] === "\\") { j++; continue; }
      if (s[j] === "$" && s[j + 1] === "$") return j;
    }
    return -1;
  };
  const findDollarClose = (s, start) => {
    let braces = 0;
    for (let j = start; j < s.length; j++) {
      const ch = s[j];
      if (ch === "`") return -1;
      if (ch === "\\") { j++; continue; }
      if (ch === "{") { braces++; continue; }
      if (ch === "}") { if (--braces < 0) return -1; continue; }
      if (ch === "$") {
        if (j === start || braces !== 0) return -1;
        if (s[j + 1] === "$") return -1;
        if (/\s/.test(s[j - 1])) return -1;
        if (j + 1 < s.length && /[A-Za-z0-9_${]/.test(s[j + 1])) return -1;
        return j;
      }
    }
    return -1;
  };
  function mdRender(src) {
    const blocks = [];
    let text = String(src || "").replace(/\r\n?/g, "\n").replace(/[\u0000\u0001]/g, "").replace(/```([^\n`]*)\n([\s\S]*?)(```|$)/g, (_, info, code) => {
      const raw = code.replace(/\n$/, "");
      const lang = detectCodeLang(info, false);
      blocks.push(`<pre><code${lang ? ` data-lang="${lang.id}"` : ""}>${lang ? highlightCode(raw, lang.id) : esc(raw)}</code></pre>`);
      return `\u0000${blocks.length - 1}\u0000`;
    });
    text = extractMathBlocks(text, blocks);
    text = esc(text);
    const inline = (s) => {
      const stash = [];
      const keep = (h) => `\u0001${stash.push(h) - 1}\u0001`;
      let scanned = "";
      for (let i = 0; i < s.length; ) {
        const ch = s[i];
        if (ch === "`") {
          let ticks = 1;
          while (s[i + ticks] === "`") ticks++;
          let close = -1;
          for (let j = i + ticks; j < s.length; j++) {
            if (s[j] !== "`") continue;
            let n = 1;
            while (s[j + n] === "`") n++;
            if (n === ticks) { close = j; break; }
            j += n - 1;
          }
          if (close > i + ticks) {
            let c = s.slice(i + ticks, close);
            if (ticks > 1 && c.length >= 2 && c.startsWith(" ") && c.endsWith(" ") && c.trim()) {
              c = c.slice(1, -1);
            }
            const raw = unesc(c).trim();
            const cleanP = parseInlineCodePath(raw);
            if (cleanP) {
              const ep = esc(cleanP);
              scanned += keep(`<a ${fileLinkAttrs(cleanP, ep, "打开这个文件")}><code class="code-link">${c}</code></a>`);
            } else if (isPureHttpUrl(raw)) {
              const eu = esc(raw);
              scanned += keep(`<a class="url" href="${eu}" target="_blank" rel="noopener noreferrer" title="${eu}"><code class="code-link">${c}</code></a>`);
            } else {
              scanned += keep(`<code>${c}</code>`);
            }
            i = close + ticks;
            continue;
          }
          scanned += s.slice(i, i + ticks);
          i += ticks;
          continue;
        }
        if (ch === "\\" && i + 1 < s.length) {
          const next = s[i + 1];
          if (next === "[" && !(i > 0 && /[A-Za-z0-9_]/.test(s[i - 1]))) {
            const close = findLatexClose(s, i + 2, "]");
            if (close > i + 2 && s[close + 2] !== "(") {
              const raw = unesc(s.slice(i + 2, close));
              if (looksLikeLatexMath(raw)) {
                scanned += keep(renderMath(raw, true, true));
                i = close + 2;
                continue;
              }
            }
          }
          if (next === "(" && !(i > 0 && s[i - 1] === "]")) {
            const close = findLatexClose(s, i + 2, ")");
            if (close > i + 2) {
              const raw = unesc(s.slice(i + 2, close));
              if (looksLikeLatexMath(raw)) {
                scanned += keep(renderMath(raw, false));
                i = close + 2;
                continue;
              }
            }
          }
          const rest = s.slice(i + 1);
          const ent = rest.match(CM_ESC_ENTITY_RE);
          if (ent) {
            scanned += keep(ent[0]);
            i += 1 + ent[0].length;
            continue;
          }
          if (CM_ESC_PUNCT_RE.test(next)) {
            scanned += keep(next);
            i += 2;
            continue;
          }
        }
        if (ch === "$") {
          if (s[i + 1] === "$") {
            const close = findDoubleDollarClose(s, i + 2);
            if (close > i + 2) {
              const raw = unesc(s.slice(i + 2, close));
              if (raw.trim()) {
                scanned += keep(renderMath(raw, true, true));
                i = close + 2;
                continue;
              }
            }
            scanned += "$$";
            i += 2;
            continue;
          }
          if (!(i > 0 && /[A-Za-z0-9_]/.test(s[i - 1])) && i + 1 < s.length && !/\s/.test(s[i + 1])) {
            const close = findDollarClose(s, i + 1);
            if (close > i + 1) {
              const raw = unesc(s.slice(i + 1, close));
              const looksLikeCurrencyProse = !raw.includes("\\") && /^\d[\d,]*(?:\.\d+)?\s+[A-Za-z\u4e00-\u9fff]{2,}/.test(raw);
              if (!looksLikeCurrencyProse) {
                scanned += keep(renderMath(raw, false));
                i = close + 1;
                continue;
              }
            }
          }
        }
        scanned += ch;
        i++;
      }
      let r = scanned
        .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
        .replace(/!\[([^\]\n]*)\]\((https?:\/\/(?:[^()\s"]|\([^()\s"]*\))+)\)/g, (_, alt, u) => {
          const rawU = unesc(u), eu = esc(rawU);
          return keep(`<button type="button" class="md-img-btn" data-img-url="${eu}" data-img-alt="${alt}" aria-label="${alt || "查看大图"}"><img class="md-img" src="${eu}" alt="${alt}" loading="lazy"></button>`);
        })
        .replace(/!\[([^\]\n]*)\]\((?:file:\/\/)?((?:\/|~\/)[^)\s"#]+)(?:#[^)\s"]*)?\)/g, (_, alt, p) => {
          p = unesc(p).replace(/:\d+(?:[-:]\d+)?$/, "");
          try { p = decodeURI(p); } catch {}
          const ep = esc(p);
          if (!IMG_EXT.test(p)) return keep(`<a ${fileLinkAttrs(p, ep, ep)}>${alt || ep}</a>`);
          return keep(`<button type="button" class="thumb md-thumb" data-img="${ep}" data-img-alt="${alt}" aria-label="${alt || esc("查看大图 " + (p.split("/").pop() || "图片"))}"><img class="md-img" alt="${alt}"${thumbImgAttrs(p)}></button>`);
        })
        .replace(/\[([^\]\n]+)\]\((https?:\/\/(?:[^()\s"]|\([^()\s"]*\))+)\)/g, (_, l, u) => keep(`<a href="${u}" target="_blank" rel="noopener noreferrer">${l}</a>`))
        // [MergeStatus.tsx](file:///…/MergeStatus.tsx#L67-L84): the name, opening the file.
        .replace(/\[([^\]\n]+)\]\((?:file:\/\/)?((?:\/|~\/)[^)\s"#]+)(?:#[^)\s"]*)?\)/g, (_, label, p) => {
          p = unesc(p).replace(/:\d+(?:[-:]\d+)?$/, "");
          try { p = decodeURI(p); } catch {}
          const ep = esc(p);
          return keep(`<a ${fileLinkAttrs(p, ep, ep)}>${label}</a>`);
        })
        .replace(URL_RE, (m) => {
          const raw = unesc(m);
          const cut = raw.search(/[<>"`]/);
          let u = cut < 0 ? raw : raw.slice(0, cut);
          const rest = cut < 0 ? "" : raw.slice(cut);
          let tail = "";
          const count = (x, ch) => x.split(ch).length - 1;
          while (u.length) {
            if (/[.,;:!?']$/.test(u) ||
                (u.endsWith(")") && count(u, "(") < count(u, ")")) ||
                (u.endsWith("]") && count(u, "[") < count(u, "]"))) {
              tail = u.slice(-1) + tail;
              u = u.slice(0, -1);
            } else break;
          }
          if (!/^https?:\/\/[^\/.\s]/.test(u)) return m;
          const eu = esc(u);
          return keep(`<a class="url" href="${eu}" target="_blank" rel="noopener noreferrer" title="${eu}">${esc(urlLabel(u))}</a>`) + esc(tail + rest);
        })
        .replace(FILE_RE, (_, pre, p) => {
          const rawP = unesc(p);
          return `${pre}${keep(`<a ${fileLinkAttrs(rawP, p, "打开这个文件")}>${p}</a>`)}`;
        });
      while (r.includes("\u0001")) r = r.replace(/\u0001(\d+)\u0001/g, (_, n) => stash[+n]);
      return r;
    };
    const out = [];
    let list = null, para = [];
    const flushPara = () => { if (para.length) { out.push(`<p>${para.map(inline).join("<br>")}</p>`); para = []; } };
    const flushList = () => { if (list) { out.push(`<${list.tag}${list.start > 1 ? ` start="${list.start}"` : ""}>${list.items.map((x) => `<li>${inline(x)}</li>`).join("")}</${list.tag}>`); list = null; } };
    // A GFM table: a | row, a |---| row, then more | rows.
    const cells = (row) => row.trim().replace(/^\|/, "").replace(/\|$/, "").split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, "|"));
    const isSep = (row) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(row) && row.includes("-");
    const lines = text.split("\n");
    for (let li = 0; li < lines.length; li++) {
      const line = lines[li];
      let m;
      if (line.includes("|") && li + 1 < lines.length && isSep(lines[li + 1]) && lines[li + 1].includes("|")) {
        flushPara(); flushList();
        const head = cells(line);
        const align = cells(lines[li + 1]).map((c) => c.endsWith(":") ? (c.startsWith(":") ? "center" : "right") : "");
        const td = (tag, c, k) => `<${tag}${align[k] ? ` style="text-align:${align[k]}"` : ""}>${inline(c)}</${tag}>`;
        let body = "";
        li += 2;
        while (li < lines.length && lines[li].includes("|") && lines[li].trim()) {
          const r = cells(lines[li]);
          body += `<tr>${head.map((_, k) => td("td", r[k] || "", k)).join("")}</tr>`;
          li++;
        }
        li--;
        out.push(`<div class="md-table" tabindex="0" role="region" aria-label="数据表格"><table><thead><tr>${head.map((c, k) => td("th", c, k)).join("")}</tr></thead><tbody>${body}</tbody></table></div>`);
        continue;
      }
      if (/^\u0000\d+\u0000$/.test(line.trim())) { flushPara(); flushList(); out.push(line.trim()); continue; }
      if (/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(line)) { flushPara(); flushList(); out.push("<hr>"); continue; }
      if ((m = line.match(/^(#{1,4})\s+(.*)$/))) { flushPara(); flushList(); const h = Math.min(m[1].length + 1, 4); out.push(`<h${h}>${inline(m[2])}</h${h}>`); continue; }
      if ((m = line.match(/^\s*[-*•]\s+(.*)$/)) || (m = line.match(/^\s*\d+[.)]\s+(.*)$/))) {
        const tag = /^\s*\d/.test(line) ? "ol" : "ul";
        flushPara();
        // "2." after a few bullets carries on the numbering, as the agent wrote it.
        if (!list || list.tag !== tag) { flushList(); list = { tag, items: [], start: parseInt(line) || 1 }; }
        list.items.push(m[1]);
        continue;
      }
      if ((m = line.match(/^&gt;\s?(.*)$/))) { flushPara(); flushList(); out.push(`<blockquote>${inline(m[1])}</blockquote>`); continue; }
      if (!line.trim()) { flushPara(); flushList(); continue; }
      flushList();
      para.push(line);
    }
    flushPara(); flushList();
    return out.join("").replace(/\u0000(\d+)\u0000/g, (_, n) => blocks[+n]);
  }

  // ───────────────────────────── input
  const SEQ = {
    "\r": "enter", "\x7f": "backspace", "\b": "backspace", "\t": "tab", "\x1b": "esc",
    "\x1b[A": "up", "\x1b[B": "down", "\x1b[C": "right", "\x1b[D": "left", "\x1b[Z": "shift+tab",
    "\x1b[H": "home", "\x1b[F": "end", "\x1b[3~": "delete", "\x1b[5~": "pageup", "\x1b[6~": "pagedown",
    "\x1bOA": "up", "\x1bOB": "down", "\x1bOC": "right", "\x1bOD": "left",
  };
  function typeIntoPane(data) {
    if (!current) return;
    if (SEQ[data]) return sendKeys([SEQ[data]]);
    if (data.length === 1 && data.charCodeAt(0) < 27) return sendKeys(["ctrl+" + String.fromCharCode(data.charCodeAt(0) + 96)]);
    sendText(data);
  }
  // Keystrokes go out one request at a time, in order; text typed while one
  // is on its way rides along in the next.
  let sendChain = Promise.resolve(), sendTail = null;
  function sendToPane(kind, body) {
    if (!current) return;
    const url = paneURL(current, kind);
    if (kind === "text" && sendTail && sendTail.url === url && !sendTail.started) {
      sendTail.body.text += body.text;
      return sendTail.done;
    }
    const op = { url, body, started: false };
    op.done = sendChain = sendChain.then(() => {
      op.started = true;
      if (sendTail === op) sendTail = null;
      return api(url, { body: op.body });
    }).catch((e) => toast(e.message));
    sendTail = kind === "text" ? op : null;
    return op.done;
  }
  const sendKeys = (keys) => sendToPane("keys", { keys });
  const sendText = (text) => sendToPane("text", { text });

  $("#keys").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b || !current) return;
    if (b.dataset.k) sendKeys([b.dataset.k]); else if (b.dataset.t) sendText(b.dataset.t);
  });
  $("#keys").addEventListener("mousedown", (e) => e.preventDefault());

  function grow(el) {
    if (!el) return;
    if (el.closest?.(".cbox") && typeof CSS !== "undefined" && CSS.supports?.("field-sizing", "content")) {
      if (el.style.height) el.style.height = "";
      return;
    }
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, innerHeight * 0.4) + "px";
  }
  // Files go to the machine where the agent runs, then their paths ride
  // along in the message (agents read images and files by path).
  const fmtSize = (n) => n < 1024 ? n + " B" : n < 1 << 20 ? Math.round(n / 1024) + " KB" : (n / 1048576).toFixed(1) + " MB";
  const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
  const FILE_SVG = '<svg class="fi-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></svg>';
  const IMG_SVG = '<svg class="fi-ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="M21 15l-4.5-4.5L7 20"/></svg>';
  const EXT_MIME = {
    png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif",
    webp: "image/webp", bmp: "image/bmp", svg: "image/svg+xml", avif: "image/avif",
    ico: "image/x-icon", heic: "image/heic", heif: "image/heif", tif: "image/tiff", tiff: "image/tiff",
  };
  const MIME_EXT = {
    "image/png": ".png", "image/jpeg": ".jpg", "image/jpg": ".jpg", "image/gif": ".gif",
    "image/webp": ".webp", "image/bmp": ".bmp", "image/svg+xml": ".svg", "image/avif": ".avif",
  };
  const extOf = (name) => {
    const m = String(name || "").match(/\.([a-z0-9]{1,8})$/i);
    return m ? m[1].toLowerCase() : "";
  };
  const stemOf = (name) => String(name || "").replace(/\.[^.]+$/, "").toLowerCase();
  const guessMime = (file) => (file?.type || "").toLowerCase() || EXT_MIME[extOf(file?.name)] || "";
  const isImageFile = (file) => guessMime(file).startsWith("image/");
  const isUnpreviewableImage = (mime) => /^image\/(heic|heif|tiff|x-adobe-dng|vnd\.adobe\.photoshop)$/i.test(mime || "");
  const isHashCacheName = (name) => /^[0-9a-f]{24,64}\.[a-z0-9]{1,8}$/i.test(String(name || "").trim());
  const shortFileName = (name, max = 24) => {
    const s = String(name || "文件");
    if (s.length <= max) return s;
    const dot = s.lastIndexOf(".");
    const ext = dot > 0 && s.length - dot <= 8 ? s.slice(dot) : "";
    const stem = ext ? s.slice(0, dot) : s;
    const keep = Math.max(8, max - ext.length - 1);
    const head = Math.ceil(keep * 0.65), tail = keep - head;
    return stem.slice(0, head) + "…" + (tail > 0 ? stem.slice(-tail) : "") + ext;
  };
  const swapExtForMime = (name, mime) => {
    const ext = MIME_EXT[(mime || "").toLowerCase()];
    const base = String(name || "").trim();
    if (!ext) return base || "粘贴的图片.png";
    if (!base || /^image\.[a-z0-9]+$/i.test(base) || isHashCacheName(base)) return "粘贴的图片" + ext;
    if (/\.[a-z0-9]{1,8}$/i.test(base)) return base.replace(/\.[a-z0-9]{1,8}$/i, ext);
    return base + ext;
  };
  function sniffImageMime(buf) {
    if (!buf || buf.byteLength < 4) return "";
    const b = new Uint8Array(buf, 0, Math.min(buf.byteLength, 32));
    if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return "image/png";
    if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
    if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return "image/gif";
    if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
    if (b[0] === 0x42 && b[1] === 0x4d) return "image/bmp";
    return "";
  }
  function decodeDataImageUri(uri) {
    const m = String(uri || "").match(/^data:(image\/[a-z0-9.+-]+)((?:;[^,]*)*),([\s\S]+)$/i);
    if (!m) return null;
    const mime = m[1].toLowerCase();
    const isB64 = /;base64$/i.test(m[2] || "");
    const raw = m[3];
    try {
      let bytes;
      if (isB64) {
        const bin = atob(raw.replace(/\s+/g, ""));
        bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      } else {
        const str = decodeURIComponent(raw);
        bytes = typeof TextEncoder === "function"
          ? new TextEncoder().encode(str)
          : Uint8Array.from(str, (c) => c.charCodeAt(0) & 0xff);
      }
      if (!bytes.byteLength) return null;
      const sniffed = sniffImageMime(bytes.buffer) || (mime === "image/svg+xml" ? mime : "");
      const finalMime = sniffed || mime;
      const ext = MIME_EXT[finalMime] || ".png";
      const name = "粘贴的图片" + ext;
      const blob = typeof Blob === "function" ? new Blob([bytes], { type: finalMime }) : { name, size: bytes.byteLength, type: finalMime, _bytes: bytes };
      return { blob, name, type: finalMime, size: bytes.byteLength, sniffed };
    } catch {
      return null;
    }
  }
  function extractHtmlDataImages(html) {
    if (!html || !/data:image\//i.test(html)) return [];
    const out = [], seen = new Set();
    const re = /<img\b[^>]*?\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)')/gi;
    let m;
    while ((m = re.exec(html))) {
      const src = (m[1] || m[2] || "").replace(/&amp;/g, "&").trim();
      if (!/^data:image\//i.test(src) || seen.has(src)) continue;
      seen.add(src);
      const dec = decodeDataImageUri(src);
      if (dec) out.push(dec);
      if (out.length >= 10) break;
    }
    return out;
  }
  const isSyntheticClipImg = (f, now = Date.now()) => {
    if (!f || !isImageFile(f)) return false;
    const n = String(f.name || "").trim();
    const generic = !n || /^image\.(png|jpe?g|webp|gif|bmp)$/i.test(n) || /^picture\.(png|jpe?g)$/i.test(n);
    if (!generic) return false;
    return !f.lastModified || Math.abs(now - f.lastModified) < 5000;
  };
  function collectTransferFiles(dt) {
    if (!dt) return [];
    const out = [], seenObj = new Set(), itemKeys = new Set();
    const keyOf = (f) => `${f.name || ""}\0${f.size ?? ""}\0${f.type || ""}\0${f.lastModified ?? ""}`;
    if (dt.items && dt.items.length) {
      for (const item of [...dt.items]) {
        if (item?.kind !== "file") continue;
        try {
          const f = item.getAsFile?.();
          if (f && !seenObj.has(f)) {
            seenObj.add(f);
            itemKeys.add(keyOf(f));
            out.push(f);
          }
        } catch {}
      }
    }
    for (const f of [...(dt.files || [])]) {
      if (!f || seenObj.has(f)) continue;
      if (itemKeys.size && itemKeys.has(keyOf(f))) continue;
      seenObj.add(f);
      out.push(f);
    }
    return out;
  }
  function buildTransferEntries(rawFiles, htmlImgs, source) {
    const now = Date.now();
    if (!rawFiles.length) {
      return htmlImgs.map((h) => ({ candidates: [{ prebuilt: h }] }));
    }
    if (rawFiles.length === 1) {
      const f = rawFiles[0];
      const extra = (source === "paste" || source === "drop") && isImageFile(f) && htmlImgs.length
        ? htmlImgs.slice(0, 1).map((h) => ({ prebuilt: h }))
        : [];
      return [{ candidates: [{ file: f }, ...extra] }];
    }
    if (source === "paste" && rawFiles.every(isImageFile)) {
      const nonSynth = rawFiles.filter((f) => !isSyntheticClipImg(f, now));
      const sameStem = new Set(rawFiles.map((f) => stemOf(f.name)).filter(Boolean)).size <= 1;
      if (nonSynth.length <= 1 || sameStem) {
        return [{
          candidates: [
            ...rawFiles.map((f) => ({ file: f })),
            ...htmlImgs.slice(0, 1).map((h) => ({ prebuilt: h })),
          ],
        }];
      }
    }
    return rawFiles.map((f) => ({ candidates: [{ file: f }] }));
  }
  function startReadCandidate(cand, source, now = Date.now()) {
    if (cand.prebuilt) {
      return Promise.resolve({ ok: true, ...cand.prebuilt, synthetic: true });
    }
    const file = cand.file;
    const mime = guessMime(file);
    const img = isImageFile(file);
    if ((file?.size || 0) > MAX_UPLOAD_BYTES) {
      return Promise.resolve({ ok: false, reason: "too-large", file });
    }
    let bufPromise = null;
    try {
      if (typeof file?.arrayBuffer === "function") {
        bufPromise = file.arrayBuffer();
      } else if (typeof FileReader === "function" && typeof Blob === "function" && file instanceof Blob) {
        bufPromise = new Promise((resolve, reject) => {
          const fr = new FileReader();
          fr.onload = () => resolve(fr.result);
          fr.onerror = () => reject(fr.error || new Error("read-error"));
          fr.readAsArrayBuffer(file);
        });
      }
    } catch (err) {
      return Promise.resolve({ ok: false, reason: "unreadable", err, file });
    }
    if (!bufPromise) {
      if ((file?.size || 0) === 0 && (img || source === "paste")) {
        return Promise.resolve({ ok: false, reason: "unreadable", file });
      }
      return Promise.resolve({
        ok: true,
        blob: file,
        name: file?.name || (img ? "粘贴的图片.png" : "文件"),
        type: mime,
        size: file?.size || 0,
        sniffed: img ? mime : "",
        synthetic: isSyntheticClipImg(file, now),
        file,
      });
    }
    return bufPromise.then((buf) => {
      const byteLen = buf?.byteLength || 0;
      if (byteLen > MAX_UPLOAD_BYTES) return { ok: false, reason: "too-large", file };
      if (byteLen === 0 && ((file?.size || 0) > 0 || img || source === "paste")) {
        return { ok: false, reason: "unreadable", file };
      }
      const sniffed = sniffImageMime(buf) || (mime === "image/svg+xml" && byteLen > 0 ? mime : "");
      const finalMime = sniffed || mime || "application/octet-stream";
      const blob = typeof Blob === "function" ? new Blob([buf], { type: finalMime }) : file;
      return {
        ok: true,
        blob,
        name: file?.name || (finalMime.startsWith("image/") ? "粘贴的图片" + (MIME_EXT[finalMime] || ".png") : "文件"),
        type: finalMime,
        size: byteLen,
        sniffed,
        synthetic: isSyntheticClipImg(file, now),
        file,
      };
    }, (err) => ({ ok: false, reason: "unreadable", err, file }));
  }
  const CLIP_IMG_TYPES = ["image/png", "image/jpeg", "image/webp"];
  async function readClipboardBitmapFallback(baseName) {
    if (typeof navigator === "undefined" || typeof navigator.clipboard?.read !== "function") return null;
    if (window.isSecureContext === false) return null;
    try {
      const items = await navigator.clipboard.read();
      for (const item of items || []) {
        const types = Array.isArray(item?.types) ? item.types : [];
        const match = CLIP_IMG_TYPES.find((t) => types.includes(t))
          || types.find((t) => typeof t === "string" && t.startsWith("image/"));
        if (!match || typeof item.getType !== "function") continue;
        const raw = await item.getType(match);
        if (!raw) continue;
        const buf = typeof raw.arrayBuffer === "function" ? await raw.arrayBuffer() : null;
        const byteLen = buf ? buf.byteLength : (raw.size || 0);
        if (!byteLen || byteLen > MAX_UPLOAD_BYTES) continue;
        const sniffed = buf ? sniffImageMime(buf) : "";
        const finalMime = sniffed || raw.type || match;
        const blob = buf && typeof Blob === "function" ? new Blob([buf], { type: finalMime }) : raw;
        return {
          ok: true,
          blob,
          name: swapExtForMime(baseName || "粘贴的图片.png", finalMime),
          type: finalMime,
          size: byteLen,
          sniffed: sniffed || finalMime,
          synthetic: true,
        };
      }
    } catch {}
    return null;
  }
  function readFailInfo(source, isImg) {
    if (source === "paste") {
      return {
        msg: isImg
          ? "剪贴板里的图片已失效，请重新复制或直接拖入/选择文件"
          : "剪贴板里的文件已失效，请重新复制或直接拖入/选择文件",
        tag: "已失效",
      };
    }
    return {
      msg: isImg
        ? "无法读取这张图片，可能已被移动或权限受限，请重新选择"
        : "无法读取这个文件，可能已被移动或权限受限，请重新选择",
      tag: "读取失败",
    };
  }
  function friendlyUploadError(err, status, serverErr, hub) {
    const raw = String(serverErr || err?.message || "").trim();
    const hasCJK = /[\u4e00-\u9fff]/.test(raw);
    if (status === 413) return { msg: "文件太大了（最多 25 MB）", tag: "过大", retryable: false };
    if (status === 401 || status === 403) {
      return {
        msg: hub ? `${hub.name} 登录已失效，请在「设备」里重新连接` : "登录已失效，请刷新页面后重试",
        tag: "失败",
        retryable: false,
      };
    }
    if (hasCJK) return { msg: raw, tag: "失败", retryable: true };
    if (status === 408 || status === 504) return { msg: "上传超时，请点重试", tag: "超时", retryable: true };
    if (status === 502 || status === 503) return { msg: "服务正在重启或暂时不可用，请稍后重试", tag: "失败", retryable: true };
    if (status >= 500) return { msg: "服务暂时出错了，请稍后重试", tag: "失败", retryable: true };
    if (status >= 400) return { msg: "上传请求被拒绝，请重试", tag: "失败", retryable: true };
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      return { msg: "网络已断开，连上网络后点重试", tag: "断网", retryable: true };
    }
    if (err?.name === "AbortError" || /timeout|timed out/i.test(raw)) {
      return { msg: "上传超时，请点重试", tag: "超时", retryable: true };
    }
    if (/failed to fetch|load failed|networkerror|network request failed|fetch failed|err_|net::/i.test(raw)) {
      return { msg: "网络中断或服务正在重启，请点重试", tag: "失败", retryable: true };
    }
    return { msg: "上传失败，请稍后重试", tag: "失败", retryable: true };
  }
  const fileErrHint = (files) => files.some((f) => f.err && f.retryable && f.blob)
    ? "有附件没传上去，点重试或移除后再发"
    : "有附件没传上去，移除后再发";

  const hasDragFiles = (dt) => {
    const t = dt?.types;
    if (!t) return false;
    return typeof t.includes === "function" ? t.includes("Files") : Array.from(t).includes("Files");
  };
  function seedUploadedThumbs(files) {
    let added = false;
    for (const f of files || []) {
      if (f?.path && f.isImage && f.blob && !f.thumbFailed && !isUnpreviewableImage(f.mime) && !thumbs.has(f.path)) {
        try {
          thumbs.set(f.path, URL.createObjectURL(f.blob));
          thumbMeta.set(f.path, { size: f.size || 0, machine: f.machine || "", path: f.path });
          added = true;
        } catch {}
      }
    }
    if (added) thumbRenderVer++;
  }

  function bindFiles(form, machine, opts = {}) {
    const box = $(".files", form), picker = $('input[type="file"]', form);
    if (!box || !picker) return;
    form._files = [];
    const iconFor = (f) => (f.isImage ? IMG_SVG : FILE_SVG);
    const draw = () => {
      box.hidden = !form._files.length;
      box.innerHTML = form._files.map((f, i) => {
        const cls = f.err ? "err" : f.path ? "" : "busy";
        const tip = f.err || f.path || "上传中…";
        const status = f.err ? (f.errTag || "失败") : f.path ? fmtSize(f.size) : "上传中";
        const media = (f.thumb && !f.thumbFailed)
          ? `<img class="fi-thumb" src="${f.thumb}" alt="" data-fi="${i}">`
          : iconFor(f);
        const retryBtn = (f.err && f.retryable && f.blob)
          ? `<button type="button" class="retry" data-retry="${i}" title="重新上传" aria-label="重新上传 ${esc(f.name)}">重试</button>`
          : "";
        return `<span class="file ${cls}" title="${esc(tip)}">${media}<span class="fn">${esc(f.name)}</span><span class="fs">${esc(status)}</span>${retryBtn}<button type="button" class="rm" data-rm="${i}" title="移除" aria-label="移除 ${esc(f.name)}">×</button></span>`;
      }).join("");
      opts.onChange?.(form._files);
    };
    const uploadEntry = async (f) => {
      if (f.removed || !f.blob) return;
      f.uploading = true;
      f.err = "";
      f.errTag = "";
      f.retryable = false;
      draw();
      const m = machine();
      f.machine = m || "";
      const up = routeReq(`/api/uploads?name=${encodeURIComponent(f.name)}${m ? "&machine=" + encodeURIComponent(m) : ""}`);
      const ctrl = typeof AbortController === "function" ? new AbortController() : null;
      f.abort = ctrl;
      try {
        const init = {
          method: "POST",
          body: f.blob,
          credentials: up.hub ? "omit" : "same-origin",
          headers: up.hub ? { Authorization: "Bearer " + up.hub.token } : {},
        };
        if (ctrl) init.signal = ctrl.signal;
        const res = await authFetch(up.url, init, !!up.hub);
        if (res.status === 401 && !up.hub) { showLogin(); return; }
        const d = await res.json().catch(() => ({}));
        if (!res.ok) {
          const info = friendlyUploadError(null, res.status, d.error || res.statusText, up.hub);
          if (!f.removed) {
            f.err = info.msg;
            f.errTag = info.tag;
            f.retryable = info.retryable && !!f.blob;
            toast(`${shortFileName(f.name)}：${f.err}`, "attn");
          }
          return;
        }
        if (!f.removed) {
          f.path = d.path;
          if (typeof d.size === "number" && d.size > 0) f.size = d.size;
        }
      } catch (err) {
        if (f.removed) return;
        const info = friendlyUploadError(err, 0, "", up.hub);
        f.err = info.msg;
        f.errTag = info.tag;
        f.retryable = info.retryable && !!f.blob;
        toast(`${shortFileName(f.name)}：${f.err}`, "attn");
      } finally {
        if (f.abort === ctrl) f.abort = null;
        f.uploading = false;
        if (!f.removed) draw();
      }
    };
    const addEntries = (entries, source = "pick") => {
      const now = Date.now();
      let pasteClipReadUsed = false;
      for (const entry of entries) {
        const cands = entry.candidates || [];
        if (!cands.length) continue;
        // Start reading all candidate handles synchronously before the paste/drop
        // event finishes so transient clipboard file handles stay accessible.
        const attempts = cands.map((c) => startReadCandidate(c, source, now));
        const primary = cands.find((c) => c.file && !isSyntheticClipImg(c.file, now))?.file
          || cands[0].file
          || cands[0].prebuilt;
        const f = {
          name: primary?.name || (isImageFile(primary) ? "粘贴的图片.png" : "文件"),
          size: primary?.size || 0,
          isImage: isImageFile(primary),
          thumb: "",
          thumbFailed: false,
          blob: null,
          mime: guessMime(primary),
          machine: "",
          path: "",
          err: "",
          errTag: "",
          retryable: false,
          uploading: true,
          removed: false,
          abort: null,
        };
        f.done = (async () => {
          const results = await Promise.all(attempts);
          if (f.removed) return;
          const good = results.filter((r) => r.ok);
          let winner = good.find((r) => !r.synthetic && r.sniffed)
            || good.find((r) => r.sniffed)
            || good.find((r) => !r.synthetic && !isUnpreviewableImage(r.type))
            || good[0];
          const tooBig = !winner && results.some((r) => r.reason === "too-large");
          if (!winner && !tooBig && source === "paste" && f.isImage && !pasteClipReadUsed) {
            pasteClipReadUsed = true;
            winner = await readClipboardBitmapFallback(f.name);
            if (f.removed) return;
          }
          if (!winner) {
            const info = tooBig
              ? { msg: "文件太大了（最多 25 MB）", tag: "过大" }
              : readFailInfo(source, f.isImage);
            f.err = info.msg;
            f.errTag = info.tag;
            f.retryable = false;
            f.uploading = false;
            toast(`${shortFileName(f.name)}：${f.err}`, "attn");
            draw();
            return;
          }
          f.blob = winner.blob;
          f.size = winner.size;
          f.mime = winner.type;
          f.isImage = (winner.type || "").startsWith("image/") || f.isImage;
          if (winner.synthetic && results.length > 1) {
            f.name = swapExtForMime(f.name, winner.type);
          } else if (winner.name) {
            f.name = winner.name;
          }
          if (f.isImage && !f.thumbFailed && !isUnpreviewableImage(f.mime)) {
            try { f.thumb = URL.createObjectURL(f.blob); } catch { f.thumb = ""; }
          }
          draw();
          await uploadEntry(f);
        })();
        form._files.push(f);
      }
      draw();
    };
    const add = (list, source = "pick") => addEntries(list.map((file) => ({ candidates: [{ file }] })), source);
    $(".attach", form)?.addEventListener("click", () => picker.click());
    picker.addEventListener("change", () => { add([...picker.files], "pick"); picker.value = ""; });
    box.addEventListener("error", (e) => {
      const img = e.target;
      if (!img || img.tagName !== "IMG") return;
      const idx = +(img.dataset?.fi ?? -1);
      const f = form._files[idx];
      if (f) {
        if (f.thumb) { try { URL.revokeObjectURL(f.thumb); } catch {} f.thumb = ""; }
        f.thumbFailed = true;
        draw();
      } else {
        const wrap = document.createElement("span");
        wrap.innerHTML = IMG_SVG;
        if (wrap.firstElementChild) img.replaceWith(wrap.firstElementChild);
      }
    }, true);
    box.addEventListener("click", (e) => {
      const retryBtn = e.target.closest?.("[data-retry]");
      if (retryBtn) {
        const f = form._files[+retryBtn.dataset.retry];
        if (!f || !f.blob || f.uploading) return;
        f.done = uploadEntry(f);
        return;
      }
      const rmBtn = e.target.closest?.("[data-rm]");
      if (!rmBtn) return;
      const [f] = form._files.splice(+rmBtn.dataset.rm, 1);
      if (f) {
        f.removed = true;
        try { f.abort?.abort(); } catch {}
        if (f.thumb) { try { URL.revokeObjectURL(f.thumb); } catch {} f.thumb = ""; }
        f.blob = null;
      }
      draw();
    });
    const ta = opts.input || $("textarea", form);
    ta?.addEventListener("paste", (e) => {
      const dt = e.clipboardData;
      const rawFiles = collectTransferFiles(dt);
      const html = dt?.getData?.("text/html") || "";
      const plain = dt?.getData?.("text/plain") || "";
      const htmlImgs = extractHtmlDataImages(html);
      if (rawFiles.length) {
        e.preventDefault();
        addEntries(buildTransferEntries(rawFiles, htmlImgs, "paste"), "paste");
        return;
      }
      if (!plain.trim() && htmlImgs.length) {
        e.preventDefault();
        addEntries(buildTransferEntries([], htmlImgs, "paste"), "paste");
        return;
      }
      if (!plain.trim() && /<img\b[^>]*\bsrc\s*=/i.test(html)) {
        e.preventDefault();
        toast("剪贴板里的图片已失效或受限，请重新复制或直接拖入/选择文件", "attn");
      }
    });
    form.addEventListener("dragover", (e) => { if (hasDragFiles(e.dataTransfer)) { e.preventDefault(); form.classList.add("drop"); } });
    form.addEventListener("dragleave", (e) => { if (!e.relatedTarget || !form.contains?.(e.relatedTarget)) form.classList.remove("drop"); });
    form.addEventListener("drop", (e) => {
      form.classList.remove("drop");
      const dt = e.dataTransfer;
      const rawFiles = collectTransferFiles(dt);
      const html = dt?.getData?.("text/html") || "";
      const htmlImgs = extractHtmlDataImages(html);
      if (!rawFiles.length && !htmlImgs.length) return;
      e.preventDefault();
      addEntries(buildTransferEntries(rawFiles, htmlImgs, "drop"), "drop");
    });
    form._takeFiles = () => { const taken = form._files; form._files = []; draw(); return taken; };
    form._restoreFiles = (files) => { if (!files?.length) return; form._files = [...files, ...form._files]; draw(); };
    form._revokeFiles = (files) => {
      (files || []).forEach((f) => {
        if (f.thumb) { try { URL.revokeObjectURL(f.thumb); } catch {} f.thumb = ""; }
        f.blob = null;
      });
    };
    form._clearFiles = () => {
      form._files.forEach((f) => { f.removed = true; try { f.abort?.abort(); } catch {} });
      form._revokeFiles(form._files);
      form._files = [];
      draw();
    };
  }
  function formatWithFiles(files, text) {
    if (!files?.length) return text;
    return (text.trim() ? text.trim() + "\n\n" : "") + "附件：\n" + files.map((f) => f.path).join("\n");
  }
  async function withFiles(files, text) {
    if (!files?.length) return text;
    await Promise.all(files.map((f) => f.done));
    if (files.some((f) => f.err)) throw new Error(fileErrHint(files));
    return formatWithFiles(files, text);
  }
  // Images a Collie message points at (a screenshot a worker took) show
  // under it, so you need not open each one.
  const IMG_PATH = /(?:^|[\s(（`"'：:，、,;；>])((?:~|\/)[^\s`"'()（）<>，、,;；]*\.(?:png|jpe?g|gif|webp|svg))(?=$|[\s)）`"'，。、,;；!?！？])/gim;
  function imagesIn(t) {
    const clean = String(t || "").replace(/```[\s\S]*?```/g, " ").replace(/!\[[^\]\n]*\]\([^)\n]+\)/g, " ");
    const ps = [...new Set([...clean.matchAll(IMG_PATH)].map((m) => m[1]))].slice(0, 6);
    return ps.length ? `<span class="thumbs">${ps.map(thumbBtn).join("")}</span>` : "";
  }
  // Markdown as one plain line, for quotes: no marks, list dashes or breaks.
  const plainLine = (t) => (t || "").split("\n").map((l) => l.replace(/^\s*(?:[-*+]|\d+\.|#+|>)\s+/, "").trim()).filter(Boolean).join(" ")
    .replace(/\\([!"#$%&'()*+,\-.\/:;<=>?@\[\\\]^_`{|}~])/g, "$1")
    .replace(/\*\*|__|`/g, "").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
  // A user message's attachments: images as thumbnails, other files by name
  // (not server paths).
  const linkUserFiles = (escaped) => escaped.replace(FILE_RE, (_, pre, p) => `${pre}<a ${fileLinkAttrs(unesc(p), p, "打开这个文件")}>${p}</a>`);
  function userText(t) {
    const i = t.lastIndexOf("附件：\n");
    if (i < 0) return withImages(linkUserFiles(esc(t)));
    const paths = t.slice(i + 4).split("\n").map((p) => p.trim()).filter(Boolean);
    const imgs = paths.filter((p) => IMG_EXT.test(p)), rest = paths.filter((p) => !IMG_EXT.test(p));
    const name = (p) => p.split("/").pop().replace(/^[0-9a-f]{6}-/, "");
    return withImages(linkUserFiles(esc(t.slice(0, i).trimEnd())))
      + (imgs.length ? `<span class="thumbs">${imgs.map(thumbBtn).join("")}</span>` : "")
      + (rest.length ? `<span class="att">${rest.map((p) => `<a ${fileLinkAttrs(p, esc(p), esc(p))}>📎 ${esc(name(p))}</a>`).join("")}</span>` : "");
  }

  function bindComposer(form, input, send, machine, opts = {}) {
    if (!form || !input) return null;
    const growFn = opts.grow || grow;
    const btn = opts.sendBtn || $(".send", form);
    let sending = false;
    const syncBtn = () => {
      if (opts.syncSendBtn) opts.syncSendBtn(sending);
      else if (btn) btn.disabled = sending;
    };
    if (machine) {
      bindFiles(form, machine, {
        input,
        onChange: (files) => {
          syncBtn();
          opts.onFilesChange?.(files);
        },
      });
    }
    input.addEventListener("input", () => { growFn(input); syncBtn(); });
    input.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" || e.shiftKey || e.isComposing || e.keyCode === 229) return;
      const mod = e.metaKey || e.ctrlKey;
      // "mod": Enter makes a new line and ⌘/Ctrl+Enter sends.
      if (prefs.sendKey() === "mod" ? mod : !mod) {
        e.preventDefault();
        if (e.repeat || sending || btn?.disabled) return;
        form.requestSubmit();
      }
    });
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (sending) return;
      const curFiles = form._files || [];
      if (curFiles.some((f) => f.err)) {
        toast(fileErrHint(curFiles), "attn");
        return;
      }
      const draft = input.value;
      if (!opts.allowEmpty && !draft.trim() && !curFiles.length) return;
      let ctx;
      if (opts.beforeSend) {
        ctx = opts.beforeSend();
        if (ctx === false) return;
      }
      sending = true;
      syncBtn();
      const files = form._takeFiles ? form._takeFiles() : [];
      input.value = "";
      growFn(input);
      try {
        const text = !files.length
          ? (opts.trim ? draft.trim() : draft)
          : files.every((f) => f.path && !f.uploading && !f.err)
            ? formatWithFiles(files, draft)
            : await withFiles(files, draft);
        seedUploadedThumbs(files);
        await send(text, ctx);
        form._revokeFiles?.(files);
      } catch (err) {
        if (draft) {
          input.value = input.value ? draft + "\n" + input.value : draft;
          growFn(input);
        }
        form._restoreFiles?.(files);
        opts.onError?.(ctx);
        toast(err.message, "attn");
      } finally {
        sending = false;
        syncBtn();
      }
    });
    syncBtn();
    return { isSending: () => sending, syncBtn };
  }

  bindComposer($("#composer"), $("#input"), async (text) => {
    if (!current) return;
    let v = find(current);
    if (!v) {
      // The page may be behind (e.g. the hub restarted); look again before giving up.
      try { setLocalState(await api("/api/state")); renderSide(); } catch {}
      v = find(current) || { pane_id: current, is_agent: false };
    }
    if (!text.trim()) { sendKeys(["enter"]); return; }
    try {
      if (v.is_agent) await api(`/api/agents/${encodeURIComponent(current)}/prompt`, { body: { text } });
      else await api(paneURL(current, "text"), { body: { text, enter: true } });
    } catch (err) {
      throw new Error(err.message.includes("blocked") ? "agent 正在等你确认，先处理上面的确认卡片" : err.message);
    }
  }, () => (current || "").includes("@") ? current.slice(current.lastIndexOf("@") + 1) : "", { allowEmpty: true });

  // ───────────────────────────── menus
  document.addEventListener("click", (e) => {
    const opener = e.target.closest("[data-menu]");
    $$(".menu").forEach((m) => { if (!opener || m.id !== opener.dataset.menu) m.hidden = true; });
    if (opener) {
      closeCollieThreadsPop();
      const m = $("#" + opener.dataset.menu);
      m.hidden = !m.hidden;
    }
  });

  document.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-act]");
    const act = btn?.dataset.act;
    if (!act) return;
    const v = find(current);
    try {
      if (act === "interrupt") sendKeys(["ctrl+c"]);
      if (act === "copy" && v) { await copy(v.pane_id); toast("已复制 " + v.pane_id); }
      if (act === "shell-here" && v) {
        const r = await api("/api/agents", { body: { kind: "shell", cwd: v.cwd, machine: v.machine || "" } });
        location.hash = "#/p/" + encodeURIComponent(r.pane_id);
      }
      if (act === "close" && v) {
        if (!confirm(`关闭工作区「${v.workspace_label || v.workspace_id}」？里面的进程会被结束。`)) return;
        await api(`/api/workspaces/${encodeURIComponent(v.workspace_id)}/close`, { method: "POST", body: {} });
        state = { ...state, agents: state.agents.filter((a) => a.workspace_id !== v.workspace_id), shells: state.shells.filter((a) => a.workspace_id !== v.workspace_id) };
        if (store.get("last") === location.hash) store.set("last", "#/collie");
        goBack(true);
      }
      if (act === "router-open") {
        const p = paneOf(ROUTER);
        if (p) location.hash = "#/p/" + encodeURIComponent(p); else toast("Collie 还在休眠；发一条消息就会唤醒它");
      }
      if (act === "router-restart") {
        if (!confirm("重启 Collie？它会读自己的记忆恢复上下文，排队的消息不会丢。")) return;
        await api("/api/super/router/restart", { method: "POST", body: {} });
        toast("Collie 正在重启");
      }
      if (act === "router-restart-apply") {
        if (isRouterBusy() && !confirm("Collie 当前正在处理任务，现在重启会中断当前一轮，但记忆和排队中的消息不会丢。确定立即重启生效吗？")) return;
        btn.disabled = true;
        try {
          await api("/api/super/router/restart", { method: "POST", body: {} });
          toast("Collie 正在重启应用新设置");
          api("/api/super").then((d) => {
            sup = normSup(d);
            renderSide();
            renderRouterPendingBars();
            if (view === "collie") renderSuper();
          }).catch(() => {});
        } finally {
          btn.disabled = false;
        }
      }
      if (act === "logout") {
        await doLogout();
      }
      if (act === "test-notify") {
        sendTestNotification();
      }
      if (act === "pause") {
        const cur = (await api("/api/super/settings")).settings;
        await api("/api/super/settings", { body: { settings: { ...cur, paused: !cur.paused } } });
        toast(cur.paused ? "已恢复投递" : "已暂停投递");
      }
      if (act === "auto") location.hash = "#/auto";
    } catch (err) { toast(err.message, "attn"); }
  });

  // ───────────────────────────── launcher
  const sheet = $("#launch");
  const cwdInput = $("#l-cwd");
  const nameInput = $("#l-name");
  let nameTouched = false;

  function suggestName() {
    if (!nameTouched) nameInput.value = "";
    // A terminal needs only a computer and a folder.
    const shell = $("input[name=kind]:checked")?.value === "shell";
    $$("#launch .agent-only").forEach((f) => f.hidden = shell);
    $("#launch-go").textContent = shell ? "打开" : "启动";
    if (!shell) fillLaunchModels();
  }
  // Model and effort for a new agent: "" leaves it to the agent's own settings
  // on that computer (what it would run if started by hand).
  let launchSeq = 0;
  async function fillLaunchModels() {
    const seq = ++launchSeq, kind = $("input[name=kind]:checked")?.value;
    const mSel = $("#l-model");
    const keep = { model: mSel.value, effort: $("#l-effort").value, key: mSel._key };
    const info = await modelsFor(kind, pickMachine);
    if (seq !== launchSeq) return;
    const same = keep.key === kind + "@" + pickMachine;
    mSel._key = kind + "@" + pickMachine;
    const list = info.models || [];
    const def = defaultModelName(info);
    mSel.innerHTML = `<option value="" data-short="${esc(def ? "默认 · " + def : "默认模型")}" data-sub="${esc(def ? "现在是 " + def : "agent 自己的设置")}">默认${def ? "（" + esc(def) + "）" : ""}</option>` +
      list.map((m) => `<option value="${esc(m.id)}" data-sub="${esc(m.label && m.label !== m.id ? m.id : "")}">${esc(m.label || m.id)}</option>`).join("");
    mSel.value = same && list.some((m) => m.id === keep.model) ? keep.model : "";
    fillLaunchEfforts(info, same ? keep.effort : "");
    syncPick(mSel);
  }
  function fillLaunchEfforts(info, want) {
    const kind = $("input[name=kind]:checked")?.value || "";
    const model = $("#l-model").value;
    const eSel = $("#l-effort");
    const effs = effortsFor(info, kind, model);
    const defE = effs.includes(info.default_effort) ? info.default_effort : "";
    eSel.innerHTML = `<option value="" data-short="思考 · ${esc(EFFORT_LABEL[defE] || defE || "默认")}">默认（${esc(EFFORT_LABEL[defE] || defE || "agent 自己定")}）</option>` +
      effs.map((e) => `<option value="${esc(e)}" data-short="思考 · ${esc(EFFORT_LABEL[e] || e)}">${esc(EFFORT_LABEL[e] || e)}</option>`).join("");
    eSel.value = effs.includes(want) ? want : "";
    const hide = effs.length === 0;
    eSel.hidden = hide;
    eSel.disabled = hide;
    if (hide && pickOpen === eSel) closePick();
    syncPick(eSel);
  }
  $("#l-model").addEventListener("change", async () => {
    fillLaunchEfforts(await modelsFor($("input[name=kind]:checked").value, pickMachine), $("#l-effort").value);
  });
  let pickMachine = "";
  const recentKey = () => dirRecentKey(pickMachine);
  const launchDirCtrl = enhanceDirInput(cwdInput, { getMachine: () => pickMachine });
  function renderMachinePick() {
    const ms = (state.machines || []).filter((m) => m.local ? state.ok : m.online);
    $("#l-machine-field").hidden = ms.length < 2;
    if (!ms.some((m) => m.id === pickMachine)) pickMachine = ms[0]?.id || "";
    $("#l-machines").innerHTML = ms.map((m) => `<button type="button" class="${m.id === pickMachine ? "on" : ""}" data-m="${esc(m.id)}">
      <span class="dot online"></span>${esc(m.name)}${m.local ? "<small>hub</small>" : ""}</button>`).join("");
    markKinds();
  }
  // Agents the chosen computer doesn't have can't be picked.
  function markKinds() {
    const have = (state.machines || []).find((m) => m.id === pickMachine)?.agents;
    for (const r of $$("input[name=kind]")) {
      const k = r.value === "antigravity" ? "agy" : r.value;
      const card = r.closest(".kind-card"), small = card.querySelector("small");
      small.dataset.cmd ||= small.textContent;
      const missing = Array.isArray(have) && k in AGENT_LABEL && !have.includes(k);
      r.disabled = missing;
      card.classList.toggle("missing", missing);
      card.title = missing ? "这台电脑上没装 " + AGENT_LABEL[k] : "";
      small.textContent = missing ? "没装" : small.dataset.cmd;
    }
    if ($("input[name=kind]:checked")?.disabled) {
      const first = $$("input[name=kind]").find((r) => !r.disabled);
      if (first) { first.checked = true; first.dispatchEvent(new Event("change")); }
    }
  }
  function resetDir() {
    const recent = store.get(recentKey(), []);
    cwdInput.value = recent[0] || "~";
    launchDirCtrl?.refresh();
  }
  $("#l-machines").addEventListener("click", (e) => {
    const b = e.target.closest("[data-m]");
    if (!b) return;
    pickMachine = b.dataset.m;
    store.set("machine", pickMachine);
    renderMachinePick();
    resetDir();
    suggestName();
  });
  function openLauncher() {
    nameTouched = false;
    $("#launch-error").textContent = "";
    $("#l-prompt").value = "";
    pickMachine = store.get("machine", "");
    renderMachinePick();
    const recent = store.get(recentKey(), []);
    cwdInput.value = recent[0] || "~";
    const radio = $(`input[name=kind][value="${store.get("kind", "claude")}"]`);
    if (radio && !radio.disabled) radio.checked = true;
    markKinds();
    suggestName();
    launchDirCtrl?.close();
    sheet.showModal();
    if (prefs.notify() && "Notification" in window && Notification.permission === "default") Notification.requestPermission();
  }
  sheet.addEventListener("close", () => { closePick(); launchDirCtrl?.close(); });
  $("#new-btn").addEventListener("click", openLauncher);
  $$("input[name=kind]").forEach((r) => r.addEventListener("change", suggestName));
  nameInput.addEventListener("input", () => { nameTouched = true; });
  $("#launch-form").addEventListener("submit", async (e) => {
    if (e.submitter?.value !== "go") return;
    e.preventDefault();
    launchDirCtrl?.close();
    const kind = $("input[name=kind]:checked").value;
    const shell = kind === "shell";
    const body = shell ? { kind, cwd: cwdInput.value.trim(), machine: pickMachine }
      : { kind, name: nameInput.value.trim(), cwd: cwdInput.value.trim(), prompt: $("#l-prompt").value, machine: pickMachine,
          model: $("#l-model").value, effort: $("#l-effort").disabled ? "" : $("#l-effort").value };
    const go = $("#launch-go");
    go.disabled = true; go.textContent = shell ? "打开中…" : "启动中…";
    $("#launch-error").textContent = "";
    try {
      const r = await api("/api/agents", { body });
      store.set("kind", body.kind);
      recordRecentDir(pickMachine, body.cwd);
      sheet.close();
      if (r.warning) toast(r.warning, "attn");
      location.hash = "#/p/" + encodeURIComponent(r.pane_id);
    } catch (err) { $("#launch-error").textContent = err.message; }
    finally { go.disabled = false; go.textContent = shell ? "打开" : "启动"; }
  });

  // ───────────────────────────── viewport (mobile keyboard)
  // The app fills the visible area: its height shrinks above the keyboard, and
  // it follows the visible area when the browser scrolls the page for it.
  function setVH() {
    const v = window.visualViewport;
    const root = document.documentElement.style;
    // Chats and terminals that were showing their latest lines keep showing them as the keyboard takes space.
    const screenPinned = curMode() === "screen" && !!term?.buffer?.active && screenNearBottom();
    const pinned = [...document.querySelectorAll(".viewer, #log, #td-body")].filter((el) => el.offsetParent && el.scrollHeight - el.scrollTop - el.clientHeight <= AT_BOTTOM_PX);
    root.setProperty("--vh", (v ? v.height : innerHeight) + "px");
    pinned.forEach((el) => { el.scrollTop = el.scrollHeight; });
    if (screenPinned) { fitTerm(); term?.scrollToBottom?.(); }
    root.setProperty("--vtop", (v ? Math.max(0, v.offsetTop) : 0) + "px");
  }
  window.visualViewport?.addEventListener("resize", setVH);
  window.visualViewport?.addEventListener("scroll", setVH);
  addEventListener("resize", setVH);
  setVH();

  // ───────────────────────────── boot
  function stripLarkJumpParams() {
    if (!location.search) return;
    const q = new URLSearchParams(location.search);
    let dirty = false;
    for (const k of ["lk_mobile_jump_to_browser", "lk_jump_to_browser"]) {
      if (q.has(k)) { q.delete(k); dirty = true; }
    }
    if (!dirty) return;
    const rest = q.toString();
    history.replaceState(history.state, "", location.pathname + (rest ? "?" + rest : "") + location.hash);
  }
  async function boot() {
    stripLarkJumpParams();
    const q = new URLSearchParams(location.search);
    const t = q.get("t"), code = q.get("pair");
    if (t || code) {
      try { if (code) await pair(code); else await login(t); }
      catch (err) {
        if (code) {
          loginPairFailed = true;
          $("#login-error").textContent = err.message;
        }
      }
      q.delete("t"); q.delete("pair");
      const rest = q.toString();
      history.replaceState(history.state, "", location.pathname + (rest ? "?" + rest : "") + location.hash);
    }
    try { await api("/api/session"); } catch { return; }
    loginPairFailed = false;
    $("#login-error").textContent = "";
    syncLoginTip();
    try { sup = normSup(await api("/api/super")); syncCollieNotifyWatermark(sup.entries, false); } catch {}
    try { setLocalState(await api("/api/state")); } catch {}
    await loadHubs();
    checkUpdates();
    $("#login").hidden = true;
    $("#app").hidden = false;
    setMode(mode);
    connect();
    booted = false;
    view = undefined;
    route();
    booted = true;
    loadExternal();
    clearInterval(extTimer);
    loadHistory();
    // The hub answers the list from its own copy, so this is cheap.
    let tick = 0;
    extTimer = setInterval(() => { loadExternal(); if (++tick % 3 === 0) loadHistory(); }, 3000);
    offerLocalApp();
  }

  // On a computer that serves Collie at 127.0.0.1 (a node, or the hub's own
  // machine), offer to switch there: Chrome installs and opens it as an app
  // only on a secure origin, which the LAN address is not.
  async function offerLocalApp() {
    const local = ["127.0.0.1", "localhost", "[::1]"].includes(location.hostname);
    if (local || !matchMedia("(pointer: fine)").matches || store.get("local-app-off", false)) return;
    let r;
    try { r = await api("/api/local-app"); } catch { return; }
    if (!r.url) return;
    $("#local-app").hidden = false;
    $("#local-app-open").title = r.url;
    $("#local-app-open").onclick = async (e) => {
      e.preventDefault();
      try {
        // A one-time code signs the new address in, like scanning a QR code.
        const p = await api("/api/pair/new", { body: { kind: "browser" } });
        location.href = `${r.url}/?pair=${encodeURIComponent(p.code)}${location.hash}`;
      } catch (err) { toast(err.message, "attn"); }
    };
    $("#local-app-x").onclick = () => { store.set("local-app-off", true); $("#local-app").hidden = true; };
  }
  boot();
})();
