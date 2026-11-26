package collie

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net"
	"net/http/httptest"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"testing/fstest"
	"time"
)

func TestSuperSayClientMsgIDAndRouterTurnKind(t *testing.T) {
	dir := t.TempDir()
	db, err := openDB(filepath.Join(dir, "herd.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	st, err := loadState(db, dir)
	if err != nil {
		t.Fatal(err)
	}
	herdr := newHerdr(filepath.Join(dir, "missing-herdr.sock"), "devbox", dir)
	herdr.local.conn.dial = func(context.Context) (net.Conn, error) { return nil, errors.New("offline") }
	srv := &Server{
		herdr: herdr,
		token: "test-tok",
		home:  dir,
		web:   fstest.MapFS{},
		auths: newAuth(db, "test-tok"),
	}
	sp := &Super{s: srv, db: db, dir: dir, st: st, subs: map[chan struct{}]bool{}}
	srv.sup = sp
	handler := srv.Routes()

	// Seed a Collie message to quote.
	eCollie := sp.addEntryLocked("collie", mainThread, "准备发版 v0.2.80 吗？", "", "")

	// 1) POST /api/super/say echoes client_msg_id onto the persisted Entry in superState.
	payload, _ := json.Marshal(map[string]any{
		"text":          "可以，直接推进",
		"re":            eCollie.ID,
		"client_msg_id": "cid-quote-race-001",
	})
	req := httptest.NewRequest("POST", "/api/super/say", bytes.NewReader(payload))
	req.Header.Set("Authorization", "Bearer test-tok")
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != 200 {
		t.Fatalf("POST /api/super/say = %d: %s", rec.Code, rec.Body.String())
	}
	var sayResp struct {
		Entry string `json:"entry"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &sayResp); err != nil || sayResp.Entry == "" {
		t.Fatalf("invalid say response: %s (%v)", rec.Body.String(), err)
	}

	// Verify Entry carries ClientMsgID both in memory and in /api/super JSON snapshot.
	snapReq := httptest.NewRequest("GET", "/api/super", nil)
	snapReq.Header.Set("Authorization", "Bearer test-tok")
	snapRec := httptest.NewRecorder()
	handler.ServeHTTP(snapRec, snapReq)
	if snapRec.Code != 200 {
		t.Fatalf("GET /api/super = %d: %s", snapRec.Code, snapRec.Body.String())
	}
	var snap superView
	if err := json.Unmarshal(snapRec.Body.Bytes(), &snap); err != nil {
		t.Fatalf("decode superView: %v", err)
	}
	found := false
	for _, e := range snap.Entries {
		if e.ID == sayResp.Entry {
			found = true
			if e.ClientMsgID != "cid-quote-race-001" {
				t.Fatalf("entry %s ClientMsgID = %q, want cid-quote-race-001", e.ID, e.ClientMsgID)
			}
			if e.Re == nil || e.Re.Entry != eCollie.ID {
				t.Fatalf("entry %s Re = %+v, want Entry=%s", e.ID, e.Re, eCollie.ID)
			}
		}
	}
	if !found {
		t.Fatalf("entry %s missing from /api/super", sayResp.Entry)
	}

	// 2) Router TurnKind distinguishes background worker/timer turns vs human chat turns.
	sp.mu.Lock()
	sp.routerLaunching = true
	sp.st.Triggers = []*Trigger{
		{ID: "t1", Source: "worker", Thread: mainThread, Status: "queued", Text: "worker finished"},
	}
	sp.routerAskedAt = time.Now()
	sp.routerAskedChat = false
	sp.mu.Unlock()
	vBg := srv.superState(context.Background())
	if vBg.Router.TurnKind != "background" {
		t.Fatalf("background turn TurnKind = %q, want background", vBg.Router.TurnKind)
	}

	sp.mu.Lock()
	sp.routerAskedChat = true
	sp.mu.Unlock()
	vChat := srv.superState(context.Background())
	if vChat.Router.TurnKind != "chat" {
		t.Fatalf("chat turn TurnKind = %q, want chat", vChat.Router.TurnKind)
	}

	// Queued chat trigger while starting also marks TurnKind="chat".
	sp.mu.Lock()
	sp.routerAskedAt = time.Time{}
	sp.routerAskedChat = false
	sp.st.Triggers = []*Trigger{
		{ID: "t2", Source: "chat", Thread: mainThread, Status: "queued", Text: "hi"},
	}
	sp.mu.Unlock()
	vQueuedChat := srv.superState(context.Background())
	if vQueuedChat.Router.TurnKind != "chat" {
		t.Fatalf("queued chat trigger TurnKind = %q, want chat", vQueuedChat.Router.TurnKind)
	}
}

func TestTypingIncrementalDomQuoteBusyAndWidenJS(t *testing.T) {
	nodeBin, err := exec.LookPath("node")
	if err != nil {
		t.Skip("node not installed")
	}
	root := filepath.Join("..", "..")
	jsTest := `
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert/strict");

const appSrc = fs.readFileSync(path.join(process.argv[1], "web", "app.js"), "utf8");
const cssSrc = fs.readFileSync(path.join(process.argv[1], "web", "app.css"), "utf8");
const htmlSrc = fs.readFileSync(path.join(process.argv[1], "web", "index.html"), "utf8");

// Contract checks for HTML/CSS layout & responsive constraints.
const locatePos = htmlSrc.indexOf('id="td-locate-root"');
const widenPos = htmlSrc.indexOf('id="td-widen"');
const closePos = htmlSrc.indexOf('id="td-close"');
assert.ok(locatePos > 0 && widenPos > locatePos && closePos > widenPos, "#td-widen sits immediately left of #td-close");
assert.ok(/@media\s*\(max-width:\s*1000px\)[\s\S]*?\.td-widen\s*\{\s*display:\s*none;\s*\}/.test(cssSrc), ".td-widen hidden at <=1000px");
assert.ok(cssSrc.includes("content-visibility: auto") && cssSrc.includes("contain-intrinsic-size: auto none auto 7rem"), "off-screen chat rows use content-visibility: auto with contain-intrinsic-size");

// Minimal real DOM-tree engine so canPatchSuperDom(box) === true (live browser path!).
const VOID_TAGS = new Set(["IMG", "INPUT", "BR", "HR", "META", "LINK", "PATH", "CIRCLE", "RECT", "ELLIPSE"]);

function unescAttr(s) {
  return String(s || "").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}
function escAttr(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function camelToDataAttr(prop) {
  return "data-" + String(prop).replace(/[A-Z]/g, (m) => "-" + m.toLowerCase());
}
function dataAttrToCamel(attr) {
  return attr.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

class TextNode {
  constructor(text) {
    this.nodeType = 3;
    this.textContent = String(text ?? "");
    this.parentNode = null;
  }
  get outerHTML() { return this.textContent; }
}

class DomNode {
  constructor(tag = "DIV", id = "") {
    this.nodeType = tag === "#fragment" ? 11 : 1;
    this.tagName = String(tag).toUpperCase();
    this.childNodes = [];
    this.parentNode = null;
    this._attrs = new Map();
    this._listeners = new Map();
    this._classes = new Set();
    this._qs = {};
    this.hidden = false;
    this.disabled = false;
    this.checked = false;
    this.value = "";
    this.scrollTop = 0;
    this.scrollLeft = 0;
    this.scrollHeight = 400;
    this.clientHeight = 400;
    this.offsetWidth = 260;
    this.offsetHeight = 600;
    this.offsetParent = {};
    this.isConnected = true;
    this._styleProps = new Map();
    const self = this;
    this.style = {
      height: "",
      opacity: "",
      transform: "",
      top: "",
      overflow: "",
      setProperty(k, v) { self._styleProps.set(k, String(v)); },
      getPropertyValue(k) { return self._styleProps.get(k) || ""; },
      removeProperty(k) { self._styleProps.delete(k); },
    };
    this.classList = {
      add: (...cs) => { for (const c of cs) if (c) self._classes.add(c); self._syncClassAttr(); },
      remove: (...cs) => { for (const c of cs) self._classes.delete(c); self._syncClassAttr(); },
      toggle: (c, f) => {
        const on = f === undefined ? !self._classes.has(c) : !!f;
        if (on) self._classes.add(c); else self._classes.delete(c);
        self._syncClassAttr();
        return on;
      },
      contains: (c) => self._classes.has(c),
      toString: () => [...self._classes].join(" "),
    };
    this.dataset = new Proxy({}, {
      get(_, prop) {
        if (typeof prop !== "string") return undefined;
        return self._attrs.get(camelToDataAttr(prop));
      },
      set(_, prop, val) {
        self._attrs.set(camelToDataAttr(prop), String(val));
        return true;
      },
      deleteProperty(_, prop) {
        self._attrs.delete(camelToDataAttr(prop));
        return true;
      },
      has(_, prop) {
        return typeof prop === "string" && self._attrs.has(camelToDataAttr(prop));
      },
    });
    if (id) this.setAttribute("id", id);
    if (this.tagName === "TEMPLATE") {
      this.content = new DomNode("#fragment");
    }
  }
  _syncClassAttr() {
    const s = [...this._classes].join(" ");
    if (s) this._attrs.set("class", s);
    else this._attrs.delete("class");
  }
  get id() { return this._attrs.get("id") || ""; }
  set id(v) { if (v) this._attrs.set("id", String(v)); else this._attrs.delete("id"); }
  get title() { return this._attrs.get("title") || ""; }
  set title(v) { if (v) this._attrs.set("title", String(v)); else this._attrs.delete("title"); }
  get className() { return [...this._classes].join(" "); }
  set className(v) {
    this._classes.clear();
    for (const c of String(v || "").split(/\s+/).filter(Boolean)) this._classes.add(c);
    this._syncClassAttr();
  }
  get parentElement() { return this.parentNode && this.parentNode.nodeType === 1 ? this.parentNode : null; }
  set parentElement(v) { this.parentNode = v; }
  get children() { return this.childNodes.filter((n) => n.nodeType === 1); }
  get firstChild() { return this.childNodes[0] || null; }
  get firstElementChild() { return this.childNodes.find((n) => n.nodeType === 1) || null; }
  get nextElementSibling() {
    if (!this.parentNode) return null;
    const sibs = this.parentNode.childNodes;
    const idx = sibs.indexOf(this);
    if (idx < 0) return null;
    for (let i = idx + 1; i < sibs.length; i++) if (sibs[i].nodeType === 1) return sibs[i];
    return null;
  }
  setAttribute(k, v) {
    const key = String(k).toLowerCase();
    const val = String(v);
    if (key === "class") { this.className = val; return; }
    this._attrs.set(key, val);
  }
  getAttribute(k) { return this._attrs.get(String(k).toLowerCase()) ?? null; }
  removeAttribute(k) {
    const key = String(k).toLowerCase();
    if (key === "class") this._classes.clear();
    this._attrs.delete(key);
  }
  hasAttribute(k) { return this._attrs.has(String(k).toLowerCase()); }
  _detach(node) {
    if (node.parentNode) {
      const arr = node.parentNode.childNodes;
      const i = arr.indexOf(node);
      if (i >= 0) arr.splice(i, 1);
      node.parentNode = null;
    }
  }
  appendChild(node) {
    if (node.nodeType === 11) {
      const kids = [...node.childNodes];
      for (const k of kids) this.appendChild(k);
      return node;
    }
    this._detach(node);
    this.childNodes.push(node);
    node.parentNode = this;
    return node;
  }
  insertBefore(node, ref) {
    if (!ref) return this.appendChild(node);
    if (node.nodeType === 11) {
      const kids = [...node.childNodes];
      for (const k of kids) this.insertBefore(k, ref);
      return node;
    }
    this._detach(node);
    const idx = this.childNodes.indexOf(ref);
    if (idx < 0) this.childNodes.push(node);
    else this.childNodes.splice(idx, 0, node);
    node.parentNode = this;
    return node;
  }
  replaceChild(next, old) {
    const idx = this.childNodes.indexOf(old);
    if (idx < 0) return old;
    this._detach(next);
    old.parentNode = null;
    this.childNodes[idx] = next;
    next.parentNode = this;
    return old;
  }
  removeChild(old) {
    const idx = this.childNodes.indexOf(old);
    if (idx >= 0) {
      this.childNodes.splice(idx, 1);
      old.parentNode = null;
    }
    return old;
  }
  append(...nodes) { for (const n of nodes) this.appendChild(typeof n === "string" ? new TextNode(n) : n); }
  remove() { this._detach(this); }
  contains(target) {
    let cur = target;
    while (cur) { if (cur === this) return true; cur = cur.parentNode; }
    return false;
  }
  get textContent() {
    if (!this.childNodes.length && this._textFallback !== undefined) return this._textFallback;
    return this.childNodes.map((n) => n.textContent).join("");
  }
  set textContent(v) {
    this.childNodes = [];
    const s = String(v ?? "");
    this._textFallback = s;
    if (s) this.appendChild(new TextNode(s));
  }
  get outerHTML() {
    if (this.nodeType === 11) return this.childNodes.map((n) => n.outerHTML).join("");
    const tag = this.tagName.toLowerCase();
    let attrs = "";
    for (const [k, v] of this._attrs) attrs += " " + k + '="' + escAttr(v) + '"';
    if (VOID_TAGS.has(this.tagName)) return "<" + tag + attrs + ">";
    return "<" + tag + attrs + ">" + this.childNodes.map((n) => n.outerHTML).join("") + "</" + tag + ">";
  }
  get innerHTML() {
    const target = this.tagName === "TEMPLATE" ? this.content : this;
    return target.childNodes.map((n) => n.outerHTML).join("");
  }
  set innerHTML(html) {
    if (this._onInnerWrite) this._onInnerWrite(html);
    const target = this.tagName === "TEMPLATE" ? this.content : this;
    target.childNodes = [];
    parseHtmlInto(String(html || ""), target);
  }
  matches(sel) {
    for (const rawPart of String(sel).split(",")) {
      let part = rawPart.trim();
      if (!part) continue;
      if (part.startsWith(":scope >")) part = part.slice(8).trim();
      if (matchSimple(this, part)) return true;
    }
    return false;
  }
  closest(sel) {
    let cur = this;
    while (cur && cur.nodeType === 1) {
      if (cur.matches(sel)) return cur;
      cur = cur.parentNode;
    }
    return null;
  }
  querySelectorAll(sel) {
    const parts = String(sel).split(",").map((s) => s.trim()).filter(Boolean);
    const out = [];
    const directOnly = parts.every((p) => p.startsWith(":scope >"));
    const walk = (node, depth) => {
      for (const ch of node.childNodes) {
        if (ch.nodeType !== 1) continue;
        if ((!directOnly || depth === 0) && parts.some((p) => matchSimple(ch, p.replace(/^:scope\s*>\s*/, "")))) {
          out.push(ch);
        }
        if (!directOnly) walk(ch, depth + 1);
      }
    };
    walk(this, 0);
    return out;
  }
  querySelector(sel) {
    if (this._qs[sel]) return this._qs[sel];
    const hit = this.querySelectorAll(sel)[0];
    return hit || null;
  }
  addEventListener(type, fn) {
    if (!this._listeners.has(type)) this._listeners.set(type, []);
    this._listeners.get(type).push(fn);
  }
  removeEventListener(type, fn) {
    const list = this._listeners.get(type);
    if (!list) return;
    const i = list.indexOf(fn);
    if (i >= 0) list.splice(i, 1);
  }
  dispatch(type, ev = {}) {
    const e = {
      type,
      target: ev.target || this,
      currentTarget: this,
      defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true; },
      stopPropagation() {},
      composedPath: () => [ev.target || this, this],
      ...ev,
    };
    for (const fn of [...(this._listeners.get(type) || [])]) fn(e);
    return e;
  }
  focus() { doc.activeElement = this; }
  blur() { if (doc.activeElement === this) doc.activeElement = null; this.dispatch("blur", {}); }
  requestSubmit() { this.dispatch("submit", {}); }
  click() { this.dispatch("click", {}); }
  getBoundingClientRect() { return { top: 0, bottom: 40, left: 0, right: 700, width: 700, height: 40 }; }
  scrollTo(opts) { this.scrollTop = typeof opts === "object" ? opts.top : opts; return Promise.resolve(); }
}

function matchSimple(el, sel) {
  // Handle simple descendant combinators like ".msg .re" or single compound selectors like ".msg.user[data-id=\"e1\"]"
  const tokens = sel.trim().split(/\s+/);
  const last = tokens[tokens.length - 1];
  if (!matchCompound(el, last)) return false;
  if (tokens.length === 1) return true;
  let cur = el.parentNode;
  for (let i = tokens.length - 2; i >= 0; i--) {
    let ok = false;
    while (cur && cur.nodeType === 1) {
      if (matchCompound(cur, tokens[i])) { ok = true; cur = cur.parentNode; break; }
      cur = cur.parentNode;
    }
    if (!ok) return false;
  }
  return true;
}

function matchCompound(el, sel) {
  let rest = sel;
  const tagM = rest.match(/^[a-zA-Z][a-zA-Z0-9-]*/);
  if (tagM) {
    if (el.tagName !== tagM[0].toUpperCase()) return false;
    rest = rest.slice(tagM[0].length);
  }
  while (rest.length) {
    if (rest[0] === "#") {
      const m = rest.match(/^#([a-zA-Z0-9_-]+)/);
      if (!m || el.id !== m[1]) return false;
      rest = rest.slice(m[0].length);
    } else if (rest[0] === ".") {
      const m = rest.match(/^\.([a-zA-Z0-9_-]+)/);
      if (!m || !el._classes.has(m[1])) return false;
      rest = rest.slice(m[0].length);
    } else if (rest[0] === "[") {
      const m = rest.match(/^\[([a-zA-Z0-9_-]+)(?:="([^"]*)")?\]/);
      if (!m) return false;
      const got = el.getAttribute(m[1]);
      if (m[2] !== undefined) {
        if (got !== m[2].replace(/\\/g, "")) return false;
      } else if (got === null) {
        return false;
      }
      rest = rest.slice(m[0].length);
    } else {
      return false;
    }
  }
  return true;
}

function parseHtmlInto(html, root) {
  const stack = [root];
  const tagRe = /<!--[\s\S]*?-->|<\/([a-zA-Z][a-zA-Z0-9-]*)\s*>|<([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[^\s=/>]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>\x60]+))?)*)\s*(\/?)>/g;
  let pos = 0, m;
  while ((m = tagRe.exec(html)) !== null) {
    if (m.index > pos) {
      const txt = html.slice(pos, m.index);
      if (txt) stack[stack.length - 1].appendChild(new TextNode(txt));
    }
    pos = tagRe.lastIndex;
    if (m[0].startsWith("<!--")) continue;
    if (m[1]) {
      const closeTag = m[1].toUpperCase();
      for (let i = stack.length - 1; i >= 1; i--) {
        if (stack[i].tagName === closeTag) { stack.length = i; break; }
      }
      continue;
    }
    const tag = m[2].toUpperCase();
    const el = new DomNode(tag);
    const attrStr = m[3] || "";
    const attrRe = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>\x60]+)))?/g;
    let am;
    while ((am = attrRe.exec(attrStr)) !== null) {
      el.setAttribute(am[1], unescAttr(am[2] ?? am[3] ?? am[4] ?? ""));
    }
    stack[stack.length - 1].appendChild(el);
    const selfClosing = m[4] === "/" || VOID_TAGS.has(tag);
    if (!selfClosing) stack.push(el);
  }
  if (pos < html.length) {
    stack[stack.length - 1].appendChild(new TextNode(html.slice(pos)));
  }
}

const bySel = new Map();
function getEl(sel) {
  if (!bySel.has(sel)) {
    const tag = sel.includes("input") ? "TEXTAREA" : sel.includes("btn") || sel === "#td-widen" || sel === "#td-close" ? "BUTTON" : "DIV";
    const id = sel.startsWith("#") ? sel.slice(1) : "";
    const el = new DomNode(tag, id);
    if (sel === "#super-thread") {
      const sc = new DomNode("DIV", "super-scroller");
      sc.clientHeight = 600;
      sc.scrollHeight = 4000;
      sc.scrollTop = 3400;
      sc.appendChild(el);
    } else {
      el.parentNode = new DomNode("DIV");
    }
    bySel.set(sel, el);
  }
  return bySel.get(sel);
}

for (const [formSel, inputSel] of [["#super-composer", "#super-input"], ["#composer", "#input"], ["#x-composer", "#x-input"], ["#td-composer", "#td-input"]]) {
  const f = getEl(formSel);
  f._qs["textarea"] = getEl(inputSel);
  f._qs[".send"] = formSel === "#td-composer" ? getEl("#td-send") : new DomNode("BUTTON");
  f._qs[".files"] = new DomNode("DIV");
  f._qs[".attach"] = new DomNode("BUTTON");
  f._qs['input[type="file"]'] = new DomNode("INPUT");
}
getEl("#re-draft")._qs[".re-who"] = new DomNode("SPAN");
getEl("#re-draft")._qs[".re-t"] = new DomNode("SPAN");
getEl("#re-draft")._qs["button"] = new DomNode("BUTTON");
getEl("#super-jump")._qs["#super-jump-badge"] = getEl("#super-jump-badge");
getEl("#super-jump").hidden = true;
getEl("#super-jump-badge").hidden = true;
getEl("#super-working").hidden = true;
getEl("#thread-drawer").hidden = true;
getEl("#thread-scrim").hidden = true;
getEl("#file-view").hidden = true;
getEl(".side").offsetWidth = 260;

const threadBox = getEl("#super-thread");
let threadInnerWrites = 0;
threadBox._onInnerWrite = () => { threadInnerWrites++; };

const storage = new Map();
const docListeners = new Map();
const winListeners = new Map();
let liveES = null;
let externalChatES = null;
let sayResolver = null;
let saySeq = 300;
let uuidSeq = 0;

class FakeES {
  constructor(url) {
    this.url = url;
    this.readyState = 1;
    this.ls = {};
    if (url === "/api/events") liveES = this;
    if (url.endsWith("/chat")) externalChatES = this;
  }
  addEventListener(t, fn) { (this.ls[t] ||= []).push(fn); }
  emit(t, obj) {
    const data = JSON.stringify(obj);
    for (const fn of (this.ls[t] || [])) fn({ data });
  }
  close() { this.readyState = 2; }
}

const doc = {
  documentElement: new DomNode("HTML"),
  body: new DomNode("BODY"),
  activeElement: null,
  hidden: false,
  hasFocus: () => true,
  createElement: (tag) => new DomNode(tag),
  createDocumentFragment: () => new DomNode("#fragment"),
  getElementById: (id) => getEl("#" + id),
  querySelector: (sel) => (sel === "dialog[open]" ? null : getEl(sel)),
  querySelectorAll: () => [],
  addEventListener(type, fn) {
    if (!docListeners.has(type)) docListeners.set(type, []);
    docListeners.get(type).push(fn);
  },
};

const okJSON = (data) => ({
  ok: true, status: 200, statusText: "OK",
  headers: { get: () => null },
  json: async () => data,
  text: async () => JSON.stringify(data),
});

let rafQueue = [];
let nextRafId = 1;
let immediateRAF = true;

const ctx = vm.createContext({
  console, setTimeout, clearTimeout, setInterval: () => 0, clearInterval() {}, URL, URLSearchParams,
  Blob, Uint8Array, TextEncoder, atob, AbortController, Event,
  Map, Set, Date, Math, JSON, RegExp, Array, Object, Promise, Error, Number, String, Boolean,
  MutationObserver: class { observe() {} disconnect() {} },
  ResizeObserver: class { observe() {} disconnect() {} },
  HTMLDialogElement: { prototype: {} },
  getComputedStyle: (el) => ({ getPropertyValue: (k) => el.style.getPropertyValue(k) }),
  crypto: { randomUUID: () => "uuid-t-" + (++uuidSeq) },
  navigator: { userAgent: "Mac Chrome", platform: "MacIntel" },
  location: { href: "http://127.0.0.1:7788/#/collie", origin: "http://127.0.0.1:7788", pathname: "/", search: "", hash: "#/collie", hostname: "127.0.0.1" },
  history: { state: { collieIdx: 0 }, replaceState() {}, pushState() {}, back() {} },
  localStorage: {
    getItem: (k) => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: (k) => storage.delete(k),
  },
  document: doc,
  EventSource: FakeES,
  CSS: { escape: (s) => String(s), supports: () => true },
  matchMedia: () => ({ matches: false, addEventListener() {} }),
  requestAnimationFrame: (fn) => {
    const id = nextRafId++;
    if (immediateRAF) { fn(); return id; }
    rafQueue.push({ id, fn });
    return id;
  },
  cancelAnimationFrame: (id) => { rafQueue = rafQueue.filter((x) => x.id !== id); },
  performance: { now: () => Date.now() },
  innerWidth: 1440,
  innerHeight: 900,
  addEventListener(type, fn) {
    if (!winListeners.has(type)) winListeners.set(type, []);
    winListeners.get(type).push(fn);
  },
  removeEventListener() {},
  dispatchEvent() {},
  fetch: async (url, init = {}) => {
    const u = String(url);
    if (u === "/api/session") return okJSON({ ok: true });
    if (u === "/api/super") return okJSON({ router: { status: "idle", alive: true }, entries: [], workers: [], pending: [], pinned: [] });
    if (u === "/api/state") return okJSON({ ok: true, agents: [], shells: [], machines: [{ id: "", name: "hub", local: true, online: true }] });
    if (u === "/api/hubs") return okJSON({ hubs: [] });
    if (u === "/api/updates") return okJSON({});
    if (u === "/api/external") return okJSON({ external: [] });
    if (u === "/api/history") return okJSON({ history: [] });
    if (u === "/api/super/settings") return okJSON({ settings: { worker_kind: "claude" } });
    if (u.startsWith("/api/models")) return okJSON({ models: [], efforts: [] });
    if (u === "/api/chat/read") return okJSON({ ok: true, changed: true });
    if (u === "/api/super/say") {
      const body = JSON.parse(init.body || "{}");
      if (sayResolver) {
        return await new Promise((resolve) => { sayResolver(body, (resp) => resolve(okJSON(resp))); });
      }
      const id = "e" + (++saySeq);
      return okJSON({ entry: id, trigger: "t" + saySeq });
    }
    return okJSON({});
  },
});
ctx.window = ctx;
ctx.globalThis = ctx;

const hook = [
  "  window.__T = {",
  "    openExt, loadExternal,",
  "    getSup: () => sup,",
  "    setSup: (s) => { sup = normSup(s); },",
  "    renderSuper: (o) => renderSuper(o),",
  "    sendSuper: (...a) => sendSuper(...a),",
  "    setReply: (e) => setReply(e),",
  "    openThreadDrawer: (...a) => openThreadDrawer(...a),",
  "    closeThreadDrawer: (...a) => closeThreadDrawer(...a),",
  "    setThreadWide: (...a) => setThreadWide(...a),",
  "    getPendingSays: () => pendingSays,",
  "    setView: (v) => { view = v; },",
  "    getSuperComposing: () => superComposing,",
  "  };",
].join("\n");
const marker = "  boot();\n})();";
assert.ok(appSrc.includes(marker), "boot marker present");
vm.runInContext(appSrc.replace(marker, hook + "\n" + marker), ctx);

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const mkEntry = (n, role, text, extra = {}) => ({
  id: "e" + n,
  role,
  text,
  at: new Date(Date.UTC(2026, 10, 26, 10, 0, n)).toISOString(),
  ...extra,
});

(async () => {
  await wait(30);
  const T = ctx.__T;
  assert.ok(liveES, "SSE EventSource connected");
  T.setView("collie");

  // ── 1) Seed 300 messages (from cold empty DOM to exercise bulk initial mount >16!) and verify incremental DOM patching reuses 100% of old nodes ──
  const base300 = [];
  for (let i = 1; i <= 300; i++) {
    if (i === 50) {
      base300.push(mkEntry(i, "event", "派出 worker-alpha（codex）：检查测试", { ref: "worker-alpha", tone: "spawn" }));
    } else {
      base300.push(mkEntry(i, i % 2 === 1 ? "user" : "collie", "第 " + i + " 条消息内容"));
    }
  }
  while (threadBox.firstChild) threadBox.removeChild(threadBox.firstChild);
  threadBox._collieNodes = null;
  threadBox._colliePatchStats = null;
  T.setSup({
    router: { status: "idle", alive: true },
    entries: base300,
    workers: [{ name: "worker-alpha", kind: "codex", status: "working", ended: false }],
    pending: [],
    pinned: [],
  });
  T.renderSuper({ force: true });
  assert.equal(threadInnerWrites, 0, "real DOM path must NEVER write #super-thread.innerHTML");
  assert.equal(threadBox._colliePatchStats.fullRebuilds, 1, "cold bulk initial mount (>16) counts as 1 full mount");

  const snapNodes300 = [...threadBox.children];
  assert.ok(snapNodes300.length >= 300, "all 300 entries mounted");

  // Append 1 new Collie message via SSE -> 100% of existing DOM nodes reused!
  const with301 = [...base300, mkEntry(301, "collie", "最新一条 Collie 回复，准备被引用")];
  liveES.emit("super", {
    router: { status: "idle", alive: true },
    entries: with301,
    workers: [{ name: "worker-alpha", kind: "codex", status: "working", ended: false }],
    pending: [],
    pinned: [],
  });
  assert.equal(threadInnerWrites, 0, "appending message must NOT write innerHTML");
  assert.equal(threadBox._colliePatchStats.fullRebuilds, 1, "appending message must NOT trigger fullRebuild");
  assert.equal(threadBox._colliePatchStats.lastAdded, 1, "only 1 new node inserted");
  assert.equal(threadBox._colliePatchStats.lastUpdated, 0, "0 existing nodes replaced");
  assert.equal(threadBox._colliePatchStats.lastRemoved, 0, "0 nodes removed");
  assert.equal(threadBox._colliePatchStats.lastReused, snapNodes300.length, "100% of old nodes reused");
  for (let i = 0; i < snapNodes300.length; i++) {
    assert.strictEqual(threadBox.children[i], snapNodes300[i], "DOM node identity preserved at index " + i);
  }

  // Worker status changes working -> done: ONLY the 1 spawn event row updates, all other 300 nodes reused!
  const snapBeforeWorker = [...threadBox.children];
  liveES.emit("super", {
    router: { status: "idle", alive: true },
    entries: with301,
    workers: [{ name: "worker-alpha", kind: "codex", status: "done", ended: true }],
    pending: [],
    pinned: [],
  });
  assert.equal(threadBox._colliePatchStats.lastUpdated, 1, "only the 1 spawn event row updates on worker status change");
  assert.equal(threadBox._colliePatchStats.lastReused, snapBeforeWorker.length - 1, "all other 300+ nodes stay untouched");

  // ── 2) Zero Quote Flash when quoting latest message (SSE arrives BEFORE POST /api/super/say response!) ──
  const latestCollie = with301[with301.length - 1]; // e301
  let resolveSayHttp = null;
  let capturedSayBody = null;
  sayResolver = (body, done) => {
    capturedSayBody = body;
    resolveSayHttp = () => done({ entry: "e302", trigger: "t302" });
  };
  const sendPromise = T.sendSuper("好的，收到", { entry: "e301", who: "Collie", text: latestCollie.text }, true, "cid-latest-1");
  await wait(10);
  // Step 2a: Optimistic state — must hide quote bar (adjacent to e301) and render exactly 1 bubble.
  let myBubbles = threadBox.querySelectorAll(".mine");
  const optMineEl = myBubbles[myBubbles.length - 1];
  const optMsgUserEl = optMineEl.querySelector(".msg.user");
  assert.ok(optMsgUserEl.textContent.includes("好的，收到"), "optimistic reply rendered");
  assert.equal(optMineEl.querySelector(".re"), null, "optimistic reply to latest message must NOT show quote bar");

  // Step 2b: Server SSE pushes e302 WITH client_msg_id BEFORE POST /api/super/say returns!
  const with302 = [
    ...with301,
    mkEntry(302, "user", "好的，收到", {
      client_msg_id: "cid-latest-1",
      re: { entry: "e301", who: "Collie", text: latestCollie.text },
    }),
  ];
  liveES.emit("super", {
    router: { status: "idle", alive: true },
    entries: with302,
    workers: [{ name: "worker-alpha", kind: "codex", status: "done", ended: true }],
    pending: [],
    pinned: [],
  });
  assert.equal(T.getPendingSays().length, 0, "pendingSay reconciled immediately on SSE via client_msg_id");
  const afterSseMines = threadBox.querySelectorAll(".mine");
  assert.equal(afterSseMines.length, myBubbles.length, "ZERO duplicate user bubble when SSE beats HTTP reply");
  const sseMineEl = afterSseMines[afterSseMines.length - 1];
  assert.equal(sseMineEl.querySelector(".re"), null, "ZERO quote bar flash when SSE beats HTTP reply");
  assert.strictEqual(sseMineEl.querySelector(".msg.user"), optMsgUserEl, "optimistic .msg.user DOM node promoted in-place!");
  assert.equal(optMsgUserEl.dataset.id, "e302", "promoted node received real entry id e302");

  // Step 2c: HTTP response finally resolves -> still 0 duplicates, 0 quote bar, same node!
  assert.ok(resolveSayHttp, "HTTP say request was sent");
  assert.equal(capturedSayBody.client_msg_id, "cid-latest-1");
  resolveSayHttp();
  await sendPromise;
  assert.equal(threadBox.querySelectorAll(".mine").length, myBubbles.length, "still 1 bubble after HTTP reply");
  assert.equal(threadBox.querySelectorAll(".mine").slice(-1)[0].querySelector(".re"), null, "still 0 quote bar after HTTP reply");

  // Step 2d: Legacy hub fallback (SSE omits client_msg_id on Entry) ALSO avoids duplicate & quote flash!
  const with303Collie = [...with302, mkEntry(303, "collie", "下一条最新消息")];
  liveES.emit("super", { router: { status: "idle", alive: true }, entries: with303Collie, workers: [], pending: [], pinned: [] });
  let resolveSayLegacy = null;
  sayResolver = (_body, done) => { resolveSayLegacy = () => done({ entry: "e304", trigger: "t304" }); };
  const legacyPromise = T.sendSuper("同意这个方案", { entry: "e303", who: "Collie", text: "下一条最新消息" }, true, "cid-legacy-2");
  await wait(10);
  const countBeforeLegacySse = threadBox.querySelectorAll(".mine").length;
  // Emit SSE WITHOUT client_msg_id on e304 before HTTP returns.
  const with304 = [...with303Collie, mkEntry(304, "user", "同意这个方案", { re: { entry: "e303", who: "Collie", text: "下一条最新消息" } })];
  liveES.emit("super", { router: { status: "idle", alive: true }, entries: with304, workers: [], pending: [], pinned: [] });
  assert.equal(threadBox.querySelectorAll(".mine").length, countBeforeLegacySse, "legacy fallback prevents duplicate bubble");
  assert.equal(threadBox.querySelectorAll(".mine").slice(-1)[0].querySelector(".re"), null, "legacy fallback prevents quote flash");
  resolveSayLegacy();
  await legacyPromise;

  // Step 2e: Quoting an OLDER non-adjacent message (e290) shows quote bar consistently on BOTH optimistic and persisted!
  sayResolver = null;
  const oldPromise = T.sendSuper("补充前面那条", { entry: "e290", who: "Collie", text: "第 290 条消息内容" }, true, "cid-older-3");
  const mineOlderOpt = threadBox.querySelectorAll(".mine").slice(-1)[0];
  assert.ok(mineOlderOpt.querySelector(".re"), "quoting older non-adjacent message shows quote bar optimistically");
  await oldPromise;
  const with305 = [...with304, mkEntry(305, "user", "补充前面那条", { client_msg_id: "cid-older-3", re: { entry: "e290", who: "Collie", text: "第 290 条消息内容" } })];
  liveES.emit("super", { router: { status: "idle", alive: true }, entries: with305, workers: [], pending: [], pinned: [] });
  assert.ok(threadBox.querySelectorAll(".mine").slice(-1)[0].querySelector(".re"), "quoting older message keeps quote bar after SSE");

  // ── 3) IME composition guard: zero DOM mutation during active pinyin, focus preserved, flush on compositionend ──
  const superInput = getEl("#super-input");
  superInput.focus();
  assert.strictEqual(doc.activeElement, superInput);
  superInput.dispatch("compositionstart");
  assert.equal(T.getSuperComposing(), true);
  const countBeforeIME = threadBox.children.length;
  const snapBeforeIME = [...threadBox.children];
  const with306 = [...with305, mkEntry(306, "collie", "IME 期间到达的消息 1")];
  const with307 = [...with306, mkEntry(307, "collie", "IME 期间到达的消息 2")];
  liveES.emit("super", { router: { status: "idle", alive: true }, entries: with306, workers: [], pending: [], pinned: [] });
  liveES.emit("super", { router: { status: "idle", alive: true }, entries: with307, workers: [], pending: [], pinned: [] });
  assert.equal(threadBox.children.length, countBeforeIME, "no DOM mutations while user is mid-IME composition");
  assert.strictEqual(doc.activeElement, superInput, "focus stays locked in #super-input during SSE");
  superInput.dispatch("compositionend");
  assert.equal(T.getSuperComposing(), false);
  assert.equal(threadBox.children.length, countBeforeIME + 2, "queued messages flush immediately on compositionend");
  assert.equal(threadBox._colliePatchStats.lastAdded, 2, "both messages appended incrementally");
  assert.strictEqual(doc.activeElement, superInput, "focus preserved after flush");
  for (let i = 0; i < snapBeforeIME.length; i++) {
    assert.strictEqual(threadBox.children[i], snapBeforeIME[i], "old nodes 100% reused after IME flush");
  }

  // ── 4) Anti-flicker for "Collie 在想…" (#super-working) ──
  const wk = getEl("#super-working");
  const st = getEl("#router-status");
  // 4a: Background silent turn (turn_kind="background") must NEVER pop up #super-working!
  liveES.emit("super", { router: { status: "working", alive: true, turn_kind: "background" }, entries: with307, workers: [], pending: [], pinned: [] });
  await wait(240);
  assert.equal(wk.hidden, true, "background silent turn must NOT show #super-working avatar bubble");
  assert.equal(st.hidden, false, "background silent turn stays quietly in header #router-status");

  // 4b: Legacy fallback (no turn_kind, latest message is Collie) must also NOT pop up #super-working!
  liveES.emit("super", { router: { status: "working", alive: true }, entries: with307, workers: [], pending: [], pinned: [] });
  await wait(240);
  assert.equal(wk.hidden, true, "no-turn_kind working after Collie reply stays quiet in header");

  // 4c: Human chat turn: brief <180ms spike never mounts!
  const with308User = [...with307, mkEntry(308, "user", "帮我查个指标")];
  liveES.emit("super", { router: { status: "working", alive: true, turn_kind: "chat" }, entries: with308User, workers: [], pending: [], pinned: [] });
  assert.equal(wk.hidden, true, "debounced during first 180ms");
  await wait(80);
  liveES.emit("super", { router: { status: "idle", alive: true }, entries: with308User, workers: [], pending: [], pinned: [] });
  await wait(160);
  assert.equal(wk.hidden, true, "sub-180ms blip never mounts #super-working");

  // 4d: Sustained human chat turn (>180ms) mounts cleanly, absorbs brief 120ms dip, hides in 0ms on reply!
  liveES.emit("super", { router: { status: "working", alive: true, turn_kind: "chat" }, entries: with308User, workers: [], pending: [], pinned: [] });
  await wait(230);
  assert.equal(wk.hidden, false, "sustained chat turn displays Collie 在想…");
  assert.equal(st.hidden, true, "header status yields while in-stream bubble shows");
  // Brief 120ms idle dip while still waiting on user msg -> stays steady without flicker!
  liveES.emit("super", { router: { status: "idle", alive: true }, entries: with308User, workers: [], pending: [], pinned: [] });
  await wait(120);
  assert.equal(wk.hidden, false, "brief 120ms status dip does not blink #super-working off");
  liveES.emit("super", { router: { status: "working", alive: true, turn_kind: "chat" }, entries: with308User, workers: [], pending: [], pinned: [] });
  // Collie replies -> hides IMMEDIATELY (0ms)!
  const with309Reply = [...with308User, mkEntry(309, "collie", "指标查好了，全部正常。")];
  liveES.emit("super", { router: { status: "working", alive: true, replied: true }, entries: with309Reply, workers: [], pending: [], pinned: [] });
  assert.equal(wk.hidden, true, "#super-working hides immediately (0ms) when Collie replies");

  // ── 5) Desktop topic drawer widen / restore toggle (#td-widen) ──
  const tdWiden = getEl("#td-widen");
  const appEl = getEl("#app");
  T.openThreadDrawer("e290", "e290", "e290");
  assert.equal(doc.documentElement.style.getPropertyValue("--thread-w"), "432px", "default drawer width is restrained 432px");
  assert.equal(tdWiden.getAttribute("aria-pressed"), "false");
  assert.equal(tdWiden.title, "拓宽抽屉");
  assert.equal(appEl.classList.contains("thread-wide"), false);

  // Click widen -> expands smoothly to roomy width leaving >= 200px main strip, persists to localStorage.
  tdWiden.dispatch("click");
  const wideW = parseInt(doc.documentElement.style.getPropertyValue("--thread-w"), 10);
  assert.ok(wideW >= 720 && wideW <= 920, "widened drawer width in roomy range (got " + wideW + ")");
  assert.ok(1440 - 260 - wideW >= 200, "leaves visible main-stream strip >= 200px");
  assert.equal(tdWiden.getAttribute("aria-pressed"), "true");
  assert.equal(tdWiden.title, "还原宽度");
  assert.equal(appEl.classList.contains("thread-wide"), true);
  assert.equal(storage.get("collie.threadWide"), "true", "wide preference persisted in localStorage");

  // Close & reopen remembers widened preference.
  T.closeThreadDrawer({ immediate: true });
  assert.equal(appEl.classList.contains("thread-wide"), false, "closing drawer clears active wide class");
  T.openThreadDrawer("e290", "e290", "e290");
  assert.equal(parseInt(doc.documentElement.style.getPropertyValue("--thread-w"), 10), wideW, "reopen restores widened preference");
  assert.equal(tdWiden.getAttribute("aria-pressed"), "true");

  // Clicking blank area of exposed main-stream (#v-collie) collapses back to restrained width.
  const blankTarget = new DomNode("DIV");
  getEl("#v-collie").dispatch("click", { target: blankTarget });
  assert.equal(doc.documentElement.style.getPropertyValue("--thread-w"), "432px", "clicking blank main area restores restrained width");
  assert.equal(tdWiden.getAttribute("aria-pressed"), "false");
  assert.equal(storage.get("collie.threadWide"), "false", "restored preference persisted");

  T.closeThreadDrawer({ immediate: true });
  assert.equal(threadInnerWrites, 0, "entire session had ZERO #super-thread.innerHTML rebuilds");
  // A slow session list must not block a cold external-chat link.
  let listRequests = 0;
  let finishList;
  const previousFetch = ctx.fetch;
  ctx.fetch = (url, init) => {
    if (url !== "/api/external") return previousFetch(url, init);
    listRequests++;
    return new Promise((resolve) => { finishList = () => resolve(okJSON({ sessions: [] })); });
  };
  T.setView("ext");
  const opening = T.openExt("example@node");
  assert.equal(externalChatES?.url, "/api/external/example%40node/chat");
  externalChatES.emit("patch", { base: 0, from: 0, msgs: [{ kind: "user", text: "visible immediately" }] });
  assert.ok(getEl("#x-thread").innerHTML.includes("visible immediately"));
  const refresh = T.loadExternal();
  assert.equal(listRequests, 1, "polls share the pending list request");
  finishList();
  await Promise.all([opening, refresh]);
  const nextRefresh = T.loadExternal();
  assert.equal(listRequests, 2, "polling resumes after the list returns");
  finishList();
  await nextRefresh;

  console.log("OK: all typing, incremental DOM, quote-zero-flash, busy-debounce & drawer-widen checks passed");
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
`
	cmd := exec.Command(nodeBin, "-e", jsTest, root)
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("node typing/quote/widen test failed: %v\n%s", err, string(out))
	}
	if !strings.Contains(string(out), "OK: all typing, incremental DOM, quote-zero-flash, busy-debounce & drawer-widen checks passed") {
		t.Fatalf("unexpected node output:\n%s", string(out))
	}
}
