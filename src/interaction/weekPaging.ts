export type WeekDelta = -1 | 0 | 1;

interface WeekSwipeInput {
  offset: number;
  velocity: number;
  width: number;
  canPrevious: boolean;
  canNext: boolean;
}

export function resolveWeekSwipe({
  offset,
  velocity,
  width,
  canPrevious,
  canNext,
}: WeekSwipeInput): WeekDelta {
  const distanceThreshold = Math.min(96, Math.max(48, width * 0.18));
  const fastEnough = Math.abs(velocity) >= 0.5;
  if (Math.abs(offset) < distanceThreshold && !fastEnough) return 0;

  const directionSignal = fastEnough ? velocity : offset;
  const delta: WeekDelta = directionSignal < 0 ? 1 : -1;
  if (delta === -1 && !canPrevious) return 0;
  if (delta === 1 && !canNext) return 0;
  return delta;
}

export function resistedWeekOffset(
  offset: number,
  width: number,
  canPrevious: boolean,
  canNext: boolean,
): number {
  const available = offset > 0 ? canPrevious : canNext;
  const resistance = available ? 1 : 0.18;
  const limit = width * (available ? 1 : 0.12);
  return Math.max(-limit, Math.min(limit, offset * resistance));
}
