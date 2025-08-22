from flask import Flask, request, jsonify
import requests

app = Flask(__name__)

@app.route("/geocode")
def geocode():
    address = request.args.get("q")
    if not address:
        return jsonify({"error": "Missing address parameter"}), 400

    url = "https://nominatim.openstreetmap.org/search"
    params = {"q": address, "format": "json", "limit": 1}
    headers = {"User-Agent": "northern-beaches-dev/1.0 (your-email@example.com)"}

    try:
        r = requests.get(url, params=params, headers=headers, timeout=10)
        r.raise_for_status()
        return jsonify(r.json())
    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    # Render & Fly.io will auto-detect port from environment
    import os
    port = int(os.environ.get("PORT", 8080))
    app.run(host="0.0.0.0", port=port)
