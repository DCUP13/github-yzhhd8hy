let toastContainer: HTMLDivElement | null = null;

function getContainer(): HTMLDivElement {
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:9999;display:flex;flex-direction:column;gap:8px;pointer-events:none;';
    document.body.appendChild(toastContainer);
  }
  return toastContainer;
}

type ToastType = 'success' | 'error' | 'info';

function show(type: ToastType, message: string, duration = 3500) {
  const container = getContainer();
  const el = document.createElement('div');
  const colors: Record<ToastType, string> = {
    success: 'background:#10b981;color:white;',
    error: 'background:#ef4444;color:white;',
    info: 'background:#3b82f6;color:white;',
  };
  el.style.cssText = `${colors[type]}padding:10px 16px;border-radius:8px;font-size:14px;font-family:system-ui,sans-serif;box-shadow:0 4px 12px rgba(0,0,0,0.15);pointer-events:auto;opacity:0;transition:opacity 0.2s;max-width:360px;`;
  el.textContent = message;
  container.appendChild(el);
  requestAnimationFrame(() => { el.style.opacity = '1'; });
  setTimeout(() => {
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 200);
  }, duration);
}

export const toast = {
  success: (msg: string) => show('success', msg),
  error: (msg: string) => show('error', msg),
  info: (msg: string) => show('info', msg),
};
