import { createClient } from "@supabase/supabase-js";

// Estes dois valores identificam o projeto Supabase "OBRAS & CONTRATOS" e a
// chave pública de acesso a ele. Não são segredos: a própria Supabase chama
// essa chave de "publishable" e confirma que "pode ser compartilhada
// publicamente com segurança" — desde que a segurança por linha (RLS)
// esteja ativada nas tabelas, que é exatamente o que fizemos na tabela
// kv_store (só usuários logados conseguem ler/escrever, mesmo com a chave
// exposta aqui). Por isso não precisam ficar escondidos em variável de
// ambiente nem em nenhum outro lugar mais protegido.
const supabaseUrl = "https://jwernoyhesshbbfsmscy.supabase.co";
const supabaseKey = "sb_publishable_NnXU29l-hxQA8tpRuJsazw_OFgEd3RO";

export const supabase = createClient(supabaseUrl, supabaseKey);
