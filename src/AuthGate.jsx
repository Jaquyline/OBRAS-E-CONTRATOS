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
  const [recEnviando,