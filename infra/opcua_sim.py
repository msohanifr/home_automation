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

    # Some variables under LivingRoom
    temp = await living.add_variable(idx, "Temperature", 21.0, ua.VariantType.Double)
    humidity = await living.add_variable(idx, "Humidity", 40.0, ua.VariantType.Double)

    # Variables under BedRoom
    co2 = await bedroom.add_variable(idx, "CO2", 500, ua.VariantType.Int32)
    occupancy = await bedroom.add_variable(idx, "Occupancy", False, ua.VariantType.Boolean)

    # Make them writable (so later you can play with actuators)
    await temp.set_writable()
    await humidity.set_writable()
    await co2.set_writable()
    await occupancy.set_writable()

    print("OPC UA server started at opc.tcp://0.0.0.0:4840/freeopcua/server/")
    async with server:
        while True:
            # Simulate updates every 3 seconds
            await temp.write_value(21.0 + random.uniform(-1.0, 1.0))
            await humidity.write_value(40.0 + random.uniform(-5.0, 5.0))
            await co2.write_value(int(500 + random.uniform(-50, 150)))
            await occupancy.write_value(random.choice([True, False]))

            print(
                f"[opcua-sim] Updated values at {time.strftime('%X')}"
            )
            await asyncio.sleep(3)


if __name__ == "__main__":
    asyncio.run(main())