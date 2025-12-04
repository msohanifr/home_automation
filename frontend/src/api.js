// frontend/src/api/index.js (or ../api.js)
import axios from "axios";

/* -------------------------------------------------------
 * 1) Resolve API Base URL safely
 * ----------------------------------------------------- */

let API_BASE_URL = "http://localhost:8002/api"; // fallback default

// 1a) Prefer REACT_APP_API_BASE_URL (CRA / webpack env)
if (
  typeof process !== "undefined" &&
  process.env &&
  process.env.REACT_APP_API_BASE_URL
) {
  API_BASE_URL = process.env.REACT_APP_API_BASE_URL;
}

// 1b) Optional override via window (for quick local testing,
//     e.g. <script>window.HOME_AUTOMATION_API_BASE_URL="http://host/api";</script>)
if (
  typeof window !== "undefined" &&
  window.HOME_AUTOMATION_API_BASE_URL
) {
  API_BASE_URL = window.HOME_AUTOMATION_API_BASE_URL;
}

// 1c) Normalize — strip trailing slashes
API_BASE_URL = API_BASE_URL.replace(/\/+$/, "");

// Helpful debug log (shows once at bundle load)
if (typeof console !== "undefined") {
  console.log("[api] Using base URL:", API_BASE_URL);
}

/* -------------------------------------------------------
 * 2) Create axios instance
 * ----------------------------------------------------- */

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000, // 10s
});

/* -------------------------------------------------------
 * 3) Attach Token Automatically
 * ----------------------------------------------------- */

api.interceptors.request.use((config) => {
  try {
    const token = localStorage.getItem("authToken");
    if (token) {
      config.headers = config.headers || {};
      config.headers.Authorization = `Token ${token}`;
    }
  } catch (e) {
    // localStorage might not be available in some environments; ignore
  }
  return config;
});

/* -------------------------------------------------------
 * 4) Unified Error Logging
 * ----------------------------------------------------- */

api.interceptors.response.use(
  (response) => response,
  (error) => {
    // If there's no response, this is a network / CORS / server-down error
    if (!error.response) {
      const base = error.config?.baseURL || API_BASE_URL || "";
      const path = error.config?.url || "";
      const fullUrl = `${base}${path}`;

      console.error("🔥 NETWORK ERROR:", {
        message: error.message,
        url: fullUrl,
      });

      return Promise.reject({
        type: "network_error",
        message: "Unable to reach the server.",
        url: fullUrl,
        originalError: error,
      });
    }

    const { status, data, config } = error.response;
    const base = config?.baseURL || API_BASE_URL || "";
    const path = config?.url || "";
    const fullUrl = `${base}${path}`;

    console.error("🔥 API ERROR:", {
      url: fullUrl,
      method: config?.method,
      status,
      data,
    });

    return Promise.reject({
      type: "api_error",
      status,
      data,
      url: fullUrl,
      originalError: error,
    });
  }
);

/* -------------------------------------------------------
 * 5) Auth Functions
 * ----------------------------------------------------- */

export const login = async (username, password) => {
  const res = await api.post("/auth/login/", { username, password });

  // Normalize: backend returns either "token" or "key"
  const token = res.data.token || res.data.key;
  const user = res.data.user || res.data.profile || null;

  if (token) {
    localStorage.setItem("authToken", token);
  }
  if (user) {
    localStorage.setItem("authUser", JSON.stringify(user));
  }

  return { token, user };
};

export const register = async (username, password) => {
  const res = await api.post("/auth/register/", { username, password });
  const token = res.data.token || res.data.key;
  const user = res.data.user || null;

  if (token) {
    localStorage.setItem("authToken", token);
  }
  if (user) {
    localStorage.setItem("authUser", JSON.stringify(user));
  }

  return { token, user };
};

export const logout = async () => {
  try {
    await api.post("/auth/logout/");
  } catch (e) {
    // ignore server errors on logout
  }
  localStorage.removeItem("authToken");
  localStorage.removeItem("authUser");
};

/* -------------------------------------------------------
 * 6) Domain API Endpoints
 * ----------------------------------------------------- */

export const getSummary = () => api.get("/dashboard/summary/");

// Rooms
export const getRooms = () => api.get("/rooms/");
export const createRoom = (room) => api.post("/rooms/", room);
export const updateRoom = (id, payload) =>
  api.patch(`/rooms/${id}/`, payload);

// Devices
export const getRoomDevices = (roomId) =>
  api.get("/devices/", { params: { room: roomId } });

export const createDevice = (payload) =>
  api.post("/devices/", payload);

export const getDevice = (id) =>
  api.get(`/devices/${id}/`);

export const updateDevice = (id, payload) =>
  api.patch(`/devices/${id}/`, payload);

export const updateDeviceDetails = (id, payload) =>
  api.patch(`/devices/${id}/`, payload);

export const sendDeviceCommand = (id, payload) =>
  api.post(`/devices/${id}/command/`, payload);

// Integrations
export const getIntegrations = () =>
  api.get("/integrations/");

export const createIntegration = (payload) =>
  api.post("/integrations/", payload);

// Connectors (MQTT / PLC / OPC UA / etc.)
export const getConnectors = () => api.get("/connectors/");

// Endpoints (bindings between devices and connectors)
export const createEndpoint = (payload) =>
  api.post("/endpoints/", payload);

export const updateEndpoint = (id, payload) =>
  api.patch(`/endpoints/${id}/`, payload);

export const deleteEndpoint = (id) =>
  api.delete(`/endpoints/${id}/`);

export default api;