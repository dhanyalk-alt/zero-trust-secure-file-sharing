import os
import asyncio
import datetime
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from backend.app.config import settings
from backend.app.database import engine, Base, SessionLocal
from backend.app.models import user, file, permission, audit, token_blacklist, organization, category, signature, share_link, subscription
from backend.app.api import auth, files, permissions, users, audit as audit_api, stats, organizations, admin, signatures, share_links, payments


async def _cleanup_expired_tokens():
    """
    Background task: purges expired JWT blacklist entries every 60 minutes.
    Prevents the token_blacklist table from growing unboundedly.
    """
    while True:
        await asyncio.sleep(3600)  # run hourly
        try:
            db = SessionLocal()
            now_utc = datetime.datetime.now(datetime.timezone.utc)
            deleted = (
                db.query(token_blacklist.TokenBlacklist)
                .filter(token_blacklist.TokenBlacklist.expires_at < now_utc)
                .delete(synchronize_session=False)
            )
            db.commit()
            if deleted:
                print(f"[CLEANUP] Purged {deleted} expired token blacklist entries.", flush=True)
        except Exception as exc:
            print(f"[CLEANUP_ERROR] Token blacklist cleanup failed: {exc}", flush=True)
        finally:
            db.close()


async def _cleanup_expired_files():
    """
    Background task: soft-deletes files whose expires_at has passed every 15 minutes.
    Marks is_deleted=True; actual storage cleanup follows the same path as manual delete.
    """
    while True:
        await asyncio.sleep(900)  # run every 15 minutes
        try:
            db = SessionLocal()
            now_utc = datetime.datetime.now(datetime.timezone.utc)
            expired_files = (
                db.query(file.EncryptedFile)
                .filter(
                    file.EncryptedFile.expires_at != None,
                    file.EncryptedFile.expires_at < now_utc,
                    file.EncryptedFile.is_deleted == False,
                )
                .all()
            )
            for ef in expired_files:
                ef.is_deleted = True
                print(f"[CLEANUP] Auto-expired file '{ef.original_filename}' (id={ef.id}).", flush=True)
            db.commit()
        except Exception as exc:
            print(f"[CLEANUP_ERROR] File expiry cleanup failed: {exc}", flush=True)
        finally:
            db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize database schema on startup
    Base.metadata.create_all(bind=engine)
    # Ensure newly added columns exist in older database files
    try:
        from sqlalchemy import text
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE encrypted_files ADD COLUMN expires_at DATETIME;"))
    except Exception:
        pass  # Column already exists
    try:
        from sqlalchemy import text
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE audit_logs ADD COLUMN prev_hash VARCHAR(64);"))
    except Exception:
        pass
    try:
        from sqlalchemy import text
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE audit_logs ADD COLUMN event_hash VARCHAR(64);"))
    except Exception:
        pass
    try:
        from sqlalchemy import text
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE file_permissions ADD COLUMN access_start_hour INTEGER;"))
    except Exception:
        pass
    try:
        from sqlalchemy import text
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE file_permissions ADD COLUMN access_end_hour INTEGER;"))
    except Exception:
        pass
    try:
        from sqlalchemy import text
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE file_permissions ADD COLUMN access_days VARCHAR(20);"))
    except Exception:
        pass
    try:
        from sqlalchemy import text
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE file_permissions ADD COLUMN granted_by_id INTEGER REFERENCES users(id);"))
    except Exception:
        pass
    try:
        from sqlalchemy import text
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE users ADD COLUMN subscription_status VARCHAR(20) DEFAULT 'FREE';"))
    except Exception:
        pass
    try:
        from sqlalchemy import text
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE users ADD COLUMN subscription_expires_at DATETIME;"))
    except Exception:
        pass
    # Ensure storage directory exists if using local storage
    if settings.STORAGE_PROVIDER == "local":
        os.makedirs(settings.LOCAL_STORAGE_DIR, exist_ok=True)
    # Start background cleanup tasks
    cleanup_task_tokens = asyncio.create_task(_cleanup_expired_tokens())
    cleanup_task_files = asyncio.create_task(_cleanup_expired_files())
    yield
    cleanup_task_tokens.cancel()
    cleanup_task_files.cancel()


app = FastAPI(
    title=settings.APP_NAME,
    description="Zero Trust-Based Cloud Storage System for Secure File Sharing with End-to-End Hybrid Cryptography",
    version="1.0.0",
    lifespan=lifespan
)

# CORS Middleware configured from environment
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition", "X-File-SHA256", "X-ZeroTrust-Verified"]
)

# Mount API Routers
app.include_router(auth.router)
app.include_router(files.router)
app.include_router(permissions.router)
app.include_router(users.router)
app.include_router(audit_api.router)
app.include_router(stats.router)
app.include_router(organizations.router)
app.include_router(admin.router)
app.include_router(signatures.router)
app.include_router(share_links.router)
app.include_router(payments.router)


@app.get("/api/health", tags=["Health"])
def health_check():
    return {
        "status": "healthy",
        "app_name": settings.APP_NAME,
        "environment": settings.ENVIRONMENT,
        "storage_provider": settings.STORAGE_PROVIDER
    }


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    import sys
    import traceback
    if isinstance(exc, HTTPException):
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": exc.detail},
            headers=getattr(exc, "headers", None)
        )
    print(f"[UNHANDLED_EXCEPTION] Path: {request.url.path} Error: {exc}", file=sys.stderr)
    traceback.print_exc()
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "An internal server security or processing error occurred."}
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.app.main:app", host=settings.APP_HOST, port=settings.APP_PORT, reload=settings.DEBUG)
