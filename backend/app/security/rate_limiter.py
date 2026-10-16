import time
from collections import defaultdict
from typing import Dict, List
from backend.app.config import settings


class RiskRateLimiter:
    """
    Sliding window in-memory rate limiter and anomaly detector.
    Tracks download rates and failed attempts per identity/IP.
    """
    def __init__(self):
        # Maps user_id / ip -> list of timestamps
        self.downloads: Dict[str, List[float]] = defaultdict(list)
        self.failed_requests: Dict[str, List[float]] = defaultdict(list)

    def record_download(self, key: str) -> bool:
        """
        Records a download attempt.
        Returns False if download rate limit exceeded (e.g. rapid exfiltration risk), True otherwise.
        """
        now = time.time()
        window = 60.0  # 1 minute
        limit = settings.DOWNLOAD_RATE_LIMIT_PER_MINUTE

        # Clean old records
        self.downloads[key] = [t for t in self.downloads[key] if now - t < window]

        if len(self.downloads[key]) >= limit:
            return False

        self.downloads[key].append(now)
        return True

    def record_failed_request(self, key: str) -> int:
        """
        Records a failed/suspicious request.
        Returns count of failed requests within 1 hour.
        """
        now = time.time()
        window = 3600.0  # 1 hour
        self.failed_requests[key] = [t for t in self.failed_requests[key] if now - t < window]
        self.failed_requests[key].append(now)
        return len(self.failed_requests[key])

    def is_suspicious(self, key: str) -> bool:
        now = time.time()
        window = 3600.0
        self.failed_requests[key] = [t for t in self.failed_requests[key] if now - t < window]
        return len(self.failed_requests[key]) >= settings.SUSPICIOUS_ACCESS_THRESHOLD_PER_HOUR


risk_limiter = RiskRateLimiter()
