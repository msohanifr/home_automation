from django.conf import settings
from django.db import models


class Room(models.Model):
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="rooms",
    )
    name = models.CharField(max_length=100)
    slug = models.SlugField(max_length=120)

    # Actual image field for uploaded backgrounds
    background_image = models.ImageField(
        upload_to="room_backgrounds/",
        blank=True,
        null=True,
        help_text="Uploaded background image for this room.",
    )

    # Optional external URL for a background image (legacy / external)
    background_image_url = models.URLField(
        blank=True,
        help_text=(
            "Optional external URL for a background image. "
            "Prefer using the uploaded background_image field."
        ),
    )

    # Extra useful metadata
    description = models.CharField(
        max_length=255,
        blank=True,
        help_text="Optional short description, e.g. 'Main family room'.",
    )
    is_active = models.BooleanField(
        default=True,
        help_text="Soft-disable a room without deleting it.",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("owner", "slug")
        ordering = ["name"]
        indexes = [
            models.Index(fields=["owner", "slug"]),
            models.Index(fields=["owner", "created_at"]),
        ]

    def __str__(self):
        return f"{self.name} ({self.owner})"

    @property
    def effective_background_url(self):
        """
        Prefer the uploaded image URL if present, otherwise fall back to
        background_image_url. The serializer can expose this as background_image_url.
        """
        if self.background_image and hasattr(self.background_image, "url"):
            return self.background_image.url
        return self.background_image_url or None


class Integration(models.Model):
    """
    High-level cloud/provider integration: Google Home, Nest, Ring, etc.
    These are good for OAuth, API keys, etc.
    """
    PROVIDER_CHOICES = [
        ("google_home", "Google Home"),
        ("nest", "Nest"),
        ("ring", "Ring"),
        ("other", "Other"),
    ]

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="integrations",
    )
    provider = models.CharField(max_length=32, choices=PROVIDER_CHOICES)
    display_name = models.CharField(max_length=100)

    access_token = models.CharField(
        max_length=255,
        blank=True,
        help_text="OAuth or API token for the provider.",
    )
    refresh_token = models.CharField(
        max_length=255,
        blank=True,
        help_text="Refresh token if applicable.",
    )

    metadata = models.JSONField(
        default=dict,
        blank=True,
        help_text="Arbitrary provider-specific configuration or state.",
    )

    is_active = models.BooleanField(
        default=True,
        help_text="Soft-disable an integration without deleting it.",
    )
    last_synced_at = models.DateTimeField(
        blank=True,
        null=True,
        help_text="When we last synced with this integration, if applicable.",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["owner", "provider"]),
            models.Index(fields=["owner", "is_active"]),
        ]

    def __str__(self):
        return f"{self.display_name} ({self.get_provider_display()})"


class Connector(models.Model):
    """
    Low-level connection to a technical endpoint like an MQTT broker, PLC,
    OPC UA server, or generic HTTP API. Integrations are business-level;
    Connectors are transport/protocol-level.
    """
    CONNECTOR_TYPE_CHOICES = [
        ("mqtt", "MQTT"),
        ("plc_modbus", "PLC (Modbus/TCP)"),
        ("plc_opcua", "PLC (OPC UA)"),
        ("nest_api", "Nest API"),
        ("http_api", "HTTP API"),
        ("other", "Other"),
    ]

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="connectors",
    )
    name = models.CharField(max_length=100)
    connector_type = models.CharField(max_length=32, choices=CONNECTOR_TYPE_CHOICES)

    # Optional link back to a higher-level Integration (e.g. Nest cloud)
    integration = models.ForeignKey(
        Integration,
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        related_name="connectors",
        help_text="Optional link to a higher-level provider integration.",
    )

    # Generic connection params – interpreted per connector_type
    host = models.CharField(max_length=255, blank=True)
    port = models.PositiveIntegerField(blank=True, null=True)
    username = models.CharField(max_length=255, blank=True)
    password = models.CharField(max_length=255, blank=True)
    base_topic = models.CharField(
        max_length=255,
        blank=True,
        help_text="MQTT base topic prefix, if applicable.",
    )
    base_path = models.CharField(
        max_length=255,
        blank=True,
        help_text="HTTP base path or OPC UA base node, if applicable.",
    )

    config = models.JSONField(
        default=dict,
        blank=True,
        help_text="Arbitrary connector-specific configuration.",
    )
    is_active = models.BooleanField(
        default=True,
        help_text="Soft-disable a connector without deleting it.",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]
        indexes = [
            models.Index(fields=["owner", "connector_type"]),
            models.Index(fields=["owner", "is_active"]),
        ]

    def __str__(self):
        return f"{self.name} ({self.connector_type})"


class Device(models.Model):
    DEVICE_TYPE_CHOICES = [
        ("light", "Light"),
        ("switch", "Switch"),
        ("camera", "Camera"),
        ("thermostat", "Thermostat"),
        ("sensor", "Sensor"),
    ]

    INTEGRATION_CHOICES = [
        ("local", "Local"),
        ("google_home", "Google Home"),
        ("nest", "Nest"),
        ("ring", "Ring"),
        ("other", "Other"),
    ]

    DEVICE_KIND_CHOICES = [
        ("sensor", "Sensor"),
        ("actuator", "Actuator"),
        ("hybrid", "Hybrid"),  # e.g. thermostat (reading + setpoint)
    ]

    SIGNAL_TYPE_CHOICES = [
        ("analog", "Analog"),
        ("digital", "Digital"),
        ("string", "String"),
    ]

    room = models.ForeignKey(
        Room,
        on_delete=models.CASCADE,
        related_name="devices",
    )
    name = models.CharField(max_length=100)

    # High-level type for UI iconography
    device_type = models.CharField(
        max_length=32,
        choices=DEVICE_TYPE_CHOICES,
        help_text="Logical type of device, used for UI and behavior.",
    )

    # Direction: sensor, actuator, or both
    device_kind = models.CharField(
        max_length=16,
        choices=DEVICE_KIND_CHOICES,
        default="sensor",
        help_text="Whether this behaves as a sensor, actuator, or both.",
    )

    # Signal nature
    signal_type = models.CharField(
        max_length=16,
        choices=SIGNAL_TYPE_CHOICES,
        default="analog",
        help_text="Analog/digital/string – used for UI & validation.",
    )

    # Engineering units / range
    unit = models.CharField(
        max_length=32,
        blank=True,
        help_text="Display unit, e.g. °C, %, bar.",
    )
    min_value = models.FloatField(
        blank=True,
        null=True,
        help_text="Optional minimum engineering value.",
    )
    max_value = models.FloatField(
        blank=True,
        null=True,
        help_text="Optional maximum engineering value.",
    )
    decimal_places = models.PositiveSmallIntegerField(
        default=1,
        help_text="How many decimals to show in the UI.",
    )
    is_percentage = models.BooleanField(
        default=False,
        help_text="If true, treat value as 0–100% and show accordingly.",
    )

    # Last known measurement / state
    last_value = models.FloatField(
        blank=True,
        null=True,
        help_text="Last engineering value (after scaling).",
    )
    last_value_raw = models.CharField(
        max_length=255,
        blank=True,
        help_text="Raw value as received (before scaling / parsing).",
    )
    last_updated_at = models.DateTimeField(
        blank=True,
        null=True,
        help_text="When last_value was updated.",
    )

    # High-level integration hint (matches your existing choices)
    integration = models.CharField(
        max_length=32,
        choices=INTEGRATION_CHOICES,
        default="local",
        help_text="Which integration this device is conceptually backed by.",
    )
    external_id = models.CharField(
        max_length=255,
        blank=True,
        help_text="Provider-specific identifier, e.g. Google Home device ID.",
    )

    # Optional human-readable location in the room
    location = models.CharField(
        max_length=120,
        blank=True,
        help_text="Optional location label, e.g. 'Near window', 'Ceiling', etc.",
    )

    # Logical on/off for actuators / binary sensors
    is_on = models.BooleanField(
        default=False,
        help_text="Logical on/off state of the device.",
    )

    # Canvas placement
    position_x = models.FloatField(
        default=10.0,
        help_text="Percentage from left (0–100) for room canvas placement.",
    )
    position_y = models.FloatField(
        default=10.0,
        help_text="Percentage from top (0–100) for room canvas placement.",
    )

    config = models.JSONField(
        default=dict,
        blank=True,
        help_text="Arbitrary device-specific configuration payload.",
    )

    is_active = models.BooleanField(
        default=True,
        help_text="Soft-disable a device without deleting it.",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["room", "name"]
        indexes = [
            models.Index(fields=["room"]),
            models.Index(fields=["room", "device_type"]),
            models.Index(fields=["integration"]),
        ]

    def __str__(self):
        return f"{self.name} in {self.room}"


class DeviceEndpoint(models.Model):
    """
    A generic connection point for a device to some external system
    via a Connector (MQTT, PLC, HTTP API, etc.).

    - Sensors: DeviceEndpoint(direction='input')
    - Actuators: DeviceEndpoint(direction='output')
    - Hybrids: typically 2 endpoints (one input, one output)
    """

    ENDPOINT_DIRECTION_CHOICES = [
        ("input", "Input (Sensor)"),
        ("output", "Output (Actuator)"),
    ]

    device = models.ForeignKey(
        Device,
        on_delete=models.CASCADE,
        related_name="endpoints",
    )
    connector = models.ForeignKey(
        Connector,
        on_delete=models.CASCADE,
        related_name="endpoints",
    )

    # Optional link to high-level integration (if relevant)
    integration = models.ForeignKey(
        Integration,
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        related_name="endpoints",
        help_text="Optional link to the higher-level provider integration.",
    )

    direction = models.CharField(
        max_length=16,
        choices=ENDPOINT_DIRECTION_CHOICES,
        help_text="Input (read) or Output (write).",
    )

    # How to address this in the external system
    address = models.CharField(
        max_length=255,
        help_text="MQTT topic, PLC tag/address, OPC UA node, or API path.",
    )

    # Scaling from raw external value → engineering units
    scale = models.FloatField(
        default=1.0,
        help_text="Scale factor applied to raw numeric values.",
    )
    offset = models.FloatField(
        default=0.0,
        help_text="Offset applied after scaling.",
    )

    # For digital/boolean cases
    true_value = models.CharField(
        max_length=64,
        blank=True,
        help_text="Raw value representing TRUE (e.g. '1', 'ON').",
    )
    false_value = models.CharField(
        max_length=64,
        blank=True,
        help_text="Raw value representing FALSE (e.g. '0', 'OFF').",
    )

    is_primary = models.BooleanField(
        default=True,
        help_text="If multiple endpoints, which one is primary for UI.",
    )

    metadata = models.JSONField(
        default=dict,
        blank=True,
        help_text="Extra endpoint-specific configuration or flags.",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["device", "direction", "id"]
        indexes = [
            models.Index(fields=["device"]),
            models.Index(fields=["connector"]),
            models.Index(fields=["direction"]),
        ]

    def __str__(self):
        return f"{self.device} [{self.direction}] @ {self.address}"