import asyncio
import random
import time

from asyncua import ua, Server


async def main():
    server = Server()
    # Listen on all interfaces, port 4840
    await server.init()
    server.set_endpoint("opc.tcp://0.0.0.0:4840/freeopcua/server/")

    # Set a name / namespace
    uri = "urn:home-automation:opcua-sim"
    idx = await server.register_namespace(uri)

    # Objects folder → Home → Rooms
    objects = server.get_objects_node()
    home = await objects.add_object(idx, "Home")

    living = await home.add_object(idx, "LivingRoom")
    bedroom = await home.add_object(idx, "BedRoom")

    # --- Variables under LivingRoom (Double) ---
    temp = await living.add_variable(
        idx,
        "Temperature",
        ua.Variant(21.0, ua.VariantType.Double),
    )
    humidity = await living.add_variable(
        idx,
        "Humidity",
        ua.Variant(40.0, ua.VariantType.Double),
    )

    # --- Variables under BedRoom ---
    # Make CO2 a Double too (easier to work with random floats)
    co2 = await bedroom.add_variable(
        idx,
        "CO2",
        ua.Variant(500.0, ua.VariantType.Double),
    )
    occupancy = await bedroom.add_variable(
        idx,
        "Occupancy",
        ua.Variant(False, ua.VariantType.Boolean),
    )

    # Make them writable (so later you can play with actuators)
    await temp.set_writable()
    await humidity.set_writable()
    await co2.set_writable()
    await occupancy.set_writable()

    print("OPC UA server started at opc.tcp://0.0.0.0:4840/freeopcua/server/")
    async with server:
        while True:
            # Simulate updates every 3 seconds
            temp_value = 21.0 + random.uniform(-1.0, 1.0)
            humidity_value = 40.0 + random.uniform(-5.0, 5.0)

            # CO2 as Double
            co2_value = 500.0 + random.uniform(-50.0, 150.0)

            await temp.write_value(ua.Variant(temp_value, ua.VariantType.Double))
            await humidity.write_value(ua.Variant(humidity_value, ua.VariantType.Double))
            await co2.write_value(ua.Variant(co2_value, ua.VariantType.Double))
            await occupancy.write_value(
                ua.Variant(random.choice([True, False]), ua.VariantType.Boolean)
            )

            print(
                f"[opcua-sim] Updated values at {time.strftime('%X')} | "
                f"T={temp_value:.2f} °C, H={humidity_value:.2f} %, CO2={co2_value:.2f} ppm"
            )
            await asyncio.sleep(3)


if __name__ == "__main__":
    asyncio.run(main())