import { colors } from "../../styles/theme";

type Props = {
  stars: number;
  max?: number;
  size?: number;
};

/** 星評価（小数対応・塗り部分をclipで表現） */
export default function StarRow({ stars, max = 5, size = 14 }: Props) {
  return (
    <div style={{ display: "inline-flex", gap: 1 }} aria-label={`5段階中${stars.toFixed(1)}`}>
      {Array.from({ length: max }).map((_, i) => {
        const fill = Math.max(0, Math.min(1, stars - i));
        return (
          <span
            key={i}
            style={{
              position: "relative",
              display: "inline-block",
              width: size,
              height: size,
              fontSize: size,
              lineHeight: 1,
            }}
          >
            <span style={{ position: "absolute", inset: 0, color: colors.border }}>★</span>
            <span
              style={{
                position: "absolute",
                inset: 0,
                color: colors.gold,
                overflow: "hidden",
                width: `${fill * 100}%`,
                whiteSpace: "nowrap",
              }}
            >
              ★
            </span>
          </span>
        );
      })}
    </div>
  );
}
