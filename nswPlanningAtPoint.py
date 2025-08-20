import json
import requests

BASE_URL = "https://mapprod3.environment.nsw.gov.au/arcgis/rest/services/Planning/EPI_Primary_Planning_Layers/MapServer"

def query_layer(layer, geometry):
    url = f"{BASE_URL}/{layer}/query"
    params = {
        "geometry": geometry,
        "geometryType": "esriGeometryPoint",
        "inSR": 4326,
        "spatialRel": "esriSpatialRelIntersects",
        "outFields": "*",
        "returnGeometry": False,
        "f": "json"
    }
    resp = requests.get(url, params=params)
    data = resp.json()
    if "features" in data and data["features"]:
        return data["features"][0]["attributes"]
    return None

# Vercel looks for this "handler"
def handler(request):
    try:
        body = json.loads(request.body.decode())
        geometry = body["geometry"]
        zoning = query_layer(2, geometry)
        fsr = query_layer(1, geometry)
        height = query_layer(5, geometry)
        return {
            "statusCode": 200,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({
                "zoning": zoning,
                "fsr": fsr,
                "height": height
            })
        }
    except Exception as e:
        return {
            "statusCode": 500,
            "body": str(e)
        }
