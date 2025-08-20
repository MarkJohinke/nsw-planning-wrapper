from fastapi import FastAPI, Request
import requests

app = FastAPI()

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

@app.post("/api/nswPlanningAtPoint")
async def nsw_planning(request: Request):
    body = await request.json()
    geometry = body["geometry"]

    zoning = query_layer(2, geometry)
    fsr = query_layer(1, geometry)
    height = query_layer(5, geometry)

    return {
        "zoning": zoning,
        "fsr": fsr,
        "height": height
    }
