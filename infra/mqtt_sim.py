import os
import time
import random
import json

import paho.mqtt.client as mqtt

MQTT_HOST = os.getenv("MQTT_HOST", "mqtt")
MQTT_PORT = int(os.getenv("MQTT_PORT", "1883"))

client = mqtt.Client(client_id="home_automation_sim")

def main():
    client.connect(MQTT_HOST, MQTT_PORT, keepalive=60)
    client.loop_start()

    print(f"[mqtt-sim] Connected to MQTT at {MQTT_HOST}:{MQTT_PORT}")

    while True:
        # A couple of fake sensors
        payloads = [
            {
                "topic": "sensors/living_room/temperature",
                "value": round(random.uniform(20.0, 24.0), 1),
                "unit": "°C",
            },
            {
                "topic": "sensors/living_room/humidity",
                "value": round(random.uniform(30.0, 50.0), 1),
                "unit": "%",
            },
            {
                "topic": "sensors/bedroom/co2",
                "value": random.randint(400, 900),
                "unit": "ppm",
            },
        ]

        for p in payloads:
          msg = {
              "value": p["value"],
              "unit": p["unit"],
              "ts": time.time(),
          }
          client.publish(p["topic"], json.dumps(msg), qos=0, retain=False)
          print(f"[mqtt-sim] Published {msg} to {p['topic']}")

        time.sleep(5)


if __name__ == "__main__":
    main()