export function DoorSprite({ open }: { open: boolean }) {
  return <g aria-hidden="true" className={`sc-door-sprite ${open ? "is-open" : "is-locked"}`}>
    <path d="M-19 4v-20h38V4" fill="none" stroke="currentColor" strokeWidth="5" />
    {!open && <><path d="M-13-11h26V7h-26z" fill="#301b43" stroke="currentColor" strokeWidth="2" /><path d="M-6-2h12" stroke="#ffc64a" strokeWidth="3" /><rect x="-3" y="-7" width="6" height="8" fill="#ffc64a" /></>}
  </g>;
}

export function CacheSprite() {
  return <g aria-hidden="true" className="sc-cache-sprite">
    <path d="M0-15l16 8v14L0 15l-16-8V-7z" fill="#332713" stroke="#ffc94f" strokeWidth="2" />
    <circle cx="0" cy="0" r="5" fill="#ffc94f" /><path d="M0-11v6M0 5v6M-11 0h6M5 0h6" stroke="#ffe9a5" strokeWidth="2" />
  </g>;
}

export function HazardSprite() {
  return <g aria-hidden="true" className="sc-hazard-sprite">
    <path d="M0-15L17 11h-34z" fill="#301025" stroke="#ff5b8f" strokeWidth="2" />
    <path d="M0-9v11M0 7v2" stroke="#ffd0e5" strokeWidth="3" />
  </g>;
}

export function UplinkSprite({ entrance = false }: { entrance?: boolean }) {
  return <g aria-hidden="true" className="sc-uplink-sprite">
    <circle cx="0" cy="0" r="15" fill="none" stroke="currentColor" strokeWidth="3" strokeDasharray="4 3" />
    <path d={entrance ? "M9-8L-7 0 9 8" : "M-9-8L7 0-9 8"} fill="none" stroke="currentColor" strokeWidth="4" />
  </g>;
}

export function PropSprite({ kind }: { kind: string }) {
  const normalized = kind.toLowerCase();
  if (normalized.includes("rack") || normalized.includes("mainframe") || normalized.includes("cooling")) {
    return <g aria-hidden="true" className="sc-prop-sprite sc-rack-sprite">
      <path d="M-16 8v-28h27l7 6v28H-9z" fill="#152a3b" stroke="#49d9ef" strokeWidth="2" />
      <path d="M-11-14H10M-11-6H10M-11 2H10" stroke="#678398" strokeWidth="2" />
      <circle cx="13" cy="-13" r="2" fill="#55efa7" /><circle cx="13" cy="-5" r="2" fill="#ffbf43" /><circle cx="13" cy="3" r="2" fill="#ed4e98" />
    </g>;
  }
  if (normalized.includes("switch") || normalized.includes("display")) {
    return <g aria-hidden="true" className="sc-prop-sprite sc-switch-sprite">
      <path d="M-20-6L9-16 20-7-8 5z" fill="#153b4a" stroke="#43e6ee" strokeWidth="2" /><path d="M-8 5l28-12v8L-8 14z" fill="#0b2432" />
      {[-12, -6, 0, 6].map((x) => <circle key={x} cx={x} cy="-4" r="1.5" fill="#63f4b2" />)}
    </g>;
  }
  return <g aria-hidden="true" className="sc-prop-sprite sc-desk-sprite">
    <path d="M-19-4L6-14 20-7-5 4z" fill="#284358" stroke="#4ecfe3" strokeWidth="2" /><path d="M-5 4l25-11v8L-5 12z" fill="#142c3e" />
    <rect x="-5" y="-19" width="14" height="10" fill="#10202f" stroke="#6ee8f0" strokeWidth="1.5" /><path d="M-2-15h8" stroke="#58d5ee" />
  </g>;
}
