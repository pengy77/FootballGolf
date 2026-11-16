import { useEffect, useMemo, useRef, useState } from 'react';
import type { Category, Item } from '../lib/data';
import { exactMatch, norm, searchItems } from '../lib/search';
import { Icons } from './ui';

export type Selection = { item: Item } | { offList: string };

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
  const results = useMemo(() => searchItems(cat, q), [cat, q]);
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
    const text = q.trim().slice(0, 50);
    const hit = exactMatch(cat, text);
    choose(hit ? { item: hit } : { offList: text });
  };

  if (selection) {
    const isItem = 'item' in selection;
    return (
      <div className={`pick-chosen${isItem ? '' : ' is-ob'}`}>
        <div className="pick-chosen-label">Your pick</div>
        <div className="pick-chosen-name">{isItem ? selection.item.name : selection.offList ? `“${selection.offList}”` : 'No answer'}</div>
        {isItem && selection.item.sub && <div className="pick-chosen-sub">{selection.item.sub}</div>}
        {!isItem && <div className="pick-chosen-warn">Not on the list, so this counts as out of bounds.</div>}
        <button
          type="button"
          className="link-btn pick-change"
          onClick={() => {
            onSelect(null);
            requestAnimationFrame(() => inputRef.current?.focus());
          }}
        >
          Change
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
          placeholder={`Name a ${cat.noun}…`}
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
              if (results[active]) choose({ item: results[active] });
              else if (norm(q).length >= 2) playAnyway();
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
                key={it.id}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                className={i === active ? 'is-active' : undefined}
                onClick={() => choose({ item: it })}
                onPointerEnter={() => setActive(i)}
              >
                <span className="sugg-name">
                  <Highlight text={it.name} query={q} />
                </span>
                {it.sub && <span className="sugg-sub">{it.sub}</span>}
              </li>
            ))}
          </ul>
          {results.length === 0 && (
            <p className="sugg-empty">
              No {cat.noun} on the list matches “{q.trim()}”.
            </p>
          )}
          <button type="button" className="sugg-anyway" onClick={playAnyway}>
            {results.length ? 'Not here? ' : ''}Play “{q.trim()}” anyway <span className="sugg-ob">Out of bounds</span>
          </button>
        </div>
      )}
      {!open && (
        <p className="pick-hint">
          {focused ? 'Keep typing…' : `Type 2 or more letters and pick from the list. Accents don't matter.`}
        </p>
      )}
    </div>
  );
}
