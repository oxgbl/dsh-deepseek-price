/**
 * dsh-deepseek-price —— 定价时段与价格表（纯逻辑，无依赖）。
 *
 * 依据 DeepSeek 官方文档（https://api-docs.deepseek.com/zh-cn/quick_start/pricing/）：
 *   高峰时段：北京时间【周一至周五】9:00 - 12:00、14:00 - 18:00
 *   周末（周六/周日）全天空闲；空闲时段价格为高峰时段价格的一半。
 *
 * 注意：客户端 bundle（lib/client.js）内嵌了同一份逻辑（浏览器端自包含），
 * 修改本文件时请同步更新 lib/client.js 中的对应片段。
 */

/** 高峰时段窗口（分钟制，北京时间，仅工作日有效）。 */
export const PEAK_WINDOWS = Object.freeze([
  { start: 9 * 60, end: 12 * 60 }, // 09:00 – 12:00
  { start: 14 * 60, end: 18 * 60 }, // 14:00 – 18:00
]);

/** 工作日边界点（分钟制）：进入高峰 / 进入空闲 / 进入高峰 / 进入空闲。 */
const WEEKDAY_EDGES = Object.freeze([
  { at: 9 * 60, nextPeriod: 'peak' },
  { at: 12 * 60, nextPeriod: 'offpeak' },
  { at: 14 * 60, nextPeriod: 'peak' },
  { at: 18 * 60, nextPeriod: 'offpeak' },
]);

/** 星期标签（0=周日 … 6=周六）。 */
export const WEEKDAY_LABELS = Object.freeze(['周日', '周一', '周二', '周三', '周四', '周五', '周六']);

/**
 * 官方价格表（元 / 百万 tokens）。
 * 每个价格数组为 [空闲时段, 高峰时段]。
 */
export const MODELS = Object.freeze([
  Object.freeze({
    id: 'deepseek-v4-flash',
    name: 'DeepSeek-V4-Flash',
    cacheHit: Object.freeze([0.05, 0.1]),
    cacheMiss: Object.freeze([1.5, 3.0]),
    output: Object.freeze([4.5, 9.0]),
  }),
  Object.freeze({
    id: 'deepseek-v4-pro',
    name: 'DeepSeek-V4-Pro',
    cacheHit: Object.freeze([0.15, 0.3]),
    cacheMiss: Object.freeze([4.5, 9.0]),
    output: Object.freeze([13.5, 27.0]),
  }),
  Object.freeze({
    id: 'deepseek-v4-flash-vision-exp',
    name: 'DeepSeek-V4-Flash-Vision-Exp',
    cacheHit: Object.freeze([0.05, 0.1]),
    cacheMiss: Object.freeze([1.5, 3.0]),
    output: Object.freeze([4.5, 9.0]),
  }),
]);

/** 官方价格文档地址。 */
export const PRICING_URL = 'https://api-docs.deepseek.com/zh-cn/quick_start/pricing/';

/** 取任意 Date 的北京时间（Asia/Shanghai，UTC+8，无夏令时）自午夜起的分钟数（含秒的小数）。 */
export function beijingMinutes(date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Shanghai',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const get = (type) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const hour = get('hour') % 24;
  return hour * 60 + get('minute') + get('second') / 60;
}

/** 北京时间的星期（0=周日 … 6=周六）。用 UTC+8 偏移换算，避免受本机时区影响。 */
export function beijingWeekday(date) {
  return new Date(date.getTime() + 8 * 3600 * 1000).getUTCDay();
}

/** 是否为周末（周六/周日）——周末全天空闲（半价）。 */
export function isBeijingWeekend(date) {
  const weekday = beijingWeekday(date);
  return weekday === 0 || weekday === 6;
}

/** 判断某时刻所属时段。 */
export function periodAt(date) {
  const minutes = beijingMinutes(date);
  if (isBeijingWeekend(date)) return { period: 'offpeak', minutes, weekend: true };
  for (const w of PEAK_WINDOWS) {
    if (minutes >= w.start && minutes < w.end) {
      return { period: 'peak', minutes, weekend: false };
    }
  }
  return { period: 'offpeak', minutes, weekend: false };
}

/** 周末结束后距下一个工作日的天数（周五傍晚/周六/周日 → 周一 09:00 进入高峰）。 */
function daysUntilNextPeakDay(weekday, minutes) {
  if (weekday === 5) return minutes >= 18 * 60 ? 3 : 0; // 周五晚 → 下周一
  if (weekday === 6) return 2; // 周六 → 周一
  if (weekday === 0) return 1; // 周日 → 周一
  return 1; // 周一至周四晚 → 次日
}

/**
 * 下一个时段边界。
 * @param date - 任意 Date。
 * @returns {{ at: number, nextPeriod: 'peak'|'offpeak', daysAhead: number }}
 *   at 为当天(第 0 天)0 点起的分钟数；daysAhead 为跨过的整天数，
 *   实际剩余分钟 = daysAhead * 1440 + at - beijingMinutes(date)。
 *   周末整天无边界，直接落到下一个工作日的 09:00（进入高峰）。
 */
export function nextBoundary(date) {
  const weekday = beijingWeekday(date);
  const minutes = beijingMinutes(date);
  const weekend = weekday === 0 || weekday === 6;

  if (!weekend) {
    for (const b of WEEKDAY_EDGES) {
      if (minutes < b.at) return { at: b.at, nextPeriod: b.nextPeriod, daysAhead: 0 };
    }
    // 工作日 18:00 之后：下一个高峰在“下一个工作日”的 09:00
    const daysAhead = weekday === 5 ? 3 : 1;
    return { at: 9 * 60, nextPeriod: 'peak', daysAhead };
  }
  // 周末：下一个高峰是下周一 09:00
  const daysAhead = weekday === 6 ? 2 : 1;
  return { at: 9 * 60, nextPeriod: 'peak', daysAhead };
}

/** 将分钟数格式化为“X 小时 Y 分钟”（不足 1 小时只显示分钟）。 */
export function formatDuration(minutes) {
  const total = Math.max(0, Math.round(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h <= 0) return `${m} 分钟`;
  if (m === 0) return `${h} 小时`;
  return `${h} 小时 ${m} 分钟`;
}

/** 将分钟数格式化为 HH:MM（北京时间，跨天值自动回卷）。 */
export function formatClock(minutes) {
  const total = Math.round(minutes) % (24 * 60);
  const h = String(Math.floor(total / 60)).padStart(2, '0');
  const m = String(total % 60).padStart(2, '0');
  return `${h}:${m}`;
}

/** 北京时间完整时间串，如 2026-08-21 18:41:23。 */
export function beijingClockText(date) {
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`;
}

/** 边界可读文本：当天不带星期，跨天补“周X”。 */
function boundaryText(date, next) {
  const time = formatClock(next.at);
  if (next.daysAhead <= 0) return time;
  const target = (beijingWeekday(date) + next.daysAhead) % 7;
  return `${WEEKDAY_LABELS[target]} ${time}`;
}

/** 单行时段概要。 */
export function summaryLine(date) {
  const { period, minutes } = periodAt(date);
  const next = nextBoundary(date);
  const minutesLeft = next.daysAhead * 24 * 60 + next.at - minutes;
  const current = period === 'peak' ? '高峰时段（价格全额）' : '空闲时段（价格半价）';
  const nextLabel = next.nextPeriod === 'peak' ? '高峰时段' : '空闲时段';
  return {
    period,
    current,
    nextLabel,
    nextTime: boundaryText(date, next),
    nextClock: formatClock(next.at),
    daysAhead: next.daysAhead,
    minutesLeft,
    durationText: formatDuration(minutesLeft),
  };
}

/** 距空闲（半价）时段的状态行：高峰时是倒计时，空闲时提示已处于半价。 */
export function halfPriceStatus(date) {
  const s = summaryLine(date);
  const inOffPeak = s.period !== 'peak';
  return {
    inOffPeak,
    line: inOffPeak
      ? `当前即空闲（半价）时段；距高峰约 ${s.durationText}（${s.nextTime} 切换）`
      : `距空闲（半价）时段：约 ${s.durationText}（${s.nextTime} 切换）`,
  };
}

/** 多行完整报告（/price 命令输出）。 */
export function buildReport(date) {
  const { period } = periodAt(date);
  const s = summaryLine(date);
  const weekendNote = isBeijingWeekend(date) ? '（周末，全天空闲半价）' : '';
  const nextLabel = period === 'peak' ? '空闲时段（半价）' : '高峰时段';
  const lines = [
    `【DeepSeek API 定价时段】北京时间 ${beijingClockText(date)}${weekendNote}`,
    `当前：${s.current}`,
    halfPriceStatus(date).line,
    `下次切换：${s.nextTime} → ${nextLabel}，约 ${s.durationText} 后`,
    `高峰时段：周一至周五 09:00–12:00、14:00–18:00；周末全天空闲（价格为高峰的一半）`,
    '',
    '价格（元 / 百万 tokens，格式：空闲 / 高峰）：',
  ];
  for (const model of MODELS) {
    const fmt = (p) => `${p[0]} / ${p[1]}`;
    lines.push(
      `  ${model.name.padEnd(26)}输入(缓存命中) ${fmt(model.cacheHit).padEnd(12)}| 输入(未命中) ${fmt(model.cacheMiss).padEnd(12)}| 输出 ${fmt(model.output)}`,
    );
  }
  lines.push('', `数据来源：${PRICING_URL}`);
  return lines.join('\n');
}
