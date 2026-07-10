import {
  captureSettingsLabel,
  isCaptureSettingsUnknown,
  type CaptureSettings,
} from "../ai/captureSettings";

type Props = {
  settings: CaptureSettings;
  confidence: number;
};

export function CaptureSettingsSummary({ settings, confidence }: Props) {
  const unknown = isCaptureSettingsUnknown(settings);

  return (
    <section className="rounded-2xl border border-slate-700 bg-slate-900/70 p-4">
      <h3 className="mb-2 text-sm font-bold text-white">撮影条件</h3>

      <p className="text-sm text-slate-200">
        {unknown ? "未入力" : captureSettingsLabel(settings)}
      </p>

      <p className="mt-2 text-sm text-slate-300">
        解析信頼度:{" "}
        <span className="font-bold text-white">
          {(confidence * 100).toFixed(0)}%
        </span>
      </p>

      {unknown && (
        <p className="mt-2 text-xs text-slate-400">
          撮影条件を入力すると一部評価精度が向上します。
        </p>
      )}

      {(settings.framing === "close" || settings.distance === "near") && (
        <p className="mt-2 text-xs text-amber-300">
          体の一部が画面外に切れると、一部項目の信頼度が下がります。
        </p>
      )}
    </section>
  );
}