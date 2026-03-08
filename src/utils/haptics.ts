/** Lightweight haptic feedback via the Vibration API (mobile only, no-op on desktop). */
export function haptic(style: 'light' | 'medium' | 'heavy' | 'success' | 'error' = 'light') {
  if (typeof navigator === 'undefined' || !navigator.vibrate) return;
  const patterns: Record<string, number | number[]> = {
    light: 10,
    medium: 20,
    heavy: 40,
    success: [10, 30, 10],
    error: [20, 40, 20, 40, 20],
  };
  try {
    navigator.vibrate(patterns[style]);
  } catch { /* some browsers throw on vibrate */ }
}
