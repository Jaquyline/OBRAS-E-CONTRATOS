// Captura das notas tomadas direto nos órgãos, com o certificado A1 guardado no próprio Obras & Contratos
// (independente do Vetor Gestão):
//  - acao "nfse":    NFS-e no Ambiente de Dados Nacional (Portal Nacional), por NSU
//  - acao "nfe":     NF-e na Distribuição DF-e da SEFAZ (Ambiente Nacional), por NSU
//  - acao "ciencia": Ciência da Operação nas NF-e que só vieram em resumo (libera o XML completo)
// Só para quem está logado no Obras; o certificado é lido do banco com o login da própria pessoa.
import https from "node:https";
import zlib from "node:zlib";
import { distribuir, cienciaLote, consultarChave } from "./_nfe.js";

export const config = { maxDuration: 60 };
const SUPABASE_URL = "https://jwernoyhesshbbfsmscy.supabase.co";
const SUPABASE_KEY = "sb_publishable_NnXU29l-hxQA8tpRuJsazw_OFgEd3RO";
const ADN = "https://adn.nfse.gov.br/contribuintes";
const dig = (s) => String(s || "").replace(/\D/g, "");
const campo = (o, ...n) => { for (const x of n) for (const k of Object.keys(o || {})) if (k.toLowerCase() === x.toLowerCase()) return o[k]; return undefined; };
function getAdn(url, c) {
  return new Promise((ok, erro) => {
    const req = https.request(url, { method: "GET", key: c.keyPem, cert: c.certPem, headers: { Accept: "application/json" }, timeout: 25000 }, (res) => {
      const p = [];
      res.on("data", (d) => p.push(d));
      res.on("end", () => { const corpo = Buffer.concat(p).toString("utf8"); let json = null; try { json = JSON.parse(corpo); } catch {} ok({ status: res.statusCode, corpo, json }); });
    });
    req.on("timeout", () => req.destroy(new Error("O Portal Nacional demorou demais para responder.")));
    req.on("error", erro);
    req.end();
  });
}
const abrirXml = (b64) => { const b = Buffer.from(String(b64 || ""), "base64"); try { return zlib.gunzipSync(b).toString("utf8"); } catch { return b.toString("utf8"); } };

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Use POST." });
    const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (!token) return res.status(401).json({ error: "Faça login novamente." });
    const me = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}` } });
    if (!me.ok) return res.status(401).json({ error: "Sessão expirada. Saia e entre de novo." });
    const b = req.body || {};
    const cnpj = dig(b.cnpj);
    if (cnpj.length !== 14) return res.status(400).json({ error: "CNPJ inválido." });
    const chaveCert = String(b.chaveCertificado || "certificado-fiscal-jg");
    if (!/^[\w:-]+$/.test(chaveCert)) return res.status(400).json({ error: "Certificado inválido." });
    const rc = await fetch(`${SUPABASE_URL}/rest/v1/kv_store?select=value&key=eq.${encodeURIComponent(chaveCert)}`, { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}` } });
    const linha = rc.ok ? (await rc.json())[0] : null;
    const cert = linha ? (typeof linha.value === "string" ? JSON.parse(linha.value) : linha.value) : null;
    if (!cert || !cert.keyPem || !cert.certPem) return res.status(404).json({ error: 'Envie o certificado A1 na seção "Certificado digital" antes de buscar.' });
    if (cert.validoAte && new Date(cert.validoAte) < new Date()) return res.status(400).json({ error: `O certificado venceu em ${new Date(cert.validoAte).toLocaleDateString("pt-BR")}. Envie o novo.` });

    if (b.acao === "nfse") {
      let nsu = Math.max(0, Math.floor(+b.nsu || 0));
      const docs = [];
      let fim = false, bytes = 0;
      const inicio = Date.now();
      while (Date.now() - inicio < 40000 && bytes < 3000000) {
        const r = await getAdn(`${ADN}/DFe/${nsu}?lote=true&cnpjConsulta=${cnpj}`, cert);
        const j = r.json || {};
        const st = String(campo(j, "StatusProcessamento") || "");
        if (r.status === 404 || /NENHUM_DOCUMENTO/i.test(st)) { fim = true; break; }
        if (r.status >= 400 || /REJEICAO/i.test(st)) {
          const erros = campo(j, "Erros") || [];
          const msg = (Array.isArray(erros) ? erros : [erros]).map((e) => [campo(e, "Codigo"), campo(e, "Descricao")].filter(Boolean).join(" - ")).filter(Boolean).join("; ");
          return res.status(502).json({ error: `O Portal Nacional recusou a consulta (${r.status}${msg ? ": " + msg : ""}).`, docs, ultimoNsu: nsu });
        }
        let maior = nsu;
        for (const d of campo(j, "LoteDFe") || []) {
          const n = +campo(d, "NSU") || 0;
          if (n <= nsu && nsu !== 0) continue;
          if (n > maior) maior = n;
          const xml = abrirXml(campo(d, "ArquivoXml"));
          bytes += xml.length;
          docs.push({ nsu: n, chave: campo(d, "ChaveAcesso") || "", tipo: String(campo(d, "TipoDocumento") || ""), xml });
        }
        if (maior <= nsu) { fim = true; break; }
        nsu = maior;
      }
      return res.status(200).json({ docs, ultimoNsu: nsu, fim });
    }
    if (b.acao === "nfe") {
      const r = await distribuir({ cnpj, uf: b.uf || "SC", ultNSU: b.nsu || 0, amb: "producao", pfx: cert, tempoMax: 40000 });
      return res.status(200).json(r);
    }
    if (b.acao === "nfe_chave") {
      const chave = dig(b.chave);
      if (chave.length !== 44) return res.status(400).json({ error: "Chave de acesso inválida." });
      return res.status(200).json(await consultarChave({ cnpj, uf: b.uf || "SC", chave, amb: "producao", pfx: cert }));
    }
    if (b.acao === "ciencia" || b.acao === "confirmar") {
      const chaves = (Array.isArray(b.chaves) ? b.chaves : []).map(dig).filter((c) => c.length === 44).slice(0, 100);
      return res.status(200).json({ resultados: await cienciaLote({ cnpj, chaves, amb: "producao", pfx: cert, tipo: b.acao === "confirmar" ? "confirmacao" : "ciencia" }) });
    }
    return res.status(400).json({ error: "Ação desconhecida." });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message });
  }
}
