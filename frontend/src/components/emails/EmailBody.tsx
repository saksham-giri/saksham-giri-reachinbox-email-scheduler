import { useCallback, useRef, useState } from 'react';

const frameStyles = `
  body { margin: 0; font-family: Inter, system-ui, sans-serif; font-size: 17px; line-height: 1.75; color: #111827; }
  p, div { margin: 0 0 0.5em; }
  blockquote { margin: 0.75em 0; padding: 0.75em 1em; border-left: 4px solid #facc15; background: #fefce8; }
  a { color: #008f35; }
  img { max-width: 100%; }
`;

/**
 * Renders the email HTML inside a sandboxed iframe (no scripts) so its styles
 * can't leak into the app; the frame is resized to fit its content.
 */
export function EmailBody({ html }: { html: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(200);

  const fit = useCallback(() => {
    const doc = ref.current?.contentDocument;
    if (doc) setHeight(doc.documentElement.scrollHeight + 8);
  }, []);

  return (
    <iframe
      ref={ref}
      title="Email body"
      sandbox="allow-same-origin allow-popups"
      srcDoc={`<!doctype html><html><head><base target="_blank"><style>${frameStyles}</style></head><body>${html}</body></html>`}
      onLoad={fit}
      style={{ height }}
      className="w-full border-0"
    />
  );
}
