from django.contrib import admin
from .models import Room, Device, Integration

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