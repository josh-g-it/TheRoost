import { describe, it, expect } from "vitest";
import { parseReviewFromResponse } from "./reviewParser";

describe("parseReviewFromResponse", () => {
  it("extracts stars and text from standard pattern", () => {
    const result = parseReviewFromResponse(
      "I'd give it a 4.5/5. Here's your review: \"A masterful blend of exploration and combat that keeps you engaged for hundreds of hours.\"",
    );
    expect(result).toEqual({
      stars: 4.5,
      reviewText:
        "A masterful blend of exploration and combat that keeps you engaged for hundreds of hours.",
    });
  });

  it("returns null when no rating pattern found", () => {
    const result = parseReviewFromResponse("This game is great, I really enjoyed it!");
    expect(result).toBeNull();
  });

  it("returns null when rating is out of range (0/5)", () => {
    const result = parseReviewFromResponse('0/5 "Terrible game"');
    expect(result).toBeNull();
  });

  it("returns null when rating is out of range (6/5)", () => {
    const result = parseReviewFromResponse('6/5 "Amazing game"');
    expect(result).toBeNull();
  });

  it("returns null when no quoted review text found", () => {
    const result = parseReviewFromResponse("I'd rate it 4/5 overall.");
    expect(result).toBeNull();
  });

  it("returns null when quoted text is too short", () => {
    const result = parseReviewFromResponse('4/5 "Short"');
    expect(result).toBeNull();
  });

  it("handles integer rating", () => {
    const result = parseReviewFromResponse(
      '3/5 "A decent game with some interesting mechanics but falls short of greatness."',
    );
    expect(result).toEqual({
      stars: 3,
      reviewText:
        "A decent game with some interesting mechanics but falls short of greatness.",
    });
  });

  it("handles rating with spaces around slash", () => {
    const result = parseReviewFromResponse(
      '4 / 5 "Excellent gameplay with a compelling story that draws you in."',
    );
    expect(result).toEqual({
      stars: 4,
      reviewText: "Excellent gameplay with a compelling story that draws you in.",
    });
  });

  it("handles curly/smart double quotes", () => {
    const result = parseReviewFromResponse(
      "4/5 \u201CA beautifully crafted world with memorable characters.\u201D",
    );
    expect(result).toEqual({
      stars: 4,
      reviewText: "A beautifully crafted world with memorable characters.",
    });
  });

  it("extracts first rating when multiple present", () => {
    const result = parseReviewFromResponse(
      'I\'d give the gameplay 3/5 but the story 5/5. Overall 4/5. "Great story-driven experience with solid combat."',
    );
    expect(result).not.toBeNull();
    expect(result!.stars).toBe(3);
  });
});
