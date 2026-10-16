import datetime
from typing import Optional, List
from pydantic import BaseModel, ConfigDict


class AuditLogOut(BaseModel):
    id: int
    correlation_id: str
    user_id: Optional[int] = None
    username: Optional[str] = None
    action: str
    status: str
    resource_id: Optional[str] = None
    resource_name: Optional[str] = None
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    details: Optional[str] = None
    timestamp: datetime.datetime
    prev_hash: Optional[str] = None
    event_hash: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class SecuritySummary(BaseModel):
    total_audits: int
    successful_logins: int
    failed_logins: int
    revocation_events: int
    denied_events: int
    tamper_alerts: int
    recent_events: List[AuditLogOut]
