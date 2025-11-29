import axios from "axios";

/* -------------------------------------------------------
 * 1) Resolve API Base URL safely
 * ----------------------------------------------------- */

let API_BASE_URL = "http://localhost:8002/api"; // fallback default

// Prefer REACT_APP_API_BASE_URL from CRA / webpack env system
if (typeof process !== "undefined" &&
    process.env &&
    process.env.REACT_APP_API_BASE_URL) {
  API_BASE_URL = process.env.REACT_APP_API_BASE_URL;
}

// Optional override (example: <script>window.HOME_AUTOMATION_API_BASE_URL = "...";</script>)
if (typeof window !== "undefined" &&
    window.HOME_AUTOMATION_API_BASE_URL) {
  API_BASE_URL = window.HOME_AUTOMATION_API_BASE_URL;
}

// Normalize — ensure trailing slash is removed
API_BASE_URL = API_BASE_URL.replace(/\/+$/, "");


/* -------------------------------------------------------
 * 2) Create axios instance
 * ----------------------------------------------------- */

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000, // prevent hangs forever
});

/* -------------------------------------------------------
 * 3) Attach Token Automatically
 * ----------------------------------------------------- */

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("authToken");
  if (token) {
    config.headers.Authorization = `Token ${token}`;
  }
  return config;
});

/* -------------------------------------------------------
 * 4) Unified Error Logging (HUGELY helpful in React)
 * ----------------------------------------------------- */

api.interceptors.response.use(
  (response) => response,
  (error) => {
    // No response means network/server unreachable
    if (!error.response) {
      console.error("🔥 NETWORK ERROR:", {
        message: error.message,
        url: error.config?.url,
      });
      return Promise.reject({
        type: "network_error",
        message: "Unable to reach the server.",
      });
    }

    const { status, data, config } = error.response;

    console.error("🔥 API ERROR:", {
      url: config.url,
      method: config.method,
      status,
      data,
    });

    return Promise.reject({
      type: "api_error",
      status,
      data,
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

  localStorage.setItem("authToken", token);
  if (user) {
    localStorage.setItem("authUser", JSON.stringify(user));
  }

  return { token, user };
};

export const register = async (username, password) => {
  const res = await api.post("/auth/register/", { username, password });
  const token = res.data.token || res.data.key;
  const user = res.data.user || null;

  localStorage.setItem("authToken", token);
  if (user) {
    localStorage.setItem("authUser", JSON.stringify(user));
  }

  return { token, user };
};

export const logout = async () => {
  try {
    await api.post("/auth/logout/");
  } catch (e) {
    // ignore server errors
  }
  localStorage.removeItem("authToken");
  localStorage.removeItem("authUser");
};


/* -------------------------------------------------------
 * 6) Domain API Endpoints
 * ----------------------------------------------------- */

export const getSummary = () => api.get("/dashboard/summary/");
export const getRooms = () => api.get("/rooms/");
export const createRoom = (room) => api.post("/rooms/", room);

export const getRoomDevices = (roomId) =>
  api.get("/devices/", { params: { room: roomId } });

export const updateDevice = (id, payload) =>
  api.patch(`/devices/${id}/`, payload);

export const updateRoom = (id, payload) =>
  api.patch(`/rooms/${id}/`, payload);

export const createDevice = (payload) =>
  api.post("/devices/", payload);

export const getIntegrations = () =>
  api.get("/integrations/");

export const createIntegration = (payload) =>
  api.post("/integrations/", payload);

// Devices (single)
export const getDevice = (id) => api.get(`/devices/${id}/`);
export const updateDeviceDetails = (id, payload) =>
  api.patch(`/devices/${id}/`, payload);

// Connectors (MQTT / PLC / etc.)
export const getConnectors = () => api.get("/connectors/");

// Endpoints (bindings between devices and connectors)
export const createEndpoint = (payload) => api.post("/endpoints/", payload);
export const updateEndpoint = (id, payload) =>
  api.patch(`/endpoints/${id}/`, payload);
export const deleteEndpoint = (id) => api.delete(`/endpoints/${id}/`);

export const sendDeviceCommand = (id, payload) =>
  api.post(`/devices/${id}/command/`, payload);

export default api;