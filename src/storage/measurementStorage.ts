import type { MeasurementHistoryItem } from "../types/history";

const STORAGE_KEY = "jump-analyzer-history";

export const loadMeasurementHistory = (): MeasurementHistoryItem[] => {
  const raw = localStorage.getItem(STORAGE_KEY);

  if (!raw) return [];

  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
};

export const saveMeasurementHistory = (
  items: MeasurementHistoryItem[]
): void => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
};