// DANFSe no leiaute do Portal Nacional (DANFSe v2.0 — NT 008/2026), montado a partir do XML oficial da NFS-e.
// Abre numa janela própria, pronta para imprimir ou salvar em PDF. Os nomes dos municípios vêm do IBGE e o
// QR Code aponta para a consulta pública da nota no Portal Nacional.

const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// XML → leitura por caminho, ignorando prefixos de namespace
function leitor(xmlTexto) {
  const doc = new DOMParser().parseFromString(xmlTexto, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) throw new Error("XML inválido");
  const filhos = (el, nome) => (el ? [...el.children].filter((c) => c.localName === nome) : []);
  const no = (el, caminho) => caminho.split("/").reduce((e, n) => (e ? filhos(e, n)[0] || null : null), el);
  const raiz = doc.documentElement;
  const inf = raiz.localName === "infNFSe" ? raiz : no(raiz, "infNFSe");
  if (!inf) throw new Error("XML sem infNFSe");
  const v = (base, caminho) => {
    const e = no(base, caminho);
    return e ? e.textContent.trim() : "";
  };
  return { inf, no, v };
}

const dig = (s) => String(s || "").replace(/\D/g, "");
const fmtDoc = (d) => {
  const x = dig(d);
  if (x.length === 14) return x.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  if (x.length === 11) return x.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  return d || "-";
};
const fmtCep = (c) => (dig(c).length === 8 ? dig(c).replace(/^(\d{2})(\d{3})(\d{3})$/, "$1.$2-$3") : c || "");
const fmtIbge = (c) => (dig(c).length === 7 ? dig(c).replace(/^(\d{2})(\d{5})$/, "$1.$2") : c || "");
const brl = (v) => (v === "" || v == null || isNaN(+v) ? "-" : "R$ " + (+v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const pct = (v) => (v === "" || v == null || isNaN(+v) ? "-" : (+v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " %");
const dataBR = (iso) => {
  const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2}))?/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` + (m[4] ? ` ${m[4]}:${m[5]}:${m[6]}` : "") : "-";
};
const fmtTribNac = (c) => (dig(c).length === 6 ? dig(c).replace(/^(\d{2})(\d{2})(\d{2})$/, "$1.$2.$3") : c || "-");
const fmtNbs = (c) => (dig(c).length === 9 ? dig(c).replace(/^(\d)(\d{4})(\d{2})(\d{2})$/, "$1.$2.$3.$4") : c || "-");

const OP_SN = { 1: "Não optante", 2: "Optante - Microempreendedor Individual (MEI)", 3: "Optante - Microempresa ou Empresa de Pequeno Porte (ME/EPP)" };
const REG_AP_SN = { 1: "Regime de apuração dos tributos federais e municipal pelo SN", 2: "Regime de apuração dos tributos federais pelo SN e o ISSQN pela NFS-e conforme respectiva legislação municipal do tributo", 3: "Regime de apuração dos tributos federais e municipal pela NFS-e conforme respectivas legislações federal e municipal de cada tributo" };
const TRIB_ISS = { 1: "Operação Tributável", 2: "Imunidade", 3: "Exportação de Serviço", 4: "Não Incidência" };
const RET_ISS = { 1: "Não Retido", 2: "Retido pelo Tomador", 3: "Retido pelo Intermediário" };
const EMITENTE = { 1: "Prestador", 2: "Tomador", 3: "Intermediário" };
const RET_PC = {
  0: "PIS/COFINS/CSLL Não Retidos",
  1: "PIS/COFINS Retidos",
  2: "PIS/COFINS Não Retidos",
  3: "PIS/COFINS/CSLL Retidos",
  4: "PIS/COFINS Retidos, CSLL Não Retido",
  5: "PIS Retido, COFINS/CSLL Não Retido",
  6: "COFINS Retido, PIS/CSLL Não Retido",
  7: "PIS Não Retido, COFINS/CSLL Retidos",
  8: "PIS/COFINS Não Retidos, CSLL Retido",
  9: "COFINS Não Retido, PIS/CSLL Retidos",
};

export function htmlDanfseOficial(xmlTexto, extra = {}) {
  const { inf, no, v } = leitor(xmlTexto);
  const dps = no(inf, "DPS/infDPS");
  const emit = no(inf, "emit");
  const prest = no(dps, "prest");
  const toma = no(dps, "toma");
  const interm = no(dps, "interm");
  const serv = no(dps, "serv");
  const vd = no(dps, "valores");
  const vn = no(inf, "valores");
  const ibsD = no(dps, "IBSCBS");
  const ibsN = no(inf, "IBSCBS");
  const chave = String((inf.getAttribute("Id") || "").replace(/^NFS/i, "")) || extra.chave || "";
  const tpAmb = v(dps, "tpAmb");
  const ambGer = v(inf, "ambGer");
  const ufEmit = v(emit, "enderNac/UF");
  const munEmi = v(inf, "xLocEmi");
  const qr = `https://www.nfse.gov.br/ConsultaPublica/?tpc=1&chave=${chave}`;
  // células: [rótulo, valor] — municípios com data-mun para o nome vir do IBGE
  const c = (rot, val, cls = "") => `<td class="${cls}"><b>${esc(rot)}</b><span>${val === "" || val == null ? "-" : val}</span></td>`;
  const munCel = (cod, uf) => (dig(cod).length === 7 ? `<span data-mun="${dig(cod)}">${fmtIbge(cod)}</span>${uf ? " / " + esc(uf) : ""}` : "-");
  const end = (base, comNac) => {
    if (!base) return "-";
    const lg = [v(base, "xLgr"), v(base, "nro"), v(base, "xCpl"), v(base, "xBairro")].filter(Boolean).join(", ");
    return esc(lg) || "-";
  };
  // prestador: dados de cadastro vêm no grupo emit da NFS-e
  const prestDoc = v(emit, "CNPJ") || v(emit, "CPF") || v(prest, "CNPJ") || v(prest, "CPF");
  const prestCMun = v(emit, "enderNac/cMun");
  const opSN = v(prest, "regTrib/opSimpNac");
  const regAp = v(prest, "regTrib/regApTribSN");
  const tomaDoc = v(toma, "CNPJ") || v(toma, "CPF") || v(toma, "NIF");
  const tomaEnd = no(toma, "end");
  const tomaCMun = v(tomaEnd, "endNac/cMun");
  const tribMun = no(vd, "trib/tribMun");
  const tribFed = no(vd, "trib/tribFed");
  const pc = no(tribFed, "piscofins");
  const tpRetPC = v(pc, "tpRetPisCofins");
  const pcRetido = ["1", "3", "4", "5", "6", "7", "9"].includes(tpRetPC);
  const retSociais = pcRetido ? (+v(pc, "vPis") || 0) + (+v(pc, "vCofins") || 0) + (+v(tribFed, "vRetCSLL") || 0) : +v(tribFed, "vRetCSLL") || 0;
  const vServ = v(vd, "vServPrest/vServ");
  // IBS/CBS (calculado pelo Sistema Nacional e devolvido no XML da NFS-e)
  const ibsVal = no(ibsN, "valores");
  const tot = no(ibsN, "totCIBS");
  const vBCibs = v(ibsVal, "vBC");
  const vIBS = v(tot, "gIBS/vIBSTot");
  const vCBS = v(tot, "gCBS/vCBS");
  const totIbsCbs = vIBS !== "" || vCBS !== "" ? (+vIBS || 0) + (+vCBS || 0) : "";
  // tributos aproximados (Lei 12.741/2012)
  const tt = no(vd, "trib/totTrib");
  let lei = "";
  if (tt && !v(tt, "pTotTribSN") && !v(tt, "indTotTrib")) {
    const vs = +vServ || 0;
    if (no(tt, "vTotTrib")) lei = `Federais: ${brl(v(tt, "vTotTrib/vTotTribFed"))}; Estaduais: ${brl(v(tt, "vTotTrib/vTotTribEst"))}; Municipais: ${brl(v(tt, "vTotTrib/vTotTribMun"))};`;
    else if (no(tt, "pTotTrib")) lei = `Federais: ${brl((vs * (+v(tt, "pTotTrib/pTotTribFed") || 0)) / 100)}; Estaduais: ${brl((vs * (+v(tt, "pTotTrib/pTotTribEst") || 0)) / 100)}; Municipais: ${brl((vs * (+v(tt, "pTotTrib/pTotTribMun") || 0)) / 100)};`;
  }
  if (!lei) lei = "Federais: -; Estaduais: -; Municipais: -;";
  const infComp = [v(serv, "infoCompl/xInfComp"), lei ? `Totais aproximados dos Tributos cfe. Lei nº 12.741/2012: ${lei}` : ""].filter(Boolean);
  const situacao = extra.situacao || (v(inf, "cStat") === "100" || !v(inf, "cStat") ? "NFS-e Gerada" : "Situação " + v(inf, "cStat"));
  const teste = tpAmb === "2" || extra.teste;

  const corpo = `
<div class="pg">
  ${teste ? `<div class="marca">SEM VALIDADE JURÍDICA — AMBIENTE DE TESTE</div>` : ""}
  ${extra.situacao && /cancel/i.test(extra.situacao) ? `<div class="marca canc">NFS-e CANCELADA</div>` : ""}
  <table class="cab"><tr>
    <td class="logo"><div class="sig">NFS-e</div><div class="sub">Nota Fiscal de<br>Serviço eletrônica</div></td>
    <td class="tit"><div>DANFSe v2.0</div><div>Documento Auxiliar da NFS-e</div></td>
    <td class="mun"><div>Município: ${esc(munEmi || "-")}${ufEmit ? " - " + esc(ufEmit) : ""}</div><small>Ambiente Gerador: ${esc(ambGer || "-")}</small><small>Tipo de Ambiente: ${esc(tpAmb || "-")}</small></td>
  </tr></table>
  <table class="g">
    <tr><td colspan="3"><b>CHAVE DE ACESSO DA NFS-e</b><span>${esc(chave)}</span></td><td rowspan="4" class="qr"><div id="qr"></div><small>A autenticidade desta NFS-e pode ser verificada pela leitura deste código QR ou pela consulta da chave de acesso no portal nacional da NFS-e</small></td></tr>
    <tr>${c("NÚMERO DA NFS-e", esc(v(inf, "nNFSe")))}${c("COMPETÊNCIA DA NFS-e", dataBR(v(dps, "dCompet")))}${c("DATA E HORA DA EMISSÃO DA NFS-e", dataBR(v(inf, "dhProc")))}</tr>
    <tr>${c("NÚMERO DA DPS", esc(v(dps, "nDPS")))}${c("SÉRIE DA DPS", esc(v(dps, "serie")))}${c("DATA E HORA DA EMISSÃO DA DPS", dataBR(v(dps, "dhEmi")))}</tr>
    <tr>${c("EMITENTE DA NFS-e", esc(EMITENTE[v(dps, "tpEmit")] || "-"), "cin")}${c("SITUAÇÃO DA NFS-e", esc(situacao))}${c("FINALIDADE", "NFS-e regular")}</tr>
  </table>
  <table class="g">
    <tr><td class="sec cin">PRESTADOR / FORNECEDOR</td>${c("CNPJ / CPF / NIF", fmtDoc(prestDoc))}${c("Indicador Municipal (Inscrição)", esc(v(emit, "IM") || v(prest, "IM")))}${c("Telefone", esc(v(emit, "fone") || v(prest, "fone")))}</tr>
    <tr><td colspan="2"><b>Nome / Nome Empresarial</b><span>${esc(v(emit, "xNome") || v(prest, "xNome")) || "-"}</span></td>${c("Município / Sigla UF", munCel(prestCMun, ufEmit))}${c("Código IBGE / CEP", `${fmtIbge(prestCMun)} / ${fmtCep(v(emit, "enderNac/CEP"))}`)}</tr>
    <tr><td colspan="2"><b>Endereço</b><span>${end(no(emit, "enderNac"))}</span></td><td colspan="2"><b>E-mail</b><span>${esc(v(emit, "email") || v(prest, "email")) || "-"}</span></td></tr>
    <tr>${c("Simples Nacional na Data de Competência", esc(OP_SN[opSN] || "-"))}${c("Regime de Apuração Tributária pelo SN", esc(REG_AP_SN[regAp] || "-"))}<td></td><td></td></tr>
  </table>
  ${
    toma
      ? `<table class="g">
    <tr><td class="sec cin">TOMADOR / ADQUIRENTE</td>${c("CNPJ / CPF / NIF", fmtDoc(tomaDoc))}${c("Indicador Municipal (Inscrição)", esc(v(toma, "IM")))}${c("Telefone", esc(v(toma, "fone")))}</tr>
    <tr><td colspan="2"><b>Nome / Nome Empresarial</b><span>${esc(v(toma, "xNome")) || "-"}</span></td>${c("Município / Sigla UF", munCel(tomaCMun, ""))}${c("Código IBGE / CEP", tomaCMun ? `${fmtIbge(tomaCMun)} / ${fmtCep(v(tomaEnd, "endNac/CEP"))}` : "-")}</tr>
    <tr><td colspan="2"><b>Endereço</b><span>${end(tomaEnd)}</span></td><td colspan="2"><b>E-mail</b><span>${esc(v(toma, "email")) || "-"}</span></td></tr>
  </table>`
      : `<div class="faixa">TOMADOR / ADQUIRENTE NÃO IDENTIFICADO NA NFS-e</div>`
  }
  <div class="faixa">DESTINATÁRIO DA OPERAÇÃO NÃO IDENTIFICADO NA NFS-e</div>
  ${interm ? `<table class="g"><tr><td class="sec cin">INTERMEDIÁRIO</td>${c("CNPJ / CPF / NIF", fmtDoc(v(interm, "CNPJ") || v(interm, "CPF")))}${c("Nome / Nome Empresarial", esc(v(interm, "xNome")))}<td></td></tr></table>` : `<div class="faixa">INTERMEDIÁRIO DA OPERAÇÃO NÃO IDENTIFICADO NA NFS-e</div>`}
  <table class="g">
    <tr><td class="sec cin">SERVIÇO PRESTADO</td>${c("Código de Tributação Nacional/Municipal", `${fmtTribNac(v(serv, "cServ/cTribNac"))} / ${esc(v(serv, "cServ/cTribMun") || "-")}`)}${c("Código da NBS", fmtNbs(v(serv, "cServ/cNBS")))}${c("Local da Prestação / Sigla UF / País", `${esc(v(inf, "xLocPrestacao") || "-")} / ${esc(ufEmit || "-")} / -`)}</tr>
    <tr><td colspan="4"><span class="desc">${esc(v(inf, "xTribNac"))}</span></td></tr>
    <tr><td colspan="4"><b>Descrição do Serviço</b><span class="desc">${esc(v(serv, "cServ/xDescServ"))}</span></td></tr>
  </table>
  <table class="g">
    <tr><td class="sec cin">TRIBUTAÇÃO MUNICIPAL (ISSQN)</td>${c("Tipo de Tributação do ISSQN", esc(TRIB_ISS[v(tribMun, "tribISSQN")] || "-"))}${c("Município / Sigla UF / País de Incidência do ISSQN", `${esc(v(inf, "xLocIncid") || "-")}${v(inf, "xLocIncid") ? " / " + esc(ufEmit || "-") + " / -" : ""}`)}<td></td></tr>
    <tr>${c("BC ISSQN", brl(v(vn, "vBC")))}${c("Alíquota Aplicada", pct(v(vn, "pAliqAplic")))}${c("Retenção do ISSQN", esc(RET_ISS[v(tribMun, "tpRetISSQN")] || "-"))}${c("ISSQN Apurado", brl(v(vn, "vISSQN")))}</tr>
  </table>
  <table class="g">
    <tr><td class="sec cin">TRIBUTAÇÃO FEDERAL (EXCETO CBS)</td>${c("IRRF", brl(v(tribFed, "vRetIRRF")))}${c("Contribuição Previdenciária - Retida", brl(v(tribFed, "vRetCP")))}${c("Contribuições Sociais - Retidas", retSociais ? brl(retSociais) : "-")}</tr>
    <tr>${c("PIS - Débito Apuração Própria", !pcRetido && v(pc, "vPis") ? brl(v(pc, "vPis")) : "-")}${c("COFINS - Débito Apuração Própria", !pcRetido && v(pc, "vCofins") ? brl(v(pc, "vCofins")) : "-")}${c("Descrição Contrib. Sociais - Retidas", tpRetPC !== "" ? esc(tpRetPC + " - " + (RET_PC[tpRetPC] || "")) : "-")}<td></td></tr>
  </table>
  <table class="g">
    <tr><td class="sec cin">TRIBUTAÇÃO IBS/CBS</td>${c("CST / cClassTrib", ibsD ? `${esc(v(ibsD, "valores/trib/gIBSCBS/CST"))} / ${esc(v(ibsD, "valores/trib/gIBSCBS/cClassTrib"))}` : "-")}<td colspan="2"><b>Indicador de Operação / Código IBGE Incidência / Município Incidência / Sigla UF</b><span>${ibsD ? `${esc(v(ibsD, "cIndOp") || "-")} / ${esc(v(ibsN, "cLocalidadeIncid") || "-")} / ${esc(v(ibsN, "xLocalidadeIncid") || "-")}` : "-"}</span></td></tr>
    <tr>${c("Exclusões e Reduções da Base de Cálculo", vBCibs !== "" && vServ !== "" ? brl((+vServ || 0) - (+vBCibs || 0)) : "-")}${c("Base de Cálculo Após Exclusões e Reduções", brl(vBCibs))}${c("Red. Alíquota IBS / Red. Alíquota CBS", ibsN ? `${esc(v(ibsVal, "uf/pRedAliqUF") || "-")} / ${esc(v(ibsVal, "mun/pRedAliqMun") || "-")} / ${esc(v(ibsVal, "fed/pRedAliqCBS") || "-")}` : "-")}${c("Alíquota - IBS UF / IBS Mun", ibsN ? `${pct(v(ibsVal, "uf/pIBSUF"))} / ${pct(v(ibsVal, "mun/pIBSMun"))}` : "-")}</tr>
    <tr>${c("Alíq. Efetiva Municipal - IBS", pct(v(ibsVal, "mun/pAliqEfetMun")))}${c("Valor Apurado Municipal - IBS", brl(v(tot, "gIBS/gIBSMunTot/vIBSMun")))}${c("Alíq. Efetiva Estadual - IBS", pct(v(ibsVal, "uf/pAliqEfetUF")))}${c("Valor Apurado Estadual - IBS", brl(v(tot, "gIBS/gIBSUFTot/vIBSUF")))}</tr>
    <tr>${c("Valor Total Apurado - IBS", brl(vIBS))}${c("Alíquota - CBS", pct(v(ibsVal, "fed/pCBS")))}${c("Alíquota Efetiva - CBS", pct(v(ibsVal, "fed/pAliqEfetCBS")))}${c("Valor Total Apurado - CBS", brl(vCBS))}</tr>
  </table>
  <table class="g">
    <tr><td class="sec cin">VALOR TOTAL DA NFS-e</td>${c("VALOR DA OPERAÇÃO / SERVIÇO", brl(vServ))}${c("Desconto Incondicionado", brl(v(vd, "vDescCondIncond/vDescIncond")))}${c("Desconto Condicionado", brl(v(vd, "vDescCondIncond/vDescCond")))}</tr>
    <tr>${c("Total das Retenções (ISSQN / Federais)", brl(v(vn, "vTotalRet")))}${c("VALOR LÍQUIDO DA NFS-e", brl(v(vn, "vLiq")))}${c("Total do IBS/CBS", totIbsCbs === "" ? "-" : brl(totIbsCbs))}${c("VALOR LÍQUIDO DA NFS-e + IBS/CBS", brl(v(tot, "vTotNF")), "cin")}</tr>
  </table>
  <div class="info"><b>INFORMAÇÕES COMPLEMENTARES</b><div class="desc">${infComp.map(esc).join("<br><br>") || "-"}</div></div>
  <table class="canhoto"><tr><td><b>DATA CIENTIFICAÇÃO:</b></td><td><b>IDENTIFICAÇÃO E ASSINATURA</b></td><td class="ch"><b>Nº NFS-e / CHAVE NFS-e</b><span>${esc(v(inf, "nNFSe"))} / ${esc(chave)}</span></td></tr></table>
</div>`;

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>DANFSe ${esc(v(inf, "nNFSe"))}</title>
<style>
  @page { size: A4; margin: 8mm; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { margin: 0; background: #f2f2f2; font-family: Arial, Helvetica, sans-serif; color: #000; }
  .bar { text-align: center; padding: 10px; } .bar button { font: 600 14px Arial; padding: 8px 18px; border-radius: 6px; border: 1px solid #0d6b62; background: #0d6b62; color: #fff; cursor: pointer; }
  .pg { position: relative; width: 194mm; min-height: 279mm; margin: 0 auto 16px; background: #fff; border: 1px solid #000; padding: 2mm; display: flex; flex-direction: column; }
  .info { border-top: 1px solid #000; padding: 2px 4px; flex: 1; min-height: 30mm; font-size: 10px; } .info b { display: block; font-size: 10px; margin-bottom: 8px; }
  .canhoto { border: 1.5px solid #000; margin: 4mm 1mm 1mm; } .canhoto td { border: 1.5px solid #000; height: 11mm; vertical-align: top; padding: 2px 5px; font-size: 8px; width: 25%; } .canhoto td.ch { width: 50%; } .canhoto b { display: block; font-size: 8px; } .canhoto span { font-size: 10px; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  .cab td { vertical-align: middle; padding: 2px 4px; }
  .cab .logo { width: 26%; } .cab .sig { font: 900 30px Arial; letter-spacing: -1px; color: #1d5b8c; line-height: 1; display: inline-block; vertical-align: middle; }
  .cab .sub { display: inline-block; vertical-align: middle; font-size: 9px; color: #555; margin-left: 4px; line-height: 1.1; }
  .cab .tit { text-align: center; font: 700 12.5px Arial; } .cab .mun { width: 30%; font-size: 11px; } .cab .mun small { display: block; font-size: 8.5px; }
  .g { border-top: 1px solid #000; }
  .g td { vertical-align: top; padding: 2px 4px 3px; font-size: 10px; }
  .g td b { display: block; font-size: 8px; font-weight: 700; text-transform: none; }
  .g td span { display: block; font-size: 10.5px; word-break: break-word; }
  .g td.sec { font-size: 10px; font-weight: 700; }
  .cin { background: #ececec; }
  .qr { text-align: center; width: 25%; } .qr small { display: block; font-size: 7.5px; text-align: left; margin-top: 3px; } #qr { display: flex; justify-content: center; } #qr svg, #qr img { width: 70px; height: 70px; }
  .desc { font-size: 10px !important; }
  .faixa { border-top: 1px solid #000; text-align: center; font-size: 10px; padding: 1px; }
  .marca { position: absolute; top: 40%; left: 0; right: 0; text-align: center; font: 700 26px Arial; color: rgba(200,0,0,.18); transform: rotate(-24deg); pointer-events: none; }
  .marca.canc { top: 55%; }
  @media print { body { background: #fff; } .bar { display: none; } .pg { margin: 0; border: 1px solid #000; min-height: 279mm; } }
</style></head><body>
<div class="bar"><button onclick="window.print()">🖨 Imprimir / Salvar em PDF</button></div>
${corpo}
<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js"></script>
<script>
  try { var q = qrcode(0, "M"); q.addData(${JSON.stringify(qr)}); q.make(); document.getElementById("qr").innerHTML = q.createSvgTag(3, 0); } catch (e) {}
  document.querySelectorAll("[data-mun]").forEach(function (el) {
    fetch("https://servicodados.ibge.gov.br/api/v1/localidades/municipios/" + el.dataset.mun).then(function (r) { return r.json(); }).then(function (j) {
      if (j && j.nome) el.textContent = j.nome + (el.nextSibling && /\\//.test(el.nextSibling.textContent || "") ? "" : (j.microrregiao ? " / " + j.microrregiao.mesorregiao.UF.sigla : ""));
    }).catch(function () {});
  });
</script>
</body></html>`;
}
