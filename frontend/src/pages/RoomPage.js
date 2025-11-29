import React, { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  getRooms,
  getRoomDevices,
  createDevice,
  updateDevice,
  // ⬇️ you'll add this in api.js
  updateRoom,
} from "../api";

const RoomPage = () => {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const numericRoomId = Number(roomId);

  const [room, setRoom] = useState(null);
  const [devices, setDevices] = useState([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  // Tabs: "devices" | "settings"
  const [activeTab, setActiveTab] = useState("devices");

  // New device form
  const [newDeviceName, setNewDeviceName] = useState("");
  const [newDeviceType, setNewDeviceType] = useState("light");
  const [newDeviceLocation, setNewDeviceLocation] = useState("");

  // Room settings form
  const [roomName, setRoomName] = useState("");
  const [roomSlug, setRoomSlug] = useState("");
  const [roomBackgroundUrl, setRoomBackgroundUrl] = useState("");
  const [backgroundFile, setBackgroundFile] = useState(null);
  const [backgroundPreview, setBackgroundPreview] = useState("");

  const syncRoomForm = useCallback((roomData) => {
    if (!roomData) return;
    setRoomName(roomData.name || "");
    setRoomSlug(roomData.slug || "");
    setRoomBackgroundUrl(roomData.background_image_url || "");
    setBackgroundFile(null);
    setBackgroundPreview(roomData.background_image_url || "");
  }, []);

  const load = useCallback(
    async (opts = { isRefresh: false }) => {
      const { isRefresh } = opts;
      setError("");

      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      try {
        const [roomsRes, devicesRes] = await Promise.all([
          getRooms(),
          getRoomDevices(numericRoomId),
        ]);

        const rooms = roomsRes.data || [];
        const devicesData = devicesRes.data || [];

        const foundRoom =
          rooms.find((r) => r.id === numericRoomId) || null;

        if (!foundRoom) {
          setError("Room not found.");
        }

        setRoom(foundRoom);
        syncRoomForm(foundRoom);
        setDevices(devicesData);
      } catch (err) {
        console.error("Room load error:", err);
        const status = err?.status || err?.response?.status;
        if (status === 401 || status === 403) {
          navigate("/login");
          return;
        }

        const detail =
          err?.data?.detail ||
          err?.response?.data?.detail ||
          "Failed to load room data.";
        setError(detail);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [numericRoomId, navigate, syncRoomForm]
  );

  useEffect(() => {
    if (!roomId) return;
    load();
  }, [roomId, load]);

  const handleRefreshClick = () => {
    load({ isRefresh: true });
  };

  const handleBackClick = () => {
    navigate("/");
  };

  /* -------------------------------
   * Devices logic
   * ----------------------------- */

  const handleToggleDevice = async (device) => {
    try {
      setError("");
      const isOn = device.is_on ?? device.on ?? false;
      const nextState = !isOn;

      await updateDevice(device.id, { is_on: nextState });

      setDevices((prev) =>
        prev.map((d) =>
          d.id === device.id ? { ...d, is_on: nextState } : d
        )
      );
    } catch (err) {
      console.error("Toggle device error:", err);
      const detail =
        err?.data?.detail ||
        err?.response?.data?.detail ||
        "Could not toggle device.";
      setError(detail);
    }
  };

  const handleCreateDevice = async (e) => {
    e.preventDefault();
    if (!newDeviceName) return;

    try {
      setError("");
      await createDevice({
        name: newDeviceName,
        type: newDeviceType,
        room: numericRoomId,
        location: newDeviceLocation || "",
        is_on: false,
      });

      setNewDeviceName("");
      setNewDeviceType("light");
      setNewDeviceLocation("");
      await load({ isRefresh: true });
    } catch (err) {
      console.error("Create device error:", err);
      const detail =
        err?.data?.detail ||
        err?.response?.data?.detail ||
        "Could not create device.";
      setError(detail);
    }
  };

  /* -------------------------------
   * Room settings logic
   * ----------------------------- */

  const handleBackgroundFileChange = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) {
      setBackgroundFile(null);
      setBackgroundPreview(roomBackgroundUrl || "");
      return;
    }

    setBackgroundFile(file);

    // local preview
    const reader = new FileReader();
    reader.onload = (evt) => {
      setBackgroundPreview(evt.target.result);
    };
    reader.readAsDataURL(file);
  };

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    if (!room) return;

    try {
      setError("");

      // If there is a file → use multipart FormData
      let payload;
      if (backgroundFile) {
        payload = new FormData();
        payload.append("name", roomName);
        payload.append("slug", roomSlug);
        // Backend should expose an ImageField, e.g. `background_image`
        payload.append("background_image", backgroundFile);
      } else {
        // Simple JSON PATCH if no new file uploaded
        payload = {
          name: roomName,
          slug: roomSlug,
        };
      }

      const res = await updateRoom(room.id, payload);
      const updatedRoom = res.data || res; // depending on backend
      setRoom(updatedRoom);
      syncRoomForm(updatedRoom);
    } catch (err) {
      console.error("Update room error:", err);
      const detail =
        err?.data?.detail ||
        err?.response?.data?.detail ||
        "Could not save room settings.";
      setError(detail);
    }
  };

  const title = room?.name || `Room #${roomId}`;
  const subtitle =
    room?.slug ||
    "Control devices in this room. Toggle lights, switches and more.";

  return (
    <div className="room-page">
      <header className="dashboard-header">
        <div>
          <button
            type="button"
            onClick={handleBackClick}
            className="btn-link"
            style={{ marginBottom: 8 }}
          >
            ← Back to dashboard
          </button>
          <h1 className="dashboard-title">{title}</h1>
          <p className="dashboard-subtitle">{subtitle}</p>
          {loading && (
            <p style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
              Loading room and devices…
            </p>
          )}
        </div>
        <div className="dashboard-actions">
          <button
            className="btn-outline"
            type="button"
            onClick={handleRefreshClick}
            disabled={loading || refreshing}
          >
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </header>

      {error && (
        <div
          style={{
            marginBottom: 16,
            padding: 12,
            borderRadius: 6,
            background: "#fef2f2",
            color: "#b91c1c",
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}

      {/* Tabs: Devices / Settings */}
      <div className="room-tabs">
        <button
          type="button"
          className={
            activeTab === "devices"
              ? "room-tab room-tab-active"
              : "room-tab"
          }
          onClick={() => setActiveTab("devices")}
        >
          Devices
        </button>
        <button
          type="button"
          className={
            activeTab === "settings"
              ? "room-tab room-tab-active"
              : "room-tab"
          }
          onClick={() => setActiveTab("settings")}
        >
          Settings
        </button>
      </div>

      {/* Tab content */}
      {activeTab === "devices" ? (
        <RoomDevicesView
          devices={devices}
          loading={loading}
          newDeviceName={newDeviceName}
          newDeviceType={newDeviceType}
          newDeviceLocation={newDeviceLocation}
          setNewDeviceName={setNewDeviceName}
          setNewDeviceType={setNewDeviceType}
          setNewDeviceLocation={setNewDeviceLocation}
          onToggleDevice={handleToggleDevice}
          onCreateDevice={handleCreateDevice}
        />
      ) : (
        <RoomSettingsView
          roomName={roomName}
          roomSlug={roomSlug}
          backgroundPreview={backgroundPreview}
          onRoomNameChange={setRoomName}
          onRoomSlugChange={setRoomSlug}
          onBackgroundFileChange={handleBackgroundFileChange}
          onSave={handleSaveSettings}
          loading={loading}
        />
      )}
    </div>
  );
};

/* -----------------------------------
 * Devices tab component
 * --------------------------------- */

const RoomDevicesView = ({
  devices,
  loading,
  newDeviceName,
  newDeviceType,
  newDeviceLocation,
  setNewDeviceName,
  setNewDeviceType,
  setNewDeviceLocation,
  onToggleDevice,
  onCreateDevice,
}) => {
  return (
    <section className="rooms-section">
      {/* Left: devices list */}
      <div className="rooms-list">
        <div className="rooms-list-header">
          <h2 className="rooms-list-title">Devices</h2>
        </div>

        <div className="rooms-list-items">
          {devices.map((device) => {
            const isOn = device.is_on ?? device.on ?? false;
            return (
              <div key={device.id} className="room-pill">
                <div style={{ flex: 1 }}>
                  <div className="room-pill-name">{device.name}</div>
                  <div
                    style={{
                      fontSize: 12,
                      color: "#6b7280",
                      display: "flex",
                      gap: 8,
                    }}
                  >
                    <span>{device.type || "device"}</span>
                    {device.location && (
                      <span>• {device.location}</span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  className={
                    isOn
                      ? "device-toggle device-toggle-on"
                      : "device-toggle"
                  }
                  onClick={() => onToggleDevice(device)}
                >
                  {isOn ? "On" : "Off"}
                </button>
              </div>
            );
          })}

          {!loading && devices.length === 0 && (
            <p style={{ fontSize: 12, color: "#6b7280" }}>
              No devices yet. Add your first device using the form on the
              right.
            </p>
          )}
        </div>
      </div>

      {/* Right: new device form */}
      <div className="room-canvas-wrapper">
        <div className="room-canvas-header">
          <h2 className="room-canvas-title">Add device</h2>
        </div>
        <div style={{ marginBottom: 8, fontSize: 13, color: "#6b7280" }}>
          Create devices linked to this room. In a real setup, you would attach
          vendor IDs (Google Home, Nest, Ring) and control state via backend
          integrations.
        </div>

        <form onSubmit={onCreateDevice}>
          <div className="login-form-group">
            <label className="login-label">Name</label>
            <input
              className="login-input"
              value={newDeviceName}
              onChange={(e) => setNewDeviceName(e.target.value)}
              placeholder="Ceiling light"
              disabled={loading}
            />
          </div>

          <div className="login-form-group">
            <label className="login-label">Type</label>
            <select
              className="login-input"
              value={newDeviceType}
              onChange={(e) => setNewDeviceType(e.target.value)}
              disabled={loading}
            >
              <option value="light">Light</option>
              <option value="switch">Switch</option>
              <option value="sensor">Sensor</option>
              <option value="thermostat">Thermostat</option>
              <option value="camera">Camera</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div className="login-form-group">
            <label className="login-label">Location (optional)</label>
            <input
              className="login-input"
              value={newDeviceLocation}
              onChange={(e) => setNewDeviceLocation(e.target.value)}
              placeholder="Near window"
              disabled={loading}
            />
          </div>

          <button className="btn-primary" type="submit" disabled={loading}>
            Add device
          </button>
        </form>
      </div>
    </section>
  );
};

/* -----------------------------------
 * Settings tab component
 * --------------------------------- */

const RoomSettingsView = ({
  roomName,
  roomSlug,
  backgroundPreview,
  onRoomNameChange,
  onRoomSlugChange,
  onBackgroundFileChange,
  onSave,
  loading,
}) => {
  return (
    <section className="rooms-section">
      <div className="rooms-list">
        <div className="rooms-list-header">
          <h2 className="rooms-list-title">Room settings</h2>
        </div>
        <form onSubmit={onSave}>
          <div className="login-form-group">
            <label className="login-label">Room name</label>
            <input
              className="login-input"
              value={roomName}
              onChange={(e) => onRoomNameChange(e.target.value)}
              placeholder="Living Room"
              disabled={loading}
            />
          </div>
          <div className="login-form-group">
            <label className="login-label">Room slug</label>
            <input
              className="login-input"
              value={roomSlug}
              onChange={(e) => onRoomSlugChange(e.target.value)}
              placeholder="living-room"
              disabled={loading}
            />
          </div>

          <button className="btn-primary" type="submit" disabled={loading}>
            Save settings
          </button>
        </form>
      </div>

      <div className="room-canvas-wrapper">
        <div className="room-canvas-header">
          <h2 className="room-canvas-title">Background</h2>
        </div>
        <div style={{ marginBottom: 8, fontSize: 13, color: "#6b7280" }}>
          Upload a background image for this room. The image can be used in
          your UI to render a hero or thumbnail for the room.
        </div>

        {backgroundPreview && (
          <div
            style={{
              marginBottom: 12,
              borderRadius: 8,
              overflow: "hidden",
              border: "1px solid #e5e7eb",
            }}
          >
            <img
              src={backgroundPreview}
              alt="Room background preview"
              style={{ width: "100%", display: "block", maxHeight: 220, objectFit: "cover" }}
            />
          </div>
        )}

        <div className="login-form-group">
          <label className="login-label">Upload new background</label>
          <input
            type="file"
            accept="image/*"
            onChange={onBackgroundFileChange}
            disabled={loading}
          />
        </div>
      </div>
    </section>
  );
};

export default RoomPage;