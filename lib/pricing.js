/**
 * dsh-deepseek-price —— 定价时段与价格表（纯逻辑，无依赖）。
 *
 * 依据 DeepSeek 官方文档（https://api-docs.deepseek.com/zh-cn/quick_start/pricing/）：
 *   高峰时段：北京时间 9:00 - 12:00、14:00 - 18:00（其余为空闲时段）
 *   空闲时段价格为高峰时段价格的一半。
 *
 * 注意：客户端 bundle（lib/client.js）内嵌了同一份逻辑（浏览器端自包含），
 * 修改本文件时请同步更新 lib/client.js 中的对应片段。
 */

/** 高峰时段窗口（分钟制，北京时间）。 */
export const PEAK_WINDOWS = Object.freeze([
  { start: 9 * 60, end: 12 * 60 }, // 09:00 – 12:00
  { start: 14 * 60, end: 18 * 60 }, // 14:00 – 18:00
]);

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

/** 判断某时刻所属时段。 */
export function periodAt(date) {
  const minutes = beijingMinutes(date);
  for (const w of PEAK_WINDOWS) {
    if (minutes >= w.start && minutes < w.end) {
      return { period: 'peak', minutes };
    }
  }
  return { period: 'offpeak', minutes };
}

/**
 * 下一个时段边界（分钟制，北京时间）。
 * @returns {{ at: number, nextPeriod: 'peak'|'offpeak' }} at 可能超过 1440（跨天到次日 09:00）。
 */
export function nextBoundary(minutes) {
  const boundaries = [
    { at: 9 * 60, nextPeriod: 'peak' },
    { at: 12 * 60, nextPeriod: 'offpeak' },
    { at: 14 * 60, nextPeriod: 'peak' },
    { at: 18 * 60, nextPeriod: 'offpeak' },
  ];
  for (const b of boundaries) {
    if (minutes < b.at) return b;
  }
  // 18:00 之后跨天到次日 09:00
  return { at: 24 * 60 + 9 * 60, nextPeriod: 'peak' };
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

/** 单行时段概要。 */
export function summaryLine(date) {
  const { period, minutes } = periodAt(date);
  const next = nextBoundary(minutes);
  const current = period === 'peak' ? '高峰时段（价格全额）' : '空闲时段（价格半价）';
  const nextLabel = next.nextPeriod === 'peak' ? '高峰时段' : '空闲时段';
  return {
    period,
    current,
    nextLabel,
    nextTime: formatClock(next.at),
    minutesLeft: next.at - minutes,
    durationText: formatDuration(next.at - minutes),
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
  const { period, minutes } = periodAt(date);
  const next = nextBoundary(minutes);
  const current = period === 'peak' ? '高峰时段（价格全额）' : '空闲时段（价格半价）';
  const nextLabel = next.nextPeriod === 'peak' ? '高峰时段' : '空闲时段';
  const lines = [
    `【DeepSeek API 定价时段】北京时间 ${beijingClockText(date)}`,
    `当前：${current}`,
    halfPriceStatus(date).line,
    `下次切换：${formatClock(next.at)} → ${nextLabel}，约 ${formatDuration(next.at - minutes)} 后`,
    `高峰时段：09:00–12:00、14:00–18:00（其余为空闲时段，价格为高峰的一半）`,
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
