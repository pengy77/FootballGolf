export type ShareOutcome = 'shared' | 'copied' | 'cancelled' | 'failed';

/** Native share sheet on phones; clipboard everywhere else. */
export async function shareLink(opts: { title: string; text: string; url: string }): Promise<ShareOutcome> {
  const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void>; canShare?: (d: ShareData) => boolean };
  const coarse = window.matchMedia?.('(pointer: coarse)').matches;
  if (nav.share && coarse) {
    try {
      await nav.share({ title: opts.title, text: opts.text, url: opts.url });
      return 'shared';
    } catch (e) {
      if ((e as DOMException)?.name === 'AbortError') return 'cancelled';
    }
  }
  return (await copyText(`${opts.text} ${opts.url}`)) ? 'copied' : 'failed';
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

export function buzz(ms = 12): void {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* not supported */
  }
}
