import type {
  CameraDistance,
  CameraFraming,
  CameraView,
  CaptureSettings,
} from "../ai/captureSettings";

type Props = {
  value: CaptureSettings;
  onChange: (value: CaptureSettings) => void;
};

export function CaptureSettingsForm({ value, onChange }: Props) {
  const update = <K extends keyof CaptureSettings>(
    key: K,
    nextValue: CaptureSettings[K],
  ) => {
    onChange({
      ...value,
      [key]: nextValue,
    });
  };

  return (
    <section className="rounded-2xl border border-slate-700 bg-slate-900/70 p-4">
      <div className="mb-3">
        <h3 className="text-sm font-bold text-white">撮影設定（任意）</h3>
        <p className="text-xs text-slate-400">
          未入力でも解析できます。入力すると評価の信頼度を調整します。
        </p>
      </div>

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
    </section>
  );
}

function RadioGroup<T extends string>(props: {
  title: string;
  value: T;
  options: Array<[T, string]>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="mb-4 last:mb-0">
      <p className="mb-2 text-xs font-semibold text-slate-300">
        {props.title}
      </p>

      <div className="flex flex-wrap gap-2">
        {props.options.map(([key, label]) => (
          <label
            key={key}
            className={`cursor-pointer rounded-full border px-3 py-1 text-xs ${
              props.value === key
                ? "border-sky-400 bg-sky-400/20 text-sky-100"
                : "border-slate-700 bg-slate-800 text-slate-300"
            }`}
          >
            <input
              type="radio"
              className="sr-only"
              checked={props.value === key}
              onChange={() => props.onChange(key)}
            />
            {label}
          </label>
        ))}
      </div>
    </div>
  );
}