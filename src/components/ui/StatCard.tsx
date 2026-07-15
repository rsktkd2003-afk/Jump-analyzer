import { card, colors } from "../../styles/theme";

type Props = {
  label: string;
  value: string;
  delta?: string;
  deltaKind?: "success" | "warning" | "neutral";
};

export default function StatCard({ label, value, delta, deltaKind = "neutral" }: Props) {
  const deltaColor =
    deltaKind === "success" ? colors.success : deltaKind === "warning" ? colors.warning : colors.mutedText;

  return (
    <div style={{ ...card, padding: 16 }}>
      <div style={{ fontSize: 12, color: colors.bodyText, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: colors.titleText, marginTop: 6 }}>
        {value}
      </div>
      {delta && (
        <div style={{ fontSize: 12, color: deltaColor, marginTop: 4, fontWeight: 600 }}>{delta}</div>
      )}
    </div>
  );
}
