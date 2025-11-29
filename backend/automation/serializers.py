from django.contrib.auth import authenticate
from django.contrib.auth.models import User
from rest_framework import serializers

from .models import (
    Room,
    Device,
    Integration,
    Connector,
    DeviceEndpoint,
)


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["id", "username", "first_name", "last_name", "email"]


class LoginSerializer(serializers.Serializer):
    username = serializers.CharField()
    password = serializers.CharField(write_only=True)

    def validate(self, attrs):
        user = authenticate(
            username=attrs["username"],
            password=attrs["password"],
        )
        if not user:
            raise serializers.ValidationError("Invalid username or password")
        attrs["user"] = user
        return attrs


# -------------------------------
# Room / Integration
# -------------------------------

class RoomSerializer(serializers.ModelSerializer):
    """
    Exposes:
      - background_image (write-only) for uploads
      - background_image_url (read-only) from effective_background_url
    """
    background_image = serializers.ImageField(
        write_only=True,
        required=False,
        allow_null=True,
    )
    background_image_url = serializers.SerializerMethodField(read_only=True)
    owner = UserSerializer(read_only=True)

    class Meta:
        model = Room
        fields = [
            "id",
            "owner",
            "name",
            "slug",
            "description",
            "background_image",      # upload
            "background_image_url",  # effective URL
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "owner", "created_at", "updated_at"]

    def get_background_image_url(self, obj):
        request = self.context.get("request")
        url = obj.effective_background_url
        if not url:
            return None
        # If it's a relative URL, build absolute
        if request is not None and not url.startswith("http"):
            return request.build_absolute_uri(url)
        return url


class IntegrationSerializer(serializers.ModelSerializer):
    owner = UserSerializer(read_only=True)

    class Meta:
        model = Integration
        fields = [
            "id",
            "owner",
            "provider",
            "display_name",
            "access_token",
            "refresh_token",
            "metadata",
            "is_active",
            "last_synced_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "owner",
            "last_synced_at",
            "created_at",
            "updated_at",
        ]


# -------------------------------
# Connector / DeviceEndpoint
# -------------------------------

class ConnectorSerializer(serializers.ModelSerializer):
    owner = UserSerializer(read_only=True)
    integration = IntegrationSerializer(read_only=True)
    integration_id = serializers.PrimaryKeyRelatedField(
        source="integration",
        queryset=Integration.objects.all(),
        write_only=True,
        required=False,
        allow_null=True,
    )

    class Meta:
        model = Connector
        fields = [
            "id",
            "owner",
            "name",
            "connector_type",
            "integration",
            "integration_id",
            "host",
            "port",
            "username",
            "password",
            "base_topic",
            "base_path",
            "config",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "owner", "integration", "created_at", "updated_at"]
        extra_kwargs = {
            "password": {"write_only": True},
        }


class DeviceEndpointSerializer(serializers.ModelSerializer):
    connector = ConnectorSerializer(read_only=True)
    connector_id = serializers.PrimaryKeyRelatedField(
        source="connector",
        queryset=Connector.objects.all(),
        write_only=True,
    )

    integration = IntegrationSerializer(read_only=True)
    integration_id = serializers.PrimaryKeyRelatedField(
        source="integration",
        queryset=Integration.objects.all(),
        write_only=True,
        required=False,
        allow_null=True,
    )

    class Meta:
        model = DeviceEndpoint
        fields = [
            "id",
            "device",
            "connector",
            "connector_id",
            "integration",
            "integration_id",
            "direction",
            "address",
            "scale",
            "offset",
            "true_value",
            "false_value",
            "is_primary",
            "metadata",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "connector", "integration", "created_at", "updated_at"]


# -------------------------------
# Device
# -------------------------------

class DeviceSerializer(serializers.ModelSerializer):
    """
    Rich device serializer exposing:
      - sensor/actuator fields (device_kind, signal_type, unit, range, etc.)
      - last_value & last_updated_at
      - endpoints (for bindings to MQTT/PLC/etc.)
    """
    room = RoomSerializer(read_only=True)
    room_id = serializers.PrimaryKeyRelatedField(
        source="room",
        queryset=Room.objects.all(),
        write_only=True,
    )

    endpoints = DeviceEndpointSerializer(many=True, read_only=True)

    class Meta:
        model = Device
        fields = [
            "id",
            "room",
            "room_id",
            "name",
            "device_type",
            "device_kind",
            "signal_type",
            "unit",
            "min_value",
            "max_value",
            "decimal_places",
            "is_percentage",
            "last_value",
            "last_value_raw",
            "last_updated_at",
            "integration",
            "external_id",
            "location",
            "is_on",
            "position_x",
            "position_y",
            "config",
            "is_active",
            "created_at",
            "updated_at",
            "endpoints",
        ]
        read_only_fields = [
            "id",
            "room",
            "last_value",
            "last_value_raw",
            "last_updated_at",
            "created_at",
            "updated_at",
            "endpoints",
        ]