'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import {
  CHAT_MESSAGES_FR,
  CHAT_MESSAGE_MAX_LENGTH,
  CHAT_QUICK_REPLIES_SELLER,
  CHAT_THREAD_STATE_LABELS_FR,
} from '@faffago/shared';
import { bff } from '@/lib/client/call';
import type { ChatMessageView, ChatThreadView } from '@/lib/types';

const POLL_MS = 8_000;

const time = new Intl.DateTimeFormat('fr-TN', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'Africa/Tunis',
});

/** A message on its way: kept, with its id, until the server has it. */
interface Pending {
  id: string;
  body: string;
  failed: string | null;
}

/**
 * The chat of a parcel (Vendeur 4.10, Admin 4.8), for the seller in his space
 * and for the team in Colis and Chats. It reads the thread every few seconds
 * while the tab is shown. A message is sent under an id drawn here, so a
 * retry after a bad signal is the same message and never a second one.
 *
 * The seller reads the courier's first name only. What a person may do —
 * write, or only read — comes from the server with the thread, never from
 * this component's own guess.
 */
export function ChatPanel({
  side,
  code,
  initial,
  readOnly = false,
}: {
  side: 'seller' | 'staff';
  code: string;
  initial: ChatThreadView | null;
  /** "Voir comme le vendeur": the admin reads, and writes nothing (D-5). */
  readOnly?: boolean;
}) {
  const [thread, setThread] = useState<ChatThreadView | null>(initial);
  const [pending, setPending] = useState<Pending[]>([]);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    const result = await bff<{ thread: ChatThreadView | null }>('GET', `chat/${side}/${code}`);
    if (result.ok) setThread(result.data.thread);
  }, [side, code]);

  useEffect(() => {
    // The seller's chat is read while an admin looks as him with his own session: not polled.
    if (readOnly) return;
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [load, readOnly]);

  const messageCount = (thread?.messages.length ?? 0) + pending.length;
  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [messageCount]);

  async function send(id: string, body: string) {
    setError(null);
    setPending((current) =>
      current.some((item) => item.id === id)
        ? current.map((item) => (item.id === id ? { ...item, failed: null } : item))
        : [...current, { id, body, failed: null }],
    );
    const result = await bff<{ message: ChatMessageView; replayed: boolean }>(
      'POST',
      `chat/${side}/${code}/messages`,
      { messageId: id, body },
    );
    if (result.ok) {
      setPending((current) => current.filter((item) => item.id !== id));
      setThread((current) =>
        current && !current.messages.some((message) => message.id === id)
          ? { ...current, messages: [...current.messages, result.data.message] }
          : current,
      );
      return;
    }
    // A refusal is final (the chat closed, a bad message): drop it and say why.
    // A network or server failure is kept, to send again under the same id.
    if (result.status >= 400 && result.status < 500) {
      setPending((current) => current.filter((item) => item.id !== id));
      setError(result.error.message);
      void load();
      return;
    }
    setPending((current) =>
      current.map((item) =>
        item.id === id ? { ...item, failed: 'Message pas envoyé. Réessayez.' } : item,
      ),
    );
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const body = draft.trim();
    if (!body) return;
    setDraft('');
    void send(crypto.randomUUID(), body);
  }

  if (!thread) {
    return (
      <section id="chat" className="card" aria-label="Chat du colis">
        <h2 className="mb-2 font-display text-lg font-bold text-navy">Chat du colis</h2>
        <p className="text-sm text-navy/70">{CHAT_MESSAGES_FR.CHAT_NON_OUVERT}</p>
      </section>
    );
  }

  const writer = !readOnly && thread.canPost;
  return (
    <section id="chat" className="card" aria-label="Chat du colis">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg font-bold text-navy">Chat du colis</h2>
        <span className={thread.state === 'OUVERT' ? 'badge-ok' : 'badge-muted'}>
          {CHAT_THREAD_STATE_LABELS_FR[thread.state]}
        </span>
      </div>
      <p className="mb-3 text-sm text-navy/70">
        {side === 'seller'
          ? thread.courierName
            ? `Livreur : ${thread.courierName}`
            : 'Aucun livreur pour le moment'
          : `${thread.shopName} · ${thread.courierName ?? 'aucun livreur'}`}
      </p>

      <div
        className="mb-3 max-h-96 space-y-2 overflow-y-auto rounded-lg bg-navy/5 p-3"
        role="log"
        aria-live="polite"
      >
        {thread.messages.length === 0 && pending.length === 0 && (
          <p className="text-sm text-navy/60">Aucun message pour le moment.</p>
        )}
        {thread.messages.map((message) => (
          <div
            key={message.id}
            className={message.mine ? 'flex justify-end' : 'flex justify-start'}
          >
            <div
              className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                message.mine ? 'bg-orange text-navy' : 'border border-navy/10 bg-white text-navy'
              }`}
            >
              <p className="text-xs font-semibold">{message.label}</p>
              <p className="whitespace-pre-wrap break-words">{message.body}</p>
              <p className="mt-1 text-xs text-navy/60">
                {time.format(new Date(message.createdAt))}
              </p>
            </div>
          </div>
        ))}
        {pending.map((item) => (
          <div key={item.id} className="flex justify-end">
            <div className="max-w-[85%] rounded-xl bg-orange/60 px-3 py-2 text-sm text-navy">
              <p className="text-xs font-semibold">Vous</p>
              <p className="whitespace-pre-wrap break-words">{item.body}</p>
              {item.failed ? (
                <p className="mt-1 text-xs">
                  {item.failed}{' '}
                  <button
                    type="button"
                    className="font-semibold underline"
                    onClick={() => void send(item.id, item.body)}
                  >
                    Réessayer
                  </button>
                </p>
              ) : (
                <p className="mt-1 text-xs text-navy/70">Envoi…</p>
              )}
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      {error && (
        <p role="alert" className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-900">
          {error}
        </p>
      )}

      {writer ? (
        <form onSubmit={submit} className="space-y-2">
          {side === 'seller' && (
            <div className="flex flex-wrap gap-2">
              {CHAT_QUICK_REPLIES_SELLER.map((reply) => (
                <button
                  key={reply}
                  type="button"
                  className="btn-secondary min-h-9 px-3 py-1 text-sm"
                  onClick={() => setDraft(reply)}
                >
                  {reply}
                </button>
              ))}
            </div>
          )}
          <label className="field-label" htmlFor={`chat-${code}`}>
            Votre message
          </label>
          <textarea
            id={`chat-${code}`}
            className="field"
            rows={2}
            maxLength={CHAT_MESSAGE_MAX_LENGTH}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          {side === 'staff' && (
            <p className="text-xs text-navy/60">Vos messages apparaissent sous le nom Faffa Go.</p>
          )}
          <button type="submit" className="btn-primary" disabled={draft.trim() === ''}>
            Envoyer
          </button>
        </form>
      ) : (
        <p className="text-sm text-navy/70" data-testid="chat-refusal">
          {readOnly
            ? 'Vous consultez ce chat en lecture seule.'
            : thread.refusal
              ? CHAT_MESSAGES_FR[thread.refusal]
              : ''}
        </p>
      )}
    </section>
  );
}
