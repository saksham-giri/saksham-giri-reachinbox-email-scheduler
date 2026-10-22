const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

/** Extracts unique email addresses from any CSV / plain-text content. */
export function extractEmails(text: string): string[] {
  const found = text.match(EMAIL_RE) ?? [];
  return [...new Set(found.map((e) => e.toLowerCase()))];
}
