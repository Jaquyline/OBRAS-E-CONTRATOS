import React, { useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { supabase } from "./lib/supabaseClient";

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  padding: "9px 11px",
  borderRadius: 6,
  border: "1px solid rgba(255,255,255,0.15)",
  background: "rgba(255,255,255,0.04)",
  color: "#F2EFE6",
  fontSize: 14,
};

const labelStyle = { display: "block", color: "#E1590C", fontSize: 12, marginBottom: 4 };

const eyeButtonStyle = {
  position: "absolute",
  right: 8,
  top: "50%",
  transform: "translateY(-50%)",
  background: "none",
  border: "none",
  color: "#8B93A6",
  cursor: "pointer",
  padding: 2,
  display: "flex",
};

/**
 * Portão de login simples usando o Supabase Auth (e-mail + senha).
 * Enquanto não houver sessão autenticada, mostra a tela de login em vez do
 * painel. As contas de acesso são criadas direto no painel do Supabase
 * (Authentication → Users), sem cadastro público.
 *
 * Também cobre o fluxo de "esqueci minha senha": envia um e-mail de
 * recuperação pelo Supabase Auth e, quando a pessoa clica no link recebido,
 * mostra uma tela para definir uma nova senha antes de liberar o acesso.
 */
export default function AuthGate({ children }) {
  const [session, setSession] = useState(undefined); // undefined = carregando, null = deslogado
  const [recoveryMode, setRecoveryMode] = useState(false); // true = veio de um link de recuperação de senha
  const [view, setView] = useState("login"); // "login" | "recover"

  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  const [recEmail, setRecEmail] = useState("");
  const [recMsg, setRecMsg] = useState("");
  const [recErro, setRecErro] = useState("");
  const [recEnviando, setRecEnviando] = useState(false);

  const [novaSenha, setNovaSenha] = useState("");
  const [confirmaSenha, setConfirmaSenha] = useState("");
  const [mostrarNovaSenha, setMostrarNovaSenha] = useState(false);
  const [resetErro, setResetErro] = useState("");
  const [resetMsg, setResetMsg] = useState("");
  const [resetEnviando, setResetEnviando] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === "PASSWORD_RECOVERY") setRecoveryMode(true);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  async function handleLogin(e) {
    e.preventDefault();
    setErro("");
    setEnviando(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha });
    setEnviando(false);
    if (error) setErro("E-mail ou senha incorretos, ou essa conta ainda não foi criada no Supabase.");
  }

  async function handleLogout() {
    await supabase.auth.signOut();
  }

  async function handleRecover(e) {
    e.preventDefault();
    setRecErro("");
    setRecMsg("");
    setRecEnviando(true);
    const { error } = await supabase.auth.resetPasswordForEmail(recEmail.trim(), {
      redirectTo: window.location.origin,
    });
    setRecEnviando(false);
    if (error) {
      setRecErro("Não foi possível enviar o e-mail agora. Tente novamente em instantes.");
    } else {
      setRecMsg(
        "Se esse e-mail estiver cadastrado, você vai receber um link para redefinir sua senha em instantes. Confira também a caixa de spam."
      );
    }
  }

  async function handleResetPassword(e) {
    e.preventDefault();
    setResetErro("");
    setResetMsg("");
    if (novaSenha.length < 6) {
      setResetErro("A senha precisa ter pelo menos 6 caracteres.");
      return;
    }
    if (novaSenha !== confirmaSenha) {
      setResetErro("As senhas digitadas não são iguais.");
      return;
    }
    setResetEnviando(true);
    const { error } = await supabase.auth.updateUser({ password: novaSenha });
    setResetEnviando(false);
    if (error) {
      setResetErro("Não foi possível atualizar a senha. Tente pedir um novo link de recuperação.");
    } else {
      setResetMsg("Senha atualizada! Redirecionando...");
      setTimeout(() => {
        setRecoveryMode(false);
        setNovaSenha("");
        setConfirmaSenha("");
      }, 1200);
    }
  }

  if (session === undefined) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#22252A", color: "#F5F3EC", fontFamily: "sans-serif" }}>
        Carregando...
      </div>
    );
  }

  // Veio de um link de "esqueci minha senha" — pede a nova senha antes de liberar o painel
  if (recoveryMode) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#22252A", padding: 20 }}>
        <form onSubmit={handleResetPassword} style={{ width: "100%", maxWidth: 340, background: "#2A2E36", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: 28, fontFamily: "sans-serif" }}>
          <div style={{ color: "#F5F3EC", fontSize: 19, fontWeight: 600, marginBottom: 4 }}>Definir nova senha</div>
          <div style={{ color: "#8B93A6", fontSize: 13, marginBottom: 20 }}>Escolha uma nova senha para sua conta.</div>

          <label style={labelStyle}>Nova senha</label>
          <div style={{ position: "relative", marginBottom: 14 }}>
            <input
              type={mostrarNovaSenha ? "text" : "password"}
              required
              minLength={6}
              value={novaSenha}
              onChange={(e) => setNovaSenha(e.target.value)}
              style={{ ...inputStyle, paddingRight: 38 }}
            />
            <button
              type="button"
              onClick={() => setMostrarNovaSenha((v) => !v)}
              aria-label={mostrarNovaSenha ? "Ocultar senha" : "Mostrar senha"}
              style={eyeButtonStyle}
            >
              {mostrarNovaSenha ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>

          <label style={labelStyle}>Confirmar nova senha</label>
          <input
            type={mostrarNovaSenha ? "text" : "password"}
            required
            minLength={6}
            value={confirmaSenha}
            onChange={(e) => setConfirmaSenha(e.target.value)}
            style={{ ...inputStyle, marginBottom: 16 }}
          />

          {resetErro && <div style={{ color: "#E89A93", fontSize: 12.5, marginBottom: 14 }}>{resetErro}</div>}
          {resetMsg && <div style={{ color: "#9CD3A7", fontSize: 12.5, marginBottom: 14 }}>{resetMsg}</div>}

          <button
            type="submit"
            disabled={resetEnviando}
            style={{ width: "100%", padding: "10px 0", borderRadius: 6, border: "none", background: "#E1590C", color: "#22252A", fontWeight: 700, fontSize: 14, cursor: "pointer" }}
          >
            {resetEnviando ? "Salvando..." : "Salvar nova senha"}
          </button>
        </form>
      </div>
    );
  }

  if (!session) {
    if (view === "recover") {
      return (
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#22252A", padding: 20 }}>
          <form onSubmit={handleRecover} style={{ width: "100%", maxWidth: 340, background: "#2A2E36", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: 28, fontFamily: "sans-serif" }}>
            <div style={{ color: "#F5F3EC", fontSize: 19, fontWeight: 600, marginBottom: 4 }}>Recuperar senha</div>
            <div style={{ color: "#8B93A6", fontSize: 13, marginBottom: 20 }}>
              Informe seu e-mail para receber um link de redefinição de senha.
            </div>

            <label style={labelStyle}>E-mail</label>
            <input
              type="email"
              required
              value={recEmail}
              onChange={(e) => setRecEmail(e.target.value)}
              style={{ ...inputStyle, marginBottom: 14 }}
            />

            {recErro && <div style={{ color: "#E89A93", fontSize: 12.5, marginBottom: 14 }}>{recErro}</div>}
            {recMsg && <div style={{ color: "#9CD3A7", fontSize: 12.5, marginBottom: 14 }}>{recMsg}</div>}

            <button
              type="submit"
              disabled={recEnviando}
              style={{ width: "100%", padding: "10px 0", borderRadius: 6, border: "none", background: "#E1590C", color: "#22252A", fontWeight: 700, fontSize: 14, cursor: "pointer", marginBottom: 12 }}
            >
              {recEnviando ? "Enviando..." : "Enviar link de recuperação"}
            </button>

            <button
              type="button"
              onClick={() => {
                setView("login");
                setRecErro("");
                setRecMsg("");
              }}
              style={{ width: "100%", background: "none", border: "none", color: "#8B93A6", fontSize: 12.5, cursor: "pointer", textDecoration: "underline" }}
            >
              Voltar para o login
            </button>
          </form>
        </div>
      );
    }

    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#22252A", padding: 20 }}>
        <form onSubmit={handleLogin} style={{ width: "100%", maxWidth: 340, background: "#2A2E36", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: 28, fontFamily: "sans-serif" }}>
          <div style={{ color: "#F5F3EC", fontSize: 19, fontWeight: 600, marginBottom: 4 }}>Obras &amp; Contratos</div>
          <div style={{ color: "#8B93A6", fontSize: 13, marginBottom: 20 }}>Entre com sua conta para acessar o painel.</div>

          <label style={labelStyle}>E-mail</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ ...inputStyle, marginBottom: 14 }}
          />

          <label style={labelStyle}>Senha</label>
          <div style={{ position: "relative", marginBottom: 8 }}>
            <input
              type={mostrarSenha ? "text" : "password"}
              required
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              style={{ ...inputStyle, paddingRight: 38 }}
            />
            <button
              type="button"
              onClick={() => setMostrarSenha((v) => !v)}
              aria-label={mostrarSenha ? "Ocultar senha" : "Mostrar senha"}
              style={eyeButtonStyle}
            >
              {mostrarSenha ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>

          <div style={{ textAlign: "right", marginBottom: 16 }}>
            <button
              type="button"
              onClick={() => {
                setView("recover");
                setErro("");
              }}
              style={{ background: "none", border: "none", color: "#E1590C", fontSize: 12, cursor: "pointer", padding: 0 }}
            >
              Esqueci minha senha
            </button>
          </div>

          {erro && <div style={{ color: "#E89A93", fontSize: 12.5, marginBottom: 14 }}>{erro}</div>}
          <button
            type="submit"
            disabled={enviando}
            style={{ width: "100%", padding: "10px 0", borderRadius: 6, border: "none", background: "#E1590C", color: "#22252A", fontWeight: 700, fontSize: 14, cursor: "pointer" }}
          >
            {enviando ? "Entrando..." : "Entrar"}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div>
      <div style={{ position: "fixed", top: 14, right: 14, zIndex: 9999 }} className="no-print">
        <button
          onClick={handleLogout}
          style={{
            background: "#E1590C",
            border: "none",
            color: "#22252A",
            borderRadius: 6,
            padding: "8px 14px",
            fontSize: 12.5,
            fontWeight: 700,
            cursor: "pointer",
            boxShadow: "0 2px 10px rgba(0,0,0,0.4)",
            fontFamily: "sans-serif",
          }}
        >
          Sair ({session.user.email})
        </button>
      </div>
      {children}
    </div>
  );
}
