import secrets
import sqlite3
import os
import json
import zoneinfo
from datetime import datetime, timedelta, timezone
from functools import wraps

import dotenv
import requests
from flask import Flask, request, jsonify, redirect, session, url_for
from flask_cors import CORS
from oauthlib.oauth2 import WebApplicationClient
from werkzeug.middleware.proxy_fix import ProxyFix

from utils import rate_limit


# Configuration
dotenv.load_dotenv()
GOOGLE_DISCOVERY_URL = "https://accounts.google.com/.well-known/openid-configuration"
GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET")
FLASK_SECRET_KEY = os.environ.get("FLASK_SECRET_KEY")
ALLOWED_EMAIL = os.environ.get("ALLOWED_EMAIL")
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:3000")
DATABASE_PATH = os.environ.get("DATABASE_PATH", "meals.db")
DEFAULT_TIMEZONE = os.environ.get("DEFAULT_TIMEZONE", "America/New_York")

app = Flask(__name__)
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1, x_prefix=1)
app.secret_key = secrets.token_hex(16)  # Generate a random secret key
app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["SESSION_COOKIE_SECURE"] = True  # Set to False for development without HTTPS
app.config["PERMANENT_SESSION_LIFETIME"] = timedelta(days=7)  # Session lasts 7 days
CORS(app, supports_credentials=True)  # Enable CORS with credentials support

# OAuth 2 client setup
client = WebApplicationClient(GOOGLE_CLIENT_ID)


# Helper functions for timezone handling
def get_timezone():
    """Get the timezone object from the configured timezone name"""
    try:
        return zoneinfo.ZoneInfo(DEFAULT_TIMEZONE)
    except Exception as e:
        print(f"Error loading timezone {DEFAULT_TIMEZONE}: {e}")
        return timezone.utc


def now_in_timezone():
    """Get current time in the configured timezone"""
    return datetime.now(timezone.utc).astimezone(get_timezone())


def datetime_from_str(timestamp_str):
    """Convert a timestamp string to a datetime object in the configured timezone"""
    if not timestamp_str:
        return None
    # Handle various timestamp formats
    if "Z" in timestamp_str:
        # UTC timestamp with Z
        dt = datetime.fromisoformat(timestamp_str.replace("Z", "+00:00"))
    elif "+" in timestamp_str or "-" in timestamp_str and "T" in timestamp_str:
        # ISO format with timezone
        dt = datetime.fromisoformat(timestamp_str)
    else:
        # Assume naive datetime is in UTC
        dt = datetime.fromisoformat(timestamp_str)
        dt = dt.replace(tzinfo=timezone.utc)

    # Convert to configured timezone
    return dt.astimezone(get_timezone())


def datetime_to_str(dt):
    """Convert a datetime object to ISO string in the configured timezone"""
    if not dt:
        return None
    # Make sure dt has timezone info
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    # Convert to configured timezone and return ISO format
    return dt.astimezone(get_timezone()).isoformat()


# Initialize database only if it doesn't exist
def init_db_if_needed():
    db_path = DATABASE_PATH
    db_exists = os.path.exists(db_path)

    # Only initialize if the database file doesn't exist
    if not db_exists:
        print("Database not found. Creating new database...")
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        cursor.execute(
            """
        CREATE TABLE IF NOT EXISTS meals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ate BOOLEAN NOT NULL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
        """
        )
        conn.commit()
        conn.close()
        print("Database initialized successfully.")
    else:
        print("Database already exists. Skipping initialization.")


# Check if database needs to be initialized
init_db_if_needed()


# Authentication decorator
def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if "user_email" not in session:
            return (
                jsonify({"error": "Authentication required", "authenticated": False}),
                401,
            )

        # Check if the user's email matches the allowed email
        if session["user_email"] != ALLOWED_EMAIL:
            return (
                jsonify({"error": "Unauthorized access", "authenticated": False}),
                403,
            )

        return f(*args, **kwargs)

    return decorated_function


# Authentication routes
@app.route("/api/auth/login", methods=["GET"])
def login():
    # Find out what URL to hit for Google login
    google_provider_cfg = get_google_provider_cfg()
    authorization_endpoint = google_provider_cfg["authorization_endpoint"]

    # Use library to construct the request for Google login and provide
    # scopes that let you retrieve user's profile from Google
    request_uri = client.prepare_request_uri(
        authorization_endpoint,
        redirect_uri=request.base_url + "/callback",
        scope=["openid", "email", "profile"],
    )
    return jsonify({"redirect_url": request_uri})


@app.route("/api/auth/login/callback", methods=["GET"])
def callback():
    # Get authorization code Google sent back
    code = request.args.get("code")

    # Find out what URL to hit to get tokens
    google_provider_cfg = get_google_provider_cfg()
    token_endpoint = google_provider_cfg["token_endpoint"]

    # Prepare and send a request to get tokens
    token_url, headers, body = client.prepare_token_request(
        token_endpoint,
        authorization_response=request.url,
        redirect_url=request.base_url,
        code=code,
    )
    token_response = requests.post(
        token_url,
        headers=headers,
        data=body,
        auth=(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET),
    )

    # Parse the tokens
    client.parse_request_body_response(json.dumps(token_response.json()))

    # Get user info from Google
    userinfo_endpoint = google_provider_cfg["userinfo_endpoint"]
    uri, headers, body = client.add_token(userinfo_endpoint)
    userinfo_response = requests.get(uri, headers=headers, data=body)

    # Verify user email
    if userinfo_response.json().get("email_verified"):
        user_email = userinfo_response.json()["email"]
        user_name = userinfo_response.json()["given_name"]

        # Store user information in session
        session["user_email"] = user_email
        session["user_name"] = user_name
        session.permanent = True

        # Check if the user's email matches the allowed email
        if user_email == ALLOWED_EMAIL:
            # Redirect to frontend with success
            return redirect(f"{FRONTEND_URL}/#admin")
        else:
            # Redirect to frontend with unauthorized
            return redirect(f"{FRONTEND_URL}")
    else:
        return jsonify({"error": "User email not verified by Google"}), 400


@app.route("/api/auth/status", methods=["GET"])
def auth_status():
    if "user_email" in session and session["user_email"] == ALLOWED_EMAIL:
        return jsonify(
            {
                "authenticated": True,
                "email": session["user_email"],
                "name": session.get("user_name", ""),
            }
        )
    return jsonify({"authenticated": False})


@app.route("/api/auth/logout", methods=["POST"])
def logout():
    session.clear()
    return jsonify({"success": True})


def get_google_provider_cfg():
    return requests.get(GOOGLE_DISCOVERY_URL).json()


# API routes
@app.route("/api/meals", methods=["GET"])
def get_meal_status():
    conn = sqlite3.connect(DATABASE_PATH)
    cursor = conn.cursor()

    # Get the most recent meal entry
    cursor.execute("SELECT ate, timestamp FROM meals ORDER BY timestamp DESC LIMIT 1")
    result = cursor.fetchone()
    conn.close()

    if result is None:
        return jsonify({"ate": False, "timestamp": None})

    ate, timestamp = result

    # Check if the last meal was more than 3 hours ago
    if timestamp:
        eastern = zoneinfo.ZoneInfo("America/New_York")

        last_meal_time = datetime.fromisoformat(
            timestamp.replace("Z", "+00:00")
        ).astimezone(eastern)

        # XXX: WHYYYYYYYYYYYYYYYYYYYYYY do you hard code timezone?
        utc_now = datetime.now(timezone.utc)
        current_time = utc_now.astimezone(eastern)
        time_difference = current_time - last_meal_time

        # If more than 3 hours have passed and the last status was "ate",
        # automatically change to "not eaten"
        if time_difference.total_seconds() > 3 * 60 * 60 and bool(ate):
            return jsonify(
                {
                    "ate": False,
                    "timestamp": None,
                    "last_meal_timestamp": last_meal_time,
                    "status_changed": True,
                    "time_since_last_meal": int(time_difference.total_seconds() / 60),
                }
            )

        # Within the time, replace timestamp to local time
    #        timestamp = last_meal_time

    return jsonify({"ate": bool(ate), "timestamp": timestamp})


@app.route("/api/meals", methods=["POST"])
@login_required
def log_meal():
    data = request.get_json()
    ate = data.get("ate", False)

    # Check if a custom timestamp was provided
    # Frontend should make sure it is UTC time
    custom_timestamp = data.get("timestamp")
    timestamp = (
        custom_timestamp if custom_timestamp else datetime.now(timezone.utc).isoformat()
    )
    print(timestamp)

    conn = sqlite3.connect(DATABASE_PATH)
    cursor = conn.cursor()

    cursor.execute("INSERT INTO meals (ate, timestamp) VALUES (?, ?)", (ate, timestamp))
    conn.commit()
    conn.close()

    return jsonify({"success": True, "ate": ate, "timestamp": timestamp})


@app.route("/api/remind", methods=["POST"])
@rate_limit(3, 3600)
def send_reminder():
    print("Reminder to eat sent at", datetime.now().isoformat())
    data = request.get_json() if request.is_json else {}
    custom_message = data.get("message", "Time to eat!")
    sender = data.get("sender", "Guest")

    # Send Telegram message if token is configured
    telegram_token = os.environ.get("TELEGRAM_BOT_TOKEN")
    telegram_chat_id = os.environ.get("TELEGRAM_CHAT_ID")

    if telegram_token and telegram_chat_id:
        # Format telegram message
        message = f"🔔 <b>Meal Reminder from {sender}</b>\n\n{custom_message}"

        # Send to Telegram
        telegram_url = f"https://api.telegram.org/bot{telegram_token}/sendMessage"
        requests.post(
            telegram_url,
            data={"chat_id": telegram_chat_id, "text": message, "parse_mode": "HTML"},
        )

    return jsonify({"success": True, "message": "Reminder sent"})


@app.route("/api/meals/recent", methods=["GET"])
@login_required
def get_recent_meals():
    """Get recent meal entries"""
    try:
        # Get query parameter for limit (default to 5)
        limit = request.args.get("limit", 5, type=int)

        # Connect to database
        conn = sqlite3.connect(DATABASE_PATH)
        cursor = conn.cursor()

        # Get recent meals with limit
        cursor.execute(
            "SELECT id, ate, timestamp FROM meals ORDER BY timestamp DESC LIMIT ?",
            (limit,),
        )
        meals = cursor.fetchall()
        conn.close()

        # Format results
        result = []
        for meal_id, ate, timestamp in meals:
            # Convert timestamp to timezone-aware datetime
            formatted_time = timestamp
            if timestamp:
                dt = datetime_from_str(timestamp)
                formatted_time = datetime_to_str(dt)

            result.append(
                {"id": meal_id, "ate": bool(ate), "timestamp": formatted_time}
            )

        return jsonify({"success": True, "meals": result})
    except Exception as e:
        print(f"Error getting recent meals: {str(e)}")
        return jsonify({"success": False, "error": "Failed to get recent meals"}), 500


@app.route("/api/meals/<int:meal_id>", methods=["DELETE"])
@login_required
def delete_meal(meal_id):
    """Delete a meal entry by ID"""
    try:
        # Connect to database
        conn = sqlite3.connect(DATABASE_PATH)
        cursor = conn.cursor()

        # Check if meal exists
        cursor.execute("SELECT id FROM meals WHERE id = ?", (meal_id,))
        meal = cursor.fetchone()

        if not meal:
            conn.close()
            return jsonify({"success": False, "error": "Meal not found"}), 404

        # Delete the meal
        cursor.execute("DELETE FROM meals WHERE id = ?", (meal_id,))
        conn.commit()
        conn.close()

        return jsonify(
            {"success": True, "message": f"Meal with ID {meal_id} deleted successfully"}
        )
    except Exception as e:
        print(f"Error deleting meal: {str(e)}")
        return jsonify({"success": False, "error": "Failed to delete meal"}), 500


if __name__ == "__main__":
    app.run(debug=True)
