import { useState } from 'react';
import { useApp } from '../App';
import { dailyLabel } from '../lib/daily';
import { donePlayers, type Game } from '../lib/game';
import { shareUrl } from '../lib/link';
import { copyText, shareLink } from '../lib/share';
import { Icons, IconButton } from './ui';

/**
 * What sharing a finished card says and does, wherever the card is shown (home and the results).
 * The text never includes scores, so the chat preview doesn't spoil the reveal for whoever opens it.
 */
export function shareCopy(game: Game) {
  const done = donePlayers(game);
  const solo = done.length <= 1;
  const n = game.holes.length;
  const daily = dailyLabel(game.id);
  const me = game.me;
  const others = done.filter((i) => i !== me);
  // Am I the latest finisher? Then the others are waiting for me to send the card back.
  const returning = game.mode === 'challenge' && me !== null && !solo && done[done.length - 1] === me;
  const otherNames = others.map((i) => game.players[i].name);
  const sendTo = returning && otherNames.length === 1 ? otherNames[0] : null;

  const text = solo
    ? daily
      ? `⛳ Football Golf ${daily}: I've played today's ${n} holes. Can you beat me?`
      : `⛳ I've just played a ${n}-hole round of Football Golf. Your turn: can you beat me?`
    : game.mode === 'local'
      ? `⛳ We've just played ${n} holes of Football Golf. Think you can beat us? Play the same holes:`
      : returning
        ? `⛳ I've played your Football Golf round${sendTo ? `, ${sendTo}` : ''}. Tap to see who won:`
        : `⛳ Football Golf: see who won, or play the same ${n} holes yourself:`;

  const label = solo
    ? me !== null
      ? 'Challenge a mate'
      : 'Share'
    : sendTo
      ? `Send to ${sendTo}`
      : returning
        ? 'Send the result back'
        : 'Challenge a mate';
  return { text, label, solo, canShare: me !== null || !solo };
}

/** Share (native sheet on phones, clipboard elsewhere) and copy, with a long-press fallback when both fail. */
export function useGameShare(game: Game | undefined) {
  const { toast } = useApp();
  const [showUrl, setShowUrl] = useState(false);
  const url = game ? shareUrl(game) : '';
  const copy = game ? shareCopy(game) : null;

  const share = async () => {
    if (!game || !copy) return;
    const out = await shareLink({ title: 'Football Golf', text: copy.text, url });
    if (out === 'copied') toast('Link copied. Paste it into your chat.');
    if (out === 'failed') {
      setShowUrl(true);
      toast("Couldn't share. Long-press the link below to copy it.");
    }
  };

  const copyLink = async () => {
    if (await copyText(url)) return toast('Link copied. Paste it into your chat.');
    setShowUrl(true);
    toast("Couldn't copy. Long-press the link below to copy it.");
  };

  const urlBox = showUrl ? (
    <p className="share-url" aria-label="Game link">
      {url}
    </p>
  ) : null;

  return { share, copyLink, urlBox, label: copy?.label ?? 'Share', canShare: !!copy?.canShare };
}

/** The share button with a copy-link button beside it. */
export function ShareRow({ label, onShare, onCopy, primary = true }: { label: string; onShare: () => void; onCopy: () => void; primary?: boolean }) {
  return (
    <div className="share-row">
      <button type="button" className={`btn btn-block ${primary ? 'btn-primary btn-lg' : 'btn-secondary'}`} onClick={onShare}>
        {Icons.share} {label}
      </button>
      <IconButton label="Copy link" onClick={onCopy}>
        {Icons.copy}
      </IconButton>
    </div>
  );
}
