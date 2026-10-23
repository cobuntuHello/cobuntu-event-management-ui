"use client";

import { useRef, useLayoutEffect, useState, useCallback } from "react";

export interface MarkdownEditorProps {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  disabled?: boolean;
  minRows?: number;
  autoFocus?: boolean;
}

/**
 * A plain-text input that looks like it understands markdown while you type
 * it — Discord/Obsidian-style live preview, not a WYSIWYG editor. The value
 * IS the markdown source (what gets saved) — never HTML. The bold/italic/etc.
 * you see is a read-only overlay rendered from that same text and pinned
 * exactly on top of a transparent-text textarea, so every native textarea
 * behaviour (caret, selection, undo, spellcheck, resize) keeps working for
 * free instead of being reimplemented.
 */

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function formatLine(raw: string): string {
  let line = escapeHtml(raw);

  // Every multi-character delimiter (code/bold/strike) is matched and
  // immediately masked behind a placeholder token, so its own literal
  // marker characters (the two asterisks in "**", etc.) can never be
  // re-matched by the italic pass that runs after it — without this, a
  // bold span's rendered "**" text is itself a pair of asterisks the
  // italic regex would happily treat as its own delimiters.
  const tokens: string[] = [];
  const mask = (html: string) => {
    const i = tokens.length;
    tokens.push(html);
    return `\u0000${i}\u0000`;
  };

  line = line.replace(/`([^`\n]+)`/g, (_, inner) =>
    mask(`<span class="text-zinc-300">\`</span><code class="font-mono text-[0.9em] bg-zinc-900/5 rounded px-1">${inner}</code><span class="text-zinc-300">\`</span>`),
  );
  line = line.replace(/\*\*(.+?)\*\*/g, (_, inner) =>
    mask(`<span class="text-zinc-300">**</span><strong class="text-zinc-900">${inner}</strong><span class="text-zinc-300">**</span>`),
  );
  line = line.replace(/__(.+?)__/g, (_, inner) =>
    mask(`<span class="text-zinc-300">__</span><strong class="text-zinc-900">${inner}</strong><span class="text-zinc-300">__</span>`),
  );
  line = line.replace(/~~(.+?)~~/g, (_, inner) =>
    mask(`<span class="text-zinc-300">~~</span><del class="text-zinc-500">${inner}</del><span class="text-zinc-300">~~</span>`),
  );

  line = line
    .replace(/(?<![*\w])\*(?!\s)(.+?)(?<!\s)\*(?!\w)/g, '<span class="text-zinc-300">*</span><em>$1</em><span class="text-zinc-300">*</span>')
    .replace(/(?<![_\w])_(?!\s)(.+?)(?<!\s)_(?!\w)/g, '<span class="text-zinc-300">_</span><em>$1</em><span class="text-zinc-300">_</span>');

  line = line.replace(/\u0000(\d+)\u0000/g, (_, i) => tokens[Number(i)]);

  const heading = line.match(/^(#{1,3})(\s+)(.*)$/);
  if (heading) {
    const level = heading[1].length;
    const sizeClass = level === 1 ? "font-bold text-[1.15em]" : level === 2 ? "font-bold text-[1.08em]" : "font-semibold";
    return `<span class="text-zinc-300">${heading[1]}</span>${heading[2]}<span class="${sizeClass}">${heading[3]}</span>`;
  }
  const quote = line.match(/^(&gt;)(\s+)(.*)$/);
  if (quote) {
    return `<span class="text-zinc-300">&gt;</span>${quote[2]}<span class="italic text-zinc-500">${quote[3]}</span>`;
  }
  const bullet = line.match(/^([-*])(\s+)(.*)$/);
  if (bullet) {
    return `<span class="text-zinc-300">${bullet[1]}</span>${bullet[2]}${bullet[3]}`;
  }
  const ordered = line.match(/^(\d+\.)(\s+)(.*)$/);
  if (ordered) {
    return `<span class="text-zinc-300">${ordered[1]}</span>${ordered[2]}${ordered[3]}`;
  }
  return line;
}

export function MarkdownEditor({
  value,
  onChange,
  placeholder,
  disabled,
  minRows = 6,
  autoFocus,
}: MarkdownEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [focused, setFocused] = useState(false);

  const resize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  useLayoutEffect(() => {
    resize();
  }, [value, resize]);

  const html = value.length ? value.split("\n").map(formatLine).join("\n") : "";

  return (
    <div
      className={`group relative rounded-2xl transition-all duration-150 ${
        disabled
          ? "bg-zinc-50 opacity-60"
          : focused
          ? "bg-white shadow-[0_1px_2px_rgba(16,24,32,0.04),0_0_0_4px_rgba(24,24,27,0.05)] ring-1 ring-zinc-200"
          : "bg-zinc-50 ring-1 ring-transparent hover:ring-zinc-100"
      }`}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words px-4 py-3.5 text-[14.5px] leading-relaxed text-zinc-800"
        dangerouslySetInnerHTML={{ __html: html || "&nbsp;" }}
      />
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        disabled={disabled}
        autoFocus={autoFocus}
        rows={minRows}
        spellCheck
        className="relative w-full resize-none overflow-hidden whitespace-pre-wrap break-words border-0 bg-transparent px-4 py-3.5 text-[14.5px] leading-relaxed text-transparent caret-zinc-900 outline-none placeholder:text-zinc-300"
      />
    </div>
  );
}
