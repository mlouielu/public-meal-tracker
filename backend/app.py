from flask import Flask, request, jsonify, redirect, session, url_for
from flask_cors import CORS
from datetime import datetime, timedelta
import sqlite3
import os
import json
import requests
from functools import wraps
from oauthlib.oauth2 import WebApplicationClient
import secrets
import dotenv


dotenv.load_dotenv()

os.environ["OAUTHLIB_INSECURE_TRANSPORT"] = "1"


# Configuration
GOOGLE_DISCOVERY_URL = "https://accounts.google.com/.well-known/openid-configuration"
GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET")
FLASK_SECRET_KEY = os.environ.get("FLASK_SECRET_KEY")
ALLOWED_EMAIL = os.environ.get("ALLOWED_EMAIL")

app = Flask(__name__)
app.secret_key = secrets.token_hex(16)  # Generate a random secret key
app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["SESSION_COOKIE_SECURE"] = True  # Set to False for development without HTTPS
app.config["PERMANENT_SESSION_LIFETIME"] = timedelta(days=7)  # Session lasts 7 days
CORS(app, supports_credentials=True)  # Enable CORS with credentials support

# OAuth 2 client setup
client = WebApplicationClient(GOOGLE_CLIENT_ID)


# Initialize database only if it doesn't exist
def init_db_if_needed():
    db_path = "meals.db"
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
            return redirect("http://localhost:3000/admin")
        else:
            # Redirect to frontend with unauthorized
            return redirect("http://localhost:3000/unauthorized")
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
    conn = sqlite3.connect("meals.db")
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
        last_meal_time = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
        current_time = datetime.now()
        time_difference = current_time - last_meal_time

        # If more than 3 hours have passed and the last status was "ate",
        # automatically change to "not eaten"
        if time_difference.total_seconds() > 3 * 60 * 60 and bool(ate):
            return jsonify(
                {
                    "ate": False,
                    "timestamp": None,
                    "last_meal_timestamp": timestamp,
                    "status_changed": True,
                    "time_since_last_meal": int(time_difference.total_seconds() / 60),
                }
            )

    return jsonify({"ate": bool(ate), "timestamp": timestamp})


@app.route("/api/meals", methods=["POST"])
@login_required
def log_meal():
    data = request.get_json()
    ate = data.get("ate", False)

    # Check if a custom timestamp was provided
    custom_timestamp = data.get("timestamp")
    timestamp = custom_timestamp if custom_timestamp else datetime.now().isoformat()
    print(timestamp)

    conn = sqlite3.connect("meals.db")
    cursor = conn.cursor()

    cursor.execute("INSERT INTO meals (ate, timestamp) VALUES (?, ?)", (ate, timestamp))
    conn.commit()
    conn.close()

    return jsonify({"success": True, "ate": ate, "timestamp": timestamp})


@app.route("/api/remind", methods=["POST"])
def send_reminder():
    # In a real application, this would send a notification
    # For now, we'll just log the reminder request
    print("Reminder to eat sent at", datetime.now().isoformat())
    return jsonify({"success": True, "message": "Reminder sent"})


if __name__ == "__main__":
    app.run(debug=True)
