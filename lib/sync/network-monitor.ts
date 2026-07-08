export class NetworkMonitor {
  private callbacks: ((online: boolean) => void)[] = [];
  private online: boolean = true;

  startMonitoring(): void {
    if (typeof window !== 'undefined') {
      this.online = navigator.onLine;
      window.addEventListener('online', () => this.handleStatusChange(true));
      window.addEventListener('offline', () => this.handleStatusChange(false));
    }
  }

  stopMonitoring(): void {
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', () => this.handleStatusChange(true));
      window.removeEventListener('offline', () => this.handleStatusChange(false));
    }
  }

  isOnline(): boolean {
    return this.online;
  }

  onStatusChange(callback: (online: boolean) => void): void {
    this.callbacks.push(callback);
  }

  private handleStatusChange(online: boolean): void {
    this.online = online;
    this.callbacks.forEach(callback => callback(online));
  }
}