import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://maximos-store-new.vercel.app",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const allowed = new Set([
  "orders.read", "orders.manage", "customers.read", "customers.manage",
  "returns.manage", "products.manage", "store.manage", "shipping.manage",
  "payments.manage", "reports.profit", "staff.manage", "audit.read", "audit.write"
]);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  try {
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\\s+/i, "");
    if (!token) return new Response(JSON.stringify({ error: "Authentication required" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const url = Deno.env.get("SUPABASE_URL") || "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!url || !anonKey || !serviceKey) throw new Error("Required Supabase function secrets are missing.");
    const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } });
    const { data: authData, error: authError } = await userClient.auth.getUser(token);
    if (authError || !authData.user) return new Response(JSON.stringify({ error: "Invalid session" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
    const { data: profile, error: profileError } = await admin.from("profiles").select("is_admin").eq("id", authData.user.id).maybeSingle();
    if (profileError) throw profileError;
    if (!profile?.is_admin) return new Response(JSON.stringify({ error: "Only the store owner can invite staff." }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const body = await req.json();
    const email = String(body.email || "").trim().toLowerCase();
    const displayName = String(body.display_name || "").trim();
    const role = String(body.role || "staff").trim();
    if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)) return new Response(JSON.stringify({ error: "Enter a valid email address." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const permissions: Record<string, boolean> = {};
    for (const key of Array.isArray(body.permissions) ? body.permissions : []) if (allowed.has(String(key))) permissions[String(key)] = true;
    const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, { data: { display_name: displayName, invited_for: "maximos_staff" } });
    if (inviteError) throw inviteError;
    if (!invited.user?.id) throw new Error("The invitation did not return a user ID.");
    const { error: roleError } = await admin.from("staff_roles").upsert({ user_id: invited.user.id, display_name: displayName || email, role, permissions, active: true, created_by: authData.user.id, updated_at: new Date().toISOString() });
    if (roleError) throw roleError;
    return new Response(JSON.stringify({ ok: true, user_id: invited.user.id, email }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});