import React, { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  getDevice,
  updateDeviceDetails,
  getConnectors,
  createEndpoint,
  deleteEndpoint,
} from "../api";

const DEVICE_TYPES = [
  { value: "sensor", label: "Sensor" },
  { value: "light", label: "Light" },
  { value: "switch", label: "Switch" },
  { value: "thermostat", label: "Thermostat" },
  { value: "camera", label: "Camera" },
];

const DEVICE_KINDS = [
  { value: "sensor", label: "Sensor (input)" },
  { value: "actuator", label: "Actuator (output)" },
  { value: "hybrid", label: "Hybrid (both)" },
];

const SIGNAL_TYPES = [
  { value: "analog", label: "Analog" },
  { value: "digital", label: "Digital / Boolean" },
  { value: "string", label: "String" },
];

const DeviceSettingsPage = () => {
  const { deviceId } = useParams();
  const navigate = useNavigate();
  const numericDeviceId = Number(deviceId);

  const [device, setDevice] = useState(null);
  const [connectors, setConnectors] = useState([]);

  const [loading, setLoading] = useState(true);
  const [savingDevice, setSavingDevice] = useState(false);
  const [savingEndpoint, setSavingEndpoint] = useState(false);
  const [error, setError] = useState("");

  // Device form state
  const [name, setName] = useState("");
  const [deviceType, setDeviceType] = useState("sensor");
  const [deviceKind, setDeviceKind] = useState("sensor");
  const [signalType, setSignalType] = useState("analog");
  const [unit, setUnit] = useState("");
  const [minValue, setMinValue] = useState("");
  const [maxValue, setMaxValue] = useState("");
  const [decimalPlaces, setDecimalPlaces] = useState(1);
  const [isPercentage, setIsPercentage] = useState(false);
  const [location, setLocation] = useState("");

  // New endpoint form
  const [endpointConnectorId, setEndpointConnectorId] = useState("");
  const [endpointDirection, setEndpointDirection] = useState("input");
  const [endpointAddress, setEndpointAddress] = useState("");
  const [endpointScale, setEndpointScale] = useState("1.0");
  const [endpointOffset, setEndpointOffset] = useState("0.0");
  const [endpointTrueValue, setEndpointTrueValue] = useState("1");
  const [endpointFalseValue, setEndpointFalseValue] = useState("0");
  const [endpointIsPrimary, setEndpointIsPrimary] = useState(true);

  const syncDeviceForm = useCallback((d) => {
    if (!d) return;
    setName(d.name || "");
    setDeviceType(d.device_type || "sensor");
    setDeviceKind(d.device_kind || "sensor");
    setSignalType(d.signal_type || "analog");
    setUnit(d.unit || "");
    setMinValue(
      typeof d.min_value === "number" ? String(d.min_value) : ""
    );
    setMaxValue(
      typeof d.max_value === "number" ? String(d.max_value) : ""
    );
    setDecimalPlaces(d.decimal_places ?? 1);
    setIsPercentage(Boolean(d.is_percentage));
    setLocation(d.location || "");
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [deviceRes, connectorsRes] = await Promise.all([
        getDevice(numericDeviceId),
        getConnectors(),
      ]);
      const d = deviceRes.data;
      setDevice(d);
      syncDeviceForm(d);
      setConnectors(connectorsRes.data || []);
    } catch (err) {
      console.error("Device settings load error:", err);
      const status = err?.status || err?.response?.status;
      if (status === 401 || status === 403) {
        navigate("/login");
        return;
      }
      const detail =
        err?.data?.detail ||
        err?.response?.data?.detail ||
        "Failed to load device settings.";
      setError(detail);
    } finally {
      setLoading(false);
    }
  }, [numericDeviceId, navigate, syncDeviceForm]);

  useEffect(() => {
    if (!deviceId) return;
    load();
  }, [deviceId, load]);

  const handleBackClick = () => {
    if (device && device.room && device.room.id) {
      navigate(`/rooms/${device.room.id}`);
    } else {
      navigate("/");
    }
  };

  const handleSaveDevice = async (e) => {
    e.preventDefault();
    if (!device) return;

    setSavingDevice(true);
    setError("");
    try {
      const payload = {
        name,
        device_type: deviceType,
        device_kind: deviceKind,
        signal_type: signalType,
        unit,
        min_value: minValue === "" ? null : parseFloat(minValue),
        max_value: maxValue === "" ? null : parseFloat(maxValue),
        decimal_places: Number(decimalPlaces),
        is_percentage: isPercentage,
        location,
      };

      const res = await updateDeviceDetails(device.id, payload);
      const updated = res.data || res;
      setDevice(updated);
      syncDeviceForm(updated);
    } catch (err) {
      console.error("Save device error:", err);
      const detail =
        err?.data?.detail ||
        err?.response?.data?.detail ||
        "Could not save device settings.";
      setError(detail);
    } finally {
      setSavingDevice(false);
    }
  };

  const handleAddEndpoint = async (e) => {
    e.preventDefault();
    if (!device) return;
    if (!endpointConnectorId || !endpointAddress) return;

    setSavingEndpoint(true);
    setError("");
    try {
      await createEndpoint({
        device: device.id,
        connector_id: endpointConnectorId,
        direction: endpointDirection,
        address: endpointAddress,
        scale: parseFloat(endpointScale || "1.0"),
        offset: parseFloat(endpointOffset || "0.0"),
        true_value: endpointTrueValue,
        false_value: endpointFalseValue,
        is_primary: endpointIsPrimary,
      });

      // Reset form a bit
      setEndpointAddress("");
      setEndpointScale("1.0");
      setEndpointOffset("0.0");

      // Reload to get updated endpoint list
      await load();
    } catch (err) {
      console.error("Create endpoint error:", err);
      const detail =
        err?.data?.detail ||
        err?.response?.data?.detail ||
        "Could not create endpoint.";
      setError(detail);
    } finally {
      setSavingEndpoint(false);
    }
  };

  const handleDeleteEndpoint = async (endpointId) => {
    if (!window.confirm("Delete this endpoint?")) return;
    setError("");
    try {
      await deleteEndpoint(endpointId);
      await load();
    } catch (err) {
      console.error("Delete endpoint error:", err);
      const detail =
        err?.data?.detail ||
        err?.response?.data?.detail ||
        "Could not delete endpoint.";
      setError(detail);
    }
  };

  const title = device ? `Device settings: ${device.name}` : "Device settings";

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
            ← Back to room
          </button>
          <h1 className="dashboard-title">{title}</h1>
          <p className="dashboard-subtitle">
            Configure how this device behaves as a sensor or actuator, and how
            it connects to MQTT, PLCs, or other systems.
          </p>
          {loading && (
            <p style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
              Loading device…
            </p>
          )}
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

      {!loading && device && (
        <section className="rooms-section">
          {/* Left: device metadata / behavior */}
          <div className="rooms-list">
            <div className="rooms-list-header">
              <h2 className="rooms-list-title">Device behavior</h2>
            </div>

            <form onSubmit={handleSaveDevice}>
              <div className="login-form-group">
                <label className="login-label">Name</label>
                <input
                  className="login-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Living room temperature"
                />
              </div>

              <div className="login-form-group">
                <label className="login-label">Device type</label>
                <select
                  className="login-input"
                  value={deviceType}
                  onChange={(e) => setDeviceType(e.target.value)}
                >
                  {DEVICE_TYPES.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="login-form-group">
                <label className="login-label">Kind</label>
                <select
                  className="login-input"
                  value={deviceKind}
                  onChange={(e) => setDeviceKind(e.target.value)}
                >
                  {DEVICE_KINDS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="login-form-group">
                <label className="login-label">Signal type</label>
                <select
                  className="login-input"
                  value={signalType}
                  onChange={(e) => setSignalType(e.target.value)}
                >
                  {SIGNAL_TYPES.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="login-form-group">
                <label className="login-label">Unit</label>
                <input
                  className="login-input"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  placeholder="°C, %, bar"
                />
              </div>

              <div className="login-form-group">
                <label className="login-label">Engineering range</label>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    className="login-input"
                    style={{ flex: 1 }}
                    value={minValue}
                    onChange={(e) => setMinValue(e.target.value)}
                    placeholder="Min"
                  />
                  <input
                    className="login-input"
                    style={{ flex: 1 }}
                    value={maxValue}
                    onChange={(e) => setMaxValue(e.target.value)}
                    placeholder="Max"
                  />
                </div>
              </div>

              <div className="login-form-group">
                <label className="login-label">Decimal places</label>
                <input
                  type="number"
                  className="login-input"
                  value={decimalPlaces}
                  min={0}
                  max={4}
                  onChange={(e) =>
                    setDecimalPlaces(Number(e.target.value || 0))
                  }
                />
              </div>

              <div className="login-form-group">
                <label className="login-label">Location</label>
                <input
                  className="login-input"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Near window, ceiling, etc."
                />
              </div>

              <div className="login-form-group">
                <label className="login-label">
                  <input
                    type="checkbox"
                    checked={isPercentage}
                    onChange={(e) => setIsPercentage(e.target.checked)}
                    style={{ marginRight: 8 }}
                  />
                  Treat value as percentage (0–100%)
                </label>
              </div>

              <button
                className="btn-primary"
                type="submit"
                disabled={savingDevice}
              >
                {savingDevice ? "Saving…" : "Save device"}
              </button>
            </form>
          </div>

          {/* Right: endpoints / connections */}
          <div className="room-canvas-wrapper">
            <div className="room-canvas-header">
              <h2 className="room-canvas-title">Connections</h2>
            </div>
            <div style={{ marginBottom: 8, fontSize: 13, color: "#6b7280" }}>
              Bind this device to MQTT topics, PLC tags, or API paths via
              connectors. Inputs are sensors, outputs are actuators.
            </div>

            {/* Existing endpoints */}
            <div className="rooms-list-items" style={{ marginBottom: 12 }}>
              {(device.endpoints || []).map((ep) => (
                <div key={ep.id} className="room-pill">
                  <div style={{ flex: 1 }}>
                    <div className="room-pill-name">
                      {ep.direction === "input" ? "Input" : "Output"} @{" "}
                      {ep.address}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: "#6b7280",
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 8,
                      }}
                    >
                      <span>{ep.connector?.name}</span>
                      <span>
                        scale={ep.scale}, offset={ep.offset}
                      </span>
                      {ep.true_value && ep.false_value && (
                        <span>
                          true={ep.true_value}, false={ep.false_value}
                        </span>
                      )}
                      {ep.is_primary && <span>• primary</span>}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="device-toggle"
                    onClick={() => handleDeleteEndpoint(ep.id)}
                  >
                    Delete
                  </button>
                </div>
              ))}

              {!device.endpoints?.length && (
                <p style={{ fontSize: 12, color: "#6b7280" }}>
                  No endpoints yet. Add one below to wire this device to a
                  connector.
                </p>
              )}
            </div>

            {/* New endpoint form */}
            <form onSubmit={handleAddEndpoint}>
              <div className="login-form-group">
                <label className="login-label">Connector</label>
                <select
                  className="login-input"
                  value={endpointConnectorId}
                  onChange={(e) => setEndpointConnectorId(e.target.value)}
                >
                  <option value="">Select a connector…</option>
                  {connectors.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.connector_type})
                    </option>
                  ))}
                </select>
              </div>

              <div className="login-form-group">
                <label className="login-label">Direction</label>
                <select
                  className="login-input"
                  value={endpointDirection}
                  onChange={(e) => setEndpointDirection(e.target.value)}
                >
                  <option value="input">Input (Sensor)</option>
                  <option value="output">Output (Actuator)</option>
                </select>
              </div>

              <div className="login-form-group">
                <label className="login-label">Address</label>
                <input
                  className="login-input"
                  value={endpointAddress}
                  onChange={(e) => setEndpointAddress(e.target.value)}
                  placeholder="MQTT topic, PLC tag, OPC UA node, API path…"
                />
              </div>

              <div className="login-form-group">
                <label className="login-label">Scaling</label>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    className="login-input"
                    style={{ flex: 1 }}
                    value={endpointScale}
                    onChange={(e) => setEndpointScale(e.target.value)}
                    placeholder="Scale (default 1.0)"
                  />
                  <input
                    className="login-input"
                    style={{ flex: 1 }}
                    value={endpointOffset}
                    onChange={(e) => setEndpointOffset(e.target.value)}
                    placeholder="Offset (default 0.0)"
                  />
                </div>
              </div>

              <div className="login-form-group">
                <label className="login-label">
                  Boolean mapping (for digital signals)
                </label>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    className="login-input"
                    style={{ flex: 1 }}
                    value={endpointTrueValue}
                    onChange={(e) => setEndpointTrueValue(e.target.value)}
                    placeholder="True value (e.g. '1' or 'ON')"
                  />
                  <input
                    className="login-input"
                    style={{ flex: 1 }}
                    value={endpointFalseValue}
                    onChange={(e) => setEndpointFalseValue(e.target.value)}
                    placeholder="False value (e.g. '0' or 'OFF')"
                  />
                </div>
              </div>

              <div className="login-form-group">
                <label className="login-label">
                  <input
                    type="checkbox"
                    checked={endpointIsPrimary}
                    onChange={(e) => setEndpointIsPrimary(e.target.checked)}
                    style={{ marginRight: 8 }}
                  />
                  Mark as primary endpoint
                </label>
              </div>

              <button
                className="btn-outline"
                type="submit"
                disabled={savingEndpoint}
              >
                {savingEndpoint ? "Adding…" : "Add endpoint"}
              </button>
            </form>
          </div>
        </section>
      )}
    </div>
  );
};

export default DeviceSettingsPage;