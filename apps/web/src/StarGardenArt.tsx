import type { StarGardenActionId, StarKind } from "@team-arcade/shared";

/** Original vector art. Geometry and persistent cores identify kinds without color. */
export function CelestialPiece({ kind }: { kind: StarKind | null }) {
  return <svg viewBox="0 0 80 80" aria-hidden="true" className="sg-piece-art">
    {kind === null ? <><circle className="sg-orbit-line" cx="40" cy="40" r="25" strokeDasharray="3 5" /><text className="sg-unknown-mark" x="40" y="48" textAnchor="middle">?</text></> : <>
      {kind === 0 && <><g className="sg-rays">{Array.from({ length: 12 }, (_, i) => <path key={i} transform={`rotate(${i * 30} 40 40)`} d="M40 3L43 17H37Z" />)}</g><circle className="sg-body" cx="40" cy="40" r="22" /><circle className="sg-etch" cx="40" cy="40" r="17" /><circle className="sg-core" cx="40" cy="40" r="9" /><path className="sg-glint" d="M27 30Q30 24 36 24" /></>}
      {kind === 1 && <><ellipse className="sg-orbit-line" cx="40" cy="40" rx="35" ry="16" transform="rotate(-32 40 40)" /><path className="sg-body" d="M40 6L62 40L40 74L18 40Z" /><path className="sg-facet" d="M40 6L40 40L18 40ZM40 40L62 40L40 74Z" /><path className="sg-core" d="M40 29L49 40L40 51L31 40Z" /><circle className="sg-satellite" cx="10" cy="52" r="3" /></>}
      {kind === 2 && <><path className="sg-body" d="M40 3L50 25L72 23L58 43L68 66L44 60L25 76L22 52L3 39L27 31Z" /><path className="sg-facet" d="M40 3L40 42L72 23L58 43L40 42L68 66L44 60L40 42L25 76L22 52L40 42L3 39L27 31Z" /><path className="sg-core" d="M40 28L52 49H28Z" /><path className="sg-glint" d="M36 18L30 32L18 37" /></>}
      {kind === 3 && <><circle className="sg-orbit-line" cx="40" cy="40" r="33" strokeDasharray="2 6" /><path className="sg-body" d="M53 10C27 9 14 24 16 44C18 65 43 76 62 59C36 65 26 29 53 10Z" /><path className="sg-etch" d="M35 20C17 37 25 63 48 65" /><path className="sg-core" d="M31 30C20 31 20 48 32 49C25 45 25 36 31 30Z" /><path className="sg-satellite" d="M59 19L62 28L71 31L62 34L59 43L56 34L47 31L56 28Z" /><circle className="sg-satellite" cx="65" cy="51" r="2" /></>}
    </>}
  </svg>;
}

const ACTION_PATHS: Record<StarGardenActionId, string> = {
  exchange: "M10 19H49L42 12M49 19L42 26M54 45H15L22 38M15 45L22 52",
  spin: "M16 23A21 21 0 0 1 50 17L51 7M50 17H40M48 41A21 21 0 0 1 14 47L13 57M14 47H24M26 26H38V38H26Z",
  blink: "M16 12L19 20L27 23L19 26L16 34L13 26L5 23L13 20ZM48 30L51 38L59 41L51 44L48 52L45 44L37 41L45 38ZM28 16H49M44 11L49 16L44 21M36 48H15M20 43L15 48L20 53",
  collapse: "M32 6V23M25 16L32 23L39 16M18 33L24 39L18 45M46 33L40 39L46 45M22 55H42M27 51H37",
  scramble: "M10 13H20L44 51H54M10 51H20L44 13H54M10 32H54M47 7L54 13L47 19M47 26L54 32L47 38M47 45L54 51L47 57",
  mutation: "M22 10A12 12 0 1 0 22 34M26 32H39M34 27L39 32L34 37M48 31L61 44L48 57L35 44ZM36 7V17M31 12H41",
  drift: "M7 22H50L43 15M50 22L43 29M50 22Q62 22 58 41Q55 49 42 46M46 40L42 46L49 51M10 33H19V42H10ZM25 33H34V42H25Z",
  mirror: "M32 6V58M23 14L8 32L23 50ZM41 14L56 32L41 50ZM27 11H37M27 53H37",
  crosswind: "M7 19H56M49 12L56 19L49 26M57 45H8M15 38L8 45L15 52M15 30H26M38 34H49",
  echo: "M16 14L29 32L16 50L3 32ZM48 14L61 32L48 50L35 32ZM28 10Q39 5 49 13M43 7L49 13L41 15M13 32H19M16 29V35"
};
export function ActionArt({ action }: { action: StarGardenActionId }) {
  return <svg className={`sg-action-art sg-action-${action}`} viewBox="0 0 64 64" aria-hidden="true"><circle className="sg-action-orbit" cx="32" cy="32" r="30" /><path d={ACTION_PATHS[action]} /></svg>;
}
