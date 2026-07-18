/**
 * Thin Vapi REST wrapper. The interface exists so the compiler and call service
 * can be unit-tested against a fake, and so ALL Vapi HTTP lives behind one seam.
 */

export interface VapiAssistantRef {
  id: string;
}
export interface VapiCallRef {
  id: string;
  status?: string;
}

export interface CreateCallPayload {
  assistantId: string;
  phoneNumberId: string;
  customer: { number: string; name?: string };
  assistantOverrides?: { variableValues?: Record<string, string> };
}

export interface VapiClient {
  createAssistant(obj: unknown): Promise<VapiAssistantRef>;
  updateAssistant(id: string, obj: unknown): Promise<VapiAssistantRef>;
  createCall(payload: CreateCallPayload): Promise<VapiCallRef>;
}

const VAPI_BASE = "https://api.vapi.ai";

export class RealVapiClient implements VapiClient {
  constructor(private apiKey: string = process.env.VAPI_API_KEY ?? "") {}

  private async req<T>(method: string, path: string, body?: unknown): Promise<T> {
    if (!this.apiKey) throw new Error("VAPI_API_KEY is not set");
    const res = await fetch(`${VAPI_BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Vapi ${method} ${path} failed: ${res.status} ${text}`);
    }
    return (await res.json()) as T;
  }

  createAssistant(obj: unknown) {
    return this.req<VapiAssistantRef>("POST", "/assistant", obj);
  }
  updateAssistant(id: string, obj: unknown) {
    return this.req<VapiAssistantRef>("PATCH", `/assistant/${id}`, obj);
  }
  createCall(payload: CreateCallPayload) {
    return this.req<VapiCallRef>("POST", "/call", payload);
  }
}
