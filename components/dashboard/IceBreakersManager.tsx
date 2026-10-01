'use client'

import { useState, useEffect } from 'react'
import { Plus, Trash2, Save, RefreshCw, Sparkles } from 'lucide-react'
import { toast } from 'sonner'

import { useInstagramSession } from '@/hooks/use-instagram-session'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'
import { Eyebrow } from '@/components/ui/eyebrow'
import { EmptyState } from '@/components/ui/page-state'
import { Spinner } from '@/components/ui/spinner'

type IceBreakerRow = { id?: string; question: string; response: string }

const MAX_BREAKERS = 4

export function IceBreakersManager() {
  const { userId, isLoading } = useInstagramSession()
  const [breakers, setBreakers] = useState<IceBreakerRow[]>([])
  const [saving, setSaving] = useState(false)
  const [fetching, setFetching] = useState(true)

  useEffect(() => {
    if (!userId) return
    fetch(`/api/ice-breakers?userId=${userId}`)
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setBreakers(data)
        setFetching(false)
      })
      .catch((err) => {
        console.error(err)
        setFetching(false)
      })
  }, [userId])

  const handleAdd = () => {
    if (breakers.length >= MAX_BREAKERS) {
      toast.error('Maximum 4 Ice Breakers allowed by Instagram')
      return
    }
    setBreakers([...breakers, { question: '', response: '' }])
  }

  const handleChange = (
    index: number,
    field: 'question' | 'response',
    value: string,
  ) => {
    const newBreakers = [...breakers]
    newBreakers[index] = { ...newBreakers[index], [field]: value }
    setBreakers(newBreakers)
  }

  const handleRemove = (index: number) => {
    setBreakers(breakers.filter((_, i) => i !== index))
  }

  const handleSave = async () => {
    if (!userId) return

    // Validation
    if (breakers.some((b) => !b.question?.trim() || !b.response?.trim())) {
      toast.error('Please fill in all fields')
      return
    }

    setSaving(true)
    try {
      const res = await fetch('/api/ice-breakers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, iceBreakers: breakers }),
      })
      const data = await res.json()
      if (data.success) {
        toast.success('Ice Breakers saved & synced usually!')
      } else {
        toast.error('Failed to save')
      }
    } catch (e) {
      toast.error('Error saving')
    } finally {
      setSaving(false)
    }
  }

  if (isLoading || (fetching && !breakers.length)) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Spinner className="size-5 text-muted-text" />
        <span className="sr-only">Loading ice breakers</span>
      </div>
    )
  }

  if (!userId) {
    return (
      <div className="mx-auto max-w-2xl">
        <Card className="page-pad-airy border-dashed">
          <EmptyState
            icon={<Sparkles />}
            title="Not connected"
            description="Connect your Instagram account to manage Ice Breakers."
          />
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title="Ice Breakers"
        description="Questions people see when they start a chat with you."
        action={
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <Spinner className="mr-2" />
            ) : (
              <Save className="mr-2" aria-hidden="true" />
            )}
            Save &amp; Sync
          </Button>
        }
      />

      <div className="space-y-4">
        {breakers.map((item, idx) => (
          <Card key={idx} className="space-y-3 p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 space-y-3">
                <Eyebrow>Question {idx + 1}</Eyebrow>
                <Input
                  value={item.question}
                  onChange={(e) => handleChange(idx, 'question', e.target.value)}
                  placeholder="e.g., What are your prices?"
                  maxLength={80}
                  aria-label={`Question ${idx + 1}`}
                />
                <Eyebrow>Auto-Response</Eyebrow>
                <Textarea
                  value={item.response}
                  onChange={(e) => handleChange(idx, 'response', e.target.value)}
                  placeholder="The reply users will receive..."
                  rows={2}
                  aria-label={`Auto-response ${idx + 1}`}
                />
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => handleRemove(idx)}
                aria-label={`Remove ice breaker ${idx + 1}`}
                className="shrink-0 text-muted-text hover:text-danger-soft-foreground hover:bg-danger-soft"
              >
                <Trash2 aria-hidden="true" />
              </Button>
            </div>
          </Card>
        ))}

        {breakers.length === 0 ? (
          <Card className="border-dashed">
            <EmptyState
              icon={<Sparkles />}
              title="No ice breakers yet"
              description="Add one to get started!"
            />
          </Card>
        ) : null}

        {breakers.length < MAX_BREAKERS ? (
          <Button variant="outline-dashed" onClick={handleAdd} className="w-full">
            <Plus className="mr-2" aria-hidden="true" /> Add Question
          </Button>
        ) : (
          <p className="text-center text-xs text-muted-text">
            Instagram allows a maximum of 4 ice breakers.
          </p>
        )}
      </div>

      <Card className="flex gap-3 p-4">
        <RefreshCw
          className="size-5 shrink-0 text-muted-text"
          aria-hidden="true"
        />
        <p className="text-sm leading-6">
          Changes made here are automatically synced to your Instagram Profile.
          It may take a few minutes for them to appear for all users.
        </p>
      </Card>
    </div>
  )
}