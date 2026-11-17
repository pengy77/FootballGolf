import { NavGuard, useApp } from '../App';
import { dailyId } from '../lib/daily';
import { isDone } from '../lib/game';
import { findGame } from '../lib/store';
import Home from './Home';

/**
 * A link straight to today's daily. It's the home screen's course with the name field already open
 * on the first tee, so there's one place where the daily starts.
 */
export default function Daily() {
  const { saved } = useApp();
  const id = dailyId();
  const existing = findGame(saved, id);
  if (existing && existing.me !== null) return <NavGuard to={isDone(existing, existing.me) ? `/results/${id}` : `/play/${id}`} />;
  // A friend's daily link got here first: join their card.
  if (existing) return <NavGuard to={`/join/${id}`} />;
  return <Home askName />;
}
