'use client'

import { useState } from 'react'

import { useInstagramSession } from '@/hooks/use-instagram-session'
import { ConversationList } from '@/components/inbox/ConversationList'
import { ChatWindow } from '@/components/inbox/ChatWindow'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'

/**
 * The inbox is a full-height two-pane app surface, not a page that scrolls.
 * Below 768px it becomes a single pane: the list slides out when a
 * conversation is opened, and the chat slides back in — with a real back
 * button rather than a gesture.
 */
export default function InboxPage() {
  const { userId, isLoading } = useInstagramSession()
  const [selectedConversationId, setSelectedConversationId] = useState<
    string | null
  >(null)
  const [selectedRecipientName, setSelectedRecipientName] = useState<
    string | null
  >(null)
  const [selectedRecipientId, setSelectedRecipientId] = useState<string | null>(
    null,
  )

  const handleSelect = (id: string, name: string, recipientId: string) => {
    setSelectedConversationId(id)
    setSelectedRecipientName(name)
    setSelectedRecipientId(recipientId)
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Spinner className="size-5 text-muted-text" />
        <span className="sr-only">Loading inbox</span>
      </div>
    )
  }

  if (!userId) {
    return null
  }

  return (
    <div className="relative flex h-[calc(100vh-7rem)] overflow-hidden rounded-[16px] border border-border bg-card md:h-[calc(100vh-8rem)]">
      {/* Left pane: conversation list */}
      <div
        className={cn(
          'absolute inset-0 z-10 h-full w-full shrink-0 border-r border-border bg-surface-secondary transition-transform duration-300 md:static md:w-[350px]',
          selectedConversationId
            ? '-translate-x-full md:translate-x-0'
            : 'translate-x-0',
        )}
      >
        <ConversationList
          userId={userId}
          selectedId={selectedConversationId}
          onSelect={handleSelect}
        />
      </div>

      {/* Right pane: chat */}
      <div
        className={cn(
          'absolute inset-0 z-20 h-full w-full flex-1 bg-card transition-transform duration-300 md:static',
          selectedConversationId
            ? 'translate-x-0'
            : 'translate-x-full md:translate-x-0',
        )}
      >
        <ChatWindow
          conversationId={selectedConversationId}
          recipientName={selectedRecipientName}
          recipientId={selectedRecipientId || undefined}
          userId={userId}
          onBack={() => setSelectedConversationId(null)}
        />
      </div>
    </div>
  )
}