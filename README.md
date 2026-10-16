# ZeroTrust File Vault

ZeroTrust File Vault is a secure file storage and sharing application with a React web interface and a FastAPI backend. It combines encrypted file handling with identity-aware access controls, audit logging, and administrative tools.

## Features

- Register and sign in, with account lockout controls and token-based authentication.
- Upload, organize, preview, download, and expire files.
- Share files with other users using permissions, access windows, or revocable public links.
- Work with organizations and organization members.
- Verify file integrity and manage signing and encryption keys.
- Review audit logs, security summaries, analytics, and administrative dashboards.
- Store files locally or configure an S3-compatible object storage provider.

## Technology

- **Frontend:** React 18, Vite, Axios
- **Backend:** Python, FastAPI, SQLAlchemy
- **Database:** SQLite by default; SQLAlchemy database URLs can be configured for other supported databases.
- **Storage:** Local filesystem by default; optional S3-compatible storage

## Prerequisites

- Python and pip
- Node.js and npm

## Getting started

Run commands from the project root unless otherwise specified.

### 1. Configure the backend

Create and activate a virtual environment, then install the Python dependencies:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

On macOS or Linux, activate the environment with:

```bash
source .venv/bin/activate
```

Copy `.env.example` to `.env` and replace the placeholder `SECRET_KEY` with a randomly generated secret of at least 32 characters. For example:

```powershell
Copy-Item .env.example .env
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

Put the generated value in `.env` as `SECRET_KEY=...`. Keep `.env` private and do not commit real credentials. The example configuration uses port `8000`, which is also the frontend development server's API proxy target.

The application creates the database tables when the backend starts. With the default configuration, SQLite data is stored in `zerotrust_storage.db` and uploaded objects are stored under `storage_data`.

### 2. Start the backend

From the project root, with the virtual environment active:

```powershell
python -m uvicorn backend.app.main:app --reload --host 0.0.0.0 --port 8000
```

The API is available at <http://localhost:8000>. Interactive API documentation is at <http://localhost:8000/docs>, and the health endpoint is <http://localhost:8000/api/health>.

### 3. Start the frontend

In a second terminal:

```powershell
cd frontend
npm install
npm run dev
```

Open the Vite URL printed in the terminal (by default <http://localhost:5173>). The development server forwards `/api` requests to `http://127.0.0.1:8000`.

## Configuration

Backend settings are read from environment variables and, by default, from `.env` in the project root. Common settings include:

| Variable | Purpose | Default |
| --- | --- | --- |
| `ENVIRONMENT` | Deployment environment | `development` |
| `APP_NAME` | API application name | `ZeroTrust File Vault` |
| `APP_HOST` / `APP_PORT` | Backend bind address and port | `0.0.0.0` / `8001` |
| `SECRET_KEY` | Required signing secret for authentication tokens | No default; must be set |
| `DATABASE_URL` | SQLAlchemy database connection URL | `sqlite:///./zerotrust_storage.db` |
| `STORAGE_PROVIDER` | File storage provider (`local` or `s3`) | `local` |
| `LOCAL_STORAGE_DIR` | Local file storage directory | `./storage_data` |
| `MAX_UPLOAD_SIZE_BYTES` | Maximum upload size | `104857600` (100 MiB) |
| `ALLOWED_EXTENSIONS` | Comma-separated allowed file extensions | See `backend/app/config.py` |
| `CORS_ORIGINS` | Comma-separated allowed browser origins | Local development origins |

The backend defaults to port `8001` if `APP_PORT` is not set, while the frontend proxy targets port `8000`. For local development, use the supplied `.env.example` (which sets `APP_PORT=8000`) or update the frontend proxy in `frontend/vite.config.js` to match your backend port.

For S3-compatible storage, set `STORAGE_PROVIDER=s3` and provide `S3_BUCKET_NAME`, `S3_ACCESS_KEY`, and `S3_SECRET_KEY`; optionally configure `S3_ENDPOINT_URL` and `S3_REGION`. The S3 provider additionally requires `boto3`, which is not included in `requirements.txt`. Payment integration settings are optional and can be configured with `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET`.

## Tests

From the project root, activate the backend virtual environment and run:

```powershell
python -m pytest
```

The tests use an in-memory SQLite database.

## Project layout

```text
backend/
  app/
    api/          FastAPI route handlers
    crypto/       Encryption, hashing, and signature helpers
    models/       SQLAlchemy data models
    security/     Authentication, access verification, and audit logging
    storage/      Local and S3-compatible storage providers
  tests/          Backend tests
frontend/
  src/
    api/          API client
    components/   Shared interface components
    pages/        Application screens
```
