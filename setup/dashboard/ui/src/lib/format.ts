export function size(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const i = Math.min(Math.floor(Math.log(value) / Math.log(1024)), 4);
  return `${(value / 1024 ** i).toFixed(i ? 1 : 0)} ${["B", "KB", "MB", "GB", "TB"][i]}`;
}
export function uptime(seconds: number) {
  const d = Math.floor(seconds / 86400),
    h = Math.floor((seconds % 86400) / 3600),
    m = Math.floor((seconds % 3600) / 60);
  return d ? `${d} 天 ${h} 小时` : `${h} 小时 ${m} 分钟`;
}
