import type { MeasurementHistoryItem } from "../types/history";

type Props = {
  items: MeasurementHistoryItem[];
  onClear: () => void;
};

export default function HistoryList({ items, onClear }: Props) {
  return (
    <section>
      <h2>測定履歴</h2>

      {items.length === 0 ? (
        <p>まだ履歴はありません。</p>
      ) : (
        <>
          {items.map((item) => (
            <div
              key={item.id}
              style={{
                padding: 12,
                borderRadius: 12,
                background: "#f3f3f3",
                marginBottom: 8,
              }}
            >
              <div style={{ fontWeight: "bold" }}>
                {new Date(item.createdAt).toLocaleString()}
              </div>

              <hr />

              <div>
                最高到達点：
                {item.maxReach ? `${item.maxReach.toFixed(1)}cm` : "-"}
              </div>

              <div>
                ジャンプ高：
                {item.jumpHeight ? `${item.jumpHeight.toFixed(1)}cm` : "-"}
              </div>

              <div>
                滞空時間：
                {item.airTime ? `${item.airTime.toFixed(3)}秒` : "-"}
              </div>

              <div>
                滞空フレーム：
                {item.airFrameCount ? `${item.airFrameCount}F` : "-"}
              </div>

              <div>
                推定ジャンプ高：
                {item.estimatedJumpHeight
                  ? `${item.estimatedJumpHeight.toFixed(1)}cm`
                  : "-"}
              </div>

              <div>
                最高点フレーム：
                {item.peakFrame !== null ? `${item.peakFrame}F` : "-"}
              </div>

              <div>
                最高点時刻：
                {item.peakTime !== null ? `${item.peakTime.toFixed(3)}秒` : "-"}
              </div>

              <div>
                球速：
                {item.ballSpeed ? `${item.ballSpeed.toFixed(1)}km/h` : "-"}
              </div>

              <div>
                誤差：
                {item.reachError ? `±${item.reachError.toFixed(1)}cm` : "-"}
              </div>
            </div>
          ))}

          <button
            onClick={onClear}
            style={{
              width: "100%",
              padding: 12,
              borderRadius: 12,
              border: "1px solid #ccc",
              background: "#fff",
              fontSize: 16,
            }}
          >
            履歴を全削除
          </button>
        </>
      )}
    </section>
  );
}