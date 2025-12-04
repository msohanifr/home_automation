import json
from channels.generic.websocket import AsyncWebsocketConsumer, AsyncJsonWebsocketConsumer
from channels.db import database_sync_to_async
from .models import Device
from .serializers import DeviceSerializer  # adjust to your actual serializer

class RoomConsumer(AsyncJsonWebsocketConsumer):
    async def connect(self):
        self.room_id = self.scope["url_route"]["kwargs"]["room_id"]
        self.room_group_name = f"room_{self.room_id}"

        await self.channel_layer.group_add(self.room_group_name, self.channel_name)
        await self.accept()

        # optional: send initial snapshot
        devices = await self.get_devices()
        await self.send_json({
            "type": "devices_snapshot",
            "devices": devices,
        })

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(self.room_group_name, self.channel_name)

    @database_sync_to_async
    def get_devices(self):
        qs = Device.objects.filter(room_id=self.room_id)
        return DeviceSerializer(qs, many=True).data

    # handler for messages sent via group_send
    async def device_update(self, event):
        await self.send_json({
            "type": "device_update",
            "device": event["device"],
        })