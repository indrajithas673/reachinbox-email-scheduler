export class ApiError extends Error {
  public status: number;
  public details?: any;

  constructor(message: string, status: number, details?: any) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

const API_BASE = (import.meta.env.VITE_API_URL || '') + '/api';

export async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE}${endpoint}`;
  
  const headers = new Headers(options?.headers);
  if (!headers.has('Content-Type') && !(options?.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const token = localStorage.getItem('auth_token');
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  // Specifically overwrite credentials since we strictly need 'include'
  const fetchOptions: RequestInit = {
    ...options,
    headers,
    credentials: 'include'
  };

  const res = await fetch(url, fetchOptions);

  if (!res.ok) {
    let errorMsg = 'An unexpected error occurred';
    let details = undefined;
    try {
      const data = await res.json();
      errorMsg = data.error || errorMsg;
      details = data.details;
    } catch (e) {
      // Not JSON
      errorMsg = await res.text();
    }
    
    // We explicitly throw an ApiError so the frontend can catch 401s easily.
    throw new ApiError(errorMsg, res.status, details);
  }

  // Handle 204 No Content
  if (res.status === 204) {
    return {} as T;
  }

  return res.json();
}
