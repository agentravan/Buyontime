"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as AlertPrimitive from "@radix-ui/react-alert-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogContent({
  className, children, title, description, side,
}: { className?: string; children: React.ReactNode; title: string; description?: string; side?: "left" | "right" | "bottom" }) {
  const position = side === "left"
    ? "inset-y-0 left-0 h-full w-[88%] max-w-sm rounded-r-2xl data-[state=open]:animate-in"
    : side === "right"
      ? "inset-y-0 right-0 h-full w-[88%] max-w-md rounded-l-2xl"
      : side === "bottom"
        ? "inset-x-0 bottom-0 max-h-[88vh] rounded-t-2xl"
        : "left-1/2 top-1/2 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-2xl max-h-[90vh]";
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-[2px]" />
      <DialogPrimitive.Content className={cn("fixed z-50 flex flex-col overflow-hidden bg-white shadow-lift focus:outline-none", position, className)}>
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div>
            <DialogPrimitive.Title className="text-base font-bold">{title}</DialogPrimitive.Title>
            {description ? (
              <DialogPrimitive.Description className="mt-0.5 text-sm text-muted">{description}</DialogPrimitive.Description>
            ) : (
              <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
            )}
          </div>
          <DialogPrimitive.Close className="rounded-lg p-1 text-muted hover:bg-slate-100" aria-label="Close">
            <X className="size-5" />
          </DialogPrimitive.Close>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

/** Confirmation dialog for destructive / important actions. */
export function ConfirmDialog({
  trigger, title, description, confirmLabel = "Confirm", destructive, onConfirm, children,
}: {
  trigger: React.ReactNode;
  title: string;
  description?: string;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm: () => Promise<unknown> | unknown;
  children?: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  return (
    <AlertPrimitive.Root open={open} onOpenChange={setOpen}>
      <AlertPrimitive.Trigger asChild>{trigger}</AlertPrimitive.Trigger>
      <AlertPrimitive.Portal>
        <AlertPrimitive.Overlay className="fixed inset-0 z-50 bg-slate-950/40" />
        <AlertPrimitive.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-5 shadow-lift">
          <AlertPrimitive.Title className="text-base font-bold">{title}</AlertPrimitive.Title>
          {description && <AlertPrimitive.Description className="mt-1.5 text-sm text-muted">{description}</AlertPrimitive.Description>}
          {!description && <AlertPrimitive.Description className="sr-only">{title}</AlertPrimitive.Description>}
          {children && <div className="mt-4">{children}</div>}
          <div className="mt-5 flex justify-end gap-2">
            <AlertPrimitive.Cancel asChild><Button variant="outline" disabled={busy}>Cancel</Button></AlertPrimitive.Cancel>
            <Button
              variant={destructive ? "destructive" : "default"}
              loading={busy}
              onClick={async () => {
                setBusy(true);
                try { await onConfirm(); setOpen(false); } finally { setBusy(false); }
              }}
            >
              {confirmLabel}
            </Button>
          </div>
        </AlertPrimitive.Content>
      </AlertPrimitive.Portal>
    </AlertPrimitive.Root>
  );
}
