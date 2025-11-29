# backend/automation/management/commands/run_mqtt_worker.py
import json
import os
import time
import logging

import paho.mqtt.client as mqtt
from django.core.management.base import BaseCommand
from django.utils import timezone

from automation.models import Connector, DeviceEndpoint, Device

logger = logging.getLogger(__name__)

MQTT_HOST = os.getenv("MQTT_HOST", os.getenv("MQTT_BROKER_HOST", "mqtt"))
MQTT_PORT = int(os.getenv("MQTT_PORT", os.getenv("MQTT_BROKER_PORT", "1883")))

class Command(BaseCommand):
    help = "MQTT worker: subscribe to topics and update Device readings."

    def handle(self, *args, **options):
        self.stdout.write(self.style.SUCCESS(
            f"[mqtt-worker] starting, broker={MQTT_HOST}:{MQTT_PORT}"
        ))

        client = mqtt.Client(client_id="home_automation_django_worker")
        client.on_connect = self.on_connect
        client.on_message = self.on_message

        client.connect(MQTT_HOST, MQTT_PORT, keepalive=60)
        client.loop_start()

        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            self.stdout.write(self.style.WARNING("[mqtt-worker] stopping"))
        finally:
            client.loop_stop()

    def on_connect(self, client, userdata, flags, rc):
        logger.info("[mqtt-worker] Connected to MQTT with code %s", rc)

        # Subscribe to all topics that have a DeviceEndpoint
        topics = list(
            DeviceEndpoint.objects
            .filter(direction="input", connector__connector_type="mqtt")
            .values_list("address", flat=True)
            .distinct()
        )

        if not topics:
            logger.warning("[mqtt-worker] No MQTT DeviceEndpoints found")
            return

        for t in topics:
            client.subscribe(t, qos=0)
            logger.info("[mqtt-worker] Subscribed to %s", t)

    def on_message(self, client, userdata, msg):
        topic = msg.topic
        payload = msg.payload.decode("utf-8", errors="ignore")

        logger.info("[mqtt-worker] Received on %s: %s", topic, payload)

        # Find endpoints for this topic
        endpoints = DeviceEndpoint.objects.filter(
            direction="input",
            connector__connector_type="mqtt",
            address=topic,
        ).select_related("device")

        if not endpoints.exists():
            logger.warning("[mqtt-worker] No DeviceEndpoint bound to topic %s", topic)
            return

        try:
            data = json.loads(payload)
        except json.JSONDecodeError:
            logger.error("[mqtt-worker] invalid JSON for topic %s: %s", topic, payload)
            return

        value = data.get("value")
        unit = data.get("unit")

        for ep in endpoints:
            device = ep.device
            if value is not None and isinstance(value, (int, float)):
                scaled = ep.scale * float(value) + ep.offset
                device.last_value = scaled
                device.last_value_raw = payload
                device.last_updated_at = timezone.now()
                if unit and not device.unit:
                    device.unit = unit
                device.save(update_fields=["last_value", "last_value_raw", "last_updated_at", "unit"])
                logger.info(
                    "[mqtt-worker] Updated Device %s (id=%s) from topic %s → %s %s",
                    device.name,
                    device.id,
                    topic,
                    scaled,
                    device.unit or "",
                )