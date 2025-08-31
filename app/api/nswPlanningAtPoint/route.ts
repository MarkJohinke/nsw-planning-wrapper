/**
 * nswPlanningAtPoint – hybrid:
 * - If POINT_API_KEY exists -> use NSW Point (v2) like before.
 * - Else -> fallback to public ArcGIS REST layers (no key).
 */
export const runtime = "nodejs";

type Overlays = { bushfire?: string|null; flood?: string|null; heritage?: string|null; easements?: string|null; [k: string]: any };
type SeppRuleResult = { label: string; pass: boolean; details?: string };
type SeppCompliance = { Duplex?: SeppRuleResult[]; Townhouse?: SeppRuleResult[]; Manor?: SeppRuleResult[]; RFB?: SeppRuleResult[] };
type FeasibilityRow = { option: string; gdv?: number; build_cost?: number; margin?: number; margin_pct?: number; notes?: string };

const POINT_BASE = "https://point.digital.nsw.gov.au";
const POINT_API_KEY = process.env.POINT_API_KEY;

// --- TEMP: ArcGIS layers (no auth). Update these 3 URLs to the exact layers you prefer.
const ARCGIS = {
  // Common setup is a MapServer layer per theme. Replace with the layers you use.
  // Examples shown with numeric layer IDs; tweak to your known services.
  zoning: "https://mapprod3.environment.nsw.gov.au/arcgis/rest/services/Planning/Planning_Portal/MapServer/2",
  fsr:    "https://mapprod3.environment.nsw.gov.au/arcgis/rest/services/Planning/Planning_Portal/MapServer/1",
  hob:    "https://mapprod3.environment.nsw.gov.au/arcgis/rest/services/Planning/Planning_Portal/MapServer/5",
};

function badRequest(msg: string) {
  return new Response(JSON.stringify({ ok:false, error: msg }), { status:400, headers:{ "content-type":"application/json" }});
}
function serverError(msg: string, extra?: any) {
  console.error("SERVER_ERROR", msg, extra ?? "");
  return new Response(JSON.stringify({ ok:false, error: msg }), { status:500, headers:{ "content-type":"application/json" }});
}

/** Query an ArcGIS Feature/MapServer layer by point (WGS84) and return first feature attributes */
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
  const j = await r.json();
  const attrs = j?.features?.[0]?.attributes ?? null;
  return attrs;
}

function pick(attrs: any, keys: string[], def: string|null = null) {
  if (!attrs) return def;
  for (const k of keys) {
    if (attrs[k] != null && attrs[k] !== "") return String(attrs[k]);
  }
  return def;
}

async function viaArcGis(lon: number, lat: number) {
  // Query each layer, tolerate nulls if nothing intersects
  const [zAttrs, fsrAttrs, hobAttrs] = await Promise.allSettled([
    queryArcGisPoint(ARCGIS.zoning, lon, lat),
    queryArcGisPoint(ARCGIS.fsr,    lon, lat),
    queryArcGisPoint(ARCGIS.hob,    lon, lat),
  ]);

  const zoning = zAttrs.status === "fulfilled" ? pick(zAttrs.value, ["ZONE","ZONING","ZoneCode","Zone","LABEL"]) : null;
  const fsr    = fsrAttrs.status === "fulfilled" ? pick(fsrAttrs.value, ["FSR","MAX_FSR","Fsr","RATIO","LABEL"]) : null;
  const hob    = hobAttrs.status === "fulfilled" ? pick(hobAttrs.value, ["HOB","HEIGHT","MaxHeight","LABEL"]) : null;

  // No address from ArcGIS here; callers can pass ?address=... for display only
  return { zoning, fsr, hob };
}

async function viaPoint(addressArg: string|undefined, lon: number, lat: number) {
  // NSW Point v2 doesn’t expose a generic “by lat/lon zoning/fsr/hob” endpoint in one call,
  // but its docs you opened include: addressValidation*, predictive*, adminBoundaries, propertyLotDp, etc.
  // Minimal viable flow: use predictive/addressValidation to resolve an address (if not provided),
  // then use propertyLotDp/adminBoundaries for lot/admin info. You can expand this later.
  // Here we just call adminBoundaries to prove auth + location works.

  const headers = { "x-api-key": POINT_API_KEY as string };

  // Example: admin boundaries near the point (documented in the swagger you saw)
  const url = new URL(POINT_BASE + "/v2/api/adminBoundaries");
  url.searchParams.set("lon", String(lon));
  url.searchParams.set("lat", String(lat));

  const r = await fetch(url.toString(), { headers });
  if (!r.ok) {
    const text = await r.text();
    return { error: "upstream error (Point)", status: r.status, body: text };
  }
  const data = await r.json();

  // Map to our schema (zoning/fsr/hob may remain null until you stitch an internal mapping).
  return {
    zoning: null,
    fsr: null,
    hob: null,
    _pointAdmin: data, // keep for diagnostics so you can wire proper mappings later
  };
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const lat = searchParams.get("lat");
    const lon = searchParams.get("lon");
    const address = searchParams.get("address") ?? "";

    if (!lat || !lon) return badRequest("lat/lon required");
    const latNum = Number(lat);
    const lonNum = Number(lon);
    if (Number.isNaN(latNum) || Number.isNaN(lonNum)) return badRequest("lat/lon must be numbers");

    // 1) Prefer NSW Point if key is present; else 2) ArcGIS fallback
    let zoning: string|null = null, fsr: string|null = null, hob: string|null = null;
    let diagnostics: any = {};
    if (POINT_API_KEY) {
      const res = await viaPoint(address || undefined, lonNum, latNum);
      if ((res as any).error) {
        diagnostics.point = res;
      } else {
        diagnostics.point = res;
        zoning = (res as any).zoning ?? null;
        fsr    = (res as any).fsr ?? null;
        hob    = (res as any).hob ?? null;
      }
    }

    if (!POINT_API_KEY || (!zoning && !fsr && !hob)) {
      const arc = await viaArcGis(lonNum, latNum);
      diagnostics.arcgis = arc;
      zoning = zoning ?? arc.zoning;
      fsr    = fsr    ?? arc.fsr;
      hob    = hob    ?? arc.hob;
    }

    const overlays: Overlays = {
      bushfire: null, flood: null, heritage: null, easements: null,
    };

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

    const payload = {
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
    };

    return new Response(JSON.stringify(payload), { headers: { "content-type":"application/json" }});
  } catch (e:any) {
    return serverError("handler crash", e?.stack || e);
  }
}