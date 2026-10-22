import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  ChevronsUpDown,
  IndentDecrease,
  IndentIncrease,
  Italic,
  List,
  ListOrdered,
  Quote,
  Redo2,
  RemoveFormatting,
  Strikethrough,
  Type,
  Underline,
  Undo2,
} from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { usePopover } from '../../hooks/usePopover';
import { cn } from '../../utils/cn';

/*
 * Small contentEditable editor driven by document.execCommand. execCommand is
 * deprecated but still implemented by every browser and is plenty for the
 * formatting in the design, without pulling in a full editor framework.
 */

const exec = (command: string, value?: string) => document.execCommand(command, false, value);

const STATE_COMMANDS = ['bold', 'italic', 'underline', 'strikeThrough', 'insertOrderedList', 'insertUnorderedList', 'justifyCenter', 'justifyRight'] as const;
type StateCommand = (typeof STATE_COMMANDS)[number];

const FONT_SIZES = [
  { label: 'Small', value: '2' },
  { label: 'Normal', value: '3' },
  { label: 'Large', value: '5' },
  { label: 'Huge', value: '6' },
];

function ToolButton({ label, active, onClick, children }: { label: string; active?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      // Keep the selection inside the editor while clicking the toolbar.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn('flex h-9 w-9 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100', active && 'bg-gray-200 text-gray-900')}
    >
      {children}
    </button>
  );
}

const Divider = () => <span className="mx-1.5 h-7 w-px bg-gray-200" />;

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  invalid?: boolean;
}

export function RichTextEditor({ value, onChange, placeholder, invalid }: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<Partial<Record<StateCommand, boolean>>>({});
  const fontMenu = usePopover();

  // Uncontrolled after mount: only push external resets (e.g. clearing the form) into the DOM.
  useEffect(() => {
    const el = editorRef.current;
    if (el && el.innerHTML !== value) el.innerHTML = value;
  }, [value]);

  useEffect(() => {
    const update = () => {
      if (!editorRef.current?.contains(document.getSelection()?.anchorNode ?? null)) return;
      setActive(Object.fromEntries(STATE_COMMANDS.map((c) => [c, document.queryCommandState(c)])));
    };
    document.addEventListener('selectionchange', update);
    return () => document.removeEventListener('selectionchange', update);
  }, []);

  const emit = () => {
    const el = editorRef.current;
    if (!el) return;
    // An editor the user emptied often keeps a lone <br>; treat it as empty.
    onChange(el.textContent?.trim() || el.querySelector('img') ? el.innerHTML : '');
  };

  const run = (command: string, arg?: string) => {
    editorRef.current?.focus();
    exec(command, arg);
    emit();
  };

  const cycleAlign = () => run(active.justifyCenter ? 'justifyRight' : active.justifyRight ? 'justifyLeft' : 'justifyCenter');
  const AlignIcon = active.justifyCenter ? AlignCenter : active.justifyRight ? AlignRight : AlignLeft;

  return (
    <div className={cn('flex min-h-[420px] flex-col rounded-2xl bg-[#f9f9f9] p-5', invalid && 'ring-2 ring-red-200')}>
      <div className="mb-3 flex flex-wrap items-center rounded-2xl bg-white px-3 py-1.5 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
        <ToolButton label="Undo" onClick={() => run('undo')}>
          <Undo2 className="h-5 w-5" />
        </ToolButton>
        <ToolButton label="Redo" onClick={() => run('redo')}>
          <Redo2 className="h-5 w-5" />
        </ToolButton>
        <Divider />
        <div className="relative" ref={fontMenu.ref}>
          <button
            type="button"
            title="Font size"
            onMouseDown={(e) => e.preventDefault()}
            onClick={fontMenu.toggle}
            className="flex h-9 items-center gap-0.5 rounded-lg px-2 text-gray-600 hover:bg-gray-100"
          >
            <Type className="h-5 w-5" />
            <ChevronsUpDown className="h-3.5 w-3.5" />
          </button>
          {fontMenu.open && (
            <div className="absolute left-0 z-20 mt-1 w-32 rounded-xl border border-gray-100 bg-white p-1 shadow-lg">
              {FONT_SIZES.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    run('fontSize', s.value);
                    fontMenu.close();
                  }}
                  className="block w-full rounded-lg px-3 py-1.5 text-left text-sm hover:bg-gray-50"
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <Divider />
        <ToolButton label="Bold" active={active.bold} onClick={() => run('bold')}>
          <Bold className="h-5 w-5" />
        </ToolButton>
        <ToolButton label="Italic" active={active.italic} onClick={() => run('italic')}>
          <Italic className="h-5 w-5" />
        </ToolButton>
        <ToolButton label="Underline" active={active.underline} onClick={() => run('underline')}>
          <Underline className="h-5 w-5" />
        </ToolButton>
        <Divider />
        <ToolButton label="Alignment" onClick={cycleAlign}>
          <AlignIcon className="h-5 w-5" />
        </ToolButton>
        <ToolButton label="Clear formatting" onClick={() => run('removeFormat')}>
          <RemoveFormatting className="h-5 w-5" />
        </ToolButton>
        <Divider />
        <ToolButton label="Numbered list" active={active.insertOrderedList} onClick={() => run('insertOrderedList')}>
          <ListOrdered className="h-5 w-5" />
        </ToolButton>
        <ToolButton label="Bulleted list" active={active.insertUnorderedList} onClick={() => run('insertUnorderedList')}>
          <List className="h-5 w-5" />
        </ToolButton>
        <ToolButton label="Indent" onClick={() => run('indent')}>
          <IndentIncrease className="h-5 w-5" />
        </ToolButton>
        <ToolButton label="Outdent" onClick={() => run('outdent')}>
          <IndentDecrease className="h-5 w-5" />
        </ToolButton>
        <ToolButton label="Quote" onClick={() => run('formatBlock', 'blockquote')}>
          <Quote className="h-5 w-5" />
        </ToolButton>
        <Divider />
        <ToolButton label="Strikethrough" active={active.strikeThrough} onClick={() => run('strikeThrough')}>
          <Strikethrough className="h-5 w-5" />
        </ToolButton>
      </div>

      <div
        ref={editorRef}
        contentEditable
        role="textbox"
        aria-multiline="true"
        aria-label="Email body"
        data-placeholder={placeholder}
        onInput={emit}
        onBlur={emit}
        className="rich-text min-h-[300px] flex-1 px-1 text-[17px] leading-relaxed text-gray-900 focus:outline-none"
      />
    </div>
  );
}
