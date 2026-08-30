// storage-shim.js
//
// Substitui o `window.storage` original (da versão em artifact do Claude)
// por um armazenamento de verdade, guardado na nuvem via Supabase — usando
// a mesma tabela genérica de chave/valor (`kv_store`) que já foi criada no
// projeto "OBRAS & CONTRATOS" do Supabase.
//
// Mantém exatamente a mesma "forma" da API original (get/set/delete/list,
// mesmo formato de retorno), então o componente do painel
// (DashboardConstrutora.jsx) não precisa de NENHUMA alteração.
//
// Diferença em relação à versão anterior (localStorage): agora os dados
// ficam na nuvem, protegidos por login — acessíveis de qualquer computador
// em que você fizer login, não só deste navegador.
import { supabase } from "./lib/supabaseClient.js";

function instalarStorageShim() {
  if (typeof window === "undefined") return;

  window.storage = {
    async get(key, shared = false) {
      try {
        const { data, error } = await supabase
          .from("kv_store")
          .select("value")
          .eq("key", key)
          .maybeSingle();
        if (error) {
          console.error("storage.get falhou:", error);
          return null;
        }
        if (!data) return null;
        return { key, value: data.value, shared };
      } catch (err) {
        console.error("storage.get falhou:", err);
        return null;
      }
    },

    async set(key, value, shared = false) {
      try {
        const { error } = await supabase
          .from("kv_store")
          .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
        if (error) {
          console.error("storage.set falhou:", error);
          return null;
        }
        return { key, value, shared };
      } catch (err) {
        console.error("storage.set falhou:", err);
        return null;
      }
    },

    async delete(key, shared = false) {
      try {
        const { error } = await supabase.from("kv_store").delete().eq("key", key);
        if (error) {
          console.error("storage.delete falhou:", error);
          return null;
        }
        return { key, deleted: true, shared };
      } catch (err) {
        console.error("storage.delete falhou:", err);
        return null;
      }
    },

    async list(prefix = "", shared = false) {
      try {
        let query = supabase.from("kv_store").select("key");
        if (prefix) query = query.like("key", `${prefix}%`);
        const { data, error } = await query;
        if (error) return null;
        return { keys: (data || []).map((r) => r.key), prefix, shared };
      } catch (err) {
        return null;
      }
    },
  };
}

export default instalarStorageShim;