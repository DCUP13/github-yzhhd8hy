import { useEffect, useState } from 'react';
import { X, Download, FileText, FileImage, File as FileIcon, Loader2 } from 'lucide-react';
import mammoth from 'mammoth';
import { supabase } from '../lib/supabase';

interface AttachmentViewerDialogProps {
  attachment: any;
  emailId?: string;
  source: 'inbox' | 'template';
  onClose: () => void;
}

const getIconForFormat = (format?: string, contentType?: string) => {
  const f = (format || '').toLowerCase();
  const ct = (contentType || '').toLowerCase();
  if (f === 'pdf' || ct.includes('pdf')) return <FileText className="w-5 h-5 text-red-500" />;
  if (f === 'docx' || ct.includes('word') || ct.includes('document')) return <FileText className="w-5 h-5 text-blue-500" />;
  if (f === 'txt' || ct.includes('text/plain')) return <FileText className="w-5 h-5 text-gray-500" />;
  if (ct.includes('image')) return <FileImage className="w-5 h-5 text-green-500" />;
  return <FileIcon className="w-5 h-5 text-gray-500" />;
};

const decodeBase64ToBytes = (b64: string): Uint8Array => {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

const htmlShell = (body: string) => `
<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
body{font-family:Arial,sans-serif;line-height:1.6;color:#111;max-width:800px;margin:0 auto;padding:24px;background:#fff;}
img{max-width:100%;height:auto;}
h1,h2,h3,h4{color:#111;margin-top:1.2em;margin-bottom:.5em;}
p{margin:1em 0;}
ul,ol{margin:1em 0;padding-left:2em;}
table{border-collapse:collapse;width:100%;}
td,th{border:1px solid #ddd;padding:6px;}
a{color:#2563eb;}
</style></head><body>${body}</body></html>`;

export function AttachmentViewerDialog({ attachment, emailId, source, onClose }: AttachmentViewerDialogProps) {
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewKind, setPreviewKind] = useState<'iframe' | 'image' | 'text' | 'unsupported'>('iframe');
  const [textContent, setTextContent] = useState<string>('');
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadFilename, setDownloadFilename] = useState<string>('');

  const displayName: string = attachment?.filename || attachment?.name || 'Attachment';
  const format: string | undefined = attachment?.format;
  const contentType: string | undefined = attachment?.contentType;

  useEffect(() => {
    let cancelled = false;
    const objectUrls: string[] = [];

    const pushUrl = (u: string) => {
      objectUrls.push(u);
      return u;
    };

    const loadTemplateAttachment = async () => {
      const fmt = (format || '').toLowerCase();
      const rawContent: string = attachment?.content || '';

      if (!rawContent) {
        setError('No content available for this attachment.');
        return;
      }

      let parsed: any = null;
      try {
        const maybe = JSON.parse(rawContent);
        if (maybe && typeof maybe === 'object') parsed = maybe;
      } catch {
        parsed = null;
      }

      const tryDecodeBase64 = (val: unknown): Uint8Array | null => {
        if (typeof val !== 'string' || !val) return null;
        const cleaned = val.replace(/^data:[^;]+;base64,/, '').replace(/\s+/g, '');
        if (!/^[A-Za-z0-9+/=]+$/.test(cleaned)) return null;
        try {
          return decodeBase64ToBytes(cleaned);
        } catch {
          return null;
        }
      };

      const setHtmlPreview = (html: string) => {
        const blob = new Blob([htmlShell(html)], { type: 'text/html' });
        const url = pushUrl(URL.createObjectURL(blob));
        setPreviewUrl(url);
        setPreviewKind('iframe');
      };

      if (fmt === 'docx') {
        const previewHtml = parsed && typeof parsed.preview === 'string' ? parsed.preview : '';
        const binary = parsed
          ? tryDecodeBase64(parsed.originalFile)
          : tryDecodeBase64(rawContent);

        let renderedHtml = '';
        if (binary) {
          try {
            const result = await mammoth.convertToHtml({ arrayBuffer: binary.buffer });
            if (cancelled) return;
            renderedHtml = (result.value || '').trim();
          } catch (err) {
            console.error('mammoth render failed:', err);
          }
        }

        if (!renderedHtml && previewHtml) renderedHtml = previewHtml;

        if (renderedHtml) {
          setHtmlPreview(renderedHtml);
        } else if (previewHtml) {
          setHtmlPreview(previewHtml);
        } else {
          setHtmlPreview('<p style="color:#666">No preview available. You can still download the attachment.</p>');
        }

        if (binary) {
          const fileBlob = new Blob([binary], {
            type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          });
          const dlUrl = pushUrl(URL.createObjectURL(fileBlob));
          setDownloadUrl(dlUrl);
          setDownloadFilename(displayName.toLowerCase().endsWith('.docx') ? displayName : `${displayName.replace(/\.[^.]+$/, '')}.docx`);
        } else {
          const fallbackBlob = new Blob([previewHtml || rawContent], { type: 'text/html' });
          const dlUrl = pushUrl(URL.createObjectURL(fallbackBlob));
          setDownloadUrl(dlUrl);
          setDownloadFilename(`${displayName.replace(/\.[^.]+$/, '')}.html`);
        }
        return;
      }

      if (fmt === 'pdf') {
        const binary =
          (parsed && tryDecodeBase64(parsed.originalFile)) ||
          (parsed && tryDecodeBase64(parsed.content)) ||
          tryDecodeBase64(rawContent);

        if (binary) {
          const blob = new Blob([binary], { type: 'application/pdf' });
          const url = pushUrl(URL.createObjectURL(blob));
          setPreviewUrl(url);
          setPreviewKind('iframe');
          setDownloadUrl(url);
          setDownloadFilename(displayName.toLowerCase().endsWith('.pdf') ? displayName : `${displayName.replace(/\.[^.]+$/, '')}.pdf`);
          return;
        }

        const previewHtml = parsed && typeof parsed.preview === 'string' ? parsed.preview : '';
        if (previewHtml) {
          setHtmlPreview(previewHtml);
          const dlBlob = new Blob([previewHtml], { type: 'text/html' });
          const dlUrl = pushUrl(URL.createObjectURL(dlBlob));
          setDownloadUrl(dlUrl);
          setDownloadFilename(`${displayName.replace(/\.[^.]+$/, '')}.html`);
          return;
        }

        setError('Unable to read PDF content for preview.');
        return;
      }

      if (fmt === 'txt' || fmt === 'text') {
        setPreviewKind('text');
        setTextContent(rawContent.replace(/<[^>]+>/g, ''));
        const blob = new Blob([rawContent], { type: 'text/plain' });
        const dlUrl = pushUrl(URL.createObjectURL(blob));
        setDownloadUrl(dlUrl);
        setDownloadFilename(`${displayName}.txt`);
        return;
      }

      const htmlSource =
        parsed && typeof parsed.preview === 'string' && parsed.preview
          ? parsed.preview
          : rawContent;
      setHtmlPreview(htmlSource);
      const dlBlob = new Blob([htmlSource], { type: 'text/html' });
      const dlUrl = pushUrl(URL.createObjectURL(dlBlob));
      setDownloadUrl(dlUrl);
      const ext = fmt || 'html';
      setDownloadFilename(`${displayName.replace(/\.[^.]+$/, '')}.${ext === 'pdf' ? 'html' : ext}`);
    };

    const loadInboxAttachment = async () => {
      if (!attachment?.s3_url || !emailId) {
        setError('Missing attachment location.');
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError('You must be signed in to view attachments.');
        return;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/download-attachment?s3_url=${encodeURIComponent(attachment.s3_url)}&email_id=${emailId}`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        const msg = await response.json().catch(() => ({ error: 'Failed' }));
        throw new Error(msg.error || 'Failed to generate download URL');
      }

      const { downloadUrl: signedUrl, filename } = await response.json();
      if (cancelled) return;

      setDownloadUrl(signedUrl);
      setDownloadFilename(filename || displayName);

      const ct = (contentType || '').toLowerCase();

      if (ct.includes('image')) {
        setPreviewUrl(signedUrl);
        setPreviewKind('image');
        return;
      }

      if (ct.includes('pdf') || ct.includes('text/plain') || ct.includes('html')) {
        setPreviewUrl(signedUrl);
        setPreviewKind('iframe');
        return;
      }

      if (ct.includes('word') || ct.includes('officedocument.wordprocessingml')) {
        try {
          const fileResp = await fetch(signedUrl);
          const buf = await fileResp.arrayBuffer();
          if (cancelled) return;
          const result = await mammoth.convertToHtml({ arrayBuffer: buf });
          const blob = new Blob([htmlShell(result.value)], { type: 'text/html' });
          const url = pushUrl(URL.createObjectURL(blob));
          setPreviewUrl(url);
          setPreviewKind('iframe');
          return;
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed to render DOCX preview.');
          return;
        }
      }

      setPreviewKind('unsupported');
    };

    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        if (source === 'template') {
          await loadTemplateAttachment();
        } else {
          await loadInboxAttachment();
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load attachment.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    run();

    return () => {
      cancelled = true;
      objectUrls.forEach(URL.revokeObjectURL);
    };
  }, [attachment, emailId, source, displayName, format, contentType]);

  const handleDownload = () => {
    if (!downloadUrl) return;
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = downloadFilename || displayName;
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-5xl h-[85vh] bg-white dark:bg-gray-800 rounded-xl shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3 min-w-0">
            {getIconForFormat(format, contentType)}
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                {displayName}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {(format || contentType || 'file').toString().toUpperCase()}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownload}
              disabled={!downloadUrl}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed rounded-lg transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              Download
            </button>
            <button
              onClick={onClose}
              className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto bg-gray-50 dark:bg-gray-900">
          {loading && (
            <div className="w-full h-full flex items-center justify-center">
              <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="text-sm">Loading preview...</span>
              </div>
            </div>
          )}

          {!loading && error && (
            <div className="w-full h-full flex items-center justify-center p-6">
              <div className="text-center">
                <p className="text-sm text-red-600 dark:text-red-400 mb-3">{error}</p>
                {downloadUrl && (
                  <button
                    onClick={handleDownload}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download instead
                  </button>
                )}
              </div>
            </div>
          )}

          {!loading && !error && previewKind === 'iframe' && previewUrl && (
            <iframe
              src={previewUrl}
              title={displayName}
              className="w-full h-full bg-white"
            />
          )}

          {!loading && !error && previewKind === 'image' && previewUrl && (
            <div className="w-full h-full flex items-center justify-center p-4">
              <img src={previewUrl} alt={displayName} className="max-w-full max-h-full object-contain" />
            </div>
          )}

          {!loading && !error && previewKind === 'text' && (
            <pre className="whitespace-pre-wrap break-words p-6 text-sm text-gray-800 dark:text-gray-200 font-mono">
              {textContent}
            </pre>
          )}

          {!loading && !error && previewKind === 'unsupported' && (
            <div className="w-full h-full flex items-center justify-center p-6">
              <div className="text-center">
                <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">
                  Inline preview isn't available for this file type.
                </p>
                {downloadUrl && (
                  <button
                    onClick={handleDownload}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download file
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
