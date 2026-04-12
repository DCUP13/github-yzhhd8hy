import React, { forwardRef, useImperativeHandle, useRef, useEffect } from 'react';
import { Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight, AlignJustify, List, ListOrdered, Type } from 'lucide-react';

export interface RichTextEditorRef {
  getContent: () => string;
  setContent: (html: string) => void;
}

interface RichTextEditorProps {
  content: string;
  className?: string;
}

const fontFamilies = [
  { name: 'Default', value: '' },
  { name: 'Arial', value: 'Arial' },
  { name: 'Times New Roman', value: 'Times New Roman' },
  { name: 'Courier New', value: 'Courier New' },
  { name: 'Georgia', value: 'Georgia' },
  { name: 'Verdana', value: 'Verdana' },
  { name: 'Impact', value: 'Impact' }
];

const fontSizes = [
  { name: 'Small', value: '1', pixels: 12 },
  { name: 'Normal', value: '2', pixels: 14 },
  { name: 'Medium', value: '3', pixels: 16 },
  { name: 'Large', value: '4', pixels: 18 },
  { name: 'X-Large', value: '5', pixels: 24 },
  { name: 'XX-Large', value: '6', pixels: 32 },
  { name: 'XXX-Large', value: '7', pixels: 48 }
];

const getFontSize = (element: HTMLElement): string => {
  const computedSize = parseInt(window.getComputedStyle(element).fontSize);
  
  // Find the closest matching font size
  const matchingSize = fontSizes.reduce((prev, curr) => {
    return Math.abs(curr.pixels - computedSize) < Math.abs(prev.pixels - computedSize) ? curr : prev;
  });
  
  return matchingSize.value;
};

const getActiveStyles = (selection: Selection, editorElement: HTMLElement | null): {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  list: string;
  align: string;
  fontFamily: string;
  fontSize: string;
} => {
  const range = selection.getRangeAt(0);
  const container = range.commonAncestorContainer;
  let element = container.nodeType === Node.TEXT_NODE ? container.parentElement : container as HTMLElement;

  // Initialize styles with defaults
  const styles = {
    bold: false,
    italic: false,
    underline: false,
    list: '',
    align: 'left',
    fontFamily: '',
    fontSize: '2' // Default to Normal size
  };

  // If no element is found, return default styles
  if (!element) return styles;

  // Get computed styles
  const computedStyle = window.getComputedStyle(element);

  // Check font size
  styles.fontSize = getFontSize(element);

  // Check other styles
  styles.bold = computedStyle.fontWeight === 'bold' || parseInt(computedStyle.fontWeight) >= 700;
  styles.italic = computedStyle.fontStyle === 'italic';
  styles.underline = computedStyle.textDecoration.includes('underline');
  styles.align = computedStyle.textAlign;

  // Check font family
  const fontName = computedStyle.fontFamily.split(',')[0].replace(/['"]/g, '');
  const matchingFont = fontFamilies.find(font => 
    font.value && fontName.toLowerCase().includes(font.value.toLowerCase())
  );
  if (matchingFont) {
    styles.fontFamily = matchingFont.value;
  }

  // Check for list context
  let listNode = element;
  while (listNode && listNode !== editorElement) {
    if (listNode.nodeName === 'UL') {
      styles.list = 'unordered';
      break;
    } else if (listNode.nodeName === 'OL') {
      styles.list = 'ordered';
      break;
    }
    listNode = listNode.parentElement!;
  }

  return styles;
};

export const RichTextEditor = forwardRef<RichTextEditorRef, RichTextEditorProps>(
  ({ content, className = '' }, ref) => {
    const editorRef = useRef<HTMLDivElement>(null);
    const [activeStyles, setActiveStyles] = React.useState({
      bold: false,
      italic: false,
      underline: false,
      list: '',
      align: 'left',
      fontFamily: '',
      fontSize: '2'
    });

    useImperativeHandle(ref, () => ({
      getContent: () => editorRef.current?.innerHTML || '',
      setContent: (html: string) => {
        if (!editorRef.current) return;
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        doc.body.querySelectorAll<HTMLElement>('*').forEach(el => {
          el.style.removeProperty('color');
          el.style.removeProperty('background-color');
          el.style.removeProperty('background');
        });
        editorRef.current.innerHTML = doc.body.innerHTML;
      }
    }));

    useEffect(() => {
      if (editorRef.current) {
        editorRef.current.innerHTML = content;
      }
    }, [content]);

    const handleFormat = (command: string, value?: string) => {
      document.execCommand(command, false, value);
      editorRef.current?.focus();
      updateActiveStyles();
    };

    const handleFontFamily = (fontFamily: string) => {
      document.execCommand('fontName', false, fontFamily || 'inherit');
      editorRef.current?.focus();
      updateActiveStyles();
    };

    const handleFontSize = (size: string) => {
      const fontSize = fontSizes.find(s => s.value === size);
      if (!fontSize) return;

      const selection = window.getSelection();
      if (!selection || !selection.rangeCount) return;

      const range = selection.getRangeAt(0);
      
      // Create a span with the desired font size
      const span = document.createElement('span');
      span.style.fontSize = `${fontSize.pixels}px`;

      if (range.collapsed) {
        // If no text is selected, insert a zero-width space
        span.innerHTML = '&#8203;';
        range.insertNode(span);
        
        // Place cursor inside the span
        const newRange = document.createRange();
        newRange.setStart(span.firstChild!, 1);
        newRange.collapse(true);
        selection.removeAllRanges();
        selection.addRange(newRange);
      } else {
        // If text is selected, wrap it in the span
        const fragment = range.extractContents();
        span.appendChild(fragment);
        range.insertNode(span);
        
        // Restore selection
        const newRange = document.createRange();
        newRange.selectNodeContents(span);
        selection.removeAllRanges();
        selection.addRange(newRange);
      }

      editorRef.current?.focus();
      updateActiveStyles();
    };

    const updateActiveStyles = () => {
      const selection = window.getSelection();
      if (!selection || !selection.rangeCount) return;

      const styles = getActiveStyles(selection, editorRef.current);
      setActiveStyles(styles);
    };

    useEffect(() => {
      const editor = editorRef.current;
      if (!editor) return;

      const handleSelectionChange = () => {
        requestAnimationFrame(() => {
          if (document.activeElement === editor) {
            updateActiveStyles();
          }
        });
      };

      const handleInput = () => {
        requestAnimationFrame(updateActiveStyles);
      };

      const handleMouseUp = () => {
        requestAnimationFrame(updateActiveStyles);
      };

      const handleKeyUp = (e: KeyboardEvent) => {
        if (
          e.key === 'ArrowUp' || e.key === 'ArrowDown' ||
          e.key === 'ArrowLeft' || e.key === 'ArrowRight' ||
          e.key === 'Backspace' || e.key === 'Delete' ||
          e.key === 'Enter'
        ) {
          requestAnimationFrame(updateActiveStyles);
        }
      };

      editor.addEventListener('input', handleInput);
      editor.addEventListener('mouseup', handleMouseUp);
      editor.addEventListener('keyup', handleKeyUp);
      document.addEventListener('selectionchange', handleSelectionChange);

      return () => {
        editor.removeEventListener('input', handleInput);
        editor.removeEventListener('mouseup', handleMouseUp);
        editor.removeEventListener('keyup', handleKeyUp);
        document.removeEventListener('selectionchange', handleSelectionChange);
      };
    }, []);

    return (
      <div className="rich-text-editor">
        <div className="toolbar flex items-center gap-1 p-2 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
          <select
            value={activeStyles.fontFamily}
            onChange={(e) => handleFontFamily(e.target.value)}
            className="px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          >
            {fontFamilies.map((font) => (
              <option key={font.value} value={font.value}>
                {font.name}
              </option>
            ))}
          </select>

          <div className="h-6 w-px bg-gray-200 dark:bg-gray-700 mx-1" />

          <select
            value={activeStyles.fontSize}
            onChange={(e) => handleFontSize(e.target.value)}
            className="px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          >
            {fontSizes.map((size) => (
              <option key={size.value} value={size.value}>
                {size.name}
              </option>
            ))}
          </select>

          <div className="h-6 w-px bg-gray-200 dark:bg-gray-700 mx-1" />

          <button
            onClick={() => handleFormat('bold')}
            className={`p-2 rounded ${
              activeStyles.bold 
                ? 'bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400' 
                : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-white'
            }`}
            title="Bold"
          >
            <Bold className="w-4 h-4" />
          </button>
          <button
            onClick={() => handleFormat('italic')}
            className={`p-2 rounded ${
              activeStyles.italic
                ? 'bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400'
                : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-white'
            }`}
            title="Italic"
          >
            <Italic className="w-4 h-4" />
          </button>
          <button
            onClick={() => handleFormat('underline')}
            className={`p-2 rounded ${
              activeStyles.underline
                ? 'bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400'
                : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-white'
            }`}
            title="Underline"
          >
            <Underline className="w-4 h-4" />
          </button>

          <div className="h-6 w-px bg-gray-200 dark:bg-gray-700 mx-1" />

          <button
            onClick={() => handleFormat('justifyLeft')}
            className={`p-2 rounded ${
              activeStyles.align === 'left'
                ? 'bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400'
                : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-white'
            }`}
            title="Align Left"
          >
            <AlignLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => handleFormat('justifyCenter')}
            className={`p-2 rounded ${
              activeStyles.align === 'center'
                ? 'bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400'
                : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-white'
            }`}
            title="Align Center"
          >
            <AlignCenter className="w-4 h-4" />
          </button>
          <button
            onClick={() => handleFormat('justifyRight')}
            className={`p-2 rounded ${
              activeStyles.align === 'right'
                ? 'bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400'
                : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-white'
            }`}
            title="Align Right"
          >
            <AlignRight className="w-4 h-4" />
          </button>
          <button
            onClick={() => handleFormat('justifyFull')}
            className={`p-2 rounded ${
              activeStyles.align === 'justify'
                ? 'bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400'
                : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-white'
            }`}
            title="Justify"
          >
            <AlignJustify className="w-4 h-4" />
          </button>

          <div className="h-6 w-px bg-gray-200 dark:bg-gray-700 mx-1" />

          <button
            onClick={() => handleFormat('insertUnorderedList')}
            className={`p-2 rounded ${
              activeStyles.list === 'unordered'
                ? 'bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400'
                : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-white'
            }`}
            title="Bullet List"
          >
            <List className="w-4 h-4" />
          </button>
          <button
            onClick={() => handleFormat('insertOrderedList')}
            className={`p-2 rounded ${
              activeStyles.list === 'ordered'
                ? 'bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400'
                : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-white'
            }`}
            title="Numbered List"
          >
            <ListOrdered className="w-4 h-4" />
          </button>

          <div className="h-6 w-px bg-gray-200 dark:bg-gray-700 mx-1" />

          <button
            onClick={() => handleFormat('formatBlock', '<h2>')}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-gray-700 dark:text-white"
            title="Add Heading"
          >
            <Type className="w-4 h-4" />
          </button>
        </div>

        <div
          ref={editorRef}
          className={`editor-content p-6 min-h-[300px] max-h-[400px] overflow-y-auto focus:outline-none text-gray-900 dark:text-white ${className}`}
          contentEditable
          suppressContentEditableWarning
          onKeyDown={(e) => {
            if (e.key === 'Tab') {
              e.preventDefault();
              document.execCommand('insertHTML', false, '&nbsp;&nbsp;&nbsp;&nbsp;');
            }
          }}
          onPaste={(e) => {
            const text = e.clipboardData.getData('text/plain');
            if (text) {
              const stripped = text.replace(/^```[a-zA-Z]*\r?\n?/, '').replace(/\r?\n?```$/, '').trim();
              if (stripped !== text) {
                e.preventDefault();
                document.execCommand('insertText', false, stripped);
              }
            }
          }}
        />
      </div>
    );
  }
);

RichTextEditor.displayName = 'RichTextEditor';