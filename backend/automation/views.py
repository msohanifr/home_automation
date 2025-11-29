import logging

from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework import viewsets, permissions, status
from rest_framework.authtoken.models import Token
from rest_framework.decorators import api_view, permission_classes, action
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.response import Response

from .models import (
    Room,
    Device,
    Integration,
    Connector,
    DeviceEndpoint,
)
from .serializers import (
    UserSerializer,
    LoginSerializer,
    RoomSerializer,
    DeviceSerializer,
    IntegrationSerializer,
    ConnectorSerializer,
    DeviceEndpointSerializer,
)

logger = logging.getLogger(__name__)


# --------------------------------------------------------------------
# Auth endpoints
# --------------------------------------------------------------------


@api_view(["POST"])
@permission_classes([permissions.AllowAny])
def register(request):
    username = request.data.get("username")
    password = request.data.get("password")
    if not username or not password:
        return Response(
            {"detail": "username and password are required"},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if User.objects.filter(username=username).exists():
        return Response(
            {"detail": "username already exists"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    user = User.objects.create_user(username=username, password=password)
    token, _ = Token.objects.get_or_create(user=user)
    logger.info("New user registered: %s", username)
    return Response(
        {"token": token.key, "user": UserSerializer(user).data},
        status=status.HTTP_201_CREATED,
    )


@api_view(["POST"])
@permission_classes([permissions.AllowAny])
def login(request):
    serializer = LoginSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    user = serializer.validated_data["user"]
    token, _ = Token.objects.get_or_create(user=user)
    logger.info("User logged in: %s", user.username)
    return Response({"token": token.key, "user": UserSerializer(user).data})


@api_view(["POST"])
def logout(request):
    try:
        token = Token.objects.get(user=request.user)
        token.delete()
        logger.info("User logged out: %s", request.user.username)
    except Token.DoesNotExist:
        logger.debug(
            "Logout called but token did not exist for user %s",
            request.user,
        )
    return Response({"detail": "Logged out"})


@api_view(["GET"])
def me(request):
    return Response({"user": UserSerializer(request.user).data})


# --------------------------------------------------------------------
# Permissions
# --------------------------------------------------------------------


class IsOwner(permissions.BasePermission):
    """
    Generic "owner" permission for this app.

    - For models with `owner` field, we compare against request.user.
    - For Device / DeviceEndpoint, we go via room/device to find the owner.
    """

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated)

    def has_object_permission(self, request, view, obj):
        user = request.user
        owner = getattr(obj, "owner", None)

        # Device → Room → owner
        if owner is None and hasattr(obj, "room"):
            owner = obj.room.owner

        # DeviceEndpoint → Device → Room → owner
        if owner is None and hasattr(obj, "device"):
            try:
                owner = obj.device.room.owner
            except AttributeError:
                pass

        # Connector has owner as well
        # (handled by the generic getattr above)

        return owner == user


# --------------------------------------------------------------------
# Room
# --------------------------------------------------------------------


class RoomViewSet(viewsets.ModelViewSet):
    """
    Rooms scoped to the current user.

    Supports:
      - listing/creating/updating/deleting rooms
      - background image upload via multipart (background_image)
    """

    serializer_class = RoomSerializer
    permission_classes = [permissions.IsAuthenticated, IsOwner]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_queryset(self):
        return Room.objects.filter(owner=self.request.user).order_by("name")

    def perform_create(self, serializer):
        room = serializer.save(owner=self.request.user)
        logger.info(
            "Room created: %s (user=%s)",
            room.name,
            self.request.user.username,
        )

    def perform_update(self, serializer):
        room = serializer.save()
        logger.info(
            "Room updated: %s (user=%s)",
            room.name,
            self.request.user.username,
        )


# --------------------------------------------------------------------
# Device
# --------------------------------------------------------------------


class DeviceViewSet(viewsets.ModelViewSet):
    """
    Devices scoped to the current user (via room.owner).

    Uses DeviceSerializer which exposes sensor/actuator metadata and endpoints.
    """

    serializer_class = DeviceSerializer
    permission_classes = [permissions.IsAuthenticated, IsOwner]

    def get_queryset(self):
        return Device.objects.filter(room__owner=self.request.user).select_related(
            "room"
        )

    def perform_create(self, serializer):
        room = serializer.validated_data["room"]
        if room.owner != self.request.user:
            logger.warning(
                "User %s tried to create device in room owned by %s",
                self.request.user.username,
                room.owner.username,
            )
            raise permissions.PermissionDenied("You do not own this room")
        device = serializer.save()
        logger.info(
            "Device created: %s (type=%s, kind=%s, room=%s, user=%s)",
            device.name,
            device.device_type,
            device.device_kind,
            room.name,
            self.request.user.username,
        )

    def perform_update(self, serializer):
        device = serializer.save()
        logger.info(
            "Device updated: %s (type=%s, kind=%s, room=%s, user=%s)",
            device.name,
            device.device_type,
            device.device_kind,
            device.room.name,
            self.request.user.username,
        )

    @action(detail=True, methods=["POST"])
    def command(self, request, pk=None):
        """
        Send a command to this device (primarily for actuators).

        Request payload patterns:
          - Digital: { "state": "on" } or { "state": "off" }
          - Digital alt: { "is_on": true/false }
          - Analog: { "target_value": 42.5 }

        This endpoint:
          - Resolves the primary output DeviceEndpoint
          - Calculates a raw value (scale/offset or true/false mapping)
          - Logs what would be sent to the connector
          - Updates last_value / is_on for the device for UI feedback
        """
        device = self.get_object()
        endpoint = _resolve_primary_output_endpoint(device)

        if endpoint is None:
            logger.warning(
                "Command called on device %s but no output endpoint is configured",
                device.id,
            )
            return Response(
                {"detail": "No output endpoint configured for this device."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        data = request.data or {}
        signal_type = device.signal_type

        # 1) Determine desired engineering value / state
        target_value = data.get("target_value", None)
        state = data.get("state", None)
        is_on = data.get("is_on", None)

        # Normalize digital state
        if signal_type == "digital":
            # prefer explicit "state"
            if state is not None:
                state_str = str(state).lower()
                desired_on = state_str in ("on", "true", "1", "yes")
            elif is_on is not None:
                desired_on = bool(is_on)
            else:
                # If nothing passed, toggle
                desired_on = not device.is_on

            # Choose raw value
            true_val = endpoint.true_value or "1"
            false_val = endpoint.false_value or "0"
            raw_value = true_val if desired_on else false_val

            # For logging / UI
            engineering_value = 1.0 if desired_on else 0.0

        else:
            # analog or string-like "setpoint"
            if target_value is None:
                return Response(
                    {"detail": "target_value is required for non-digital devices."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            try:
                eng_val = float(target_value)
            except (TypeError, ValueError):
                return Response(
                    {"detail": "target_value must be numeric."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            engineering_value = eng_val
            # Raw = inverse of scale/offset
            scale = endpoint.scale or 1.0
            offset = endpoint.offset or 0.0
            raw_value = (eng_val - offset) / scale if scale != 0 else eng_val

        # 2) Here is where you'd enqueue the actual write to connector
        # For now we just log what we *would* do.
        logger.info(
            "Device command: device_id=%s, endpoint_id=%s, connector_id=%s, "
            "signal_type=%s, engineering=%s, raw=%s, address=%s",
            device.id,
            endpoint.id,
            endpoint.connector_id,
            signal_type,
            engineering_value,
            raw_value,
            endpoint.address,
        )
        # TODO: enqueue Celery task or background write here

        # 3) Update device state for UI feedback
        device.last_value = (
            engineering_value
            if isinstance(engineering_value, (int, float))
            else None
        )
        device.last_value_raw = str(raw_value)
        device.last_updated_at = timezone.now()

        if signal_type == "digital":
            device.is_on = bool(engineering_value == 1.0)

        device.save(
            update_fields=[
                "last_value",
                "last_value_raw",
                "last_updated_at",
                "is_on",
            ]
        )

        # Return updated device
        serializer = self.get_serializer(device)
        return Response(serializer.data, status=status.HTTP_200_OK)


# --------------------------------------------------------------------
# Integration (high-level providers: Google Home, Nest, Ring, etc.)
# --------------------------------------------------------------------


class IntegrationViewSet(viewsets.ModelViewSet):
    serializer_class = IntegrationSerializer
    permission_classes = [permissions.IsAuthenticated, IsOwner]

    def get_queryset(self):
        return Integration.objects.filter(owner=self.request.user)

    def perform_create(self, serializer):
        integration = serializer.save(owner=self.request.user)
        logger.info(
            "Integration created: %s (provider=%s, user=%s)",
            integration.display_name,
            integration.provider,
            self.request.user.username,
        )

    def perform_update(self, serializer):
        integration = serializer.save()
        logger.info(
            "Integration updated: %s (provider=%s, user=%s)",
            integration.display_name,
            integration.provider,
            self.request.user.username,
        )

    @action(detail=False, methods=["GET"])
    def summary(self, request):
        """
        Simple provider count summary.
        """
        providers = {}
        for integration in self.get_queryset():
            providers.setdefault(integration.provider, 0)
            providers[integration.provider] += 1
        return Response({"providers": providers})


# --------------------------------------------------------------------
# Connector (MQTT / PLC / HTTP API endpoints)
# --------------------------------------------------------------------


class ConnectorViewSet(viewsets.ModelViewSet):
    """
    Protocol/transport-level connections (MQTT broker, PLC, Nest API, etc.).
    """

    serializer_class = ConnectorSerializer
    permission_classes = [permissions.IsAuthenticated, IsOwner]

    def get_queryset(self):
        return Connector.objects.filter(owner=self.request.user)

    def perform_create(self, serializer):
        connector = serializer.save(owner=self.request.user)
        logger.info(
            "Connector created: %s (type=%s, user=%s)",
            connector.name,
            connector.connector_type,
            self.request.user.username,
        )

    def perform_update(self, serializer):
        connector = serializer.save()
        logger.info(
            "Connector updated: %s (type=%s, user=%s)",
            connector.name,
            connector.connector_type,
            self.request.user.username,
        )


# --------------------------------------------------------------------
# DeviceEndpoint (bindings to connectors: topics, tags, nodes)
# --------------------------------------------------------------------


class DeviceEndpointViewSet(viewsets.ModelViewSet):
    """
    Endpoints that bind devices to connectors (input/output, address, scaling).
    """

    serializer_class = DeviceEndpointSerializer
    permission_classes = [permissions.IsAuthenticated, IsOwner]

    def get_queryset(self):
        return DeviceEndpoint.objects.filter(
            device__room__owner=self.request.user
        ).select_related("device", "connector", "integration")

    def perform_create(self, serializer):
        device = serializer.validated_data["device"]
        connector = serializer.validated_data["connector"]
        integration = serializer.validated_data.get("integration")

        # Ownership checks
        if device.room.owner != self.request.user:
            logger.warning(
                "User %s tried to create endpoint for device in room owned by %s",
                self.request.user.username,
                device.room.owner.username,
            )
            raise permissions.PermissionDenied("You do not own this device/room")

        if connector.owner != self.request.user:
            logger.warning(
                "User %s tried to bind endpoint to connector owned by %s",
                self.request.user.username,
                connector.owner.username,
            )
            raise permissions.PermissionDenied("You do not own this connector")

        if integration and integration.owner != self.request.user:
            logger.warning(
                "User %s tried to bind endpoint to integration owned by %s",
                self.request.user.username,
                integration.owner.username,
            )
            raise permissions.PermissionDenied("You do not own this integration")

        endpoint = serializer.save()
        logger.info(
            "DeviceEndpoint created: device=%s, connector=%s, direction=%s, address=%s, user=%s",
            endpoint.device_id,
            endpoint.connector_id,
            endpoint.direction,
            endpoint.address,
            self.request.user.username,
        )

    def perform_update(self, serializer):
        endpoint = serializer.save()
        logger.info(
            "DeviceEndpoint updated: id=%s, device=%s, connector=%s, direction=%s, address=%s, user=%s",
            endpoint.id,
            endpoint.device_id,
            endpoint.connector_id,
            endpoint.direction,
            endpoint.address,
            self.request.user.username,
        )


# --------------------------------------------------------------------
# Dashboard summary
# --------------------------------------------------------------------


@api_view(["GET"])
def dashboard_summary(request):
    """
    Simple summary for the dashboard.

    Wrapped in try/except so if anything goes wrong (e.g. DB not migrated),
    we log the error instead of blowing up silently in the frontend.
    """
    try:
        user = request.user
        rooms = Room.objects.filter(owner=user).count()
        devices = Device.objects.filter(room__owner=user).count()
        on_devices = Device.objects.filter(room__owner=user, is_on=True).count()
        integrations = Integration.objects.filter(owner=user).count()

        return Response(
            {
                "rooms": rooms,
                "devices": devices,
                "on_devices": on_devices,
                "integrations": integrations,
            }
        )
    except Exception:
        logger.exception(
            "Error computing dashboard summary for user %s",
            request.user,
        )
        return Response(
            {"detail": "Failed to load dashboard summary."},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


# --------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------


def _resolve_primary_output_endpoint(device):
    """
    Helper: find the primary output endpoint for this device, if any.
    """
    endpoints = getattr(device, "endpoints", None)
    if endpoints is None:
        return None

    # Prefer primary output endpoint
    primary = endpoints.filter(direction="output", is_primary=True).first()
    if primary:
        return primary

    # Fallback: any output endpoint
    return endpoints.filter(direction="output").first()