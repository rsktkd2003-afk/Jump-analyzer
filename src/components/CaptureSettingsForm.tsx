import type {
  CameraDistance,
  CameraFraming,
  CameraView,
  CaptureSettings,
} from "../ai/captureSettings";
import { colors, radius } from "../styles/theme";

type Props = {
  value: CaptureSettings;
  onChange: (value: CaptureSettings) => void;
};

export function CaptureSettingsForm({ value, onChange }: Props) {
  const update = <K extends keyof CaptureSettings>(
    key: K,
    nextValue: CaptureSettings[K]
  ) => {
    onChange({
      ...value,
      [key]: nextValue,
    });
  };

  return (
    <>
      <RadioGroup<CameraView>
        title="撮影方向"
        value={value.cameraView}
        options={[
          ["side", "横"],
          ["front", "正面"],
          ["back", "後ろ"],
          ["frontDiagonal", "斜め前"],
          ["backDiagonal", "斜め後ろ"],
          ["unknown", "未入力"],
        ]}
        onChange={(v) => update("cameraView", v)}
      />

      <RadioGroup<CameraFraming>
        title="画角"
        value={value.framing}
        options={[
          ["close", "全身が大きく映る"],
          ["normal", "全身＋少し余白"],
          ["wide", "コートが広く映る"],
          ["far", "遠距離"],
          ["unknown", "未入力"],
        ]}
        onChange={(v) => update("framing", v)}
      />

      <RadioGroup<CameraDistance>
        title="撮影距離"
        value={value.distance}
        options={[
          ["near", "近い"],
          ["normal", "普通"],
          ["far", "遠い"],
          ["unknown", "わからない"],
        ]}
        onChange={(v) => update("distance", v)}
      />
    </>
  );
}

function RadioGroup<T extends string>(props: {
  title: string;
  value: T;
  options: Array<[T, string]>;
  onChange: (value: T) => void;
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      <p style={{ margin: "0 0 8px", fontSize: 12, fontWeight: 600, color: colors.bodyText }}>
        {props.title}
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {props.options.map(([key, label]) => {
          const active = props.value === key;
          return (
            <label
              key={key}
              style={{
                cursor: "pointer",
                borderRadius: radius.pill,
                border: `1px solid ${active ? colors.accent : colors.border}`,
                background: active ? colors.accentSoft : "#fff",
                color: active ? colors.accent : colors.bodyText,
                padding: "6px 14px",
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              <input
                type="radio"
                checked={active}
                onChange={() => props.onChange(key)}
                style={{ display: "none" }}
              />
              {label}
            </label>
          );
        })}
      </div>
    </div>
  );
}
