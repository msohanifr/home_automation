import React, {
  useEffect,
  useState,
  useCallback,
  useRef,
} from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  getRooms,
  getRoomDevices,
  createDevice,
  updateRoom,
  sendDeviceCommand,
  updateDevice,
} from "../api";

/**
 * Merge a single updated device into the existing devices array.
 */
const applyDeviceUpdate = (devices, updatedDevice) => {
  const exists = devices.some((d) => d.id === updatedDevice.id);
  if (!exists) {
    // if for some reason it's new, append it
    return [...devices, updatedDevice];
  }
  return devices.map((d) =>
    d.id === updatedDevice.id ? { ...d, ...updatedDevice } : d
  );
};

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

  // WebSocket connection status: "idle" | "connecting" | "online" | "offline"
  const [wsStatus, setWsStatus] = useState("idle");
  const socketRef = useRef(null);

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
    // serializer exposes background_image_url (effective URL)
    setRoomBackgroundUrl(roomData.background_image_url || "");
    setBackgroundFile(null);
    setBackgroundPreview(roomData.background_image_url || "");
  }, []);

  /**
   * REST loader – initial snapshot and manual refresh.
   */
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

  /**
   * WebSocket: initial REST snapshot + subscribe to live updates.
   */
  useEffect(() => {
    if (!roomId) return;

    // 1) initial snapshot via REST
    load();

    // 2) open WebSocket for live updates
    const protocol = window.location.protocol === "https:" ? "wss://" : "ws://";
    const host = window.location.hostname;
    const wsUrl = `${protocol}${host}:8002/ws/rooms/${numericRoomId}/`; // adjust port/path if backend differs

    console.log("[ws] connecting to", wsUrl);
    setWsStatus("connecting");

    const socket = new WebSocket(wsUrl);
    socketRef.current = socket;

    socket.onopen = () => {
      console.log("[ws] connected");
      setWsStatus("online");
    };

    socket.onmessage = (event) => {
      console.log("[ws] message", event.data);
      try {
        const data = JSON.parse(event.data);

        if (data.type === "device_update" && data.device) {
          setDevices((prev) => applyDeviceUpdate(prev, data.device));
        }

        if (data.type === "devices_snapshot" && Array.isArray(data.devices)) {
          setDevices(data.devices);
        }
      } catch (e) {
        console.error("[ws] failed to parse message", e, event.data);
      }
    };

    socket.onerror = (event) => {
      console.error("[ws] error", event);
      setWsStatus("offline");
    };

    socket.onclose = () => {
      console.log("[ws] closed");
      setWsStatus("offline");
      socketRef.current = null;
    };

    // cleanup on room change / unmount
    return () => {
      console.log("[ws] closing socket");
      try {
        socket.close();
      } catch (e) {
        // ignore
      }
      socketRef.current = null;
    };
  }, [roomId, numericRoomId, load]);

  const handleRefreshClick = () => {
    load({ isRefresh: true });
  };

  const handleBackClick = () => {
    navigate("/");
  };

  const handleOpenDeviceSettings = (deviceId) => {
    navigate(`/devices/${deviceId}/settings`);
  };

  /* -------------------------------
   * Devices logic
   * ----------------------------- */

  const handleToggleDevice = async (device) => {
    try {
      setError("");

      // Only treat digital-like devices as toggles
      const isDigital =
        device.signal_type === "digital" ||
        device.device_type === "switch" ||
        device.device_type === "light";

      if (!isDigital) {
        // later: open a modal for analog setpoints etc.
        return;
      }

      const isOn = Boolean(device.is_on);
      const nextState = !isOn;

      // Optimistic UI update
      setDevices((prev) =>
        prev.map((d) =>
          d.id === device.id ? { ...d, is_on: nextState } : d
        )
      );

      await sendDeviceCommand(device.id, {
        state: nextState ? "on" : "off",
      });

      // Optional: keep this to force-sync from DB if needed
      await load({ isRefresh: true });
    } catch (err) {
      console.error("Toggle device error:", err);
      const detail =
        err?.data?.detail ||
        err?.response?.data?.detail ||
        "Could not toggle device.";
      setError(detail);

      // revert optimistic state
      setDevices((prev) =>
        prev.map((d) =>
          d.id === device.id ? { ...d, is_on: !d.is_on } : d
        )
      );
    }
  };

  const handleCreateDevice = async (e) => {
    e.preventDefault();
    if (!newDeviceName) return;

    try {
      setError("");

      // Map simple type selection to more detailed fields
      const deviceType = newDeviceType; // "light" | "switch" | "sensor" | ...
      const isSensor = deviceType === "sensor";
      const deviceKind = isSensor ? "sensor" : "actuator";
      const signalType = isSensor ? "analog" : "digital";

      await createDevice({
        room: numericRoomId,
        name: newDeviceName,
        device_type: deviceType,
        device_kind: deviceKind,
        signal_type: signalType,
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

  // Live preview of position while dragging
  const handleDevicePositionPreview = (deviceId, xPercent, yPercent) => {
    setDevices((prev) =>
      prev.map((d) =>
        d.id === deviceId
          ? { ...d, position_x: xPercent, position_y: yPercent }
          : d
      )
    );
  };

  // Commit position to backend when drop finishes
  const handleDevicePositionCommit = async (deviceId, xPercent, yPercent) => {
    try {
      await updateDevice(deviceId, {
        position_x: xPercent,
        position_y: yPercent,
      });
    } catch (err) {
      console.error("Update device position error:", err);
      // Optional: reload if you want to be strict
      // await load({ isRefresh: true });
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
        // ImageField on backend: background_image
        payload.append("background_image", backgroundFile);
      } else {
        // Simple JSON PATCH if no new file uploaded
        payload = {
          name: roomName,
          slug: roomSlug,
        };
      }

      const res = await updateRoom(room.id, payload);
      const updatedRoom = res.data || res;
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

  const effectiveBackgroundUrl = room?.background_image_url || "";

  const renderWsStatus = () => {
    if (wsStatus === "idle") return null;
    const label =
      wsStatus === "connecting"
        ? "Connecting…"
        : wsStatus === "online"
        ? "Live"
        : "Offline";

    const color =
      wsStatus === "online"
        ? "#22c55e"
        : wsStatus === "connecting"
        ? "#f97316"
        : "#ef4444";

    return (
      <span
        style={{
          marginLeft: 12,
          fontSize: 11,
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          color: "#6b7280",
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "999px",
            backgroundColor: color,
          }}
        />
        {label}
      </span>
    );
  };

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
          {renderWsStatus()}
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
          backgroundUrl={effectiveBackgroundUrl}
          onDevicePositionPreview={handleDevicePositionPreview}
          onDevicePositionCommit={handleDevicePositionCommit}
          onOpenDeviceSettings={handleOpenDeviceSettings}
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
  backgroundUrl,
  onDevicePositionPreview,
  onDevicePositionCommit,
  onOpenDeviceSettings,
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
            const isOn = Boolean(device.is_on);
            const labelType = device.device_type || "device";

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
                      flexWrap: "wrap",
                    }}
                  >
                    <span>{labelType}</span>
                    {device.location && <span>• {device.location}</span>}
                    {device.unit && <span>• unit: {device.unit}</span>}
                    {typeof device.last_value === "number" && (
                      <span>
                        • last: {device.last_value}
                        {device.unit ? ` ${device.unit}` : ""}
                      </span>
                    )}
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center" }}>
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
                  <button
                    type="button"
                    className="btn-outline"
                    style={{
                      fontSize: 11,
                      padding: "4px 8px",
                      marginLeft: 8,
                    }}
                    onClick={() => onOpenDeviceSettings(device.id)}
                  >
                    Settings
                  </button>
                </div>
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

      {/* Right: canvas + new device form */}
      <div className="room-canvas-wrapper">
        <div className="room-canvas-header">
          <h2 className="room-canvas-title">Room layout</h2>
        </div>

        <RoomCanvas
          devices={devices}
          backgroundUrl={backgroundUrl}
          onPositionPreview={onDevicePositionPreview}
          onPositionCommit={onDevicePositionCommit}
          onOpenDeviceSettings={onOpenDeviceSettings}
        />

        <div
          style={{
            margin: "12px 0 8px",
            fontSize: 13,
            color: "#6b7280",
          }}
        >
          Drag devices around to place them on the background. Positions
          are saved when you release the dot. Click a dot to open its
          settings.
        </div>

        <div className="room-canvas-header" style={{ marginTop: 16 }}>
          <h2 className="room-canvas-title">Add device</h2>
        </div>
        <div style={{ marginBottom: 8, fontSize: 13, color: "#6b7280" }}>
          Create devices linked to this room. You can later wire them to
          connectors and endpoints from the Device Settings page.
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
 * Room canvas (draggable devices + click → settings)
 * --------------------------------- */

const RoomCanvas = ({
  devices,
  backgroundUrl,
  onPositionPreview,
  onPositionCommit,
  onOpenDeviceSettings,
}) => {
  const containerRef = useRef(null);
  const [draggingId, setDraggingId] = useState(null);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const didMoveRef = useRef(false);

  const getPercentFromPointer = (event) => {
    if (!containerRef.current) return { x: 0, y: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    return {
      x: Math.min(100, Math.max(0, x)),
      y: Math.min(100, Math.max(0, y)),
    };
  };

  const handlePointerDown = (e, deviceId) => {
    e.preventDefault();
    setDraggingId(deviceId);
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    didMoveRef.current = false;

    const { x, y } = getPercentFromPointer(e);
    if (onPositionPreview) {
      onPositionPreview(deviceId, x, y);
    }
  };

  const handlePointerMove = (e) => {
    if (!draggingId) return;

    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    const distanceSq = dx * dx + dy * dy;

    // treat anything over ~3px as "moved"
    if (distanceSq > 9) {
      didMoveRef.current = true;
    }

    const { x, y } = getPercentFromPointer(e);
    if (onPositionPreview) {
      onPositionPreview(draggingId, x, y);
    }
  };

  const finishDrag = (e) => {
    if (!draggingId) return;
    const finalId = draggingId;
    setDraggingId(null);

    const { x, y } = getPercentFromPointer(e);
    if (onPositionPreview) {
      onPositionPreview(finalId, x, y);
    }
    if (onPositionCommit) {
      onPositionCommit(finalId, x, y);
    }

    // If user didn't really move the pointer → treat it as a click
    if (!didMoveRef.current && onOpenDeviceSettings) {
      onOpenDeviceSettings(finalId);
    }
  };

  // Map device type → color
  const getTypeColor = (deviceType) => {
    switch (deviceType) {
      case "light":
        return "#facc15"; // warm yellow
      case "switch":
        return "#38bdf8"; // sky
      case "sensor":
        return "#22c55e"; // green
      case "thermostat":
        return "#f97316"; // orange
      case "camera":
        return "#a855f7"; // purple
      default:
        return "#6b7280"; // gray
    }
  };

  // Optional: short tag text for type
  const getTypeTag = (deviceType) => {
    switch (deviceType) {
      case "light":
        return "LGT";
      case "switch":
        return "SW";
      case "sensor":
        return "SNS";
      case "thermostat":
        return "TH";
      case "camera":
        return "CAM";
      default:
        return "";
    }
  };

  return (
    <div
      ref={containerRef}
      className="room-canvas"
      style={{
        backgroundImage: backgroundUrl
          ? `url(${backgroundUrl})`
          : "radial-gradient(circle at top, #e5e7eb 0, #f9fafb 55%)",
        backgroundSize: backgroundUrl ? "cover" : "auto",
        backgroundPosition: "center",
        position: "relative",
        minHeight: 260,
        borderRadius: 12,
        border: "1px solid #e5e7eb",
        overflow: "hidden",
        touchAction: "none",
      }}
      onPointerMove={handlePointerMove}
      onPointerUp={finishDrag}
      onPointerLeave={finishDrag}
    >
      {devices.map((device) => {
        const left = device.position_x ?? 10;
        const top = device.position_y ?? 10;
        const isOn = Boolean(device.is_on);
        const typeColor = getTypeColor(device.device_type);
        const typeTag = getTypeTag(device.device_type);

        return (
          <div
            key={device.id}
            className="room-device-dot"
            style={{
              position: "absolute",
              left: `${left}%`,
              top: `${top}%`,
              transform: "translate(-50%, -50%)",
              cursor: "grab",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
            onPointerDown={(e) => handlePointerDown(e, device.id)}
          >
            {/* Dot */}
            <div
              className="room-device-dot-inner"
              style={{
                width: 18,
                height: 18,
                borderRadius: "999px",
                border: `2px solid ${typeColor}`,
                backgroundColor: isOn ? typeColor : "#f9fafb",
                boxShadow:
                  draggingId === device.id
                    ? "0 0 0 3px rgba(59,130,246,0.4)"
                    : "0 1px 2px rgba(15,23,42,0.18)",
              }}
              title={device.name}
            />

            {/* Label pill */}
            <div
              style={{
                padding: "2px 8px",
                borderRadius: 999,
                fontSize: 11,
                background: "rgba(15,23,42,0.80)",
                color: "#f9fafb",
                display: "flex",
                alignItems: "center",
                gap: 6,
                maxWidth: 140,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {typeTag && (
                <span
                  style={{
                    fontWeight: 600,
                    fontSize: 10,
                    padding: "1px 5px",
                    borderRadius: 999,
                    background: "rgba(15,23,42,0.95)",
                    border: `1px solid ${typeColor}`,
                  }}
                >
                  {typeTag}
                </span>
              )}
              <span>{device.name}</span>
            </div>
          </div>
        );
      })}

      {!devices.length && (
        <p
          style={{
            fontSize: 12,
            color: "#6b7280",
            padding: 12,
          }}
        >
          Devices will appear here once added. Drag dots to reposition them on
          the room background, or click a dot to open its settings.
        </p>
      )}
    </div>
  );
};

export default RoomPage;