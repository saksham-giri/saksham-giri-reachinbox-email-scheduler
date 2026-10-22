import { AlertCircle, ChevronDown, ExternalLink, Trash2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import toast from 'react-hot-toast';
import { useNavigate, useParams } from 'react-router-dom';
import { ApiError } from '../api/client';
import { emailsApi } from '../api/endpoints';
import type { Email } from '../api/types';
import { EmailBody } from '../components/emails/EmailBody';
import { StarButton } from '../components/emails/StarButton';
import { StatusChip } from '../components/emails/StatusChip';
import { PageHeader } from '../components/layout/PageHeader';
import { Avatar } from '../components/ui/Avatar';
import { Button, IconButton } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { Modal } from '../components/ui/Modal';
import { FullPageSpinner } from '../components/ui/Spinner';
import { useAuth } from '../context/AuthContext';
import { useQuery } from '../hooks/useQuery';
import { formatFullDateTime, formatShortDateTime } from '../utils/format';

const PENDING = new Set<Email['status']>(['SCHEDULED', 'DELAYED']);

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3 py-1">
      <span className="w-28 shrink-0 text-gray-500">{label}</span>
      <span className="min-w-0 break-words text-gray-800">{children}</span>
    </div>
  );
}

export function EmailDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [showDetails, setShowDetails] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // Poll while the email is still pending so its status updates live.
  const { data: email, loading, error } = useQuery(() => emailsApi.get(id), [id], 5000);

  if (loading && !email) return <FullPageSpinner />;
  if (!email) {
    const notFound = error instanceof ApiError && error.status === 404;
    return (
      <>
        <PageHeader title="Email" />
        <EmptyState
          icon={<AlertCircle className="h-6 w-6" />}
          title={notFound ? 'Email not found' : 'Could not load this email'}
          description={notFound ? 'It may have been deleted.' : error?.message}
        />
      </>
    );
  }

  const pending = PENDING.has(email.status);

  async function handleDelete() {
    setDeleting(true);
    try {
      await emailsApi.remove(id);
      toast.success(pending ? 'Scheduled email cancelled' : 'Email deleted');
      navigate(`/dashboard?tab=${pending ? 'scheduled' : 'sent'}`, { replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not delete email');
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  return (
    <div className="min-h-screen">
      <PageHeader
        title={email.subject}
        actions={
          <>
            <StarButton id={email.id} starred={email.starred} />
            <IconButton label={pending ? 'Cancel scheduled email' : 'Delete'} onClick={() => setConfirmDelete(true)} disabled={email.status === 'PROCESSING'}>
              <Trash2 className="h-5 w-5" />
            </IconButton>
            <span className="mx-1 h-10 w-px bg-gray-200" />
            {user && <Avatar name={user.name} src={user.avatarUrl} className="h-11 w-11" />}
          </>
        }
      />

      <article className="mx-auto max-w-[1100px] px-4 pb-16 pt-6 md:px-8">
        <div className="flex items-start gap-4">
          <Avatar name={email.senderName} tone="solid" className="h-14 w-14 text-xl" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-1">
              <p className="text-[17px]">
                <span className="font-semibold text-gray-900">{email.senderName}</span>{' '}
                <span className="text-gray-500">&lt;{email.senderEmail}&gt;</span>
              </p>
              <div className="flex items-center gap-3 text-[15px] text-gray-500">
                <StatusChip email={email} />
                <span>{formatShortDateTime(email.sentAt ?? email.scheduledAt)}</span>
              </div>
            </div>
            <button onClick={() => setShowDetails((s) => !s)} className="mt-1 flex items-center gap-1 text-[15px] text-gray-500 hover:text-gray-700">
              to {email.toEmail} <ChevronDown className={`h-4 w-4 transition-transform ${showDetails ? 'rotate-180' : ''}`} />
            </button>

            {showDetails && (
              <div className="mt-3 rounded-xl border border-gray-100 bg-surface/60 p-4 text-sm">
                <DetailRow label="Scheduled">{formatFullDateTime(email.scheduledAt)}</DetailRow>
                <DetailRow label="Sent">{formatFullDateTime(email.sentAt)}</DetailRow>
                <DetailRow label="Attempts">{email.attempts}</DetailRow>
                {email.deferrals > 0 && <DetailRow label="Rate limited">moved to a later window {email.deferrals} time(s)</DetailRow>}
                {email.error && <DetailRow label="Last error">{email.error}</DetailRow>}
                {email.previewUrl && (
                  <DetailRow label="Ethereal">
                    <a href={email.previewUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand-600 hover:underline">
                      Open delivered message <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </DetailRow>
                )}
              </div>
            )}

            <div className="mt-6">
              <EmailBody html={email.body} />
            </div>
          </div>
        </div>
      </article>

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={pending ? 'Cancel this email?' : 'Delete this email?'}
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>
              Keep it
            </Button>
            <Button variant="danger" size="sm" loading={deleting} onClick={handleDelete}>
              {pending ? 'Cancel email' : 'Delete'}
            </Button>
          </>
        }
      >
        <p className="text-sm text-gray-700">
          {pending
            ? `The email to ${email.toEmail} will not be sent. Other emails in the campaign are unaffected.`
            : 'This removes the email from your history. It does not unsend it.'}
        </p>
      </Modal>
    </div>
  );
}
