import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import type { SiteConnectionStatus } from "@shared/site-connection";
import {
  connectSiteConnection,
  disconnectSiteConnection,
  getSiteConnectionStatus,
  testSiteConnection,
} from "@/lib/site-connection-api";

type SiteConnectionPanelProps = {
  /** Chave do operador OAuth; impede que dados de um operador sejam reutilizados. */
  operatorKey: string;
};

const DISCONNECTED_STATUS: SiteConnectionStatus = {
  connected: false,
  mode: "read_only",
  siteOrigin: "https://www.brazilhrproject.icu",
};

type ActionButtonProps = {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  tone?: "primary" | "secondary" | "danger";
};

function ActionButton({
  label,
  icon,
  onPress,
  disabled = false,
  loading = false,
  tone = "primary",
}: ActionButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionButton,
        tone === "secondary" && styles.actionButtonSecondary,
        tone === "danger" && styles.actionButtonDanger,
        (pressed || disabled) && styles.actionButtonMuted,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={tone === "primary" ? "#FFFFFF" : "#0C5666"} />
      ) : (
        <Ionicons
          color={tone === "primary" ? "#FFFFFF" : tone === "danger" ? "#A63D40" : "#0C5666"}
          name={icon}
          size={17}
        />
      )}
      <Text
        style={[
          styles.actionButtonText,
          tone !== "primary" && styles.actionButtonTextSecondary,
          tone === "danger" && styles.actionButtonTextDanger,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function formatCheckedAt(value?: string) {
  if (!value) return "Ainda não consultado";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Horário indisponível";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function friendlyError(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : "";

  if (message.includes("troca da senha")) {
    return "O site exige que você troque a senha diretamente nele antes de conectar o aplicativo.";
  }
  if (message.includes("captcha") || message.includes("bloque")) {
    return "O site bloqueou esta tentativa ou solicitou CAPTCHA. Aguarde ou resolva o desafio no site; o app não contorna essa proteção.";
  }
  if (message.includes("muitas tentativas") || message.includes("limitou temporariamente")) {
    return "As tentativas foram limitadas. Aguarde alguns minutos antes de tentar novamente.";
  }
  if (message.includes("network") || message.includes("fetch") || message.includes("indisponível") || message.includes("failed") || message.includes("alcançar")) {
    return "Não foi possível acessar o serviço de conexão agora. Tente novamente mais tarde.";
  }
  if (message.includes("nenhuma sessão do site") || message.includes("sessão do site expirou")) {
    return "A sessão de consulta do site expirou ou foi desconectada. Conecte sua conta novamente.";
  }
  if (message.includes("401") || message.includes("não autenticado") || message.includes("autenticado")) {
    return "Sua sessão do aplicativo expirou. Entre novamente para conectar o site.";
  }
  if (message.includes("403") || message.includes("acesso") || message.includes("permissão") || message.includes("não autorizado") || message.includes("não está autorizado")) {
    return "Seu operador do aplicativo ou sua conta no site não tem permissão para este teste.";
  }
  if (message.includes("senha") || message.includes("credencial") || message.includes("login") || message.includes("usuário")) {
    return "Não foi possível conectar. Confira o usuário e a senha da sua conta no site.";
  }
  if (message.includes("expirada") || message.includes("sessão")) {
    return "A sessão de consulta expirou. Conecte sua conta novamente.";
  }
  if (message.includes("resposta") || message.includes("validada")) {
    return "O serviço retornou dados inesperados. A conexão não foi confirmada.";
  }
  return "Não foi possível concluir a operação de conexão. Tente novamente.";
}

function StatusPill({ connected }: { connected: boolean }) {
  return (
    <View style={[styles.statusPill, connected ? styles.statusPillConnected : styles.statusPillIdle]}>
      <View style={[styles.statusDot, connected ? styles.statusDotConnected : styles.statusDotIdle]} />
      <Text style={[styles.statusPillText, connected ? styles.statusPillTextConnected : styles.statusPillTextIdle]}>
        {connected ? "Conectado para consulta" : "Não conectado"}
      </Text>
    </View>
  );
}

export function SiteConnectionPanel({ operatorKey }: SiteConnectionPanelProps) {
  const [status, setStatus] = useState<SiteConnectionStatus | null>(null);
  const [loading, setLoading] = useState(() => Boolean(operatorKey));
  const [errorMessage, setErrorMessage] = useState("");
  const [showCredentials, setShowCredentials] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const mountedRef = useRef(true);
  const requestIdRef = useRef(0);
  const passwordRef = useRef("");

  const isCurrentRequest = useCallback((requestId: number) => {
    return mountedRef.current && requestIdRef.current === requestId;
  }, []);

  const clearPassword = useCallback(() => {
    passwordRef.current = "";
    if (mountedRef.current) setPassword("");
  }, []);

  const clearCredentials = useCallback(() => {
    passwordRef.current = "";
    if (mountedRef.current) {
      setPassword("");
      setUsername("");
    }
  }, []);

  const updatePassword = (value: string) => {
    passwordRef.current = value;
    setPassword(value);
  };

  useEffect(() => {
    mountedRef.current = true;
    requestIdRef.current += 1;
    const requestId = requestIdRef.current;

    if (!operatorKey) {
      return () => {
        mountedRef.current = false;
        requestIdRef.current += 1;
        passwordRef.current = "";
      };
    }

    void getSiteConnectionStatus()
      .then((nextStatus) => {
        if (isCurrentRequest(requestId)) setStatus(nextStatus);
      })
      .catch((error: unknown) => {
        if (isCurrentRequest(requestId)) {
          setStatus(DISCONNECTED_STATUS);
          setErrorMessage(friendlyError(error));
        }
      })
      .finally(() => {
        if (isCurrentRequest(requestId)) setLoading(false);
      });

    return () => {
      mountedRef.current = false;
      requestIdRef.current += 1;
      passwordRef.current = "";
    };
  }, [isCurrentRequest, operatorKey]);

  useEffect(() => {
    if (!status?.connected || !status.expiresAt) return;
    const remaining = Date.parse(status.expiresAt) - Date.now();
    const timeout = setTimeout(() => {
      if (!mountedRef.current) return;
      setStatus(DISCONNECTED_STATUS);
      clearPassword();
      setErrorMessage("A sessão de consulta expirou. Conecte sua conta novamente.");
    }, Math.max(0, remaining));
    return () => clearTimeout(timeout);
  }, [clearPassword, status?.connected, status?.expiresAt]);

  const handleConnect = async () => {
    const trimmedUsername = username.trim();
    if (!trimmedUsername || !password) {
      setErrorMessage("Informe o usuário e a senha da sua conta no site.");
      return;
    }

    const requestId = ++requestIdRef.current;
    setLoading(true);
    setErrorMessage("");
    try {
      const nextStatus = await connectSiteConnection({
        username: trimmedUsername,
        password,
      });
      if (!isCurrentRequest(requestId)) return;
      setStatus(nextStatus);
      setShowCredentials(false);
      setShowPassword(false);
    } catch (error: unknown) {
      if (isCurrentRequest(requestId)) {
        setStatus(DISCONNECTED_STATUS);
        setErrorMessage(friendlyError(error));
      }
    } finally {
      clearPassword();
      if (isCurrentRequest(requestId)) setLoading(false);
    }
  };

  const handleTestAgain = async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setErrorMessage("");
    try {
      const nextStatus = await testSiteConnection();
      if (isCurrentRequest(requestId)) setStatus(nextStatus);
    } catch (error: unknown) {
      if (isCurrentRequest(requestId)) {
        setStatus(DISCONNECTED_STATUS);
        setErrorMessage(friendlyError(error));
      }
    } finally {
      if (isCurrentRequest(requestId)) setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setErrorMessage("");
    setShowCredentials(false);
    setShowPassword(false);
    clearCredentials();
    try {
      await disconnectSiteConnection();
      if (isCurrentRequest(requestId)) {
        setStatus({
          connected: false,
          mode: "read_only",
          siteOrigin: "https://www.brazilhrproject.icu",
        });
      }
    } catch (error: unknown) {
      if (isCurrentRequest(requestId)) {
        setStatus(DISCONNECTED_STATUS);
        setErrorMessage(friendlyError(error));
      }
    } finally {
      if (isCurrentRequest(requestId)) setLoading(false);
    }
  };

  const closeCredentials = () => {
    if (loading) return;
    setShowCredentials(false);
    setShowPassword(false);
    clearPassword();
    setErrorMessage("");
  };

  return (
    <View style={styles.panel}>
      <View style={styles.panelHeader}>
        <View style={styles.panelHeadingCopy}>
          <View style={styles.panelEyebrowRow}>
            <Ionicons color="#0C5666" name="link-outline" size={14} />
            <Text style={styles.panelEyebrow}>CONEXÃO EXTERNA</Text>
          </View>
          <Text style={styles.panelTitle}>Conexão de teste</Text>
          <Text style={styles.panelSubtitle}>Somente consulta: nenhum estoque será alterado.</Text>
        </View>
        <View style={styles.panelIcon}>
          <Ionicons color="#0C5666" name="shield-checkmark-outline" size={22} />
        </View>
      </View>

      <View style={styles.siteAddressRow}>
        <Ionicons color="#6D858A" name="globe-outline" size={17} />
        <Text selectable style={styles.siteAddress}>
          https://www.brazilhrproject.icu
        </Text>
      </View>

      {loading && !status ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color="#0C5666" size="small" />
          <Text style={styles.loadingText}>Consultando o estado da conexão...</Text>
        </View>
      ) : null}

      {status?.connected ? (
        <View style={styles.connectedBlock}>
          <View style={styles.connectedHeader}>
            <StatusPill connected />
            <Text style={styles.checkTime}>Consulta: {formatCheckedAt(status.checkedAt)}</Text>
          </View>
          <View style={styles.profileCard}>
            <View style={styles.profileIcon}>
              <Ionicons color="#0C5666" name="person-outline" size={20} />
            </View>
            <View style={styles.profileCopy}>
              <Text style={styles.profileName}>{status.user?.name}</Text>
              <Text style={styles.profileMeta}>{status.user?.username} · Perfil {status.user?.role}</Text>
            </View>
          </View>
          <View style={styles.countGrid}>
            <View style={styles.countItem}>
              <Text style={styles.countValue}>{status.catalog?.materialCount ?? 0}</Text>
              <Text style={styles.countLabel}>Materiais</Text>
            </View>
            <View style={styles.countItem}>
              <Text style={styles.countValue}>{status.catalog?.lotCount ?? 0}</Text>
              <Text style={styles.countLabel}>Lotes</Text>
            </View>
            <View style={styles.countItem}>
              <Text style={styles.countValue}>{status.catalog?.equipmentCount ?? 0}</Text>
              <Text style={styles.countLabel}>Equipamentos</Text>
            </View>
          </View>
          {status.user?.requiresApproval ? (
            <View style={styles.approvalNotice}>
              <Ionicons color="#9B6A18" name="information-circle-outline" size={18} />
              <Text style={styles.approvalText}>
                Seu usuário envia solicitações para autorização. Isto não é baixa de estoque.
              </Text>
            </View>
          ) : null}
          <Text style={styles.sessionNote}>
            A sessão externa fica apenas na memória do servidor por até 30 minutos. Após reiniciar ou expirar, conecte novamente.
          </Text>
          <View style={styles.buttonStack}>
            <ActionButton
              disabled={loading}
              icon="refresh-outline"
              label="Testar novamente"
              loading={loading}
              onPress={() => void handleTestAgain()}
              tone="secondary"
            />
            <ActionButton
              disabled={loading}
              icon="unlink-outline"
              label="Desconectar"
              onPress={() => void handleDisconnect()}
              tone="danger"
            />
          </View>
        </View>
      ) : status && !status.connected ? (
        <View style={styles.disconnectedBlock}>
          <View style={styles.disconnectedHeader}>
            <StatusPill connected={false} />
            <Text style={styles.checkTime}>Nenhuma sessão externa ativa</Text>
          </View>
          <Text style={styles.disconnectedCopy}>
            Use a sua própria conta do site. O login só começa quando você tocar no botão e a senha não fica salva no aparelho.
          </Text>
          <ActionButton
            disabled={loading}
            icon="link-outline"
            label="Conectar e testar"
            onPress={() => {
              setErrorMessage("");
              setShowCredentials(true);
            }}
          />
          <Text style={styles.sessionNote}>
            A sessão externa fica apenas na memória do servidor por até 30 minutos; depois será necessário reconectar.
          </Text>
        </View>
      ) : null}

      {errorMessage ? (
        <View style={styles.errorBox}>
          <Ionicons color="#A63D40" name="alert-circle-outline" size={18} />
          <Text style={styles.errorText}>{errorMessage}</Text>
        </View>
      ) : null}

      <Modal
        animationType="slide"
        onRequestClose={closeCredentials}
        transparent
        visible={showCredentials}
      >
        <View style={styles.modalBackdrop}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={styles.modalKeyboard}
          >
            <View style={styles.credentialsSheet}>
              <View style={styles.modalHeader}>
                <View style={styles.modalHeadingCopy}>
                  <Text style={styles.modalEyebrow}>CONEXÃO DE TESTE</Text>
                  <Text style={styles.modalTitle}>Conecte sua conta</Text>
                </View>
                <Pressable
                  accessibilityLabel="Fechar conexão de teste"
                  disabled={loading}
                  onPress={closeCredentials}
                  style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
                >
                  <Ionicons color="#17363D" name="close" size={21} />
                </Pressable>
              </View>
              <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                <Text style={styles.modalInstruction}>
                  Digite aqui a conta que você usa no Projeto Brasil. Não usamos a sessão do navegador.
                </Text>
                <Text style={styles.fieldLabel}>Usuário do site</Text>
                <TextInput
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!loading}
                  onChangeText={setUsername}
                  placeholder="Seu usuário"
                  placeholderTextColor="#9AAEB2"
                  style={styles.textInput}
                  value={username}
                />
                <Text style={styles.fieldLabel}>Senha do site</Text>
                <View style={styles.passwordRow}>
                  <TextInput
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!loading}
                    onChangeText={updatePassword}
                    placeholder="Sua senha"
                    placeholderTextColor="#9AAEB2"
                    secureTextEntry={!showPassword}
                    style={styles.passwordInput}
                    value={password}
                  />
                  <Pressable
                    accessibilityLabel={showPassword ? "Ocultar senha" : "Mostrar senha"}
                    disabled={loading}
                    onPress={() => setShowPassword((current) => !current)}
                    style={styles.passwordToggle}
                  >
                    <Ionicons color="#0C5666" name={showPassword ? "eye-off-outline" : "eye-outline"} size={19} />
                  </Pressable>
                </View>
                <View style={styles.modalNotice}>
                  <Ionicons color="#0C5666" name="eye-outline" size={18} />
                  <Text style={styles.modalNoticeText}>Somente consulta: nenhum estoque será alterado.</Text>
                </View>
                {errorMessage ? (
                  <View style={styles.modalError}>
                    <Ionicons color="#A63D40" name="alert-circle-outline" size={17} />
                    <Text style={styles.modalErrorText}>{errorMessage}</Text>
                  </View>
                ) : null}
                <ActionButton
                  disabled={loading}
                  icon="shield-checkmark-outline"
                  label="Conectar e testar"
                  loading={loading}
                  onPress={() => void handleConnect()}
                />
                <Text style={styles.passwordNote}>
                  A senha é usada apenas nesta tentativa e é limpa ao concluir, fechar ou sair do app.
                </Text>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: "#FFFFFF",
    borderColor: "#DCE8E9",
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 20,
    padding: 17,
    shadowColor: "#0C5666",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 1,
  },
  panelHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  panelHeadingCopy: { flex: 1, paddingRight: 12 },
  panelEyebrowRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 },
  panelEyebrow: { color: "#6F858A", fontSize: 10, fontWeight: "900", letterSpacing: 1.1 },
  panelTitle: { color: "#17363D", fontSize: 20, fontWeight: "800", letterSpacing: -0.3 },
  panelSubtitle: { color: "#48737A", fontSize: 12, lineHeight: 18, marginTop: 4 },
  panelIcon: { alignItems: "center", backgroundColor: "#DDF1EC", borderRadius: 13, height: 40, justifyContent: "center", width: 40 },
  siteAddressRow: { alignItems: "center", backgroundColor: "#F4F8F8", borderRadius: 11, flexDirection: "row", gap: 7, marginTop: 14, paddingHorizontal: 11, paddingVertical: 9 },
  siteAddress: { color: "#48666C", flex: 1, fontSize: 12, fontWeight: "700" },
  loadingRow: { alignItems: "center", flexDirection: "row", gap: 9, paddingVertical: 18 },
  loadingText: { color: "#6D858A", fontSize: 12 },
  connectedBlock: { marginTop: 15 },
  connectedHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginBottom: 12 },
  disconnectedBlock: { marginTop: 15 },
  disconnectedHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginBottom: 11 },
  statusPill: { alignItems: "center", borderRadius: 999, flexDirection: "row", gap: 6, paddingHorizontal: 10, paddingVertical: 7 },
  statusPillConnected: { backgroundColor: "#E5F5F0" },
  statusPillIdle: { backgroundColor: "#F4F1E7" },
  statusDot: { borderRadius: 4, height: 7, width: 7 },
  statusDotConnected: { backgroundColor: "#21A375" },
  statusDotIdle: { backgroundColor: "#B38227" },
  statusPillText: { fontSize: 11, fontWeight: "800" },
  statusPillTextConnected: { color: "#18795A" },
  statusPillTextIdle: { color: "#8B651E" },
  checkTime: { color: "#91A2A6", flex: 1, fontSize: 10, marginLeft: 8, textAlign: "right" },
  profileCard: { alignItems: "center", backgroundColor: "#F4F8F8", borderRadius: 14, flexDirection: "row", padding: 12 },
  profileIcon: { alignItems: "center", backgroundColor: "#DDF1EC", borderRadius: 12, height: 38, justifyContent: "center", width: 38 },
  profileCopy: { flex: 1, marginLeft: 10 },
  profileName: { color: "#17363D", fontSize: 15, fontWeight: "800" },
  profileMeta: { color: "#6D858A", fontSize: 11, marginTop: 3 },
  countGrid: { borderColor: "#E4EEEE", borderRadius: 14, borderWidth: 1, flexDirection: "row", marginTop: 11, overflow: "hidden" },
  countItem: { alignItems: "center", flex: 1, paddingHorizontal: 6, paddingVertical: 11 },
  countValue: { color: "#0C5666", fontSize: 18, fontWeight: "900" },
  countLabel: { color: "#84999D", fontSize: 10, marginTop: 3, textAlign: "center" },
  approvalNotice: { alignItems: "flex-start", backgroundColor: "#FFF8E8", borderRadius: 12, flexDirection: "row", gap: 8, marginTop: 12, padding: 11 },
  approvalText: { color: "#7C5A1E", flex: 1, fontSize: 11, lineHeight: 17 },
  sessionNote: { color: "#91A2A6", fontSize: 11, lineHeight: 17, marginTop: 11 },
  buttonStack: { gap: 8, marginTop: 14 },
  actionButton: { alignItems: "center", backgroundColor: "#0C5666", borderRadius: 13, flexDirection: "row", gap: 8, justifyContent: "center", minHeight: 47, paddingHorizontal: 14 },
  actionButtonSecondary: { backgroundColor: "#EAF4F3" },
  actionButtonDanger: { backgroundColor: "#FCEBEC" },
  actionButtonMuted: { opacity: 0.55 },
  actionButtonText: { color: "#FFFFFF", fontSize: 13, fontWeight: "800" },
  actionButtonTextSecondary: { color: "#0C5666" },
  actionButtonTextDanger: { color: "#A63D40" },
  disconnectedCopy: { color: "#587278", fontSize: 12, lineHeight: 18, marginBottom: 13 },
  errorBox: { alignItems: "flex-start", backgroundColor: "#FCEBEC", borderRadius: 12, flexDirection: "row", gap: 8, marginTop: 13, padding: 11 },
  errorText: { color: "#8B3D40", flex: 1, fontSize: 12, lineHeight: 18 },
  modalBackdrop: { backgroundColor: "rgba(17, 39, 44, 0.48)", flex: 1, justifyContent: "flex-end" },
  modalKeyboard: { maxHeight: "94%" },
  credentialsSheet: { backgroundColor: "#F7FBFB", borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: "100%", padding: 20, paddingBottom: 28 },
  modalHeader: { alignItems: "flex-start", flexDirection: "row", justifyContent: "space-between", marginBottom: 15 },
  modalHeadingCopy: { flex: 1, paddingRight: 12 },
  modalEyebrow: { color: "#6F858A", fontSize: 10, fontWeight: "900", letterSpacing: 1.2, marginBottom: 3 },
  modalTitle: { color: "#17363D", fontSize: 22, fontWeight: "800", letterSpacing: -0.4 },
  closeButton: { alignItems: "center", backgroundColor: "#EAF2F2", borderRadius: 12, height: 36, justifyContent: "center", width: 36 },
  modalInstruction: { color: "#587278", fontSize: 13, lineHeight: 19, marginBottom: 17 },
  fieldLabel: { color: "#587278", fontSize: 11, fontWeight: "800", letterSpacing: 0.6, marginBottom: 7, textTransform: "uppercase" },
  textInput: { backgroundColor: "#FFFFFF", borderColor: "#DCE8E9", borderRadius: 12, borderWidth: 1, color: "#17363D", fontSize: 14, marginBottom: 14, minHeight: 46, paddingHorizontal: 13 },
  passwordRow: { alignItems: "center", backgroundColor: "#FFFFFF", borderColor: "#DCE8E9", borderRadius: 12, borderWidth: 1, flexDirection: "row", marginBottom: 15, minHeight: 46 },
  passwordInput: { color: "#17363D", flex: 1, fontSize: 14, minHeight: 44, paddingHorizontal: 13 },
  passwordToggle: { alignItems: "center", height: 44, justifyContent: "center", width: 44 },
  modalNotice: { alignItems: "center", backgroundColor: "#DDF1EC", borderRadius: 12, flexDirection: "row", gap: 8, marginBottom: 14, padding: 11 },
  modalNoticeText: { color: "#0C5666", flex: 1, fontSize: 12, fontWeight: "700", lineHeight: 17 },
  modalError: { alignItems: "flex-start", backgroundColor: "#FCEBEC", borderRadius: 12, flexDirection: "row", gap: 8, marginBottom: 14, padding: 11 },
  modalErrorText: { color: "#8B3D40", flex: 1, fontSize: 12, lineHeight: 17 },
  passwordNote: { color: "#91A2A6", fontSize: 11, lineHeight: 17, marginTop: 10, textAlign: "center" },
  pressed: { opacity: 0.75 },
});
