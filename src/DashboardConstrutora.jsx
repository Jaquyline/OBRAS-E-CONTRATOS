import React, { useState, useEffect, useMemo, useRef } from "react";

// ---- Importação de PDF: extração por padrão de texto (sem IA) ----

const PDFJS_SCRIPT = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
const PDFJS_WORKER = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

function loadPdfJs() {
  return new Promise((resolve, reject) => {
    if (window.pdfjsLib) {
      resolve(window.pdfjsLib);
      return;
    }
    const script = document.createElement("script");
    script.src = PDFJS_SCRIPT;
    script.onload = () => {
      try {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
        resolve(window.pdfjsLib);
      } catch (err) {
        reject(err);
      }
    };
    script.onerror = () => reject(new Error("Falha ao carregar leitor de PDF."));
    document.body.appendChild(script);
  });
}

async function extractTextFromPdf(file) {
  const pdfjsLib = await loadPdfJs();
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let fullText = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    fullText += content.items.map((item) => item.str).join(" ") + "\n";
  }
  return fullText;
}

// Extrai o texto preservando quebras de linha por linha visual (agrupando
// itens pela posição Y), essencial para ler extratos bancários tabulares
// (data | descrição | valor) — extractTextFromPdf junta tudo numa linha só
// por página e por isso não serve para esse caso. Cada linha carrega também
// sua posição Y (dentro da própria página) e se é a primeira linha de uma
// nova página — usado por parseLancamentosExtratoVertical para saber onde um
// lançamento termina e o próximo começa, inclusive quando o extrato tem mais
// de uma página.
async function extractLinesFromPdf(file) {
  const pdfjsLib = await loadPdfJs();
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const linhas = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const linhasPorY = {};
    content.items.forEach((item) => {
      const y = Math.round(item.transform[5]);
      if (!linhasPorY[y]) linhasPorY[y] = [];
      linhasPorY[y].push(item);
    });
    const ys = Object.keys(linhasPorY)
      .map(Number)
      .sort((a, b) => b - a); // de cima para baixo (Y cresce para cima em PDF)
    ys.forEach((y, idx) => {
      const texto = linhasPorY[y]
        .sort((a, b) => a.transform[4] - b.transform[4])
        .map((it) => it.str)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      if (texto) linhas.push({ y, texto, novaPagina: idx === 0 });
    });
  }
  return linhas;
}

const MESES = {
  janeiro: "01", fevereiro: "02", março: "03", marco: "03", abril: "04",
  maio: "05", junho: "06", julho: "07", agosto: "08", setembro: "09",
  outubro: "10", novembro: "11", dezembro: "12",
};

// Plano de contas padrão (semente inicial) — copiado do plano de contas real
// da J & G Incorporadora Ltda (fornecido pelo usuário), contendo apenas as
// contas analíticas (que recebem lançamento). Usado só na primeira vez que o
// painel carrega, se ainda não houver nada salvo — a partir daí o usuário edita
// livremente pela aba "Plano de contas" (adicionar, renomear, remover conta).
const PLANO_CONTAS_PADRAO = [
  { id: "conta-1.1.10.101", codigo: "1.1.10.101", nome: "CAIXA GERAL", tipo: "ativo" },
  { id: "conta-1.1.10.200.1", codigo: "1.1.10.200.1", nome: "BANCO COOP CREDCREA, 085 AILOS, AG: 0106, CONTA: 33.355-7", tipo: "ativo" },
  { id: "conta-1.1.10.200.2", codigo: "1.1.10.200.2", nome: "BANCO CEF CONTA: 669-5 AG: 547 OP:003", tipo: "ativo" },
  { id: "conta-1.1.10.300.1", codigo: "1.1.10.300.1", nome: "APLICAÇOES CEF AG: 547 CONTA: 669-5 OP: 003", tipo: "ativo" },
  { id: "conta-1.1.10.300.2", codigo: "1.1.10.300.2", nome: "APLICAÇOES CREDCREA AG: 0106-6 CONTA: 333557", tipo: "ativo" },
  { id: "conta-1.1.20.101", codigo: "1.1.20.101", nome: "ALLONDA AMBIENTAL S.A", tipo: "ativo" },
  { id: "conta-1.1.20.103", codigo: "1.1.20.103", nome: "APTO 203", tipo: "ativo" },
  { id: "conta-1.1.20.107", codigo: "1.1.20.107", nome: "APTO 201", tipo: "ativo" },
  { id: "conta-1.1.20.108", codigo: "1.1.20.108", nome: "APTO 202", tipo: "ativo" },
  { id: "conta-1.1.20.109", codigo: "1.1.20.109", nome: "APTO 301", tipo: "ativo" },
  { id: "conta-1.1.20.110", codigo: "1.1.20.110", nome: "APTO 303", tipo: "ativo" },
  { id: "conta-1.1.20.111", codigo: "1.1.20.111", nome: "APTO 401", tipo: "ativo" },
  { id: "conta-1.1.20.112", codigo: "1.1.20.112", nome: "APTO 402", tipo: "ativo" },
  { id: "conta-1.1.20.113", codigo: "1.1.20.113", nome: "APTO 403", tipo: "ativo" },
  { id: "conta-1.1.20.114", codigo: "1.1.20.114", nome: "DF + ENGENHARIA GEOTÉCNICA E RECURSOS LTDA", tipo: "ativo" },
  { id: "conta-1.1.20.115", codigo: "1.1.20.115", nome: "ECONSERVATION ESTUDOS E PROJETOS AMBIENTAIS LTDA", tipo: "ativo" },
  { id: "conta-1.1.20.117", codigo: "1.1.20.117", nome: "MIND ESTUDOS E PROJETOS DE ENGENHARIA LTDA", tipo: "ativo" },
  { id: "conta-1.1.20.118", codigo: "1.1.20.118", nome: "MIND ESTUDOS E PROJETOS DE ENGENHARIA LTDA (2)", tipo: "ativo" },
  { id: "conta-1.1.20.119", codigo: "1.1.20.119", nome: "ULTRAFERTIL S/A", tipo: "ativo" },
  { id: "conta-1.1.20.200.1", codigo: "1.1.20.200.1", nome: "CLIENTES DIVERSOS", tipo: "ativo" },
  { id: "conta-1.1.30.201", codigo: "1.1.30.201", nome: "ADIANTAMENTO A FORNECEDORES", tipo: "ativo" },
  { id: "conta-1.1.30.202", codigo: "1.1.30.202", nome: "LUCROS A RECEBER", tipo: "ativo" },
  { id: "conta-1.1.30.300.1", codigo: "1.1.30.300.1", nome: "ADIANTAMENTO DE SALARIO", tipo: "ativo" },
  { id: "conta-1.1.30.300.2", codigo: "1.1.30.300.2", nome: "ADIANTAMENTO DE 13º SALARIO", tipo: "ativo" },
  { id: "conta-1.1.30.300.3", codigo: "1.1.30.300.3", nome: "SALARIO MATERNIDADE A RECUPERAR", tipo: "ativo" },
  { id: "conta-1.1.30.400.1", codigo: "1.1.30.400.1", nome: "CHEQUES DEVOLVIDOS", tipo: "ativo" },
  { id: "conta-1.1.40.101", codigo: "1.1.40.101", nome: "COFINS A RECUPERAR", tipo: "ativo" },
  { id: "conta-1.1.40.102", codigo: "1.1.40.102", nome: "CONTR SOCIAL A RECUPERAR", tipo: "ativo" },
  { id: "conta-1.1.40.103", codigo: "1.1.40.103", nome: "INSS A RECUPERAR", tipo: "ativo" },
  { id: "conta-1.1.40.104", codigo: "1.1.40.104", nome: "IRPJ A RECUPERAR", tipo: "ativo" },
  { id: "conta-1.1.40.105", codigo: "1.1.40.105", nome: "IRRF S/ PRESTAÇAO DE SERVIÇOS", tipo: "ativo" },
  { id: "conta-1.1.40.106", codigo: "1.1.40.106", nome: "IRRF/ APLICAÇOES FINANCEIRAS", tipo: "ativo" },
  { id: "conta-1.1.40.107", codigo: "1.1.40.107", nome: "ISS A RECUPERAR", tipo: "ativo" },
  { id: "conta-1.1.40.108", codigo: "1.1.40.108", nome: "PIS A RECUPERAR", tipo: "ativo" },
  { id: "conta-1.1.60.102", codigo: "1.1.60.102", nome: "MERCADORIAS PARA USO NA PRESTAÇAO DE SERVIÇOS", tipo: "ativo" },
  { id: "conta-1.1.60.103", codigo: "1.1.60.103", nome: "PRODUTOS EM CONSTRUÇAO", tipo: "ativo" },
  { id: "conta-1.1.60.104", codigo: "1.1.60.104", nome: "TERRENOS A COMERCIALIZAR", tipo: "ativo" },
  { id: "conta-1.1.60.105", codigo: "1.1.60.105", nome: "TERRENOS A COMERCIALIZAR - ISLA PROVIDENCIA", tipo: "ativo" },
  { id: "conta-1.1.60.106", codigo: "1.1.60.106", nome: "TERRENOS A COMERCIALIZAR - NAVEGANTES OBRA 1", tipo: "ativo" },
  { id: "conta-1.1.60.301", codigo: "1.1.60.301", nome: "IMÓVEIS A COMERCIALIZAR - APARTAMENTO 101", tipo: "ativo" },
  { id: "conta-1.1.60.302", codigo: "1.1.60.302", nome: "IMÓVEIS A COMERCIALIZAR - APARTAMENTO 201", tipo: "ativo" },
  { id: "conta-1.1.60.303", codigo: "1.1.60.303", nome: "IMÓVEIS A COMERCIALIZAR - APARTAMENTO 202", tipo: "ativo" },
  { id: "conta-1.1.60.304", codigo: "1.1.60.304", nome: "IMÓVEIS A COMERCIALIZAR - APARTAMENTO 302", tipo: "ativo" },
  { id: "conta-1.1.60.305", codigo: "1.1.60.305", nome: "IMÓVEIS A COMERCIALIZAR - APARTAMENTO 203", tipo: "ativo" },
  { id: "conta-1.1.60.306", codigo: "1.1.60.306", nome: "IMÓVEIS A COMERCIALIZAR - APARTAMENTO 303", tipo: "ativo" },
  { id: "conta-1.1.60.307", codigo: "1.1.60.307", nome: "IMÓVEIS A COMERCIALIZAR - APARTAMENTO 401", tipo: "ativo" },
  { id: "conta-1.1.60.308", codigo: "1.1.60.308", nome: "IMÓVEIS A COMERCIALIZAR - APARTAMENTO 402", tipo: "ativo" },
  { id: "conta-1.1.60.309", codigo: "1.1.60.309", nome: "IMÓVEIS A COMERCIALIZAR - APARTAMENTO 403", tipo: "ativo" },
  { id: "conta-1.2.10.101", codigo: "1.2.10.101", nome: "EMPRESTIMOS A SÓCIA JULIANA JACOMINI MENEGUCCI", tipo: "ativo" },
  { id: "conta-1.2.10.102", codigo: "1.2.10.102", nome: "EMPRESTIMOS A TERCEIROS", tipo: "ativo" },
  { id: "conta-1.2.10.103", codigo: "1.2.10.103", nome: "EMPRESTIMOS AO SÓCIO JOAO GABRIEL", tipo: "ativo" },
  { id: "conta-1.2.10.104", codigo: "1.2.10.104", nome: "PARTICIPAÇAO EM COOPERATIVA - COTAS", tipo: "ativo" },
  { id: "conta-1.2.20.100.1", codigo: "1.2.20.100.1", nome: "ESTOQUE DE IMÓVEIS ACABADOS", tipo: "ativo" },
  { id: "conta-1.2.30.101", codigo: "1.2.30.101", nome: "COMPUTADORES E PERIFERICOS", tipo: "ativo" },
  { id: "conta-1.2.30.102", codigo: "1.2.30.102", nome: "IMÓVEIS", tipo: "ativo" },
  { id: "conta-1.2.30.103", codigo: "1.2.30.103", nome: "INSTALAÇOES", tipo: "ativo" },
  { id: "conta-1.2.30.104", codigo: "1.2.30.104", nome: "MAQUINAS E EQUIPAMENTOS", tipo: "ativo" },
  { id: "conta-1.2.30.105", codigo: "1.2.30.105", nome: "MOVEIS E UTENSILIOS", tipo: "ativo" },
  { id: "conta-1.2.30.107", codigo: "1.2.30.107", nome: "TERRENOS", tipo: "ativo" },
  { id: "conta-1.2.30.108", codigo: "1.2.30.108", nome: "VEICULOS", tipo: "ativo" },
  { id: "conta-1.2.30.201", codigo: "1.2.30.201", nome: "(-) DEPRECIAÇAO COMPUTADORES E PERIFERICOS", tipo: "ativo" },
  { id: "conta-1.2.30.202", codigo: "1.2.30.202", nome: "(-) DEPRECIAÇAO IMOVEIS", tipo: "ativo" },
  { id: "conta-1.2.30.203", codigo: "1.2.30.203", nome: "(-) DEPRECIAÇAO INSTALAÇÕES", tipo: "ativo" },
  { id: "conta-1.2.30.204", codigo: "1.2.30.204", nome: "(-) DEPRECIAÇAO MAQUINAS E EQUIPAMENTOS", tipo: "ativo" },
  { id: "conta-1.2.30.205", codigo: "1.2.30.205", nome: "(-) DEPRECIAÇAO VEICULOS", tipo: "ativo" },
  { id: "conta-1.4.10.101", codigo: "1.4.10.101", nome: "MERCADORIAS EM CONSIGNAÇAO", tipo: "ativo" },
  { id: "conta-1.5.10.100.1", codigo: "1.5.10.100.1", nome: "APLICAÇÕES BANCO ITAU", tipo: "ativo" },
  { id: "conta-2.1.10.101", codigo: "2.1.10.101", nome: "3Z INJETADOS LTDA", tipo: "passivo" },
  { id: "conta-2.1.10.102", codigo: "2.1.10.102", nome: "40 409 366 RAFAEL PEREIRA DA ROSA", tipo: "passivo" },
  { id: "conta-2.1.10.103", codigo: "2.1.10.103", nome: "ARLETE TRANSPORTES LTDA", tipo: "passivo" },
  { id: "conta-2.1.10.104", codigo: "2.1.10.104", nome: "BENICIO PAGANI (MADEREIRA ALBIPINUS)", tipo: "passivo" },
  { id: "conta-2.1.10.105", codigo: "2.1.10.105", nome: "BRUNO GERALDI REGINALDO 07471933984", tipo: "passivo" },
  { id: "conta-2.1.10.107", codigo: "2.1.10.107", nome: "CASAS DA AGUA MATERIAIS DE CONSTRUÇAO LTDA", tipo: "passivo" },
  { id: "conta-2.1.10.108", codigo: "2.1.10.108", nome: "CASAS DA AGUA MATERIAIS P/ CONSTR. - LOJA 04", tipo: "passivo" },
  { id: "conta-2.1.10.111", codigo: "2.1.10.111", nome: "CASSOL MATERIAIS DE CONSTRUÇAO LTDA", tipo: "passivo" },
  { id: "conta-2.1.10.112", codigo: "2.1.10.112", nome: "CASSOL MATERIAIS DE CONSTRUÇAO LTDA (2)", tipo: "passivo" },
  { id: "conta-2.1.10.114", codigo: "2.1.10.114", nome: "CASSOL SJ", tipo: "passivo" },
  { id: "conta-2.1.10.115", codigo: "2.1.10.115", nome: "CASSOL", tipo: "passivo" },
  { id: "conta-2.1.10.116", codigo: "2.1.10.116", nome: "CERAMICA MONALLISA LTDA", tipo: "passivo" },
  { id: "conta-2.1.10.117", codigo: "2.1.10.117", nome: "COMANDO PAINEIS LTDA", tipo: "passivo" },
  { id: "conta-2.1.10.118", codigo: "2.1.10.118", nome: "COMERCIO DE FERRAGENS LEANDRO LTDA", tipo: "passivo" },
  { id: "conta-2.1.10.119", codigo: "2.1.10.119", nome: "COMERCIO DE GESSO JSX LTDA", tipo: "passivo" },
  { id: "conta-2.1.10.120", codigo: "2.1.10.120", nome: "CONCORDIA DO BRASIL PARTICIPACOES LTDA", tipo: "passivo" },
  { id: "conta-2.1.10.121", codigo: "2.1.10.121", nome: "CONCREPEN IND COM ART CIMENTO LTDA", tipo: "passivo" },
  { id: "conta-2.1.10.122", codigo: "2.1.10.122", nome: "CORREA MATERIAIS ELETRICOS LTDA", tipo: "passivo" },
  { id: "conta-2.1.10.123", codigo: "2.1.10.123", nome: "DARCI DE BORTOLDI", tipo: "passivo" },
  { id: "conta-2.1.10.125", codigo: "2.1.10.125", nome: "DECOR COLORS COMERCIO DE PINTURAS LTDA", tipo: "passivo" },
  { id: "conta-2.1.10.126", codigo: "2.1.10.126", nome: "DELTA INDUSTRIA CERAMICA LTDA", tipo: "passivo" },
  { id: "conta-2.1.10.127", codigo: "2.1.10.127", nome: "DINALVA COELHO DE JESUS ME", tipo: "passivo" },
  { id: "conta-2.1.10.128", codigo: "2.1.10.128", nome: "DINALVA COELHO DE JESUS ME (2)", tipo: "passivo" },
  { id: "conta-2.1.10.129", codigo: "2.1.10.129", nome: "DLV SERVIÇOS DE PINTURA LTDA", tipo: "passivo" },
  { id: "conta-2.1.10.130", codigo: "2.1.10.130", nome: "DOEGE TERRAPLANAGEM", tipo: "passivo" },
  { id: "conta-2.1.10.131", codigo: "2.1.10.131", nome: "ELETROPRED INSTALACOES ELETRICAS LTDA", tipo: "passivo" },
  { id: "conta-2.1.10.132", codigo: "2.1.10.132", nome: "ER CONCRETO REGUADO", tipo: "passivo" },
  { id: "conta-2.1.10.133", codigo: "2.1.10.133", nome: "ESATTA LTDA", tipo: "passivo" },
  { id: "conta-2.1.10.134", codigo: "2.1.10.134", nome: "EVOLUTION GERADORES LTDA", tipo: "passivo" },
  { id: "conta-2.1.10.135", codigo: "2.1.10.135", nome: "FACILFER LTDA - ME", tipo: "passivo" },
  { id: "conta-2.1.10.136", codigo: "2.1.10.136", nome: "FC COMERCIO DE MATERIAIS DE CONSTRUCAO LTDA", tipo: "passivo" },
  { id: "conta-2.1.10.137", codigo: "2.1.10.137", nome: "FECHA FORTE CHAVES E FECHADURAS LTDA", tipo: "passivo" },
  { id: "conta-2.1.10.138", codigo: "2.1.10.138", nome: "FENIX ADMINISTRADORA DE CONDOMINIOS LTDA", tipo: "passivo" },
  { id: "conta-2.1.10.139", codigo: "2.1.10.139", nome: "FRACARO E CALIARI CONSTR E INCORPORADORA LTDA", tipo: "passivo" },
  { id: "conta-2.1.10.140", codigo: "2.1.10.140", nome: "FUNDAÇAO CHRISTIANO OTTONI", tipo: "passivo" },
  { id: "conta-2.1.10.141", codigo: "2.1.10.141", nome: "GERDAU ACOS LONGOS S.A.", tipo: "passivo" },
  { id: "conta-2.1.10.142", codigo: "2.1.10.142", nome: "ILHA TINTAS LTDA", tipo: "passivo" },
  { id: "conta-2.1.10.144", codigo: "2.1.10.144", nome: "IMOBILIARIA ATLANTICO LTDA", tipo: "passivo" },
  { id: "conta-2.1.10.145", codigo: "2.1.10.145", nome: "ISOMOL INDUSTRIA E COMERCIO LTDA", tipo: "passivo" },
  { id: "conta-2.1.10.146", codigo: "2.1.10.146", nome: "J & S CONSTRUTORA LTDA", tipo: "passivo" },
  { id: "conta-2.1.10.147", codigo: "2.1.10.147", nome: "J & S EMPREITEIRA", tipo: "passivo" },
  { id: "conta-2.1.10.148", codigo: "2.1.10.148", nome: "J. SERRAO OLTRAMARI SERVICOS CONTABEIS, CONSULTORIA E AUDITORIA", tipo: "passivo" },
  { id: "conta-2.1.10.149", codigo: "2.1.10.149", nome: "KALLEO ESQUADRIAS LTDA", tipo: "passivo" },
  { id: "conta-2.1.10.150", codigo: "2.1.10.150", nome: "LAO INDUSTRIA LTDA", tipo: "passivo" },
  { id: "conta-2.1.10.151", codigo: "2.1.10.151", nome: "LEANDRO E LEANDRO LTDA EPP", tipo: "passivo" },
  { id: "conta-2.1.10.152", codigo: "2.1.10.152", nome: "LIMA ENTULHOS LTDA", tipo: "passivo" },
  { id: "conta-2.1.10.153", codigo: "2.1.10.153", nome: "LOJA DO GUARDA PÓ", tipo: "passivo" },
  { id: "conta-2.1.10.154", codigo: "2.1.10.154", nome: "MADEIREIRA GARDINI", tipo: "passivo" },
  { id: "conta-2.1.10.155", codigo: "2.1.10.155", nome: "MAIRA DA ROCHA BRESSANINI 03999524979", tipo: "passivo" },
  { id: "conta-2.1.10.156", codigo: "2.1.10.156", nome: "MARIO LUIZ MASCAGNI", tipo: "passivo" },
  { id: "conta-2.1.10.158", codigo: "2.1.10.158", nome: "MARQUES FERROS E AÇOS LTDA", tipo: "passivo" },
  { id: "conta-2.1.10.159", codigo: "2.1.10.159", nome: "MATHEUS DE CARVALHO COELHO GRANDO BMS", tipo: "passivo" },
  { id: "conta-2.1.10.160", codigo: "2.1.10.160", nome: "MAX MOHR FILHO CIA LTDA", tipo: "passivo" },
  { id: "conta-2.1.10.162", codigo: "2.1.10.162", nome: "MAX MOHR FILHO E CIA LTDA", tipo: "passivo" },
  { id: "conta-2.1.10.163", codigo: "2.1.10.163", nome: "MF COMERCIO DE MATERIAIS DE CONSTRUCAO L", tipo: "passivo" },
  { id: "conta-2.1.10.164", codigo: "2.1.10.164", nome: "MF COMERCIO DE MATERIAIS DE CONSTRUCAO LTDA", tipo: "passivo" },
  { id: "conta-2.1.10.165", codigo: "2.1.10.165", nome: "MIE.MIDAS LTDA", tipo: "passivo" },
  { id: "conta-2.1.10.166", codigo: "2.1.10.166", nome: "MORETTI VIDROS LTDA", tipo: "passivo" },
  { id: "conta-2.1.10.167", codigo: "2.1.10.167", nome: "NP SONDAGENS", tipo: "passivo" },
  { id: "conta-2.1.10.168", codigo: "2.1.10.168", nome: "PELLIZZARI ADVOGADOS ASSOCIADOS", tipo: "passivo" },
  { id: "conta-2.1.10.169", codigo: "2.1.10.169", nome: "POLIMIX CONCRETO LTDA", tipo: "passivo" },
  { id: "conta-2.1.10.170", codigo: "2.1.10.170", nome: "PORTO & PORTO COM. DE TINTAS EIRELI EPP", tipo: "passivo" },
  { id: "conta-2.1.10.171", codigo: "2.1.10.171", nome: "PORTO E PORTO COMERCIO DE TINTAS EIRELI", tipo: "passivo" },
  { id: "conta-2.1.10.173", codigo: "2.1.10.173", nome: "REIS TERRAPLANAGEM LTDA", tipo: "passivo" },
  { id: "conta-2.1.10.174", codigo: "2.1.10.174", nome: "REQUINT INOX ARTIGOS DE INOX LTDA", tipo: "passivo" },
  { id: "conta-2.1.10.175", codigo: "2.1.10.175", nome: "RONALDO POSTES LTDA", tipo: "passivo" },
  { id: "conta-2.1.10.176", codigo: "2.1.10.176", nome: "RONY MATERIAIS PARA CONSTRUCAO LTDA ME", tipo: "passivo" },
  { id: "conta-2.1.10.177", codigo: "2.1.10.177", nome: "ROSSI MATERIAIS ELETRICOS LTDA", tipo: "passivo" },
  { id: "conta-2.1.10.178", codigo: "2.1.10.178", nome: "ROSSI MATERIAIS ELETRICOS LTDA (CD)", tipo: "passivo" },
  { id: "conta-2.1.10.179", codigo: "2.1.10.179", nome: "RUBIN RIGOTTI & CIA LTDA", tipo: "passivo" },
  { id: "conta-2.1.10.180", codigo: "2.1.10.180", nome: "SCHAEFFER GLASS ESQUADRIAS ALUMINIO LTDA", tipo: "passivo" },
  { id: "conta-2.1.10.181", codigo: "2.1.10.181", nome: "SERRAO SOCIEDADE INDIVIDUAL DE ADVOCACIA", tipo: "passivo" },
  { id: "conta-2.1.10.182", codigo: "2.1.10.182", nome: "SERVICO SOCIAL DA CONSTRUCAO CIVIL DO ESTADO DE SAO PAULO - SECONCI-SP", tipo: "passivo" },
  { id: "conta-2.1.10.183", codigo: "2.1.10.183", nome: "SOLO SONDAGEM E CONSTRUCOES LTDA", tipo: "passivo" },
  { id: "conta-2.1.10.184", codigo: "2.1.10.184", nome: "SPERANDIO ARTEFATOS PLASTICOS LTDA", tipo: "passivo" },
  { id: "conta-2.1.10.185", codigo: "2.1.10.185", nome: "SUPERBETON CONCRETO LTDA", tipo: "passivo" },
  { id: "conta-2.1.10.186", codigo: "2.1.10.186", nome: "SUZANA REGINA SCHMIDT 07933201946", tipo: "passivo" },
  { id: "conta-2.1.10.187", codigo: "2.1.10.187", nome: "TIGRAO IMOVEIS LTDA", tipo: "passivo" },
  { id: "conta-2.1.10.188", codigo: "2.1.10.188", nome: "WERLANG E CIA LTDA ME", tipo: "passivo" },
  { id: "conta-2.1.10.189", codigo: "2.1.10.189", nome: "ZEUS DO BRASIL LTDA", tipo: "passivo" },
  { id: "conta-2.1.10.190", codigo: "2.1.10.190", nome: "ZICO AUTO PEÇAS E SERVIÇOS DE GUINCHO LTDA", tipo: "passivo" },
  { id: "conta-2.1.10.201", codigo: "2.1.10.201", nome: "13º SALARIO A PAGAR", tipo: "passivo" },
  { id: "conta-2.1.10.202", codigo: "2.1.10.202", nome: "FERIAS A PAGAR", tipo: "passivo" },
  { id: "conta-2.1.10.203", codigo: "2.1.10.203", nome: "PENSAO ALIMENTICA A PAGAR", tipo: "passivo" },
  { id: "conta-2.1.10.204", codigo: "2.1.10.204", nome: "PRO LABORE A PAGAR", tipo: "passivo" },
  { id: "conta-2.1.10.205", codigo: "2.1.10.205", nome: "RESCISOES CONTRATUAIS A PAGAR", tipo: "passivo" },
  { id: "conta-2.1.10.206", codigo: "2.1.10.206", nome: "SALARIOS E ORDENADOS A PAGAR", tipo: "passivo" },
  { id: "conta-2.1.10.207", codigo: "2.1.10.207", nome: "SEGUROS A PAGAR", tipo: "passivo" },
  { id: "conta-2.1.10.301", codigo: "2.1.10.301", nome: "CONTR. CONFEDERATIVA A RECOLHER", tipo: "passivo" },
  { id: "conta-2.1.10.302", codigo: "2.1.10.302", nome: "CONTR. SINDICAL A RECOLHER", tipo: "passivo" },
  { id: "conta-2.1.10.303", codigo: "2.1.10.303", nome: "CONTRIBUIÇAO ASSISTENCIAL", tipo: "passivo" },
  { id: "conta-2.1.10.304", codigo: "2.1.10.304", nome: "FGTS A RECOLHER", tipo: "passivo" },
  { id: "conta-2.1.10.305", codigo: "2.1.10.305", nome: "INSS A RECOLHER", tipo: "passivo" },
  { id: "conta-2.1.10.401", codigo: "2.1.10.401", nome: "PROVISÕES DE 13º SALARIO", tipo: "passivo" },
  { id: "conta-2.1.10.402", codigo: "2.1.10.402", nome: "PROVISÕES DE FÉRIAS", tipo: "passivo" },
  { id: "conta-2.1.10.403", codigo: "2.1.10.403", nome: "PROVISÕES FGTS SOBRE 13º SALARIO", tipo: "passivo" },
  { id: "conta-2.1.10.404", codigo: "2.1.10.404", nome: "PROVISÕES FGTS SOBRE FÉRIAS", tipo: "passivo" },
  { id: "conta-2.1.10.405", codigo: "2.1.10.405", nome: "PROVISÕES INSS SOBRE 13º SALARIO", tipo: "passivo" },
  { id: "conta-2.1.10.406", codigo: "2.1.10.406", nome: "PROVISÕES INSS SOBRE FÉRIAS", tipo: "passivo" },
  { id: "conta-2.1.10.501", codigo: "2.1.10.501", nome: "COFINS A RECOLHER", tipo: "passivo" },
  { id: "conta-2.1.10.502", codigo: "2.1.10.502", nome: "CONTR SOCIAL A RECOLHER", tipo: "passivo" },
  { id: "conta-2.1.10.503", codigo: "2.1.10.503", nome: "FGTS A RECOLHER", tipo: "passivo" },
  { id: "conta-2.1.10.504", codigo: "2.1.10.504", nome: "INSS A RECOLHER", tipo: "passivo" },
  { id: "conta-2.1.10.505", codigo: "2.1.10.505", nome: "INSS RETIDO NA FONTE", tipo: "passivo" },
  { id: "conta-2.1.10.506", codigo: "2.1.10.506", nome: "IRPJ A RECOLHER", tipo: "passivo" },
  { id: "conta-2.1.10.507", codigo: "2.1.10.507", nome: "IRPJ LP A RECOLHER", tipo: "passivo" },
  { id: "conta-2.1.10.508", codigo: "2.1.10.508", nome: "IRRF A RECOLHER", tipo: "passivo" },
  { id: "conta-2.1.10.509", codigo: "2.1.10.509", nome: "ISS A RECOLHER", tipo: "passivo" },
  { id: "conta-2.1.10.510", codigo: "2.1.10.510", nome: "ISS RETIDO NA FONTE", tipo: "passivo" },
  { id: "conta-2.1.10.511", codigo: "2.1.10.511", nome: "PIS A RECOLHER", tipo: "passivo" },
  { id: "conta-2.1.10.512", codigo: "2.1.10.512", nome: "SIMPLES A RECOLHER", tipo: "passivo" },
  { id: "conta-2.1.10.603", codigo: "2.1.10.603", nome: "EMPRESTIMOS BANCARIOS", tipo: "passivo" },
  { id: "conta-2.1.10.604", codigo: "2.1.10.604", nome: "EMPRESTIMOS DO SOCIO GABRIEL OLTRAMARI NETO", tipo: "passivo" },
  { id: "conta-2.1.10.701", codigo: "2.1.10.701", nome: "HONORARIOS A PAGAR", tipo: "passivo" },
  { id: "conta-2.1.10.702", codigo: "2.1.10.702", nome: "LUCROS A DISTRIBUIR - MAURICIO DE CARVALHO TORRONTEGUY", tipo: "passivo" },
  { id: "conta-2.1.10.703", codigo: "2.1.10.703", nome: "LUCROS A DISTRIBUIR - JULIANA JACOMINI MENEGUCCI", tipo: "passivo" },
  { id: "conta-2.2.10.101", codigo: "2.2.10.101", nome: "CLIENTES DIVERSOS (LONGO PRAZO)", tipo: "passivo" },
  { id: "conta-2.2.10.102", codigo: "2.2.10.102", nome: "TECON RIO GRANDE", tipo: "passivo" },
  { id: "conta-2.2.20.101", codigo: "2.2.20.101", nome: "EMPRESTIMOS - SOCIO GABRIEL", tipo: "passivo" },
  { id: "conta-2.2.20.102", codigo: "2.2.20.102", nome: "EMPRESTIMOS - SÓCIO JOAO GABRIEL", tipo: "passivo" },
  { id: "conta-2.2.20.201", codigo: "2.2.20.201", nome: "RECEITA A REALIZAR DE VENDA DE IMÓVEIS", tipo: "passivo" },
  { id: "conta-2.2.20.301", codigo: "2.2.20.301", nome: "CSLL DIFERIDA", tipo: "passivo" },
  { id: "conta-2.2.20.302", codigo: "2.2.20.302", nome: "IRPJ DIFERIDO", tipo: "passivo" },
  { id: "conta-2.4.10.101", codigo: "2.4.10.101", nome: "CAPITAL SOCIAL - GABRIEL", tipo: "passivo" },
  { id: "conta-2.4.10.102", codigo: "2.4.10.102", nome: "CAPITAL SOCIAL - JOAO GABRIEL", tipo: "passivo" },
  { id: "conta-2.4.10.200.1", codigo: "2.4.10.200.1", nome: "CAPITAL A INTEGRALIZAR - SÓCIO MAURICIO DE CARVALHO TORRONTTEGUY", tipo: "passivo" },
  { id: "conta-2.4.20.100.1", codigo: "2.4.20.100.1", nome: "CORREÇAO MONETARIA CAPITAL REALIZAVEL", tipo: "passivo" },
  { id: "conta-2.4.20.200.1", codigo: "2.4.20.200.1", nome: "RESERVA DE REAVALIÇAO DE BENS", tipo: "passivo" },
  { id: "conta-2.4.20.300.1", codigo: "2.4.20.300.1", nome: "RESERVA LEGAL", tipo: "passivo" },
  { id: "conta-2.4.20.300.2", codigo: "2.4.20.300.2", nome: "RESERVA PARA AUMENTO DE CAPITAL", tipo: "passivo" },
  { id: "conta-2.4.30.101", codigo: "2.4.30.101", nome: "(-) PREJUIZOS ACUMULADOS", tipo: "passivo" },
  { id: "conta-2.4.30.103", codigo: "2.4.30.103", nome: "LUCROS ACUMULADOS", tipo: "passivo" },
  { id: "conta-2.4.30.104", codigo: "2.4.30.104", nome: "PREJUIZO DO EXERCICIO", tipo: "passivo" },
  { id: "conta-2.4.40.101", codigo: "2.4.40.101", nome: "AJUSTE DE EXERCÍCIOS ANTERIORES - ESTOQUES", tipo: "passivo" },
  { id: "conta-2.4.40.102", codigo: "2.4.40.102", nome: "AJUSTE DE EXERCÍCIOS ANTERIORES - LUCROS ACUMULADOS", tipo: "passivo" },
  { id: "conta-2.5.10.101", codigo: "2.5.10.101", nome: "CONSIGNAÇAO DE MERCADORIAS", tipo: "passivo" },
  { id: "conta-3.1.10.101", codigo: "3.1.10.101", nome: "RECEITA DA VENDA DE IMÓVEIS", tipo: "receita" },
  { id: "conta-3.1.10.201", codigo: "3.1.10.201", nome: "PRESTAÇAO DE SERVIÇOS", tipo: "receita" },
  { id: "conta-3.1.10.300.1", codigo: "3.1.10.300.1", nome: "DEVOLUÇAO DE VENDAS", tipo: "receita" },
  { id: "conta-3.1.10.300.2", codigo: "3.1.10.300.2", nome: "ABATIMENTOS CONCEDIDOS", tipo: "receita" },
  { id: "conta-3.1.10.401", codigo: "3.1.10.401", nome: "(-) COFINS S/ VENDAS", tipo: "receita" },
  { id: "conta-3.1.10.402", codigo: "3.1.10.402", nome: "(-) CSLL S/ VENDAS", tipo: "receita" },
  { id: "conta-3.1.10.403", codigo: "3.1.10.403", nome: "(-) IPI S/ VENDAS", tipo: "receita" },
  { id: "conta-3.1.10.404", codigo: "3.1.10.404", nome: "(-) IRPJ S/ VENDAS", tipo: "receita" },
  { id: "conta-3.1.10.405", codigo: "3.1.10.405", nome: "(-) PIS S/ VENDAS", tipo: "receita" },
  { id: "conta-3.1.10.501", codigo: "3.1.10.501", nome: "(-) COFINS S/ SERVIÇOS", tipo: "receita" },
  { id: "conta-3.1.10.502", codigo: "3.1.10.502", nome: "(-) CONTR SOCIAL S/ SERVIÇOS", tipo: "receita" },
  { id: "conta-3.1.10.503", codigo: "3.1.10.503", nome: "(-) INSS S/ SERVIÇOS", tipo: "receita" },
  { id: "conta-3.1.10.504", codigo: "3.1.10.504", nome: "(-) IRPJ LP S/ SERVIÇOS", tipo: "receita" },
  { id: "conta-3.1.10.505", codigo: "3.1.10.505", nome: "(-) ISS S/ SERVIÇOS", tipo: "receita" },
  { id: "conta-3.1.10.506", codigo: "3.1.10.506", nome: "(-) PIS S/ SERVIÇOS", tipo: "receita" },
  { id: "conta-3.1.10.601", codigo: "3.1.10.601", nome: "ATUALIZAÇAO MONETARIA", tipo: "receita" },
  { id: "conta-3.1.10.602", codigo: "3.1.10.602", nome: "DESCONTOS OBTIDOS", tipo: "receita" },
  { id: "conta-3.1.10.603", codigo: "3.1.10.603", nome: "JUROS ATIVOS", tipo: "receita" },
  { id: "conta-3.1.10.604", codigo: "3.1.10.604", nome: "JUROS S/ APLICAÇÕES FINANCEIRAS", tipo: "receita" },
  { id: "conta-3.1.10.605", codigo: "3.1.10.605", nome: "RENDIMENTOS DE APLICAÇOES FINANCEIRAS", tipo: "receita" },
  { id: "conta-3.1.10.701", codigo: "3.1.10.701", nome: "RECEITA DE BONIFICAÇAO", tipo: "receita" },
  { id: "conta-3.1.20.101", codigo: "3.1.20.101", nome: "RECEITA DE ALIENAÇAO DE IMOBILIZADOS", tipo: "receita" },
  { id: "conta-3.1.20.102", codigo: "3.1.20.102", nome: "RECEITA DE ALIENAÇAO DE INVESTIMENTOS", tipo: "receita" },
  { id: "conta-3.1.20.201", codigo: "3.1.20.201", nome: "IRPJ S/ GANHO DE CAPITAL", tipo: "receita" },
  { id: "conta-4.1.10.101", codigo: "4.1.10.101", nome: "13º SALARIO", tipo: "despesa" },
  { id: "conta-4.1.10.102", codigo: "4.1.10.102", nome: "ADICIONAL DE INSALUBRIDADE", tipo: "despesa" },
  { id: "conta-4.1.10.103", codigo: "4.1.10.103", nome: "ASSISTENCIA MEDICA", tipo: "despesa" },
  { id: "conta-4.1.10.104", codigo: "4.1.10.104", nome: "AVISO PREVIO INDENIZADO", tipo: "despesa" },
  { id: "conta-4.1.10.105", codigo: "4.1.10.105", nome: "CONTRIBUIÇAO PATRONAL", tipo: "despesa" },
  { id: "conta-4.1.10.106", codigo: "4.1.10.106", nome: "DESPESAS C/ AUXILIO BOLSA ESTAGIO", tipo: "despesa" },
  { id: "conta-4.1.10.107", codigo: "4.1.10.107", nome: "FERIAS", tipo: "despesa" },
  { id: "conta-4.1.10.108", codigo: "4.1.10.108", nome: "GRATIFICAÇOES", tipo: "despesa" },
  { id: "conta-4.1.10.109", codigo: "4.1.10.109", nome: "HORAS EXTRAS", tipo: "despesa" },
  { id: "conta-4.1.10.110", codigo: "4.1.10.110", nome: "INDENIZAÇOES CONTRATUAIS", tipo: "despesa" },
  { id: "conta-4.1.10.111", codigo: "4.1.10.111", nome: "PRO-LABORE", tipo: "despesa" },
  { id: "conta-4.1.10.112", codigo: "4.1.10.112", nome: "REFEITORIO", tipo: "despesa" },
  { id: "conta-4.1.10.113", codigo: "4.1.10.113", nome: "SALARIOS E ORDENADOS", tipo: "despesa" },
  { id: "conta-4.1.10.114", codigo: "4.1.10.114", nome: "VALE TRANSPORTES", tipo: "despesa" },
  { id: "conta-4.1.10.201", codigo: "4.1.10.201", nome: "FGTS", tipo: "despesa" },
  { id: "conta-4.1.10.202", codigo: "4.1.10.202", nome: "INSS", tipo: "despesa" },
  { id: "conta-4.1.10.203", codigo: "4.1.10.203", nome: "ISS", tipo: "despesa" },
  { id: "conta-4.1.10.301", codigo: "4.1.10.301", nome: "COMISSÃO CORRETOR", tipo: "despesa" },
  { id: "conta-4.1.10.302", codigo: "4.1.10.302", nome: "HONORARIOS CONTABEIS", tipo: "despesa" },
  { id: "conta-4.1.10.303", codigo: "4.1.10.303", nome: "HONORARIOS JURIDICOS", tipo: "despesa" },
  { id: "conta-4.1.10.304", codigo: "4.1.10.304", nome: "HOSPEDAGEM/SITES", tipo: "despesa" },
  { id: "conta-4.1.10.305", codigo: "4.1.10.305", nome: "MANUTENÇAO INFORMATICA", tipo: "despesa" },
  { id: "conta-4.1.10.306", codigo: "4.1.10.306", nome: "PROCESSAMENTOS DE DADOS/LICENCIAMENTO", tipo: "despesa" },
  { id: "conta-4.1.10.307", codigo: "4.1.10.307", nome: "SERVIÇOS DE CONSULTORIA", tipo: "despesa" },
  { id: "conta-4.1.10.308", codigo: "4.1.10.308", nome: "SERVIÇOS DE ENGENHARIA", tipo: "despesa" },
  { id: "conta-4.1.10.309", codigo: "4.1.10.309", nome: "SERVIÇOS DE LICITAÇÕES", tipo: "despesa" },
  { id: "conta-4.1.10.310", codigo: "4.1.10.310", nome: "SERVIÇOS DE SEGURANÇA", tipo: "despesa" },
  { id: "conta-4.1.10.312", codigo: "4.1.10.312", nome: "SERVIÇOS TOMADOS", tipo: "despesa" },
  { id: "conta-4.1.10.401", codigo: "4.1.10.401", nome: "MANUTENÇAO COMPUTADORES E PERIFERICOS", tipo: "despesa" },
  { id: "conta-4.1.10.402", codigo: "4.1.10.402", nome: "MANUTENÇAO INSTALAÇOES", tipo: "despesa" },
  { id: "conta-4.1.10.403", codigo: "4.1.10.403", nome: "MANUTENÇAO MAQUINAS E EQUIPAMENTOS", tipo: "despesa" },
  { id: "conta-4.1.10.404", codigo: "4.1.10.404", nome: "MANUTENÇAO VEICULOS", tipo: "despesa" },
  { id: "conta-4.1.10.501", codigo: "4.1.10.501", nome: "AGUA", tipo: "despesa" },
  { id: "conta-4.1.10.502", codigo: "4.1.10.502", nome: "ALUGUEL/COWORKING", tipo: "despesa" },
  { id: "conta-4.1.10.503", codigo: "4.1.10.503", nome: "ANUIDADE CREA", tipo: "despesa" },
  { id: "conta-4.1.10.504", codigo: "4.1.10.504", nome: "ASSOCIAÇOES DE CLASSE", tipo: "despesa" },
  { id: "conta-4.1.10.505", codigo: "4.1.10.505", nome: "BENS DE PEQUENO VALOR", tipo: "despesa" },
  { id: "conta-4.1.10.506", codigo: "4.1.10.506", nome: "COMBUSTIVEIS E LUBRIFICANTES", tipo: "despesa" },
  { id: "conta-4.1.10.507", codigo: "4.1.10.507", nome: "CONDOMINIO", tipo: "despesa" },
  { id: "conta-4.1.10.508", codigo: "4.1.10.508", nome: "CONFRATERNIZAÇAO", tipo: "despesa" },
  { id: "conta-4.1.10.509", codigo: "4.1.10.509", nome: "CURSOS E TREINAMENTOS", tipo: "despesa" },
  { id: "conta-4.1.10.510", codigo: "4.1.10.510", nome: "DEPRECIAÇAO", tipo: "despesa" },
  { id: "conta-4.1.10.511", codigo: "4.1.10.511", nome: "DESPESA DE VIAGEM", tipo: "despesa" },
  { id: "conta-4.1.10.512", codigo: "4.1.10.512", nome: "DESPESAS DIVERSAS", tipo: "despesa" },
  { id: "conta-4.1.10.513", codigo: "4.1.10.513", nome: "DESPESAS LEGAIS E CARTORARIAS", tipo: "despesa" },
  { id: "conta-4.1.10.514", codigo: "4.1.10.514", nome: "DESPESAS POSTAIS", tipo: "despesa" },
  { id: "conta-4.1.10.515", codigo: "4.1.10.515", nome: "ENERGIA ELETRICA", tipo: "despesa" },
  { id: "conta-4.1.10.516", codigo: "4.1.10.516", nome: "EXAMES LABORATORIAIS", tipo: "despesa" },
  { id: "conta-4.1.10.517", codigo: "4.1.10.517", nome: "FOTOCOPIAS E AUTENTICAÇOES", tipo: "despesa" },
  { id: "conta-4.1.10.518", codigo: "4.1.10.518", nome: "FRETES", tipo: "despesa" },
  { id: "conta-4.1.10.519", codigo: "4.1.10.519", nome: "LANCHES E REFEIÇOES", tipo: "despesa" },
  { id: "conta-4.1.10.520", codigo: "4.1.10.520", nome: "MANUTENÇAO DE VEICULOS", tipo: "despesa" },
  { id: "conta-4.1.10.521", codigo: "4.1.10.521", nome: "MATERIAIS DE EPI", tipo: "despesa" },
  { id: "conta-4.1.10.522", codigo: "4.1.10.522", nome: "MATERIAL DE ESCRITORIO", tipo: "despesa" },
  { id: "conta-4.1.10.523", codigo: "4.1.10.523", nome: "MATERIAL DE LIMPEZA", tipo: "despesa" },
  { id: "conta-4.1.10.524", codigo: "4.1.10.524", nome: "MATERIAL DE MANUTENÇAO", tipo: "despesa" },
  { id: "conta-4.1.10.525", codigo: "4.1.10.525", nome: "MATERIAL DE USO E CONSUMO", tipo: "despesa" },
  { id: "conta-4.1.10.526", codigo: "4.1.10.526", nome: "SEGUROS", tipo: "despesa" },
  { id: "conta-4.1.10.527", codigo: "4.1.10.527", nome: "TAXAS DE LICITAÇAO", tipo: "despesa" },
  { id: "conta-4.1.10.528", codigo: "4.1.10.528", nome: "TAXAS DIVERSAS", tipo: "despesa" },
  { id: "conta-4.1.10.530", codigo: "4.1.10.530", nome: "TELEFONE", tipo: "despesa" },
  { id: "conta-4.1.10.531", codigo: "4.1.10.531", nome: "UNIFORMES", tipo: "despesa" },
  { id: "conta-4.1.10.601", codigo: "4.1.10.601", nome: "COMISSOES", tipo: "despesa" },
  { id: "conta-4.1.10.602", codigo: "4.1.10.602", nome: "OUTRAS DESPESAS", tipo: "despesa" },
  { id: "conta-4.1.10.603", codigo: "4.1.10.603", nome: "PROPAGANDA E PUBLICIDADE", tipo: "despesa" },
  { id: "conta-4.1.10.701", codigo: "4.1.10.701", nome: "TAXAS - CREA", tipo: "despesa" },
  { id: "conta-4.1.10.702", codigo: "4.1.10.702", nome: "TAXAS ESTADUAIS", tipo: "despesa" },
  { id: "conta-4.1.10.703", codigo: "4.1.10.703", nome: "TAXAS FEDERAIS", tipo: "despesa" },
  { id: "conta-4.1.10.704", codigo: "4.1.10.704", nome: "TAXAS MUNICIPAIS", tipo: "despesa" },
  { id: "conta-4.1.10.801", codigo: "4.1.10.801", nome: "CSLL", tipo: "despesa" },
  { id: "conta-4.1.10.802", codigo: "4.1.10.802", nome: "IPTU", tipo: "despesa" },
  { id: "conta-4.1.10.803", codigo: "4.1.10.803", nome: "IPVA", tipo: "despesa" },
  { id: "conta-4.1.10.804", codigo: "4.1.10.804", nome: "IRPJ", tipo: "despesa" },
  { id: "conta-4.1.10.805", codigo: "4.1.10.805", nome: "IRRF", tipo: "despesa" },
  { id: "conta-4.1.10.806", codigo: "4.1.10.806", nome: "ISS CUSTO DE OBRA", tipo: "despesa" },
  { id: "conta-4.1.10.901", codigo: "4.1.10.901", nome: "DESCONTOS CONCEDIDOS", tipo: "despesa" },
  { id: "conta-4.1.10.902", codigo: "4.1.10.902", nome: "DESPESAS BANCARIAS", tipo: "despesa" },
  { id: "conta-4.1.10.903", codigo: "4.1.10.903", nome: "DESPESAS COM CARTÕES", tipo: "despesa" },
  { id: "conta-4.1.10.904", codigo: "4.1.10.904", nome: "IOF", tipo: "despesa" },
  { id: "conta-4.1.10.905", codigo: "4.1.10.905", nome: "JUROS E FINANCIAMENTOS", tipo: "despesa" },
  { id: "conta-4.1.10.906", codigo: "4.1.10.906", nome: "JUROS PASSIVOS", tipo: "despesa" },
  { id: "conta-4.1.10.907", codigo: "4.1.10.907", nome: "JUROS S/ USO DO CHEQUE ESPECIAL", tipo: "despesa" },
  { id: "conta-4.1.10.908", codigo: "4.1.10.908", nome: "MULTAS DE MORA", tipo: "despesa" },
  { id: "conta-4.1.10.909", codigo: "4.1.10.909", nome: "PERDA NO RECEBIMENTO DE CREDITOS", tipo: "despesa" },
  { id: "conta-4.1.11.101", codigo: "4.1.11.101", nome: "CUSTOS DOS IMÓVEIS VENDIDOS", tipo: "despesa" },
  { id: "conta-5.1.10.101", codigo: "5.1.10.101", nome: "CUSTO DOS IMÓVEIS VENDIDOS", tipo: "apuracao" },
  { id: "conta-5.1.10.103", codigo: "5.1.10.103", nome: "RESULTADO DO EXERCICIO", tipo: "apuracao" },
];

// Correspondência entre o código do nosso plano de contas (classificação
// hierárquica, ex: "1.1.10.200.2") e o código interno da própria Domínio
// para a mesma conta (o "Código T" que aparece na tela/relatório de Plano de
// Contas de dentro da Domínio, ex: "664") — usada para gerar o arquivo de
// importação de lançamentos contábeis da Domínio, que identifica cada conta
// só por esse código curto, não pela classificação. Preenchida a partir do
// relatório completo de Plano de Contas exportado em PDF de dentro da
// Domínio (todas as ~314 contas analíticas do plano batem com uma linha
// desse relatório) — a coluna "Código Domínio" na aba Plano de contas
// continua editável para o caso de alguma conta nova ser criada depois.
const SEED_CODIGO_DOMINIO = {
  "1.1.10.101": "5",
  "1.1.10.200.1": "7",
  "1.1.10.200.2": "664",
  "1.1.10.300.1": "597",
  "1.1.10.300.2": "1043",
  "1.1.20.101": "602",
  "1.1.20.103": "627",
  "1.1.20.107": "1002",
  "1.1.20.108": "1003",
  "1.1.20.109": "1001",
  "1.1.20.110": "593",
  "1.1.20.111": "1065",
  "1.1.20.112": "1066",
  "1.1.20.113": "626",
  "1.1.20.114": "603",
  "1.1.20.115": "600",
  "1.1.20.117": "604",
  "1.1.20.118": "11",
  "1.1.20.119": "628",
  "1.1.20.200.1": "13",
  "1.1.30.201": "585",
  "1.1.30.202": "647",
  "1.1.30.300.1": "18",
  "1.1.30.300.2": "19",
  "1.1.30.300.3": "584",
  "1.1.30.400.1": "537",
  "1.1.40.101": "595",
  "1.1.40.102": "596",
  "1.1.40.103": "617",
  "1.1.40.104": "24",
  "1.1.40.105": "23",
  "1.1.40.106": "22",
  "1.1.40.107": "25",
  "1.1.40.108": "594",
  "1.1.60.102": "1004",
  "1.1.60.103": "28",
  "1.1.60.104": "1068",
  "1.1.60.105": "672",
  "1.1.60.106": "671",
  "1.1.60.301": "675",
  "1.1.60.302": "678",
  "1.1.60.303": "676",
  "1.1.60.304": "679",
  "1.1.60.305": "677",
  "1.1.60.306": "680",
  "1.1.60.307": "681",
  "1.1.60.308": "682",
  "1.1.60.309": "683",
  "1.2.10.101": "630",
  "1.2.10.102": "582",
  "1.2.10.103": "583",
  "1.2.10.104": "32",
  "1.2.20.100.1": "48",
  "1.2.30.101": "40",
  "1.2.30.102": "589",
  "1.2.30.103": "37",
  "1.2.30.104": "558",
  "1.2.30.105": "36",
  "1.2.30.107": "1005",
  "1.2.30.108": "39",
  "1.2.30.201": "44",
  "1.2.30.202": "590",
  "1.2.30.203": "43",
  "1.2.30.204": "42",
  "1.2.30.205": "557",
  "1.4.10.101": "548",
  "1.5.10.100.1": "588",
  "2.1.10.101": "1033",
  "2.1.10.102": "1049",
  "2.1.10.103": "1058",
  "2.1.10.104": "567",
  "2.1.10.105": "643",
  "2.1.10.107": "1006",
  "2.1.10.108": "570",
  "2.1.10.111": "1045",
  "2.1.10.112": "1008",
  "2.1.10.114": "1009",
  "2.1.10.115": "1007",
  "2.1.10.116": "1030",
  "2.1.10.117": "1044",
  "2.1.10.118": "655",
  "2.1.10.119": "1047",
  "2.1.10.120": "574",
  "2.1.10.121": "646",
  "2.1.10.122": "1031",
  "2.1.10.123": "566",
  "2.1.10.125": "1073",
  "2.1.10.126": "1037",
  "2.1.10.127": "565",
  "2.1.10.128": "1010",
  "2.1.10.129": "1059",
  "2.1.10.130": "636",
  "2.1.10.131": "665",
  "2.1.10.132": "638",
  "2.1.10.133": "1064",
  "2.1.10.134": "1052",
  "2.1.10.135": "1032",
  "2.1.10.136": "1046",
  "2.1.10.137": "1062",
  "2.1.10.138": "1070",
  "2.1.10.139": "1069",
  "2.1.10.140": "644",
  "2.1.10.141": "656",
  "2.1.10.142": "1050",
  "2.1.10.144": "1011",
  "2.1.10.145": "1048",
  "2.1.10.146": "659",
  "2.1.10.147": "639",
  "2.1.10.148": "625",
  "2.1.10.149": "1061",
  "2.1.10.150": "1057",
  "2.1.10.151": "663",
  "2.1.10.152": "662",
  "2.1.10.153": "633",
  "2.1.10.154": "1036",
  "2.1.10.155": "1063",
  "2.1.10.156": "572",
  "2.1.10.158": "1012",
  "2.1.10.159": "641",
  "2.1.10.160": "660",
  "2.1.10.162": "1015",
  "2.1.10.163": "1028",
  "2.1.10.164": "674",
  "2.1.10.165": "1038",
  "2.1.10.166": "1060",
  "2.1.10.167": "634",
  "2.1.10.168": "642",
  "2.1.10.169": "637",
  "2.1.10.170": "635",
  "2.1.10.171": "1027",
  "2.1.10.173": "1013",
  "2.1.10.174": "1055",
  "2.1.10.175": "1075",
  "2.1.10.176": "1029",
  "2.1.10.177": "658",
  "2.1.10.178": "1026",
  "2.1.10.179": "1025",
  "2.1.10.180": "1054",
  "2.1.10.181": "1071",
  "2.1.10.182": "568",
  "2.1.10.183": "1074",
  "2.1.10.184": "1056",
  "2.1.10.185": "1051",
  "2.1.10.186": "645",
  "2.1.10.187": "1072",
  "2.1.10.188": "1053",
  "2.1.10.189": "1034",
  "2.1.10.190": "1035",
  "2.1.10.201": "57",
  "2.1.10.202": "56",
  "2.1.10.203": "58",
  "2.1.10.204": "55",
  "2.1.10.205": "60",
  "2.1.10.206": "54",
  "2.1.10.207": "59",
  "2.1.10.301": "65",
  "2.1.10.302": "64",
  "2.1.10.303": "66",
  "2.1.10.304": "63",
  "2.1.10.305": "62",
  "2.1.10.401": "611",
  "2.1.10.402": "610",
  "2.1.10.403": "614",
  "2.1.10.404": "613",
  "2.1.10.405": "615",
  "2.1.10.406": "612",
  "2.1.10.501": "71",
  "2.1.10.502": "581",
  "2.1.10.503": "69",
  "2.1.10.504": "72",
  "2.1.10.505": "657",
  "2.1.10.506": "68",
  "2.1.10.507": "580",
  "2.1.10.508": "73",
  "2.1.10.509": "74",
  "2.1.10.510": "1022",
  "2.1.10.511": "70",
  "2.1.10.512": "75",
  "2.1.10.603": "77",
  "2.1.10.604": "219",
  "2.1.10.701": "79",
  "2.1.10.702": "544",
  "2.1.10.703": "559",
  "2.2.10.101": "618",
  "2.2.10.102": "84",
  "2.2.20.101": "621",
  "2.2.20.102": "631",
  "2.2.20.201": "1020",
  "2.2.20.301": "1041",
  "2.2.20.302": "1042",
  "2.4.10.101": "89",
  "2.4.10.102": "88",
  "2.4.10.200.1": "606",
  "2.4.20.100.1": "92",
  "2.4.20.200.1": "94",
  "2.4.20.300.1": "96",
  "2.4.20.300.2": "97",
  "2.4.30.101": "100",
  "2.4.30.103": "1021",
  "2.4.30.104": "654",
  "2.4.40.101": "670",
  "2.4.40.102": "667",
  "2.5.10.101": "551",
  "3.1.10.101": "108",
  "3.1.10.201": "110",
  "3.1.10.300.1": "112",
  "3.1.10.300.2": "113",
  "3.1.10.401": "116",
  "3.1.10.402": "119",
  "3.1.10.403": "117",
  "3.1.10.404": "118",
  "3.1.10.405": "115",
  "3.1.10.501": "122",
  "3.1.10.502": "123",
  "3.1.10.503": "673",
  "3.1.10.504": "579",
  "3.1.10.505": "124",
  "3.1.10.506": "121",
  "3.1.10.601": "1039",
  "3.1.10.602": "127",
  "3.1.10.603": "126",
  "3.1.10.604": "128",
  "3.1.10.605": "129",
  "3.1.10.701": "553",
  "3.1.20.101": "132",
  "3.1.20.102": "133",
  "3.1.20.201": "592",
  "4.1.10.101": "140",
  "4.1.10.102": "147",
  "4.1.10.103": "144",
  "4.1.10.104": "143",
  "4.1.10.105": "150",
  "4.1.10.106": "608",
  "4.1.10.107": "141",
  "4.1.10.108": "142",
  "4.1.10.109": "148",
  "4.1.10.110": "149",
  "4.1.10.111": "138",
  "4.1.10.112": "146",
  "4.1.10.113": "139",
  "4.1.10.114": "145",
  "4.1.10.201": "153",
  "4.1.10.202": "525",
  "4.1.10.203": "152",
  "4.1.10.301": "1067",
  "4.1.10.302": "155",
  "4.1.10.303": "156",
  "4.1.10.304": "632",
  "4.1.10.305": "533",
  "4.1.10.306": "157",
  "4.1.10.307": "562",
  "4.1.10.308": "561",
  "4.1.10.309": "629",
  "4.1.10.310": "158",
  "4.1.10.312": "1016",
  "4.1.10.401": "163",
  "4.1.10.402": "162",
  "4.1.10.403": "161",
  "4.1.10.404": "160",
  "4.1.10.501": "165",
  "4.1.10.502": "170",
  "4.1.10.503": "607",
  "4.1.10.504": "179",
  "4.1.10.505": "175",
  "4.1.10.506": "168",
  "4.1.10.507": "171",
  "4.1.10.508": "182",
  "4.1.10.509": "640",
  "4.1.10.510": "181",
  "4.1.10.511": "173",
  "4.1.10.512": "190",
  "4.1.10.513": "178",
  "4.1.10.514": "184",
  "4.1.10.515": "166",
  "4.1.10.516": "180",
  "4.1.10.517": "177",
  "4.1.10.518": "172",
  "4.1.10.519": "183",
  "4.1.10.520": "186",
  "4.1.10.521": "176",
  "4.1.10.522": "169",
  "4.1.10.523": "187",
  "4.1.10.524": "527",
  "4.1.10.525": "174",
  "4.1.10.526": "185",
  "4.1.10.527": "601",
  "4.1.10.528": "189",
  "4.1.10.530": "167",
  "4.1.10.531": "188",
  "4.1.10.601": "192",
  "4.1.10.602": "194",
  "4.1.10.603": "193",
  "4.1.10.701": "598",
  "4.1.10.702": "197",
  "4.1.10.703": "198",
  "4.1.10.704": "196",
  "4.1.10.801": "201",
  "4.1.10.802": "203",
  "4.1.10.803": "204",
  "4.1.10.804": "200",
  "4.1.10.805": "202",
  "4.1.10.806": "563",
  "4.1.10.901": "207",
  "4.1.10.902": "209",
  "4.1.10.903": "554",
  "4.1.10.904": "212",
  "4.1.10.905": "210",
  "4.1.10.906": "206",
  "4.1.10.907": "211",
  "4.1.10.908": "208",
  "4.1.10.909": "218",
  "4.1.11.101": "1024",
  "5.1.10.101": "556",
  "5.1.10.103": "1018",
};

// Código Domínio efetivo de uma conta: o que a pessoa preencheu manualmente
// (prioridade), senão o valor semente conhecido acima, senão vazio.
function codigoDominioDe(conta) {
  if (!conta) return "";
  return (conta.codigoDominio && String(conta.codigoDominio).trim()) || SEED_CODIGO_DOMINIO[conta.codigo] || "";
}

// Nome da conta com o Código Domínio na frente (ex.: "664 — Caixa Geral"),
// para exibir nos seletores de Débito/Crédito. Sem código conhecido, mostra só o nome.
function formatarContaComCodigoDominio(conta) {
  if (!conta) return "";
  const cod = codigoDominioDe(conta);
  return cod ? `${cod} — ${conta.nome}` : conta.nome;
}

// Extração baseada em padrões de texto comuns em contratos de promessa de
// compra e venda — funciona bem em modelos parecidos, mas pode falhar ou
// vir incompleta se o contrato seguir outro formato. Sempre revisar antes de salvar.
function parseContratoCV(text) {
  const result = {};

  const unidadeMatch = text.match(/n[°º]\s*(\d{2,4})\s+do\s+([A-ZÀ-Üa-zà-ü\s]+?)(?:,|\.|localizado)/i);
  if (unidadeMatch) {
    result.unidade = `Unidade ${unidadeMatch[1]}`;
  } else {
    const fallback = text.match(/[Uu]nidade\s*(?:n[°º]?)?\s*(\d{2,4})/);
    if (fallback) result.unidade = `Unidade ${fallback[1]}`;
  }

  const nomes = [...text.matchAll(/([A-ZÀ-Ü][A-ZÀ-Ü\s]{3,60}?),\s*brasileir[oa]/g)].map((m) =>
    m[1].trim().replace(/\s+/g, " ")
  );
  if (nomes.length) result.comprador = nomes.join(" e ");

  const valorMatch =
    text.match(/import[âa]ncia total de\s*R\$\s*([\d.,]+)/i) ||
    text.match(/pre[çc]o(?:\s*de\s*venda)?[^R$]{0,40}R\$\s*([\d.,]+)/i) ||
    text.match(/valor total(?:\s*de)?\s*R\$\s*([\d.,]+)/i);
  if (valorMatch) {
    const numero = valorMatch[1].replace(/\./g, "").replace(",", ".");
    result.valor = String(Math.round(parseFloat(numero)));
  }

  const dataMatch = text.match(/,\s*(\d{1,2})\s+de\s+([a-zà-üçã]+)\s+de\s+(\d{4})/i);
  if (dataMatch) {
    const [, dia, mesNome, ano] = dataMatch;
    const mes = MESES[mesNome.toLowerCase()];
    if (mes) result.dataAssinatura = `${dia.padStart(2, "0")}/${mes}/${ano}`;
  }

  return result;
}

// Extração de notas de compra por padrão de texto — heurística, revisar
// antes de salvar. Procura fornecedor, valor total, número de parcelas e
// data de emissão em modelos comuns de nota fiscal / boleto de fornecedor.
function parseNotaCompra(text) {
  const result = {};

  const fornecedorMatch = text.match(
    /([A-ZÀ-Ü][A-ZÀ-Üa-zà-ü0-9\s.\-]{2,60}?)\s*(?:LTDA|ME\b|EIRELI|S\/A|SA\b)/
  );
  if (fornecedorMatch) {
    result.fornecedor = fornecedorMatch[0].trim().replace(/\s+/g, " ");
  }

  const valorMatch =
    text.match(/valor total(?:\s*da nota)?\s*[:\-]?\s*R\$\s*([\d.,]+)/i) ||
    text.match(/total\s*(?:a\s*pagar)?\s*[:\-]?\s*R\$\s*([\d.,]+)/i);
  if (valorMatch) {
    const numero = valorMatch[1].replace(/\./g, "").replace(",", ".");
    result.valorTotal = String(Math.round(parseFloat(numero)));
  }

  const parcelasMatch =
    text.match(/(\d{1,2})\s*x\s*(?:de)?\s*R\$/i) ||
    text.match(/(\d{1,2})\s*parcelas?/i);
  if (parcelasMatch) {
    result.numeroParcelas = String(Math.min(24, parseInt(parcelasMatch[1], 10)));
  }

  const dataMatch =
    text.match(/emiss[ãa]o[^0-9]{0,15}(\d{1,2})\/(\d{1,2})\/(\d{4})/i) ||
    text.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (dataMatch) {
    const [, dia, mes, ano] = dataMatch;
    result.dataEmissao = `${dia.padStart(2, "0")}/${mes.padStart(2, "0")}/${ano}`;
  }

  return result;
}

// Detecta possível nota duplicada: mesmo fornecedor (ignorando maiúsculas/
// espaços), mesmo valor total e mesma data de emissão já cadastrados. É uma
// checagem simples — fornecedores com nomes escritos de forma diferente ou
// datas divergentes não são pegos, então continua valendo revisar antes de
// salvar.
function encontrarNotaDuplicada(candidata, notasExistentes) {
  const fornecedorNorm = (candidata.fornecedor || "").trim().toLowerCase();
  const valorCand = Number(candidata.valorTotal);
  if (!fornecedorNorm || !candidata.dataEmissao || Number.isNaN(valorCand)) return null;

  return (
    notasExistentes.find((n) => {
      const mesmoFornecedor = (n.fornecedor || "").trim().toLowerCase() === fornecedorNorm;
      const mesmoValor = Math.abs(n.valorTotal - valorCand) < 0.01;
      const mesmaData = n.dataEmissao === candidata.dataEmissao;
      return mesmoFornecedor && mesmoValor && mesmaData;
    }) || null
  );
}

// Extração de lançamentos de extrato bancário — heurística baseada em linhas
// no formato "data  descrição  valor". Funciona bem com extratos simples e
// tabulares; extratos com colunas de saldo corrente, múltiplas moedas ou
// layouts muito diferentes podem não ser reconhecidos. Cada lançamento
// importado fica em uma prévia editável antes de ser confirmado.
function parseLancamentosExtrato(linhas) {
  const linhaRegex =
    /^(\d{2}\/\d{2}(?:\/\d{2,4})?)\s+(.+?)\s+(-)?\s?(?:R\$\s?)?(\d{1,3}(?:\.\d{3})*,\d{2})\s*([CD])?$/i;
  const resultado = [];

  linhas.forEach((linhaObj) => {
    const linha = linhaObj.texto;
    const m = linha.match(linhaRegex);
    if (!m) return;
    const [, dataStr, descricaoRaw, sinalNeg, valorStr, marcador] = m;

    const [dia, mes, anoRaw] = dataStr.split("/");
    const ano = !anoRaw ? String(new Date().getFullYear()) : anoRaw.length === 2 ? `20${anoRaw}` : anoRaw;
    const data = `${dia}/${mes}/${ano}`;

    const numero = parseFloat(valorStr.replace(/\./g, "").replace(",", "."));
    if (Number.isNaN(numero)) return;
    const isDebito = sinalNeg === "-" || (marcador && marcador.toUpperCase() === "D");
    const valor = isDebito ? -Math.abs(numero) : Math.abs(numero);

    const descricao = descricaoRaw.trim().replace(/\s+/g, " ");
    if (!descricao) return;

    resultado.push({
      id: `tmp-${resultado.length}-${Date.now()}`,
      data,
      descricao,
      valor,
      socio: "",
    });
  });

  return resultado;
}

// Extração alternativa para extratos em formato "lista vertical" — comum em
// extratos exportados direto do aplicativo do banco no celular (em vez de
// uma tabela com data/descrição/valor lado a lado, cada lançamento aparece
// como um "cartão" com 1-4 linhas: rótulo, valor — ex: "-R$ 324,63" — e às
// vezes 1-2 linhas de complemento/contraparte). Cada cartão também tem um
// pequeno marcador de dia+mês (ex: "26AGO"), mas a posição vertical dele
// dentro do cartão não é confiável (pode cair no meio de um nome de
// fornecedor escrito em duas linhas) — por isso essa extração NÃO usa o
// marcador para separar lançamentos. Em vez disso usa: (1) o cabeçalho de
// data de cada bloco ("26 de Agosto de 2026, ...") para saber o dia, e (2) o
// salto vertical entre linhas — bem maior entre cartões do que dentro do
// mesmo cartão, e sempre "grande" numa quebra de página — para saber onde um
// lançamento termina e o próximo começa. Isso também corrige o caso de
// extratos com várias páginas, que antes só reconheciam os lançamentos da
// 1ª página. Linhas de saldo ("Saldo do dia", "Saldo Anterior") fecham o
// cartão atual. Usado como segunda tentativa quando parseLancamentosExtrato
// não encontra nada.
function parseLancamentosExtratoVertical(linhas) {
  let ano = String(new Date().getFullYear());
  let diaAtual = null;
  let mesAtual = null;

  // Salto vertical (em pontos) a partir do qual duas linhas são consideradas
  // de cartões/lançamentos diferentes. Nos exemplos observados, o maior
  // espaçamento dentro de um mesmo cartão (entre a 1ª e a 2ª linha de um
  // nome de contraparte em duas linhas) fica em torno de 22-23pt, enquanto o
  // espaçamento entre cartões distintos é de 45pt ou mais — 32 fica
  // confortavelmente no meio.
  const GAP_CARTAO = 32;

  const cartoes = [];
  let cartaoAtual = null;
  let yAnterior = null;

  function novoCartao() {
    cartaoAtual = { linhas: [], dia: diaAtual, mes: mesAtual, ano };
    cartoes.push(cartaoAtual);
  }

  linhas.forEach((l) => {
    const linha = (l.texto || "").trim();
    if (!linha) return;

    // Cabeçalho de data completo ("26 de Agosto de 2026, Quarta-feira") —
    // define o dia usado em todos os lançamentos do bloco seguinte, até o
    // próximo cabeçalho.
    const headerMatch = linha.match(/^(\d{1,2})\s+de\s+([a-zçã]+)\s+de\s+(\d{4})/i);
    if (headerMatch) {
      const [, dia, mesNome, anoHeader] = headerMatch;
      const mes = MESES[mesNome.toLowerCase()];
      if (mes) {
        diaAtual = dia.padStart(2, "0");
        mesAtual = mes;
        ano = anoHeader;
      }
      cartaoAtual = null;
      yAnterior = null;
      return;
    }

    // Linhas de saldo — não são lançamentos, fecham o cartão acumulado
    if (/^saldo\s+(do\s+dia|anterior)/i.test(linha)) {
      cartaoAtual = null;
      yAnterior = null;
      return;
    }

    // Textos de interface do app/site que não são lançamentos
    if (/^(extrato por per[íi]odo|ordenar|compartilhar|voltar)$/i.test(linha)) {
      return;
    }

    // Marcador de dia+mês (ex: "26AGO") — a data já vem do cabeçalho do
    // bloco, então esse marcador só serviria para confirmar; como sua
    // posição pode cair no meio da descrição de um lançamento, é ignorado.
    if (/^\d{1,2}[A-Z]{3}$/.test(linha)) {
      return;
    }

    const salto = yAnterior === null ? Infinity : yAnterior - l.y;
    if (l.novaPagina || cartaoAtual === null || salto > GAP_CARTAO) {
      novoCartao();
    }
    cartaoAtual.linhas.push(linha);
    yAnterior = l.y;
  });

  const resultado = [];
  cartoes.forEach((cartao) => {
    if (!cartao.dia || !cartao.mes) return;

    // Dentro do cartão, a linha do valor pode vir sozinha ("-R$ 324,63") ou
    // com um pedaço da descrição antes, na mesma linha ("Tar Pix -R$ 3,15");
    // as demais linhas (antes ou depois) são descrição/complemento.
    let valor = null;
    const descricaoPartes = [];
    cartao.linhas.forEach((linha) => {
      if (valor === null && /R\$/.test(linha)) {
        const valorMatch = linha.match(/^(.*?)\s*(-)?\s?R\$\s?([\d.,]+)\s*$/i);
        if (valorMatch) {
          const [, descExtra, sinalNeg, valorStr] = valorMatch;
          const numero = parseFloat(valorStr.replace(/\./g, "").replace(",", "."));
          if (!Number.isNaN(numero)) {
            valor = sinalNeg === "-" ? -Math.abs(numero) : Math.abs(numero);
            if (descExtra && descExtra.trim()) descricaoPartes.push(descExtra.trim());
            return;
          }
        }
      }
      descricaoPartes.push(linha);
    });

    const descricao = descricaoPartes.join(" ").trim().replace(/\s+/g, " ");
    if (valor !== null && descricao) {
      resultado.push({
        id: `tmp-${resultado.length}-${Date.now()}`,
        data: `${cartao.dia}/${cartao.mes}/${cartao.ano}`,
        descricao,
        valor,
        socio: "",
      });
    }
  });

  return resultado;
}

// Extração para a aba "Extrato em PDF" (visualização somente leitura): ao
// contrário de parseLancamentosExtratoVertical (usada na aba de Lançamentos
// contábeis, que ignora as linhas de saldo porque ali o saldo inicial é
// controlado manualmente pelo usuário), essa função MANTÉM a divisão por dia
// e os saldos reais impressos no próprio extrato ("Saldo Anterior" e "Saldo
// do dia" de cada dia) — para simplesmente mostrar o extrato tal como veio
// do banco/app, sem misturar com a contabilização.
function parseExtratoPdfComSaldos(linhas) {
  const GAP_CARTAO = 32;

  const dias = [];
  let diaAtualObj = null;
  let cartaoAtual = null;
  let yAnterior = null;
  let saldoAnterior = null;

  function novoCartao() {
    cartaoAtual = { linhas: [] };
    if (diaAtualObj) diaAtualObj.cartoes.push(cartaoAtual);
  }

  linhas.forEach((l) => {
    const linha = (l.texto || "").trim();
    if (!linha) return;

    const headerMatch = linha.match(/^(\d{1,2})\s+de\s+([a-zçã]+)\s+de\s+(\d{4})(?:,\s*(.+))?/i);
    if (headerMatch) {
      const [, dia, mesNome, anoHeader, diaSemana] = headerMatch;
      const mes = MESES[mesNome.toLowerCase()];
      if (mes) {
        const dataLabel = `${dia.padStart(2, "0")}/${mes}/${anoHeader}`;
        diaAtualObj = {
          data: dataLabel,
          diaSemana: (diaSemana || "").replace(/\s*-\s*/g, "-"),
          saldoDoDia: null,
          cartoes: [],
        };
        dias.push(diaAtualObj);
      }
      cartaoAtual = null;
      yAnterior = null;
      return;
    }

    const saldoDoDiaMatch = linha.match(/^saldo\s+do\s+dia\D*(-)?\s?R\$\s?([\d.,]+)/i);
    if (saldoDoDiaMatch) {
      const [, sinalNeg, valorStr] = saldoDoDiaMatch;
      const numero = parseFloat(valorStr.replace(/\./g, "").replace(",", "."));
      if (!Number.isNaN(numero) && diaAtualObj) {
        diaAtualObj.saldoDoDia = sinalNeg === "-" ? -Math.abs(numero) : Math.abs(numero);
      }
      cartaoAtual = null;
      yAnterior = null;
      return;
    }

    const saldoAnteriorMatch = linha.match(/^saldo\s+anterior\D*(-)?\s?R\$\s?([\d.,]+)/i);
    if (saldoAnteriorMatch) {
      const [, sinalNeg, valorStr] = saldoAnteriorMatch;
      const numero = parseFloat(valorStr.replace(/\./g, "").replace(",", "."));
      if (!Number.isNaN(numero)) {
        saldoAnterior = sinalNeg === "-" ? -Math.abs(numero) : Math.abs(numero);
      }
      cartaoAtual = null;
      yAnterior = null;
      return;
    }

    if (/^(extrato por per[íi]odo|ordenar|compartilhar|voltar)$/i.test(linha)) {
      return;
    }

    if (/^\d{1,2}[A-Z]{3}$/.test(linha)) {
      return;
    }

    if (!diaAtualObj) return;

    const salto = yAnterior === null ? Infinity : yAnterior - l.y;
    if (l.novaPagina || cartaoAtual === null || salto > GAP_CARTAO) {
      novoCartao();
    }
    cartaoAtual.linhas.push(linha);
    yAnterior = l.y;
  });

  dias.forEach((dia) => {
    dia.lancamentos = dia.cartoes
      .map((cartao) => {
        let valor = null;
        const descricaoPartes = [];
        cartao.linhas.forEach((linha) => {
          if (valor === null && /R\$/.test(linha)) {
            const valorMatch = linha.match(/^(.*?)\s*(-)?\s?R\$\s?([\d.,]+)\s*$/i);
            if (valorMatch) {
              const [, descExtra, sinalNeg, valorStr] = valorMatch;
              const numero = parseFloat(valorStr.replace(/\./g, "").replace(",", "."));
              if (!Number.isNaN(numero)) {
                valor = sinalNeg === "-" ? -Math.abs(numero) : Math.abs(numero);
                if (descExtra && descExtra.trim()) descricaoPartes.push(descExtra.trim());
                return;
              }
            }
          }
          descricaoPartes.push(linha);
        });
        const descricao = descricaoPartes.join(" ").trim().replace(/\s+/g, " ");
        if (valor === null || !descricao) return null;
        return { descricao, valor };
      })
      .filter(Boolean);
    delete dia.cartoes;
  });

  return { saldoAnterior, dias };
}

// Compara uma lista de lançamentos recém-lidos do PDF com o que já está
// salvo no Extrato bancário e marca como "já lançado" os que baterem
// exatamente em data + descrição + valor — útil quando o período de um
// novo extrato se sobrepõe ao de um já importado antes (ex: exportar
// "últimos 30 dias" todo mês). Não remove nada sozinho: só marca a linha
// na prévia, o usuário decide se pula ou inclui mesmo assim.
function normalizarDescricaoExtrato(texto) {
  return (texto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Mant\u00e9m s\u00f3 os d\u00edgitos de um texto \u2014 usado para buscar uma conta do plano de
// contas pelo n\u00famero, ignorando pontos/h\u00edfens/barras de formata\u00e7\u00e3o (assim
// "2002" ou "11102002" encontram o c\u00f3digo "1.1.10.200.2", e "6695" encontra
// "CONTA: 669-5").
function somenteDigitos(texto) {
  return (texto || "").replace(/\D+/g, "");
}

// Verifica se uma conta do plano de contas corresponde ao texto buscado \u2014
// tanto por palavras do c\u00f3digo/nome (ignorando acento/mai\u00fasculas, em
// qualquer ordem, sem precisar ser um trecho cont\u00ednuo) quanto pelos d\u00edgitos
// do n\u00famero da conta (ignorando a formata\u00e7\u00e3o com pontos/h\u00edfens/barras).
function contaCorrespondeABusca(conta, busca) {
  const textoBusca = normalizarDescricaoExtrato(busca);
  if (!textoBusca) return true;
  const alvoTexto = normalizarDescricaoExtrato(`${conta.codigo} ${conta.nome}`);
  const palavras = textoBusca.split(" ").filter(Boolean);
  if (palavras.every((p) => alvoTexto.includes(p))) return true;
  const digitosBusca = somenteDigitos(busca);
  if (digitosBusca.length >= 2) {
    const digitosAlvo = somenteDigitos(`${conta.codigo} ${conta.nome}`);
    if (digitosAlvo.includes(digitosBusca)) return true;
  }
  return false;
}

function marcarDuplicadosExtrato(lancamentosNovos, extratoExistente) {
  const existentesChaves = new Set(
    extratoExistente.map(
      (l) => `${l.data}|${normalizarDescricaoExtrato(l.descricao)}|${Number(l.valor).toFixed(2)}`
    )
  );
  return lancamentosNovos.map((l) => {
    const chave = `${l.data}|${normalizarDescricaoExtrato(l.descricao)}|${Number(l.valor).toFixed(2)}`;
    return { ...l, jaLancado: existentesChaves.has(chave), incluirMesmoAssim: false };
  });
}

// Sugere, para cada lançamento de crédito (entrada) na prévia de importação,
// uma parcela pendente em "Valores a receber" com o MESMO valor exato — só
// sugere quando há uma única parcela pendente com aquele valor (sem
// ambiguidade); se houver mais de uma parcela pendente com o mesmo valor, ou
// nenhuma, deixa em branco para o usuário escolher manualmente. Evita
// sugerir a mesma parcela duas vezes dentro do mesmo lote de importação.
// Só ajuda a pré-selecionar — o usuário sempre pode trocar ou limpar antes
// de confirmar.
function sugerirParcelasReceber(lancamentosNovos, valoresReceberAtuais) {
  const usadasNoLote = new Set();
  return lancamentosNovos.map((l) => {
    if (Number(l.valor) <= 0) return l;
    const candidatas = valoresReceberAtuais.filter(
      (v) => v.status !== "pago" && Number(v.valor).toFixed(2) === Number(l.valor).toFixed(2) && !usadasNoLote.has(v.id)
    );
    if (candidatas.length !== 1) return l;
    usadasNoLote.add(candidatas[0].id);
    return { ...l, parcelaReceberId: candidatas[0].id };
  });
}

// Mesma lógica de sugerirParcelasReceber, só que para o lado das saídas:
// sugere, para cada lançamento de débito na prévia de importação, uma
// parcela pendente em "Contas a pagar" com o mesmo valor exato — só quando
// há uma única candidata sem ambiguidade.
function sugerirContasPagar(lancamentosNovos, contasPagarAtuais) {
  const usadasNoLote = new Set();
  return lancamentosNovos.map((l) => {
    if (Number(l.valor) >= 0) return l;
    const candidatas = contasPagarAtuais.filter(
      (c) =>
        c.status !== "pago" &&
        Number(c.valor).toFixed(2) === Number(Math.abs(l.valor)).toFixed(2) &&
        !usadasNoLote.has(c.id)
    );
    if (candidatas.length !== 1) return l;
    usadasNoLote.add(candidatas[0].id);
    return { ...l, contaPagarId: candidatas[0].id };
  });
}

// Sugere as contas de Débito e Crédito do plano de contas para um lançamento
// do extrato, no formato de partida dobrada (igual ao que sistemas como o
// Nibo pedem): o lado do Banco entra automaticamente conforme o sinal do
// valor (dinheiro entrando → Banco no Débito; saindo → Banco no Crédito) e o
// outro lado é uma sugestão — a partir do fornecedor/parcela já vinculados
// (contaPagarId / parcelaReceberId), ou por comparação de texto entre a
// descrição do lançamento e o nome de cada conta do plano (ex: um Pix para
// "POLIMIX CONCRETO" casa com a conta de fornecedor "POLIMIX CONCRETO LTDA",
// se ela existir no plano), ou por um pequeno dicionário de padrões comuns de
// extrato (tarifa, IOF, água, luz...). É só um ponto de partida — sempre
// revisável nos campos de Débito/Crédito antes de lançar de fato.
// Palavras comuns demais em nomes de empresa/obra para, sozinhas, servirem de
// critério de casamento (ex: "ltda" aparece em dezenas de contas de
// fornecedor do plano — usá-la isolada gera casamentos aleatórios).
const PALAVRAS_GENERICAS_CLASSIFICACAO = new Set([
  "ltda", "eireli", "epp", "comercio", "industria", "industrial",
  "construcao", "construcoes", "materiais", "servicos", "instalacoes",
  "participacoes", "associados", "auditoria", "consultoria", "contabeis",
  "sociedade", "individual", "administradora", "artigos", "produtos",
]);

function sugerirClassificacaoContabil(lancamento, contexto) {
  const { planoContas, contaBancoPadraoId, contasPagar, valoresReceber } = contexto;
  const contaBanco = planoContas.find((c) => c.id === contaBancoPadraoId) || null;
  const entrada = Number(lancamento.valor) > 0;

  // Compara a descrição do lançamento (ou o nome de um fornecedor/cliente já
  // vinculado) com o nome de cada conta do plano, por sobreposição de
  // palavras com 4+ letras — ignorando palavras genéricas demais (ver acima)
  // — e exige pelo menos 2 pontos de coincidência (ou a única palavra
  // significativa do texto, quando há só uma) para evitar sugestões por uma
  // única palavra comum demais coincidir à toa.
  function buscarPorTexto(texto) {
    const alvo = normalizarDescricaoExtrato(texto);
    if (!alvo) return null;
    const palavras = alvo.split(" ").filter((p) => p.length >= 4 && !PALAVRAS_GENERICAS_CLASSIFICACAO.has(p));
    if (palavras.length === 0) return null;
    const minimoPontos = palavras.length === 1 ? 1 : 2;
    let melhor = null;
    let melhorPontos = 0;
    let empate = false;
    planoContas.forEach((c) => {
      const nomeConta = normalizarDescricaoExtrato(c.nome);
      if (!nomeConta) return;
      let pontos = 0;
      palavras.forEach((p) => {
        if (nomeConta.includes(p)) pontos += 1;
      });
      if (pontos > melhorPontos) {
        melhorPontos = pontos;
        melhor = c;
        empate = false;
      } else if (pontos > 0 && pontos === melhorPontos) {
        empate = true;
      }
    });
    if (melhorPontos < minimoPontos) return null;
    return empate ? null : melhor;
  }

  function buscarPorNomeExato(nomeConta) {
    const alvo = normalizarDescricaoExtrato(nomeConta);
    return planoContas.find((c) => normalizarDescricaoExtrato(c.nome) === alvo) || null;
  }

  // Padrões comuns de extrato bancário (tarifas, tributos, concessionárias)
  // — checados antes do casamento genérico de texto, porque um nome de obra
  // ou fornecedor pode conter palavras parecidas (ex: cidade "Navegantes" no
  // nome de um terreno da empresa colidindo com "Pm de Navegantes" — a
  // prefeitura cobrando IPTU) e o padrão específico é mais confiável aqui.
  function buscarPorPadraoComum(texto) {
    const desc = normalizarDescricaoExtrato(texto);
    const regrasPadrao = [
      [/\btar(ifa)?\b|manuten[cç][aã]o de conta|\bcesta\b/, "DESPESAS BANCARIAS"],
      [/\biof\b/, "IOF"],
      [/juros/, entrada ? "JUROS ATIVOS" : "JUROS PASSIVOS"],
      [/rend(imento)? pago aplic|resgate automat/, "RENDIMENTOS DE APLICAÇOES FINANCEIRAS"],
      [/\biptu\b/, "IPTU"],
      [/condominio/, "CONDOMINIO"],
      [/energia|\bluz\b|celesc|copel|cpfl|\benel\b/, "ENERGIA ELETRICA"],
      [/\bagua\b|sanepar|casan|sabesp/, "AGUA"],
      [/telefone|internet|\bvivo\b|\bclaro\b|\btim\b|\boi\b/, "TELEFONE"],
    ];
    for (const [regex, nomeConta] of regrasPadrao) {
      if (regex.test(desc)) {
        const achada = buscarPorNomeExato(nomeConta);
        if (achada) return achada;
      }
    }
    return null;
  }

  let contraparte = null;

  if (!entrada && lancamento.contaPagarId) {
    const conta = (contasPagar || []).find((c) => c.id === lancamento.contaPagarId);
    if (conta && conta.fornecedor) contraparte = buscarPorTexto(conta.fornecedor);
  }
  if (entrada && lancamento.parcelaReceberId) {
    const parcela = (valoresReceber || []).find((v) => v.id === lancamento.parcelaReceberId);
    if (parcela) contraparte = buscarPorTexto(parcela.comprador) || buscarPorTexto(parcela.unidade);
  }
  if (!contraparte) {
    contraparte = buscarPorPadraoComum(lancamento.descricao);
  }
  if (!contraparte) {
    contraparte = buscarPorTexto(lancamento.descricao);
  }

  return {
    contaDebitoId: entrada ? (contaBanco ? contaBanco.id : "") : contraparte ? contraparte.id : "",
    contaCreditoId: entrada ? (contraparte ? contraparte.id : "") : contaBanco ? contaBanco.id : "",
  };
}

// Extração heurística de número, data de emissão e validade a partir do
// texto de um PDF de documento da empresa — funciona melhor como ponto de
// partida; confira e complete os campos antes de salvar.
function parseDocumentoEmpresa(text) {
  const result = {};

  const cnpjMatch = text.match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/);
  if (cnpjMatch) {
    result.numero = cnpjMatch[0];
  } else {
    const numeroMatch = text.match(/n[ºo°]\s*[:.]?\s*([\d./-]{4,25})/i);
    if (numeroMatch) result.numero = numeroMatch[1].trim();
  }

  const emissaoMatch =
    text.match(/emiss[ãa]o[^0-9]{0,15}(\d{1,2}\/\d{1,2}\/\d{4})/i) ||
    text.match(/emitid[oa]\s+em[^0-9]{0,10}(\d{1,2}\/\d{1,2}\/\d{4})/i) ||
    text.match(/expedid[oa]\s+em[^0-9]{0,10}(\d{1,2}\/\d{1,2}\/\d{4})/i);
  if (emissaoMatch) result.dataEmissao = emissaoMatch[1];

  const validadeMatch =
    text.match(/v[áa]lid[oa]\s+at[ée][^0-9]{0,10}(\d{1,2}\/\d{1,2}\/\d{4})/i) ||
    text.match(/validade[^0-9]{0,10}(\d{1,2}\/\d{1,2}\/\d{4})/i) ||
    text.match(/vencimento[^0-9]{0,10}(\d{1,2}\/\d{1,2}\/\d{4})/i);
  if (validadeMatch) result.validade = validadeMatch[1];

  return result;
}

function parseDateBR(str) {
  if (!str) return null;
  const m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [, dia, mes, ano] = m;
  return new Date(Number(ano), Number(mes) - 1, Number(dia));
}

function formatDateBR(date) {
  const dia = String(date.getDate()).padStart(2, "0");
  const mes = String(date.getMonth() + 1).padStart(2, "0");
  const ano = date.getFullYear();
  return `${dia}/${mes}/${ano}`;
}

// Conversões para usar <input type="date"> (seletor de calendário nativo) e
// mesmo assim guardar as datas como "dd/mm/aaaa" — formato usado em todo o
// resto do painel — sem precisar mudar como as datas são lidas em nenhum
// outro lugar.
function dataBRparaISO(dataBR) {
  if (!dataBR) return "";
  const m = dataBR.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return "";
  const [, dia, mes, ano] = m;
  return `${ano}-${mes.padStart(2, "0")}-${dia.padStart(2, "0")}`;
}

function dataISOparaBR(dataISO) {
  if (!dataISO) return "";
  const m = dataISO.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return "";
  const [, ano, mes, dia] = m;
  return `${dia}/${mes}/${ano}`;
}

function addMonths(date, meses) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + meses);
  return d;
}

// Gera as parcelas de contas a pagar a partir de uma nota de compra.
// 1 parcela: vence 30 dias após a emissão. Mais de 1: primeira parcela 30
// dias após a emissão, demais mensais a partir daí.
function gerarParcelas(nota) {
  const emissao = parseDateBR(nota.dataEmissao) || new Date();
  const n = Math.max(1, Number(nota.numeroParcelas) || 1);
  const valorParcela = Math.round(nota.valorTotal / n);
  const parcelas = [];
  // primeira parcela vence 1 mês após a emissão, cada parcela seguinte +1 mês
  for (let i = 0; i < n; i++) {
    const vencimento = addMonths(emissao, i + 1);
    const valor = i === n - 1 ? nota.valorTotal - valorParcela * (n - 1) : valorParcela;
    parcelas.push({
      id: `${nota.id}-${i + 1}`,
      notaId: nota.id,
      fornecedor: nota.fornecedor,
      obra: nota.obra,
      parcela: `${i + 1}/${n}`,
      valor,
      vencimento: formatDateBR(vencimento),
      status: "pendente",
    });
  }
  return parcelas;
}

// Gera as parcelas de uma despesa avulsa lançada direto em Contas a pagar
// (sem passar por nota de compra ou contrato). Diferente de gerarParcelas: o
// vencimento digitado é o da 1ª parcela — não soma mais 1 mês por cima —
// e as demais parcelas seguem mensalmente a partir daí.
function gerarParcelasDespesaAvulsa(despesa) {
  const primeiroVencimento = parseDateBR(despesa.dataVencimento) || new Date();
  const n = Math.max(1, Number(despesa.numeroParcelas) || 1);
  const valorParcela = Math.round(despesa.valorTotal / n);
  const parcelas = [];
  for (let i = 0; i < n; i++) {
    const vencimento = addMonths(primeiroVencimento, i);
    const valor = i === n - 1 ? despesa.valorTotal - valorParcela * (n - 1) : valorParcela;
    parcelas.push({
      id: `${despesa.id}-${i + 1}`,
      notaId: despesa.id,
      fornecedor: despesa.fornecedor,
      obra: despesa.obra,
      parcela: `${i + 1}/${n}`,
      valor,
      vencimento: formatDateBR(vencimento),
      status: "pendente",
    });
  }
  return parcelas;
}

// Gera as parcelas de valores a receber a partir de um contrato de compra e
// venda. Se o contrato tiver "datasParcelas" (array de datas dd/mm/aaaa
// definidas à mão), usa essas datas; senão, mesma regra de sempre: 1ª
// parcela 1 mês após a assinatura, demais mensais a partir daí. Se tiver
// "valoresParcelas" (array de números definidos à mão), usa esses valores em
// vez de dividir o total igualmente. Independente do campo "% pago" do
// contrato — as duas coisas não se atualizam uma à outra automaticamente,
// assim como notas de compra não recalculam contas a pagar já geradas.
function gerarParcelasReceber(contrato) {
  const assinatura = parseDateBR(contrato.dataAssinatura) || new Date();
  const personalizadas =
    Array.isArray(contrato.valoresParcelas) && contrato.valoresParcelas.length > 0
      ? contrato.valoresParcelas
      : null;
  const datasPersonalizadas =
    Array.isArray(contrato.datasParcelas) && contrato.datasParcelas.length > 0
      ? contrato.datasParcelas
      : null;
  const n = personalizadas
    ? personalizadas.length
    : datasPersonalizadas
    ? datasPersonalizadas.length
    : Math.max(1, Number(contrato.numeroParcelas) || 1);
  const valorParcelaPadrao = Math.round(contrato.valor / n);
  const parcelas = [];
  for (let i = 0; i < n; i++) {
    const vencimento = datasPersonalizadas && datasPersonalizadas[i] ? datasPersonalizadas[i] : formatDateBR(addMonths(assinatura, i + 1));
    const valor = personalizadas
      ? Number(personalizadas[i]) || 0
      : i === n - 1
      ? contrato.valor - valorParcelaPadrao * (n - 1)
      : valorParcelaPadrao;
    parcelas.push({
      id: `${contrato.id}-r${i + 1}`,
      contratoId: contrato.id,
      unidade: contrato.unidade,
      comprador: contrato.comprador,
      parcela: `${i + 1}/${n}`,
      valor,
      vencimento,
      status: "pendente",
    });
  }
  return parcelas;
}

// ---- Mock data (protótipo — dados fictícios) ----

const obrasIniciais = [
  {
    id: "ic",
    nome: "Isla Catalina",
    status: "em_andamento",
    avancoFisico: 0,
  },
  {
    id: "ip",
    nome: "Residencial Isla Providência",
    status: "concluida",
    nota: "Última unidade em comercialização",
  },
];

const NOMES_OBRAS = obrasIniciais.map((o) => o.nome);
const NOMES_SOCIOS = ["Gabriel Oltramari Neto", "João Gabriel Herdt"];

// Modelo de orçamento de obra por etapa/item — mesma estrutura da planilha
// "Orçamento de obra" enviada: Quantidade, Valor Unitário e Gasto Real são
// preenchidos manualmente; Orçado, Saldo e % Executado são calculados.
const ETAPAS_CUSTO = [
  {
    etapa: "1. Serviços Preliminares",
    itens: [
      { item: "Instalação de canteiro de obras", unidade: "vb" },
      { item: "Tapumes e sinalização", unidade: "m" },
      { item: "Ligações provisórias (água, luz, esgoto)", unidade: "vb" },
      { item: "Locação da obra (gabarito)", unidade: "vb" },
    ],
  },
  {
    etapa: "2. Fundação",
    itens: [
      { item: "Sondagem do solo (SPT)", unidade: "vb" },
      { item: "Escavação e terraplenagem", unidade: "m³" },
      { item: "Estacas/tubulões", unidade: "un" },
      { item: "Blocos e vigas baldrame", unidade: "m³" },
      { item: "Impermeabilização da fundação", unidade: "m²" },
    ],
  },
  {
    etapa: "3. Estrutura",
    itens: [
      { item: "Formas para pilares, vigas e lajes", unidade: "m²" },
      { item: "Aço (armação)", unidade: "kg" },
      { item: "Concreto usinado", unidade: "m³" },
      { item: "Lajes (por pavimento)", unidade: "m²" },
      { item: "Escadas e caixa de elevador (estrutura)", unidade: "vb" },
    ],
  },
  {
    etapa: "4. Alvenaria e Vedação",
    itens: [
      { item: "Alvenaria de blocos (vedação)", unidade: "m²" },
      { item: "Vergas e contravergas", unidade: "m" },
      { item: "Impermeabilização de áreas molhadas", unidade: "m²" },
    ],
  },
  {
    etapa: "5. Instalações Hidrossanitárias",
    itens: [
      { item: "Tubulação de água fria/quente", unidade: "vb" },
      { item: "Esgoto e ventilação", unidade: "vb" },
      { item: "Caixas d'água e bombas", unidade: "un" },
      { item: "Louças e metais (por unidade/apto)", unidade: "vb" },
    ],
  },
  {
    etapa: "6. Instalações Elétricas",
    itens: [
      { item: "Infraestrutura elétrica (eletrodutos, fiação)", unidade: "vb" },
      { item: "Quadros de distribuição", unidade: "un" },
      { item: "Subestação/entrada de energia", unidade: "vb" },
      { item: "Iluminação de áreas comuns", unidade: "vb" },
    ],
  },
  {
    etapa: "7. Instalações Especiais",
    itens: [
      { item: "Elevadores (fornecimento e instalação)", unidade: "un" },
      { item: "Gás (central e tubulação)", unidade: "vb" },
      { item: "Sistema de incêndio (hidrantes, extintores)", unidade: "vb" },
      { item: "SPDA (para-raios)", unidade: "vb" },
      { item: "Gerador de emergência", unidade: "un" },
    ],
  },
  {
    etapa: "8. Esquadrias",
    itens: [
      { item: "Esquadrias de alumínio (janelas/portas)", unidade: "m²" },
      { item: "Portas internas", unidade: "un" },
      { item: "Portão/portaria (entrada do prédio)", unidade: "vb" },
      { item: "Guarda-corpos e grades", unidade: "m" },
    ],
  },
  {
    etapa: "9. Revestimentos e Acabamentos",
    itens: [
      { item: "Reboco/emboço interno e externo", unidade: "m²" },
      { item: "Revestimento cerâmico (paredes)", unidade: "m²" },
      { item: "Piso (áreas privativas)", unidade: "m²" },
      { item: "Piso (áreas comuns)", unidade: "m²" },
      { item: "Forro (gesso/PVC)", unidade: "m²" },
      { item: "Pintura interna e externa", unidade: "m²" },
      { item: "Fachada (revestimento externo)", unidade: "m²" },
    ],
  },
  {
    etapa: "10. Áreas Comuns e Externas",
    itens: [
      { item: "Portaria e hall de entrada", unidade: "vb" },
      { item: "Paisagismo", unidade: "vb" },
      { item: "Piscina/área de lazer (se houver)", unidade: "vb" },
      { item: "Muros e calçadas", unidade: "m" },
      { item: "Estacionamento", unidade: "m²" },
    ],
  },
  {
    etapa: "11. Administração e Legalização",
    itens: [
      { item: "Projeto arquitetônico e complementares", unidade: "vb" },
      { item: "ART/RRT e responsabilidade técnica", unidade: "vb" },
      { item: "Alvará de construção", unidade: "vb" },
      { item: "Habite-se", unidade: "vb" },
      { item: "Averbação e registro", unidade: "vb" },
      { item: "Administração da obra (engenheiro/mestre)", unidade: "mês" },
    ],
  },
  {
    etapa: "12. Reserva Técnica",
    itens: [{ item: "Contingência (imprevistos)", unidade: "vb" }],
  },
];

function gerarCustosItensIniciais(obraNome) {
  const itens = [];
  let seq = 1;
  ETAPAS_CUSTO.forEach(({ etapa, itens: itensEtapa }) => {
    itensEtapa.forEach(({ item, unidade }) => {
      itens.push({
        id: `custo-${seq}`,
        obra: obraNome,
        etapa,
        item,
        unidade,
        quantidade: "",
        valorUnitario: "",
        gastoReal: "",
        observacoes: "",
      });
      seq += 1;
    });
  });
  return itens;
}

const defaultCustosItens = gerarCustosItensIniciais(NOMES_OBRAS[0]);

// Réplica das fórmulas da planilha: Orçado = Quantidade × Valor Unitário (só
// se os dois estiverem preenchidos); Saldo = Orçado − Gasto Real; % Executado
// = Gasto Real ÷ Orçado. Célula em branco na planilha = null aqui.
function custoOrcadoItem(it) {
  if (it.quantidade === "" || it.valorUnitario === "" || it.quantidade == null || it.valorUnitario == null) {
    return null;
  }
  const q = Number(it.quantidade);
  const v = Number(it.valorUnitario);
  if (Number.isNaN(q) || Number.isNaN(v)) return null;
  return q * v;
}

function custoSaldoItem(it) {
  const orcado = custoOrcadoItem(it);
  if (orcado === null) return null;
  const gasto = it.gastoReal === "" || it.gastoReal == null ? 0 : Number(it.gastoReal) || 0;
  return orcado - gasto;
}

function custoPctItem(it) {
  const orcado = custoOrcadoItem(it);
  if (!orcado) return null;
  const gasto = it.gastoReal === "" || it.gastoReal == null ? 0 : Number(it.gastoReal) || 0;
  return gasto / orcado;
}

// Soma orçado/gasto/saldo/% de um conjunto de itens — usado para os
// subtotais por etapa e para o total geral da obra.
function resumoCustoItens(itens) {
  const orcado = itens.reduce((s, it) => s + (custoOrcadoItem(it) || 0), 0);
  const gasto = itens.reduce(
    (s, it) => s + (it.gastoReal === "" || it.gastoReal == null ? 0 : Number(it.gastoReal) || 0),
    0
  );
  return { orcado, gasto, saldo: orcado - gasto, pct: orcado ? gasto / orcado : null };
}

// Gasto real "efetivo" de um item: se houver parcelas de contas a pagar
// vinculadas a ele (campo custoItemId) e já pagas, o gasto real vem da soma
// dessas parcelas — o campo digitado manualmente é ignorado nesse caso. Sem
// vínculo nenhum, usa o valor digitado manualmente, como antes.
function gastoRealEfetivo(item, contasPagarLista) {
  const vinculadas = contasPagarLista.filter(
    (c) => c.custoItemId === item.id && statusPagarDisplay(c) === "pago"
  );
  if (vinculadas.length > 0) {
    return vinculadas.reduce((s, c) => s + valorAtualizadoItem(c), 0);
  }
  return item.gastoReal;
}

const TIPOS_FORNECEDOR = ["Fornecedor de material", "Subempreiteiro"];

// contrato de fornecedor/subempreiteiro — "vigente" por padrão; "vencendo"
// nos 30 dias antes do término; "vencido" depois do término; "encerrado" só
// quando marcado manualmente (ex: contrato finalizado antes do prazo)
function statusContratoFornecedorDisplay(c) {
  if (c.encerrado) return "encerrado";
  const termino = parseDateBR(c.dataTermino);
  if (!termino) return "ativo";
  const hoje = new Date(new Date().toDateString());
  if (termino < hoje) return "vencido";
  const em30 = new Date(hoje);
  em30.setDate(em30.getDate() + 30);
  if (termino <= em30) return "vencendo";
  return "ativo";
}

// dias até o término do contrato (negativo = dias em atraso); null se não
// houver data de término informada
function diasRestantesContrato(c) {
  const termino = parseDateBR(c.dataTermino);
  if (!termino) return null;
  const hoje = new Date(new Date().toDateString());
  return Math.round((termino - hoje) / (1000 * 60 * 60 * 24));
}

// Extração heurística de dados de contrato de fornecedor a partir do texto
// do PDF — CNPJ, valor do contrato e datas de início/término. Igual aos
// outros importadores: revise os campos antes de salvar.
function parseContratoFornecedor(text) {
  const result = {};

  const cnpjMatch = text.match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/);
  if (cnpjMatch) result.cnpj = cnpjMatch[0];

  const valorMatch =
    text.match(/valor (?:total )?(?:do )?contrato\s*[:\-]?\s*R\$\s*([\d.,]+)/i) ||
    text.match(/valor global\s*[:\-]?\s*R\$\s*([\d.,]+)/i);
  if (valorMatch) {
    const numero = valorMatch[1].replace(/\./g, "").replace(",", ".");
    result.valor = String(Math.round(parseFloat(numero)));
  }

  const inicioMatch =
    text.match(/in[íi]cio[^0-9]{0,15}(\d{1,2}\/\d{1,2}\/\d{4})/i) ||
    text.match(/vig[êe]ncia[^0-9]{0,15}(\d{1,2}\/\d{1,2}\/\d{4})/i);
  if (inicioMatch) result.dataInicio = inicioMatch[1];

  const terminoMatch =
    text.match(/t[ée]rmino[^0-9]{0,15}(\d{1,2}\/\d{1,2}\/\d{4})/i) ||
    text.match(/prazo[^0-9]{0,20}at[ée][^0-9]{0,10}(\d{1,2}\/\d{1,2}\/\d{4})/i);
  if (terminoMatch) result.dataTermino = terminoMatch[1];

  return result;
}

const defaultContratosFornecedores = [];

const defaultContratosServicos = [];

const defaultContratosCV = [];

const defaultUnidadesObra = [];

const statusUnidadeConfig = {
  disponivel: { label: "Disponível", color: "#4F7A5B", bg: "#E8EEE8" },
  reservada: { label: "Reservada", color: "#B4590C", bg: "#FBEBDB" },
  vendida: { label: "Vendida", color: "#3D6E8C", bg: "#E4EBEF" },
};

// Status "vendida" é automático: quando existe um contrato de compra e
// venda com o mesmo nome de unidade, a unidade aparece como vendida (com o
// comprador do contrato) — não precisa marcar manualmente. Sem contrato
// correspondente, usa o status escolhido à mão (Disponível/Reservada).
function statusUnidadeEfetivo(unidade, contratosCVLista) {
  const contrato = contratosCVLista.find(
    (c) => c.unidade.trim().toLowerCase() === unidade.unidade.trim().toLowerCase()
  );
  if (contrato) return { status: "vendida", contrato };
  return { status: unidade.statusManual || "disponivel", contrato: null };
}

// Parcelas geradas a partir dos contratos acima; o número de parcelas já
// marcadas como recebidas segue proporcionalmente o "% pago" de cada
// contrato (só para os dados fictícios — depois de criado, um contrato novo
// gera parcelas todas pendentes).
const defaultValoresReceber = defaultContratosCV.flatMap((c) => {
  const parcelas = gerarParcelasReceber(c);
  const pagas = Math.round((c.percentualPago / 100) * parcelas.length);
  return parcelas.map((p, i) => (i < pagas ? { ...p, status: "pago" } : p));
});

const defaultNotasCompra = [];

const defaultContasPagar = [
  ...defaultNotasCompra.flatMap((n) => gerarParcelas(n)),
  ...defaultContratosFornecedores.flatMap((c) =>
    gerarParcelas({
      id: c.id,
      dataEmissao: c.dataInicio,
      numeroParcelas: c.numeroParcelas,
      valorTotal: c.valor,
      fornecedor: c.fornecedor,
      obra: c.obra,
    })
  ),
  ...defaultContratosServicos.flatMap((c) =>
    gerarParcelas({
      id: c.id,
      dataEmissao: c.dataInicio,
      numeroParcelas: c.numeroParcelas,
      valorTotal: c.valor,
      fornecedor: c.fornecedor,
      obra: c.obra,
    })
  ),
];

const defaultExtrato = [];

const defaultEmprestimosSocios = [];

const MESES_ABREV = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function mesAnoKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function mesAnoLabel(date) {
  return `${MESES_ABREV[date.getMonth()]}/${String(date.getFullYear()).slice(2)}`;
}

// Detalhe do fluxo de caixa de um mês específico (chave "aaaa-mm"): lista
// cada lançamento de origem (valores a receber, contas a pagar, extrato,
// empréstimos de sócios) que caiu naquele mês, separado em entradas/saídas —
// usado para expandir uma linha da planilha detalhada de fluxo de caixa.
function detalheFluxoMes(chave, valoresReceberLista, contasPagarLista, extratoLista, emprestimosSociosLista) {
  const entradas = [];
  const saidas = [];

  valoresReceberLista.forEach((v) => {
    const d = parseDateBR(v.vencimento);
    if (d && mesAnoKey(d) === chave) {
      entradas.push({
        id: `receber-${v.id}`,
        origem: "Valores a receber",
        descricao: `${v.comprador} — ${v.unidade} (${v.parcela})`,
        valor: v.valor,
        data: v.vencimento,
      });
    }
  });

  contasPagarLista.forEach((c) => {
    const d = parseDateBR(c.vencimento);
    if (d && mesAnoKey(d) === chave) {
      saidas.push({
        id: `pagar-${c.id}`,
        origem: "Contas a pagar",
        descricao: `${c.fornecedor} — ${c.obra} (${c.parcela})`,
        valor: c.valor,
        data: c.vencimento,
      });
    }
  });

  extratoLista.forEach((l) => {
    const d = parseDateBR(l.data);
    if (d && mesAnoKey(d) === chave) {
      if (l.valor >= 0) {
        entradas.push({ id: `extrato-${l.id}`, origem: "Extrato bancário", descricao: l.descricao, valor: l.valor, data: l.data });
      } else {
        saidas.push({ id: `extrato-${l.id}`, origem: "Extrato bancário", descricao: l.descricao, valor: Math.abs(l.valor), data: l.data });
      }
    }
  });

  emprestimosSociosLista.forEach((e) => {
    const d = parseDateBR(e.data);
    if (d && mesAnoKey(d) === chave) {
      if (e.tipo === "aporte") {
        entradas.push({ id: `socio-${e.id}`, origem: "Empréstimo de sócio", descricao: `Aporte — ${e.socio}`, valor: e.valor, data: e.data });
      } else {
        saidas.push({ id: `socio-${e.id}`, origem: "Empréstimo de sócio", descricao: `Devolução — ${e.socio}`, valor: e.valor, data: e.data });
      }
    }
  });

  entradas.sort((a, b) => (parseDateBR(a.data) || 0) - (parseDateBR(b.data) || 0));
  saidas.sort((a, b) => (parseDateBR(a.data) || 0) - (parseDateBR(b.data) || 0));
  return { entradas, saidas };
}

// ---- Helpers ----

const formatBRL = (v) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

const formatBRLShort = (v) => {
  if (Math.abs(v) >= 1000000) return `R$ ${(v / 1000000).toFixed(1)}M`;
  if (Math.abs(v) >= 1000) return `R$ ${(v / 1000).toFixed(0)}mil`;
  return formatBRL(v);
};

// Texto formatado "R$ 802.333,00" para preencher um campo de saldo editável
// (ponto separando milhar, vírgula separando centavos, como no extrato do banco).
function formatMoedaInputBR(valor) {
  const numero = Number(valor) || 0;
  return `R$ ${numero.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Converte o texto digitado (aceita "802.333,00", "802333,00", "802333" ou
// mesmo colado com "R$"/espaços) de volta para número.
function parseMoedaInputBR(texto) {
  if (texto == null) return 0;
  const limpo = String(texto).trim().replace(/[^\d,.-]/g, "");
  if (!limpo) return 0;
  const normalizado = limpo.includes(",") ? limpo.replace(/\./g, "").replace(",", ".") : limpo;
  const numero = parseFloat(normalizado);
  return Number.isFinite(numero) ? numero : 0;
}

const statusConfig = {
  ativo: { label: "Ativo", color: "#4F7A5B", bg: "#E8EEE8" },
  vencendo: { label: "Vencendo", color: "#B4590C", bg: "#FBEBDB" },
  vencido: { label: "Vencido", color: "#B23A2E", bg: "#F8E3E0" },
  encerrado: { label: "Encerrado", color: "#8A8D93", bg: "#EFEDE6" },
};

const statusPagamentoConfig = {
  quitado: { label: "Quitado", color: "#4F7A5B", bg: "#E8EEE8" },
  em_dia: { label: "Em dia", color: "#3D6E8C", bg: "#E4EBEF" },
  atrasado: { label: "Atrasado", color: "#B23A2E", bg: "#F8E3E0" },
};

const statusPagarConfig = {
  pago: { label: "Pago", color: "#4F7A5B", bg: "#E8EEE8" },
  pendente: { label: "Pendente", color: "#3D6E8C", bg: "#E4EBEF" },
  vencendo: { label: "Vencendo", color: "#B4590C", bg: "#FBEBDB" },
  vencido: { label: "Vencido", color: "#B23A2E", bg: "#F8E3E0" },
};

// pago é guardado; vencido/vencendo é calculado comparando o vencimento com
// hoje — "vencendo" é o que vence nos próximos 30 dias, mesma janela usada
// para documentos da empresa e contratos de fornecedores/serviços.
function statusPagarDisplay(c) {
  if (c.status === "pago") return "pago";
  const venc = parseDateBR(c.vencimento);
  if (!venc) return "pendente";
  const hoje = new Date(new Date().toDateString());
  if (venc < hoje) return "vencido";
  const em30 = new Date(hoje);
  em30.setDate(em30.getDate() + 30);
  if (venc <= em30) return "vencendo";
  return "pendente";
}

const statusReceberConfig = {
  pago: { label: "Recebido", color: "#4F7A5B", bg: "#E8EEE8" },
  pendente: { label: "Pendente", color: "#3D6E8C", bg: "#E4EBEF" },
  vencendo: { label: "Vencendo", color: "#B4590C", bg: "#FBEBDB" },
  vencido: { label: "Vencido", color: "#B23A2E", bg: "#F8E3E0" },
};

// mesma lógica de statusPagarDisplay, aplicada às parcelas de valores a receber
function statusReceberDisplay(v) {
  if (v.status === "pago") return "pago";
  const venc = parseDateBR(v.vencimento);
  if (!venc) return "pendente";
  const hoje = new Date(new Date().toDateString());
  if (venc < hoje) return "vencido";
  const em30 = new Date(hoje);
  em30.setDate(em30.getDate() + 30);
  if (venc <= em30) return "vencendo";
  return "pendente";
}

// Valor atualizado = valor original + juros + multa (ambos opcionais,
// preenchidos manualmente quando o pagamento/recebimento sai do previsto).
// Usado tanto em Contas a pagar quanto em Valores a receber.
function valorAtualizadoItem(item) {
  return Number(item.valor || 0) + Number(item.juros || 0) + Number(item.multa || 0);
}

function tipoExtratoConfig(valor) {
  return valor >= 0
    ? { label: "Crédito", color: "#4F7A5B", bg: "#E8EEE8" }
    : { label: "Débito", color: "#B23A2E", bg: "#F8E3E0" };
}

// Status de classificação contábil de um lançamento — igual ao modelo do
// Nibo: "Pendente" enquanto faltar Débito e/ou Crédito, "Lançado" assim que
// os dois estiverem preenchidos. Não é salvo à parte — é calculado na hora a
// partir de contaDebitoId/contaCreditoId, então muda sozinho assim que a
// pessoa classifica a conta que faltava.
const statusClassificacaoConfig = {
  lancado: { label: "Lançado", color: "#4F7A5B", bg: "#E8EEE8" },
  pendente: { label: "Pendente", color: "#B4590C", bg: "#FBEBDB" },
};

function statusClassificacaoContabil(l) {
  return l.contaDebitoId && l.contaCreditoId ? "lancado" : "pendente";
}

const tipoSocioConfig = {
  aporte: { label: "Aporte (empréstimo ao caixa)", color: "#4F7A5B", bg: "#E8EEE8" },
  devolucao: { label: "Devolução ao sócio", color: "#B23A2E", bg: "#F8E3E0" },
};

const DOCUMENTOS_ESSENCIAIS = [
  "CNO",
  "Contrato de Permuta ou Compra de Terreno",
  "Contrato Social",
  "Alteração Contratual",
  "RG do Sócio",
  "CNPJ",
];

const statusDocumentoConfig = {
  vencido: { label: "Vencido", color: "#B23A2E", bg: "#F8E3E0" },
  vencendo: { label: "Vencendo", color: "#B4590C", bg: "#FBEBDB" },
  valido: { label: "Válido", color: "#4F7A5B", bg: "#E8EEE8" },
  sem_validade: { label: "Sem validade", color: "#3D6E8C", bg: "#E4EBEF" },
};

// sem validade informada = documento permanente (ex: CNPJ, contrato social)
function statusDocumentoDisplay(doc) {
  if (!doc.validade) return "sem_validade";
  const venc = parseDateBR(doc.validade);
  if (!venc) return "sem_validade";
  const hoje = new Date(new Date().toDateString());
  if (venc < hoje) return "vencido";
  const em30 = new Date(hoje);
  em30.setDate(em30.getDate() + 30);
  if (venc <= em30) return "vencendo";
  return "valido";
}

// Ruler-style progress bar — signature element evoking a measuring tape
function RulerBar({ pct, colorFrom = "#3D6E8C", colorTo = "#3D6E8C" }) {
  const clamped = Math.min(100, Math.max(0, pct));
  return (
    <div className="relative h-6 w-full rounded-sm overflow-hidden" style={{ background: "#E4E0D6" }}>
      <div
        className="absolute inset-y-0 left-0 rounded-sm"
        style={{
          width: `${clamped}%`,
          background: colorFrom,
          transition: "width 700ms ease-out",
        }}
      />
      {/* tick marks, like a tape measure */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "repeating-linear-gradient(to right, rgba(34,37,42,0.35) 0px, rgba(34,37,42,0.35) 1px, transparent 1px, transparent 10%)",
        }}
      />
      <div
        className="absolute inset-y-0 flex items-center pl-1.5 text-[11px] font-semibold tracking-wide"
        style={{ color: "#22252A", fontFamily: "'IBM Plex Mono', monospace" }}
      >
        {clamped}%
      </div>
    </div>
  );
}

function KpiCard({ eyebrow, value, sub, accent, onClick }) {
  return (
    <div
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") onClick();
            }
          : undefined
      }
      title={onClick ? "Ver detalhes nessa aba" : undefined}
      className="flex-1 min-w-[180px] rounded-md p-4 border"
      style={{ background: "#F5F3EC", borderColor: "#DCD7C9", cursor: onClick ? "pointer" : "default" }}
    >
      <div
        className="text-[11px] uppercase tracking-[0.14em] font-semibold mb-2"
        style={{ color: "#6B6F76", fontFamily: "'Oswald', sans-serif" }}
      >
        {eyebrow}
      </div>
      <div
        className="text-2xl font-semibold"
        style={{ color: accent || "#22252A", fontFamily: "'IBM Plex Mono', monospace" }}
      >
        {value}
      </div>
      {sub && (
        <div className="text-xs mt-1" style={{ color: "#8A8D93" }}>
          {sub}
        </div>
      )}
    </div>
  );
}

// Campo de busca para escolher uma conta do plano de contas (usado nas
// colunas Débito/Crédito do Extrato bancário) — substitui um <select> comum
// porque, com centenas de contas, digitar para filtrar pelo NOME é muito
// mais rápido do que rolar a lista inteira (o <select> nativo só pula para
// opções pelo início do texto, que aqui começa pelo código, não pelo nome).
function SeletorConta({ value, onChange, planoContas, placeholder, disabled }) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const containerRef = useRef(null);

  useEffect(() => {
    if (!aberto) return;
    function handleClickFora(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setAberto(false);
        setBusca("");
      }
    }
    document.addEventListener("mousedown", handleClickFora);
    return () => document.removeEventListener("mousedown", handleClickFora);
  }, [aberto]);

  const contaAtual = planoContas.find((c) => c.id === value) || null;
  // Busca por palavras do código/nome (em qualquer ordem, sem acento) OU
  // pelos dígitos do número da conta (ignorando pontos/hífens) — assim
  // "terrenos isla" encontra "TERRENOS A COMERCIALIZAR - ISLA PROVIDENCIA" e
  // "2002" ou "6695" encontram a conta pelo número.
  const opcoesFiltradas = busca.trim()
    ? planoContas.filter((c) => contaCorrespondeABusca(c, busca))
    : planoContas;

  return (
    <div className="relative" ref={containerRef} style={{ width: "100%", minWidth: 0 }}>
      <input
        value={aberto ? busca : contaAtual ? formatarContaComCodigoDominio(contaAtual) : ""}
        onChange={(e) => {
          setBusca(e.target.value);
          setAberto(true);
        }}
        onFocus={() => {
          if (disabled) return;
          setAberto(true);
          setBusca("");
        }}
        disabled={disabled}
        title={
          disabled
            ? "Lançamento já lançado — marque e use \"Editar\" ou \"Desfazer\" para alterar"
            : contaAtual
            ? `${contaAtual.codigo} — ${contaAtual.nome}`
            : undefined
        }
        placeholder={placeholder}
        className="text-xs px-2 py-1.5 rounded-sm outline-none"
        style={{
          border: "1px solid #DCD7C9",
          color: disabled ? "#8A8D93" : "#22252A",
          background: disabled ? "#F3F1EA" : "#FFFFFF",
          cursor: disabled ? "not-allowed" : "text",
          width: "100%",
          minWidth: 0,
        }}
      />
      {aberto && !disabled && (
        <div
          className="absolute z-20 mt-1 max-h-60 overflow-y-auto rounded-sm border"
          style={{ background: "#FFFFFF", borderColor: "#DCD7C9", minWidth: "280px", boxShadow: "0 4px 14px rgba(0,0,0,0.15)" }}
        >
          <div
            className="text-xs px-2 py-1.5 cursor-pointer"
            style={{ color: "#8A8D93" }}
            onMouseDown={(e) => {
              e.preventDefault();
              onChange("");
              setAberto(false);
              setBusca("");
            }}
          >
            (nenhuma)
          </div>
          {opcoesFiltradas.length === 0 && (
            <div className="text-xs px-2 py-1.5" style={{ color: "#8A8D93" }}>
              Nenhuma conta encontrada
            </div>
          )}
          {opcoesFiltradas.map((c) => (
            <div
              key={c.id}
              className="text-xs px-2 py-1.5 cursor-pointer"
              style={{ color: "#22252A", background: c.id === value ? "#E4EBEF" : "transparent" }}
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(c.id);
                setAberto(false);
                setBusca("");
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#F5F3EC")}
              onMouseLeave={(e) => (e.currentTarget.style.background = c.id === value ? "#E4EBEF" : "transparent")}
              title={`${c.codigo} — ${c.nome}`}
            >
              {formatarContaComCodigoDominio(c)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Relatório consolidado — resume os números de todas as abas numa única
// página, pronta para imprimir ou salvar como PDF (menu do navegador).
// Componentes genéricos de relatório — usados pelas abas que não têm layout
// próprio (Custos das obras continua com o layout detalhado por etapa).
function ReportKpis({ items }) {
  return (
    <div className="flex flex-wrap gap-3 mb-6">
      {items.map(({ label, value, accent }) => (
        <div key={label} className="flex-1 min-w-[150px] rounded-md p-4 border" style={{ background: "#F5F3EC", borderColor: "#DCD7C9" }}>
          <div className="text-[11px] uppercase tracking-[0.14em] font-semibold mb-2" style={{ color: "#6B6F76", fontFamily: "'Oswald', sans-serif" }}>
            {label}
          </div>
          <div className="text-xl font-semibold" style={{ color: accent || "#22252A", fontFamily: "'IBM Plex Mono', monospace" }}>
            {value}
          </div>
        </div>
      ))}
    </div>
  );
}

function ReportTable({ titulo, columns, rows }) {
  const templateCols = columns.map((c) => c.width || "1fr").join(" ");
  return (
    <div className="mb-6">
      {titulo && (
        <h3
          className="text-sm uppercase tracking-[0.1em] font-semibold mb-2"
          style={{ color: "#22252A", fontFamily: "'Oswald', sans-serif" }}
        >
          {titulo}
        </h3>
      )}
      <div
        className="hidden sm:grid gap-2 px-2 pb-1 text-[10px] uppercase tracking-wide font-semibold"
        style={{ color: "#8A8D93", gridTemplateColumns: templateCols }}
      >
        {columns.map((c) => (
          <span key={c.label}>{c.label}</span>
        ))}
      </div>
      <div className="space-y-1">
        {rows.length === 0 ? (
          <div className="text-xs py-3 text-center" style={{ color: "#8A8D93" }}>
            Nenhum registro.
          </div>
        ) : (
          rows.map((row, i) => (
            <div
              key={i}
              className="grid grid-cols-2 sm:block sm:grid gap-1.5 sm:gap-2 items-center rounded-sm px-2 py-1.5 text-xs"
              style={{ border: "1px solid #E4E0D6", gridTemplateColumns: templateCols }}
            >
              {row.map((cell, j) => (
                <span
                  key={j}
                  style={{
                    color: "#22252A",
                    fontFamily: columns[j] && columns[j].mono ? "'IBM Plex Mono', monospace" : undefined,
                  }}
                >
                  {cell}
                </span>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// Relatório — resume os números da aba ativa numa página pronta para
// imprimir ou salvar como PDF (menu do navegador). "custos" tem um layout
// detalhado próprio (etapas + itens); as demais abas usam tabelas genéricas.
function ReportView({
  tipo,
  onFechar,
  obraCustoSelecionada,
  itensObraCustoAtual,
  totalGeralObraCusto,
  obrasComRealizado,
  totalOrcado,
  totalRealizado,
  saldoCaixa,
  vencendoEm30,
  contratosCV,
  totalVGV,
  totalRecebidoCV,
  unidadesAtrasadas,
  valoresReceber,
  saldoPorUnidade,
  totalAReceber,
  totalRecebidoParcelas,
  parcelasReceberVencidas,
  notasCompra,
  totalNotasCompra,
  contasPagar,
  totalAPagar,
  totalPago,
  parcelasVencidas,
  extrato,
  saldoExtrato,
  saldoInicialExtrato,
  saldoFinalExtrato,
  totalCreditosExtrato,
  totalDebitosExtrato,
  saldoAplicacoes,
  movimentosSocios,
  saldoPorSocio,
  saldoComSocios,
  totalAportado,
  totalDevolvido,
  documentos,
  documentosVencidos,
  documentosVencendo,
  essenciaisPendentes,
  contratosFornecedores,
  totalContratadoFornecedores,
  contratosFornecedoresVencendo,
  contratosFornecedoresVencidos,
  contratosFornecedoresAtivos,
  contratosServicos,
  totalContratadoServicos,
  contratosServicosVencendo,
  contratosServicosVencidos,
  contratosServicosAtivos,
  totalEntradasFluxo,
  totalSaidasFluxo,
  fluxoCaixa,
  unidadesComStatus,
  totalVGVPotencial,
  totalVGVVendido,
  unidadesDisponiveis,
  unidadesReservadas,
  unidadesVendidas,
}) {
  const agora = new Date();
  const dataGeracao = `${agora.toLocaleDateString("pt-BR")} às ${agora.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
  const MESES_EXTENSO = [
    "janeiro", "fevereiro", "março", "abril", "maio", "junho",
    "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
  ];
  const dataExtenso = `${agora.getDate()} de ${MESES_EXTENSO[agora.getMonth()]} de ${agora.getFullYear()}`;

  let titulo = "Relatório";
  let kpis = [];
  let tabelas = [];
  let saldosConsolidados = [];

  if (tipo === "consolidado") {
    titulo = "Relatório Consolidado — Obras & Contratos";
    tabelas = [
      {
        titulo: "Obras — orçado × realizado",
        columns: [
          { label: "Obra", width: "1.4fr" },
          { label: "Orçado", width: "1fr", mono: true },
          { label: "Realizado", width: "1fr", mono: true },
          { label: "Saldo", width: "1fr", mono: true },
          { label: "Avanço físico", width: "0.9fr" },
        ],
        rows: obrasComRealizado.map((o) => [
          o.nome,
          o.status === "concluida" ? "—" : formatBRLShort(o.orcado),
          o.status === "concluida" ? "—" : formatBRLShort(o.realizado),
          o.status === "concluida" ? "Concluída" : formatBRLShort(o.orcado - o.realizado),
          o.status === "concluida" ? "—" : `${o.avancoFisico}%`,
        ]),
      },
    ];
    saldosConsolidados = [
      {
        titulo: "Financeiro consolidado",
        linhas: [
          ["Total contratado", formatBRL(totalOrcado)],
          ["Total realizado", formatBRL(totalRealizado)],
          ["Saldo em caixa (últimos 6 meses)", formatBRL(saldoCaixa)],
          ["Contratos vencendo em 30 dias", `${vencendoEm30}`],
        ],
      },
      {
        titulo: "Contratos de compra e venda",
        linhas: [
          ["VGV total", formatBRL(totalVGV)],
          ["Recebido até agora", formatBRL(totalRecebidoCV)],
          ["Unidades com pagamento atrasado", `${unidadesAtrasadas}`],
        ],
      },
      {
        titulo: "Valores a receber",
        linhas: [
          ["Total a receber", formatBRL(totalAReceber)],
          ["Total recebido", formatBRL(totalRecebidoParcelas)],
          ["Parcelas vencidas", `${parcelasReceberVencidas}`],
        ],
      },
      {
        titulo: "Notas de compras",
        linhas: [
          ["Total em notas", formatBRL(totalNotasCompra)],
          ["Notas cadastradas", `${notasCompra.length}`],
        ],
      },
      {
        titulo: "Contas a pagar",
        linhas: [
          ["Total a pagar", formatBRL(totalAPagar)],
          ["Total pago", formatBRL(totalPago)],
          ["Parcelas vencidas", `${parcelasVencidas}`],
        ],
      },
      {
        titulo: "Extrato bancário",
        linhas: [
          ["Saldo inicial", formatBRL(saldoInicialExtrato)],
          ["Saldo do extrato", formatBRL(saldoExtrato)],
          ["Total de créditos", formatBRL(totalCreditosExtrato)],
          ["Total de débitos", formatBRL(totalDebitosExtrato)],
          ["Saldo final", formatBRL(saldoFinalExtrato)],
          ["Saldo em aplicações", formatBRL(saldoAplicacoes)],
        ],
      },
      {
        titulo: "Empréstimos de sócios",
        linhas: [
          ["Saldo com sócios", formatBRL(saldoComSocios)],
          ["Total aportado", formatBRL(totalAportado)],
          ["Total devolvido", formatBRL(totalDevolvido)],
        ],
      },
    ];
  } else if (tipo === "geral") {
    titulo = "Relatório — Visão Geral";
    kpis = [
      { label: "Total contratado", value: formatBRL(totalOrcado) },
      { label: "Total realizado", value: formatBRL(totalRealizado), accent: "#3D6E8C" },
      { label: "Saldo em caixa (6 meses)", value: formatBRL(saldoCaixa), accent: saldoCaixa >= 0 ? "#4F7A5B" : "#B23A2E" },
      { label: "Contratos vencendo em 30 dias", value: `${vencendoEm30}` },
    ];
    tabelas = [
      {
        titulo: "Obras — orçado × realizado",
        columns: [
          { label: "Obra", width: "1.4fr" },
          { label: "Orçado", width: "1fr", mono: true },
          { label: "Realizado", width: "1fr", mono: true },
          { label: "Saldo", width: "1fr", mono: true },
          { label: "Avanço físico", width: "0.9fr" },
        ],
        rows: obrasComRealizado.map((o) => [
          o.nome,
          o.status === "concluida" ? "—" : formatBRLShort(o.orcado),
          o.status === "concluida" ? "—" : formatBRLShort(o.realizado),
          o.status === "concluida" ? "Concluída" : formatBRLShort(o.orcado - o.realizado),
          o.status === "concluida" ? "—" : `${o.avancoFisico}%`,
        ]),
      },
    ];
  } else if (tipo === "unidades") {
    titulo = "Relatório — Unidades e Tabela de Vendas";
    kpis = [
      { label: "VGV potencial", value: formatBRL(totalVGVPotencial) },
      { label: "VGV vendido", value: formatBRL(totalVGVVendido), accent: "#3D6E8C" },
      { label: "Disponíveis", value: `${unidadesDisponiveis}`, accent: "#4F7A5B" },
      { label: "Reservadas", value: `${unidadesReservadas}`, accent: "#B4590C" },
      { label: "Vendidas", value: `${unidadesVendidas}`, accent: "#3D6E8C" },
    ];
    tabelas = [
      {
        titulo: "Unidades",
        columns: [
          { label: "Unidade", width: "1fr" },
          { label: "Tipo", width: "1fr" },
          { label: "Metragem", width: "0.7fr" },
          { label: "Valor de venda", width: "1fr", mono: true },
          { label: "Status", width: "0.8fr" },
          { label: "Comprador", width: "1.2fr" },
        ],
        rows: unidadesComStatus.map((u) => [
          u.unidade,
          u.tipo || "—",
          u.metragem ? `${u.metragem} m²` : "—",
          formatBRLShort(u.valorVenda),
          statusUnidadeConfig[u.statusEfetivo].label,
          u.contratoVinculado ? u.contratoVinculado.comprador : "—",
        ]),
      },
    ];
  } else if (tipo === "cv") {
    titulo = "Relatório — Contratos de Compra e Venda";
    kpis = [
      { label: "VGV total", value: formatBRL(totalVGV) },
      { label: "Recebido até agora", value: formatBRL(totalRecebidoCV), accent: "#3D6E8C" },
      { label: "Unidades atrasadas", value: `${unidadesAtrasadas}`, accent: unidadesAtrasadas > 0 ? "#B23A2E" : "#22252A" },
    ];
    tabelas = [
      {
        titulo: "Contratos",
        columns: [
          { label: "Unidade", width: "1.1fr" },
          { label: "Comprador", width: "1.4fr" },
          { label: "Valor", width: "1fr", mono: true },
          { label: "% pago", width: "0.6fr" },
          { label: "Assinatura", width: "0.9fr", mono: true },
          { label: "Status", width: "0.8fr" },
        ],
        rows: contratosCV.map((c) => [
          c.unidade,
          c.comprador,
          formatBRLShort(c.valor),
          `${c.percentualPago}%`,
          c.dataAssinatura,
          statusPagamentoConfig[c.statusPagamento] ? statusPagamentoConfig[c.statusPagamento].label : c.statusPagamento,
        ]),
      },
    ];
  } else if (tipo === "receber") {
    titulo = "Relatório — Valores a Receber";
    kpis = [
      { label: "Total a receber", value: formatBRL(totalAReceber), accent: "#B4590C" },
      { label: "Total recebido", value: formatBRL(totalRecebidoParcelas), accent: "#4F7A5B" },
      { label: "Parcelas vencidas", value: `${parcelasReceberVencidas}`, accent: parcelasReceberVencidas > 0 ? "#B23A2E" : "#22252A" },
    ];
    tabelas = [
      {
        titulo: "Saldo por unidade e cliente",
        columns: [
          { label: "Unidade", width: "1.1fr" },
          { label: "Comprador", width: "1.4fr" },
          { label: "Total da venda", width: "1fr", mono: true },
          { label: "Recebido", width: "1fr", mono: true },
          { label: "Saldo a receber", width: "1fr", mono: true },
        ],
        rows: saldoPorUnidade.map((g) => [
          g.unidade,
          g.comprador,
          formatBRLShort(g.valorTotal),
          formatBRLShort(g.recebido),
          formatBRLShort(g.saldoAReceber),
        ]),
      },
    ];
  } else if (tipo === "notas") {
    titulo = "Relatório — Notas de Compras";
    kpis = [
      { label: "Total em notas", value: formatBRL(totalNotasCompra) },
      { label: "Notas cadastradas", value: `${notasCompra.length}` },
    ];
    tabelas = [
      {
        titulo: "Notas de compras",
        columns: [
          { label: "Fornecedor", width: "1.4fr" },
          { label: "Obra", width: "1fr" },
          { label: "Valor total", width: "1fr", mono: true },
          { label: "Emissão", width: "0.8fr", mono: true },
          { label: "Parcelas", width: "0.6fr" },
        ],
        rows: notasCompra.map((n) => [n.fornecedor, n.obra, formatBRLShort(n.valorTotal), n.dataEmissao, `${n.numeroParcelas}x`]),
      },
    ];
  } else if (tipo === "pagar") {
    titulo = "Relatório — Contas a Pagar";
    kpis = [
      { label: "Total a pagar", value: formatBRL(totalAPagar), accent: "#B4590C" },
      { label: "Total pago", value: formatBRL(totalPago), accent: "#4F7A5B" },
      { label: "Parcelas vencidas", value: `${parcelasVencidas}`, accent: parcelasVencidas > 0 ? "#B23A2E" : "#22252A" },
    ];
    tabelas = [
      {
        titulo: "Contas a pagar",
        columns: [
          { label: "Fornecedor", width: "1.3fr" },
          { label: "Obra", width: "1fr" },
          { label: "Parcela", width: "0.6fr" },
          { label: "Valor", width: "0.9fr", mono: true },
          { label: "Vencimento", width: "0.9fr", mono: true },
          { label: "Status", width: "0.8fr" },
        ],
        rows: contasPagar.map((c) => [
          c.fornecedor,
          c.obra,
          c.parcela,
          formatBRLShort(c.valor),
          c.vencimento,
          statusPagarConfig[statusPagarDisplay(c)].label,
        ]),
      },
    ];
  } else if (tipo === "extrato") {
    titulo = "Relatório — Extrato Bancário";
    kpis = [
      { label: "Saldo inicial", value: formatBRL(saldoInicialExtrato) },
      { label: "Saldo do extrato", value: formatBRL(saldoExtrato), accent: saldoExtrato >= 0 ? "#4F7A5B" : "#B23A2E" },
      { label: "Total de créditos", value: formatBRL(totalCreditosExtrato), accent: "#4F7A5B" },
      { label: "Total de débitos", value: formatBRL(totalDebitosExtrato), accent: "#B23A2E" },
      { label: "Saldo final", value: formatBRL(saldoFinalExtrato), accent: saldoFinalExtrato >= 0 ? "#4F7A5B" : "#B23A2E" },
      { label: "Saldo em aplicações", value: formatBRL(saldoAplicacoes), accent: saldoAplicacoes >= 0 ? "#4F7A5B" : "#B23A2E" },
    ];
    tabelas = [
      {
        titulo: "Lançamentos",
        columns: [
          { label: "Data", width: "0.8fr", mono: true },
          { label: "Descrição", width: "1.8fr" },
          { label: "Valor", width: "1fr", mono: true },
          { label: "Tipo", width: "0.7fr" },
        ],
        rows: extrato.map((l) => [
          l.data,
          l.descricao,
          `${l.valor >= 0 ? "+" : "−"}${formatBRLShort(Math.abs(l.valor))}`,
          l.valor >= 0 ? "Crédito" : "Débito",
        ]),
      },
    ];
  } else if (tipo === "socios") {
    titulo = "Relatório — Empréstimos de Sócios";
    kpis = [
      { label: "Saldo com sócios", value: formatBRL(saldoComSocios), accent: saldoComSocios > 0 ? "#B4590C" : "#22252A" },
      { label: "Total aportado", value: formatBRL(totalAportado), accent: "#4F7A5B" },
      { label: "Total devolvido", value: formatBRL(totalDevolvido), accent: "#3D6E8C" },
    ];
    tabelas = [
      {
        titulo: "Saldo por sócio",
        columns: [
          { label: "Sócio", width: "1.4fr" },
          { label: "Saldo", width: "1.2fr", mono: true },
        ],
        rows: saldoPorSocio.map((s) => [
          s.socio,
          s.saldo > 0
            ? `Empresa deve ${formatBRLShort(s.saldo)}`
            : s.saldo < 0
            ? `Sócio deve ${formatBRLShort(Math.abs(s.saldo))}`
            : "Quitado",
        ]),
      },
      {
        titulo: "Movimentos",
        columns: [
          { label: "Sócio", width: "1.1fr" },
          { label: "Tipo", width: "1.2fr" },
          { label: "Valor", width: "0.9fr", mono: true },
          { label: "Data", width: "0.8fr", mono: true },
          { label: "Obra", width: "1fr" },
        ],
        rows: movimentosSocios.map((m) => [
          m.socio,
          tipoSocioConfig[m.tipo].label,
          formatBRLShort(m.valor),
          m.data,
          m.obra || "—",
        ]),
      },
    ];
  } else if (tipo === "documentos") {
    titulo = "Relatório — Documentos da Empresa";
    kpis = [
      { label: "Documentos anexados", value: `${documentos.length}` },
      { label: "Vencidos", value: `${documentosVencidos}`, accent: documentosVencidos > 0 ? "#B23A2E" : "#22252A" },
      { label: "Vencendo em 30 dias", value: `${documentosVencendo}`, accent: documentosVencendo > 0 ? "#B4590C" : "#22252A" },
    ];
    tabelas = [
      {
        titulo: "Documentos",
        columns: [
          { label: "Categoria", width: "1fr" },
          { label: "Nome", width: "1.3fr" },
          { label: "Número", width: "1fr" },
          { label: "Validade", width: "0.8fr", mono: true },
          { label: "Status", width: "0.8fr" },
        ],
        rows: documentos.map((d) => [
          d.categoria,
          d.nome,
          d.numero || "—",
          d.validade || "—",
          statusDocumentoConfig[statusDocumentoDisplay(d)].label,
        ]),
      },
    ];
    if (essenciaisPendentes.length > 0) {
      kpis.push({ label: "Pendentes", value: essenciaisPendentes.join(", "), accent: "#B4590C" });
    }
  } else if (tipo === "fornecedores") {
    titulo = "Relatório — Contratos de Fornecedores";
    kpis = [
      { label: "Total contratado", value: formatBRL(totalContratadoFornecedores) },
      { label: "Vencendo em 30 dias", value: `${contratosFornecedoresVencendo}`, accent: contratosFornecedoresVencendo > 0 ? "#B4590C" : "#22252A" },
      { label: "Vencidos", value: `${contratosFornecedoresVencidos}`, accent: contratosFornecedoresVencidos > 0 ? "#B23A2E" : "#22252A" },
      { label: "Ativos", value: `${contratosFornecedoresAtivos}`, accent: "#4F7A5B" },
    ];
    tabelas = [
      {
        titulo: "Contratos de fornecedores",
        columns: [
          { label: "Fornecedor", width: "1.3fr" },
          { label: "Tipo", width: "1fr" },
          { label: "Obra", width: "1fr" },
          { label: "Valor", width: "0.9fr", mono: true },
          { label: "Término", width: "0.9fr", mono: true },
          { label: "Status", width: "0.8fr" },
        ],
        rows: contratosFornecedores.map((c) => [
          c.fornecedor,
          c.tipo,
          c.obra,
          formatBRLShort(c.valor),
          c.dataTermino || "—",
          statusConfig[statusContratoFornecedorDisplay(c)].label,
        ]),
      },
    ];
  } else if (tipo === "servicos") {
    titulo = "Relatório — Contratos de Prestação de Serviços";
    kpis = [
      { label: "Total contratado", value: formatBRL(totalContratadoServicos) },
      { label: "Vencendo em 30 dias", value: `${contratosServicosVencendo}`, accent: contratosServicosVencendo > 0 ? "#B4590C" : "#22252A" },
      { label: "Vencidos", value: `${contratosServicosVencidos}`, accent: contratosServicosVencidos > 0 ? "#B23A2E" : "#22252A" },
      { label: "Ativos", value: `${contratosServicosAtivos}`, accent: "#4F7A5B" },
    ];
    tabelas = [
      {
        titulo: "Contratos de prestação de serviços",
        columns: [
          { label: "Prestador", width: "1.4fr" },
          { label: "Obra", width: "1fr" },
          { label: "Valor", width: "0.9fr", mono: true },
          { label: "Término", width: "0.9fr", mono: true },
          { label: "Status", width: "0.8fr" },
        ],
        rows: contratosServicos.map((c) => [
          c.fornecedor,
          c.obra,
          formatBRLShort(c.valor),
          c.dataTermino || "—",
          statusConfig[statusContratoFornecedorDisplay(c)].label,
        ]),
      },
    ];
  } else if (tipo === "fluxocaixa") {
    titulo = "Relatório — Fluxo de Caixa";
    kpis = [
      { label: "Saldo em caixa (6 meses)", value: formatBRL(saldoCaixa), accent: saldoCaixa >= 0 ? "#4F7A5B" : "#B23A2E" },
      { label: "Total de entradas", value: formatBRL(totalEntradasFluxo), accent: "#4F7A5B" },
      { label: "Total de saídas", value: formatBRL(totalSaidasFluxo), accent: "#B23A2E" },
    ];
    let acumuladoRelatorio = 0;
    tabelas = [
      {
        titulo: "Fluxo de caixa mensal",
        columns: [
          { label: "Mês", width: "0.8fr" },
          { label: "Entradas", width: "1fr", mono: true },
          { label: "Saídas", width: "1fr", mono: true },
          { label: "Saldo do mês", width: "1fr", mono: true },
          { label: "Saldo acumulado", width: "1fr", mono: true },
        ],
        rows: fluxoCaixa.map((f) => {
          const saldoMes = f.entradas - f.saidas;
          acumuladoRelatorio += saldoMes;
          return [f.mes, formatBRL(f.entradas), formatBRL(f.saidas), formatBRL(saldoMes), formatBRL(acumuladoRelatorio)];
        }),
      },
    ];
  }

  return (
    <div className="rounded-md p-6 sm:p-8" style={{ background: "#FFFFFF", border: "1px solid #DCD7C9" }}>
      <div className="flex items-center justify-end gap-2 mb-4 no-print">
        <button
          onClick={() => window.print()}
          className="text-xs font-semibold px-3 py-1.5 rounded-sm"
          style={{
            fontFamily: "'Oswald', sans-serif",
            letterSpacing: "0.03em",
            color: "#F5F3EC",
            background: "#E1590C",
          }}
        >
          🖨 IMPRIMIR / SALVAR PDF
        </button>
        <button
          onClick={onFechar}
          className="text-xs font-semibold px-3 py-1.5 rounded-sm"
          style={{
            fontFamily: "'Oswald', sans-serif",
            letterSpacing: "0.03em",
            color: "#22252A",
            background: "#E4E0D6",
          }}
        >
          ← VOLTAR AO PAINEL
        </button>
      </div>

      <div className="mb-6">
        <p
          className="text-sm font-semibold"
          style={{ color: "#22252A", fontFamily: "'Oswald', sans-serif" }}
        >
          J &amp; G Incorporadora Ltda
        </p>
        <p className="text-xs mb-3" style={{ color: "#6B6F76" }}>CNPJ 21.203.244/0001-41</p>
        <h1
          className="text-xl font-semibold"
          style={{ color: "#22252A", fontFamily: "'Oswald', sans-serif" }}
        >
          {tipo === "custos" ? `Relatório de Custos — ${obraCustoSelecionada}` : titulo}
        </h1>
        <p className="text-xs mt-1" style={{ color: "#8A8D93" }}>Gerado em {dataGeracao}</p>
      </div>

      {tipo === "custos" ? (
        <>
          <div className="flex flex-wrap gap-3 mb-6">
            <div className="flex-1 min-w-[150px] rounded-md p-4 border" style={{ background: "#F5F3EC", borderColor: "#DCD7C9" }}>
              <div className="text-[11px] uppercase tracking-[0.14em] font-semibold mb-2" style={{ color: "#6B6F76", fontFamily: "'Oswald', sans-serif" }}>
                Total orçado
              </div>
              <div className="text-xl font-semibold" style={{ color: "#22252A", fontFamily: "'IBM Plex Mono', monospace" }}>
                {formatBRL(totalGeralObraCusto.orcado)}
              </div>
            </div>
            <div className="flex-1 min-w-[150px] rounded-md p-4 border" style={{ background: "#F5F3EC", borderColor: "#DCD7C9" }}>
              <div className="text-[11px] uppercase tracking-[0.14em] font-semibold mb-2" style={{ color: "#6B6F76", fontFamily: "'Oswald', sans-serif" }}>
                Total gasto real
              </div>
              <div className="text-xl font-semibold" style={{ color: "#3D6E8C", fontFamily: "'IBM Plex Mono', monospace" }}>
                {formatBRL(totalGeralObraCusto.gasto)}
              </div>
            </div>
            <div className="flex-1 min-w-[150px] rounded-md p-4 border" style={{ background: "#F5F3EC", borderColor: "#DCD7C9" }}>
              <div className="text-[11px] uppercase tracking-[0.14em] font-semibold mb-2" style={{ color: "#6B6F76", fontFamily: "'Oswald', sans-serif" }}>
                Saldo do orçamento
              </div>
              <div
                className="text-xl font-semibold"
                style={{ color: totalGeralObraCusto.saldo >= 0 ? "#4F7A5B" : "#B23A2E", fontFamily: "'IBM Plex Mono', monospace" }}
              >
                {formatBRL(totalGeralObraCusto.saldo)}
              </div>
            </div>
            <div className="flex-1 min-w-[150px] rounded-md p-4 border" style={{ background: "#F5F3EC", borderColor: "#DCD7C9" }}>
              <div className="text-[11px] uppercase tracking-[0.14em] font-semibold mb-2" style={{ color: "#6B6F76", fontFamily: "'Oswald', sans-serif" }}>
                % Executado
              </div>
              <div className="text-xl font-semibold" style={{ color: "#22252A", fontFamily: "'IBM Plex Mono', monospace" }}>
                {totalGeralObraCusto.pct !== null ? `${Math.round(totalGeralObraCusto.pct * 100)}%` : "—"}
              </div>
            </div>
          </div>

          {itensObraCustoAtual.length === 0 ? (
            <div className="text-sm py-6 text-center" style={{ color: "#8A8D93" }}>
              Nenhum item de orçamento cadastrado para esta obra ainda.
            </div>
          ) : (
            <>
              <div className="mb-6">
                <h3
                  className="text-sm uppercase tracking-[0.1em] font-semibold mb-2"
                  style={{ color: "#22252A", fontFamily: "'Oswald', sans-serif" }}
                >
                  Resumo por etapa
                </h3>
                <div className="hidden sm:grid grid-cols-[1.8fr_1fr_1fr_1fr_0.8fr] gap-2 px-3 pb-1 text-[10px] uppercase tracking-wide font-semibold" style={{ color: "#8A8D93" }}>
                  <span>Etapa</span>
                  <span>Orçado</span>
                  <span>Gasto real</span>
                  <span>Saldo</span>
                  <span>% Exec.</span>
                </div>
                <div className="space-y-1">
                  {ETAPAS_CUSTO.map(({ etapa }) => {
                    const resumo = resumoCustoItens(itensObraCustoAtual.filter((it) => it.etapa === etapa));
                    return (
                      <div
                        key={etapa}
                        className="grid grid-cols-2 sm:grid-cols-[1.8fr_1fr_1fr_1fr_0.8fr] gap-2 items-center rounded-sm px-3 py-1.5 text-sm"
                        style={{ border: "1px solid #E4E0D6" }}
                      >
                        <span style={{ color: "#22252A" }}>{etapa}</span>
                        <span style={{ color: "#22252A", fontFamily: "'IBM Plex Mono', monospace" }}>{formatBRL(resumo.orcado)}</span>
                        <span style={{ color: "#22252A", fontFamily: "'IBM Plex Mono', monospace" }}>{formatBRL(resumo.gasto)}</span>
                        <span style={{ color: "#22252A", fontFamily: "'IBM Plex Mono', monospace" }}>{formatBRL(resumo.saldo)}</span>
                        <span className="font-semibold" style={{ color: resumo.pct === null ? "#8A8D93" : resumo.pct > 1 ? "#B23A2E" : "#4F7A5B" }}>
                          {resumo.pct !== null ? `${Math.round(resumo.pct * 100)}%` : "—"}
                        </span>
                      </div>
                    );
                  })}
                  <div
                    className="grid grid-cols-2 sm:grid-cols-[1.8fr_1fr_1fr_1fr_0.8fr] gap-2 items-center rounded-sm px-3 py-2 text-sm font-semibold"
                    style={{ background: "#EFE9DA", border: "1px solid #C7BFA8" }}
                  >
                    <span style={{ color: "#22252A" }}>TOTAL GERAL DA OBRA</span>
                    <span style={{ color: "#22252A", fontFamily: "'IBM Plex Mono', monospace" }}>{formatBRL(totalGeralObraCusto.orcado)}</span>
                    <span style={{ color: "#22252A", fontFamily: "'IBM Plex Mono', monospace" }}>{formatBRL(totalGeralObraCusto.gasto)}</span>
                    <span style={{ color: "#22252A", fontFamily: "'IBM Plex Mono', monospace" }}>{formatBRL(totalGeralObraCusto.saldo)}</span>
                    <span style={{ color: "#22252A" }}>
                      {totalGeralObraCusto.pct !== null ? `${Math.round(totalGeralObraCusto.pct * 100)}%` : "—"}
                    </span>
                  </div>
                </div>
              </div>

              <div>
                <h3
                  className="text-sm uppercase tracking-[0.1em] font-semibold mb-3"
                  style={{ color: "#22252A", fontFamily: "'Oswald', sans-serif" }}
                >
                  Itens do orçamento
                </h3>
                {ETAPAS_CUSTO.map(({ etapa }) => {
                  const itensEtapa = itensObraCustoAtual.filter((it) => it.etapa === etapa);
                  if (itensEtapa.length === 0) return null;
                  const resumo = resumoCustoItens(itensEtapa);
                  return (
                    <div key={etapa} className="mb-4" style={{ breakInside: "avoid" }}>
                      <div
                        className="text-sm font-semibold px-3 py-1.5 rounded-sm mb-1"
                        style={{ color: "#22252A", background: "#EFE9DA" }}
                      >
                        {etapa}
                      </div>
                      <div className="hidden sm:grid grid-cols-[1.7fr_0.4fr_0.6fr_0.8fr_0.8fr_0.8fr_0.8fr_0.5fr] gap-2 px-2 pb-1 text-[10px] uppercase tracking-wide font-semibold" style={{ color: "#8A8D93" }}>
                        <span>Item</span>
                        <span>Un.</span>
                        <span>Qtd</span>
                        <span>Vl. Unit.</span>
                        <span>Orçado</span>
                        <span>Gasto real</span>
                        <span>Saldo</span>
                        <span>% exec.</span>
                      </div>
                      <div className="space-y-1">
                        {itensEtapa.map((it) => {
                          const orcadoItem = custoOrcadoItem(it);
                          const saldoItem = custoSaldoItem(it);
                          const pctItem = custoPctItem(it);
                          return (
                            <div
                              key={it.id}
                              className="grid grid-cols-2 sm:grid-cols-[1.7fr_0.4fr_0.6fr_0.8fr_0.8fr_0.8fr_0.8fr_0.5fr] gap-1.5 sm:gap-2 items-center rounded-sm px-2 py-1 text-xs"
                              style={{ borderBottom: "1px solid #F0EEE6" }}
                            >
                              <span style={{ color: "#22252A" }}>
                                {it.item}
                                {it.observacoes ? ` — ${it.observacoes}` : ""}
                              </span>
                              <span style={{ color: "#6B6F76" }}>{it.unidade}</span>
                              <span style={{ color: "#6B6F76", fontFamily: "'IBM Plex Mono', monospace" }}>{it.quantidade || "—"}</span>
                              <span style={{ color: "#6B6F76", fontFamily: "'IBM Plex Mono', monospace" }}>
                                {it.valorUnitario ? formatBRLShort(Number(it.valorUnitario)) : "—"}
                              </span>
                              <span style={{ color: "#22252A", fontFamily: "'IBM Plex Mono', monospace" }}>
                                {orcadoItem !== null ? formatBRLShort(orcadoItem) : "—"}
                              </span>
                              <span style={{ color: "#22252A", fontFamily: "'IBM Plex Mono', monospace" }}>
                                {it.gastoReal ? formatBRLShort(Number(it.gastoReal)) : "—"}
                              </span>
                              <span
                                style={{
                                  color: saldoItem !== null && saldoItem < 0 ? "#B23A2E" : "#22252A",
                                  fontFamily: "'IBM Plex Mono', monospace",
                                }}
                              >
                                {saldoItem !== null ? formatBRLShort(saldoItem) : "—"}
                              </span>
                              <span
                                className="font-semibold"
                                style={{ color: pctItem === null ? "#8A8D93" : pctItem > 1 ? "#B23A2E" : "#4F7A5B" }}
                              >
                                {pctItem !== null ? `${Math.round(pctItem * 100)}%` : "—"}
                              </span>
                            </div>
                          );
                        })}
                        <div
                          className="grid grid-cols-2 sm:grid-cols-[1.7fr_0.4fr_0.6fr_0.8fr_0.8fr_0.8fr_0.8fr_0.5fr] gap-1.5 sm:gap-2 items-center rounded-sm px-2 py-1.5 text-xs font-semibold"
                          style={{ background: "#F5F3EC" }}
                        >
                          <span className="sm:col-span-4" style={{ color: "#22252A" }}>Subtotal — {etapa}</span>
                          <span className="hidden sm:block" style={{ color: "#22252A", fontFamily: "'IBM Plex Mono', monospace" }}>
                            {formatBRLShort(resumo.orcado)}
                          </span>
                          <span style={{ color: "#22252A", fontFamily: "'IBM Plex Mono', monospace" }}>{formatBRLShort(resumo.gasto)}</span>
                          <span style={{ color: "#22252A", fontFamily: "'IBM Plex Mono', monospace" }}>{formatBRLShort(resumo.saldo)}</span>
                          <span style={{ color: "#22252A" }}>
                            {resumo.pct !== null ? `${Math.round(resumo.pct * 100)}%` : "—"}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </>
      ) : (
        <>
          <ReportKpis items={kpis} />
          {tabelas.map((t) => (
            <ReportTable key={t.titulo} titulo={t.titulo} columns={t.columns} rows={t.rows} />
          ))}
          {saldosConsolidados.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {saldosConsolidados.map(({ titulo: tituloSecao, linhas }) => (
                <div key={tituloSecao}>
                  <h3
                    className="text-sm uppercase tracking-[0.1em] font-semibold mb-2"
                    style={{ color: "#22252A", fontFamily: "'Oswald', sans-serif" }}
                  >
                    {tituloSecao}
                  </h3>
                  <div className="space-y-1">
                    {linhas.map(([label, valor]) => (
                      <div
                        key={label}
                        className="flex items-baseline justify-between gap-3 text-sm rounded-sm px-3 py-1.5"
                        style={{ border: "1px solid #E4E0D6" }}
                      >
                        <span style={{ color: "#6B6F76" }}>{label}</span>
                        <span
                          className="font-semibold text-right"
                          style={{ color: "#22252A", fontFamily: "'IBM Plex Mono', monospace" }}
                        >
                          {valor}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <div className="mt-10 pt-6" style={{ borderTop: "1px solid #E4E0D6" }}>
        <p className="text-sm mb-12" style={{ color: "#22252A" }}>
          Balneário Camboriú/SC, {dataExtenso}.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-10">
          <div className="text-center">
            <div style={{ borderTop: "1px solid #22252A" }} className="pt-2">
              <span className="text-sm font-semibold" style={{ color: "#22252A" }}>
                Gabriel Oltramari Neto
              </span>
            </div>
          </div>
          <div className="text-center">
            <div style={{ borderTop: "1px solid #22252A" }} className="pt-2">
              <span className="text-sm font-semibold" style={{ color: "#22252A" }}>
                João Gabriel Herdt
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DashboardConstrutora() {
  const [selectedObra, setSelectedObra] = useState(null);
  const [activeTab, setActiveTab] = useState("geral");
  const [modoRelatorio, setModoRelatorio] = useState(false);
  const [tipoRelatorio, setTipoRelatorio] = useState(null);

  const [obrasState, setObrasState] = useState(obrasIniciais);
  const [loadingObras, setLoadingObras] = useState(true);

  const [custosItens, setCustosItens] = useState([]);
  const [loadingCustos, setLoadingCustos] = useState(true);
  const [saveErrorCustos, setSaveErrorCustos] = useState(null);
  const [etapasCustoColapsadas, setEtapasCustoColapsadas] = useState({});
  const [obraCustoSelecionada, setObraCustoSelecionada] = useState(NOMES_OBRAS[0]);

  function toggleEtapaCustoColapsada(etapa) {
    setEtapasCustoColapsadas((prev) => ({ ...prev, [etapa]: !prev[etapa] }));
  }

  const [mesesFluxoExpandidos, setMesesFluxoExpandidos] = useState({});

  function toggleMesFluxoExpandido(chave) {
    setMesesFluxoExpandidos((prev) => ({ ...prev, [chave]: !prev[chave] }));
  }

  const [contratosFornecedores, setContratosFornecedores] = useState([]);
  const [loadingFornecedores, setLoadingFornecedores] = useState(true);
  const [saveErrorFornecedores, setSaveErrorFornecedores] = useState(null);
  const [showFormFornecedor, setShowFormFornecedor] = useState(false);
  const [pdfImportingFornecedor, setPdfImportingFornecedor] = useState(false);
  const [pdfImportErrorFornecedor, setPdfImportErrorFornecedor] = useState(null);
  const [pdfImportedFieldsFornecedor, setPdfImportedFieldsFornecedor] = useState([]);
  const [filtroObraFornecedores, setFiltroObraFornecedores] = useState("");
  const [formFornecedor, setFormFornecedor] = useState({
    fornecedor: "",
    cnpj: "",
    obra: NOMES_OBRAS[0],
    tipo: TIPOS_FORNECEDOR[0],
    objeto: "",
    valor: "",
    numeroParcelas: "1",
    dataInicio: "",
    dataTermino: "",
    observacoes: "",
    arquivo: null,
  });

  const [contratosServicos, setContratosServicos] = useState([]);
  const [loadingServicos, setLoadingServicos] = useState(true);
  const [saveErrorServicos, setSaveErrorServicos] = useState(null);
  const [showFormServico, setShowFormServico] = useState(false);
  const [pdfImportingServico, setPdfImportingServico] = useState(false);
  const [pdfImportErrorServico, setPdfImportErrorServico] = useState(null);
  const [pdfImportedFieldsServico, setPdfImportedFieldsServico] = useState([]);
  const [filtroObraServicos, setFiltroObraServicos] = useState("");
  const [formServico, setFormServico] = useState({
    fornecedor: "",
    cnpj: "",
    obra: NOMES_OBRAS[0],
    objeto: "",
    valor: "",
    numeroParcelas: "1",
    dataInicio: "",
    dataTermino: "",
    observacoes: "",
    arquivo: null,
  });

  const [contratosCV, setContratosCV] = useState([]);
  const [valoresReceber, setValoresReceber] = useState([]);
  const [loadingCV, setLoadingCV] = useState(true);
  const [saveError, setSaveError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [pdfImporting, setPdfImporting] = useState(false);
  const [pdfImportError, setPdfImportError] = useState(null);
  const [pdfImportedFields, setPdfImportedFields] = useState([]);
  const [form, setForm] = useState({
    unidade: "",
    comprador: "",
    valor: "",
    percentualPago: "",
    dataAssinatura: "",
    statusPagamento: "em_dia",
    numeroParcelas: "1",
  });
  const [personalizarParcelasCV, setPersonalizarParcelasCV] = useState(false);
  const [valoresParcelasCV, setValoresParcelasCV] = useState([]);
  const [datasParcelasCV, setDatasParcelasCV] = useState([]);

  const [unidadesObra, setUnidadesObra] = useState([]);
  const [loadingUnidades, setLoadingUnidades] = useState(true);
  const [saveErrorUnidades, setSaveErrorUnidades] = useState(null);
  const [showFormUnidade, setShowFormUnidade] = useState(false);
  const [filtroObraUnidades, setFiltroObraUnidades] = useState("");
  const [filtroStatusUnidades, setFiltroStatusUnidades] = useState("");
  const [editandoUnidadeId, setEditandoUnidadeId] = useState(null);
  const [formUnidade, setFormUnidade] = useState({
    obra: NOMES_OBRAS[0],
    unidade: "",
    andar: "",
    tipo: "",
    metragem: "",
    valorVenda: "",
    observacoes: "",
  });

  const [notasCompra, setNotasCompra] = useState([]);
  const [contasPagar, setContasPagar] = useState([]);
  const [loadingNotas, setLoadingNotas] = useState(true);
  const [saveErrorNotas, setSaveErrorNotas] = useState(null);
  const [showFormNota, setShowFormNota] = useState(false);
  const [pdfImportingNota, setPdfImportingNota] = useState(false);
  const [emprestimosBancarios, setEmprestimosBancarios] = useState([]);
  const [loadingEmprestimosBancarios, setLoadingEmprestimosBancarios] = useState(true);
  const [saveErrorEmprestimosBancarios, setSaveErrorEmprestimosBancarios] = useState(null);
  const [showFormEmprestimoBancario, setShowFormEmprestimoBancario] = useState(false);
  const [filtroObraEmprestimosBancarios, setFiltroObraEmprestimosBancarios] = useState("");
  const [formEmprestimoBancario, setFormEmprestimoBancario] = useState({
    banco: "",
    obra: NOMES_OBRAS[0],
    valorContratado: "",
    valorAPagar: "",
    numeroParcelas: "1",
    dataContratacao: "",
    observacoes: "",
  });
  const [pdfImportErrorNota, setPdfImportErrorNota] = useState(null);
  const [pdfImportedFieldsNota, setPdfImportedFieldsNota] = useState([]);
  const [duplicataNota, setDuplicataNota] = useState(null);
  const [formNota, setFormNota] = useState({
    fornecedor: "",
    obra: NOMES_OBRAS[0],
    valorTotal: "",
    dataEmissao: "",
    numeroParcelas: "1",
  });

  const [extrato, setExtrato] = useState([]);
  const [loadingExtrato, setLoadingExtrato] = useState(true);
  const [saveErrorExtrato, setSaveErrorExtrato] = useState(null);
  const [showFormExtrato, setShowFormExtrato] = useState(false);
  const [extratoPreview, setExtratoPreview] = useState([]);
  // Seleção (checkbox) e "desbloqueio" de lançamentos já salvos — igual ao
  // padrão da Nibo: um lançamento "Lançado" (Débito e Crédito preenchidos)
  // trava os campos de classificação para evitar alteração acidental; para
  // mudar, a pessoa marca o(s) lançamento(s) e usa "Editar" ou "Desfazer" na
  // barra de seleção. Nada disso é salvo — reseta ao recarregar a página.
  const [selecionadosLancamentos, setSelecionadosLancamentos] = useState(() => new Set());
  const [lancamentosDesbloqueados, setLancamentosDesbloqueados] = useState(() => new Set());

  // Aviso sobre lançamentos que ficaram de fora da exportação para a Domínio
  // por falta de "Código Domínio" em alguma das contas — não é salvo. Período
  // usado só nessa exportação (separado do filtro da tabela, para não se
  // misturar com Busca/Valor/Tipo/Status) — deixe vazio para exportar tudo.
  const [avisoExportDominio, setAvisoExportDominio] = useState(null);
  const [exportDominioDataDe, setExportDominioDataDe] = useState("");
  const [exportDominioDataAte, setExportDominioDataAte] = useState("");

  // Filtros da aba Lançamentos, no mesmo estilo da Nibo (Buscar por, Data,
  // Valor, Tipo, Status) — só filtram a visualização, nada é salvo.
  const [filtroLancBusca, setFiltroLancBusca] = useState("");
  const [filtroLancDataDe, setFiltroLancDataDe] = useState("");
  const [filtroLancDataAte, setFiltroLancDataAte] = useState("");
  const [filtroLancValorMin, setFiltroLancValorMin] = useState("");
  const [filtroLancValorMax, setFiltroLancValorMax] = useState("");
  const [filtroLancTipo, setFiltroLancTipo] = useState("");
  const [filtroLancStatus, setFiltroLancStatus] = useState("");

  // Plano de contas (contabilidade) — editável pelo usuário na aba própria;
  // começa com o plano de contas padrão só na primeira vez (nada salvo ainda).
  const [planoContas, setPlanoContas] = useState([]);
  const [loadingPlanoContas, setLoadingPlanoContas] = useState(true);
  const [saveErrorPlanoContas, setSaveErrorPlanoContas] = useState(null);
  const [showFormPlanoContas, setShowFormPlanoContas] = useState(false);
  const [formPlanoContas, setFormPlanoContas] = useState({ codigo: "", nome: "", tipo: "despesa" });
  const [buscaPlanoContas, setBuscaPlanoContas] = useState("");
  // Conta bancária (do plano de contas) usada como padrão para classificar o
  // lado "Banco" de cada lançamento do extrato — útil quando a empresa tem
  // mais de uma conta bancária no plano de contas.
  const [contaBancoPadraoId, setContaBancoPadraoId] = useState("");
  const [loadingContaBancoPadrao, setLoadingContaBancoPadrao] = useState(true);
  // Saldo inicial do extrato bancário — informado manualmente pelo usuário
  // (o extrato do banco normalmente mostra esse valor no topo, antes do
  // primeiro lançamento do período); usado para calcular o saldo final
  // (saldo inicial + créditos - débitos).
  const [saldoInicialExtrato, setSaldoInicialExtrato] = useState(0);
  const [loadingSaldoInicialExtrato, setLoadingSaldoInicialExtrato] = useState(true);
  // Saldo inicial da(s) conta(s) de aplicações financeiras (informado
  // manualmente, mesmo esquema do saldo inicial do extrato); o saldo atual
  // é recalculado sozinho somando aplicações e subtraindo resgates
  // identificados nos lançamentos já classificados do extrato (quando a
  // contrapartida do Débito/Crédito é uma conta cujo nome contém "aplic").
  const [saldoInicialAplicacoes, setSaldoInicialAplicacoes] = useState(0);
  const [loadingSaldoInicialAplicacoes, setLoadingSaldoInicialAplicacoes] = useState(true);
  // Sub-visualização "Extrato em PDF" dentro da própria aba Extrato
  // bancário — visualização somente leitura de cada PDF importado,
  // mantendo a divisão por dia e os saldos reais impressos no próprio
  // extrato (Saldo Anterior, Saldo do dia); não interfere nos lançamentos
  // contábeis (Débito/Crédito) da mesma aba.
  const [subAbaExtrato, setSubAbaExtrato] = useState("lancamentos");
  const [extratosPdf, setExtratosPdf] = useState([]);
  const [loadingExtratosPdf, setLoadingExtratosPdf] = useState(true);
  const [importingExtratoPdfView, setImportingExtratoPdfView] = useState(false);
  const [errorExtratoPdfView, setErrorExtratoPdfView] = useState(null);
  const [saveErrorExtratosPdf, setSaveErrorExtratosPdf] = useState(null);
  const [formExtrato, setFormExtrato] = useState({
    data: "",
    descricao: "",
    valor: "",
    tipo: "credito",
    socio: "",
  });

  const [emprestimosSocios, setEmprestimosSocios] = useState([]);
  const [loadingSocios, setLoadingSocios] = useState(true);
  const [saveErrorSocios, setSaveErrorSocios] = useState(null);
  const [showFormSocio, setShowFormSocio] = useState(false);
  const [formSocio, setFormSocio] = useState({
    socio: "",
    tipo: "aporte",
    valor: "",
    data: "",
    obra: NOMES_OBRAS[0],
    observacao: "",
  });

  const [documentos, setDocumentos] = useState([]);
  const [loadingDocumentos, setLoadingDocumentos] = useState(true);
  const [saveErrorDocumentos, setSaveErrorDocumentos] = useState(null);
  const [showFormDocumento, setShowFormDocumento] = useState(false);
  const [uploadingDocumento, setUploadingDocumento] = useState(false);
  const [uploadErrorDocumento, setUploadErrorDocumento] = useState(null);
  const [abrindoDocumentoId, setAbrindoDocumentoId] = useState(null);
  const [enviandoWhatsappId, setEnviandoWhatsappId] = useState(null);
  const [pdfReadingDocumento, setPdfReadingDocumento] = useState(false);
  const [pdfImportedFieldsDocumento, setPdfImportedFieldsDocumento] = useState([]);
  const [uploadingCategoria, setUploadingCategoria] = useState(null);
  const [formDocumento, setFormDocumento] = useState({
    categoria: "Outro",
    nome: "",
    numero: "",
    dataEmissao: "",
    validade: "",
    observacao: "",
    arquivo: null,
  });

  const [filtroObraNotas, setFiltroObraNotas] = useState("");
  const [filtroObraPagar, setFiltroObraPagar] = useState("");
  const [filtroObraSocios, setFiltroObraSocios] = useState("");
  const [showFormDespesa, setShowFormDespesa] = useState(false);
  const [formDespesa, setFormDespesa] = useState({
    fornecedor: "",
    obra: NOMES_OBRAS[0],
    valor: "",
    dataVencimento: "",
    numeroParcelas: "1",
  });

  const STORAGE_KEY = "contratos-cv";
  const STORAGE_KEY_RECEBER = "valores-receber";
  const STORAGE_KEY_NOTAS = "notas-compra";
  const STORAGE_KEY_PAGAR = "contas-pagar";
  const STORAGE_KEY_EXTRATO = "extrato-bancario";
  const STORAGE_KEY_SOCIOS = "emprestimos-socios";
  const STORAGE_KEY_DOCUMENTOS = "documentos-empresa-index";
  const STORAGE_KEY_OBRAS = "obras-orcamento";
  const STORAGE_KEY_CUSTOS = "custos-obra-itens";
  const STORAGE_KEY_FORNECEDORES = "contratos-fornecedores";
  const STORAGE_KEY_SERVICOS = "contratos-servicos";
  const STORAGE_KEY_UNIDADES = "unidades-obra";
  const STORAGE_KEY_EMPRESTIMOS_BANCARIOS = "emprestimos-bancarios";
  const STORAGE_KEY_PLANO_CONTAS = "plano-contas";
  const STORAGE_KEY_CONTA_BANCO_PADRAO = "extrato-conta-banco-padrao";
  const STORAGE_KEY_SALDO_INICIAL_EXTRATO = "extrato-saldo-inicial";
  const STORAGE_KEY_SALDO_INICIAL_APLICACOES = "extrato-saldo-inicial-aplicacoes";
  const STORAGE_KEY_EXTRATOS_PDF = "extratos-pdf-visualizacao";
  const chaveArquivoDocumento = (id) => `documento-arquivo-${id}`;
  const chaveArquivoContratoFornecedor = (id) => `contrato-fornecedor-arquivo-${id}`;
  const chaveArquivoContratoServico = (id) => `contrato-servico-arquivo-${id}`;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const result = await window.storage.get(STORAGE_KEY_UNIDADES, false);
        if (!cancelled) {
          setUnidadesObra(result ? JSON.parse(result.value) : defaultUnidadesObra);
        }
      } catch (err) {
        if (!cancelled) setUnidadesObra(defaultUnidadesObra);
      } finally {
        if (!cancelled) setLoadingUnidades(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const result = await window.storage.get(STORAGE_KEY_FORNECEDORES, false);
        if (!cancelled) {
          setContratosFornecedores(result ? JSON.parse(result.value) : defaultContratosFornecedores);
        }
      } catch (err) {
        if (!cancelled) setContratosFornecedores(defaultContratosFornecedores);
      } finally {
        if (!cancelled) setLoadingFornecedores(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const result = await window.storage.get(STORAGE_KEY_SERVICOS, false);
        if (!cancelled) {
          setContratosServicos(result ? JSON.parse(result.value) : defaultContratosServicos);
        }
      } catch (err) {
        if (!cancelled) setContratosServicos(defaultContratosServicos);
      } finally {
        if (!cancelled) setLoadingServicos(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const result = await window.storage.get(STORAGE_KEY_OBRAS, false);
        if (!cancelled) {
          setObrasState(result ? JSON.parse(result.value) : obrasIniciais);
        }
      } catch (err) {
        if (!cancelled) setObrasState(obrasIniciais);
      } finally {
        if (!cancelled) setLoadingObras(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const result = await window.storage.get(STORAGE_KEY_CUSTOS, false);
        if (!cancelled) {
          setCustosItens(result ? JSON.parse(result.value) : defaultCustosItens);
        }
      } catch (err) {
        if (!cancelled) setCustosItens(defaultCustosItens);
      } finally {
        if (!cancelled) setLoadingCustos(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [contratosResult, receberResult] = await Promise.all([
          window.storage.get(STORAGE_KEY, false),
          window.storage.get(STORAGE_KEY_RECEBER, false),
        ]);
        if (!cancelled) {
          setContratosCV(contratosResult ? JSON.parse(contratosResult.value) : defaultContratosCV);
          setValoresReceber(receberResult ? JSON.parse(receberResult.value) : defaultValoresReceber);
        }
      } catch (err) {
        if (!cancelled) {
          setContratosCV(defaultContratosCV);
          setValoresReceber(defaultValoresReceber);
        }
      } finally {
        if (!cancelled) setLoadingCV(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const result = await window.storage.get(STORAGE_KEY_EMPRESTIMOS_BANCARIOS, false);
        if (!cancelled) {
          setEmprestimosBancarios(result ? JSON.parse(result.value) : []);
        }
      } catch (err) {
        if (!cancelled) setEmprestimosBancarios([]);
      } finally {
        if (!cancelled) setLoadingEmprestimosBancarios(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [notasResult, pagarResult] = await Promise.all([
          window.storage.get(STORAGE_KEY_NOTAS, false),
          window.storage.get(STORAGE_KEY_PAGAR, false),
        ]);
        if (!cancelled) {
          setNotasCompra(notasResult ? JSON.parse(notasResult.value) : defaultNotasCompra);
          setContasPagar(pagarResult ? JSON.parse(pagarResult.value) : defaultContasPagar);
        }
      } catch (err) {
        if (!cancelled) {
          setNotasCompra(defaultNotasCompra);
          setContasPagar(defaultContasPagar);
        }
      } finally {
        if (!cancelled) setLoadingNotas(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const result = await window.storage.get(STORAGE_KEY_EXTRATO, false);
        if (!cancelled) {
          setExtrato(result ? JSON.parse(result.value) : defaultExtrato);
        }
      } catch (err) {
        if (!cancelled) setExtrato(defaultExtrato);
      } finally {
        if (!cancelled) setLoadingExtrato(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const result = await window.storage.get(STORAGE_KEY_PLANO_CONTAS, false);
        if (!cancelled) {
          setPlanoContas(result ? JSON.parse(result.value) : PLANO_CONTAS_PADRAO);
        }
      } catch (err) {
        if (!cancelled) setPlanoContas(PLANO_CONTAS_PADRAO);
      } finally {
        if (!cancelled) setLoadingPlanoContas(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const result = await window.storage.get(STORAGE_KEY_CONTA_BANCO_PADRAO, false);
        if (!cancelled) {
          setContaBancoPadraoId(result ? result.value : "");
        }
      } catch (err) {
        if (!cancelled) setContaBancoPadraoId("");
      } finally {
        if (!cancelled) setLoadingContaBancoPadrao(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const result = await window.storage.get(STORAGE_KEY_SALDO_INICIAL_EXTRATO, false);
        if (!cancelled) {
          setSaldoInicialExtrato(result ? Number(result.value) || 0 : 0);
        }
      } catch (err) {
        if (!cancelled) setSaldoInicialExtrato(0);
      } finally {
        if (!cancelled) setLoadingSaldoInicialExtrato(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const result = await window.storage.get(STORAGE_KEY_SALDO_INICIAL_APLICACOES, false);
        if (!cancelled) {
          setSaldoInicialAplicacoes(result ? Number(result.value) || 0 : 0);
        }
      } catch (err) {
        if (!cancelled) setSaldoInicialAplicacoes(0);
      } finally {
        if (!cancelled) setLoadingSaldoInicialAplicacoes(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const result = await window.storage.get(STORAGE_KEY_EXTRATOS_PDF, false);
        if (!cancelled) {
          setExtratosPdf(result ? JSON.parse(result.value) : []);
        }
      } catch (err) {
        if (!cancelled) setExtratosPdf([]);
      } finally {
        if (!cancelled) setLoadingExtratosPdf(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const result = await window.storage.get(STORAGE_KEY_SOCIOS, false);
        if (!cancelled) {
          setEmprestimosSocios(result ? JSON.parse(result.value) : defaultEmprestimosSocios);
        }
      } catch (err) {
        if (!cancelled) setEmprestimosSocios(defaultEmprestimosSocios);
      } finally {
        if (!cancelled) setLoadingSocios(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const result = await window.storage.get(STORAGE_KEY_DOCUMENTOS, false);
        if (!cancelled) {
          setDocumentos(result ? JSON.parse(result.value) : []);
        }
      } catch (err) {
        if (!cancelled) setDocumentos([]);
      } finally {
        if (!cancelled) setLoadingDocumentos(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Reavalia possível duplicidade sempre que o formulário de nota (vindo do
  // PDF ou digitado) ou a lista de notas já cadastradas mudar.
  useEffect(() => {
    if (!showFormNota) {
      setDuplicataNota(null);
      return;
    }
    setDuplicataNota(encontrarNotaDuplicada(formNota, notasCompra));
  }, [showFormNota, formNota.fornecedor, formNota.valorTotal, formNota.dataEmissao, notasCompra]);

  async function persistContratosEReceber(nextContratos, nextReceber) {
    setContratosCV(nextContratos);
    setValoresReceber(nextReceber);
    try {
      const [r1, r2] = await Promise.all([
        window.storage.set(STORAGE_KEY, JSON.stringify(nextContratos), false),
        window.storage.set(STORAGE_KEY_RECEBER, JSON.stringify(nextReceber), false),
      ]);
      if (!r1 || !r2) setSaveError("Não foi possível salvar. Tente novamente.");
      else setSaveError(null);
    } catch (err) {
      setSaveError("Não foi possível salvar. Tente novamente.");
    }
  }

  // Mesmo esquema de handleUpdateContaPagarCampo, para o lado de Valores a
  // receber.
  function handleUpdateParcelaReceberCampo(id, campo, valor) {
    setValoresReceber((prev) => prev.map((v) => (v.id === id ? { ...v, [campo]: valor } : v)));
  }

  function handlePersistValoresReceberBlur() {
    persistContratosEReceber(contratosCV, valoresReceber);
  }

  function handleUpdateCustoItemCampo(id, campo, valor) {
    setCustosItens((prev) => prev.map((it) => (it.id === id ? { ...it, [campo]: valor } : it)));
  }

  async function persistCustosItens(nextList) {
    setCustosItens(nextList);
    try {
      const result = await window.storage.set(STORAGE_KEY_CUSTOS, JSON.stringify(nextList), false);
      if (!result) setSaveErrorCustos("Não foi possível salvar. Tente novamente.");
      else setSaveErrorCustos(null);
    } catch (err) {
      setSaveErrorCustos("Não foi possível salvar. Tente novamente.");
    }
  }

  function handlePersistCustosBlur() {
    persistCustosItens(custosItens);
  }

  // Item de custo extra, adicionado livremente pelo usuário dentro de uma
  // etapa — além dos itens fixos do modelo da planilha. Fica marcado com
  // `extra: true` para que o nome e a unidade também fiquem editáveis (nos
  // itens do modelo, só Quantidade/Valor Unitário/Gasto Real/Observações são
  // editáveis) e para exibir o botão de remover.
  function handleAddCustoItemExtra(etapa) {
    const novoItem = {
      id: `custo-extra-${Date.now()}`,
      obra: obraCustoSelecionada,
      etapa,
      item: "",
      unidade: "",
      quantidade: "",
      valorUnitario: "",
      gastoReal: "",
      observacoes: "",
      extra: true,
    };
    persistCustosItens([...custosItens, novoItem]);
  }

  function handleDeleteCustoItem(id) {
    persistCustosItens(custosItens.filter((it) => it.id !== id));
  }

  function handleAddContrato(e) {
    e.preventDefault();
    if (!form.unidade || !form.comprador || !form.valor) return;
    const usarPersonalizadas =
      personalizarParcelasCV && valoresParcelasCV.length === (Number(form.numeroParcelas) || 1);
    const novo = {
      id: Date.now(),
      unidade: form.unidade,
      comprador: form.comprador,
      valor: Number(form.valor),
      percentualPago: Number(form.percentualPago) || 0,
      dataAssinatura: form.dataAssinatura || new Date().toLocaleDateString("pt-BR"),
      statusPagamento: form.statusPagamento,
      numeroParcelas: Number(form.numeroParcelas) || 1,
      ...(usarPersonalizadas ? { valoresParcelas: valoresParcelasCV.map((v) => Number(v) || 0) } : {}),
      ...(usarPersonalizadas ? { datasParcelas: datasParcelasCV } : {}),
    };
    const novasParcelas = gerarParcelasReceber(novo);
    persistContratosEReceber([...contratosCV, novo], [...valoresReceber, ...novasParcelas]);
    setForm({
      unidade: "",
      comprador: "",
      valor: "",
      percentualPago: "",
      dataAssinatura: "",
      statusPagamento: "em_dia",
      numeroParcelas: "1",
    });
    setPersonalizarParcelasCV(false);
    setValoresParcelasCV([]);
    setDatasParcelasCV([]);
    setShowForm(false);
  }

  // Gera (ou regenera) a lista de valores e datas editáveis de cada parcela
  // — divisão igual do valor do contrato e vencimentos mensais a partir da
  // assinatura como ponto de partida; o usuário pode ajustar cada um
  // individualmente antes de salvar.
  function handleAtivarPersonalizarParcelasCV() {
    const n = Math.max(1, Number(form.numeroParcelas) || 1);
    const valorTotal = Number(form.valor) || 0;
    const valorParcela = Math.round(valorTotal / n);
    const valores = Array.from({ length: n }, (_, i) =>
      i === n - 1 ? valorTotal - valorParcela * (n - 1) : valorParcela
    );
    const assinatura = parseDateBR(form.dataAssinatura) || new Date();
    const datas = Array.from({ length: n }, (_, i) => formatDateBR(addMonths(assinatura, i + 1)));
    setValoresParcelasCV(valores);
    setDatasParcelasCV(datas);
    setPersonalizarParcelasCV(true);
  }

  function handleAtualizarValorParcelaCV(indice, valor) {
    setValoresParcelasCV((prev) => prev.map((v, i) => (i === indice ? valor : v)));
  }

  function handleAtualizarDataParcelaCV(indice, data) {
    setDatasParcelasCV((prev) => prev.map((d, i) => (i === indice ? data : d)));
  }

  function handleDeleteContrato(id) {
    persistContratosEReceber(
      contratosCV.filter((c) => c.id !== id),
      valoresReceber.filter((v) => v.contratoId !== id)
    );
  }

  function handleToggleParcelaRecebida(id) {
    persistContratosEReceber(
      contratosCV,
      valoresReceber.map((v) => (v.id === id ? { ...v, status: v.status === "pago" ? "pendente" : "pago" } : v))
    );
  }

  async function persistUnidadesObra(nextList) {
    setUnidadesObra(nextList);
    try {
      const result = await window.storage.set(STORAGE_KEY_UNIDADES, JSON.stringify(nextList), false);
      if (!result) setSaveErrorUnidades("Não foi possível salvar. Tente novamente.");
      else setSaveErrorUnidades(null);
    } catch (err) {
      setSaveErrorUnidades("Não foi possível salvar. Tente novamente.");
    }
  }

  function handleAddUnidade(e) {
    e.preventDefault();
    if (!formUnidade.unidade || !formUnidade.valorVenda) return;
    const novo = {
      id: Date.now(),
      obra: formUnidade.obra || NOMES_OBRAS[0],
      unidade: formUnidade.unidade,
      andar: formUnidade.andar,
      tipo: formUnidade.tipo,
      metragem: Number(formUnidade.metragem) || 0,
      valorVenda: Number(formUnidade.valorVenda) || 0,
      statusManual: "disponivel",
      observacoes: formUnidade.observacoes,
    };
    persistUnidadesObra([...unidadesObra, novo]);
    setFormUnidade({ obra: NOMES_OBRAS[0], unidade: "", andar: "", tipo: "", metragem: "", valorVenda: "", observacoes: "" });
    setShowFormUnidade(false);
  }

  function handleDeleteUnidade(id) {
    persistUnidadesObra(unidadesObra.filter((u) => u.id !== id));
  }

  function handleUpdateUnidadeCampo(id, campo, valor) {
    setUnidadesObra((prev) => prev.map((u) => (u.id === id ? { ...u, [campo]: valor } : u)));
  }

  function handlePersistUnidadesBlur() {
    persistUnidadesObra(unidadesObra);
  }

  function handleToggleStatusManualUnidade(id) {
    persistUnidadesObra(
      unidadesObra.map((u) =>
        u.id === id ? { ...u, statusManual: u.statusManual === "reservada" ? "disponivel" : "reservada" } : u
      )
    );
  }

  async function handlePdfImport(e) {
    const file = e.target.files[0];
    e.target.value = ""; // permite selecionar o mesmo arquivo de novo depois
    if (!file) return;
    setPdfImporting(true);
    setPdfImportError(null);
    setPdfImportedFields([]);
    try {
      const text = await extractTextFromPdf(file);
      const parsed = parseContratoCV(text);
      if (Object.keys(parsed).length === 0) {
        setPdfImportError("Não consegui reconhecer os campos neste PDF. Preencha manualmente.");
      } else {
        setForm((prev) => ({ ...prev, ...parsed }));
        setPdfImportedFields(Object.keys(parsed));
      }
    } catch (err) {
      setPdfImportError("Não foi possível ler esse PDF. Preencha manualmente.");
    } finally {
      setPdfImporting(false);
    }
  }

  async function persistNotasEPagar(nextNotas, nextContas) {
    setNotasCompra(nextNotas);
    setContasPagar(nextContas);
    try {
      const [r1, r2] = await Promise.all([
        window.storage.set(STORAGE_KEY_NOTAS, JSON.stringify(nextNotas), false),
        window.storage.set(STORAGE_KEY_PAGAR, JSON.stringify(nextContas), false),
      ]);
      if (!r1 || !r2) setSaveErrorNotas("Não foi possível salvar. Tente novamente.");
      else setSaveErrorNotas(null);
    } catch (err) {
      setSaveErrorNotas("Não foi possível salvar. Tente novamente.");
    }
  }

  // Mesmo esquema de persistNotasEPagar, para os empréstimos bancários — o
  // valor a pagar é dividido em parcelas e lançado em Contas a pagar (que já
  // alimenta o Fluxo de caixa sozinho, sem precisar de nenhuma mudança lá).
  async function persistEmprestimosBancariosEPagar(nextEmprestimos, nextContas) {
    setEmprestimosBancarios(nextEmprestimos);
    setContasPagar(nextContas);
    try {
      const [r1, r2] = await Promise.all([
        window.storage.set(STORAGE_KEY_EMPRESTIMOS_BANCARIOS, JSON.stringify(nextEmprestimos), false),
        window.storage.set(STORAGE_KEY_PAGAR, JSON.stringify(nextContas), false),
      ]);
      if (!r1 || !r2) setSaveErrorEmprestimosBancarios("Não foi possível salvar. Tente novamente.");
      else setSaveErrorEmprestimosBancarios(null);
    } catch (err) {
      setSaveErrorEmprestimosBancarios("Não foi possível salvar. Tente novamente.");
    }
  }

  function handleAddEmprestimoBancario(e) {
    e.preventDefault();
    if (!formEmprestimoBancario.banco || !formEmprestimoBancario.valorAPagar) return;
    const novo = {
      id: Date.now(),
      banco: formEmprestimoBancario.banco,
      obra: formEmprestimoBancario.obra || NOMES_OBRAS[0],
      valorContratado: Number(formEmprestimoBancario.valorContratado) || 0,
      valorAPagar: Number(formEmprestimoBancario.valorAPagar) || 0,
      numeroParcelas: Number(formEmprestimoBancario.numeroParcelas) || 1,
      dataContratacao: formEmprestimoBancario.dataContratacao || new Date().toLocaleDateString("pt-BR"),
      observacoes: formEmprestimoBancario.observacoes,
    };
    // Reaproveita gerarParcelasDespesaAvulsa (mesma função usada nas despesas
    // avulsas de Contas a pagar): a data digitada é a da 1ª parcela — não
    // soma mais 1 mês por cima — e as demais seguem mensalmente a partir
    // dela.
    const novasParcelas = gerarParcelasDespesaAvulsa({
      id: novo.id,
      dataVencimento: novo.dataContratacao,
      numeroParcelas: novo.numeroParcelas,
      valorTotal: novo.valorAPagar,
      fornecedor: novo.banco,
      obra: novo.obra,
    });
    persistEmprestimosBancariosEPagar([...emprestimosBancarios, novo], [...contasPagar, ...novasParcelas]);
    setFormEmprestimoBancario({
      banco: "",
      obra: NOMES_OBRAS[0],
      valorContratado: "",
      valorAPagar: "",
      numeroParcelas: "1",
      dataContratacao: "",
      observacoes: "",
    });
    setShowFormEmprestimoBancario(false);
  }

  function handleDeleteEmprestimoBancario(id) {
    persistEmprestimosBancariosEPagar(
      emprestimosBancarios.filter((e) => e.id !== id),
      contasPagar.filter((c) => c.notaId !== id)
    );
  }

  function handleAddNota(e) {
    e.preventDefault();
    if (!formNota.fornecedor || !formNota.valorTotal) return;
    const novaNota = {
      id: Date.now(),
      fornecedor: formNota.fornecedor,
      obra: formNota.obra || NOMES_OBRAS[0],
      valorTotal: Number(formNota.valorTotal),
      dataEmissao: formNota.dataEmissao || new Date().toLocaleDateString("pt-BR"),
      numeroParcelas: Number(formNota.numeroParcelas) || 1,
    };
    const novasParcelas = gerarParcelas(novaNota);
    persistNotasEPagar([...notasCompra, novaNota], [...contasPagar, ...novasParcelas]);
    setFormNota({ fornecedor: "", obra: NOMES_OBRAS[0], valorTotal: "", dataEmissao: "", numeroParcelas: "1" });
    setShowFormNota(false);
  }

  function handleDeleteNota(id) {
    persistNotasEPagar(
      notasCompra.filter((n) => n.id !== id),
      contasPagar.filter((c) => c.notaId !== id)
    );
  }

  function handleToggleParcelaPaga(id) {
    persistNotasEPagar(
      notasCompra,
      contasPagar.map((c) => (c.id === id ? { ...c, status: c.status === "pago" ? "pendente" : "pago" } : c))
    );
  }

  // Edição de juros/multa de uma conta a pagar — atualiza local a cada
  // tecla e só grava quando o campo perde o foco, evitando salvar a cada
  // dígito digitado.
  function handleUpdateContaPagarCampo(id, campo, valor) {
    setContasPagar((prev) => prev.map((c) => (c.id === id ? { ...c, [campo]: valor } : c)));
  }

  function handlePersistContasPagarBlur() {
    persistNotasEPagar(notasCompra, contasPagar);
  }

  function handleDeleteContaPagar(id) {
    persistNotasEPagar(notasCompra, contasPagar.filter((c) => c.id !== id));
  }

  // Lança uma despesa direto em Contas a pagar, sem precisar cadastrar uma
  // nota de compra ou contrato — para gastos avulsos/imprevistos da obra.
  function handleAddDespesaAvulsa(e) {
    e.preventDefault();
    if (!formDespesa.fornecedor || !formDespesa.valor) return;
    const despesa = {
      id: Date.now(),
      fornecedor: formDespesa.fornecedor,
      obra: formDespesa.obra || NOMES_OBRAS[0],
      valorTotal: Number(formDespesa.valor) || 0,
      dataVencimento: formDespesa.dataVencimento || new Date().toLocaleDateString("pt-BR"),
      numeroParcelas: Number(formDespesa.numeroParcelas) || 1,
    };
    const novasParcelas = gerarParcelasDespesaAvulsa(despesa);
    persistNotasEPagar(notasCompra, [...contasPagar, ...novasParcelas]);
    setFormDespesa({ fornecedor: "", obra: NOMES_OBRAS[0], valor: "", dataVencimento: "", numeroParcelas: "1" });
    setShowFormDespesa(false);
  }

  // Vincula uma parcela de contas a pagar a um item do orçamento (Custos das
  // obras). Quando paga, o valor passa a compor o "Gasto real" daquele item
  // automaticamente — sem precisar digitar. Uma parcela vincula a só um
  // item; um item pode ter várias parcelas vinculadas.
  function handleVincularCustoItem(parcelaId, custoItemId) {
    persistNotasEPagar(
      notasCompra,
      contasPagar.map((c) => (c.id === parcelaId ? { ...c, custoItemId } : c))
    );
  }

  async function handlePdfImportNota(e) {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    setPdfImportingNota(true);
    setPdfImportErrorNota(null);
    setPdfImportedFieldsNota([]);
    try {
      const text = await extractTextFromPdf(file);
      const parsed = parseNotaCompra(text);
      if (Object.keys(parsed).length === 0) {
        setPdfImportErrorNota("Não consegui reconhecer os campos neste PDF. Preencha manualmente.");
      } else {
        setFormNota((prev) => ({ ...prev, ...parsed }));
        setPdfImportedFieldsNota(Object.keys(parsed));
      }
    } catch (err) {
      setPdfImportErrorNota("Não foi possível ler esse PDF. Preencha manualmente.");
    } finally {
      setPdfImportingNota(false);
    }
  }

  async function persistExtrato(nextList) {
    setExtrato(nextList);
    try {
      const result = await window.storage.set(STORAGE_KEY_EXTRATO, JSON.stringify(nextList), false);
      if (!result) setSaveErrorExtrato("Não foi possível salvar. Tente novamente.");
      else setSaveErrorExtrato(null);
    } catch (err) {
      setSaveErrorExtrato("Não foi possível salvar. Tente novamente.");
    }
  }

  function handleAddLancamento(e) {
    e.preventDefault();
    if (!formExtrato.descricao || !formExtrato.valor || !formExtrato.data) return;
    const numero = Math.abs(Number(formExtrato.valor));
    const novo = {
      id: Date.now(),
      data: formExtrato.data,
      descricao: formExtrato.descricao,
      valor: formExtrato.tipo === "debito" ? -numero : numero,
      socio: formExtrato.socio.trim(),
      parcelaReceberId: "",
    };
    persistExtrato([...extrato, novo]);
    setFormExtrato({ data: "", descricao: "", valor: "", tipo: "credito", socio: "" });
    setShowFormExtrato(false);
  }

  function handleDeleteLancamento(id) {
    persistExtrato(extrato.filter((l) => l.id !== id));
  }

  function handleUpdateExtratoSocio(id, socio) {
    setExtrato((prev) => prev.map((l) => (l.id === id ? { ...l, socio } : l)));
  }

  function handlePersistExtratoSocio() {
    persistExtrato(extrato);
  }

  // Vincula (ou desvincula) um lançamento do extrato a uma parcela de
  // valores a receber. Ao vincular, marca a parcela como recebida; ao trocar
  // ou remover o vínculo, a parcela anterior volta a pendente — a parcela
  // marcada manualmente na aba Valores a receber também usa esse mesmo
  // campo de status, então desvincular sempre reabre a parcela.
  function handleVincularParcelaReceber(lancamentoId, parcelaId) {
    const lancamentoAtual = extrato.find((l) => l.id === lancamentoId);
    const parcelaAnteriorId = lancamentoAtual ? lancamentoAtual.parcelaReceberId : "";

    const novoExtrato = extrato.map((l) =>
      l.id === lancamentoId ? { ...l, parcelaReceberId: parcelaId } : l
    );
    const novoValoresReceber = valoresReceber.map((v) => {
      if (parcelaAnteriorId && v.id === parcelaAnteriorId && v.id !== parcelaId) {
        return { ...v, status: "pendente" };
      }
      if (parcelaId && v.id === parcelaId) {
        return { ...v, status: "pago" };
      }
      return v;
    });

    persistExtrato(novoExtrato);
    persistContratosEReceber(contratosCV, novoValoresReceber);
  }

  // Mesma lógica de handleVincularParcelaReceber, para o lado de Contas a
  // pagar: vincular um lançamento de saída do extrato a uma conta a pagar
  // marca ela como paga automaticamente (e desmarca a anterior, se trocar).
  function handleVincularContaPagar(lancamentoId, contaId) {
    const lancamentoAtual = extrato.find((l) => l.id === lancamentoId);
    const contaAnteriorId = lancamentoAtual ? lancamentoAtual.contaPagarId : "";

    const novoExtrato = extrato.map((l) =>
      l.id === lancamentoId ? { ...l, contaPagarId: contaId } : l
    );
    const novasContasPagar = contasPagar.map((c) => {
      if (contaAnteriorId && c.id === contaAnteriorId && c.id !== contaId) {
        return { ...c, status: "pendente" };
      }
      if (contaId && c.id === contaId) {
        return { ...c, status: "pago" };
      }
      return c;
    });

    persistExtrato(novoExtrato);
    persistNotasEPagar(notasCompra, novasContasPagar);
  }

  // Opções de parcelas selecionáveis para vincular a um lançamento: a
  // parcela já vinculada a ele (se houver) mais as pendentes/vencidas que
  // nenhum outro lançamento já vinculou.
  function opcoesParcelaReceberPara(lancamentoId, parcelaAtualId) {
    const vinculadasPorOutros = new Set(
      extrato.filter((le) => le.id !== lancamentoId && le.parcelaReceberId).map((le) => le.parcelaReceberId)
    );
    return valoresReceber.filter(
      (v) => v.id === parcelaAtualId || (!vinculadasPorOutros.has(v.id) && v.status !== "pago")
    );
  }

  // Mesma lógica de opcoesParcelaReceberPara, para o lado de Contas a pagar.
  function opcoesContaPagarPara(lancamentoId, contaAtualId) {
    const vinculadasPorOutros = new Set(
      extrato.filter((le) => le.id !== lancamentoId && le.contaPagarId).map((le) => le.contaPagarId)
    );
    return contasPagar.filter(
      (c) => c.id === contaAtualId || (!vinculadasPorOutros.has(c.id) && c.status !== "pago")
    );
  }

  // Opções de parcelas selecionáveis para vincular a um lançamento da
  // PRÉVIA de importação: a parcela já selecionada nele (se houver) mais as
  // pendentes/vencidas que nenhum lançamento já salvo, nem outra linha desta
  // mesma prévia, já tenha selecionado.
  function opcoesParcelaReceberParaPreview(lancamentoPreviewId, parcelaAtualId) {
    const vinculadasSalvas = new Set(extrato.filter((le) => le.parcelaReceberId).map((le) => le.parcelaReceberId));
    const vinculadasNaPreviaPorOutros = new Set(
      extratoPreview
        .filter((le) => le.id !== lancamentoPreviewId && le.parcelaReceberId)
        .map((le) => le.parcelaReceberId)
    );
    return valoresReceber.filter(
      (v) =>
        v.id === parcelaAtualId ||
        (!vinculadasSalvas.has(v.id) && !vinculadasNaPreviaPorOutros.has(v.id) && v.status !== "pago")
    );
  }

  // Mesma lógica de opcoesParcelaReceberParaPreview, para o lado de Contas a
  // pagar.
  function opcoesContaPagarParaPreview(lancamentoPreviewId, contaAtualId) {
    const vinculadasSalvas = new Set(extrato.filter((le) => le.contaPagarId).map((le) => le.contaPagarId));
    const vinculadasNaPreviaPorOutros = new Set(
      extratoPreview
        .filter((le) => le.id !== lancamentoPreviewId && le.contaPagarId)
        .map((le) => le.contaPagarId)
    );
    return contasPagar.filter(
      (c) =>
        c.id === contaAtualId ||
        (!vinculadasSalvas.has(c.id) && !vinculadasNaPreviaPorOutros.has(c.id) && c.status !== "pago")
    );
  }

  async function persistExtratosPdf(nextList) {
    setExtratosPdf(nextList);
    try {
      const result = await window.storage.set(STORAGE_KEY_EXTRATOS_PDF, JSON.stringify(nextList), false);
      if (!result) setSaveErrorExtratosPdf("Não foi possível salvar. Tente novamente.");
      else setSaveErrorExtratosPdf(null);
    } catch (err) {
      setSaveErrorExtratosPdf("Não foi possível salvar. Tente novamente.");
    }
  }

  // Importação única do PDF do extrato — feita a partir da sub-visualização
  // "Extrato em PDF", mas alimenta as duas coisas de uma vez: guarda a
  // leitura fiel por dia (com os saldos reais impressos no extrato) para
  // consulta aqui, E já prepara a prévia de lançamentos contábeis (com
  // sugestão de Débito/Crédito) na aba "Lançamentos" — não precisa importar
  // duas vezes. Ao final, troca para a sub-visualização "Lançamentos" para a
  // pessoa revisar e confirmar a importação.
  async function handleImportExtratoPdfView(e) {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    setImportingExtratoPdfView(true);
    setErrorExtratoPdfView(null);
    try {
      const linhas = await extractLinesFromPdf(file);

      const { saldoAnterior, dias } = parseExtratoPdfComSaldos(linhas);
      if (dias.length === 0) {
        setErrorExtratoPdfView(
          "Não consegui reconhecer os dias/lançamentos neste PDF. O formato deste extrato pode ser diferente do esperado."
        );
      } else {
        const novoExtrato = {
          id: `extrato-pdf-${Date.now()}`,
          nomeArquivo: file.name,
          importadoEm: new Date().toISOString(),
          saldoAnterior,
          dias,
        };
        persistExtratosPdf([novoExtrato, ...extratosPdf]);
      }

      let lancamentos = parseLancamentosExtrato(linhas);
      if (lancamentos.length === 0) {
        lancamentos = parseLancamentosExtratoVertical(linhas);
      }
      if (lancamentos.length > 0) {
        const comDuplicados = marcarDuplicadosExtrato(lancamentos, extrato);
        const comParcelaReceber = sugerirParcelasReceber(comDuplicados, valoresReceber);
        const comContaPagar = sugerirContasPagar(comParcelaReceber, contasPagar);
        const comClassificacaoContabil = comContaPagar.map((l) => ({
          ...l,
          ...sugerirClassificacaoContabil(l, { planoContas, contaBancoPadraoId, contasPagar, valoresReceber }),
        }));
        setExtratoPreview(comClassificacaoContabil);
        setSubAbaExtrato("lancamentos");
      } else if (dias.length === 0) {
        // nem o dia-a-dia nem os lançamentos foram reconhecidos — o erro
        // acima já cobre esse caso, nada mais a fazer.
      }
    } catch (err) {
      setErrorExtratoPdfView("Não foi possível ler esse PDF.");
    } finally {
      setImportingExtratoPdfView(false);
    }
  }

  function handleRemoverExtratoPdfView(id) {
    persistExtratosPdf(extratosPdf.filter((x) => x.id !== id));
  }

  function handleUpdatePreviewRow(id, campo, valor) {
    setExtratoPreview((prev) => prev.map((l) => (l.id === id ? { ...l, [campo]: valor } : l)));
  }

  function handleTogglePreviewTipo(id) {
    setExtratoPreview((prev) => prev.map((l) => (l.id === id ? { ...l, valor: -l.valor } : l)));
  }

  function handleRemovePreviewRow(id) {
    setExtratoPreview((prev) => prev.filter((l) => l.id !== id));
  }

  // Alterna se um lançamento marcado como "já lançado" deve ser incluído
  // mesmo assim (caso a coincidência de data+descrição+valor seja mesmo
  // uma coincidência, e não uma duplicata de verdade).
  function handleToggleIncluirDuplicado(id) {
    setExtratoPreview((prev) =>
      prev.map((l) => (l.id === id ? { ...l, incluirMesmoAssim: !l.incluirMesmoAssim } : l))
    );
  }

  function handleConfirmImportExtrato() {
    const paraImportar = extratoPreview.filter((l) => !l.jaLancado || l.incluirMesmoAssim);
    const confirmados = paraImportar.map((l, i) => ({
      id: Date.now() + i,
      data: l.data,
      descricao: l.descricao,
      valor: Number(l.valor),
      socio: (l.socio || "").trim(),
      parcelaReceberId: l.parcelaReceberId || "",
      contaPagarId: l.contaPagarId || "",
      contaDebitoId: l.contaDebitoId || "",
      contaCreditoId: l.contaCreditoId || "",
    }));
    const idsParcelasVinculadas = new Set(confirmados.filter((c) => c.parcelaReceberId).map((c) => c.parcelaReceberId));
    const novoValoresReceber = idsParcelasVinculadas.size
      ? valoresReceber.map((v) => (idsParcelasVinculadas.has(v.id) ? { ...v, status: "pago" } : v))
      : valoresReceber;
    const idsContasVinculadas = new Set(confirmados.filter((c) => c.contaPagarId).map((c) => c.contaPagarId));
    const novasContasPagar = idsContasVinculadas.size
      ? contasPagar.map((c) => (idsContasVinculadas.has(c.id) ? { ...c, status: "pago" } : c))
      : contasPagar;
    persistExtrato([...extrato, ...confirmados]);
    persistContratosEReceber(contratosCV, novoValoresReceber);
    persistNotasEPagar(notasCompra, novasContasPagar);
    setExtratoPreview([]);
  }

  function handleDiscardPreviewExtrato() {
    setExtratoPreview([]);
  }

  // Define (ou troca) a classificação contábil de Débito/Crédito de um
  // lançamento já salvo no extrato — usado pelos dois dropdowns da tabela.
  function handleClassificarLancamento(lancamentoId, campo, valor) {
    persistExtrato(extrato.map((l) => (l.id === lancamentoId ? { ...l, [campo]: valor } : l)));
  }

  // Seleção (checkbox) dos lançamentos já salvos, e ações em lote sobre a
  // seleção — igual à barra "N item(ns) selecionado(s)" da Nibo.
  function toggleSelecaoLancamento(id) {
    setSelecionadosLancamentos((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function limparSelecaoLancamentos() {
    setSelecionadosLancamentos(new Set());
  }

  // "Editar" na barra de seleção — apenas destrava os campos de
  // classificação dos lançamentos marcados (sem apagar nada), para a pessoa
  // poder trocar Sócio/Vincular a/Débito/Crédito de um lançamento já
  // "Lançado".
  function handleEditarSelecionados() {
    setLancamentosDesbloqueados((prev) => {
      const next = new Set(prev);
      selecionadosLancamentos.forEach((id) => next.add(id));
      return next;
    });
    limparSelecaoLancamentos();
  }

  // "Desfazer" na barra de seleção — limpa a classificação (Débito/Crédito)
  // dos lançamentos marcados, voltando-os para "Pendente", e já destrava os
  // campos para reclassificar. Um único persistExtrato para todos os
  // marcados de uma vez (evita perder alterações ao processar vários ids em
  // sequência).
  function handleDesfazerSelecionados() {
    const ids = selecionadosLancamentos;
    persistExtrato(
      extrato.map((l) => (ids.has(l.id) ? { ...l, contaDebitoId: "", contaCreditoId: "" } : l))
    );
    setLancamentosDesbloqueados((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.add(id));
      return next;
    });
    limparSelecaoLancamentos();
  }

  // "Excluir" na barra de seleção — remove todos os lançamentos marcados de
  // uma vez.
  function handleExcluirSelecionados() {
    const ids = selecionadosLancamentos;
    persistExtrato(extrato.filter((l) => !ids.has(l.id)));
    limparSelecaoLancamentos();
  }

  // Limpa os filtros da aba Lançamentos (Buscar por/Data/Valor/Tipo/Status),
  // no mesmo estilo do botão de filtros da Nibo.
  function limparFiltrosLancamentos() {
    setFiltroLancBusca("");
    setFiltroLancDataDe("");
    setFiltroLancDataAte("");
    setFiltroLancValorMin("");
    setFiltroLancValorMax("");
    setFiltroLancTipo("");
    setFiltroLancStatus("");
  }

  // Exportação no layout posicional (largura fixa) que a Domínio Sistemas
  // exige para importar lançamentos contábeis — decodificado a partir de um
  // arquivo real que a pessoa já importou com sucesso lá. Cada lançamento
  // "Lançado" (Débito e Crédito preenchidos) vira um registro "02" (data)
  // seguido de dois registros "03": um para o lado Crédito e um para o lado
  // Débito, cada um com o "Código Domínio" da conta (não é o mesmo código do
  // nosso plano de contas) e o valor em centavos. O arquivo é fechado com um
  // registro "01" no início (CNPJ e período) e um "99" no final.
  const CNPJ_EMPRESA_DOMINIO = "21.203.244/0001-41";
  // Código interno da J & G INCORPORADORA dentro da Domínio (aparece no topo
  // da tela da Domínio, ex: "J & G INCORPORADORA - 123") — precisa bater com
  // a empresa que estiver ativa lá na hora de importar, senão a Domínio
  // recusa o arquivo com "empresa a ser importada é diferente da atualmente
  // ativa". É diferente do "Código Domínio" de cada conta (esse é o código
  // da empresa como um todo).
  const CODIGO_EMPRESA_DOMINIO = "123";
  function pad0Esquerda(valor, tamanho) {
    return String(valor).padStart(tamanho, "0").slice(-tamanho);
  }
  function padEspacosDireita(valor, tamanho) {
    return String(valor).slice(0, tamanho).padEnd(tamanho, " ");
  }
  function somenteDigitos(valor) {
    return String(valor || "").replace(/\D/g, "");
  }

  function handleExportarLancamentosDominio() {
    // Período próprio dessa exportação (campos "De" / "Até" ao lado do
    // botão, separados do filtro geral da tabela) — assim dá pra exportar só
    // o período desejado (ex: só o mês que ainda não foi importado na
    // Domínio), em vez de mandar tudo de novo e duplicar lançamentos que já
    // foram importados antes. Deixe os dois campos vazios para exportar
    // todos os lançamentos "Lançados".
    const filtroDataDeObj = exportDominioDataDe ? new Date(exportDominioDataDe + "T00:00:00") : null;
    const filtroDataAteObj = exportDominioDataAte ? new Date(exportDominioDataAte + "T23:59:59") : null;
    const candidatos = extrato.filter((l) => {
      if (!l.contaDebitoId || !l.contaCreditoId) return false;
      const dataLanc = parseDateBR(l.data);
      if (filtroDataDeObj && (!dataLanc || dataLanc < filtroDataDeObj)) return false;
      if (filtroDataAteObj && (!dataLanc || dataLanc > filtroDataAteObj)) return false;
      return true;
    });
    const ordenados = candidatos
      .slice()
      .sort((a, b) => (parseDateBR(a.data) || 0) - (parseDateBR(b.data) || 0));

    const semCodigo = [];
    const contasSemCodigo = new Map();
    const registros = [];
    let seq = 1;
    let dataMin = null;
    let dataMax = null;

    ordenados.forEach((l) => {
      const contaDebito = planoContas.find((c) => c.id === l.contaDebitoId);
      const contaCredito = planoContas.find((c) => c.id === l.contaCreditoId);
      const codDebito = codigoDominioDe(contaDebito);
      const codCredito = codigoDominioDe(contaCredito);
      if (!codDebito || !codCredito) {
        semCodigo.push(l);
        if (!codDebito && contaDebito) contasSemCodigo.set(contaDebito.id, contaDebito);
        if (!codCredito && contaCredito) contasSemCodigo.set(contaCredito.id, contaCredito);
        return;
      }
      const dataObj = parseDateBR(l.data);
      if (dataObj) {
        if (!dataMin || dataObj < dataMin) dataMin = dataObj;
        if (!dataMax || dataObj > dataMax) dataMax = dataObj;
      }

      const dataFormatada = padEspacosDireita(l.data || "", 10);
      registros.push("02" + pad0Esquerda(seq, 7) + "V" + dataFormatada + " ".repeat(130));
      seq++;

      const valorCentavos = Math.round(Math.abs(Number(l.valor) || 0) * 100);
      const valorFmt = pad0Esquerda(valorCentavos, 15);
      const descricaoFmt = padEspacosDireita(l.descricao || "", 512);

      // Lado Crédito: código na "conta crédito" (posições 16-22), zeros na débito.
      registros.push(
        "03" +
          pad0Esquerda(seq, 7) +
          "0000000" +
          pad0Esquerda(codCredito, 7) +
          valorFmt +
          "0000000" +
          descricaoFmt +
          pad0Esquerda(CODIGO_EMPRESA_DOMINIO, 7) +
          " ".repeat(100)
      );
      seq++;

      // Lado Débito: código na "conta débito" (posições 9-15), zeros na crédito.
      registros.push(
        "03" +
          pad0Esquerda(seq, 7) +
          pad0Esquerda(codDebito, 7) +
          "0000000" +
          valorFmt +
          "0000000" +
          descricaoFmt +
          pad0Esquerda(CODIGO_EMPRESA_DOMINIO, 7) +
          " ".repeat(100)
      );
      seq++;
    });

    const filtroPeriodoAtivo = exportDominioDataDe || exportDominioDataAte;
    const nomesContasSemCodigo = Array.from(contasSemCodigo.values())
      .map((c) => c.nome)
      .join(", ");
    if (registros.length === 0) {
      setAvisoExportDominio(
        semCodigo.length > 0
          ? `Nenhum lançamento pôde ser exportado: ${semCodigo.length} lançamento(s) "Lançado(s)" está(ão) com uma conta sem "Código Domínio" preenchido no Plano de Contas. Contas para preencher: ${nomesContasSemCodigo}.`
          : `Não há lançamentos "Lançados" para exportar${filtroPeriodoAtivo ? " no período selecionado no filtro (Data de / Data até)" : ""}.`
      );
      return;
    }

    const cnpjFmt = pad0Esquerda(somenteDigitos(CNPJ_EMPRESA_DOMINIO), 14);
    const dataInicialFmt = dataMin ? formatDateBR(dataMin) : "";
    const dataFinalFmt = dataMax ? formatDateBR(dataMax) : "";
    const cabecalho =
      "01" +
      pad0Esquerda(CODIGO_EMPRESA_DOMINIO, 7) +
      cnpjFmt +
      padEspacosDireita(dataInicialFmt, 10) +
      padEspacosDireita(dataFinalFmt, 10) +
      "N" +
      "0500000017";
    const rodape = "9".repeat(100);

    const conteudo = [cabecalho, ...registros, rodape].join("\r\n") + "\r\n";
    const blob = new Blob([conteudo], { type: "text/plain;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `lancamentos-dominio-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    const qtdExportada = registros.length / 3;
    const periodoTexto = filtroPeriodoAtivo
      ? ` (período: ${exportDominioDataDe || "início"} até ${exportDominioDataAte || "hoje"})`
      : " (todos os lançamentos Lançados, sem filtro de período)";
    setAvisoExportDominio(
      `Arquivo gerado com ${qtdExportada} lançamento(s)${periodoTexto}.` +
        (semCodigo.length > 0
          ? ` ${semCodigo.length} lançamento(s) ficaram de fora por falta de "Código Domínio" em alguma conta (preencha na aba Plano de Contas e exporte de novo).`
          : "")
    );
  }

  async function persistPlanoContas(nextList) {
    setPlanoContas(nextList);
    try {
      const result = await window.storage.set(STORAGE_KEY_PLANO_CONTAS, JSON.stringify(nextList), false);
      if (!result) setSaveErrorPlanoContas("Não foi possível salvar. Tente novamente.");
      else setSaveErrorPlanoContas(null);
    } catch (err) {
      setSaveErrorPlanoContas("Não foi possível salvar. Tente novamente.");
    }
  }

  function handleAddContaPlano(e) {
    e.preventDefault();
    if (!formPlanoContas.codigo.trim() || !formPlanoContas.nome.trim()) return;
    const nova = {
      id: `conta-${Date.now()}`,
      codigo: formPlanoContas.codigo.trim(),
      nome: formPlanoContas.nome.trim().toUpperCase(),
      tipo: formPlanoContas.tipo,
    };
    const proximaLista = [...planoContas, nova].sort((a, b) =>
      a.codigo.localeCompare(b.codigo, "pt-BR", { numeric: true })
    );
    persistPlanoContas(proximaLista);
    setFormPlanoContas({ codigo: "", nome: "", tipo: "despesa" });
    setShowFormPlanoContas(false);
  }

  function handleUpdateContaPlanoCampo(id, campo, valor) {
    setPlanoContas((prev) => prev.map((c) => (c.id === id ? { ...c, [campo]: valor } : c)));
  }

  function handlePersistPlanoContasBlur() {
    persistPlanoContas(planoContas);
  }

  function handleDeleteContaPlano(id) {
    if (contaBancoPadraoId === id) {
      persistContaBancoPadrao("");
    }
    persistPlanoContas(planoContas.filter((c) => c.id !== id));
  }

  async function persistContaBancoPadrao(id) {
    setContaBancoPadraoId(id);
    try {
      await window.storage.set(STORAGE_KEY_CONTA_BANCO_PADRAO, id, false);
    } catch (err) {
      // silencioso — é só uma preferência de conveniência para a sugestão automática
    }
  }


  async function persistSaldoInicialExtrato(valor) {
    const numero = Number(valor) || 0;
    setSaldoInicialExtrato(numero);
    try {
      await window.storage.set(STORAGE_KEY_SALDO_INICIAL_EXTRATO, String(numero), false);
    } catch (err) {
      // silencioso — mesmo padrão do conta bancária padrão
    }
  }

  async function persistSaldoInicialAplicacoes(valor) {
    const numero = Number(valor) || 0;
    setSaldoInicialAplicacoes(numero);
    try {
      await window.storage.set(STORAGE_KEY_SALDO_INICIAL_APLICACOES, String(numero), false);
    } catch (err) {
      // silencioso — mesmo padrão do saldo inicial do extrato
    }
  }

  async function persistSocios(nextList) {
    setEmprestimosSocios(nextList);
    try {
      const result = await window.storage.set(STORAGE_KEY_SOCIOS, JSON.stringify(nextList), false);
      if (!result) setSaveErrorSocios("Não foi possível salvar. Tente novamente.");
      else setSaveErrorSocios(null);
    } catch (err) {
      setSaveErrorSocios("Não foi possível salvar. Tente novamente.");
    }
  }

  function handleAddEmprestimo(e) {
    e.preventDefault();
    if (!formSocio.socio || !formSocio.valor) return;
    const novo = {
      id: Date.now(),
      socio: formSocio.socio,
      tipo: formSocio.tipo,
      valor: Math.abs(Number(formSocio.valor)),
      data: formSocio.data || new Date().toLocaleDateString("pt-BR"),
      obra: formSocio.obra || NOMES_OBRAS[0],
      observacao: formSocio.observacao,
    };
    persistSocios([...emprestimosSocios, novo]);
    setFormSocio({ socio: "", tipo: "aporte", valor: "", data: "", obra: NOMES_OBRAS[0], observacao: "" });
    setShowFormSocio(false);
  }

  function handleDeleteEmprestimo(id) {
    persistSocios(emprestimosSocios.filter((e) => e.id !== id));
  }

  async function persistDocumentos(nextList) {
    setDocumentos(nextList);
    try {
      const result = await window.storage.set(STORAGE_KEY_DOCUMENTOS, JSON.stringify(nextList), false);
      if (!result) setSaveErrorDocumentos("Não foi possível salvar. Tente novamente.");
      else setSaveErrorDocumentos(null);
    } catch (err) {
      setSaveErrorDocumentos("Não foi possível salvar. Tente novamente.");
    }
  }

  async function handleFormDocumentoFile(e) {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setUploadErrorDocumento("Arquivo muito grande — máximo recomendado de 10 MB por documento.");
      return;
    }
    setUploadErrorDocumento(null);
    setPdfImportedFieldsDocumento([]);
    setFormDocumento((prev) => ({ ...prev, arquivo: file }));

    if (file.type === "application/pdf") {
      setPdfReadingDocumento(true);
      try {
        const text = await extractTextFromPdf(file);
        const parsed = parseDocumentoEmpresa(text);
        if (Object.keys(parsed).length > 0) {
          setFormDocumento((prev) => ({ ...prev, ...parsed, arquivo: file }));
          setPdfImportedFieldsDocumento(Object.keys(parsed));
        }
      } catch (err) {
        // leitura falhou — segue com o arquivo anexado, campos preenchidos manualmente
      } finally {
        setPdfReadingDocumento(false);
      }
    }
  }

  async function handleAddDocumento(e) {
    e.preventDefault();
    if (!formDocumento.nome) return;
    setUploadingDocumento(true);
    setUploadErrorDocumento(null);
    try {
      const id = Date.now();
      let arquivoNome = null;
      let arquivoTipo = null;

      if (formDocumento.arquivo) {
        const dataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(new Error("Falha ao ler arquivo."));
          reader.readAsDataURL(formDocumento.arquivo);
        });
        const resultArquivo = await window.storage.set(chaveArquivoDocumento(id), dataUrl, false);
        if (!resultArquivo) {
          setUploadErrorDocumento("Não foi possível salvar o arquivo (pode ter excedido o limite de tamanho).");
          setUploadingDocumento(false);
          return;
        }
        arquivoNome = formDocumento.arquivo.name;
        arquivoTipo = formDocumento.arquivo.type;
      }

      const novo = {
        id,
        categoria: formDocumento.categoria,
        nome: formDocumento.nome,
        numero: formDocumento.numero,
        dataEmissao: formDocumento.dataEmissao,
        validade: formDocumento.validade,
        observacao: formDocumento.observacao,
        arquivoNome,
        arquivoTipo,
      };
      await persistDocumentos([...documentos, novo]);
      setFormDocumento({
        categoria: "Outro",
        nome: "",
        numero: "",
        dataEmissao: "",
        validade: "",
        observacao: "",
        arquivo: null,
      });
      setPdfImportedFieldsDocumento([]);
      setShowFormDocumento(false);
    } catch (err) {
      setUploadErrorDocumento("Não foi possível anexar o arquivo. Tente novamente.");
    } finally {
      setUploadingDocumento(false);
    }
  }

  async function handleDeleteDocumento(id) {
    persistDocumentos(documentos.filter((d) => d.id !== id));
    try {
      await window.storage.delete(chaveArquivoDocumento(id), false);
    } catch (err) {
      // arquivo pode já não existir — segue normalmente
    }
  }

  async function handleAbrirDocumento(doc) {
    if (!doc.arquivoNome) return;
    setAbrindoDocumentoId(doc.id);
    try {
      const result = await window.storage.get(chaveArquivoDocumento(doc.id), false);
      if (result) {
        const link = document.createElement("a");
        link.href = result.value;
        link.download = doc.arquivoNome;
        link.target = "_blank";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    } catch (err) {
      setSaveErrorDocumentos("Não foi possível abrir o arquivo.");
    } finally {
      setAbrindoDocumentoId(null);
    }
  }

  // Envia o documento pelo WhatsApp. Tenta primeiro o menu nativo de
  // compartilhar do aparelho (Web Share API com arquivo) — quando disponível,
  // o arquivo já sai anexado e você escolhe o contato na hora. Se o
  // navegador não suportar isso (comum em navegador de desktop ou dentro
  // deste painel incorporado), baixa o arquivo e abre o WhatsApp com uma
  // mensagem pronta, para você anexar manualmente.
  async function handleEnviarWhatsapp(doc) {
    if (!doc.arquivoNome) return;
    setEnviandoWhatsappId(doc.id);
    try {
      const result = await window.storage.get(chaveArquivoDocumento(doc.id), false);
      if (!result) {
        setSaveErrorDocumentos("Não foi possível carregar o arquivo para enviar.");
        return;
      }
      const dataUrl = result.value;

      let compartilhado = false;
      if (typeof navigator !== "undefined" && navigator.share) {
        try {
          const resposta = await fetch(dataUrl);
          const blob = await resposta.blob();
          const file = new File([blob], doc.arquivoNome, { type: doc.arquivoTipo || blob.type });
          if (navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({ files: [file], title: doc.nome, text: `Documento: ${doc.nome}` });
            compartilhado = true;
          }
        } catch (err) {
          // usuário cancelou o compartilhamento ou o navegador recusou — segue para o fallback
        }
      }

      if (!compartilhado) {
        const link = document.createElement("a");
        link.href = dataUrl;
        link.download = doc.arquivoNome;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        const texto = encodeURIComponent(`Segue o documento: ${doc.nome}`);
        window.open(`https://wa.me/?text=${texto}`, "_blank");
      }
    } catch (err) {
      setSaveErrorDocumentos("Não foi possível preparar o envio pelo WhatsApp.");
    } finally {
      setEnviandoWhatsappId(null);
    }
  }

  // Anexa um arquivo diretamente numa categoria fixa do checklist — sem
  // passar pelo formulário genérico. Se for PDF, tenta ler número, emissão e
  // validade automaticamente; o nome do documento vem do nome do arquivo
  // (útil para diferenciar, por exemplo, o RG de cada sócio).
  async function handleAnexarDocumentoCategoria(categoria, file) {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setUploadErrorDocumento("Arquivo muito grande — máximo recomendado de 10 MB por documento.");
      return;
    }
    setUploadErrorDocumento(null);
    setUploadingCategoria(categoria);
    try {
      let numero = "";
      let dataEmissao = "";
      let validade = "";
      if (file.type === "application/pdf") {
        try {
          const text = await extractTextFromPdf(file);
          const parsed = parseDocumentoEmpresa(text);
          numero = parsed.numero || "";
          dataEmissao = parsed.dataEmissao || "";
          validade = parsed.validade || "";
        } catch (err) {
          // leitura falhou — segue sem preencher automaticamente
        }
      }

      const id = Date.now();
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error("Falha ao ler arquivo."));
        reader.readAsDataURL(file);
      });
      const resultArquivo = await window.storage.set(chaveArquivoDocumento(id), dataUrl, false);
      if (!resultArquivo) {
        setUploadErrorDocumento("Não foi possível salvar o arquivo (pode ter excedido o limite de tamanho).");
        return;
      }

      const nomeArquivo = file.name.replace(/\.[^/.]+$/, "") || categoria;
      const novo = {
        id,
        categoria,
        nome: nomeArquivo,
        numero,
        dataEmissao,
        validade,
        observacao: "",
        arquivoNome: file.name,
        arquivoTipo: file.type,
      };
      await persistDocumentos([...documentos, novo]);
    } catch (err) {
      setUploadErrorDocumento("Não foi possível anexar o arquivo. Tente novamente.");
    } finally {
      setUploadingCategoria(null);
    }
  }

  function handleUpdateDocumentoCampo(id, campo, valor) {
    setDocumentos((prev) => prev.map((d) => (d.id === id ? { ...d, [campo]: valor } : d)));
  }

  function handlePersistDocumentosBlur() {
    persistDocumentos(documentos);
  }

  async function persistContratosFornecedores(nextList) {
    setContratosFornecedores(nextList);
    try {
      const result = await window.storage.set(STORAGE_KEY_FORNECEDORES, JSON.stringify(nextList), false);
      if (!result) setSaveErrorFornecedores("Não foi possível salvar. Tente novamente.");
      else setSaveErrorFornecedores(null);
    } catch (err) {
      setSaveErrorFornecedores("Não foi possível salvar. Tente novamente.");
    }
  }

  async function handleFormFornecedorFile(e) {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setPdfImportErrorFornecedor("Arquivo muito grande — máximo recomendado de 10 MB.");
      return;
    }
    setPdfImportErrorFornecedor(null);
    setPdfImportedFieldsFornecedor([]);
    setFormFornecedor((prev) => ({ ...prev, arquivo: file }));

    if (file.type === "application/pdf") {
      setPdfImportingFornecedor(true);
      try {
        const text = await extractTextFromPdf(file);
        const parsed = parseContratoFornecedor(text);
        if (Object.keys(parsed).length > 0) {
          setFormFornecedor((prev) => ({ ...prev, ...parsed, arquivo: file }));
          setPdfImportedFieldsFornecedor(Object.keys(parsed));
        }
      } catch (err) {
        // leitura falhou — segue com o arquivo anexado, campos preenchidos manualmente
      } finally {
        setPdfImportingFornecedor(false);
      }
    }
  }

  async function handleAddContratoFornecedor(e) {
    e.preventDefault();
    if (!formFornecedor.fornecedor || !formFornecedor.valor) return;
    try {
      const id = Date.now();
      let arquivoNome = null;
      let arquivoTipo = null;

      if (formFornecedor.arquivo) {
        const dataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(new Error("Falha ao ler arquivo."));
          reader.readAsDataURL(formFornecedor.arquivo);
        });
        const resultArquivo = await window.storage.set(chaveArquivoContratoFornecedor(id), dataUrl, false);
        if (!resultArquivo) {
          setPdfImportErrorFornecedor("Não foi possível salvar o arquivo (pode ter excedido o limite de tamanho).");
          return;
        }
        arquivoNome = formFornecedor.arquivo.name;
        arquivoTipo = formFornecedor.arquivo.type;
      }

      const novo = {
        id,
        fornecedor: formFornecedor.fornecedor,
        cnpj: formFornecedor.cnpj,
        obra: formFornecedor.obra || NOMES_OBRAS[0],
        tipo: formFornecedor.tipo,
        objeto: formFornecedor.objeto,
        valor: Number(formFornecedor.valor) || 0,
        numeroParcelas: Number(formFornecedor.numeroParcelas) || 1,
        dataInicio: formFornecedor.dataInicio || new Date().toLocaleDateString("pt-BR"),
        dataTermino: formFornecedor.dataTermino,
        encerrado: false,
        observacoes: formFornecedor.observacoes,
        arquivoNome,
        arquivoTipo,
      };
      const novasParcelas = gerarParcelas({
        id: novo.id,
        dataEmissao: novo.dataInicio,
        numeroParcelas: novo.numeroParcelas,
        valorTotal: novo.valor,
        fornecedor: novo.fornecedor,
        obra: novo.obra,
      });
      await persistContratosFornecedores([...contratosFornecedores, novo]);
      await persistNotasEPagar(notasCompra, [...contasPagar, ...novasParcelas]);
      setFormFornecedor({
        fornecedor: "",
        cnpj: "",
        obra: NOMES_OBRAS[0],
        tipo: TIPOS_FORNECEDOR[0],
        objeto: "",
        valor: "",
        numeroParcelas: "1",
        dataInicio: "",
        dataTermino: "",
        observacoes: "",
        arquivo: null,
      });
      setPdfImportedFieldsFornecedor([]);
      setShowFormFornecedor(false);
    } catch (err) {
      setPdfImportErrorFornecedor("Não foi possível salvar o contrato. Tente novamente.");
    }
  }

  async function handleDeleteContratoFornecedor(id) {
    persistContratosFornecedores(contratosFornecedores.filter((c) => c.id !== id));
    persistNotasEPagar(notasCompra, contasPagar.filter((c) => c.notaId !== id));
    try {
      await window.storage.delete(chaveArquivoContratoFornecedor(id), false);
    } catch (err) {
      // arquivo pode já não existir — segue normalmente
    }
  }

  function handleToggleEncerradoFornecedor(id) {
    persistContratosFornecedores(
      contratosFornecedores.map((c) => (c.id === id ? { ...c, encerrado: !c.encerrado } : c))
    );
  }

  async function handleAbrirAnexoFornecedor(contrato) {
    if (!contrato.arquivoNome) return;
    try {
      const result = await window.storage.get(chaveArquivoContratoFornecedor(contrato.id), false);
      if (result) {
        const link = document.createElement("a");
        link.href = result.value;
        link.download = contrato.arquivoNome;
        link.target = "_blank";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    } catch (err) {
      setSaveErrorFornecedores("Não foi possível abrir o arquivo.");
    }
  }

  async function persistContratosServicos(nextList) {
    setContratosServicos(nextList);
    try {
      const result = await window.storage.set(STORAGE_KEY_SERVICOS, JSON.stringify(nextList), false);
      if (!result) setSaveErrorServicos("Não foi possível salvar. Tente novamente.");
      else setSaveErrorServicos(null);
    } catch (err) {
      setSaveErrorServicos("Não foi possível salvar. Tente novamente.");
    }
  }

  async function handleFormServicoFile(e) {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setPdfImportErrorServico("Arquivo muito grande — máximo recomendado de 10 MB.");
      return;
    }
    setPdfImportErrorServico(null);
    setPdfImportedFieldsServico([]);
    setFormServico((prev) => ({ ...prev, arquivo: file }));

    if (file.type === "application/pdf") {
      setPdfImportingServico(true);
      try {
        const text = await extractTextFromPdf(file);
        const parsed = parseContratoFornecedor(text);
        if (Object.keys(parsed).length > 0) {
          setFormServico((prev) => ({ ...prev, ...parsed, arquivo: file }));
          setPdfImportedFieldsServico(Object.keys(parsed));
        }
      } catch (err) {
        // leitura falhou — segue com o arquivo anexado, campos preenchidos manualmente
      } finally {
        setPdfImportingServico(false);
      }
    }
  }

  async function handleAddContratoServico(e) {
    e.preventDefault();
    if (!formServico.fornecedor || !formServico.valor) return;
    try {
      const id = Date.now();
      let arquivoNome = null;
      let arquivoTipo = null;

      if (formServico.arquivo) {
        const dataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(new Error("Falha ao ler arquivo."));
          reader.readAsDataURL(formServico.arquivo);
        });
        const resultArquivo = await window.storage.set(chaveArquivoContratoServico(id), dataUrl, false);
        if (!resultArquivo) {
          setPdfImportErrorServico("Não foi possível salvar o arquivo (pode ter excedido o limite de tamanho).");
          return;
        }
        arquivoNome = formServico.arquivo.name;
        arquivoTipo = formServico.arquivo.type;
      }

      const novo = {
        id,
        fornecedor: formServico.fornecedor,
        cnpj: formServico.cnpj,
        obra: formServico.obra || NOMES_OBRAS[0],
        objeto: formServico.objeto,
        valor: Number(formServico.valor) || 0,
        numeroParcelas: Number(formServico.numeroParcelas) || 1,
        dataInicio: formServico.dataInicio || new Date().toLocaleDateString("pt-BR"),
        dataTermino: formServico.dataTermino,
        encerrado: false,
        observacoes: formServico.observacoes,
        arquivoNome,
        arquivoTipo,
      };
      const novasParcelas = gerarParcelas({
        id: novo.id,
        dataEmissao: novo.dataInicio,
        numeroParcelas: novo.numeroParcelas,
        valorTotal: novo.valor,
        fornecedor: novo.fornecedor,
        obra: novo.obra,
      });
      await persistContratosServicos([...contratosServicos, novo]);
      await persistNotasEPagar(notasCompra, [...contasPagar, ...novasParcelas]);
      setFormServico({
        fornecedor: "",
        cnpj: "",
        obra: NOMES_OBRAS[0],
        objeto: "",
        valor: "",
        numeroParcelas: "1",
        dataInicio: "",
        dataTermino: "",
        observacoes: "",
        arquivo: null,
      });
      setPdfImportedFieldsServico([]);
      setShowFormServico(false);
    } catch (err) {
      setPdfImportErrorServico("Não foi possível salvar o contrato. Tente novamente.");
    }
  }

  async function handleDeleteContratoServico(id) {
    persistContratosServicos(contratosServicos.filter((c) => c.id !== id));
    persistNotasEPagar(notasCompra, contasPagar.filter((c) => c.notaId !== id));
    try {
      await window.storage.delete(chaveArquivoContratoServico(id), false);
    } catch (err) {
      // arquivo pode já não existir — segue normalmente
    }
  }

  function handleToggleEncerradoServico(id) {
    persistContratosServicos(
      contratosServicos.map((c) => (c.id === id ? { ...c, encerrado: !c.encerrado } : c))
    );
  }

  async function handleAbrirAnexoServico(contrato) {
    if (!contrato.arquivoNome) return;
    try {
      const result = await window.storage.get(chaveArquivoContratoServico(contrato.id), false);
      if (result) {
        const link = document.createElement("a");
        link.href = result.value;
        link.download = contrato.arquivoNome;
        link.target = "_blank";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    } catch (err) {
      setSaveErrorServicos("Não foi possível abrir o arquivo.");
    }
  }

  // Orçado e realizado por obra agora vêm do orçamento detalhado (aba Custos
  // das obras): orçado = soma de Quantidade × Valor Unitário de cada item;
  // realizado = soma do Gasto Real (vinculado a contas a pagar quando houver,
  // senão o valor digitado manualmente) de cada item.
  const custosItensComGasto = custosItens.map((it) => ({
    ...it,
    gastoReal: gastoRealEfetivo(it, contasPagar),
    gastoRealVinculado: contasPagar.some((c) => c.custoItemId === it.id),
  }));

  const obrasComRealizado = obrasState.map((o) => {
    const resumo = resumoCustoItens(custosItensComGasto.filter((it) => it.obra === o.nome));
    return { ...o, orcado: resumo.orcado, realizado: resumo.gasto };
  });

  const totalOrcado = obrasComRealizado.reduce((s, o) => s + (o.orcado || 0), 0);
  const totalRealizado = obrasComRealizado.reduce((s, o) => s + (o.realizado || 0), 0);

  const itensObraCustoAtual = custosItensComGasto.filter((it) => it.obra === obraCustoSelecionada);
  const totalGeralObraCusto = resumoCustoItens(itensObraCustoAtual);

  // Fluxo de caixa calculado automaticamente:
  // entradas = valor de cada parcela de valores a receber, lançado no mês de
  //            vencimento, + créditos do extrato bancário + aportes de sócios;
  // saídas   = valor de cada parcela de contas a pagar, lançado no mês de vencimento,
  //            + débitos do extrato bancário + devoluções a sócios.
  // Extrato bancário e empréstimos de sócios somam-se às entradas/saídas já
  // calculadas — não substituem (cuidado com contagem em dobro se o mesmo
  // movimento aparecer em mais de uma fonte).
  const fluxoCaixa = useMemo(() => {
    const porMes = {};

    valoresReceber.forEach((v) => {
      const data = parseDateBR(v.vencimento);
      if (!data) return;
      const key = mesAnoKey(data);
      if (!porMes[key]) porMes[key] = { data, entradas: 0, saidas: 0 };
      porMes[key].entradas += v.valor;
    });

    contasPagar.forEach((c) => {
      const data = parseDateBR(c.vencimento);
      if (!data) return;
      const key = mesAnoKey(data);
      if (!porMes[key]) porMes[key] = { data, entradas: 0, saidas: 0 };
      porMes[key].saidas += c.valor;
    });

    extrato.forEach((l) => {
      const data = parseDateBR(l.data);
      if (!data) return;
      const key = mesAnoKey(data);
      if (!porMes[key]) porMes[key] = { data, entradas: 0, saidas: 0 };
      if (l.valor >= 0) porMes[key].entradas += l.valor;
      else porMes[key].saidas += Math.abs(l.valor);
    });

    emprestimosSocios.forEach((e) => {
      const data = parseDateBR(e.data);
      if (!data) return;
      const key = mesAnoKey(data);
      if (!porMes[key]) porMes[key] = { data, entradas: 0, saidas: 0 };
      if (e.tipo === "aporte") porMes[key].entradas += e.valor;
      else porMes[key].saidas += e.valor;
    });

    return Object.values(porMes)
      .sort((a, b) => a.data - b.data)
      .slice(-6)
      .map((m) => ({
        mes: mesAnoLabel(m.data),
        chave: mesAnoKey(m.data),
        entradas: Math.round(m.entradas),
        saidas: Math.round(m.saidas),
      }));
  }, [valoresReceber, contasPagar, extrato, emprestimosSocios]);

  const totalEntradasFluxo = fluxoCaixa.reduce((s, f) => s + f.entradas, 0);
  const totalSaidasFluxo = fluxoCaixa.reduce((s, f) => s + f.saidas, 0);
  const saldoCaixa = totalEntradasFluxo - totalSaidasFluxo;

  // Planilha detalhada do fluxo de caixa: saldo do mês e saldo acumulado
  // (fluxoCaixa já vem ordenado do mês mais antigo para o mais recente).
  let acumuladoFluxo = 0;
  const fluxoCaixaDetalhado = fluxoCaixa.map((f) => {
    const saldoMes = f.entradas - f.saidas;
    acumuladoFluxo += saldoMes;
    return { ...f, saldoMes, saldoAcumulado: acumuladoFluxo };
  });

  const contratosVencimentosTodos = [...contratosFornecedores, ...contratosServicos];
  const vencendoEm30 = contratosVencimentosTodos.filter((c) => statusContratoFornecedorDisplay(c) === "vencendo").length;

  const contratosFornecedoresFiltrados = filtroObraFornecedores
    ? contratosFornecedores.filter((c) => c.obra === filtroObraFornecedores)
    : contratosFornecedores;
  const emprestimosBancariosFiltrados = filtroObraEmprestimosBancarios
    ? emprestimosBancarios.filter((e) => e.obra === filtroObraEmprestimosBancarios)
    : emprestimosBancarios;
  const totalContratadoFornecedores = contratosFornecedoresFiltrados.reduce((s, c) => s + c.valor, 0);
  const contratosFornecedoresVencendo = contratosFornecedoresFiltrados.filter(
    (c) => statusContratoFornecedorDisplay(c) === "vencendo"
  ).length;
  const contratosFornecedoresVencidos = contratosFornecedoresFiltrados.filter(
    (c) => statusContratoFornecedorDisplay(c) === "vencido"
  ).length;
  const contratosFornecedoresAtivos = contratosFornecedoresFiltrados.filter(
    (c) => statusContratoFornecedorDisplay(c) === "ativo"
  ).length;

  const contratosServicosFiltrados = filtroObraServicos
    ? contratosServicos.filter((c) => c.obra === filtroObraServicos)
    : contratosServicos;
  const totalContratadoServicos = contratosServicosFiltrados.reduce((s, c) => s + c.valor, 0);
  const contratosServicosVencendo = contratosServicosFiltrados.filter(
    (c) => statusContratoFornecedorDisplay(c) === "vencendo"
  ).length;
  const contratosServicosVencidos = contratosServicosFiltrados.filter(
    (c) => statusContratoFornecedorDisplay(c) === "vencido"
  ).length;
  const contratosServicosAtivos = contratosServicosFiltrados.filter(
    (c) => statusContratoFornecedorDisplay(c) === "ativo"
  ).length;

  const totalVGV = contratosCV.reduce((s, c) => s + c.valor, 0);
  const totalRecebidoCV = contratosCV.reduce((s, c) => s + c.valor * (c.percentualPago / 100), 0);
  const unidadesAtrasadas = contratosCV.filter((c) => c.statusPagamento === "atrasado").length;

  // Status de cada unidade calculado (vendida = tem contrato de compra e
  // venda correspondente); filtro combina obra + status efetivo.
  const unidadesComStatus = unidadesObra.map((u) => {
    const { status, contrato } = statusUnidadeEfetivo(u, contratosCV);
    return { ...u, statusEfetivo: status, contratoVinculado: contrato };
  });
  const unidadesFiltradas = unidadesComStatus.filter(
    (u) => (!filtroObraUnidades || u.obra === filtroObraUnidades) && (!filtroStatusUnidades || u.statusEfetivo === filtroStatusUnidades)
  );
  const totalVGVPotencial = unidadesComStatus.reduce((s, u) => s + u.valorVenda, 0);
  const totalVGVVendido = unidadesComStatus.filter((u) => u.statusEfetivo === "vendida").reduce((s, u) => s + u.valorVenda, 0);
  const unidadesDisponiveis = unidadesComStatus.filter((u) => u.statusEfetivo === "disponivel").length;
  const unidadesReservadas = unidadesComStatus.filter((u) => u.statusEfetivo === "reservada").length;
  const unidadesVendidas = unidadesComStatus.filter((u) => u.statusEfetivo === "vendida").length;

  const notasFiltradas = filtroObraNotas ? notasCompra.filter((n) => n.obra === filtroObraNotas) : notasCompra;
  const contasPagarFiltradas = filtroObraPagar
    ? contasPagar.filter((c) => c.obra === filtroObraPagar)
    : contasPagar;

  const totalNotasCompra = notasFiltradas.reduce((s, n) => s + n.valorTotal, 0);
  const totalAPagar = contasPagarFiltradas
    .filter((c) => statusPagarDisplay(c) !== "pago")
    .reduce((s, c) => s + c.valor, 0);
  const totalPago = contasPagarFiltradas
    .filter((c) => statusPagarDisplay(c) === "pago")
    .reduce((s, c) => s + valorAtualizadoItem(c), 0);
  const parcelasVencidas = contasPagarFiltradas.filter((c) => statusPagarDisplay(c) === "vencido").length;

  const saldoExtrato = extrato.reduce((s, l) => s + l.valor, 0);
  const totalCreditosExtrato = extrato.filter((l) => l.valor >= 0).reduce((s, l) => s + l.valor, 0);
  const totalDebitosExtrato = extrato.filter((l) => l.valor < 0).reduce((s, l) => s + Math.abs(l.valor), 0);
  const saldoFinalExtrato = Number(saldoInicialExtrato || 0) + saldoExtrato;

  // Saldo em contas de aplicações financeiras — some sozinho a partir dos
  // lançamentos do extrato já classificados (Débito e Crédito preenchidos):
  // quando o Débito é uma conta de aplicação, é dinheiro saindo do banco
  // para lá (aplicação, soma aqui); quando o Crédito é uma conta de
  // aplicação, é um resgate voltando para o banco (subtrai daqui).
  const movimentoAplicacoes = extrato.reduce((soma, l) => {
    if (!l.contaDebitoId || !l.contaCreditoId) return soma;
    const contaDebito = planoContas.find((c) => c.id === l.contaDebitoId);
    const contaCredito = planoContas.find((c) => c.id === l.contaCreditoId);
    const valorAbs = Math.abs(Number(l.valor) || 0);
    if (contaDebito && /aplic/i.test(contaDebito.nome || "")) return soma + valorAbs;
    if (contaCredito && /aplic/i.test(contaCredito.nome || "")) return soma - valorAbs;
    return soma;
  }, 0);
  const saldoAplicacoes = Number(saldoInicialAplicacoes || 0) + movimentoAplicacoes;

  // Lançamentos do extrato bancário marcados com um sócio contam como
  // empréstimo/devolução automaticamente (crédito = aporte, débito =
  // devolução), sem duplicar o registro manual — cada movimento é contado
  // só na fonte onde foi lançado.
  const movimentosSocios = [
    ...emprestimosSocios.map((e) => ({ ...e, origem: "manual" })),
    ...extrato
      .filter((l) => l.socio)
      .map((l) => ({
        id: `extrato-${l.id}`,
        socio: l.socio,
        tipo: l.valor >= 0 ? "aporte" : "devolucao",
        valor: Math.abs(l.valor),
        data: l.data,
        obra: "",
        observacao: l.descricao,
        origem: "extrato",
      })),
  ];

  const movimentosSociosFiltrados = filtroObraSocios
    ? movimentosSocios.filter((m) => m.obra === filtroObraSocios)
    : movimentosSocios;

  const totalAportado = movimentosSociosFiltrados
    .filter((e) => e.tipo === "aporte")
    .reduce((s, e) => s + e.valor, 0);
  const totalDevolvido = movimentosSociosFiltrados
    .filter((e) => e.tipo === "devolucao")
    .reduce((s, e) => s + e.valor, 0);
  const saldoComSocios = totalAportado - totalDevolvido;
  const saldoPorSocio = Object.entries(
    movimentosSociosFiltrados.reduce((acc, e) => {
      acc[e.socio] = (acc[e.socio] || 0) + (e.tipo === "aporte" ? e.valor : -e.valor);
      return acc;
    }, {})
  )
    .map(([socio, saldo]) => ({ socio, saldo }))
    .sort((a, b) => b.saldo - a.saldo);

  const categoriasComDocumento = new Set(documentos.map((d) => d.categoria));
  const essenciaisPendentes = DOCUMENTOS_ESSENCIAIS.filter((c) => !categoriasComDocumento.has(c));
  const documentosVencidos = documentos.filter((d) => statusDocumentoDisplay(d) === "vencido").length;
  const documentosVencendo = documentos.filter((d) => statusDocumentoDisplay(d) === "vencendo").length;

  const totalAReceber = valoresReceber
    .filter((v) => statusReceberDisplay(v) !== "pago")
    .reduce((s, v) => s + v.valor, 0);
  const totalRecebidoParcelas = valoresReceber
    .filter((v) => statusReceberDisplay(v) === "pago")
    .reduce((s, v) => s + valorAtualizadoItem(v), 0);
  const parcelasReceberVencidas = valoresReceber.filter((v) => statusReceberDisplay(v) === "vencido").length;

  // Agrupa as parcelas por unidade + cliente: total da venda, valor já
  // recebido, saldo a receber e a lista de parcelas (pro detalhe expandido).
  const saldoPorUnidade = Object.values(
    valoresReceber.reduce((acc, v) => {
      const chave = `${v.unidade}|${v.comprador}`;
      if (!acc[chave]) {
        acc[chave] = { chave, unidade: v.unidade, comprador: v.comprador, valorTotal: 0, recebido: 0, parcelas: [] };
      }
      acc[chave].valorTotal += v.valor;
      if (statusReceberDisplay(v) === "pago") acc[chave].recebido += v.valor;
      acc[chave].parcelas.push(v);
      return acc;
    }, {})
  )
    .map((g) => ({ ...g, saldoAReceber: g.valorTotal - g.recebido }))
    .sort((a, b) => b.saldoAReceber - a.saldoAReceber);

  return (
    <div
      id="painel-obras-contratos"
      className="w-full"
      style={{
        background: "#22252A",
        fontFamily: "'Inter', sans-serif",
        height: "100vh",
        overflowY: "auto",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600&display=swap');
        @media print {
          .no-print { display: none !important; }
          #painel-obras-contratos { background: #FFFFFF !important; height: auto !important; overflow: visible !important; }
        }
      `}</style>

      <div className="max-w-6xl mx-auto px-5 py-8 sm:px-8">
        {/* Header */}
        <header className="mb-8 flex items-end justify-between flex-wrap gap-3 no-print">
          <div>
            <div
              className="text-[11px] uppercase tracking-[0.2em] font-semibold mb-1"
              style={{ color: "#E1590C", fontFamily: "'Oswald', sans-serif" }}
            >
              Painel consolidado
            </div>
            <h1
              className="text-3xl sm:text-4xl font-semibold text-white tracking-tight"
              style={{ fontFamily: "'Oswald', sans-serif" }}
            >
              Obras &amp; Contratos
            </h1>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm" style={{ color: "#9BA0A6" }}>
              Obra Isla Catalina · atualizado hoje
            </span>
            <button
              onClick={() => {
                setTipoRelatorio("consolidado");
                setModoRelatorio(true);
              }}
              className="text-xs font-semibold px-3 py-1.5 rounded-sm"
              style={{
                fontFamily: "'Oswald', sans-serif",
                letterSpacing: "0.03em",
                color: "#F5F3EC",
                background: "#3D6E8C",
              }}
            >
              📄 GERAR RELATÓRIO
            </button>
          </div>
        </header>

        {modoRelatorio ? (
          <ReportView
            tipo={tipoRelatorio || activeTab}
            onFechar={() => {
              setModoRelatorio(false);
              setTipoRelatorio(null);
            }}
            obraCustoSelecionada={obraCustoSelecionada}
            itensObraCustoAtual={itensObraCustoAtual}
            totalGeralObraCusto={totalGeralObraCusto}
            obrasComRealizado={obrasComRealizado}
            totalOrcado={totalOrcado}
            totalRealizado={totalRealizado}
            saldoCaixa={saldoCaixa}
            vencendoEm30={vencendoEm30}
            contratosCV={contratosCV}
            totalVGV={totalVGV}
            totalRecebidoCV={totalRecebidoCV}
            unidadesAtrasadas={unidadesAtrasadas}
            valoresReceber={valoresReceber}
            saldoPorUnidade={saldoPorUnidade}
            totalAReceber={totalAReceber}
            totalRecebidoParcelas={totalRecebidoParcelas}
            parcelasReceberVencidas={parcelasReceberVencidas}
            notasCompra={notasCompra}
            totalNotasCompra={totalNotasCompra}
            contasPagar={contasPagar}
            totalAPagar={totalAPagar}
            totalPago={totalPago}
            parcelasVencidas={parcelasVencidas}
            extrato={extrato}
            saldoExtrato={saldoExtrato}
            saldoInicialExtrato={saldoInicialExtrato}
            saldoFinalExtrato={saldoFinalExtrato}
            totalCreditosExtrato={totalCreditosExtrato}
            totalDebitosExtrato={totalDebitosExtrato}
            saldoAplicacoes={saldoAplicacoes}
            movimentosSocios={movimentosSocios}
            saldoPorSocio={saldoPorSocio}
            saldoComSocios={saldoComSocios}
            totalAportado={totalAportado}
            totalDevolvido={totalDevolvido}
            documentos={documentos}
            documentosVencidos={documentosVencidos}
            documentosVencendo={documentosVencendo}
            essenciaisPendentes={essenciaisPendentes}
            contratosFornecedores={contratosFornecedores}
            totalContratadoFornecedores={totalContratadoFornecedores}
            contratosFornecedoresVencendo={contratosFornecedoresVencendo}
            contratosFornecedoresVencidos={contratosFornecedoresVencidos}
            contratosFornecedoresAtivos={contratosFornecedoresAtivos}
            contratosServicos={contratosServicos}
            totalContratadoServicos={totalContratadoServicos}
            contratosServicosVencendo={contratosServicosVencendo}
            contratosServicosVencidos={contratosServicosVencidos}
            contratosServicosAtivos={contratosServicosAtivos}
            totalEntradasFluxo={totalEntradasFluxo}
            totalSaidasFluxo={totalSaidasFluxo}
            fluxoCaixa={fluxoCaixa}
            unidadesComStatus={unidadesComStatus}
            totalVGVPotencial={totalVGVPotencial}
            totalVGVVendido={totalVGVVendido}
            unidadesDisponiveis={unidadesDisponiveis}
            unidadesReservadas={unidadesReservadas}
            unidadesVendidas={unidadesVendidas}
          />
        ) : (
        <>
        {/* Tab nav */}
        <div className="flex flex-wrap justify-center gap-1 mb-7 border-b no-print" style={{ borderColor: "#3A3E45" }}>
          {[
            { id: "geral", label: "Visão geral" },
            { id: "fluxocaixa", label: "Fluxo de caixa" },
            { id: "custos", label: "Custos das obras" },
            { id: "unidades", label: "Unidades e tabela de vendas" },
            { id: "cv", label: "Contratos de compra e venda" },
            { id: "receber", label: "Valores a receber" },
            { id: "notas", label: "Notas de compras" },
            { id: "pagar", label: "Contas a pagar" },
            { id: "extrato", label: "Extrato bancário" },
            { id: "socios", label: "Empréstimos de sócios" },
            { id: "emprestimosbancarios", label: "Empréstimos bancários" },
            { id: "documentos", label: "Documentos da empresa" },
            { id: "fornecedores", label: "Contratos de fornecedores" },
            { id: "servicos", label: "Contratos de prestação de serviços" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="px-4 py-2.5 text-sm font-medium transition-colors"
              style={{
                fontFamily: "'Oswald', sans-serif",
                letterSpacing: "0.03em",
                color: activeTab === tab.id ? "#F5F3EC" : "#8A8D93",
                borderBottom: activeTab === tab.id ? "2px solid #E1590C" : "2px solid transparent",
              }}
            >
              {tab.label.toUpperCase()}
            </button>
          ))}
        </div>

        {activeTab === "geral" && (
        <>
        {/* KPI row */}
        <div className="flex flex-wrap gap-3 mb-8">
          <KpiCard
            eyebrow="Total contratado"
            value={formatBRLShort(totalOrcado)}
            sub={formatBRL(totalOrcado)}
            onClick={() => setActiveTab("custos")}
          />
          <KpiCard
            eyebrow="Total realizado"
            value={formatBRLShort(totalRealizado)}
            sub={totalOrcado ? `${Math.round((totalRealizado / totalOrcado) * 100)}% do contratado` : "sem orçamento detalhado ainda"}
            accent="#3D6E8C"
            onClick={() => setActiveTab("custos")}
          />
          <KpiCard
            eyebrow="Saldo em caixa"
            value={formatBRLShort(saldoCaixa)}
            sub="consolidado, últimos 6 meses"
            accent={saldoCaixa >= 0 ? "#4F7A5B" : "#B23A2E"}
            onClick={() => setActiveTab("fluxocaixa")}
          />
          <KpiCard
            eyebrow="Contratos vencendo"
            value={`${vencendoEm30}`}
            sub="nos próximos 30 dias"
            accent={vencendoEm30 > 0 ? "#B4590C" : "#22252A"}
            onClick={() => setActiveTab("fornecedores")}
          />
        </div>

        {/* Main grid */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
          {/* Obras */}
          <section
            className="lg:col-span-3 rounded-md p-5 border"
            style={{ background: "#F5F3EC", borderColor: "#DCD7C9" }}
          >
            <h2
              onClick={() => setActiveTab("custos")}
              title="Ver detalhamento em Custos das obras"
              className="text-sm uppercase tracking-[0.12em] font-semibold mb-4 cursor-pointer"
              style={{ color: "#22252A", fontFamily: "'Oswald', sans-serif" }}
            >
              Isla Catalina — orçado × realizado <span style={{ color: "#8A8D93", fontWeight: 400 }}>›</span>
            </h2>
            <div className="space-y-4">
              {obrasComRealizado.map((o) => {
                const isConcluida = o.status === "concluida";
                const pctFinanceiro = isConcluida || !o.orcado ? null : Math.round((o.realizado / o.orcado) * 100);
                const isSelected = selectedObra === o.id;
                return (
                  <button
                    key={o.id}
                    onClick={() => setSelectedObra(isSelected ? null : o.id)}
                    className="w-full text-left rounded-sm p-3 transition-colors"
                    style={{
                      background: isSelected ? "#EFE9DA" : "transparent",
                      border: "1px solid " + (isSelected ? "#C7BFA8" : "transparent"),
                    }}
                  >
                    <div className="flex items-baseline justify-between mb-1.5">
                      <span className="font-semibold text-sm" style={{ color: "#22252A" }}>
                        {o.nome}
                      </span>
                      {!isConcluida && (
                        <span
                          className="text-xs"
                          style={{ color: "#6B6F76", fontFamily: "'IBM Plex Mono', monospace" }}
                        >
                          {formatBRLShort(o.realizado)} / {formatBRLShort(o.orcado)}
                        </span>
                      )}
                    </div>
                    {isConcluida ? (
                      <div className="flex items-center gap-2">
                        <span
                          className="text-[10px] uppercase tracking-wide font-semibold px-2 py-1 rounded-full"
                          style={{ color: "#4F7A5B", background: "#E8EEE8" }}
                        >
                          Concluída
                        </span>
                        {o.nota && (
                          <span className="text-xs" style={{ color: "#8A8D93" }}>
                            {o.nota}
                          </span>
                        )}
                      </div>
                    ) : (
                      <RulerBar pct={pctFinanceiro || 0} colorFrom={pctFinanceiro > 95 ? "#B4590C" : "#3D6E8C"} />
                    )}
                    {isSelected && !isConcluida && (
                      <div className="mt-2 flex gap-4 text-xs" style={{ color: "#6B6F76" }}>
                        <span>Avanço físico: <strong style={{ color: "#22252A" }}>{o.avancoFisico}%</strong></span>
                        <span>
                          Saldo do orçamento:{" "}
                          <strong style={{ color: "#22252A" }}>{formatBRLShort(o.orcado - o.realizado)}</strong>
                        </span>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </section>

          {/* Contratos */}
          <section
            className="lg:col-span-2 rounded-md p-5 border"
            style={{ background: "#F5F3EC", borderColor: "#DCD7C9" }}
          >
            <h2
              onClick={() => setActiveTab("fornecedores")}
              title="Ver todos em Contratos de fornecedores"
              className="text-sm uppercase tracking-[0.12em] font-semibold mb-4 cursor-pointer"
              style={{ color: "#22252A", fontFamily: "'Oswald', sans-serif" }}
            >
              Contratos de fornecedores e serviços — atenção a vencimentos{" "}
              <span style={{ color: "#8A8D93", fontWeight: 400 }}>›</span>
            </h2>
            {contratosVencimentosTodos.length === 0 ? (
              <div className="text-sm py-6 text-center" style={{ color: "#8A8D93" }}>
                Nenhum contrato de fornecedor ou serviço cadastrado ainda.
              </div>
            ) : (
              <div className="space-y-2.5">
                {contratosVencimentosTodos
                  .slice()
                  .sort((a, b) => {
                    const da = diasRestantesContrato(a);
                    const db = diasRestantesContrato(b);
                    if (da === null) return 1;
                    if (db === null) return -1;
                    return da - db;
                  })
                  .map((c) => {
                    const status = statusContratoFornecedorDisplay(c);
                    const cfg = statusConfig[status];
                    const dias = diasRestantesContrato(c);
                    return (
                      <div
                        key={c.id}
                        onClick={() => setActiveTab(c.tipo ? "fornecedores" : "servicos")}
                        title={c.tipo ? "Ver em Contratos de fornecedores" : "Ver em Contratos de prestação de serviços"}
                        className="flex items-center justify-between rounded-sm px-3 py-2.5 cursor-pointer"
                        style={{ background: "#FFFFFF", border: "1px solid #E4E0D6" }}
                      >
                        <div className="min-w-0 pr-2">
                          <div className="text-sm font-medium truncate" style={{ color: "#22252A" }}>
                            {c.fornecedor}
                          </div>
                          <div className="text-xs" style={{ color: "#8A8D93" }}>
                            {c.tipo || "Prestação de serviço"} · {c.obra}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <span
                            className="text-[10px] uppercase tracking-wide font-semibold px-2 py-0.5 rounded-full"
                            style={{ color: cfg.color, background: cfg.bg }}
                          >
                            {cfg.label}
                          </span>
                          <span
                            className="text-[11px]"
                            style={{ color: "#8A8D93", fontFamily: "'IBM Plex Mono', monospace" }}
                          >
                            {dias === null
                              ? "sem prazo definido"
                              : dias >= 0
                              ? `${dias}d restantes`
                              : `${Math.abs(dias)}d em atraso`}
                          </span>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </section>
        </div>

        {/* Avisos de vencimento — contas a pagar */}
        <section
          className="mt-5 rounded-md p-5 border"
          style={{ background: "#F5F3EC", borderColor: "#DCD7C9" }}
        >
          <h2
            onClick={() => setActiveTab("pagar")}
            title="Ver todas em Contas a pagar"
            className="text-sm uppercase tracking-[0.12em] font-semibold mb-4 cursor-pointer"
            style={{ color: "#22252A", fontFamily: "'Oswald', sans-serif" }}
          >
            Contas a pagar — avisos de vencimento <span style={{ color: "#8A8D93", fontWeight: 400 }}>›</span>
          </h2>
          {loadingNotas ? (
            <div className="text-sm py-6 text-center" style={{ color: "#8A8D93" }}>
              Carregando…
            </div>
          ) : (() => {
            const avisos = contasPagar
              .filter((c) => statusPagarDisplay(c) === "vencido" || statusPagarDisplay(c) === "vencendo")
              .slice()
              .sort((a, b) => (parseDateBR(a.vencimento) || 0) - (parseDateBR(b.vencimento) || 0));
            return avisos.length === 0 ? (
              <div className="text-sm py-6 text-center" style={{ color: "#8A8D93" }}>
                Nenhuma conta a pagar vencendo ou vencida nos próximos 30 dias.
              </div>
            ) : (
              <div className="space-y-2.5">
                {avisos.map((c) => {
                  const cfg = statusPagarConfig[statusPagarDisplay(c)];
                  return (
                    <div
                      key={c.id}
                      onClick={() => setActiveTab("pagar")}
                      title="Ver em Contas a pagar"
                      className="flex items-center justify-between rounded-sm px-3 py-2.5 cursor-pointer"
                      style={{ background: "#FFFFFF", border: "1px solid #E4E0D6" }}
                    >
                      <div className="min-w-0 pr-2">
                        <div className="text-sm font-medium truncate" style={{ color: "#22252A" }}>
                          {c.fornecedor} · {c.parcela}
                        </div>
                        <div className="text-xs" style={{ color: "#8A8D93" }}>
                          {c.obra} · vence {c.vencimento}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span
                          className="text-[10px] uppercase tracking-wide font-semibold px-2 py-0.5 rounded-full"
                          style={{ color: cfg.color, background: cfg.bg }}
                        >
                          {cfg.label}
                        </span>
                        <span
                          className="text-[11px]"
                          style={{ color: "#8A8D93", fontFamily: "'IBM Plex Mono', monospace" }}
                        >
                          {formatBRLShort(c.valor)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </section>

        {/* Avisos de vencimento — valores a receber */}
        <section
          className="mt-5 rounded-md p-5 border"
          style={{ background: "#F5F3EC", borderColor: "#DCD7C9" }}
        >
          <h2
            onClick={() => setActiveTab("receber")}
            title="Ver todos em Valores a receber"
            className="text-sm uppercase tracking-[0.12em] font-semibold mb-4 cursor-pointer"
            style={{ color: "#22252A", fontFamily: "'Oswald', sans-serif" }}
          >
            Valores a receber — avisos de vencimento <span style={{ color: "#8A8D93", fontWeight: 400 }}>›</span>
          </h2>
          {loadingCV ? (
            <div className="text-sm py-6 text-center" style={{ color: "#8A8D93" }}>
              Carregando…
            </div>
          ) : (() => {
            const avisosReceber = valoresReceber
              .filter((v) => statusReceberDisplay(v) === "vencido" || statusReceberDisplay(v) === "vencendo")
              .slice()
              .sort((a, b) => (parseDateBR(a.vencimento) || 0) - (parseDateBR(b.vencimento) || 0));
            return avisosReceber.length === 0 ? (
              <div className="text-sm py-6 text-center" style={{ color: "#8A8D93" }}>
                Nenhum valor a receber vencendo ou vencido nos próximos 30 dias.
              </div>
            ) : (
              <div className="space-y-2.5">
                {avisosReceber.map((v) => {
                  const cfg = statusReceberConfig[statusReceberDisplay(v)];
                  return (
                    <div
                      key={v.id}
                      onClick={() => setActiveTab("receber")}
                      title="Ver em Valores a receber"
                      className="flex items-center justify-between rounded-sm px-3 py-2.5 cursor-pointer"
                      style={{ background: "#FFFFFF", border: "1px solid #E4E0D6" }}
                    >
                      <div className="min-w-0 pr-2">
                        <div className="text-sm font-medium truncate" style={{ color: "#22252A" }}>
                          {v.comprador} · {v.unidade} · {v.parcela}
                        </div>
                        <div className="text-xs" style={{ color: "#8A8D93" }}>
                          vence {v.vencimento}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span
                          className="text-[10px] uppercase tracking-wide font-semibold px-2 py-0.5 rounded-full"
                          style={{ color: cfg.color, background: cfg.bg }}
                        >
                          {cfg.label}
                        </span>
                        <span
                          className="text-[11px]"
                          style={{ color: "#8A8D93", fontFamily: "'IBM Plex Mono', monospace" }}
                        >
                          {formatBRLShort(v.valor)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </section>

        <p className="mt-6 text-xs" style={{ color: "#6B6F76" }}>
          Protótipo com dados fictícios — clique em uma obra para ver detalhes do orçamento. O fluxo de
          caixa detalhado ficou na aba própria "Fluxo de caixa".
        </p>
        </>
        )}

        {activeTab === "fluxocaixa" && (
          <>
            <div className="flex justify-end mb-4">
              <button
                onClick={() => {
                  setTipoRelatorio(null);
                  setModoRelatorio(true);
                }}
                className="text-xs font-semibold px-3 py-1.5 rounded-sm"
                style={{ fontFamily: "'Oswald', sans-serif", letterSpacing: "0.03em", color: "#F5F3EC", background: "#3D6E8C" }}
              >
                📄 GERAR RELATÓRIO
              </button>
            </div>

            <div className="flex flex-wrap gap-3 mb-6">
              <KpiCard
                eyebrow="Saldo em caixa (6 meses)"
                value={formatBRLShort(saldoCaixa)}
                sub={formatBRL(saldoCaixa)}
                accent={saldoCaixa >= 0 ? "#4F7A5B" : "#B23A2E"}
              />
              <KpiCard eyebrow="Total de entradas" value={formatBRLShort(totalEntradasFluxo)} sub={formatBRL(totalEntradasFluxo)} accent="#4F7A5B" />
              <KpiCard eyebrow="Total de saídas" value={formatBRLShort(totalSaidasFluxo)} sub={formatBRL(totalSaidasFluxo)} accent="#B23A2E" />
            </div>

            <section
              className="rounded-md p-5 border"
              style={{ background: "#F5F3EC", borderColor: "#DCD7C9" }}
            >
              <h2
                className="text-sm uppercase tracking-[0.12em] font-semibold mb-1"
                style={{ color: "#22252A", fontFamily: "'Oswald', sans-serif" }}
              >
                Planilha detalhada — mês a mês
              </h2>
              <p className="text-xs mb-4" style={{ color: "#8A8D93" }}>
                Calculado automaticamente: entradas somam as parcelas de valores a receber no mês de
                vencimento, mais os créditos do extrato bancário e os aportes de sócios; saídas somam as
                parcelas de contas a pagar no mês de vencimento, mais os débitos do extrato bancário e as
                devoluções a sócios.
              </p>
              {loadingCV || loadingNotas || loadingExtrato || loadingSocios ? (
                <div className="text-sm py-6 text-center" style={{ color: "#8A8D93" }}>
                  Carregando fluxo de caixa…
                </div>
              ) : fluxoCaixaDetalhado.length === 0 ? (
                <div className="text-sm py-6 text-center" style={{ color: "#8A8D93" }}>
                  Sem dados suficientes ainda — cadastre contratos de compra e venda, notas de compras,
                  lançamentos do extrato bancário ou empréstimos de sócios.
                </div>
              ) : (
                <>
                  <div className="hidden sm:grid grid-cols-[0.8fr_1fr_1fr_1fr_1fr] gap-3 px-3 pb-2 text-[11px] uppercase tracking-wide font-semibold" style={{ color: "#8A8D93" }}>
                    <span>Mês</span>
                    <span>Entradas</span>
                    <span>Saídas</span>
                    <span>Saldo do mês</span>
                    <span>Saldo acumulado</span>
                  </div>
                  <div className="space-y-1.5">
                    {fluxoCaixaDetalhado.map((f) => {
                      const expandido = !!mesesFluxoExpandidos[f.chave];
                      const detalhe = expandido
                        ? detalheFluxoMes(f.chave, valoresReceber, contasPagar, extrato, emprestimosSocios)
                        : null;
                      return (
                        <div key={f.mes} className="rounded-sm overflow-hidden" style={{ border: "1px solid #E4E0D6" }}>
                          <button
                            type="button"
                            onClick={() => toggleMesFluxoExpandido(f.chave)}
                            className="w-full text-left grid grid-cols-2 sm:grid-cols-[0.8fr_1fr_1fr_1fr_1fr] gap-2 sm:gap-3 items-center px-3 py-2.5 cursor-pointer"
                            style={{ background: "#FFFFFF" }}
                          >
                            <span className="text-sm font-semibold flex items-center gap-1.5" style={{ color: "#22252A" }}>
                              {f.mes}
                              <span className="text-xs" style={{ color: "#8A8D93" }}>{expandido ? "▲" : "▼"}</span>
                            </span>
                            <span className="text-sm" style={{ color: "#4F7A5B", fontFamily: "'IBM Plex Mono', monospace" }}>
                              {formatBRLShort(f.entradas)}
                            </span>
                            <span className="text-sm" style={{ color: "#B23A2E", fontFamily: "'IBM Plex Mono', monospace" }}>
                              {formatBRLShort(f.saidas)}
                            </span>
                            <span
                              className="text-sm font-semibold"
                              style={{ color: f.saldoMes >= 0 ? "#4F7A5B" : "#B23A2E", fontFamily: "'IBM Plex Mono', monospace" }}
                            >
                              {formatBRLShort(f.saldoMes)}
                            </span>
                            <span
                              className="text-sm font-semibold"
                              style={{ color: f.saldoAcumulado >= 0 ? "#22252A" : "#B23A2E", fontFamily: "'IBM Plex Mono', monospace" }}
                            >
                              {formatBRLShort(f.saldoAcumulado)}
                            </span>
                          </button>

                          {expandido && (
                            <div className="px-3 pt-2 pb-3" style={{ background: "#F5F3EC" }}>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                  <div className="text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: "#4F7A5B" }}>
                                    Entradas ({detalhe.entradas.length})
                                  </div>
                                  {detalhe.entradas.length === 0 ? (
                                    <div className="text-xs" style={{ color: "#8A8D93" }}>Nenhuma entrada neste mês.</div>
                                  ) : (
                                    <div className="space-y-1">
                                      {detalhe.entradas.map((item) => (
                                        <div
                                          key={item.id}
                                          className="flex items-center justify-between gap-2 rounded-sm px-2 py-1.5"
                                          style={{ background: "#FFFFFF", border: "1px solid #E4E0D6" }}
                                        >
                                          <div className="min-w-0 pr-2">
                                            <div className="text-xs truncate" style={{ color: "#22252A" }}>{item.descricao}</div>
                                            <div className="text-[11px]" style={{ color: "#8A8D93" }}>{item.origem} · {item.data}</div>
                                          </div>
                                          <span
                                            className="text-xs shrink-0"
                                            style={{ color: "#4F7A5B", fontFamily: "'IBM Plex Mono', monospace" }}
                                          >
                                            {formatBRLShort(item.valor)}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                                <div>
                                  <div className="text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: "#B23A2E" }}>
                                    Saídas ({detalhe.saidas.length})
                                  </div>
                                  {detalhe.saidas.length === 0 ? (
                                    <div className="text-xs" style={{ color: "#8A8D93" }}>Nenhuma saída neste mês.</div>
                                  ) : (
                                    <div className="space-y-1">
                                      {detalhe.saidas.map((item) => (
                                        <div
                                          key={item.id}
                                          className="flex items-center justify-between gap-2 rounded-sm px-2 py-1.5"
                                          style={{ background: "#FFFFFF", border: "1px solid #E4E0D6" }}
                                        >
                                          <div className="min-w-0 pr-2">
                                            <div className="text-xs truncate" style={{ color: "#22252A" }}>{item.descricao}</div>
                                            <div className="text-[11px]" style={{ color: "#8A8D93" }}>{item.origem} · {item.data}</div>
                                          </div>
                                          <span
                                            className="text-xs shrink-0"
                                            style={{ color: "#B23A2E", fontFamily: "'IBM Plex Mono', monospace" }}
                                          >
                                            {formatBRLShort(item.valor)}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                    <div
                      className="grid grid-cols-2 sm:grid-cols-[0.8fr_1fr_1fr_1fr_1fr] gap-2 sm:gap-3 items-center rounded-sm px-3 py-2.5 mt-1"
                      style={{ background: "#EFE9DA", border: "1px solid #C7BFA8" }}
                    >
                      <span className="text-sm font-semibold" style={{ color: "#22252A" }}>TOTAL</span>
                      <span className="text-sm font-semibold" style={{ color: "#22252A", fontFamily: "'IBM Plex Mono', monospace" }}>
                        {formatBRLShort(totalEntradasFluxo)}
                      </span>
                      <span className="text-sm font-semibold" style={{ color: "#22252A", fontFamily: "'IBM Plex Mono', monospace" }}>
                        {formatBRLShort(totalSaidasFluxo)}
                      </span>
                      <span
                        className="text-sm font-semibold"
                        style={{ color: saldoCaixa >= 0 ? "#4F7A5B" : "#B23A2E", fontFamily: "'IBM Plex Mono', monospace" }}
                      >
                        {formatBRLShort(saldoCaixa)}
                      </span>
                      <span className="text-sm font-semibold" style={{ color: "#22252A", fontFamily: "'IBM Plex Mono', monospace" }}>
                        {fluxoCaixaDetalhado.length > 0 ? formatBRLShort(fluxoCaixaDetalhado[fluxoCaixaDetalhado.length - 1].saldoAcumulado) : "—"}
                      </span>
                    </div>
                  </div>
                </>
              )}
            </section>

            <p className="mt-6 text-xs" style={{ color: "#6B6F76" }}>
              Clique num mês para ver quais lançamentos (valores a receber, contas a pagar, extrato
              bancário, empréstimos de sócios) compõem as entradas e saídas daquele mês. Os avisos de
              vencimento de contas a pagar e de contratos ficaram na Visão geral, no lugar deste gráfico.
            </p>
          </>
        )}

        {activeTab === "custos" && (
          <>
            <div className="flex justify-end mb-4">
              <button
                onClick={() => {
                  setTipoRelatorio(null);
                  setModoRelatorio(true);
                }}
                className="text-xs font-semibold px-3 py-1.5 rounded-sm"
                style={{ fontFamily: "'Oswald', sans-serif", letterSpacing: "0.03em", color: "#F5F3EC", background: "#3D6E8C" }}
              >
                📄 GERAR RELATÓRIO
              </button>
            </div>

            <div className="mb-4 flex items-center gap-2 flex-wrap">
              <label
                className="text-xs font-semibold uppercase tracking-wide"
                style={{ color: "#8A8D93", fontFamily: "'Oswald', sans-serif" }}
              >
                Obra:
              </label>
              <select
                value={obraCustoSelecionada}
                onChange={(e) => setObraCustoSelecionada(e.target.value)}
                className="text-sm px-3 py-1.5 rounded-sm outline-none"
                style={{ border: "1px solid #DCD7C9", color: "#22252A", background: "#FFFFFF" }}
              >
                {NOMES_OBRAS.map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-wrap gap-3 mb-6">
              <KpiCard eyebrow="Total orçado" value={formatBRLShort(totalGeralObraCusto.orcado)} sub={formatBRL(totalGeralObraCusto.orcado)} />
              <KpiCard
                eyebrow="Total gasto real"
                value={formatBRLShort(totalGeralObraCusto.gasto)}
                sub={totalGeralObraCusto.orcado ? `${Math.round((totalGeralObraCusto.pct || 0) * 100)}% do orçado` : "sem orçamento preenchido"}
                accent="#3D6E8C"
              />
              <KpiCard
                eyebrow="Saldo do orçamento"
                value={formatBRLShort(totalGeralObraCusto.saldo)}
                sub="orçado − gasto real"
                accent={totalGeralObraCusto.saldo >= 0 ? "#4F7A5B" : "#B23A2E"}
              />
            </div>

            {saveErrorCustos && (
              <div className="mb-4 text-xs px-3 py-2 rounded-sm" style={{ color: "#B23A2E", background: "#F8E3E0" }}>
                {saveErrorCustos}
              </div>
            )}

            <section
              className="mb-5 rounded-md p-5 border"
              style={{ background: "#F5F3EC", borderColor: "#DCD7C9" }}
            >
              <h2
                className="text-sm uppercase tracking-[0.12em] font-semibold mb-4"
                style={{ color: "#22252A", fontFamily: "'Oswald', sans-serif" }}
              >
                Resumo do orçamento por etapa
              </h2>

              {loadingCustos ? (
                <div className="text-sm py-6 text-center" style={{ color: "#8A8D93" }}>
                  Carregando…
                </div>
              ) : (
                <>
                  <div className="hidden sm:grid grid-cols-[1.8fr_1fr_1fr_0.8fr] gap-3 px-3 pb-2 text-[11px] uppercase tracking-wide font-semibold" style={{ color: "#8A8D93" }}>
                    <span>Etapa</span>
                    <span>Orçado</span>
                    <span>Gasto real</span>
                    <span>% Executado</span>
                  </div>
                  <div className="space-y-1.5">
                    {ETAPAS_CUSTO.map(({ etapa }) => {
                      const resumo = resumoCustoItens(itensObraCustoAtual.filter((it) => it.etapa === etapa));
                      return (
                        <div
                          key={etapa}
                          className="grid grid-cols-2 sm:grid-cols-[1.8fr_1fr_1fr_0.8fr] gap-2 sm:gap-3 items-center rounded-sm px-3 py-2"
                          style={{ background: "#FFFFFF", border: "1px solid #E4E0D6" }}
                        >
                          <span className="text-sm" style={{ color: "#22252A" }}>{etapa}</span>
                          <span className="text-sm" style={{ color: "#22252A", fontFamily: "'IBM Plex Mono', monospace" }}>{formatBRLShort(resumo.orcado)}</span>
                          <span className="text-sm" style={{ color: "#22252A", fontFamily: "'IBM Plex Mono', monospace" }}>{formatBRLShort(resumo.gasto)}</span>
                          <span className="text-xs font-semibold" style={{ color: resumo.pct === null ? "#8A8D93" : resumo.pct > 1 ? "#B23A2E" : resumo.pct > 0.9 ? "#B4590C" : "#4F7A5B" }}>
                            {resumo.pct !== null ? `${Math.round(resumo.pct * 100)}%` : "—"}
                          </span>
                        </div>
                      );
                    })}
                    <div
                      className="grid grid-cols-2 sm:grid-cols-[1.8fr_1fr_1fr_0.8fr] gap-2 sm:gap-3 items-center rounded-sm px-3 py-2.5 mt-1"
                      style={{ background: "#EFE9DA", border: "1px solid #C7BFA8" }}
                    >
                      <span className="text-sm font-semibold" style={{ color: "#22252A" }}>TOTAL GERAL DA OBRA</span>
                      <span className="text-sm font-semibold" style={{ color: "#22252A", fontFamily: "'IBM Plex Mono', monospace" }}>{formatBRLShort(totalGeralObraCusto.orcado)}</span>
                      <span className="text-sm font-semibold" style={{ color: "#22252A", fontFamily: "'IBM Plex Mono', monospace" }}>{formatBRLShort(totalGeralObraCusto.gasto)}</span>
                      <span className="text-xs font-semibold" style={{ color: "#22252A" }}>
                        {totalGeralObraCusto.pct !== null ? `${Math.round(totalGeralObraCusto.pct * 100)}%` : "—"}
                      </span>
                    </div>
                  </div>
                </>
              )}
            </section>

            <section
              className="rounded-md p-5 border"
              style={{ background: "#F5F3EC", borderColor: "#DCD7C9" }}
            >
              <h2
                className="text-sm uppercase tracking-[0.12em] font-semibold mb-1"
                style={{ color: "#22252A", fontFamily: "'Oswald', sans-serif" }}
              >
                Itens do orçamento
              </h2>
              <p className="text-xs mb-4" style={{ color: "#8A8D93" }}>
                Preencha Quantidade, Valor Unitário e Gasto Real — Orçado, Saldo e % Executado são
                calculados automaticamente. Mesmo modelo da planilha enviada. Itens com o ícone 🔗 têm o
                Gasto Real vindo de parcelas pagas vinculadas na aba Contas a pagar — não editável aqui.
                Use "+ Adicionar item" no final de cada etapa para incluir um custo que não está no
                modelo — o nome e a unidade desses itens extras também ficam editáveis.
              </p>

              {loadingCustos ? (
                <div className="text-sm py-6 text-center" style={{ color: "#8A8D93" }}>
                  Carregando…
                </div>
              ) : (
                <div className="space-y-3">
                  {ETAPAS_CUSTO.map(({ etapa }) => {
                    const itensEtapa = itensObraCustoAtual.filter((it) => it.etapa === etapa);
                    const resumo = resumoCustoItens(itensEtapa);
                    const colapsada = !!etapasCustoColapsadas[etapa];
                    return (
                      <div key={etapa} className="rounded-sm overflow-hidden" style={{ border: "1px solid #E4E0D6" }}>
                        <button
                          type="button"
                          onClick={() => toggleEtapaCustoColapsada(etapa)}
                          className="w-full text-left flex items-center justify-between px-3 py-2.5 flex-wrap gap-2"
                          style={{ background: "#EFE9DA" }}
                        >
                          <span className="text-sm font-semibold" style={{ color: "#22252A" }}>{etapa}</span>
                          <span className="text-xs flex items-center gap-3" style={{ color: "#6B6F76" }}>
                            <span style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
                              {formatBRLShort(resumo.gasto)} / {formatBRLShort(resumo.orcado)}
                            </span>
                            <span>{colapsada ? "▼ expandir" : "▲ recolher"}</span>
                          </span>
                        </button>

                        {!colapsada && (
                          <div className="p-3" style={{ background: "#FFFFFF" }}>
                            <div className="hidden sm:grid grid-cols-[1.7fr_0.4fr_0.6fr_0.8fr_0.8fr_0.8fr_0.8fr_0.5fr] gap-2 px-1 pb-1.5 text-[10px] uppercase tracking-wide font-semibold" style={{ color: "#8A8D93" }}>
                              <span>Item</span>
                              <span>Un.</span>
                              <span>Qtd</span>
                              <span>Vl. Unit.</span>
                              <span>Orçado</span>
                              <span>Gasto real</span>
                              <span>Saldo</span>
                              <span>% exec.</span>
                            </div>
                            <div className="space-y-1.5">
                              {itensEtapa.map((it) => {
                                const orcadoItem = custoOrcadoItem(it);
                                const saldoItem = custoSaldoItem(it);
                                const pctItem = custoPctItem(it);
                                return (
                                  <div
                                    key={it.id}
                                    className="grid grid-cols-2 sm:grid-cols-[1.7fr_0.4fr_0.6fr_0.8fr_0.8fr_0.8fr_0.8fr_0.5fr] gap-1.5 sm:gap-2 items-center rounded-sm px-1.5 py-1.5"
                                    style={{ borderBottom: "1px solid #F0EEE6" }}
                                  >
                                    <div className="flex flex-col gap-0.5">
                                      {it.extra ? (
                                        <div className="flex items-center gap-1">
                                          <input
                                            placeholder="Nome do item"
                                            value={it.item}
                                            onChange={(e) => handleUpdateCustoItemCampo(it.id, "item", e.target.value)}
                                            onBlur={handlePersistCustosBlur}
                                            className="text-sm px-1.5 py-1 rounded-sm outline-none flex-1 min-w-0"
                                            style={{ border: "1px solid #DCD7C9", color: "#22252A", width: "100%", minWidth: 0 }}
                                          />
                                          <button
                                            type="button"
                                            onClick={() => handleDeleteCustoItem(it.id)}
                                            title="Remover item"
                                            className="text-xs shrink-0 px-1"
                                            style={{ color: "#B23A2E" }}
                                          >
                                            ✕
                                          </button>
                                        </div>
                                      ) : (
                                        <span className="text-sm" style={{ color: "#22252A" }}>{it.item}</span>
                                      )}
                                      <input
                                        placeholder="Observações (opcional)"
                                        value={it.observacoes}
                                        onChange={(e) => handleUpdateCustoItemCampo(it.id, "observacoes", e.target.value)}
                                        onBlur={handlePersistCustosBlur}
                                        className="text-[11px] px-1.5 py-1 rounded-sm outline-none w-full"
                                        style={{ border: "1px solid #E4E0D6", color: "#8A8D93", minWidth: 0 }}
                                      />
                                    </div>
                                    {it.extra ? (
                                      <input
                                        placeholder="un."
                                        value={it.unidade}
                                        onChange={(e) => handleUpdateCustoItemCampo(it.id, "unidade", e.target.value)}
                                        onBlur={handlePersistCustosBlur}
                                        className="text-xs px-1 py-1 rounded-sm outline-none w-full"
                                        style={{ border: "1px solid #DCD7C9", color: "#22252A", width: "100%", minWidth: 0 }}
                                      />
                                    ) : (
                                      <span className="text-xs" style={{ color: "#6B6F76" }}>{it.unidade}</span>
                                    )}
                                    <input
                                      type="number"
                                      value={it.quantidade}
                                      onChange={(e) => handleUpdateCustoItemCampo(it.id, "quantidade", e.target.value)}
                                      onBlur={handlePersistCustosBlur}
                                      className="text-xs px-1.5 py-1 rounded-sm outline-none w-full"
                                      style={{ border: "1px solid #DCD7C9", color: "#22252A", minWidth: 0 }}
                                    />
                                    <input
                                      type="number"
                                      value={it.valorUnitario}
                                      onChange={(e) => handleUpdateCustoItemCampo(it.id, "valorUnitario", e.target.value)}
                                      onBlur={handlePersistCustosBlur}
                                      className="text-xs px-1.5 py-1 rounded-sm outline-none w-full"
                                      style={{ border: "1px solid #DCD7C9", color: "#22252A", minWidth: 0 }}
                                    />
                                    <span
                                      className="text-xs"
                                      style={{ color: "#22252A", fontFamily: "'IBM Plex Mono', monospace" }}
                                    >
                                      {orcadoItem !== null ? formatBRLShort(orcadoItem) : "—"}
                                    </span>
                                    {it.gastoRealVinculado ? (
                                      <span
                                        className="text-xs font-semibold"
                                        style={{ color: "#3D6E8C", fontFamily: "'IBM Plex Mono', monospace" }}
                                        title="Vinculado a parcelas pagas em Contas a pagar — não editável aqui"
                                      >
                                        🔗 {formatBRLShort(it.gastoReal)}
                                      </span>
                                    ) : (
                                      <input
                                        type="number"
                                        value={it.gastoReal}
                                        onChange={(e) => handleUpdateCustoItemCampo(it.id, "gastoReal", e.target.value)}
                                        onBlur={handlePersistCustosBlur}
                                        className="text-xs px-1.5 py-1 rounded-sm outline-none w-full"
                                        style={{ border: "1px solid #DCD7C9", color: "#22252A", minWidth: 0 }}
                                      />
                                    )}
                                    <span
                                      className="text-xs"
                                      style={{
                                        color: saldoItem !== null && saldoItem < 0 ? "#B23A2E" : "#22252A",
                                        fontFamily: "'IBM Plex Mono', monospace",
                                      }}
                                    >
                                      {saldoItem !== null ? formatBRLShort(saldoItem) : "—"}
                                    </span>
                                    <span
                                      className="text-xs font-semibold"
                                      style={{
                                        color:
                                          pctItem === null
                                            ? "#8A8D93"
                                            : pctItem > 1
                                            ? "#B23A2E"
                                            : pctItem > 0.9
                                            ? "#B4590C"
                                            : "#4F7A5B",
                                      }}
                                    >
                                      {pctItem !== null ? `${Math.round(pctItem * 100)}%` : "—"}
                                    </span>
                                  </div>
                                );
                              })}

                              <button
                                type="button"
                                onClick={() => handleAddCustoItemExtra(etapa)}
                                className="w-full text-left text-xs font-semibold px-1.5 py-2 rounded-sm mt-1"
                                style={{ color: "#3D6E8C", border: "1px dashed #C7BFA8", background: "#FBFAF6" }}
                              >
                                + Adicionar item
                              </button>

                              <div
                                className="grid grid-cols-2 sm:grid-cols-[1.7fr_0.4fr_0.6fr_0.8fr_0.8fr_0.8fr_0.8fr_0.5fr] gap-1.5 sm:gap-2 items-center rounded-sm px-1.5 py-2 mt-1"
                                style={{ background: "#F5F3EC" }}
                              >
                                <span className="text-xs font-semibold sm:col-span-4" style={{ color: "#22252A" }}>
                                  Subtotal — {etapa}
                                </span>
                                <span
                                  className="text-xs font-semibold hidden sm:block"
                                  style={{ color: "#22252A", fontFamily: "'IBM Plex Mono', monospace" }}
                                >
                                  {formatBRLShort(resumo.orcado)}
                                </span>
                                <span
                                  className="text-xs font-semibold"
                                  style={{ color: "#22252A", fontFamily: "'IBM Plex Mono', monospace" }}
                                >
                                  {formatBRLShort(resumo.gasto)}
                                </span>
                                <span
                                  className="text-xs font-semibold"
                                  style={{ color: "#22252A", fontFamily: "'IBM Plex Mono', monospace" }}
                                >
                                  {formatBRLShort(resumo.saldo)}
                                </span>
                                <span className="text-xs font-semibold" style={{ color: "#22252A" }}>
                                  {resumo.pct !== null ? `${Math.round(resumo.pct * 100)}%` : "—"}
                                </span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <p className="mt-6 text-xs" style={{ color: "#6B6F76" }}>
              O orçamento é por obra — troque no seletor do topo para ver ou preencher o de outra obra.
              Quantidade, Valor Unitário e Gasto Real ficam salvos automaticamente ao sair do campo.
            </p>
          </>
        )}

        {activeTab === "unidades" && (
          <>
            <div className="flex justify-end mb-4">
              <button
                onClick={() => {
                  setTipoRelatorio(null);
                  setModoRelatorio(true);
                }}
                className="text-xs font-semibold px-3 py-1.5 rounded-sm"
                style={{ fontFamily: "'Oswald', sans-serif", letterSpacing: "0.03em", color: "#F5F3EC", background: "#3D6E8C" }}
              >
                📄 GERAR RELATÓRIO
              </button>
            </div>

            <div className="flex flex-wrap gap-3 mb-4">
              <KpiCard eyebrow="VGV potencial" value={formatBRLShort(totalVGVPotencial)} sub={formatBRL(totalVGVPotencial)} />
              <KpiCard eyebrow="VGV vendido" value={formatBRLShort(totalVGVVendido)} sub={formatBRL(totalVGVVendido)} accent="#3D6E8C" />
              <KpiCard eyebrow="Disponíveis" value={`${unidadesDisponiveis}`} sub="prontas para vender" accent="#4F7A5B" />
              <KpiCard eyebrow="Reservadas" value={`${unidadesReservadas}`} sub="aguardando fechamento" accent="#B4590C" />
              <KpiCard eyebrow="Vendidas" value={`${unidadesVendidas}`} sub="com contrato" accent="#3D6E8C" />
            </div>

            <div className="mb-4 flex items-center gap-2 flex-wrap">
              <label
                className="text-xs font-semibold uppercase tracking-wide"
                style={{ color: "#8A8D93", fontFamily: "'Oswald', sans-serif" }}
              >
                Filtrar por obra:
              </label>
              <select
                value={filtroObraUnidades}
                onChange={(e) => setFiltroObraUnidades(e.target.value)}
                className="text-sm px-3 py-1.5 rounded-sm outline-none"
                style={{ border: "1px solid #DCD7C9", color: "#22252A", background: "#FFFFFF" }}
              >
                <option value="">Todas as obras</option>
                {NOMES_OBRAS.map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
              <label
                className="text-xs font-semibold uppercase tracking-wide ml-2"
                style={{ color: "#8A8D93", fontFamily: "'Oswald', sans-serif" }}
              >
                Status:
              </label>
              <select
                value={filtroStatusUnidades}
                onChange={(e) => setFiltroStatusUnidades(e.target.value)}
                className="text-sm px-3 py-1.5 rounded-sm outline-none"
                style={{ border: "1px solid #DCD7C9", color: "#22252A", background: "#FFFFFF" }}
              >
                <option value="">Todos</option>
                <option value="disponivel">Disponível</option>
                <option value="reservada">Reservada</option>
                <option value="vendida">Vendida</option>
              </select>
            </div>

            <section
              className="rounded-md p-5 border"
              style={{ background: "#F5F3EC", borderColor: "#DCD7C9" }}
            >
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <h2
                  className="text-sm uppercase tracking-[0.12em] font-semibold"
                  style={{ color: "#22252A", fontFamily: "'Oswald', sans-serif" }}
                >
                  Unidades e tabela de vendas
                </h2>
                <button
                  onClick={() => setShowFormUnidade((s) => !s)}
                  className="text-xs font-semibold px-3 py-1.5 rounded-sm"
                  style={{
                    fontFamily: "'Oswald', sans-serif",
                    letterSpacing: "0.03em",
                    color: "#F5F3EC",
                    background: "#3D6E8C",
                  }}
                >
                  {showFormUnidade ? "CANCELAR" : "+ NOVA UNIDADE"}
                </button>
              </div>

              {saveErrorUnidades && (
                <div className="mb-3 text-xs px-3 py-2 rounded-sm" style={{ color: "#B23A2E", background: "#F8E3E0" }}>
                  {saveErrorUnidades}
                </div>
              )}

              {showFormUnidade && (
                <form
                  onSubmit={handleAddUnidade}
                  className="mb-5 p-4 rounded-sm grid grid-cols-1 sm:grid-cols-3 gap-3"
                  style={{ background: "#FFFFFF", border: "1px solid #E4E0D6" }}
                >
                  <select
                    value={formUnidade.obra}
                    onChange={(e) => setFormUnidade({ ...formUnidade, obra: e.target.value })}
                    className="text-sm px-3 py-2 rounded-sm outline-none"
                    style={{ border: "1px solid #DCD7C9", color: "#22252A", width: "100%", minWidth: 0 }}
                  >
                    {NOMES_OBRAS.map((o) => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </select>
                  <input
                    required
                    placeholder="Unidade (ex: Unidade 703)"
                    value={formUnidade.unidade}
                    onChange={(e) => setFormUnidade({ ...formUnidade, unidade: e.target.value })}
                    className="text-sm px-3 py-2 rounded-sm outline-none"
                    style={{ border: "1px solid #DCD7C9", color: "#22252A", width: "100%", minWidth: 0 }}
                  />
                  <input
                    placeholder="Andar (ex: 7º)"
                    value={formUnidade.andar}
                    onChange={(e) => setFormUnidade({ ...formUnidade, andar: e.target.value })}
                    className="text-sm px-3 py-2 rounded-sm outline-none"
                    style={{ border: "1px solid #DCD7C9", color: "#22252A", width: "100%", minWidth: 0 }}
                  />
                  <input
                    placeholder="Tipo (ex: 3 quartos, Cobertura)"
                    value={formUnidade.tipo}
                    onChange={(e) => setFormUnidade({ ...formUnidade, tipo: e.target.value })}
                    className="text-sm px-3 py-2 rounded-sm outline-none"
                    style={{ border: "1px solid #DCD7C9", color: "#22252A", width: "100%", minWidth: 0 }}
                  />
                  <input
                    type="number"
                    placeholder="Metragem (m²)"
                    value={formUnidade.metragem}
                    onChange={(e) => setFormUnidade({ ...formUnidade, metragem: e.target.value })}
                    className="text-sm px-3 py-2 rounded-sm outline-none"
                    style={{ border: "1px solid #DCD7C9", color: "#22252A", width: "100%", minWidth: 0 }}
                  />
                  <input
                    required
                    type="number"
                    placeholder="Valor de venda (R$)"
                    value={formUnidade.valorVenda}
                    onChange={(e) => setFormUnidade({ ...formUnidade, valorVenda: e.target.value })}
                    className="text-sm px-3 py-2 rounded-sm outline-none"
                    style={{ border: "1px solid #DCD7C9", color: "#22252A", width: "100%", minWidth: 0 }}
                  />
                  <input
                    placeholder="Observações (opcional)"
                    value={formUnidade.observacoes}
                    onChange={(e) => setFormUnidade({ ...formUnidade, observacoes: e.target.value })}
                    className="sm:col-span-3 text-sm px-3 py-2 rounded-sm outline-none"
                    style={{ border: "1px solid #DCD7C9", color: "#22252A", width: "100%", minWidth: 0 }}
                  />

                  <button
                    type="submit"
                    className="sm:col-span-3 text-xs font-semibold px-3 py-2.5 rounded-sm"
                    style={{
                      fontFamily: "'Oswald', sans-serif",
                      letterSpacing: "0.03em",
                      color: "#F5F3EC",
                      background: "#E1590C",
                    }}
                  >
                    SALVAR UNIDADE
                  </button>
                </form>
              )}

              {loadingUnidades ? (
                <div className="text-sm py-6 text-center" style={{ color: "#8A8D93" }}>
                  Carregando unidades…
                </div>
              ) : unidadesFiltradas.length === 0 ? (
                <div className="text-sm py-6 text-center" style={{ color: "#8A8D93" }}>
                  Nenhuma unidade cadastrada para esse filtro ainda.
                </div>
              ) : (
                <>
                  <div className="hidden sm:grid grid-cols-[1fr_0.6fr_1fr_0.8fr_1fr_1fr_1.6fr_auto] gap-3 px-3 pb-2 text-[11px] uppercase tracking-wide font-semibold" style={{ color: "#8A8D93" }}>
                    <span>Unidade</span>
                    <span>Andar</span>
                    <span>Tipo</span>
                    <span>Metragem</span>
                    <span>Valor de venda</span>
                    <span>Status</span>
                    <span>Comprador</span>
                    <span></span>
                  </div>

                  <div className="space-y-2">
                    {unidadesFiltradas
                      .slice()
                      .sort((a, b) => a.unidade.localeCompare(b.unidade, "pt-BR", { numeric: true }))
                      .map((u) => {
                        const cfg = statusUnidadeConfig[u.statusEfetivo];
                        const editando = editandoUnidadeId === u.id;
                        return (
                          <div
                            key={u.id}
                            className="grid grid-cols-2 sm:grid-cols-[1fr_0.6fr_1fr_0.8fr_1fr_1fr_1.6fr_auto] gap-2 sm:gap-3 items-center rounded-sm px-3 py-3"
                            style={{ background: "#FFFFFF", border: "1px solid #E4E0D6" }}
                          >
                            {editando ? (
                              <>
                                <input
                                  value={u.unidade}
                                  onChange={(e) => handleUpdateUnidadeCampo(u.id, "unidade", e.target.value)}
                                  onBlur={handlePersistUnidadesBlur}
                                  className="text-sm font-semibold px-2 py-1.5 rounded-sm outline-none"
                                  style={{ border: "1px solid #DCD7C9", color: "#22252A", minWidth: 0, width: "100%" }}
                                />
                                <input
                                  value={u.andar}
                                  onChange={(e) => handleUpdateUnidadeCampo(u.id, "andar", e.target.value)}
                                  onBlur={handlePersistUnidadesBlur}
                                  className="text-xs px-2 py-1.5 rounded-sm outline-none"
                                  style={{ border: "1px solid #DCD7C9", color: "#22252A", minWidth: 0, width: "100%" }}
                                />
                                <input
                                  value={u.tipo}
                                  onChange={(e) => handleUpdateUnidadeCampo(u.id, "tipo", e.target.value)}
                                  onBlur={handlePersistUnidadesBlur}
                                  className="text-xs px-2 py-1.5 rounded-sm outline-none"
                                  style={{ border: "1px solid #DCD7C9", color: "#22252A", minWidth: 0, width: "100%" }}
                                />
                                <input
                                  type="number"
                                  value={u.metragem}
                                  onChange={(e) => handleUpdateUnidadeCampo(u.id, "metragem", Number(e.target.value) || 0)}
                                  onBlur={handlePersistUnidadesBlur}
                                  className="text-xs px-2 py-1.5 rounded-sm outline-none"
                                  style={{ border: "1px solid #DCD7C9", color: "#22252A", fontFamily: "'IBM Plex Mono', monospace", minWidth: 0, width: "100%" }}
                                />
                                <input
                                  type="number"
                                  value={u.valorVenda}
                                  onChange={(e) => handleUpdateUnidadeCampo(u.id, "valorVenda", Number(e.target.value) || 0)}
                                  onBlur={handlePersistUnidadesBlur}
                                  className="text-xs px-2 py-1.5 rounded-sm outline-none"
                                  style={{ border: "1px solid #DCD7C9", color: "#22252A", minWidth: 0, width: "100%" }}
                                />
                              </>
                            ) : (
                              <>
                                <span className="text-sm font-semibold truncate min-w-0" style={{ color: "#22252A" }}>{u.unidade}</span>
                                <span className="text-xs truncate min-w-0" style={{ color: "#6B6F76" }}>{u.andar || "—"}</span>
                                <span className="text-xs truncate min-w-0" style={{ color: "#6B6F76" }}>{u.tipo || "—"}</span>
                                <span className="text-xs" style={{ color: "#6B6F76", fontFamily: "'IBM Plex Mono', monospace" }}>
                                  {u.metragem ? `${u.metragem} m²` : "—"}
                                </span>
                                <span className="text-xs font-semibold" style={{ color: "#22252A", fontFamily: "'IBM Plex Mono', monospace" }}>
                                  {formatBRLShort(u.valorVenda)}
                                </span>
                              </>
                            )}
                            <span
                              className="text-[10px] uppercase tracking-wide font-semibold px-2 py-1 rounded-full text-center w-fit"
                              style={{ color: cfg.color, background: cfg.bg }}
                            >
                              {cfg.label}
                            </span>
                            <span className="text-xs min-w-0" style={{ color: "#6B6F76" }}>
                              {u.contratoVinculado ? u.contratoVinculado.comprador : "—"}
                            </span>
                            <div className="flex items-center gap-3 flex-wrap">
                              {editando ? (
                                <button
                                  onClick={() => {
                                    handlePersistUnidadesBlur();
                                    setEditandoUnidadeId(null);
                                  }}
                                  className="text-xs w-fit font-semibold"
                                  style={{ color: "#3D6E8C" }}
                                >
                                  Concluir
                                </button>
                              ) : (
                                <>
                                  <button
                                    onClick={() => setEditandoUnidadeId(u.id)}
                                    className="text-xs w-fit font-semibold"
                                    style={{ color: "#3D6E8C" }}
                                  >
                                    Editar
                                  </button>
                                  {u.statusEfetivo !== "vendida" && (
                                    <button
                                      onClick={() => handleToggleStatusManualUnidade(u.id)}
                                      className="text-xs w-fit font-semibold"
                                      style={{ color: u.statusManual === "reservada" ? "#4F7A5B" : "#B4590C" }}
                                    >
                                      {u.statusManual === "reservada" ? "Disponibilizar" : "Reservar"}
                                    </button>
                                  )}
                                  <button
                                    onClick={() => handleDeleteUnidade(u.id)}
                                    className="text-xs w-fit"
                                    style={{ color: "#B23A2E" }}
                                    title="Excluir unidade"
                                  >
                                    Excluir
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </>
              )}
            </section>

            <p className="mt-6 text-xs" style={{ color: "#6B6F76" }}>
              O status "Vendida" é automático: quando existe um contrato em Contratos de compra e venda com
              o mesmo nome de unidade, ela aparece aqui como vendida (com o comprador do contrato) — não
              precisa marcar na mão. Para vender uma unidade, cadastre o contrato na outra aba usando o
              mesmo nome de unidade que está aqui.
            </p>
          </>
        )}

        {activeTab === "cv" && (
          <>
            <div className="flex justify-end mb-4">
              <button
                onClick={() => {
                  setTipoRelatorio(null);
                  setModoRelatorio(true);
                }}
                className="text-xs font-semibold px-3 py-1.5 rounded-sm"
                style={{ fontFamily: "'Oswald', sans-serif", letterSpacing: "0.03em", color: "#F5F3EC", background: "#3D6E8C" }}
              >
                📄 GERAR RELATÓRIO
              </button>
            </div>

            {/* KPI row — compra e venda */}
            <div className="flex flex-wrap gap-3 mb-8">
              <KpiCard eyebrow="VGV total" value={formatBRLShort(totalVGV)} sub={formatBRL(totalVGV)} />
              <KpiCard
                eyebrow="Recebido até agora"
                value={formatBRLShort(totalRecebidoCV)}
                sub={totalVGV > 0 ? `${Math.round((totalRecebidoCV / totalVGV) * 100)}% do VGV` : "—"}
                accent="#3D6E8C"
              />
              <KpiCard eyebrow="Unidades vendidas" value={`${contratosCV.length}`} sub="Isla Catalina" />
              <KpiCard
                eyebrow="Pagamentos atrasados"
                value={`${unidadesAtrasadas}`}
                sub="unidades com atraso"
                accent={unidadesAtrasadas > 0 ? "#B23A2E" : "#22252A"}
              />
            </div>

            <section
              className="rounded-md p-5 border"
              style={{ background: "#F5F3EC", borderColor: "#DCD7C9" }}
            >
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <h2
                  className="text-sm uppercase tracking-[0.12em] font-semibold"
                  style={{ color: "#22252A", fontFamily: "'Oswald', sans-serif" }}
                >
                  Contratos de compra e venda
                </h2>
                <button
                  onClick={() => setShowForm((s) => !s)}
                  className="text-xs font-semibold px-3 py-1.5 rounded-sm"
                  style={{
                    fontFamily: "'Oswald', sans-serif",
                    letterSpacing: "0.03em",
                    color: "#F5F3EC",
                    background: "#3D6E8C",
                  }}
                >
                  {showForm ? "CANCELAR" : "+ NOVO CONTRATO"}
                </button>
              </div>

              {saveError && (
                <div className="mb-3 text-xs px-3 py-2 rounded-sm" style={{ color: "#B23A2E", background: "#F8E3E0" }}>
                  {saveError}
                </div>
              )}

              {showForm && (
                <form
                  onSubmit={handleAddContrato}
                  className="mb-5 p-4 rounded-sm grid grid-cols-1 sm:grid-cols-3 gap-3"
                  style={{ background: "#FFFFFF", border: "1px solid #E4E0D6" }}
                >
                  <div className="sm:col-span-3 flex items-center gap-3 flex-wrap">
                    <label
                      className="text-xs font-semibold px-3 py-1.5 rounded-sm cursor-pointer"
                      style={{
                        fontFamily: "'Oswald', sans-serif",
                        letterSpacing: "0.03em",
                        color: "#22252A",
                        background: "#E4E0D6",
                      }}
                    >
                      {pdfImporting ? "LENDO PDF…" : "📄 IMPORTAR PDF"}
                      <input
                        type="file"
                        accept="application/pdf"
                        onChange={handlePdfImport}
                        disabled={pdfImporting}
                        className="hidden"
                      />
                    </label>
                    <span className="text-xs" style={{ color: "#8A8D93" }}>
                      Extração automática por padrão de texto — confira os campos antes de salvar.
                    </span>
                  </div>

                  {pdfImportError && (
                    <div className="sm:col-span-3 text-xs px-3 py-2 rounded-sm" style={{ color: "#B23A2E", background: "#F8E3E0" }}>
                      {pdfImportError}
                    </div>
                  )}
                  {pdfImportedFields.length > 0 && (
                    <div className="sm:col-span-3 text-xs px-3 py-2 rounded-sm" style={{ color: "#4F7A5B", background: "#E8EEE8" }}>
                      Preenchido automaticamente: {pdfImportedFields.join(", ")}. Revise os demais campos.
                    </div>
                  )}

                  <input
                    required
                    placeholder="Unidade (ex: Unidade 610)"
                    value={form.unidade}
                    onChange={(e) => setForm({ ...form, unidade: e.target.value })}
                    className="text-sm px-3 py-2 rounded-sm outline-none"
                    style={{ border: "1px solid #DCD7C9", color: "#22252A", width: "100%", minWidth: 0 }}
                  />
                  <input
                    required
                    placeholder="Comprador"
                    value={form.comprador}
                    onChange={(e) => setForm({ ...form, comprador: e.target.value })}
                    className="text-sm px-3 py-2 rounded-sm outline-none"
                    style={{ border: "1px solid #DCD7C9", color: "#22252A", width: "100%", minWidth: 0 }}
                  />
                  <input
                    required
                    type="number"
                    placeholder="Valor (R$)"
                    value={form.valor}
                    onChange={(e) => setForm({ ...form, valor: e.target.value })}
                    className="text-sm px-3 py-2 rounded-sm outline-none"
                    style={{ border: "1px solid #DCD7C9", color: "#22252A", width: "100%", minWidth: 0 }}
                  />
                  <input
                    type="number"
                    min="0"
                    max="100"
                    placeholder="% pago"
                    value={form.percentualPago}
                    onChange={(e) => setForm({ ...form, percentualPago: e.target.value })}
                    className="text-sm px-3 py-2 rounded-sm outline-none"
                    style={{ border: "1px solid #DCD7C9", color: "#22252A", width: "100%", minWidth: 0 }}
                  />
                  <input
                    type="date"
                    title="Data de assinatura"
                    value={dataBRparaISO(form.dataAssinatura)}
                    onChange={(e) => setForm({ ...form, dataAssinatura: dataISOparaBR(e.target.value) })}
                    className="text-sm px-3 py-2 rounded-sm outline-none"
                    style={{ border: "1px solid #DCD7C9", color: "#22252A", width: "100%", minWidth: 0 }}
                  />
                  <select
                    value={form.statusPagamento}
                    onChange={(e) => setForm({ ...form, statusPagamento: e.target.value })}
                    className="text-sm px-3 py-2 rounded-sm outline-none"
                    style={{ border: "1px solid #DCD7C9", color: "#22252A", width: "100%", minWidth: 0 }}
                  >
                    <option value="em_dia">Em dia</option>
                    <option value="quitado">Quitado</option>
                    <option value="atrasado">Atrasado</option>
                  </select>
                  <input
                    type="number"
                    min="1"
                    max="60"
                    placeholder="Nº de parcelas a receber"
                    value={form.numeroParcelas}
                    onChange={(e) => {
                      setForm({ ...form, numeroParcelas: e.target.value });
                      if (personalizarParcelasCV) setPersonalizarParcelasCV(false);
                    }}
                    className="text-sm px-3 py-2 rounded-sm outline-none"
                    style={{ border: "1px solid #DCD7C9", color: "#22252A", width: "100%", minWidth: 0 }}
                  />
                  <button
                    type="button"
                    onClick={
                      personalizarParcelasCV
                        ? () => setPersonalizarParcelasCV(false)
                        : handleAtivarPersonalizarParcelasCV
                    }
                    className="text-xs font-semibold px-3 py-2 rounded-sm"
                    style={{
                      border: "1px solid #DCD7C9",
                      color: personalizarParcelasCV ? "#B23A2E" : "#3D6E8C",
                      background: "#FFFFFF",
                    }}
                  >
                    {personalizarParcelasCV ? "Usar divisão igual" : "Personalizar valores e datas das parcelas"}
                  </button>

                  {personalizarParcelasCV && (
                    <div
                      className="sm:col-span-3 grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-sm"
                      style={{ background: "#FFFFFF", border: "1px solid #E4E0D6" }}
                    >
                      {valoresParcelasCV.map((v, i) => (
                        <div key={i} className="grid grid-cols-2 gap-2">
                          <label className="text-xs flex flex-col gap-1" style={{ color: "#8A8D93" }}>
                            Parcela {i + 1} — valor
                            <input
                              type="number"
                              value={v}
                              onChange={(e) => handleAtualizarValorParcelaCV(i, e.target.value)}
                              className="text-sm px-2 py-1.5 rounded-sm outline-none"
                              style={{ border: "1px solid #DCD7C9", color: "#22252A", width: "100%", minWidth: 0 }}
                            />
                          </label>
                          <label className="text-xs flex flex-col gap-1" style={{ color: "#8A8D93" }}>
                            Data a receber
                            <input
                              type="date"
                              value={dataBRparaISO(datasParcelasCV[i] || "")}
                              onChange={(e) => handleAtualizarDataParcelaCV(i, dataISOparaBR(e.target.value))}
                              className="text-sm px-2 py-1.5 rounded-sm outline-none"
                              style={{ border: "1px solid #DCD7C9", color: "#22252A", width: "100%", minWidth: 0 }}
                            />
                          </label>
                        </div>
                      ))}
                      <div className="col-span-full text-xs" style={{ color: "#8A8D93" }}>
                        Soma das parcelas: {formatBRLShort(valoresParcelasCV.reduce((s, v) => s + (Number(v) || 0), 0))}
                        {" "}— valor do contrato: {formatBRLShort(Number(form.valor) || 0)}
                      </div>
                    </div>
                  )}

                  <div className="sm:col-span-2 text-xs flex items-center" style={{ color: "#8A8D93" }}>
                    As parcelas são lançadas automaticamente em Valores a receber.
                  </div>
                  <button
                    type="submit"
                    className="sm:col-span-3 text-xs font-semibold px-3 py-2.5 rounded-sm"
                    style={{
                      fontFamily: "'Oswald', sans-serif",
                      letterSpacing: "0.03em",
                      color: "#F5F3EC",
                      background: "#E1590C",
                    }}
                  >
                    SALVAR CONTRATO
                  </button>
                </form>
              )}

              {loadingCV ? (
                <div className="text-sm py-6 text-center" style={{ color: "#8A8D93" }}>
                  Carregando contratos…
                </div>
              ) : contratosCV.length === 0 ? (
                <div className="text-sm py-6 text-center" style={{ color: "#8A8D93" }}>
                  Nenhum contrato cadastrado ainda.
                </div>
              ) : (
                <>
                  <div className="hidden sm:grid grid-cols-[1.2fr_1.8fr_1fr_1.3fr_0.8fr_0.8fr_auto] gap-3 px-3 pb-2 text-[11px] uppercase tracking-wide font-semibold" style={{ color: "#8A8D93" }}>
                    <span>Unidade</span>
                    <span>Comprador</span>
                    <span>Valor</span>
                    <span>Pago</span>
                    <span>Assinatura</span>
                    <span>Status</span>
                    <span></span>
                  </div>

                  <div className="space-y-2">
                    {contratosCV.map((c) => {
                      const cfg = statusPagamentoConfig[c.statusPagamento];
                      return (
                        <div
                          key={c.id}
                          className="grid grid-cols-2 sm:grid-cols-[1.2fr_1.8fr_1fr_1.3fr_0.8fr_0.8fr_auto] gap-2 sm:gap-3 items-center rounded-sm px-3 py-3"
                          style={{ background: "#FFFFFF", border: "1px solid #E4E0D6" }}
                        >
                          <span className="text-sm font-semibold truncate min-w-0" title={c.unidade} style={{ color: "#22252A" }}>{c.unidade}</span>
                          <span className="text-sm min-w-0" style={{ color: "#22252A" }}>{c.comprador}</span>
                          <span
                            className="text-sm"
                            style={{ color: "#22252A", fontFamily: "'IBM Plex Mono', monospace" }}
                          >
                            {formatBRLShort(c.valor)}
                          </span>
                          <div className="col-span-2 sm:col-span-1">
                            <RulerBar
                              pct={c.percentualPago}
                              colorFrom={c.statusPagamento === "atrasado" ? "#B23A2E" : "#3D6E8C"}
                            />
                          </div>
                          <span
                            className="text-xs"
                            style={{ color: "#6B6F76", fontFamily: "'IBM Plex Mono', monospace" }}
                          >
                            {c.dataAssinatura}
                          </span>
                          <span
                            className="text-[10px] uppercase tracking-wide font-semibold px-2 py-1 rounded-full text-center w-fit"
                            style={{ color: cfg.color, background: cfg.bg }}
                          >
                            {cfg.label}
                          </span>
                          <button
                            onClick={() => handleDeleteContrato(c.id)}
                            className="text-xs w-fit"
                            style={{ color: "#B23A2E" }}
                            title="Excluir contrato"
                          >
                            Excluir
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </section>

            <p className="mt-6 text-xs" style={{ color: "#6B6F76" }}>
              Os contratos ficam salvos automaticamente e visíveis só para você ao reabrir este painel.
            </p>
          </>
        )}

        {activeTab === "receber" && (
          <>
            <div className="flex justify-end mb-4">
              <button
                onClick={() => {
                  setTipoRelatorio(null);
                  setModoRelatorio(true);
                }}
                className="text-xs font-semibold px-3 py-1.5 rounded-sm"
                style={{ fontFamily: "'Oswald', sans-serif", letterSpacing: "0.03em", color: "#F5F3EC", background: "#3D6E8C" }}
              >
                📄 GERAR RELATÓRIO
              </button>
            </div>

            <div className="flex flex-wrap gap-3 mb-8">
              <KpiCard eyebrow="Total a receber" value={formatBRLShort(totalAReceber)} sub={formatBRL(totalAReceber)} accent="#B4590C" />
              <KpiCard eyebrow="Total recebido" value={formatBRLShort(totalRecebidoParcelas)} sub={formatBRL(totalRecebidoParcelas)} accent="#4F7A5B" />
              <KpiCard
                eyebrow="Parcelas vencidas"
                value={`${parcelasReceberVencidas}`}
                sub="precisam de atenção"
                accent={parcelasReceberVencidas > 0 ? "#B23A2E" : "#22252A"}
              />
              <KpiCard eyebrow="Parcelas cadastradas" value={`${valoresReceber.length}`} sub="no total" />
            </div>

            <section
              className="rounded-md p-5 border"
              style={{ background: "#F5F3EC", borderColor: "#DCD7C9" }}
            >
              <h2
                className="text-sm uppercase tracking-[0.12em] font-semibold mb-1"
                style={{ color: "#22252A", fontFamily: "'Oswald', sans-serif" }}
              >
                Valores a receber
              </h2>
              <p className="text-xs mb-4" style={{ color: "#8A8D93" }}>
                Uma linha por parcela pendente ou vencida, ordenada por data de vencimento.
              </p>

              {loadingCV ? (
                <div className="text-sm py-6 text-center" style={{ color: "#8A8D93" }}>
                  Carregando parcelas…
                </div>
              ) : (() => {
                const parcelasPendentes = valoresReceber
                  .filter((v) => statusReceberDisplay(v) !== "pago")
                  .slice()
                  .sort((a, b) => (parseDateBR(a.vencimento) || 0) - (parseDateBR(b.vencimento) || 0));
                return parcelasPendentes.length === 0 ? (
                  <div className="text-sm py-6 text-center" style={{ color: "#8A8D93" }}>
                    Nenhuma parcela a receber pendente. Cadastre um contrato de compra e venda para gerar parcelas.
                  </div>
                ) : (
                  <>
                    <div className="hidden sm:grid grid-cols-[1.6fr_0.8fr_0.5fr_0.7fr_0.5fr_0.5fr_0.75fr_0.8fr_0.75fr_auto] gap-2 px-3 pb-2 text-[11px] uppercase tracking-wide font-semibold" style={{ color: "#8A8D93" }}>
                      <span>Cliente</span>
                      <span>Unidade</span>
                      <span>Parcela</span>
                      <span>Valor</span>
                      <span>Juros</span>
                      <span>Multa</span>
                      <span>Atualizado</span>
                      <span>Data a receber</span>
                      <span>Status</span>
                      <span></span>
                    </div>
                    <div className="space-y-2">
                      {parcelasPendentes.map((v) => {
                        const display = statusReceberDisplay(v);
                        const cfg = statusReceberConfig[display];
                        return (
                          <div
                            key={v.id}
                            className="grid grid-cols-2 sm:grid-cols-[1.6fr_0.8fr_0.5fr_0.7fr_0.5fr_0.5fr_0.75fr_0.8fr_0.75fr_auto] gap-2 items-center rounded-sm px-3 py-3"
                            style={{ background: "#FFFFFF", border: "1px solid #E4E0D6" }}
                          >
                            <span className="text-sm font-semibold min-w-0" style={{ color: "#22252A" }}>
                              {v.comprador}
                            </span>
                            <span className="text-sm" style={{ color: "#22252A" }}>{v.unidade}</span>
                            <span
                              className="text-xs"
                              style={{ color: "#6B6F76", fontFamily: "'IBM Plex Mono', monospace" }}
                            >
                              {v.parcela}
                            </span>
                            <span
                              className="text-sm font-semibold"
                              style={{ color: "#22252A", fontFamily: "'IBM Plex Mono', monospace" }}
                            >
                              {formatBRLShort(v.valor)}
                            </span>
                            <input
                              type="number"
                              placeholder="0"
                              value={v.juros || ""}
                              onChange={(e) => handleUpdateParcelaReceberCampo(v.id, "juros", Number(e.target.value) || 0)}
                              onBlur={handlePersistValoresReceberBlur}
                              className="text-xs px-2 py-1.5 rounded-sm outline-none"
                              style={{ border: "1px solid #DCD7C9", color: "#22252A", width: "100%", minWidth: 0 }}
                              title="Juros recebidos além do valor original (opcional)"
                            />
                            <input
                              type="number"
                              placeholder="0"
                              value={v.multa || ""}
                              onChange={(e) => handleUpdateParcelaReceberCampo(v.id, "multa", Number(e.target.value) || 0)}
                              onBlur={handlePersistValoresReceberBlur}
                              className="text-xs px-2 py-1.5 rounded-sm outline-none"
                              style={{ border: "1px solid #DCD7C9", color: "#22252A", width: "100%", minWidth: 0 }}
                              title="Multa recebida além do valor original (opcional)"
                            />
                            <span
                              className="text-xs font-semibold"
                              style={{ color: "#4F7A5B", fontFamily: "'IBM Plex Mono', monospace" }}
                              title="Valor original + juros + multa"
                            >
                              {formatBRLShort(valorAtualizadoItem(v))}
                            </span>
                            <span
                              className="text-sm"
                              style={{ color: "#6B6F76", fontFamily: "'IBM Plex Mono', monospace" }}
                            >
                              {v.vencimento}
                            </span>
                            <span
                              className="text-[10px] uppercase tracking-wide font-semibold px-2 py-1 rounded-full text-center w-fit"
                              style={{ color: cfg.color, background: cfg.bg }}
                            >
                              {cfg.label}
                            </span>
                            <button
                              onClick={() => handleToggleParcelaRecebida(v.id)}
                              className="text-xs w-fit font-semibold"
                              style={{ color: "#4F7A5B" }}
                            >
                              Marcar recebido
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </>
                );
              })()}
            </section>

            <p className="mt-6 text-xs" style={{ color: "#6B6F76" }}>
              As parcelas são geradas automaticamente a partir do número de parcelas de cada contrato de
              compra e venda. Marcar uma parcela como recebida aqui não altera o campo "% pago" do contrato
              — são dois controles independentes, assim como notas de compra não recalculam contas a pagar
              já geradas. Preencha juros/multa quando o valor recebido for diferente do previsto — o "Total
              recebido" já soma o valor atualizado das parcelas pagas.
            </p>
          </>
        )}

        {activeTab === "notas" && (
          <>
            <div className="flex justify-end mb-4">
              <button
                onClick={() => {
                  setTipoRelatorio(null);
                  setModoRelatorio(true);
                }}
                className="text-xs font-semibold px-3 py-1.5 rounded-sm"
                style={{ fontFamily: "'Oswald', sans-serif", letterSpacing: "0.03em", color: "#F5F3EC", background: "#3D6E8C" }}
              >
                📄 GERAR RELATÓRIO
              </button>
            </div>

            <div className="flex flex-wrap gap-3 mb-4">
              <KpiCard eyebrow="Total em notas" value={formatBRLShort(totalNotasCompra)} sub={formatBRL(totalNotasCompra)} />
              <KpiCard eyebrow="Notas cadastradas" value={`${notasFiltradas.length}`} sub={filtroObraNotas || "todas as obras"} />
              <KpiCard
                eyebrow="Parcelas geradas"
                value={`${contasPagar.filter((c) => !filtroObraNotas || c.obra === filtroObraNotas).length}`}
                sub="em contas a pagar"
                accent="#3D6E8C"
              />
              <KpiCard
                eyebrow="Ticket médio"
                value={notasFiltradas.length > 0 ? formatBRLShort(totalNotasCompra / notasFiltradas.length) : "—"}
                sub="por nota"
              />
            </div>

            <div className="mb-4 flex items-center gap-2 flex-wrap">
              <label
                className="text-xs font-semibold uppercase tracking-wide"
                style={{ color: "#8A8D93", fontFamily: "'Oswald', sans-serif" }}
              >
                Filtrar por obra:
              </label>
              <select
                value={filtroObraNotas}
                onChange={(e) => setFiltroObraNotas(e.target.value)}
                className="text-sm px-3 py-1.5 rounded-sm outline-none"
                style={{ border: "1px solid #DCD7C9", color: "#22252A", background: "#FFFFFF" }}
              >
                <option value="">Todas as obras</option>
                {NOMES_OBRAS.map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </div>

            <section
              className="rounded-md p-5 border"
              style={{ background: "#F5F3EC", borderColor: "#DCD7C9" }}
            >
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <h2
                  className="text-sm uppercase tracking-[0.12em] font-semibold"
                  style={{ color: "#22252A", fontFamily: "'Oswald', sans-serif" }}
                >
                  Notas de compras
                </h2>
                <button
                  onClick={() => setShowFormNota((s) => !s)}
                  className="text-xs font-semibold px-3 py-1.5 rounded-sm"
                  style={{
                    fontFamily: "'Oswald', sans-serif",
                    letterSpacing: "0.03em",
                    color: "#F5F3EC",
                    background: "#3D6E8C",
                  }}
                >
                  {showFormNota ? "CANCELAR" : "+ NOVA NOTA"}
                </button>
              </div>

              {saveErrorNotas && (
                <div className="mb-3 text-xs px-3 py-2 rounded-sm" style={{ color: "#B23A2E", background: "#F8E3E0" }}>
                  {saveErrorNotas}
                </div>
              )}

              {showFormNota && (
                <form
                  onSubmit={handleAddNota}
                  className="mb-5 p-4 rounded-sm grid grid-cols-1 sm:grid-cols-3 gap-3"
                  style={{ background: "#FFFFFF", border: "1px solid #E4E0D6" }}
                >
                  <div className="sm:col-span-3 flex items-center gap-3 flex-wrap">
                    <label
                      className="text-xs font-semibold px-3 py-1.5 rounded-sm cursor-pointer"
                      style={{
                        fontFamily: "'Oswald', sans-serif",
                        letterSpacing: "0.03em",
                        color: "#22252A",
                        background: "#E4E0D6",
                      }}
                    >
                      {pdfImportingNota ? "LENDO PDF…" : "📄 IMPORTAR PDF"}
                      <input
                        type="file"
                        accept="application/pdf"
                        onChange={handlePdfImportNota}
                        disabled={pdfImportingNota}
                        className="hidden"
                      />
                    </label>
                    <span className="text-xs" style={{ color: "#8A8D93" }}>
                      Extração automática por padrão de texto — confira os campos antes de salvar.
                    </span>
                  </div>

                  {pdfImportErrorNota && (
                    <div className="sm:col-span-3 text-xs px-3 py-2 rounded-sm" style={{ color: "#B23A2E", background: "#F8E3E0" }}>
                      {pdfImportErrorNota}
                    </div>
                  )}
                  {pdfImportedFieldsNota.length > 0 && (
                    <div className="sm:col-span-3 text-xs px-3 py-2 rounded-sm" style={{ color: "#4F7A5B", background: "#E8EEE8" }}>
                      Preenchido automaticamente: {pdfImportedFieldsNota.join(", ")}. Revise os demais campos.
                    </div>
                  )}
                  {duplicataNota && (
                    <div className="sm:col-span-3 text-xs px-3 py-2 rounded-sm" style={{ color: "#B4590C", background: "#FBEBDB" }}>
                      ⚠ Possível duplicidade: já existe uma nota de <strong>{duplicataNota.fornecedor}</strong> no
                      valor de {formatBRLShort(duplicataNota.valorTotal)}, emitida em {duplicataNota.dataEmissao}.
                      Confira antes de salvar.
                    </div>
                  )}

                  <input
                    required
                    placeholder="Fornecedor"
                    value={formNota.fornecedor}
                    onChange={(e) => setFormNota({ ...formNota, fornecedor: e.target.value })}
                    className="text-sm px-3 py-2 rounded-sm outline-none"
                    style={{ border: "1px solid #DCD7C9", color: "#22252A", width: "100%", minWidth: 0 }}
                  />
                  <select
                    value={formNota.obra}
                    onChange={(e) => setFormNota({ ...formNota, obra: e.target.value })}
                    className="text-sm px-3 py-2 rounded-sm outline-none"
                    style={{ border: "1px solid #DCD7C9", color: "#22252A", width: "100%", minWidth: 0 }}
                  >
                    {NOMES_OBRAS.map((o) => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </select>
                  <input
                    required
                    type="number"
                    placeholder="Valor total (R$)"
                    value={formNota.valorTotal}
                    onChange={(e) => setFormNota({ ...formNota, valorTotal: e.target.value })}
                    className="text-sm px-3 py-2 rounded-sm outline-none"
                    style={{ border: "1px solid #DCD7C9", color: "#22252A", width: "100%", minWidth: 0 }}
                  />
                  <input
                    type="date"
                    title="Data de emissão"
                    value={dataBRparaISO(formNota.dataEmissao)}
                    onChange={(e) => setFormNota({ ...formNota, dataEmissao: dataISOparaBR(e.target.value) })}
                    className="text-sm px-3 py-2 rounded-sm outline-none"
                    style={{ border: "1px solid #DCD7C9", color: "#22252A", width: "100%", minWidth: 0 }}
                  />
                  <input
                    type="number"
                    min="1"
                    max="24"
                    placeholder="Nº de parcelas"
                    value={formNota.numeroParcelas}
                    onChange={(e) => setFormNota({ ...formNota, numeroParcelas: e.target.value })}
                    className="text-sm px-3 py-2 rounded-sm outline-none"
                    style={{ border: "1px solid #DCD7C9", color: "#22252A", width: "100%", minWidth: 0 }}
                  />
                  <div className="text-xs flex items-center" style={{ color: "#8A8D93" }}>
                    As parcelas são lançadas automaticamente em Contas a pagar.
                  </div>

                  <button
                    type="submit"
                    className="sm:col-span-3 text-xs font-semibold px-3 py-2.5 rounded-sm"
                    style={{
                      fontFamily: "'Oswald', sans-serif",
                      letterSpacing: "0.03em",
                      color: "#F5F3EC",
                      background: duplicataNota ? "#B4590C" : "#E1590C",
                    }}
                  >
                    {duplicataNota ? "SALVAR MESMO ASSIM (duplicidade)" : "SALVAR NOTA"}
                  </button>
                </form>
              )}

              {loadingNotas ? (
                <div className="text-sm py-6 text-center" style={{ color: "#8A8D93" }}>
                  Carregando notas…
                </div>
              ) : notasFiltradas.length === 0 ? (
                <div className="text-sm py-6 text-center" style={{ color: "#8A8D93" }}>
                  {filtroObraNotas ? "Nenhuma nota cadastrada para esta obra." : "Nenhuma nota cadastrada ainda."}
                </div>
              ) : (
                <>
                  <div className="hidden sm:grid grid-cols-[2.2fr_1fr_1fr_1fr_0.8fr_auto] gap-3 px-3 pb-2 text-[11px] uppercase tracking-wide font-semibold" style={{ color: "#8A8D93" }}>
                    <span>Fornecedor</span>
                    <span>Obra</span>
                    <span>Valor total</span>
                    <span>Emissão</span>
                    <span>Parcelas</span>
                    <span></span>
                  </div>

                  <div className="space-y-2">
                    {notasFiltradas
                      .slice()
                      .reverse()
                      .map((n) => (
                        <div
                          key={n.id}
                          className="grid grid-cols-2 sm:grid-cols-[2.2fr_1fr_1fr_1fr_0.8fr_auto] gap-2 sm:gap-3 items-center rounded-sm px-3 py-3"
                          style={{ background: "#FFFFFF", border: "1px solid #E4E0D6" }}
                        >
                          <span className="text-sm font-semibold min-w-0" style={{ color: "#22252A" }}>{n.fornecedor}</span>
                          <span className="text-sm truncate min-w-0" title={n.obra} style={{ color: "#22252A" }}>{n.obra}</span>
                          <span
                            className="text-sm"
                            style={{ color: "#22252A", fontFamily: "'IBM Plex Mono', monospace" }}
                          >
                            {formatBRLShort(n.valorTotal)}
                          </span>
                          <span
                            className="text-xs"
                            style={{ color: "#6B6F76", fontFamily: "'IBM Plex Mono', monospace" }}
                          >
                            {n.dataEmissao}
                          </span>
                          <span className="text-xs" style={{ color: "#6B6F76" }}>{n.numeroParcelas}x</span>
                          <button
                            onClick={() => handleDeleteNota(n.id)}
                            className="text-xs w-fit"
                            style={{ color: "#B23A2E" }}
                            title="Excluir nota"
                          >
                            Excluir
                          </button>
                        </div>
                      ))}
                  </div>
                </>
              )}
            </section>

            <p className="mt-6 text-xs" style={{ color: "#6B6F76" }}>
              Ao salvar uma nota, as parcelas são geradas automaticamente na aba Contas a pagar.
            </p>
          </>
        )}

        {activeTab === "pagar" && (
          <>
            <div className="flex justify-end mb-4">
              <button
                onClick={() => {
                  setTipoRelatorio(null);
                  setModoRelatorio(true);
                }}
                className="text-xs font-semibold px-3 py-1.5 rounded-sm"
                style={{ fontFamily: "'Oswald', sans-serif", letterSpacing: "0.03em", color: "#F5F3EC", background: "#3D6E8C" }}
              >
                📄 GERAR RELATÓRIO
              </button>
            </div>

            <div className="flex flex-wrap gap-3 mb-4">
              <KpiCard eyebrow="Total a pagar" value={formatBRLShort(totalAPagar)} sub={formatBRL(totalAPagar)} accent="#B4590C" />
              <KpiCard eyebrow="Total pago" value={formatBRLShort(totalPago)} sub={formatBRL(totalPago)} accent="#4F7A5B" />
              <KpiCard
                eyebrow="Parcelas vencidas"
                value={`${parcelasVencidas}`}
                sub="precisam de atenção"
                accent={parcelasVencidas > 0 ? "#B23A2E" : "#22252A"}
              />
              <KpiCard eyebrow="Parcelas cadastradas" value={`${contasPagarFiltradas.length}`} sub={filtroObraPagar || "todas as obras"} />
            </div>

            <div className="mb-4 flex items-center gap-2 flex-wrap">
              <label
                className="text-xs font-semibold uppercase tracking-wide"
                style={{ color: "#8A8D93", fontFamily: "'Oswald', sans-serif" }}
              >
                Filtrar por obra:
              </label>
              <select
                value={filtroObraPagar}
                onChange={(e) => setFiltroObraPagar(e.target.value)}
                className="text-sm px-3 py-1.5 rounded-sm outline-none"
                style={{ border: "1px solid #DCD7C9", color: "#22252A", background: "#FFFFFF" }}
              >
                <option value="">Todas as obras</option>
                {NOMES_OBRAS.map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </div>

            <section
              className="rounded-md p-5 border"
              style={{ background: "#F5F3EC", borderColor: "#DCD7C9" }}
            >
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <h2
                  className="text-sm uppercase tracking-[0.12em] font-semibold"
                  style={{ color: "#22252A", fontFamily: "'Oswald', sans-serif" }}
                >
                  Contas a pagar
                </h2>
                <button
                  onClick={() => setShowFormDespesa((s) => !s)}
                  className="text-xs font-semibold px-3 py-1.5 rounded-sm"
                  style={{
                    fontFamily: "'Oswald', sans-serif",
                    letterSpacing: "0.03em",
                    color: "#F5F3EC",
                    background: "#3D6E8C",
                  }}
                >
                  {showFormDespesa ? "CANCELAR" : "+ NOVA DESPESA"}
                </button>
              </div>

              {showFormDespesa && (
                <form
                  onSubmit={handleAddDespesaAvulsa}
                  className="mb-5 p-4 rounded-sm grid grid-cols-1 sm:grid-cols-3 gap-3"
                  style={{ background: "#FFFFFF", border: "1px solid #E4E0D6" }}
                >
                  <input
                    required
                    placeholder="Fornecedor / descrição da despesa"
                    value={formDespesa.fornecedor}
                    onChange={(e) => setFormDespesa({ ...formDespesa, fornecedor: e.target.value })}
                    className="text-sm px-3 py-2 rounded-sm outline-none"
                    style={{ border: "1px solid #DCD7C9", color: "#22252A", width: "100%", minWidth: 0 }}
                  />
                  <select
                    value={formDespesa.obra}
                    onChange={(e) => setFormDespesa({ ...formDespesa, obra: e.target.value })}
                    className="text-sm px-3 py-2 rounded-sm outline-none"
                    style={{ border: "1px solid #DCD7C9", color: "#22252A", width: "100%", minWidth: 0 }}
                  >
                    {NOMES_OBRAS.map((o) => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </select>
                  <input
                    required
                    type="number"
                    placeholder="Valor (R$)"
                    value={formDespesa.valor}
                    onChange={(e) => setFormDespesa({ ...formDespesa, valor: e.target.value })}
                    className="text-sm px-3 py-2 rounded-sm outline-none"
                    style={{ border: "1px solid #DCD7C9", color: "#22252A", width: "100%", minWidth: 0 }}
                  />
                  <input
                    type="date"
                    title="Data de vencimento"
                    value={dataBRparaISO(formDespesa.dataVencimento)}
                    onChange={(e) => setFormDespesa({ ...formDespesa, dataVencimento: dataISOparaBR(e.target.value) })}
                    className="text-sm px-3 py-2 rounded-sm outline-none"
                    style={{ border: "1px solid #DCD7C9", color: "#22252A", width: "100%", minWidth: 0 }}
                  />
                  <input
                    type="number"
                    min="1"
                    max="60"
                    placeholder="Nº de parcelas (opcional)"
                    value={formDespesa.numeroParcelas}
                    onChange={(e) => setFormDespesa({ ...formDespesa, numeroParcelas: e.target.value })}
                    className="text-sm px-3 py-2 rounded-sm outline-none"
                    style={{ border: "1px solid #DCD7C9", color: "#22252A", width: "100%", minWidth: 0 }}
                  />
                  <div className="text-xs flex items-center" style={{ color: "#8A8D93" }}>
                    Use para gastos avulsos que não vieram de uma nota de compra ou contrato.
                  </div>

                  <button
                    type="submit"
                    className="sm:col-span-3 text-xs font-semibold px-3 py-2.5 rounded-sm"
                    style={{
                      fontFamily: "'Oswald', sans-serif",
                      letterSpacing: "0.03em",
                      color: "#F5F3EC",
                      background: "#E1590C",
                    }}
                  >
                    SALVAR DESPESA
                  </button>
                </form>
              )}

              {loadingNotas ? (
                <div className="text-sm py-6 text-center" style={{ color: "#8A8D93" }}>
                  Carregando contas…
                </div>
              ) : contasPagarFiltradas.length === 0 ? (
                <div className="text-sm py-6 text-center" style={{ color: "#8A8D93" }}>
                  {filtroObraPagar
                    ? "Nenhuma conta a pagar para esta obra."
                    : "Nenhuma conta a pagar ainda. Cadastre uma nota de compra para gerar parcelas."}
                </div>
              ) : (
                <>
                  <div className="hidden sm:grid grid-cols-[2.2fr_0.7fr_0.5fr_0.65fr_0.45fr_0.45fr_0.7fr_0.75fr_0.7fr_1.1fr_auto] gap-2 px-3 pb-2 text-[11px] uppercase tracking-wide font-semibold" style={{ color: "#8A8D93" }}>
                    <span>Fornecedor</span>
                    <span>Obra</span>
                    <span>Parcela</span>
                    <span>Valor</span>
                    <span>Juros</span>
                    <span>Multa</span>
                    <span>Atualizado</span>
                    <span>Vencimento</span>
                    <span>Status</span>
                    <span>Item de custo</span>
                    <span></span>
                  </div>

                  <div className="space-y-2">
                    {contasPagarFiltradas
                      .slice()
                      .sort((a, b) => (parseDateBR(a.vencimento) || 0) - (parseDateBR(b.vencimento) || 0))
                      .map((c) => {
                        const display = statusPagarDisplay(c);
                        const cfg = statusPagarConfig[display];
                        const opcoesCusto = custosItens.filter((it) => it.obra === c.obra);
                        return (
                          <div
                            key={c.id}
                            className="grid grid-cols-2 sm:grid-cols-[2.2fr_0.7fr_0.5fr_0.65fr_0.45fr_0.45fr_0.7fr_0.75fr_0.7fr_1.1fr_auto] gap-2 items-center rounded-sm px-3 py-3"
                            style={{ background: "#FFFFFF", border: "1px solid #E4E0D6" }}
                          >
                            <span className="text-sm font-semibold min-w-0" style={{ color: "#22252A" }}>{c.fornecedor}</span>
                            <span className="text-sm truncate min-w-0" title={c.obra} style={{ color: "#22252A" }}>{c.obra}</span>
                            <span
                              className="text-xs"
                              style={{ color: "#6B6F76", fontFamily: "'IBM Plex Mono', monospace" }}
                            >
                              {c.parcela}
                            </span>
                            <span
                              className="text-sm"
                              style={{ color: "#22252A", fontFamily: "'IBM Plex Mono', monospace" }}
                            >
                              {formatBRLShort(c.valor)}
                            </span>
                            <input
                              type="number"
                              placeholder="0"
                              value={c.juros || ""}
                              onChange={(e) => handleUpdateContaPagarCampo(c.id, "juros", Number(e.target.value) || 0)}
                              onBlur={handlePersistContasPagarBlur}
                              className="text-xs px-2 py-1.5 rounded-sm outline-none"
                              style={{ border: "1px solid #DCD7C9", color: "#22252A", width: "100%", minWidth: 0 }}
                              title="Juros pagos além do valor original (opcional)"
                            />
                            <input
                              type="number"
                              placeholder="0"
                              value={c.multa || ""}
                              onChange={(e) => handleUpdateContaPagarCampo(c.id, "multa", Number(e.target.value) || 0)}
                              onBlur={handlePersistContasPagarBlur}
                              className="text-xs px-2 py-1.5 rounded-sm outline-none"
                              style={{ border: "1px solid #DCD7C9", color: "#22252A", width: "100%", minWidth: 0 }}
                              title="Multa paga além do valor original (opcional)"
                            />
                            <span
                              className="text-xs font-semibold"
                              style={{ color: "#B23A2E", fontFamily: "'IBM Plex Mono', monospace" }}
                              title="Valor original + juros + multa"
                            >
                              {formatBRLShort(valorAtualizadoItem(c))}
                            </span>
                            <span
                              className="text-xs"
                              style={{ color: "#6B6F76", fontFamily: "'IBM Plex Mono', monospace" }}
                            >
                              {c.vencimento}
                            </span>
                            <span
                              className="text-[10px] uppercase tracking-wide font-semibold px-2 py-1 rounded-full text-center w-fit"
                              style={{ color: cfg.color, background: cfg.bg }}
                            >
                              {cfg.label}
                            </span>
                            <select
                              value={c.custoItemId || ""}
                              onChange={(e) => handleVincularCustoItem(c.id, e.target.value)}
                              className="text-xs px-2 py-1.5 rounded-sm outline-none"
                              style={{ border: "1px solid #DCD7C9", color: "#22252A", width: "100%", minWidth: 0 }}
                              title="Vincule a um item do orçamento para que o valor pago componha o Gasto Real automaticamente"
                            >
                              <option value="">— nenhum —</option>
                              {opcoesCusto.map((it) => (
                                <option key={it.id} value={it.id}>
                                  {it.etapa.replace(/^\d+\.\s*/, "")} → {it.item}
                                </option>
                              ))}
                            </select>
                            <div className="flex items-center gap-3">
                              <button
                                onClick={() => handleToggleParcelaPaga(c.id)}
                                className="text-xs w-fit font-semibold"
                                style={{ color: c.status === "pago" ? "#8A8D93" : "#4F7A5B" }}
                              >
                                {c.status === "pago" ? "Reabrir" : "Marcar pago"}
                              </button>
                              <button
                                onClick={() => handleDeleteContaPagar(c.id)}
                                className="text-xs w-fit"
                                style={{ color: "#B23A2E" }}
                                title="Excluir lançamento"
                              >
                                Excluir
                              </button>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </>
              )}
            </section>

            <p className="mt-6 text-xs" style={{ color: "#6B6F76" }}>
              Parcelas geradas automaticamente a partir das notas de compras cadastradas. Vincule uma
              parcela paga a um item do orçamento (coluna "Item de custo") para que o valor componha o
              Gasto Real dele automaticamente em Custos das obras. Preencha juros/multa quando o valor pago
              for diferente do previsto — o "Total pago" e o "Gasto Real" já somam o valor atualizado das
              parcelas pagas.
            </p>
          </>
        )}

        {activeTab === "extrato" && (
          <>
            <div className="flex justify-end mb-4">
              <button
                onClick={() => {
                  setTipoRelatorio(null);
                  setModoRelatorio(true);
                }}
                className="text-xs font-semibold px-3 py-1.5 rounded-sm"
                style={{ fontFamily: "'Oswald', sans-serif", letterSpacing: "0.03em", color: "#F5F3EC", background: "#3D6E8C" }}
              >
                📄 GERAR RELATÓRIO
              </button>
            </div>

            <div className="flex items-center gap-3 mb-3 flex-wrap">
              <label
                className="text-xs font-semibold"
                style={{ color: "#6B6F76", fontFamily: "'Oswald', sans-serif", letterSpacing: "0.03em" }}
              >
                SALDO INICIAL DO EXTRATO
              </label>
              <input
                type="text"
                inputMode="decimal"
                key={loadingSaldoInicialExtrato ? "loading" : String(saldoInicialExtrato)}
                defaultValue={formatMoedaInputBR(saldoInicialExtrato)}
                onFocus={(e) => e.target.select()}
                onBlur={(e) => {
                  const numero = parseMoedaInputBR(e.target.value);
                  persistSaldoInicialExtrato(numero);
                  e.target.value = formatMoedaInputBR(numero);
                }}
                className="text-sm px-2 py-1 rounded-sm border text-right"
                style={{ width: "160px", minWidth: 0, borderColor: "#DCD7C9", fontFamily: "'IBM Plex Mono', monospace" }}
                placeholder="R$ 0,00"
              />
              <span className="text-xs" style={{ color: "#6B6F76" }}>
                informe o saldo que a conta tinha antes do primeiro lançamento do período (aparece no topo do extrato do banco)
              </span>
            </div>

            <div className="flex items-center gap-3 mb-3 flex-wrap">
              <label
                className="text-xs font-semibold"
                style={{ color: "#6B6F76", fontFamily: "'Oswald', sans-serif", letterSpacing: "0.03em" }}
              >
                SALDO INICIAL DAS APLICAÇÕES
              </label>
              <input
                type="text"
                inputMode="decimal"
                key={loadingSaldoInicialAplicacoes ? "loading" : String(saldoInicialAplicacoes)}
                defaultValue={formatMoedaInputBR(saldoInicialAplicacoes)}
                onFocus={(e) => e.target.select()}
                onBlur={(e) => {
                  const numero = parseMoedaInputBR(e.target.value);
                  persistSaldoInicialAplicacoes(numero);
                  e.target.value = formatMoedaInputBR(numero);
                }}
                className="text-sm px-2 py-1 rounded-sm border text-right"
                style={{ width: "160px", minWidth: 0, borderColor: "#DCD7C9", fontFamily: "'IBM Plex Mono', monospace" }}
                placeholder="R$ 0,00"
              />
              <span className="text-xs" style={{ color: "#6B6F76" }}>
                informe o saldo que já estava aplicado antes do primeiro lançamento — depois disso o valor é atualizado sozinho a cada aplicação/resgate classificado no extrato
              </span>
            </div>

            <div className="flex flex-wrap gap-3 mb-8">
              <KpiCard
                eyebrow="Saldo inicial"
                value={formatBRLShort(saldoInicialExtrato)}
                sub={formatBRL(saldoInicialExtrato)}
              />
              <KpiCard
                eyebrow="Saldo do extrato"
                value={formatBRLShort(saldoExtrato)}
                sub={formatBRL(saldoExtrato)}
                accent={saldoExtrato >= 0 ? "#4F7A5B" : "#B23A2E"}
              />
              <KpiCard
                eyebrow="Saldo em aplicações"
                value={formatBRLShort(saldoAplicacoes)}
                sub={formatBRL(saldoAplicacoes)}
                accent={saldoAplicacoes >= 0 ? "#4F7A5B" : "#B23A2E"}
              />
              <KpiCard eyebrow="Total de créditos" value={formatBRLShort(totalCreditosExtrato)} sub={formatBRL(totalCreditosExtrato)} accent="#4F7A5B" />
              <KpiCard eyebrow="Total de débitos" value={formatBRLShort(totalDebitosExtrato)} sub={formatBRL(totalDebitosExtrato)} accent="#B23A2E" />
              <KpiCard
                eyebrow="Saldo final"
                value={formatBRLShort(saldoFinalExtrato)}
                sub={formatBRL(saldoFinalExtrato)}
                accent={saldoFinalExtrato >= 0 ? "#4F7A5B" : "#B23A2E"}
              />
              <KpiCard eyebrow="Lançamentos" value={`${extrato.length}`} sub="no extrato" />
            </div>

            <section
              className="rounded-md p-5 border"
              style={{ background: "#F5F3EC", borderColor: "#DCD7C9" }}
            >
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <h2
                  className="text-sm uppercase tracking-[0.12em] font-semibold"
                  style={{ color: "#22252A", fontFamily: "'Oswald', sans-serif" }}
                >
                  {subAbaExtrato === "extrato-pdf"
                    ? "Extrato bancário — Extrato em PDF"
                    : subAbaExtrato === "exportar-dominio"
                    ? "Extrato bancário — Exportar para Domínio"
                    : subAbaExtrato === "plano-contas"
                    ? "Extrato bancário — Plano de contas"
                    : "Extrato bancário"}
                </h2>
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex items-center rounded-sm overflow-hidden" style={{ border: "1px solid #DCD7C9" }}>
                    <button
                      onClick={() => setSubAbaExtrato("lancamentos")}
                      className="text-xs font-semibold px-3 py-1.5"
                      style={{
                        fontFamily: "'Oswald', sans-serif",
                        letterSpacing: "0.03em",
                        color: subAbaExtrato === "lancamentos" ? "#F5F3EC" : "#22252A",
                        background: subAbaExtrato === "lancamentos" ? "#3D6E8C" : "#E4E0D6",
                      }}
                    >
                      Lançamentos
                    </button>
                    <button
                      onClick={() => setSubAbaExtrato("extrato-pdf")}
                      className="text-xs font-semibold px-3 py-1.5"
                      style={{
                        fontFamily: "'Oswald', sans-serif",
                        letterSpacing: "0.03em",
                        color: subAbaExtrato === "extrato-pdf" ? "#F5F3EC" : "#22252A",
                        background: subAbaExtrato === "extrato-pdf" ? "#3D6E8C" : "#E4E0D6",
                      }}
                    >
                      📄 Extrato em PDF
                    </button>
                    <button
                      onClick={() => setSubAbaExtrato("exportar-dominio")}
                      className="text-xs font-semibold px-3 py-1.5"
                      style={{
                        fontFamily: "'Oswald', sans-serif",
                        letterSpacing: "0.03em",
                        color: subAbaExtrato === "exportar-dominio" ? "#F5F3EC" : "#22252A",
                        background: subAbaExtrato === "exportar-dominio" ? "#4F7A5B" : "#E4E0D6",
                      }}
                    >
                      ⬇ Exportar Domínio
                    </button>
                    <button
                      onClick={() => setSubAbaExtrato("plano-contas")}
                      className="text-xs font-semibold px-3 py-1.5"
                      style={{
                        fontFamily: "'Oswald', sans-serif",
                        letterSpacing: "0.03em",
                        color: subAbaExtrato === "plano-contas" ? "#F5F3EC" : "#22252A",
                        background: subAbaExtrato === "plano-contas" ? "#3D6E8C" : "#E4E0D6",
                      }}
                    >
                      Plano de contas
                    </button>
                  </div>

                  {subAbaExtrato === "lancamentos" ? (
                    <button
                      onClick={() => setShowFormExtrato((s) => !s)}
                      className="text-xs font-semibold px-3 py-1.5 rounded-sm"
                      style={{
                        fontFamily: "'Oswald', sans-serif",
                        letterSpacing: "0.03em",
                        color: "#F5F3EC",
                        background: "#3D6E8C",
                      }}
                    >
                      {showFormExtrato ? "CANCELAR" : "+ NOVO LANÇAMENTO"}
                    </button>
                  ) : subAbaExtrato === "extrato-pdf" ? (
                    <label
                      className="text-xs font-semibold px-3 py-1.5 rounded-sm cursor-pointer"
                      style={{
                        fontFamily: "'Oswald', sans-serif",
                        letterSpacing: "0.03em",
                        color: "#22252A",
                        background: "#E4E0D6",
                      }}
                    >
                      {importingExtratoPdfView ? "LENDO PDF…" : "📄 IMPORTAR PDF"}
                      <input
                        type="file"
                        accept="application/pdf"
                        onChange={handleImportExtratoPdfView}
                        disabled={importingExtratoPdfView}
                        className="hidden"
                      />
                    </label>
                  ) : null}
                </div>
              </div>

              {subAbaExtrato === "extrato-pdf" ? (
                <>
                  <p className="text-xs max-w-xl mb-4" style={{ color: "#6B6F76" }}>
                    Importe o PDF do extrato aqui: ele alimenta esta visualização (fiel ao banco/app,
                    com os saldos reais impressos nele — Saldo Anterior e Saldo do dia) e, ao mesmo
                    tempo, já prepara a prévia de lançamentos contábeis na aba "Lançamentos" para você
                    revisar e classificar.
                  </p>

                  {saveErrorExtratosPdf && (
                    <div className="mb-3 text-xs px-3 py-2 rounded-sm" style={{ color: "#B23A2E", background: "#F8E3E0" }}>
                      {saveErrorExtratosPdf}
                    </div>
                  )}

                  {errorExtratoPdfView && (
                    <div className="mb-3 text-xs px-3 py-2 rounded-sm" style={{ color: "#B23A2E", background: "#F8E3E0" }}>
                      {errorExtratoPdfView}
                    </div>
                  )}

                  {loadingExtratosPdf ? (
                    <p className="text-sm" style={{ color: "#6B6F76" }}>Carregando…</p>
                  ) : extratosPdf.length === 0 ? (
                    <p className="text-sm" style={{ color: "#6B6F76" }}>Nenhum extrato em PDF importado ainda.</p>
                  ) : (
                    extratosPdf.map((ex) => (
                      <div
                        key={ex.id}
                        className="rounded-sm p-4 border mb-4"
                        style={{ background: "#FFFFFF", borderColor: "#DCD7C9" }}
                      >
                        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                          <div>
                            <h3
                              className="text-sm font-semibold"
                              style={{ color: "#22252A", fontFamily: "'Oswald', sans-serif" }}
                            >
                              {ex.nomeArquivo}
                            </h3>
                            <p className="text-xs" style={{ color: "#6B6F76" }}>
                              Importado em {new Date(ex.importadoEm).toLocaleString("pt-BR")}
                            </p>
                          </div>
                          <div className="flex items-center gap-3 flex-wrap">
                            {ex.saldoAnterior !== null && (
                              <KpiCard
                                eyebrow="Saldo anterior (real, do PDF)"
                                value={formatBRLShort(ex.saldoAnterior)}
                                sub={formatBRL(ex.saldoAnterior)}
                                accent={ex.saldoAnterior >= 0 ? "#4F7A5B" : "#B23A2E"}
                              />
                            )}
                            <button
                              onClick={() => handleRemoverExtratoPdfView(ex.id)}
                              className="text-xs px-3 py-1.5 rounded-sm"
                              style={{ color: "#B23A2E", background: "#F8E3E0" }}
                            >
                              Remover
                            </button>
                          </div>
                        </div>

                        <div className="space-y-3">
                          {ex.dias.map((dia, i) => (
                            <div key={i} className="rounded-sm p-3" style={{ background: "#F5F3EC", border: "1px solid #DCD7C9" }}>
                              <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                                <span className="text-xs font-semibold" style={{ color: "#22252A" }}>
                                  {dia.data}
                                  {dia.diaSemana ? ` — ${dia.diaSemana}` : ""}
                                </span>
                                {dia.saldoDoDia !== null && (
                                  <span
                                    className="text-xs font-semibold"
                                    style={{ color: dia.saldoDoDia >= 0 ? "#4F7A5B" : "#B23A2E" }}
                                  >
                                    Saldo do dia: {formatBRL(dia.saldoDoDia)}
                                  </span>
                                )}
                              </div>
                              <div>
                                {dia.lancamentos.map((l, j) => (
                                  <div
                                    key={j}
                                    className="flex items-center justify-between text-xs py-1.5 gap-3"
                                    style={{ borderTop: j > 0 ? "1px solid #EDEAE0" : "none" }}
                                  >
                                    <span style={{ color: "#22252A" }}>{l.descricao}</span>
                                    <span
                                      className="font-mono whitespace-nowrap"
                                      style={{ color: l.valor >= 0 ? "#4F7A5B" : "#B23A2E" }}
                                    >
                                      {formatBRL(l.valor)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </>
              ) : subAbaExtrato === "exportar-dominio" ? (
                <>
                  <p className="text-xs max-w-xl mb-4" style={{ color: "#6B6F76" }}>
                    Gera o arquivo TXT no formato posicional que a Domínio Sistemas espera para
                    importar os lançamentos contábeis. Escolha um período abaixo para exportar só
                    aquelas datas (evita reimportar e duplicar na Domínio o que já foi enviado antes)
                    — deixe os dois campos vazios para exportar todos os lançamentos já "Lançados"
                    (Débito e Crédito preenchidos). Cada conta usada precisa ter o "Código Domínio"
                    preenchido na aba Plano de Contas; quem não tiver fica de fora, com aviso.
                  </p>

                  <div className="flex items-end gap-3 flex-wrap mb-4">
                    <div>
                      <label className="block text-[10px] uppercase tracking-wide font-semibold mb-1" style={{ color: "#8A8D93" }}>
                        Data de
                      </label>
                      <input
                        type="date"
                        value={exportDominioDataDe}
                        onChange={(e) => setExportDominioDataDe(e.target.value)}
                        className="text-xs px-2 py-1.5 rounded-sm"
                        style={{ border: "1px solid #DCD7C9", color: "#22252A" }}
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase tracking-wide font-semibold mb-1" style={{ color: "#8A8D93" }}>
                        Data até
                      </label>
                      <input
                        type="date"
                        value={exportDominioDataAte}
                        onChange={(e) => setExportDominioDataAte(e.target.value)}
                        className="text-xs px-2 py-1.5 rounded-sm"
                        style={{ border: "1px solid #DCD7C9", color: "#22252A" }}
                      />
                    </div>
                    <button
                      onClick={handleExportarLancamentosDominio}
                      disabled={extrato.length === 0}
                      className="text-xs font-semibold px-3 py-2 rounded-sm"
                      style={{
                        fontFamily: "'Oswald', sans-serif",
                        letterSpacing: "0.03em",
                        color: "#F5F3EC",
                        background: "#4F7A5B",
                        opacity: extrato.length === 0 ? 0.5 : 1,
                      }}
                    >
                      ⬇ EXPORTAR PARA DOMÍNIO
                    </button>
                  </div>

                  {avisoExportDominio && (
                    <div className="mb-3 text-xs px-3 py-2 rounded-sm" style={{ color: "#7A5B1E", background: "#F5EBD8" }}>
                      {avisoExportDominio}
                    </div>
                  )}
                </>
              ) : subAbaExtrato === "plano-contas" ? (() => {
                const contasFiltradas = planoContas
                  .filter((c) => contaCorrespondeABusca(c, buscaPlanoContas))
                  .sort((a, b) => a.codigo.localeCompare(b.codigo, "pt-BR", { numeric: true }));
                const contasBanco = planoContas.filter((c) => /banco/i.test(c.nome));
                const TIPO_LABEL = {
                  ativo: "Ativo",
                  passivo: "Passivo",
                  receita: "Receita",
                  despesa: "Despesa",
                  apuracao: "Apuração",
                };
                return (
                <>
                  <div className="flex flex-wrap gap-3 mb-8">
                    <KpiCard eyebrow="Contas cadastradas" value={`${planoContas.length}`} sub="no plano de contas" />
                    <KpiCard
                      eyebrow="Contas de banco"
                      value={`${contasBanco.length}`}
                      sub={contasBanco.length ? contasBanco.map((c) => c.nome).join(", ").slice(0, 60) : "nenhuma identificada"}
                    />
                  </div>

                  <section className="rounded-md p-5 border mb-6" style={{ background: "#FFFFFF", borderColor: "#DCD7C9" }}>
                    <h2
                      className="text-sm uppercase tracking-[0.12em] font-semibold mb-3"
                      style={{ color: "#22252A", fontFamily: "'Oswald', sans-serif" }}
                    >
                      Conta bancária padrão do extrato
                    </h2>
                    <p className="text-xs mb-3" style={{ color: "#6B6F76" }}>
                      Usada para preencher automaticamente o lado "Banco" (Débito ou Crédito, conforme o lançamento
                      for entrada ou saída) ao sugerir a classificação contábil de cada lançamento do extrato. Se a
                      empresa tiver mais de uma conta bancária no plano de contas, escolha aqui qual delas o extrato
                      bancário do painel representa.
                    </p>
                    <select
                      value={contaBancoPadraoId}
                      onChange={(e) => persistContaBancoPadrao(e.target.value)}
                      className="text-sm px-3 py-2 rounded-sm border"
                      style={{ borderColor: "#DCD7C9", color: "#22252A", width: "100%", maxWidth: "480px", minWidth: 0 }}
                    >
                      <option value="">Selecione a conta bancária...</option>
                      {planoContas
                        .filter((c) => c.tipo === "ativo")
                        .sort((a, b) => a.codigo.localeCompare(b.codigo, "pt-BR", { numeric: true }))
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.nome}
                          </option>
                        ))}
                    </select>
                  </section>

                  <section className="rounded-md p-5 border" style={{ background: "#FFFFFF", borderColor: "#DCD7C9" }}>
                    <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                      <h2
                        className="text-sm uppercase tracking-[0.12em] font-semibold"
                        style={{ color: "#22252A", fontFamily: "'Oswald', sans-serif" }}
                      >
                        Plano de contas
                      </h2>
                      <div className="flex items-center gap-2 flex-wrap">
                        <input
                          type="text"
                          placeholder="Buscar por código ou nome..."
                          value={buscaPlanoContas}
                          onChange={(e) => setBuscaPlanoContas(e.target.value)}
                          className="text-xs px-3 py-1.5 rounded-sm border"
                          style={{ borderColor: "#DCD7C9", color: "#22252A", width: "220px", minWidth: 0 }}
                        />
                        <button
                          onClick={() => setShowFormPlanoContas((s) => !s)}
                          className="text-xs font-semibold px-3 py-1.5 rounded-sm"
                          style={{
                            fontFamily: "'Oswald', sans-serif",
                            letterSpacing: "0.03em",
                            color: "#F5F3EC",
                            background: "#3D6E8C",
                          }}
                        >
                          {showFormPlanoContas ? "CANCELAR" : "+ NOVA CONTA"}
                        </button>
                      </div>
                    </div>

                    {saveErrorPlanoContas && (
                      <div className="mb-3 text-xs px-3 py-2 rounded-sm" style={{ color: "#B23A2E", background: "#F8E3E0" }}>
                        {saveErrorPlanoContas}
                      </div>
                    )}

                    {showFormPlanoContas && (
                      <form
                        onSubmit={handleAddContaPlano}
                        className="mb-5 p-4 rounded-sm grid grid-cols-1 sm:grid-cols-[1fr_2fr_1fr_auto] gap-2"
                        style={{ background: "#F5F3EC", border: "1px solid #3D6E8C" }}
                      >
                        <input
                          type="text"
                          placeholder="Código (ex: 4.1.10.512)"
                          value={formPlanoContas.codigo}
                          onChange={(e) => setFormPlanoContas({ ...formPlanoContas, codigo: e.target.value })}
                          className="text-sm px-3 py-2 rounded-sm"
                          style={{ border: "1px solid #DCD7C9", color: "#22252A", width: "100%", minWidth: 0 }}
                        />
                        <input
                          type="text"
                          placeholder="Nome da conta"
                          value={formPlanoContas.nome}
                          onChange={(e) => setFormPlanoContas({ ...formPlanoContas, nome: e.target.value })}
                          className="text-sm px-3 py-2 rounded-sm"
                          style={{ border: "1px solid #DCD7C9", color: "#22252A", width: "100%", minWidth: 0 }}
                        />
                        <select
                          value={formPlanoContas.tipo}
                          onChange={(e) => setFormPlanoContas({ ...formPlanoContas, tipo: e.target.value })}
                          className="text-sm px-3 py-2 rounded-sm"
                          style={{ border: "1px solid #DCD7C9", color: "#22252A", width: "100%", minWidth: 0 }}
                        >
                          {Object.entries(TIPO_LABEL).map(([valor, label]) => (
                            <option key={valor} value={valor}>
                              {label}
                            </option>
                          ))}
                        </select>
                        <button
                          type="submit"
                          className="text-xs font-semibold px-3 py-2 rounded-sm"
                          style={{ fontFamily: "'Oswald', sans-serif", letterSpacing: "0.03em", color: "#F5F3EC", background: "#E1590C" }}
                        >
                          ADICIONAR
                        </button>
                      </form>
                    )}

                    <div className="hidden sm:grid grid-cols-[1fr_2fr_0.9fr_0.9fr_auto] gap-2 px-2 pb-1.5 text-[10px] uppercase tracking-wide font-semibold" style={{ color: "#8A8D93" }}>
                      <span>Código</span>
                      <span>Nome</span>
                      <span>Tipo</span>
                      <span title="Código interno da conta dentro da Domínio (não é o mesmo código do plano de contas) — usado para gerar o arquivo de importação de lançamentos contábeis da Domínio">
                        Código Domínio
                      </span>
                      <span></span>
                    </div>
                    <div className="space-y-1.5">
                      {contasFiltradas.map((c) => (
                        <div
                          key={c.id}
                          className="grid grid-cols-2 sm:grid-cols-[1fr_2fr_0.9fr_0.9fr_auto] gap-2 items-center rounded-sm px-2 py-1.5"
                          style={{ border: "1px solid #E4E0D6" }}
                        >
                          <input
                            type="text"
                            value={c.codigo}
                            onChange={(e) => handleUpdateContaPlanoCampo(c.id, "codigo", e.target.value)}
                            onBlur={handlePersistPlanoContasBlur}
                            className="text-xs px-2 py-1.5 rounded-sm"
                            style={{ border: "1px solid #DCD7C9", color: "#22252A", fontFamily: "'IBM Plex Mono', monospace", width: "100%", minWidth: 0 }}
                          />
                          <input
                            type="text"
                            value={c.nome}
                            onChange={(e) => handleUpdateContaPlanoCampo(c.id, "nome", e.target.value)}
                            onBlur={handlePersistPlanoContasBlur}
                            className="text-xs px-2 py-1.5 rounded-sm"
                            style={{ border: "1px solid #DCD7C9", color: "#22252A", width: "100%", minWidth: 0 }}
                          />
                          <select
                            value={c.tipo}
                            onChange={(e) => handleUpdateContaPlanoCampo(c.id, "tipo", e.target.value)}
                            onBlur={handlePersistPlanoContasBlur}
                            className="text-xs px-2 py-1.5 rounded-sm"
                            style={{ border: "1px solid #DCD7C9", color: "#22252A", width: "100%", minWidth: 0 }}
                          >
                            {Object.entries(TIPO_LABEL).map(([valor, label]) => (
                              <option key={valor} value={valor}>
                                {label}
                              </option>
                            ))}
                          </select>
                          <input
                            type="text"
                            value={c.codigoDominio || ""}
                            onChange={(e) => handleUpdateContaPlanoCampo(c.id, "codigoDominio", e.target.value)}
                            onBlur={handlePersistPlanoContasBlur}
                            placeholder={SEED_CODIGO_DOMINIO[c.codigo] ? `sugestão: ${SEED_CODIGO_DOMINIO[c.codigo]}` : "—"}
                            title="Código interno da conta dentro da Domínio (não é o mesmo código do plano de contas) — usado para gerar o arquivo de importação de lançamentos contábeis da Domínio"
                            className="text-xs px-2 py-1.5 rounded-sm"
                            style={{ border: "1px solid #DCD7C9", color: "#22252A", fontFamily: "'IBM Plex Mono', monospace", width: "100%", minWidth: 0 }}
                          />
                          <button
                            onClick={() => handleDeleteContaPlano(c.id)}
                            className="text-xs w-fit px-2"
                            style={{ color: "#B23A2E" }}
                            title="Excluir conta"
                          >
                            Excluir
                          </button>
                        </div>
                      ))}
                      {contasFiltradas.length === 0 && (
                        <p className="text-xs px-2 py-3" style={{ color: "#8A8D93" }}>
                          Nenhuma conta encontrada{buscaPlanoContas ? " para essa busca" : ""}.
                        </p>
                      )}
                    </div>
                  </section>

                  <p className="mt-6 text-xs" style={{ color: "#6B6F76" }}>
                    Este plano de contas começou com uma cópia do plano de contas informado, mas é totalmente seu:
                    adicione, renomeie ou remova contas sempre que precisar — as mudanças ficam salvas automaticamente
                    e passam a valer nas sugestões de classificação do extrato bancário.
                  </p>
                </>
                );
              })() : (
                <>
              {saveErrorExtrato && (
                <div className="mb-3 text-xs px-3 py-2 rounded-sm" style={{ color: "#B23A2E", background: "#F8E3E0" }}>
                  {saveErrorExtrato}
                </div>
              )}

              {extratoPreview.length > 0 && (() => {
                const qtdDuplicados = extratoPreview.filter((l) => l.jaLancado && !l.incluirMesmoAssim).length;
                return (
                <div className="mb-5 p-4 rounded-sm" style={{ background: "#FFFFFF", border: "1px solid #3D6E8C" }}>
                  <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                    <span className="text-xs font-semibold" style={{ color: "#22252A" }}>
                      {extratoPreview.length} lançamento(s) encontrados no PDF
                      {qtdDuplicados > 0
                        ? ` — ${qtdDuplicados} já lançado(s) antes (serão pulados)`
                        : ""}{" "}
                      — revise antes de confirmar
                    </span>
                    <div className="flex gap-2">
                      <button
                        onClick={handleDiscardPreviewExtrato}
                        className="text-xs px-3 py-1.5 rounded-sm"
                        style={{ color: "#22252A", background: "#E4E0D6" }}
                      >
                        Descartar
                      </button>
                      <button
                        onClick={handleConfirmImportExtrato}
                        className="text-xs font-semibold px-3 py-1.5 rounded-sm"
                        style={{ color: "#F5F3EC", background: "#E1590C" }}
                      >
                        Confirmar importação
                      </button>
                    </div>
                  </div>
                  <div className="hidden sm:grid grid-cols-[0.6fr_1.8fr_0.5fr_0.45fr_0.6fr_0.6fr_0.95fr_1fr_1fr_auto] gap-2 px-2 pb-1.5 text-[10px] uppercase tracking-wide font-semibold" style={{ color: "#8A8D93" }}>
                    <span>Data</span>
                    <span>Descrição</span>
                    <span>Valor</span>
                    <span>Tipo</span>
                    <span>Status</span>
                    <span>Sócio</span>
                    <span>Vincular a</span>
                    <span>Débito</span>
                    <span>Crédito</span>
                    <span></span>
                  </div>
                  <div className="space-y-2">
                    {extratoPreview.map((l) => {
                      const cfg = tipoExtratoConfig(l.valor);
                      const pulandoDuplicado = l.jaLancado && !l.incluirMesmoAssim;
                      const opcoesParcelaPreview = opcoesParcelaReceberParaPreview(l.id, l.parcelaReceberId);
                      const opcoesContaPreview = opcoesContaPagarParaPreview(l.id, l.contaPagarId);
                      return (
                        <div
                          key={l.id}
                          className="grid grid-cols-2 sm:grid-cols-[0.6fr_1.8fr_0.5fr_0.45fr_0.6fr_0.6fr_0.95fr_1fr_1fr_auto] gap-2 items-center rounded-sm px-2 py-2"
                          style={{
                            border: pulandoDuplicado ? "1px solid #E4C9A8" : "1px solid #E4E0D6",
                            background: pulandoDuplicado ? "#FBF6ED" : "transparent",
                            opacity: pulandoDuplicado ? 0.7 : 1,
                          }}
                        >
                          <input
                            value={l.data}
                            onChange={(e) => handleUpdatePreviewRow(l.id, "data", e.target.value)}
                            className="text-xs px-2 py-1.5 rounded-sm outline-none"
                            style={{ border: "1px solid #DCD7C9", color: "#22252A", width: "100%", minWidth: 0 }}
                          />
                          <input
                            value={l.descricao}
                            onChange={(e) => handleUpdatePreviewRow(l.id, "descricao", e.target.value)}
                            title={l.descricao}
                            className="text-xs px-2 py-1.5 rounded-sm outline-none"
                            style={{ border: "1px solid #DCD7C9", color: "#22252A", width: "100%", minWidth: 0 }}
                          />
                          <input
                            type="number"
                            value={Math.abs(l.valor)}
                            onChange={(e) =>
                              handleUpdatePreviewRow(
                                l.id,
                                "valor",
                                l.valor < 0 ? -Math.abs(Number(e.target.value)) : Math.abs(Number(e.target.value))
                              )
                            }
                            className="text-xs px-2 py-1.5 rounded-sm outline-none"
                            style={{ border: "1px solid #DCD7C9", color: "#22252A", width: "100%", minWidth: 0 }}
                          />
                          <button
                            onClick={() => handleTogglePreviewTipo(l.id)}
                            className="text-[10px] uppercase font-semibold px-2 py-1 rounded-full w-fit"
                            style={{ color: cfg.color, background: cfg.bg }}
                            title="Clique para alternar entre crédito e débito"
                          >
                            {cfg.label}
                          </button>
                          <div className="flex flex-col items-start gap-1">
                            {!l.jaLancado && (() => {
                              const statusCfg = statusClassificacaoConfig[statusClassificacaoContabil(l)];
                              return (
                                <span
                                  className="text-[9.5px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded-full w-fit"
                                  style={{ color: statusCfg.color, background: statusCfg.bg }}
                                  title="Muda para Lançado sozinho assim que Débito e Crédito estiverem preenchidos"
                                >
                                  {statusCfg.label}
                                </span>
                              );
                            })()}
                            {l.jaLancado && (
                              <span
                                className="text-[9.5px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded-full w-fit"
                                style={{
                                  color: pulandoDuplicado ? "#8A6A3E" : "#4F7A5B",
                                  background: pulandoDuplicado ? "#F3E4C8" : "#E8EEE8",
                                }}
                              >
                                {pulandoDuplicado ? "Já lançado" : "Incluindo mesmo assim"}
                              </span>
                            )}
                            {l.jaLancado && (
                              <button
                                onClick={() => handleToggleIncluirDuplicado(l.id)}
                                className="text-[10px] font-semibold"
                                style={{ color: "#3D6E8C" }}
                              >
                                {pulandoDuplicado ? "Validar e incluir" : "Pular esse"}
                              </button>
                            )}
                          </div>
                          <select
                            value={l.socio || ""}
                            onChange={(e) => handleUpdatePreviewRow(l.id, "socio", e.target.value)}
                            className="text-xs px-2 py-1.5 rounded-sm outline-none"
                            style={{ border: "1px solid #DCD7C9", color: "#22252A", width: "100%", minWidth: 0 }}
                            title="Preencha se este lançamento for um aporte ou devolução de sócio"
                          >
                            <option value="">Sócio — nenhum</option>
                            {NOMES_SOCIOS.map((nome) => (
                              <option key={nome} value={nome}>{nome}</option>
                            ))}
                          </select>
                          <div className="flex flex-col gap-1">
                            {l.valor >= 0 ? (
                              <select
                                value={l.parcelaReceberId || ""}
                                onChange={(e) => handleUpdatePreviewRow(l.id, "parcelaReceberId", e.target.value)}
                                className="text-xs px-2 py-1.5 rounded-sm outline-none"
                                style={{ border: "1px solid #DCD7C9", color: "#22252A", width: "100%", minWidth: 0 }}
                                title="Ao confirmar a importação, essa parcela é marcada como recebida automaticamente"
                              >
                                <option value="">Parcela a receber — nenhuma</option>
                                {opcoesParcelaPreview.map((v) => (
                                  <option key={v.id} value={v.id}>
                                    {v.unidade} · {v.comprador} · {v.parcela} · {formatBRLShort(v.valor)}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <select
                                value={l.contaPagarId || ""}
                                onChange={(e) => handleUpdatePreviewRow(l.id, "contaPagarId", e.target.value)}
                                className="text-xs px-2 py-1.5 rounded-sm outline-none"
                                style={{ border: "1px solid #DCD7C9", color: "#22252A", width: "100%", minWidth: 0 }}
                                title="Ao confirmar a importação, essa conta é marcada como paga automaticamente"
                              >
                                <option value="">Conta a pagar — nenhuma</option>
                                {opcoesContaPreview.map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {c.fornecedor} · {c.parcela} · {formatBRLShort(c.valor)}
                                  </option>
                                ))}
                              </select>
                            )}
                            {(l.parcelaReceberId || l.contaPagarId) && (
                              <span className="text-[9.5px] font-semibold" style={{ color: "#4F7A5B" }}>
                                Sugerido pelo valor — confira antes de confirmar
                              </span>
                            )}
                          </div>
                          <SeletorConta
                            value={l.contaDebitoId || ""}
                            onChange={(id) => handleUpdatePreviewRow(l.id, "contaDebitoId", id)}
                            planoContas={planoContas}
                            placeholder="Débito — digite para buscar..."
                          />
                          <SeletorConta
                            value={l.contaCreditoId || ""}
                            onChange={(id) => handleUpdatePreviewRow(l.id, "contaCreditoId", id)}
                            planoContas={planoContas}
                            placeholder="Crédito — digite para buscar..."
                          />
                          <button
                            onClick={() => handleRemovePreviewRow(l.id)}
                            className="text-xs w-fit"
                            style={{ color: "#B23A2E" }}
                          >
                            Remover
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
                );
              })()}

              {showFormExtrato && (
                <form
                  onSubmit={handleAddLancamento}
                  className="mb-5 p-4 rounded-sm grid grid-cols-1 sm:grid-cols-4 gap-3"
                  style={{ background: "#FFFFFF", border: "1px solid #E4E0D6" }}
                >
                  <input
                    required
                    type="date"
                    title="Data"
                    value={dataBRparaISO(formExtrato.data)}
                    onChange={(e) => setFormExtrato({ ...formExtrato, data: dataISOparaBR(e.target.value) })}
                    className="text-sm px-3 py-2 rounded-sm outline-none"
                    style={{ border: "1px solid #DCD7C9", color: "#22252A", width: "100%", minWidth: 0 }}
                  />
                  <input
                    required
                    placeholder="Descrição"
                    value={formExtrato.descricao}
                    onChange={(e) => setFormExtrato({ ...formExtrato, descricao: e.target.value })}
                    className="text-sm px-3 py-2 rounded-sm outline-none"
                    style={{ border: "1px solid #DCD7C9", color: "#22252A", width: "100%", minWidth: 0 }}
                  />
                  <input
                    required
                    type="number"
                    placeholder="Valor (R$)"
                    value={formExtrato.valor}
                    onChange={(e) => setFormExtrato({ ...formExtrato, valor: e.target.value })}
                    className="text-sm px-3 py-2 rounded-sm outline-none"
                    style={{ border: "1px solid #DCD7C9", color: "#22252A", width: "100%", minWidth: 0 }}
                  />
                  <select
                    value={formExtrato.tipo}
                    onChange={(e) => setFormExtrato({ ...formExtrato, tipo: e.target.value })}
                    className="text-sm px-3 py-2 rounded-sm outline-none"
                    style={{ border: "1px solid #DCD7C9", color: "#22252A", width: "100%", minWidth: 0 }}
                  >
                    <option value="credito">Crédito (entrada)</option>
                    <option value="debito">Débito (saída)</option>
                  </select>
                  <input
                    placeholder="Sócio (se for aporte/devolução — opcional)"
                    value={formExtrato.socio}
                    onChange={(e) => setFormExtrato({ ...formExtrato, socio: e.target.value })}
                    className="sm:col-span-3 text-sm px-3 py-2 rounded-sm outline-none"
                    style={{ border: "1px solid #DCD7C9", color: "#22252A", width: "100%", minWidth: 0 }}
                  />
                  <button
                    type="submit"
                    className="sm:col-span-4 text-xs font-semibold px-3 py-2.5 rounded-sm"
                    style={{
                      fontFamily: "'Oswald', sans-serif",
                      letterSpacing: "0.03em",
                      color: "#F5F3EC",
                      background: "#E1590C",
                    }}
                  >
                    SALVAR LANÇAMENTO
                  </button>
                </form>
              )}

              {!loadingExtrato && extrato.length > 0 && (
                <div
                  className="mb-4 p-3 rounded-sm flex flex-wrap items-end gap-3"
                  style={{ background: "#FFFFFF", border: "1px solid #E4E0D6" }}
                >
                  <div style={{ minWidth: 170 }}>
                    <label className="block text-[10px] uppercase tracking-wide font-semibold mb-1" style={{ color: "#8A8D93" }}>
                      Buscar por
                    </label>
                    <input
                      value={filtroLancBusca}
                      onChange={(e) => setFiltroLancBusca(e.target.value)}
                      placeholder="Descrição..."
                      className="text-xs px-2 py-1.5 rounded-sm outline-none"
                      style={{ border: "1px solid #DCD7C9", color: "#22252A", width: "100%", minWidth: 0 }}
                    />
                  </div>
                  <div style={{ minWidth: 135 }}>
                    <label className="block text-[10px] uppercase tracking-wide font-semibold mb-1" style={{ color: "#8A8D93" }}>
                      Data de
                    </label>
                    <input
                      type="date"
                      value={filtroLancDataDe}
                      onChange={(e) => setFiltroLancDataDe(e.target.value)}
                      className="text-xs px-2 py-1.5 rounded-sm outline-none"
                      style={{ border: "1px solid #DCD7C9", color: "#22252A", width: "100%", minWidth: 0 }}
                    />
                  </div>
                  <div style={{ minWidth: 135 }}>
                    <label className="block text-[10px] uppercase tracking-wide font-semibold mb-1" style={{ color: "#8A8D93" }}>
                      Data até
                    </label>
                    <input
                      type="date"
                      value={filtroLancDataAte}
                      onChange={(e) => setFiltroLancDataAte(e.target.value)}
                      className="text-xs px-2 py-1.5 rounded-sm outline-none"
                      style={{ border: "1px solid #DCD7C9", color: "#22252A", width: "100%", minWidth: 0 }}
                    />
                  </div>
                  <div style={{ minWidth: 90 }}>
                    <label className="block text-[10px] uppercase tracking-wide font-semibold mb-1" style={{ color: "#8A8D93" }}>
                      Valor mín.
                    </label>
                    <input
                      type="number"
                      placeholder="Min"
                      value={filtroLancValorMin}
                      onChange={(e) => setFiltroLancValorMin(e.target.value)}
                      className="text-xs px-2 py-1.5 rounded-sm outline-none"
                      style={{ border: "1px solid #DCD7C9", color: "#22252A", width: "100%", minWidth: 0 }}
                    />
                  </div>
                  <div style={{ minWidth: 90 }}>
                    <label className="block text-[10px] uppercase tracking-wide font-semibold mb-1" style={{ color: "#8A8D93" }}>
                      Valor máx.
                    </label>
                    <input
                      type="number"
                      placeholder="Max"
                      value={filtroLancValorMax}
                      onChange={(e) => setFiltroLancValorMax(e.target.value)}
                      className="text-xs px-2 py-1.5 rounded-sm outline-none"
                      style={{ border: "1px solid #DCD7C9", color: "#22252A", width: "100%", minWidth: 0 }}
                    />
                  </div>
                  <div style={{ minWidth: 115 }}>
                    <label className="block text-[10px] uppercase tracking-wide font-semibold mb-1" style={{ color: "#8A8D93" }}>
                      Tipo
                    </label>
                    <select
                      value={filtroLancTipo}
                      onChange={(e) => setFiltroLancTipo(e.target.value)}
                      className="text-xs px-2 py-1.5 rounded-sm outline-none"
                      style={{ border: "1px solid #DCD7C9", color: "#22252A", width: "100%", minWidth: 0 }}
                    >
                      <option value="">Todos</option>
                      <option value="credito">Crédito</option>
                      <option value="debito">Débito</option>
                    </select>
                  </div>
                  <div style={{ minWidth: 115 }}>
                    <label className="block text-[10px] uppercase tracking-wide font-semibold mb-1" style={{ color: "#8A8D93" }}>
                      Status
                    </label>
                    <select
                      value={filtroLancStatus}
                      onChange={(e) => setFiltroLancStatus(e.target.value)}
                      className="text-xs px-2 py-1.5 rounded-sm outline-none"
                      style={{ border: "1px solid #DCD7C9", color: "#22252A", width: "100%", minWidth: 0 }}
                    >
                      <option value="">Todos</option>
                      <option value="lancado">Lançado</option>
                      <option value="pendente">Pendente</option>
                    </select>
                  </div>
                  {(filtroLancBusca ||
                    filtroLancDataDe ||
                    filtroLancDataAte ||
                    filtroLancValorMin !== "" ||
                    filtroLancValorMax !== "" ||
                    filtroLancTipo ||
                    filtroLancStatus) && (
                    <button
                      onClick={limparFiltrosLancamentos}
                      className="text-xs font-semibold px-3 py-1.5 rounded-sm"
                      style={{ color: "#3D6E8C" }}
                    >
                      Limpar filtros
                    </button>
                  )}
                </div>
              )}

              {loadingExtrato ? (
                <div className="text-sm py-6 text-center" style={{ color: "#8A8D93" }}>
                  Carregando extrato…
                </div>
              ) : extrato.length === 0 ? (
                <div className="text-sm py-6 text-center" style={{ color: "#8A8D93" }}>
                  Nenhum lançamento ainda. Importe um PDF ou adicione manualmente.
                </div>
              ) : (() => {
                const buscaLancNormalizada = normalizarDescricaoExtrato(filtroLancBusca);
                const filtroDataDeObj = filtroLancDataDe ? new Date(filtroLancDataDe + "T00:00:00") : null;
                const filtroDataAteObj = filtroLancDataAte ? new Date(filtroLancDataAte + "T23:59:59") : null;
                const extratoFiltrado = extrato.filter((l) => {
                  if (buscaLancNormalizada && !normalizarDescricaoExtrato(l.descricao).includes(buscaLancNormalizada)) {
                    return false;
                  }
                  const dataLanc = parseDateBR(l.data);
                  if (filtroDataDeObj && (!dataLanc || dataLanc < filtroDataDeObj)) return false;
                  if (filtroDataAteObj && (!dataLanc || dataLanc > filtroDataAteObj)) return false;
                  if (filtroLancValorMin !== "" && Math.abs(l.valor) < Number(filtroLancValorMin)) return false;
                  if (filtroLancValorMax !== "" && Math.abs(l.valor) > Number(filtroLancValorMax)) return false;
                  if (filtroLancTipo === "credito" && l.valor < 0) return false;
                  if (filtroLancTipo === "debito" && l.valor >= 0) return false;
                  if (filtroLancStatus && statusClassificacaoContabil(l) !== filtroLancStatus) return false;
                  return true;
                });

                if (extratoFiltrado.length === 0) {
                  return (
                    <div className="text-sm py-6 text-center" style={{ color: "#8A8D93" }}>
                      Nenhum lançamento encontrado com esse filtro.
                    </div>
                  );
                }

                const extratoOrdenado = extratoFiltrado
                  .slice()
                  .sort((a, b) => (parseDateBR(b.data) || 0) - (parseDateBR(a.data) || 0));
                const todosSelecionados =
                  extratoOrdenado.length > 0 && extratoOrdenado.every((l) => selecionadosLancamentos.has(l.id));
                return (
                <>
                  <div className="hidden sm:grid grid-cols-[24px_0.7fr_2fr_0.7fr_0.55fr_0.65fr_0.8fr_1.3fr_1fr_1fr_auto] gap-3 px-3 pb-2 text-[11px] uppercase tracking-wide font-semibold items-center" style={{ color: "#8A8D93" }}>
                    <input
                      type="checkbox"
                      checked={todosSelecionados}
                      onChange={() =>
                        setSelecionadosLancamentos(
                          todosSelecionados ? new Set() : new Set(extratoOrdenado.map((l) => l.id))
                        )
                      }
                      title="Selecionar todos"
                    />
                    <span>Data</span>
                    <span>Descrição</span>
                    <span>Valor</span>
                    <span>Tipo</span>
                    <span>Status</span>
                    <span>Sócio</span>
                    <span>Vincular a</span>
                    <span>Débito</span>
                    <span>Crédito</span>
                    <span></span>
                  </div>

                  <div className="space-y-2" style={{ paddingBottom: selecionadosLancamentos.size > 0 ? 64 : 0 }}>
                    {extratoOrdenado.map((l) => {
                        const cfg = tipoExtratoConfig(l.valor);
                        const statusCfg = statusClassificacaoConfig[statusClassificacaoContabil(l)];
                        const opcoesParcela = opcoesParcelaReceberPara(l.id, l.parcelaReceberId);
                        const opcoesConta = opcoesContaPagarPara(l.id, l.contaPagarId);
                        const selecionado = selecionadosLancamentos.has(l.id);
                        // Igual à Nibo: um lançamento "Lançado" trava os campos de
                        // classificação — para mudar, marque e use "Editar" ou
                        // "Desfazer" na barra que aparece embaixo.
                        const bloqueado =
                          statusClassificacaoContabil(l) === "lancado" && !lancamentosDesbloqueados.has(l.id);
                        const tituloBloqueado = 'Lançamento já lançado — marque e use "Editar" ou "Desfazer" para alterar';
                        const estiloCampo = {
                          border: "1px solid #DCD7C9",
                          color: bloqueado ? "#8A8D93" : "#22252A",
                          background: bloqueado ? "#F3F1EA" : "#FFFFFF",
                          cursor: bloqueado ? "not-allowed" : "auto",
                          width: "100%",
                          minWidth: 0,
                        };
                        return (
                          <div
                            key={l.id}
                            className="grid grid-cols-2 sm:grid-cols-[24px_0.7fr_2fr_0.7fr_0.55fr_0.65fr_0.8fr_1.3fr_1fr_1fr_auto] gap-2 sm:gap-3 items-center rounded-sm px-3 py-3"
                            style={{
                              background: selecionado ? "#EAF1F6" : "#FFFFFF",
                              border: selecionado ? "1px solid #3D6E8C" : "1px solid #E4E0D6",
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={selecionado}
                              onChange={() => toggleSelecaoLancamento(l.id)}
                              className="hidden sm:inline-block"
                            />
                            <span
                              className="text-xs"
                              style={{ color: "#6B6F76", fontFamily: "'IBM Plex Mono', monospace" }}
                            >
                              {l.data}
                            </span>
                            <span className="text-sm min-w-0" style={{ color: "#22252A" }}>{l.descricao}</span>
                            <span
                              className="text-sm"
                              style={{ color: l.valor >= 0 ? "#4F7A5B" : "#B23A2E", fontFamily: "'IBM Plex Mono', monospace" }}
                            >
                              {l.valor >= 0 ? "+" : "−"}
                              {formatBRLShort(Math.abs(l.valor))}
                            </span>
                            <span
                              className="text-[10px] uppercase tracking-wide font-semibold px-2 py-1 rounded-full text-center w-fit"
                              style={{ color: cfg.color, background: cfg.bg }}
                            >
                              {cfg.label}
                            </span>
                            <span
                              className="text-[10px] uppercase tracking-wide font-semibold px-2 py-1 rounded-full text-center w-fit"
                              style={{ color: statusCfg.color, background: statusCfg.bg }}
                              title="Muda para Lançado sozinho assim que Débito e Crédito estiverem preenchidos"
                            >
                              {statusCfg.label}
                            </span>
                            <select
                              value={l.socio || ""}
                              onChange={(e) => handleUpdateExtratoSocio(l.id, e.target.value)}
                              onBlur={handlePersistExtratoSocio}
                              disabled={bloqueado}
                              className="text-xs px-2 py-1.5 rounded-sm outline-none"
                              style={estiloCampo}
                              title={bloqueado ? tituloBloqueado : "Preencha se este lançamento for um aporte ou devolução de sócio — ele passa a contar em Empréstimos de sócios"}
                            >
                              <option value="">Sócio — nenhum</option>
                              {NOMES_SOCIOS.map((nome) => (
                                <option key={nome} value={nome}>{nome}</option>
                              ))}
                            </select>
                            {l.valor >= 0 ? (
                              <select
                                value={l.parcelaReceberId || ""}
                                onChange={(e) => handleVincularParcelaReceber(l.id, e.target.value)}
                                disabled={bloqueado}
                                className="text-xs px-2 py-1.5 rounded-sm outline-none"
                                style={estiloCampo}
                                title={bloqueado ? tituloBloqueado : "Vincule a uma parcela de Valores a receber para marcá-la como recebida automaticamente"}
                              >
                                <option value="">Parcela a receber — nenhuma</option>
                                {opcoesParcela.map((v) => (
                                  <option key={v.id} value={v.id}>
                                    {v.unidade} · {v.comprador} · {v.parcela} · {formatBRLShort(v.valor)}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <select
                                value={l.contaPagarId || ""}
                                onChange={(e) => handleVincularContaPagar(l.id, e.target.value)}
                                disabled={bloqueado}
                                className="text-xs px-2 py-1.5 rounded-sm outline-none"
                                style={estiloCampo}
                                title={bloqueado ? tituloBloqueado : "Vincule a uma conta a pagar para marcá-la como paga automaticamente"}
                              >
                                <option value="">Conta a pagar — nenhuma</option>
                                {opcoesConta.map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {c.fornecedor} · {c.parcela} · {formatBRLShort(c.valor)}
                                  </option>
                                ))}
                              </select>
                            )}
                            <SeletorConta
                              value={l.contaDebitoId || ""}
                              onChange={(id) => handleClassificarLancamento(l.id, "contaDebitoId", id)}
                              planoContas={planoContas}
                              placeholder="Débito — digite para buscar..."
                              disabled={bloqueado}
                            />
                            <SeletorConta
                              value={l.contaCreditoId || ""}
                              onChange={(id) => handleClassificarLancamento(l.id, "contaCreditoId", id)}
                              planoContas={planoContas}
                              placeholder="Crédito — digite para buscar..."
                              disabled={bloqueado}
                            />
                            <button
                              onClick={() => handleDeleteLancamento(l.id)}
                              className="text-xs w-fit"
                              style={{ color: "#B23A2E" }}
                              title="Excluir lançamento"
                            >
                              Excluir
                            </button>
                          </div>
                        );
                      })}
                  </div>

                  {selecionadosLancamentos.size > 0 && (
                    <div
                      className="flex items-center gap-3 px-4 py-2.5 rounded-full flex-wrap justify-center"
                      style={{
                        position: "fixed",
                        left: "50%",
                        bottom: 20,
                        transform: "translateX(-50%)",
                        background: "#22252A",
                        boxShadow: "0 6px 20px rgba(0,0,0,0.25)",
                        zIndex: 30,
                      }}
                    >
                      <span className="text-xs font-semibold flex items-center gap-2" style={{ color: "#F5F3EC" }}>
                        {selecionadosLancamentos.size} item(ns) selecionado(s)
                        <button onClick={limparSelecaoLancamentos} title="Limpar seleção" style={{ color: "#C7CBD1" }}>
                          ✕
                        </button>
                      </span>
                      <button
                        onClick={handleEditarSelecionados}
                        className="text-xs font-semibold px-3 py-1.5 rounded-full"
                        style={{ color: "#F5F3EC", background: "#3D6E8C" }}
                        title="Destrava os campos para editar, sem apagar a classificação atual"
                      >
                        ✎ Editar
                      </button>
                      <button
                        onClick={handleDesfazerSelecionados}
                        className="text-xs font-semibold px-3 py-1.5 rounded-full"
                        style={{ color: "#F5F3EC", background: "#8A6A3E" }}
                        title="Limpa a classificação (Débito/Crédito) e volta para Pendente"
                      >
                        ↺ Desfazer
                      </button>
                      <button
                        onClick={handleExcluirSelecionados}
                        className="text-xs font-semibold px-3 py-1.5 rounded-full"
                        style={{ color: "#F5F3EC", background: "#B23A2E" }}
                        title="Excluir os lançamentos selecionados"
                      >
                        🗑 Excluir
                      </button>
                    </div>
                  )}
                </>
                );
              })()}
                </>
              )}
            </section>

            <p className="mt-6 text-xs" style={{ color: "#6B6F76" }}>
              Extração heurística por padrão de texto — funciona melhor com extratos simples e tabulares;
              revise os lançamentos antes de confirmar a importação. O saldo do extrato entra
              automaticamente no fluxo de caixa da Visão geral. Preencha o campo "Sócio" num lançamento
              (crédito = aporte, débito = devolução) para que ele apareça também na aba Empréstimos de
              sócios, sem duplicar o valor. Vincule um lançamento a uma "Parcela a receber" para marcá-la
              como recebida automaticamente na aba Valores a receber — desvincular reabre a parcela. As
              colunas Débito e Crédito trazem uma sugestão automática de classificação contábil (a partir
              do plano de contas da aba "Plano de contas") para te ajudar a lançar mais rápido no Nibo —
              sempre revise antes, principalmente em lançamentos que você ainda não tinha classificado lá.
            </p>
          </>
        )}

        {activeTab === "socios" && (
          <>
            <div className="flex justify-end mb-4">
              <button
                onClick={() => {
                  setTipoRelatorio(null);
                  setModoRelatorio(true);
                }}
                className="text-xs font-semibold px-3 py-1.5 rounded-sm"
                style={{ fontFamily: "'Oswald', sans-serif", letterSpacing: "0.03em", color: "#F5F3EC", background: "#3D6E8C" }}
              >
                📄 GERAR RELATÓRIO
              </button>
            </div>

            <div className="flex flex-wrap gap-3 mb-8">
              <KpiCard
                eyebrow="Saldo com sócios"
                value={formatBRLShort(saldoComSocios)}
                sub={saldoComSocios > 0 ? "a empresa deve aos sócios" : "quitado ou a favor da empresa"}
                accent={saldoComSocios > 0 ? "#B4590C" : "#22252A"}
              />
              <KpiCard eyebrow="Total aportado" value={formatBRLShort(totalAportado)} sub={formatBRL(totalAportado)} accent="#4F7A5B" />
              <KpiCard eyebrow="Total devolvido" value={formatBRLShort(totalDevolvido)} sub={formatBRL(totalDevolvido)} accent="#3D6E8C" />
              <KpiCard eyebrow="Sócios no controle" value={`${saldoPorSocio.length}`} sub="com movimentação" />
            </div>

            <div className="mb-4 flex items-center gap-2 flex-wrap">
              <label
                className="text-xs font-semibold uppercase tracking-wide"
                style={{ color: "#8A8D93", fontFamily: "'Oswald', sans-serif" }}
              >
                Filtrar por obra:
              </label>
              <select
                value={filtroObraSocios}
                onChange={(e) => setFiltroObraSocios(e.target.value)}
                className="text-sm px-3 py-1.5 rounded-sm outline-none"
                style={{ border: "1px solid #DCD7C9", color: "#22252A", background: "#FFFFFF" }}
              >
                <option value="">Todas as obras</option>
                {NOMES_OBRAS.map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
              {filtroObraSocios && (
                <span className="text-xs" style={{ color: "#8A8D93" }}>
                  Lançamentos vindos do extrato bancário (sem obra definida) não aparecem com um filtro ativo.
                </span>
              )}
            </div>

            {saldoPorSocio.length > 0 && (
              <section
                className="mb-5 rounded-md p-5 border"
                style={{ background: "#F5F3EC", borderColor: "#DCD7C9" }}
              >
                <h2
                  className="text-sm uppercase tracking-[0.12em] font-semibold mb-4"
                  style={{ color: "#22252A", fontFamily: "'Oswald', sans-serif" }}
                >
                  Saldo por sócio
                </h2>
                <div className="space-y-2">
                  {saldoPorSocio.map(({ socio, saldo }) => (
                    <div
                      key={socio}
                      className="flex items-center justify-between rounded-sm px-3 py-2.5 flex-wrap gap-1"
                      style={{ background: "#FFFFFF", border: "1px solid #E4E0D6" }}
                    >
                      <span className="text-sm font-medium" style={{ color: "#22252A" }}>{socio}</span>
                      <span
                        className="text-sm"
                        style={{
                          color: saldo > 0 ? "#B4590C" : saldo < 0 ? "#3D6E8C" : "#8A8D93",
                          fontFamily: "'IBM Plex Mono', monospace",
                        }}
                      >
                        {saldo > 0
                          ? `Empresa deve ${formatBRLShort(saldo)}`
                          : saldo < 0
                          ? `Sócio deve ${formatBRLShort(Math.abs(saldo))}`
                          : "Quitado"}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section
              className="rounded-md p-5 border"
              style={{ background: "#F5F3EC", borderColor: "#DCD7C9" }}
            >
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <h2
                  className="text-sm uppercase tracking-[0.12em] font-semibold"
                  style={{ color: "#22252A", fontFamily: "'Oswald', sans-serif" }}
                >
                  Empréstimos de sócios
                </h2>
                <button
                  onClick={() => setShowFormSocio((s) => !s)}
                  className="text-xs font-semibold px-3 py-1.5 rounded-sm"
                  style={{
                    fontFamily: "'Oswald', sans-serif",
                    letterSpacing: "0.03em",
                    color: "#F5F3EC",
                    background: "#3D6E8C",
                  }}
                >
                  {showFormSocio ? "CANCELAR" : "+ NOVO LANÇAMENTO"}
                </button>
              </div>

              {saveErrorSocios && (
                <div className="mb-3 text-xs px-3 py-2 rounded-sm" style={{ color: "#B23A2E", background: "#F8E3E0" }}>
                  {saveErrorSocios}
                </div>
              )}

              {showFormSocio && (
                <form
                  onSubmit={handleAddEmprestimo}
                  className="mb-5 p-4 rounded-sm grid grid-cols-1 sm:grid-cols-3 gap-3"
                  style={{ background: "#FFFFFF", border: "1px solid #E4E0D6" }}
                >
                  <select
                    required
                    value={formSocio.socio}
                    onChange={(e) => setFormSocio({ ...formSocio, socio: e.target.value })}
                    className="text-sm px-3 py-2 rounded-sm outline-none"
                    style={{ border: "1px solid #DCD7C9", color: "#22252A", width: "100%", minWidth: 0 }}
                  >
                    <option value="">Selecione o sócio</option>
                    {NOMES_SOCIOS.map((nome) => (
                      <option key={nome} value={nome}>{nome}</option>
                    ))}
                  </select>
                  <select
                    value={formSocio.tipo}
                    onChange={(e) => setFormSocio({ ...formSocio, tipo: e.target.value })}
                    className="text-sm px-3 py-2 rounded-sm outline-none"
                    style={{ border: "1px solid #DCD7C9", color: "#22252A", width: "100%", minWidth: 0 }}
                  >
                    <option value="aporte">Aporte (empréstimo ao caixa)</option>
                    <option value="devolucao">Devolução ao sócio</option>
                  </select>
                  <input
                    required
                    type="number"
                    placeholder="Valor (R$)"
                    value={formSocio.valor}
                    onChange={(e) => setFormSocio({ ...formSocio, valor: e.target.value })}
                    className="text-sm px-3 py-2 rounded-sm outline-none"
                    style={{ border: "1px solid #DCD7C9", color: "#22252A", width: "100%", minWidth: 0 }}
                  />
                  <input
                    type="date"
                    title="Data"
                    value={dataBRparaISO(formSocio.data)}
                    onChange={(e) => setFormSocio({ ...formSocio, data: dataISOparaBR(e.target.value) })}
                    className="text-sm px-3 py-2 rounded-sm outline-none"
                    style={{ border: "1px solid #DCD7C9", color: "#22252A", width: "100%", minWidth: 0 }}
                  />
                  <select
                    value={formSocio.obra}
                    onChange={(e) => setFormSocio({ ...formSocio, obra: e.target.value })}
                    className="text-sm px-3 py-2 rounded-sm outline-none"
                    style={{ border: "1px solid #DCD7C9", color: "#22252A", width: "100%", minWidth: 0 }}
                  >
                    {NOMES_OBRAS.map((o) => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </select>
                  <input
                    placeholder="Observação (opcional)"
                    value={formSocio.observacao}
                    onChange={(e) => setFormSocio({ ...formSocio, observacao: e.target.value })}
                    className="sm:col-span-3 text-sm px-3 py-2 rounded-sm outline-none"
                    style={{ border: "1px solid #DCD7C9", color: "#22252A", width: "100%", minWidth: 0 }}
                  />
                  <button
                    type="submit"
                    className="sm:col-span-3 text-xs font-semibold px-3 py-2.5 rounded-sm"
                    style={{
                      fontFamily: "'Oswald', sans-serif",
                      letterSpacing: "0.03em",
                      color: "#F5F3EC",
                      background: "#E1590C",
                    }}
                  >
                    SALVAR LANÇAMENTO
                  </button>
                </form>
              )}

              {loadingSocios || loadingExtrato ? (
                <div className="text-sm py-6 text-center" style={{ color: "#8A8D93" }}>
                  Carregando empréstimos…
                </div>
              ) : movimentosSociosFiltrados.length === 0 ? (
                <div className="text-sm py-6 text-center" style={{ color: "#8A8D93" }}>
                  {filtroObraSocios
                    ? "Nenhum empréstimo de sócio registrado para esta obra."
                    : "Nenhum empréstimo de sócio registrado ainda."}
                </div>
              ) : (
                <>
                  <div className="hidden sm:grid grid-cols-[1fr_1.1fr_0.8fr_0.7fr_0.9fr_1.8fr_0.8fr_auto] gap-3 px-3 pb-2 text-[11px] uppercase tracking-wide font-semibold" style={{ color: "#8A8D93" }}>
                    <span>Sócio</span>
                    <span>Tipo</span>
                    <span>Valor</span>
                    <span>Data</span>
                    <span>Obra</span>
                    <span>Observação</span>
                    <span>Origem</span>
                    <span></span>
                  </div>

                  <div className="space-y-2">
                    {movimentosSociosFiltrados
                      .slice()
                      .sort((a, b) => (parseDateBR(b.data) || 0) - (parseDateBR(a.data) || 0))
                      .map((e) => {
                        const cfg = tipoSocioConfig[e.tipo];
                        return (
                          <div
                            key={e.id}
                            className="grid grid-cols-2 sm:grid-cols-[1fr_1.1fr_0.8fr_0.7fr_0.9fr_1.8fr_0.8fr_auto] gap-2 sm:gap-3 items-center rounded-sm px-3 py-3"
                            style={{ background: "#FFFFFF", border: "1px solid #E4E0D6" }}
                          >
                            <span className="text-sm font-semibold truncate min-w-0" title={e.socio} style={{ color: "#22252A" }}>{e.socio}</span>
                            <span
                              className="text-[10px] uppercase tracking-wide font-semibold px-2 py-1 rounded-full text-center w-fit"
                              style={{ color: cfg.color, background: cfg.bg }}
                            >
                              {cfg.label}
                            </span>
                            <span
                              className="text-sm"
                              style={{
                                color: e.tipo === "aporte" ? "#4F7A5B" : "#B23A2E",
                                fontFamily: "'IBM Plex Mono', monospace",
                              }}
                            >
                              {e.tipo === "aporte" ? "+" : "−"}
                              {formatBRLShort(e.valor)}
                            </span>
                            <span
                              className="text-xs"
                              style={{ color: "#6B6F76", fontFamily: "'IBM Plex Mono', monospace" }}
                            >
                              {e.data}
                            </span>
                            <span className="text-xs" style={{ color: "#6B6F76" }}>{e.obra || "—"}</span>
                            <span className="text-xs min-w-0" style={{ color: "#8A8D93" }}>{e.observacao}</span>
                            <span className="text-xs" style={{ color: "#8A8D93" }}>
                              {e.origem === "extrato" ? "Extrato bancário" : "Manual"}
                            </span>
                            {e.origem === "manual" ? (
                              <button
                                onClick={() => handleDeleteEmprestimo(e.id)}
                                className="text-xs w-fit"
                                style={{ color: "#B23A2E" }}
                                title="Excluir lançamento"
                              >
                                Excluir
                              </button>
                            ) : (
                              <span className="text-xs" style={{ color: "#8A8D93" }} title="Para remover, edite o campo Sócio deste lançamento na aba Extrato bancário">
                                —
                              </span>
                            )}
                          </div>
                        );
                      })}
                  </div>
                </>
              )}
            </section>

            <p className="mt-6 text-xs" style={{ color: "#6B6F76" }}>
              Aportes entram como entrada e devoluções como saída no fluxo de caixa da Visão geral, no mês
              da data informada. Lançamentos com origem "Extrato bancário" vêm de itens marcados com um
              sócio na aba Extrato — para removê-los, apague a marcação lá (evita contar o valor em dobro).
            </p>
          </>
        )}

        {activeTab === "emprestimosbancarios" && (
          <>
            <div className="flex flex-wrap gap-3 mb-4">
              <KpiCard
                eyebrow="Total contratado"
                value={formatBRLShort(emprestimosBancariosFiltrados.reduce((s, e) => s + e.valorContratado, 0))}
                sub={formatBRL(emprestimosBancariosFiltrados.reduce((s, e) => s + e.valorContratado, 0))}
              />
              <KpiCard
                eyebrow="Total a pagar"
                value={formatBRLShort(emprestimosBancariosFiltrados.reduce((s, e) => s + e.valorAPagar, 0))}
                sub={formatBRL(emprestimosBancariosFiltrados.reduce((s, e) => s + e.valorAPagar, 0))}
              />
              <KpiCard eyebrow="Empréstimos" value={`${emprestimosBancariosFiltrados.length}`} sub="cadastrados" />
            </div>

            <div className="mb-4 flex items-center gap-2 flex-wrap">
              <label
                className="text-xs font-semibold uppercase tracking-wide"
                style={{ color: "#8A8D93", fontFamily: "'Oswald', sans-serif" }}
              >
                Filtrar por obra:
              </label>
              <select
                value={filtroObraEmprestimosBancarios}
                onChange={(e) => setFiltroObraEmprestimosBancarios(e.target.value)}
                className="text-sm px-3 py-1.5 rounded-sm outline-none"
                style={{ border: "1px solid #DCD7C9", color: "#22252A", background: "#FFFFFF" }}
              >
                <option value="">Todas as obras</option>
                {NOMES_OBRAS.map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </div>

            <section
              className="rounded-md p-5 border"
              style={{ background: "#F5F3EC", borderColor: "#DCD7C9" }}
            >
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <h2
                  className="text-sm uppercase tracking-[0.12em] font-semibold"
                  style={{ color: "#22252A", fontFamily: "'Oswald', sans-serif" }}
                >
                  Empréstimos bancários
                </h2>
                <button
                  onClick={() => setShowFormEmprestimoBancario((s) => !s)}
                  className="text-xs font-semibold px-3 py-1.5 rounded-sm"
                  style={{
                    fontFamily: "'Oswald', sans-serif",
                    letterSpacing: "0.03em",
                    color: "#F5F3EC",
                    background: "#3D6E8C",
                  }}
                >
                  {showFormEmprestimoBancario ? "CANCELAR" : "+ NOVO EMPRÉSTIMO"}
                </button>
              </div>

              {saveErrorEmprestimosBancarios && (
                <div className="mb-3 text-xs px-3 py-2 rounded-sm" style={{ color: "#B23A2E", background: "#F8E3E0" }}>
                  {saveErrorEmprestimosBancarios}
                </div>
              )}

              {showFormEmprestimoBancario && (
                <form
                  onSubmit={handleAddEmprestimoBancario}
                  className="mb-5 p-4 rounded-sm grid grid-cols-1 sm:grid-cols-3 gap-3"
                  style={{ background: "#FFFFFF", border: "1px solid #E4E0D6" }}
                >
                  <input
                    required
                    placeholder="Banco / instituição"
                    value={formEmprestimoBancario.banco}
                    onChange={(e) => setFormEmprestimoBancario({ ...formEmprestimoBancario, banco: e.target.value })}
                    className="text-sm px-3 py-2 rounded-sm outline-none"
                    style={{ border: "1px solid #DCD7C9", color: "#22252A", width: "100%", minWidth: 0 }}
                  />
                  <select
                    value={formEmprestimoBancario.obra}
                    onChange={(e) => setFormEmprestimoBancario({ ...formEmprestimoBancario, obra: e.target.value })}
                    className="text-sm px-3 py-2 rounded-sm outline-none"
                    style={{ border: "1px solid #DCD7C9", color: "#22252A", width: "100%", minWidth: 0 }}
                  >
                    {NOMES_OBRAS.map((o) => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    placeholder="Valor contratado (R$)"
                    value={formEmprestimoBancario.valorContratado}
                    onChange={(e) => setFormEmprestimoBancario({ ...formEmprestimoBancario, valorContratado: e.target.value })}
                    className="text-sm px-3 py-2 rounded-sm outline-none"
                    style={{ border: "1px solid #DCD7C9", color: "#22252A", width: "100%", minWidth: 0 }}
                    title="O valor liberado/emprestado pelo banco"
                  />
                  <input
                    required
                    type="number"
                    placeholder="Valor a pagar (R$)"
                    value={formEmprestimoBancario.valorAPagar}
                    onChange={(e) => setFormEmprestimoBancario({ ...formEmprestimoBancario, valorAPagar: e.target.value })}
                    className="text-sm px-3 py-2 rounded-sm outline-none"
                    style={{ border: "1px solid #DCD7C9", color: "#22252A", width: "100%", minWidth: 0 }}
                    title="O total a devolver, já com juros — é esse valor que vira parcelas em Contas a pagar"
                  />
                  <input
                    type="number"
                    min="1"
                    max="360"
                    placeholder="Nº de parcelas"
                    value={formEmprestimoBancario.numeroParcelas}
                    onChange={(e) => setFormEmprestimoBancario({ ...formEmprestimoBancario, numeroParcelas: e.target.value })}
                    className="text-sm px-3 py-2 rounded-sm outline-none"
                    style={{ border: "1px solid #DCD7C9", color: "#22252A", width: "100%", minWidth: 0 }}
                  />
                  <input
                    type="date"
                    value={dataBRparaISO(formEmprestimoBancario.dataContratacao)}
                    onChange={(e) => setFormEmprestimoBancario({ ...formEmprestimoBancario, dataContratacao: dataISOparaBR(e.target.value) })}
                    className="text-sm px-3 py-2 rounded-sm outline-none"
                    style={{ border: "1px solid #DCD7C9", color: "#22252A", width: "100%", minWidth: 0 }}
                    title="Data do 1º vencimento — as demais parcelas seguem mensalmente a partir dela"
                  />
                  <input
                    placeholder="Observações (opcional)"
                    value={formEmprestimoBancario.observacoes}
                    onChange={(e) => setFormEmprestimoBancario({ ...formEmprestimoBancario, observacoes: e.target.value })}
                    className="sm:col-span-3 text-sm px-3 py-2 rounded-sm outline-none"
                    style={{ border: "1px solid #DCD7C9", color: "#22252A", width: "100%", minWidth: 0 }}
                  />

                  {formEmprestimoBancario.valorAPagar && formEmprestimoBancario.dataContratacao && (() => {
                    const previaParcelas = gerarParcelasDespesaAvulsa({
                      id: "previa",
                      dataVencimento: formEmprestimoBancario.dataContratacao,
                      numeroParcelas: formEmprestimoBancario.numeroParcelas,
                      valorTotal: Number(formEmprestimoBancario.valorAPagar) || 0,
                    });
                    return (
                      <div
                        className="sm:col-span-3 p-3 rounded-sm"
                        style={{ background: "#FFFFFF", border: "1px solid #E4E0D6" }}
                      >
                        <div className="text-xs font-semibold mb-2" style={{ color: "#8A8D93" }}>
                          Distribuição das parcelas (calculada automaticamente):
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {previaParcelas.map((p) => (
                            <div
                              key={p.parcela}
                              className="text-xs px-2.5 py-1.5 rounded-sm"
                              style={{ background: "#F5F3EC", border: "1px solid #DCD7C9", color: "#22252A" }}
                            >
                              <span className="font-semibold">{p.parcela}</span> — {formatBRLShort(p.valor)} — vence {p.vencimento}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}

                  <button
                    type="submit"
                    className="sm:col-span-3 text-xs font-semibold px-3 py-2.5 rounded-sm"
                    style={{
                      fontFamily: "'Oswald', sans-serif",
                      letterSpacing: "0.03em",
                      color: "#F5F3EC",
                      background: "#E1590C",
                    }}
                  >
                    SALVAR EMPRÉSTIMO
                  </button>
                  <div className="sm:col-span-3 text-xs" style={{ color: "#8A8D93" }}>
                    As parcelas são lançadas automaticamente em Contas a pagar (e entram no Fluxo de caixa
                    sozinhas, junto com as demais contas).
                  </div>
                </form>
              )}

              {loadingEmprestimosBancarios ? (
                <div className="text-sm py-6 text-center" style={{ color: "#8A8D93" }}>
                  Carregando…
                </div>
              ) : emprestimosBancariosFiltrados.length === 0 ? (
                <div className="text-sm py-6 text-center" style={{ color: "#8A8D93" }}>
                  Nenhum empréstimo bancário cadastrado para esse filtro ainda.
                </div>
              ) : (
                <>
                  <div className="hidden sm:grid grid-cols-[1.6fr_0.8fr_0.9fr_0.9fr_0.6fr_0.8fr_auto] gap-3 px-3 pb-2 text-[11px] uppercase tracking-wide font-semibold" style={{ color: "#8A8D93" }}>
                    <span>Banco</span>
                    <span>Obra</span>
                    <span>Valor contratado</span>
                    <span>Valor a pagar</span>
                    <span>Parcelas</span>
                    <span>Contratado em</span>
                    <span></span>
                  </div>
                  <div className="space-y-2">
                    {emprestimosBancariosFiltrados.map((e) => (
                      <div
                        key={e.id}
                        className="grid grid-cols-2 sm:grid-cols-[1.6fr_0.8fr_0.9fr_0.9fr_0.6fr_0.8fr_auto] gap-2 sm:gap-3 items-center rounded-sm px-3 py-3"
                        style={{ background: "#FFFFFF", border: "1px solid #E4E0D6" }}
                      >
                        <span className="text-sm font-semibold min-w-0" style={{ color: "#22252A" }}>{e.banco}</span>
                        <span className="text-xs" style={{ color: "#6B6F76" }}>{e.obra}</span>
                        <span className="text-xs" style={{ color: "#6B6F76", fontFamily: "'IBM Plex Mono', monospace" }}>
                          {formatBRLShort(e.valorContratado)}
                        </span>
                        <span className="text-xs" style={{ color: "#B23A2E", fontFamily: "'IBM Plex Mono', monospace" }}>
                          {formatBRLShort(e.valorAPagar)}
                        </span>
                        <span className="text-xs" style={{ color: "#6B6F76" }}>{e.numeroParcelas}x</span>
                        <span className="text-xs" style={{ color: "#6B6F76" }}>{e.dataContratacao}</span>
                        <button
                          onClick={() => handleDeleteEmprestimoBancario(e.id)}
                          className="text-xs w-fit"
                          style={{ color: "#B23A2E" }}
                          title="Excluir empréstimo e as parcelas geradas em Contas a pagar"
                        >
                          Excluir
                        </button>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </section>

            <p className="mt-6 text-xs" style={{ color: "#6B6F76" }}>
              O "valor a pagar" (já com juros, se houver) é dividido pelo número de parcelas e lançado em
              Contas a pagar — a 1ª parcela vence na data informada, e as demais mensalmente a partir daí.
              Essas parcelas entram no Fluxo de caixa junto com as demais contas a pagar.
            </p>
          </>
        )}

        {activeTab === "documentos" && (
          <>
            <div className="flex flex-wrap gap-3 mb-8">
              <KpiCard eyebrow="Documentos anexados" value={`${documentos.length}`} sub="no total" />
              <KpiCard
                eyebrow="Vencidos"
                value={`${documentosVencidos}`}
                sub="precisam de atenção"
                accent={documentosVencidos > 0 ? "#B23A2E" : "#22252A"}
              />
              <KpiCard
                eyebrow="Vencendo em 30 dias"
                value={`${documentosVencendo}`}
                sub="renovar em breve"
                accent={documentosVencendo > 0 ? "#B4590C" : "#22252A"}
              />
              <KpiCard
                eyebrow="Documentos pendentes"
                value={`${essenciaisPendentes.length}`}
                sub={essenciaisPendentes.length > 0 ? essenciaisPendentes.join(", ") : "todos anexados"}
                accent={essenciaisPendentes.length > 0 ? "#B4590C" : "#4F7A5B"}
              />
            </div>

            {saveErrorDocumentos && (
              <div className="mb-4 text-xs px-3 py-2 rounded-sm" style={{ color: "#B23A2E", background: "#F8E3E0" }}>
                {saveErrorDocumentos}
              </div>
            )}
            {uploadErrorDocumento && (
              <div className="mb-4 text-xs px-3 py-2 rounded-sm" style={{ color: "#B23A2E", background: "#F8E3E0" }}>
                {uploadErrorDocumento}
              </div>
            )}

            {DOCUMENTOS_ESSENCIAIS.map((categoria) => {
              const docsCategoria = documentos.filter((d) => d.categoria === categoria);
              return (
                <section
                  key={categoria}
                  className="mb-4 rounded-md p-5 border"
                  style={{ background: "#F5F3EC", borderColor: "#DCD7C9" }}
                >
                  <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                    <h2
                      className="text-sm uppercase tracking-[0.12em] font-semibold"
                      style={{ color: "#22252A", fontFamily: "'Oswald', sans-serif" }}
                    >
                      {categoria}
                    </h2>
                    <label
                      className="text-xs font-semibold px-3 py-1.5 rounded-sm cursor-pointer"
                      style={{
                        fontFamily: "'Oswald', sans-serif",
                        letterSpacing: "0.03em",
                        color: "#F5F3EC",
                        background: "#3D6E8C",
                      }}
                    >
                      {uploadingCategoria === categoria ? "ANEXANDO…" : "📎 ANEXAR ARQUIVO"}
                      <input
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png"
                        onChange={(e) => {
                          const file = e.target.files[0];
                          e.target.value = "";
                          handleAnexarDocumentoCategoria(categoria, file);
                        }}
                        disabled={uploadingCategoria !== null}
                        className="hidden"
                      />
                    </label>
                  </div>

                  {docsCategoria.length === 0 ? (
                    <div
                      className="text-xs px-3 py-2 rounded-sm w-fit"
                      style={{ color: "#B4590C", background: "#FBEBDB" }}
                    >
                      Pendente — nenhum documento anexado
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {docsCategoria.map((d) => {
                        const status = statusDocumentoDisplay(d);
                        const cfg = statusDocumentoConfig[status];
                        return (
                          <div
                            key={d.id}
                            className="grid grid-cols-2 sm:grid-cols-[1.2fr_0.9fr_0.8fr_0.8fr_0.8fr_auto] gap-2 sm:gap-3 items-center rounded-sm px-3 py-2.5"
                            style={{ background: "#FFFFFF", border: "1px solid #E4E0D6" }}
                          >
                            <input
                              value={d.nome}
                              onChange={(e) => handleUpdateDocumentoCampo(d.id, "nome", e.target.value)}
                              onBlur={handlePersistDocumentosBlur}
                              className="text-sm px-2 py-1.5 rounded-sm outline-none"
                              style={{ border: "1px solid #DCD7C9", color: "#22252A", width: "100%", minWidth: 0 }}
                            />
                            <input
                              placeholder="Número"
                              value={d.numero}
                              onChange={(e) => handleUpdateDocumentoCampo(d.id, "numero", e.target.value)}
                              onBlur={handlePersistDocumentosBlur}
                              className="text-xs px-2 py-1.5 rounded-sm outline-none"
                              style={{ border: "1px solid #DCD7C9", color: "#22252A", width: "100%", minWidth: 0 }}
                            />
                            <input
                              type="date"
                              title="Emissão"
                              value={dataBRparaISO(d.dataEmissao)}
                              onChange={(e) => handleUpdateDocumentoCampo(d.id, "dataEmissao", dataISOparaBR(e.target.value))}
                              onBlur={handlePersistDocumentosBlur}
                              className="text-xs px-2 py-1.5 rounded-sm outline-none"
                              style={{ border: "1px solid #DCD7C9", color: "#22252A", width: "100%", minWidth: 0 }}
                            />
                            <input
                              type="date"
                              title="Validade"
                              value={dataBRparaISO(d.validade)}
                              onChange={(e) => handleUpdateDocumentoCampo(d.id, "validade", dataISOparaBR(e.target.value))}
                              onBlur={handlePersistDocumentosBlur}
                              className="text-xs px-2 py-1.5 rounded-sm outline-none"
                              style={{ border: "1px solid #DCD7C9", color: "#22252A", width: "100%", minWidth: 0 }}
                            />
                            <span
                              className="text-[10px] uppercase tracking-wide font-semibold px-2 py-1 rounded-full text-center w-fit"
                              style={{ color: cfg.color, background: cfg.bg }}
                            >
                              {cfg.label}
                            </span>
                            <div className="flex items-center gap-3">
                              <button
                                onClick={() => handleAbrirDocumento(d)}
                                className="text-xs w-fit font-semibold"
                                style={{ color: "#3D6E8C" }}
                                title={d.arquivoNome}
                              >
                                {abrindoDocumentoId === d.id ? "Abrindo…" : "Abrir"}
                              </button>
                              <button
                                onClick={() => handleEnviarWhatsapp(d)}
                                className="text-xs w-fit font-semibold"
                                style={{ color: "#4F7A5B" }}
                                title="Enviar este documento pelo WhatsApp"
                              >
                                {enviandoWhatsappId === d.id ? "Enviando…" : "WhatsApp"}
                              </button>
                              <button
                                onClick={() => handleDeleteDocumento(d.id)}
                                className="text-xs w-fit"
                                style={{ color: "#B23A2E" }}
                                title="Excluir documento"
                              >
                                Excluir
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              );
            })}

            <section
              className="rounded-md p-5 border"
              style={{ background: "#F5F3EC", borderColor: "#DCD7C9" }}
            >
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <h2
                  className="text-sm uppercase tracking-[0.12em] font-semibold"
                  style={{ color: "#22252A", fontFamily: "'Oswald', sans-serif" }}
                >
                  Outros documentos
                </h2>
                <button
                  onClick={() => setShowFormDocumento((s) => !s)}
                  className="text-xs font-semibold px-3 py-1.5 rounded-sm"
                  style={{
                    fontFamily: "'Oswald', sans-serif",
                    letterSpacing: "0.03em",
                    color: "#F5F3EC",
                    background: "#3D6E8C",
                  }}
                >
                  {showFormDocumento ? "CANCELAR" : "+ NOVO DOCUMENTO"}
                </button>
              </div>

              {showFormDocumento && (
                <form
                  onSubmit={handleAddDocumento}
                  className="mb-5 p-4 rounded-sm grid grid-cols-1 sm:grid-cols-3 gap-3"
                  style={{ background: "#FFFFFF", border: "1px solid #E4E0D6" }}
                >
                  <div className="sm:col-span-3 flex items-center gap-3 flex-wrap">
                    <label
                      className="text-xs font-semibold px-3 py-1.5 rounded-sm cursor-pointer truncate max-w-full"
                      style={{
                        fontFamily: "'Oswald', sans-serif",
                        letterSpacing: "0.03em",
                        color: "#22252A",
                        background: "#E4E0D6",
                      }}
                      title={formDocumento.arquivo ? formDocumento.arquivo.name : "Anexar arquivo (PDF ou imagem)"}
                    >
                      {pdfReadingDocumento
                        ? "LENDO PDF…"
                        : formDocumento.arquivo
                        ? `📎 ${formDocumento.arquivo.name}`
                        : "📎 ANEXAR ARQUIVO (PDF/IMAGEM)"}
                      <input
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png"
                        onChange={handleFormDocumentoFile}
                        disabled={pdfReadingDocumento}
                        className="hidden"
                      />
                    </label>
                  </div>

                  {pdfImportedFieldsDocumento.length > 0 && (
                    <div className="sm:col-span-3 text-xs px-3 py-2 rounded-sm" style={{ color: "#4F7A5B", background: "#E8EEE8" }}>
                      Preenchido automaticamente: {pdfImportedFieldsDocumento.join(", ")}. Revise os demais campos.
                    </div>
                  )}

                  <input
                    required
                    placeholder="Nome do documento"
                    value={formDocumento.nome}
                    onChange={(e) => setFormDocumento({ ...formDocumento, nome: e.target.value })}
                    className="text-sm px-3 py-2 rounded-sm outline-none"
                    style={{ border: "1px solid #DCD7C9", color: "#22252A", width: "100%", minWidth: 0 }}
                  />
                  <input
                    placeholder="Número (opcional)"
                    value={formDocumento.numero}
                    onChange={(e) => setFormDocumento({ ...formDocumento, numero: e.target.value })}
                    className="text-sm px-3 py-2 rounded-sm outline-none"
                    style={{ border: "1px solid #DCD7C9", color: "#22252A", width: "100%", minWidth: 0 }}
                  />
                  <input
                    type="date"
                    title="Data de emissão (opcional)"
                    value={dataBRparaISO(formDocumento.dataEmissao)}
                    onChange={(e) => setFormDocumento({ ...formDocumento, dataEmissao: dataISOparaBR(e.target.value) })}
                    className="text-sm px-3 py-2 rounded-sm outline-none"
                    style={{ border: "1px solid #DCD7C9", color: "#22252A", width: "100%", minWidth: 0 }}
                  />
                  <label className="flex flex-col gap-1">
                    <input
                      type="date"
                      title="Validade (em branco se não expira)"
                      value={dataBRparaISO(formDocumento.validade)}
                      onChange={(e) => setFormDocumento({ ...formDocumento, validade: dataISOparaBR(e.target.value) })}
                      className="text-sm px-3 py-2 rounded-sm outline-none"
                      style={{ border: "1px solid #DCD7C9", color: "#22252A", width: "100%", minWidth: 0 }}
                    />
                    <span className="text-[10px]" style={{ color: "#8A8D93" }}>Validade — deixe em branco se não expira</span>
                  </label>
                  <input
                    placeholder="Observação (opcional)"
                    value={formDocumento.observacao}
                    onChange={(e) => setFormDocumento({ ...formDocumento, observacao: e.target.value })}
                    className="sm:col-span-2 text-sm px-3 py-2 rounded-sm outline-none"
                    style={{ border: "1px solid #DCD7C9", color: "#22252A", width: "100%", minWidth: 0 }}
                  />

                  <button
                    type="submit"
                    disabled={uploadingDocumento}
                    className="sm:col-span-3 text-xs font-semibold px-3 py-2.5 rounded-sm"
                    style={{
                      fontFamily: "'Oswald', sans-serif",
                      letterSpacing: "0.03em",
                      color: "#F5F3EC",
                      background: "#E1590C",
                      opacity: uploadingDocumento ? 0.7 : 1,
                    }}
                  >
                    {uploadingDocumento ? "SALVANDO…" : "SALVAR DOCUMENTO"}
                  </button>
                </form>
              )}

              {loadingDocumentos ? (
                <div className="text-sm py-6 text-center" style={{ color: "#8A8D93" }}>
                  Carregando documentos…
                </div>
              ) : documentos.filter((d) => d.categoria === "Outro").length === 0 ? (
                <div className="text-sm py-6 text-center" style={{ color: "#8A8D93" }}>
                  Nenhum outro documento anexado ainda.
                </div>
              ) : (
                <div className="space-y-2">
                  {documentos
                    .filter((d) => d.categoria === "Outro")
                    .map((d) => {
                      const status = statusDocumentoDisplay(d);
                      const cfg = statusDocumentoConfig[status];
                      return (
                        <div
                          key={d.id}
                          className="grid grid-cols-2 sm:grid-cols-[2fr_0.9fr_0.8fr_0.8fr_0.9fr_auto] gap-2 sm:gap-3 items-center rounded-sm px-3 py-3"
                          style={{ background: "#FFFFFF", border: "1px solid #E4E0D6" }}
                        >
                          <span className="text-sm font-semibold min-w-0" style={{ color: "#22252A" }}>{d.nome}</span>
                          <span
                            className="text-xs"
                            style={{ color: "#6B6F76", fontFamily: "'IBM Plex Mono', monospace" }}
                          >
                            {d.numero || "—"}
                          </span>
                          <span
                            className="text-xs"
                            style={{ color: "#6B6F76", fontFamily: "'IBM Plex Mono', monospace" }}
                          >
                            {d.dataEmissao || "—"}
                          </span>
                          <span
                            className="text-xs"
                            style={{ color: "#6B6F76", fontFamily: "'IBM Plex Mono', monospace" }}
                          >
                            {d.validade || "—"}
                          </span>
                          <span
                            className="text-[10px] uppercase tracking-wide font-semibold px-2 py-1 rounded-full text-center w-fit"
                            style={{ color: cfg.color, background: cfg.bg }}
                          >
                            {cfg.label}
                          </span>
                          <div className="flex items-center gap-3">
                            {d.arquivoNome ? (
                              <>
                                <button
                                  onClick={() => handleAbrirDocumento(d)}
                                  className="text-xs w-fit font-semibold"
                                  style={{ color: "#3D6E8C" }}
                                  title={d.arquivoNome}
                                >
                                  {abrindoDocumentoId === d.id ? "Abrindo…" : "Abrir"}
                                </button>
                                <button
                                  onClick={() => handleEnviarWhatsapp(d)}
                                  className="text-xs w-fit font-semibold"
                                  style={{ color: "#4F7A5B" }}
                                  title="Enviar este documento pelo WhatsApp"
                                >
                                  {enviandoWhatsappId === d.id ? "Enviando…" : "WhatsApp"}
                                </button>
                              </>
                            ) : (
                              <span className="text-xs" style={{ color: "#8A8D93" }}>Sem arquivo</span>
                            )}
                            <button
                              onClick={() => handleDeleteDocumento(d.id)}
                              className="text-xs w-fit"
                              style={{ color: "#B23A2E" }}
                              title="Excluir documento"
                            >
                              Excluir
                            </button>
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </section>

            <p className="mt-6 text-xs" style={{ color: "#6B6F76" }}>
              Os arquivos ficam salvos no armazenamento deste painel (visível só para você), com limite
              recomendado de 3 MB por documento. Para arquivos maiores, mantenha o original em outro lugar
              e registre aqui apenas os dados (número, datas, observação). O botão "WhatsApp" tenta abrir o
              menu de compartilhar do aparelho com o arquivo já anexado (funciona melhor no celular); quando
              isso não é possível, ele baixa o arquivo e abre o WhatsApp para você anexar manualmente.
            </p>
          </>
        )}

        {activeTab === "fornecedores" && (
          <>
            <div className="flex justify-end mb-4">
              <button
                onClick={() => {
                  setTipoRelatorio(null);
                  setModoRelatorio(true);
                }}
                className="text-xs font-semibold px-3 py-1.5 rounded-sm"
                style={{ fontFamily: "'Oswald', sans-serif", letterSpacing: "0.03em", color: "#F5F3EC", background: "#3D6E8C" }}
              >
                📄 GERAR RELATÓRIO
              </button>
            </div>

            <div className="flex flex-wrap gap-3 mb-4">
              <KpiCard eyebrow="Total contratado" value={formatBRLShort(totalContratadoFornecedores)} sub={formatBRL(totalContratadoFornecedores)} />
              <KpiCard
                eyebrow="Vencendo em 30 dias"
                value={`${contratosFornecedoresVencendo}`}
                sub="renovar em breve"
                accent={contratosFornecedoresVencendo > 0 ? "#B4590C" : "#22252A"}
              />
              <KpiCard
                eyebrow="Vencidos"
                value={`${contratosFornecedoresVencidos}`}
                sub="precisam de atenção"
                accent={contratosFornecedoresVencidos > 0 ? "#B23A2E" : "#22252A"}
              />
              <KpiCard eyebrow="Ativos" value={`${contratosFornecedoresAtivos}`} sub="dentro do prazo" accent="#4F7A5B" />
            </div>

            <div className="mb-4 flex items-center gap-2 flex-wrap">
              <label
                className="text-xs font-semibold uppercase tracking-wide"
                style={{ color: "#8A8D93", fontFamily: "'Oswald', sans-serif" }}
              >
                Filtrar por obra:
              </label>
              <select
                value={filtroObraFornecedores}
                onChange={(e) => setFiltroObraFornecedores(e.target.value)}
                className="text-sm px-3 py-1.5 rounded-sm outline-none"
                style={{ border: "1px solid #DCD7C9", color: "#22252A", background: "#FFFFFF" }}
              >
                <option value="">Todas as obras</option>
                {NOMES_OBRAS.map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </div>

            <section
              className="rounded-md p-5 border"
              style={{ background: "#F5F3EC", borderColor: "#DCD7C9" }}
            >
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <h2
                  className="text-sm uppercase tracking-[0.12em] font-semibold"
                  style={{ color: "#22252A", fontFamily: "'Oswald', sans-serif" }}
                >
                  Contratos de fornecedores
                </h2>
                <button
                  onClick={() => setShowFormFornecedor((s) => !s)}
                  className="text-xs font-semibold px-3 py-1.5 rounded-sm"
                  style={{
                    fontFamily: "'Oswald', sans-serif",
                    letterSpacing: "0.03em",
                    color: "#F5F3EC",
                    background: "#3D6E8C",
                  }}
                >
                  {showFormFornecedor ? "CANCELAR" : "+ NOVO CONTRATO"}
                </button>
              </div>

              {saveErrorFornecedores && (
                <div className="mb-3 text-xs px-3 py-2 rounded-sm" style={{ color: "#B23A2E", background: "#F8E3E0" }}>
                  {saveErrorFornecedores}
                </div>
              )}

              {showFormFornecedor && (
                <form
                  onSubmit={handleAddContratoFornecedor}
                  className="mb-5 p-4 rounded-sm grid grid-cols-1 sm:grid-cols-3 gap-3"
                  style={{ background: "#FFFFFF", border: "1px solid #E4E0D6" }}
                >
                  <div className="sm:col-span-3 flex items-center gap-3 flex-wrap">
                    <label
                      className="text-xs font-semibold px-3 py-1.5 rounded-sm cursor-pointer truncate max-w-full"
                      style={{
                        fontFamily: "'Oswald', sans-serif",
                        letterSpacing: "0.03em",
                        color: "#22252A",
                        background: "#E4E0D6",
                      }}
                    >
                      {pdfImportingFornecedor
                        ? "LENDO PDF…"
                        : formFornecedor.arquivo
                        ? `📎 ${formFornecedor.arquivo.name}`
                        : "📎 ANEXAR CONTRATO (PDF/IMAGEM)"}
                      <input
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png"
                        onChange={handleFormFornecedorFile}
                        disabled={pdfImportingFornecedor}
                        className="hidden"
                      />
                    </label>
                  </div>

                  {pdfImportErrorFornecedor && (
                    <div className="sm:col-span-3 text-xs px-3 py-2 rounded-sm" style={{ color: "#B23A2E", background: "#F8E3E0" }}>
                      {pdfImportErrorFornecedor}
                    </div>
                  )}
                  {pdfImportedFieldsFornecedor.length > 0 && (
                    <div className="sm:col-span-3 text-xs px-3 py-2 rounded-sm" style={{ color: "#4F7A5B", background: "#E8EEE8" }}>
                      Preenchido automaticamente: {pdfImportedFieldsFornecedor.join(", ")}. Revise os demais campos.
                    </div>
                  )}

                  <input
                    required
                    placeholder="Fornecedor / subempreiteiro"
                    value={formFornecedor.fornecedor}
                    onChange={(e) => setFormFornecedor({ ...formFornecedor, fornecedor: e.target.value })}
                    className="text-sm px-3 py-2 rounded-sm outline-none"
                    style={{ border: "1px solid #DCD7C9", color: "#22252A", width: "100%", minWidth: 0 }}
                  />
                  <input
                    placeholder="CNPJ (opcional)"
                    value={formFornecedor.cnpj}
                    onChange={(e) => setFormFornecedor({ ...formFornecedor, cnpj: e.target.value })}
                    className="text-sm px-3 py-2 rounded-sm outline-none"
                    style={{ border: "1px solid #DCD7C9", color: "#22252A", width: "100%", minWidth: 0 }}
                  />
                  <select
                    value={formFornecedor.obra}
                    onChange={(e) => setFormFornecedor({ ...formFornecedor, obra: e.target.value })}
                    className="text-sm px-3 py-2 rounded-sm outline-none"
                    style={{ border: "1px solid #DCD7C9", color: "#22252A", width: "100%", minWidth: 0 }}
                  >
                    {NOMES_OBRAS.map((o) => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </select>
                  <select
                    value={formFornecedor.tipo}
                    onChange={(e) => setFormFornecedor({ ...formFornecedor, tipo: e.target.value })}
                    className="text-sm px-3 py-2 rounded-sm outline-none"
                    style={{ border: "1px solid #DCD7C9", color: "#22252A", width: "100%", minWidth: 0 }}
                  >
                    {TIPOS_FORNECEDOR.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                  <input
                    required
                    type="number"
                    placeholder="Valor do contrato (R$)"
                    value={formFornecedor.valor}
                    onChange={(e) => setFormFornecedor({ ...formFornecedor, valor: e.target.value })}
                    className="text-sm px-3 py-2 rounded-sm outline-none"
                    style={{ border: "1px solid #DCD7C9", color: "#22252A", width: "100%", minWidth: 0 }}
                  />
                  <input
                    type="number"
                    min="1"
                    max="60"
                    placeholder="Nº de parcelas a pagar"
                    value={formFornecedor.numeroParcelas}
                    onChange={(e) => setFormFornecedor({ ...formFornecedor, numeroParcelas: e.target.value })}
                    className="text-sm px-3 py-2 rounded-sm outline-none"
                    style={{ border: "1px solid #DCD7C9", color: "#22252A", width: "100%", minWidth: 0 }}
                  />
                  <input
                    type="date"
                    title="Data de início"
                    value={dataBRparaISO(formFornecedor.dataInicio)}
                    onChange={(e) => setFormFornecedor({ ...formFornecedor, dataInicio: dataISOparaBR(e.target.value) })}
                    className="text-sm px-3 py-2 rounded-sm outline-none"
                    style={{ border: "1px solid #DCD7C9", color: "#22252A", width: "100%", minWidth: 0 }}
                  />
                  <input
                    type="date"
                    title="Data de término/prazo"
                    value={dataBRparaISO(formFornecedor.dataTermino)}
                    onChange={(e) => setFormFornecedor({ ...formFornecedor, dataTermino: dataISOparaBR(e.target.value) })}
                    className="text-sm px-3 py-2 rounded-sm outline-none"
                    style={{ border: "1px solid #DCD7C9", color: "#22252A", width: "100%", minWidth: 0 }}
                  />
                  <div className="text-xs flex items-center" style={{ color: "#8A8D93" }}>
                    As parcelas são lançadas automaticamente em Contas a pagar.
                  </div>
                  <input
                    placeholder="Objeto / escopo do contrato"
                    value={formFornecedor.objeto}
                    onChange={(e) => setFormFornecedor({ ...formFornecedor, objeto: e.target.value })}
                    className="sm:col-span-2 text-sm px-3 py-2 rounded-sm outline-none"
                    style={{ border: "1px solid #DCD7C9", color: "#22252A", width: "100%", minWidth: 0 }}
                  />
                  <input
                    placeholder="Observações (opcional)"
                    value={formFornecedor.observacoes}
                    onChange={(e) => setFormFornecedor({ ...formFornecedor, observacoes: e.target.value })}
                    className="sm:col-span-3 text-sm px-3 py-2 rounded-sm outline-none"
                    style={{ border: "1px solid #DCD7C9", color: "#22252A", width: "100%", minWidth: 0 }}
                  />

                  <button
                    type="submit"
                    className="sm:col-span-3 text-xs font-semibold px-3 py-2.5 rounded-sm"
                    style={{
                      fontFamily: "'Oswald', sans-serif",
                      letterSpacing: "0.03em",
                      color: "#F5F3EC",
                      background: "#E1590C",
                    }}
                  >
                    SALVAR CONTRATO
                  </button>
                </form>
              )}

              {loadingFornecedores ? (
                <div className="text-sm py-6 text-center" style={{ color: "#8A8D93" }}>
                  Carregando contratos…
                </div>
              ) : contratosFornecedoresFiltrados.length === 0 ? (
                <div className="text-sm py-6 text-center" style={{ color: "#8A8D93" }}>
                  {filtroObraFornecedores
                    ? "Nenhum contrato de fornecedor para esta obra."
                    : "Nenhum contrato de fornecedor cadastrado ainda."}
                </div>
              ) : (
                <>
                  <div className="hidden sm:grid grid-cols-[2fr_1fr_1fr_0.9fr_0.9fr_0.9fr_auto] gap-3 px-3 pb-2 text-[11px] uppercase tracking-wide font-semibold" style={{ color: "#8A8D93" }}>
                    <span>Fornecedor</span>
                    <span>Tipo</span>
                    <span>Obra</span>
                    <span>Valor</span>
                    <span>Término</span>
                    <span>Status</span>
                    <span></span>
                  </div>

                  <div className="space-y-2">
                    {contratosFornecedoresFiltrados
                      .slice()
                      .sort((a, b) => {
                        const da = diasRestantesContrato(a);
                        const db = diasRestantesContrato(b);
                        if (da === null) return 1;
                        if (db === null) return -1;
                        return da - db;
                      })
                      .map((c) => {
                        const status = statusContratoFornecedorDisplay(c);
                        const cfg = statusConfig[status];
                        return (
                          <div
                            key={c.id}
                            className="grid grid-cols-2 sm:grid-cols-[2fr_1fr_1fr_0.9fr_0.9fr_0.9fr_auto] gap-2 sm:gap-3 items-center rounded-sm px-3 py-3"
                            style={{ background: "#FFFFFF", border: "1px solid #E4E0D6" }}
                          >
                            <div className="min-w-0">
                              <div className="text-sm font-semibold" style={{ color: "#22252A" }}>{c.fornecedor}</div>
                              {c.objeto && (
                                <div className="text-xs" style={{ color: "#8A8D93" }}>{c.objeto}</div>
                              )}
                            </div>
                            <span className="text-xs" style={{ color: "#6B6F76" }}>{c.tipo}</span>
                            <span className="text-sm" style={{ color: "#22252A" }}>{c.obra}</span>
                            <span
                              className="text-sm"
                              style={{ color: "#22252A", fontFamily: "'IBM Plex Mono', monospace" }}
                            >
                              {formatBRLShort(c.valor)}
                            </span>
                            <span
                              className="text-xs"
                              style={{ color: "#6B6F76", fontFamily: "'IBM Plex Mono', monospace" }}
                            >
                              {c.dataTermino || "—"}
                            </span>
                            <span
                              className="text-[10px] uppercase tracking-wide font-semibold px-2 py-1 rounded-full text-center w-fit"
                              style={{ color: cfg.color, background: cfg.bg }}
                            >
                              {cfg.label}
                            </span>
                            <div className="flex items-center gap-3">
                              {c.arquivoNome && (
                                <button
                                  onClick={() => handleAbrirAnexoFornecedor(c)}
                                  className="text-xs w-fit font-semibold"
                                  style={{ color: "#3D6E8C" }}
                                  title={c.arquivoNome}
                                >
                                  Abrir
                                </button>
                              )}
                              <button
                                onClick={() => handleToggleEncerradoFornecedor(c.id)}
                                className="text-xs w-fit font-semibold"
                                style={{ color: c.encerrado ? "#8A8D93" : "#4F7A5B" }}
                              >
                                {c.encerrado ? "Reabrir" : "Encerrar"}
                              </button>
                              <button
                                onClick={() => handleDeleteContratoFornecedor(c.id)}
                                className="text-xs w-fit"
                                style={{ color: "#B23A2E" }}
                                title="Excluir contrato"
                              >
                                Excluir
                              </button>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </>
              )}
            </section>

            <p className="mt-6 text-xs" style={{ color: "#6B6F76" }}>
              O painel "Contratos de fornecedores e serviços — atenção a vencimentos" na Visão geral e o
              KPI "Contratos vencendo" são alimentados por esta aba e pela de Contratos de prestação de
              serviços. A extração automática do PDF é heurística — confira CNPJ, valor e datas antes de
              salvar.
            </p>
          </>
        )}

        {activeTab === "servicos" && (
          <>
            <div className="flex justify-end mb-4">
              <button
                onClick={() => {
                  setTipoRelatorio(null);
                  setModoRelatorio(true);
                }}
                className="text-xs font-semibold px-3 py-1.5 rounded-sm"
                style={{ fontFamily: "'Oswald', sans-serif", letterSpacing: "0.03em", color: "#F5F3EC", background: "#3D6E8C" }}
              >
                📄 GERAR RELATÓRIO
              </button>
            </div>

            <div className="flex flex-wrap gap-3 mb-4">
              <KpiCard eyebrow="Total contratado" value={formatBRLShort(totalContratadoServicos)} sub={formatBRL(totalContratadoServicos)} />
              <KpiCard
                eyebrow="Vencendo em 30 dias"
                value={`${contratosServicosVencendo}`}
                sub="renovar em breve"
                accent={contratosServicosVencendo > 0 ? "#B4590C" : "#22252A"}
              />
              <KpiCard
                eyebrow="Vencidos"
                value={`${contratosServicosVencidos}`}
                sub="precisam de atenção"
                accent={contratosServicosVencidos > 0 ? "#B23A2E" : "#22252A"}
              />
              <KpiCard eyebrow="Ativos" value={`${contratosServicosAtivos}`} sub="dentro do prazo" accent="#4F7A5B" />
            </div>

            <div className="mb-4 flex items-center gap-2 flex-wrap">
              <label
                className="text-xs font-semibold uppercase tracking-wide"
                style={{ color: "#8A8D93", fontFamily: "'Oswald', sans-serif" }}
              >
                Filtrar por obra:
              </label>
              <select
                value={filtroObraServicos}
                onChange={(e) => setFiltroObraServicos(e.target.value)}
                className="text-sm px-3 py-1.5 rounded-sm outline-none"
                style={{ border: "1px solid #DCD7C9", color: "#22252A", background: "#FFFFFF" }}
              >
                <option value="">Todas as obras</option>
                {NOMES_OBRAS.map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </div>

            <section
              className="rounded-md p-5 border"
              style={{ background: "#F5F3EC", borderColor: "#DCD7C9" }}
            >
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <h2
                  className="text-sm uppercase tracking-[0.12em] font-semibold"
                  style={{ color: "#22252A", fontFamily: "'Oswald', sans-serif" }}
                >
                  Contratos de prestação de serviços
                </h2>
                <button
                  onClick={() => setShowFormServico((s) => !s)}
                  className="text-xs font-semibold px-3 py-1.5 rounded-sm"
                  style={{
                    fontFamily: "'Oswald', sans-serif",
                    letterSpacing: "0.03em",
                    color: "#F5F3EC",
                    background: "#3D6E8C",
                  }}
                >
                  {showFormServico ? "CANCELAR" : "+ NOVO CONTRATO"}
                </button>
              </div>

              {saveErrorServicos && (
                <div className="mb-3 text-xs px-3 py-2 rounded-sm" style={{ color: "#B23A2E", background: "#F8E3E0" }}>
                  {saveErrorServicos}
                </div>
              )}

              {showFormServico && (
                <form
                  onSubmit={handleAddContratoServico}
                  className="mb-5 p-4 rounded-sm grid grid-cols-1 sm:grid-cols-3 gap-3"
                  style={{ background: "#FFFFFF", border: "1px solid #E4E0D6" }}
                >
                  <div className="sm:col-span-3 flex items-center gap-3 flex-wrap">
                    <label
                      className="text-xs font-semibold px-3 py-1.5 rounded-sm cursor-pointer truncate max-w-full"
                      style={{
                        fontFamily: "'Oswald', sans-serif",
                        letterSpacing: "0.03em",
                        color: "#22252A",
                        background: "#E4E0D6",
                      }}
                    >
                      {pdfImportingServico
                        ? "LENDO PDF…"
                        : formServico.arquivo
                        ? `📎 ${formServico.arquivo.name}`
                        : "📎 ANEXAR CONTRATO (PDF/IMAGEM)"}
                      <input
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png"
                        onChange={handleFormServicoFile}
                        disabled={pdfImportingServico}
                        className="hidden"
                      />
                    </label>
                  </div>

                  {pdfImportErrorServico && (
                    <div className="sm:col-span-3 text-xs px-3 py-2 rounded-sm" style={{ color: "#B23A2E", background: "#F8E3E0" }}>
                      {pdfImportErrorServico}
                    </div>
                  )}
                  {pdfImportedFieldsServico.length > 0 && (
                    <div className="sm:col-span-3 text-xs px-3 py-2 rounded-sm" style={{ color: "#4F7A5B", background: "#E8EEE8" }}>
                      Preenchido automaticamente: {pdfImportedFieldsServico.join(", ")}. Revise os demais campos.
                    </div>
                  )}

                  <input
                    required
                    placeholder="Prestador de serviço"
                    value={formServico.fornecedor}
                    onChange={(e) => setFormServico({ ...formServico, fornecedor: e.target.value })}
                    className="text-sm px-3 py-2 rounded-sm outline-none"
                    style={{ border: "1px solid #DCD7C9", color: "#22252A", width: "100%", minWidth: 0 }}
                  />
                  <input
                    placeholder="CNPJ/CPF (opcional)"
                    value={formServico.cnpj}
                    onChange={(e) => setFormServico({ ...formServico, cnpj: e.target.value })}
                    className="text-sm px-3 py-2 rounded-sm outline-none"
                    style={{ border: "1px solid #DCD7C9", color: "#22252A", width: "100%", minWidth: 0 }}
                  />
                  <select
                    value={formServico.obra}
                    onChange={(e) => setFormServico({ ...formServico, obra: e.target.value })}
                    className="text-sm px-3 py-2 rounded-sm outline-none"
                    style={{ border: "1px solid #DCD7C9", color: "#22252A", width: "100%", minWidth: 0 }}
                  >
                    {NOMES_OBRAS.map((o) => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </select>
                  <input
                    required
                    type="number"
                    placeholder="Valor do contrato (R$)"
                    value={formServico.valor}
                    onChange={(e) => setFormServico({ ...formServico, valor: e.target.value })}
                    className="text-sm px-3 py-2 rounded-sm outline-none"
                    style={{ border: "1px solid #DCD7C9", color: "#22252A", width: "100%", minWidth: 0 }}
                  />
                  <input
                    type="number"
                    min="1"
                    max="60"
                    placeholder="Nº de parcelas a pagar"
                    value={formServico.numeroParcelas}
                    onChange={(e) => setFormServico({ ...formServico, numeroParcelas: e.target.value })}
                    className="text-sm px-3 py-2 rounded-sm outline-none"
                    style={{ border: "1px solid #DCD7C9", color: "#22252A", width: "100%", minWidth: 0 }}
                  />
                  <input
                    type="date"
                    title="Data de início"
                    value={dataBRparaISO(formServico.dataInicio)}
                    onChange={(e) => setFormServico({ ...formServico, dataInicio: dataISOparaBR(e.target.value) })}
                    className="text-sm px-3 py-2 rounded-sm outline-none"
                    style={{ border: "1px solid #DCD7C9", color: "#22252A", width: "100%", minWidth: 0 }}
                  />
                  <input
                    type="date"
                    title="Data de término/prazo"
                    value={dataBRparaISO(formServico.dataTermino)}
                    onChange={(e) => setFormServico({ ...formServico, dataTermino: dataISOparaBR(e.target.value) })}
                    className="text-sm px-3 py-2 rounded-sm outline-none"
                    style={{ border: "1px solid #DCD7C9", color: "#22252A", width: "100%", minWidth: 0 }}
                  />
                  <div className="text-xs flex items-center" style={{ color: "#8A8D93" }}>
                    As parcelas são lançadas automaticamente em Contas a pagar.
                  </div>
                  <input
                    placeholder="Objeto / escopo do serviço"
                    value={formServico.objeto}
                    onChange={(e) => setFormServico({ ...formServico, objeto: e.target.value })}
                    className="sm:col-span-2 text-sm px-3 py-2 rounded-sm outline-none"
                    style={{ border: "1px solid #DCD7C9", color: "#22252A", width: "100%", minWidth: 0 }}
                  />
                  <input
                    placeholder="Observações (opcional)"
                    value={formServico.observacoes}
                    onChange={(e) => setFormServico({ ...formServico, observacoes: e.target.value })}
                    className="sm:col-span-3 text-sm px-3 py-2 rounded-sm outline-none"
                    style={{ border: "1px solid #DCD7C9", color: "#22252A", width: "100%", minWidth: 0 }}
                  />

                  <button
                    type="submit"
                    className="sm:col-span-3 text-xs font-semibold px-3 py-2.5 rounded-sm"
                    style={{
                      fontFamily: "'Oswald', sans-serif",
                      letterSpacing: "0.03em",
                      color: "#F5F3EC",
                      background: "#E1590C",
                    }}
                  >
                    SALVAR CONTRATO
                  </button>
                </form>
              )}

              {loadingServicos ? (
                <div className="text-sm py-6 text-center" style={{ color: "#8A8D93" }}>
                  Carregando contratos…
                </div>
              ) : contratosServicosFiltrados.length === 0 ? (
                <div className="text-sm py-6 text-center" style={{ color: "#8A8D93" }}>
                  {filtroObraServicos
                    ? "Nenhum contrato de serviço para esta obra."
                    : "Nenhum contrato de prestação de serviços cadastrado ainda."}
                </div>
              ) : (
                <>
                  <div className="hidden sm:grid grid-cols-[2.1fr_1fr_0.9fr_0.9fr_0.9fr_auto] gap-3 px-3 pb-2 text-[11px] uppercase tracking-wide font-semibold" style={{ color: "#8A8D93" }}>
                    <span>Prestador</span>
                    <span>Obra</span>
                    <span>Valor</span>
                    <span>Término</span>
                    <span>Status</span>
                    <span></span>
                  </div>

                  <div className="space-y-2">
                    {contratosServicosFiltrados
                      .slice()
                      .sort((a, b) => {
                        const da = diasRestantesContrato(a);
                        const db = diasRestantesContrato(b);
                        if (da === null) return 1;
                        if (db === null) return -1;
                        return da - db;
                      })
                      .map((c) => {
                        const status = statusContratoFornecedorDisplay(c);
                        const cfg = statusConfig[status];
                        return (
                          <div
                            key={c.id}
                            className="grid grid-cols-2 sm:grid-cols-[2.1fr_1fr_0.9fr_0.9fr_0.9fr_auto] gap-2 sm:gap-3 items-center rounded-sm px-3 py-3"
                            style={{ background: "#FFFFFF", border: "1px solid #E4E0D6" }}
                          >
                            <div className="min-w-0">
                              <div className="text-sm font-semibold" style={{ color: "#22252A" }}>{c.fornecedor}</div>
                              {c.objeto && (
                                <div className="text-xs" style={{ color: "#8A8D93" }}>{c.objeto}</div>
                              )}
                            </div>
                            <span className="text-sm" style={{ color: "#22252A" }}>{c.obra}</span>
                            <span
                              className="text-sm"
                              style={{ color: "#22252A", fontFamily: "'IBM Plex Mono', monospace" }}
                            >
                              {formatBRLShort(c.valor)}
                            </span>
                            <span
                              className="text-xs"
                              style={{ color: "#6B6F76", fontFamily: "'IBM Plex Mono', monospace" }}
                            >
                              {c.dataTermino || "—"}
                            </span>
                            <span
                              className="text-[10px] uppercase tracking-wide font-semibold px-2 py-1 rounded-full text-center w-fit"
                              style={{ color: cfg.color, background: cfg.bg }}
                            >
                              {cfg.label}
                            </span>
                            <div className="flex items-center gap-3">
                              {c.arquivoNome && (
                                <button
                                  onClick={() => handleAbrirAnexoServico(c)}
                                  className="text-xs w-fit font-semibold"
                                  style={{ color: "#3D6E8C" }}
                                  title={c.arquivoNome}
                                >
                                  Abrir
                                </button>
                              )}
                              <button
                                onClick={() => handleToggleEncerradoServico(c.id)}
                                className="text-xs w-fit font-semibold"
                                style={{ color: c.encerrado ? "#8A8D93" : "#4F7A5B" }}
                              >
                                {c.encerrado ? "Reabrir" : "Encerrar"}
                              </button>
                              <button
                                onClick={() => handleDeleteContratoServico(c.id)}
                                className="text-xs w-fit"
                                style={{ color: "#B23A2E" }}
                                title="Excluir contrato"
                              >
                                Excluir
                              </button>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </>
              )}
            </section>

            <p className="mt-6 text-xs" style={{ color: "#6B6F76" }}>
              Contratos de assessoria, consultoria e outros serviços prestados à empresa ou à obra (ex:
              contabilidade, jurídico, SESMT). Também alimenta o painel de vencimentos da Visão geral.
            </p>
          </>
        )}

        </>
        )}
      </div>
    </div>
  );
}
