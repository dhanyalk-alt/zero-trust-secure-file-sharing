from pydantic import BaseModel


class DashboardStats(BaseModel):
    total_files_count: int
    total_bytes_stored: int
    total_shared_by_user: int
    total_shared_with_user: int
    security_events_count: int
    active_users_count: int
    organizations_count: int = 0

