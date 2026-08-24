import type { SystemCrawlClassId } from "@team-arcade/games";

interface CharacterSpriteProps {
  classId: SystemCrawlClassId;
  displayName?: string;
  current?: boolean;
  damaged?: boolean;
  downed?: boolean;
  acting?: boolean;
}

export function CharacterSprite({
  classId,
  displayName,
  current = false,
  damaged = false,
  downed = false,
  acting = false
}: CharacterSpriteProps) {
  const label = `${displayName ? `${displayName}, ` : ""}${classLabel(classId)} character sprite${downed ? ", downed" : damaged ? ", damaged" : current ? ", current turn" : ""}`;
  return (
    <g
      role="img"
      aria-label={label}
      className={`sc-pixel-sprite sc-character-sprite sprite-${classId} ${current ? "is-current" : ""} ${damaged ? "is-damaged" : ""} ${downed ? "is-downed" : ""} ${acting ? "is-acting" : ""}`}
    >
      <CharacterPixels classId={classId} />
      {current && <path className="sc-sprite-selector" d="M2 2h5V0H0v7h2zm20 0h-5V0h7v7h-2zM2 30h5v2H0v-7h2zm20 0h-5v2h7v-7h-2z" />}
      {damaged && <path className="sc-sprite-damage" d="M17 1l-4 7h4l-3 7 8-10h-5z" />}
      {downed && <path className="sc-sprite-downed" d="M3 4l3-3 6 6 6-6 3 3-6 6 6 6-3 3-6-6-6 6-3-3 6-6z" />}
    </g>
  );
}

function CharacterPixels({ classId }: { classId: SystemCrawlClassId }) {
  if (classId === "infrastructure-architect") {
    return <>
      <rect x="7" y="2" width="10" height="3" fill="#1b2234" />
      <rect x="6" y="5" width="12" height="7" fill="#f0b58b" />
      <rect x="4" y="12" width="16" height="11" fill="#23b8c7" />
      <rect x="2" y="14" width="4" height="9" fill="#23b8c7" />
      <rect x="18" y="14" width="4" height="7" fill="#23b8c7" />
      <rect x="20" y="18" width="4" height="5" fill="#d9a13a" />
      <rect x="5" y="23" width="6" height="7" fill="#6d7658" />
      <rect x="13" y="23" width="6" height="7" fill="#6d7658" />
      <rect x="4" y="29" width="8" height="3" fill="#111827" />
      <rect x="12" y="29" width="8" height="3" fill="#111827" />
    </>;
  }
  if (classId === "senior-systems-analyst") {
    return <>
      <rect x="7" y="2" width="10" height="3" fill="#5b342b" />
      <rect x="6" y="5" width="12" height="7" fill="#eeb58d" />
      <rect x="7" y="7" width="4" height="2" fill="#101827" /><rect x="13" y="7" width="4" height="2" fill="#101827" />
      <rect x="4" y="11" width="16" height="12" fill="#8e6bd8" />
      <rect x="3" y="5" width="2" height="8" fill="#25c2d1" /><rect x="19" y="5" width="2" height="6" fill="#25c2d1" />
      <rect x="10" y="11" width="2" height="9" fill="#f1b94f" /><rect x="9" y="18" width="5" height="3" fill="#e6edf4" />
      <rect x="1" y="14" width="4" height="8" fill="#8e6bd8" /><rect x="19" y="14" width="4" height="8" fill="#8e6bd8" />
      <rect x="4" y="22" width="16" height="4" fill="#c5d0da" /><rect x="6" y="26" width="5" height="6" fill="#2d4055" /><rect x="13" y="26" width="5" height="6" fill="#2d4055" />
    </>;
  }
  if (classId === "application-developer") {
    return <>
      <rect x="7" y="2" width="10" height="4" fill="#151b29" />
      <rect x="6" y="6" width="12" height="6" fill="#efb289" />
      <rect x="4" y="10" width="16" height="13" fill="#d13f91" />
      <rect x="2" y="12" width="3" height="7" fill="#20283a" /><rect x="19" y="12" width="3" height="7" fill="#20283a" />
      <rect x="6" y="17" width="12" height="7" fill="#20283a" /><rect x="8" y="18" width="8" height="4" fill="#39e7ee" />
      <rect x="7" y="24" width="4" height="7" fill="#303b52" /><rect x="13" y="24" width="4" height="7" fill="#303b52" />
      <rect x="5" y="30" width="7" height="2" fill="#0e1420" /><rect x="12" y="30" width="7" height="2" fill="#0e1420" />
    </>;
  }
  return <>
    <rect x="7" y="2" width="10" height="3" fill="#4d3024" />
    <rect x="6" y="5" width="12" height="7" fill="#dca77f" />
    <rect x="4" y="11" width="16" height="12" fill="#d68a2c" />
    <rect x="1" y="12" width="5" height="13" fill="#365775" />
    <rect x="18" y="13" width="5" height="9" fill="#d68a2c" />
    <rect x="20" y="20" width="4" height="3" fill="#bfcbd4" />
    <rect x="6" y="15" width="2" height="8" fill="#4ed5dc" /><rect x="16" y="15" width="2" height="8" fill="#e659a4" />
    <rect x="6" y="23" width="5" height="8" fill="#42556d" /><rect x="13" y="23" width="5" height="8" fill="#42556d" />
    <rect x="4" y="30" width="8" height="2" fill="#151d2a" /><rect x="12" y="30" width="8" height="2" fill="#151d2a" />
  </>;
}

function classLabel(classId: SystemCrawlClassId): string {
  return classId.split("-").map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`).join(" ");
}
