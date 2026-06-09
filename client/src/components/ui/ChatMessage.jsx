/**
 * components/ui/ChatMessage.jsx
 *
 * Renders a single message bubble in the chat window.
 * Supports user and assistant roles.
 */

import { cn } from '../../utils/cn';
import { Bot, User } from 'lucide-react';

/**
 * @param {object} props
 * @param {'user'|'assistant'|'system'} props.role
 * @param {string} props.content
 * @param {string} [props.timestamp]
 */
export default function ChatMessage({ role, content, timestamp }) {
  const isUser = role === 'user';

  return (
    <div
      className={cn(
        'flex gap-3 items-end',
        isUser ? 'flex-row-reverse' : 'flex-row'
      )}
      role="listitem"
    >
      {/* Avatar */}
      <div
        className={cn(
          'h-8 w-8 rounded-full flex items-center justify-center shrink-0 text-white',
          isUser ? 'gradient-hero' : 'bg-gray-200 text-gray-600'
        )}
      >
        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </div>

      {/* Bubble */}
      <div
        className={cn(
          'max-w-[75%] px-4 py-3 rounded-2xl text-sm leading-relaxed',
          isUser
            ? 'gradient-hero text-white rounded-br-sm'
            : 'bg-white border border-border text-foreground shadow-sm rounded-bl-sm'
        )}
      >
        <p className="whitespace-pre-wrap">{content}</p>
        {timestamp && (
          <p
            className={cn(
              'text-[10px] mt-1.5',
              isUser ? 'text-white/70 text-right' : 'text-muted-foreground'
            )}
          >
            {timestamp}
          </p>
        )}
      </div>
    </div>
  );
}
