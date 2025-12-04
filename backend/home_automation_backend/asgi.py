import os

from channels.auth import AuthMiddlewareStack
from channels.routing import ProtocolTypeRouter, URLRouter
from django.core.asgi import get_asgi_application
from django.urls import re_path

# Make sure this matches your project package name
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "home_automation_backend.settings")

# 1) Initialize Django (loads settings, apps, models, etc.)
django_asgi_app = get_asgi_application()

# 2) Only NOW import anything that touches models/settings
from automation.consumers import RoomConsumer  # noqa: E402


# 3) WebSocket URL patterns
websocket_urlpatterns = [
    # ws://<host>/ws/rooms/1/
    re_path(r"^ws/rooms/(?P<room_id>\d+)/$", RoomConsumer.as_asgi()),
]


# 4) Channels protocol router
application = ProtocolTypeRouter(
    {
        "http": django_asgi_app,
        "websocket": AuthMiddlewareStack(
            URLRouter(websocket_urlpatterns)
        ),
    }
)