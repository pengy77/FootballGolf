import { useEffect, useMemo, useRef, useState } from 'react';
import type { Category, Item } from '../lib/data';
import { entitiesNow, exactSuggestion, loadEntities, suggest, type Entity, type Suggestion } from '../lib/entities';
import { norm } from '../lib/search';
import { Ball } from './art';
import { Icons } from './ui';
import './pickbox-extra.css';

/**
 * What the player picked. `shown` is how it looked in the suggestions: identical for on-list and
 * off-list names, so the pick card can't give away whether it's on the list either.
 */
export type Selection = ({ item: Item } | { offList: string }) & { shown?: { name: string; sub: string } };

function fromSuggestion(s: Suggestion): Selection {
  const shown = { name: s.name, sub: s.sub };
  return s.item ? { item: s.item, shown } : { offList: s.name, shown };
}

/** The hole's search database: loads once per kind, re-renders when ready. */
function useEntities(cat: Category): Entity[] | null | undefined {
  const [ents, setEnts] = useState(() => entitiesNow(cat.kind));
  useEffect(() => {
    let live = true;
    setEnts(entitiesNow(cat.kind));
    loadEntities(cat.kind).then((e) => live && setEnts(e));
    return () => {
      live = false;
    };
  }, [cat.kind]);
  return ents;
}

function Highlight({ text, query }: { text: string; query: string }) {
  // Highlight the first accent-insensitive match of the query inside the text.
  const q = norm(query);
  if (!q) return <>{text}</>;
  const chars = [...text];
  const normChars = chars.map((c) => norm(c) || ' ');
  const joined = normChars.join('');
  const at = joined.indexOf(q);
  if (at < 0) return <>{text}</>;
  let start = 0;
  let acc = 0;
  for (let i = 0; i < chars.length; i++) {
    if (acc === at) {
      start = i;
      break;
    }
    acc += normChars[i].length;
  }
  let end = start;
  let len = 0;
  while (end < chars.length && len < q.length) len += normChars[end++].length;
  return (
    <>
      {chars.slice(0, start).join('')}
      <mark>{chars.slice(start, end).join('')}</mark>
      {chars.slice(end).join('')}
    </>
  );
}

export function PickBox({
  cat,
  selection,
  onSelect,
  onSearching,
  autoFocus,
}: {
  cat: Category;
  selection: Selection | null;
  onSelect: (s: Selection | null) => void;
  onSearching: (b: boolean) => void;
  autoFocus?: boolean;
}) {
  const [q, setQ] = useState('');
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const ents = useEntities(cat);
  const waiting = ents === undefined;
  const results = useMemo(() => (waiting ? [] : suggest(cat, ents, q, 6)), [cat, ents, waiting, q]);
  const exact = useMemo(() => (waiting ? undefined : exactSuggestion(cat, ents, q)), [cat, ents, waiting, q]);
  // Only offer a name we don't know once it looks like a real name, not a 2-letter fragment
  // (and not when the text already names a suggestion: that one's right there).
  const canPlayAnyway = !waiting && !exact && norm(q).replace(/ /g, '').length >= 4;
  const open = focused && norm(q).length >= 2;
  const listId = `sugg-${cat.id}`;

  useEffect(() => setActive(0), [q]);
  useEffect(() => onSearching(focused), [focused, onSearching]);
  useEffect(() => {
    if (autoFocus && !selection && window.matchMedia('(pointer: fine)').matches) inputRef.current?.focus();
  }, [autoFocus, selection]);

  const choose = (s: Selection) => {
    onSelect(s);
    setQ('');
    inputRef.current?.blur();
    setFocused(false);
  };

  const playAnyway = () => {
    choose({ offList: q.trim().slice(0, 50) });
  };

  if (selection) {
    const isItem = 'item' in selection;
    const shown = selection.shown ?? (isItem ? { name: selection.item.name, sub: selection.item.sub ?? '' } : undefined);
    // Only a name nobody recognises is flagged: a known name stays a surprise until the reveal.
    const unknown = !shown;
    return (
      <div className={`pick-chosen${unknown ? ' is-ob' : ''}`}>
        <Ball size={30} className="pick-chosen-ball" />
        <div className="pick-chosen-text">
          <div className="pick-chosen-name">{shown ? shown.name : !isItem && selection.offList ? `“${selection.offList}”` : 'No answer'}</div>
          {shown?.sub && <div className="pick-chosen-sub">{shown.sub}</div>}
          {unknown && <div className="pick-chosen-warn">{!isItem && selection.offList ? `Unknown ${cat.noun}: out of bounds` : 'Out of bounds'}</div>}
        </div>
        <button
          type="button"
          className="pick-change"
          aria-label="Change your pick"
          onClick={() => {
            onSelect(null);
            requestAnimationFrame(() => inputRef.current?.focus());
          }}
        >
          {Icons.close}
        </button>
      </div>
    );
  }

  return (
    <div className={`pickbox${open ? ' is-open' : ''}`}>
      <label className="search">
        <span className="search-icon">{Icons.search}</span>
        <input
          ref={inputRef}
          type="text"
          inputMode="search"
          enterKeyHint="go"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="words"
          spellCheck={false}
          placeholder={cat.kind === 'stadium' ? 'Name a stadium or its club…' : `Name a ${cat.noun}…`}
          aria-label={`Name a ${cat.noun}`}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && results[active] ? `${listId}-${active}` : undefined}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => {
            setFocused(true);
            setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 60);
          }}
          onBlur={() => setFocused(false)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, Math.max(results.length - 1, 0)));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              if (results[active]) choose(fromSuggestion(results[active]));
            } else if (e.key === 'Escape') {
              setQ('');
            }
          }}
        />
        {q && (
          <button
            type="button"
            className="search-clear"
            aria-label="Clear"
            onPointerDown={(e) => e.preventDefault()}
            onClick={() => {
              setQ('');
              inputRef.current?.focus();
            }}
          >
            {Icons.close}
          </button>
        )}
      </label>
      {open && (
        <div className="suggestions" onPointerDown={(e) => e.preventDefault()}>
          <ul id={listId} role="listbox" aria-label="Suggestions">
            {results.map((it, i) => (
              <li
                key={it.key}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                className={i === active ? 'is-active' : undefined}
                onClick={() => choose(fromSuggestion(it))}
                onPointerEnter={() => setActive(i)}
              >
                <span className="sugg-name">
                  <Highlight text={it.name} query={q} />
                </span>
                {it.sub && <span className="sugg-sub">{it.sub}</span>}
              </li>
            ))}
          </ul>
          {waiting && <p className="sugg-empty sugg-loading">Loading {cat.nounPlural}…</p>}
          {!waiting && results.length === 0 && (
            <p className="sugg-empty">
              No match for “{q.trim()}”
            </p>
          )}
          {canPlayAnyway && (
            <button type="button" className="sugg-anyway" onClick={playAnyway}>
              Play “{q.trim()}” anyway <span className="sugg-ob">OB</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
