// Fixed to en-US so dates read like the design ("Tue 9:15:12 AM", "Nov 3, 10:23 AM");
// times are still shown in the viewer's own timezone.
const LOCALE = 'en-US';
const weekday = new Intl.DateTimeFormat(LOCALE, { weekday: 'short' });
const timeWithSeconds = new Intl.DateTimeFormat(LOCALE, { hour: 'numeric', minute: '2-digit', second: '2-digit' });
const shortDateTime = new Intl.DateTimeFormat(LOCALE, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const fullDateTime = new Intl.DateTimeFormat(LOCALE, {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  second: '2-digit',
});

/** "Tue 9:15:12 AM" (list chips) */
export function formatChipTime(iso: string): string {
  const d = new Date(iso);
  return `${weekday.format(d)} ${timeWithSeconds.format(d)}`;
}

/** "Nov 3, 10:23 AM" */
export const formatShortDateTime = (iso: string | null) => (iso ? shortDateTime.format(new Date(iso)) : '-');

export const formatFullDateTime = (iso: string | null) => (iso ? fullDateTime.format(new Date(iso)) : '-');

/** "Tomorrow, 10:00 AM" / "Today, 3:00 PM" / "Nov 3, 10:23 AM" */
export function formatRelativeDay(date: Date): string {
  const time = date.toLocaleTimeString(LOCALE, { hour: 'numeric', minute: '2-digit' });
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOfDay(date) - startOfDay(new Date())) / 86_400_000);
  if (days === 0) return `Today, ${time}`;
  if (days === 1) return `Tomorrow, ${time}`;
  return shortDateTime.format(date);
}

/** Value for <input type="datetime-local"> in the user's local timezone. */
export function toLocalInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');

/** Text preview of the HTML body for list rows. */
export function htmlPreview(html: string, max = 140): string {
  const text = new DOMParser().parseFromString(html, 'text/html').body.textContent ?? '';
  const collapsed = text.replace(/\s+/g, ' ').trim();
  return collapsed.length > max ? `${collapsed.slice(0, max)}...` : collapsed;
}
