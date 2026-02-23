import { describe, it, expect } from "vitest";
import { getErrorMessage } from "./errors";

describe("getErrorMessage", () => {
  it("extracts message from AppError object", () => {
    expect(getErrorMessage({ code: "NOT_FOUND", message: "Game not found" })).toBe(
      "Game not found",
    );
  });

  it("extracts message from any object with message field", () => {
    expect(getErrorMessage({ message: "Something broke" })).toBe("Something broke");
  });

  it("extracts message from Error instance", () => {
    expect(getErrorMessage(new Error("native error"))).toBe("native error");
  });

  it("returns string as-is", () => {
    expect(getErrorMessage("plain string error")).toBe("plain string error");
  });

  it("stringifies null", () => {
    expect(getErrorMessage(null)).toBe("null");
  });

  it("stringifies undefined", () => {
    expect(getErrorMessage(undefined)).toBe("undefined");
  });

  it("stringifies number", () => {
    expect(getErrorMessage(42)).toBe("42");
  });

  it("stringifies object without message", () => {
    expect(getErrorMessage({ code: "ERR" })).toBe("[object Object]");
  });
});
