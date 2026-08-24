import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CharacterSprite } from "./CharacterSprite";
import { EnemySprite } from "./EnemySprite";

describe("original System Crawl sprites", () => {
  it("labels all four character silhouettes distinctly", () => {
    render(<svg>{(["infrastructure-architect", "senior-systems-analyst", "application-developer", "it-generalist"] as const).map((classId) => <CharacterSprite key={classId} classId={classId} />)}</svg>);
    expect(screen.getAllByRole("img", { name: /character sprite/i })).toHaveLength(4);
  });
  it("renders every implemented enemy treatment", () => {
    const enemies = ["budget-reduction", "scope-creep", "system-requirement", "meeting", "bug", "legacy-system"] as const;
    render(<svg>{enemies.map((definitionId) => <EnemySprite key={definitionId} definitionId={definitionId} displayName={definitionId} />)}</svg>);
    for (const enemy of enemies) expect(screen.getByRole("img", { name: new RegExp(`${enemy} enemy sprite`) })).toBeInTheDocument();
  });
});
