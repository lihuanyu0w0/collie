#!/bin/sh
# Collie installer — https://lihuanyu0w0.github.io/collie
#
#   安装 collie 命令：
#     curl -fsSL https://lihuanyu0w0.github.io/collie/install.sh | sh
#
#   把这台电脑加入 hub，并作为后台服务常驻（macOS: launchd，Linux: systemd --user）：
#     curl -fsSL https://lihuanyu0w0.github.io/collie/install.sh | sh -s -- node --hub http://<hub>:7788 --code <配对码>
#
#   让这台电脑做 hub，并作为后台服务常驻：
#     curl -fsSL https://lihuanyu0w0.github.io/collie/install.sh | sh -s -- hub [--url http://<本机内网 IP>:7788]
#
#   从源码安装（需要 Go 1.25+）：在仓库里运行这个脚本，会用本地源码编译，不下载：
#     git clone https://github.com/lihuanyu0w0/collie.git ~/collie && cd ~/collie
#     sh docs/install.sh [hub | node …]
#
# 环境变量：COLLIE_BIN_DIR（默认 ~/.local/bin）、COLLIE_BINARY（直接安装这个现成的文件）、
# COLLIE_VERSION（下载时的版本，默认 latest）、COLLIE_NO_HERDR（设为 1 跳过自动装 herdr 和集成）、
# COLLIE_NO_INTEGRATION（设为 1 跳过自动装 herdr 的 agent 集成）、
# COLLIE_INSTALL_CODEX_HOOK（默认不装 Codex hook；设为 1 才装，注意会改 ~/.codex/hooks.json 并触发 Codex 信任确认弹窗）、
# COLLIE_NO_OPEN（设为 1 不在 macOS 桌面自动打开浏览器）。
set -eu

REPO=lihuanyu0w0/collie
VERSION=${COLLIE_VERSION:-latest}
BIN_DIR=${COLLIE_BIN_DIR:-$HOME/.local/bin}
BIN=$BIN_DIR/collie

say() { printf '%s\n' "$*"; }
step() { printf '\033[1m==>\033[0m %s\n' "$*"; }
die() { printf '\033[31mcollie:\033[0m %s\n' "$*" >&2; exit 1; }

# ------------------------------------------------------------------ platform
case "$(uname -s)" in
  Darwin) os=darwin ;;
  Linux) os=linux ;;
  *) die "暂时只支持 macOS 和 Linux（这台是 $(uname -s)）" ;;
esac
case "$(uname -m)" in
  x86_64 | amd64) arch=amd64 ;;
  arm64 | aarch64) arch=arm64 ;;
  *) die "暂时只支持 amd64 和 arm64（这台是 $(uname -m)）" ;;
esac

fetch() { # fetch <url> <file>
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL --retry 2 -o "$2" "$1"
  elif command -v wget >/dev/null 2>&1; then
    wget -q -O "$2" "$1"
  else
    die "需要 curl 或 wget"
  fi
}

sha256() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | cut -d' ' -f1
  else shasum -a 256 "$1" | cut -d' ' -f1; fi
}

# ------------------------------------------------------------------ binary
# checkout: the repository this script was run from (sh docs/install.sh),
# if any. Piped from curl, $0 is the shell, so this never matches.
checkout() {
  case "$0" in *install.sh) ;; *) return 1 ;; esac
  d=$(cd "$(dirname "$0")/.." 2>/dev/null && pwd) || return 1
  grep -q '^module github.com/lihuanyu0w0/collie$' "$d/go.mod" 2>/dev/null || return 1
  printf '%s\n' "$d"
}

install_binary() {
  asset=collie-$os-$arch
  if [ "$VERSION" = latest ]; then
    base=https://github.com/$REPO/releases/latest/download
  else
    base=https://github.com/$REPO/releases/download/$VERSION
  fi
  tmp=$(mktemp -d)
  trap 'rm -rf "$tmp"' EXIT

  if [ -n "${COLLIE_BINARY:-}" ]; then # a file built elsewhere
    cp "$COLLIE_BINARY" "$tmp/$asset"
  elif src=$(checkout); then
    command -v go >/dev/null 2>&1 || die "从源码安装需要 Go 1.25+：https://go.dev/dl/"
    v=$(git -C "$src" describe --tags --always --dirty 2>/dev/null || echo dev)
    step "从源码编译（${src}，${v}）"
    (cd "$src" && CGO_ENABLED=0 go build -trimpath -ldflags "-s -w -X main.version=$v" -o "$tmp/$asset" .) || die "编译失败"
  else
    step "下载 ${asset}（${VERSION}）"
    fetch "$base/$asset" "$tmp/$asset" || die "下载失败：$base/$asset"
    if fetch "$base/checksums.txt" "$tmp/checksums.txt" 2>/dev/null; then
      want=$(grep " $asset\$" "$tmp/checksums.txt" | cut -d' ' -f1)
      [ -n "$want" ] && [ "$want" = "$(sha256 "$tmp/$asset")" ] || die "校验和对不上，没有安装"
    fi
  fi

  mkdir -p "$BIN_DIR"
  chmod 755 "$tmp/$asset"
  # Replace atomically: a running node or hub keeps its old file until restart.
  mv -f "$tmp/$asset" "$BIN.new" && mv -f "$BIN.new" "$BIN"
  step "已安装 $("$BIN" version 2>/dev/null || echo collie) → $BIN"
  case ":$PATH:" in
    *":$BIN_DIR:"*) ;;
    *) say "    提示：$BIN_DIR 不在 PATH 里。把这行加到 ~/.zshrc 或 ~/.bashrc：
      export PATH=\"$BIN_DIR:\$PATH\"" ;;
  esac
}

# ------------------------------------------------------------------ services
xml() { printf '%s' "$1" | sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g'; }
systemd_env_val() { printf '%s' "$1" | tr -d '\r\n' | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' -e 's/%/%%/g'; }

has_systemd_user() {
  command -v systemctl >/dev/null 2>&1 || return 1
  if command -v timeout >/dev/null 2>&1; then
    timeout 3 systemctl --user show-environment >/dev/null 2>&1
  else
    systemctl --user show-environment >/dev/null 2>&1
  fi
}

stop_pidfile() {
  pf=${1:-}
  [ -f "${pf}" ] || return 0
  old_pid=$(tr -d '\r\n\t ' < "${pf}" 2>/dev/null || true)
  case "${old_pid}" in
    "" | 0* | *[!0-9]*) return 0 ;;
  esac
  kill "${old_pid}" 2>/dev/null || return 0
  w=0
  while [ "${w}" -lt 10 ]; do
    kill -0 "${old_pid}" 2>/dev/null || return 0
    if sleep 0.2 2>/dev/null; then
      w=$((w + 1))
    else
      sleep 1
      w=$((w + 5))
    fi
  done
  if kill -0 "${old_pid}" 2>/dev/null; then
    kill -9 "${old_pid}" 2>/dev/null || true
    w=0
    while [ "${w}" -lt 10 ]; do
      kill -0 "${old_pid}" 2>/dev/null || return 0
      if sleep 0.2 2>/dev/null; then
        w=$((w + 1))
      else
        sleep 1
        w=$((w + 5))
      fi
    done
  fi
}

# service <name> <args…>: run `collie <args…>` in the background, now and
# after every login (macOS) or boot (Linux, with linger).
service() {
  name=$1; shift
  path="$BIN_DIR:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
  if [ "$os" = darwin ]; then
    label=com.collie.$name
    plist=$HOME/Library/LaunchAgents/$label.plist
    log=$HOME/Library/Logs/collie-$name.log
    args="    <string>$(xml "$BIN")</string>"
    for a in "$@"; do args="$args
    <string>$(xml "$a")</string>"; done
    unit="<?xml version=\"1.0\" encoding=\"UTF-8\"?>
<!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" \"http://www.apple.com/DTDs/PropertyList-1.0.dtd\">
<plist version=\"1.0\">
<dict>
  <key>Label</key><string>$label</string>
  <key>ProgramArguments</key>
  <array>
$args
  </array>
  <key>EnvironmentVariables</key>
  <dict><key>PATH</key><string>$(xml "$path")</string></dict>
  <key>WorkingDirectory</key><string>$(xml "$HOME")</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>30</integer>
  <key>ProcessType</key><string>Background</string>
  <key>StandardOutPath</key><string>$(xml "$log")</string>
  <key>StandardErrorPath</key><string>$(xml "$log")</string>
</dict>
</plist>"
    if [ -n "${COLLIE_DRY_SERVICE:-}" ]; then say "$unit"; return; fi
    mkdir -p "$(dirname "$plist")"
    printf '%s\n' "$unit" > "$plist"
    launchctl bootout "gui/$(id -u)/$label" 2>/dev/null || true
    launchctl bootstrap "gui/$(id -u)" "$plist"
    step "已作为后台服务运行（launchd: ${label}）"
    say "    日志：tail -f $log"
  else
    unitdir=${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user
    file=${unitdir}/collie-${name}.service
    quoted=""
    for a in "$@"; do quoted="${quoted} \"${a}\""; done
    env_lines="Environment=\"PATH=$(systemd_env_val "${path}")\""
    for pair in \
      "HTTP_PROXY:${HTTP_PROXY:-}" \
      "HTTPS_PROXY:${HTTPS_PROXY:-}" \
      "NO_PROXY:${NO_PROXY:-}" \
      "http_proxy:${http_proxy:-}" \
      "https_proxy:${https_proxy:-}" \
      "no_proxy:${no_proxy:-}"; do
      k=${pair%%:*}
      v=${pair#*:}
      if [ -n "${v}" ]; then
        env_lines="${env_lines}
Environment=\"${k}=$(systemd_env_val "${v}")\""
      fi
    done
    unit="[Unit]
Description=Collie ${name}
After=network-online.target

[Service]
ExecStart=\"${BIN}\"${quoted}
WorkingDirectory=%h
${env_lines}
Restart=always
RestartSec=5

[Install]
WantedBy=default.target"
    if [ -n "${COLLIE_DRY_SERVICE:-}" ]; then say "$unit"; return; fi
    # Containers (cloud dev machines, sandboxes) often have systemctl but no
    # user bus (or a hanging D-Bus socket); fall back to a plain background
    # process there.
    if ! has_systemd_user; then
      log=${HOME}/.collie/${name}.log
      pidf=${HOME}/.collie/${name}.pid
      mkdir -p "${HOME}/.collie"
      stop_pidfile "${pidf}"
      setsid_bin=$(command -v setsid 2>/dev/null || true)
      if [ -n "${setsid_bin}" ]; then
        PATH="${path}" "${setsid_bin}" nohup "${BIN}" "$@" </dev/null >>"${log}" 2>&1 &
      else
        PATH="${path}" nohup "${BIN}" "$@" </dev/null >>"${log}" 2>&1 &
      fi
      new_pid=$!
      printf '%s\n' "${new_pid}" > "${pidf}"
      sleep 2
      kill -0 "${new_pid}" 2>/dev/null || die "没能启动，看日志：tail -n 30 ${log}"
      step "已在后台运行（这台机器没有 systemd 用户服务，用的 nohup；pid ${new_pid}）"
      say "    日志：tail -f ${log}"
      say "    机器重启后不会自动起来，重跑这条安装命令即可"
      return
    fi
    mkdir -p "$unitdir"
    printf '%s\n' "$unit" > "$file"
    # The README's earlier one-off unit (systemd-run) has the same name.
    systemctl --user stop "collie-$name" 2>/dev/null || true
    systemctl --user reset-failed "collie-$name" 2>/dev/null || true
    systemctl --user daemon-reload
    systemctl --user enable --now "collie-$name" >/dev/null
    systemctl --user restart "collie-$name"
    step "已作为后台服务运行（systemd --user: collie-${name}）"
    say "    日志：journalctl --user -u collie-$name -f"
    if command -v loginctl >/dev/null 2>&1 && ! loginctl show-user "$(id -un)" -p Linger 2>/dev/null | grep -q yes; then
      say "    提示：退出登录后也要继续跑的话，运行一次：loginctl enable-linger"
    fi
  fi
}

# ------------------------------------------------------------------ herdr
warn() { printf '\033[33m!\033[0m %s\n' "$*"; }

# check_herdr: Collie drives agents through herdr. Install herdr, start its
# server, and install missing agent integrations unless opted out.
check_herdr() {
  hb=$(command -v herdr 2>/dev/null || true)
  [ -z "$hb" ] && [ -x "$HOME/.local/bin/herdr" ] && hb=$HOME/.local/bin/herdr
  # Collie talks to herdr (the CLI at herdr.dev/install.sh), not to the Herdr
  # app or herdr-core that releases.herdr.dev/app/install.sh puts in.
  if [ -z "$hb" ] && [ -z "${COLLIE_NO_HERDR:-}" ]; then
    step "安装 herdr（Collie 通过它看到和管理 agent；不想装就设 COLLIE_NO_HERDR=1）"
    if curl -fsSL https://herdr.dev/install.sh | HERDR_INSTALL_DIR="$HOME/.local/bin" sh >/dev/null; then
      hb=$HOME/.local/bin/herdr
    else
      warn "herdr 没装上，可以稍后自己装：curl -fsSL https://herdr.dev/install.sh | sh"
    fi
  fi
  if [ -z "$hb" ]; then
    warn "没找到 herdr：没有它，这台电脑上的 agent 不会出现在 Collie 里${1:+（${1}）}。"
    say "    安装：curl -fsSL https://herdr.dev/install.sh | sh"
    return 0
  fi
  if ! "$hb" status 2>/dev/null | grep -q "status: running"; then
    # Collie needs herdr's server (its socket), not a terminal UI.
    herdr_path=$PATH
    if [ "$os" = darwin ] && ! command -v codex >/dev/null 2>&1; then
      for apps in "$HOME/Applications" /Applications; do
        dir="$apps/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS"
        if [ -f "$dir/codex" ] && [ -x "$dir/codex" ]; then
          herdr_path="${herdr_path:+$herdr_path:}$dir"
          break
        fi
      done
    fi
    PATH="$herdr_path" nohup "$hb" server >/dev/null 2>&1 </dev/null &
    sleep 2
    if "$hb" status 2>/dev/null | grep -q "status: running"; then
      step "已在后台启动 herdr 服务端（herdr server）；之后运行 herdr 会直接接上它"
    else
      warn "herdr 服务端没起来：运行一次 herdr 或 herdr server（Collie 连的是它的 socket）。"
    fi
  fi
  st=$("$hb" integration status 2>/dev/null) || return 0
  # Default auto-install targets: skip codex because `herdr integration install
  # codex` writes global ~/.codex/hooks.json and triggers Codex's hook trust
  # review dialog for every tool sharing ~/.codex; Collie discovers and controls
  # Codex without any hook. Opt in explicitly with COLLIE_INSTALL_CODEX_HOOK=1.
  pairs="claude:claude agy:antigravity-cli"
  if [ "${COLLIE_INSTALL_CODEX_HOOK:-}" = "1" ]; then
    pairs="${pairs} codex:codex"
  fi
  missing=""
  outdated=""
  for pair in $pairs; do
    command -v "${pair%%:*}" >/dev/null 2>&1 || continue # this agent isn't installed here
    target=${pair#*:}
    line=$(printf '%s\n' "$st" | grep "^${target}:" || true)
    case "$line" in
      *": not installed"*) missing="${missing} ${target}" ;;
      *": outdated"*) outdated="${outdated} ${target}" ;;
      *) ;; # current, unknown to this herdr version, or already configured
    esac
  done
  if [ -n "$missing" ]; then
    if [ -z "${COLLIE_NO_HERDR:-}" ] && [ -z "${COLLIE_NO_INTEGRATION:-}" ]; then
      list=${missing# }
      step "安装 herdr 的 agent 集成：${list}（不想自动改 agent 配置可设 COLLIE_NO_INTEGRATION=1）"
      case " ${missing} " in
        *" codex "*)
          warn "已按 COLLIE_INSTALL_CODEX_HOOK=1 安装 codex 集成：这会修改全局 ~/.codex/hooks.json 并触发 Codex 信任确认弹窗，若同机有其他共用 ~/.codex 的工具请慎用。"
          ;;
      esac
      failed=""
      for t in $missing; do
        if ! "$hb" integration install "$t" </dev/null; then
          failed="${failed} ${t}"
        fi
      done
      if [ -n "$failed" ]; then
        warn "以下 agent 的 herdr 集成没装上，可以稍后手动运行："
        for t in $failed; do say "      herdr integration install ${t}"; done
      fi
    else
      warn "以下 agent 还没装 herdr 集成（Claude / Antigravity 需要集成汇报状态；Codex 无需安装 hook 即可被 Collie 发现与控制）。如需手动安装，运行："
      for t in $missing; do say "      herdr integration install ${t}"; done
    fi
  fi
  if [ -n "$outdated" ]; then
    warn "以下 agent 的 herdr 集成已有新版（为避免静默覆写已有配置，不会自动更新）；如需手动升级，运行："
    for t in $outdated; do say "      herdr integration install ${t}"; done
  fi
}

# ------------------------------------------------------------------ urls & browser
is_valid_ipv4() {
  case "${1:-}" in
    "" | 127.* | 169.254.* | 0.* | *[!0-9.]*) return 1 ;;
    *.*.*.*) return 0 ;;
    *) return 1 ;;
  esac
}

normalize_ipv6() {
  v6=${1:-}
  v6=${v6%%/*}
  v6=${v6%%%*}
  printf '%s' "${v6}" | tr '[:upper:]' '[:lower:]'
}

is_valid_ipv6() {
  v6=$(normalize_ipv6 "${1:-}")
  case "${v6}" in
    "" | :: | ::1 | 0:0:0:0:0:0:0:1 | 0000:0000:0000:0000:0000:0000:0000:0001) return 1 ;;
    *[!0-9a-f:]*) return 1 ;;
    fe[89ab][0-9a-f]:* | ff[0-9a-f][0-9a-f]:*) return 1 ;;
    *:*) ;;
    *) return 1 ;;
  esac
  [ -n "$(printf '%s' "${v6}" | tr -d ':0')" ] || return 1
  return 0
}

is_ula_ipv6() {
  v6=$(normalize_ipv6 "${1:-}")
  case "${v6}" in
    fc[0-9a-f][0-9a-f]:* | fd[0-9a-f][0-9a-f]:*) return 0 ;;
    *) return 1 ;;
  esac
}

has_ipv4_loopback() {
  if [ "${os}" = darwin ]; then
    if command -v ifconfig >/dev/null 2>&1; then
      lo_out=$(ifconfig lo0 2>/dev/null || true)
      if [ -n "${lo_out}" ]; then
        printf '%s\n' "${lo_out}" | grep -q 'inet 127\.' && return 0
        printf '%s\n' "${lo_out}" | grep -q 'inet6 ::1' && return 1
      fi
    fi
    return 0
  else
    if command -v ip >/dev/null 2>&1; then
      lo_out=$(ip -o addr show dev lo 2>/dev/null || true)
      if [ -n "${lo_out}" ]; then
        printf '%s\n' "${lo_out}" | grep -q 'inet 127\.' && return 0
        printf '%s\n' "${lo_out}" | grep -q 'inet6 ::1' && return 1
      fi
    fi
    return 0
  fi
}

detect_darwin_ipv6_iface() {
  set -f
  iface=$1
  command -v ifconfig >/dev/null 2>&1 || return 1
  out=$(ifconfig "${iface}" 2>/dev/null || true)
  [ -n "${out}" ] || return 1
  gua=""
  ula=""
  old_ifs=${IFS}
  IFS='
'
  for line in ${out}; do
    case "${line}" in
      *"inet6 "*) ;;
      *) continue ;;
    esac
    case "${line}" in
      *deprecated* | *detached* | *tentative*) continue ;;
    esac
    cand=$(printf '%s\n' "${line}" | awk '{for(i=1;i<NF;i++) if($i=="inet6"){print $(i+1); exit}}')
    cand=$(normalize_ipv6 "${cand}")
    is_valid_ipv6 "${cand}" || continue
    if is_ula_ipv6 "${cand}"; then
      [ -z "${ula}" ] && ula=${cand}
    else
      case "${line}" in
        *temporary*) [ -z "${gua}" ] && gua=${cand} ;;
        *) gua=${cand}; break ;;
      esac
    fi
  done
  IFS=${old_ifs}
  if [ -n "${gua}" ]; then
    printf '%s\n' "${gua}"
    return 0
  fi
  if [ -n "${ula}" ]; then
    printf '%s\n' "${ula}"
    return 0
  fi
  return 1
}

detect_ip() {
  set -f
  ip=""
  if [ "${os}" = darwin ]; then
    if command -v route >/dev/null 2>&1 && command -v ipconfig >/dev/null 2>&1; then
      iface=$(route -n get default 2>/dev/null | awk '/interface:/{print $2; exit}' || true)
      if [ -n "${iface}" ]; then
        cand=$(ipconfig getifaddr "${iface}" 2>/dev/null || true)
        if is_valid_ipv4 "${cand}"; then
          ip=${cand}
        fi
      fi
    fi
    if [ -z "${ip}" ] && command -v ipconfig >/dev/null 2>&1; then
      for iface in en0 en1 en2 en3 en4 en5; do
        cand=$(ipconfig getifaddr "${iface}" 2>/dev/null || true)
        if is_valid_ipv4 "${cand}"; then
          ip=${cand}
          break
        fi
      done
    fi
    if [ -z "${ip}" ] && command -v route >/dev/null 2>&1; then
      iface=$(route -n get -inet6 default 2>/dev/null | awk '/interface:/{print $2; exit}' || true)
      if [ -n "${iface}" ]; then
        cand=$(detect_darwin_ipv6_iface "${iface}" || true)
        if [ -n "${cand}" ]; then
          ip=${cand}
        fi
      fi
    fi
    if [ -z "${ip}" ]; then
      for iface in en0 en1 en2 en3 en4 en5; do
        cand=$(detect_darwin_ipv6_iface "${iface}" || true)
        if [ -n "${cand}" ]; then
          ip=${cand}
          break
        fi
      done
    fi
  else
    if command -v ip >/dev/null 2>&1; then
      cand=$(ip route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<NF;i++) if($i=="src"){print $(i+1); exit}}' || true)
      if is_valid_ipv4 "${cand}"; then
        ip=${cand}
      fi
    fi
    if [ -z "${ip}" ] && command -v hostname >/dev/null 2>&1; then
      for cand in $(hostname -I 2>/dev/null || true); do
        if is_valid_ipv4 "${cand}"; then
          ip=${cand}
          break
        fi
      done
    fi
    if [ -z "${ip}" ] && command -v ip >/dev/null 2>&1; then
      for cand in $(ip -4 -o addr show scope global up 2>/dev/null | awk '{print $4}' || true); do
        cand=${cand%%/*}
        if is_valid_ipv4 "${cand}"; then
          ip=${cand}
          break
        fi
      done
    fi
    if [ -z "${ip}" ] && command -v ip >/dev/null 2>&1; then
      cand=$(ip -6 route get 2606:4700:4700::1111 2>/dev/null | awk '{for(i=1;i<NF;i++) if($i=="src"){print $(i+1); exit}}' || true)
      cand=$(normalize_ipv6 "${cand}")
      if is_valid_ipv6 "${cand}"; then
        ip=${cand}
      fi
    fi
    if [ -z "${ip}" ] && command -v ip >/dev/null 2>&1; then
      gua=""
      ula=""
      for cand in $(ip -6 -o addr show scope global up 2>/dev/null | awk '!/deprecated|tentative/{print $4}' || true); do
        cand=$(normalize_ipv6 "${cand}")
        is_valid_ipv6 "${cand}" || continue
        if is_ula_ipv6 "${cand}"; then
          [ -z "${ula}" ] && ula=${cand}
        else
          gua=${cand}
          break
        fi
      done
      if [ -n "${gua}" ]; then
        ip=${gua}
      elif [ -n "${ula}" ]; then
        ip=${ula}
      fi
    fi
    if [ -z "${ip}" ] && command -v hostname >/dev/null 2>&1; then
      gua=""
      ula=""
      for cand in $(hostname -I 2>/dev/null || true); do
        cand=$(normalize_ipv6 "${cand}")
        is_valid_ipv6 "${cand}" || continue
        if is_ula_ipv6 "${cand}"; then
          [ -z "${ula}" ] && ula=${cand}
        else
          gua=${cand}
          break
        fi
      done
      if [ -n "${gua}" ]; then
        ip=${gua}
      elif [ -n "${ula}" ]; then
        ip=${ula}
      fi
    fi
  fi
  if [ -z "${ip}" ]; then
    if has_ipv4_loopback; then
      ip=127.0.0.1
    else
      ip=::1
    fi
  fi
  printf '%s\n' "${ip}"
}

format_http_url() {
  host=${1:-}
  port=${2:-7788}
  case "${host}" in
    \[*\]) printf 'http://%s:%s\n' "${host}" "${port}" ;;
    *:*)   printf 'http://[%s]:%s\n' "${host}" "${port}" ;;
    *)     printf 'http://%s:%s\n' "${host}" "${port}" ;;
  esac
}

is_loopback_url() {
  u=${1:-}
  case "${u}" in
    http://*)  rest=${u#http://} ;;
    https://*) rest=${u#https://} ;;
    *)         rest=${u} ;;
  esac
  auth=${rest%%/*}
  auth=${auth%%\?*}
  auth=${auth%%#*}
  auth=$(printf '%s' "${auth}" | tr '[:upper:]' '[:lower:]')
  case "${auth}" in
    127.* | localhost | localhost:* | \[::1\] | \[::1\]:* | \[0:0:0:0:0:0:0:1\] | \[0:0:0:0:0:0:0:1\]:* | ::1)
      return 0 ;;
    *)
      return 1 ;;
  esac
}

can_open_browser() {
  [ "${os}" = darwin ] || return 1
  [ -z "${SSH_CONNECTION:-}" ] && [ -z "${SSH_TTY:-}" ] || return 1
  [ -z "${COLLIE_NO_OPEN:-}" ] || return 1
  [ -z "${COLLIE_DRY_SERVICE:-}" ] || return 1
  command -v open >/dev/null 2>&1 || return 1
  return 0
}

wait_hub_token() {
  token_file="${HOME}/.collie/token"
  w=0
  while [ "${w}" -lt 7 ]; do
    if [ -r "${token_file}" ]; then
      tok=$(tr -d '\r\n\t ' < "${token_file}" 2>/dev/null || true)
      if [ -n "${tok}" ]; then
        printf '%s\n' "${tok}"
        return 0
      fi
    fi
    if [ "${w}" -lt 6 ]; then
      sleep 0.5 2>/dev/null || sleep 1
    fi
    w=$((w + 1))
  done
  return 1
}

append_token_query() { # append_token_query <url> <token>
  base_url=${1:-}
  tok=${2:-}
  case "${base_url}" in
    *\?*) printf '%s&t=%s\n' "${base_url}" "${tok}" ;;
    */)   printf '%s?t=%s\n' "${base_url}" "${tok}" ;;
    *)    printf '%s/?t=%s\n' "${base_url}" "${tok}" ;;
  esac
}

open_browser() { # open_browser <url> [probe_url] [display_url] [note]
  can_open_browser || return 0
  open_target=$1
  probe_url=${2:-$1}
  display_url=${3:-$1}
  open_note=${4:-}
  if command -v curl >/dev/null 2>&1; then
    w=0
    while [ "${w}" -lt 6 ]; do
      curl -s -g --max-time 1 --noproxy '*' -o /dev/null "${probe_url}" 2>/dev/null && break
      sleep 0.5 2>/dev/null || sleep 1
      w=$((w + 1))
    done
  fi
  if open "${open_target}" >/dev/null 2>&1; then
    if [ -n "${open_note}" ]; then
      say "    已在浏览器打开 ${display_url}${open_note}"
    else
      say "    已在浏览器打开 ${display_url}（不想自动打开可设 COLLIE_NO_OPEN=1）"
    fi
  fi
}

# ------------------------------------------------------------------ main
mode=${1:-}
[ $# -gt 0 ] && shift

case "${mode}" in
  "")
    install_binary
    say ""
    say "下一步："
    say "  让这台电脑做 hub：   collie -url http://<本机内网 IP>:7788"
    say "  把电脑加入 hub：     collie node --hub http://<hub>:7788 --code <配对码>"
    say "  （加 node / hub 参数重跑这个脚本，会顺便装成后台服务）"
    check_herdr
    ;;
  node)
    install_binary
    has_code=0
    for arg in "$@"; do
      case "${arg}" in
        --code | -code | --code=* | -code=*) has_code=1; break ;;
      esac
    done
    if [ "${has_code}" -eq 1 ]; then
      step "加入 hub"
      "${BIN}" node --pair-only "$@"
    else
      [ -f "${HOME}/.collie/node.json" ] || die "第一次要带上 hub 地址和配对码：sh -s -- node --hub http://<hub>:7788 --code <配对码>
    配对码在 hub 的「设备 → 连接一台电脑」里拿。"
    fi
    # The service runs `collie node` with the saved address and token;
    # --name / --socket / --ui stay only if given.
    node_ui_addr=""
    n=$#
    i=0
    while [ "${i}" -lt "${n}" ]; do
      a=$1; shift; i=$((i + 1))
      case "${a}" in
        --name | -name | --socket | -socket)
          if [ "${i}" -lt "${n}" ]; then
            set -- "$@" "${a}" "$1"; shift; i=$((i + 1))
          fi
          ;;
        --name=* | -name=* | --socket=* | -socket=*)
          set -- "$@" "${a}"
          ;;
        --ui | -ui)
          if [ "${i}" -lt "${n}" ]; then
            node_ui_addr=$1
            set -- "$@" "${a}" "$1"; shift; i=$((i + 1))
          fi
          ;;
        --ui=*)
          node_ui_addr=${a#--ui=}
          set -- "$@" "${a}"
          ;;
        -ui=*)
          node_ui_addr=${a#-ui=}
          set -- "$@" "${a}"
          ;;
        --hub | -hub | --code | -code)
          if [ "${i}" -lt "${n}" ]; then
            shift; i=$((i + 1))
          fi
          ;;
        *) ;;
      esac
    done
    service node node "$@"
    say "    在 hub 的侧栏里能看到这台电脑了。"
    if [ "${node_ui_addr}" != "off" ]; then
      if [ -n "${node_ui_addr}" ]; then
        node_ui_host=""
        node_ui_port=17788
        case "${node_ui_addr}" in
          \[*\]:*)
            node_ui_host=${node_ui_addr%%\]*}
            node_ui_host=${node_ui_host#\[}
            p=${node_ui_addr##*\]:}
            case "${p}" in "" | *[!0-9]*) ;; *) node_ui_port=${p} ;; esac
            ;;
          \[*\])
            node_ui_host=${node_ui_addr#\[}
            node_ui_host=${node_ui_host%\]}
            ;;
          *:*:*)
            node_ui_host=${node_ui_addr}
            ;;
          *:*)
            node_ui_host=${node_ui_addr%:*}
            p=${node_ui_addr##*:}
            case "${p}" in "" | *[!0-9]*) ;; *) node_ui_port=${p} ;; esac
            ;;
        esac
        case "${node_ui_host}" in
          "" | 0.0.0.0 | ::)
            if has_ipv4_loopback; then node_ui_host=127.0.0.1; else node_ui_host=::1; fi
            ;;
        esac
        node_ui_url=$(format_http_url "${node_ui_host}" "${node_ui_port}")
      elif has_ipv4_loopback; then
        node_ui_url="http://127.0.0.1:17788"
      else
        node_ui_url="http://[::1]:17788"
      fi
      say "    本机界面：${node_ui_url}（用 Chrome 打开可以安装成 app）"
      check_herdr
      open_browser "${node_ui_url}"
    else
      check_herdr
    fi
    ;;
  hub)
    install_binary
    service hub serve "$@"
    hub_url=""
    hub_addr=""
    while [ $# -gt 0 ]; do
      case "$1" in
        -url | --url)
          if [ $# -ge 2 ]; then hub_url=$2; shift 2; else shift; fi ;;
        -url=*) hub_url=${1#-url=}; shift ;;
        --url=*) hub_url=${1#--url=}; shift ;;
        -addr | --addr)
          if [ $# -ge 2 ]; then hub_addr=$2; shift 2; else shift; fi ;;
        -addr=*) hub_addr=${1#-addr=}; shift ;;
        --addr=*) hub_addr=${1#--addr=}; shift ;;
        *) shift ;;
      esac
    done
    hub_port=7788
    hub_bind_host=""
    case "${hub_addr}" in
      \[*\]:*)
        hub_bind_host=${hub_addr%%\]*}
        hub_bind_host=${hub_bind_host#\[}
        p=${hub_addr##*\]:}
        case "${p}" in
          "" | *[!0-9]*) ;;
          *) hub_port=${p} ;;
        esac
        ;;
      \[*\])
        hub_bind_host=${hub_addr#\[}
        hub_bind_host=${hub_bind_host%\]}
        ;;
      *:*:*)
        hub_bind_host=${hub_addr}
        ;;
      *:*)
        hub_bind_host=${hub_addr%:*}
        p=${hub_addr##*:}
        case "${p}" in
          "" | *[!0-9]*) ;;
          *) hub_port=${p} ;;
        esac
        ;;
    esac
    case "${hub_bind_host}" in
      "" | ::)
        if has_ipv4_loopback; then
          local_url="http://127.0.0.1:${hub_port}"
        else
          local_url=$(format_http_url "::1" "${hub_port}")
        fi
        ;;
      0.0.0.0 | 127.0.0.1 | localhost)
        local_url="http://127.0.0.1:${hub_port}"
        ;;
      *)
        local_url=$(format_http_url "${hub_bind_host}" "${hub_port}")
        ;;
    esac
    if [ -n "${hub_url}" ]; then
      case "${hub_url}" in
        *://*)   main_url=${hub_url} ;;
        \[*\]:*) main_url="http://${hub_url}" ;;
        \[*\])   main_url=$(format_http_url "${hub_url}" "${hub_port}") ;;
        *:*:*)   main_url=$(format_http_url "${hub_url}" "${hub_port}") ;;
        *:*)     main_url="http://${hub_url}" ;;
        *)       main_url=$(format_http_url "${hub_url}" "${hub_port}") ;;
      esac
      open_url=${main_url}
    else
      case "${hub_bind_host}" in
        "" | 0.0.0.0 | ::) hub_ip=$(detect_ip) ;;
        localhost) hub_ip=127.0.0.1 ;;
        *) hub_ip=${hub_bind_host} ;;
      esac
      main_url=$(format_http_url "${hub_ip}" "${hub_port}")
      open_url=${local_url}
    fi
    if is_loopback_url "${main_url}"; then
      is_loopback=1
    else
      is_loopback=0
    fi
    say "    打开 hub：${main_url}"
    if [ -z "${SSH_CONNECTION:-}" ] && [ -z "${SSH_TTY:-}" ] && [ "${is_loopback}" -eq 0 ] && [ "${local_url}" != "${main_url}" ]; then
      say "    本机访问：${local_url}"
    fi
    say "    手机配对：collie pair（或在「设备」页扫码）。"
    say "    首次登录的令牌在 ~/.collie/token。"
    check_herdr "hub 本身照常能用"
    if can_open_browser; then
      hub_tok=$(wait_hub_token || true)
      if [ -n "${hub_tok}" ]; then
        open_target=$(append_token_query "${open_url}" "${hub_tok}")
        open_browser "${open_target}" "${local_url}" "${open_url}" "（已自动登录）"
      else
        open_browser "${open_url}" "${local_url}"
      fi
    fi
    ;;
  *)
    die "不认识的参数：${mode}（可以是 node、hub，或者不带参数）"
    ;;
esac
