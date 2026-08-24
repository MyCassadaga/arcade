import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type WheelEvent } from "react";
import {
  getViewerCanonicalMovePath,
  positionKey,
  type Position,
  type PublicMapCard,
  type SystemCrawlEvent,
  type SystemCrawlTarget,
  type SystemCrawlViewerState
} from "@team-arcade/games";
import {
  ISO_BOARD_HEIGHT,
  ISO_BOARD_WIDTH,
  ISO_CARD_ORIGIN_X,
  ISO_CARD_ORIGIN_Y,
  ISO_CARD_SPACING,
  ISO_TILE_HEIGHT,
  ISO_TILE_WIDTH,
  cardDiamondPoints,
  clampZoom,
  projectLogicalPosition,
  tileDiamondPoints
} from "./projection";
import { CharacterSprite } from "./sprites/CharacterSprite";
import { EnemySprite } from "./sprites/EnemySprite";
import { CacheSprite, DoorSprite, PropSprite, UplinkSprite } from "./sprites/BoardSprites";

export type BoardInteraction =
  | { kind: "movement" }
  | { kind: "ability"; label: string; targets: SystemCrawlTarget[] }
  | { kind: "item"; label: string; targets: SystemCrawlTarget[] }
  | { kind: "restart"; label: string; targets: SystemCrawlTarget[] };

interface SystemCrawlBoardProps {
  view: SystemCrawlViewerState;
  activeCharacterId: string | null;
  movementPositions: Position[];
  canMove: boolean;
  interaction: BoardInteraction;
  freshEvents: SystemCrawlEvent[];
  reducedMotion: boolean;
  onMove: (position: Position) => void;
  onTarget: (target: SystemCrawlTarget) => void;
}

interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

const VIEWBOX_WIDTH = 1_120;
const VIEWBOX_HEIGHT = ISO_BOARD_HEIGHT;

export function SystemCrawlBoard({
  view,
  activeCharacterId,
  movementPositions,
  canMove,
  interaction,
  freshEvents,
  reducedMotion,
  onMove,
  onTarget
}: SystemCrawlBoardProps) {
  const [viewport, setViewport] = useState<Viewport>(initialViewport);
  const [previewDestination, setPreviewDestination] = useState<Position | null>(null);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const gestureRef = useRef<{ x: number; y: number; distance: number } | null>(null);
  const activeCharacter = activeCharacterId ? view.characters[activeCharacterId] : undefined;
  const movementKeys = useMemo(() => new Set(movementPositions.map(positionKey)), [movementPositions]);
  const targetsByPosition = useMemo(() => targetsAtPositions(view, interaction), [interaction, view]);
  const revealIndexes = new Set(freshEvents.filter((event) => event.type === "map_card_revealed" && typeof event.data.cardIndex === "number").map((event) => event.data.cardIndex as number));
  const movingCharacterIds = new Set(freshEvents.flatMap((event) => event.type === "character_moved" && typeof event.data.characterId === "string" ? [event.data.characterId] : []));
  const movingEnemyIds = new Set(freshEvents.flatMap((event) => event.type === "enemy_moved" && typeof event.data.enemyId === "string" ? [event.data.enemyId] : []));
  const actingEnemyIds = new Set(freshEvents.flatMap((event) => event.type === "enemy_attacked" && typeof event.data.enemyId === "string" ? [event.data.enemyId] : []));
  const damagedIds = new Set(freshEvents.filter((event) => event.type === "damage_dealt").flatMap((event) => [event.data.characterId, event.data.enemyId].filter((value): value is string => typeof value === "string")));
  const previewPath = useMemo(() => activeCharacterId && previewDestination
    ? getViewerCanonicalMovePath(view, activeCharacterId, previewDestination) ?? []
    : [], [activeCharacterId, previewDestination, view]);

  useEffect(() => {
    if (!activeCharacter) return;
    const point = projectLogicalPosition(activeCharacter.position);
    setViewport((current) => ensurePointVisible(current, point));
  }, [activeCharacter?.id]);

  useEffect(() => {
    const newestReveal = [...revealIndexes].at(-1);
    if (newestReveal === undefined) return;
    const point = projectLogicalPosition({ cardIndex: newestReveal, x: 4, y: 3 });
    setViewport((current) => ensurePointVisible(current, point));
  }, [freshEvents]);

  const zoomBy = (amount: number) => setViewport((current) => ({ ...current, zoom: clampZoom(current.zoom + amount) }));
  const resetView = () => setViewport(initialViewport());
  const focusCurrent = () => {
    if (!activeCharacter) return;
    const point = projectLogicalPosition(activeCharacter.position);
    setViewport((current) => ({ ...current, x: VIEWBOX_WIDTH / 2 - point.x * current.zoom, y: VIEWBOX_HEIGHT / 2 - point.y * current.zoom }));
  };

  const onPointerDown = (event: PointerEvent<SVGSVGElement>) => {
    if ((event.target as Element).closest('[data-board-action="true"]')) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    gestureRef.current = gestureSnapshot(pointersRef.current);
  };
  const onPointerMove = (event: PointerEvent<SVGSVGElement>) => {
    const previous = pointersRef.current.get(event.pointerId);
    if (!previous) return;
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const nextGesture = gestureSnapshot(pointersRef.current);
    const priorGesture = gestureRef.current;
    const scale = VIEWBOX_WIDTH / Math.max(1, event.currentTarget.getBoundingClientRect().width);
    if (nextGesture && priorGesture) {
      setViewport((current) => ({
        x: current.x + (nextGesture.x - priorGesture.x) * scale,
        y: current.y + (nextGesture.y - priorGesture.y) * scale,
        zoom: priorGesture.distance > 0 && nextGesture.distance > 0
          ? clampZoom(current.zoom * nextGesture.distance / priorGesture.distance)
          : current.zoom
      }));
    } else {
      setViewport((current) => ({ ...current, x: current.x + (event.clientX - previous.x) * scale, y: current.y + (event.clientY - previous.y) * scale }));
    }
    gestureRef.current = nextGesture;
  };
  const onPointerUp = (event: PointerEvent<SVGSVGElement>) => {
    pointersRef.current.delete(event.pointerId);
    gestureRef.current = gestureSnapshot(pointersRef.current);
  };
  const onWheel = (event: WheelEvent<SVGSVGElement>) => {
    event.preventDefault();
    zoomBy(event.deltaY > 0 ? -0.1 : 0.1);
  };

  return (
    <section className="sc-board-console" aria-labelledby="sc-board-title">
      <header className="sc-board-toolbar">
        <div><span>TACTICAL NETWORK</span><h3 id="sc-board-title">System topology</h3></div>
        <div className="sc-viewport-controls" aria-label="Board view controls">
          <button type="button" onClick={() => zoomBy(-0.15)} aria-label="Zoom board out">−</button>
          <output aria-label="Board zoom">{Math.round(viewport.zoom * 100)}%</output>
          <button type="button" onClick={() => zoomBy(0.15)} aria-label="Zoom board in">+</button>
          <button type="button" onClick={focusCurrent} disabled={!activeCharacter}>Focus current</button>
          <button type="button" onClick={resetView}>Reset view</button>
        </div>
      </header>
      <div className="sc-board-viewport">
        <svg
          className="sc-iso-board"
          viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
          role="group"
          aria-label="Isometric System Crawl tactical board. Drag to pan and use the board controls to zoom."
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onWheel={onWheel}
        >
          <defs>
            <pattern id="sc-circuit-grid" width="36" height="36" patternUnits="userSpaceOnUse"><path d="M0 18h12l6-6h18M18 12v-12" fill="none" stroke="#16445e" strokeWidth="1" /><circle cx="18" cy="12" r="2" fill="#2d91ad" /></pattern>
            <filter id="sc-glow"><feGaussianBlur stdDeviation="3" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
          </defs>
          <rect width={ISO_BOARD_WIDTH} height={ISO_BOARD_HEIGHT} fill="url(#sc-circuit-grid)" />
          <g transform={`translate(${viewport.x} ${viewport.y}) scale(${viewport.zoom})`} className={reducedMotion ? "reduced-motion" : ""}>
            {view.maps.map((map) => map.revealed && map.terrain
              ? <IsometricCard
                  key={map.cardIndex}
                  map={map}
                  view={view}
                  frontier={map.cardIndex === view.revealedCardCount - 1}
                  revealing={revealIndexes.has(map.cardIndex)}
                  movementKeys={movementKeys}
                  targetsByPosition={targetsByPosition}
                  canMove={canMove}
                  interaction={interaction}
                  previewPath={previewPath}
                  movingCharacterIds={movingCharacterIds}
                  movingEnemyIds={movingEnemyIds}
                  actingEnemyIds={actingEnemyIds}
                  damagedIds={damagedIds}
                  onPreview={setPreviewDestination}
                  onMove={onMove}
                  onTarget={onTarget}
                />
              : <UnknownCard key={map.cardIndex} cardIndex={map.cardIndex} />)}
            <EventEffects events={freshEvents} view={view} />
          </g>
        </svg>
      </div>
      <footer className="sc-board-legend" aria-label="Board legend">
        <span><i className="movement" />Move destination</span><span><i className="target" />Selected action target</span><span><i className="uplink" />Network uplink</span><span><i className="hostile" />Hostile process</span>
      </footer>
    </section>
  );
}

interface CardProps {
  map: PublicMapCard;
  view: SystemCrawlViewerState;
  frontier: boolean;
  revealing: boolean;
  movementKeys: Set<string>;
  targetsByPosition: Map<string, SystemCrawlTarget[]>;
  canMove: boolean;
  interaction: BoardInteraction;
  previewPath: Position[];
  movingCharacterIds: Set<string>;
  movingEnemyIds: Set<string>;
  actingEnemyIds: Set<string>;
  damagedIds: Set<string>;
  onPreview: (position: Position | null) => void;
  onMove: (position: Position) => void;
  onTarget: (target: SystemCrawlTarget) => void;
}

function IsometricCard(props: CardProps) {
  const { map, frontier, revealing, previewPath } = props;
  const positions = tilePositions(map).sort((left, right) => left.x + left.y - right.x - right.y || left.x - right.x);
  const titleX = projectLogicalPosition({ cardIndex: map.cardIndex, x: 0, y: 0 }).x - 196;
  const pathPoints = previewPath.map((position) => {
    const point = projectLogicalPosition(position);
    return `${point.x},${point.y - 3}`;
  }).join(" ");
  return <g className={`sc-iso-card ${frontier ? "is-frontier" : ""} ${revealing ? "is-revealing" : ""}`} data-card-index={map.cardIndex}>
    <polygon className="sc-card-depth" points={cardDiamondPoints(map.cardIndex)} transform="translate(0 16)" />
    <polygon className="sc-card-base" points={cardDiamondPoints(map.cardIndex)} />
    <path className="sc-card-circuit" d={`M${titleX + 24} 55h92l16 16h84`} />
    <text className="sc-card-node-label" x={titleX} y="45">NODE {map.cardIndex + 1}/4</text>
    <text className="sc-card-title" x={titleX} y="68">{map.displayName?.toUpperCase()}</text>
    {frontier && <text className="sc-frontier-label" x={titleX + 300} y="55">CURRENT FRONTIER</text>}
    <g role="grid" aria-label={`${map.displayName} isometric map card`}>
      {positions.map((position) => <IsometricTile key={positionKey(position)} position={position} {...props} />)}
    </g>
    {pathPoints && <polyline className="sc-path-preview" points={pathPoints} />}
    <g className="sc-card-entities">
      {positions.map((position) => <TileContents key={positionKey(position)} position={position} {...props} />)}
    </g>
  </g>;
}

function IsometricTile({ position, map, view, movementKeys, targetsByPosition, canMove, interaction, onPreview, onMove, onTarget }: CardProps & { position: Position }) {
  const key = positionKey(position);
  const terrain = map.terrain?.[position.y]?.[position.x] ?? "#";
  const isWall = terrain === "#";
  const movement = interaction.kind === "movement" && canMove && movementKeys.has(key);
  const targets = targetsByPosition.get(key) ?? [];
  const targeted = interaction.kind !== "movement" && targets.length > 0;
  const characters = Object.values(view.characters).filter((character) => positionKey(character.position) === key);
  const enemies = Object.values(view.enemies).filter((enemy) => enemy.hp > 0 && positionKey(enemy.position) === key);
  const door = map.doors?.find((candidate) => positionKey(candidate.position) === key);
  const cache = map.caches?.find((candidate) => !candidate.pickedUp && positionKey(candidate.position) === key);
  const prop = map.props?.find((candidate) => candidate.position.x === position.x && candidate.position.y === position.y);
  const hazard = view.hazards.find((candidate) => positionKey(candidate.position) === key);
  const exit = map.exit?.x === position.x && map.exit.y === position.y;
  const entrance = map.entrance?.x === position.x && map.entrance.y === position.y;
  const actionable = movement || targeted;
  const current = characters.some((character) => character.id === view.activeCharacterId);
  const label = [
    isWall ? "Wall" : "Floor tile",
    `card ${position.cardIndex + 1}`,
    `column ${position.x + 1}`,
    `row ${position.y + 1}`,
    ...characters.map((character) => character.displayName),
    ...enemies.map((enemy) => `${enemy.displayName}, ${enemy.hp} hit points`),
    door ? (door.open ? "open firewall gate" : "locked firewall gate") : "",
    cache ? "item cache" : "",
    prop?.kind ?? "",
    hazard ? "temporary corruption hazard" : "",
    exit ? "network uplink" : "",
    entrance ? "network entrance" : "",
    current ? "current character tile" : "",
    movement ? "valid movement destination" : "",
    targeted ? `valid ${interaction.label.toLowerCase()} target` : ""
  ].filter(Boolean).join(", ");
  const activate = () => {
    if (targeted && targets[0]) onTarget(targets[0]);
    else if (movement) onMove(position);
  };
  const keyboardActivate = (event: KeyboardEvent<SVGGElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    activate();
  };
  const point = projectLogicalPosition(position);
  if (isWall) return <IsoWall position={position} label={label} />;
  return <g
    role="gridcell"
    aria-label={label}
    tabIndex={actionable ? 0 : -1}
    data-board-action={actionable ? "true" : "false"}
    className={`sc-iso-tile ${movement ? "is-movement" : ""} ${targeted ? "is-target" : ""}`}
    onClick={activate}
    onKeyDown={keyboardActivate}
    onMouseEnter={() => movement && onPreview(position)}
    onMouseLeave={() => onPreview(null)}
    onFocus={() => movement && onPreview(position)}
    onBlur={() => onPreview(null)}
  >
    <polygon points={tileDiamondPoints(position)} />
    {current && <polygon className="sc-current-outline" points={tileDiamondPoints(position)} />}
    {movement && <><polygon className="sc-move-outline" points={tileDiamondPoints(position)} /><text className="sc-tile-symbol" x={point.x} y={point.y + 5}>＋</text></>}
    {targeted && <><polygon className="sc-target-outline" points={tileDiamondPoints(position)} /><path className="sc-target-reticle" d={`M${point.x - 10} ${point.y}h20M${point.x} ${point.y - 10}v20`} /></>}
  </g>;
}

function IsoWall({ position, label }: { position: Position; label: string }) {
  const point = projectLogicalPosition(position);
  const raised = { ...point, y: point.y - 13 };
  const top = `${raised.x},${raised.y - ISO_TILE_HEIGHT / 2} ${raised.x + ISO_TILE_WIDTH / 2},${raised.y} ${raised.x},${raised.y + ISO_TILE_HEIGHT / 2} ${raised.x - ISO_TILE_WIDTH / 2},${raised.y}`;
  return <g role="gridcell" aria-label={label} tabIndex={-1} className="sc-iso-wall">
    <path d={`M${point.x - ISO_TILE_WIDTH / 2} ${point.y}L${point.x} ${point.y + ISO_TILE_HEIGHT / 2}V${raised.y + ISO_TILE_HEIGHT / 2}L${raised.x - ISO_TILE_WIDTH / 2} ${raised.y}Z`} className="sc-wall-left" />
    <path d={`M${point.x + ISO_TILE_WIDTH / 2} ${point.y}L${point.x} ${point.y + ISO_TILE_HEIGHT / 2}V${raised.y + ISO_TILE_HEIGHT / 2}L${raised.x + ISO_TILE_WIDTH / 2} ${raised.y}Z`} className="sc-wall-right" />
    <polygon points={top} className="sc-wall-top" />
    <path d={`M${raised.x - 12} ${raised.y}h9l5-5h10`} className="sc-wall-trace" />
  </g>;
}

function TileContents({ position, map, view, frontier, movingCharacterIds, movingEnemyIds, actingEnemyIds, damagedIds }: CardProps & { position: Position }) {
  const key = positionKey(position);
  const point = projectLogicalPosition(position);
  const characters = Object.values(view.characters).filter((character) => positionKey(character.position) === key);
  const enemies = Object.values(view.enemies).filter((enemy) => enemy.hp > 0 && positionKey(enemy.position) === key);
  const door = map.doors?.find((candidate) => positionKey(candidate.position) === key);
  const cache = map.caches?.find((candidate) => !candidate.pickedUp && positionKey(candidate.position) === key);
  const prop = map.props?.find((candidate) => candidate.position.x === position.x && candidate.position.y === position.y);
  const hazard = view.hazards.find((candidate) => positionKey(candidate.position) === key);
  const exit = map.exit?.x === position.x && map.exit.y === position.y;
  const entrance = map.entrance?.x === position.x && map.entrance.y === position.y;
  return <g className="sc-tile-contents">
    {entrance && <g transform={`translate(${point.x} ${point.y - 3})`}><UplinkSprite entrance /></g>}
    {exit && <g transform={`translate(${point.x} ${point.y - 4})`} className={frontier ? "is-frontier" : ""}><UplinkSprite /></g>}
    {door && <g transform={`translate(${point.x} ${point.y - 8})`}><DoorSprite open={door.open} /></g>}
    {prop && <g transform={`translate(${point.x} ${point.y - 8})`}><PropSprite kind={prop.kind} /></g>}
    {cache && <g transform={`translate(${point.x} ${point.y - 8})`}><CacheSprite /></g>}
    {hazard && <g className="sc-corruption-hazard" role="img" aria-label={`Corruption hazard, expires after round ${hazard.expiresAfterRound}`}><circle cx={point.x} cy={point.y - 3} r="11" /><path d={`M${point.x - 8} ${point.y - 3}h16M${point.x} ${point.y - 11}v16`} /></g>}
    {enemies.map((enemy, index) => <g key={enemy.id} transform={`translate(${point.x - 16 + index * 12} ${point.y - 42}) scale(${enemy.definitionId === "legacy-system" ? 1.18 : 0.82})`}>
      <EnemySprite definitionId={enemy.definitionId} displayName={enemy.displayName} damaged={damagedIds.has(enemy.id)} acting={movingEnemyIds.has(enemy.id) || actingEnemyIds.has(enemy.id)} />
      <HealthPip x={16} y={37} value={enemy.hp} max={enemy.maxHp} hostile />
    </g>)}
    {characters.map((character, index) => <g key={character.id} transform={`translate(${point.x - 12 + index * 12} ${point.y - 39}) scale(.82)`}>
      <CharacterSprite classId={character.classId} displayName={character.displayName} current={character.id === view.activeCharacterId} damaged={damagedIds.has(character.id) || character.hp <= character.maxHp / 3} downed={character.downed} acting={movingCharacterIds.has(character.id)} />
      <HealthPip x={12} y={36} value={character.hp} max={character.maxHp} />
    </g>)}
  </g>;
}

function HealthPip({ x, y, value, max, hostile = false }: { x: number; y: number; value: number; max: number; hostile?: boolean }) {
  const width = 24;
  return <g aria-hidden="true" className={`sc-board-health ${hostile ? "hostile" : ""}`}>
    <rect x={x - width / 2} y={y} width={width} height="3" rx="1" /><rect x={x - width / 2} y={y} width={width * Math.max(0, value) / max} height="3" rx="1" />
  </g>;
}

function UnknownCard({ cardIndex }: { cardIndex: number }) {
  const x = ISO_CARD_ORIGIN_X + cardIndex * ISO_CARD_SPACING;
  return <g className="sc-unknown-node" aria-label={`Unknown node ${cardIndex + 1}`} role="img">
    <path d={`M${x - 34} ${ISO_CARD_ORIGIN_Y + 115}h68l18 18-18 18h-68l-18-18z`} />
    <circle cx={x} cy={ISO_CARD_ORIGIN_Y + 133} r="9" />
    <text x={x} y={ISO_CARD_ORIGIN_Y + 166}>UNKNOWN NODE {cardIndex + 1}</text>
  </g>;
}

function EventEffects({ events, view }: { events: SystemCrawlEvent[]; view: SystemCrawlViewerState }) {
  return <g className="sc-event-effects" aria-hidden="true">{events.map((event) => {
    const characterId = typeof event.data.characterId === "string" ? event.data.characterId : null;
    const enemyId = typeof event.data.enemyId === "string" ? event.data.enemyId : null;
    const position = characterId ? view.characters[characterId]?.position : enemyId ? view.enemies[enemyId]?.position : undefined;
    if (!position) return null;
    const point = projectLogicalPosition(position);
    if (event.type === "damage_dealt") return <text key={event.id} className="sc-fx-number damage" x={point.x} y={point.y - 52}>−{typeof event.data.damage === "number" ? event.data.damage : 0}</text>;
    if (event.type === "healing") return <text key={event.id} className="sc-fx-number healing" x={point.x} y={point.y - 52}>+{typeof event.data.amount === "number" ? event.data.amount : 0}</text>;
    if (event.type === "damage_prevented" || event.type === "defense_triggered" || event.type === "dodge_triggered") return <text key={event.id} className="sc-fx-word defense" x={point.x} y={point.y - 52}>BLOCK</text>;
    if (event.type === "enemy_stunned") return <text key={event.id} className="sc-fx-word status" x={point.x} y={point.y - 52}>STUN</text>;
    if (event.type === "enemy_grew") return <text key={event.id} className="sc-fx-word hostile" x={point.x} y={point.y - 52}>GROWTH</text>;
    return null;
  })}</g>;
}

function targetsAtPositions(view: SystemCrawlViewerState, interaction: BoardInteraction): Map<string, SystemCrawlTarget[]> {
  const result = new Map<string, SystemCrawlTarget[]>();
  if (interaction.kind === "movement") return result;
  for (const target of interaction.targets) {
    let position: Position | undefined;
    if (target.type === "position") position = target.position;
    else if (target.type === "load_balancer") position = target.destination;
    else if (target.type === "character") position = view.characters[target.characterId]?.position;
    else if (target.type === "enemy") position = view.enemies[target.enemyId]?.position;
    else if (target.type === "door") position = view.maps.flatMap((map) => map.doors ?? []).find((door) => door.id === target.doorId)?.position;
    if (!position) continue;
    const key = positionKey(position);
    result.set(key, [...(result.get(key) ?? []), target]);
  }
  return result;
}

function tilePositions(map: PublicMapCard): Position[] {
  return (map.terrain ?? []).flatMap((row, y) => [...row].map((_tile, x) => ({ cardIndex: map.cardIndex, x, y })));
}

function gestureSnapshot(pointers: Map<number, { x: number; y: number }>): { x: number; y: number; distance: number } | null {
  const points = [...pointers.values()];
  const first = points[0];
  if (!first) return null;
  const second = points[1];
  if (!second) return { x: first.x, y: first.y, distance: 0 };
  return { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2, distance: Math.hypot(second.x - first.x, second.y - first.y) };
}

function ensurePointVisible(viewport: Viewport, point: { x: number; y: number }): Viewport {
  const screenX = viewport.x + point.x * viewport.zoom;
  const screenY = viewport.y + point.y * viewport.zoom;
  if (screenX >= 110 && screenX <= VIEWBOX_WIDTH - 110 && screenY >= 60 && screenY <= VIEWBOX_HEIGHT - 55) return viewport;
  return { ...viewport, x: VIEWBOX_WIDTH / 2 - point.x * viewport.zoom, y: VIEWBOX_HEIGHT / 2 - point.y * viewport.zoom };
}

function initialViewport(): Viewport {
  return typeof window !== "undefined" && window.innerWidth <= 760
    ? { x: -12, y: -6, zoom: 1.45 }
    : { x: 8, y: 2, zoom: 1 };
}
