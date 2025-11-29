import json
import logging
import os
import time

import paho.mqtt.client as mqtt
from django.core.management.base import BaseCommand
from django.utils import timezone

from automation.models import Connector, DeviceEndpoint, Device  # adjust if app label differs

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Subscribe to MQTT topics for DeviceEndpoints and update Device values."

    def handle(self, *args, **options):
        # 1) Get an active MQTT connector
        connector = (
            Connector.objects.filter(
                connector_type="mqtt",
                is_active=True,
            )
            .order_by("id")
            .first()
        )

        if not connector:
            self.stdout.write(
                self.style.WARNING("No active MQTT connector (connector_type='mqtt') found.")
            )
            return

        # Resolve host/port: prefer model fields, fallback to env, then defaults
        host = connector.host or os.getenv("MQTT_BROKER_HOST", "mqtt")
        port = connector.port or int(os.getenv("MQTT_BROKER_PORT", "1883"))

        self.stdout.write(
            f"Using MQTT connector '{connector.name}' at {host}:{port}"
        )

        # 2) Build topic -> [DeviceEndpoint] map
        endpoints = (
            DeviceEndpoint.objects.filter(
                connector=connector,
                direction="input",
                device__is_active=True,
            )
            .select_related("device")
        )

        if not endpoints:
            self.stdout.write(
                self.style.WARNING(
                    "No DeviceEndpoints found for this connector with direction='input'."
                )
            )
            return

        topic_map: dict[str, list[DeviceEndpoint]] = {}

        for ep in endpoints:
            topic = ep.address
            if not topic:
                continue
            topic_map.setdefault(topic, []).append(ep)

        if not topic_map:
            self.stdout.write(
                self.style.WARNING("No MQTT topics (addresses) found in DeviceEndpoints.")
            )
            return

        self.stdout.write("Subscribing to topics:")
        for t in topic_map.keys():
            self.stdout.write(f"  - {t}")

        # 3) Create MQTT client
        client_id = f"home_automation_backend_{int(time.time())}"
        client = mqtt.Client(client_id=client_id)

        def on_connect(client, userdata, flags, rc, properties=None):
            if rc == 0:
                logger.info("MQTT connected with result code %s", rc)
                for topic in topic_map.keys():
                    client.subscribe(topic)
            else:
                logger.error("MQTT failed to connect, rc=%s", rc)

        def on_message(client, userdata, msg):
            topic = msg.topic
            payload_bytes = msg.payload
            payload_str = payload_bytes.decode("utf-8", errors="ignore")

            logger.debug("MQTT message on %s: %s", topic, payload_str)

            # Parse JSON payload from your simulator:
            # { "value": ..., "unit": "...", "ts": ... }
            try:
                data = json.loads(payload_str)
            except json.JSONDecodeError:
                # Fallback: try to parse as numeric
                try:
                    value = float(payload_str)
                    data = {"value": value}
                except ValueError:
                    logger.warning(
                        "MQTT payload on %s is not JSON or float: %s",
                        topic,
                        payload_str,
                    )
                    return

            value = data.get("value")
            unit = data.get("unit")
            # ts can be used, but we'll primarily use timezone.now()
            now = timezone.now()

            if value is None:
                logger.debug("MQTT payload on %s has no 'value' field", topic)
                return

            # 4) Update all endpoints mapped to this topic
            endpoints_for_topic = topic_map.get(topic, [])
            if not endpoints_for_topic:
                logger.debug("No endpoints registered for topic %s", topic)
                return

            for ep in endpoints_for_topic:
                device = ep.device

                # Apply scaling: raw -> engineering units
                scaled_value = (float(value) * ep.scale) + ep.offset

                # Update Device row
                # We use update() to avoid race conditions & save overhead
                Device.objects.filter(pk=device.pk).update(
                    last_value=scaled_value,
                    last_value_raw=payload_str,
                    last_updated_at=now,
                )

                # Optionally update unit if device.unit is blank but MQTT gave one
                if unit and not device.unit:
                    Device.objects.filter(pk=device.pk).update(unit=unit)

                logger.info(
                    "Updated Device id=%s name=%s from topic=%s raw=%s scaled=%s",
                    device.id,
                    device.name,
                    topic,
                    value,
                    scaled_value,
                )

        client.on_connect = on_connect
        client.on_message = on_message

        self.stdout.write("Connecting to MQTT broker...")
        client.connect(host, port, keepalive=60)
        client.loop_start()

        self.stdout.write(self.style.SUCCESS("MQTT worker started. Press Ctrl+C to stop."))

        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            self.stdout.write("Stopping MQTT worker...")
        finally:
            client.loop_stop()
            client.disconnect()