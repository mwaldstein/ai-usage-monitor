export function getRefreshIntervalMinutes(refreshInterval: string): number {
  const match = refreshInterval.match(/^\*\/(\d+) \* \* \* \*$/);
  if (match) {
    return parseInt(match[1], 10);
  }
  return 5;
}
