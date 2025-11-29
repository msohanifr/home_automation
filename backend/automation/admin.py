from django.contrib import admin
from .models import Connector, DeviceEndpoint, Room, Device, Integration

@admin.register(Room)
class RoomAdmin(admin.ModelAdmin):
    list_display = ('id', 'name', 'owner', 'slug', 'created_at')
    search_fields = ('name', 'slug', 'owner__username')


@admin.register(Device)
class DeviceAdmin(admin.ModelAdmin):
    list_display = ('id', 'name', 'device_type', 'room', 'is_on')
    list_filter = ('device_type', 'integration', 'is_on')


@admin.register(Integration)
class IntegrationAdmin(admin.ModelAdmin):
    list_display = ('id', 'display_name', 'provider', 'owner', 'created_at')
    list_filter = ('provider',)



@admin.register(Connector)
class ConnectorAdmin(admin.ModelAdmin):
    """
    Admin for protocol-level connectors (MQTT / OPC UA / PLC / HTTP, etc.).
    NOTE: we do NOT refer to 'status' or 'last_synced' here, because those
    fields do not exist on the Connector model.
    """

    list_display = (
        "id",
        "name",
        "connector_type",
        "owner",
        "is_active",
        "created_at",
    )
    list_filter = ("connector_type", "is_active")
    search_fields = ("name", "owner__username")
    readonly_fields = ("created_at", "updated_at")


@admin.register(DeviceEndpoint)
class DeviceEndpointAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "device",
        "connector",
    )