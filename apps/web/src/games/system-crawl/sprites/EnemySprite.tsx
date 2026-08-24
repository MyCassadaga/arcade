import type { SystemCrawlEnemyId } from "@team-arcade/games";

interface EnemySpriteProps {
  definitionId: SystemCrawlEnemyId;
  displayName: string;
  damaged?: boolean;
  acting?: boolean;
}

export function EnemySprite({ definitionId, displayName, damaged = false, acting = false }: EnemySpriteProps) {
  return (
    <g
      role="img"
      aria-label={`${displayName} enemy sprite${damaged ? ", damaged" : ""}`}
      className={`sc-pixel-sprite sc-enemy-sprite enemy-${definitionId} ${damaged ? "is-damaged" : ""} ${acting ? "is-acting" : ""}`}
    >
      <EnemyPixels definitionId={definitionId} />
    </g>
  );
}

function EnemyPixels({ definitionId }: { definitionId: SystemCrawlEnemyId }) {
  if (definitionId === "budget-reduction") return <>
    <rect x="3" y="5" width="26" height="20" fill="#5e1d4d" /><rect x="6" y="8" width="5" height="10" fill="#e74b98" /><rect x="13" y="11" width="5" height="7" fill="#e74b98" /><rect x="20" y="14" width="5" height="4" fill="#e74b98" />
    <path d="M5 20h16v-4l8 7-8 7v-4H5z" fill="#ffcf4d" /><rect x="8" y="25" width="5" height="5" fill="#2c1128" /><rect x="20" y="25" width="5" height="5" fill="#2c1128" />
  </>;
  if (definitionId === "scope-creep") return <>
    <rect x="4" y="7" width="17" height="17" rx="2" fill="#d83c95" /><rect x="12" y="3" width="16" height="17" rx="2" fill="#f06bac" /><rect x="8" y="11" width="16" height="17" rx="2" fill="#9d2e78" />
    <rect x="11" y="15" width="3" height="3" fill="#fff2b2" /><rect x="18" y="15" width="3" height="3" fill="#fff2b2" /><path d="M12 23h9" stroke="#35122b" strokeWidth="2" />
  </>;
  if (definitionId === "system-requirement") return <>
    <path d="M7 2h14l6 6v22H7z" fill="#e9edf4" stroke="#56687c" strokeWidth="2" /><path d="M21 2v7h6" fill="#a9bdd0" />
    <rect x="10" y="12" width="14" height="3" fill="#da3d8c" /><rect x="10" y="18" width="11" height="2" fill="#65778a" /><rect x="10" y="23" width="13" height="2" fill="#65778a" /><circle cx="5" cy="16" r="3" fill="#40e5ef" /><path d="M2 16h-2" stroke="#40e5ef" strokeWidth="2" />
  </>;
  if (definitionId === "meeting") return <>
    <rect x="4" y="6" width="24" height="23" rx="2" fill="#e7eef6" stroke="#b33078" strokeWidth="2" /><rect x="4" y="6" width="24" height="7" fill="#b33078" /><rect x="9" y="2" width="3" height="8" fill="#5c6d7e" /><rect x="20" y="2" width="3" height="8" fill="#5c6d7e" />
    <rect x="9" y="17" width="5" height="5" fill="#ffbd3e" /><rect x="18" y="17" width="5" height="5" fill="#ff4f91" /><path d="M10 26h12" stroke="#4c5c6b" strokeWidth="2" />
  </>;
  if (definitionId === "bug") return <>
    <rect x="9" y="8" width="14" height="17" rx="5" fill="#e5418d" /><rect x="12" y="4" width="8" height="7" fill="#ff76b3" /><rect x="13" y="7" width="2" height="2" fill="#111a2b" /><rect x="18" y="7" width="2" height="2" fill="#111a2b" />
    <path d="M9 12L3 8m6 10l-7 1m8 4l-6 5m19-16l6-4m-6 10l7 1m-8 4l6 5" stroke="#ea65aa" strokeWidth="3" />
  </>;
  return <>
    <rect x="2" y="6" width="28" height="22" rx="2" fill="#c8b891" stroke="#665c45" strokeWidth="2" /><rect x="6" y="10" width="15" height="10" fill="#283b35" /><rect x="8" y="12" width="11" height="2" fill="#68d793" /><rect x="8" y="16" width="7" height="2" fill="#68d793" />
    <circle cx="25" cy="11" r="2" fill="#f14577" /><circle cx="25" cy="17" r="2" fill="#ffc24c" /><rect x="7" y="24" width="18" height="3" fill="#756b52" /><path d="M4 28v4M10 28l-2 4m16-4l2 4m2-4v4" stroke="#ba9e68" strokeWidth="2" />
  </>;
}
