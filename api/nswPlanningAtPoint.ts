import type { VercelRequest, VercelResponse } from "@vercel/node";

type Overlays = { bushfire?: string|null; flood?: string|null; heritage?: string|null; easements?: string|null; [k: string]: any };
type SeppRuleResult = { label: string; pass: boolean; details?: string };
type SeppCompliance = { Duplex?: SeppRuleResult[]; Townhouse?: SeppRuleResult[]; Manor?: SeppRuleResult[]; RFB?: SeppRuleResult[] };
type FeasibilityRow = { option: string; gdv?: number; build_cost?: number; margin?: number; margin_pct?: number; notes?: string };

const POINT_BASE = "https://point.digital.nsw.gov.au";
const POINT_API_KEY = process.env.POINT_API_KEY || "";

const ARCGIS = {
  zoning: "https://mapprod3.environment.nsw.gov.au/arcgis/rest/services/Planning/Planning_Portal/MapServer/2",
  fsr:    "https://mapprod3.environment.nsw.gov.au/arcgis/rest/services/Planning/Planning_Portal/MapServer/1",
  hob:    "https://mapprod3.environment.nsw.gov.au/arcgis/rest/services/Planning/Planning_Portal/MapServer/5",
};

function badRequest(res: VercelResponse, msg: string) {
  return res.status(400).json({ ok:false, error: msg });
}
function serverError(res: VercelResponse, msg: string, extra?: any) {
  console.error("SERVER_ERROR", msg, extra ?? "");
  return res.status(500).json({ ok:false, error: msg });
}

async function queryArcGisPoint(layerUrl: string, lon: number, lat: number) {
  const geom = encodeURIComponent(JSON.stringify({ x: lon, y: lat, spatialReference: { wkid: 4326 }}));
  const params = new URLSearchParams({
    f: "json",
    geometry: geom,
    geometryType: "esriGeometryPoint",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields: "*",
    returnGeometry: "false",
  });
  const url = `${layerUrl}/query?${params.toString()}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`ArcGIS layer failed: ${layerUrl} status=${r.status}`);
  const j = await r.json() as any;
  return j?.features?.[0]?.attributes ?? null;
}

function pick(attrs: any, keys: string[], def: string|null = null) {
  if (!attrs) return def;
  for (const k of keys) {
    if (attrs[k] != null && attrs[k] !== "") return String(attrs[k]);
  }
  return def;
}

async function viaArcGis(lon: number, lat: number) {
  const [zAttrs, fsrAttrs, hobAttrs] = await Promise.allSettled([
    queryArcGisPoint(ARCGIS.zoning, lon, lat),
    queryArcGisPoint(ARCGIS.fsr,    lon, lat),
    queryArcGisPoint(ARCGIS.hob,    lon, lat),
  ]);
  const zoning = zAttrs.status === "fulfilled" ? pick(zAttrs.value, ["ZONE","ZONING","ZoneCode","Zone","LABEL"]) : null;
  const fsr    = fsrAttrs.status === "fulfilled" ? pick(fsrAttrs.value, ["FSR","MAX_FSR","Fsr","RATIO","LABEL"]) : null;
  const hob    = hobAttrs.status === "fulfilled" ? pick(hobAttrs.value, ["HOB","HEIGHT","MaxHeight","LABEL"]) : null;
  return { zoning, fsr, hob };
}

async function viaPoint(lon: number, lat: number) {
  const headers = { "x-api-key": POINT_API_KEY as string };
  const url = new URL(POINT_BASE + "/v2/api/adminBoundaries");
  url.searchParams.set("lon", String(lon));
  url.searchParams.set("lat", String(lat));
  const r = await fetch(url.toString(), { headers });
  if (!r.ok) {
    const text = await r.text();
    return { error: "upstream error (Point)", status: r.status, body: text };
  }
  const data = await r.json();
  return { zoning: null, fsr: null, hob: null, _pointAdmin: data };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const lat = req.query.lat as string | undefined;
    const lon = req.query.lon as string | undefined;
    const address = (req.query.address as string | undefined) || "";
    if (!lat || !lon) return badRequest(res, "lat/lon required");
    const latNum = Number(lat), lonNum = Number(lon);
    if (Number.isNaN(latNum) || Number.isNaN(lonNum)) return badRequest(res, "lat/lon must be numbers");

    let zoning: string|null = null, fsr: string|null = null, hob: string|null = null;
    const diagnostics: any = {};

    if (POINT_API_KEY) {
      const p = await viaPoint(lonNum, latNum);
      diagnostics.point = p;
      if (!(p as any).error) {
        zoning = (p as any).zoning ?? null;
        fsr    = (p as any).fsr ?? null;
        hob    = (p as any).hob ?? null;
      }
    }

    if (!POINT_API_KEY || (!zoning && !fsr && !hob)) {
      const a = await viaArcGis(lonNum, latNum);
      diagnostics.arcgis = a;
      zoning = zoning ?? a.zoning;
      fsr    = fsr    ?? a.fsr;
      hob    = hob    ?? a.hob;
    }

    const overlays: Overlays = { bushfire:null, flood:null, heritage:null, easements:null };
    const sepp_compliance: SeppCompliance = {
      Duplex:    [{ label:"Front setback meets control", pass:true,  details:"placeholder" }],
      Townhouse: [{ label:"Landscaping % achieved",      pass:false, details:"calc pending" }],
      Manor:     [{ label:"Solar access 2hrs",           pass:false }],
      RFB:       [{ label:"ADG 3F-1 separation",         pass:false }, { label:"Rear setback ≥ 6m", pass:false }],
    };
    const feasibility: FeasibilityRow[] = [
      { option:"Duplex", notes:"placeholder" },
      { option:"RFB 3F", notes:"placeholder" },
    ];

    return res.status(200).json({
      ok: true,
      address: address || "Address TBC",
      coords: { lat: latNum, lon: lonNum },
      zoning, fsr, hob,
      overlays,
      sepp_compliance,
      feasibility,
      recommendations: [
        "Obtain survey for precise setbacks/width/depth",
        "Run LMR/Housing SEPP variant with measured site geometry",
        "Confirm overlays with council GIS",
      ],
      overall_recommendation: "Further due diligence",
      diagnostics,
    });
  } catch (e:any) {
    return serverError(res, "handler crash", e?.stack || e);
  }
}