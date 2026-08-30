// storage-shim.js
//
// O painel foi originalmente construído como um artifact do Claude, que
// disponibiliza uma API `window.storage` (get/set/delete/list) para
// persistência entre sessões. Fora do Claude essa API não existe — este
// arquivo recria a mesma "forma" (mesmos métodos, mesma assinatura, mesmo
// formato de retorno) usando o localStorage do navegador por baixo dos
// panos, para que o componente do painel (DashboardConstrutora.jsx) não
// precise de nenhuma alteração.
//
// Importante: como usa localStorage, os dados ficam guardados só neste
// navegador, neste computador. Trocar de navegador, usar aba anônima, ou
// limpar os dados do site apaga o que foi salvo. Para uso por uma única
// pessoa, num navegador principal, isso é suficiente — não é um banco de
// dados compartilhado entre pessoas ou dispositivos.

const PREFIXO = "dashboard-obras-contratos";

function chaveCompleta(key, shared) {
  return `${PREFIXO}:${shared ? "shared" : "user"}:${key}`;
}

function instalarStorageShim() {
  if (typeof window === "undefined") return;

  window.storage = {
    async get(key, shared = false) {
      try {
        const raw = window.localStorage.getItem(chaveCompleta(key, shared));
        if (raw === null) return null;
        return { key, value: raw, shared };
      } catch (err) {
        console.error("storage.get falhou:", err);
        return null;
      }
    },

    async set(key, value, shared = false) {
      try {
        window.localStorage.setItem(chaveCompleta(key, shared), value);
        return { key, value, shared };
      } catch (err) {
        console.error("storage.set falhou:", err);
        return null;
      }
    },

    async delete(key, shared = false) {
      try {
        window.localStorage.removeItem(chaveCompleta(key, shared));
        return { key, deleted: true, shared };
      } catch (err) {
        console.error("storage.delete falhou:", err);
        return null;
      }
    },

    async list(prefix = "", shared = false) {
      try {
        const prefixoCompleto = chaveCompleta(prefix, shared);
        const marcador = `${PREFIXO}:${shared ? "shared" : "user"}:`;
        const keys = [];
        for (let i = 0; i < window.localStorage.length; i++) {
          const k = window.localStorage.key(i);
          if (k && k.startsWith(prefixoCompleto)) {
            keys.push(k.slice(marcador.length));
          }
        }
        return { keys, prefix, shared };
      } catch (err) {
        console.error("storage.list falhou:", err);
        return null;
      }
    },
  };
}

export default instalarStorageShim;
