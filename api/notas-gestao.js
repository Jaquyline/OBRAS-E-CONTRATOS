// Busca as notas tomadas (NFS-e e NF-e) da construtora no Vetor Gestão, que já captura pelo certificado A1.
// Só para quem está logado no Obras & Contratos. A chave combinada fica só aqui no servidor (variável OBRAS_GESTAO_TOKEN
// na Vercel do Obras = OBRAS_TOKEN na Vercel do Gestão); o navegador nunca vê essa chave.
const SUPABASE_URL = "https://jwernoyhesshbbfsmscy.supabase.co";
const SUPABASE_KEY = "sb_publishable_NnXU29l-hxQA8tpRuJsazw_OFgEd3RO";

export default async function handler(req, res) {
  try {
    const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (!token) return res.status(401).json({ error: "Faça login novamente." });
    const me = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}` } });
    if (!me.ok) return res.status(401).json({ error: "Sessão expirada. Saia e entre de novo." });
    const chave = String(process.env.OBRAS_GESTAO_TOKEN || "").trim();
    if (!chave) return res.status(500).json({ error: "Falta configurar OBRAS_GESTAO_TOKEN na Vercel do Obras & Contratos." });
    const base = String(process.env.GESTAO_URL || "https://gestao.contabilvetor.com.br").replace(/\/+$/, "");
    const q = new URLSearchParams({ cnpj: String(req.query.cnpj || ""), de: String(req.query.de || ""), ate: String(req.query.ate || "") });
    if (req.query.arquivo) q.set("arquivo", String(req.query.arquivo));
    const r = await fetch(`${base}/api/obras-notas?${q}`, { headers: { "x-obras-token": chave } });
    const j = await r.json().catch(() => ({ error: "O Gestão não respondeu." }));
    res.setHeader("Cache-Control", "no-store");
    return res.status(r.status).json(j);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
