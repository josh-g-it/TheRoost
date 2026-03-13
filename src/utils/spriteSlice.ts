import type { Expression } from "../types/assistant";
import { EXPRESSION_GRID } from "../types/assistant";

export const GRID_COLS = 4;
export const GRID_ROWS = 2;
export const EXPECTED_CELLS = GRID_COLS * GRID_ROWS;

/** Get the grid index (0-7) for an expression name */
export function getExpressionIndex(expression: Expression): number {
  const idx = EXPRESSION_GRID.indexOf(expression);
  return idx >= 0 ? idx : 0;
}

/** CSS background-position for a given expression index at a given cell size */
export function getSpritePosition(
  expressionIndex: number,
  cellSize: number = 512,
): { x: number; y: number } {
  const col = expressionIndex % GRID_COLS;
  const row = Math.floor(expressionIndex / GRID_COLS);
  return { x: -(col * cellSize), y: -(row * cellSize) };
}
