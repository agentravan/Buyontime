"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Star } from "lucide-react";
import { toast } from "sonner";
import { submitReviewAction } from "@/actions/account";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function ReviewForm({ productId, existing }: { productId: string; existing: { rating: number; title: string; body: string } | null }) {
  const router = useRouter();
  const [rating, setRating] = useState(existing?.rating ?? 0);
  const [title, setTitle] = useState(existing?.title ?? "");
  const [body, setBody] = useState(existing?.body ?? "");
  const [pending, start] = useTransition();
  return (
    <Card className="p-4 sm:p-5">
      <h3 className="font-bold">{existing ? "Update your review" : "Rate this product"}</h3>
      <div className="mt-3 flex gap-1" role="radiogroup" aria-label="Rating">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n} star${n > 1 ? "s" : ""}`} onClick={() => setRating(n)}>
            <Star className={cn("size-7", n <= rating ? "fill-amber-400 text-amber-400" : "text-slate-300")} />
          </button>
        ))}
      </div>
      <form
        className="mt-3 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const res = await submitReviewAction({ productId, rating, title, body });
            if (!res.ok) toast.error(res.error);
            else { toast.success("Thanks for your review!"); router.refresh(); }
          });
        }}
      >
        <Input placeholder="Title (optional)" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} />
        <Textarea placeholder="What did you like or dislike?" value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} />
        <Button type="submit" loading={pending} disabled={rating === 0} className="w-full">Submit review</Button>
      </form>
    </Card>
  );
}
