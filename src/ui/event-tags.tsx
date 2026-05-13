"use client";

import React, { useState, useEffect, useRef } from "react";
import { Plus, X } from "lucide-react";
import { Input } from "./input";
import { cn } from "./utils";
import { useEventManagementConfig, type EventManagementConfig } from "../config";

function getTagColor(name: string): { bg: string; text: string } {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  const h = Math.abs(hash) % 360;
  const s = 30 + (Math.abs(hash >> 8) % 15);
  const l = 72 + (Math.abs(hash >> 16) % 13);
  return { bg: `hsl(${h}, ${s}%, ${l}%)`, text: l < 60 ? "#ffffff" : "#1a1a1a" };
}

interface Tag { id: string; name: string; searchName?: string; }

interface EventTagsProps {
  selectedTags: Tag[];
  onTagsChange: (tags: Tag[]) => void;
  placeholder?: string;
  disabled?: boolean;
}

function useDebounce(value: string, delay: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

async function searchTags(config: EventManagementConfig, query: string): Promise<Tag[]> {
  try {
    const res = await fetch(`${config.apiBaseUrl}/api/events/search-tags?q=${encodeURIComponent(query)}`, {
      headers: config.authHeaders(),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch { return []; }
}

async function createTag(config: EventManagementConfig, name: string): Promise<Tag> {
  const res = await fetch(`${config.apiBaseUrl}/api/tags`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...config.authHeaders() },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error("Failed to create tag");
  return res.json();
}

export const EventTags = React.forwardRef<HTMLInputElement, EventTagsProps>(
  ({ selectedTags, onTagsChange, placeholder = "Add tags...", disabled = false }, ref) => {
    const config = useEventManagementConfig();
    const [inputValue, setInputValue] = useState("");
    const [suggestions, setSuggestions] = useState<Tag[]>([]);
    const [isOpen, setIsOpen] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(-1);
    const [isCreatingTag, setIsCreatingTag] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const suggestionsRef = useRef<HTMLDivElement>(null);

    React.useImperativeHandle(ref, () => inputRef.current as HTMLInputElement);

    const debouncedQuery = useDebounce(inputValue, 500);

    useEffect(() => {
      if (debouncedQuery.length >= 2) {
        searchTags(config, debouncedQuery).then(results => {
          setSuggestions(results);
          if (results.length > 0) setIsOpen(true);
        });
      } else {
        setSuggestions([]);
      }
    }, [debouncedQuery, config]);

    const availableSuggestions = suggestions.filter(s => !selectedTags.some(t => t.id === s.id));

    const handleTagSelect = (tag: Tag) => {
      if (selectedTags.some(t => t.id === tag.id)) return;
      if (selectedTags.length >= 10) return;
      onTagsChange([...selectedTags, tag]);
      setInputValue("");
      setIsOpen(false);
      setSelectedIndex(-1);
      inputRef.current?.focus();
    };

    const handleTagRemove = (tagId: string) => {
      onTagsChange(selectedTags.filter(t => t.id !== tagId));
    };

    const handleCreateOrSelect = async (tagName: string) => {
      if (isCreatingTag) return;
      const trimmed = tagName.trim();
      if (!trimmed || trimmed.length > 20) return;

      const existing = suggestions.find(t => t.name.toLowerCase() === trimmed.toLowerCase());
      if (existing) { handleTagSelect(existing); return; }
      if (selectedTags.some(t => t.name.toLowerCase() === trimmed.toLowerCase())) { setInputValue(""); return; }
      if (selectedTags.length >= 10) { setInputValue(""); return; }

      try {
        setIsCreatingTag(true);
        const newTag = await createTag(config, trimmed);
        onTagsChange([...selectedTags, newTag]);
        setInputValue("");
        setIsOpen(false);
        setSelectedIndex(-1);
      } catch { /* swallow — surfaced via console; UI just stays open */ }
      finally { setIsCreatingTag(false); inputRef.current?.focus(); }
    };

    const handleKeyDown = async (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (isOpen && selectedIndex >= 0 && selectedIndex < availableSuggestions.length) {
          handleTagSelect(availableSuggestions[selectedIndex]);
          return;
        }
        if (inputValue.trim()) await handleCreateOrSelect(inputValue.trim());
        return;
      }
      if (!isOpen) return;
      if (e.key === "ArrowDown") { e.preventDefault(); setSelectedIndex(prev => prev < availableSuggestions.length - 1 ? prev + 1 : 0); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setSelectedIndex(prev => prev > 0 ? prev - 1 : availableSuggestions.length - 1); }
      else if (e.key === "Escape") { setIsOpen(false); setSelectedIndex(-1); inputRef.current?.blur(); }
    };

    return (
      <div className="relative w-full">
        <Input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={e => { setInputValue(e.target.value); setIsOpen(true); setSelectedIndex(-1); }}
          onFocus={() => { if (availableSuggestions.length > 0) setIsOpen(true); }}
          onBlur={e => { if (!suggestionsRef.current?.contains(e.relatedTarget as Node)) { setIsOpen(false); setSelectedIndex(-1); } }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="w-full text-sm"
          disabled={disabled}
        />

        {isOpen && availableSuggestions.length > 0 && (
          <div ref={suggestionsRef}
            className="absolute z-50 w-full bg-white border border-zinc-200 rounded-lg shadow-xl max-h-48 overflow-y-auto top-full mt-1">
            {availableSuggestions.map((suggestion, index) => (
              <button key={suggestion.id} type="button" onClick={() => handleTagSelect(suggestion)}
                className={cn("w-full px-3 py-2 text-left text-sm hover:bg-zinc-50 flex items-center gap-2 cursor-pointer",
                  index === selectedIndex && "bg-zinc-100")}>
                <Plus className="w-4 h-4 text-zinc-400" />
                {suggestion.name}
              </button>
            ))}
          </div>
        )}

        {selectedTags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {selectedTags.map(tag => {
              const color = getTagColor(tag.name);
              return (
                <span key={tag.id} className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full"
                  style={{ backgroundColor: color.bg, color: color.text }}>
                  {tag.name}
                  {!disabled && (
                    <button type="button" onClick={() => handleTagRemove(tag.id)} className="opacity-60 hover:opacity-100 cursor-pointer">
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </span>
              );
            })}
          </div>
        )}
      </div>
    );
  }
);

EventTags.displayName = "EventTags";
