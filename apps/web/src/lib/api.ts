import { useAuthStore, type AuthUser } from "@/store/auth";

export const API_URL = (
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"
).replace(/\/$/, "");

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: AuthUser;
}

export interface RecordingResponse {
  id: string;
  title: string;
  artist: string | null;
  duration_seconds: number;
  source_kind: "upload" | "youtube" | "spotify";
  assets: Array<{ id: string; duration_seconds: number }>;
  external_references: Array<{ provider: string; embed_url: string | null }>;
}

export interface ProjectResponse {
  id: string;
  recording_id: string;
  title: string;
  current_revision_id: string | null;
}

export interface JobResponse {
  id: string;
  project_id: string;
  status: "queued" | "processing" | "succeeded" | "failed" | "cancelled";
  stage: string | null;
  progress: number;
  error_message: string | null;
}

export interface ScoreResponse {
  id: string;
  musicxml: string;
  revision: number;
  measures?: ScoreMeasure[];
}

export interface ScoreNote {
  id: string;
  concert_midi: number | null;
  spelling: string | null;
  is_rest: boolean;
  performance_onset_seconds: number;
  performance_offset_seconds: number;
  beat_numerator: number;
  beat_denominator: number;
  duration_numerator: number;
  duration_denominator: number;
  articulation: string | null;
}

export interface ScoreChord {
  id: string;
  beat_numerator: number;
  beat_denominator: number;
  symbol: string;
  source: string;
  locked: boolean;
}

export interface ScoreMeasure {
  number: number;
  beats: number;
  beat_type: number;
  voices: Array<{ number: number; notes: ScoreNote[] }>;
  chords: ScoreChord[];
}

export interface HarmonyResponse {
  revision_id: string;
  key: string;
  mode: string;
  key_confidence: number;
  chords: Array<{
    measure: number;
    beat: number;
    symbol: string;
    roman_numeral: string;
    confidence: number;
    source: string;
    likely_scales: string[];
    explanation: string;
  }>;
  patterns: string[];
  caveats: string[];
}

function detailFromBody(body: unknown, fallback: string): string {
  if (typeof body === "object" && body !== null && "detail" in body) {
    const detail = (body as { detail: unknown }).detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) {
      return detail
        .map((item) =>
          typeof item === "object" && item !== null && "msg" in item
            ? String((item as { msg: unknown }).msg)
            : "Invalid input",
        )
        .join("; ");
    }
  }
  return fallback;
}

async function parseBody(response: Response): Promise<unknown> {
  if (response.status === 204) return null;
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("json")) return response.json();
  return response.text();
}

async function refreshSession(): Promise<string | null> {
  const refreshToken = useAuthStore.getState().refreshToken;
  if (!refreshToken) return null;
  const response = await fetch(`${API_URL}/api/v1/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  if (!response.ok) {
    useAuthStore.getState().clearSession();
    return null;
  }
  const session = (await response.json()) as TokenResponse;
  useAuthStore
    .getState()
    .setSession(session.user, session.access_token, session.refresh_token);
  return session.access_token;
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
  retryAuthentication = true,
): Promise<T> {
  const token = useAuthStore.getState().accessToken;
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (
    init.body &&
    !(init.body instanceof FormData) &&
    !headers.has("Content-Type")
  ) {
    headers.set("Content-Type", "application/json");
  }
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, { ...init, headers });
  } catch {
    throw new ApiError(
      0,
      "Frasi services are not reachable. Your local workspace is still safe.",
    );
  }
  if (
    response.status === 401 &&
    retryAuthentication &&
    useAuthStore.getState().refreshToken
  ) {
    const nextToken = await refreshSession();
    if (nextToken) return apiFetch<T>(path, init, false);
  }
  const body = await parseBody(response);
  if (!response.ok) {
    throw new ApiError(
      response.status,
      detailFromBody(body, `Request failed (${response.status})`),
    );
  }
  return body as T;
}

export async function apiDownload(path: string): Promise<Blob> {
  const token = useAuthStore.getState().accessToken;
  const response = await fetch(`${API_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!response.ok) {
    const body = await parseBody(response);
    throw new ApiError(response.status, detailFromBody(body, "Export failed"));
  }
  return response.blob();
}
