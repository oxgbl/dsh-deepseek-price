/**
 * dsh-deepseek-price —— Client 侧插件（浏览器 bundle，自包含，无外部 import）。
 *
 * 在 Web 界面侧边栏底部（sidebar.footer.action 插槽）渲染一个实时徽标：
 *   - 高峰时段：琥珀色圆点 + “距半价 X小时Y分”倒计时
 *   - 空闲时段：绿色圆点 + “空闲·半价”
 * 悬停（title）显示完整时段信息与价格表；点击弹出时段详情面板
 * （当前时段、距半价倒计时、价格表）；每 10 秒刷新一次。
 *
 * 时段规则（北京时间，Asia/Shanghai）：
 *   高峰时段 09:00–12:00、14:00–18:00；其余为空闲时段，价格为高峰的一半。
 * 与 lib/pricing.js 保持同一份逻辑（浏览器 bundle 必须自包含）。
 */
window.__ModuleLoader__.load({
  id: "dsh-deepseek-price",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    let react = require("react");

    // ===== 定价逻辑（与 lib/pricing.js 同步） =====
    var PEAK_WINDOWS = [
      { start: 540, end: 720 }, // 09:00 – 12:00
      { start: 840, end: 1080 }, // 14:00 – 18:00
    ];
    var MODELS = [
      { id: "deepseek-v4-flash", name: "DeepSeek-V4-Flash", cacheHit: [0.05, 0.1], cacheMiss: [1.5, 3.0], output: [4.5, 9.0] },
      { id: "deepseek-v4-pro", name: "DeepSeek-V4-Pro", cacheHit: [0.15, 0.3], cacheMiss: [4.5, 9.0], output: [13.5, 27.0] },
      { id: "deepseek-v4-flash-vision-exp", name: "DeepSeek-V4-Flash-Vision-Exp", cacheHit: [0.05, 0.1], cacheMiss: [1.5, 3.0], output: [4.5, 9.0] },
    ];
    var PRICING_URL = "https://api-docs.deepseek.com/zh-cn/quick_start/pricing/";
    var PRICING_TZ = "Asia/Shanghai";

    function beijingMinutes(date) {
      var parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: PRICING_TZ,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }).formatToParts(date);
      var hour = 0;
      var minute = 0;
      var second = 0;
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i];
        if (p.type === "hour") hour = Number(p.value) % 24;
        else if (p.type === "minute") minute = Number(p.value);
        else if (p.type === "second") second = Number(p.value);
      }
      return hour * 60 + minute + second / 60;
    }

    function periodAt(date) {
      var minutes = beijingMinutes(date);
      for (var i = 0; i < PEAK_WINDOWS.length; i++) {
        var w = PEAK_WINDOWS[i];
        if (minutes >= w.start && minutes < w.end) return { period: "peak", minutes: minutes };
      }
      return { period: "offpeak", minutes: minutes };
    }

    function nextBoundary(minutes) {
      var boundaries = [
        { at: 540, nextPeriod: "peak" },
        { at: 720, nextPeriod: "offpeak" },
        { at: 840, nextPeriod: "peak" },
        { at: 1080, nextPeriod: "offpeak" },
      ];
      for (var i = 0; i < boundaries.length; i++) {
        if (minutes < boundaries[i].at) return boundaries[i];
      }
      return { at: 24 * 60 + 540, nextPeriod: "peak" };
    }

    function formatDuration(minutes) {
      var total = Math.max(0, Math.round(minutes));
      var h = Math.floor(total / 60);
      var m = total % 60;
      if (h <= 0) return m + " 分钟";
      if (m === 0) return h + " 小时";
      return h + " 小时 " + m + " 分钟";
    }

    /** 紧凑时长：1小时23分 / 45分 / 2小时（徽标倒计时用）。 */
    function compactDuration(minutes) {
      var total = Math.max(0, Math.round(minutes));
      var h = Math.floor(total / 60);
      var m = total % 60;
      if (h <= 0) return m + "分";
      if (m === 0) return h + "小时";
      return h + "小时" + m + "分";
    }

    function formatClock(minutes) {
      var total = Math.round(minutes) % (24 * 60);
      var h = String(Math.floor(total / 60)).padStart(2, "0");
      var m = String(total % 60).padStart(2, "0");
      return h + ":" + m;
    }

    function beijingClockText(date) {
      var parts = new Intl.DateTimeFormat("zh-CN", {
        timeZone: PRICING_TZ,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }).formatToParts(date);
      var out = { year: "", month: "", day: "", hour: "", minute: "", second: "" };
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i];
        if (Object.prototype.hasOwnProperty.call(out, p.type)) out[p.type] = p.value;
      }
      return out.year + "-" + out.month + "-" + out.day + " " + out.hour + ":" + out.minute + ":" + out.second;
    }

    function summaryLine(date) {
      var st = periodAt(date);
      var next = nextBoundary(st.minutes);
      var isPeak = st.period === "peak";
      return {
        period: st.period,
        currentLabel: isPeak ? "高峰时段（价格全额）" : "空闲时段（价格半价）",
        nextLabel: next.nextPeriod === "peak" ? "高峰时段" : "空闲时段",
        nextTime: formatClock(next.at),
        minutesLeft: next.at - st.minutes,
        durationText: formatDuration(next.at - st.minutes),
      };
    }

    /** 距空闲（半价）时段的状态行：高峰时是倒计时，空闲时提示已处于半价。 */
    function halfPriceStatus(date) {
      var s = summaryLine(date);
      var inOffPeak = s.period !== "peak";
      return {
        inOffPeak: inOffPeak,
        line: inOffPeak
          ? "当前即空闲（半价）时段；距高峰约 " + s.durationText + "（" + s.nextTime + " 切换）"
          : "距空闲（半价）时段：约 " + s.durationText + "（" + s.nextTime + " 切换）",
      };
    }

    function buildTitle(date) {
      var s = summaryLine(date);
      var lines = [
        "DeepSeek API 定价（北京时间 " + beijingClockText(date) + "）",
        "当前：" + s.currentLabel,
        "下次切换：" + s.nextTime + " → " + s.nextLabel + "，约 " + s.durationText + " 后",
        "高峰时段：09:00–12:00、14:00–18:00（其余空闲，价格减半）",
        "",
        "价格（元/百万 tokens，空闲 / 高峰）：",
      ];
      for (var i = 0; i < MODELS.length; i++) {
        var m = MODELS[i];
        lines.push(
          m.name +
            " 输入(命中) " + m.cacheHit[0] + "/" + m.cacheHit[1] +
            "  输入(未命中) " + m.cacheMiss[0] + "/" + m.cacheMiss[1] +
            "  输出 " + m.output[0] + "/" + m.output[1],
        );
      }
      lines.push("", "数据来源：" + PRICING_URL);
      return lines.join("\n");
    }

    /** 点击面板内容（React 元素数组）。 */
    function buildPanel(date) {
      var s = summaryLine(date);
      var hp = halfPriceStatus(date);
      var lines = [
        react.createElement("div", { key: "t", style: { fontWeight: 600 } }, "DeepSeek API 定价 · 北京时间 " + beijingClockText(date)),
        react.createElement("div", { key: "c" }, "当前：" + s.currentLabel),
        react.createElement("div", { key: "h", style: { color: hp.inOffPeak ? "#10b981" : "#f59e0b" } }, hp.line),
        react.createElement("div", { key: "w" }, "高峰时段：09:00–12:00、14:00–18:00（其余空闲，价格减半）"),
        react.createElement("div", { key: "b", style: { marginTop: "8px" } }, "价格（元/百万 tokens，空闲 / 高峰）："),
      ];
      for (var i = 0; i < MODELS.length; i++) {
        var m = MODELS[i];
        lines.push(
          react.createElement("div", { key: "m" + i },
            m.name + "  输入(命中) " + m.cacheHit[0] + "/" + m.cacheHit[1] + "  输入(未命中) " + m.cacheMiss[0] + "/" + m.cacheMiss[1] + "  输出 " + m.output[0] + "/" + m.output[1]),
        );
      }
      lines.push(react.createElement("div", { key: "s", style: { marginTop: "8px", opacity: 0.65 } }, "数据来源：" + PRICING_URL));
      return lines;
    }

    // ===== 侧边栏徽标组件 =====
    function PriceBadge(props) {
      var wide = !!(props && props.wide);
      var state = react.useState(function () { return new Date(); });
      var now = state[0];
      var setNow = state[1];
      var openState = react.useState(false);
      var open = openState[0];
      var setOpen = openState[1];
      react.useEffect(function () {
        var timer = setInterval(function () {
          setNow(new Date());
        }, 10000);
        return function () { clearInterval(timer); };
      }, []);
      var s;
      var hp;
      try {
        s = summaryLine(now);
        hp = halfPriceStatus(now);
      } catch (err) {
        return null;
      }
      var isPeak = s.period === "peak";
      var dotColor = isPeak ? "#f59e0b" : "#10b981";
      // 高峰时徽标直接显示距半价倒计时；空闲时显示“空闲·半价”。
      var wideLabel = isPeak ? "距半价 " + compactDuration(s.minutesLeft) : "空闲·半价";
      var title = buildTitle(now);
      var button = react.createElement(
        "button",
        {
          type: "button",
          title: title,
          "aria-label": title,
          "aria-expanded": open,
          onClick: function () { setOpen(!open); },
          style: {
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            padding: wide ? "5px 8px" : "4px",
            border: "none",
            borderRadius: "8px",
            background: "transparent",
            color: "inherit",
            cursor: "pointer",
            fontSize: "12px",
            lineHeight: "16px",
            whiteSpace: "nowrap",
            flex: "0 0 auto",
            minWidth: "0",
          },
          onMouseEnter: function (e) { e.currentTarget.style.background = "rgba(127,127,127,0.14)"; },
          onMouseLeave: function (e) { e.currentTarget.style.background = "transparent"; },
        },
        react.createElement("span", {
          style: {
            display: "inline-block",
            width: "8px",
            height: "8px",
            borderRadius: "50%",
            background: dotColor,
            boxShadow: "0 0 0 1px rgba(0,0,0,0.15), 0 0 6px " + dotColor,
            flex: "none",
          },
        }),
        wide ? react.createElement("span", { style: { overflow: "hidden", textOverflow: "ellipsis" } }, wideLabel) : null,
      );
      if (!open) return button;
      // 点击弹出的时段详情面板：全屏透明遮罩点击关闭，面板锚定在侧边栏底部左侧。
      return react.createElement(
        react.Fragment,
        null,
        button,
        react.createElement("div", {
          style: { position: "fixed", inset: "0", zIndex: 1190 },
          onClick: function () { setOpen(false); },
        }, react.createElement("div", {
          role: "dialog",
          "aria-label": "DeepSeek API 定价时段",
          onClick: function (e) { e.stopPropagation(); },
          style: {
            position: "fixed",
            left: "12px",
            bottom: "52px",
            width: "340px",
            maxWidth: "calc(100vw - 24px)",
            boxSizing: "border-box",
            padding: "12px 14px",
            borderRadius: "12px",
            border: "1px solid var(--dsw-alias-border-l2)",
            background: "var(--dsw-specific-menu)",
            color: "var(--dsw-alias-label-primary)",
            boxShadow: "0 10px 32px rgba(0,0,0,0.28)",
            fontSize: "12px",
            lineHeight: "20px",
            zIndex: 1200,
          },
        }, buildPanel(now))),
      );
    }

    // ===== 插件入口 =====
    var inject = ["slots"];

    function apply(ctx) {
      try {
        ctx.slots.inject("sidebar.footer.action", function () {
          return ctx.slots.register({
            name: "sidebar.footer.action",
            id: "deepseek-price",
            // 排在行首：同行的 cordis-panel / 插件市场 是全宽格（flex:none, width:100%），
            // 排最后会被挤出可见区（侧边栏 root 不裁剪，直接溢出到会话列）。
            order: -10,
            label: function () {
              try {
                var s = summaryLine(new Date());
                return s.period === "peak" ? "高峰时段" : "空闲时段·半价";
              } catch (err) {
                return "DeepSeek 定价时段";
              }
            },
          }, PriceBadge);
        });
      } catch (error) {
        if (typeof console !== "undefined") {
          console.warn("[deepseek-price] 客户端插件注册失败:", error);
        }
      }
    }

    exports.apply = apply;
    exports.inject = inject;
    exports.PriceBadge = PriceBadge;
    exports.summaryLine = summaryLine;
    exports.halfPriceStatus = halfPriceStatus;
    exports.buildTitle = buildTitle;
    exports.buildPanel = buildPanel;
    exports.periodAt = periodAt;
    return module.exports;
  }
});
