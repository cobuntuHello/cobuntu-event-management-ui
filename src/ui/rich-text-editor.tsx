"use client";

import React, { Suspense, lazy, useEffect, useMemo, useState } from "react";
import "react-quill-new/dist/quill.snow.css";
import "./rich-text-editor.css";

// react-quill-new touches `document` on import — defer to client only.
//
// This was next/dynamic({ ssr: false }). Same behaviour without the framework:
// nothing renders on the server or before mount, then the editor loads lazily.
// The wizard that contains this is also rendered on sites that are not Next.
const LazyQuill = lazy(() => import("react-quill-new"));
function ReactQuill(props: React.ComponentProps<typeof LazyQuill>) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return (
    <Suspense fallback={null}>
      <LazyQuill {...props} />
    </Suspense>
  );
}

interface RichTextEditorProps {
  content: string;
  onChange: (content: string) => void;
  placeholder?: string;
}

const TOOLBAR_OPTIONS = [
  [{ header: [1, 2, 3, false] }],
  ["bold", "italic", "underline", "strike"],
  [{ list: "ordered" }, { list: "bullet" }],
  ["blockquote", "code-block"],
  ["link", "image"],
  ["clean"],
];

export function RichTextEditor({ content, onChange, placeholder = "Start writing..." }: RichTextEditorProps) {
  const modules = useMemo(() => ({
    toolbar: TOOLBAR_OPTIONS,
  }), []);

  return (
    <div className="rich-text-editor">
      <ReactQuill
        theme="snow"
        value={content}
        onChange={onChange}
        modules={modules}
        placeholder={placeholder}
      />
    </div>
  );
}
