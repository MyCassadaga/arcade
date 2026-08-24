import { describe, expect, it } from "vitest";
import { ISO_CARD_SPACING, clampZoom, projectLogicalPosition } from "./projection";

describe("System Crawl isometric projection", () => {
  it("keeps stable screen positions derived from orthogonal logical coordinates", () => {
    expect(projectLogicalPosition({ cardIndex: 0, x: 0, y: 0 })).toEqual({ x: 224, y: 104 });
    expect(projectLogicalPosition({ cardIndex: 0, x: 3, y: 2 })).toEqual({ x: 252, y: 174 });
    const first = projectLogicalPosition({ cardIndex: 0, x: 3, y: 2 });
    const second = projectLogicalPosition({ cardIndex: 1, x: 3, y: 2 });
    expect(second.x - first.x).toBe(ISO_CARD_SPACING);
    expect(second.y).toBe(first.y);
  });
  it("constrains zoom to usable bounds", () => { expect(clampZoom(0)).toBe(.62); expect(clampZoom(3)).toBe(2.2); });
});
