import type {
  Health, JobInfo, JourneyRequest, JourneyResponse, PlaceDetail, ReplanRequest, ReplanResponse, SegmentDiscoverResponse,
  SliceResponse, StressRequest, StressResult, Evidence,
} from "./types";

export class ApiError extends Error {
  code: string;
  retriable: boolean;
  status: number;
  constructor(message: string, code = "error", retriable = false, status = 0) {
    super(message);
    this.code = code;
    this.retriable = retriable;
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      headers: { "Content-Type": "application/json" },
      ...init,
    });
  } catch {
    throw new ApiError("Can't reach the WAYPOINTS server. Is the backend running?", "network", true);
  }
  if (!res.ok) {
    let detail: any = null;
    try {
      detail = (await res.json()).detail;
    } catch {
      /* ignore */
    }
    const message =
      typeof detail === "string" ? detail : detail?.message ?? (res.status >= 500 ? "Live search temporarily unavailable." : `Request failed (${res.status})`);
    throw new ApiError(message, detail?.code ?? "error", detail?.retriable ?? res.status >= 500, res.status);
  }
  return (await res.json()) as T;
}

const post = <T>(path: string, body: unknown) => request<T>(path, { method: "POST", body: JSON.stringify(body) });

export const api = {
  health: () => request<Health>("/health"),
  startDiscovery: (req: JourneyRequest) => post<JobInfo>("/journey/discover/start", req),
  job: (id: string) => request<JobInfo>(`/journey/jobs/${id}`),
  journey: (id: string) => request<JourneyResponse>(`/journey/${id}`),
  slice: (id: string, minute: number) => request<SliceResponse>(`/journey/${id}/slice?minute=${minute}`),
  stress: (req: StressRequest) => post<StressResult>("/journey/stress-test", req),
  replan: (req: ReplanRequest) => post<ReplanResponse>("/journey/replan", req),
  segment: (journey_id: string, from_fraction: number, to_fraction: number, count = 5) =>
    post<SegmentDiscoverResponse>("/journey/segment-discover", { journey_id, from_fraction, to_fraction, count }),
  place: (id: string, journey?: string) => request<PlaceDetail>(`/place/${id}${journey ? `?journey=${journey}` : ""}`),
  placeEvidence: (id: string, journey?: string) => request<Evidence[]>(`/place/${id}/evidence${journey ? `?journey=${journey}` : ""}`),
};
