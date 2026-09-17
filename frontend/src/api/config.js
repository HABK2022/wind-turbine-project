const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

export const apiGet = async (endpoint, signal) => {
    const res = await fetch(`${API_BASE_URL}${endpoint}`, { signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
};

/**
 * On a non-2xx response the parsed body is attached to the thrown error as
 * `err.body` (and the code as `err.status`), so callers can show the specific
 * reason the server gave instead of a bare status code.
 */
export const apiPost = async (endpoint, body) => {
    const res = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });

    let payload = null;
    try {
        payload = await res.json();
    } catch {
        payload = null; // response had no JSON body
    }

    if (!res.ok) {
        const err = new Error(payload?.message || `HTTP ${res.status}`);
        err.status = res.status;
        err.body = payload;
        throw err;
    }

    // 2xx: the caller may need the status too (202 means "unconfirmed").
    return { ...payload, httpStatus: res.status };
};

export default API_BASE_URL;
