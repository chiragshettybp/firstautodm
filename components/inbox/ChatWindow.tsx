'use client'

import { useEffect, useState, useRef } from 'react'
import { Send, MoreVertical, Phone, Video, Zap, ChevronLeft } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'
import type { Message } from '@/types/db'

interface ChatWindowProps {
  conversationId: string | null
  recipientId?: string
  recipientName: string | null
  userId: string
  onBack?: () => void
}

export function ChatWindow({
  conversationId,
  recipientId,
  recipientName,
  userId,
  onBack,
}: ChatWindowProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(false)
  const [inputText, setInputText] = useState('')
  const [sending, setSending] = useState(false)
  const [isAutomationOpen, setIsAutomationOpen] = useState(false)
  const [automations, setAutomations] = useState<any[]>([])
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!conversationId) return

    const fetchMessages = async () => {
      setLoading(true)
      try {
        const res = await fetch(
          `/api/inbox/messages?conversationId=${conversationId}`,
        )
        const data = await res.json()
        if (Array.isArray(data)) {
          setMessages(data)
        }
      } catch (error) {
        console.error('Failed to load messages', error)
      } finally {
        setLoading(false)
      }
    }

    fetchMessages()
  }, [conversationId])

  // Fetch automations for quick reply
  useEffect(() => {
    if (userId) {
      fetch(`/api/automations?userId=${userId}`)
        .then((res) => res.json())
        .then((data) => {
          if (Array.isArray(data)) setAutomations(data)
        })
    }
  }, [userId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSendMessage = async (text: string = inputText) => {
    if (!text.trim() || !recipientId || !userId) return

    setSending(true)
    try {
      const res = await fetch('/api/inbox/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          recipientId,
          message: text,
        }),
      })

      if (res.ok) {
        setInputText('')
        // Optimistic update
        const newMsg: Message = {
          id: `temp_${Date.now()}`,
          conversation_id: conversationId!,
          user_id: userId,
          sender_id: 'me',
          sender_username: 'Me',
          content: text,
          is_from_instagram: false,
          created_at: new Date().toISOString(),
        }
        setMessages((prev) => [...prev, newMsg])
      }
    } catch (e) {
      console.error('Send failed', e)
    } finally {
      setSending(false)
      setIsAutomationOpen(false)
    }
  }

  if (!conversationId) {
    return (
      <div className="flex h-full flex-1 flex-col items-center justify-center gap-4 bg-card p-6 text-center">
        <span
          aria-hidden="true"
          className="flex size-16 items-center justify-center rounded-full border border-border bg-surface-secondary"
        >
          <Send className="size-6 text-muted-text" />
        </span>
        <div>
          <h3 className="text-lg leading-7 font-bold tracking-[-0.02em]">
            Your Messages
          </h3>
          <p className="mx-auto mt-2 max-w-xs text-sm leading-6 text-muted-text">
            Select a conversation from the left to start chatting live with your
            audience.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="relative flex h-full flex-1 flex-col bg-card">
      {/* Header */}
      <div className="flex h-16 shrink-0 items-center justify-between border-b border-border bg-card/80 px-4 backdrop-blur-md md:px-6">
        <div className="flex items-center gap-3">
          {onBack ? (
            <Button
              variant="ghost"
              size="icon"
              onClick={onBack}
              className="-ml-2 text-muted-text md:hidden"
              aria-label="Back to conversations"
            >
              <ChevronLeft className="size-6" />
            </Button>
          ) : null}
          <span
            aria-hidden="true"
            className="size-8 shrink-0 rounded-full border border-border bg-surface-secondary"
          />
          <div className="min-w-0">
            <h3 className="truncate text-sm font-bold">@{recipientName}</h3>
            <span className="hidden items-center gap-1.5 text-[10px] text-success md:flex">
              <span className="size-1.5 rounded-full bg-success" />
              Online via Instagram
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="hidden text-muted-text hover:text-foreground md:inline-flex"
            aria-label="Call"
          >
            <Phone />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="hidden text-muted-text hover:text-foreground md:inline-flex"
            aria-label="Video"
          >
            <Video />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-text hover:text-foreground"
            aria-label="More"
          >
            <MoreVertical />
          </Button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 space-y-4 overflow-y-auto p-4 md:space-y-6 md:p-6">
        {loading ? (
          <div className="flex justify-center py-10">
            <Spinner className="size-5 text-muted-text" />
            <span className="sr-only">Loading messages</span>
          </div>
        ) : (
          messages.map((msg) => {
            const isMe = !msg.is_from_instagram
            return (
              <div
                key={msg.id}
                className={cn('flex w-full', isMe ? 'justify-end' : 'justify-start')}
              >
                <div
                  className={cn(
                    'max-w-[85%] break-words rounded-[16px] px-4 py-3 text-sm shadow-sm md:max-w-[70%]',
                    isMe
                      ? 'rounded-br-[4px] bg-brand text-brand-foreground'
                      : 'rounded-bl-[4px] border border-border bg-surface-secondary text-foreground',
                  )}
                >
                  {msg.content}
                  <div
                    className={cn(
                      'mt-1 text-[10px]',
                      isMe
                        ? 'text-right text-brand-foreground/70'
                        : 'text-muted-text',
                    )}
                  >
                    {new Date(msg.created_at).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>
                </div>
              </div>
            )
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Quick responses */}
      {isAutomationOpen ? (
        <div className="absolute right-4 bottom-20 left-4 z-50 rounded-[16px] border border-border bg-overlay p-2 shadow-xl md:left-auto md:w-80">
          <div className="mb-1 px-2 py-1.5 text-xs font-semibold tracking-wider text-muted-text uppercase">
            Quick Responses
          </div>
          <div className="max-h-60 space-y-1 overflow-y-auto">
            {automations.map((auto) => (
              <button
                key={auto.id}
                type="button"
                onClick={() =>
                  handleSendMessage(auto.response_content?.message || auto.name)
                }
                className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-default"
              >
                <Zap
                  className="size-3 shrink-0 text-brand"
                  aria-hidden="true"
                />
                <span className="truncate">{auto.name}</span>
              </button>
            ))}
            {automations.length === 0 ? (
              <div className="px-3 py-4 text-center text-xs text-muted-text">
                No automations found.
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Composer */}
      <div className="shrink-0 border-t border-border bg-card p-3 md:p-4">
        <div className="field flex items-center gap-2 p-1.5 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus">
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={() => setIsAutomationOpen(!isAutomationOpen)}
            aria-label="Toggle quick responses"
            aria-expanded={isAutomationOpen}
            className={cn(
              'shrink-0 text-muted-text',
              isAutomationOpen
                ? 'bg-brand-soft text-brand-soft-foreground'
                : 'hover:bg-default hover:text-brand',
            )}
          >
            <Zap />
          </Button>
          <input
            className="min-w-0 flex-1 border-0 bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-text focus-visible:outline-none"
            placeholder="Type a message..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !sending) {
                e.preventDefault()
                handleSendMessage()
              }
            }}
            disabled={sending}
          />
          <Button
            onClick={() => handleSendMessage()}
            disabled={sending || !inputText.trim()}
            size="icon-sm"
            aria-label="Send message"
          >
            {sending ? (
              <Spinner />
            ) : (
              <Send className="size-4" aria-hidden="true" />
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}