import { describe, it, expect } from "vitest";
import {
  createParserState,
  processChunk,
  finalizeStream,
  DELIMITER,
} from "./actionParser";

describe("createParserState", () => {
  it("returns clean initial state", () => {
    const state = createParserState();
    expect(state.delimiterFound).toBe(false);
    expect(state.trailingBuffer).toBe("");
    expect(state.actionsBuffer).toBe("");
  });
});

describe("processChunk", () => {
  it("accumulates text when no delimiter present", () => {
    const state = createParserState();
    // First chunk - small enough to be entirely buffered
    const out1 = processChunk(state, "Hello");
    // "Hello" is 5 chars, DELIMITER is 15 chars, so everything stays in buffer
    expect(out1).toBe("");

    // Larger chunk that exceeds delimiter length
    const out2 = processChunk(state, " world, this is a long response from the AI.");
    // Combined is "Hello world, this is a long response from the AI." (49 chars)
    // Emit first 34 chars, buffer last 15
    expect(out2.length).toBeGreaterThan(0);
    expect(state.delimiterFound).toBe(false);
  });

  it("detects delimiter and splits text from actions", () => {
    const state = createParserState();
    // Send enough text to flush the buffer first
    processChunk(state, "Here are your RPGs sorted by most played!");
    // Now send the delimiter and action JSON
    const displayText = processChunk(
      state,
      '\n---ACTIONS---\n[{"actionId": "sort:playtime", "tier": 1}]',
    );
    // Display text from this chunk should include the text before delimiter
    // (but some may have been emitted in previous chunk via buffer flush)
    expect(state.delimiterFound).toBe(true);
    expect(state.actionsBuffer).toContain("sort:playtime");
    // No actions data in display text
    expect(displayText).not.toContain("ACTIONS");
    expect(displayText).not.toContain("sort:playtime");
  });

  it("handles delimiter split across two chunks", () => {
    const state = createParserState();
    // Send text with partial delimiter at end
    processChunk(state, "Great response here!");
    processChunk(state, "\n---ACT");
    expect(state.delimiterFound).toBe(false);

    // Complete the delimiter
    const display = processChunk(
      state,
      'IONS---\n[{"actionId": "nav:library", "tier": 1}]',
    );
    expect(state.delimiterFound).toBe(true);
    expect(state.actionsBuffer).toContain("nav:library");
    expect(display).not.toContain("ACTIONS");
  });

  it("handles delimiter split across three chunks", () => {
    const state = createParserState();
    processChunk(state, "Some text before the delimiter");
    processChunk(state, "\n---");
    expect(state.delimiterFound).toBe(false);
    processChunk(state, "ACTIONS");
    expect(state.delimiterFound).toBe(false);
    const display = processChunk(state, '---\n[{"actionId": "sort:name", "tier": 1}]');
    expect(state.delimiterFound).toBe(true);
    expect(state.actionsBuffer).toContain("sort:name");
    expect(display).not.toContain("---ACTIONS---");
  });

  it("handles delimiter at very start of response", () => {
    const state = createParserState();
    const display = processChunk(
      state,
      '\n---ACTIONS---\n[{"actionId": "nav:library", "tier": 1}]',
    );
    expect(state.delimiterFound).toBe(true);
    expect(display).toBe("");
    expect(state.actionsBuffer).toContain("nav:library");
  });

  it("handles delimiter at very end of text (no actions after)", () => {
    const state = createParserState();
    processChunk(state, "Here is some text for you!");
    const display = processChunk(state, "\n---ACTIONS---\n");
    expect(state.delimiterFound).toBe(true);
    expect(state.actionsBuffer).toBe("");
    expect(display).not.toContain("ACTIONS");
  });

  it("buffers trailing characters (holds back DELIMITER_LENGTH chars)", () => {
    const state = createParserState();
    // Send exactly DELIMITER.length chars
    const text = "A".repeat(DELIMITER.length);
    const display = processChunk(state, text);
    // Should all be buffered, nothing emitted
    expect(display).toBe("");
    expect(state.trailingBuffer).toBe(text);
  });

  it("stops accumulating display text after delimiter detected", () => {
    const state = createParserState();
    processChunk(state, "Display text here.");
    processChunk(state, '\n---ACTIONS---\n[{"actionId": "nav:library", "tier": 1}]');
    // After delimiter, more text goes to actions buffer
    const display = processChunk(state, " more actions data");
    expect(display).toBe("");
    expect(state.actionsBuffer).toContain("more actions data");
  });

  it("accumulates actions JSON after delimiter", () => {
    const state = createParserState();
    processChunk(state, "Text before delimiter.");
    processChunk(state, '\n---ACTIONS---\n[{"actionId":');
    const display = processChunk(state, ' "sort:name", "tier": 1}]');
    expect(display).toBe("");
    expect(state.actionsBuffer).toBe('[{"actionId": "sort:name", "tier": 1}]');
  });
});

describe("finalizeStream", () => {
  it("flushes trailing buffer as display text when no delimiter found", () => {
    const state = createParserState();
    processChunk(state, "Short text");
    // "Short text" is 10 chars, fits in trailing buffer
    const result = finalizeStream(state);
    expect(result.displayText).toBe("Short text");
    expect(result.actions).toEqual([]);
  });

  it("parses valid JSON action array", () => {
    const state = createParserState();
    processChunk(state, "Some text");
    processChunk(
      state,
      '\n---ACTIONS---\n[{"actionId": "sort:playtime", "tier": 1}, {"actionId": "nav:library", "tier": 1}]',
    );
    const result = finalizeStream(state);
    expect(result.actions).toHaveLength(2);
    expect(result.actions[0].actionId).toBe("sort:playtime");
    expect(result.actions[0].tier).toBe(1);
    expect(result.actions[1].actionId).toBe("nav:library");
  });

  it("returns empty actions on malformed JSON", () => {
    const state = createParserState();
    processChunk(state, "Text here");
    processChunk(state, "\n---ACTIONS---\n{invalid json!!!");
    const result = finalizeStream(state);
    expect(result.actions).toEqual([]);
    expect(result.displayText).toBe("");
  });

  it("returns empty actions when no delimiter found", () => {
    const state = createParserState();
    processChunk(state, "Just a normal text response with no actions at all.");
    const result = finalizeStream(state);
    expect(result.actions).toEqual([]);
    expect(result.displayText.length).toBeGreaterThan(0);
  });

  it('handles empty actions array "[]"', () => {
    const state = createParserState();
    processChunk(state, "Some text");
    processChunk(state, "\n---ACTIONS---\n[]");
    const result = finalizeStream(state);
    expect(result.actions).toEqual([]);
  });

  it("filters out actions missing required fields (actionId, tier)", () => {
    const state = createParserState();
    processChunk(state, "Text");
    processChunk(
      state,
      '\n---ACTIONS---\n[{"actionId": "nav:library", "tier": 1}, {"tier": 1}, {"actionId": "sort:name"}, {"foo": "bar"}]',
    );
    const result = finalizeStream(state);
    // Only the first action has both required fields
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0].actionId).toBe("nav:library");
  });

  it("trims trailing whitespace from display text", () => {
    const state = createParserState();
    // Use a string ≤ DELIMITER.length (15) so it stays entirely in the trailing buffer
    const out = processChunk(state, "Trailing ws  ");
    expect(out).toBe("");
    const result = finalizeStream(state);
    expect(result.displayText).toBe("Trailing ws");
  });

  it("preserves payload and description fields", () => {
    const state = createParserState();
    processChunk(state, "Review response");
    processChunk(
      state,
      '\n---ACTIONS---\n[{"actionId": "review:Elden Ring", "tier": 2, "description": "Save your review", "payload": {"stars": 5, "text": "Masterpiece"}}]',
    );
    const result = finalizeStream(state);
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0].description).toBe("Save your review");
    expect(result.actions[0].payload).toEqual({
      stars: 5,
      text: "Masterpiece",
    });
  });

  it("handles actions with all optional fields present", () => {
    const state = createParserState();
    processChunk(state, "Text");
    processChunk(
      state,
      '\n---ACTIONS---\n[{"actionId": "note:Hades", "tier": 2, "description": "Save note for Hades", "payload": {"text": "Try the shield build next"}}]',
    );
    const result = finalizeStream(state);
    expect(result.actions).toHaveLength(1);
    const action = result.actions[0];
    expect(action.actionId).toBe("note:Hades");
    expect(action.tier).toBe(2);
    expect(action.description).toBe("Save note for Hades");
    expect(action.payload).toEqual({ text: "Try the shield build next" });
  });

  it("handles non-array JSON gracefully", () => {
    const state = createParserState();
    processChunk(state, "Text");
    processChunk(state, '\n---ACTIONS---\n{"actionId": "nav:library", "tier": 1}');
    const result = finalizeStream(state);
    // Non-array JSON is rejected
    expect(result.actions).toEqual([]);
  });
});

describe("end-to-end scenarios", () => {
  it("full streaming scenario with actions", () => {
    const state = createParserState();
    let display = "";

    // Simulate multiple stream chunks
    display += processChunk(state, "Here are your ");
    display += processChunk(state, "RPGs sorted by ");
    display += processChunk(state, "most played!");
    display += processChunk(
      state,
      '\n---ACTIONS---\n[{"actionId": "genre-filter:1", "tier": 1}, {"actionId": "sort:playtime", "tier": 1}]',
    );

    const result = finalizeStream(state);
    const fullText = display + result.displayText;

    expect(fullText).toBe("Here are your RPGs sorted by most played!");
    expect(fullText).not.toContain("ACTIONS");
    expect(result.actions).toHaveLength(2);
    expect(result.actions[0].actionId).toBe("genre-filter:1");
    expect(result.actions[1].actionId).toBe("sort:playtime");
  });

  it("full streaming scenario without actions", () => {
    const state = createParserState();
    let display = "";

    display += processChunk(state, "Looking at your play");
    display += processChunk(state, "time this year, RPGs ");
    display += processChunk(state, "dominate with over 300 hours.");

    const result = finalizeStream(state);
    const fullText = display + result.displayText;

    expect(fullText).toBe(
      "Looking at your playtime this year, RPGs dominate with over 300 hours.",
    );
    expect(result.actions).toEqual([]);
  });

  it("review action scenario from spec", () => {
    const state = createParserState();
    let display = "";

    display += processChunk(
      state,
      "Hades really is something special — the way it weaves narrative into the roguelike loop is unlike anything else. I've put together a review based on your thoughts!",
    );
    display += processChunk(
      state,
      '\n---ACTIONS---\n[{"actionId": "review:Hades", "tier": 2, "description": "Save your review for Hades", "payload": {"stars": 5, "text": "One of the best games I\'ve ever played."}}]',
    );

    const result = finalizeStream(state);
    const fullText = display + result.displayText;

    expect(fullText).toContain("Hades really is something special");
    expect(fullText).not.toContain("ACTIONS");
    expect(fullText).not.toContain("stars");
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0].actionId).toBe("review:Hades");
    expect(result.actions[0].tier).toBe(2);
    expect(result.actions[0].payload).toEqual({
      stars: 5,
      text: "One of the best games I've ever played.",
    });
  });
});
