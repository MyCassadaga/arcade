import type { SystemCrawlEvent } from "@team-arcade/games";
import { eventAnnouncement } from "./presentation";

export function EventLog({ events, compact = false }: { events: readonly SystemCrawlEvent[]; compact?: boolean }) {
  const visible = events.slice(compact ? -6 : -16).reverse();
  return <section className={`sc-event-log ${compact ? "is-compact" : ""}`} aria-labelledby="sc-event-log-title">
    <header><h3 id="sc-event-log-title">Incident stream</h3><span>AUTHORITATIVE</span></header>
    {visible.length === 0 ? <p>No incident events yet.</p> : <ol>{visible.map((event) => <li key={event.id} data-event-id={event.id}>
      <time>R{event.round}</time><span>{eventAnnouncement(event)}</span>
    </li>)}</ol>}
  </section>;
}
