export type AppErrorContext = {
  area: string;
  action?: string;
  analysisVersion?: string;
};

export type SafeErrorRecord = {
  occurredAt: string;
  name: string;
  message: string;
  context: AppErrorContext;
};

const MAX_MESSAGE_LENGTH = 500;

function safeMessage(error: unknown): { name: string; message: string } {
  if (error instanceof Error) {
    return {
      name: error.name || "Error",
      message: error.message.slice(0, MAX_MESSAGE_LENGTH),
    };
  }

  return {
    name: "UnknownError",
    message: "予期しないエラーが発生しました。",
  };
}

/**
 * 個人情報・動画・骨格座標を含めず、調査に必要な最小限の情報だけを記録する。
 * 現在はブラウザコンソールのみで、外部サービスへの送信は行わない。
 */
export function reportAppError(
  error: unknown,
  context: AppErrorContext
): SafeErrorRecord {
  const normalized = safeMessage(error);
  const record: SafeErrorRecord = {
    occurredAt: new Date().toISOString(),
    name: normalized.name,
    message: normalized.message,
    context,
  };

  console.error("[jump-analyzer]", record);
  return record;
}
