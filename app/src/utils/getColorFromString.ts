export const getColorFromString = (string: unknown = "", saturation = 60, lightness = 38) => {
  // Defensive: callers sometimes pass `undefined + undefined` (which is `NaN`,
  // not undefined, so the default param doesn't catch it) when a workspace
  // object hasn't fully hydrated yet. Coerce to string before splitting.
  const safe = typeof string === "string" ? string : "";
  const hue = safe.split("").reduce((hue, char) => {
    let hash = char.charCodeAt(0) + ((hue << 5) - hue);
    hash &= hash;
    return hash;
  }, 0);

  return `hsl(${hue % 360}, ${saturation}%, ${lightness}%)`;
};
