/**
 * The description editor now lives ONCE, in @cobuntu/management-ui-shared
 * (T-321), with @mentions and images. This module stays as a re-export so
 * every import of "../ui/markdown-editor" (and the package's public
 * MarkdownEditor export) keeps working, and so events, products and courses
 * can never drift into different editors again.
 */
export { MarkdownEditor } from "@cobuntu/management-ui-shared";
export type { MarkdownEditorProps } from "@cobuntu/management-ui-shared";
