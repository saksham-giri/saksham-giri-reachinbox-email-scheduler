import { ChevronDown, LogOut, Slack } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { slackApi } from '../../api/endpoints';
import { useAuth } from '../../context/AuthContext';
import { usePopover } from '../../hooks/usePopover';
import { Avatar } from '../ui/Avatar';
import { SlackSettingsModal } from './SlackConnect';

const itemClass = 'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-gray-50';

/** The grey user card at the top of the sidebar, with its dropdown. */
export function UserMenu() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const menu = usePopover();
  const [slackOpen, setSlackOpen] = useState(false);
  if (!user) return null;
  const { slack } = user;

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className="relative" ref={menu.ref}>
      <button
        onClick={menu.toggle}
        aria-haspopup="menu"
        aria-expanded={menu.open}
        className="flex w-full items-center gap-3 rounded-2xl bg-surface px-4 py-3 text-left transition-colors hover:bg-gray-100"
      >
        <Avatar name={user.name} src={user.avatarUrl} className="h-11 w-11" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[17px] leading-tight text-gray-900">{user.name}</p>
          <p className="truncate text-[13px] text-gray-500">{user.email}</p>
        </div>
        <ChevronDown className="h-5 w-5 shrink-0 text-gray-400" />
      </button>

      {menu.open && (
        <div role="menu" className="absolute left-0 right-0 z-30 mt-2 rounded-xl border border-gray-100 bg-white p-1 shadow-lg">
          {slack.connected ? (
            <button
              role="menuitem"
              className={itemClass}
              onClick={() => {
                menu.close();
                setSlackOpen(true);
              }}
            >
              <span className="h-2 w-2 rounded-full bg-brand-500" />
              Slack: {slack.channel}
            </button>
          ) : slack.available ? (
            <a role="menuitem" href={slackApi.connectUrl} className={itemClass}>
              <Slack className="h-4 w-4 text-gray-500" /> Connect Slack
            </a>
          ) : (
            <span className={`${itemClass} cursor-not-allowed text-gray-400 hover:bg-transparent`} title="Slack OAuth is not configured on the server">
              <Slack className="h-4 w-4" /> Slack not configured
            </span>
          )}
          <button role="menuitem" onClick={handleLogout} className={`${itemClass} text-red-600 hover:bg-red-50`}>
            <LogOut className="h-4 w-4" /> Logout
          </button>
        </div>
      )}

      {slack.connected && <SlackSettingsModal slack={slack} open={slackOpen} onClose={() => setSlackOpen(false)} />}
    </div>
  );
}
