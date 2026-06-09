/**
 * components/ui/ChatWindow.jsx  (v2)
 *
 * Full chat interface with:
 *  - Scrollable message history
 *  - Animated AI typing indicator
 *  - Auto-growing textarea
 *  - Enter-to-send (Shift+Enter for newline)
 *  - Accessible roles & labels
 *  - Disabled state for completed sessions
 */

import { useState, useRef, useEffect } from 'react';
import { Send } from 'lucide-react';
import ChatMessage from './ChatMessage';
import { cn } from '../../utils/cn';
import { formatDateTime } from '../../utils/formatters';

/**
 * @param {object}   props
 * @param {Array}    props.messages      — [{ role, content, timestamp }]
 * @param {Function} props.onSend        — async (text: string) => void
 * @param {boolean}  props.isLoading     — Show typing indicator
 * @param {boolean}  [props.disabled]    — Disable input when session is done
 * @param {string}   [props.placeholder]
 * @param {string}   [props.loadingLabel] — Custom label shown while loading
 */
export default function ChatWindow({
  messages = [],
  onSend,
  isLoading = false,
  disabled = false,
  placeholder = 'Describe your symptoms...',
  loadingLabel,
}) {
  const [input, setInput] = useState('');
  const bottomRef   = useRef(null);
  const textareaRef = useRef(null);

  // ── Auto-scroll on new messages / typing indicator ─────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // ── Auto-grow textarea ─────────────────────────────────────────────────────
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 128)}px`;
  }, [input]);

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e?.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isLoading || disabled) return;
    setInput('');
    await onSend(trimmed);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="flex flex-col h-full bg-gray-50 rounded-2xl border border-border overflow-hidden">

      {/* ── Message list ───────────────────────────────────────────────────── */}
      <div
        className="flex-1 overflow-y-auto p-4 space-y-4"
        role="log"
        aria-live="polite"
        aria-label="Triage conversation"
      >
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center py-16">
            <div className="h-16 w-16 rounded-full gradient-hero flex items-center justify-center mb-4 shadow-lg shadow-primary/20">
              <span className="text-2xl" role="img" aria-label="Hospital">🏥</span>
            </div>
            <p className="text-foreground font-semibold">Welcome to MediQ</p>
            <p className="text-muted-foreground text-sm mt-1 max-w-xs">
              Describe how you're feeling and I'll help assess your condition.
            </p>
          </div>
        )}

        {messages.map((msg, idx) => (
          <ChatMessage
            key={idx}
            role={msg.role}
            content={msg.content}
            timestamp={msg.timestamp ? formatDateTime(msg.timestamp) : undefined}
          />
        ))}

        {/* Typing indicator */}
        {isLoading && (
          <div className="flex gap-3 items-end" aria-label="AI is typing">
            <div className="h-8 w-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
              <span className="text-xs" role="img" aria-label="AI">🤖</span>
            </div>
            <div className="bg-white border border-border rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm">
              {loadingLabel ? (
                <p className="text-xs text-muted-foreground italic">{loadingLabel}</p>
              ) : (
                <div className="flex gap-1 items-center h-4">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="h-2 w-2 rounded-full bg-primary animate-pulse-dot"
                      style={{ animationDelay: `${i * 0.22}s` }}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        <div ref={bottomRef} aria-hidden="true" />
      </div>

      {/* ── Input bar ──────────────────────────────────────────────────────── */}
      <form
        onSubmit={handleSubmit}
        className={cn(
          'p-3 md:p-4 border-t border-border bg-white flex gap-3 items-end',
          disabled && 'opacity-50 pointer-events-none'
        )}
      >
        <textarea
          ref={textareaRef}
          rows={1}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={disabled ? 'Session complete.' : placeholder}
          disabled={disabled || isLoading}
          aria-label="Message input"
          className="flex-1 resize-none rounded-xl border border-input bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring overflow-y-auto transition-shadow"
          style={{ lineHeight: '1.5', minHeight: '44px', maxHeight: '128px' }}
        />
        <button
          type="submit"
          disabled={!input.trim() || isLoading || disabled}
          aria-label="Send message"
          className="h-11 w-11 rounded-xl gradient-hero flex items-center justify-center text-white shrink-0 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}
