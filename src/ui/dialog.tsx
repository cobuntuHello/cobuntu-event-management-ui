"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "./utils";

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogPortal = DialogPrimitive.Portal;
const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn("fixed inset-0 z-[130] bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0", className)}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

const DialogContent = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    hideClose?: boolean;
    /**
     * Below `sm`, dock to the bottom edge as a drawer instead of floating in
     * the middle of the viewport.
     *
     * A centred box on a phone is a desktop modal that has been shrunk: it
     * leaves dead space above and below, its content is furthest from the
     * thumb, and there is no edge to swipe. Docked, it reads as the drawer the
     * rest of the app uses, and a tall form grows downward from a fixed top
     * rather than expanding in both directions around the centre.
     *
     * OPT-IN rather than the default, because this primitive backs every modal
     * in the package and a short confirm dialog is fine centred. Flipping the
     * default is a one-line change here once every caller has been looked at.
     */
    mobileDrawer?: boolean;
    /**
     * Lay the panel out as header / scrolling body / footer, with a fixed
     * ceiling, instead of letting it grow with its content.
     *
     * A modal holding a REPEATABLE list has no natural height: add eight
     * locations and the panel grows past the viewport, and because the whole
     * panel is the scroll container, Cancel and Done scroll away with the rows.
     * The way out of the dialog should not be something you have to go looking
     * for.
     *
     * With this on, the panel is `flex flex-col` + `overflow-hidden`; the
     * caller puts its scrollable middle in `<DialogBody>` and the header and
     * footer hold their ground. Opt-in, because a short dialog that fits has
     * nothing to gain and would grow a pointless inner scroll container.
     */
    scrollBody?: boolean;
  }
>(({ className, children, hideClose, mobileDrawer, scrollBody, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed z-[130] w-full border border-zinc-200 bg-white shadow-lg",
        // A scrolling body needs the PANEL to stop scrolling: one scroll
        // container, in the middle, or the footer travels with the content.
        scrollBody ? "flex flex-col overflow-hidden" : "grid gap-4",
        mobileDrawer
          ? [
              // Phone: docked to the bottom edge, square at the bottom, capped
              // so a long form scrolls inside itself instead of running off
              // the top of the screen. `pb-[max(...)]` clears the home bar.
              "inset-x-0 bottom-0 top-auto max-h-[88svh] rounded-t-2xl rounded-b-none p-5",
              // Only the panel itself scrolls when there is no inner body to
              // do it; with `scrollBody` the middle owns the scrolling.
              scrollBody ? "" : "overflow-y-auto",
              "pb-[max(1.25rem,env(safe-area-inset-bottom))]",
              "data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom",
              "data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom",
              // sm+: back to the centred modal, undoing every drawer rule.
              "sm:inset-x-auto sm:bottom-auto sm:left-[50%] sm:top-[50%] sm:max-h-[85vh]",
              "sm:max-w-lg sm:translate-x-[-50%] sm:translate-y-[-50%] sm:rounded-xl sm:p-6",
              "sm:data-[state=open]:slide-in-from-bottom-0 sm:data-[state=closed]:slide-out-to-bottom-0",
            ]
          : [
              "left-[50%] top-[50%] max-w-lg translate-x-[-50%] translate-y-[-50%] rounded-xl p-6",
              scrollBody ? "max-h-[85vh]" : "",
            ],
        className
      )}
      {...props}
    >
      {children}
      {/*
        Top-right close.
        
        A muted circular plate rather than a bare glyph: on a drawer it sits
        over the first row of content, and an unplated X at 70% opacity is easy
        to miss and easier to mis-tap. 36px is the tap target, not the icon.
        
        Still omitted when `hideClose` — a modal whose only actions are at the
        bottom does not want a second, unlabelled way out.
      */}
      {!hideClose && (
        <DialogPrimitive.Close
          className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 transition-colors hover:bg-zinc-200 hover:text-zinc-900 cursor-pointer"
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      )}
    </DialogPrimitive.Content>
  </DialogPortal>
));
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  // `flex-none` so it holds its ground when the panel is a flex column; inert
  // in the default grid layout.
  <div className={cn("flex flex-none flex-col space-y-1.5 text-center sm:text-left", className)} {...props} />
);

/**
 * The scrolling middle of a `scrollBody` dialog.
 *
 * The negative inline margins + matching padding let a focus ring or a
 * dropdown inside the list breathe to the panel's edge instead of being
 * clipped by `overflow-y-auto` the moment it crosses the boundary.
 */
const DialogBody = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("-mx-1 min-h-0 flex-1 overflow-y-auto px-1 py-4", className)} {...props} />
);
DialogHeader.displayName = "DialogHeader";

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  // `flex-none` + a hairline: in a `scrollBody` panel this is the edge the
  // content scrolls under, and without the rule the last row looks cut off
  // rather than continuing.
  <div
    className={cn(
      "flex flex-none flex-col-reverse gap-2 border-t border-zinc-100 pt-4 sm:flex-row sm:justify-end sm:gap-0 sm:space-x-2",
      className
    )}
    {...props}
  />
);
DialogFooter.displayName = "DialogFooter";

const DialogTitle = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title ref={ref} className={cn("text-lg font-semibold text-zinc-900", className)} {...props} />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description ref={ref} className={cn("text-sm text-zinc-500", className)} {...props} />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export { Dialog, DialogPortal, DialogOverlay, DialogClose, DialogTrigger, DialogContent, DialogHeader, DialogBody, DialogFooter, DialogTitle, DialogDescription };
