import { useApp } from '../App';
import { HeroArt } from '../components/art';

export default function Message({ title, body }: { title: string; body: string }) {
  const { go } = useApp();
  return (
    <main className="screen message">
      <HeroArt className="is-small" />
      <h1 className="join-title">{title}</h1>
      <p className="lead">{body}</p>
      <button type="button" className="btn btn-primary btn-block" onClick={() => go('/', { replace: true })}>
        Start a game
      </button>
    </main>
  );
}
