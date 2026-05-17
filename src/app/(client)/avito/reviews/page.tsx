"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { cn } from "@/utils/cn";
import { BackButton, Spinner } from "@/components/ui";
import { useAvitoReviews, useReplyToReview, useDeleteReviewAnswer } from "@/hooks/use-avito";
import { ReviewCard } from "@/components/client/avito/review-card";

const LIMIT = 20;

export default function AvitoReviewsPage() {
  const [offset, setOffset] = useState(0);
  const { data, isLoading } = useAvitoReviews(offset, LIMIT);
  const replyMutation = useReplyToReview();
  const deleteMutation = useDeleteReviewAnswer();

  const reviews = data?.reviews?.reviews ?? [];
  const total = data?.reviews?.total ?? 0;
  const rating = data?.rating;
  const totalPages = Math.max(1, Math.ceil(total / LIMIT));
  const currentPage = Math.floor(offset / LIMIT) + 1;

  const handleReply = (reviewId: number, text: string) => {
    replyMutation.mutate({ reviewId, text });
  };

  const handleDeleteAnswer = (answerId: number) => {
    deleteMutation.mutate(answerId);
  };

  return (
    <main className="max-w-4xl mx-auto px-4 py-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-3 mb-6"
      >
        <BackButton href="/avito" />
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-white">Отзывы</h1>
          {rating && (
            <span
              className={cn(
                "px-2.5 py-1 rounded-xl text-xs font-semibold",
                "bg-accent-orange/20 text-accent-orange border border-accent-orange/20"
              )}
            >
              {rating.score} ★ ({rating.total_reviews})
            </span>
          )}
        </div>
      </motion.div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <Spinner size="lg" />
        </div>
      ) : reviews.length > 0 ? (
        <>
          <div className="space-y-4">
            {reviews.map((review, index) => (
              <motion.div
                key={review.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + index * 0.03 }}
              >
                <ReviewCard
                  id={review.id}
                  score={review.score}
                  senderName={review.sender.name}
                  text={review.text}
                  created={review.created}
                  itemTitle={review.item?.title}
                  answer={review.answer}
                  onReply={handleReply}
                  onDeleteAnswer={handleDeleteAnswer}
                  isReplying={replyMutation.isPending}
                />
              </motion.div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-6">
              <button
                onClick={() => setOffset((o) => Math.max(0, o - LIMIT))}
                disabled={offset <= 0}
                className={cn(
                  "px-3 py-2 rounded-xl text-sm font-medium",
                  "bg-white/[0.06] border border-glass-minimal text-white/60",
                  "hover:bg-white/[0.10] hover:text-white/80 transition-colors",
                  "disabled:opacity-30 disabled:cursor-not-allowed"
                )}
              >
                ← Ранее
              </button>
              <span className="text-sm text-white/40 px-2">
                {currentPage} / {totalPages}
              </span>
              <button
                onClick={() => setOffset((o) => o + LIMIT)}
                disabled={offset + LIMIT >= total}
                className={cn(
                  "px-3 py-2 rounded-xl text-sm font-medium",
                  "bg-white/[0.06] border border-glass-minimal text-white/60",
                  "hover:bg-white/[0.10] hover:text-white/80 transition-colors",
                  "disabled:opacity-30 disabled:cursor-not-allowed"
                )}
              >
                Далее →
              </button>
            </div>
          )}
        </>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn(
            "rounded-2xl p-12 text-center",
            "bg-white/[0.06] backdrop-blur-xl",
            "border border-glass-minimal"
          )}
        >
          <div className="text-4xl mb-3">💬</div>
          <p className="text-white/40 text-sm">Отзывов пока нет</p>
        </motion.div>
      )}
    </main>
  );
}
