import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** the favicon's pixel N with its cursor block, at home-screen size */
export default function AppleIcon() {
  const px = 180 / 32;
  const cells: [number, number, number, number][] = [
    [6, 7, 4, 18],
    [16, 7, 4, 18],
    [10, 9, 2, 4],
    [12, 11, 2, 4],
    [14, 13, 2, 4],
  ];
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#08080a", position: "relative" }}>
        {cells.map(([x, y, w, h], i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x * px,
              top: y * px,
              width: w * px,
              height: h * px,
              background: "#ff5a2e",
            }}
          />
        ))}
        <div
          style={{
            position: "absolute",
            left: 22 * px,
            top: 21 * px,
            width: 5 * px,
            height: 4 * px,
            background: "#efeae2",
          }}
        />
      </div>
    ),
    size,
  );
}
