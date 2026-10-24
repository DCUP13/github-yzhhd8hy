import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Eye, MoreHorizontal } from 'lucide-react';

export interface ThreadMessage {
  id: string;
  direction: 'in' | 'out';
  from: string;
  to: string;
  body: string;
  time: string;
  openCount?: number;
}

const HTML_PATTERN = /<\/?(html|head|body|p|br|div|span|b|strong|i|em|u|a|ul|ol|li|blockquote|h[1-6]|pre|code|hr|font|img|table|tbody|thead|tr|td|th|center|style|meta)(\s[^>]*)?\/?>/i;
const HTML_QUOTE_MARKERS = [/---\s*Original Message\s*---/i, /<blockquote/i, /<div[^>]+class="[^"]*gmail_quote/i, /<div[^>]+id="divRplyFwdMsg"/i];
const TEXT_QUOTE_START = /^(On .+wrote:|-+\s*Original Message\s*-+|>)/i;

function splitQuoted(body: string): { main: string; quoted: string } {
  if (HTML_PATTERN.test(body)) {
    let cut = -1;
    for (const marker of HTML_QUOTE_MARKERS) {
      const idx = body.search(marker);
      if (idx >= 0 && (cut < 0 || idx < cut)) cut = idx;
    }
    if (cut <= 0) return { main: body, quoted: '' };
    return { main: body.slice(0, cut), quoted: body.slice(cut) };
  }
  const lines = body.split('\n');
  const start = lines.findIndex((line) => TEXT_QUOTE_START.test(line.trim()));
  if (start <= 0) return { main: body, quoted: '' };
  return { main: lines.slice(0, start).join('\n').trimEnd(), quoted: lines.slice(start).join('\n') };
}

function toSnippet(body: string): string {
  const { main } = splitQuoted(body || '');
  const text = HTML_PATTERN.test(main)
    ? (new DOMParser().parseFromString(main, 'text/html').body.textContent || '')
    : main;
  return text.replace(/\s+/g, ' ').trim().slice(0, 160);
}

function displayName(address: string): string {
  const match = address.match(/^\s*"?([^"<]+?)"?\s*</);
  if (match) return match[1].trim();
  return address.split('@')[0] || address;
}

function HtmlFrame({ html }: { html: string }) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(40);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    let observer: ResizeObserver | null = null;
    const measure = () => {
      const doc = frame.contentDocument;
      if (doc?.body) setHeight(Math.max(doc.documentElement.scrollHeight, doc.body.scrollHeight) + 4);
    };
    const onLoad = () => {
      measure();
      const body = frame.contentDocument?.body;
      if (body && 'ResizeObserver' in window) {
        observer = new ResizeObserver(measure);
        observer.observe(body);
      }
    };
    frame.addEventListener('load', onLoad);
    return () => {
      frame.removeEventListener('load', onLoad);
      observer?.disconnect();
    };
  }, [html]);

  const srcDoc = `<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><style>
    html,body{margin:0;padding:0;background:#fff;}
    body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.5;color:#1f2937;word-wrap:break-word;overflow-wrap:anywhere;}
    img{max-width:100%;height:auto;} table{max-width:100%;} a{color:#2563eb;} pre{white-space:pre-wrap;}
    blockquote{margin:8px 0;padding-left:12px;border-left:3px solid #e5e7eb;color:#4b5563;}
  </style></head><body>${html}</body></html>`;

  return (
    <iframe
      ref={frameRef}
      title="Email content"
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      srcDoc={srcDoc}
      style={{ height }}
      className="w-full border-0 rounded-md bg-white"
    />
  );
}

const SIMPLE_TAGS = new Set([
  'p', 'br', 'div', 'span', 'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'a', 'ul', 'ol', 'li',
  'blockquote', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'pre', 'code', 'hr', 'font', 'sub', 'sup', 'small',
  'img', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'center',
]);
const DROPPED_TAGS = new Set(['script', 'style', 'link', 'meta', 'title', 'head', 'iframe', 'object', 'embed', 'form', 'svg']);
const SAFE_HREF = /^(https?:|mailto:|tel:)/i;
const SAFE_SRC = /^https:/i;

function isDesignedHtml(html: string): boolean {
  return /<style[\s>]|<link\s[^>]*stylesheet/i.test(html);
}

function sanitizeSimpleHtml(html: string): string {
  const source = new DOMParser().parseFromString(html, 'text/html').body;
  const out = document.createElement('div');
  const copy = (from: Node, to: Node) => {
    from.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        to.appendChild(document.createTextNode(child.textContent || ''));
        return;
      }
      if (child.nodeType !== Node.ELEMENT_NODE) return;
      const tag = (child as Element).tagName.toLowerCase();
      if (DROPPED_TAGS.has(tag)) return;
      if (tag === 'img') {
        const src = ((child as Element).getAttribute('src') || '').trim();
        if (!SAFE_SRC.test(src)) return;
        const img = document.createElement('img');
        img.setAttribute('src', src);
        img.setAttribute('alt', (child as Element).getAttribute('alt') || '');
        img.setAttribute('loading', 'lazy');
        to.appendChild(img);
        return;
      }
      if (!SIMPLE_TAGS.has(tag)) {
        copy(child, to);
        return;
      }
      const el = document.createElement(tag === 'font' ? 'span' : tag === 'center' ? 'div' : tag);
      if (tag === 'a') {
        const href = (child as Element).getAttribute('href') || '';
        if (SAFE_HREF.test(href.trim())) {
          el.setAttribute('href', href.trim());
          el.setAttribute('target', '_blank');
          el.setAttribute('rel', 'noopener noreferrer');
        }
      }
      copy(child, el);
      to.appendChild(el);
    });
  };
  copy(source, out);
  return out.innerHTML;
}

function BodyContent({ content }: { content: string }) {
  if (!content.trim()) return null;
  if (HTML_PATTERN.test(content)) {
    if (isDesignedHtml(content)) return <HtmlFrame html={content} />;
    return (
      <div
        className="text-sm leading-relaxed text-gray-800 dark:text-gray-200 break-words [overflow-wrap:anywhere] [&_p]:my-2 [&_p:first-child]:mt-0 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_a]:text-blue-600 dark:[&_a]:text-blue-400 [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-gray-300 dark:[&_blockquote]:border-gray-600 [&_blockquote]:pl-3 [&_blockquote]:text-gray-600 dark:[&_blockquote]:text-gray-400 [&_pre]:whitespace-pre-wrap [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:text-base [&_h2]:font-semibold [&_h3]:font-semibold [&_img]:max-w-full [&_img]:h-auto [&_img]:inline-block [&_img]:rounded [&_table]:max-w-full [&_td]:align-top [&_td]:pr-2"
        dangerouslySetInnerHTML={{ __html: sanitizeSimpleHtml(content) }}
      />
    );
  }
  return (
    <div className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-sm leading-relaxed text-gray-800 dark:text-gray-200">
      {content}
    </div>
  );
}

export function EmailBody({ body, collapseQuoted = true }: { body: string; collapseQuoted?: boolean }) {
  const [showQuoted, setShowQuoted] = useState(false);
  if (!body?.trim()) {
    return <p className="text-sm italic text-gray-500 dark:text-gray-400">No content available</p>;
  }
  const { main, quoted } = collapseQuoted ? splitQuoted(body) : { main: body, quoted: '' };
  return (
    <div className="space-y-2">
      <BodyContent content={main} />
      {quoted && (
        <>
          <button
            type="button"
            onClick={() => setShowQuoted((v) => !v)}
            title={showQuoted ? 'Hide quoted text' : 'Show quoted text'}
            className="inline-flex items-center px-2 py-0.5 rounded-md bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 transition-colors"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
          {showQuoted && (
            <div className="pl-3 border-l-2 border-gray-200 dark:border-gray-600 opacity-90">
              <BodyContent content={quoted} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

function MessageCard({ message, expanded, onToggle, isCurrent }: { message: ThreadMessage; expanded: boolean; onToggle: () => void; isCurrent: boolean }) {
  const outgoing = message.direction === 'out';
  const name = outgoing ? 'You' : displayName(message.from);
  const initial = (outgoing ? message.from : name).trim().charAt(0).toUpperCase() || '?';

  return (
    <div
      className={`rounded-xl border transition-all duration-200 ${
        isCurrent
          ? 'border-blue-200 dark:border-blue-800 bg-white dark:bg-gray-800 shadow-sm'
          : 'border-gray-200 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-800/60 hover:bg-white dark:hover:bg-gray-800'
      }`}
    >
      <button type="button" onClick={onToggle} className="w-full flex items-start gap-3 p-3 sm:p-4 text-left">
        <span
          className={`flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold ${
            outgoing ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
          }`}
        >
          {initial}
        </span>
        <span className="flex-1 min-w-0">
          <span className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-sm font-semibold text-gray-900 dark:text-white">{name}</span>
            <span className="text-xs text-gray-500 dark:text-gray-400 truncate">{outgoing ? `to ${message.to}` : message.from}</span>
          </span>
          {!expanded && (
            <span className="block mt-0.5 text-sm text-gray-600 dark:text-gray-400 truncate">{toSnippet(message.body) || '(No content)'}</span>
          )}
        </span>
        <span className="flex items-center gap-2 flex-shrink-0">
          {outgoing && (message.openCount ?? 0) > 0 && (
            <span title={`Opened ${message.openCount} time${message.openCount !== 1 ? 's' : ''}`} className="inline-flex items-center gap-0.5 text-xs text-blue-600 dark:text-blue-400">
              <Eye className="w-3.5 h-3.5" />
              {message.openCount}
            </span>
          )}
          <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">{new Date(message.time).toLocaleString()}</span>
          <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
        </span>
      </button>
      {expanded && (
        <div className="px-3 sm:px-4 pb-4 sm:pl-16">
          <EmailBody body={message.body} />
        </div>
      )}
    </div>
  );
}

export function EmailThread({ messages, currentId }: { messages: ThreadMessage[]; currentId: string }) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set([currentId]));
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    setExpandedIds(new Set([currentId]));
    setShowAll(false);
  }, [currentId]);

  const toggle = (id: string) =>
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const hiddenCount = !showAll && messages.length > 4 ? messages.length - 3 : 0;
  const visible = hiddenCount > 0 ? [messages[0], ...messages.slice(hiddenCount + 1)] : messages;

  return (
    <div className="space-y-2">
      {messages.length > 1 && (
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
          Conversation · {messages.length} messages
        </p>
      )}
      {visible.map((message, index) => (
        <div key={message.id}>
          <MessageCard
            message={message}
            isCurrent={message.id === currentId}
            expanded={expandedIds.has(message.id)}
            onToggle={() => toggle(message.id)}
          />
          {hiddenCount > 0 && index === 0 && (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="w-full mt-2 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 rounded-lg border border-dashed border-gray-300 dark:border-gray-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
            >
              Show {hiddenCount} earlier message{hiddenCount !== 1 ? 's' : ''}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
