export type ToastType = 'success' | 'error' | 'info';

export interface ToastDetail {
  message: string;
  type: ToastType;
}

export function showToast(message: string, type: ToastType = 'info'): void {
  console.log(`[${type}] ${message}`);
  // Simple implementation - can be enhanced with a toast library later
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent<ToastDetail>('toast', { detail: { message, type } }),
    );
  }
}
