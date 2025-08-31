export const runtime = 'nodejs';

type Overlays = { bushfire?: string|null; flood?: string|null; heritage?: string|null; easements?: string|null; [k: string]: any };
type SeppRuleResult = { label: string; pass: boolean; details?: string };
type SeppCompliance = { Duplex?: SeppRuleResult[]; Townhouse?: SeppRuleResult[]; Manor?: SeppRuleResult[]; RFB?: SeppRuleResult[] };
type FeasibilityRow = { option: string; gdv?: number; build_cost?: number; margin?: number; margin_pct?: number; notes?: string };

const POINT_URL = "https://point.digital.nsw.gov.au/v3/lookup";
const POINT_API_KEY = process.env.POINT_API_KEY;

function badRequest(msg: string) {
  return new Response(JSON.stringify({ ok:false, error: msg }), { status:400, headers:{'content-type':'application/json'}});
}
function serverError(msg: string, extra?: any) {
  console.error('SERVER_ERROR', msg, extra??'');
  return new Response(JSON.stringify({ ok:false, error: msg }), { status:500, headers:{'content-type':'application/json'}});
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const lat = searchParams.get('lat');
    const lon = searchParams.get('lon');
    const address = searchParams.get('address') ?? '';
    if (!lat || !lon) return badRequest('lat/lon required');
    const latNum = Number(lat), lonNum = Number(lon);
    if (Number.isNaN(latNum) || Number.isNaN(lonNum)) return badRequest('lat/lon must be numbers');

    if (!POINT_API_KEY) return serverError('server misconfig: POINT_API_KEY missing');

    const url = `${POINT_URL}?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`;
    const r = await fetch(url, { headers: { 'x-api-key': POINT_API_KEY }});
    if (!r.ok) {
      const text = await r.text();
      return new Response(JSON.stringify({ ok:false, error:'upstream error', status:r.status, body:text }), { status:502, headers:{'content-type':'application/json'}});
    }
    const raw = await r.json();

    const zoning = raw?.planning?.zoning ?? null;
    const fsr   = raw?.planning?.fsr ?? null;
    const hob   = raw?.planning?.hob ?? null;

    const overlays: Overlays = {
      bushfire:  raw?.hazards?.bushfire ?? null,
      flood:     raw?.hazards?.flood ?? null,
      heritage:  raw?.heritage ?? null,
      easements: raw?.cadastral?.easements ?? null,
    };

    const sepp_compliance: SeppCompliance = {
      Duplex:    [{ label:'Front setback meets control', pass:true,  details:'placeholder' }],
      Townhouse: [{ label:'Landscaping % achieved',      pass:false, details:'calc pending' }],
      Manor:     [{ label:'Solar access 2hrs',           pass:false }],
      RFB:       [{ label:'ADG 3F-1 separation',         pass:false }, { label:'Rear setback ≥ 6m', pass:false }],
    };

    const feasibility: FeasibilityRow[] = [
      { option:'Duplex', notes:'placeholder' },
      { option:'RFB 3F', notes:'placeholder' },
    ];

    const payload = {
      ok: true,
      address: address || raw?.address?.fullAddress || 'Address TBC',
      coords: { lat: latNum, lon: lonNum },
      zoning, fsr, hob,
      overlays,
      sepp_compliance,
      feasibility,
      recommendations: [
        'Obtain survey for precise setbacks/width/depth',
        'Run LMR/Housing SEPP variant with measured site geometry',
        'Confirm overlays with council GIS'
      ],
      overall_recommendation: 'Further due diligence',
      diagnostics: { upstream_sample: raw?.address ? { address: raw.address } : raw },
    };

    return new Response(JSON.stringify(payload), { headers:{'content-type':'application/json'}});
  } catch (e:any) {
    return serverError('handler crash', e?.stack || e);
  }
}