'use client'

import { useEffect, useState } from 'react'
import { MessageSquare, UserCircle } from 'lucide-react'

import { SearchInput } from '@/components/ui/search-input'
import { EmptyState } from '@/components/ui/page-state'
import { cn } from '@/lib/utils'
import type { Conversation } from '@/types/db'

interface ConversationListProps {
  userId: string
  selectedId: string | null
  onSelect: (id: string, username: string, recipientId: string) => void
}

export function ConversationList({
  userId,
  selectedId,
  onSelect,
}: ConversationListProps) {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!userId) return

    const fetchConversations = async () => {
      try {
        const res = await fetch(`/api/inbox/conversations?userId=${userId}`)
        const data = await res.json()
        if (Array.isArray(data)) {
          setConversations(data)
        }
      } catch (error) {
        console.error('Failed to load conversations', error)
      } finally {
        setLoading(false)
      }
    }

    fetchConversations()
  }, [userId])

  if (loading) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex h-full flex-col gap-3 p-4"
      >
        <div className="h-7 w-24 animate-pulse rounded-[8px] bg-surface-tertiary" />
        <div className="h-9 animate-pulse rounded-[12px] bg-surface-tertiary" />
        <div className="mt-2 flex flex-col gap-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-[68px] animate-pulse rounded-[12px] bg-surface-tertiary"
            />
          ))}
        </div>
        <span className="sr-only">Loading conversations</span>
      </div>
    )
  }

  return (
    <div className="flex h-full w-full flex-col bg-surface-secondary md:w-[350px]">
      <div className="border-b border-border p-4">
        <h2 className="mb-3 text-lg leading-7 font-bold tracking-[-0.02em]">
          Inbox
        </h2>
        <SearchInput placeholder="Search messages..." />
      </div>

      <div className="flex-1 space-y-1 overflow-y-auto p-2">
        {conversations.length === 0 ? (
          <EmptyState
            icon={<MessageSquare />}
            title="No conversations yet"
            description="Replies your automations send will appear here."
            className="min-h-0 py-10"
          />
        ) : (
          conversations.map((conv) => {
            const selected = selectedId === conv.id
            return (
              <button
                key={conv.id}
                type="button"
                onClick={() =>
                  onSelect(
                    conv.id,
                    conv.recipient_username,
                    conv.recipient_id.toString(),
                  )
                }
                aria-current={selected ? 'true' : undefined}
                className={cn(
                  'flex w-full items-center gap-3 rounded-[12px] border p-3 text-left transition-colors',
                  selected
                    ? 'border-brand-soft bg-brand-soft'
                    : 'border-transparent hover:bg-surface hover:border-border',
                )}
              >
                <span className="flex size-12 shrink-0 items-center justify-center rounded-full border border-border bg-surface-secondary">
                  <UserCircle
                    className="size-6 text-muted-text"
                    aria-hidden="true"
                  />
                </span>
                <span className="min-w-0 flex-1 text-left">
                  <span className="mb-0.5 flex items-center justify-between gap-2">
                    <span
                      className={cn(
                        'truncate text-sm font-semibold',
                        selected ? 'text-brand-soft-foreground' : 'text-foreground',
                      )}
                    >
                      {conv.recipient_username}
                    </span>
                    <span className="shrink-0 text-[10px] whitespace-nowrap text-muted-text">
                      {new Date(conv.last_message_at).toLocaleDateString([], {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                  </span>
                  <span className="block truncate text-xs text-muted-text">
                    Open to view conversation
                  </span>
                </span>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}