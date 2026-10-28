// The Growth group's slider (PRD 7.4): one position per timeline stop, then a last
// position for the final look, so the slider always reads what the canvas shows
// ("Final look" when no stop is picked, never "Today").

/** Slider position of a timeline stop index (null = the final look, the last position). */
export function timelineSliderValue(index, stopCount) {
  return index === null || index === undefined ? stopCount : index;
}

/** Timeline stop index at a slider position (null at the last position: the final look). */
export function timelineIndexAt(position, stopCount) {
  const i = Math.round(Number(position) || 0);
  return i >= stopCount ? null : Math.max(0, i);
}
