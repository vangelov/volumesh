const palette = [
  // Reds & corals
  "#E57373",
  "#EF5350",
  "#F28B82",
  "#E76F51",
  "#D96C75",
  "#FF8A80",

  // Oranges & peaches
  "#F4A261",
  "#FFB074",
  "#E9967A",
  "#FFAB91",
  "#D98C5F",
  "#F7B267",

  // Yellows & golds
  "#E9C46A",
  "#F2CC8F",
  "#DDB967",
  "#F6BD60",

  // Greens & teals
  "#81B29A",
  "#4ECDC4",
  "#A3BE8C",
  "#70B7A1",
  "#88C9A1",

  // Blues & cyans
  "#64B5F6",
  "#90CAF9",
  "#5DADE2",
  "#6C9BD2",
  "#76C7D8",
  "#4A90C3",
  "#80B4D8",

  // Pinks & mauves
  "#F48FB1",
  "#E8A0BF",
  "#D98BA6",
  "#C98BB9",

  // Earthy & neutral
  "#D4A373",
  "#C9A27E",
  "#B8A08A",
  "#C4A484",
];

export function colorFromLabel(label: string) {
  let hash = 2166136261;

  for (let i = 0; i < label.length; i++) {
    hash ^= label.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return palette[(hash >>> 0) % palette.length];
}

export function hexToRgb(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >>> 16) / 255, ((n >>> 8) & 255) / 255, (n & 255) / 255];
}

export function hexFromRgb([r, g, b]: number[]) {
  return (
    "#" +
    [r, g, b]
      .map((v) =>
        Math.round(v * 255)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}
