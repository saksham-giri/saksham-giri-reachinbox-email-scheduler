import { useState } from 'react';
import toast from 'react-hot-toast';
import { slackApi } from '../../api/endpoints';
import type { SlackStatus } from '../../api/types';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';

/** Settings dialog for a connected Slack workspace: send a test message or disconnect. */
export function SlackSettingsModal({ slack, open, onClose }: { slack: SlackStatus; open: boolean; onClose: () => void }) {
  const { refresh } = useAuth();
  const [busy, setBusy] = useState<'test' | 'disconnect' | null>(null);

  async function run(action: 'test' | 'disconnect') {
    setBusy(action);
    try {
      if (action === 'test') {
        await slackApi.test();
        toast.success(`Test message sent to ${slack.channel}`);
      } else {
        await slackApi.disconnect();
        toast.success('Slack disconnected');
        onClose();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Slack request failed');
    } finally {
      setBusy(null);
      await refresh();
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Slack notifications"
      footer={
        <>
          <Button variant="danger" size="sm" loading={busy === 'disconnect'} onClick={() => run('disconnect')}>
            Disconnect
          </Button>
          <Button variant="outline" size="sm" loading={busy === 'test'} onClick={() => run('test')}>
            Send test message
          </Button>
        </>
      }
    >
      <p className="text-sm text-gray-700">
        Connected to <strong>{slack.teamName}</strong>, posting to <strong>{slack.channel}</strong>. You get a message the moment a sender
        (or a campaign) reaches its hourly sending limit.
      </p>
    </Modal>
  );
}
