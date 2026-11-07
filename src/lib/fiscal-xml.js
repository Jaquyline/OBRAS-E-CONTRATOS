// Leitura dos XML das notas tomadas (no navegador), igual à do Vetor Gestão:
// NFS-e do Padrão Nacional (com as retenções) e NF-e (resumo, nota completa e eventos).
const soDigitos = (s) => String(s || "").replace(/\D/g, "");
const numXml = (s) => {
  const n = parseFloat(String(s == null ? "" : s).trim());
  return isNaN(n) ? 0 : n;
};
const mesDe = (s) => (String(s || "").match(/^(\d{4})-(\d{2})/) || []).slice(1, 3).join("-");
const TP_RET = {
  0: ["PIS/COFINS/CSLL Não Retidos", []],
  1: ["PIS/COFINS Retidos", ["pis", "cofins"]],
  2: ["PIS/COFINS Não Retidos", []],
  3: ["PIS/COFINS/CSLL Retidos", ["pis", "cofins", "csll"]],
  4: ["PIS/COFINS Retidos, CSLL Não Retido", ["pis", "cofins"]],
  5: ["PIS Retido, COFINS/CSLL Não Retido", ["pis"]],
  6: ["COFINS Retido, PIS/CSLL Não Retido", ["cofins"]],
  7: ["PIS Não Retido, COFINS/CSLL Retidos", ["cofins", "csll"]],
  8: ["PIS/COFINS Não Retidos, CSLL Retido", ["csll"]],
  9: ["COFINS Não Retido, PIS/CSLL Retidos", ["pis", "csll"]],
};
const PESO = { pis: 0.65, cofins: 3, csll: 1 };
function dividir(total, quais) {
  const out = { pis: 0, cofins: 0, csll: 0 };
  const soma = quais.reduce((t, k) => t + PESO[k], 0);
  if (!total || !soma) return out;
  quais.forEach((k) => (out[k] = Math.round(((total * PESO[k]) / soma) * 100) / 100));
  return out;
}

export function lerXmlNfse(texto) {
  const doc = new DOMParser().parseFromString(texto, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) return null;
  const inf = porNome(doc, "infNFSe")[0];
  if (!inf) return null;
  const t = (el, nome) => {
    const x = el && porNome(el, nome)[0];
    return x ? x.textContent.trim() : "";
  };
  const dps = porNome(inf, "infDPS")[0] || inf;
  const prest = porNome(dps, "prest")[0];
  const toma = porNome(dps, "toma")[0];
  const emit = porNome(inf, "emit")[0];
  const doc_ = (el) => t(el, "CNPJ") || t(el, "CPF") || t(el, "NIF");
  const valoresNfse = [...inf.children].find((c) => c.localName === "valores");
  const trib = porNome(dps, "trib")[0];
  const tribFed = trib && porNome(trib, "tribFed")[0];
  const pisCofins = tribFed && porNome(tribFed, "piscofins")[0];
  const tpRet = t(trib, "tpRetISSQN"); // 1 não retido, 2 retido pelo tomador, 3 retido pelo intermediário
  const cStat = t(inf, "cStat");
  // tpRetPisCofins: 0..9 (leiaute novo: vRetCSLL = soma dos retidos; vPis/vCofins = débito próprio)
  const tp = t(pisCofins, "tpRetPisCofins");
  const vPis = numXml(t(pisCofins, "vPis")), vCofins = numXml(t(pisCofins, "vCofins")), vRet = numXml(t(tribFed, "vRetCSLL"));
  let fed = { pis: 0, cofins: 0, csll: 0 }, fedRateado = false;
  if (tp === "1" && vPis + vCofins > 0 && Math.abs(vPis + vCofins - vRet) > 0.01) fed = { pis: vPis, cofins: vCofins, csll: vRet }; // leiaute antigo
  else if (tp === "2") fed = { pis: 0, cofins: 0, csll: vRet };
  else if (TP_RET[tp]) {
    fed = dividir(vRet, TP_RET[tp][1]);
    fedRateado = TP_RET[tp][1].length > 1 && vRet > 0;
  } else if (vRet) {
    fed = dividir(vRet, ["pis", "cofins", "csll"]);
    fedRateado = true;
  }
  const pis = fed.pis, cofins = fed.cofins;
  const nota = {
    origem: "xml",
    chave: soDigitos(inf.getAttribute("Id") || ""),
    numero: t(inf, "nNFSe"),
    competencia: mesDe(t(dps, "dCompet")),
    emissao: t(dps, "dhEmi") || t(inf, "dhProc"),
    situacao: cStat && cStat !== "100" ? "Situação " + cStat : "Regular",
    prestDoc: soDigitos(doc_(prest) || doc_(emit)),
    prestNome: t(prest, "xNome") || t(emit, "xNome"),
    tomDoc: soDigitos(doc_(toma)),
    tomNome: t(toma, "xNome"),
    codTrib: t(dps, "cTribNac"),
    valor: numXml(t(dps, "vServ")),
    bcIss: numXml(t(valoresNfse, "vBC")),
    aliqIss: t(valoresNfse, "pAliqAplic") ? t(valoresNfse, "pAliqAplic") + "%" : "",
    issRetido: tpRet === "2" || tpRet === "3",
    iss: numXml(t(valoresNfse, "vISSQN")),
    irrf: numXml(t(tribFed, "vRetIRRF")),
    inss: numXml(t(tribFed, "vRetCP")),
    csll: fed.csll,
    fedRateado,
    pis,
    cofins,
    csrf: 0,
    csrfDesc: "",
    totalRet: numXml(t(valoresNfse, "vTotalRet")),
    liquido: numXml(t(valoresNfse, "vLiq")),
    descricao: t(dps, "xDescServ").slice(0, 2000),
    infComp: (t(dps, "xInfComp") || t(inf, "xInfComp")).slice(0, 1000),
  };
  // Trava: a própria nota diz o total retido (vTotalRet). Se ele é zero, nada foi retido.
  if (t(valoresNfse, "vTotalRet") !== "" && numXml(t(valoresNfse, "vTotalRet")) === 0) {
    nota.pis = nota.cofins = nota.csll = nota.irrf = nota.inss = 0;
    nota.issRetido = false;
    nota.fedRateado = false;
  }
  nota.csrf = +(nota.pis + nota.cofins + nota.csll).toFixed(2);
  if (TP_RET[tp]) nota.csrfDesc = TP_RET[tp][0];
  else if (nota.csrf) nota.csrfDesc = "PIS/COFINS/CSLL";
  return completar(nota);
}
function porNome(el, nome) {
  return el ? [...el.getElementsByTagNameNS("*", nome)] : [];
}

function completar(n) {
  n.issRet = n.issRetido ? n.iss : 0;
  if (!n.totalRet) n.totalRet = +(n.issRet + n.irrf + n.inss + n.csrf).toFixed(2);
  n.id = n.chave || [n.prestDoc, n.numero].join("-");
  return n;
}


/* ---------------- NF-e ---------------- */
function q(el, nome) {
  if (!el) return null;
  return el.getElementsByTagNameNS("*", nome)[0] || null;
}
const t = (el, nome) => {
  const x = q(el, nome);
  return x ? x.textContent.trim() : "";
};
/* ---------------- análise de ICMS-ST / antecipação por item ---------------- */
const num = (el, nome) => +t(el, nome) || 0;
export function lerDocNfe({ nsu, schema, xml }) {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) return null;
  const raiz = doc.documentElement.localName;
  if (raiz === "resNFe") {
    const sit = t(doc, "cSitNFe");
    return {
      tipo: "res",
      nsu,
      chave: t(doc, "chNFe"),
      // número e série vêm dentro da chave de acesso (posições 23-25 e 26-34)
      serie: String(+t(doc, "chNFe").slice(22, 25) || ""),
      numero: String(+t(doc, "chNFe").slice(25, 34) || ""),
      emitDoc: t(doc, "CNPJ") || t(doc, "CPF"),
      emitNome: t(doc, "xNome"),
      dhEmi: t(doc, "dhEmi"),
      valor: +t(doc, "vNF") || 0,
      tpNF: t(doc, "tpNF"),
      situacao: sit === "3" ? "Cancelada" : sit === "2" ? "Denegada" : "Autorizada",
    };
  }
  if (raiz === "nfeProc" || raiz === "NFe") {
    const inf = q(doc, "infNFe");
    const ide = q(inf, "ide");
    const emit = q(inf, "emit");
    const tot = q(inf, "ICMSTot");
    const cfops = [...new Set([...inf.getElementsByTagNameNS("*", "CFOP")].map((x) => x.textContent.trim()))];
    const cStat = t(q(doc, "protNFe"), "cStat");
    return {
      tipo: "proc",
      nsu,
      xml,
      chave: String(inf.getAttribute("Id") || "").replace(/\D/g, ""),
      numero: t(ide, "nNF"),
      serie: t(ide, "serie"),
      mod: t(ide, "mod"),
      natOp: t(ide, "natOp"),
      tpNF: t(ide, "tpNF"),
      dhEmi: t(ide, "dhEmi") || t(ide, "dEmi"),
      emitDoc: t(emit, "CNPJ") || t(emit, "CPF"),
      emitNome: t(emit, "xNome"),
      emitUF: t(q(emit, "enderEmit"), "UF"),
      valor: +t(tot, "vNF") || 0,
      vICMS: +t(tot, "vICMS") || 0,
      vST: +t(tot, "vST") || 0,
      vIPI: +t(tot, "vIPI") || 0,
      itens: inf.getElementsByTagNameNS("*", "det").length,
      cfops,
      situacao: cStat === "110" || cStat === "301" || cStat === "302" ? "Denegada" : "Autorizada",
    };
  }
  if (raiz === "resEvento" || raiz === "procEventoNFe") {
    const tp = t(doc, "tpEvento");
    return { tipo: "evento", nsu, chave: t(doc, "chNFe"), tpEvento: tp, desc: t(doc, "xEvento") || t(doc, "descEvento"), quando: t(doc, "dhEvento") };
  }
  return null;
}

