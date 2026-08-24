import { useEffect, useRef, useState } from "react";
import type { SystemCrawlEvent } from "@team-arcade/games";

const AUDIO_KEY = "team-arcade:system-crawl:sound-enabled";

export function useSystemCrawlAudio(events: readonly SystemCrawlEvent[]) {
  const [enabled, setEnabled] = useState(() => {
    try { return window.localStorage.getItem(AUDIO_KEY) === "1"; } catch { return false; }
  });
  const context = useRef<AudioContext | null>(null);
  const lastEventId = useRef(events.at(-1)?.id ?? 0);

  useEffect(() => {
    const latest = events.at(-1)?.id ?? 0;
    const fresh = events.filter((event) => event.id > lastEventId.current);
    lastEventId.current = latest;
    if (!enabled || !context.current || fresh.length === 0) return;
    const event = fresh.at(-1);
    if (event) playTone(context.current, event);
  }, [enabled, events]);

  const toggle = async () => {
    const next = !enabled;
    if (next) {
      try {
        context.current ??= new AudioContext();
        await context.current.resume();
      } catch {
        context.current = null;
      }
    }
    setEnabled(next);
    try { window.localStorage.setItem(AUDIO_KEY, next ? "1" : "0"); } catch { /* local preference only */ }
  };

  return { enabled, toggle };
}

function playTone(context: AudioContext, event: SystemCrawlEvent): void {
  const frequencies: Partial<Record<SystemCrawlEvent["type"], number>> = {
    character_moved: 260, enemy_attacked: 150, damage_dealt: 120, healing: 520,
    item_picked_up: 660, map_card_revealed: 390, boss_phase_changed: 95, victory: 740, defeat: 80
  };
  const frequency = frequencies[event.type];
  if (!frequency) return;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.frequency.value = frequency;
  oscillator.type = event.type === "defeat" ? "sawtooth" : "square";
  gain.gain.setValueAtTime(0.025, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.09);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.1);
}
