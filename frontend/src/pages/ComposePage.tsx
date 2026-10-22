import { Clock } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { campaignsApi, configApi } from '../api/endpoints';
import { RecipientInput } from '../components/compose/RecipientInput';
import { RichTextEditor } from '../components/compose/RichTextEditor';
import { SendLaterPopover } from '../components/compose/SendLaterPopover';
import { SenderSelect } from '../components/compose/SenderSelect';
import { PageHeader } from '../components/layout/PageHeader';
import { Button, IconButton } from '../components/ui/Button';
import { FormRow, Input } from '../components/ui/Field';
import { usePopover } from '../hooks/usePopover';
import { useQuery } from '../hooks/useQuery';
import { formatRelativeDay } from '../utils/format';

interface FormState {
  senderId: string | null;
  recipients: string[];
  subject: string;
  delaySeconds: string;
  hourlyLimit: string;
  body: string;
  sendAt: Date | null;
}

type FormErrors = Partial<Record<keyof FormState, string>>;

const initialForm: FormState = { senderId: null, recipients: [], subject: '', delaySeconds: '', hourlyLimit: '', body: '', sendAt: null };

const isNonNegativeInt = (v: string) => /^\d+$/.test(v);

function validate(f: FormState): FormErrors {
  const errors: FormErrors = {};
  if (f.recipients.length === 0) errors.recipients = 'Add at least one recipient or upload a list';
  if (!f.subject.trim()) errors.subject = 'Subject is required';
  if (!f.body) errors.body = 'Write a message';
  if (f.delaySeconds && !isNonNegativeInt(f.delaySeconds)) errors.delaySeconds = 'Seconds, a whole number';
  if (f.hourlyLimit && (!isNonNegativeInt(f.hourlyLimit) || Number(f.hourlyLimit) < 1)) errors.hourlyLimit = 'At least 1 per hour';
  return errors;
}

export function ComposePage() {
  const navigate = useNavigate();
  const { data: config } = useQuery(configApi.get, []);
  const [form, setForm] = useState<FormState>(initialForm);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const sendLater = usePopover();

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };

  async function handleSubmit(e?: FormEvent) {
    e?.preventDefault();
    const found = validate(form);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      toast.error(Object.values(found)[0] ?? 'Please fix the highlighted fields');
      return;
    }

    setSubmitting(true);
    try {
      const res = await campaignsApi.schedule({
        senderId: form.senderId,
        recipients: form.recipients,
        subject: form.subject.trim(),
        body: form.body,
        startAt: (form.sendAt ?? new Date()).toISOString(),
        delayBetweenSeconds: Number(form.delaySeconds || 0),
        hourlyLimit: form.hourlyLimit ? Number(form.hourlyLimit) : null,
      });
      const skipped = res.skippedInvalid + res.skippedDuplicates;
      toast.success(
        `${form.sendAt ? 'Scheduled' : 'Queued'} ${res.scheduled} email${res.scheduled === 1 ? '' : 's'}${skipped ? ` (${skipped} skipped)` : ''}`,
      );
      navigate('/dashboard?tab=scheduled');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to schedule emails');
    } finally {
      setSubmitting(false);
    }
  }

  const perSender = config?.limits.maxPerHourPerSender;

  return (
    <div className="min-h-screen">
      <PageHeader
        title="Compose New Email"
        actions={
          <div className="relative flex items-center gap-3" ref={sendLater.ref}>
            {form.sendAt && (
              <button type="button" onClick={sendLater.toggle} className="hidden text-sm text-brand-600 hover:underline sm:inline">
                {formatRelativeDay(form.sendAt)}
              </button>
            )}
            <IconButton label="Send later" active={sendLater.open || Boolean(form.sendAt)} onClick={sendLater.toggle} className="h-11 w-11">
              <Clock className="h-6 w-6" />
            </IconButton>
            <Button variant="outline" onClick={() => void handleSubmit()} loading={submitting} className="h-12 px-6 text-[17px] font-normal">
              {form.sendAt ? 'Send Later' : 'Send'}
            </Button>
            {sendLater.open && (
              <SendLaterPopover
                value={form.sendAt}
                onCancel={sendLater.close}
                onDone={(date) => {
                  set('sendAt', date);
                  sendLater.close();
                }}
              />
            )}
          </div>
        }
      />

      <form onSubmit={handleSubmit} className="mx-auto flex max-w-[1060px] flex-col gap-4 px-4 pb-16 pt-4 md:px-8" noValidate>
        <FormRow label="From" htmlFor="from">
          <SenderSelect id="from" senders={config?.senders ?? []} value={form.senderId} onChange={(v) => set('senderId', v)} />
        </FormRow>

        <FormRow label="To" htmlFor="to" underline error={errors.recipients}>
          <RecipientInput id="to" value={form.recipients} onChange={(v) => set('recipients', v)} invalid={Boolean(errors.recipients)} />
        </FormRow>

        <FormRow label="Subject" htmlFor="subject" underline error={errors.subject}>
          <Input
            id="subject"
            variant="line"
            placeholder="Subject"
            value={form.subject}
            onChange={(e) => set('subject', e.target.value)}
            invalid={Boolean(errors.subject)}
            className="h-12"
          />
        </FormRow>

        <div className="flex flex-wrap items-start gap-x-10 gap-y-3 py-1">
          <div>
            <label className="flex items-center gap-5 whitespace-nowrap text-[15px] text-gray-900">
              Delay between 2 emails
              <Input
                variant="box"
                inputMode="numeric"
                placeholder="00"
                value={form.delaySeconds}
                onChange={(e) => set('delaySeconds', e.target.value.trim())}
                invalid={Boolean(errors.delaySeconds)}
                aria-describedby="delay-hint"
              />
            </label>
            <p id="delay-hint" className="mt-1 text-xs text-gray-400">
              {errors.delaySeconds ?? 'seconds'}
            </p>
          </div>
          <div>
            <label className="flex items-center gap-3 whitespace-nowrap text-[15px] text-gray-900">
              Hourly Limit
              <Input
                variant="box"
                inputMode="numeric"
                placeholder="00"
                value={form.hourlyLimit}
                onChange={(e) => set('hourlyLimit', e.target.value.trim())}
                invalid={Boolean(errors.hourlyLimit)}
                aria-describedby="limit-hint"
              />
            </label>
            <p id="limit-hint" className="mt-1 text-xs text-gray-400">
              {errors.hourlyLimit ?? (perSender ? `optional, each sender is also capped at ${perSender}/hour` : 'optional')}
            </p>
          </div>
        </div>

        <RichTextEditor value={form.body} onChange={(html) => set('body', html)} placeholder="Type Your Reply..." invalid={Boolean(errors.body)} />
      </form>
    </div>
  );
}
