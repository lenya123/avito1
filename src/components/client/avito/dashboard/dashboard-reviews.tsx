"use client";

import { useRouter } from "next/navigation";
import { useAvitoReviews } from "@/hooks/use-avito";
import { ReviewCard } from "@/components/client/avito/review-card";
export function DashboardReviews() {
  const router = useRouter();
  const { data: reviewsData, isLoading, isError } = useAvitoReviews(0, 3);

  const reviews = reviewsData?.reviews?.reviews ?? [];

  if (isError || isLoading || reviews.length === 0) return null;

  const unansweredCount = reviews.filter((r) => !r.answer).length;

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold text-white">
          Отзывы
          {unansweredCount > 0 && (
            <span className="text-xs text-accent-orange font-medium ml-2">
              {unansweredCount} без ответа
            </span>
          )}
        </h2>
        <button
          onClick={() => router.push("/avito/reviews")}
          className="text-sm text-accent-blue hover:text-accent-blue/80 transition-colors"
        >
          Все →
        </button>
      </div>
      <div className="space-y-3">
        {reviews.map((review) => (
          <div key={review.id}>
            <ReviewCard
              id={review.id}
              score={review.score}
              senderName={review.sender.name}
              text={review.text}
              created={review.created}
              itemTitle={review.item?.title}
              answer={review.answer}
              onReply={() => router.push("/avito/reviews")}
              onDeleteAnswer={() => router.push("/avito/reviews")}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
