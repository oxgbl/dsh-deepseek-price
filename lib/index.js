/**
 * dsh-deepseek-price —— Host 侧插件。
 *
 * 注册 `/price` 命令：在会话中输出当前 DeepSeek API 定价时段与价格表。
 * 客户端侧（lib/client.js）在 Web 界面侧边栏提供实时高峰/空闲徽标。
 *
 * 本插件刻意保持“绝不抛错”：apply 内的任何失败只记录日志，
 * 以免影响 DSH 启动（客户端模块扫描要求该 loader entry 正常激活）。
 */
import { buildReport } from './pricing.js';

/** 稳定 Cordis 插件名。 */
export const name = 'deepseek-price';

/** 需要 `commands` 服务（dsh-commands 提供，base 层已挂载）。 */
export const inject = ['commands'];

/** 注册 `/price` 命令。 */
export function apply(ctx) {
  try {
    const commands = ctx.commands;
    if (commands === undefined || typeof commands.register !== 'function') {
      ctx.logger?.warn?.('deepseek-price: commands 服务不可用，跳过 /price 命令注册');
      return;
    }
    commands.register({
      name: 'price',
      description: '显示当前 DeepSeek API 定价时段（高峰/空闲）与最新价格表',
      handler: () => ({ kind: 'success', text: buildReport(new Date()) }),
    });
    ctx.logger?.info?.('deepseek-price: /price 命令已注册');
  } catch (error) {
    ctx.logger?.warn?.(`deepseek-price: 命令注册失败: ${error instanceof Error ? error.message : String(error)}`);
  }
}
