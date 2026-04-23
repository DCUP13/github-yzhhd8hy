function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function wrapHtmlForDocx(bodyHtml: string): string {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body>${bodyHtml}</body></html>`;
}

export async function htmlToDocxJsonContent(html: string): Promise<string> {
  const mod = await import('html-docx-js-typescript');
  const result = await mod.asBlob(wrapHtmlForDocx(html));
  const blob = result instanceof Blob ? result : new Blob([result as unknown as ArrayBuffer]);
  const base64 = await blobToBase64(blob);
  return JSON.stringify({
    originalFile: base64,
    preview: html,
  });
}

export function getDocxPreviewHtml(content: string): string {
  try {
    const parsed = JSON.parse(content);
    if (parsed && typeof parsed.preview === 'string') {
      return parsed.preview;
    }
  } catch {
    // fall through
  }
  return content;
}
