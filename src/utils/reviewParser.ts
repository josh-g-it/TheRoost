export interface ParsedReview {
  stars: number; // 1-5 (half-star precision)
  reviewText: string;
}

/**
 * Attempt to extract a review from an AI response.
 * Looks for star rating patterns and quoted review text.
 * Returns null if no review pattern is detected.
 */
export function parseReviewFromResponse(text: string): ParsedReview | null {
  // Match patterns like "4/5", "4.5/5", "3.0/5"
  const ratingMatch = text.match(/(\d+(?:\.\d)?)\s*\/\s*5/);
  if (!ratingMatch) return null;

  const stars = parseFloat(ratingMatch[1]);
  if (stars < 1 || stars > 5) return null;

  // Extract quoted review text (straight or curly double quotes, 10-500 chars)
  const quoteMatch =
    text.match(/"([^"]{10,500})"/) ?? text.match(/\u201C([^\u201D]{10,500})\u201D/);
  const reviewText = quoteMatch?.[1] ?? "";

  if (!reviewText) return null;

  return { stars, reviewText };
}
