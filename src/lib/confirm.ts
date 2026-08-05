interface ConfirmOptions {
  message: string;
  variant?: 'default' | 'danger';
  confirmText?: string;
  cancelText?: string;
}

export function showConfirm(opts: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:9999;padding:16px;';

    const modal = document.createElement('div');
    modal.style.cssText = 'background:white;border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,0.3);max-width:400px;width:100%;padding:24px;font-family:system-ui,sans-serif;';

    const msg = document.createElement('p');
    msg.style.cssText = 'font-size:14px;color:#374151;margin:0 0 20px;white-space:pre-wrap;line-height:1.5;';
    msg.textContent = opts.message;
    modal.appendChild(msg);

    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;';

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = opts.cancelText || 'Cancel';
    cancelBtn.style.cssText = 'padding:8px 16px;font-size:14px;font-weight:500;border:1px solid #d1d5db;border-radius:8px;background:white;color:#374151;cursor:pointer;';
    cancelBtn.onclick = () => { overlay.remove(); resolve(false); };

    const confirmBtn = document.createElement('button');
    confirmBtn.textContent = opts.confirmText || 'Confirm';
    const dangerColor = opts.variant === 'danger' ? '#ef4444' : '#2563eb';
    confirmBtn.style.cssText = `padding:8px 16px;font-size:14px;font-weight:500;border:none;border-radius:8px;background:${dangerColor};color:white;cursor:pointer;`;
    confirmBtn.onclick = () => { overlay.remove(); resolve(true); };

    btnRow.appendChild(cancelBtn);
    btnRow.appendChild(confirmBtn);
    modal.appendChild(btnRow);
    overlay.appendChild(modal);

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) { overlay.remove(); resolve(false); }
    });

    document.body.appendChild(overlay);
  });
}
