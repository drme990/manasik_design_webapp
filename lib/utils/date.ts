export function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('ar-SA');
}

export function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('ar-SA');
}