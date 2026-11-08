// NF-e de entrada direto da SEFAZ (Ambiente Nacional) com o certificado A1 da empresa.
// - Distribuição de DF-e (NFeDistribuicaoDFe): devolve resumos/XMLs das NF-e em que a empresa é destinatária,
//   em sequência de NSU. Limite da SEFAZ: sem documentos novos (cStat 137), só consultar de novo após 1 hora.
// - Ciência da Operação (evento 210210) pelo RecepcaoEvento do Ambiente Nacional: libera o XML completo.
// Arquivo com "_" na frente: a Vercel não publica como função; é usado por api/fiscal.js.
import https from "node:https";
import crypto from "node:crypto";
import zlib from "node:zlib";
import forge from "node-forge";
// No Obras o certificado fica em PEM (chave + certificado), extraído no navegador ao enviar o .pfx
const tlsCred = (c) => ({ key: c.keyPem, cert: c.certPem });

const URLS = {
  producao: {
    dist: "https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx",
    evento: "https://www.nfe.fazenda.gov.br/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx",
    tpAmb: "1",
  },
  restrita: {
    dist: "https://hom1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx",
    evento: "https://hom.nfe.fazenda.gov.br/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx",
    tpAmb: "2",
  },
};
export const UF_COD = { RO: 11, AC: 12, AM: 13, RR: 14, PA: 15, AP: 16, TO: 17, MA: 21, PI: 22, CE: 23, RN: 24, PB: 25, PE: 26, AL: 27, SE: 28, BA: 29, MG: 31, ES: 32, RJ: 33, SP: 35, PR: 41, SC: 42, RS: 43, MS: 50, MT: 51, GO: 52, DF: 53 };

/* ---------------- certificado: chave privada + certificado do .pfx ---------------- */
export function chavesDoPfx(c) {
  return { key: forge.pki.privateKeyFromPem(c.keyPem), cert: forge.pki.certificateFromPem(c.certPem) };
}

/* ---------------- SOAP 1.2 com certificado (mTLS) ---------------- */
export function postSoap(url, xml, action, pfx, senha) {
  return new Promise((ok, erro) => {
    const corpo = Buffer.from(xml, "utf8");
    const req = https.request(
      url,
      {
        method: "POST",
        ...tlsCred(pfx, senha),
        timeout: 25000,
        headers: { "Content-Type": `application/soap+xml; charset=utf-8; action="${action}"`, "Content-Length": corpo.length },
      },
      (res) => {
        const partes = [];
        res.on("data", (d) => partes.push(d));
        res.on("end", () => ok({ status: res.statusCode, corpo: Buffer.concat(partes).toString("utf8") }));
      }
    );
    req.on("timeout", () => req.destroy(new Error("A SEFAZ demorou demais para responder.")));
    req.on("error", erro);
    req.end(corpo);
  });
}
const tag = (xml, nome) => (String(xml).match(new RegExp(`<(?:\\w+:)?${nome}[^>]*>([\\s\\S]*?)</(?:\\w+:)?${nome}>`)) || [])[1] || "";

/* ---------------- Distribuição de DF-e ---------------- */
export function xmlDist({ cnpj, uf, ultNSU, amb }) {
  const u = URLS[amb] || URLS.producao;
  const cUF = UF_COD[String(uf || "SC").toUpperCase()] || 42;
  const nsu = String(Math.max(0, Math.floor(+ultNSU || 0))).padStart(15, "0");
  return `<?xml version="1.0" encoding="utf-8"?><soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope"><soap12:Body><nfeDistDFeInteresse xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe"><nfeDadosMsg><distDFeInt xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.01"><tpAmb>${u.tpAmb}</tpAmb><cUFAutor>${cUF}</cUFAutor><CNPJ>${cnpj}</CNPJ><distNSU><ultNSU>${nsu}</ultNSU></distNSU></distDFeInt></nfeDadosMsg></nfeDistDFeInteresse></soap12:Body></soap12:Envelope>`;
}
export function lerRetDist(corpo) {
  const ret = tag(corpo, "retDistDFeInt");
  const docs = [];
  const re = /<(?:\w+:)?docZip\s+([^>]*)>([^<]*)<\/(?:\w+:)?docZip>/g;
  let m;
  while ((m = re.exec(ret))) {
    const at = m[1];
    const nsu = +((at.match(/NSU="(\d+)"/) || [])[1] || 0);
    const schema = (at.match(/schema="([^"]+)"/) || [])[1] || "";
    let xml = "";
    try {
      xml = zlib.gunzipSync(Buffer.from(m[2], "base64")).toString("utf8");
    } catch {
      xml = Buffer.from(m[2], "base64").toString("utf8");
    }
    docs.push({ nsu, schema, xml });
  }
  return { cStat: tag(ret, "cStat"), xMotivo: tag(ret, "xMotivo"), ultNSU: +tag(ret, "ultNSU") || 0, maxNSU: +tag(ret, "maxNSU") || 0, docs, bruto: ret ? "" : String(corpo).slice(0, 400) };
}
export async function distribuir({ cnpj, uf, ultNSU, amb, pfx, senha, tempoMax = 40000 }) {
  const u = URLS[amb] || URLS.producao;
  const inicio = Date.now();
  let nsu = +ultNSU || 0;
  let maxNSU = 0;
  const docs = [];
  let ultimo = { cStat: "", xMotivo: "" };
  while (Date.now() - inicio < tempoMax) {
    const r = await postSoap(u.dist, xmlDist({ cnpj, uf, ultNSU: nsu, amb }), "http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe/nfeDistDFeInteresse", pfx, senha);
    if (r.status >= 500 && !/retDistDFeInt/.test(r.corpo)) throw Object.assign(new Error(`A SEFAZ respondeu com erro (${r.status}). Tente mais tarde.`), { status: 502 });
    const ret = lerRetDist(r.corpo);
    ultimo = ret;
    if (!ret.cStat) throw Object.assign(new Error("Resposta inesperada da SEFAZ: " + (ret.bruto || r.status)), { status: 502 });
    if (ret.cStat === "137") {
      // nenhum documento novo: a SEFAZ pede para só consultar de novo depois de 1 hora
      if (ret.ultNSU) nsu = ret.ultNSU;
      maxNSU = ret.maxNSU || nsu;
      break;
    }
    if (ret.cStat !== "138") break; // 656 (consumo indevido) e outras rejeições: para e devolve o motivo
    docs.push(...ret.docs);
    nsu = ret.ultNSU || nsu;
    maxNSU = ret.maxNSU || maxNSU;
    if (nsu >= maxNSU) break;
  }
  return { docs, ultNSU: nsu, maxNSU, cStat: ultimo.cStat, xMotivo: ultimo.xMotivo, fim: nsu >= maxNSU };
}

/* ---------------- Ciência da Operação (evento 210210), assinada (XMLDSig, C14N, RSA-SHA1) ---------------- */
const NS_NFE = "http://www.portalfiscal.inf.br/nfe";
const NS_DS = "http://www.w3.org/2000/09/xmldsig#";
const C14N = "http://www.w3.org/TR/2001/REC-xml-c14n-20010315";
function agoraBR() {
  const d = new Date(Date.now() - 3 * 3600 * 1000 - 60 * 1000); // horário de Brasília, 1 min antes (evita "data futura")
  return d.toISOString().slice(0, 19) + "-03:00";
}
export const EVENTOS_DEST = { ciencia: ["210210", "Ciencia da Operacao"], confirmacao: ["210200", "Confirmacao da Operacao"] };
export function eventoCiencia({ cnpj, chave, key, cert, amb, dh, tipo }) {
  const [tpEv, descEv] = EVENTOS_DEST[tipo] || EVENTOS_DEST.ciencia;
  const u = URLS[amb] || URLS.producao;
  const id = `ID${tpEv}${chave}01`;
  const corpo = `<cOrgao>91</cOrgao><tpAmb>${u.tpAmb}</tpAmb><CNPJ>${cnpj}</CNPJ><chNFe>${chave}</chNFe><dhEvento>${dh || agoraBR()}</dhEvento><tpEvento>${tpEv}</tpEvento><nSeqEvento>1</nSeqEvento><verEvento>1.00</verEvento><detEvento versao="1.00"><descEvento>${descEv}</descEvento></detEvento>`;
  // forma canônica (C14N) do infEvento dentro de <evento xmlns="...nfe">: o namespace herdado aparece no elemento
  const infCanon = `<infEvento xmlns="${NS_NFE}" Id="${id}">${corpo}</infEvento>`;
  const digest = crypto.createHash("sha1").update(infCanon, "utf8").digest("base64");
  const signedInfoInterno = `<CanonicalizationMethod Algorithm="${C14N}"></CanonicalizationMethod><SignatureMethod Algorithm="${NS_DS}rsa-sha1"></SignatureMethod><Reference URI="#${id}"><Transforms><Transform Algorithm="${NS_DS}enveloped-signature"></Transform><Transform Algorithm="${C14N}"></Transform></Transforms><DigestMethod Algorithm="${NS_DS}sha1"></DigestMethod><DigestValue>${digest}</DigestValue></Reference>`;
  const siCanon = `<SignedInfo xmlns="${NS_DS}">${signedInfoInterno}</SignedInfo>`;
  const md = forge.md.sha1.create();
  md.update(siCanon, "utf8");
  const assinatura = forge.util.encode64(key.sign(md));
  const certB64 = forge.util.encode64(forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes());
  return `<evento xmlns="${NS_NFE}" versao="1.00"><infEvento Id="${id}">${corpo}</infEvento><Signature xmlns="${NS_DS}"><SignedInfo>${signedInfoInterno}</SignedInfo><SignatureValue>${assinatura}</SignatureValue><KeyInfo><X509Data><X509Certificate>${certB64}</X509Certificate></X509Data></KeyInfo></Signature></evento>`;
}
export function xmlEnvEvento(eventos) {
  const lote = String(Date.now()).slice(-15);
  return `<?xml version="1.0" encoding="utf-8"?><soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope"><soap12:Body><nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4"><envEvento xmlns="${NS_NFE}" versao="1.00"><idLote>${lote}</idLote>${eventos.join("")}</envEvento></nfeDadosMsg></soap12:Body></soap12:Envelope>`;
}
export async function cienciaLote({ cnpj, chaves, amb, pfx, senha, tipo }) {
  const u = URLS[amb] || URLS.producao;
  const { key, cert } = chavesDoPfx(pfx);
  const out = [];
  for (let i = 0; i < chaves.length; i += 20) {
    const parte = chaves.slice(i, i + 20);
    const xml = xmlEnvEvento(parte.map((chave) => eventoCiencia({ cnpj, chave, key, cert, amb, tipo })));
    const r = await postSoap(u.evento, xml, "http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4/nfeRecepcaoEventoNF", pfx, senha);
    const ret = tag(r.corpo, "retEnvEvento");
    const cLote = tag(ret, "cStat");
    if (!ret || (cLote !== "128" && !/<retEvento/.test(ret))) {
      parte.forEach((chave) => out.push({ chave, ok: false, cStat: cLote || String(r.status), xMotivo: tag(ret, "xMotivo") || "Resposta inesperada da SEFAZ" }));
      continue;
    }
    const re = /<(?:\w+:)?retEvento[\s\S]*?<\/(?:\w+:)?retEvento>/g;
    const vistos = new Set();
    let m;
    while ((m = re.exec(ret))) {
      const chave = tag(m[0], "chNFe");
      const cStat = tag(m[0], "cStat");
      vistos.add(chave);
      // 135 = registrado; 136 = registrado sem vínculo; 573 = duplicidade (já tinha ciência)
      out.push({ chave, ok: ["135", "136", "573"].includes(cStat), cStat, xMotivo: tag(m[0], "xMotivo") });
    }
    parte.filter((c) => !vistos.has(c)).forEach((chave) => out.push({ chave, ok: false, cStat: cLote, xMotivo: tag(ret, "xMotivo") }));
  }
  return out;
}
