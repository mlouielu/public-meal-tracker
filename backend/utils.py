# Rate limiting decorator function for Flask applications

from functools import wraps
from flask import request, jsonify
from datetime import datetime, timezone, timedelta

# In-memory storage for rate limiting
# In a production environment, use Redis or another shared cache instead
rate_limit_store = {}


def rate_limit(limit_count, limit_period):
    """
    Rate limiting decorator that limits requests based on client IP.

    Args:
        limit_count: Maximum number of requests allowed in the time period
        limit_period: Time period in seconds

    Usage:
        @app.route('/api/endpoint')
        @rate_limit(5, 3600)  # 5 requests per hour
        def my_endpoint():
            return jsonify({"message": "This endpoint is rate limited"})
    """

    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            # Get client IP address
            client_ip = request.remote_addr

            # Current time
            current_time = datetime.now(timezone.utc)

            # Rate limit key for this function and IP
            # This allows different rate limits for different endpoints
            rate_limit_key = f"{func.__name__}:{client_ip}"

            # Initialize or get the rate limit data for this IP and endpoint
            if rate_limit_key not in rate_limit_store:
                rate_limit_store[rate_limit_key] = {
                    "count": 0,
                    "reset_time": current_time + timedelta(seconds=limit_period),
                }

            # Check if we need to reset the counter
            if current_time > rate_limit_store[rate_limit_key]["reset_time"]:
                rate_limit_store[rate_limit_key] = {
                    "count": 0,
                    "reset_time": current_time + timedelta(seconds=limit_period),
                }

            # Check if rate limit exceeded
            if rate_limit_store[rate_limit_key]["count"] >= limit_count:
                reset_time = rate_limit_store[rate_limit_key]["reset_time"]
                time_left = int((reset_time - current_time).total_seconds())

                response = jsonify(
                    {
                        "error": "Rate limit exceeded",
                        "message": f"Too many requests. Try again in {time_left} seconds.",
                        "retry_after": time_left,
                    }
                )

                # Set rate limit headers
                response.headers["Retry-After"] = str(time_left)
                response.headers["X-RateLimit-Limit"] = str(limit_count)
                response.headers["X-RateLimit-Remaining"] = "0"
                response.headers["X-RateLimit-Reset"] = str(time_left)

                return response, 429

            # Increment the counter
            rate_limit_store[rate_limit_key]["count"] += 1

            # Calculate remaining requests
            requests_remaining = limit_count - rate_limit_store[rate_limit_key]["count"]
            reset_time = rate_limit_store[rate_limit_key]["reset_time"]
            time_left = int((reset_time - current_time).total_seconds())

            # Execute the original function
            response = func(*args, **kwargs)

            # If response is a tuple (response, status_code)
            if isinstance(response, tuple):
                response_obj, status_code = response
                # Convert to response object if it's a dict
                if isinstance(response_obj, dict):
                    response_obj = jsonify(response_obj)
                response_obj.headers["X-RateLimit-Limit"] = str(limit_count)
                response_obj.headers["X-RateLimit-Remaining"] = str(requests_remaining)
                response_obj.headers["X-RateLimit-Reset"] = str(time_left)
                return response_obj, status_code

            # If response is already a Response object
            if hasattr(response, "headers"):
                response.headers["X-RateLimit-Limit"] = str(limit_count)
                response.headers["X-RateLimit-Remaining"] = str(requests_remaining)
                response.headers["X-RateLimit-Reset"] = str(time_left)
                return response

            # If response is just a dict or other value
            response_obj = (
                jsonify(response) if not hasattr(response, "headers") else response
            )
            response_obj.headers["X-RateLimit-Limit"] = str(limit_count)
            response_obj.headers["X-RateLimit-Remaining"] = str(requests_remaining)
            response_obj.headers["X-RateLimit-Reset"] = str(time_left)

            return response_obj

        return wrapper

    return decorator
