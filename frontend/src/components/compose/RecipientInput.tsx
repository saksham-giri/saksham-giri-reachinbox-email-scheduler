import { Upload, X } from 'lucide-react';
import { useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import toast from 'react-hot-toast';
import { extractEmails } from '../../utils/leads';

const VISIBLE_CHIPS = 3;

interface RecipientInputProps {
  id?: string;
  value: string[];
  onChange: (emails: string[]) => void;
  invalid?: boolean;
}

/**
 * "To" field: green chips for recipients (first few + "+N"), free typing
 * (Enter / comma / paste) and "Upload List" for a CSV or text file of leads.
 */
export function RecipientInput({ id, value, onChange, invalid }: RecipientInputProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [source, setSource] = useState<string | null>(null);

  const add = (emails: string[]) => {
    const merged = [...new Set([...value, ...emails])];
    onChange(merged);
    return merged.length - value.length;
  };

  function commitDraft() {
    const emails = extractEmails(draft);
    if (emails.length > 0) add(emails);
    else if (draft.trim()) toast.error(`"${draft.trim()}" is not a valid email address`);
    setDraft('');
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (['Enter', ',', ';', 'Tab'].includes(e.key) && draft.trim()) {
      e.preventDefault();
      commitDraft();
    } else if (e.key === 'Backspace' && !draft && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  }

  function onPaste(e: ClipboardEvent<HTMLInputElement>) {
    const emails = extractEmails(e.clipboardData.getData('text'));
    if (emails.length > 1) {
      e.preventDefault();
      add(emails);
    }
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    const emails = extractEmails(await file.text());
    if (fileRef.current) fileRef.current.value = '';
    if (emails.length === 0) {
      toast.error(`No email addresses found in ${file.name}`);
      return;
    }
    const added = add(emails);
    setSource(file.name);
    toast.success(`${emails.length} email${emails.length === 1 ? '' : 's'} detected in ${file.name}${added < emails.length ? ` (${added} new)` : ''}`);
  }

  const visible = expanded ? value : value.slice(0, VISIBLE_CHIPS);
  const hidden = value.length - visible.length;

  return (
    <div className="w-full">
      <div className="flex min-h-[48px] w-full flex-wrap items-center gap-1.5 py-1.5">
        {visible.map((email) => (
          <span key={email} className="group inline-flex items-center gap-1 rounded-full border border-brand-500 bg-brand-50 py-0.5 pl-3 pr-2 text-[15px] text-gray-900">
            {email}
            <button
              type="button"
              aria-label={`Remove ${email}`}
              onClick={() => onChange(value.filter((v) => v !== email))}
              className="rounded-full text-gray-400 hover:text-gray-700"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </span>
        ))}
        {hidden > 0 && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="rounded-full border border-brand-500 bg-brand-50 px-3 py-0.5 text-[15px] text-gray-900 hover:bg-brand-100"
          >
            +{hidden}
          </button>
        )}
        {expanded && value.length > VISIBLE_CHIPS && (
          <button type="button" onClick={() => setExpanded(false)} className="px-1 text-sm text-gray-500 hover:text-gray-700">
            Show less
          </button>
        )}
        <input
          id={id}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onBlur={() => draft.trim() && commitDraft()}
          placeholder={value.length === 0 ? 'recipient@example.com' : ''}
          className={`h-9 min-w-[160px] flex-1 bg-transparent text-[15px] placeholder:text-gray-400 focus:outline-none ${invalid ? 'placeholder:text-red-300' : ''}`}
        />
        <input ref={fileRef} type="file" accept=".csv,.txt,text/csv,text/plain" className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="ml-auto inline-flex shrink-0 items-center gap-2 text-[17px] text-brand-500 hover:text-brand-600"
        >
          <Upload className="h-5 w-5" /> Upload List
        </button>
      </div>
      {value.length > 0 && (
        <p className="pb-1.5 text-xs text-gray-500">
          {value.length} email address{value.length === 1 ? '' : 'es'} detected{source ? ` (from ${source})` : ''}
          <button type="button" onClick={() => onChange([])} className="ml-2 text-gray-400 underline hover:text-gray-600">
            clear
          </button>
        </p>
      )}
    </div>
  );
}
