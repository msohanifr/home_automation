from django.urls import path, include
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register(r"rooms", views.RoomViewSet, basename="room")
router.register(r"devices", views.DeviceViewSet, basename="device")
router.register(r"integrations", views.IntegrationViewSet, basename="integration")

# NEW: connectors (MQTT/PLC/API transports)
router.register(r"connectors", views.ConnectorViewSet, basename="connector")

# NEW: device endpoints (bindings to topics/tags/nodes)
router.register(r"endpoints", views.DeviceEndpointViewSet, basename="device-endpoint")

urlpatterns = [
    # Auth endpoints
    path("auth/register/", views.register, name="register"),
    path("auth/login/", views.login, name="login"),
    path("auth/logout/", views.logout, name="logout"),
    path("auth/me/", views.me, name="me"),

    # Dashboard summary
    path("dashboard/summary/", views.dashboard_summary, name="dashboard-summary"),

    # All viewsets
    path("", include(router.urls)),
]