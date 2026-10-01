"use client"

import { useState, KeyboardEvent } from "react"
import { X } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"

interface TagInputProps {
    value: string[] // Array of tags
    onChange: (tags: string[]) => void
    placeholder?: string
    className?: string
}

export function TagInput({ value, onChange, placeholder, className }: TagInputProps) {
    const [inputValue, setInputValue] = useState("")

    const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter" || e.key === ",") {
            e.preventDefault()
            addTag()
        } else if (e.key === "Backspace" && !inputValue && value.length > 0) {
            // Remove last tag on backspace if input is empty
            removeTag(value.length - 1)
        }
    }

    const addTag = () => {
        const trimmed = inputValue.trim().toLowerCase()
        if (trimmed && !value.includes(trimmed)) {
            onChange([...value, trimmed])
            setInputValue("")
        }
    }

    const removeTag = (index: number) => {
        onChange(value.filter((_, i) => i !== index))
    }

    return (
        <div
            className={`field flex flex-wrap items-center gap-2 p-2 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus ${className ?? ""}`}
        >
            {value.map((tag, index) => (
                <Badge
                    key={index}
                    variant="brand"
                    size="lg"
                    className="bg-brand-soft text-brand-soft-foreground pl-2.5"
                >
                    {tag}
                    <button
                        type="button"
                        onClick={() => removeTag(index)}
                        aria-label={`Remove ${tag}`}
                        className="press-subtle -mr-1 flex size-4 items-center justify-center rounded-full text-brand-soft-foreground hover:bg-brand-soft-hover"
                    >
                        <X className="size-3" />
                    </button>
                </Badge>
            ))}
            <Input
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={addTag}
                placeholder={value.length === 0 ? placeholder : ""}
                className="min-w-[120px] flex-1 border-0 bg-transparent px-1 shadow-none focus-visible:outline-none"
            />
        </div>
    )
}