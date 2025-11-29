import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  getSummary,
  getRooms,
  createRoom,
  getIntegrations,
  createIntegration,
} from "../api";

const DashboardPage = () => {
  const [summary, setSummary] = useState(null);
  const [rooms, setRooms] = useState([]);
  const [integrations, setIntegrations] = useState([]);
  const [newRoomName, setNewRoomName] = useState("");
  const [newRoomSlug, setNewRoomSlug] = useState("");
  const [newRoomBackground, setNewRoomBackground] = useState("");
  const [newIntegrationProvider, setNewIntegrationProvider] =
    useState("google_home");
  const [newIntegrationName, setNewIntegrationName] = useState("");

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const navigate = useNavigate();

  const load = useCallback(async (opts = { isRefresh: false }) => {
    const { isRefresh } = opts;
    setError("");

    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const [summaryRes, roomsRes, integrationsRes] = await Promise.all([
        getSummary(),
        getRooms(),
        getIntegrations(),
      ]);

      // axios style: response.data
      setSummary(summaryRes.data);
      setRooms(roomsRes.data);
      setIntegrations(integrationsRes.data);
    } catch (err) {
      console.error("Dashboard load error:", err);

      const status = err?.status || err?.response?.status;

      if (status === 401 || status === 403) {
        // Not authenticated → send to login
        navigate("/login");
        return;
      }

      const detail =
        err?.data?.detail ||
        err?.response?.data?.detail ||
        "Failed to load dashboard data.";
      setError(detail);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [navigate]);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreateRoom = async (e) => {
    e.preventDefault();
    if (!newRoomName || !newRoomSlug) return;

    try {
      setError("");
      await createRoom({
        name: newRoomName,
        slug: newRoomSlug,
        background_image_url: newRoomBackground || null,
      });
      setNewRoomName("");
      setNewRoomSlug("");
      setNewRoomBackground("");
      await load({ isRefresh: true });
    } catch (err) {
      console.error("Create room error:", err);
      const detail =
        err?.data?.detail ||
        err?.response?.data?.detail ||
        "Could not create room.";
      setError(detail);
    }
  };

  const handleCreateIntegration = async (e) => {
    e.preventDefault();
    if (!newIntegrationName) return;

    try {
      setError("");
      await createIntegration({
        provider: newIntegrationProvider,
        display_name: newIntegrationName,
        access_token: "",
        refresh_token: "",
        metadata: {},
      });
      setNewIntegrationName("");
      await load({ isRefresh: true });
    } catch (err) {
      console.error("Create integration error:", err);
      const detail =
        err?.data?.detail ||
        err?.response?.data?.detail ||
        "Could not create integration.";
      setError(detail);
    }
  };

  const handleRefreshClick = () => {
    load({ isRefresh: true });
  };

  const roomsCount = summary?.rooms ?? rooms.length ?? 0;
  const devicesCount = summary?.devices ?? 0;
  const onDevicesCount = summary?.on_devices ?? 0;

  return (
    <>
      <header className="dashboard-header">
        <div>
          <h1 className="dashboard-title">Welcome home</h1>
          <p className="dashboard-subtitle">
            Overview of your rooms, scenes and integrations. Stay logged in
            until you choose to log out.
          </p>
          {loading && (
            <p style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
              Loading your home data…
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

      <section className="cards-grid">
        <article className="card">
          <h3 className="card-title">Rooms</h3>
          <p className="card-value">{roomsCount}</p>
          <div className="card-pill">Dynamic layout</div>
        </article>
        <article className="card">
          <h3 className="card-title">Devices</h3>
          <p className="card-value">{devicesCount}</p>
          <div className="card-pill">
            <span>{onDevicesCount} online</span>
          </div>
        </article>
        <article className="card">
          <h3 className="card-title">Integrations</h3>
          <p className="card-value">{integrations.length}</p>
          <div className="card-pill">
            Connect Google Home, Nest, Ring
          </div>
        </article>
      </section>

      <section className="rooms-section">
        <div className="rooms-list">
          <div className="rooms-list-header">
            <h2 className="rooms-list-title">Rooms</h2>
          </div>
          <div className="rooms-list-items">
            {rooms.map((room) => (
              <div
                key={room.id}
                className="room-pill"
                onClick={() => navigate(`/rooms/${room.id}`)}
              >
                <span className="room-pill-name">{room.name}</span>
                <span>{room.slug}</span>
              </div>
            ))}
            {!loading && rooms.length === 0 && (
              <p style={{ fontSize: 12, color: "#6b7280" }}>
                No rooms yet. Create your first room using the form below.
              </p>
            )}
          </div>
          <form onSubmit={handleCreateRoom} style={{ marginTop: 12 }}>
            <div className="login-form-group">
              <label className="login-label">Room name</label>
              <input
                className="login-input"
                value={newRoomName}
                onChange={(e) => setNewRoomName(e.target.value)}
                placeholder="Living Room"
                disabled={loading}
              />
            </div>
            <div className="login-form-group">
              <label className="login-label">Room slug</label>
              <input
                className="login-input"
                value={newRoomSlug}
                onChange={(e) => setNewRoomSlug(e.target.value)}
                placeholder="living-room"
                disabled={loading}
              />
            </div>
            <div className="login-form-group">
              <label className="login-label">
                Background image URL (optional)
              </label>
              <input
                className="login-input"
                value={newRoomBackground}
                onChange={(e) => setNewRoomBackground(e.target.value)}
                placeholder="https://..."
                disabled={loading}
              />
            </div>
            <button className="btn-primary" type="submit" disabled={loading}>
              Add room
            </button>
          </form>
        </div>

        <div className="room-canvas-wrapper">
          <div className="room-canvas-header">
            <h2 className="room-canvas-title">Integrations</h2>
          </div>
          <div style={{ marginBottom: 8, fontSize: 13, color: "#6b7280" }}>
            Manage connections to Google Home, Nest, Ring and other home
            platforms. This example stores credentials and metadata; you can
            extend backend views to call vendor APIs.
          </div>
          <div className="rooms-list-items" style={{ marginBottom: 12 }}>
            {integrations.map((i) => (
              <div key={i.id} className="room-pill">
                <span className="room-pill-name">{i.display_name}</span>
                <span>{i.provider}</span>
              </div>
            ))}
            {!loading && integrations.length === 0 && (
              <p style={{ fontSize: 12, color: "#6b7280" }}>
                No integrations yet.
              </p>
            )}
          </div>
          <form onSubmit={handleCreateIntegration}>
            <div className="login-form-group">
              <label className="login-label">Provider</label>
              <select
                className="login-input"
                value={newIntegrationProvider}
                onChange={(e) => setNewIntegrationProvider(e.target.value)}
                disabled={loading}
              >
                <option value="google_home">Google Home</option>
                <option value="nest">Nest</option>
                <option value="ring">Ring</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className="login-form-group">
              <label className="login-label">Display name</label>
              <input
                className="login-input"
                value={newIntegrationName}
                onChange={(e) => setNewIntegrationName(e.target.value)}
                placeholder="Living room Nest"
                disabled={loading}
              />
            </div>
            <button className="btn-outline" type="submit" disabled={loading}>
              Add integration
            </button>
          </form>
        </div>
      </section>
    </>
  );
};

export default DashboardPage;